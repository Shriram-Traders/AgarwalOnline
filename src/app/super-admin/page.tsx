import { requirePage } from "@/lib/auth/session";
import { ServiceArea, SearchSynonym } from "@/lib/db/models";
import { DeliverySlot, SystemSetting } from "@/lib/commerce/models";
import { deliveryRules } from "@/lib/commerce/service";
import { paymentsEnabled } from "@/lib/payments/provider";
import { formatPrice } from "@/lib/display";
import { ActionForm } from "@/components/action-form";
import { PageHeading } from "@/components/page-heading";
import {
  serviceAreaAction,
  slotAction,
  rulesAction,
  synonymAction,
  stockThresholdAction,
} from "@/lib/admin/actions";
import { MoneyInput } from "@/components/money-input";
export const metadata = { title: "Store settings", robots: { index: false } };

export default async function StoreSettings() {
  await requirePage("settings:write");
  const [areas, rules, slots, synonyms, stockThreshold] = await Promise.all([
    ServiceArea.find({}).sort({ name: 1 }),
    deliveryRules(),
    DeliverySlot.find({}).sort({ date: 1 }).limit(50),
    SearchSynonym.find({}).limit(100),
    SystemSetting.findOne({ key: "large-stock-threshold" }).select("value"),
  ]);
  const live = areas.filter((area) => area.enabled);
  return (
    <section className="page-container">
      <PageHeading
        eyebrow="Owner"
        title="Store settings"
        lead="How delivery works, where you deliver and which changes need a second look. Changes apply at checkout straight away."
      />

      <section className="settings-section" aria-labelledby="delivery-heading">
        <div className="settings-intro">
          <h2 id="delivery-heading">Delivery</h2>
          <p>
            When orders still go out the same day, when delivery is free, and
            the days the store is closed.
          </p>
          <p className={live.length ? "muted" : "notice"}>
            {live.length
              ? `Delivering to ${live.map((area) => area.name).join(", ")}.`
              : "No area is switched on yet, so checkout cannot deliver anywhere."}
          </p>
        </div>
        <div className="settings-cards">
          <div className="panel">
            <h2>Delivery rules</h2>
            <ActionForm action={rulesAction} submit="Save rules">
              <label>
                Same-day delivery for orders placed before
                <select name="cutoffHour" defaultValue={rules.cutoffHour}>
                  {Array.from({ length: 24 }, (_, hour) => (
                    <option key={hour} value={hour}>
                      {`${hour % 12 || 12}:00 ${hour < 12 ? "AM" : "PM"}`}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Free delivery from (₹)
                <MoneyInput
                  name="freeThresholdRupees"
                  defaultValue={rules.freeThresholdPaise / 100}
                />
              </label>
              <label>
                Closed dates <small>YYYY-MM-DD, separated by commas</small>
                <input
                  name="blackoutDates"
                  defaultValue={rules.blackoutDates.join(",")}
                />
              </label>
              <fieldset className="day-picker">
                <legend>Closed every week on</legend>
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                  (day, index) => (
                    <label key={day} className="checkbox-label">
                      <input
                        type="checkbox"
                        name="holidays"
                        value={index}
                        defaultChecked={rules.holidays.includes(index)}
                      />
                      {day}
                    </label>
                  ),
                )}
              </fieldset>
            </ActionForm>
          </div>
          <div className="panel">
            <h2>Delivery slots</h2>
            {live.length ? (
              <ActionForm action={slotAction} submit="Add slot">
                <label>
                  Area
                  <select name="areaId">
                    {live.map((area) => (
                      <option key={String(area._id)} value={String(area._id)}>
                        {area.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Date
                  <input name="date" type="date" required />
                </label>
                <label>
                  Delivery window
                  <input
                    name="label"
                    placeholder="4:00 PM – 7:00 PM"
                    minLength={5}
                    required
                  />
                </label>
                <label>
                  Orders it can take
                  <input
                    name="capacity"
                    type="number"
                    min={1}
                    max={10000}
                    defaultValue={20}
                  />
                </label>
              </ActionForm>
            ) : (
              <p className="muted">
                Switch on a delivery area below before adding slots.
              </p>
            )}
            {slots.length > 0 && (
              <ul className="settings-list">
                {slots.map((slot) => (
                  <li key={String(slot._id)}>
                    <span>
                      {slot.date} · {slot.label}
                    </span>
                    <small>
                      {slot.reserved}/{slot.capacity} booked
                    </small>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section className="settings-section" aria-labelledby="areas-heading">
        <div className="settings-intro">
          <h2 id="areas-heading">Service areas</h2>
          <p>
            The PIN codes you deliver to, what delivery costs there, and whether
            cash on delivery is allowed.
          </p>
          <p className="muted">
            Only switch on PIN codes the store has confirmed it can serve.
          </p>
        </div>
        <div className="settings-cards settings-cards-grid">
          {areas.map((area) => (
            <details
              className="panel"
              key={String(area._id)}
              open={area.enabled}
            >
              <summary>
                <span>
                  {area.name}
                  <small
                    className={`staff-state ${area.enabled ? "active" : "inactive"}`}
                  >
                    {area.enabled
                      ? `On · ${formatPrice(area.feePaise)} delivery${area.codEnabled ? " · COD" : ""}`
                      : "Off"}
                  </small>
                </span>
              </summary>
              <ActionForm action={serviceAreaAction} submit="Save area">
                <input name="areaId" type="hidden" value={String(area._id)} />
                <label>
                  PIN codes, separated by commas
                  <input
                    name="pincodes"
                    defaultValue={area.pincodes.join(", ")}
                    placeholder="Confirmed service PIN codes"
                    required
                  />
                </label>
                <label>
                  Delivery fee (₹)
                  <MoneyInput
                    name="feeRupees"
                    defaultValue={area.feePaise / 100}
                  />
                </label>
                <label>
                  Largest cash-on-delivery order (₹)
                  <MoneyInput
                    name="codLimitRupees"
                    defaultValue={area.codLimitPaise / 100}
                  />
                </label>
                <label>
                  <input
                    type="checkbox"
                    name="enabled"
                    defaultChecked={area.enabled}
                  />{" "}
                  Deliver to this area
                </label>
                <label>
                  <input
                    type="checkbox"
                    name="codEnabled"
                    defaultChecked={area.codEnabled}
                  />{" "}
                  Accept cash on delivery
                </label>
              </ActionForm>
            </details>
          ))}
        </div>
      </section>

      <section className="settings-section" aria-labelledby="checks-heading">
        <div className="settings-intro">
          <h2 id="checks-heading">Checks and search</h2>
          <p>
            Which stock changes wait for a second owner, which words shoppers
            can search with, and which outside services are connected.
          </p>
        </div>
        <div className="settings-cards">
          <div className="panel">
            <h2>Stock changes that need approval</h2>
            <p className="muted">
              A stock adjustment of this many units or more waits for a second
              owner to approve it.
            </p>
            <ActionForm action={stockThresholdAction} submit="Save limit">
              <label>
                Units
                <input
                  name="threshold"
                  type="number"
                  min={1}
                  max={100000}
                  defaultValue={Number(stockThreshold?.value ?? 100)}
                  required
                />
              </label>
            </ActionForm>
          </div>
          <div className="panel">
            <h2>Search words that mean the same</h2>
            <p className="muted">
              Shoppers who type any of these words see the same products.
            </p>
            <ActionForm action={synonymAction} submit="Save words">
              <label>
                Name for this group
                <input
                  name="key"
                  placeholder="notebook"
                  pattern="[a-z0-9-]+"
                  required
                />
              </label>
              <label>
                Words, separated by commas
                <textarea
                  name="terms"
                  placeholder="notebook, vahi, वही, copy"
                  required
                  maxLength={1000}
                />
              </label>
            </ActionForm>
            {synonyms.length > 0 && (
              <ul className="settings-list">
                {synonyms.map((group) => (
                  <li key={String(group._id)}>
                    <strong>{group.key}</strong>
                    <small>{group.synonyms.join(", ")}</small>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="panel integration-status">
            <h2>Connected services</h2>
            <p>
              <span
                className={`staff-state ${paymentsEnabled() ? "active" : "inactive"}`}
              >
                Razorpay {paymentsEnabled() ? "connected" : "test mode only"}
              </span>
            </p>
            <p>
              <span
                className={`staff-state ${process.env.CLOUDINARY_CLOUD_NAME ? "active" : "inactive"}`}
              >
                Cloudinary{" "}
                {process.env.CLOUDINARY_CLOUD_NAME
                  ? "connected"
                  : "local storage only"}
              </span>
            </p>
            <p>
              <span
                className={`staff-state ${process.env.SMS_API_URL ? "active" : "inactive"}`}
              >
                SMS {process.env.SMS_API_URL ? "connected" : "test codes only"}
              </span>
            </p>
            <p className="muted">
              Keys live in the deployment settings and are never shown here.
            </p>
          </div>
        </div>
      </section>
    </section>
  );
}
