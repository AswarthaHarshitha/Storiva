# Storiva

A simpler way to stay in control of your inventory.

Storiva is a multi-tenant web application for keeping a product list and its stock levels up to
date. Each business works in its own private organization, sees its inventory totals at a
glance and knows which products need reordering.

**Live application:** https://storiva-wovt.onrender.com/login. Create an account to try it; every
new organization starts empty. The service runs on Render's free plan, so the first request after
a period of inactivity can take up to a minute.

| First run | Phone |
| --- | --- |
| ![Dashboard of a new organization, prompting for the first product](docs/screenshots/dashboard-first-run.png) | ![Dashboard on a phone, with bottom navigation](docs/screenshots/mobile-dashboard.png) |

| Product form with validation | Settings |
| --- | --- |
| ![Add product form showing required-field errors](docs/screenshots/product-form-validation.png) | ![Settings page with the default low-stock threshold](docs/screenshots/settings.png) |

Screenshots are taken from the deployed application with an empty QA organization; no sample
inventory was created for them.

## Overview

Small sellers often track stock in spreadsheets that drift out of date and give no warning
before an item runs out. Storiva is designed for an owner who manages their own inventory from a
laptop or desktop browser, and also works on tablets and phones.

After signing up, an owner can:

- maintain products with a SKU, quantity on hand, cost and selling price;
- increase or decrease stock as goods arrive or sell;
- see how many products and units they hold and which products are at or below their
  low-stock threshold;
- set the default threshold their organization uses.

Every organization's data is isolated from every other organization's on the server.

## Core features

- **Authentication.** Sign up with email, password and organization name; log in and out.
  Passwords are hashed and sessions are held server-side.
- **Organization isolation.** Each signup creates an organization. All products, totals and
  settings belong to one organization and can only be read or changed by its owner.
- **Product management.** Create, view, edit and delete products (name, SKU, description,
  quantity, cost price, selling price, low-stock threshold). SKUs are unique within an
  organization regardless of case. Deletion requires confirmation.
- **Stock updates.** Edit the quantity directly, or add/remove units from the product list with
  an optional note. The dialog shows the current, changed and resulting quantity, and stock
  cannot go below zero, including under simultaneous updates. Each product records who last
  changed it and when.
- **Low-stock detection.** A product is low on stock when its quantity is at or below its own
  threshold, or the organization default when it has none.
- **Dashboard.** Total products, total units on hand, the number of low-stock products and a
  table of those products, lowest quantity first. New organizations see a prompt to add their
  first product.
- **Organization settings.** The default low-stock threshold (initially 5), applied immediately
  to the dashboard and product list.
- **Search, filter and sort.** Find products by name, SKU or barcode, show only low-stock or
  out-of-stock products, and sort by name or quantity. The dashboard links straight to the
  low-stock view.
- **Barcode scanning.** Scan with a phone, tablet or laptop camera, or with a USB/Bluetooth
  scanner, to find a product, receive or issue stock, record a physical count, or start a new
  product with its barcode filled in. EAN/UPC codes are check-digit validated and matched in
  any equivalent form; a product can have several barcodes.
- **Product identification.** Scanning an unknown retail barcode looks it up in Open Food Facts
  (and its sister catalogues for cosmetics, pet food and other products) and opens Quick Add with
  the name, brand and photo filled in where the catalogue has them. Retrieved details are marked
  as unverified community data with their source and licence, and can be corrected before
  saving. Prices, quantity and threshold are always left to the user. If the catalogue has
  nothing or cannot be reached, Quick Add works the same with empty fields.
- **Stock history.** Every quantity change is recorded with who made it, how (manual, camera,
  scanner) and the quantity before and after. Repeated submissions are applied once, and a
  count is refused if the stock changed while it was being taken.

## Technology stack

| Area | Technology |
| --- | --- |
| Frontend | React 19, TypeScript 5.9, Vite 7, Tailwind CSS 4, TanStack Query 5, React Router 7, Lucide icons |
| Barcode decoding | zxing-wasm (ZXing-C++ compiled to WebAssembly), in the browser |
| Backend | Node.js (20.19 or newer; 22 in `.nvmrc`), Express 5, TypeScript 5.9 |
| Validation | zod 4, on both the client and the server |
| Database | PostgreSQL, Prisma 6 ORM and migrations |
| Security | bcryptjs, helmet, express-rate-limit, cookie-based server-side sessions |
| Testing | Vitest 4, Supertest |
| Deployment | Render (web service), Neon (PostgreSQL) |

## Architecture

```mermaid
flowchart LR
  Browser["Browser<br/>React single-page app"]
  subgraph Service["Node.js service"]
    Static["Static files<br/>(built web app)"]
    API["Express API<br/>routes → controllers → services"]
  end
  DB[("PostgreSQL")]

  Browser -- "GET /*" --> Static
  Browser -- "/api/* JSON<br/>+ session cookie" --> API
  API -- "Prisma" --> DB
```

- **Frontend.** A React single-page app. All server communication goes through one fetch wrapper
  (`web/src/api/client.ts`); TanStack Query caches responses and refreshes the product list and
  dashboard after every change.
- **Backend.** An Express JSON API. Routes map to controllers, which validate input with zod
  and call services; services perform all database access through Prisma. Responses are either
  `{ "data": … }` or `{ "error": { "code", "message", "fields"? } }`.
- **Communication.** In production one Node service serves both the API and the built web app,
  so the browser talks to a single origin and no CORS is configured. In development the Vite dev
  server proxies `/api` to the API, preserving that arrangement.
- **Database.** PostgreSQL holds organizations, users, sessions and products. Integrity rules
  are enforced by the database as well as the application: a unique index on
  `(organization_id, lower(sku))`, CHECK constraints against negative quantities, thresholds and
  prices, and foreign keys. Prices are stored as `DECIMAL(12,2)` and exchanged as strings.
- **Authentication.** A login creates a random session token stored in an `HttpOnly` cookie;
  the database keeps only its SHA-256 hash. Logging out deletes the session on the server.
- **Organization isolation.** The organization for every request is taken from the session,
  never from the request. Each product query filters by that organization in the same statement
  that reads or writes the row.

[docs/architecture.md](docs/architecture.md) covers each of these in detail, including the full
API reference. [REQUIREMENTS.md](REQUIREMENTS.md) maps every product requirement to its
implementation and tests.

## Project structure

```
server/
  prisma/              Prisma schema and SQL migrations
  src/
    app.ts             Express app: security headers, parsers, API routes, static web app
    index.ts           Process entry point
    config/            Environment variable validation
    routes/            URL-to-controller mapping
    controllers/       Request parsing and responses
    services/          Business logic and database access
    validation/        zod request schemas
    middleware/        Authentication, input parsing, error handling
    lib/               Prisma client and error helpers
  test/                API integration tests
web/
  src/
    api/               Fetch wrapper and response types
    hooks/             Server data, authentication and form state
    pages/             Screens (login, signup, dashboard, products, product form, settings)
    components/        Shared UI components
    products/          Stock adjustment and delete dialogs, barcodes, stock history
    scanner/           Camera scanning, barcode entry, scan actions
    lib/               Client-side validation and formatting
docs/architecture.md   Technical walkthrough
REQUIREMENTS.md        Requirements traceability
render.yaml            Render deployment blueprint
```

## Getting started

### Prerequisites

- Node.js 20.19 or newer (22 recommended; `nvm use` reads `.nvmrc`)
- PostgreSQL 14 or newer, with `createdb` available

### Install

```bash
git clone https://github.com/AswarthaHarshitha/Storiva.git
cd Storiva
npm install
```

### Configure and create the database

```bash
cp server/.env.example server/.env
createdb storiva
```

Edit `server/.env` and set `DATABASE_URL` for your PostgreSQL user:
`postgresql://USER:PASSWORD@localhost:5432/storiva`, or `postgresql://USER@localhost:5432/storiva`
if your local user has no password.

### Run migrations

```bash
npm run db:migrate -w server
```

### Start the application

Run the API and the web app in two terminals:

```bash
npm run dev:server   # API on http://localhost:4000
npm run dev:web      # web app on http://localhost:5173
```

Open http://localhost:5173 and create an account. A new organization starts with no products.

## Environment variables

The API reads these from `server/.env` (see `server/.env.example`). The web app needs none.

| Variable | Required | Purpose | Example |
| --- | --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection string | `postgresql://USER:PASSWORD@localhost:5432/storiva` |
| `PORT` | No | Port the API listens on (default `4000`; set by Render) | `4000` |
| `NODE_ENV` | No | `development`, `test` or `production`. Production adds the `Secure` cookie flag, trusts the hosting proxy and serves the built web app | `development` |
| `SESSION_TTL_DAYS` | No | Session lifetime in days, 1–90 (default `7`) | `7` |
| `CATALOGUE_PROVIDERS` | No | Product catalogues for unknown barcodes, in order: `openfacts`, `upcitemdb`, or `none` (default `openfacts`). UPCitemdb's free plan is off by default until its commercial terms are confirmed | `openfacts` |
| `CATALOGUE_CONTACT` | No | Identifies the application to catalogue providers in the User-Agent (default: the live site's URL) | `+https://example.com` |
| `CLIENT_IP_HEADER` | No | Header holding the real client IP, set by the edge proxy; used by the login rate limiter. Leave unset locally; `cf-connecting-ip` on Render | `cf-connecting-ip` |

The variables are validated at startup; the server refuses to start with a clear message if one
is missing or invalid.

## Testing

The API tests run the real Express app against a real PostgreSQL database. Because every test
empties the tables, they refuse to run unless the database name ends in `_test`.

```bash
createdb storiva_test
cp server/.env.test.example server/.env.test   # then set DATABASE_URL
```

| Command | What it runs |
| --- | --- |
| `npm test` | API integration tests, then web unit tests |
| `npm run typecheck` | TypeScript in strict mode, both workspaces |
| `npm run lint` | ESLint, both workspaces |
| `npm run build` | Production build of the web app and the API |

The suite currently contains 201 API tests and 47 web unit tests. The API tests cover signup
(including concurrent duplicate signups), login, logout, replay of a logged-out session token,
expired and forged sessions and every protected route; product validation and boundaries,
duplicate SKUs (including concurrent creates), search, updates, deletion and concurrent stock
adjustments; dashboard totals and low-stock rules; settings persistence; error responses; and
attempts by one organization to read, update, adjust or delete another organization's products.
Barcode tests cover normalization and check digits, equivalent EAN/UPC forms, aliases,
duplicate and invalid codes, and isolation between organizations; stock tests cover receive,
issue, counts against a changed quantity, idempotent and simultaneous requests, and ledger
consistency. The web tests cover client-side validation, payload conversion, stock status, the
stock adjustment calculation, product filtering and sorting, scan de-duplication, and how
catalogue results become a product draft. Catalogue tests use recorded response shapes through an
injected fake network; the automated suite never calls a real catalogue.

## Security

- **Passwords** are hashed with bcrypt (cost 12). Login failures return the same response
  whether or not the email exists, and the timing is equalised.
- **Sessions** use a 256-bit random token in an `HttpOnly`, `SameSite=Lax` cookie, marked
  `Secure` in production. Only a SHA-256 hash of the token is stored. Sessions expire and are
  revoked on logout.
- **Organization isolation** is enforced in the service layer: the organization comes from the
  session, and every read, update, stock adjustment and delete includes it in the query.
  Another organization's product is reported as not found (404).
- **Input validation** runs on the server for every request (zod), with database constraints as
  a second line of defence. Client-side validation only provides earlier feedback.
- **Other measures:** security headers via helmet (including a Content Security Policy), a
  20 kB request body limit, rate limiting on login and signup (20 attempts per 15 minutes per
  client IP, taken from Cloudflare's `cf-connecting-ip` on Render), parameterised queries
  throughout, and no caching of API responses.

## Deployment

`render.yaml` defines a single Render web service; the database is a PostgreSQL instance on
Neon.

1. **Database.** Create a Neon project and copy its direct (non-pooled) connection string, which
   includes `sslmode=require`.
2. **Service.** In Render, choose **New → Blueprint**, select this repository and enter the Neon
   connection string as `DATABASE_URL`.
3. **Build and start.** Render runs `npm ci --include=dev && npm run build`, then `npm start`,
   which applies pending migrations with `prisma migrate deploy` before starting the server.
   Render checks `GET /api/health`.

The blueprint also sets `CLIENT_IP_HEADER=cf-connecting-ip` so the login rate limiter sees each
visitor's real address behind Render's Cloudflare edge.

The live deployment is at https://storiva-wovt.onrender.com/login. On Render's free plan the
service stops when idle, so the first request after a quiet period can take up to a minute.
