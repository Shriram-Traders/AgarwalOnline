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
        // only when the form shows the choice (online payment on): otherwise the saved one stays
        preferredPaymentMethod: z.enum(["cod", "razorpay"]).optional().catch(undefined),
        substitutionPreference: z
          .enum(["contact", "best-match", "no-substitutions"])
          .catch("contact"),
      })
      .parse(Object.fromEntries(form));
    // a checkbox sends nothing when it's off
    const reminders = { basketReminders: form.get("basketReminders") === "on" };
    const before = await User.findById(user.id).select("name");
    if (!before) throw Error("UNAUTHENTICATED");
    await User.updateOne(
      { _id: user.id, active: true },
      { $set: { ...Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)), ...reminders } },
    );
    await AuditLog.create({
      actorId: user.id,
      action: "profile.update",
      target: user.id,
      details: { before: { name: before.name }, after: { ...data, ...reminders } },
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
