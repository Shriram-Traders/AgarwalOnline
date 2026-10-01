import "server-only";

import { cookies } from "next/headers";
import mongoose from "mongoose";
import { token, digest } from "../auth/crypto";
import { connectDB } from "../db/connect";
import { InventoryItem, Product, ProductVariant } from "../db/models";
import { CartLine, GuestCart } from "./models";
import { objectId, type UnavailableLine } from "./service";
import { z } from "zod";

const GUEST_CART_COOKIE = "ags_guest_cart";
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

async function guestToken() {
  return (await cookies()).get(GUEST_CART_COOKIE)?.value;
}

export async function setGuestCartLine(
  variantInput: unknown,
  quantityInput: unknown,
) {
  const variantId = objectId.parse(variantInput);
  const quantity = z.coerce.number().int().min(0).max(100).parse(quantityInput);
  await connectDB();
  // removing always works, even for a product that was since taken off the shop
  const variant = quantity > 0 ? await ProductVariant.findById(variantId) : null;
  if (
    quantity > 0 &&
    (!variant ||
      variant.active === false ||
      quantity > variant.maxQuantity ||
      !(await Product.exists({ _id: variant.productId, status: "published" })))
  )
    throw Error("This product or quantity is unavailable.");

  const jar = await cookies();
  let rawToken = jar.get(GUEST_CART_COOKIE)?.value;
  if (!rawToken) {
    rawToken = token();
    jar.set(GUEST_CART_COOKIE, rawToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: MAX_AGE_SECONDS,
    });
  }
  const tokenHash = digest(rawToken);
  const current = await GuestCart.findOne({ tokenHash });
  const lines = (current?.lines ?? []).map(
    (line: { variantId: unknown; quantity: number }) => ({
      variantId: String(line.variantId),
      quantity: line.quantity,
    }),
  );
  const index = lines.findIndex(
    (line: { variantId: string; quantity: number }) =>
      line.variantId === variantId,
  );
  if (quantity === 0 && index >= 0) lines.splice(index, 1);
  else if (index >= 0) lines[index].quantity = quantity;
  else if (quantity > 0) lines.push({ variantId, quantity });
  await GuestCart.updateOne(
    { tokenHash },
    {
      $set: {
        lines,
        expiresAt: new Date(Date.now() + MAX_AGE_SECONDS * 1000),
      },
    },
    { upsert: true, runValidators: true },
  );
}

export async function guestCartLines() {
  return (await guestBasket()).lines;
}
/** The guest basket split like basketFor: buyable lines, and lines no longer sold (shown with Remove). */
export async function guestBasket() {
  const unavailable: UnavailableLine[] = [];
  const rawToken = await guestToken();
  if (!rawToken) return { lines: [], unavailable };
  await connectDB();
  const cart = await GuestCart.findOne({
    tokenHash: digest(rawToken),
    expiresAt: { $gt: new Date() },
  });
  if (!cart) return { lines: [], unavailable };
  const result = [];
  for (const line of cart.lines) {
    const variant = await ProductVariant.findById(line.variantId);
    const product = variant ? await Product.findById(variant.productId) : null;
    if (!variant || variant.active === false || !product || product.status !== "published") {
      unavailable.push({
        variantId: String(line.variantId),
        name: product?.name.en ?? "An item that is no longer sold",
        label: variant?.label ?? "",
      });
      continue;
    }
    const inventory = await InventoryItem.findOne({ variantId: variant._id });
    result.push({
      id: `${cart._id}:${variant._id}`,
      variantId: String(variant._id),
      productSlug: product.slug,
      name: product.name.en,
      image: product.images?.[0] ?? product.image,
      label: variant.label,
      quantity: line.quantity,
      pricePaise: variant.pricePaise,
      mrpPaise: variant.mrpPaise,
      available: Math.max(
        0,
        (inventory?.onHand ?? 0) - (inventory?.reserved ?? 0),
      ),
      maxQuantity: variant.maxQuantity,
    });
  }
  return { lines: result, unavailable };
}

export async function mergeGuestCart(customerId: string) {
  const jar = await cookies();
  const rawToken = jar.get(GUEST_CART_COOKIE)?.value;
  if (!rawToken) return { added: 0, adjusted: 0 };
  await connectDB();
  let added = 0;
  let adjusted = 0;
  await mongoose.connection.transaction(async (session) => {
    const cart = await GuestCart.findOne({ tokenHash: digest(rawToken) }).session(
      session,
    );
    if (!cart) return;
    for (const line of cart.lines) {
      const variant = await ProductVariant.findById(line.variantId).session(
        session,
      );
      const inventory = variant
        ? await InventoryItem.findOne({ variantId: variant._id }).session(session)
        : null;
      const product = variant
        ? await Product.exists({
            _id: variant.productId,
            status: "published",
          }).session(session)
        : null;
      if (!variant || variant.active === false || !inventory || !product) {
        adjusted += 1;
        continue;
      }
      const available = Math.max(0, inventory.onHand - inventory.reserved);
      const current = await CartLine.findOne({
        customerId,
        variantId: variant._id,
      }).session(session);
      const requested = (current?.quantity ?? 0) + line.quantity;
      const quantity = Math.min(requested, variant.maxQuantity, available);
      if (quantity < 1) {
        adjusted += 1;
        continue;
      }
      if (quantity !== requested) adjusted += 1;
      await CartLine.updateOne(
        { customerId, variantId: variant._id },
        { $set: { quantity } },
        { upsert: true, runValidators: true, session },
      );
      added += 1;
    }
    await GuestCart.deleteOne({ _id: cart._id }, { session });
  });
  jar.delete(GUEST_CART_COOKIE);
  return { added, adjusted };
}

export async function guestCartCount() {
  const lines = await guestCartLines();
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}
