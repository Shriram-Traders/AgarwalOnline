"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { MutationState } from "../commerce/actions";
import { currentUser, requirePermission } from "../auth/session";
import { guestCartLines } from "../commerce/guest-cart";
import { cartFor } from "../commerce/service";
import { codeProblem, quoteCart } from "./service";
import { Promotion, PromotionRedemption } from "./models";
import { AuditLog } from "../db/models";
import { formWithPaise, paiseFromRupees } from "../display";
import { plainMessage } from "../form-errors";
import { log } from "../logger";

const PROMOTION_COOKIE = "ags_promotion";

export async function applyPromotionAction(
  _state: MutationState,
  form: FormData,
): Promise<MutationState> {
  try {
    const code = z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9-]{3,24}$/)
      .parse(form.get("code"));
    const user = await currentUser();
    const lines =
      user ? await cartFor(user.id) : await guestCartLines();
    const quote = await quoteCart(lines, { code, customerId: user?.id });
    if (quote.rejectedCodeReason)
      return {
        // say exactly what stands in the way (spelling, ended, used, basket too small)
        error:
          (await codeProblem(code, quote.merchandiseSubtotalPaise, user?.id)) ??
          quote.rejectedCodeReason,
      };
    (await cookies()).set(PROMOTION_COOKIE, code, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 24 * 60 * 60,
    });
    revalidatePath("/cart");
    revalidatePath("/checkout");
    // one offer per order: a bigger automatic saving wins over the code
    if (quote.appliedPromotion && quote.appliedPromotion.code !== code)
      return {
        success: `Code saved, but ${quote.appliedPromotion.name} saves you more on this basket, so that is applied instead.`,
      };
    return { success: `${quote.appliedPromotion?.name ?? code} applied.` };
  } catch {
    return { error: "Enter a valid offer code." };
  }
}

/** Takes a typed offer code off the basket. */
export async function removePromotionAction(): Promise<MutationState> {
  (await cookies()).delete(PROMOTION_COOKIE);
  revalidatePath("/cart");
  revalidatePath("/checkout");
  return { success: "Offer code removed." };
}

/** Offer fields shared by create and edit, with the rules that stop a typo giving goods away. */
const offerFields = z
  .object({
    name: z.string().trim().min(3).max(80),
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9-]{3,24}$/, "Codes use 3 to 24 letters, numbers or dashes, like LOCAL10.")
      .optional(),
    kind: z.enum(["automatic", "code"]),
    discountType: z.enum(["fixed", "percentage"]),
    discountValue: z.coerce
      .number({ message: "Discount must be a number." })
      .int("Use a whole number for the discount, like 10.")
      .min(1),
    minimumSubtotalPaise: z.coerce.number().int().min(0),
    maximumDiscountPaise: z.coerce.number().int().min(0).optional(),
    perCustomerLimit: z.coerce.number().int().min(1).max(100).default(1),
    globalLimit: z.coerce.number().int().min(1).max(1000000).optional(),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
  })
  .refine((value) => value.endsAt > value.startsAt, {
    message: "End date must be after the start date.",
    path: ["endsAt"],
  })
  .refine((value) => value.kind !== "code" || Boolean(value.code), {
    message: "Coupon offers need a code.",
    path: ["code"],
  })
  .refine((value) => value.discountType !== "percentage" || value.discountValue <= 90, {
    message: "A percentage offer can be at most 90% off.",
    path: ["discountValue"],
  })
  .refine((value) => value.discountType !== "fixed" || value.discountValue <= 1000000, {
    message: "A fixed saving can be at most ₹10,000.",
    path: ["discountValue"],
  })
  .refine(
    (value) =>
      value.discountType !== "fixed" ||
      !value.minimumSubtotalPaise ||
      value.discountValue < value.minimumSubtotalPaise,
    {
      message: "The saving must be less than the smallest basket, or every qualifying basket is free.",
      path: ["discountValue"],
    },
  );
function offerInput(form: FormData) {
  const blank = (key: string) => (String(form.get(key) ?? "").trim() ? form.get(key) : undefined);
  return offerFields.parse({
    ...formWithPaise(form),
    code: blank("code") ?? undefined,
    // one field serves both kinds: a percentage, or a fixed amount typed in rupees
    discountValue:
      form.get("discountType") === "fixed"
        ? paiseFromRupees(form.get("discountValue"))
        : form.get("discountValue"),
    maximumDiscountPaise: paiseFromRupees(form.get("maximumDiscountRupees")) || undefined,
    perCustomerLimit: blank("perCustomerLimit") ?? 1,
    globalLimit: blank("globalLimit"),
    // the form sends the store's local time with no zone; the server clock is UTC
    startsAt: `${form.get("startsAt")}:00+05:30`,
    endsAt: `${form.get("endsAt")}:00+05:30`,
  });
}
const promotionId = z.string().regex(/^[a-f\d]{24}$/i, "This offer no longer exists.");

export async function promotionAdminAction(
  _state: MutationState,
  form: FormData,
): Promise<MutationState> {
  try {
    const actor = await requirePermission("promotion:write");
    const operation = z
      .enum(["create", "update", "toggle", "delete"])
      .catch("create")
      .parse(form.get("operation"));
    let success = "";
    if (operation === "toggle" || operation === "delete") {
      const id = promotionId.parse(form.get("promotionId"));
      const promotion = await Promotion.findById(id);
      if (!promotion) throw new Error("This offer no longer exists.");
      if (operation === "delete") {
        // orders keep a copy of the offer they used, but the count of uses lives here
        if (await PromotionRedemption.exists({ promotionId: id }))
          throw new Error("People have used this offer, so it can’t be deleted. Pause it instead.");
        await Promotion.deleteOne({ _id: id });
        await AuditLog.create({
          actorId: actor.id,
          action: "promotion.delete",
          target: id,
          details: { name: promotion.name, code: promotion.code },
        });
        success = "Offer deleted.";
      } else {
        const before = promotion.active;
        promotion.active = !promotion.active;
        promotion.updatedBy = actor.id;
        await promotion.save();
        await AuditLog.create({
          actorId: actor.id,
          action: promotion.active ? "promotion.publish" : "promotion.pause",
          target: id,
          details: { before, after: promotion.active },
        });
        success = promotion.active ? "Offer switched on." : "Offer paused.";
      }
    } else {
      const data = offerInput(form);
      const fields = {
        ...data,
        code: data.kind === "code" ? data.code : undefined,
        active: form.get("active") === "on",
        welcome: data.kind === "code" && form.get("welcome") === "on",
        // automatic savings are always shown; only a coupon code can be kept private
        listed: data.kind !== "code" || form.get("listed") === "on",
        updatedBy: actor.id,
      };
      if (operation === "create") {
        const promotion = await Promotion.create({ ...fields, createdBy: actor.id });
        if (fields.welcome)
          await Promotion.updateMany({ _id: { $ne: promotion._id } }, { $set: { welcome: false } });
        await AuditLog.create({
          actorId: actor.id,
          action: "promotion.create",
          target: String(promotion._id),
          details: { name: promotion.name, kind: promotion.kind, active: promotion.active },
        });
        success = fields.active ? "Offer created and switched on." : "Offer created. Switch it on when you are ready.";
      } else {
        const id = promotionId.parse(form.get("promotionId"));
        const promotion = await Promotion.findById(id);
        if (!promotion) throw new Error("This offer no longer exists.");
        const before = promotion.toObject();
        promotion.set({
          ...fields,
          ...(fields.code ? {} : { code: undefined }),
          globalLimit: data.globalLimit ?? undefined,
          maximumDiscountPaise: data.maximumDiscountPaise ?? undefined,
        });
        await promotion.save();
        if (fields.welcome)
          await Promotion.updateMany({ _id: { $ne: promotion._id } }, { $set: { welcome: false } });
        await AuditLog.create({
          actorId: actor.id,
          action: "promotion.update",
          target: id,
          details: { before, after: promotion.toObject() },
        });
        success = "Offer saved.";
      }
    }
    revalidatePath("/super-admin/promotions");
    revalidatePath("/", "layout");
    return { success };
  } catch (error) {
    if (error instanceof z.ZodError) return { error: plainMessage(error) };
    const message = error instanceof Error ? error.message : "";
    if (/duplicate key/i.test(message))
      return { error: "Another offer already uses this code. Pick a different code." };
    if (/^(This offer|People have used)/.test(message)) return { error: message };
    log("error", "promotions.unexpected-error", { error });
    return { error: "Unable to save this offer." };
  }
}
