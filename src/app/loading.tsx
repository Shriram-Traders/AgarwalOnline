/** Placeholder shapes while a page streams in; only screen readers hear that it is loading. */
export default function Loading() {
  return (
    <div className="page-container" aria-busy="true">
      <div className="skeleton skeleton-title" />
      <div className="skeleton-grid">
        <div className="skeleton" />
        <div className="skeleton" />
        <div className="skeleton" />
      </div>
      <span className="sr-only" role="status">
        Loading
      </span>
    </div>
  );
}
