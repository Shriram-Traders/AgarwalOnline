import { contactDoc } from "./contact";
import type { LegalKey } from "./pages";
import { privacyDoc } from "./privacy";
import { refundsDoc } from "./refunds";
import { shippingDoc } from "./shipping";
import { termsDoc } from "./terms";
import type { LegalBuilder } from "./types";

/** Each policy's text, by page. Server and tests only: the client forms need just `pages.ts`. */
export const LEGAL_DOCS: Record<LegalKey, LegalBuilder> = {
  privacy: privacyDoc,
  terms: termsDoc,
  refunds: refundsDoc,
  shipping: shippingDoc,
  contact: contactDoc,
};
