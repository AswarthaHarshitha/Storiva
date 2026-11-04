# Storiva Advanced Inventory roadmap

Storiva Advanced Inventory extended the assessment MVP into a barcode-first inventory tool. This
document records how it was built, the decisions taken along the way, and what remains. How each
part works is explained in [docs/architecture.md](docs/architecture.md); what it does and its
limits are in the [README](README.md).

Guiding principle: **scan when possible, automate when reliable, ask when uncertain, always allow
manual control.**

## Branches and releases

The assessment submission is commit
[`ec8291a`](https://github.com/AswarthaHarshitha/Storiva/tree/ec8291a). Several of the capabilities
below (CSV import, stock movement history, audit records) were explicitly out of scope in the
assessment PRD. They were therefore developed on a separate `storiva-2` branch, leaving the
submission untouched while it was being assessed. `storiva-2` was later merged into `main`, and
the assessment version remains available at that commit.

With the owner's approval, the Render service https://storiva-wovt.onrender.com was switched to
deploy `storiva-2` from the second phase onwards. Before each release, its migrations were
rehearsed on a copy of the production data. Live testing used separate QA organizations, which
were deleted afterwards.

| Release | Date | Contents |
| --- | --- | --- |
| Assessment MVP | 3 Nov 2026 | Accounts and organizations, products, quick stock adjustment, dashboard, settings |
| Phase 1: barcodes and stock operations | 3 Nov 2026 | Several barcodes per product with GTIN normalization; the stock ledger; receive, issue and count with idempotency keys and stale-count protection; the camera and hardware scanner page |
| Phase 2: identification | 3 Nov 2026 | Catalogue provider interface with Open Food Facts; catalogue cache; Quick Add; brand, manufacturer, category and image fields |
| Complete release (phases 2–5) | 4 Nov 2026 | Labels, CSV import and export, Evidence Graph, Trust Radar, Exception Manager, suppliers and receiving, invoice reading, Copilot, identify by photo, reports and simulator, offline scanning |
| Scanner improvements | 4 Nov 2026 | Built-in barcode detector where available, full-resolution centre decoding, camera button on product forms |

## What was delivered

| Planned | Delivered | Notes |
| --- | --- | --- |
| Labels | Code 128 and QR; four thermal roll sizes and three A4 sheets; preview, copies, print to PDF | Labels encode the SKU, not an invented GTIN |
| CSV import and export | Automatic column matching, preview, duplicate detection, one-transaction commit, error report, export | No separate bulk edit or bulk delete screens |
| History | Per-product stock history, and the Copilot's "history of …" | No organization-wide history page with filters |
| Evidence Graph | Origin, author, time and "checked" status for seven product fields, plus quantity verification from the ledger | Values set before tracking began are shown as unknown |
| Trust Radar | Rule-based levels, reasons, count-next queue | Not a probability |
| Exception Manager | Eight causes, evidence, resolution with a required note, automatic closing | |
| Supplier reliability | Suppliers; receipts with expected, received and damaged quantities; on-time and complete rates | Shown only after confirmed receipts exist |
| Invoice extraction | Tesseract.js in the browser, parser, confidence-rated matching, human confirmation | Images only; no paid OCR provider |
| Image matching | Barcode or SKU in a photo (certain), or OCR text matched to names (with confidence) | No visual machine learning; no paid vision provider |
| Decision Simulator | Purchase, price, cost and delayed-delivery scenarios; valuation; slow-moving products | Demand figures only with at least 14 days and 3 issues in 90 days |
| Copilot | Rule-based intents, proposals, confirm-before-apply, read-back | No language model, so no provider cost and no data leaves the server |
| Offline | Service worker, device snapshot, queued receive, issue and count, conflict review | Other screens need a connection |
| Voice commands | Not built | Web Speech API support varies by browser |

## Catalogue provider decisions

Each provider was reviewed for cost, account requirements, limits and terms for commercial use
before integration.

| Provider | Cost | Account | Limits | Commercial use | Decision |
| --- | --- | --- | --- | --- | --- |
| Open Food Facts family | Free | None (identifying User-Agent) | 100 product reads/min | Yes, ODbL: attribution, share-alike for derived databases | **Enabled** |
| UPCitemdb | Free plan; paid from $99/month | None for the free plan | ~100 lookups/day | Not stated in the documentation reviewed | Adapter built, **off** until terms are confirmed |
| Verified by GS1 | Not public | GS1 membership | — | Member terms | Not integrated |
| Barcode Lookup, Go-UPC | Paid | Account and key | Per plan | Per plan | Not integrated |

Catalogue results never fill price, quantity or threshold, and are always shown with their source
and marked as unverified.

## Intelligence layer: what was proposed and what was built

| Proposal | Outcome |
| --- | --- |
| Inventory Evidence Graph | Built on the stock ledger, with a separate `product_evidence` table rather than columns on `products` |
| Drift detection | Rule-based only: unusual corrections and count differences become exceptions. Statistical detection needs months of history that no organization has yet. The wording never implies theft |
| Exception Manager | Built as one workspace with the Trust Radar's verification queue |
| Decision Simulator | Built; it refuses to show demand projections without enough issue history, and never changes stock |
| Supplier reliability | Built once suppliers and receipts were modelled |
| Visual shelf intelligence | Not built: unreliable for counting. Identification uses barcodes and text instead |
| Natural-language copilot | Built without a language model, as a rule-based layer over existing services with confirm-before-apply |

No claims of uniqueness are made; a comparison with established tools (for example Sortly, inFlow,
Zoho Inventory, Odoo Inventory) has not been compiled.

## Remaining work

- Paging or virtual scrolling for the product list. It loads every product at once and takes
  several seconds to open with a few thousand products.
- An organization-wide stock history page with filters.
- Bulk edit and bulk delete screens.
- Several users per organization, with roles.
- Image upload for products; images currently come only from catalogue results.
- Decoding PDF417, Aztec and GS1 DataBar with the camera.
- Voice commands, where the browser supports them.
- UPCitemdb or another general-merchandise catalogue, once commercial terms are confirmed.

Integrations that need the owner's credentials or agreement before they can be switched on:
UPCitemdb, Verified by GS1, and any paid OCR, vision or language-model provider. None is needed
for the current features.
