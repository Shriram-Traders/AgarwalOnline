import mongoose from "mongoose";
import { connectDB } from "../src/lib/db/connect";
import {
  User,
  Category,
  Product,
  ProductVariant,
  InventoryItem,
  ServiceArea,
  SearchSynonym,
} from "../src/lib/db/models";
import { categories, seedProducts } from "../src/lib/catalog/seed-data";
import { Address, DeliverySlot, Order } from "../src/lib/commerce/models";
import { Notification } from "../src/lib/engagement/models";
import { log } from "../src/lib/logger";
import { Promotion, PromotionRedemption } from "../src/lib/promotions/models";
import { GuestCart } from "../src/lib/commerce/models";
import { ProductReview, ReviewReport } from "../src/lib/reviews/models";
if (process.env.NODE_ENV === "production" || process.env.SEED_DEMO !== "true")
  throw new Error("Fictional seed requires non-production SEED_DEMO=true.");
// Demo accounts and orders are for local and test databases only: with mock OTP switched on,
// anyone could sign in to a deployed site as the demo super-admin's phone number.
const demoAccounts = process.argv.includes("--demo-accounts");
await connectDB();
for (const model of [
  User,
  Category,
  Product,
  ProductVariant,
  InventoryItem,
  ServiceArea,
  SearchSynonym,
  Address,
  DeliverySlot,
  Order,
  Notification,
  GuestCart,
  Promotion,
  PromotionRedemption,
  ProductReview,
  ReviewReport,
])
  await model.init();
for (const c of categories)
  await Category.updateOne(
    { slug: c.slug },
    { $setOnInsert: { name: { en: c.en, mr: c.mr }, symbol: c.symbol } },
    { upsert: true },
  );
for (const [index, p] of seedProducts.entries()) {
  const c = await Category.findOne({ slug: p.category });
  const product = await Product.findOneAndUpdate(
    { slug: p.slug },
    {
      $setOnInsert: {
        name: { en: p.en, mr: p.mr },
        description: {
          en: `${p.en} for work, study, home or everyday use. Fictional demonstration product; packaging and availability are illustrative.`,
          mr: `${p.mr} — रोजच्या वापरासाठी. हे प्रात्यक्षिक उत्पादन आहे.`,
        },
        brand: p.brand,
        categoryId: c!._id,
        categorySlug: p.category,
        aliases: [...p.aliases],
        status: "published",
        featured: true,
        // the photographed products lead the popular rail, with the gift sets
        bestseller: index < 8 || p.category === "gift-sets",
      },
      $set: {
        highlights: [
          { en: "Selected for dependable everyday use", mr: "रोजच्या वापरासाठी विश्वासार्ह निवड" },
          { en: "Stored and handled by your local team", mr: "स्थानिक टीमकडून साठवण आणि हाताळणी" },
        ],
        specifications: [
          { label: { en: "Pack size", mr: "पॅक आकार" }, value: { en: p.pack, mr: p.pack } },
          { label: { en: "Seller", mr: "विक्रेता" }, value: { en: "Agarwal General Stores", mr: "अग्रवाल जनरल स्टोअर्स" } },
        ],
      },
    },
    { upsert: true, returnDocument: "after" },
  );
  const variant = await ProductVariant.findOneAndUpdate(
    { sku: `AGS-${String(index + 1).padStart(4, "0")}` },
    {
      $setOnInsert: {
        productId: product._id,
        label: p.pack,
        unit: p.unit,
        packQuantity: p.quantity,
        pricePaise: p.price,
        mrpPaise: p.mrp,
        maxQuantity: 10,
      },
    },
    { upsert: true, returnDocument: "after" },
  );
  await InventoryItem.updateOne(
    { variantId: variant._id },
    { $setOnInsert: { onHand: 50, reserved: 0 } },
    { upsert: true },
  );
}
// Fictional staff exist only so demo orders and promotions have someone to reference.
// They get no credential, so nobody can sign in as them. Create real staff from the Super Admin page.
const demoRoles = demoAccounts ? ["customer", "delivery", "admin", "super-admin"] : [];
for (const [index, role] of demoRoles.entries()) {
  await User.findOneAndUpdate(
    { phone: `900000000${index + 1}` },
    {
      $setOnInsert: {
        name: `Demo ${role}`,
        roles: role === "customer" ? ["customer"] : ["customer", role],
        ...(role !== "customer"
          ? { email: `${role}@demo.ags.test`, emailVerified: true }
          : {
              email: "9000000001@phone.ags.invalid",
              emailVerified: false,
            }),
      },
    },
    { upsert: true, returnDocument: "after" },
  );
}
for (const name of ["Nagothane", "Roha", "Pali", "RIL Township", "NMD"])
  await ServiceArea.updateOne(
    { key: name.toLowerCase().replaceAll(" ", "-") },
    { $setOnInsert: { name, pincodes: [], enabled: false, feePaise: 3000 } },
    { upsert: true },
  );
const superAdmin = await User.findOne({ roles: "super-admin" });
if (superAdmin) {
  await Promotion.updateOne(
    { code: "LOCAL10" },
    {
      $setOnInsert: {
        name: "Neighbourhood welcome",
        kind: "code",
        discountType: "percentage",
        discountValue: 10,
        minimumSubtotalPaise: 49900,
        maximumDiscountPaise: 10000,
        startsAt: new Date("2025-01-01T00:00:00.000Z"),
        endsAt: new Date("2035-12-31T23:59:59.999Z"),
        perCustomerLimit: 1,
        redemptionCount: 0,
        active: true,
        createdBy: superAdmin._id,
        updatedBy: superAdmin._id,
      },
    },
    { upsert: true },
  );
  await Promotion.updateOne(
    { name: "Everyday basket saving", kind: "automatic" },
    {
      $setOnInsert: {
        discountType: "fixed",
        discountValue: 2500,
        minimumSubtotalPaise: 75000,
        maximumDiscountPaise: 2500,
        startsAt: new Date("2025-01-01T00:00:00.000Z"),
        endsAt: new Date("2035-12-31T23:59:59.999Z"),
        perCustomerLimit: 20,
        redemptionCount: 0,
        active: true,
        createdBy: superAdmin._id,
        updatedBy: superAdmin._id,
      },
    },
    { upsert: true },
  );
}
for (const [key, synonyms] of Object.entries({
  pen: ["pen", "kalam", "पेन"],
  notebook: ["notebook", "vahi", "वही", "copy"],
  gift: ["gift", "present", "bhet", "भेट"],
  card: ["card", "greeting", "शुभेच्छापत्र"],
})) {
  if (!superAdmin) break; // synonyms record who set them
  await SearchSynonym.updateOne(
    { key },
    {
      $setOnInsert: {
        mappingType: "equivalent",
        synonyms,
        updatedBy: superAdmin._id,
      },
    },
    { upsert: true },
  );
}
const customer = await User.findOne({ roles: "customer" });
const deliveryPartner = await User.findOne({ roles: "delivery" });
const demoArea = await ServiceArea.findOne({ key: "nagothane" });
const firstVariants = await ProductVariant.find({}).sort({ sku: 1 }).limit(4);
const productIds = firstVariants.map((variant) => variant.productId);
const demoProducts = await Product.find({ _id: { $in: productIds } });
const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
if (demoAccounts && customer && deliveryPartner && demoArea && firstVariants.length) {
  const slot = await DeliverySlot.findOneAndUpdate(
    { areaId: demoArea._id, date: today, label: "4:00 PM – 7:00 PM" },
    { $setOnInsert: { capacity: 50, reserved: 0, enabled: true } },
    { upsert: true, returnDocument: "after" },
  );
  await Address.updateOne(
    { customerId: customer._id, line: "Fictional Demo House, Market Road" },
    {
      $setOnInsert: {
        name: "Demo Customer",
        phone: customer.phone,
        pin: "999999",
        areaId: demoArea._id,
        instructions: "Demo address only",
      },
    },
    { upsert: true },
  );
  for (let index = 0; index < 8; index++) {
    const variant = firstVariants[index % firstVariants.length];
    const product = demoProducts.find(
      (entry) => String(entry._id) === String(variant.productId),
    )!;
    const cancelled = index === 6;
    const active = index === 7;
    const createdAt = new Date(Date.now() - index * 3 * 86400 * 1000);
    await Order.updateOne(
      { number: `AGS-DEMO-${String(index + 1).padStart(3, "0")}` },
      {
        $setOnInsert: {
          customerId: customer._id,
          idempotencyKey: `demo-order-${index + 1}`,
          items: [
            {
              variantId: variant._id,
              name: product.name.en,
              label: variant.label,
              quantity: (index % 3) + 1,
              pricePaise: variant.pricePaise,
              linePaise: variant.pricePaise * ((index % 3) + 1),
            },
          ],
          address: {
            name: "Demo Customer",
            phone: customer.phone,
            line: "Fictional Demo House, Market Road",
            pin: "999999",
            instructions: "Demo order only",
            areaName: demoArea.name,
          },
          slotId: slot._id,
          deliveryDate: today,
          deliveryWindow: slot.label,
          subtotalPaise: variant.pricePaise * ((index % 3) + 1),
          deliveryPaise: index % 2 ? 3000 : 0,
          totalPaise:
            variant.pricePaise * ((index % 3) + 1) + (index % 2 ? 3000 : 0),
          orderStatus: cancelled
            ? "cancelled"
            : active
              ? "confirmed"
              : "completed",
          paymentStatus: cancelled ? "pending" : "paid",
          fulfilmentStatus: cancelled
            ? "unassigned"
            : active
              ? "picking"
              : "ready",
          deliveryStatus: cancelled
            ? "unassigned"
            : active
              ? "assigned"
              : "delivered",
          paymentMethod: index % 3 ? "cod" : "razorpay",
          codStatus: index % 3 && !cancelled ? "reconciled" : "uncollected",
          assignedTo: cancelled ? undefined : deliveryPartner._id,
          createdAt,
          updatedAt: new Date(createdAt.getTime() + 6 * 3600 * 1000),
        },
      },
      { upsert: true, timestamps: false },
    );
  }
  await Notification.updateOne(
    { userId: customer._id, title: "Welcome to your local store" },
    {
      $setOnInsert: {
        type: "system",
        body: "Your orders, delivery and support updates will appear here.",
        href: "/catalog",
        expiresAt: new Date(Date.now() + 180 * 86400 * 1000),
      },
    },
    { upsert: true },
  );
}
log("info", "seed.completed", {
  message: `Fictional catalog${demoAccounts ? ", accounts and demo orders were" : " and offers were"} seeded. Service areas remain disabled until PIN codes are confirmed.`,
});
await mongoose.disconnect();
