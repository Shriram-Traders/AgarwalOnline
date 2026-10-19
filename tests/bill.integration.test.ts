import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { connectDB } from "../src/lib/db/connect";
import { AuditLog, User } from "../src/lib/db/models";
import { Order, SystemSetting } from "../src/lib/commerce/models";
import { billNumber, previousBillNumber, setBillTo, setShopNameOnBills } from "../src/lib/commerce/bill";
import { taxProfile } from "../src/lib/tax/profile";

const uri = process.env.TEST_MONGODB_URI;

describe.skipIf(!uri)("The name on a bill", () => {
  let staff: string, owner: string, customer: string, orderId: string;

  beforeAll(async () => {
    if (!uri?.includes("/ags_test")) throw Error("Isolated DB required");
    Object.assign(process.env, { MONGODB_URI: uri, APP_ORIGIN: "http://127.0.0.1:3000", AUTH_SECRET: "test-secret-".repeat(4) });
    await connectDB();
    for (const model of [User, Order, AuditLog, SystemSetting]) await model.init();
  });
  beforeEach(async () => {
    for (const model of Object.values(mongoose.models)) await model.deleteMany({});
    staff = String((await User.create({ name: "Staff", phone: "9000000601", roles: ["customer", "admin"] }))._id);
    owner = String((await User.create({ name: "Owner", phone: "9000000602", roles: ["customer", "super-admin"] }))._id);
    customer = String((await User.create({ name: "Asha", phone: "9000000603", roles: ["customer"] }))._id);
    const [order] = await Order.collection.insertMany([
      {
        customerId: new mongoose.Types.ObjectId(customer),
        number: "AGS-20261019-00007",
        idempotencyKey: "bill-1",
        items: [{ variantId: new mongoose.Types.ObjectId(), name: "Pen", label: "1 pen", quantity: 2, pricePaise: 1000, linePaise: 2000 }],
        slotId: new mongoose.Types.ObjectId(),
        paymentMethod: "cod",
        address: { name: "Asha Patil", phone: "9000000603", line: "Market Road", pin: "402106" },
        orderStatus: "confirmed",
        createdAt: new Date(),
      },
    ]).then((result) => Object.values(result.insertedIds));
    orderId = String(order);
  });
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it("numbers a bill within the law's 16 characters, and a re-issue after it", () => {
    expect(billNumber({ number: "AGS-20261019-00007" })).toBe("20261019-00007");
    expect(billNumber({ number: "AO-20261019-00007", bill: { revision: 2 } })).toBe("20261019-00007R2");
    expect(billNumber({ number: "AO-20261019-00007", bill: { revision: 2 } }).length).toBeLessThanOrEqual(16);
    expect(previousBillNumber({ number: "AGS-20261019-00007", bill: { revision: 1 } })).toBe("20261019-00007");
    expect(previousBillNumber({ number: "AGS-20261019-00007" })).toBeNull();
  });

  it("changes the name freely before delivery, and re-issues after", async () => {
    expect(await setBillTo(staff, { orderId, name: "Patil Traders", gstin: "" })).toEqual({ reissued: false, number: "20261019-00007" });
    expect((await Order.findById(orderId))!.bill).toMatchObject({ name: "Patil Traders", revision: 0 });
    // delivered: the bill is given, so a new name is a new bill
    await Order.updateOne({ _id: orderId }, { $set: { "bill.issuedAt": new Date() } });
    const again = await setBillTo(staff, { orderId, name: "Patil Traders Pvt Ltd", gstin: "27aapfu0939f1zv" });
    expect(again).toEqual({ reissued: true, number: "20261019-00007R1" });
    expect((await Order.findById(orderId))!.bill).toMatchObject({ name: "Patil Traders Pvt Ltd", gstin: "27AAPFU0939F1ZV", revision: 1 });
    // saving the same again is not another bill
    expect((await setBillTo(staff, { orderId, name: "Patil Traders Pvt Ltd", gstin: "27AAPFU0939F1ZV" })).reissued).toBe(false);
    expect(await AuditLog.countDocuments({ action: "order.bill-to", target: orderId })).toBe(2);
  });

  it("refuses a bad GSTIN, a customer, and a cancelled order", async () => {
    await expect(setBillTo(staff, { orderId, name: "Patil", gstin: "27ABCDE1234" })).rejects.toThrow("GSTIN");
    await expect(setBillTo(customer, { orderId, name: "Someone else", gstin: "" })).rejects.toThrow("FORBIDDEN");
    await Order.updateOne({ _id: orderId }, { $set: { orderStatus: "cancelled" } });
    await expect(setBillTo(staff, { orderId, name: "Patil", gstin: "" })).rejects.toThrow("cancelled");
  });

  it("lets only an owner rename the shop on bills", async () => {
    await expect(setShopNameOnBills(staff, { legalName: "Agarwal Stationers" })).rejects.toThrow("FORBIDDEN");
    await setShopNameOnBills(owner, { legalName: "Agarwal Stationers" });
    expect((await taxProfile(true)).legalName).toBe("Agarwal Stationers");
  });
});
