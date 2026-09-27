import Link from "next/link";
export const metadata = { title: "Access restricted", robots: { index: false } };

export default function Forbidden() {
  return (
    <section className="auth-card empty-state utility-card">
      <span className="eyebrow">PERMISSION REQUIRED</span>
      <h1>Access restricted</h1>
      <p>Your account does not have permission to open this page.</p>
      <Link className="primary-button" href="/account">Go to your account</Link>
    </section>
  );
}
