/*
 * Who sees a product, in one place. Shoppers see published products unless the owner kept one
 * for schools only (a missing flag counts as "show", so older products stay in the shop);
 * schools see published products the owner ticked for them. Every query or check that shows a
 * product to someone goes through these, so a school-only item can't slip into the shop.
 */

/** Spread into a Product filter for anything a shopper sees or buys. */
export const shopperVisible = { status: "published", showToCustomers: { $ne: false } } as const;
/** Spread into a Product filter for the school catalogue and quote basket. */
export const schoolVisible = { status: "published", showToSchools: true } as const;

type Audience = { status?: string | null; showToCustomers?: boolean | null; showToSchools?: boolean | null };
export const isShopperVisible = (product?: Audience | null) =>
  product?.status === "published" && product.showToCustomers !== false;
export const isSchoolVisible = (product?: Audience | null) =>
  product?.status === "published" && product.showToSchools === true;
