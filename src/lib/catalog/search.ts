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
  ["gift", "present", "bhet", "भेट"],
  ["card", "greeting", "शुभेच्छापत्र"],
  ["rice", "chawal", "chaval", "तांदूळ", "tandul"],
  ["milk", "doodh", "dudh", "दूध"],
  ["tea", "chai", "चहा"],
  ["atta", "aata", "flour", "पीठ"],
  ["salt", "namak", "मीठ"],
  ["oil", "tel", "तेल"],
];
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
