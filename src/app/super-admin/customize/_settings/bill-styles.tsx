import { ActionForm } from "@/components/action-form";
import { sampleBills } from "@/lib/documents/sample-bill";
import { billStyleAction } from "@/lib/settings/actions";
import { BILL_STYLES } from "@/lib/settings/shop";

// a bill page is about 860 px wide; at this scale a thumbnail fits a 160 px card, even on a phone
const SCALE = 0.18;
const PAGE = { width: 860, height: 1200 };

/**
 * Every bill style side by side, drawn from the real bill code with a sample order: open one full
 * size, or use it with one tap. The style in use is marked. Styled inline because globals.css is
 * shared with other work in progress.
 */
export async function BillStyles({ current }: { current: string }) {
  const cards = [
    ...BILL_STYLES.map((option) => ({
      key: option.value,
      name: option.label.replace(/\s*\(.*\)$/, ""),
      href: `/api/invoices/sample?style=${option.value}`,
      sample: { style: option.value, thumb: true },
    })),
    { key: "estimate", name: "Kaccha bill", href: "/api/invoices/sample?kind=estimate", sample: { estimate: true, thumb: true } },
  ];
  const pages = await sampleBills(cards.map((card) => card.sample));
  return (
    <section className="panel" aria-labelledby="bill-styles-heading">
      <h3 id="bill-styles-heading" style={{ margin: "0 0 4px" }}>
        Bill styles
      </h3>
      <p className="muted" style={{ margin: "0 0 12px", fontSize: "0.9rem" }}>
        Each is drawn from a sample order. Open one full size, or choose Use this style. A kaccha bill is always boxed.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
        {cards.map((card, index) => {
          const inUse = card.key === current;
          return (
            <figure
              key={card.key}
              style={{
                margin: 0,
                padding: 8,
                minWidth: 0,
                display: "grid",
                // one column no wider than the card, however long a button or name is
                gridTemplateColumns: "minmax(0, 1fr)",
                gap: 6,
                alignContent: "start",
                borderRadius: 12,
                border: inUse ? "2px solid var(--brand)" : "1px solid var(--line)",
                background: "var(--paper)",
              }}
            >
              <a
                href={card.href}
                target="_blank"
                rel="noreferrer"
                aria-label={`Open the ${card.name} bill full size`}
                style={{
                  display: "block",
                  position: "relative",
                  height: Math.round(PAGE.height * SCALE),
                  overflow: "hidden",
                  borderRadius: 8,
                  background: "#f1f0eb",
                }}
              >
                <iframe
                  srcDoc={pages[index]}
                  sandbox=""
                  title={`${card.name} bill`}
                  tabIndex={-1}
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    top: 0,
                    left: "50%",
                    width: PAGE.width,
                    height: PAGE.height,
                    marginLeft: -Math.round((PAGE.width * SCALE) / 2),
                    border: 0,
                    transform: `scale(${SCALE})`,
                    transformOrigin: "0 0",
                    pointerEvents: "none",
                  }}
                />
              </a>
              <figcaption style={{ display: "grid", gap: 4, fontSize: "0.85rem" }}>
                <strong>{card.name}</strong>
                {card.key === "estimate" && <span className="muted">Before delivery, from an order</span>}
                <a href={card.href} target="_blank" rel="noreferrer" style={{ display: "inline-block", padding: "3px 0" }}>
                  Open preview
                </a>
                {card.key !== "estimate" && (
                  // always here, so its "Bills now print in …" message stays once this card becomes the one in use
                  <ActionForm
                    action={billStyleAction}
                    submit={inUse ? "In use" : "Use this style"}
                    disabled={inUse}
                    // not "form-stack": that gives its button a 180 px minimum, wider than a card on a phone
                    className="bill-style-use"
                    buttonClassName="secondary-button compact-button"
                  >
                    <input type="hidden" name="style" value={card.key} />
                  </ActionForm>
                )}
              </figcaption>
            </figure>
          );
        })}
      </div>
    </section>
  );
}
