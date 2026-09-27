<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Every UI change ships for desktop and phone

Anything new — a page, a section, a component, a form — must be designed for both widths in the same change, not "desktop now, phone later".

- Phone rules live in the `@media (max-width: 760px)` block of `src/app/globals.css` (tablet steps at 1023/900px). Reuse the phone patterns already there before inventing one: bottom tab bar, collapsing header (search stays pinned), swipe rails (`.home .product-grid`, `.hubs`), sticky basket bar, pinned buy bar on product pages, `DataTable` rows that become cards below 900px.
- Tap targets are at least 24px tall (44px for primary controls); no page may scroll sideways; fixed bars must not cover content (pad for `--bottom-nav-h` and `env(safe-area-inset-bottom)`).
- `tests/e2e/layout.spec.ts` finds every `page.tsx` under `src/app` and checks it at desktop (chromium) and phone (Pixel 7) width for sideways scroll, content running off the edge and small tap targets. A new dynamic route fails until it gets a sample there. Run it after any UI change: `npx playwright test tests/e2e/layout.spec.ts` (needs the local test MongoDB on 27028). `SHOT_DIR=.local/shots` also saves a screenshot of every page at both widths — look at them.

# Staff pages follow the same admin patterns

- A list of records is a `DataTable` with a `FilterBar` (search plus the one or two filters people need) and a count line; the first column is the record's name, linking to its own page or an `?edit=` panel above the table. Never render a stack of open edit forms or accordions, one per record.
- Page chrome is `PageHeading` (eyebrow "Run the store" or "Owner", a one-sentence lead, the primary action in `aside`) and a `breadcrumb` on detail pages.
- Money is typed in rupees with `MoneyInput` (named `…Rupees`, converted by `formWithPaise`); number-like fields use `inputMode` + `pattern`, not `type="number"`.
- Validation errors go through `plainMessage` in `src/lib/form-errors.ts`, so they name the field in plain English.
- `ActionForm confirmMessage` only for money, publishing or hard-to-undo actions; the dialog reads "<submit>?" with a "Yes, …" button.
- Times use `<When at>` (relative, exact IST on hover); audit codes are shown through `auditLabel` with the raw code beside them.
