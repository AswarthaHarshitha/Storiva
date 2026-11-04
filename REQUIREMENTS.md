# Requirements traceability

Source documents: the *Phase 1 – 6-Hour MVP PRD* for the inventory application and the
*Technical Assessment Instructions*.

This document records how the **original assessment submission** met those requirements. That
version is preserved at commit
[`ec8291a`](https://github.com/AswarthaHarshitha/Storiva/tree/ec8291a). The implementation notes,
test counts, dates and commits below describe that version. For example, stock adjustments
have since moved from a single conditional `UPDATE` to the locked stock ledger described in
[docs/architecture.md](docs/architecture.md). Storiva has since grown beyond the PRD: scanning, a stock ledger,
CSV import, suppliers and other tools. The [README](README.md) describes the current
application. Every requirement below still holds in the current version and is covered by its
test suite.

A requirement is marked **Done** only when it has been exercised end to end, not when its screen
exists. Two kinds of verification are referenced:

- **API tests**: `server/test/*.test.ts`, run with `npm test` against PostgreSQL.
- **Browser walkthrough**: a scripted run of every flow below in Chromium at desktop (1360 px),
  tablet (820 px) and phone (390 px) widths against the production build (`NODE_ENV=production`,
  compiled server serving the built web app). It fails on any browser console error and runs an
  axe-core WCAG 2.1 A/AA scan of every screen and dialog. Last run locally on 3 November 2026:
  all steps passed, no console errors, no accessibility violations. Run against the live
  deployment on 3 November 2026 (commit `eb9fcd2`): all 27 steps passed, no console errors, no
  accessibility violations. The script was run during development and is not part of the
  repository's automated suite.
- **Production API checks**: requests against the live API compared with the rows in the
  production database (3 November 2026, commit `eb9fcd2`); see "Production verification" below.

Paths: `S/` is `server/src/`, `W/` is `web/src/`.

## Functional requirements (PRD §3)

| ID | Requirement | Status | Backend | Frontend | Tests | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| FR-1.1 | Sign up with email, password, confirm password and organization name | Done | `S/services/authService.ts` `signUp`, `S/validation/auth.ts` | `W/pages/SignupPage.tsx` | auth: signup creates user + org; validates every field; confirmation must match; duplicate email (any case) → 409 | Browser: empty form errors, mismatched confirmation, successful signup |
| FR-1.2 | Email and password login with basic validation | Done | `verifyCredentials`, `S/controllers/authController.ts` | `W/pages/LoginPage.tsx` | auth: valid login; wrong password and unknown email give identical 401; validation 422 | Browser: wrong password message, then successful login |
| FR-1.3 | Logout | Done | `logout` revokes the session row | `W/components/AppLayout.tsx` | auth: session revoked on logout; the old token replayed after logout gets 401 | Browser: logout, then protected page redirects to login |
| FR-1.4 | Passwords hashed (bcrypt) | Done | bcrypt cost 12 in `authService.ts` | | auth: stored hash is bcrypt `$2…$12$`, not the password | |
| FR-1.5 | Protected routes | Done | `S/middleware/requireAuth.ts` on every data route | `W/App.tsx` redirects to `/login`; 401 handler in `W/main.tsx` | auth: all 10 protected endpoints return 401 without a session; forged and expired cookies rejected | Browser: `/products` and `/settings` redirect when logged out |
| FR-2.1 | Organization created on signup and linked to the user | Done | Org and user created in one transaction | Org name shown in navigation | auth: user's `organizationId` matches the new org; five concurrent signups with one email create exactly one user and one organization | Browser: org name visible after signup |
| FR-2.2 | All data scoped by organization; no cross-tenant access | Done | Every query in `S/services/productService.ts`, `dashboardService.ts`, `settingsService.ts` filters by the session's organization; other orgs' products return 404 | | tenantIsolation: A cannot list, search, read, update, adjust or delete B's product; B's row unchanged; forged `organizationId` ignored; dashboards and settings separate | Browser: second organization starts empty, gets "Product not found" and 404s for the first org's product, which stays intact |
| FR-3 | Product model: name, SKU (unique per org), description, quantity, cost/selling price, low-stock threshold, timestamps | Done | `server/prisma/schema.prisma`; case-insensitive unique index and CHECK constraints in the migration | `W/api/types.ts` | products: all fields stored; prices exact to the cent; empty optionals become null | |
| FR-4.1 | Create product with validation | Done | `createProduct`, `S/validation/product.ts` | `W/pages/ProductFormPage.tsx` | products: 14 invalid inputs rejected with field errors (including fractional threshold, 11-digit price, quantity above the limit); largest price stored exactly; duplicate SKU (any case) → 409, also under concurrent creates; same SKU allowed in another org | Browser: negative quantity and 3-decimal price rejected inline; duplicate SKU shown on the SKU field |
| FR-4.2 | Product list: name, SKU, quantity, low-stock indicator, selling price | Done | `listProducts` returns `effectiveThreshold` and `isLowStock` | `W/pages/ProductsPage.tsx` table and phone list | products: sorted list with low-stock flags | Browser: out / low (default) / low (own threshold) / in stock badges |
| FR-4.3 | Search by name or SKU | Done | `?q=` case-insensitive match on name or SKU | Debounced search field, result count, no-match state | products: name search, SKU search, no match | Browser: search by name, by SKU, no match, clear |
| FR-4.4 | Edit any field, including quantity | Done | `updateProduct` | Edit form | products: all fields updated; keep own SKU but not take another's; invalid quantity leaves row unchanged | Browser: quantity edit reflected in list and status |
| FR-4.5 | Delete with a confirmation dialog | Done | `deleteProduct` (hard delete, allowed by PRD) | `W/products/DeleteProductDialog.tsx` from list and edit page | products: delete then 404 | Browser: dialog names the product, focuses "Keep product", Escape cancels, confirm deletes |
| FR-5.1 | Quantity editable in the product form | Done | `updateProduct` | Edit form | see FR-4.4 | see FR-4.4 |
| FR-5.2 | Optional quick "adjust stock" (+/- N with a note) | Done | `adjustStock`: one conditional UPDATE, never below zero | `W/products/AdjustStockDialog.tsx`, `W/products/stockAdjustment.ts` | products: add/remove with note; below-zero rejected; 15 concurrent −1 on 10 units → exactly 10 succeed; zero/fractional rejected. Web: `planAdjustment` amounts, limits and shortfall | Browser: on hand / change / new quantity shown; over-removal blocked; "Remove 20 units" applied; note shown on edit page |
| FR-5.3 | Store last updated by and timestamp (recommended) | Done | `last_updated_by_id`, `updated_at` | Edit page header | products: `lastUpdatedBy` set on create and adjust | Browser: "Last updated … by <email>" |
| FR-6.1 | Land on the dashboard after login | Done | | `W/App.tsx`, `LoginPage` redirect | | Browser: signup and login land on dashboard (or the page originally requested) |
| FR-6.2 | Total products and total quantity | Done | `S/services/dashboardService.ts` aggregate | `W/pages/DashboardPage.tsx` summary | dashboard: empty org is all zeros; totals match stored rows; update immediately after adjust and delete | Browser: 4 products / 55 units matched the data entered |
| FR-6.3 | Low-stock items (quantity ≤ threshold, default when empty) with name, SKU, quantity, threshold | Done | SQL `quantity_on_hand <= COALESCE(product, org default)` | Low-stock table, "(default)" marker | dashboard: at-threshold included, above excluded, own vs default threshold, zero threshold, ordering | Browser: 3 low-stock rows, lowest first |
| FR-7 | Settings: organization default low-stock threshold, persisted and used everywhere | Done | `S/services/settingsService.ts` | `W/pages/SettingsPage.tsx` | dashboard: default 5; update persists and changes dashboard and product flags; invalid values rejected | Browser: −1 rejected; saved value survives reload; dashboard low-stock count changes accordingly |

## Non-functional requirements (PRD §3.5, assessment brief)

| ID | Requirement | Status | Implementation | Verification |
| --- | --- | --- | --- | --- |
| NFR-1 | Session or JWT authentication | Done | Server-side sessions; `HttpOnly`, `SameSite=Lax`, `Secure` in production; token stored hashed | API tests; production cookie attributes checked on the built server |
| NFR-2 | Validation on client and server | Done | zod on both sides; the server is authoritative | API tests (422s); web unit tests for client rules |
| NFR-3 | Database constraints and indexes | Done | Unique `(organization_id, lower(sku))`, CHECK constraints, foreign keys, indexes | Constraint behaviour covered by API tests |
| NFR-4 | Decimal-safe prices | Done | `DECIMAL(12,2)`; strings in the API | API test: `0.10` and `19.99` stored exactly |
| NFR-5 | Desktop first, usable on tablet and phone | Done | Sidebar ↔ bottom navigation; table ↔ stacked list; single-column forms | Browser at 820 px and 390 px: no horizontal overflow |
| NFR-5a | Accessibility | Done | Visible labels, linked error messages, focus management, skip link, landmarks, keyboard-visible tooltips, AA contrast | Browser: keyboard reaches row actions and shows tooltips; skip link works; axe-core reports no WCAG 2.1 A/AA violations |
| NFR-6 | No secrets in the repository | Done | Only `.env.example` is committed; `.env*` ignored | `git ls-files` reviewed |
| NFR-7 | No fabricated data | Done | No seed data or demo accounts; new organizations start empty | Browser: new organization's dashboard and product list are empty |
| NFR-8 | TypeScript strict, lint, tests and build pass | Done | `strict` in both workspaces; ESLint (type-checked rules on the server) | `npm run typecheck`, `npm run lint`, `npm test` (88 API, 35 web tests), `npm run build` |

## Assessment requirements

| ID | Requirement | Status | Notes |
| --- | --- | --- | --- |
| A-1 | Public GitHub repository | Done | https://github.com/AswarthaHarshitha/Storiva |
| A-2 | Regular, meaningful commits | Done | Commits pushed as each stage was completed |
| A-3 | Deployed on a server | Done | Render web service (`render.yaml`) with a Neon PostgreSQL database; migration `20261103061908_init` applied, `prisma migrate status` reports the schema up to date |
| A-4 | Live link shared and verified | Done | https://storiva-wovt.onrender.com/login, verified with the browser walkthrough and the production API checks below |

## Production verification

Run on 3 November 2026 against https://storiva-wovt.onrender.com (commit `eb9fcd2`) with
dedicated QA accounts, which were deleted from the production database afterwards. Existing
user accounts were not touched.

| Area | Result |
| --- | --- |
| Availability | `GET /api/health` 200; app routes and deep links served; HTTP redirects to HTTPS |
| Database | Connected to Neon over SSL; migration applied; schema up to date |
| Cookies and headers | Session cookie `HttpOnly; Secure; SameSite=Lax`; HSTS, CSP, `nosniff`, `X-Frame-Options` present; no cross-origin access granted |
| Authentication | Signup creates a linked organization; login, logout, invalid login, protected routes; an expired session is rejected and deleted; a cookie replayed after logout is rejected |
| Products | Create, edit, search by name and SKU, duplicate SKU rejected (any case), same SKU allowed in another organization, stock adjustment, delete with confirmation |
| Validation | Fractional or negative quantity, fractional threshold and 3-decimal price rejected with field errors; largest price stored exactly |
| Dashboard | Totals and low-stock count match a direct query of the organization's rows; quantity equal to the product's own threshold and to the default threshold counts as low; empty state for a new organization |
| Tenant isolation | Organization B gets 404 reading, updating, adjusting or deleting A's product, and A's row is unchanged in the database; B's search shows only B's products; a forged `organizationId` is ignored for products and settings; settings and dashboards stay separate |
| Concurrency | 10 simultaneous −1 adjustments on 5 units: exactly 5 succeed, stock ends at 0 |
| Rate limiting | Failed logins from one client draw down one quota (19, 18, 17, …) over IPv4 and IPv6; a forged `X-Forwarded-For` does not change the key; a forged `CF-Connecting-IP` is rejected by Cloudflare (403) |
| Responsive and accessibility | Desktop, tablet (820 px) and phone (390 px) without horizontal overflow; axe-core reports no WCAG 2.1 A/AA violations |

## Additions beyond the PRD

Small additions that support the required workflows without adding new data or API surface:

| Addition | Reason | Implementation | Verification |
| --- | --- | --- | --- |
| Status filter (all / low stock / out of stock) and sort (name / quantity) on the product list | Lets the owner act on the dashboard's low-stock count from the products page; the dashboard links to the filtered view | `W/products/productView.ts`, client-side over the API's list | Web unit tests; browser: filter, sort, combined empty state, dashboard link |
| Accessibility work (skip link, landmarks, keyboard-visible tooltips, AA contrast) | Usable with keyboard and screen readers | See NFR-5a | axe-core scan, keyboard checks |

## Out of scope (PRD §4)

Not implemented in the assessment submission, by design: multi-warehouse, variants, categories,
images, channel integrations, orders and reservations, purchase orders and suppliers, email
notifications, CSV import, external API access, roles and invitations, audit logs and movement
history, billing.

Later releases added some of these outside the assessment's scope: categories, catalogue images,
suppliers and receiving, CSV import and export, and a stock movement ledger with field-level
evidence. Multi-warehouse, variants, channel integrations, orders, email notifications, roles,
external API access and billing remain unimplemented.
