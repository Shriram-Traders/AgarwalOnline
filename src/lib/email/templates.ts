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
