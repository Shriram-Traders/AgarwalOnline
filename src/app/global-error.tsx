"use client";

/**
 * Shown when the shared layout itself fails (for example a brief database hiccup while loading
 * the header's aisles or basket). It replaces the whole document, and the site's stylesheet is not
 * loaded here, so it carries its own few styles instead of Next's bare error screen.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const button = {
    minHeight: 44,
    padding: "0 20px",
    borderRadius: 999,
    font: "inherit",
    fontWeight: 600,
    cursor: "pointer",
  } as const;
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: 16,
          fontFamily: "system-ui, sans-serif",
          background: "#ffffff",
          color: "#0f172a",
        }}
      >
        <title>Agarwal General Stores</title>
        <main style={{ maxWidth: 420, textAlign: "center" }}>
          <p style={{ letterSpacing: "0.08em", fontSize: 12, fontWeight: 700, color: "#5b6170" }}>
            AGARWAL GENERAL STORES
          </p>
          <h1 style={{ fontSize: 26, margin: "8px 0" }}>The store didn’t load.</h1>
          <p style={{ color: "#5b6170" }}>
            Your basket and account are safe. Check your connection, then try again.
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginTop: 20 }}>
            <button
              type="button"
              onClick={() => retry()}
              style={{ ...button, border: 0, background: "#1e3a8a", color: "#fff" }}
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{ ...button, border: "1px solid #8a8f9c", background: "#fff", color: "#0f172a" }}
            >
              Reload page
            </button>
          </div>
          {error.digest && (
            <p style={{ marginTop: 16, fontSize: 12, color: "#5b6170" }}>Reference: {error.digest}</p>
          )}
        </main>
      </body>
    </html>
  );
}
