"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "../auth/session";
import { AuditLog, User } from "../db/models";
import type { MutationState } from "../commerce/actions";
import { plainMessage } from "../form-errors";

export async function profileAction(
  _state: MutationState,
  form: FormData,
): Promise<MutationState> {
  try {
    const user = await requirePermission("profile:own");
    const data = z
      .object({
        name: z.string().trim().min(2).max(80),
        preferredPaymentMethod: z.enum(["cod", "razorpay"]).catch("cod"),
        substitutionPreference: z
          .enum(["contact", "best-match", "no-substitutions"])
          .catch("contact"),
      })
      .parse(Object.fromEntries(form));
    const before = await User.findById(user.id).select("name");
    if (!before) throw Error("UNAUTHENTICATED");
    await User.updateOne(
      { _id: user.id, active: true },
      { $set: data },
    );
    await AuditLog.create({
      actorId: user.id,
      action: "profile.update",
      target: user.id,
      details: { before: { name: before.name }, after: data },
    });
    revalidatePath("/account");
    return { success: "Profile updated." };
  } catch (error) {
    return {
      error:
        error instanceof z.ZodError
          ? plainMessage(error)
          : "Unable to update your profile.",
    };
  }
}
