"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { MutationState } from "../commerce/actions";
import { currentUser, requirePermission } from "../auth/session";
import { guestCartLines } from "../commerce/guest-cart";
import { cartFor } from "../commerce/service";
import { quoteCart } from "./service";
import { Promotion } from "./models";
import { AuditLog } from "../db/models";
import { formWithPaise, paiseFromRupees } from "../display";
import { plainMessage } from "../form-errors";

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
    if (quote.rejectedCodeReason) return { error: quote.rejectedCodeReason };
    (await cookies()).set(PROMOTION_COOKIE, code, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 24 * 60 * 60,
    });
    revalidatePath("/cart");
    revalidatePath("/checkout");
    return { success: `${quote.appliedPromotion?.name ?? code} applied.` };
  } catch {
    return { error: "Enter a valid offer code." };
  }
}

export async function promotionAdminAction(
  _state: MutationState,
  form: FormData,
): Promise<MutationState> {
  try {
    const actor = await requirePermission("promotion:write");
    const operation = z
      .enum(["create", "toggle"])
      .catch("create")
      .parse(form.get("operation"));
    if (operation === "toggle") {
      const promotionId = z
        .string()
        .regex(/^[a-f\d]{24}$/i)
        .parse(form.get("promotionId"));
      const promotion = await Promotion.findById(promotionId);
      if (!promotion) throw new Error("Promotion not found.");
      const before = promotion.active;
      promotion.active = !promotion.active;
      promotion.updatedBy = actor.id;
      await promotion.save();
      await AuditLog.create({
        actorId: actor.id,
        action: promotion.active ? "promotion.publish" : "promotion.pause",
        target: promotionId,
        details: { before, after: promotion.active },
      });
      revalidatePath("/super-admin/promotions");
      revalidatePath("/");
      return {
        success: promotion.active
          ? "Promotion published."
          : "Promotion paused.",
      };
    }
    const data = z
      .object({
        name: z.string().trim().min(3).max(80),
        code: z.string().trim().toUpperCase().max(24).optional(),
        kind: z.enum(["automatic", "code"]),
        discountType: z.enum(["fixed", "percentage"]),
        discountValue: z.coerce.number().int().min(1),
        minimumSubtotalPaise: z.coerce.number().int().min(0),
        maximumDiscountPaise: z.coerce.number().int().min(0).optional(),
        startsAt: z.coerce.date(),
        endsAt: z.coerce.date(),
      })
      .refine((value) => value.endsAt > value.startsAt, {
        message: "End date must be after the start date.",
      })
      .refine((value) => value.kind !== "code" || Boolean(value.code), {
        message: "Coupon promotions need a code.",
      })
      .parse({
        ...formWithPaise(form),
        // one field serves both kinds: a percentage, or a fixed amount typed in rupees
        discountValue:
          form.get("discountType") === "fixed"
            ? paiseFromRupees(form.get("discountValue"))
            : form.get("discountValue"),
        // the form sends the store's local time with no zone; the server clock is UTC
        startsAt: `${form.get("startsAt")}:00+05:30`,
        endsAt: `${form.get("endsAt")}:00+05:30`,
      });
    const promotion = await Promotion.create({
      ...data,
      code: data.kind === "code" ? data.code : undefined,
      active: form.get("active") === "on",
      perCustomerLimit: 1,
      createdBy: actor.id,
      updatedBy: actor.id,
    });
    await AuditLog.create({
      actorId: actor.id,
      action: "promotion.create",
      target: String(promotion._id),
      details: { name: promotion.name, kind: promotion.kind, active: promotion.active },
    });
    revalidatePath("/super-admin/promotions");
    revalidatePath("/");
    return { success: "Promotion created." };
  } catch (error) {
    return {
      error:
        error instanceof z.ZodError
          ? plainMessage(error)
          : "Unable to update this promotion.",
    };
  }
}
