const escape = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** The "confirm your email" message. Plain HTML with inline styles, which is what email clients render reliably. */
export function verificationEmail(name: string, url: string) {
  const who = escape(name || "there");
  const link = escape(url);
  return {
    subject: "Confirm your email for Agarwal Online",
    text: `Hello ${name || "there"},\n\nConfirm this email address for your Agarwal Online account:\n${url}\n\nThe link works for 24 hours. If you didn't create an account with us, ignore this email.\n\nAgarwal Online, Nagothane`,
    html: `<!doctype html><html><body style="margin:0;padding:24px;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:10px">
<tr><td style="padding:28px">
<p style="margin:0 0 18px;font-size:20px;font-weight:700">Agarwal <span style="font-size:11px;letter-spacing:2px;color:#64748b;font-weight:600">ONLINE</span></p>
<p style="margin:0 0 12px;font-size:16px">Hello ${who},</p>
<p style="margin:0 0 22px;font-size:15px;line-height:1.5">Confirm this email address for your account. It lets you sign in with Google and get order updates by email.</p>
<p style="margin:0 0 22px"><a href="${link}" style="display:inline-block;padding:12px 22px;background:#1e3a8a;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600">Confirm my email</a></p>
<p style="margin:0 0 6px;font-size:13px;color:#64748b">The link works for 24 hours. If the button doesn't work, open this address:</p>
<p style="margin:0 0 18px;font-size:12px;word-break:break-all"><a href="${link}" style="color:#1e3a8a">${link}</a></p>
<p style="margin:0;font-size:13px;color:#64748b">If you didn't create an account with us, ignore this email.</p>
</td></tr></table></body></html>`,
  };
}

/** A 6-digit code by email: to create an account with an email address, or to set a new password. */
export function codeEmail(code: string) {
  const digits = escape(code);
  return {
    subject: `${code} is your Agarwal Online code`,
    text: `Your Agarwal Online code is ${code}\n\nEnter it on the page where you asked for it. It works for 10 minutes. If you didn't ask for a code, ignore this email: nothing changes without it.\n\nAgarwal Online, Nagothane`,
    html: `<!doctype html><html><body style="margin:0;padding:24px;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:10px">
<tr><td style="padding:28px">
<p style="margin:0 0 18px;font-size:20px;font-weight:700">Agarwal <span style="font-size:11px;letter-spacing:2px;color:#64748b;font-weight:600">ONLINE</span></p>
<p style="margin:0 0 12px;font-size:15px;line-height:1.5">Your code is</p>
<p style="margin:0 0 22px;font-size:32px;font-weight:700;letter-spacing:8px">${digits}</p>
<p style="margin:0 0 6px;font-size:13px;color:#64748b">Enter it on the page where you asked for it. It works for 10 minutes.</p>
<p style="margin:0;font-size:13px;color:#64748b">If you didn't ask for a code, ignore this email: nothing changes without it.</p>
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
<p style="margin:0 0 18px;font-size:20px;font-weight:700">Agarwal <span style="font-size:11px;letter-spacing:2px;color:#64748b;font-weight:600">ONLINE</span></p>
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

/** The owners' daily low-stock email; the full list is the attached Excel file. */
export function lowStockEmail(input: { name: string; rows: { product: string; pack: string; available: number; alertBelow: number }[]; day: string }) {
  const shown = input.rows.slice(0, 25);
  const more = input.rows.length - shown.length;
  const subject = input.rows.length
    ? `Low stock: ${input.rows.length} ${input.rows.length === 1 ? "pack needs" : "packs need"} reordering (${input.day})`
    : `Low stock: nothing running low (${input.day})`;
  const line = (row: (typeof shown)[number]) => `${row.product} (${row.pack}): ${row.available} left, alert below ${row.alertBelow}`;
  const text = [
    `Hello ${input.name || "there"},`,
    "",
    input.rows.length ? "These packs are running low:" : "Nothing is running low right now.",
    ...shown.map((row) => `- ${line(row)}`),
    ...(more > 0 ? [`and ${more} more in the attached Excel file`] : []),
    "",
    "The attached Excel file has every pack with its purchase price. Change alert levels on the Stock page.",
  ].join("\n");
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:10px">
<tr><td style="padding:28px">
<p style="margin:0 0 18px;font-size:20px;font-weight:700">Agarwal <span style="font-size:11px;letter-spacing:2px;color:#64748b;font-weight:600">ONLINE</span></p>
<p style="margin:0 0 12px;font-size:16px">Hello ${escape(input.name || "there")},</p>
<p style="margin:0 0 16px;font-size:15px;line-height:1.5">${input.rows.length ? `<strong>${input.rows.length}</strong> ${input.rows.length === 1 ? "pack is" : "packs are"} running low on ${escape(input.day)}.` : "Nothing is running low right now."}</p>
${shown.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;font-size:14px;border-top:1px solid #e2e8f0">
${shown.map((row) => `<tr><td style="padding:6px 0;border-bottom:1px solid #f1f5f9">${escape(row.product)} <span style="color:#64748b">${escape(row.pack)}</span></td><td style="padding:6px 0;border-bottom:1px solid #f1f5f9;text-align:right;white-space:nowrap;${row.available === 0 ? "color:#b91c1c;font-weight:700" : ""}">${row.available === 0 ? "Sold out" : `${row.available} left`}</td></tr>`).join("\n")}
${more > 0 ? `<tr><td colspan="2" style="padding:6px 0;color:#64748b">and ${more} more in the attached file</td></tr>` : ""}
</table>` : ""}
<p style="margin:0;font-size:13px;color:#64748b">The attached Excel file has every pack with its purchase price. Change alert levels on the Stock page.</p>
</td></tr></table></body></html>`;
  return { subject, text, html };
}
