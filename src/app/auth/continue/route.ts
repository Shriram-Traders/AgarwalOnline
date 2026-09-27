import { currentUser } from "@/lib/auth/session";
import { staffHome } from "@/lib/auth/permissions";
import { AuditLog } from "@/lib/db/models";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

/**
 * Where Google sends people back after sign-in. Better Auth has already created the session;
 * this merges any guest basket, records the sign-in, and lands staff in their workspace.
 */
export async function GET(request: Request) {
  const user = await currentUser();
  // relative, so the browser stays on the host its session cookie belongs to
  const to = (path: string) => new Response(null, { status: 303, headers: { Location: path } });
  if (!user) return to("/login?error=signin_failed");
  let mergedBasket = false;
  try {
    const { mergeGuestCart } = await import("@/lib/commerce/guest-cart");
    mergedBasket = (await mergeGuestCart(user.id)).added > 0;
  } catch (error) {
    log("error", "auth.google.basket-merge-failed", { error });
  }
  await AuditLog.create({ actorId: user.id, action: "auth.google.login" });
  // a first Google sign-in with an email we didn't know: ask whether they ordered before with a mobile number
  if (new URL(request.url).searchParams.get("new") === "1" && !user.phone)
    return to("/account?welcome=google");
  return to(mergedBasket ? "/cart" : (staffHome(user.roles) ?? "/account"));
}
