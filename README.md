# Storiva

Inventory management for small businesses, built around the barcode scanner.

- **Live application:** https://storiva-wovt.onrender.com/login
- **Repository:** https://github.com/AswarthaHarshitha/Storiva

Storiva keeps a business's product list and stock levels accurate. A shop owner or storekeeper can
scan goods in and out with a phone camera or a USB scanner, see what is running low, and find out
how far each recorded quantity can be trusted. Every business works in its own private
organization.

Many small sellers keep stock in spreadsheets that drift out of date: deliveries are recorded
late, counts are never reconciled, and nobody can say whether "12 on hand" is still true. Storiva
targets that gap. It records every stock change with who made it and how, refuses changes that
would silently overwrite each other, and points out the quantities most worth recounting.

The application is free to try: create an account, and a new organization starts empty. It runs on
Render's free plan, so the first request after a quiet period can take up to a minute.

## Contents

- [Screenshots](#screenshots)
- [Features](#features)
- [Technology stack](#technology-stack)
- [Architecture](#architecture)
- [Getting started](#getting-started)
- [Testing](#testing)
- [Security and data integrity](#security-and-data-integrity)
- [Deployment](#deployment)
- [Limitations](#limitations)
- [Project structure](#project-structure)
- [Further documentation](#further-documentation)

## Screenshots

All screenshots are from the deployed application, using temporary QA organizations that were
deleted afterwards. The products in them come from generated sample CSV files. The camera was fed
recorded test videos of printed barcodes. The Quick Add details are Open Food Facts' real entry
for that barcode.

### Everyday use

| Dashboard | Products |
| --- | --- |
| ![Dashboard with product and unit totals and a table of low-stock items](docs/screenshots/dashboard.png) | ![Product list with search, filter, sort and stock status for each product](docs/screenshots/products.png) |

### Scanning

| Camera scanning | Quick Add from the product catalogue |
| --- | --- |
| ![Scan page: the camera has read a barcode and shows the matching product](docs/screenshots/scan-camera.png) | ![An unknown barcode opens Quick Add with the name and brand filled from Open Food Facts](docs/screenshots/quick-add.png) |

| Barcode filled by the camera on Add product | Barcodes and stock history |
| --- | --- |
| ![Add product with the scanned barcode filled in and a warning that another product already uses it](docs/screenshots/product-form-scan.png) | ![Product page listing its barcode, an Add a barcode field with a camera button, and stock history](docs/screenshots/product-barcodes-history.png) |

### Advanced tools

| Trust Radar | Exception Manager |
| --- | --- |
| ![Trust Radar summarising never-counted and doubtful quantities with a count-next queue](docs/screenshots/advanced-trust-radar.png) | ![Exception Manager listing a never-counted group and other open issues](docs/screenshots/advanced-exceptions.png) |

| Receipt read from an invoice photo | Evidence and stock reliability |
| --- | --- |
| ![Confirmed receipt whose lines were read from an invoice photo, one matched with medium confidence](docs/screenshots/advanced-receipt.png) | ![Product page showing stock reliability, the origin of each field and the stock history](docs/screenshots/advanced-product-evidence.png) |

| Copilot | Labels |
| --- | --- |
| ![Copilot answering which products need replenishment](docs/screenshots/advanced-copilot.png) | ![Label designer with a Code 128 label preview](docs/screenshots/advanced-labels.png) |

| Import and export | Reports and simulator |
| --- | --- |
| ![CSV import and export page](docs/screenshots/advanced-bulk.png) | ![Stock valuation, slow-moving items and the what-if simulator](docs/screenshots/advanced-reports.png) |

### First run, settings and phone layout

| First run | Settings |
| --- | --- |
| ![Dashboard of a new organization, prompting for the first product](docs/screenshots/dashboard-first-run.png) | ![Settings page with the default low-stock threshold and the advanced tools switch](docs/screenshots/settings.png) |

| Form validation | Phone: dashboard | Phone: advanced tools |
| --- | --- | --- |
| ![Add product form showing required-field errors](docs/screenshots/product-form-validation.png) | ![Dashboard on a phone, with bottom navigation](docs/screenshots/mobile-dashboard.png) | ![The More tab on a phone listing the advanced tools](docs/screenshots/advanced-mobile-more.png) |

## Features

The everyday screens (dashboard, products, scanning, settings) are always available. The advanced
tools are switched on per device under **Settings → Show advanced tools**, so the app stays simple
for people who only scan stock in and out.

### Feature status

| Feature | Status | Notes |
| --- | --- | --- |
| Authentication and organization isolation | Complete | |
| Product and inventory management | Complete | No product variants or multiple warehouses |
| Dashboard and inventory analytics | Complete | Valuation and slow-moving reports are advanced tools |
| Camera and hardware barcode scanning | Complete | Camera formats listed under [Limitations](#limitations) |
| Find, Receive, Issue, Count and Add new modes | Complete | |
| Several barcodes per product | Complete | Up to 10 when creating; more can be added later |
| Product identification from a catalogue | Complete | Open Food Facts only, by default |
| Quick Add | Complete | |
| Product images and catalogue details | Partial | Images come only from the catalogue; there is no image upload |
| Label generation and printing | Complete | Labels encode the SKU, not a retail barcode |
| CSV import and export | Complete | |
| Inventory Evidence Graph | Complete | Covers seven product fields and the quantity |
| Inventory Trust Radar | Complete | Rule-based, not statistical |
| Exception Manager | Complete | |
| Decision Simulator | Complete | Demand figures need enough issue history |
| Suppliers and receiving | Complete | |
| Invoice and receipt reading | Complete | Images only, read on the device; accuracy depends on the photo |
| Inventory Copilot | Complete, rule-based | No language model; understands a fixed set of questions and commands |
| Visual product recognition | Partial | Barcodes and text in a photo; not appearance-based recognition |
| Offline operations and sync | Partial | Scanning with receive, issue and count only |

### Accounts and organizations

- Sign up with an email, password and organization name; log in and log out. Each signup creates
  an organization, and all of its data is visible only to that organization's account.
- Passwords are hashed with bcrypt. Sessions are held on the server and can be revoked.

### Products and stock

- Products have a name, SKU, description, brand, manufacturer, category, quantity on hand, cost
  and selling price, and an optional low-stock threshold. SKUs are unique within an organization
  regardless of letter case. Deleting a product asks for confirmation; its stock history keeps
  the product's name and SKU.
- Quantities can be edited in the product form, adjusted from the product list (+/− with a note),
  or changed by scanning.
- **Stock history.** Every quantity change is recorded in a ledger. Each entry stores the quantity
  before and after, who made the change, how it was made (manual, camera, scanner, import,
  receiving or Copilot) and an optional note.
- **Safe stock changes.** Stock never goes below zero, including when changes arrive at the same
  time. A repeated submission is applied once. A physical count is refused, not applied, if the
  stock changed while it was being taken.
- **Low stock.** A product is low on stock at or below its own threshold, or the organization's
  default (initially 5) when it has none.
- Search by name, SKU or barcode; filter to low-stock or out-of-stock products; sort by name or
  quantity.

### Dashboard

Total products, total units on hand, the number of low-stock products, and a table of those
products, lowest quantity first. A new organization sees a prompt to add its first product.

### Barcode scanning

- **Camera scanning** works with a phone, tablet or laptop camera.
  - The browser's built-in barcode detector is used where there is one (Chrome and Edge on
    Android, macOS and ChromeOS).
  - Other browsers, including Safari, Firefox and all iOS browsers, use ZXing compiled to
    WebAssembly. It reads the centre of the frame at full resolution, alternating with the whole
    frame.
  - The camera is asked for 1080p video and continuous focus, and an on-screen hint suggests
    moving a blurred barcode further away.
  - Frames are decoded on the device and never uploaded.
- **USB and Bluetooth scanners** work as keyboards: they type the code into the barcode field.
  Typing speed distinguishes a hardware scanner from a person, and each stock change records
  which was used.
- **Scan modes:**
  - **Find** opens a product.
  - **Receive** and **Issue** add or remove stock.
  - **Count** records a physical count and shows the difference from the system.
  - **Add new** creates a product with the barcode filled in.
  - **Continuous mode** (Receive and Issue only) applies one unit per scan without a form. A
    barcode held in view is counted once.
- **Several barcodes per product.** EAN-8, EAN-13, UPC-A, UPC-E, ITF-14 and ISBN codes are
  validated with their check digit and stored in one canonical form. A product registered by its
  EAN-13 is therefore also found from its UPC-A or GTIN-14 form. Other symbologies are stored as
  read.
- **Product form scanning.** The Barcode field on Add product and the Add a barcode field on a
  product page have a camera button. If the scanned code already belongs to another product, the
  form says so immediately.

### Product identification and Quick Add

When an unknown retail barcode is scanned, Storiva looks it up in Open Food Facts and its sister
catalogues for cosmetics, pet food and other products. It then opens **Quick Add** with the name,
brand and product photo filled in where the catalogue has them.

- The retrieved details are marked as unverified community data, with their source and licence
  (ODbL), and can be corrected before saving.
- Price, quantity and threshold are never filled from a catalogue.
- If the catalogue has nothing or cannot be reached, Quick Add opens with empty fields.
- A barcode already in the organization's inventory opens that product instead of creating a
  duplicate.

### Advanced tools

- **Labels.** Print Code 128 or QR labels on thermal rolls (50 × 25, 40 × 30, 58 × 40 or
  100 × 50 mm) or A4 label sheets (21, 24 or 65 labels). There is a true-size print preview and copies per
  product, and labels can be saved as PDF through the browser's print dialog. Labels encode the
  product's SKU, which the Storiva scanner resolves. No retail EAN/UPC numbers are invented; only
  GS1 can issue those.
- **CSV import and export.**
  - Columns are matched automatically and can be changed.
  - A preview classifies every row as create, update, unchanged or error before anything is
    written.
  - Duplicate SKUs and barcodes are detected.
  - Quantity changes on existing products go through the stock ledger.
  - An import is applied in one transaction (all or nothing) and keeps an error report.
  - Export downloads every product with its barcodes, neutralising cells that a spreadsheet
    would treat as formulas.
- **Inventory Evidence Graph.** For seven product fields (name, brand, manufacturer, category,
  description, cost and selling price), Storiva records where the current value came from: typed
  by a person, imported from a named file, filled from a catalogue, or set by a receipt. It also
  records who set it and when. A person can mark a value as checked. The quantity's evidence is
  its last physical count. Values set before tracking began are shown as unknown, not guessed.
- **Inventory Trust Radar.** Rates each recorded quantity as reliable, check soon, doubtful or
  never counted. The rating comes from fixed rules over the stock history: time since the last
  count, whether that count disagreed with the system, and how many manual corrections followed.
  The reasons are shown for every product, along with a queue of what to count next.
- **Exception Manager.** One list of issues that need a person to look at them:
  - count differences;
  - unusually large corrections;
  - never-counted products;
  - incomplete pricing;
  - failed import rows;
  - receipt discrepancies;
  - unidentified barcodes;
  - offline changes that could not be applied.

  Each issue shows its evidence, and closing one requires a note. Some close by themselves when
  the cause is fixed, for example a recount that agrees.
- **Suppliers and receiving.** Record deliveries line by line, with expected, received and damaged
  quantities and unit cost. Stock changes only when the receipt is confirmed, and a confirmed
  receipt cannot be confirmed twice or edited. Supplier reliability (on-time and complete
  deliveries) appears once confirmed receipts exist.
- **Invoice and receipt reading.**
  - A photographed invoice is read on the device with Tesseract.js, and the photo is not
    uploaded.
  - The text is shown for correction, then parsed into supplier, reference, dates, total and
    lines.
  - Each line is matched to a product with a stated confidence. Exact and high-confidence matches
    are filled in; lower ones are offered for the user to choose.
  - Matching tolerates common OCR misreadings (I/l/1, O/0, missing spaces).
- **Inventory Copilot.** Answers questions such as "which products are running low?" or "which have
  not been verified?" from the organization's data, using fixed rules. Stock commands such as "add
  10 wireless mouse" are shown as a proposal (now, change, after) and saved only when confirmed.
  The confirmed change goes through the normal stock checks and is read back from the database.
  No language model is used, and nothing leaves Storiva.
- **Identify by photo.** A barcode or SKU label in a photo identifies the product with certainty.
  Otherwise, text read from the photo is matched against product names, and the candidates are
  shown with their confidence.
- **Reports and Decision Simulator.**
  - Stock value at cost and at selling price, stating how many products lack a price.
  - Slow-moving products, with new products reported as too new to judge.
  - A correction summary.
  - The simulator shows how a purchase, a price or cost change, or a delayed delivery would
    affect units, value, margin and days of cover. Demand-based figures appear only with at least
    14 days and 3 issues of history in the last 90 days. A simulation never changes stock.
- **Offline scanning.**
  - The app shell is cached by a service worker, and the product list is kept on the device.
  - Without a connection, the scanner still identifies products and queues receives, issues and
    counts.
  - The queue is sent when the connection returns, each operation exactly once.
  - A queued count against a quantity that changed in the meantime is not applied. It is marked
    *Needs review* and reported as an exception.
  - Logging out clears the device's copy.

## Technology stack

| Area | Technology |
| --- | --- |
| Frontend | React 19, TypeScript 5.9, Vite 7, Tailwind CSS 4, TanStack Query 5, React Router 7, Lucide icons |
| Backend | Node.js (20.19 or newer; 22 in `.nvmrc`), Express 5, TypeScript 5.9 |
| Database | PostgreSQL with Prisma 6 (schema, client and migrations) |
| Validation | zod 4, on the client and the server |
| Security | bcryptjs, helmet, express-rate-limit, cookie-parser |
| Barcodes | The browser's BarcodeDetector where available; zxing-wasm (ZXing-C++ as WebAssembly) for decoding elsewhere and for label encoding |
| Text recognition | Tesseract.js 7 with the English model, self-hosted and run in the browser |
| Offline | Service worker and IndexedDB |
| External service | Open Food Facts API (free, no account; ODbL data). A UPCitemdb adapter exists but is off by default |
| Testing | Vitest 4 and Supertest. Playwright and axe-core were used for browser verification; those scripts are not in the repository |
| Hosting | Render web service; Neon PostgreSQL |

## Architecture

```mermaid
flowchart LR
  subgraph Browser
    SPA["React app"]
    Dec["Barcode decoding<br/>and OCR (on device)"]
    IDB[("IndexedDB<br/>offline queue")]
  end
  subgraph Render["Render web service (Node.js)"]
    Static["Built web app"]
    API["Express API<br/>routes → controllers → services"]
  end
  DB[("PostgreSQL<br/>(Neon)")]
  OFF["Open Food Facts"]

  SPA --> Dec
  SPA --> IDB
  SPA -- "GET /*" --> Static
  SPA -- "/api/* + session cookie" --> API
  API -- "Prisma" --> DB
  API -- "unknown retail barcodes" --> OFF
```

**Frontend.**
- A React single-page app. All server calls go through one fetch wrapper (`web/src/api/client.ts`),
  and TanStack Query caches responses and refreshes the affected views after every change.
- The scanner, the advanced pages and the camera dialog are loaded only when first used. The main
  bundle is about 460 kB (142 kB gzipped).
- The decoders and the OCR model are bundled with the app and served by Storiva itself, never
  from a third-party CDN.

**Backend.**
- An Express JSON API. Routes map to controllers, which validate input with zod and call
  services; services do all database work through Prisma.
- Responses are `{ "data": … }` or `{ "error": { "code", "message", "fields"? } }`.
- In production one Node process serves both the API and the built web app from the same origin,
  so there is no CORS configuration. In development, Vite proxies `/api` to the API.

**API structure.** 45 endpoints under `/api`, in these groups:

- authentication;
- products and their barcodes;
- stock operations and history;
- dashboard and settings;
- catalogue lookup;
- import and export;
- evidence and trust;
- exceptions;
- reports and simulation;
- suppliers and receipts;
- Copilot and photo recognition.

The full reference is in [docs/architecture.md](docs/architecture.md#7-api-reference).

**Database design.** 14 tables, created by four migrations in `server/prisma/migrations`:

| Group | Tables |
| --- | --- |
| Accounts | `organizations`, `users`, `sessions` |
| Inventory | `products`, `product_barcodes`, `stock_movements` (the ledger) |
| Catalogue cache | `catalogue_entries` (public catalogue answers only, shared across organizations) |
| Evidence and issues | `product_evidence`, `inventory_exceptions`, `import_batches` |
| Receiving | `suppliers`, `receipts`, `receipt_lines` |

The database enforces its own integrity rules:

- SKUs are unique per organization regardless of case, through a unique index on
  `(organization_id, lower(sku))`.
- CHECK constraints prevent negative quantities and prices, ledger rows whose arithmetic does
  not add up, and damaged quantities greater than received ones.
- Every table that refers to a product or receipt uses a composite foreign key that includes the
  organization.
- Prices are `DECIMAL(12,2)` and travel through the API as strings, so no floating-point
  rounding occurs.

**Authentication and authorization.**
- A login creates a 256-bit random session token, sent in an `HttpOnly` cookie. The database
  stores only its SHA-256 hash.
- Every route except health, signup, login and logout requires a valid session.
- Each organization has one owner account, and there are no roles.

**Organization isolation.** The organization is always taken from the session, never from the
request, and every query includes it in the same statement that reads or writes. Another
organization's record is answered with `404`, exactly like a missing one.

**Barcode and catalogue integration.**
- Barcode lookups search only the caller's organization: registered barcodes first, then an
  exact SKU.
- Catalogue lookups go through a provider interface on the server, so a provider can be swapped
  without changing product code.
- Answers are cached for 30 days when found and 1 day when not.
- Each provider has a request budget below its published limit, and each organization is
  limited to 30 lookups a minute.

**Background processing.** There are no background jobs or queues. Trust levels, exceptions and
reports are computed when they are requested, and expired sessions are removed when they are
next used or when their user logs in.

**Offline synchronization.**
- Queued operations live in IndexedDB, and each keeps the idempotency key it was created with.
- On reconnect they are sent in order. Each result is classified as applied, already applied,
  conflict (needs review, and reported to the server as an exception) or retry later.
- The service worker caches only the app shell; API responses are never cached.

[docs/architecture.md](docs/architecture.md) explains each part in more detail.

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

### Configure the environment and the database

```bash
cp server/.env.example server/.env
createdb storiva
```

Edit `server/.env` and set `DATABASE_URL` for your PostgreSQL user:
`postgresql://USER:PASSWORD@localhost:5432/storiva`, or `postgresql://USER@localhost:5432/storiva`
if your local user has no password. Then apply the migrations:

```bash
npm run db:migrate -w server
```

### Run

Start the API and the web app in two terminals:

```bash
npm run dev:server   # API on http://localhost:4000
npm run dev:web      # web app on http://localhost:5173
```

Open http://localhost:5173 and create an account. The camera needs a secure context: `localhost`
counts as one, but another device on your network needs HTTPS.

### Environment variables

The API reads these from `server/.env`; the web app needs none. They are validated at startup, and
the server refuses to start with a clear message if one is missing or invalid.

| Variable | Required | Purpose | Example |
| --- | --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection string | `postgresql://USER:PASSWORD@localhost:5432/storiva` |
| `PORT` | No | Port the API listens on (default `4000`; set by Render) | `4000` |
| `NODE_ENV` | No | `development`, `test` or `production`. Production adds the `Secure` cookie flag, trusts the hosting proxy and serves the built web app | `development` |
| `SESSION_TTL_DAYS` | No | Session lifetime in days, 1–90 (default `7`) | `7` |
| `CATALOGUE_PROVIDERS` | No | Catalogues for unknown barcodes, in order: `openfacts`, `upcitemdb`, or `none` (default `openfacts`) | `openfacts` |
| `CATALOGUE_CONTACT` | No | Identifies the application to catalogue providers in the User-Agent | `+https://example.com` |
| `CLIENT_IP_HEADER` | No | Header holding the real client IP, set by the edge proxy; used by the login rate limiter. Leave unset locally; `cf-connecting-ip` on Render | `cf-connecting-ip` |

## Testing

The API tests run the real Express app against a real PostgreSQL database. Because every test
empties the tables, the suite refuses to run unless the database name ends in `_test`.

```bash
createdb storiva_test
cp server/.env.test.example server/.env.test   # then set DATABASE_URL
```

| Command | What it runs |
| --- | --- |
| `npm test` | Server tests, then web unit tests |
| `npm run typecheck` | TypeScript in strict mode, both workspaces |
| `npm run lint` | ESLint, both workspaces |
| `npm run build` | Production build of the web app and the API |

**Results (4 November 2026):**

| Check | Result |
| --- | --- |
| Server tests | 296 passed (17 files) |
| Web unit tests | 69 passed (9 files) |
| Type check | Passed |
| Lint | Passed |
| Production build | Passed, no warnings |

**What the tests cover.** The server suite is mostly integration tests through HTTP:

- signup, including simultaneous duplicate signups;
- login and logout, plus expired, forged and replayed sessions;
- product validation and boundaries, including duplicate SKUs under simultaneous requests;
- stock operations: simultaneous changes, idempotent replays, and counts against a changed
  quantity;
- barcode normalization and its isolation between organizations;
- attempts by one organization to read or change another's data, across every resource;
- the advanced tools: import preview and rollback, evidence, trust, exceptions, receipt
  confirmation applied exactly once, and Copilot proposals.

Pure rules such as matching, trust, simulation, invoice parsing and Copilot intents have unit
tests. The web tests cover client validation, stock calculations, filtering and sorting, scan
de-duplication, catalogue drafts, CSV parsing and column matching, label sheet geometry, and
offline sync classification. The suite never calls a real catalogue; recorded response shapes are
used instead.

**Browser verification.** The production build was also exercised in a real browser with
Playwright, on a local copy and on the deployed site. Each run used axe-core accessibility checks
and failed on any console error. The scripts are development tools and are not in the repository.

- A 27-step walkthrough of the core features.
- A 15-step camera-scanning suite fed recorded barcode videos.
- 10 Quick Add steps against the real Open Food Facts catalogue.
- 16 steps across the advanced tools. These decode printed labels back to the product, read an
  invoice image with OCR, sync an offline queue and detect an offline count conflict. They also
  check that a second organization sees none of the first's data.
- A scan-speed check of sharp, small and slightly blurred barcodes, in browsers with and without
  a built-in detector.

## Security and data integrity

- **Passwords** are hashed with bcrypt (cost 12). A failed login returns the same response
  whether or not the email exists. An unknown email is still checked against a dummy hash, so
  response timing does not reveal accounts.
- **Sessions** use a 256-bit random token in an `HttpOnly`, `SameSite=Lax` cookie, marked
  `Secure` in production. Only a SHA-256 hash is stored. Sessions expire, and logging out
  deletes them on the server.
- **Authorization and isolation.**
  - The organization comes only from the session, and request bodies cannot supply one.
  - Every query filters by it in the same statement that reads or writes, so there is no gap
    between checking and acting.
  - Other organizations' records return `404`.
  - Composite foreign keys stop a barcode, evidence row, exception or receipt line from pointing
    at another organization's product, even if the application had a bug.
- **Input validation.** zod schemas validate every request on the server, and database
  constraints act as a second line of defence. Client-side validation only gives earlier
  feedback.
- **Transactions.** Signup creates the organization and the user in one transaction. Every stock
  change locks the product row (`SELECT … FOR UPDATE`) and writes the quantity and its ledger
  entry together. Imports and receipt confirmations each run in a single transaction.
- **Idempotency.** Each stock operation carries a key that is unique per organization. A repeat
  returns the original result instead of applying the change again, even when the duplicates
  arrive at the same moment.
- **Concurrency.** Counts and Copilot changes carry the quantity the user saw, and are refused
  with `409` if it changed. A receipt can be confirmed only once.
- **The Copilot never writes.** It returns a proposal, and the confirmed change goes through the
  same stock endpoint and checks as any other.
- **Privacy.** Camera frames and invoice photos are processed in the browser and never uploaded.
- **Other measures:**
  - security headers via helmet, including a Content Security Policy that allows scripts only
    from the site itself (plus WebAssembly compilation), and images only from the site, `data:`
    and `blob:` URLs and the Open Food Facts image hosts;
  - request body limits: 20 kB by default, 256 kB for receipts, and 5 MB for imports (at most
    5,000 rows);
  - rate limits: 20 login or signup attempts per 15 minutes per client IP, 40 Copilot requests
    and 30 catalogue lookups a minute;
  - parameterised queries throughout, and no caching of API responses.
- **Configuration.** Secrets are supplied only through environment variables; only `.env.example`
  files are committed.

## Deployment

The live application runs on Render as described by `render.yaml`: one web service on the free
plan, with the database on Neon PostgreSQL.

1. **Database.** Create a Neon project and copy its direct (non-pooled) connection string. It
   includes `sslmode=require`.
2. **Service.** In Render, choose **New → Blueprint**, select this repository and enter the
   connection string as `DATABASE_URL`.
3. **Build and start.** Render runs `npm ci --include=dev && npm run build`. It then runs
   `npm start`, which applies pending migrations with `prisma migrate deploy` before starting the
   server. Render checks `GET /api/health`.

The blueprint sets `NODE_ENV=production`, `NODE_VERSION=22`, `SESSION_TTL_DAYS=7` and
`CLIENT_IP_HEADER=cf-connecting-ip`. The last of these lets the login rate limiter see each
visitor's real address behind Render's Cloudflare edge. Every migration is additive. Before
deployment, each was rehearsed on a copy of the production data, and existing rows were checked
to be unchanged.

## Limitations

- **Barcode formats.** The camera reads EAN-13, EAN-8, UPC-A, UPC-E, ITF-14, ITF, Code 128,
  Code 39, Code 93, Codabar, QR and Data Matrix.
  - It does not read PDF417, Aztec, GS1 DataBar or Micro QR.
  - A hardware scanner can enter any code it can read, since it types the code.
  - A typed 8-digit number without a format is treated as EAN-8.
- **Camera scanning.** Very small or out-of-focus barcodes can still fail, especially on fixed-focus
  laptop webcams. Browsers without a built-in detector (Safari, Firefox, iOS) rely on ZXing,
  which tolerates blur less well. The camera needs HTTPS or `localhost`.
- **Catalogue lookups.**
  - They depend on Open Food Facts being reachable.
  - Its coverage is strongest for food, cosmetics and pet products, so most electronics, hardware
    and stationery are not found.
  - Its data is community-contributed and may be wrong.
  - Only retail barcodes are looked up.
  - UPCitemdb is off because its terms for commercial use were not confirmed. No paid catalogue
    is integrated.
- **Product images** come only from catalogue results; there is no image upload. Whether a photo
  appears depends on the catalogue's image server.
- **Copilot** understands a fixed set of questions and stock commands. It is deliberately not a
  language model.
- **Invoice reading** works on images only (no PDF), in English. Accuracy depends on the photo,
  and the text must be checked before confirming.
- **Identify by photo** needs a barcode, a SKU or legible text. It cannot recognise an unlabelled
  object by its appearance.
- **Offline mode.**
  - It covers the scanner and receive, issue and count only. The product list is saved on the
    device when the Scan page is opened online, so that must happen at least once first.
  - Adding products, Quick Add and all other screens need a connection.
  - The service worker is active only in production builds.
- **Scale.** The product list loads every product at once, so with a few thousand products it
  takes several seconds to open. Paging is not implemented.
- **Not implemented:**
  - several users or roles per organization;
  - multiple warehouses or variants;
  - bulk edit and bulk delete screens (beyond CSV);
  - an organization-wide history page;
  - email notifications;
  - voice commands.
- **Hosting.** On Render's free plan the service stops when idle, so the first request afterwards
  can take up to a minute.

## Project structure

```
server/
  prisma/              Prisma schema and SQL migrations
  src/
    app.ts             Express app: security headers, body limits, API routes, static web app
    index.ts           Process entry point
    config/            Environment variable validation
    routes/            URL-to-controller mapping
    controllers/       Request parsing and responses
    services/          Business logic and database access
    catalogue/         Catalogue provider interface, Open Food Facts and UPCitemdb adapters
    validation/        zod request schemas
    middleware/        Authentication, rate limits, input parsing, error handling
    lib/               Barcode rules, matching, trust, simulation, invoice parsing, Copilot intents
  test/                Integration and unit tests
web/
  src/
    api/               Fetch wrapper and response types
    hooks/             Server data, authentication, forms, advanced mode
    pages/             One component per screen
    components/        Shared UI and navigation
    products/          Stock adjustment and delete dialogs, barcodes, stock history
    scanner/           Camera scanning, decoding, barcode entry, scan actions
    advanced/          Trust and evidence panels, product picker
    labels/            Label layouts and barcode images
    bulk/              CSV parsing and column matching
    ocr/               On-device text recognition
    offline/           Device snapshot, operation queue and sync
    lib/               Client-side validation and formatting
  public/sw.js         Service worker (app shell cache)
  scripts/             Build step that copies the OCR engine into the app
docs/                  Technical walkthrough and screenshots
render.yaml            Render deployment blueprint
```

## Further documentation

- [docs/architecture.md](docs/architecture.md): request lifecycle, data model, authentication,
  isolation, scanner, catalogue and advanced tools, with the full API reference.
- [REQUIREMENTS.md](REQUIREMENTS.md): how the original assessment requirements were met and
  verified.
- [STORIVA_ADVANCED_INVENTORY_ROADMAP.md](STORIVA_ADVANCED_INVENTORY_ROADMAP.md): release history,
  provider decisions and remaining work.

The original assessment submission is preserved in the history at commit
[`ec8291a`](https://github.com/AswarthaHarshitha/Storiva/tree/ec8291a). Later work was developed
on the `storiva-2` branch and merged into `main`.
