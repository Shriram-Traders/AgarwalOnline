import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { connectDB } from "../src/lib/db/connect";
import { User, InventoryItem, OTPChallenge } from "../src/lib/db/models";
import {
  Order,
  DeliverySlot,
  InventoryReservation,
  OrderTimelineEvent,
} from "../src/lib/commerce/models";
import { PackingChecklist, CODCollection } from "../src/lib/operations/models";
import {
  changeOrderStatus,
  savePacking,
  assignDelivery,
  partnerTransition,
  requestDeliveryOTP,
  completeDelivery,
  reconcileCOD,
} from "../src/lib/operations/service";
const uri = process.env.TEST_MONGODB_URI;
describe.skipIf(!uri)("Packing, delivery and COD controls", () => {
  let customer: string,
    admin: string,
    partner: string,
    other: string,
    orderId: string,
    variantId: string;
  beforeAll(async () => {
    if (!uri?.includes("/ags_test")) throw Error("Isolated DB required");
    Object.assign(process.env, {
      MONGODB_URI: uri,
      APP_ORIGIN: "http://127.0.0.1:3000",
      AUTH_SECRET: "test-secret-".repeat(4),
      MOCK_OTP: "true",
      MOCK_OTP_CODE: "246810",
    });
    await connectDB();
    for (const model of [
      User,
      InventoryItem,
      Order,
      DeliverySlot,
      InventoryReservation,
      OrderTimelineEvent,
      PackingChecklist,
      CODCollection,
    ])
      await model.init();
  });
  beforeEach(async () => {
    for (const model of Object.values(mongoose.models))
      await model.deleteMany({});
    const users = await User.create([
      { phone: "9000000091", name: "Customer", roles: ["customer"] },
      { phone: "9000000092", name: "Admin", roles: ["customer", "admin"] },
      { phone: "9000000093", name: "Partner", roles: ["customer", "delivery"] },
      { phone: "9000000094", name: "Other partner", roles: ["customer", "delivery"] },
    ]);
    [customer, admin, partner, other] = users.map((u: { _id: unknown }) =>
      String(u._id),
    );
    variantId = String(new mongoose.Types.ObjectId());
    const slot = await DeliverySlot.create({
      areaId: new mongoose.Types.ObjectId(),
      date: "2099-01-01",
      label: "10–12",
      capacity: 10,
      reserved: 1,
    });
    const order = await Order.create({
      customerId: customer,
      number: "TEST-COD-1",
      idempotencyKey: "ops-test",
      items: [
        {
          variantId,
          name: "Rice",
          label: "1kg",
          quantity: 1,
          pricePaise: 10000,
          linePaise: 10000,
        },
      ],
      address: { phone: "9000000091" },
      slotId: slot._id,
      paymentMethod: "cod",
      subtotalPaise: 10000,
      deliveryPaise: 0,
      totalPaise: 10000,
    });
    orderId = String(order._id);
    await InventoryItem.create({ variantId, onHand: 1, reserved: 1 });
    await InventoryReservation.create({ orderId, variantId, quantity: 1 });
  });
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
  async function ready() {
    await changeOrderStatus(admin, {
      orderId,
      dimension: "order",
      next: "confirmed",
    });
    await changeOrderStatus(admin, {
      orderId,
      dimension: "fulfilment",
      next: "picking",
    });
    await savePacking(admin, {
      orderId,
      items: [{ variantId, packedQuantity: 1, missing: false }],
    });
    await changeOrderStatus(admin, {
      orderId,
      dimension: "fulfilment",
      next: "packed",
    });
    await changeOrderStatus(admin, {
      orderId,
      dimension: "fulfilment",
      next: "ready",
    });
    await assignDelivery(admin, { orderId, partnerId: partner });
    await partnerTransition(partner, { orderId, next: "out-for-delivery" });
  }
  it("requires complete quantities and rejects customer operations", async () => {
    await expect(
      changeOrderStatus(customer, {
        orderId,
        dimension: "order",
        next: "confirmed",
      }),
    ).rejects.toThrow("FORBIDDEN");
    await changeOrderStatus(admin, {
      orderId,
      dimension: "order",
      next: "confirmed",
    });
    await changeOrderStatus(admin, {
      orderId,
      dimension: "fulfilment",
      next: "picking",
    });
    // packed short with nothing said about the rest: kept as work in progress, and packing waits
    await savePacking(admin, {
      orderId,
      items: [{ variantId, packedQuantity: 0, missing: false }],
    });
    await expect(
      changeOrderStatus(admin, {
        orderId,
        dimension: "fulfilment",
        next: "packed",
      }),
    ).rejects.toThrow("Complete the packing checklist first: Rice (1kg)");
    // nothing at all in the bag is a cancelled order, not a packed one
    await expect(
      savePacking(admin, {
        orderId,
        items: [{ variantId, packedQuantity: 0, missing: true }],
      }),
    ).rejects.toThrow("Nothing is packed");
  });
  it("verifies delivery, consumes stock once, and separates cash reconciliation", async () => {
    await ready();
    await expect(
      completeDelivery(other, { orderId, code: "246810", cashPaise: 10000 }),
    ).rejects.toThrow("assigned");
    await requestDeliveryOTP(customer, orderId);
    await expect(
      completeDelivery(partner, { orderId, code: "111111", cashPaise: 10000 }),
    ).rejects.toThrow("Invalid");
    expect((await OTPChallenge.findOne({ purpose: "delivery" })).attempts).toBe(
      1,
    );
    await completeDelivery(partner, {
      orderId,
      code: "246810",
      cashPaise: 10000,
    });
    await expect(
      completeDelivery(partner, { orderId, code: "246810", cashPaise: 10000 }),
    ).rejects.toThrow();
    expect((await InventoryItem.findOne({ variantId })).onHand).toBe(0);
    expect((await Order.findById(orderId)).codStatus).toBe("collected");
    await changeOrderStatus(admin, {
      orderId,
      dimension: "order",
      next: "completed",
    });
    expect((await Order.findById(orderId)).codStatus).toBe("collected");
    await reconcileCOD(admin, { orderId, receivedPaise: 10000, note: "" });
    expect((await Order.findById(orderId)).codStatus).toBe("reconciled");
    await expect(
      reconcileCOD(admin, { orderId, receivedPaise: 10000, note: "" }),
    ).rejects.toThrow("already");
  });
  it("records a cash discrepancy without claiming settlement", async () => {
    await ready();
    await requestDeliveryOTP(customer, orderId);
    await completeDelivery(partner, {
      orderId,
      code: "246810",
      cashPaise: 10000,
    });
    await expect(
      reconcileCOD(admin, { orderId, receivedPaise: 9000, note: "" }),
    ).rejects.toThrow("Explain");
    await reconcileCOD(admin, {
      orderId,
      receivedPaise: 9000,
      note: "Short handover recorded for investigation",
    });
    expect((await CODCollection.findOne({ orderId })).discrepancyPaise).toBe(
      1000,
    );
    expect((await Order.findById(orderId)).codStatus).toBe("collected");
  });
});
