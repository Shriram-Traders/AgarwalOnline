/** Fictional demo catalog: a neighbourhood stationery and gift counter. Brands are invented. */
export const categories = [
  { slug: "stationery", en: "Writing & Pens", mr: "लेखन साहित्य व पेन", symbol: "✎" },
  { slug: "paper", en: "Notebooks & Paper", mr: "वह्या व कागद", symbol: "▤" },
  { slug: "school", en: "School Essentials", mr: "शालेय साहित्य", symbol: "✐" },
  { slug: "art-craft", en: "Art & Craft", mr: "कला व हस्तकला", symbol: "✦" },
  { slug: "office", en: "Office Supplies", mr: "कार्यालयीन साहित्य", symbol: "▣" },
  { slug: "gift-sets", en: "Gift Sets & Hampers", mr: "भेटवस्तू संच", symbol: "❖" },
  { slug: "gift-wrap", en: "Gift Wrap & Bags", mr: "गिफ्ट रॅप व बॅग", symbol: "✧" },
  { slug: "cards", en: "Greeting Cards", mr: "शुभेच्छापत्रे", symbol: "✉" },
  { slug: "decor", en: "Décor & Keepsakes", mr: "सजावट व आठवणी", symbol: "❋" },
  { slug: "toys", en: "Toys & Games", mr: "खेळणी व खेळ", symbol: "◈" },
  { slug: "party", en: "Party & Festive", mr: "पार्टी व सण", symbol: "✺" },
];

type SeedProduct = {
  slug: string;
  en: string;
  mr: string;
  brand: string;
  category: (typeof categories)[number]["slug"];
  pack: string;
  unit: string;
  quantity: number;
  price: number;
  mrp: number;
  aliases: string[];
};

const p = (
  slug: string,
  en: string,
  mr: string,
  brand: string,
  category: SeedProduct["category"],
  pack: string,
  quantity: number,
  price: number,
  mrp: number,
  aliases: string[],
): SeedProduct => ({ slug, en, mr, brand, category, pack, unit: "piece", quantity, price, mrp, aliases });

// the first eight keep their slugs: they are the products with photographs in images.ts
export const seedProducts: SeedProduct[] = [
  p("a5-hardcover-notebook", "A5 Hardcover Notebook", "ए५ हार्डकव्हर वही", "PAPER & CO.", "paper", "192 ruled pages", 1, 18900, 22000, ["notebook", "diary", "journal", "वही", "notepad"]),
  p("smooth-ball-pen-set", "Smooth Ball Pen Set", "स्मूथ बॉल पेन संच", "WRITEWELL", "stationery", "Pack of 5 · blue", 5, 5500, 6500, ["pen", "ball pen", "blue pen", "पेन", "writing"]),
  p("a4-copier-paper", "A4 Copier Paper", "ए४ कॉपियर पेपर", "OFFICE SELECT", "paper", "75 GSM · 500 sheets", 1, 36500, 39900, ["a4", "paper", "printer paper", "कागद", "xerox"]),
  p("metal-stapler-no-10", "Metal Stapler No. 10", "मेटल स्टेपलर नं. १०", "DESKLINE", "office", "1 stapler · pin box included", 1, 14000, 16500, ["stapler", "staple pins", "office", "स्टेपलर"]),
  p("document-file-set", "Document File Set", "डॉक्युमेंट फाईल संच", "FILEWISE", "office", "Pack of 3 · A4", 3, 12900, 15000, ["file", "folder", "document file", "फाईल", "office"]),
  p("permanent-marker-set", "Permanent Marker Set", "परमनंट मार्कर संच", "WRITEWELL", "stationery", "Pack of 4 · assorted", 4, 12000, 14500, ["marker", "permanent marker", "sketch pen", "मार्कर"]),
  p("sticky-notes-set", "Sticky Notes Set", "स्टिकी नोट्स संच", "PAPER & CO.", "paper", "5 colours · 400 sheets", 1, 9900, 12000, ["sticky notes", "post it", "memo", "नोट्स"]),
  p("washable-colour-pencil-set", "Colour Pencil Set", "रंगीत पेन्सिल संच", "MAKE & PLAY", "art-craft", "12 colours", 12, 17500, 19900, ["colour pencil", "drawing", "art", "रंगीत पेन्सिल"]),

  p("gel-pen-set", "Gel Pen Set", "जेल पेन संच", "WRITEWELL", "stationery", "Pack of 10 · assorted colours", 10, 9900, 12000, ["gel pen", "colour pen", "जेल पेन"]),
  p("classic-fountain-pen", "Classic Fountain Pen", "क्लासिक फाउंटन पेन", "WRITEWELL", "stationery", "1 pen · 2 ink cartridges", 1, 34900, 42000, ["fountain pen", "ink pen", "शाईचा पेन"]),
  p("hb-pencils-with-eraser", "HB Pencils with Eraser Tip", "खोडरबरसह एचबी पेन्सिल", "SCHOOLMATE", "stationery", "Pack of 10", 10, 6000, 7000, ["pencil", "hb pencil", "पेन्सिल"]),
  p("pastel-highlighter-set", "Pastel Highlighter Set", "पेस्टल हायलायटर संच", "WRITEWELL", "stationery", "Pack of 6", 6, 14900, 18000, ["highlighter", "marker", "हायलायटर"]),

  p("long-ruled-notebooks", "Long Ruled Notebooks", "लांब रेघी वह्या", "PAPER & CO.", "paper", "Pack of 6 · 172 pages", 6, 21000, 24000, ["long book", "school notebook", "वही", "copy"]),
  p("pocket-memo-pads", "Pocket Memo Pads", "पॉकेट मेमो पॅड", "PAPER & CO.", "paper", "Pack of 4 · 80 sheets", 4, 6900, 8500, ["memo pad", "notepad", "chit pad", "नोटपॅड"]),

  p("geometry-box", "Geometry Box", "कंपास पेटी", "SCHOOLMATE", "school", "11 pieces · metal case", 1, 12900, 15000, ["compass box", "geometry", "instrument box", "कंपास"]),
  p("zip-pencil-pouch", "Zip Pencil Pouch", "पेन्सिल पाऊच", "SCHOOLMATE", "school", "2 compartments", 1, 14900, 19900, ["pencil pouch", "pencil case", "पाऊच"]),
  p("eraser-sharpener-kit", "Eraser & Sharpener Kit", "खोडरबर व शार्पनर संच", "SCHOOLMATE", "school", "4 erasers · 2 sharpeners", 6, 4900, 6000, ["eraser", "rubber", "sharpener", "खोडरबर"]),
  p("brown-cover-rolls", "Book Cover Rolls", "वह्यांचे कव्हर रोल", "SCHOOLMATE", "school", "Pack of 2 · brown", 2, 5900, 7500, ["book cover", "brown paper", "cover paper", "कव्हर"]),

  p("watercolour-cake-set", "Watercolour Cake Set", "वॉटरकलर रंग संच", "MAKE & PLAY", "art-craft", "18 shades · brush included", 1, 19900, 24000, ["watercolour", "paint", "colours", "रंग"]),
  p("a4-spiral-sketchbook", "A4 Spiral Sketchbook", "ए४ स्पायरल स्केचबुक", "PAPER & CO.", "art-craft", "40 sheets · 140 GSM", 1, 15900, 18900, ["sketchbook", "drawing book", "स्केचबुक"]),
  p("glitter-glue-pens", "Glitter Glue Pens", "ग्लिटर ग्लू पेन", "MAKE & PLAY", "art-craft", "Pack of 6", 6, 8900, 11000, ["glitter", "glue", "craft", "ग्लिटर"]),

  p("desk-organiser-tray", "Desk Organiser Tray", "डेस्क ऑर्गनायझर", "DESKLINE", "office", "3 compartments", 1, 32900, 39900, ["organiser", "pen stand", "desk tray", "पेन स्टँड"]),
  p("desk-calculator", "12-Digit Desk Calculator", "१२ अंकी कॅल्क्युलेटर", "DESKLINE", "office", "Solar and battery", 1, 44900, 55000, ["calculator", "कॅल्क्युलेटर"]),

  p("pen-and-diary-gift-set", "Pen & Diary Gift Set", "पेन व डायरी भेट संच", "WRITEWELL", "gift-sets", "A5 diary · metal pen · gift box", 1, 59900, 74900, ["gift set", "diary set", "corporate gift", "भेट संच"]),
  p("kids-art-gift-hamper", "Kids Art Gift Hamper", "मुलांसाठी कला भेट संच", "MAKE & PLAY", "gift-sets", "24 pieces", 24, 89900, 109900, ["art hamper", "kids gift", "return gift", "भेटवस्तू"]),
  p("travel-journal-gift-set", "Travel Journal Gift Set", "प्रवास जर्नल भेट संच", "PAPER & CO.", "gift-sets", "Journal · stickers · pen", 1, 69900, 84900, ["journal", "travel diary", "gift", "जर्नल"]),

  p("kraft-gift-wrap-roll", "Kraft Gift Wrap Roll", "क्राफ्ट गिफ्ट रॅप", "WRAP & BOW", "gift-wrap", "70 cm × 5 m", 1, 12900, 15900, ["gift wrap", "wrapping paper", "रॅपिंग पेपर"]),
  p("satin-ribbon-set", "Satin Ribbon Set", "सॅटिन रिबन संच", "WRAP & BOW", "gift-wrap", "6 colours · 5 m each", 6, 9900, 12900, ["ribbon", "रिबन"]),
  p("printed-gift-bags", "Printed Gift Bags", "छापील गिफ्ट बॅग", "WRAP & BOW", "gift-wrap", "Pack of 5 · medium", 5, 14900, 18900, ["gift bag", "carry bag", "बॅग"]),

  p("birthday-greeting-cards", "Birthday Greeting Cards", "वाढदिवसाची शुभेच्छापत्रे", "CARD CORNER", "cards", "Pack of 6 · envelopes included", 6, 17900, 21000, ["birthday card", "greeting card", "शुभेच्छापत्र"]),
  p("thank-you-cards", "Thank You Cards", "धन्यवाद कार्डे", "CARD CORNER", "cards", "Pack of 10", 10, 14900, 18000, ["thank you card", "note card", "कार्ड"]),
  p("festive-greeting-card-set", "Festive Greeting Card Set", "सणासुदीची शुभेच्छापत्रे", "CARD CORNER", "cards", "Pack of 5 · envelopes included", 5, 12900, 15000, ["diwali card", "festival card", "शुभेच्छापत्र"]),

  p("wooden-photo-frame", "Wooden Photo Frame", "लाकडी फोटो फ्रेम", "HOMEGLOW", "decor", "4 × 6 inch", 1, 29900, 39900, ["photo frame", "frame", "फोटो फ्रेम"]),
  p("scented-candle-jar", "Scented Candle Jar", "सुगंधी मेणबत्ती", "HOMEGLOW", "decor", "Vanilla · 150 g", 1, 34900, 44900, ["candle", "scented candle", "मेणबत्ती"]),
  p("ceramic-coffee-mug", "Ceramic Coffee Mug", "सिरॅमिक कॉफी मग", "HOMEGLOW", "decor", "350 ml · gift boxed", 1, 24900, 29900, ["mug", "coffee mug", "cup", "मग"]),

  p("teddy-bear-soft-toy", "Teddy Bear Soft Toy", "टेडी बेअर", "CUDDLE CO.", "toys", "30 cm", 1, 49900, 64900, ["teddy", "soft toy", "टेडी"]),
  p("jigsaw-puzzle-500", "500-Piece Jigsaw Puzzle", "५०० तुकड्यांचे कोडे", "MAKE & PLAY", "toys", "48 × 34 cm", 500, 39900, 49900, ["puzzle", "jigsaw", "कोडे"]),
  p("ludo-snakes-board-game", "Ludo & Snakes Board Game", "लुडो व सापशिडी", "MAKE & PLAY", "toys", "2-in-1 folding board", 1, 19900, 24900, ["ludo", "snakes and ladders", "board game", "सापशिडी"]),

  p("balloon-party-pack", "Balloon Party Pack", "फुग्यांचा पार्टी संच", "PARTY LANE", "party", "50 balloons · pump included", 50, 19900, 25000, ["balloons", "party", "फुगे"]),
  p("birthday-candle-set", "Birthday Candle Set", "वाढदिवसाच्या मेणबत्त्या", "PARTY LANE", "party", "24 candles · holders", 24, 6900, 8900, ["cake candles", "birthday", "मेणबत्ती"]),
  p("painted-clay-diya-set", "Painted Clay Diya Set", "रंगवलेल्या पणत्या", "FESTIVE HANDS", "party", "Pack of 6", 6, 14900, 19900, ["diya", "diwali", "पणती"]),
];
