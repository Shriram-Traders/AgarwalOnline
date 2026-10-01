export function normalizeSearch(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-IN")
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}
export const defaultSynonyms = [
  ["pen", "kalam", "पेन"],
  ["notebook", "vahi", "वही", "copy"],
  ["pencil", "pensil", "पेन्सिल"],
  ["eraser", "rubber", "khodrabar", "खोडरबर"],
  ["sharpener", "sharpner", "shapner"],
  ["scale", "ruler", "patti", "पट्टी"],
  ["refill", "रिफिल"],
  ["glue", "gum", "gond", "गोंद"],
  ["colour", "color", "rang", "रंग"],
  ["crayon", "khadu", "खडू"],
  ["diary", "डायरी"],
  ["file", "folder", "फाईल"],
  ["gift", "present", "bhet", "भेट"],
  ["card", "greeting", "शुभेच्छापत्र"],
  ["rice", "chawal", "chaval", "तांदूळ", "tandul"],
  ["milk", "doodh", "dudh", "दूध"],
  ["tea", "chai", "चहा"],
  ["atta", "aata", "flour", "पीठ"],
  ["salt", "namak", "मीठ"],
  ["oil", "tel", "तेल"],
];
/** English plural to singular, so "pens", "boxes", "brushes" and "diaries" find "Pen", "Box", "Brush" and "Diary". */
export function singular(word: string) {
  if (!/^[a-z]{4,}$/.test(word)) return word;
  if (/(ches|shes|sses|xes|zes)$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/**
 * One list of alternatives per word of the query: the word, its singular and any synonym
 * group it belongs to. A product matches when every word matches one of its alternatives,
 * so "gel pens" finds "Gel Pen Set" and "vahi" finds notebooks.
 */
export function searchWords(query: string, groups: string[][] = defaultSynonyms) {
  const words = normalizeSearch(query).split(" ").filter(Boolean).slice(0, 6);
  return words.map((word) => {
    const base = singular(word);
    const alternatives = new Set([word, base]);
    for (const group of groups) {
      const terms = group.map(normalizeSearch).filter(Boolean);
      if (terms.some((term) => term === word || singular(term) === base))
        terms.forEach((term) => alternatives.add(term));
    }
    return [...alternatives];
  });
}
/** Regex source matching any of a word's alternatives anywhere in a field (so "note" finds "notebook"). */
export function wordPattern(alternatives: string[]) {
  return alternatives.map(escape).join("|");
}
/**
 * A forgiving pattern for the second pass, used only when nothing matched exactly: one letter
 * missing ("notbook"), one wrong ("notebock") or one extra ("noteebook") in words of 4+ letters.
 */
export function fuzzyPattern(word: string) {
  if (!/^[a-z]{4,}$/.test(word)) return escape(word);
  const letters = [...word];
  const variants = new Set([letters.map(escape).join(".?")]);
  letters.forEach((_, index) => {
    variants.add(letters.map((letter, i) => (i === index ? "." : letter)).join(""));
    variants.add(letters.filter((_, i) => i !== index).join(""));
  });
  return [...variants].join("|");
}
/**
 * How well a product matches, for ordering search results: a word that starts or is a whole
 * word in the name beats one buried in an alias. Higher is better.
 */
export function relevance(
  product: { name: { en: string; mr: string }; brand?: string; aliases?: string[] },
  query: string,
  words: string[][],
) {
  const names = [product.name.en, product.name.mr].map(normalizeSearch);
  const other = [product.brand ?? "", ...(product.aliases ?? [])].map(normalizeSearch);
  let score = names.some((name) => name.includes(normalizeSearch(query))) ? 5 : 0;
  for (const alternatives of words) {
    let best = 0;
    for (const term of alternatives) {
      for (const name of names) {
        const tokens = name.split(" ");
        if (tokens.includes(term)) best = Math.max(best, 4);
        else if (tokens.some((token) => token.startsWith(term))) best = Math.max(best, 3);
        else if (name.includes(term)) best = Math.max(best, 2);
      }
      if (other.some((value) => value.includes(term))) best = Math.max(best, 1);
    }
    score += best;
  }
  return score;
}
/**
 * Ordering for the forgiving second pass, where the typed words match nothing exactly: a product
 * whose own name fits the pattern beats one that only came in through its aisle's name.
 */
export function patternRelevance(
  product: { name: { en: string; mr: string }; brand?: string; aliases?: string[] },
  patterns: string[],
) {
  let score = 0;
  for (const source of patterns) {
    const regex = new RegExp(source, "i");
    if ([product.name.en, product.name.mr].some((name) => regex.test(normalizeSearch(name)))) score += 3;
    else if ([product.brand ?? "", ...(product.aliases ?? [])].some((value) => regex.test(normalizeSearch(value))))
      score += 1;
  }
  return score;
}
export function expandSearch(
  query: string,
  groups: string[][] = defaultSynonyms,
) {
  const normalized = normalizeSearch(query);
  return [
    ...new Set([
      normalized,
      ...groups
        .filter((group) =>
          group.some((term) => normalizeSearch(term) === normalized),
        )
        .flat()
        .map(normalizeSearch),
    ]),
  ].filter(Boolean);
}
