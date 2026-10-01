import { readFile } from "node:fs/promises";
import path from "node:path";
import { currentUser } from "@/lib/auth/session";
import { objectId } from "@/lib/commerce/service";
import { Order } from "@/lib/commerce/models";
import { UploadedEvidence } from "@/lib/evidence/models";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!objectId.safeParse(id).success)
    return new Response("Not found", { status: 404 });
  const evidence = await UploadedEvidence.findById(id);
  if (!evidence) return new Response("Not found", { status: 404 });
  // product photos are shown to every shopper, signed in or not; the rest stay private
  const isProductPhoto = evidence.purpose === "product";
  if (!isProductPhoto) {
    const user = await currentUser();
    if (!user) return new Response("Not found", { status: 404 });
    let allowed =
      user.roles.some((role) => role === "admin" || role === "super-admin") ||
      String(evidence.ownerId) === user.id;
    if (!allowed && user.roles.includes("delivery") && evidence.orderId)
      allowed = Boolean(
        await Order.exists({ _id: evidence.orderId, assignedTo: user.id }),
      );
    if (!allowed) return new Response("Not found", { status: 404 });
  }
  if (evidence.provider === "cloudinary")
    return Response.redirect(evidence.url, 302);
  try {
    const body = await readFile(
      path.join(
        process.cwd(),
        ".local",
        "uploads",
        path.basename(evidence.storageKey),
      ),
    );
    return new Response(new Uint8Array(body), {
      headers: {
        "Content-Type": evidence.mime,
        "Content-Length": String(evidence.size),
        "Cache-Control": isProductPhoto
          ? "public, max-age=86400"
          : "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
