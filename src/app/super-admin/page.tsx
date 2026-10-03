import Link from "next/link";
import mongoose from "mongoose";
import { CalendarClock, MapPin, Plus } from "lucide-react";
import { requirePage } from "@/lib/auth/session";
import { ServiceArea, SearchSynonym } from "@/lib/db/models";
import { DeliverySlot, SlotPattern, SystemSetting } from "@/lib/commerce/models";
import { deliveryRules } from "@/lib/commerce/service";
import { istDate } from "@/lib/commerce/delivery";
import {
  DAYS_AHEAD,
  TIME_CHOICES,
  WEEKDAYS,
  clock,
  dayLabel,
  daysLabel,
  ensureSlots,
  slotGaps,
  stillBookable,
  windowLabel,
} from "@/lib/commerce/slots";
import { paymentsEnabled } from "@/lib/payments/provider";
import { formatPrice } from "@/lib/display";
import { ActionForm } from "@/components/action-form";
import { PageHeading } from "@/components/page-heading";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { StatusPill } from "@/components/status-pill";
import { RecordHistory } from "@/components/record-history";
import {
  serviceAreaAction,
  slotAction,
  slotAdjustAction,
  slotPatternAction,
  rulesAction,
  synonymAction,
  stockThresholdAction,
  taxDetailsAction,
} from "@/lib/admin/actions";
import { MoneyInput } from "@/components/money-input";
import { taxProfile } from "@/lib/tax/profile";
import { settingsHub } from "@/lib/admin/settings-summary";
import { SettingsHub } from "./_settings/settings-hub";
import { GST_STATES } from "@/lib/tax/gst";
export const metadata = { title: "Store settings", robots: { index: false } };

function TimeSelect({ name, label, defaultValue }: { name: string; label: string; defaultValue: number }) {
  return (
    <label>
      {label}
      <select name={name} defaultValue={defaultValue}>
        {TIME_CHOICES.map((minutes) => (
          <option key={minutes} value={minutes}>
            {clock(minutes)}
          </option>
        ))}
      </select>
    </label>
  );
}

function DayPicker({ checked }: { checked: number[] }) {
  return (
    <fieldset className="day-picker">
      <legend>Days</legend>
      {WEEKDAYS.map((day, index) => (
        <label key={day} className="checkbox-label">
          <input type="checkbox" name="days" value={index} defaultChecked={checked.includes(index)} />
          {day}
        </label>
      ))}
    </fieldset>
  );
}

function CapacityInput({ defaultValue = 20 }: { defaultValue?: number }) {
  return (
    <label>
      Orders it can take
      <input name="capacity" inputMode="numeric" pattern="[0-9]{1,5}" defaultValue={defaultValue} required />
    </label>
  );
}

export default async function StoreSettings({
  searchParams,
}: {
  searchParams: Promise<{ area?: string; pattern?: string; slot?: string; slots?: string }>;
}) {
  await requirePage("settings:write");
  const params = await searchParams;
  // weekly delivery times become bookable slots two weeks ahead
  await ensureSlots();
  const now = new Date();
  const today = istDate(now);
  const until = new Date(`${today}T00:00:00Z`);
  until.setUTCDate(until.getUTCDate() + DAYS_AHEAD);
  const slotArea = params.slots && mongoose.isValidObjectId(params.slots) ? params.slots : undefined;
  const [areas, rules, patterns, upcoming, synonyms, stockThreshold, gaps, business] = await Promise.all([
    ServiceArea.find({}).sort({ name: 1 }),
    deliveryRules(),
    SlotPattern.find({}).sort({ startMinutes: 1 }),
    DeliverySlot.find({
      date: { $gte: today, $lte: until.toISOString().slice(0, 10) },
      ...(slotArea ? { areaId: slotArea } : {}),
    })
      .sort({ date: 1, startMinutes: 1, label: 1 })
      .limit(300),
    SearchSynonym.find({}).limit(100),
    SystemSetting.findOne({ key: "large-stock-threshold" }).select("value"),
    slotGaps(now),
    taxProfile(),
  ]);
  const live = areas.filter((area) => area.enabled);
  const areaName = new Map(areas.map((area) => [String(area._id), area.name as string]));
  const editingArea =
    params.area === "new"
      ? "new"
      : params.area && mongoose.isValidObjectId(params.area)
        ? areas.find((area) => String(area._id) === params.area)
        : undefined;
  const editingPattern =
    params.pattern && mongoose.isValidObjectId(params.pattern)
      ? patterns.find((pattern) => String(pattern._id) === params.pattern)
      : undefined;
  const editingSlot =
    params.slot && mongoose.isValidObjectId(params.slot)
      ? (upcoming.find((slot) => String(slot._id) === params.slot) ?? (await DeliverySlot.findById(params.slot)))
      : undefined;
  const slotState = (slot: (typeof upcoming)[number]) =>
    !slot.enabled
      ? { tone: "bad" as const, label: "Closed" }
      : !stillBookable(slot, now)
        ? { tone: "neutral" as const, label: "Time passed" }
        : slot.reserved >= slot.capacity
          ? { tone: "warn" as const, label: "Full" }
          : { tone: "ok" as const, label: "Open" };
  return (
    <section className="page-container">
      <PageHeading
        eyebrow="Owner"
        title="Store settings"
        lead="How delivery works, where you deliver and which changes need a second look. Changes apply at checkout straight away."
      />
      <SettingsHub
        cards={settingsHub({
          rules,
          areas,
          patterns,
          upcoming,
          gapAreas: gaps.areas.length && gaps.date ? gaps.areas : [],
          business: {
            legalName: business.legalName,
            gstin: business.gstin,
            stateName: GST_STATES.find((state) => state.code === business.stateCode)?.name,
          },
          stockThreshold: Number(stockThreshold?.value ?? 100),
          synonymGroups: synonyms.length,
          services: {
            payments: paymentsEnabled(),
            photos: Boolean(process.env.CLOUDINARY_CLOUD_NAME),
            sms: Boolean(process.env.SMS_API_URL),
          },
          today,
          weekdays: WEEKDAYS,
          daysAhead: DAYS_AHEAD,
        })}
      />

      <section className="settings-section" aria-labelledby="delivery-heading" id="delivery">
        <div className="settings-intro">
          <h2 id="delivery-heading">Delivery</h2>
          <p>
            When orders still go out the same day, when delivery is free, the days the store is closed and
            the delivery times shoppers can pick.
          </p>
          <p className={live.length ? "muted" : "notice"}>
            {live.length
              ? `Delivering to ${live.map((area) => area.name).join(", ")}.`
              : "No area is switched on yet, so checkout cannot deliver anywhere."}
          </p>
        </div>
        <div className="settings-cards">
          <div className="panel" id="delivery-rules" tabIndex={-1}>
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
                <MoneyInput name="freeThresholdRupees" defaultValue={rules.freeThresholdPaise / 100} />
              </label>
              <label>
                Closed dates <small>YYYY-MM-DD, separated by commas</small>
                <input name="blackoutDates" defaultValue={rules.blackoutDates.join(",")} />
              </label>
              <fieldset className="day-picker">
                <legend>Closed every week on</legend>
                {WEEKDAYS.map((day, index) => (
                  <label key={day} className="checkbox-label">
                    <input
                      type="checkbox"
                      name="holidays"
                      value={index}
                      defaultChecked={rules.holidays.includes(index)}
                    />
                    {day}
                  </label>
                ))}
              </fieldset>
            </ActionForm>
          </div>

          <div className="panel" id="weekly" tabIndex={-1}>
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Repeats every week</span>
                <h2>Delivery times</h2>
              </div>
            </div>
            <p className="muted">
              Set a time once, like Mon–Sat 4–7 PM, and slots for the next {DAYS_AHEAD} days are made
              automatically. Closed days are skipped.
            </p>
            {editingPattern && (
              <div className="panel adjust-panel" id="pattern">
                <div className="panel-heading">
                  <div>
                    <span className="eyebrow">{areaName.get(String(editingPattern.areaId)) ?? "Area"}</span>
                    <h3>{windowLabel(editingPattern.startMinutes, editingPattern.endMinutes)}</h3>
                  </div>
                  <Link href="/super-admin#weekly" className="text-button">
                    Close
                  </Link>
                </div>
                <ActionForm action={slotPatternAction} submit="Save delivery time">
                  <input type="hidden" name="operation" value="update" />
                  <input type="hidden" name="patternId" value={String(editingPattern._id)} />
                  <DayPicker checked={editingPattern.days} />
                  <CapacityInput defaultValue={editingPattern.capacity} />
                  <small className="muted">
                    To change the time itself, add the new time and remove this one.
                  </small>
                </ActionForm>
                <div className="split-actions">
                  <ActionForm
                    action={slotPatternAction}
                    submit={editingPattern.enabled ? "Pause delivery time" : "Resume delivery time"}
                    buttonClassName="secondary-button"
                    className="form-stack inline-grant"
                  >
                    <input type="hidden" name="operation" value={editingPattern.enabled ? "pause" : "resume"} />
                    <input type="hidden" name="patternId" value={String(editingPattern._id)} />
                  </ActionForm>
                  <ActionForm
                    action={slotPatternAction}
                    submit="Remove delivery time"
                    buttonClassName="secondary-button"
                    className="form-stack inline-grant"
                    confirmMessage="Its unbooked slots are taken away. Slots people already booked stay."
                  >
                    <input type="hidden" name="operation" value="remove" />
                    <input type="hidden" name="patternId" value={String(editingPattern._id)} />
                  </ActionForm>
                </div>
              </div>
            )}
            <DataTable
              bare
              caption="Weekly delivery times by area"
              rows={patterns}
              rowKey={(pattern) => String(pattern._id)}
              columns={[
                {
                  header: "Time",
                  cell: (pattern) => (
                    <Link href={`/super-admin?pattern=${pattern._id}#pattern`} className="nowrap">
                      {windowLabel(pattern.startMinutes, pattern.endMinutes)}
                    </Link>
                  ),
                },
                { header: "Area", cell: (pattern) => areaName.get(String(pattern.areaId)) ?? "—" },
                { header: "Days", cell: (pattern) => daysLabel(pattern.days) },
                { header: "Orders per slot", numeric: true, cell: (pattern) => pattern.capacity },
                {
                  header: "Status",
                  cell: (pattern) =>
                    pattern.enabled ? <StatusPill tone="ok">On</StatusPill> : <StatusPill>Paused</StatusPill>,
                },
              ]}
              empty={
                <p className="muted">No weekly delivery times yet. Add the first one below.</p>
              }
            />
            <h3 className="subheading" id="add-weekly" tabIndex={-1}>
              Add a weekly delivery time
            </h3>
            {areas.length ? (
              <ActionForm action={slotPatternAction} submit="Add delivery time">
                <input type="hidden" name="operation" value="create" />
                <label>
                  Area
                  <select name="areaId" defaultValue={String((live[0] ?? areas[0])._id)}>
                    {areas.map((area) => (
                      <option key={String(area._id)} value={String(area._id)}>
                        {area.name}
                        {area.enabled ? "" : " (switched off)"}
                      </option>
                    ))}
                  </select>
                </label>
                <DayPicker checked={[1, 2, 3, 4, 5, 6]} />
                <div className="time-pair">
                  <TimeSelect name="startMinutes" label="From" defaultValue={16 * 60} />
                  <TimeSelect name="endMinutes" label="To" defaultValue={19 * 60} />
                </div>
                <CapacityInput />
              </ActionForm>
            ) : (
              <p className="muted">Add a delivery area below first.</p>
            )}
            {live.length > 0 && (
              <details className="one-off" id="one-off" tabIndex={-1}>
                <summary>Add a one-off delivery time on a single date</summary>
                <ActionForm action={slotAction} submit="Add one-off time">
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
                    <input name="date" type="date" min={today} required />
                  </label>
                  <div className="time-pair">
                    <TimeSelect name="startMinutes" label="From" defaultValue={16 * 60} />
                    <TimeSelect name="endMinutes" label="To" defaultValue={19 * 60} />
                  </div>
                  <CapacityInput />
                </ActionForm>
              </details>
            )}
          </div>
        </div>
      </section>

      <section className="settings-section" aria-labelledby="slots-heading" id="slots" tabIndex={-1}>
        <div className="settings-intro">
          <h2 id="slots-heading">Upcoming delivery slots</h2>
          <p>
            Every slot shoppers can pick over the next {DAYS_AHEAD} days. Close one to stop new
            orders in it; orders already booked stay.
          </p>
        </div>
        <div className="settings-cards">
          {editingSlot && (
            <div className="panel adjust-panel" id="slot">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">
                    {areaName.get(String(editingSlot.areaId)) ?? "Area"} · {dayLabel(editingSlot.date, now)}
                  </span>
                  <h3>{editingSlot.label}</h3>
                </div>
                <Link href="/super-admin#slots" className="text-button">
                  Close
                </Link>
              </div>
              <p className="muted">{editingSlot.reserved} booked so far.</p>
              <ActionForm action={slotAdjustAction} submit="Save size">
                <input type="hidden" name="operation" value="capacity" />
                <input type="hidden" name="slotId" value={String(editingSlot._id)} />
                <CapacityInput defaultValue={editingSlot.capacity} />
              </ActionForm>
            </div>
          )}
          <form className="audit-filters" role="search" aria-label="Filter slots by area" action="/super-admin#slots">
            <label>
              Area
              <select name="slots" defaultValue={slotArea ?? ""}>
                <option value="">All areas</option>
                {areas.map((area) => (
                  <option key={String(area._id)} value={String(area._id)}>
                    {area.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="primary-button">Show slots</button>
          </form>
          <DataTable
            caption="Delivery slots over the next two weeks, with bookings"
            rows={upcoming}
            rowKey={(slot) => String(slot._id)}
            columns={[
              { header: "Day", cell: (slot) => <strong>{dayLabel(slot.date, now)}</strong> },
              { header: "Time", cell: (slot) => <span className="nowrap">{slot.label}</span> },
              { header: "Area", cell: (slot) => areaName.get(String(slot.areaId)) ?? "—" },
              {
                header: "Booked",
                numeric: true,
                cell: (slot) => `${slot.reserved} of ${slot.capacity}`,
              },
              {
                header: "Status",
                cell: (slot) => {
                  const state = slotState(slot);
                  return <StatusPill tone={state.tone}>{state.label}</StatusPill>;
                },
              },
              {
                header: "Change",
                cell: (slot) => (
                  <span className="row-actions">
                    <ActionForm
                      action={slotAdjustAction}
                      submit={slot.enabled ? "Close" : "Reopen"}
                      className="form-stack inline-grant"
                      buttonClassName="secondary-button compact-button"
                    >
                      <input type="hidden" name="operation" value={slot.enabled ? "close" : "open"} />
                      <input type="hidden" name="slotId" value={String(slot._id)} />
                    </ActionForm>
                    <Link
                      href={`/super-admin?slot=${slot._id}${slotArea ? `&slots=${slotArea}` : ""}#slot`}
                      aria-label={`Change the size of ${dayLabel(slot.date, now)} ${slot.label}`}
                    >
                      Size
                    </Link>
                  </span>
                ),
              },
            ]}
            empty={
              <EmptyState
                icon={CalendarClock}
                title="No slots coming up"
                body="Add a weekly delivery time above and the slots appear here."
                heading="h3"
              />
            }
          />
        </div>
      </section>

      <section className="settings-section" aria-labelledby="areas-heading" id="areas" tabIndex={-1}>
        <div className="settings-intro">
          <h2 id="areas-heading">Service areas</h2>
          <p>
            The PIN codes you deliver to, what delivery costs there, and whether cash on delivery is
            allowed.
          </p>
          <p className="muted">Only switch on PIN codes the store has confirmed it can serve.</p>
          <Link href="/super-admin?area=new#area" className="primary-button">
            <Plus size={16} aria-hidden="true" /> Add delivery area
          </Link>
        </div>
        <div className="settings-cards">
          {editingArea && (
            <div className="panel adjust-panel" id="area">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">{editingArea === "new" ? "New area" : "Edit area"}</span>
                  <h3>{editingArea === "new" ? "Add a delivery area" : editingArea.name}</h3>
                </div>
                <Link href="/super-admin#areas" className="text-button">
                  Close
                </Link>
              </div>
              <ActionForm
                action={serviceAreaAction}
                submit={editingArea === "new" ? "Add area" : "Save area"}
              >
                <input type="hidden" name="operation" value={editingArea === "new" ? "create" : "update"} />
                {editingArea !== "new" && (
                  <input name="areaId" type="hidden" value={String(editingArea._id)} />
                )}
                <label>
                  Area name
                  <input
                    name="name"
                    defaultValue={editingArea === "new" ? "" : editingArea.name}
                    placeholder="e.g. Nagothane"
                    minLength={2}
                    maxLength={60}
                    required
                  />
                </label>
                <label>
                  PIN codes, separated by commas
                  <input
                    name="pincodes"
                    defaultValue={editingArea === "new" ? "" : editingArea.pincodes.join(", ")}
                    placeholder="402106"
                    inputMode="numeric"
                    required
                  />
                </label>
                <label>
                  Delivery fee (₹)
                  <MoneyInput
                    name="feeRupees"
                    defaultValue={editingArea === "new" ? 30 : editingArea.feePaise / 100}
                  />
                </label>
                <label>
                  Largest cash-on-delivery order (₹)
                  <MoneyInput
                    name="codLimitRupees"
                    defaultValue={editingArea === "new" ? 5000 : editingArea.codLimitPaise / 100}
                  />
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    name="enabled"
                    defaultChecked={editingArea === "new" ? false : editingArea.enabled}
                  />
                  Deliver to this area
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    name="codEnabled"
                    defaultChecked={editingArea === "new" ? true : editingArea.codEnabled}
                  />
                  Accept cash on delivery
                </label>
              </ActionForm>
              {editingArea !== "new" && (
                <RecordHistory target={String(editingArea._id)} title="Changes to this area" />
              )}
            </div>
          )}
          <DataTable
            caption="Delivery areas with their PIN codes, fee and cash on delivery"
            rows={areas}
            rowKey={(area) => String(area._id)}
            columns={[
              {
                header: "Area",
                cell: (area) => (
                  <Link href={`/super-admin?area=${area._id}#area`}>
                    <strong>{area.name}</strong>
                  </Link>
                ),
              },
              {
                header: "Delivering",
                cell: (area) =>
                  area.enabled ? <StatusPill tone="ok">On</StatusPill> : <StatusPill tone="bad">Off</StatusPill>,
              },
              {
                header: "PIN codes",
                cell: (area) => (area.pincodes.length ? area.pincodes.join(", ") : "None yet"),
              },
              { header: "Delivery fee", numeric: true, cell: (area) => formatPrice(area.feePaise) },
              {
                header: "Cash on delivery",
                cell: (area) => (area.codEnabled ? `Up to ${formatPrice(area.codLimitPaise)}` : "Off"),
              },
            ]}
            empty={
              <EmptyState
                icon={MapPin}
                title="No delivery areas yet"
                body="Add the first area you deliver to, with its PIN codes."
                heading="h3"
                action={
                  <Link href="/super-admin?area=new#area" className="primary-button">
                    Add delivery area
                  </Link>
                }
              />
            }
          />
        </div>
      </section>

      <section className="settings-section" aria-labelledby="tax-heading" id="tax" tabIndex={-1}>
        <div className="settings-intro">
          <h2 id="tax-heading">Business and tax details</h2>
          <p>Printed at the top of every school quotation, with the GST worked out from your state.</p>
          {!business.gstin && (
            <p className="notice">
              No GSTIN yet. Quotations still go out, with a note that the GSTIN will be added.
            </p>
          )}
        </div>
        <div className="settings-cards">
          <div className="panel">
            <h2>On quotations</h2>
            <ActionForm action={taxDetailsAction} submit="Save business details">
              <label>
                Legal name <small>As registered for GST</small>
                <input name="legalName" defaultValue={business.legalName} maxLength={120} required />
              </label>
              <label>
                GSTIN <small>15 characters; leave blank until registered</small>
                <input
                  name="gstin"
                  defaultValue={business.gstin ?? ""}
                  maxLength={15}
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
              <label>
                Address
                <textarea name="address" defaultValue={business.address} maxLength={300} required />
              </label>
              <label>
                State <small>Decides CGST + SGST or IGST</small>
                <select name="stateCode" defaultValue={business.stateCode}>
                  {GST_STATES.map((state) => (
                    <option value={state.code} key={state.code}>
                      {state.name} ({state.code})
                    </option>
                  ))}
                </select>
              </label>
              <div className="staff-form-grid">
                <label>
                  Phone <small>Optional</small>
                  <input
                    name="phone"
                    defaultValue={business.phone ?? ""}
                    inputMode="numeric"
                    pattern="[0-9]{10}"
                    maxLength={10}
                    autoComplete="off"
                  />
                </label>
                <label>
                  Email <small>Optional</small>
                  <input name="email" type="email" defaultValue={business.email ?? ""} maxLength={120} />
                </label>
              </div>
              <label>
                Quotation terms <small>Optional, like payment terms; printed at the bottom</small>
                <textarea name="terms" defaultValue={business.terms ?? ""} maxLength={1000} />
              </label>
            </ActionForm>
          </div>
        </div>
      </section>

      <section className="settings-section" aria-labelledby="checks-heading" id="checks">
        <div className="settings-intro">
          <h2 id="checks-heading">Checks and search</h2>
          <p>
            Which stock changes wait for a second owner, which words shoppers can search with, and
            which outside services are connected.
          </p>
        </div>
        <div className="settings-cards">
          <div className="panel" id="stock-approval" tabIndex={-1}>
            <h2>Stock changes that need approval</h2>
            <p className="muted">
              A stock adjustment of this many units or more waits for a second owner to approve it.
            </p>
            <ActionForm action={stockThresholdAction} submit="Save limit">
              <label>
                Units
                <input
                  name="threshold"
                  inputMode="numeric"
                  pattern="[0-9]{1,6}"
                  defaultValue={Number(stockThreshold?.value ?? 100)}
                  required
                />
              </label>
            </ActionForm>
          </div>
          <div className="panel" id="synonyms" tabIndex={-1}>
            <h2>Search words that mean the same</h2>
            <p className="muted">Shoppers who type any of these words see the same products.</p>
            <ActionForm action={synonymAction} submit="Save words">
              <label>
                Name for this group
                <input name="key" placeholder="notebook" pattern="[a-z0-9-]+" required />
              </label>
              <label>
                Words, separated by commas
                <textarea name="terms" placeholder="notebook, vahi, वही, copy" required maxLength={1000} />
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
          <div className="panel integration-status" id="services" tabIndex={-1}>
            <h2>Connected services</h2>
            <p>
              <span className={`staff-state ${paymentsEnabled() ? "active" : "inactive"}`}>
                Razorpay {paymentsEnabled() ? "connected" : "not set up: cash on delivery only"}
              </span>
            </p>
            <p>
              <span className={`staff-state ${process.env.CLOUDINARY_CLOUD_NAME ? "active" : "inactive"}`}>
                Cloudinary {process.env.CLOUDINARY_CLOUD_NAME ? "connected" : "local storage only"}
              </span>
            </p>
            <p>
              <span className={`staff-state ${process.env.SMS_API_URL ? "active" : "inactive"}`}>
                SMS {process.env.SMS_API_URL ? "connected" : "test codes only"}
              </span>
            </p>
            <p className="muted">Keys live in the deployment settings and are never shown here.</p>
          </div>
        </div>
      </section>
    </section>
  );
}
