/**
 * The shop assistant is built but kept out of sight until the store is ready to introduce it.
 * Set SHOP_ASSISTANT=on (in .env, or in Vercel's settings) to show it on every shopper page.
 * The browser tests switch it on so it keeps working while it's hidden.
 */
export const shopAssistantEnabled = () => process.env.SHOP_ASSISTANT === "on";
