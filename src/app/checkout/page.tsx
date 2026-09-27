import { paymentsEnabled } from "@/lib/payments/provider";
import { PageHeading } from "@/components/page-heading";
import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import { randomUUID } from "node:crypto";
import { requirePage } from "@/lib/auth/session";
import { cartFor, deliveryRules } from "@/lib/commerce/service";
import { earliestDelivery } from "@/lib/commerce/delivery";
import { Address, DeliverySlot } from "@/lib/commerce/models";
import { ServiceArea, User } from "@/lib/db/models";
import { CheckoutForm } from "@/components/checkout-form";
import { cookies } from "next/headers";
import { quoteCart } from "@/lib/promotions/service";
export const metadata = { title: "Checkout", robots: { index: false } };
export default async function Checkout() {
  const user = await requirePage("order:own");
  const profile = await User.findById(user.id).select("preferredPaymentMethod");
  const cart = await cartFor(user.id);
  const addresses = await Address.find({ customerId: user.id });
  const areas = await ServiceArea.find({ enabled: true });
  const rules = await deliveryRules();
  const earliest = earliestDelivery(new Date(), rules);
  const slots = await DeliverySlot.find({
    enabled: true,
    date: { $gte: earliest },
    $expr: { $lt: ["$reserved", "$capacity"] },
  })
    .sort({ date: 1 })
    .limit(100);
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
  const promotionCode = (await cookies()).get("ags_promotion")?.value;
  const quote = await quoteCart(cart, {
    code: promotionCode,
    customerId: user.id,
    deliveryPaise:
      subtotal >= rules.freeThresholdPaise ? 0 : (defaultOption?.fee ?? 0),
  });
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
      {!cart.length ? (
        <div className="panel empty-state">
          <h2>Your basket is empty.</h2>
          <p>Add a few items before checking out.</p>
          <Link href="/catalog" className="primary-button">
            Continue shopping
          </Link>
        </div>
      ) : !options.length ? (
        <div className="panel empty-state">
          <h2>Add a delivery address</h2>
          <p>Save an address in a supported service area to continue.</p>
          <Link href="/account/addresses" className="primary-button">
            Manage addresses
          </Link>
        </div>
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
              label: `${s.date} · ${s.label}`,
            }))}
          subtotal={subtotal}
          promotionDiscount={quote.promotionDiscountPaise}
          promotionName={quote.appliedPromotion?.name}
          defaultAddressId={defaultOption?.id}
          defaultMethod={profile?.preferredPaymentMethod ?? "cod"}
          threshold={rules.freeThresholdPaise}
          idempotencyKey={randomUUID()}
        />
      )}
    </section>
  );
}
