import { paymentsEnabled } from "@/lib/payments/provider";
import { PageHeading } from "@/components/page-heading";
import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import { randomUUID } from "node:crypto";
import { currentUser, requirePage } from "@/lib/auth/session";
import { currentLocale } from "@/lib/i18n";
import { SignInGate } from "@/components/sign-in-prompt";
import { AddressPopup } from "@/components/address-popup";
import { basketFor, deliveryRules } from "@/lib/commerce/service";
import { earliestDelivery } from "@/lib/commerce/delivery";
import { dayLabel, ensureSlots, stillBookable } from "@/lib/commerce/slots";
import { Address, DeliverySlot } from "@/lib/commerce/models";
import { ServiceArea, User } from "@/lib/db/models";
import { CheckoutForm } from "@/components/checkout-form";
import { cookies } from "next/headers";
import { codeProblem, quoteCart, shopOffers } from "@/lib/promotions/service";
import { CouponPicker } from "@/components/coupon-picker";
import { familyOf } from "@/lib/family/service";
import { tabStanding } from "@/lib/family/checkout";
import { formatPrice } from "@/lib/display";
import { classLabel } from "@/lib/family/models";
import { firstName } from "@/lib/lists/service";
export const metadata = { title: "Checkout", robots: { index: false } };
export default async function Checkout({ searchParams }: { searchParams: Promise<{ for?: string }> }) {
  // no account yet: offer sign-in or sign-up in a popup, and come back here afterwards
  if (!(await currentUser()))
    return (
      <section className="page-container">
        <PageHeading eyebrow="Almost there" title="Checkout" />
        <SignInGate mr={(await currentLocale()) === "mr"} />
      </section>
    );
  const user = await requirePage("order:own");
  const profile = await User.findById(user.id).select("preferredPaymentMethod");
  const { lines: cart, unavailable } = await basketFor(user.id);
  // the order would be refused over these, so send the customer to fix them first
  const needsAttention = [
    ...unavailable.map((line) => `${line.name} is no longer sold.`),
    ...cart
      .filter((line) => line.quantity > line.available)
      .map((line) =>
        line.available
          ? `Only ${line.available} of ${line.name} left.`
          : `${line.name} is sold out.`,
      ),
  ];
  const addresses = await Address.find({ customerId: user.id });
  const areas = await ServiceArea.find({ enabled: true });
  const rules = await deliveryRules();
  const now = new Date();
  const earliest = earliestDelivery(now, rules);
  await ensureSlots();
  // only the customer's own areas: a shared "first 100 slots" could leave an area with none
  const slots = (
    await DeliverySlot.find({
      enabled: true,
      areaId: { $in: [...new Set(addresses.map((address) => String(address.areaId)))] },
      date: { $gte: earliest },
      $expr: { $lt: ["$reserved", "$capacity"] },
    })
      .sort({ date: 1, startMinutes: 1, label: 1 })
      .limit(300)
  ).filter((slot) => stillBookable(slot, now));
  const options = addresses.flatMap((a) => {
    const area = areas.find(
      (s) => String(s._id) === String(a.areaId) && s.pincodes.includes(a.pin),
    );
    return area
      ? [
          {
            id: String(a._id),
            areaId: String(a.areaId),
            label: `${a.name} — ${a.line}, ${a.pin}`,
            fee: area.feePaise,
            codLimit: area.codLimitPaise,
            codEnabled: area.codEnabled,
          },
        ]
      : [];
  });
  const defaultAddress = addresses.find((address) => address.isDefault) ?? addresses[0];
  const defaultOption = options.find((option) => option.id === String(defaultAddress?._id));
  const subtotal = cart.reduce((n, line) => n + line.pricePaise * line.quantity, 0);
  // in a family, the order is tagged with who it is for; "Buy kit" arrives with the child picked
  const family = await familyOf(user.id);
  const adults = family ? await User.find({ _id: { $in: family.adults } }).select("name") : [];
  const people = family
    ? [
        { id: user.id, label: "Me" },
        ...adults
          .filter((adult) => String(adult._id) !== user.id)
          .map((adult) => ({ id: String(adult._id), label: firstName(adult.name) })),
        ...family.children.map((child: { _id: unknown; name: string; className: string }) => ({
          id: String(child._id),
          label: `${child.name} · ${classLabel(child.className)}`,
        })),
      ]
    : undefined;
  // the family tab, when there is one: what is left on it, or why it can't take this order
  const standing = family ? await tabStanding(user.id) : null;
  const tab =
    standing && standing.status !== "closed"
      ? {
          availablePaise: standing.availablePaise,
          blocked:
            standing.status === "requested"
              ? "Your family tab is waiting for the store to open it."
              : standing.status === "paused"
                ? "Your family tab is paused. Talk to the store to reopen it."
                : standing.overdue
                  ? `${formatPrice(standing.duePaise)} from last month is due on your family tab. Pay it at the store or to the rider to use the tab again.`
                  : undefined,
        }
      : undefined;
  const wanted = (await searchParams).for;
  const defaultFor = people?.some((person) => person.id === wanted) ? wanted : user.id;
  const promotionCode = (await cookies()).get("ags_promotion")?.value;
  const quote = await quoteCart(cart, {
    code: promotionCode,
    customerId: user.id,
    deliveryPaise:
      subtotal >= rules.freeThresholdPaise ? 0 : (defaultOption?.fee ?? 0),
  });
  // the same coupons as the basket, folded into one line in the order summary
  const offers = await shopOffers(subtotal, { customerId: user.id, appliedId: quote.appliedPromotion?.id });
  const codeIssue =
    promotionCode && quote.rejectedCodeReason
      ? ((await codeProblem(promotionCode, subtotal, user.id)) ?? quote.rejectedCodeReason)
      : undefined;
  return (
    <section className="page-container">
      <PageHeading
        eyebrow="Almost there"
        title="Checkout"
        aside={
          <p className="muted secure-note">
            <LockKeyhole size={16} aria-hidden="true" /> Secure checkout
          </p>
        }
      />
      {needsAttention.length > 0 ? (
        <div className="panel empty-state">
          <h2>Some items in your basket need a change</h2>
          <ul className="attention-list">
            {needsAttention.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
          <Link href="/cart" className="primary-button">
            Review basket
          </Link>
        </div>
      ) : !cart.length ? (
        <div className="panel empty-state">
          <h2>Your basket is empty.</h2>
          <p>Add a few items before checking out.</p>
          <Link href="/catalog" className="primary-button">
            Continue shopping
          </Link>
        </div>
      ) : !options.length ? (
        <AddressPopup
          areas={areas.map((area) => ({
            id: String(area._id),
            name: area.name,
            pincodes: [...area.pincodes],
          }))}
          phone={user.phone}
          hasAddresses={addresses.length > 0}
        />
      ) : (
        <CheckoutForm
          onlineEnabled={paymentsEnabled()}
          addresses={options}
          slots={slots
            .filter(
              (s) =>
                !rules.blackoutDates.includes(s.date) &&
                !rules.holidays.includes(
                  new Date(`${s.date}T00:00:00Z`).getUTCDay(),
                ),
            )
            .map((s) => ({
              id: String(s._id),
              areaId: String(s.areaId),
              // "Today · 4:00 PM – 7:00 PM" instead of "2026-09-30 · …"
              label: `${dayLabel(s.date, now)} · ${s.label}`,
              day: dayLabel(s.date, now),
              time: s.label as string,
            }))}
          subtotal={subtotal}
          promotionDiscount={quote.promotionDiscountPaise}
          promotionName={quote.appliedPromotion?.name}
          coupons={
            <CouponPicker
              compact
              offers={offers}
              applied={
                quote.appliedPromotion
                  ? { ...quote.appliedPromotion, savePaise: quote.promotionDiscountPaise }
                  : undefined
              }
              typedCode={promotionCode}
              codeIssue={codeIssue}
            />
          }
          defaultAddressId={defaultOption?.id}
          defaultMethod={profile?.preferredPaymentMethod ?? "cod"}
          threshold={rules.freeThresholdPaise}
          idempotencyKey={randomUUID()}
          people={people}
          defaultFor={defaultFor}
          tab={tab}
        />
      )}
    </section>
  );
}
