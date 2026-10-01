"use client";

/**
 * `retry()` fetches the page again; the old `reset()` only re-drew the same broken result, so
 * "Try again" never recovered. A full reload is offered too: after a new version goes live, the
 * open page can be too old to recover in place.
 */
export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div className="auth-card empty-state utility-card">
      <span className="eyebrow">SOMETHING WENT WRONG</span>
      <h1>This page needs another try.</h1>
      <p>Your basket and account are safe. Check your connection, then try again.</p>
      <div className="split-actions">
        <button className="primary-button" type="button" onClick={() => retry()}>
          Try again
        </button>
        <button className="secondary-button" type="button" onClick={() => window.location.reload()}>
          Reload page
        </button>
      </div>
      {error.digest && <p className="muted">Reference: {error.digest}</p>}
    </div>
  );
}
