/*
 * Deleted packs and products stay in the database: past orders, bills, quotations, stock history
 * and sales reports all look them up by id. They are marked with `deletedAt` and hidden the way a
 * hidden pack or product is, so the shop, baskets and checkout need nothing extra. Staff lists and
 * saves spread `notDeleted` into their filters.
 */

/** Spread into a Product or ProductVariant filter for anything staff manage. */
export const notDeleted = { deletedAt: null } as const;

/** A deleted record gives up its SKU or web address, so the same one can be used again. */
export const deletedName = (text: string, id: unknown) => `${text}-deleted-${String(id).slice(-6)}`;
