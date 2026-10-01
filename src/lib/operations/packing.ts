import { formatPrice } from "../display";

/*
 * What a packing checklist means for an order: how many of each item went in the bag, what went in
 * instead of the rest at the same price, and what the shop didn't have. Nothing here touches the
 * database, so the service, the three order pages and the invoice all read a line the same way.
 */

/** An order line as stored, with what packing recorded on it. */
export type PackedLine = {
  name: string;
  label: string;
  quantity: number;
  pricePaise: number;
  linePaise: number;
  /** What the customer ordered; set once packing changed the line. */
  orderedQuantity?: number | null;
  /** Units that went in neither as ordered nor as a substitute. */
  unavailableQuantity?: number | null;
  /** What went in instead of some of the ordered units, at the ordered item's price. */
  substituteName?: string | null;
  substituteQuantity?: number | null;
};

/** One line of the packer's checklist. */
export type ChecklistEntry = {
  packedQuantity: number;
  missing: boolean;
  substitution?: string | null;
  /** How many went in as the substitute; left blank, all of the rest did. */
  substituteQuantity?: number | null;
};

export type LineDecision = {
  ordered: number;
  /** Units of the ordered item in the bag. */
  packed: number;
  unavailable: number;
  substituteName?: string;
  substituteQuantity: number;
  /** Fewer packed than ordered, and nothing said yet about the rest. */
  waiting: boolean;
  /** A contradiction the packer fixes before the checklist can be saved. */
  problem?: string;
};

export const orderedOf = (line: Pick<PackedLine, "quantity" | "orderedQuantity">) =>
  line.orderedQuantity ?? line.quantity;
/** Units of the ordered item itself in the bag: the stock this line still holds. */
export const packedOf = (line: PackedLine) =>
  orderedOf(line) - (line.unavailableQuantity ?? 0) - (line.substituteQuantity ?? 0);
/** Everything in the bag for this line, substitutes included. */
export const inBagOf = (line: PackedLine) => orderedOf(line) - (line.unavailableQuantity ?? 0);
/** Two packs of one product can be on an order, so the pack goes with the name. */
export const lineName = (line: Pick<PackedLine, "name" | "label">) =>
  line.label ? `${line.name} (${line.label})` : line.name;

/**
 * Cash is only taken at the door, so until then the bill can follow what was packed. Money paid
 * online is never touched here: any refund is made from the owner's Refunds page.
 */
export const billFollowsPacking = (order: { paymentMethod: string; paymentStatus: string }) =>
  order.paymentMethod === "cod" && order.paymentStatus === "pending";

/** The words for "none left", used on the checklist and in the messages that point at it. */
export const NONE_LEFT = "The rest isn’t available";
/** The checklist's count of substitutes, named in the messages that point at it. */
export const HOW_MANY = "How many went in instead";

/*
 * Notes packers typed in the old "Substitution" box to get past it: "none", "1 short", "out of
 * stock". They name no product, and a substitute is charged at the ordered item's price, so the
 * customer would pay for nothing and be told it was swapped.
 */
const PLACEHOLDERS = new Set([
  "none",
  "nothing",
  "nil",
  "na",
  "n a",
  "no",
  "not",
  "nahi",
  "nahin",
  "nahi hai",
  "short",
  "ok",
  "okay",
  "done",
  "same",
  "yes",
  "नाही",
  "नहीं",
]);
/** Words that say the item wasn't there, wherever they come; no product is called that. */
const SAYS_MISSING =
  /\b(out of stock|not available|unavailable|not in (the )?(stock|shop|store)|not there|not found|no stock|sold out|missing|none left|khatam|no substitut\w*|no replacement)\b/;
/** True for a note like "none" or "1 short" in the substitute box, rather than a product's name. */
export function notASubstitute(text: string) {
  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\p{M}]+/gu, " ")
    .trim();
  if ((words.match(/\p{L}/gu) ?? []).length < 2) return true;
  // "short", "1 short", "one short", "notebook short", "short by 1"
  return PLACEHOLDERS.has(words) || SAYS_MISSING.test(words) || /^(?:\p{L}+ )?short(?: by)?$/u.test(words);
}

/**
 * Reads one checklist line against the order. A short line needs a word about the rest: none left,
 * what went in instead, or both with a count (2 of 3 packed, 1 swapped and 1 not there at all).
 * Until then it is waiting, and nothing on the order changes.
 */
export function decideLine(line: PackedLine, entry: ChecklistEntry): LineDecision {
  const ordered = orderedOf(line);
  const packed = entry.packedQuantity;
  const rest = ordered - packed;
  const substitute = entry.substitution?.trim() ?? "";
  const count = entry.substituteQuantity ?? undefined;
  const name = lineName(line);
  const decision: LineDecision = { ordered, packed, unavailable: 0, substituteQuantity: 0, waiting: false };
  const check = (problem: string): LineDecision => ({ ...decision, problem: `Check ${name}: ${problem}` });
  if (packed > ordered)
    return { ...decision, problem: `Packed quantity for ${name} can’t be more than the ${ordered} ordered.` };
  if (rest === 0) {
    if (entry.missing)
      return check(
        `all ${ordered} are counted as packed, but “${NONE_LEFT}” is ticked. Enter how many you packed (0 if none), or untick it.`,
      );
    if (substitute || count)
      return check(
        `all ${ordered} are counted as packed, so there is nothing to substitute. Count only the ones of this exact item, or clear the substitute.`,
      );
    return decision;
  }
  if (substitute && notASubstitute(substitute))
    return check(
      entry.missing
        ? `“${substitute}” isn’t a substitute, and “${NONE_LEFT}” is already ticked. Clear the substitute box.`
        : `“${substitute}” isn’t a substitute. Tick “${NONE_LEFT}” instead, or name the product you packed.`,
    );
  if (!substitute) {
    if (count)
      return check(`${count} counted under “${HOW_MANY}”, but no substitute is named. Name what you packed, or clear the count.`);
    return entry.missing ? { ...decision, unavailable: rest } : { ...decision, waiting: true };
  }
  // all of the rest, unless a count says only some of it went in as the substitute
  const swapped = count ?? (entry.missing ? undefined : rest);
  if (swapped === undefined)
    return check(
      `say how many ${substitute} went in, under “${HOW_MANY}”. The others count as not available, as “${NONE_LEFT}” is ticked.`,
    );
  if (swapped === 0)
    return check(`“${HOW_MANY}” is 0. Enter how many ${substitute} you packed, or clear the substitute.`);
  if (swapped > rest)
    return check(`${swapped} went in instead, but only ${rest} of the ${ordered} ordered ${rest === 1 ? "wasn’t" : "weren’t"} packed.`);
  const left = rest - swapped;
  if (!left && entry.missing)
    return check(
      `${rest === 1 ? "the other one went" : `the other ${rest} all went`} in as ${substitute}, so none is left to be unavailable. Untick “${NONE_LEFT}”.`,
    );
  const swap = { ...decision, substituteName: substitute, substituteQuantity: swapped };
  if (!left) return swap;
  return entry.missing ? { ...swap, unavailable: left } : { ...swap, waiting: true };
}

/** "Gel pen (Blue): 1 of 2 packed", for lines still waiting for a word about the rest. */
export const waitingLabel = (line: PackedLine, decision: LineDecision) =>
  `${lineName(line)}: ${decision.packed} of ${decision.ordered} packed${
    decision.substituteQuantity ? `, ${decision.substituteQuantity} substituted` : ""
  }`;

/** Whether the order line already shows this decision: the order has followed its checklist. */
export const followsDecision = (line: PackedLine, decision: LineDecision) =>
  (line.unavailableQuantity ?? 0) === decision.unavailable &&
  (line.substituteQuantity ?? 0) === decision.substituteQuantity &&
  (line.substituteName ?? undefined) === decision.substituteName;

/**
 * A saved checklist read against the order under today's rules: the lines still to finish
 * (nothing said about the rest, a contradiction, or not counted), the waiting ones in the packer's
 * words, and the finished lines the order doesn't show yet. Those come from a checklist finished
 * before orders followed their packing; saving it once more brings the order in line.
 */
export function reviewChecklist(
  lines: (PackedLine & { variantId: unknown })[],
  entries: (ChecklistEntry & { variantId: unknown })[],
) {
  const open: string[] = [];
  const waiting: string[] = [];
  const behind: string[] = [];
  for (const line of lines) {
    const entry = entries.find((e) => String(e.variantId) === String(line.variantId));
    const decision = entry && decideLine(line, entry);
    if (!decision || decision.problem || decision.waiting) {
      open.push(lineName(line));
      if (decision?.waiting) waiting.push(waitingLabel(line, decision));
    } else if (!followsDecision(line, decision)) behind.push(lineName(line));
  }
  return { open, waiting, behind };
}

export type OfferTerms = {
  discountType: "fixed" | "percentage";
  discountValue: number;
  maximumDiscountPaise?: number | null;
};

/**
 * The offer on a smaller bill. It never grows past what the customer got at checkout, nor past the
 * new subtotal. A percentage is worked out again on what was packed; a fixed saving stays whole.
 * The missing items are the shop's shortfall, so the offer stays even if the bill drops under its
 * minimum. Without the offer's terms it shrinks in step with the bill.
 */
export function offerAfterPacking({
  discountPaise,
  subtotalPaise,
  packedSubtotalPaise,
  terms,
}: {
  /** The saving the customer got at checkout. */
  discountPaise: number;
  /** The subtotal as ordered. */
  subtotalPaise: number;
  packedSubtotalPaise: number;
  terms?: OfferTerms | null;
}) {
  if (discountPaise <= 0 || packedSubtotalPaise <= 0) return 0;
  let discount: number;
  if (terms?.discountType === "percentage") {
    discount = Math.floor((packedSubtotalPaise * terms.discountValue) / 100);
    if (terms.maximumDiscountPaise) discount = Math.min(discount, terms.maximumDiscountPaise);
  } else if (terms?.discountType === "fixed") discount = discountPaise;
  else
    discount =
      subtotalPaise > 0 ? Math.floor((discountPaise * packedSubtotalPaise) / subtotalPaise) : 0;
  return Math.max(0, Math.min(discount, discountPaise, packedSubtotalPaise));
}

export type RepricedLine = {
  quantity: number;
  linePaise: number;
};

/**
 * The bill for what was packed: each line charged for what went in the bag (a substitute at the
 * ordered item's price), the offer worked out again, and the delivery fee as it was.
 */
export function billForPacking({
  lines,
  decisions,
  deliveryPaise,
  discountPaise,
  terms,
}: {
  lines: Pick<PackedLine, "pricePaise" | "quantity" | "orderedQuantity">[];
  decisions: Pick<LineDecision, "unavailable">[];
  deliveryPaise: number;
  /** The saving the customer got at checkout. */
  discountPaise: number;
  terms?: OfferTerms | null;
}) {
  const repriced: RepricedLine[] = lines.map((line, index) => {
    const quantity = orderedOf(line) - decisions[index].unavailable;
    return { quantity, linePaise: quantity * line.pricePaise };
  });
  const subtotalPaise = lines.reduce((sum, line) => sum + orderedOf(line) * line.pricePaise, 0);
  const packedSubtotalPaise = repriced.reduce((sum, line) => sum + line.linePaise, 0);
  const promotionDiscountPaise = offerAfterPacking({
    discountPaise,
    subtotalPaise,
    packedSubtotalPaise,
    terms,
  });
  return {
    lines: repriced,
    subtotalPaise: packedSubtotalPaise,
    promotionDiscountPaise,
    totalPaise: packedSubtotalPaise - promotionDiscountPaise + deliveryPaise,
  };
}

/**
 * What packing changed on a line, in the words the customer, the rider and staff all see.
 * `charged` is false for an order paid online: its bill stays as paid, and the refund note sits
 * with the order instead.
 */
export function lineNotes(line: PackedLine, charged: boolean) {
  const ordered = orderedOf(line);
  const unavailable = line.unavailableQuantity ?? 0;
  const swapped = line.substituteQuantity ?? 0;
  const notes: string[] = [];
  if (unavailable > 0) {
    const what = charged ? "Not available – not charged" : "Not available";
    notes.push(
      unavailable === ordered
        ? what
        : `${unavailable} of ${ordered} ${charged ? "not available – not charged" : "not available"}`,
    );
  }
  if (swapped > 0 && line.substituteName)
    notes.push(
      swapped === ordered
        ? `Substituted with ${line.substituteName} (same price)`
        : `${swapped} of ${ordered} substituted with ${line.substituteName} (same price)`,
    );
  return notes;
}

/** True once packing left any mark on the order's lines. */
export const packingChanged = (lines: PackedLine[]) =>
  lines.some((line) => (line.unavailableQuantity ?? 0) > 0 || (line.substituteQuantity ?? 0) > 0);

/** Up to `room` characters of a list, then "and N more", so a long school list still fits a message. */
function listWithin(items: string[], room: number) {
  const shown: string[] = [];
  let used = 0;
  for (const [index, item] of items.entries()) {
    const left = items.length - index - 1;
    const tail = left ? `, and ${left} more` : "";
    if (shown.length && used + item.length + 2 + tail.length > room)
      return `${shown.join(", ")}, and ${items.length - shown.length} more`;
    shown.push(item);
    used += item.length + 2;
  }
  return shown.join(", ");
}

/**
 * The customer's message after packing: what wasn't available, what was swapped, and what they
 * pay now. For an order paid online nothing about the payment changes, so it says the store
 * arranges the refund; the money itself is only moved from the Refunds page.
 */
export function packingMessage({
  number,
  lines,
  charged,
  totalPaise,
  originalTotalPaise,
  shortfallPaise,
}: {
  number: string;
  lines: PackedLine[];
  charged: boolean;
  totalPaise: number;
  originalTotalPaise?: number | null;
  shortfallPaise?: number | null;
}) {
  if (!packingChanged(lines))
    return {
      title: "Your order is packed in full",
      body: `${number}: everything you ordered is packed after all.${
        charged ? ` Your total is back to ${formatPrice(totalPaise)}.` : ""
      }`,
    };
  const missing = lines
    .filter((line) => (line.unavailableQuantity ?? 0) > 0)
    .map((line) => `${line.unavailableQuantity} × ${lineName(line)}`);
  const swapped = lines
    .filter((line) => (line.substituteQuantity ?? 0) > 0 && line.substituteName)
    .map((line) => `${line.substituteName} for ${line.substituteQuantity} × ${lineName(line)}`);
  const money = charged
    ? originalTotalPaise && originalTotalPaise !== totalPaise
      ? ` Your new total is ${formatPrice(totalPaise)} (was ${formatPrice(originalTotalPaise)}), to pay in cash on delivery.`
      : ` Your total stays ${formatPrice(totalPaise)}.`
    : shortfallPaise
      ? ` You paid online, so the store will arrange a refund of ${formatPrice(shortfallPaise)} for what wasn’t available.`
      : "";
  const missingLead = `${charged ? "Not available – not charged" : "Not available"}: `;
  const swappedLead = "Substituted at the same price: ";
  // a message is cut at 500 characters, so the lists share what the rest of it leaves
  const fixed =
    `${number}: `.length +
    money.length +
    (missing.length ? missingLead.length + 1 : 0) +
    (swapped.length ? swappedLead.length + 2 : 0);
  const room = Math.max(60, 500 - fixed);
  const share = missing.length && swapped.length ? Math.floor(room / 2) : room;
  const parts = [
    missing.length ? `${missingLead}${listWithin(missing, share)}.` : "",
    swapped.length ? `${swappedLead}${listWithin(swapped, share)}.` : "",
  ].filter(Boolean);
  return {
    title: missing.length
      ? "Some items weren’t available"
      : swapped.length === 1
        ? "An item in your order was swapped"
        : "Some items in your order were swapped",
    body: `${number}: ${parts.join(" ")}${money}`,
  };
}

/**
 * Where the refund for items that weren't packed stands on an order paid online, read from the
 * order's refunds (nothing here moves money): still owed, under way on the Refunds page, or made.
 * Null when nothing is owed.
 */
export function shortfallRefund(
  shortfallPaise: number | null | undefined,
  refunds: { amountPaise: number; status: string }[],
) {
  if (!shortfallPaise || shortfallPaise <= 0) return null;
  const total = (...statuses: string[]) =>
    refunds
      .filter((refund) => statuses.includes(refund.status))
      .reduce((sum, refund) => sum + refund.amountPaise, 0);
  if (total("processed") >= shortfallPaise) return "refunded";
  if (total("processed", "requested", "processing") >= shortfallPaise) return "under-way";
  return "owed";
}

/**
 * What the owners hear when packing changes what an online payment over-covers. Only they can
 * refund, and the customer has been promised one, so it mustn't wait on the packer passing it on.
 * Null when what is owed hasn't changed.
 */
export function refundOwedNotice({
  number,
  lines,
  shortfallPaise,
  previousPaise,
}: {
  number: string;
  lines: PackedLine[];
  shortfallPaise?: number | null;
  previousPaise?: number | null;
}) {
  const owed = shortfallPaise ?? 0;
  const before = previousPaise ?? 0;
  if (owed === before) return null;
  if (owed <= 0)
    return {
      title: `${number}: no refund owed after all`,
      body: `${number} is packed in full after all, so the ${formatPrice(before)} for items that weren’t packed isn’t owed back to the customer.`,
    };
  const missing = lines
    .filter((line) => (line.unavailableQuantity ?? 0) > 0)
    .map((line) => `${line.unavailableQuantity} × ${lineName(line)}`);
  return {
    title: `${number}: ${formatPrice(owed)} to refund`,
    body: `${number} was paid online, and ${formatPrice(owed)} of it is for items that weren’t packed${
      missing.length ? `: ${listWithin(missing, 240)}` : ""
    }.${before > 0 ? ` That replaces the ${formatPrice(before)} from the last save.` : ""} The customer was told the store will refund it: make the refund from the Refunds page.`,
  };
}
