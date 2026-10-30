/** Shared by the bill layouts: everything printed goes through `escape`. */
export const escape = (value: unknown) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 });
/** Bills show paise, with Indian digit grouping: ₹1,234.00. */
export const money = (paise: number) => inr.format(paise / 100);

const plain = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** The same without the rupee sign, for a column already headed "(₹)": 1,234.00. */
export const amount = (paise: number) => plain.format(paise / 100);

export const dateOnly = (value: Date | string) =>
  new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
