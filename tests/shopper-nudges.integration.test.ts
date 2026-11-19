import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { connectDB } from "../src/lib/db/connect";
import { Category, InventoryItem, Product, ProductVariant, User } from "../src/lib/db/models";
import { CartLine, Order } from "../src/lib/commerce/models";
import { Notification, StockAlert } from "../src/lib/engagement/models";
import { PushDevice } from "../src/lib/push/models";
import { sendBackInStock, setStockAlert } from "../src/lib/engagement/stock-alerts";
import { sendBasketReminders } from "../src/lib/commerce/basket-reminder";
import { buyAgain } from "../src/lib/catalog/buy-again";

// "Tell me when it's back", the one basket reminder, and "Buy it again" from a shopper's own orders.
const uri = process.env.TEST_MONGODB_URI;
const HOUR = 3600_000;
// noon in India
const NOON = new Date("2026-11-19T06:30:00Z");
const at = (base: Date, hours: number) => new Date(base.getTime() + hours * HOUR);

describe.skipIf(!uri)("Back in stock, basket reminders and buy it again", () => {
  let shopper: string, product: string, variant: string;
  beforeAll(async () => {
    if (!uri?.includes("/ags_test")) throw Error("Isolated DB required");
    Object.assign(process.env, { MONGODB_URI: uri, APP_ORIGIN: "http://127.0.0.1:3000", AUTH_SECRET: "test-secret-".repeat(4) });
    await connectDB();
    for (const model of [User, Category, Product, ProductVariant, InventoryItem, CartLine, Notification, StockAlert, PushDevice]) await model.init();
  });
  beforeEach(async () => {
    for (const model of Object.values(mongoose.models)) await model.deleteMany({});
    shopper = String((await User.create({ name: "Asha", phone: "9000000181", roles: ["customer"] }))._id);
    const category = await Category.create({ slug: "stationery", name: { en: "Stationery", mr: "स्टेशनरी" } });
    product = String(
      (
        await Product.create({
          slug: "marker-set",
          name: { en: "Marker Set", mr: "मार्कर संच" },
          description: { en: "Markers", mr: "मार्कर" },
          categoryId: category._id,
          categorySlug: "stationery",
          status: "published",
        })
      )._id,
    );
    variant = String(
      (await ProductVariant.create({ productId: product, sku: "MK-12", label: "Pack of 12", unit: "piece", packQuantity: 12, pricePaise: 9000, mrpPaise: 10000 }))._id,
    );
    // sold out
    await InventoryItem.create({ variantId: variant, onHand: 0, reserved: 0 });
  });
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it("tells a shopper once when the pack they asked about is back", async () => {
    expect(await setStockAlert(shopper, variant, true)).toBe(true);
    await setStockAlert(shopper, variant, true);
    expect(await StockAlert.countDocuments()).toBe(1);
    // still sold out (or only held for someone's order): nothing yet
    expect(await sendBackInStock()).toEqual({ sent: 0 });
    await InventoryItem.updateOne({ variantId: variant }, { $set: { onHand: 2, reserved: 2 } });
    expect(await sendBackInStock()).toEqual({ sent: 0 });
    await InventoryItem.updateOne({ variantId: variant }, { $set: { onHand: 3, reserved: 2 } });
    expect(await sendBackInStock()).toEqual({ sent: 1 });
    expect(await Notification.findOne({ userId: shopper }).lean()).toMatchObject({
      type: "stock",
      title: "Back in stock: Marker Set",
      body: "Pack of 12 is back. Add it before it runs out again.",
      href: "/products/marker-set",
    });
    // once: the alert is gone
    expect(await sendBackInStock()).toEqual({ sent: 0 });
    expect(await StockAlert.countDocuments()).toBe(0);
  });

  it("turns off, and can't be asked for a hidden product", async () => {
    await setStockAlert(shopper, variant, true);
    expect(await setStockAlert(shopper, variant, false)).toBe(false);
    expect(await StockAlert.countDocuments()).toBe(0);
    await Product.updateOne({ _id: product }, { $set: { status: "draft" } });
    await expect(setStockAlert(shopper, variant, true)).rejects.toThrow("This product is unavailable.");
    await expect(setStockAlert(shopper, "not-an-id", true)).rejects.toThrow("This product is unavailable.");
    // asked before it was hidden, and back in stock while hidden: not sent
    await Product.updateOne({ _id: product }, { $set: { status: "published" } });
    await setStockAlert(shopper, variant, true);
    await Product.updateOne({ _id: product }, { $set: { status: "draft" } });
    await InventoryItem.updateOne({ variantId: variant }, { $set: { onHand: 5 } });
    expect(await sendBackInStock()).toEqual({ sent: 0 });
  });

  it("reminds once about a basket left for a few hours, in the daytime, only with notifications on", async () => {
    const leftAt = at(NOON, -4);
    await CartLine.create({ customerId: shopper, variantId: variant, quantity: 2 });
    await CartLine.updateMany({ customerId: shopper }, { $set: { updatedAt: leftAt } }, { timestamps: false });
    // notifications not turned on: nothing to send it to
    expect(await sendBasketReminders(NOON)).toEqual({ sent: 0 });
    await PushDevice.create({ userId: shopper, endpoint: "https://push.example/asha", p256dh: "key", auth: "auth" });
    // 11 pm in India: not now
    expect(await sendBasketReminders(at(NOON, 11))).toEqual({ sent: 0 });
    // left only an hour: not yet
    expect(await sendBasketReminders(at(leftAt, 1))).toEqual({ sent: 0 });
    expect(await sendBasketReminders(NOON)).toEqual({ sent: 1 });
    expect(await Notification.findOne({ userId: shopper, type: "basket" }).lean()).toMatchObject({
      title: "Your basket is waiting",
      body: "1 item you picked is still in your basket.",
      href: "/cart",
    });
    // once per basket
    expect(await sendBasketReminders(at(NOON, 2))).toEqual({ sent: 0 });
    // changed since: one more, later
    await CartLine.updateMany({ customerId: shopper }, { $set: { updatedAt: at(NOON, 1) } }, { timestamps: false });
    expect(await sendBasketReminders(at(NOON, 5))).toEqual({ sent: 1 });
    // switched off in Edit profile: never again
    await User.updateOne({ _id: shopper }, { $set: { basketReminders: false } });
    await CartLine.updateMany({ customerId: shopper }, { $set: { updatedAt: at(NOON, 6) } }, { timestamps: false });
    expect(await sendBasketReminders(at(NOON, 10))).toEqual({ sent: 0 });
    // a basket left days ago is forgotten, not reminded about
    await User.updateOne({ _id: shopper }, { $set: { basketReminders: true } });
    expect(await sendBasketReminders(at(NOON, 6 + 49))).toEqual({ sent: 0 });
  });

  it("puts what a shopper buys most first, in stock before sold out, and skips cancelled orders", async () => {
    const ids = Array.from({ length: 4 }, () => new mongoose.Types.ObjectId());
    const order = (status: string, variants: mongoose.Types.ObjectId[], hoursAgo: number) => ({
      customerId: new mongoose.Types.ObjectId(shopper),
      number: `NUDGE-${hoursAgo}`,
      idempotencyKey: `nudge-${hoursAgo}`,
      orderStatus: status,
      items: variants.map((variantId) => ({ variantId })),
      createdAt: at(NOW, -hoursAgo),
    });
    const NOW = new Date();
    // pens in three orders, pencils in one (the latest), erasers only in a cancelled order, glue sold out
    await Order.collection.insertMany([
      order("completed", [ids[0]], 72),
      order("completed", [ids[0], ids[3]], 48),
      order("completed", [ids[0], ids[1]], 1),
      order("cancelled", [ids[2]], 0),
    ]);
    // an old order saved without items is skipped, not a crash
    await Order.collection.insertOne({ customerId: new mongoose.Types.ObjectId(shopper), number: "NUDGE-EMPTY", idempotencyKey: "nudge-empty", orderStatus: "completed", createdAt: at(NOW, -2) });
    const shelf = [
      { name: "eraser", variants: [{ id: String(ids[2]), available: 5 }] },
      { name: "glue", variants: [{ id: String(ids[3]), available: 0 }] },
      { name: "pencil", variants: [{ id: String(ids[1]), available: 5 }] },
      { name: "pen", variants: [{ id: String(ids[0]), available: 5 }] },
      { name: "ruler", variants: [{ id: String(new mongoose.Types.ObjectId()), available: 5 }] },
    ];
    expect((await buyAgain(shopper, shelf)).map((item) => item.name)).toEqual(["pen", "pencil", "glue"]);
  });
});
