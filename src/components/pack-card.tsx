import type { ReactNode } from "react";
import Link from "next/link";
import { Bell, ChevronRight, Eye, type LucideIcon, Minus, Pencil, Plus, Receipt, School, Tag } from "lucide-react";
import { ActionForm } from "./action-form";
import { DeleteRow } from "./delete-row";
import { MoneyInput } from "./money-input";
import { StatusPill } from "./status-pill";
import { catalogManagementAction } from "@/lib/catalog/manage-actions";
import { formatPrice } from "@/lib/display";
import { governanceAction } from "@/lib/governance/actions";
import { DEFAULT_ALERT_BELOW, isLow } from "@/lib/inventory/low-stock";

type Pack = {
  _id: unknown;
  label: string;
  pricePaise: number;
  mrpPaise: number;
  costPaise?: number;
  schoolPricePaise?: number;
  maxQuantity: number;
  active?: boolean;
};
type Stock = { onHand?: number; reserved?: number; alertBelow?: number };

/** One setting of a pack: its name and value in a row that opens in place. Rows sharing a group open one at a time. */
function PackSetting({
  group,
  icon: Icon,
  name,
  value,
  children,
}: {
  group: string;
  icon: LucideIcon;
  name: string;
  value: ReactNode;
  children: ReactNode;
}) {
  return (
    <details className="pack-setting" name={group}>
      <summary>
        <Icon size={18} aria-hidden="true" />
        <span className="pack-setting-name">{name}</span>
        <span className="pack-setting-value">{value}</span>
        <ChevronRight className="pack-setting-chevron" size={16} aria-hidden="true" />
      </summary>
      <div className="pack-setting-body">{children}</div>
    </details>
  );
}

/** A pack on Edit product: its price and stock at the top, then a row for each setting. */
export function PackCard({
  pack,
  stock,
  owner,
  stockHref,
  deleteWaiting,
}: {
  pack: Pack;
  stock?: Stock;
  owner: boolean;
  stockHref: (mode: "add" | "remove") => string;
  deleteWaiting: boolean;
}) {
  const id = String(pack._id);
  const group = `pack-${id}`;
  const onHand = stock?.onHand ?? 0;
  const reserved = stock?.reserved ?? 0;
  const left = Math.max(0, onHand - reserved);
  const hidden = pack.active === false;
  const alertBelow = stock?.alertBelow;
  const profit = pack.costPaise != null ? pack.pricePaise - pack.costPaise : undefined;
  const packFields = (
    <>
      <input type="hidden" name="operation" value="pack" />
      <input type="hidden" name="variantId" value={id} />
    </>
  );
  return (
    <li id={group}>
      <div className="pack-row">
        <span>
          <strong>{pack.label}</strong>
          {hidden && <small>Hidden</small>}
        </span>
        <span className="pack-price">
          {formatPrice(pack.pricePaise)}
          {pack.mrpPaise > pack.pricePaise && <del>{formatPrice(pack.mrpPaise)}</del>}
        </span>
      </div>
      <div className="pack-stock">
        <span className="pack-stock-count">
          {left === 0 ? (
            <StatusPill tone="bad">Sold out</StatusPill>
          ) : isLow(left, alertBelow) ? (
            <StatusPill tone="warn">{left} left</StatusPill>
          ) : (
            <span>{left} in stock</span>
          )}
          {reserved > 0 && <small>{reserved} held for orders</small>}
        </span>
        {left > 0 && (
          <Link href={stockHref("remove")} scroll={false} className="secondary-button compact-button" aria-label={`Remove stock of ${pack.label}`}>
            <Minus size={16} aria-hidden="true" /> Remove
          </Link>
        )}
        <Link href={stockHref("add")} scroll={false} className="primary-button compact-button" aria-label={`Add stock of ${pack.label}`}>
          <Plus size={16} aria-hidden="true" /> Add
        </Link>
      </div>
      <PackSetting
        group={group}
        icon={Tag}
        name="Selling price"
        value={pack.mrpPaise > pack.pricePaise ? `${formatPrice(pack.pricePaise)}, MRP ${formatPrice(pack.mrpPaise)}` : formatPrice(pack.pricePaise)}
      >
        <ActionForm action={governanceAction} submit="Change price">
          <input type="hidden" name="operation" value="price" />
          <input type="hidden" name="variantId" value={id} />
          <label>
            Selling price (₹)
            <MoneyInput name="priceRupees" defaultValue={pack.pricePaise / 100} />
          </label>
          <label>
            MRP (₹)
            <MoneyInput name="mrpRupees" defaultValue={pack.mrpPaise / 100} />
          </label>
          <p className="muted">{owner ? "Shoppers see the new price at once." : "An owner approves price changes before shoppers see them."}</p>
        </ActionForm>
      </PackSetting>
      {owner && (
        <PackSetting
          group={group}
          icon={Receipt}
          name="Purchase price"
          value={pack.costPaise != null ? `${formatPrice(pack.costPaise)}, ${formatPrice(profit ?? 0)} profit` : "Not set"}
        >
          {profit != null && (
            <p className="muted">
              {formatPrice(profit)} profit a pack ({pack.pricePaise ? Math.round((profit / pack.pricePaise) * 100) : 0}%)
            </p>
          )}
          <ActionForm action={catalogManagementAction} submit="Save purchase price">
            <input type="hidden" name="operation" value="cost" />
            <input type="hidden" name="variantId" value={id} />
            <label>
              What you paid for one pack (₹) <small>Only owners see this. Leave blank to clear it.</small>
              <MoneyInput name="costRupees" defaultValue={pack.costPaise != null ? pack.costPaise / 100 : undefined} required={false} />
            </label>
          </ActionForm>
        </PackSetting>
      )}
      {owner && (
        <PackSetting
          group={group}
          icon={School}
          name="School price"
          value={pack.schoolPricePaise ? `${formatPrice(pack.schoolPricePaise)} + GST` : "On quotation"}
        >
          <ActionForm action={catalogManagementAction} submit="Save school price">
            <input type="hidden" name="operation" value="school-price" />
            <input type="hidden" name="variantId" value={id} />
            <label>
              School price before GST (₹) <small>Leave blank for “Price on quotation”</small>
              <MoneyInput
                name="schoolPriceRupees"
                defaultValue={pack.schoolPricePaise ? pack.schoolPricePaise / 100 : undefined}
                required={false}
              />
            </label>
          </ActionForm>
        </PackSetting>
      )}
      <PackSetting
        group={group}
        icon={Bell}
        name="Stock alert"
        value={alertBelow === 0 ? "Off" : `below ${alertBelow ?? DEFAULT_ALERT_BELOW}`}
      >
        <ActionForm action={catalogManagementAction} submit="Save alert">
          <input type="hidden" name="operation" value="alert" />
          <input type="hidden" name="variantId" value={id} />
          <label>
            Warn me when fewer than this can be sold <small>0 turns the warning off; blank uses the shop default of {DEFAULT_ALERT_BELOW}</small>
            <input
              name="alertBelow"
              inputMode="numeric"
              pattern="[0-9]{1,6}"
              defaultValue={alertBelow ?? ""}
              placeholder={String(DEFAULT_ALERT_BELOW)}
              autoComplete="off"
            />
          </label>
        </ActionForm>
      </PackSetting>
      <PackSetting group={group} icon={Pencil} name="Name and limit" value={`${pack.maxQuantity} per order`}>
        <ActionForm action={catalogManagementAction} submit="Save pack">
          {packFields}
          {!hidden && <input type="hidden" name="active" value="on" />}
          <label>
            Pack label <small>What shoppers see, like “Pack of 10”</small>
            <input name="label" defaultValue={pack.label} maxLength={40} required />
          </label>
          <label>
            Most one shopper can buy
            <input name="maxQuantity" inputMode="numeric" pattern="[0-9]{1,3}" defaultValue={pack.maxQuantity} required />
          </label>
        </ActionForm>
      </PackSetting>
      <PackSetting group={group} icon={Eye} name="On sale" value={hidden ? "Hidden" : "Yes"}>
        <ActionForm action={catalogManagementAction} submit="Save">
          {packFields}
          <input type="hidden" name="label" value={pack.label} />
          <input type="hidden" name="maxQuantity" value={pack.maxQuantity} />
          <label className="checkbox-label">
            <input type="checkbox" name="active" defaultChecked={!hidden} /> Shoppers can buy this pack
          </label>
        </ActionForm>
      </PackSetting>
      <DeleteRow
        target="pack"
        id={id}
        owner={owner}
        held={reserved}
        waiting={deleteWaiting}
        onHand={onHand}
        group={group}
        whenHeld={
          hidden ? undefined : (
            <ActionForm action={catalogManagementAction} submit="Hide it for now" buttonClassName="secondary-button">
              {packFields}
              <input type="hidden" name="label" value={pack.label} />
              <input type="hidden" name="maxQuantity" value={pack.maxQuantity} />
            </ActionForm>
          )
        }
      />
    </li>
  );
}
