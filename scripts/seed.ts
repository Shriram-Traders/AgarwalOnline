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
import { productImages } from "../src/lib/catalog/images";
import { Address, DeliverySlot, Order } from "../src/lib/commerce/models";
import { Notification } from "../src/lib/engagement/models";
import { log } from "../src/lib/logger";
import { Promotion, PromotionRedemption } from "../src/lib/promotions/models";
import { GuestCart } from "../src/lib/commerce/models";
import { ProductReview, ReviewReport } from "../src/lib/reviews/models";
import { OrderFeedback } from "../src/lib/feedback/models";
import { School, SchoolMember } from "../src/lib/schools/models";
import { randomBytes } from "node:crypto";
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
  OrderFeedback,
  School,
  SchoolMember,
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
        welcome: true,
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
  // What customers said about the delivered demo orders, so the owner's Ratings & feedback page
  // has something to read. The newest order is left unrated: the demo customer gets asked about it.
  const demoRatings = [
    { order: 2, rating: 5, tags: ["on-time", "well-packed"], comment: "Neatly packed, the kids loved the pens.", rider: 5, read: true },
    { order: 3, rating: 4, tags: ["on-time", "polite-partner"], rider: 5, read: true },
    { order: 4, rating: 2, tags: ["late"], comment: "Came after 8 pm, the slot was 4 to 7. Nobody called.", rider: 2 },
    {
      order: 5,
      rating: 5,
      tags: ["good-quality", "easy-order"],
      comment: "Easy to order from the phone.",
      read: true,
      reply: "Thank you! See you again.",
    },
    { order: 6, rating: 1, tags: ["item-missing"], comment: "One notebook was missing from the pack." },
  ];
  for (const demo of demoRatings) {
    const order = await Order.findOne({ number: `AGS-DEMO-${String(demo.order).padStart(3, "0")}` }).select("number updatedAt");
    if (!order) continue;
    const submittedAt = new Date(order.updatedAt.getTime() + 2 * 3600 * 1000);
    await OrderFeedback.updateOne(
      { orderId: order._id },
      {
        $setOnInsert: {
          orderNumber: order.number,
          state: "rated",
          rating: demo.rating,
          tags: demo.tags,
          locale: "en",
          deliveredAt: order.updatedAt,
          submittedAt,
          riderId: deliveryPartner._id,
          riderName: deliveryPartner.name,
          ...(demo.comment ? { comment: demo.comment } : {}),
          ...(demo.rider ? { riderRating: demo.rider } : {}),
          ...(demo.read ? { readAt: submittedAt } : {}),
          ...(demo.reply ? { reply: { body: demo.reply, at: submittedAt } } : {}),
        },
      },
      { upsert: true },
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
// School quotations: a few items only schools see, and school prices on some shop items.
const schoolOnly = [
  { slug: "attendance-register-a4", en: "Attendance Register A4", mr: "हजेरी रजिस्टर A4", category: "paper", pack: "200 pages · hard bound", quantity: 1, price: 18900, mrp: 22000, school: 14500, gst: 18, hsn: "4820" },
  { slug: "exercise-notebook-bundle", en: "Exercise Notebook Bundle", mr: "वह्यांचा गठ्ठा", category: "paper", pack: "12 notebooks · 172 pages", quantity: 12, price: 54000, mrp: 60000, school: 42000, gst: 0, hsn: "4820" },
  { slug: "white-chalk-box", en: "White Chalk Box", mr: "पांढरा खडू बॉक्स", category: "school", pack: "100 dustless sticks", quantity: 100, price: 9900, mrp: 12000, gst: 5, hsn: "9609" },
  // the school marketplace's fuller shelf: exam, classroom, office and art supplies in school packs
  { slug: "ruled-answer-sheets-ream", en: "Ruled Answer Sheets", mr: "रेघी उत्तरपत्रिका", category: "paper", pack: "Ream of 500 · A4", quantity: 500, price: 42000, mrp: 48000, school: 36500, gst: 18, hsn: "4820", photo: "a4-copier-paper" },
  { slug: "supplement-answer-sheets", en: "Supplement Answer Sheets", mr: "पुरवणी उत्तरपत्रिका", category: "paper", pack: "Pack of 1,000 · 4 pages", quantity: 1000, price: 65000, mrp: 72000, school: 54000, gst: 18, hsn: "4820", photo: "a4-copier-paper" },
  { slug: "long-book-172-pack", en: "Long Book, 172 Pages", mr: "लांब वही, १७२ पाने", category: "paper", pack: "Pack of 12 · single line", quantity: 12, price: 62400, mrp: 69000, school: 51000, gst: 0, hsn: "4820", photo: "long-ruled-notebooks" },
  { slug: "drawing-book-school-pack", en: "Drawing Book, 36 Pages", mr: "चित्रकला वही, ३६ पाने", category: "art-craft", pack: "Pack of 20", quantity: 20, price: 36000, mrp: 40000, school: 29500, gst: 0, hsn: "4820", photo: "a4-spiral-sketchbook" },
  { slug: "practical-journal-science", en: "Science Practical Journal", mr: "विज्ञान प्रात्यक्षिक वही", category: "paper", pack: "Pack of 10 · 100 pages", quantity: 10, price: 45000, mrp: 50000, gst: 0, hsn: "4820", photo: "a5-hardcover-notebook" },
  { slug: "coloured-chalk-box", en: "Coloured Chalk Box", mr: "रंगीत खडू बॉक्स", category: "school", pack: "100 sticks · 10 colours", quantity: 100, price: 14900, mrp: 17500, school: 11800, gst: 5, hsn: "9609" },
  { slug: "blackboard-duster", en: "Blackboard Duster", mr: "फळा पुसणे डस्टर", category: "school", pack: "Pack of 10", quantity: 10, price: 25000, mrp: 30000, school: 19500, gst: 18, hsn: "9603" },
  { slug: "id-card-holder-lanyard", en: "ID Card Holder with Lanyard", mr: "ओळखपत्र होल्डर व दोरी", category: "school", pack: "Pack of 50", quantity: 50, price: 50000, mrp: 60000, school: 39000, gst: 18, hsn: "3926" },
  { slug: "report-card-folders", en: "Report Card Folders", mr: "प्रगतीपुस्तक फोल्डर", category: "office", pack: "Pack of 100", quantity: 100, price: 80000, mrp: 90000, gst: 18, hsn: "4820", photo: "document-file-set" },
  { slug: "chart-paper-bundle", en: "Chart Paper, Assorted Colours", mr: "चार्ट पेपर, विविध रंग", category: "art-craft", pack: "Bundle of 50 sheets", quantity: 50, price: 25000, mrp: 30000, school: 20000, gst: 18, hsn: "4802" },
  { slug: "poster-colour-set-school", en: "Poster Colour Set", mr: "पोस्टर रंग संच", category: "art-craft", pack: "12 colours · 10 ml", quantity: 12, price: 9500, mrp: 11000, school: 7600, gst: 18, hsn: "3213", photo: "watercolour-cake-set" },
  { slug: "staff-room-register", en: "Staff Room Register", mr: "शिक्षक कक्ष रजिस्टर", category: "office", pack: "400 pages · hard bound", quantity: 1, price: 32000, mrp: 36000, school: 26000, gst: 18, hsn: "4820", photo: "a5-hardcover-notebook" },
  // textbooks, workbooks and reference books: a fictional publisher, priced per copy so a school types the count it needs
  { slug: "marathi-reader-std-1", en: "Marathi Reader, Std 1", mr: "मराठी वाचनमाला, इयत्ता १", brand: "VIDYA PRESS", category: "school", pack: "Single copy · 96 pages", quantity: 1, price: 9500, mrp: 11000, school: 8000, gst: 0, hsn: "4901", photo: "a5-hardcover-notebook" },
  { slug: "marathi-reader-std-4", en: "Marathi Reader, Std 4", mr: "मराठी वाचनमाला, इयत्ता ४", brand: "VIDYA PRESS", category: "school", pack: "Single copy · 120 pages", quantity: 1, price: 10500, mrp: 12000, school: 8800, gst: 0, hsn: "4901", photo: "a5-hardcover-notebook" },
  { slug: "english-reader-std-3", en: "English Reader, Std 3", mr: "इंग्रजी वाचनमाला, इयत्ता ३", brand: "VIDYA PRESS", category: "school", pack: "Single copy · 112 pages", quantity: 1, price: 11000, mrp: 12500, school: 9200, gst: 0, hsn: "4901", photo: "a5-hardcover-notebook" },
  { slug: "hindi-textbook-std-6", en: "Hindi Textbook, Std 6", mr: "हिंदी पाठ्यपुस्तक, इयत्ता ६", brand: "VIDYA PRESS", category: "school", pack: "Single copy · 128 pages", quantity: 1, price: 12000, mrp: 13500, school: 9900, gst: 0, hsn: "4901", photo: "a5-hardcover-notebook" },
  { slug: "mathematics-textbook-std-5", en: "Mathematics Textbook, Std 5", mr: "गणित पाठ्यपुस्तक, इयत्ता ५", brand: "VIDYA PRESS", category: "school", pack: "Single copy · 144 pages", quantity: 1, price: 13500, mrp: 15000, school: 11200, gst: 0, hsn: "4901", photo: "a5-hardcover-notebook" },
  { slug: "mathematics-textbook-std-8", en: "Mathematics Textbook, Std 8", mr: "गणित पाठ्यपुस्तक, इयत्ता ८", brand: "VIDYA PRESS", category: "school", pack: "Single copy · 176 pages", quantity: 1, price: 15500, mrp: 17500, school: 13000, gst: 0, hsn: "4901", photo: "a5-hardcover-notebook" },
  { slug: "science-textbook-std-7", en: "Science Textbook, Std 7", mr: "विज्ञान पाठ्यपुस्तक, इयत्ता ७", brand: "VIDYA PRESS", category: "school", pack: "Single copy · 160 pages", quantity: 1, price: 14500, mrp: 16000, school: 12000, gst: 0, hsn: "4901", photo: "a5-hardcover-notebook" },
  { slug: "history-civics-std-8", en: "History & Civics Textbook, Std 8", mr: "इतिहास व नागरिकशास्त्र, इयत्ता ८", brand: "VIDYA PRESS", category: "school", pack: "Single copy · 136 pages", quantity: 1, price: 13000, mrp: 14500, school: 10800, gst: 0, hsn: "4901", photo: "a5-hardcover-notebook" },
  { slug: "geography-textbook-std-9", en: "Geography Textbook, Std 9", mr: "भूगोल पाठ्यपुस्तक, इयत्ता ९", brand: "VIDYA PRESS", category: "school", pack: "Single copy · 152 pages", quantity: 1, price: 14000, mrp: 15500, school: 11600, gst: 0, hsn: "4901", photo: "a5-hardcover-notebook" },
  { slug: "english-grammar-workbook-std-4", en: "English Grammar Workbook, Std 4", mr: "इंग्रजी व्याकरण सराव वही, इयत्ता ४", brand: "VIDYA PRESS", category: "school", pack: "Single copy · 80 pages", quantity: 1, price: 9000, mrp: 10000, school: 7400, gst: 0, hsn: "4820", photo: "long-ruled-notebooks" },
  { slug: "maths-practice-workbook-std-2", en: "Maths Practice Workbook, Std 2", mr: "गणित सराव वही, इयत्ता २", brand: "VIDYA PRESS", category: "school", pack: "Single copy · 64 pages", quantity: 1, price: 8500, mrp: 9500, school: 7000, gst: 0, hsn: "4820", photo: "long-ruled-notebooks" },
  { slug: "cursive-writing-practice-book", en: "Cursive Writing Practice Book", mr: "सुंदर हस्ताक्षर सराव वही", brand: "VIDYA PRESS", category: "paper", pack: "Pack of 10 · 48 pages", quantity: 10, price: 35000, mrp: 40000, school: 28500, gst: 0, hsn: "4820", photo: "long-ruled-notebooks" },
  { slug: "school-atlas", en: "School Atlas", mr: "शालेय नकाशासंग्रह", brand: "VIDYA PRESS", category: "school", pack: "Single copy · 72 maps", quantity: 1, price: 24000, mrp: 27000, school: 19500, gst: 0, hsn: "4905", photo: "a4-spiral-sketchbook" },
  { slug: "map-book-india-world", en: "Map Book: India & World", mr: "नकाशा वही: भारत व जग", brand: "VIDYA PRESS", category: "school", pack: "Single copy · 32 outline maps", quantity: 1, price: 6500, mrp: 7500, school: 5200, gst: 0, hsn: "4905", photo: "a4-spiral-sketchbook" },
  { slug: "english-marathi-dictionary", en: "English–Marathi Dictionary", mr: "इंग्रजी–मराठी शब्दकोश", brand: "VIDYA PRESS", category: "school", pack: "Single copy · 640 pages", quantity: 1, price: 32000, mrp: 36000, school: 27000, gst: 0, hsn: "4901", photo: "a5-hardcover-notebook" },
  // exam, classroom and office paper
  { slug: "graph-book-50-pages", en: "Graph Book, 50 Pages", mr: "आलेख वही, ५० पाने", category: "paper", pack: "Pack of 20", quantity: 20, price: 30000, mrp: 34000, school: 24500, gst: 0, hsn: "4820", photo: "a4-spiral-sketchbook" },
  { slug: "exam-writing-pad-a4", en: "Exam Writing Pad A4", mr: "परीक्षा लेखन पॅड A4", category: "paper", pack: "Pack of 10 · 100 sheets", quantity: 10, price: 150000, mrp: 170000, school: 125000, gst: 18, hsn: "4820", photo: "a4-copier-paper" },
  { slug: "school-diary-with-timetable", en: "School Diary with Timetable", mr: "शालेय दैनंदिनी, वेळापत्रकासह", category: "school", pack: "Pack of 50", quantity: 50, price: 375000, mrp: 420000, school: 310000, gst: 18, hsn: "4820", photo: "travel-journal-gift-set" },
  { slug: "library-register", en: "Library Register", mr: "ग्रंथालय रजिस्टर", category: "office", pack: "300 pages · hard bound", quantity: 1, price: 29000, mrp: 33000, school: 24000, gst: 18, hsn: "4820", photo: "a5-hardcover-notebook" },
  { slug: "fee-receipt-book-triplicate", en: "Fee Receipt Book, Triplicate", mr: "फी पावती पुस्तक, तीन प्रती", category: "office", pack: "Pack of 10 · 50 leaves", quantity: 10, price: 90000, mrp: 100000, school: 75000, gst: 18, hsn: "4820", photo: "pocket-memo-pads" },
  // classroom and laboratory
  { slug: "wall-map-india-laminated", en: "Wall Map of India, Laminated", mr: "भारताचा भिंतीवरील नकाशा, लॅमिनेटेड", category: "school", pack: "100 × 70 cm", quantity: 1, price: 45000, mrp: 52000, school: 37000, gst: 0, hsn: "4905" },
  { slug: "globe-30-cm", en: "Globe, 30 cm", mr: "पृथ्वीगोल, ३० सेमी", category: "school", pack: "Single · metal stand", quantity: 1, price: 85000, mrp: 95000, school: 70000, gst: 18, hsn: "4905" },
  { slug: "science-lab-kit-std-8", en: "Science Lab Kit, Std 8", mr: "विज्ञान प्रयोगशाळा संच, इयत्ता ८", category: "school", pack: "Class kit · 24 experiments", quantity: 1, price: 240000, mrp: 270000, school: 205000, gst: 18, hsn: "9023" },
  { slug: "maths-lab-kit-primary", en: "Maths Lab Kit, Primary", mr: "गणित प्रयोग संच, प्राथमिक", category: "school", pack: "Class kit · 18 activities", quantity: 1, price: 180000, mrp: 200000, gst: 18, hsn: "9023" },
  { slug: "classroom-abacus", en: "Classroom Abacus", mr: "वर्गासाठी अबॅकस", category: "school", pack: "Single · 60 cm frame", quantity: 1, price: 65000, mrp: 75000, gst: 18, hsn: "9023" },
  { slug: "whiteboard-marker-box", en: "Whiteboard Marker Box", mr: "व्हाइटबोर्ड मार्कर बॉक्स", category: "school", pack: "Box of 12 · black", quantity: 12, price: 36000, mrp: 42000, school: 30000, gst: 18, hsn: "9608", photo: "permanent-marker-set" },
] as const;
for (const [index, item] of schoolOnly.entries()) {
  const c = await Category.findOne({ slug: item.category });
  const product = await Product.findOneAndUpdate(
    { slug: item.slug },
    {
      $setOnInsert: {
        name: { en: item.en, mr: item.mr },
        description: {
          en: `${item.en} for schools, quoted in bulk. Fictional demonstration product.`,
          mr: `${item.mr} — शाळांसाठी. हे प्रात्यक्षिक उत्पादन आहे.`,
        },
        // textbooks carry their (fictional) publisher; everything else is the shop's school brand
        brand: "brand" in item ? item.brand : "SCHOOLMATE",
        categoryId: c!._id,
        categorySlug: item.category,
        status: "published",
        showToCustomers: false,
        showToSchools: true,
        gstRatePercent: item.gst,
        hsnCode: item.hsn,
        // a similar demo photo, where there is one
        ...("photo" in item ? { image: productImages[item.photo] } : {}),
      },
    },
    { upsert: true, returnDocument: "after" },
  );
  const variant = await ProductVariant.findOneAndUpdate(
    { sku: `AGS-S-${String(index + 1).padStart(4, "0")}` },
    {
      $setOnInsert: {
        productId: product._id,
        label: item.pack,
        unit: "piece",
        packQuantity: item.quantity,
        pricePaise: item.price,
        mrpPaise: item.mrp,
        maxQuantity: 10,
        ...("school" in item ? { schoolPricePaise: item.school } : {}),
      },
    },
    { upsert: true, returnDocument: "after" },
  );
  await InventoryItem.updateOne({ variantId: variant._id }, { $setOnInsert: { onHand: 0, reserved: 0 } }, { upsert: true });
}
// shop items schools can ask for too; prices before GST
const forSchoolsToo: [slug: string, schoolPricePaise: number | undefined, hsnCode: string][] = [
  ["geometry-box", 9900, "9017"],
  ["eraser-sharpener-kit", 3800, "9017"],
  ["brown-cover-rolls", undefined, "4823"],
  ["hb-pencils-with-eraser", 6200, "9609"],
  ["smooth-ball-pen-set", 7400, "9608"],
  ["washable-colour-pencil-set", 11500, "9609"],
  ["a4-copier-paper", 27500, "4802"],
  ["permanent-marker-set", 9800, "9608"],
  ["metal-stapler-no-10", 8200, "8472"],
  ["document-file-set", undefined, "4820"],
  ["desk-calculator", 31000, "8470"],
];
for (const [slug, schoolPricePaise, hsnCode] of forSchoolsToo) {
  const product = await Product.findOneAndUpdate(
    { slug },
    { $set: { showToSchools: true, gstRatePercent: 18, hsnCode } },
    { returnDocument: "after" },
  );
  if (product && schoolPricePaise)
    await ProductVariant.updateOne({ productId: product._id, schoolPricePaise: { $exists: false } }, { $set: { schoolPricePaise } });
}
// the plain demo customer (not a staff account that also shops) represents the demo school
const schoolRep = demoAccounts ? await User.findOne({ roles: ["customer"] }) : null;
if (schoolRep && superAdmin) {
  const school = await School.findOneAndUpdate(
    { name: "Fictional Vidya Mandir" },
    {
      $setOnInsert: {
        contactName: "Office in-charge",
        address: "Fictional School Road, Nagothane",
        pin: "999999",
        stateCode: "27",
        notes: "Demo school only",
        joinToken: randomBytes(18).toString("base64url"),
        createdBy: superAdmin._id,
      },
    },
    { upsert: true, returnDocument: "after" },
  );
  await SchoolMember.updateOne(
    { schoolId: school._id, userId: schoolRep._id },
    { $setOnInsert: { addedBy: superAdmin._id, via: "owner" } },
    { upsert: true },
  );
}
log("info", "seed.completed", {
  message: `Fictional catalog${demoAccounts ? ", accounts and demo orders were" : " and offers were"} seeded. Service areas remain disabled until PIN codes are confirmed.`,
});
await mongoose.disconnect();
