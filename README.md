# Agarwal General Stores

Online store for Agarwal General Stores, a neighbourhood shop in Nagothane. Customers browse a bilingual English and Marathi catalog, order for home delivery, pay by cash on delivery or Razorpay, and chat with the store. Staff pack orders, run deliveries, manage stock and handle returns from the same app.

All seeded brands, products, people, addresses, orders and analytics are fictional. Seeded service areas start disabled, so the site never promises delivery coverage the store has not switched on.

## Contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Scripts](#scripts)
- [Testing](#testing)
- [Branches and workflow](#branches-and-workflow)
- [Deployment](#deployment)
- [Security](#security)
- [Known gaps](#known-gaps)
- [Troubleshooting](#troubleshooting)
- [More documentation](#more-documentation)

## Features

**Customers**

- Browse and search the catalog with live suggestions, in English or Marathi.
- Keep an anonymous basket for 30 days, merged into the account after sign-in.
- Sign up with phone OTP, then sign in with OTP, phone and password, or email and password.
- Check out with cash on delivery or Razorpay. The server calculates the quote and applies the best valid promotion.
- Track, cancel and reorder orders, and download invoices.
- Save a wishlist, addresses and preferences.
- Save things to boards (Diwali gifts, school ideas), invite people to them, and buy a whole board in one tap.
- Keep more than one basket: fill a shared one (School list, Family monthly) with family or colleagues, and anyone on it can order it. Sharing is one link, sent on WhatsApp or copied, with one switch for whether it lets people edit.
- Review verified purchases, chat with support, raise complaints and request returns or refunds with photo evidence.

**Admins**

- Manage categories, products, variants, photos and stock.
- Pack orders with substitutions, assign deliveries, reconcile cash on delivery and handle discrepancies.
- Moderate reviews, answer support chats with internal notes, and handle complaints and returns.
- View date-filtered operational analytics.

**Delivery partners**

- See only their assigned orders.
- Record attempts, failure reasons, photo evidence, delivery OTP confirmation and cash collected.

**Super admins**

- Give a customer a staff role, create new staff accounts, and revoke access.
- Approve requests, publish or pause promotions, and issue full or partial refunds.
- Configure service areas and delivery rules.
- Review the masked audit trail and check which providers are configured.

Every sensitive change is authorized on the server and written to the audit log.

## Tech stack

| Area | Technology |
|---|---|
| Framework | Next.js 16 App Router, React 19, TypeScript in strict mode |
| Database | MongoDB 7 or newer, run as a replica set, with Mongoose 9 |
| Authentication | better-auth 1.7 with the MongoDB adapter and the phone-number plugin |
| Validation | Zod 4 |
| Styling | Hand-written CSS in `src/app/globals.css`, with self-hosted fonts |
| Payments | Razorpay REST API |
| Image storage | Cloudinary signed uploads |
| Support chat | Polling an authenticated API route. No separate chat server. |
| Tests | Vitest for unit and integration tests, Playwright with axe-core for end-to-end and accessibility tests |

## Project structure

```
src/
  app/            Pages and API routes (App Router)
    api/          Auth, chat, uploads, evidence, invoices, payments, catalog suggestions, cron jobs
    account/      Customer account, orders, support chat, complaints
    admin/        Admin workspaces
    super-admin/  Staff, approvals, promotions, refunds, audit
    delivery/     Delivery partner screens
  components/     Shared UI
  lib/            Server-side domain logic, one folder per area
    auth/         better-auth config, sessions, permissions, rate limits
    chat/         Support chat service and models
    commerce/     Basket, checkout, orders
    db/           Connection and core models
    env.ts        Environment validation
scripts/          Seed script and scheduled jobs
tests/            Vitest tests; tests/e2e holds Playwright specs
docs/             Architecture, implementation notes, service costs, Atlas Search index
```

## Getting started

### Prerequisites

- **Node.js 20.19 or newer.** Node 22 is recommended, and `.nvmrc` pins it.
- **npm.**
- **MongoDB 7 or newer, running as a replica set.** Orders use transactions, which fail on a standalone MongoDB server. A free MongoDB Atlas cluster is already a replica set.

### 1. Install dependencies

```bash
npm ci
```

### 2. Set up a database

Choose one option.

**Option A: MongoDB Atlas.** This is the easiest option.

1. Create a free cluster at [cloud.mongodb.com](https://cloud.mongodb.com).
2. Under **Database & Network Access**, create a database user with read and write access. Use an autogenerated password, which avoids characters that break the connection string.
3. Under **IP Access List**, add your current IP. For Vercel, add `0.0.0.0/0`, because Vercel has no fixed IPs.
4. Click **Connect**, then **Drivers**, and copy the connection string.
5. Add the database name `agarwal` after `.net/`, just before the `?`. Without it, all data goes into a database called `test`.

**Option B: local MongoDB with Docker.**

```bash
docker run -d --name agarwal-mongo -p 27017:27017 mongo:8 --replSet rs0 --bind_ip_all
```

Then initialise the replica set once:

```bash
docker exec agarwal-mongo mongosh --eval 'rs.initiate({ _id: "rs0", members: [{ _id: 0, host: "localhost:27017" }] })'
```

Your connection string is `mongodb://127.0.0.1:27017/agarwal?replicaSet=rs0`.

**Option C: local MongoDB installed with Homebrew.** Start it in its own terminal:

```bash
mongod --dbpath .local/mongo --port 27017 --replSet rs0 --bind_ip 127.0.0.1
```

Then initialise the replica set once:

```bash
mongosh --port 27017 --eval 'rs.initiate({ _id: "rs0", members: [{ _id: 0, host: "127.0.0.1:27017" }] })'
```

Create the `.local/mongo` folder first. Git ignores it.

### 3. Create better-auth indexes

better-auth doesn't create indexes on MongoDB. Without them, every signed-in request scans the sessions collection. Run this once against your database, replacing the connection string:

```bash
mongosh "YOUR_MONGODB_URI" --eval 'db.authSessions.createIndex({ token: 1 }, { unique: true }); db.authSessions.createIndex({ userId: 1 }); db.authAccounts.createIndex({ userId: 1 }); db.authAccounts.createIndex({ providerId: 1, accountId: 1 }); db.authVerifications.createIndex({ identifier: 1 }); db.authRateLimits.createIndex({ key: 1 })'
```

The app creates its own indexes the first time it starts.

### 4. Configure the environment

```bash
cp .env.example .env
```

Fill in `MONGODB_URI`, then generate the secrets. Run this once for `AUTH_SECRET` and again for `BETTER_AUTH_SECRET`:

```bash
openssl rand -hex 32
```

Run this for `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`:

```bash
openssl rand -base64 32
```

Every variable is described in [Environment variables](#environment-variables).

### 5. Create the owner account

```bash
npm run owner:create
```

It asks for a name, email, mobile number and password. The password is typed hidden and never printed. The account becomes a super admin who signs in at `/login` like everyone else, lands on the store overview, keeps the owner pages (Store settings, Staff & roles, Approvals, Offers, Refunds, Audit trail) in the same workspace menu, and gives other people staff roles from Staff & roles. Running it again for the same email resets that password and signs out its old sessions.

### 6. Load demo data (optional)

```bash
npm run seed
```

The seed loads a fictional stationery and gift catalog (11 aisles, 41 products), two offers and the service areas (switched off). It only runs when `SEED_DEMO=true`, and never in production. It is safe to run again, because it keeps existing stock.

For a local or test database, `npm run seed -- --demo-accounts` also adds a demo customer, fictional staff and eight demo orders:

| Role | Sign in at | Demo account |
|---|---|---|
| Customer | `/login` | Phone `9000000001`, with the code in `MOCK_OTP_CODE` |

Never pass `--demo-accounts` against a deployed database: the demo staff have no password, but with mock OTP switched on anyone could sign in as them by phone. Every real staff login is the owner from `npm run owner:create`, or people the owner gives a staff role on the Super Admin page.

### 7. Run the app

```bash
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). `APP_ORIGIN` must match the address in your browser exactly. The app also accepts `localhost` for `127.0.0.1` during local development.

## Environment variables

The app validates these on startup and refuses to run with an invalid combination. `.env.example` is the template.

| Variable | Required | Description |
|---|---|---|
| `MONGODB_URI` | Yes | Connection string for a replica set. The database name comes from the path. |
| `APP_ORIGIN` | Yes | Public origin, such as `https://agarwal-online.vercel.app`. A trailing slash or path is ignored. Must use `https://` in production. |
| `AUTH_SECRET` | Yes | 32 or more random characters. Also hashes delivery handover codes, so don't rotate it casually. |
| `BETTER_AUTH_SECRET` | Production | 32 or more random characters. It signs session cookies. It falls back to `AUTH_SECRET` when blank. |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | With more than one server | Base64 AES key, 16, 24 or 32 bytes. It must be identical on every instance and at build time. |
| `RESEND_API_KEY`, `EMAIL_FROM` | For email confirmation | Set both. `EMAIL_FROM` looks like `Agarwal General Stores <orders@yourdomain.in>` and must use a domain verified in Resend. Blank in development prints each email, with its link, in the dev-server log. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | For Google sign-in | Set both, or leave both blank to hide the Google buttons. |
| `MOCK_OTP` | No | `true` accepts `MOCK_OTP_CODE` instead of sending SMS. Forbidden in production. |
| `MOCK_OTP_CODE` | No | Six-digit code used when mock OTP is on. Defaults to `246810`. |
| `ALLOW_MOCK_OTP_IN_PRODUCTION` | Pre-launch testing only | `true` lets mock OTP run on a Vercel test deployment, which always runs in production mode. Any `MOCK_OTP_CODE` is accepted, and anyone who knows it can sign in as any phone number. Remove it before real customers use the site. |
| `SMS_API_URL`, `SMS_API_TOKEN` | Production | SMS gateway. Set both or neither. |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | For online payment | Set all three, or checkout offers cash on delivery only. Production requires `rzp_live_` keys. |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Production | Set all three or none. Without them, photos are saved to `.local/uploads` on the server's disk. |
| `ATLAS_SEARCH_ENABLED` | No | `true` switches product search to Atlas Search. Enable it only after creating the index. |
| `CRON_SECRET` | On Vercel | 16 or more characters. Vercel Cron sends it to the job routes, which refuse every call without it. |
| `EVIDENCE_RETENTION_DAYS` | No | Days to keep complaint, packing and delivery photos. Defaults to 90. Product photos are never deleted. |
| `AUDIT_RETENTION_DAYS` | No | Days to keep audit entries. Defaults to 730. |
| `SEED_DEMO` | Seeding only | Needed by `npm run seed`. The seed refuses to run in production. |

Tests use `TEST_MONGODB_URI`, passed on the command line. Vitest does not read `.env`.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Starts the development server on `127.0.0.1:3000`. |
| `npm run build` | Creates a production build. |
| `npm start` | Serves the production build. |
| `npm run lint` | Runs ESLint. |
| `npm run typecheck` | Runs the TypeScript compiler without emitting files. |
| `npm test` | Runs Vitest. Integration tests need `TEST_MONGODB_URI`. |
| `npm run test:e2e` | Runs Playwright on desktop Chromium and a Pixel 7 profile. |
| `npm run owner:create` | Creates or resets the owner account, prompting for the password. |
| `npm run seed` | Loads fictional demo data. |
| `npm run migrate:phone-index` | One-time upgrade for databases created before 27 September 2026, so accounts made with Google can exist without a phone number. |
| `npm run migrate:product-photos` | One-time upgrade for databases with product photos uploaded before 29 September 2026, which were wrongly given an expiry date and would have been deleted by the retention job. |
| `npm run migrate:roles` | One-time upgrade for databases created before 24 September 2026, which stored a single `role` per user. |
| `npm run reservations:expire` | Releases stock held by abandoned checkouts. |
| `npm run approvals:publish` | Publishes approved changes whose scheduled time has passed. |
| `npm run retention:run` | Deletes expired notifications, evidence photos and old audit entries. |

The seed and job scripts load `.env` from the project folder. Node stops with a "not found" error if that file is missing.

## Testing

```bash
npm run lint
```

```bash
npm run typecheck
```

```bash
TEST_MONGODB_URI='mongodb://127.0.0.1:27017/ags_test_local?replicaSet=rs0' npm test
```

```bash
npm run test:e2e
```

- **Integration tests skip silently without `TEST_MONGODB_URI`.** Without it, the run looks green but hasn't tested the database code.
- **Tests only touch disposable databases.** The database name must start with `ags_test`, and each test run deletes it afterwards.
- **Playwright starts its own app** on port 3002, with the `ags_test_e2e` database on the local MongoDB at port 27028. Change the URI in `playwright.config.ts` if your MongoDB runs elsewhere.
- **Accessibility checks.** axe-core checks cover WCAG A and AA rules automatically. They don't replace testing on real devices, with a keyboard and with a screen reader.

GitHub Actions runs lint, the typecheck, and unit and integration tests against a temporary MongoDB replica set on every push to `main` or `dev` and on every pull request. See `.github/workflows/ci.yml`.

## Branches and workflow

| Branch | Purpose | Deploys to |
|---|---|---|
| `main` | Production. Only changes through a reviewed pull request from `dev`. | The live site |
| `dev` | Day-to-day work. Feature branches start here and merge back here. | Vercel preview deployments |

1. Start from `dev`. For anything bigger than a small fix, create a feature branch from it.

```bash
git switch dev
```

```bash
git switch -c feature/short-description
```

2. Push the branch and open a pull request into `dev`. CI must pass before merging.
3. When `dev` is ready to release, open a pull request from `dev` into `main`. Merging it deploys the live site.

**Protect `main` on GitHub.** Under **Settings**, then **Branches**, add a rule for `main`. Require a pull request before merging, require the CI `verify` check to pass, and block force pushes.

**Keep `dev` away from live data.** In Vercel, set `main` as the production branch under **Settings**, then **Git**. Give the Preview environment its own `MONGODB_URI`, pointing at a separate database such as `agarwal_dev`, plus its own secrets. Otherwise, testing a `dev` preview would read and change real orders.

## Deployment

### Vercel

1. Import the GitHub repository in Vercel.
2. In **Settings**, then **General**, set Node.js to 22.x.
3. Add every production variable under **Settings**, then **Environment Variables**. Use fresh secrets that aren't used anywhere else, `APP_ORIGIN` set to your HTTPS domain, and `MOCK_OTP=false`. Leave out `SEED_DEMO`.
4. Add `CRON_SECRET` to the Production environment, so the scheduled jobs can run. A production build runs `scripts/check-env.ts` first and fails with a list of missing or invalid variables, so a bad environment never reaches the live site.
5. In Atlas, allow `0.0.0.0/0` in the IP Access List.
6. Deploy, then add your domain.

`vercel.json` pins functions to the Mumbai region, `bom1`, next to the Atlas cluster in AWS `ap-south-1`. If your cluster is in another region, change it to the nearest Vercel region.

Vercel's free Hobby plan is for non-commercial use only, so a live store needs the Pro plan. Hobby also rejects any cron job that runs more than once a day, so `vercel.json` schedules every job daily.

Support chat polls an API route. It checks every 4 seconds while active, every 12 seconds when quiet, and pauses in hidden tabs. It needs no extra service and works on Vercel.

### Other hosts

Any host that runs a persistent Node.js server works, such as a VPS, Render or Railway:

```bash
npm ci && npm run build && npm start
```

Put HTTPS in front of it, and set the same environment variables.

### Third-party services

- **Resend (email confirmation).** Create an account at [resend.com](https://resend.com), add your domain under **Domains**, and add the DNS records it shows at your domain provider until the domain reads **Verified**. Then create an API key under **API Keys** with sending access. Put the key in `RESEND_API_KEY` and the sender in `EMAIL_FROM`, both locally and in Vercel's Production variables. New accounts get a confirmation link after sign-up, and the account page has a **Send confirmation link** button. The link works for 24 hours and only confirms the address; it never signs anyone in. Once an email is confirmed, Google sign-in with that address opens the existing account directly.
- **Google sign-in.** In the Google Cloud Console, open **APIs & Services**, set up the **OAuth consent screen**, then under **Credentials** create an **OAuth client ID** of type **Web application**. Add one **Authorised redirect URI** per address the site runs on: `http://localhost:3000/api/auth/callback/google` for local work and `https://YOUR_DOMAIN/api/auth/callback/google` for each live address. Copy the client ID and secret into `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. The redirect address is built from `APP_ORIGIN`, so the two must match exactly. Google signs a person in to an existing account only when that account's email is verified. Anyone else sees a message asking them to sign in another way first and connect Google from the account page. People who join with Google have no mobile number on their account; delivery addresses still carry their own number.
- **Cloudinary.** Copy the cloud name, API key and API secret from **Settings**, then **API Keys**. There's nothing else to configure, because the server signs each upload.
- **Razorpay.** Add the key ID and secret from the dashboard. Create a webhook pointing at `https://YOUR_DOMAIN/api/payments/razorpay/webhook` with a secret of your choice. Subscribe to `payment.authorized`, `payment.captured`, `payment.failed`, `refund.processed` and `refund.failed`.
- **SMS.** The app sends `POST SMS_API_URL` with `Authorization: Bearer SMS_API_TOKEN` and a JSON body of `{ "to": "+91XXXXXXXXXX", "message": "..." }`. Most Indian gateways use their own format, so a small relay may be needed. Transactional SMS in India also needs DLT registration of the sender ID and template. The OTP text is fixed in `src/lib/auth/sms.ts`.
- **Atlas Search (optional).** Create a search index named `products` on the `products` collection from [docs/atlas-search.json](docs/atlas-search.json), then set `ATLAS_SEARCH_ENABLED=true`. Synonyms are managed from the super-admin dashboard.

### Scheduled jobs

These must run in production:

| Job | Ideal frequency | Vercel schedule now | Route | On other hosts |
|---|---|---|---|---|
| Expire abandoned Razorpay checkouts and release their stock | Every minute | Daily, 02:30 IST | `/api/cron/expire-reservations` | `npm run reservations:expire` |
| Delete expired data | Daily | Daily, 03:00 IST | `/api/cron/retention` | `npm run retention:run` |
| Publish approved scheduled changes | Every minute | Daily, 06:00 IST | `/api/cron/publish-scheduled` | `npm run approvals:publish` |

On Vercel, `vercel.json` schedules these automatically on production deployments, using `CRON_SECRET`. Previews don't run crons. Hobby may run each job up to 59 minutes after its scheduled time.

The daily schedules keep the project deployable on the free Hobby plan. Daily is fine for retention. It's also fine for the other two while Razorpay is off and nobody schedules approvals. Once you switch to Pro and turn on Razorpay, change the first and third schedules to `* * * * *`. Otherwise stock held by an abandoned online payment stays reserved until the next daily run.

On other hosts, run the npm scripts from cron instead.

### Production checklist

- [ ] Fresh production secrets, with `MOCK_OTP=false` and `ALLOW_MOCK_OTP_IN_PRODUCTION` removed
- [ ] `APP_ORIGIN` set to the HTTPS domain
- [ ] Owner account created on the production database with `npm run owner:create`
- [ ] better-auth indexes created on the production database
- [ ] SMS gateway configured, with DLT registration complete
- [ ] Razorpay live keys and webhook set up
- [ ] Cloudinary configured
- [ ] `CRON_SECRET` set, and the three jobs showing successful runs under **Settings**, then **Cron Jobs**, in Vercel
- [ ] Only verified service areas enabled
- [ ] A paid Atlas tier with backups, and a tested restore
- [ ] Monitoring and error alerts
- [ ] Tested on real phones, with the Razorpay sandbox

## Security

- **Never commit secrets.** Git ignores `.env` and every other `.env.*` file except `.env.example`. Keep production values in your host's secret settings.
- **Sessions.** better-auth stores sessions in the database and sets signed, HTTP-only, SameSite=Lax cookies. Every session, staff included, lasts 7 days. Deactivating a user or revoking their sessions takes effect on the next request.
- **One sign-in for everyone.** Every account holds the customer role. Staff hold one extra role, sign in on `/login` like any customer, and open their workspace from the top-right account menu. Mock OTP therefore also opens staff workspaces, which is one more reason to remove it before launch.
- **Every protected page, action, API route and chat poll checks the session and permissions on the server.** Form posts and chat posts from other sites are rejected.
- **Rate limits.** Sign-in, OTP, chat and search endpoints are rate limited.
- **Minimum password length.** Customer and staff passwords need at least 8 characters.

## Known gaps

These still need work before a full launch:

- **Evidence photos are public.** Cloudinary stores them as public images, and the app only guards the link. Complaint and delivery photos should use private assets with short-lived signed links.
- **Deferred features.** GPS tracking, route optimisation, push notifications, advanced reporting, loyalty, subscriptions, custom roles and two-factor sign-in for super admins aren't built.

## Troubleshooting

| Problem | Fix |
|---|---|
| `MongoServerError: bad auth` | The database user's password doesn't match. Atlas can't show existing passwords, so reset it in **Database Users** and update `.env`. |
| Transaction errors on checkout | MongoDB isn't running as a replica set. Add `--replSet` and run `rs.initiate()`. |
| Data appears in a `test` database | The connection string has no database name. Add `/agarwal` before the `?`. |
| `node: .env: not found` from a script | The seed, owner and job scripts need a `.env` file in the project folder. |
| Sign-in fails with `APP_ORIGIN` errors | The browser address must match `APP_ORIGIN` exactly, including port and protocol. |
| Tests pass suspiciously fast | `TEST_MONGODB_URI` isn't set, so integration tests were skipped. |
| Changes to `.env` aren't picked up | Restart the dev server. The database connection is opened once and cached. |
| Sign-in works but every page says forbidden, or staff see no workspace | The database still has the old single `role` field. Run `npm run migrate:roles` once. |

## More documentation

- [Architecture](docs/ARCHITECTURE.md): boundaries, data model and retention policy
- [Implementation notes](docs/IMPLEMENTATION.md): decisions and how each area works
- [External services](docs/EXTERNAL-SERVICES.md): providers and their costs
- [Photo credits](docs/PHOTO-CREDITS.md): sources for catalog images, which are representative and don't show real packaging

This is a private project. It has no open-source license, so the code can't be reused without the owner's permission.
