import Link from "next/link";
import type { ReactNode } from "react";
import { BILL_STYLES, type SectionKey } from "@/lib/settings/shop";
import { CustomizeForm } from "./customize-form";
import { BillStyles } from "./bill-styles";

export const CUSTOMIZE_TITLES: Record<SectionKey, string> = {
  bill: "Bills",
  slip: "Packing slips",
  quotation: "School quotations",
  payments: "Paying at the door",
  storefront: "Shop front and colours",
  messages: "Customer messages",
  numbers: "Order and quotation numbers",
  defaults: "Form defaults",
  queues: "Work queue timings",
  team: "Developer and team",
};

function Section({
  id,
  values,
  submit,
  children,
  before,
}: {
  id: SectionKey;
  values: Record<string, unknown>;
  submit: string;
  children: ReactNode;
  /** A panel above the section's form (the bill styles). */
  before?: ReactNode;
}) {
  return (
    <section className="settings-section" aria-labelledby={`${id}-heading`} id={id} tabIndex={-1} data-settings-section>
      <div className="settings-intro">
        <h2 id={`${id}-heading`}>{CUSTOMIZE_TITLES[id]}</h2>
        {children}
      </div>
      <div className="settings-cards">
        {before}
        <div className="panel">
          <CustomizeForm section={id} values={values} submit={submit} />
        </div>
      </div>
    </section>
  );
}

/** What used to be the Customize page: how bills, slips and the shop front look, and staff defaults. */
export function CustomizeSections({ saved, tech }: { saved: Record<SectionKey, Record<string, unknown>>; tech: boolean }) {
  return (
    <>
      <Section id="storefront" values={saved.storefront} submit="Save shop front">
        <p>The colour theme, the announcement bar, the strip at the top of the shop, the home page’s words, the footer and how the shop shows up in Google.</p>
      </Section>
      <Section id="messages" values={saved.messages} submit="Save customer messages">
        <p>The notification customers get on their phone or computer as their order moves along.</p>
      </Section>
      <Section
        id="bill"
        values={saved.bill}
        submit="Save bill settings"
        before={<BillStyles current={String(saved.bill.style)} />}
      >
        <p>
          What the customer’s bill shows and how it prints. The shop’s name, address, phone and GSTIN come from{" "}
          <a href="#tax">Business and tax details</a>; each product’s GST rate from its own page.
        </p>
        <p>
          Bills print in the <strong>{billStyleName(saved.bill.style)}</strong> style.{" "}
          <a href="/api/invoices/sample" target="_blank" rel="noreferrer">
            See a sample bill
          </a>
          .
        </p>
      </Section>
      <Section id="slip" values={saved.slip} submit="Save packing slip settings">
        <p>The sheet packers print from an order’s page with Print packing slip.</p>
      </Section>
      <Section id="quotation" values={saved.quotation} submit="Save quotation settings">
        <p>
          How long a new quotation is valid, the bank details schools pay into and the bottom of every quotation. A
          quotation keeps what it was sent with.
        </p>
      </Section>
      <Section id="payments" values={saved.payments} submit="Save">
        <p>How customers can pay the delivery partner for a cash-on-delivery order.</p>
        {saved.quotation.upiId ? (
          <p>
            UPI payments go to <strong>{String(saved.quotation.upiId)}</strong>. <a href="#quotation">Change the UPI ID</a> in School
            quotations.
          </p>
        ) : (
          <p className="notice">
            Add the shop’s UPI ID first, in <a href="#quotation">School quotations → UPI ID</a>. Until then delivery partners
            take cash only.
          </p>
        )}
      </Section>
      <Section id="numbers" values={saved.numbers} submit="Save numbering">
        <p>The letters at the start of order and quotation numbers. Numbers already given out never change.</p>
      </Section>
      <Section id="defaults" values={saved.defaults} submit="Save defaults">
        <p>What a new pack, service area, delivery time or offer starts with, and how many days Analytics opens on. Staff can still change each one.</p>
      </Section>
      <Section id="queues" values={saved.queues} submit="Save timings">
        <p>
          When an item in the <Link href="/admin">Overview</Link> work queue counts as late and moves up the list.
        </p>
      </Section>
      {tech && (
        <Section id="team" values={saved.team} submit="Save developer and team">
          <p>
            The &ldquo;Developed by&rdquo; card at the bottom of every shop page and the <a href="/p/team">team page</a>, with the
            ways people can reach you. A contact left blank is left off. Only Tech can change this.
          </p>
        </Section>
      )}
    </>
  );
}

export const billStyleName = (style: unknown) =>
  BILL_STYLES.find((option) => option.value === style)?.label.replace(/\s*\(.*\)$/, "") ?? "Modern";
