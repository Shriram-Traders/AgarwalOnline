import Link from "next/link";
import { PageHeading } from "@/components/page-heading";
import Image from "next/image";
import { ArrowRight, PartyPopper, ShieldCheck, ShoppingBag } from "lucide-react";
import { cookies } from "next/headers";
import { currentUser } from "@/lib/auth/session";
import { cartFor, deliveryRules } from "@/lib/commerce/service";
import { guestCartLines } from "@/lib/commerce/guest-cart";
import { applyPromotionAction } from "@/lib/promotions/actions";
import { quoteCart } from "@/lib/promotions/service";
import { productImages } from "@/lib/catalog/images";
import { formatPrice } from "@/lib/display";
import { ActionForm } from "@/components/action-form";
import { CartLineControls } from "@/components/cart-line-controls";
import { redirect } from "next/navigation";
import { currentLocale } from "@/lib/i18n";
import { listsFor, memberList } from "@/lib/lists/service";
import { BasketPills, NewBasket, SharedBasket } from "./shared-basket";
export const metadata = { title: "Basket", robots: { index: false } };

export default async function Cart({ searchParams }: { searchParams: Promise<{ basket?: string }> }) {
  const user = await currentUser();
  const { basket } = await searchParams;
  const mr = (await currentLocale()) === "mr";
  // signed-in customers can keep more than one basket: theirs, plus ones they fill with other people
  const baskets = user ? await listsFor(user.id, "basket") : null;
  const others = baskets ? [...baskets.owned, ...baskets.shared] : [];
  if (user && basket && basket !== "new") {
    const shared = await memberList(user.id, basket);
    if (!shared || shared.kind === "board") redirect("/cart");
    return <SharedBasket userId={user.id} list={shared} baskets={others} mr={mr} />;
  }
  if (user && basket === "new") return <NewBasket baskets={others} mr={mr} />;
  const lines =
    user ? await cartFor(user.id) : await guestCartLines();
  const rules = await deliveryRules();
  const promotionCode = (await cookies()).get("ags_promotion")?.value;
  const baseSubtotal = lines.reduce(
    (n, line) => n + line.pricePaise * line.quantity,
    0,
  );
  const estimatedDelivery = baseSubtotal >= rules.freeThresholdPaise ? 0 : 3000;
  const quote = await quoteCart(lines, {
    code: promotionCode,
    customerId: user?.id,
    deliveryPaise: estimatedDelivery,
  });
  const remaining = rules.freeThresholdPaise - baseSubtotal;
  return (
    <section className="page-container">
      <PageHeading
        eyebrow="Your basket"
        title="Basket"
        aside={
          lines.length > 0 ? (
            <Link href="/catalog" className="secondary-button">
              Continue shopping <ArrowRight size={16} aria-hidden="true" />
            </Link>
          ) : undefined
        }
      />
      {user && (
        <BasketPills
          current="mine"
          mine={lines.reduce((n, line) => n + line.quantity, 0)}
          baskets={others}
          mr={mr}
        />
      )}
      {lines.length ? (
        <div className="basket-layout">
          <div>
            <div className="free-delivery-progress">
              <p>
                {remaining <= 0 ? (
                  <>
                    <PartyPopper size={16} aria-hidden="true" /> You’ve unlocked free delivery.
                  </>
                ) : (
                  `Add ${formatPrice(remaining)} more for free delivery.`
                )}
              </p>
              <progress
                value={Math.min(baseSubtotal, rules.freeThresholdPaise)}
                max={rules.freeThresholdPaise}
                aria-label="Progress towards free delivery"
              />
            </div>
            {lines.map((line) => {
              const image = line.image ?? productImages[line.productSlug];
              return (
                <div className="basket-line panel" key={line.id}>
                  <div className="basket-product">
                    <div className="basket-thumb">
                      {image && <Image src={image} alt="" fill sizes="72px" unoptimized />}
                    </div>
                    <div>
                      <h3>
                        <Link href={`/products/${line.productSlug}`}>{line.name}</Link>
                      </h3>
                      <p className="muted">
                        {line.label} · {formatPrice(line.pricePaise)} each
                      </p>
                      <p className="muted">{line.available} available</p>
                    </div>
                  </div>
                  <CartLineControls
                    variantId={line.variantId}
                    quantity={line.quantity}
                    max={Math.min(line.maxQuantity, line.available)}
                    name={line.name}
                  />
                  <strong>{formatPrice(line.pricePaise * line.quantity)}</strong>
                </div>
              );
            })}
          </div>
          <aside className="panel">
            <h2>Summary</h2>
            <p>
              Merchandise <strong>{formatPrice(quote.merchandiseSubtotalPaise)}</strong>
            </p>
            {quote.merchandiseSavingsPaise > 0 && (
              <p className="savings-line">
                Item savings <strong>−{formatPrice(quote.merchandiseSavingsPaise)}</strong>
              </p>
            )}
            {quote.promotionDiscountPaise > 0 && (
              <p className="savings-line">
                {quote.appliedPromotion?.name}{" "}
                <strong>−{formatPrice(quote.promotionDiscountPaise)}</strong>
              </p>
            )}
            <p>
              Estimated delivery{" "}
              <strong>{estimatedDelivery ? formatPrice(estimatedDelivery) : "FREE"}</strong>
            </p>
            <hr />
            <h3>
              Estimated total <strong>{formatPrice(quote.totalPaise)}</strong>
            </h3>
            <ActionForm action={applyPromotionAction} submit="Apply" className="promo-form">
              <label>
                Offer code
                <input name="code" defaultValue={promotionCode} placeholder="e.g. LOCAL10" />
              </label>
            </ActionForm>
            <Link href={user ? "/checkout" : "/login"} className="primary-button">
              {user ? "Continue to checkout" : "Sign in to checkout"}
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <p className="muted summary-note">
              <ShieldCheck size={16} aria-hidden="true" />
              Delivery charge and availability are confirmed at checkout.
            </p>
          </aside>
        </div>
      ) : (
        <div className="panel empty-state">
          <ShoppingBag size={40} strokeWidth={1.5} className="empty-icon" aria-hidden="true" />
          <h2>Your basket is empty.</h2>
          <p>Add your everyday essentials and they’ll be waiting here.</p>
          <Link href="/catalog" className="primary-button">
            Explore the store
          </Link>
        </div>
      )}
    </section>
  );
}
