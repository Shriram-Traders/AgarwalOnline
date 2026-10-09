const escape = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** The "confirm your email" message. Plain HTML with inline styles, which is what email clients render reliably. */
export function verificationEmail(name: string, url: string) {
  const who = escape(name || "there");
  const link = escape(url);
  return {
    subject: "Confirm your email for Agarwal General Stores",
    text: `Hello ${name || "there"},\n\nConfirm this email address for your Agarwal General Stores account:\n${url}\n\nThe link works for 24 hours. If you didn't create an account with us, ignore this email.\n\nAgarwal General Stores, Nagothane`,
    html: `<!doctype html><html><body style="margin:0;padding:24px;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:10px">
<tr><td style="padding:28px">
<p style="margin:0 0 18px;font-size:20px;font-weight:700">Agarwal <span style="font-size:11px;letter-spacing:2px;color:#64748b;font-weight:600">GENERAL STORES</span></p>
<p style="margin:0 0 12px;font-size:16px">Hello ${who},</p>
<p style="margin:0 0 22px;font-size:15px;line-height:1.5">Confirm this email address for your account. It lets you sign in with Google and get order updates by email.</p>
<p style="margin:0 0 22px"><a href="${link}" style="display:inline-block;padding:12px 22px;background:#1e3a8a;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600">Confirm my email</a></p>
<p style="margin:0 0 6px;font-size:13px;color:#64748b">The link works for 24 hours. If the button doesn't work, open this address:</p>
<p style="margin:0 0 18px;font-size:12px;word-break:break-all"><a href="${link}" style="color:#1e3a8a">${link}</a></p>
<p style="margin:0;font-size:13px;color:#64748b">If you didn't create an account with us, ignore this email.</p>
</td></tr></table></body></html>`,
  };
}

const rupees = (paise: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 }).format(paise / 100);

/** A sent school quotation: the totals with GST, the first lines, and a link to the full quotation. */
export function quotationEmail(input: {
  repName: string;
  sellerName: string;
  schoolName: string;
  number: string;
  version: number;
  validUntil: string;
  lines: { name: string; label: string; quantity: number; taxablePaise: number; gstRatePercent: number }[];
  totals: { taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number; totalPaise: number };
  supply: "intra" | "inter";
  gstinMissing: boolean;
  url: string;
}) {
  const shown = input.lines.slice(0, 60);
  const more = input.lines.length - shown.length;
  const revised = input.version > 1;
  const subject = `${revised ? "Revised quotation" : "Quotation"} ${input.number}${revised ? ` (version ${input.version})` : ""} from ${input.sellerName}`;
  const taxLines =
    input.supply === "intra"
      ? [["CGST", input.totals.cgstPaise], ["SGST", input.totals.sgstPaise]] as const
      : [["IGST", input.totals.igstPaise]] as const;
  const text = [
    `Hello ${input.repName || "there"},`,
    "",
    `${input.sellerName} has sent ${revised ? "a revised" : "a"} quotation for ${input.schoolName}.`,
    `${input.number}, version ${input.version}, valid until ${input.validUntil}.`,
    "",
    ...shown.map((line) => `- ${line.name} (${line.label}) × ${line.quantity}: ${rupees(line.taxablePaise)} + ${line.gstRatePercent}% GST`),
    ...(more > 0 ? [`and ${more} more on the website`] : []),
    "",
    `Taxable value: ${rupees(input.totals.taxablePaise)}`,
    ...taxLines.map(([label, paise]) => `${label}: ${rupees(paise)}`),
    `Total: ${rupees(input.totals.totalPaise)}`,
    ...(input.gstinMissing ? ["", "The store's GSTIN will be added once registered."] : []),
    "",
    `See it or print it here; anyone you forward the link to can too. To accept it or ask for changes, sign in from that page: ${input.url}`,
  ].join("\n");
  const row = (label: string, value: string, strong = false) =>
    `<tr><td style="padding:4px 0;color:#475569">${escape(label)}</td><td style="padding:4px 0;text-align:right;${strong ? "font-weight:700;font-size:16px" : ""}">${escape(value)}</td></tr>`;
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:10px">
<tr><td style="padding:28px">
<p style="margin:0 0 18px;font-size:20px;font-weight:700">Agarwal <span style="font-size:11px;letter-spacing:2px;color:#64748b;font-weight:600">GENERAL STORES</span></p>
<p style="margin:0 0 12px;font-size:16px">Hello ${escape(input.repName || "there")},</p>
<p style="margin:0 0 18px;font-size:15px;line-height:1.5">${escape(input.sellerName)} has sent ${revised ? "a revised" : "a"} quotation for <strong>${escape(input.schoolName)}</strong>: <strong>${escape(input.number)}</strong>, version ${input.version}, valid until ${escape(input.validUntil)}.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 12px;font-size:14px;border-top:1px solid #e2e8f0">
${shown.map((line) => `<tr><td style="padding:6px 0;border-bottom:1px solid #f1f5f9">${escape(line.name)} <span style="color:#64748b">${escape(line.label)} × ${line.quantity}</span></td><td style="padding:6px 0;border-bottom:1px solid #f1f5f9;text-align:right;white-space:nowrap">${rupees(line.taxablePaise)} + ${line.gstRatePercent}%</td></tr>`).join("\n")}
${more > 0 ? `<tr><td colspan="2" style="padding:6px 0;color:#64748b">and ${more} more on the website</td></tr>` : ""}
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;font-size:14px">
${row("Taxable value", rupees(input.totals.taxablePaise))}
${taxLines.map(([label, paise]) => row(label, rupees(paise))).join("\n")}
${row("Total", rupees(input.totals.totalPaise), true)}
</table>
<p style="margin:0 0 22px"><a href="${escape(input.url)}" style="display:inline-block;padding:12px 22px;background:#1e3a8a;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600">View quotation</a></p>
<p style="margin:0 0 6px;font-size:13px;color:#64748b">Anyone you forward this link to can see and print the quotation. To accept it or ask for changes, sign in from that page. If the button doesn't work, open this address:</p>
<p style="margin:0 0 12px;font-size:12px;word-break:break-all"><a href="${escape(input.url)}" style="color:#1e3a8a">${escape(input.url)}</a></p>
${input.gstinMissing ? `<p style="margin:0;font-size:13px;color:#64748b">The store's GSTIN will be added once registered.</p>` : ""}
</td></tr></table></body></html>`;
  return { subject, text, html };
}
