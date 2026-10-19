import Link from "next/link";
import type { ReactNode } from "react";
import { requirePage } from "@/lib/auth/session";
import { PageHeading } from "@/components/page-heading";
import { SettingsFold } from "@/components/settings-fold";
import { shopSettings, SECTION_KEYS, type SectionKey } from "@/lib/settings/shop";
import { CustomizeForm } from "./_settings/customize-form";

export const metadata = { title: "Customize", robots: { index: false } };

const TITLES: Record<SectionKey, string> = {
  bill: "Bills",
  slip: "Packing slips",
  quotation: "School quotations",
  storefront: "Shop front",
  messages: "Customer messages",
  numbers: "Order and quotation numbers",
  defaults: "Form defaults",
  queues: "Work queue timings",
};

function Section({
  id,
  values,
  submit,
  children,
}: {
  id: SectionKey;
  values: Record<string, unknown>;
  submit: string;
  children: ReactNode;
}) {
  return (
    <section className="settings-section" aria-labelledby={`${id}-heading`} id={id} tabIndex={-1}>
      <div className="settings-intro">
        <h2 id={`${id}-heading`}>{TITLES[id]}</h2>
        <SettingsFold section={id} label={`settings for ${TITLES[id].toLowerCase()}`} />
        {children}
      </div>
      <div className="settings-cards">
        <div className="panel">
          <CustomizeForm section={id} values={values} submit={submit} />
        </div>
      </div>
    </section>
  );
}

export default async function CustomizePage() {
  await requirePage("settings:write");
  // straight from the database: the shop cache could still hold what was there before a save
  const saved = Object.fromEntries(
    await Promise.all(SECTION_KEYS.map(async (key) => [key, await shopSettings(key, true)] as const)),
  ) as Record<SectionKey, Record<string, unknown>>;
  return (
    <section className="page-container">
      <PageHeading
        eyebrow="Owner"
        title="Customize"
        lead="How bills, packing slips and quotations look, the shop front’s words, customer messages and the defaults staff start from. Each change applies as soon as it’s saved."
        aside={
          <a className="secondary-button" href="/api/invoices/sample" target="_blank" rel="noreferrer">
            Preview a bill
          </a>
        }
      />
      <nav className="customize-jump" aria-label="Customize sections">
        {SECTION_KEYS.map((key) => (
          <a key={key} href={`#${key}`}>
            {TITLES[key]}
          </a>
        ))}
      </nav>

      <Section id="bill" values={saved.bill} submit="Save bill settings">
        <p>
          What the customer’s bill shows and how it prints. The shop’s name, address, phone and GSTIN come from{" "}
          <Link href="/super-admin#tax">Business and tax details</Link>; each product’s GST rate from its own page.
        </p>
        <p>
          <a href="/api/invoices/sample" target="_blank" rel="noreferrer">
            Preview a sample bill
          </a>{" "}
          with what is saved now.
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
      <Section id="storefront" values={saved.storefront} submit="Save shop front">
        <p>The announcement bar, the strip at the top of the shop, the home page’s words, the footer and how the shop shows up in Google.</p>
      </Section>
      <Section id="messages" values={saved.messages} submit="Save customer messages">
        <p>The notification customers get on their phone or computer as their order moves along.</p>
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
    </section>
  );
}
