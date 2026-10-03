/**
 * Runs once when the server starts. Opening the database connection to Atlas (address lookup,
 * TLS, choosing a server) took several seconds and used to land on the first visitor; now it
 * starts here, in the background, so the first page usually finds it open. Startup doesn't wait
 * for it, and a failure is simply retried by the first request that needs the database.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // a production build starts the server to prerender; it has no business with the database
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { connectDB } = await import("./lib/db/connect");
  void connectDB().catch(() => {});
}
