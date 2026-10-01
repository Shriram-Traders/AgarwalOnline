import mongoose, { type ClientSession } from "mongoose";
import { connectDB } from "../db/connect";
import { formatPrice } from "../display";
import { Promotion, PromotionRedemption } from "./models";

export type PriceQuote = {
  merchandiseSubtotalPaise: number;
  merchandiseSavingsPaise: number;
  promotionDiscountPaise: number;
  deliveryPaise: number;
  totalPaise: number;
  appliedPromotion?: { id: string; name: string; code?: string };
  rejectedCodeReason?: string;
};

type PricedLine = {
  pricePaise: number;
  mrpPaise?: number;
  quantity: number;
};

function promotionDiscount(
  promotion: {
    discountType: "fixed" | "percentage";
    discountValue: number;
    maximumDiscountPaise?: number;
  },
  subtotal: number,
) {
  const calculated =
    promotion.discountType === "fixed"
      ? promotion.discountValue
      : Math.floor((subtotal * promotion.discountValue) / 100);
  return Math.max(
    0,
    Math.min(
      subtotal,
      promotion.maximumDiscountPaise
        ? Math.min(calculated, promotion.maximumDiscountPaise)
        : calculated,
    ),
  );
}

export async function bestPromotion(
  subtotal: number,
  code?: string,
  customerId?: string,
  session?: ClientSession,
) {
  await connectDB();
  const now = new Date();
  const requestedCode = code?.trim().toUpperCase();
  const query = Promotion.find({
    active: true,
    startsAt: { $lte: now },
    endsAt: { $gte: now },
    minimumSubtotalPaise: { $lte: subtotal },
    $and: [
      {
        $or: [
          { globalLimit: { $exists: false } },
          { $expr: { $lt: ["$redemptionCount", "$globalLimit"] } },
        ],
      },
      requestedCode
        ? { $or: [{ kind: "automatic" }, { kind: "code", code: requestedCode }] }
        : { kind: "automatic" },
    ],
  });
  if (session) query.session(session);
  let promotions = await query;
  if (customerId && promotions.length) {
    const countQuery = PromotionRedemption.aggregate([
      {
        $match: {
          customerId: new (await import("mongoose")).default.Types.ObjectId(
            customerId,
          ),
          promotionId: { $in: promotions.map((item) => item._id) },
        },
      },
      { $group: { _id: "$promotionId", count: { $sum: 1 } } },
    ]);
    if (session) countQuery.session(session);
    const counts = await countQuery;
    promotions = promotions.filter((promotion) => {
      const used = counts.find(
        (item) => String(item._id) === String(promotion._id),
      )?.count;
      return (used ?? 0) < promotion.perCustomerLimit;
    });
  }
  const ranked = promotions
    .map((promotion) => ({
      promotion,
      discountPaise: promotionDiscount(promotion, subtotal),
    }))
    .sort((a, b) => b.discountPaise - a.discountPaise);
  const selected = ranked[0];
  const matchedCode = requestedCode
    ? promotions.some(
        (promotion) =>
          promotion.kind === "code" && promotion.code === requestedCode,
      )
    : true;
  return {
    selected,
    rejectedCodeReason:
      requestedCode && !matchedCode
        ? "That code is invalid, expired, already used, or needs a larger basket."
        : undefined,
  };
}

type SavingFields = {
  discountType: "fixed" | "percentage";
  discountValue: number;
  maximumDiscountPaise?: number;
};

/** "10% off, up to ₹100" or "₹50 off", as shoppers read it. */
export function offerSaving(offer: SavingFields, locale: "en" | "mr" = "en") {
  const off = locale === "mr" ? "सूट" : "off";
  // a cap only changes a fixed saving when it is smaller, and then the cap is the saving
  if (offer.discountType === "fixed")
    return `${formatPrice(Math.min(offer.discountValue, offer.maximumDiscountPaise || offer.discountValue))} ${off}`;
  const cap = offer.maximumDiscountPaise ? formatPrice(offer.maximumDiscountPaise) : "";
  if (!cap) return `${offer.discountValue}% ${off}`;
  return locale === "mr" ? `${offer.discountValue}% ${off}, ${cap} पर्यंत` : `${offer.discountValue}% ${off}, up to ${cap}`;
}

export type ShopOffer = SavingFields & {
  id: string;
  name: string;
  /** Missing for savings that apply by themselves. */
  code?: string;
  minimumSubtotalPaise: number;
  perCustomerLimit: number;
  endsAt: Date;
  /** applied: on this basket now; ready: can be used; short: the basket is too small; used: this shopper used it up. */
  state: "applied" | "ready" | "short" | "used";
  /** How much more to add, for "short". */
  shortfallPaise: number;
  /** What it takes off this basket, for "applied" and "ready". */
  savePaise: number;
};

async function redemptionCounts(customerId: string | undefined, promotionIds: unknown[]) {
  const used = new Map<string, number>();
  if (!customerId || !promotionIds.length) return used;
  const counts = await PromotionRedemption.aggregate([
    {
      $match: {
        customerId: new mongoose.Types.ObjectId(customerId),
        promotionId: { $in: promotionIds },
      },
    },
    { $group: { _id: "$promotionId", count: { $sum: 1 } } },
  ]);
  for (const item of counts) used.set(String(item._id), item.count);
  return used;
}

/**
 * The shop's own offers for the basket page: savings that apply by themselves, and the coupon
 * codes the owner chose to list. Private codes (listed off) are left out; they still work when typed.
 */
export async function shopOffers(
  subtotal: number,
  options: { customerId?: string; appliedId?: string } = {},
): Promise<ShopOffer[]> {
  await connectDB();
  const now = new Date();
  const promotions = await Promotion.find({
    active: true,
    startsAt: { $lte: now },
    endsAt: { $gte: now },
    $and: [
      {
        $or: [
          { kind: "automatic" },
          { kind: "code", code: { $type: "string" }, listed: { $ne: false } },
        ],
      },
      {
        $or: [
          { globalLimit: { $exists: false } },
          { $expr: { $lt: ["$redemptionCount", "$globalLimit"] } },
        ],
      },
    ],
  })
    .sort({ endsAt: 1 })
    .limit(20);
  const used = await redemptionCounts(
    options.customerId,
    promotions.map((promotion) => promotion._id),
  );
  const rank = { applied: 0, ready: 1, short: 2, used: 3 };
  return promotions
    .map((promotion): ShopOffer => {
      const id = String(promotion._id);
      const shortfallPaise = Math.max(0, promotion.minimumSubtotalPaise - subtotal);
      const state =
        id === options.appliedId
          ? "applied"
          : (used.get(id) ?? 0) >= promotion.perCustomerLimit
            ? "used"
            : shortfallPaise > 0
              ? "short"
              : "ready";
      return {
        id,
        name: promotion.name,
        code: promotion.code || undefined,
        discountType: promotion.discountType,
        discountValue: promotion.discountValue,
        maximumDiscountPaise: promotion.maximumDiscountPaise || undefined,
        minimumSubtotalPaise: promotion.minimumSubtotalPaise,
        perCustomerLimit: promotion.perCustomerLimit,
        endsAt: promotion.endsAt,
        state,
        shortfallPaise,
        savePaise:
          state === "applied" || state === "ready" ? promotionDiscount(promotion, subtotal) : 0,
      };
    })
    .sort(
      (a, b) =>
        rank[a.state] - rank[b.state] ||
        b.savePaise - a.savePaise ||
        a.shortfallPaise - b.shortfallPaise,
    );
}

/**
 * Why a typed code can't be used on this basket, in words the shopper can act on, or null when it
 * can. The checkout check stays in bestPromotion; this only explains its answer.
 */
export async function codeProblem(code: string, subtotal: number, customerId?: string) {
  await connectDB();
  const now = new Date();
  const promotion = await Promotion.findOne({ kind: "code", code: code.trim().toUpperCase() });
  if (!promotion) return "We don’t have an offer with this code. Please check the spelling.";
  if (!promotion.active || promotion.startsAt > now) return "This offer isn’t running right now.";
  if (promotion.endsAt < now) return "This offer has ended.";
  if (promotion.globalLimit && promotion.redemptionCount >= promotion.globalLimit)
    return "This offer has been fully claimed.";
  const used = (await redemptionCounts(customerId, [promotion._id])).get(String(promotion._id)) ?? 0;
  if (used >= promotion.perCustomerLimit)
    return promotion.perCustomerLimit === 1
      ? "You’ve already used this code."
      : `You’ve already used this code ${promotion.perCustomerLimit} times, the most allowed.`;
  if (subtotal < promotion.minimumSubtotalPaise)
    return `This code is for baskets of ${formatPrice(promotion.minimumSubtotalPaise)} or more. Add ${formatPrice(promotion.minimumSubtotalPaise - subtotal)} more to use it.`;
  return null;
}

/**
 * An order that is cancelled (by the customer or the store) gives its offer back, so a
 * once-per-customer code can be used again on the next order.
 */
export async function returnOffer(orderId: unknown, session: ClientSession) {
  const redemption = await PromotionRedemption.findOneAndDelete({ orderId }, { session });
  if (redemption)
    await Promotion.updateOne(
      { _id: redemption.promotionId, redemptionCount: { $gte: 1 } },
      { $inc: { redemptionCount: -1 } },
      { session },
    );
  return Boolean(redemption);
}

export async function quoteCart(
  lines: PricedLine[],
  options: {
    code?: string;
    customerId?: string;
    deliveryPaise?: number;
  } = {},
): Promise<PriceQuote> {
  const subtotal = lines.reduce(
    (sum, line) => sum + line.pricePaise * line.quantity,
    0,
  );
  const merchandiseSavingsPaise = lines.reduce(
    (sum, line) =>
      sum + Math.max(0, (line.mrpPaise ?? line.pricePaise) - line.pricePaise) * line.quantity,
    0,
  );
  const { selected, rejectedCodeReason } = await bestPromotion(
    subtotal,
    options.code,
    options.customerId,
  );
  const promotionDiscountPaise = selected?.discountPaise ?? 0;
  const deliveryPaise = options.deliveryPaise ?? 0;
  return {
    merchandiseSubtotalPaise: subtotal,
    merchandiseSavingsPaise,
    promotionDiscountPaise,
    deliveryPaise,
    totalPaise: subtotal - promotionDiscountPaise + deliveryPaise,
    ...(selected
      ? {
          appliedPromotion: {
            id: String(selected.promotion._id),
            name: selected.promotion.name,
            code: selected.promotion.code,
          },
        }
      : {}),
    rejectedCodeReason,
  };
}
