import { connectDB } from "../db/connect";
import { ServiceArea } from "../db/models";
import { Order } from "../commerce/models";
import { deliveryRules } from "../commerce/service";
import { liveAreaNames } from "../commerce/areas";
import { paymentsEnabled } from "../payments/provider";
import { catalog, type CatalogItem } from "../catalog/queries";
import { productImages } from "../catalog/images";
import { customerStage, formatPrice } from "../display";
import type { Locale } from "../locale-types";
import { assistantCopy, joinList } from "./copy";
import { matchIntent, pinIn, productQuery } from "./intents";
import type { AssistantProduct, AssistantReply, Bubble, Intent } from "./types";

/*
 * The shop assistant's answers. Facts come from the live settings (cutoff, fees, areas,
 * payments), so they stay right when the owner changes them; anything that isn't a known
 * topic is a product search over what shoppers can see. Nothing here is stored.
 */

const cutoffText = (hour: number) => `${hour % 12 || 12} ${hour >= 12 ? "PM" : "AM"}`;

async function deliveryFacts() {
  await connectDB();
  const [rules, areas, cheapest] = await Promise.all([
    deliveryRules(),
    liveAreaNames(),
    ServiceArea.findOne({ enabled: true }).sort({ feePaise: 1 }).select("feePaise"),
  ]);
  return { rules, areas, minFeePaise: Number(cheapest?.feePaise ?? 0) };
}

async function deliveryAnswer(locale: Locale): Promise<Bubble[]> {
  const t = assistantCopy[locale];
  const { rules, areas, minFeePaise } = await deliveryFacts();
  if (!areas.length)
    return [{ kind: "text", text: t.deliveryNoAreas, links: [{ href: "/serviceability", label: t.checkPin }] }];
  const closed = rules.holidays.length
    ? ` ${t.deliveryClosed(joinList([...rules.holidays].sort().map((day) => t.days[day]), t.and))}`
    : "";
  return [
    {
      kind: "text",
      text: `${t.deliveryAreas(joinList(areas, t.and), cutoffText(rules.cutoffHour))}${closed} ${t.deliveryFees(
        formatPrice(rules.freeThresholdPaise),
        formatPrice(minFeePaise),
      )}`,
      links: [{ href: "/serviceability", label: t.checkPin }],
    },
    { kind: "text", text: t.deliveryPinHint },
  ];
}

async function pinAnswer(pin: string, locale: Locale): Promise<Bubble[]> {
  const t = assistantCopy[locale];
  const { rules, areas } = await deliveryFacts();
  const area = await ServiceArea.findOne({ enabled: true, pincodes: pin }).select("name feePaise");
  if (area)
    return [
      {
        kind: "text",
        text: t.pinYes(pin, area.name, formatPrice(Number(area.feePaise ?? 0)), formatPrice(rules.freeThresholdPaise)),
      },
    ];
  return [
    {
      kind: "text",
      text: areas.length ? `${t.pinNo(pin)} ${t.pinNoAreas(joinList(areas, t.and))}` : t.pinNo(pin),
      links: [{ href: `/serviceability?pin=${pin}`, label: t.checkPin }],
    },
  ];
}

async function orderAnswer(userId: string | undefined, locale: Locale): Promise<Bubble[]> {
  const t = assistantCopy[locale];
  if (!userId) return [{ kind: "sign-in", text: t.orderSignIn }];
  await connectDB();
  const orders = await Order.find({ customerId: userId })
    .sort({ createdAt: -1 })
    .limit(3)
    .select("number totalPaise orderStatus fulfilmentStatus deliveryStatus paymentMethod paymentStatus codStatus");
  if (!orders.length) return [{ kind: "text", text: t.orderNone, links: [{ href: "/catalog", label: t.seeAll }] }];
  return [
    {
      kind: "text",
      text: t.orderList,
      links: orders.map((order) => ({
        href: `/account/orders/${order._id}`,
        label: `${order.number} · ${customerStage(order, locale).label} · ${formatPrice(order.totalPaise)}`,
      })),
    },
    { kind: "handoff", text: t.orderHelp },
  ];
}

function productCard(item: CatalogItem, locale: Locale): AssistantProduct {
  const variant = item.variants.find((v) => v.available > 0) ?? item.variants[0];
  return {
    variantId: variant.id,
    slug: item.slug,
    name: item.name[locale] || item.name.en,
    label: variant.label,
    image: item.image ?? productImages[item.slug],
    categorySlug: item.categorySlug,
    pricePaise: variant.pricePaise,
    mrpPaise: variant.mrpPaise,
    available: variant.available,
    maxQuantity: variant.maxQuantity,
  };
}

async function productAnswer(text: string, locale: Locale): Promise<Bubble[]> {
  const t = assistantCopy[locale];
  const q = productQuery(text);
  if (q.length < 2) return [{ kind: "text", text: t.tooShort }, { kind: "chips" }];
  const found = await catalog({ q });
  // what can be bought today first, keeping the search's own order otherwise
  const items = [...found]
    .sort((a, b) => Number(b.variants.some((v) => v.available > 0)) - Number(a.variants.some((v) => v.available > 0)))
    .slice(0, 3);
  if (!items.length) return [{ kind: "text", text: t.notFound(q) }, { kind: "chips" }];
  return [
    { kind: "text", text: t.found },
    {
      kind: "products",
      items: items.map((item) => productCard(item, locale)),
      more: found.length > items.length ? { href: `/catalog?${new URLSearchParams({ q })}`, label: t.seeAll } : undefined,
    },
  ];
}

/** One answer to a typed message, or to a topic chip. */
export async function assistantReply(input: {
  text?: string;
  intent?: Intent;
  userId?: string;
  locale: Locale;
}): Promise<AssistantReply> {
  const { locale, userId } = input;
  const t = assistantCopy[locale];
  const text = (input.text ?? "").trim().slice(0, 300);
  const intent = input.intent ?? matchIntent(text);
  let bubbles: Bubble[];
  switch (intent) {
    case "delivery":
      bubbles = await deliveryAnswer(locale);
      break;
    case "pin":
      bubbles = await pinAnswer(pinIn(text) ?? "", locale);
      break;
    case "payment":
      bubbles = [{ kind: "text", text: t.payment(paymentsEnabled()) }];
      break;
    case "order":
      bubbles = await orderAnswer(userId, locale);
      break;
    case "returns":
      bubbles = userId
        ? [{ kind: "text", text: t.returns, links: [{ href: "/account/complaints", label: t.returnsLink }] }]
        : [{ kind: "text", text: t.returns }, { kind: "sign-in", text: t.returnsSignIn }];
      break;
    case "school":
      bubbles = [
        { kind: "text", text: t.school, links: userId ? [{ href: "/school", label: t.schoolLink }] : undefined },
        userId ? { kind: "handoff", text: t.handoff, question: text || undefined } : { kind: "sign-in", text: t.humanSignIn },
      ];
      break;
    case "human":
      bubbles = userId
        ? [{ kind: "handoff", text: t.handoff, question: text && !matchesTopicOnly(text) ? text : undefined }]
        : [{ kind: "sign-in", text: t.humanSignIn }];
      break;
    case "greeting":
      bubbles = [{ kind: "text", text: t.greeting }, { kind: "chips" }];
      break;
    case "thanks":
      bubbles = [{ kind: "text", text: t.thanks }, { kind: "chips" }];
      break;
    default:
      bubbles = await productAnswer(text, locale);
  }
  return { bubbles };
}

/** "Talk to the store" on its own isn't a question worth sending to the staff. */
function matchesTopicOnly(text: string) {
  return text.split(/\s+/).length <= 4;
}
