import { rateLimit } from "@/lib/auth/rate-limit";
import { orderBillHtml } from "@/lib/documents/order-bills";
import { billAccess, billKeyOf, plainText } from "@/lib/documents/bill-request";
import { htmlToPdf } from "@/lib/documents/pdf";
import { log } from "@/lib/logger";

// a real Chromium draws the PDF: Node, and time for a cold start
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * One of an order's bills as a PDF to download or share on WhatsApp, drawn from the same page as the
 * bill (see ../route.ts for ?bill=, ?kind=estimate and ?code=), without its buttons.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await billAccess(request, (await params).id);
  if ("error" in access) return access.error;
  const { order, staff } = access;
  const key = billKeyOf(request);
  if (!key) return plainText("Bill not found", 404);
  const estimate = new URL(request.url).searchParams.get("kind") === "estimate";
  if (estimate && !staff) return plainText("Only the store can make an estimate.", 403);
  if (estimate && (order.orderStatus === "cancelled" || order.deliveryStatus === "delivered" || order.bill?.issuedAt))
    return plainText("This order has no estimate to give.", 409);
  // making a PDF takes a whole browser for a moment: a few dozen an hour is plenty for anyone
  try {
    await rateLimit(`bill-pdf:${access.who}`, 40, 60 * 60 * 1000);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Too many"))
      return plainText("Too many PDFs in a short time. Try again in a while.", 429);
    throw error;
  }
  const bill = await orderBillHtml(order, { key, estimate, staffView: false });
  if (!bill) return plainText("Bill not found", 404);
  try {
    const pdf = await htmlToPdf(bill.html);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${bill.fileName}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    log("error", "bill-pdf.failed", { error, orderId: String(order._id), key });
    // staff also get the browser's own first words, so a failure on the live site can be told apart
    // without Vercel's logs; kept short, as the page shows the server's words only up to 200 letters
    const reason = staff && error instanceof Error ? error.message.split("\n")[0].replace(/\s+/g, " ").slice(0, 90) : "";
    return plainText(`The PDF couldn't be made just now. Try again, or use Print bill.${reason ? ` (Reason: ${reason})` : ""}`, 503);
  }
}
