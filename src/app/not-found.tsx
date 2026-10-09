import Link from "next/link";

export default function NotFound() {
  return (
    <div className="auth-card empty-state">
      <span className="eyebrow">404</span>
      <h1>We couldn’t find that page.</h1>
      <p>The page may have moved or the item is no longer listed.</p>
      <div className="split-actions utility-actions">
        <Link className="primary-button" href="/catalog">Browse the store</Link>
        <Link className="secondary-button" href="/">Go home</Link>
      </div>
    </div>
  );
}
