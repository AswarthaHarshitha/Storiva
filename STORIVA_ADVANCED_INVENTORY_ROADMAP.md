# Storiva Advanced Inventory roadmap

Storiva Advanced Inventory extends the assessment MVP into a barcode-first inventory tool. This document records
what exists, what is planned, in which order, and what each step changes. It is updated at the end
of every phase.

Guiding principle: **scan when possible, automate when reliable, ask when uncertain, always allow
manual control.**

## 0. Branching and the assessment

`main` is the assessment submission and stays exactly as submitted (commit `ec8291a`). Several
Storiva Advanced Inventory capabilities (CSV import, stock movement history, audit records) are
listed as **out of scope** in the assessment PRD. To keep the submission compliant, all Storiva
Advanced Inventory work happens on the `storiva-2` branch, which is never merged into `main`.

With the owner's approval, the Render service https://storiva-wovt.onrender.com was switched to
deploy `storiva-2` (Phase 2 onwards). Every release's migrations were first rehearsed on a copy of
the production data. Live testing uses separate QA organizations, which are deleted afterwards.

## 1. Existing capabilities (audit, November 2026)

| Area | Current implementation |
| --- | --- |
| Auth | Email/password, bcrypt (cost 12), server-side sessions (hashed token, `HttpOnly`/`Secure`/`SameSite=Lax` cookie), rate-limited login/signup keyed on `cf-connecting-ip` |
| Tenancy | Organization from the session only; every product query filters by `organization_id`; other organizations' rows answer 404 |
| Data | `organizations`, `users`, `sessions`, `products` (PostgreSQL via Prisma 6, one migration). Case-insensitive unique SKU per organization, CHECK constraints, `DECIMAL(12,2)` prices |
| Products | CRUD, search (name/SKU), status filter and sort, conditional stock adjustment (never below zero), last-updated-by and last stock note |
| Dashboard | Totals, low-stock count and table (`quantity <= COALESCE(product threshold, org default)`) |
| Settings | Organization default low-stock threshold |
| Frontend | React 19 SPA, TanStack Query, Tailwind 4, same-origin API, CSP via helmet |
| Tests | 88 API integration tests (real PostgreSQL), 35 web unit tests, scripted browser walkthrough |
| Deploy | Single Render web service + Neon PostgreSQL; `prisma migrate deploy` on start |

What the current model cannot do: identify a product by barcode, record *why* a quantity changed,
reject a duplicated submission, or detect that a physical count disagrees with the system.

## 2. Phase plan

Each phase ends with: all tests passing, the browser walkthrough re-run, documentation updated and
a commit on `storiva-2`.

### Phase 1 — Barcodes, scanner, stock operations (this iteration)

| Capability | Notes |
| --- | --- |
| Barcode records | `product_barcodes`: several codes per product, unique per organization after normalization |
| Barcode normalization | GTIN check-digit validation; UPC-A and UPC-E stored as the equivalent GTIN-13 so the same item matches however it is printed; other symbologies stored as scanned (trimmed) |
| Stock ledger | `stock_movements` records every stock change: type, source, before, change, after, user, note, idempotency key. Pulled forward from Phase 3 because receive/issue/count need it for idempotency and count history, and because adding it later would leave the earliest history missing |
| Stock operations API | Receive, issue and physical count in one transaction with the ledger entry; idempotency key per request; count rejects a stale expected quantity instead of overwriting a newer one |
| Scanner page | Camera scanning (phone, tablet, webcam) with zxing-wasm served from Storiva's own origin; camera selection, torch where supported, pause/resume, continuous mode, frame de-duplication, sound/vibration feedback, scan history for the session |
| Hardware scanners | Dedicated barcode input field that accepts keyboard-wedge USB/Bluetooth scanners (fast keystrokes + Enter) and manual typing |
| Scan actions | Find, Receive, Issue, Count, Add new; unknown codes can be attached to an existing product or used to start a product draft with the barcode filled in |
| Product form | Barcode field on create; barcode list on the product page |

Not in Phase 1: external catalogue lookups (no provider evaluated yet), labels, bulk operations,
analytics.

### Phase 2 — Identification and labels

- External catalogue adapter interface (server-side only) with a cache table, one provider at a
  time behind configuration. Candidates to evaluate *before* integration: Open Food Facts (open
  data, food-centric), UPCitemdb (free trial tier), GS1 "Verified by GS1" (membership required),
  commercial barcode-lookup APIs. For each: API terms, free tier, rate limits, licensing for
  commercial use, coverage of non-food goods, account requirements. Results are shown with source
  and never fill cost, price, quantity or threshold.
- Quick Add (scan → review retrieved fields → quantity/price → save).
- Internal labels: Code 128 and QR generated from an internal identifier (`STV-…`), printable
  sheets, bulk printing. No invented GTINs.

**Phase 2 status (4 November 2026):** product identification and Quick Add are complete. Labels
were completed in the release described in section 9.

| Provider | Cost | Account | Limits | Commercial use | Decision |
| --- | --- | --- | --- | --- | --- |
| Open Food Facts family | Free | None (identifying User-Agent) | 100 product reads/min | Yes, ODbL: attribution, share-alike for derived databases | **Enabled** |
| UPCitemdb | Free plan; paid from $99/month | None for the free plan | ~100 lookups/day | Not stated in the documentation reviewed | Adapter built, **off** until terms are confirmed |
| Verified by GS1 | Not public | GS1 membership | — | Member terms | Not integrated |
| Barcode Lookup, Go-UPC | Paid | Account and key | Per plan | Per plan | Not integrated |

Verified with 201 API tests and 47 web unit tests, plus browser runs against the real Open Food
Facts API: a camera scan of a retail barcode prefilled Quick Add; a valid barcode no catalogue
knows and an internal code fell back to manual entry; an existing barcode was detected instead of
duplicated; a second organization saw only catalogue data. The earlier walkthroughs still pass.
Not verified: whether catalogue photos display, because the image server did not answer the
automated browser; the URL and CSP were checked instead.

### Phase 3 — History, bulk and Trust Radar

- History views over `stock_movements` (per product, per organization), with filters.
- CSV export; CSV import with column mapping, preview (create / update / invalid / duplicate),
  confirmation, and a single transaction per import.
- Bulk adjust, bulk edit, bulk delete with confirmation.
- **Inventory Trust Radar**: a deterministic, rule-based confidence level per product from ledger
  evidence (time since last count, count discrepancies and whether they were resolved,
  unexplained manual corrections). Each level lists the rules that produced it; it is a guide for
  what to count next, not a probability. Verification queue of products most worth counting.
- Inventory Evidence Graph (from the Intelligence Layer brief) fits here: the ledger already
  records the source of quantity changes; field-level provenance for name/price/barcode adds a
  separate `field_evidence` table rather than columns on `products`.

### Phase 4 — Assisted identification and receiving

- Image matching against the organization's own catalogue first; results labelled as
  suggestions; confirmation required.
- Invoice/receipt extraction with mandatory human review; stores processing status and outcome.
- Both depend on an external vision/OCR provider: cost, data retention and where uploaded images
  go must be agreed with the owner before any integration. Uploads: size limits, MIME and content
  validation, per-organization storage, rate limits.

### Phase 5 — Hands-free, offline, intelligence

- Voice commands mapped to the same confirm-before-apply flow (Web Speech API availability
  varies by browser; always optional).
- Offline scanning as a PWA: queued operations carry the idempotency key and the expected
  quantity, so replays are safe and stale counts are surfaced for review rather than applied.
- Valuation, reorder suggestions, slow-moving and overstock indicators, drift detection — each
  based on ledger history, each explaining its basis, and silent when history is insufficient.

## 3. Intelligence Layer assessment

| Proposal | Depends on | Assessment | Placement |
| --- | --- | --- | --- |
| Inventory Evidence Graph | Ledger (Phase 1), field provenance | High value and cheap once the ledger exists; it is the foundation for Trust Radar and drift rules | Phase 3 |
| Drift detection | Months of ledger data | Rule-based alerts (repeated corrections, large count differences, reversals) are feasible; statistical methods need history that no organization has yet. Wording must never imply theft | Phase 3 rules, Phase 5 statistics |
| Exception Manager | Count discrepancies, import errors, failed lookups | Valuable as one queue once those sources exist; overlaps with Trust Radar's verification queue — build as one workspace | Phase 3–4 |
| Decision Simulator | Demand history | Useful only with real issue history; without it, projections would be guesses. Simulations never touch stock | After Phase 3 has gathered data |
| Supplier reliability | Suppliers, purchase receipts | Requires supplier and expected-quantity data that Storiva does not model; adds procurement scope | Deferred |
| Visual shelf intelligence | Vision provider, catalogue images | Expensive and unreliable for counting; at most "flag for verification" | Deferred, research only |
| Natural-language copilot | LLM provider, all deterministic services | Feasible as a layer over existing endpoints with confirm-before-apply; adds per-request cost and a provider dependency | Phase 5, optional |

Differentiation: the combination worth building is **ledger + evidence + Trust Radar + exception
queue**, i.e. telling a small business how far to trust each recorded quantity and what to count
next. A competitive matrix of established tools (for example Sortly, inFlow, Zoho Inventory,
Odoo Inventory) will be compiled from their current public documentation before Phase 3; no
uniqueness claim is made until then.

## 4. Data model changes

All additive; existing tables and rows are untouched.

```
product_barcodes  id, organization_id → organizations, product_id → products (cascade),
                  code (normalized), raw_code, kind (gtin | other), created_by_id, created_at
                  UNIQUE (organization_id, code)

stock_movements   id, organization_id → organizations, product_id → products (set null),
                  product_sku, product_name (snapshot), type (create | edit | adjust | receive |
                  issue | count), source (manual | camera | scanner), quantity_before,
                  quantity_change, quantity_after, note, user_id → users (set null),
                  idempotency_key, created_at
                  UNIQUE (organization_id, idempotency_key)
                  INDEX (organization_id, product_id, created_at)
```

Migration safety: the migration only creates tables and indexes. It is tested on a fresh database
and on a restored copy of production data before any deployment; production is backed up before
it is applied.

## 5. API changes (Phase 1)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/barcodes/:code` | Normalize a scanned code and return the matching product in the caller's organization, or none |
| POST | `/api/products/:id/barcodes` | Attach a barcode to a product |
| DELETE | `/api/products/:id/barcodes/:barcodeId` | Remove a barcode |
| POST | `/api/stock/operations` | Receive, issue or count, with `idempotencyKey`, `source` and (for counts) `expectedQuantity` |
| GET | `/api/products/:id/movements` | Recent stock movements for a product |

`POST /api/products` and `GET /api/products/:id` gain barcodes. Existing endpoints keep their
behaviour; product create, edit and adjust additionally write ledger entries.

## 6. Security implications

- Every new query includes the session's organization; barcode lookups only ever search the
  caller's organization. A barcode registered by another organization is invisible, and the same
  code may be registered independently by different organizations.
- Idempotency keys are scoped per organization, so one organization cannot replay or probe
  another's keys.
- The decoder runs entirely in the browser; camera frames are never uploaded.
- CSP gains `'wasm-unsafe-eval'` (required to compile WebAssembly) but no external origins; the
  WebAssembly file is served by Storiva itself. Camera access is requested only on the scanner
  page and only after the user presses Start.

## 7. Risks

| Risk | Mitigation |
| --- | --- |
| Camera APIs differ across browsers/devices | Hardware/manual input always available; feature detection for torch and camera selection |
| Same barcode read many times from consecutive frames | Code must leave the frame (or a cooldown pass) before it is processed again |
| Double submission on slow networks | Client idempotency key per operation; server returns the original result on replay |
| Count overwrites a change made while counting | Count carries the quantity the user saw; a mismatch is returned for review |
| Scope creep against the assessment | Separate branch; `main` unchanged |

## 8. Acceptance criteria — Phase 1 (complete, 3 November 2026)

Verified on the production build with a dedicated QA organization: 169 API tests and 42 web
unit tests, the original 27-step browser walkthrough (unchanged features), and a 15-step scanner
walkthrough in which Chromium's camera is fed a video of real EAN-13 and UPC-A barcodes, so the
camera, decoder, lookup and ledger path is exercised end to end. No console errors and no
axe-core WCAG 2.1 A/AA violations.

- [x] A product can have several barcodes; codes are unique per organization after
      normalization; UPC-A, EAN-13 and GTIN-14 forms (and expanded UPC-E) match the same product.
      *API tests; camera test reading a UPC-A label for a product registered by its EAN-13 form.*
- [x] Invalid GTIN check digits are rejected with a clear message. *Unit, API and browser tests.*
- [x] Scanning (camera or hardware) finds a product in the caller's organization only. *API
      tests; browser: a second organization scanning the same code sees "not in your inventory".*
- [x] Receive and issue change stock atomically, never below zero, with a ledger entry.
      *API tests including simultaneous operations; browser: camera receive, scanner issue.*
- [x] A count shows system quantity, counted quantity and difference, requires confirmation, and
      refuses to overwrite a quantity that changed since it was displayed. *API test; browser:
      stock issued during a count, count refused, form refreshed, re-confirmed.*
- [x] Re-submitting an operation with the same idempotency key does not apply it twice. *API
      tests for sequential and simultaneous duplicates; the latter was confirmed to fail when
      the race handling is removed.*
- [x] Unknown codes lead to "attach to existing product" or "create product with this barcode".
      *Browser test of both paths.*
- [x] Holding a barcode in front of the camera does not repeat an operation. *Unit tests;
      browser: continuous receive applied exactly once while the code stayed in view for 4 s.*
- [x] All existing tests and workflows still pass. *A regression found here (the product edit
      form not returning to the list after saving, caused by a form remount racing the save
      callback) was fixed in its own commit.*
- [x] The migration is additive and safe on real data: applied to a local copy of the
      production rows (organizations, users, products), every product row was identical
      afterwards, and existing products could be scanned, received and edited. The copy was
      deleted after the check.

### Not done in Phase 1

- Nothing has been deployed: production still runs `main`.
- Existing products have no barcodes until they are added (product page or "Add it to an
  existing product" after a scan) and no ledger history before the migration.
- Without a reported format, an 8-digit number is treated as EAN-8; a hardware scanner set to
  transmit UPC-E unexpanded would not match its UPC-A form. Most scanners expand UPC-E by
  default; this is noted for Phase 2.
- The browser walkthroughs are development scripts, not part of the repository's suite.

## 9. Complete release (4 November 2026)

Phases 2 to 5 were finished in one release on `storiva-2` and deployed to the existing service.
The README describes each tool and its limits; `docs/architecture.md` §6c describes how they work.

| Planned | Delivered | Notes |
| --- | --- | --- |
| Labels | Code 128 and QR; four thermal roll sizes and three A4 sheets; preview, copies, print to PDF | Labels encode the SKU, not an invented GTIN |
| CSV import and export | Automatic column matching, preview, duplicate detection, one-transaction commit, error report, export | Bulk edit and bulk delete screens beyond CSV were not built |
| History | Per-product stock history (from Phase 1) and the Copilot's "history of …" | No organization-wide history page with filters yet |
| Evidence Graph | Origin, author, time and "checked" status for seven product fields, plus quantity verification from the ledger | Values set before tracking began are shown as unknown |
| Trust Radar | Rule-based levels, reasons, count-next queue | Not a probability |
| Exception Manager | Eight causes, evidence, resolution with a required note, automatic closing | |
| Supplier reliability | Suppliers, receipts with expected, received and damaged quantities, on-time and complete rates | Shown only after confirmed receipts exist |
| Invoice extraction | Tesseract.js in the browser, parser, confidence-rated matching, human confirmation | Images only; no paid OCR provider |
| Image matching | Barcode or SKU in a photo (certain), or OCR text matched to names (with confidence) | No visual machine learning; no paid vision provider |
| Decision Simulator | Purchase, price, cost and delayed-delivery scenarios, valuation, slow-moving | Demand figures only with at least 14 days and 3 issues in 90 days |
| Copilot | Rule-based intents, proposals, confirm-before-apply, read-back | No language model, so no provider cost and no data leaves the server |
| Offline | Service worker, device snapshot, queued receive, issue and count, conflict review | Other screens need a connection |
| Voice commands | Not built | Web Speech API support varies by browser |
| Competitive matrix | Not compiled | No uniqueness claims are made |

Integrations that need the owner's credentials or agreement before they can be switched on:
UPCitemdb (adapter built, off until its commercial terms are confirmed), Verified by GS1
(membership), and any paid OCR, vision or language-model provider. None is required for the
features above.

Verification:

- 296 server tests and 69 web unit tests.
- Four browser suites (68 steps, axe accessibility checks, no console errors), run on a local
  production build and on the deployed site.
- The migration rehearsed on a copy of production: the product rows were checksummed before and
  after and matched. The same checksum was confirmed on production after deployment.

