# Storiva

A simpler way to stay in control of your inventory.

Storiva is a multi-tenant web application for keeping a product list and its stock levels up to
date. Each business works in its own private organization, sees its inventory totals at a
glance and knows which products need reordering.

**Live application:** https://storiva-wovt.onrender.com/login. Create an account to try it; every
new organization starts empty. The service runs on Render's free plan, so the first request after
a period of inactivity can take up to a minute.

### Everyday use

| Dashboard | Products |
| --- | --- |
| ![Dashboard with product and unit totals and a table of low-stock items](docs/screenshots/dashboard.png) | ![Product list with search, filter, sort and stock status for each product](docs/screenshots/products.png) |

| Scanning with the camera | Quick Add from the product catalogue |
| --- | --- |
| ![Scan page: the camera has read a barcode and shows the matching product](docs/screenshots/scan-camera.png) | ![An unknown barcode opens Quick Add with the name and brand filled from Open Food Facts](docs/screenshots/quick-add.png) |

| Barcode filled by the camera on Add product | Barcodes and stock history |
| --- | --- |
| ![Add product with the scanned barcode filled in and a warning that another product already uses it](docs/screenshots/product-form-scan.png) | ![Product page listing its barcode, an Add a barcode field with a camera button, and stock history](docs/screenshots/product-barcodes-history.png) |

### First run and settings

| First run | Phone |
| --- | --- |
| ![Dashboard of a new organization, prompting for the first product](docs/screenshots/dashboard-first-run.png) | ![Dashboard on a phone, with bottom navigation](docs/screenshots/mobile-dashboard.png) |

| Product form with validation | Settings |
| --- | --- |
| ![Add product form showing required-field errors](docs/screenshots/product-form-validation.png) | ![Settings page with the default low-stock threshold and the advanced tools switch](docs/screenshots/settings.png) |

All screenshots are taken from the deployed application with temporary QA organizations, which
were deleted afterwards. In the everyday-use screenshots:

- The products are 24 rows from a generated sample CSV, plus one product created for the
  screenshots.
- The camera was fed recorded test videos of printed barcodes.
- The Quick Add details are Open Food Facts' real entry for that barcode.

### Advanced tools at a glance

| Trust Radar | Exception Manager |
| --- | --- |
| ![Trust Radar summarising never-counted and doubtful quantities with a count-next queue](docs/screenshots/advanced-trust-radar.png) | ![Exception Manager listing a never-counted group and other open issues](docs/screenshots/advanced-exceptions.png) |

| Receipt read from an invoice photo | Evidence and stock reliability |
| --- | --- |
| ![Confirmed receipt whose lines were read from an invoice photo, one matched with medium confidence](docs/screenshots/advanced-receipt.png) | ![Product page showing stock reliability, the origin of each field and the stock history](docs/screenshots/advanced-product-evidence.png) |

| Copilot | Labels |
| --- | --- |
| ![Copilot answering which products need replenishment](docs/screenshots/advanced-copilot.png) | ![Label designer with a Code 128 label preview](docs/screenshots/advanced-labels.png) |

| Import and export | Reports and simulator | Phone |
| --- | --- | --- |
| ![CSV import and export page](docs/screenshots/advanced-bulk.png) | ![Stock valuation, slow-moving items and the what-if simulator](docs/screenshots/advanced-reports.png) | ![The More tab on a phone listing the advanced tools](docs/screenshots/advanced-mobile-more.png) |

These come from a QA organization on the deployed application. Its 29 products were imported
from a test CSV by the automated browser suite, and the receipt was read from a rendered invoice
image. The organization was deleted after verification.

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
  - The camera uses the browser's built-in barcode detector where there is one (Chrome and Edge
    on Android, macOS and ChromeOS). Other browsers (Safari, Firefox, iOS) use ZXing, reading
    the centre of the frame at full resolution and alternating with the whole frame.
  - It asks for 1080p video and continuous focus, and shows a hint when a barcode looks
    blurred.
  - In testing, a small or slightly out-of-focus barcode that was previously never read is now
    found in about a second.
  - The **Barcode** field on Add product and the **Add a barcode** field on a product page have
    a camera button. The code is filled in when read, and a barcode already on another product
    is pointed out straight away.
- **Product identification.** Scanning an unknown retail barcode looks it up in Open Food Facts
  (and its sister catalogues for cosmetics, pet food and other products) and opens Quick Add with
  the name, brand and photo filled in where the catalogue has them. Retrieved details are marked
  as unverified community data with their source and licence, and can be corrected before
  saving. Prices, quantity and threshold are always left to the user. If the catalogue has
  nothing or cannot be reached, Quick Add works the same with empty fields.
- **Stock history.** Every quantity change is recorded with who made it, how (manual, camera,
  scanner) and the quantity before and after. Repeated submissions are applied once, and a
  count is refused if the stock changed while it was being taken.

## Advanced tools

Advanced tools are off by default, so the everyday screens stay simple. **Settings → Show
advanced tools** turns them on for that device. On a phone they appear under the **More** tab.

- **Labels.** Print Code 128 or QR labels on thermal rolls (50 × 25, 40 × 30, 58 × 40,
  100 × 50 mm) or A4 sheets (21, 24 or 65 per sheet), with a print preview at true size, several
  copies per product, and "Save as PDF" through the browser's print dialog. Labels encode the
  product's SKU, which the Storiva scanner resolves; no retail EAN/UPC numbers are invented,
  because those can only be issued by GS1.
- **Bulk import and export.** Upload a CSV, and the columns are matched automatically (each can
  be changed). The preview shows every row as create, update, unchanged or error before anything
  is written. Duplicate SKUs and barcodes are detected, and quantity changes on existing products
  go through the stock ledger as adjustments. The import runs in one transaction (all or
  nothing) and keeps an error report. Export downloads every product with its barcodes. Cells
  that a spreadsheet would treat as formulas are neutralised.
- **Evidence.** For each product detail (name, brand, category, prices and so on), Storiva shows
  where it came from: typed by a person, imported from which file, filled from a catalogue, or
  set by a receipt. It also shows who set it and when, and whether someone has since marked it as
  checked. Values set before tracking began are shown as unknown, not guessed.
- **Trust Radar.** Rates how far each recorded quantity can be relied on, from the stock ledger:
  when it was last physically counted, whether the last count disagreed, and how many manual
  corrections have happened since. The rules are fixed and explained on every product; they are
  not a probability. It also lists which products to count next.
- **Exception Manager.** Collects count differences, unusually large corrections, products never
  counted, incomplete pricing, rows that failed to import, receipt discrepancies, unidentified
  barcodes and offline changes that could not be applied. Each one shows its evidence; resolving
  or dismissing it requires a note. Some close by themselves when the cause is fixed (for example,
  a recount that agrees).
- **Suppliers and receiving.** Keep a supplier list and record deliveries line by line (expected,
  received, damaged, unit cost). Nothing changes stock until the receipt is confirmed, and a
  confirmed receipt cannot be confirmed again or edited. Supplier reliability (on-time and complete
  deliveries) is shown only once there are confirmed receipts to base it on.
- **Invoice and receipt reading.** Photograph an invoice and its text is read *on the device* with
  Tesseract.js; the photo is not uploaded. The text is shown for correction, then parsed into the
  supplier, reference, dates, total and lines. Each line is matched to a product with a stated
  confidence: exact and high-confidence matches are filled in, while lower ones are offered for
  the user to choose. Matching tolerates common OCR misreadings (I/l/1, O/0, missing spaces).
- **Copilot.** Ask in plain words, for example "which products are running low?", "which have
  not been verified?" or "add 10 wireless mouse". Answers are computed from the organization's
  data by fixed rules; no language model is used, and nothing is sent outside Storiva. A change is
  shown as a proposal (now → change → after) and is saved only when confirmed. It is then
  applied through the stock ledger with an expected-quantity check, and the result is read back
  from the database.
- **Identify by photo.** Choose a photo, and any barcode or SKU label in it identifies the product
  with certainty. Otherwise, text read from the photo is matched against product names and the
  candidates are shown with their confidence for the user to pick. This is text and barcode
  recognition, not image recognition by machine learning.
- **Reports and simulator.** Stock value at cost and at selling price (stating how many products
  lack a price), slow-moving products (new products are reported as too new to judge), and a
  correction summary. The what-if simulator shows the effect of a purchase, a price or cost change,
  or a delayed delivery on units, value, margin and days of cover. Demand-based figures appear only
  when there is enough issue history (at least 14 days and 3 issues in the last 90 days). A
  simulation never changes stock.
- **Offline scanning.** The app shell is cached by a service worker, and the product list is kept
  on the device. Without a connection, the scanner still identifies products and queues receives,
  issues and counts. The queue is sent when the connection returns, each operation exactly once.
  If the stock changed in the meantime, a queued count is not applied: it is marked *Needs
  review* and reported as an exception. Logging out clears the device's copy.

### Limits worth knowing

- The Copilot understands a fixed set of questions and stock commands. It is deliberately not a
  language model, so wording it does not recognise gets a reply listing examples of what it
  understands.
- OCR quality depends on the photo; printed invoices photographed flat and in good light read
  best. Only images are read (no PDF invoices), and the text should always be checked before
  confirming.
- Identify by photo relies on a barcode, a SKU or legible text. It cannot recognise an unlabelled
  object by its appearance.
- Offline mode covers scanning and receive, issue and count. Other screens need a connection.
- The product list loads every product at once. With a few thousand products it takes several
  seconds to open; paging is not implemented yet.

## Technology stack

| Area | Technology |
| --- | --- |
| Frontend | React 19, TypeScript 5.9, Vite 7, Tailwind CSS 4, TanStack Query 5, React Router 7, Lucide icons |
| Barcode decoding and label encoding | The browser's BarcodeDetector where available; zxing-wasm (ZXing-C++ compiled to WebAssembly) otherwise and for labels, in the browser |
| Invoice text recognition | Tesseract.js 7 with the English model, self-hosted and run in the browser |
| Offline | Service worker and IndexedDB |
| Backend | Node.js (20.19 or newer; 22 in `.nvmrc`), Express 5, TypeScript 5.9 |
| Validation | zod 4, on both the client and the server |
| Database | PostgreSQL, Prisma 6 ORM and migrations |
| Security | bcryptjs, helmet, express-rate-limit, cookie-based server-side sessions |
| Testing | Vitest 4, Supertest; Playwright and axe-core for browser verification |
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
    lib/               Prisma client, error helpers and pure rules (matching, trust,
                       simulation, invoice parsing, Copilot intents)
  test/                API integration and unit tests
web/
  src/
    api/               Fetch wrapper and response types
    hooks/             Server data, authentication and form state
    pages/             Screens (core and advanced tools)
    components/        Shared UI components and navigation
    products/          Stock adjustment and delete dialogs, barcodes, stock history
    scanner/           Camera scanning, barcode entry, scan actions
    advanced/          Trust and evidence panels, product picker
    labels/            Label layouts and barcode images
    bulk/              CSV parsing and column matching
    ocr/               On-device text recognition
    offline/           Device snapshot, operation queue and sync
    lib/               Client-side validation and formatting
  public/sw.js         Service worker (app shell cache)
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

The suite currently contains 296 server tests and 69 web unit tests. The API tests cover signup
(including concurrent duplicate signups), login, logout, replay of a logged-out session token,
expired and forged sessions and every protected route; product validation and boundaries,
duplicate SKUs (including concurrent creates), search, updates, deletion and concurrent stock
adjustments; dashboard totals and low-stock rules; settings persistence; error responses; and
attempts by one organization to read, update, adjust or delete another organization's products.
Barcode tests cover normalization and check digits, equivalent EAN/UPC forms, aliases,
duplicate and invalid codes, and isolation between organizations; stock tests cover receive,
issue, counts against a changed quantity, idempotent and simultaneous requests, and ledger
consistency.

For the advanced tools, the tests cover:

- import preview (which writes nothing), all-or-nothing commits that roll back on error, and
  export escaping;
- the origin recorded for each field, and marking a field as checked;
- trust levels and their rules;
- exception detection and automatic resolution;
- supplier reliability, and receipt confirmation applied exactly once;
- invoice parsing (dates read day first) and OCR-tolerant matching;
- Copilot intent parsing, proposals and cross-organization refusal;
- simulation arithmetic in whole cents and the minimum demand history.

The web tests cover client-side validation, payload conversion, stock status, the stock
adjustment calculation, product filtering and sorting, scan de-duplication, catalogue drafts,
CSV parsing and column matching, label sheet geometry, and how offline sync results are
classified. Catalogue tests use recorded response shapes through an injected fake network; the
automated suite never calls a real catalogue.

The production build is also checked in a real browser (Playwright, outside the repository), on a
local copy and on the deployed site, with axe accessibility checks and console-error detection on
every page:

- a 27-step walkthrough of the core features;
- 15 camera-scanning steps using a recorded barcode video;
- a scan-speed check that feeds sharp, small and slightly blurred barcodes to the camera, in
  browsers with and without a built-in detector;
- camera scanning on the product form, at desktop and phone widths;
- 10 Quick Add steps against the real Open Food Facts catalogue;
- 16 steps across the advanced tools. These decode printed labels back to the product, read an
  invoice image with OCR, sync an offline queue, detect an offline count conflict, and check that
  a second organization sees none of the first's data.

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
- **Tenant integrity in the database.** Barcodes, evidence, exceptions and receipt lines reference
  their product or receipt through composite foreign keys that include the organization. A row
  therefore cannot point at another organization's data, even through an application bug.
- **Stock changes** go through one ledger function that locks the product row, records before and
  after quantities, and honours idempotency keys. Counts and Copilot changes carry the quantity
  the user saw, and are refused with `409` if it changed meanwhile.
- **Copilot** never writes to the database itself. It returns a proposal, and the confirmed change
  goes through the same stock endpoint and checks as any other adjustment.
- **Invoice photos** are read in the browser and never uploaded; only the corrected text is sent.
- **Other measures:**
  - security headers via helmet, including a Content Security Policy: scripts only from the
    site itself, plus WebAssembly for the decoders; images only from the site, `data:` and
    `blob:` URLs, and the Open Food Facts image hosts;
  - request body limits: 20 kB in general, 256 kB for receipts and 5 MB for CSV imports
    (5,000 rows at most);
  - rate limiting on login and signup (20 attempts per 15 minutes per client IP, taken from
    Cloudflare's `cf-connecting-ip` on Render), the Copilot (40 requests a minute) and catalogue
    lookups (30 a minute);
  - CSV export cells that a spreadsheet would treat as formulas are neutralised;
  - parameterised queries throughout, and no caching of API responses.

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
