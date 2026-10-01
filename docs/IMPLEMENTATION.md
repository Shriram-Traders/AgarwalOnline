# Implementation status

This ledger describes the launch-first implementation. The complete website flow is present; provider-backed production acceptance still depends on credentials and operating decisions.

## Governance and access

- Four fixed roles are enforced on the server: customer, delivery, admin and super-admin.
- Better Auth provides MongoDB-backed customer phone OTP, staff email/password authentication, signed cookies, session lifecycle and endpoint rate limiting. Existing credential hashes migrate into Better Auth accounts on first staff sign-in.
- Super Admin can create, edit, deactivate and reassign staff, revoke all staff sessions and inspect the visible permission matrix.
- Product, price and large stock changes use independent approval, rejection reasons, stale-value protection and scheduled publication.
- Searchable audit history records staff, access, configuration, inventory, delivery, evidence and refund actions. Sensitive fields are recursively redacted in logs and the UI.
- Active Better Auth sessions, ownership and permissions are checked for every protected page, action, route and chat poll. The legacy session fallback was removed on 2026-09-23; Better Auth is the only session source.

## Customer website

- Responsive home, catalog, product, basket, checkout, payment, order tracking, profile, address, wishlist and notification journeys.
- Catalog and navigation support English and Marathi. Homepage collections use catalog, inventory and customer purchase data.
- Saved addresses can be created, edited and deleted. Reorder revalidates live variants, availability and price before adding items.
- Authenticated invoice downloads and customer-owned complaint, evidence, support and return/refund flows are implemented.
- COD and Razorpay share transaction-safe inventory reservation, slot capacity, idempotency and immutable order snapshots.

## Store operations

- Category, product, variant, image and inventory management with approval boundaries and inventory history.
- Authenticated JPG/PNG/WebP upload path with signed Cloudinary storage and an ignored local mock adapter. Photos are shrunk in the browser (1600px JPEG) before upload; the server takes up to 3.5 MB (4 MB server-action body limit). Product photos never expire; other evidence follows `EVIDENCE_RETENTION_DAYS`.
- Packing quantities, substitutions and photographs; scoped delivery assignment, attempt reasons, delivery evidence and OTP completion.
- The packing checklist shows the customer's "If an item is unavailable" choice and opens as it was last saved. A line packed short needs a word about the rest: not available, the substitute packed at the same price (a product's name; notes like "none" or "1 short" are refused), or both with a count. Once every line has one, the order follows what was packed: each line keeps what was ordered and reads "Not available – not charged" or "Substituted with …" on the customer's, staff and rider's order pages and the invoice; stock set aside for units that didn't go in goes back on sale, and staff are asked to fix the stock count for them (and for substitutes); a cash-on-delivery bill is worked out again (offer recalculated on the terms saved at checkout, delivery fee kept), so the rider collects the new total; and the customer is told. An order paid online keeps its bill and payment as they are: the shortfall is recorded on the order, the owners are told what is owed, it sits on their work queue ("Refunds owed for items not packed") until a refund is made from the Refunds page, and the order pages and invoice say once it has been. A checklist finished under the older rules needs one more save before "Mark packed". Only confirming and completing an order message the customer; picking, packed and ready are the shop's own steps.
- Staff can cancel an order until it leaves the shop (reason required; its stock, slot and offer are freed once), send a delivery that didn't go through out again or close it as returned to shop, and change or remove the rider before the delivery starts or after a missed attempt. A rider whose order is taken off them gets a message to bring the parcel back, and deliveries that didn't go through have their own filter and work-queue row on the dashboard. Orders still holding an online payment are never closed from the order page: the refund is handled separately on the Refunds page first, and a cancelled order whose online payment came in late says so, with who refunds it.
- COD collection, handover, discrepancy tracking and resolution stay separate from delivery status.
- Return progress and partial/full refunds are recorded through provider-aware state, audit and customer notifications. Webhooks reconcile Razorpay payment and refund events.
- Persistent support chat polls an authenticated route, with sequence-based replay, retry deduplication, receipts, typing, assignment and internal notes.

## Reporting and operations

- Date-filtered sales, gross/net revenue, refunds, order/payment status, top product, service area, low-stock and delivery performance views.
- Admin customer views mask phone numbers and expose only operational purchase context.
- Seeded analytics are labeled fictional in the UI.
- Structured JSON logging redacts sensitive keys. Environment startup validates grouped provider variables and retention settings.
- Reservation expiry, scheduled approvals and evidence/notification/audit retention have runnable job scripts.

## Provider boundary

- Razorpay, Cloudinary, SMS and Atlas Search have production-shaped configuration points.
- Without credentials, payments do not claim live processing, uploads use local mock storage, OTP uses the development mock only when explicitly enabled, and search uses a bounded MongoDB fallback.
- Live merchant, SMS and Cloudinary acceptance must be completed with the operator's own accounts before launch.

## Design system (September 2026 · "First Bench")

- Current direction, picked by the store owner as option 02 of ten in a theme studio: **First Bench** — white space and 1px hairlines instead of shadows, school navy `#1e3a8a` for every action (buttons, icons, links, discount tags, steppers), slate `#0f172a` for text and dark surfaces, and exactly **one** highlight, amber `#fbbf24`, spent on the headline underline, the eyebrow square, coupon chips, the first offer card and the basket bar. Pale amber `#fef3c7` carries the second offer card, cool grey `#f5f6f8` the wells, search field and chips.
- Signature details: a dark ink announcement strip carrying the amber coupon chip; a split hero where the photo holds the right edge under a fade mask with a faint dot grid behind the copy; the delivery and payment facts rendered as hairline-divided cells; product cards as hairline boxes with a navy ticket-shaped discount tag (notched left edge), an outlined navy ADD that becomes a solid navy stepper, and a price row ruled off with a hairline.
- A six-agent audit of the re-theme (landing, catalogue and product, basket and forms, contrast, responsive, Marathi) raised 48 findings; the confirmed ones are fixed. The substantive ones were a leftover espresso `--warning` brown still tinting notices and rating stars, a navy focus ring that was invisible on the dark announcement strip at 1.72:1, placeholder text at 3.04:1, control borders at 1.74:1 against the 3:1 the guidelines ask for, touch targets of 32 to 36px on phones, the sticky basket bar sitting on the footer's last row, the promo form's button dropping below the field once a code was rejected, and the savings line inheriting link navy instead of success green.
- It replaced "Paper & Ink, warmed" (Instrument Serif on oat with espresso and marigold), which had been the approved look since 19 September. The swap was almost entirely a `:root` token diff plus the font change, which is what the stylesheet was built for.
- One token-based stylesheet, `src/app/globals.css`. Base colours are a handful of tokens; tints, shades, neutrals, the staff shell and the focus ring derive from them with relative colour syntax and `color-mix()`. Every page styles itself through the same semantic classes, so account, checkout, staff and admin screens follow the storefront automatically.
- Header: wordmark, compact search, delivery area, sign-in and basket on the first row; a second row lists a fixed set of aisle groups whose labels come from the catalogue (scrolls horizontally on tablets, hidden on phones where the bottom tab bar has Aisles); the offer strip shows the free-delivery threshold and the live welcome code from the promotions collection. Footer links are generated from the catalogue.
- Fonts are self-hosted through `next/font/local`: Plus Jakarta Sans for headings (700-800, tracking -0.025em), Manrope for body, and **Mukta for Devanagari**. Latin never reaches Mukta because it sits behind Manrope in the stack and the Latin faces carry no Devanagari glyphs, so Marathi finally renders in a real face instead of a system fallback.
- Guests can add to basket from product pages; basket lines use a quantity stepper with remove; checkout is a two-column form with a sticky order summary. Home and catalog copy is bilingual and follows the saved locale cookie.
- Polish pass (same day): hero photo shown at near-full strength under a graded espresso scrim instead of a flat wash; aisle and product photos share one muted grade (`saturate(.85)`, product photos multiply-blended into the sand art box with an inset hairline) so mixed stock photography reads as one set; wishlist hearts appear on hover on pointer devices; section headings carry the other-language subtitle on the same baseline; catalogue filters sit between hairlines instead of in a box; footer column labels are small caps; nav, top strip and footer text use the derived ink tones rather than hard-coded hex.
- Quick-commerce patterns (borrowed from Zepto, Blinkit and Instamart, keeping our palette): delivery promise over the area in the phone header; search box cycles example queries; offer and delivery banners sit directly under the header (a swipe rail on phones); phone aisles are a four-column tile grid and phone product sections are swipe rails; the editorial hero is desktop-only; product cards use an outlined ADD that becomes an in-place ink stepper (`QuickAdd` calls the quick-add and set-quantity actions directly); a sticky "N items · total · View basket" bar (`CartBar`) appears on phones whenever the basket has items, except on basket, checkout and staff routes. Discount tags stay marigold, the equivalent of Blinkit's yellow tags.
- Customer sign-up now asks for the password twice and can reveal it. The confirm field blocks submission natively through `setCustomValidity`, and `verifyOTPAction` re-checks the match on the server because the client is not the authority. Every password box in the auth form carries a reveal toggle with an `aria-pressed` label. The customer minimum moved from 12 characters to 8, which matches the NIST SP 800-63B floor for user-chosen passwords. Staff passwords were kept at 12 at first, then lowered to 8 on 2026-09-23 at the owner's request, so every account now uses the same 8-character minimum.
- Sign-in accepted only one spelling of the local origin. `checkOrigin` compared the request's `Origin` header to `APP_ORIGIN` as an exact string, so with `APP_ORIGIN=http://127.0.0.1:3000` every auth action failed from `http://localhost:3000` — the URL Next prints on startup — and the masked message read "Unable to sign in. Please try again later." `src/lib/auth/origin.ts` now treats `localhost` and `127.0.0.1` as the same host **only when the configured origin is itself loopback**, and Better Auth's `trustedOrigins` gets both spellings. `env.ts` requires a production origin to be https, so a deployment can never reach that branch; `tests/origin.test.ts` covers the cross-site cases including a host that merely contains the configured one.
- End-to-end coverage: `tests/e2e/journey.spec.ts` drives the whole flow in one pass — sign up with OTP, search, add to basket, raise the quantity with the stepper, apply a promotion code, save an address, check out on cash, then confirm, pick, pack, assign, deliver with the customer's code and reconcile the cash. It also watches the browser and fails on any console error, page error, failed request or 5xx response, and writes full-page screenshots of every populated screen when `SHOT_DIR` is set. The per-surface specs start from empty fixtures, so this is the only test that exercises populated lists, tables and status strips.
- Structural pass across all 40 pages (September 2026). The theme was right but page structure was not, so the site now shares seven primitives in `src/components`: `PageHeading`, `EmptyState`, `StatTiles`, `FilterBar`, `DataTable` and `StatusPill`/`StatusStrip` (a `NavTiles` grid existed until the staff overview stopped repeating the workspace menu). Each maps onto CSS that already existed rather than introducing new class names.
- Three competing page headers became one. Sixteen pages used `workspace-heading`, cart and checkout used `section-heading` as a page title, and thirteen dropped a bare eyebrow and `h1` into the container with no wrapper. `.section-heading` now does only its real job, titling sections inside a page. The admin order detail, which had no heading block at all, gained one.
- `/admin` rendered its whole order list into the DOM twice and hid one copy with a media query. `DataTable` renders once and the rows themselves become cards below 900px, which also stopped the other admin tables scrolling sideways on a phone and gave them all a `<caption>` and `scope="col"`.
- `/admin/products` was 522 lines because it re-implemented `/admin/categories`, `/admin/products/new` and `/admin/inventory` inside itself, including a byte-identical movements table. It is now 245 lines and each sibling owns its job; the `CatalogAdminNav` sub-nav that already linked all four gained an active state, and the workspace menu keeps "Catalog & stock" highlighted across them.
- `/super-admin` put six unrelated concerns under a single heading in two indistinguishable grids. Each now stands as its own panel with its own heading, and the delivery rules sit beside the service areas they govern.
- Empty states: twenty-three were ad-hoc, several were raw text nodes and several lists had none. All now use the `.empty-state` shape with the `.empty-icon` hook that previously had exactly one consumer.
- Status pills gained tone variants from the existing `--success-bg` / `--warning-bg` / `--danger-bg` tokens, so "Cancelled" no longer looks identical to "Delivered", and the four-part order strip now names its dimensions for screen readers.
- The confirm dialog in `ActionForm` was `aria-modal` but mouse-dismissable only. It now takes focus on open, traps Tab, closes on Escape and returns focus to the trigger, with a test covering it.
- All hand-rolled `₹{paise / 100}` formatting is gone in favour of `formatPrice`, and the repeated Asia/Kolkata timestamp expression is now `formatIst`.
- Landing page (September 2026 rebuild, after studying BigBasket, Swiggy Instamart and Tesco at 1440px): none of them uses a full-screen editorial photo hero, because it pushes every shoppable element below the fold. Ours was doing exactly that, so the hero became a compact **welcome band** carrying the things a first-time visitor actually needs: what the shop is, a live countdown to the same-day cutoff, and an inline PIN serviceability check that works without JavaScript. A four-photo mosaic keeps the editorial tone without eating the screen. Measured on a 1440x900 desktop, categories went from zero visible in the first screen to six, the first category moved from 1167px to 750px, and the first product from 1928px to 1654px; a 1366x768 laptop also shows six.
- Landing page order: welcome band, delivery and payment facts, all 11 aisles, offers, Buy it again (returning customers), Popular in the shop, Biggest savings, New in store, Picked for you, store note. Aisles come before offers because the marigold top strip already advertises the live code on every page.
- Everything on the landing page is derived from stored data rather than written copy: offer headlines are built from each promotion's discount type, value and minimum; the savings rail is sorted by real MRP-versus-price margins; "Popular in the shop" uses the catalogue's bestseller flag; the delivery areas come from the ServiceArea collection. The store has no published reviews and few orders, so there are deliberately no ratings, review counts or "customers served" claims.
- The countdown (`DeliveryPromise`) reads the wall clock in Asia/Kolkata on both server and client via `minutesUntilCutoff`, so it is correct whatever timezone the host runs in, and re-syncs after mount so hydration never mismatches. Past the cutoff it switches to the tomorrow message in the warning style.
- Aisle tiles are one uniform treatment at every breakpoint: square art over a bilingual label, photo where the catalogue has one and a clay icon on sand where it does not. That replaced a featured/more split with overlay captions and removed about twenty lines of phone-only overrides.
- Mobile-first: sticky search header, bottom tab bar, wrapping facts row, two-column product grid at 375px, 44px touch targets, `prefers-reduced-motion` and print styles.
- Customer sign-up stores the chosen password as a Better Auth credential record directly (the previous session-bound `setPassword` call always failed with `Unauthorized`); masked authentication errors are logged as `auth.unexpected-error`. The Playwright customer helper follows the real sign-up / OTP flow and the suite runs green on desktop and mobile.
- Not yet done: dark mode, Marathi copy for basket, checkout and account pages, `next/image` optimisation for remote photos (images stay `unoptimized`).

## Deferred scope

Coupons, GPS tracking, route optimization, push notifications, advanced BI, custom permission builders, Super Admin 2FA and production-credential validation are outside this launch-first version.

## Verification policy

The repository contains focused integration coverage for authentication, role boundaries, money, inventory concurrency, approvals, complaints/returns, wishlist, reorder and refunds. Playwright covers full customer, staff, governance, desktop/mobile and automated WCAG A/AA flows. The final verification commands and latest executed results are recorded in the task handoff and README; physical iOS/Android and human assistive-technology review remain launch activities.

## Staff workspace inside the storefront (September 2026)

- Staff pages use the same header and footer as shoppers. The dark sidebar shell is gone; `AdaptiveShell` adds a light workspace menu beside the page (a sticky column on desktop, a chip row under 900px), built from the signed-in role rather than the URL, so an owner sees both "Run the store" and "Owner" groups everywhere.
- Owners and admins open on `/admin`: greeting, quick actions, the work queue (its order rows link to filtered order lists; owners also see approvals and refunds), today's orders and sales against yesterday (IST day), the order list with step filters, and a low-stock shelf.
- `/super-admin` is now Store settings: delivery rules, slots, service areas, the stock-approval limit, search synonyms and connected services.
- Staff type money in rupees. Inputs named `…Rupees` are converted once by `formWithPaise`/`paiseFromRupees` in `src/lib/display.ts` at the action layer; services and the database still work in paise.
- Staff sessions no longer end after 12 hours; everyone gets the 7-day session.


## Staff pages: admin UX pass (September 2026)

Researched against Shopify Polaris (index tables, settings layout, badges), GOV.UK Design System (text inputs, error messages), and Nielsen Norman Group (data tables, confirmation dialogs, dashboards), then applied:

- Catalog, stock, categories, staff and offers are tables with search and filters instead of stacks of open forms. Records are edited one at a time: products on their own page (`/admin/products/[id]`), stock, aisles and staff in an `?edit=`/`?adjust=` panel above the table.
- The order page leads with the next step and why it matters, shows items with the total, and has a tap-to-call link for the customer. The overview has order search.
- Store settings use a two-column settings layout; the cutoff is a time picker and weekly holidays are day checkboxes.
- Money fields are `MoneyInput` (₹ prefix, decimal keypad, no scroll-wheel stepping). Validation errors are rewritten by `plainMessage` to name the field. Confirmation dialogs name the exact action ("Record cash handover?" / "Yes, record cash handover") and are kept for money and publishing.
- The audit trail and per-record history show each code in plain words (`auditLabel`) with the code beside it, relative times with the exact IST time on hover, and filters by kind of activity.
- Offer and approval times typed into `datetime-local` fields are read as IST; before this they were read as UTC on the server.
