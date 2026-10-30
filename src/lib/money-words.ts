const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

const belowHundred = (n: number) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? `-${ONES[n % 10]}` : ""}`);

/** A whole number in Indian words: crore, lakh, thousand, hundred. */
function inWords(n: number): string {
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const crore = Math.floor(n / 1e7);
  const lakh = Math.floor((n % 1e7) / 1e5);
  const thousand = Math.floor((n % 1e5) / 1000);
  const hundred = Math.floor((n % 1000) / 100);
  const rest = n % 100;
  if (crore) parts.push(`${inWords(crore)} Crore`);
  if (lakh) parts.push(`${belowHundred(lakh)} Lakh`);
  if (thousand) parts.push(`${belowHundred(thousand)} Thousand`);
  if (hundred) parts.push(`${ONES[hundred]} Hundred`);
  if (rest) parts.push(belowHundred(rest));
  return parts.join(" ");
}

/** Paise as a bill says it: "Rupees One Thousand Two Hundred Thirty-Four and Fifty Paise Only". */
export function rupeesInWords(paise: number) {
  const whole = Math.floor(Math.max(0, Math.round(paise)) / 100);
  const fraction = Math.max(0, Math.round(paise)) % 100;
  return `Rupees ${inWords(whole)}${fraction ? ` and ${inWords(fraction)} Paise` : ""} Only`;
}

/** 0 to 99 in Marathi: each has its own word. To be checked by a Marathi speaker. */
const MARATHI = [
  "शून्य", "एक", "दोन", "तीन", "चार", "पाच", "सहा", "सात", "आठ", "नऊ",
  "दहा", "अकरा", "बारा", "तेरा", "चौदा", "पंधरा", "सोळा", "सतरा", "अठरा", "एकोणीस",
  "वीस", "एकवीस", "बावीस", "तेवीस", "चोवीस", "पंचवीस", "सव्वीस", "सत्तावीस", "अठ्ठावीस", "एकोणतीस",
  "तीस", "एकतीस", "बत्तीस", "तेहेतीस", "चौतीस", "पस्तीस", "छत्तीस", "सदतीस", "अडतीस", "एकोणचाळीस",
  "चाळीस", "एक्केचाळीस", "बेचाळीस", "त्रेचाळीस", "चव्वेचाळीस", "पंचेचाळीस", "सेहेचाळीस", "सत्तेचाळीस", "अठ्ठेचाळीस", "एकोणपन्नास",
  "पन्नास", "एक्कावन्न", "बावन्न", "त्रेपन्न", "चोपन्न", "पंचावन्न", "छप्पन्न", "सत्तावन्न", "अठ्ठावन्न", "एकोणसाठ",
  "साठ", "एकसष्ट", "बासष्ट", "त्रेसष्ट", "चौसष्ट", "पासष्ट", "सहासष्ट", "सदुसष्ट", "अडुसष्ट", "एकोणसत्तर",
  "सत्तर", "एकाहत्तर", "बाहत्तर", "त्र्याहत्तर", "चौऱ्याहत्तर", "पंच्याहत्तर", "शहात्तर", "सत्याहत्तर", "अठ्ठ्याहत्तर", "एकोणऐंशी",
  "ऐंशी", "एक्याऐंशी", "ब्याऐंशी", "त्र्याऐंशी", "चौऱ्याऐंशी", "पंच्याऐंशी", "शहाऐंशी", "सत्त्याऐंशी", "अठ्ठ्याऐंशी", "एकोणनव्वद",
  "नव्वद", "एक्याण्णव", "ब्याण्णव", "त्र्याण्णव", "चौऱ्याण्णव", "पंच्याण्णव", "शहाण्णव", "सत्त्याण्णव", "अठ्ठ्याण्णव", "नव्व्याण्णव",
];

/** A whole number in Marathi words: कोटी, लाख, हजार, then शंभर or -शे for hundreds. */
function inMarathi(n: number): string {
  if (n < 100) return MARATHI[n];
  const parts: string[] = [];
  const crore = Math.floor(n / 1e7);
  const lakh = Math.floor((n % 1e7) / 1e5);
  const thousand = Math.floor((n % 1e5) / 1000);
  const hundred = Math.floor((n % 1000) / 100);
  const rest = n % 100;
  if (crore) parts.push(`${inMarathi(crore)} कोटी`);
  if (lakh) parts.push(`${MARATHI[lakh]} लाख`);
  if (thousand) parts.push(`${MARATHI[thousand]} हजार`);
  // 100 on its own is शंभर; with more after it, एकशे (एकशे छत्तीस)
  if (hundred) parts.push(hundred === 1 && !rest ? "शंभर" : `${MARATHI[hundred]}शे`);
  if (rest) parts.push(MARATHI[rest]);
  return parts.join(" ");
}

/** Paise in Marathi, as a bill says it: "पाचशे छत्तीस रुपये आणि पन्नास पैसे फक्त". */
export function rupeesInMarathiWords(paise: number) {
  const whole = Math.floor(Math.max(0, Math.round(paise)) / 100);
  const fraction = Math.max(0, Math.round(paise)) % 100;
  return `${inMarathi(whole)} रुपये${fraction ? ` आणि ${MARATHI[fraction]} पैसे` : ""} फक्त`;
}
