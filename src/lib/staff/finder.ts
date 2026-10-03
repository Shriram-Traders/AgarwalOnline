import { hasPermission, type Role } from "@/lib/auth/permissions";
import type { Locale } from "@/lib/locale-types";
import { normalizeSearch, singular } from "@/lib/catalog/search";
import { staffCopy } from "./copy";
import { navFor } from "./nav";
import { FINDER_INDEX, type FinderEntry, type FinderKind } from "./search-index";

export type FinderGroupKind = "record" | FinderKind | "goto";
export type FinderHit = { id: string; kind: FinderGroupKind; title: string; hint?: string; href: string };
export type FinderGroup = { kind: FinderGroupKind; hits: FinderHit[] };

const PER_GROUP = 5;
const TOTAL = 12;

/** Order numbers look like AGS-20261003-00012; people often type only the start. */
const ORDER_NUMBER = /^ags[-\s]?\d{2,8}(-\d{0,5})?$/i;

/**
 * "Orders matching…" and "Customers matching…" for whatever was typed. They lead when the text
 * looks like an order number or a phone number; otherwise they're offered only when nothing else matched.
 */
export function recordShortcuts(query: string, roles: readonly Role[], locale: Locale) {
  const raw = query.trim().slice(0, 60);
  if (raw.length < 2 || !hasPermission(roles, "order:manage")) return { priority: false, hits: [] as FinderHit[] };
  const text = staffCopy[locale].search;
  const digits = raw.replace(/^\+91[\s-]*/, "").replace(/[\s-]/g, "");
  const isOrder = ORDER_NUMBER.test(raw);
  const isPhone = /^\d{4,10}$/.test(digits);
  const term = isPhone ? digits : raw;
  const orders: FinderHit = {
    id: "record.orders",
    kind: "record",
    title: text.ordersMatching(term),
    hint: text.ordersHint,
    href: `/admin?q=${encodeURIComponent(isOrder ? raw.toUpperCase() : term)}#orders`,
  };
  const customers: FinderHit = {
    id: "record.customers",
    kind: "record",
    title: text.customersMatching(term),
    hint: text.customersHint,
    href: `/admin/customers?q=${encodeURIComponent(term)}`,
  };
  return { priority: isOrder || isPhone, hits: isOrder ? [orders] : [orders, customers] };
}

type Prepared = { entry: FinderEntry; title: string; words: string[]; titleWords: string[]; rest: string };
let prepared: Prepared[] | null = null;
/** Normalised once per page load: the index never changes while the app runs. */
function index() {
  prepared ??= FINDER_INDEX.map((entry) => {
    const title = normalizeSearch(`${entry.title.en} ${entry.title.mr}`);
    const rest = normalizeSearch(
      [entry.hint?.en, entry.hint?.mr, ...entry.keywords, ...entry.keywordsMr].filter(Boolean).join(" "),
    );
    return { entry, title, rest, titleWords: title.split(" "), words: rest.split(" ") };
  });
  return prepared;
}

/** Edits (add, drop, swap or change a letter) between two words, stopping once it passes 1. */
function withinOneEdit(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 1) return false;
  const rows = [Array.from({ length: b.length + 1 }, (_, j) => j)];
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(rows[i - 1][j] + 1, row[j - 1] + 1, rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) row[j] = Math.min(row[j], rows[i - 2][j - 2] + 1);
    }
    rows.push(row);
  }
  return rows[a.length][b.length] <= 1;
}
/** A near-miss spelling of a whole word, or of the start of one ("delivry", "coupn", "delivr"). */
function nearWord(word: string, tokens: string[]) {
  if ([...word].length < 4) return false;
  return tokens.some(
    (token) => withinOneEdit(word, token) || (token.length > word.length && withinOneEdit(word, token.slice(0, word.length))),
  );
}

/**
 * How well one typed word fits an entry: whole word in the title is best. Near-miss spellings
 * only count in the second pass, when nothing matched as typed.
 */
function wordScore(item: Prepared, word: string, forgiving: boolean) {
  const base = singular(word);
  const forms = base === word ? [word] : [word, base];
  let best = 0;
  for (const form of forms) {
    if (item.titleWords.includes(form)) best = Math.max(best, 8);
    else if (item.titleWords.some((token) => token.startsWith(form))) best = Math.max(best, 6);
    else if (item.title.includes(form)) best = Math.max(best, 4);
    // a keyword typed in full ("cod", "gst") outranks a title word that merely starts the same ("codes")
    if (item.words.includes(form)) best = Math.max(best, 7);
    else if (item.words.some((token) => token.startsWith(form))) best = Math.max(best, 3);
    else if (item.rest.includes(form)) best = Math.max(best, 2);
  }
  if (!best && forgiving) {
    if (nearWord(word, item.titleWords)) best = 2;
    else if (nearWord(word, item.words)) best = 1;
  }
  return best;
}

function rank(items: Prepared[], words: string[], forgiving: boolean) {
  const phrase = words.join(" ");
  return items
    .map((item) => {
      let score = 0;
      for (const word of words) {
        const fit = wordScore(item, word, forgiving);
        if (!fit) return null;
        score += fit;
      }
      // the whole phrase in the title beats the same words scattered across keywords
      if (words.length > 1 && item.title.includes(phrase)) score += 6;
      return { item, score };
    })
    .filter((row): row is { item: Prepared; score: number } => row !== null)
    .sort((a, b) => b.score - a.score);
}

/**
 * The workspace search: settings, actions and pages this person may open, best match first,
 * plus the order and customer shortcuts. An empty query lists their main pages.
 */
export function findInWorkspace(
  query: string,
  { roles, locale }: { roles: readonly Role[]; locale: Locale },
): FinderGroup[] {
  const words = normalizeSearch(query).split(" ").filter(Boolean).slice(0, 6);
  const allowed = index().filter((item) => hasPermission(roles, item.entry.permission));
  const toHit = (entry: FinderEntry, kind: FinderGroupKind = entry.kind): FinderHit => ({
    id: entry.id,
    kind,
    title: entry.title[locale],
    hint: entry.hint?.[locale],
    href: entry.href,
  });
  if (!words.length) {
    const ids = new Set(
      navFor(roles)
        .flatMap((group) => group.items)
        .slice(0, 6)
        .map((item) => `page.${item.key}`),
    );
    const hits = allowed.filter((item) => ids.has(item.entry.id)).map((item) => toHit(item.entry, "goto"));
    return hits.length ? [{ kind: "goto", hits }] : [];
  }
  const exact = rank(allowed, words, false);
  const scored = exact.length ? exact : rank(allowed, words, true);
  const shortcuts = recordShortcuts(query, roles, locale);
  const groups: FinderGroup[] = [];
  let room = TOTAL - shortcuts.hits.length;
  if (shortcuts.priority) groups.push({ kind: "record", hits: shortcuts.hits });
  for (const kind of ["setting", "action", "page"] as const) {
    const hits = scored
      .filter((row) => row.item.entry.kind === kind)
      .slice(0, Math.min(PER_GROUP, Math.max(room, 0)))
      .map((row) => toHit(row.item.entry));
    room -= hits.length;
    if (hits.length) groups.push({ kind, hits });
  }
  // a name like "priya" matches no setting: then it's probably a customer or an order
  if (!shortcuts.priority && !groups.length && shortcuts.hits.length) groups.push({ kind: "record", hits: shortcuts.hits });
  return groups;
}
