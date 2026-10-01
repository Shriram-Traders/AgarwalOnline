import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AuditLog, User } from "../src/lib/db/models";
import { Order, OrderTimelineEvent } from "../src/lib/commerce/models";
import { connectDB } from "../src/lib/db/connect";
import { createStaff, updateStaff } from "../src/lib/staff/service";
import { getAuth } from "../src/lib/auth/better-auth";

const uri = process.env.TEST_MONGODB_URI;

describe.skipIf(!uri)("Staff access management", () => {
  let superAdminId: string;

  beforeAll(async () => {
    if (!uri?.includes("/ags_test")) throw Error("Isolated DB required");
    Object.assign(process.env, {
      MONGODB_URI: uri,
      APP_ORIGIN: "http://127.0.0.1:3000",
      AUTH_SECRET: "test-secret-".repeat(4),
    });
    await connectDB();
    await Promise.all([User.init(), AuditLog.init(), Order.init(), OrderTimelineEvent.init()]);
  });

  beforeEach(async () => {
    for (const model of Object.values(mongoose.models))
      await model.deleteMany({});
    await mongoose.connection.collection("authAccounts").deleteMany({});
    await mongoose.connection.collection("authSessions").deleteMany({});
    superAdminId = String(
      (
        await User.create({
          name: "Store owner",
          email: "owner@example.test",
          phone: "9000000071",
          roles: ["customer", "super-admin"],
        })
      )._id,
    );
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it("creates a sign-in-ready account without storing the plain password", async () => {
    await createStaff(superAdminId, {
      name: "Ops Admin",
      email: "ops@example.test",
      phone: "9000000072",
      role: "admin",
      password: "temporary-pass-123",
    });

    const staff = await User.findOne({ phone: "9000000072" }).select(
      "+passwordHash",
    );
    expect(staff?.active).toBe(true);
    expect(staff?.passwordHash).toBeUndefined();
    const credential = await mongoose.connection
      .collection("authAccounts")
      .findOne({ userId: staff!._id, providerId: "credential" });
    expect(
      await bcrypt.compare("temporary-pass-123", String(credential?.password)),
    ).toBe(true);
    expect(staff?.toObject()).not.toHaveProperty("password");
    const signedIn = await getAuth().api.signInEmail({
      body: {
        email: "ops@example.test",
        password: "temporary-pass-123",
      },
      headers: new Headers({ origin: "http://127.0.0.1:3000" }),
    });
    expect(signedIn.user.roles).toEqual(["customer", "admin"]);
    const audit = await AuditLog.findOne({ action: "staff.create" }).lean();
    expect(audit?.details).not.toHaveProperty("password");
  });

  it("revokes sessions when role access changes", async () => {
    const staff = await User.create({
      name: "Ops Admin",
      email: "ops@example.test",
      phone: "9000000072",
      roles: ["customer", "admin"],
    });
    await mongoose.connection.collection("authSessions").insertOne({
      userId: staff._id,
      token: "role-change-token",
      expiresAt: new Date("2099-01-01"),
      ipAddress: "127.0.0.1",
      userAgent: "test",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await updateStaff(superAdminId, {
      staffId: String(staff._id),
      name: staff.name,
      email: staff.email,
      phone: staff.phone,
      role: "delivery",
      active: true,
      password: "",
    });

    expect(
      await mongoose.connection
        .collection("authSessions")
        .countDocuments({ userId: staff._id }),
    ).toBe(0);
    expect((await User.findById(staff._id))?.roles).toEqual(["customer", "delivery"]);
    expect(
      (await AuditLog.findOne({ action: "staff.update" }).lean())?.details,
    ).toMatchObject({ sessionsRevoked: true });
  });

  it("adds a staff role to an existing customer and can remove it again", async () => {
    const customer = await User.create({
      name: "Regular Customer",
      phone: "9000000075",
      email: "9000000075@phone.ags.invalid",
      roles: ["customer"],
    });
    const granted = await createStaff(superAdminId, {
      phone: "9000000075",
      role: "admin",
      name: "",
      email: "",
      password: "",
    });
    expect(granted.created).toBe(false);
    expect((await User.findById(customer._id))?.roles).toEqual(["customer", "admin"]);
    expect(await AuditLog.exists({ action: "staff.grant", target: String(customer._id) })).toBeTruthy();
    await updateStaff(superAdminId, {
      staffId: String(customer._id),
      name: "Regular Customer",
      email: "9000000075@phone.ags.invalid",
      phone: "9000000075",
      role: "customer",
      active: true,
      password: "",
    });
    expect((await User.findById(customer._id))?.roles).toEqual(["customer"]);
  });

  it("needs name, email and a password to create a brand-new staff account", async () => {
    await expect(
      createStaff(superAdminId, { phone: "9000000076", role: "delivery", name: "", email: "", password: "" }),
    ).rejects.toThrow("Name, work email");
  });

  it("allows only Super Admins to manage staff", async () => {
    const admin = await User.create({
      name: "Regular Admin",
      email: "admin@example.test",
      phone: "9000000073",
      roles: ["customer", "admin"],
    });
    await expect(
      createStaff(String(admin._id), {
        name: "Delivery Partner",
        email: "delivery@example.test",
        phone: "9000000074",
        role: "delivery",
        password: "temporary-pass-123",
      }),
    ).rejects.toThrow("FORBIDDEN");
  });

  it("protects the signed-in Super Admin from self lockout", async () => {
    const owner = await User.findById(superAdminId);
    const input = {
      staffId: superAdminId,
      name: owner!.name,
      email: owner!.email,
      phone: owner!.phone,
      role: "admin",
      active: false,
      password: "",
    };
    await expect(updateStaff(superAdminId, input)).rejects.toThrow(
      "own account",
    );
  });

  it("won't change the owner's own role through 'Create a new account'", async () => {
    await expect(
      createStaff(superAdminId, { phone: "9000000071", role: "delivery", name: "", email: "", password: "" }),
    ).rejects.toThrow("This number is yours");
    expect((await User.findById(superAdminId))?.roles).toEqual(["customer", "super-admin"]);
  });

  it("can pause a staff member who joined with Google and has no phone number", async () => {
    const googleStaff = await User.create({
      name: "Gmail Admin",
      email: "gmail-admin@example.test",
      roles: ["customer", "admin"],
    });
    await updateStaff(superAdminId, {
      staffId: String(googleStaff._id),
      name: "Gmail Admin",
      email: "",
      phone: "",
      role: "admin",
      active: false,
      password: "",
    });
    const paused = await User.findById(googleStaff._id);
    expect(paused?.active).toBe(false);
    expect(paused?.phone).toBeUndefined();
    expect(paused?.email).toBe("gmail-admin@example.test");
  });

  it("hands a paused rider's waiting deliveries back, and holds off while one is on the road", async () => {
    const rider = await User.create({
      name: "Rider",
      email: "rider@example.test",
      phone: "9000000077",
      roles: ["customer", "delivery"],
    });
    const order = (deliveryStatus: string, n: number) =>
      Order.create({
        customerId: superAdminId,
        number: `RIDER-${n}`,
        idempotencyKey: `rider-${n}`,
        items: [],
        address: {},
        slotId: new mongoose.Types.ObjectId(),
        paymentMethod: "cod",
        subtotalPaise: 100,
        deliveryPaise: 0,
        totalPaise: 100,
        orderStatus: "confirmed",
        fulfilmentStatus: "ready",
        deliveryStatus,
        assignedTo: rider._id,
      });
    const waiting = await order("assigned", 1);
    const onTheRoad = await order("out-for-delivery", 2);
    const pause = () =>
      updateStaff(superAdminId, {
        staffId: String(rider._id),
        name: "Rider",
        email: "rider@example.test",
        phone: "9000000077",
        role: "delivery",
        active: false,
        password: "",
      });
    await expect(pause()).rejects.toThrow("out for delivery right now");
    expect((await User.findById(rider._id))?.active).toBe(true);
    await Order.updateOne({ _id: onTheRoad._id }, { deliveryStatus: "delivered" });
    expect((await pause()).released).toBe(1);
    const back = await Order.findById(waiting._id);
    expect(back?.deliveryStatus).toBe("unassigned");
    expect(back?.assignedTo).toBeUndefined();
  });
});
