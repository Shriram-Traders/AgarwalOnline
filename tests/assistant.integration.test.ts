import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { connectDB } from "../src/lib/db/connect";
import { Category, InventoryItem, Product, ProductVariant, ServiceArea, User } from "../src/lib/db/models";
import { SystemSetting } from "../src/lib/commerce/models";
import { ChatConversation, ChatMessage } from "../src/lib/chat/models";
import { assistantReply } from "../src/lib/assistant/service";
import { handOffToStore } from "../src/lib/assistant/handoff";
import type { Bubble } from "../src/lib/assistant/types";

const uri = process.env.TEST_MONGODB_URI;
const texts = (bubbles: Bubble[]) => bubbles.map((b) => ("text" in b ? b.text : "")).join(" ");

describe.skipIf(!uri)("The shop assistant's answers", () => {
  let shopper: string, other: string;
  beforeAll(async () => {
    if (!uri?.includes("/ags_test")) throw Error("Isolated DB required");
    Object.assign(process.env, { MONGODB_URI: uri, APP_ORIGIN: "http://127.0.0.1:3000", AUTH_SECRET: "test-secret-".repeat(4) });
    for (const key of ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"]) delete process.env[key];
    await connectDB();
    for (const model of [User, Category, Product, ProductVariant, InventoryItem, ServiceArea, SystemSetting, ChatConversation, ChatMessage])
      await model.init();
  });
  beforeEach(async () => {
    for (const model of Object.values(mongoose.models)) await model.deleteMany({});
    await mongoose.connection.collection("orders").deleteMany({});
    shopper = String((await User.create({ name: "Asha", phone: "9000000141", roles: ["customer"] }))._id);
    other = String((await User.create({ name: "Ravi", phone: "9000000142", roles: ["customer"] }))._id);
    await ServiceArea.create([
      { key: "nagothane", name: "Nagothane", pincodes: ["402106"], enabled: true, feePaise: 3000 },
      { key: "roha", name: "Roha", pincodes: ["402109"], enabled: false, feePaise: 4000 },
    ]);
    await SystemSetting.create({
      key: "delivery",
      value: { cutoffHour: 15, freeThresholdPaise: 50000, blackoutDates: [], holidays: [0] },
    });
    const category = await Category.create({ slug: "stationery", name: { en: "Stationery", mr: "स्टेशनरी" } });
    const make = async (slug: string, name: string, extra: Record<string, unknown> = {}, stock = 20) => {
      const product = await Product.create({
        slug,
        name: { en: name, mr: name },
        description: { en: name, mr: name },
        categoryId: category._id,
        categorySlug: "stationery",
        status: "published",
        ...extra,
      });
      const variant = await ProductVariant.create({
        productId: product._id,
        sku: slug.toUpperCase(),
        label: "Pack of 10",
        unit: "piece",
        packQuantity: 10,
        pricePaise: 9900,
        mrpPaise: 12000,
      });
      await InventoryItem.create({ variantId: variant._id, onHand: stock });
    };
    await make("gel-pen-set", "Gel Pen Set");
    await make("gel-pen-school-pack", "Gel Pen School Pack", { showToCustomers: false, showToSchools: true });
    const orders = mongoose.connection.collection("orders");
    const order = (customerId: string, number: string, createdAt: Date) => ({
      customerId: new mongoose.Types.ObjectId(customerId),
      number,
      totalPaise: 25000,
      orderStatus: "placed",
      fulfilmentStatus: "unassigned",
      deliveryStatus: "unassigned",
      paymentMethod: "cod",
      paymentStatus: "pending",
      createdAt,
    });
    await orders.insertMany([
      order(shopper, "AGS-20261001-00001", new Date("2026-10-01T06:00:00Z")),
      order(other, "AGS-20261001-00002", new Date("2026-10-01T07:00:00Z")),
    ]);
  });
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it("answers delivery questions from the saved settings and the areas that are switched on", async () => {
    const answer = texts((await assistantReply({ text: "when do you deliver?", locale: "en" })).bubbles);
    expect(answer).toContain("We deliver same day to Nagothane.");
    expect(answer).toContain("Order before 3 PM");
    expect(answer).toContain("We don't deliver on Sunday.");
    expect(answer).toContain("free on orders of ₹500 or more; otherwise it starts at ₹30");
    expect(answer).not.toContain("Roha");
    await SystemSetting.updateOne({ key: "delivery" }, { $set: { "value.cutoffHour": 14 } });
    expect(texts((await assistantReply({ intent: "delivery", locale: "en" })).bubbles)).toContain("Order before 2 PM");
    expect(texts((await assistantReply({ intent: "delivery", locale: "mr" })).bubbles)).toContain("आम्ही Nagothane येथे");
  });

  it("checks a PIN code against the areas that are switched on", async () => {
    expect(texts((await assistantReply({ text: "402106", locale: "en" })).bubbles)).toContain(
      "Yes, we deliver to 402106 (Nagothane). Delivery is ₹30",
    );
    const roha = (await assistantReply({ text: "do you deliver to 402109", locale: "en" })).bubbles;
    expect(texts(roha)).toContain("Not yet: we don't deliver to 402109 right now. We deliver to Nagothane.");
    expect(roha[0]).toMatchObject({ links: [{ href: "/serviceability?pin=402109" }] });
  });

  it("shows a shopper only their own orders, and asks guests to sign in", async () => {
    expect((await assistantReply({ text: "where is my order", locale: "en" })).bubbles).toEqual([
      { kind: "sign-in", text: "Sign in to see your orders and where they are." },
    ]);
    const mine = (await assistantReply({ intent: "order", userId: shopper, locale: "en" })).bubbles;
    expect(mine[0]).toMatchObject({ kind: "text", text: "Your latest orders:" });
    const links = (mine[0] as { links: { label: string }[] }).links.map((link) => link.label);
    expect(links).toEqual(["AGS-20261001-00001 · Order placed · ₹250"]);
    expect(mine[1]).toMatchObject({ kind: "handoff" });
  });

  it("finds products shoppers can buy, never school-only ones", async () => {
    const reply = (await assistantReply({ text: "do you have gel pens?", locale: "en" })).bubbles;
    expect(reply[0]).toEqual({ kind: "text", text: "Here's what I found:" });
    const products = reply[1] as Extract<Bubble, { kind: "products" }>;
    expect(products.items.map((item) => item.slug)).toEqual(["gel-pen-set"]);
    expect(products.items[0]).toMatchObject({ name: "Gel Pen Set", label: "Pack of 10", pricePaise: 9900, available: 20 });
    const none = (await assistantReply({ text: "xylophone", locale: "en" })).bubbles;
    expect(none).toEqual([{ kind: "text", text: "I couldn't find “xylophone”. Try another word, or ask the store." }, { kind: "chips" }]);
  });

  it("says how to pay, and only offers online payment once it's switched on", async () => {
    expect(texts((await assistantReply({ text: "COD available?", locale: "en" })).bubbles)).toBe(
      "You can pay cash on delivery. Checkout shows what's available for your address.",
    );
  });

  it("passes signed-in shoppers to the live chat; guests are asked to sign in", async () => {
    expect((await assistantReply({ text: "talk to the store", locale: "en" })).bubbles[0]).toMatchObject({ kind: "sign-in" });
    const asked = "Can you deliver 50 registers to the school office tomorrow?";
    const reply = (await assistantReply({ text: `I want to talk to someone: ${asked}`, userId: shopper, locale: "en" })).bubbles;
    expect(reply[0]).toMatchObject({ kind: "handoff", question: `I want to talk to someone: ${asked}` });

    const id = await handOffToStore(shopper, { question: asked, locale: "en" });
    const conversation = await ChatConversation.findById(id);
    expect(conversation).toMatchObject({ title: `Question from the shop assistant: ${asked}`.slice(0, 100), status: "waiting-support" });
    expect(String(conversation.customerId)).toBe(shopper);
    const messages = await ChatMessage.find({ conversationId: id });
    expect(messages.map((m) => [m.body, String(m.senderId)])).toEqual([[asked, shopper]]);

    const plain = await handOffToStore(shopper, { question: "", locale: "mr" });
    expect(await ChatConversation.findById(plain)).toMatchObject({ title: "दुकानाच्या सहाय्यकाकडून प्रश्न" });
    expect(await ChatMessage.countDocuments({ conversationId: plain })).toBe(0);
  });
});
