import Link from "next/link";
import { PageHeading } from "@/components/page-heading";
import Image from "next/image";
import { ArrowRight, PartyPopper, ShieldCheck, ShoppingBag } from "lucide-react";
import { cookies } from "next/headers";
import { currentUser } from "@/lib/auth/session";
import { basketFor, deliveryRules } from "@/lib/commerce/service";
import { guestBasket } from "@/lib/commerce/guest-cart";
import { cartAction } from "@/lib/commerce/actions";
import { codeProblem, quoteCart, shopOffers } from "@/lib/promotions/service";
import { OffersPanel } from "@/components/offers-panel";
import { SignInToCheckout } from "@/components/sign-in-prompt";
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
  const { lines, unavailable } = user
    ? await basketFor(user.id)
    : await guestBasket();
  // checkout refuses these, so say so here, where they can be fixed
  const needsAttention =
    unavailable.length > 0 || lines.some((line) => line.quantity > line.available);
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
  const offers = lines.length
    ? await shopOffers(baseSubtotal, { customerId: user?.id, appliedId: quote.appliedPromotion?.id })
    : [];
  // a code typed earlier that isn't on the basket now: say why, instead of letting it vanish
  const codeIssue =
    promotionCode && quote.rejectedCodeReason
      ? ((await codeProblem(promotionCode, baseSubtotal, user?.id)) ?? quote.rejectedCodeReason)
      : undefined;
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
      {unavailable.length > 0 && (
        <div className="notice unavailable-lines" role="status">
          <p>
            <strong>
              {unavailable.length === 1 ? "This item is" : "These items are"} no longer sold.
            </strong>{" "}
            Remove {unavailable.length === 1 ? "it" : "them"} to check out.
          </p>
          <ul>
            {unavailable.map((line) => (
              <li key={line.variantId}>
                <span>
                  {line.name}
                  {line.label ? ` · ${line.label}` : ""}
                </span>
                <ActionForm
                  action={cartAction}
                  submit="Remove"
                  className="unavailable-remove"
                  buttonClassName="secondary-button"
                >
                  <input type="hidden" name="variantId" value={line.variantId} />
                  <input type="hidden" name="quantity" value="0" />
                </ActionForm>
              </li>
            ))}
          </ul>
        </div>
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
                    available={line.available}
                  />
                  <strong>{formatPrice(line.pricePaise * line.quantity)}</strong>
                </div>
              );
            })}
            <OffersPanel
              offers={offers}
              applied={
                quote.appliedPromotion
                  ? { ...quote.appliedPromotion, savePaise: quote.promotionDiscountPaise }
                  : undefined
              }
              typedCode={promotionCode}
              codeIssue={codeIssue}
            />
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
            {quote.promotionDiscountPaise > 0 ? (
              <p className="savings-line">
                {quote.appliedPromotion?.name}{" "}
                <strong>−{formatPrice(quote.promotionDiscountPaise)}</strong>
              </p>
            ) : (
              offers.some((offer) => offer.state === "ready") && (
                <a href="#offers" className="summary-offer-link">
                  An offer can save you money · see offers
                </a>
              )
            )}
            <p>
              Estimated delivery{" "}
              <strong>{estimatedDelivery ? formatPrice(estimatedDelivery) : "FREE"}</strong>
            </p>
            <hr />
            <h3>
              Estimated total <strong>{formatPrice(quote.totalPaise)}</strong>
            </h3>
            {needsAttention && (
              <p className="notice">Fix the items marked in your basket before checking out.</p>
            )}
            {user ? (
              <Link href="/checkout" className="primary-button">
                Continue to checkout
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
            ) : (
              <SignInToCheckout mr={mr} />
            )}
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
