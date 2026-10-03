/** What the shop assistant can talk about; the chips in the chat send these directly. */
export const TOPICS = ["order", "delivery", "payment", "returns", "school", "human"] as const;
export const INTENTS = [...TOPICS, "pin", "greeting", "thanks"] as const;
export type Topic = (typeof TOPICS)[number];
export type Intent = (typeof INTENTS)[number];

export type AssistantLink = { href: string; label: string };
export type AssistantProduct = {
  variantId: string;
  slug: string;
  name: string;
  label: string;
  image?: string;
  categorySlug: string;
  pricePaise: number;
  mrpPaise: number;
  available: number;
  maxQuantity: number;
};

/** One reply from the assistant. The shopper's own messages are added by the chat itself. */
export type Bubble =
  | { kind: "text"; text: string; links?: AssistantLink[] }
  | { kind: "products"; items: AssistantProduct[]; more?: AssistantLink }
  | { kind: "chips" }
  | { kind: "sign-in"; text: string }
  | { kind: "handoff"; text: string; question?: string };

export type AssistantReply = { bubbles: Bubble[] };
