# AGARWAL GENERAL STORES — implementation contract

## Architecture and boundaries

One retailer, one inventory pool, INR integer paise, Asia/Kolkata delivery calendar. Next.js App Router on a Node.js host serves React Server Components, authenticated Server Actions, and integration Route Handlers. Better Auth uses its official MongoDB adapter for identity sessions while Mongoose owns commerce data on the same Atlas replica set. Support chat is served by a polling Route Handler that checks the Better Auth session and domain authorization on every request. Background workers expire reservations, reconcile payments, send notifications, and process scheduled approvals via durable jobs/outbox records.

Browser → Next.js → domain services → MongoDB. Next.js → SMS, Razorpay, Cloudinary through server-only adapters. Browser polls the chat Route Handler → Better Auth session validation and MongoDB. Each boundary validates input with Zod. Secrets stay on servers. Better Auth signs opaque HTTP-only session cookies and stores server-side sessions. Staff credential hashes use bcrypt through Better Auth's password interface. Role grants are enforced on the server, and ownership/assignment checks apply in addition to roles. Production never enables demo login or fixed OTP codes.

## Schema and relationships (planned complete schema)

| Collection             | Relationships and important fields                                                  | Indexes / constraints                                                 |
| ---------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| User                   | phone, staff email, verification fields, role, active state                         | unique normalized phone; partial unique email                         |
| Role / Permission      | role keys and explicit permission grants                                            | unique role key and permission key                                    |
| CustomerProfile        | userId, language, preferences                                                       | unique userId                                                         |
| DeliveryPartnerProfile | userId, active, availability                                                        | unique userId                                                         |
| AuthSession            | Better Auth userId, signed-cookie token, expiry, client metadata                    | unique token; user/expiry                                             |
| Address                | customerId, recipient, phone, lines, PIN, areaId, optional coordinates              | customerId; explicit owner checks                                     |
| ServiceArea            | name, PIN codes, fee, COD limit, optional polygon                                   | unique key; PIN index                                                 |
| DeliverySlot           | areaId, date, start/end, capacity, reserved                                         | unique area/date/window; atomic capacity increment                    |
| Category               | parentId, slug, bilingual labels, order                                             | unique slug; parentId                                                 |
| Product                | categoryId, slug, bilingual content, brand, aliases, publication state              | unique slug; category/state; Atlas Search index                       |
| ProductVariant         | productId, SKU, unit, quantity, pricePaise, MRP, purchase limit                     | unique SKU; productId                                                 |
| ProductTranslation     | productId, locale, name, description                                                | unique productId/locale (initially embedded in Product)               |
| SearchSynonym          | mappingType, terms, locale, reviewer                                                | term index; Atlas synonym source collection                           |
| InventoryItem          | variantId, onHand, reserved, version                                                | unique variantId; nonnegative constraints                             |
| InventoryMovement      | variantId, delta, reason, actor, orderId                                            | variant/time; immutable append-only                                   |
| InventoryReservation   | orderId, variantId, quantity, expiresAt, status                                     | unique order/variant; status/expiry (NO automatic TTL deletion)       |
| Cart                   | customerId, variant/quantity lines                                                  | unique customerId                                                     |
| Wishlist               | customerId, productId                                                               | unique customer/product                                               |
| ShoppingList           | ownerId, name, kind (board or basket), collaborators, linkCanEdit, shareToken, inviteToken, items (variant, qty, addedBy) | unique shareToken and inviteToken; owner/time; owner/kind; collaborator/time |
| Order                  | customerId, number, idempotencyKey, four statuses, address snapshot, totals, slotId | unique number and customer/idempotencyKey; customer/time; status/time |
| OrderItem              | orderId, variantId, immutable names, quantity and price snapshot                    | orderId (embedded for transaction consistency)                        |
| OrderTimelineEvent     | orderId, dimension, previous/next, actorId, at, notes                               | order/time; append-only                                               |
| Payment                | orderId, provider, providerOrderId, paymentId, amount, state                        | unique sparse provider IDs; orderId                                   |
| RazorpayWebhookEvent   | provider eventId, payload digest, processedAt, outcome                              | unique eventId                                                        |
| CODCollection          | orderId, collectorId, amount, collectedAt, reconciliationId, state                  | unique orderId; collector/state                                       |
| CODReconciliation      | collectorId, expected/received, discrepancy, reviewerId                             | collector/date                                                        |
| Shipment               | orderId, assigneeId, status, OTP challenge reference                                | unique orderId; assignee/status                                       |
| DeliveryAttempt        | shipmentId, reason, evidenceId, consented location, time                            | shipment/time                                                         |
| AuthVerification       | Better Auth phone identifier, OTP value, expiry                                     | managed by Better Auth; identifier/expiry                             |
| OTPChallenge           | delivery purpose, subjectHash, codeHash, attempts, consumedAt, expiry               | subject/purpose/time; TTL expiry                                      |
| RateLimit              | key, count, expiry                                                                  | unique key; TTL expiry; atomic counter                                |
| ChatConversation       | customerId, orderId, assignedAdminId, status                                        | customer/update; assignee/status                                      |
| ChatParticipant        | conversationId, userId, lastReadSequence                                            | unique conversation/user                                              |
| ChatMessage            | conversationId, senderId, sequence, clientMessageId, body, internal, attachments    | unique conversation/sequence; unique sender/clientMessageId           |
| MessageReceipt         | messageId, participantId, deliveredAt, readAt                                       | unique message/participant                                            |
| Notification           | userId, type, payload, readAt                                                       | user/time; expiry for transient items                                 |
| ApprovalRequest        | type, targetId, before/after, requester, approver, comments, state, scheduledAt     | state/schedule; targetId                                              |
| PackingChecklist       | orderId, item quantities, substitution, evidence, packer                            | unique orderId                                                        |
| Complaint              | customerId, orderId, itemId, type, evidence, resolution, status                     | customer/time; status/time                                            |
| Return                 | complaintId, orderId, pickup, items, status                                         | orderId; status/time                                                  |
| Refund                 | paymentId, orderId, providerRefundId, amount, state                                 | unique providerRefundId; paymentId                                    |
| Coupon                 | code, validity, constraints, limits, redemption count                               | unique normalized code                                                |
| UploadedEvidence       | ownerId, purpose, cloudinaryId, mime, bytes, consent, purgeAt                       | unique cloudinaryId; purgeAt                                          |
| AuditLog               | actor, action, target, masked before/after, timestamp                               | target/time; actor/time; append-only                                  |
| SystemSetting          | key, version, value, updater                                                        | unique key; optimistic version lock                                   |
| OutboxJob              | kind, payload, attempts, nextRun, lockUntil                                         | state/nextRun; unique dedupe key                                      |

## Concurrency and retention

Checkout executes a MongoDB transaction: claim customer idempotency key, re-read published variants and prices, validate address/serviceability/coupon/COD limits, increment slot reservation only below capacity, and reserve stock only when onHand - reserved >= requested. Order snapshots and inventory movements commit together. A failed transaction changes nothing. A unique human-readable order number uses a durable daily sequence; gaps are allowed. Payment network calls occur outside the transaction with a durable recoverable pending state. No client price is accepted.

Reservations have a worker-managed expiry: release stock and slot capacity transactionally, then mark the reservation released. TTL must never silently delete active reservations. Webhooks validate the raw body signature before parsing. A unique provider event ID, conditional state updates, and provider reconciliation protect against duplicates and out-of-order events. Captured payment must not be overwritten by a late failure. Refund limits are checked against captured less reserved/refunded amounts. COD collection and reconciliation are separate; delivery does not imply settled cash.

Every timeline/audit/movement write is append-only through domain services and database roles. Reject illegal state transitions, requester self-approval, and rejection without a reason. Publish approved changes with optimistic version checks. Delivery queries include assignee and active-status predicates; customers cannot access another customer's records. Internal chat notes are excluded at the query layer from customer history, broadcasts, search, and sync. Store messages before broadcast; sync through a monotonically increasing conversation sequence, not timestamps alone.

Default proposed retention: OTP 5 minutes, rate counters 15 minutes, sessions 7 days (staff included), delivery photos/GPS 30 days unless a dispute hold applies, closed chat 180 days, application logs 30 days. Orders, invoices, tax and payment records require a store-approved retention policy before launch. Expired photo metadata triggers provider deletion; TTL alone does not delete the remote asset. Never log codes, tokens, passwords, payment secrets, or full addresses. Phone/email masking applies to logs. Account deletion anonymizes eligible data and preserves required financial records.

## Permission matrix

| Capability                 | Customer                  | Delivery Partner           | Admin                     | Super Admin                      |
| -------------------------- | ------------------------- | -------------------------- | ------------------------- | -------------------------------- |
| Catalog                    | published                 | published                  | manage drafts             | manage / approve                 |
| Orders                     | own create/read/cancel    | assigned active deliveries | operational orders        | all operational orders           |
| Addresses/profile          | own                       | own                        | authorized support lookup | authorized support lookup        |
| Packing / inventory        | —                         | —                          | pack / routine adjustment | pack / large adjustment approval |
| Delivery evidence/COD      | own delivery verification | assigned only              | assign / reconcile        | assign / reconcile / reports     |
| Chat                       | own, public messages      | —                          | permitted support queues  | permitted support queues         |
| Approvals                  | —                         | —                          | request                   | approve others only              |
| Settings / staff / gateway | —                         | —                          | —                         | manage                           |
| Complaints/returns         | own                       | assigned pickups           | resolve                   | resolve/refund/report            |

Ownership and transition conditions further restrict every grant. Anonymous access only includes published catalog, serviceability, and rate-limited authentication endpoints. Staff never authenticate through the customer OTP endpoint.

## Page map

- `/`: service area selector, categories, promotions, featured/deals/new/bestsellers, authenticated reorders.
- `/catalog`, `/products/[slug]`: filters, search, bilingual content, variants, stock.
- `/cart` (pills switch between My basket and shared baskets: `?basket=<id>`, `?basket=new`), `/checkout`, `/checkout/confirmation/[id]`.
- `/lists/[token]`: a shared board or basket opened from its link; it lets people join only while the owner's "they can add and change things" switch is on. Signing in from it returns there.
- `/login` (staff too; `/staff/login` redirects there); `/account`, `/account/addresses`, `/account/wishlist` (Saved: boards plus everything hearted), `/account/lists/[id]` (a board), `/account/orders`, `/account/orders/[id]`, `/account/support`, `/account/complaints`.
- `/delivery`: assigned queue, `/delivery/orders/[id]`, history, cash summary.
- `/admin`: orders, packing, products, categories, inventory, customers, delivery, COD, support, complaints, returns, coupons, analytics.
- `/super-admin`: approvals, staff/permissions, delivery rules, synonyms, settings, audit, revenue/refunds/COD reports.
- `/super-admin/schools`, `/super-admin/schools/[id]`, `/super-admin/quotations`, `/super-admin/quotations/[id]`: schools, their representatives and join link, and the quotation desk (owner only).
- `/school` (school catalogue, or the picker), `/school/quote` (the school's shared basket), `/school/quotations`, `/school/quotations/[id]` (a quotation to print, accept or ask to change), `/school/join/[token]`: for school representatives only; another school's records are "not found".
- Route Handlers: auth, catalog search, payment order/verification/webhook, signed uploads, chat ticket/history, invoices.

## Testable implementation phases

1. Foundation: strict Next.js, accessible shared UI, connection/env validation, Better Auth MongoDB sessions, customer phone OTP, staff email/password login, permission matrix and seed command. Test expiry/retries, production mock guard, unauthorized roles and login flows.
2. Catalog: bilingual categories/products/variants, server search + Atlas index/synonym configuration, details, inventory. Test Rice/Chawal/तांदूळ equivalence and unpublished/stock visibility.
3. Commerce: persistent cart and addresses, IST delivery rules, transactional reservation/idempotent checkout, COD and Razorpay adapter/webhooks. Test stock contention, cutoff boundary, fees, duplicates/signatures and rollback.
4. Operations: validated order workflow, packing, assignee-scoped delivery, delivery OTP/evidence, COD collection and reconciliation. Test forbidden transitions, ownership and discrepancy handling.
5. Chat: authenticated polling Route Handler (replaced the Socket.IO service on 2026-09-23 so the app deploys to Vercel without a second host), durable history/sequence sync, public/internal separation, receipts, typing, assignments, signed attachments. Test two clients, unauthorized conversations, cross-site posts, session revocation and deduplication.
6. Governance: approvals, complaints/returns/refunds, actual and demo-labeled analytics, security review, Playwright end-to-end suite and deployment runbook.

At each phase: lint, strict type check, targeted automated tests, then update IMPLEMENTATION.md with tested outcomes and remaining limitations. A screen or schema alone is not a completed workflow.

## Assumptions and launch dependencies

Use fictional data only. No real delivery promises until service areas/PINs/slots are confirmed. Demo mode must be explicitly enabled and cannot run in production; it does not bypass staff authorization. Atlas replica set, Search index, SMS provider credentials, Razorpay test credentials, Cloudinary credentials and a Node.js deployment target must be supplied for external verification. Staff 2FA is optional but cannot be advertised until implemented. No multi-vendor, Easebuzz or manual UPI QR flow. Taxes, invoice legal details, cancellation window, returns policy and retention must be approved by the business. Cloudflare Sites cannot directly host the required Mongoose raw TCP architecture; deploy Next.js and chat on Node-compatible infrastructure.
