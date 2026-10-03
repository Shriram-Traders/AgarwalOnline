import Link from "next/link";
import { PageHeading } from "@/components/page-heading";
import Image from "next/image";
import { ArrowRight, PartyPopper, ShieldCheck, ShoppingBag, Truck } from "lucide-react";
import { cookies } from "next/headers";
import { currentUser } from "@/lib/auth/session";
import { basketFor, deliveryRules } from "@/lib/commerce/service";
import { guestBasket } from "@/lib/commerce/guest-cart";
import { cartAction, saveForLaterAction } from "@/lib/commerce/actions";
import { basketGoals } from "@/lib/commerce/goals";
import { basketSuggestions, buyAgainFor, deliveryAreaName } from "@/lib/commerce/basket-extras";
import { codeProblem, offerSaving, quoteCart, shopOffers } from "@/lib/promotions/service";
import { CouponPicker } from "@/components/coupon-picker";
import { SignInToCheckout } from "@/components/sign-in-prompt";
import { productImages } from "@/lib/catalog/images";
import { formatPrice, minutesUntilCutoff } from "@/lib/display";
import { DeliveryPromise } from "@/components/delivery-promise";
import { BasketGoals } from "@/components/basket-goals";
import { MiniProduct } from "@/components/mini-product";
import { BasketSync } from "@/components/basket-sync";
import { ActionForm } from "@/components/action-form";
import { CartLineControls } from "@/components/cart-line-controls";
import { redirect } from "next/navigation";
import { currentLocale } from "@/lib/i18n";
import { listsFor, memberList } from "@/lib/lists/service";
import { BasketPills, NewBasket, SharedBasket } from "./shared-basket";
export const metadata = { title: "Basket", robots: { index: false } };

export default async function Cart({ searchParams }: { searchParams: Promise<{ basket?: string }> }) {
  // each round asks for everything that doesn't wait on something else, all at once
  const [user, { basket }, savedLocale, jar] = await Promise.all([currentUser(), searchParams, currentLocale(), cookies()]);
  const mr = savedLocale === "mr";
  const sharedView = Boolean(user && basket);
  const [baskets, own, rules] = await Promise.all([
    // signed-in customers can keep more than one basket: theirs, plus ones they fill with other people
    user ? listsFor(user.id, "basket") : null,
    sharedView ? null : user ? basketFor(user.id) : guestBasket(),
    deliveryRules(),
  ]);
  const others = baskets ? [...baskets.owned, ...baskets.shared] : [];
  if (user && basket && basket !== "new") {
    const shared = await memberList(user.id, basket);
    if (!shared || shared.kind === "board") redirect("/cart");
    return <SharedBasket userId={user.id} list={shared} baskets={others} mr={mr} />;
  }
  if (user && basket === "new") return <NewBasket baskets={others} mr={mr} />;
  const { lines, unavailable } = own ?? { lines: [], unavailable: [] };
  // checkout refuses these, so say so here, where they can be fixed
  const needsAttention =
    unavailable.length > 0 || lines.some((line) => line.quantity > line.available);
  const promotionCode = jar.get("ags_promotion")?.value;
  const baseSubtotal = lines.reduce(
    (n, line) => n + line.pricePaise * line.quantity,
    0,
  );
  const estimatedDelivery = baseSubtotal >= rules.freeThresholdPaise ? 0 : 3000;
  // the bill, and around the lines: where it's going and what they bought before
  const [quote, areaName, buyAgain] = await Promise.all([
    quoteCart(lines, {
      code: promotionCode,
      customerId: user?.id,
      deliveryPaise: estimatedDelivery,
    }),
    user && lines.length ? deliveryAreaName(user.id) : undefined,
    user && lines.length ? buyAgainFor(user.id, lines) : [],
  ]);
  const [offers, codeIssue, suggestions] = await Promise.all([
    lines.length
      ? shopOffers(baseSubtotal, { customerId: user?.id, appliedId: quote.appliedPromotion?.id })
      : [],
    // a code typed earlier that isn't on the basket now: say why, instead of letting it vanish
    promotionCode && quote.rejectedCodeReason
      ? codeProblem(promotionCode, baseSubtotal, user?.id).then((problem) => problem ?? quote.rejectedCodeReason)
      : undefined,
    lines.length ? basketSuggestions(user?.id, lines, buyAgain) : [],
  ]);
  const now = new Date();
  const locale = mr ? "mr" : "en";
  const units = lines.reduce((n, line) => n + line.quantity, 0);
  const goals = basketGoals(
    baseSubtotal,
    rules.freeThresholdPaise,
    offers.map((offer) => ({ ...offer, saving: offerSaving(offer) })),
  );
  // the bill adds up: MRP, minus the MRP discount and the offer, plus delivery
  const mrpTotal = quote.merchandiseSubtotalPaise + quote.merchandiseSavingsPaise;
  const totalSaving = quote.merchandiseSavingsPaise + quote.promotionDiscountPaise;
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
          <div className="basket-main">
            <div className="basket-delivery">
              <span className="basket-delivery-icon" aria-hidden="true">
                <Truck size={22} />
              </span>
              <div>
                <strong>Same-day delivery{areaName ? ` to ${areaName}` : ""}</strong>
                <DeliveryPromise
                  cutoffHour={rules.cutoffHour}
                  initialMinutes={minutesUntilCutoff(rules.cutoffHour, now)}
                  locale={locale}
                />
              </div>
            </div>
            <BasketGoals goals={goals} subtotalPaise={baseSubtotal} />
            <section className="panel basket-items" aria-labelledby="basket-items-heading">
              <h2 id="basket-items-heading">
                {units} {units === 1 ? "item" : "items"}
              </h2>
              {lines.map((line) => {
                const image = line.image ?? productImages[line.productSlug];
                return (
                  <div className="basket-line panel" key={line.id}>
                    <div className="basket-product">
                      <div className="basket-thumb">
                        {image && <Image src={image} alt="" fill sizes="72px" />}
                      </div>
                      <div>
                        <h3>
                          <Link href={`/products/${line.productSlug}`}>{line.name}</Link>
                        </h3>
                        <p className="muted">
                          {line.label} · {formatPrice(line.pricePaise)} each
                          {line.mrpPaise > line.pricePaise && <del> {formatPrice(line.mrpPaise)}</del>}
                        </p>
                        {line.available <= 5 && <p className="basket-low">Only {line.available} left</p>}
                        {user && (
                          <ActionForm
                            action={saveForLaterAction}
                            submit="Save for later"
                            className="basket-save"
                            buttonClassName="text-button"
                          >
                            <input type="hidden" name="variantId" value={line.variantId} />
                          </ActionForm>
                        )}
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
              {quote.merchandiseSavingsPaise > 0 && (
                <p className="basket-items-saving">
                  You’re saving {formatPrice(quote.merchandiseSavingsPaise)} on these items.
                </p>
              )}
            </section>
            <CouponPicker
              offers={offers}
              applied={
                quote.appliedPromotion
                  ? { ...quote.appliedPromotion, savePaise: quote.promotionDiscountPaise }
                  : undefined
              }
              typedCode={promotionCode}
              codeIssue={codeIssue}
            />
            {suggestions.length > 0 && (
              <section className="basket-rail" aria-labelledby="basket-more-heading">
                <h2 id="basket-more-heading">Add a little more</h2>
                <div className="mini-grid">
                  {suggestions.map((product) => (
                    <MiniProduct key={product.id} product={product} />
                  ))}
                </div>
              </section>
            )}
            {buyAgain.length > 0 && (
              <section className="basket-rail" aria-labelledby="basket-again-heading">
                <h2 id="basket-again-heading">Buy it again</h2>
                <div className="mini-grid">
                  {buyAgain.map((product) => (
                    <MiniProduct key={product.id} product={product} />
                  ))}
                </div>
              </section>
            )}
          </div>
          <aside className="panel basket-bill">
            <h2>Bill details</h2>
            <p>
              Items total{quote.merchandiseSavingsPaise > 0 ? " (MRP)" : ""} <strong>{formatPrice(mrpTotal)}</strong>
            </p>
            {quote.merchandiseSavingsPaise > 0 && (
              <p className="savings-line">
                Discount on MRP <strong>−{formatPrice(quote.merchandiseSavingsPaise)}</strong>
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
              Delivery{" "}
              <strong className={estimatedDelivery ? undefined : "bill-free"}>
                {estimatedDelivery ? formatPrice(estimatedDelivery) : "FREE"}
              </strong>
            </p>
            <h3>
              To pay <strong>{formatPrice(quote.totalPaise)}</strong>
            </h3>
            {totalSaving > 0 && (
              <p className="basket-saved" role="status">
                <PartyPopper size={16} aria-hidden="true" /> You save {formatPrice(totalSaving)} on this order
              </p>
            )}
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
              Cash on delivery available · packed by your local shop. Delivery charge and availability are
              confirmed at checkout.
            </p>
          </aside>
          <BasketSync units={units} />
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
