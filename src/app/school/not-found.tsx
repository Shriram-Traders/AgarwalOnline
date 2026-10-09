import Link from "next/link";

/** Not found inside the school marketplace: shown in its own header, with a way back into it. */
export default function SchoolNotFound() {
  return (
    <div className="auth-card empty-state">
      <span className="eyebrow">404</span>
      <h1>We couldn’t find that page.</h1>
      <p>The page may have moved, or it belongs to another school.</p>
      <div className="split-actions utility-actions">
        <Link className="primary-button" href="/school">
          School home
        </Link>
        <Link className="secondary-button" href="/">
          Shop for home
        </Link>
      </div>
    </div>
  );
}
