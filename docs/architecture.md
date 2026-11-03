# Storiva technical walkthrough

This document explains how Storiva is put together and why: the request lifecycle, data model,
authentication, tenant isolation, the API, the web client and the deployment. File paths are
relative to the repository root.

## 1. System overview

```
Browser (React SPA)
   │  same-origin fetch to /api/*, session cookie sent automatically
   ▼
Express app (server/src/app.ts)
   ├── /api/*  → routes → controllers → services → Prisma → PostgreSQL
   └── /*      → web/dist (built SPA, production only)
```

In production a single Node process serves both the API and the compiled web app. Because the
page and the API share an origin, the session cookie works without CORS or third-party cookie
rules, and there is no CORS configuration at all: cross-origin requests are simply not allowed.
In development the Vite dev server proxies `/api` to the API on port 4000, which keeps the same
same-origin behaviour.

## 2. Request lifecycle (backend)

`server/src/routes/index.ts` maps each URL to a controller. A request passes through:

1. **Global middleware** (`app.ts`): `helmet` security headers, `express.json` with a 20 kB
   limit, `cookie-parser`, and `Cache-Control: no-store` on all API responses.
2. **`requireAuth`** (`middleware/requireAuth.ts`) on every route except health, signup, login
   and logout. It reads the `storiva_session` cookie, looks the session up, and sets
   `req.auth = { sessionId, userId, organizationId }`. No valid session means `401`.
3. **Controller** (`controllers/*.ts`): parses the body/query with a zod schema from
   `validation/*.ts` via `parseInput`, takes `organizationId`/`userId` from `req.auth`, and
   calls a service.
4. **Service** (`services/*.ts`): all database work through Prisma.
5. **Error handler** (`middleware/errorHandler.ts`): converts `HttpError`s, malformed JSON and
   unexpected errors into the standard error body. Unexpected errors are logged and return a
   generic `500` message, so internal details never reach the client.

Express 5 forwards errors thrown in async handlers to the error handler, so controllers contain
no try/catch boilerplate.

### Response format

```json
{ "data": { ... } }
{ "error": { "code": "VALIDATION_FAILED", "message": "Some fields need attention.", "fields": { "sku": "SKU is required." } } }
```

| Status | When |
| --- | --- |
| 200 / 201 / 204 | Success (201 on create, 204 on delete and logout) |
| 400 | Body is not valid JSON |
| 401 | No valid session, or wrong email/password |
| 404 | Resource does not exist **or belongs to another organization** |
| 409 | Duplicate email or duplicate SKU |
| 422 | Validation failed; `fields` maps each field to a message |
| 429 | Too many login/signup attempts from one address |

## 3. Data model

Defined in `server/prisma/schema.prisma`; the SQL is in
`server/prisma/migrations/20261103061908_init/migration.sql`.

```
organizations 1 ──< users 1 ──< sessions
      1
      └──< products >── 0..1 users (last_updated_by)
```

| Table | Key columns | Notes |
| --- | --- | --- |
| `organizations` | `id`, `name`, `default_low_stock_threshold` (default 5) | One per signup; holds the org-wide setting |
| `users` | `id`, `email` (unique, lower-case), `password_hash`, `organization_id` | One owner per organization in this version |
| `sessions` | `token_hash` (unique), `user_id`, `expires_at` | SHA-256 of the cookie token, never the token itself |
| `products` | `organization_id`, `name`, `sku`, `description`, `quantity_on_hand`, `cost_price`, `selling_price`, `low_stock_threshold`, `last_updated_by_id`, `last_adjustment_note`, timestamps | |

Constraints enforced by the database itself, so they hold even if application code is wrong:

- `UNIQUE (organization_id, lower(sku))`: SKUs are unique within an organization, ignoring case.
  Two organizations can use the same SKU. Prisma cannot express an index on `lower()`, so it is
  written in the migration SQL.
- `CHECK` constraints: quantity, thresholds and prices cannot be negative; names and SKUs
  cannot be blank; emails must be stored lower-case.
- Foreign keys with `ON DELETE CASCADE` from organization to users/products and user to
  sessions; `last_updated_by_id` is set to `NULL` if that user is ever removed.
- Indexes on `products (organization_id, name)` for listing/search and on `sessions (user_id)`
  and `sessions (expires_at)`.

**Money.** Prices are `DECIMAL(12,2)` in PostgreSQL and travel through the API as strings such as
`"12.50"`. They are never converted to a JavaScript float on the server, so no rounding error can
creep in. The browser converts to a number only to format a value for display.

## 4. Authentication

Files: `services/authService.ts`, `services/sessionService.ts`, `middleware/requireAuth.ts`,
`controllers/authController.ts`.

**Signup** (`POST /api/auth/signup`)
1. Validate email, password (8–72 characters with a letter and a number), confirmation and
   organization name. 72 is bcrypt's input limit; longer passwords would be silently truncated.
2. Reject an existing email with `409` (emails are trimmed and lower-cased first).
3. Hash the password with bcrypt, cost 12.
4. In **one transaction**, create the organization and then the user linked to it. Either both
   exist or neither does. A race between two identical signups is caught by the unique index and
   also returns `409`.
5. Start a session (below) and return the account.

**Login** (`POST /api/auth/login`): look up the user by email and compare with bcrypt. If the
email is unknown, the password is still compared against a fixed dummy hash so the response time
does not reveal whether an account exists. Both failures return the same `401` message. Any
session cookie the browser already held is revoked before the new one is issued.

**Sessions.** A session token is 32 random bytes (`crypto.randomBytes`), sent to the browser in a
cookie with these attributes:

| Attribute | Why |
| --- | --- |
| `HttpOnly` | JavaScript cannot read it, so an XSS bug cannot steal it |
| `Secure` (production) | Only sent over HTTPS |
| `SameSite=Lax` | Not sent on cross-site POST/PUT/DELETE requests, which blocks CSRF |
| `Max-Age` = `SESSION_TTL_DAYS` | Sessions expire (default 7 days) |

The database stores only the SHA-256 hash of the token, so a leaked `sessions` table cannot be
used to log in. Each request hashes the cookie and looks the hash up; an expired session is
deleted and treated as absent. A user's expired sessions are also cleared whenever they log in.

**Logout** deletes the session row and clears the cookie, so the session is revoked on the
server, not just forgotten by the browser. This is the main reason for server-side sessions over
a stateless JWT.

**Rate limiting.** Signup and login allow 20 attempts per 15 minutes per IP
(`express-rate-limit`). In production the app trusts exactly one proxy hop (Render's load
balancer) so the real client IP is used.

## 5. Tenant isolation

This is the most important security property: one organization must never see or change another
organization's data.

1. **The organization comes only from the session.** `requireAuth` reads `organizationId` from
   the session's user row. Request bodies are parsed with zod schemas that do not include an
   `organizationId` field, so a value sent by the client is discarded.
2. **Every product query includes it in the `WHERE` clause** (`services/productService.ts`):

   | Operation | Query |
   | --- | --- |
   | List / search | `findMany({ where: { organizationId, OR: [name ILIKE, sku ILIKE] } })` |
   | Read one | `findFirst({ where: { id, organizationId } })` |
   | Update | `update({ where: { id, organizationId } })` |
   | Adjust stock | `updateMany({ where: { id, organizationId, quantityOnHand: { gte: -delta } } })` |
   | Delete | `deleteMany({ where: { id, organizationId } })` |
   | Dashboard | aggregate and raw SQL both filtered by `organization_id` |
   | Settings | `organization.update({ where: { id: organizationId } })` |

   Ownership is checked in the same statement that reads or writes, not in a separate lookup
   beforehand, so there is no gap between "check" and "act".
3. **Another organization's product is indistinguishable from a missing one.** Both return `404`
   rather than `403`, which avoids confirming that an ID exists.
4. **Malformed IDs** also return `404` instead of reaching the database.

`server/test/tenantIsolation.test.ts` creates two organizations and verifies that organization A
cannot list, search, read, update, adjust or delete organization B's product, that B's row is
unchanged afterwards, that a forged `organizationId` in a request body is ignored, and that
dashboards and settings stay separate.

**SQL injection.** All queries go through Prisma's parameterised API. The one raw query (the
low-stock list) uses Prisma's `$queryRaw` tagged template, which sends values as bind parameters.

## 6. Inventory rules

- **Low stock**: `quantity_on_hand <= COALESCE(product.low_stock_threshold, organization.default_low_stock_threshold)`.
  The same rule is computed in SQL for the dashboard and in `productService.toView` for the
  product list (`effectiveThreshold`, `isLowStock`). A product at zero is shown as
  "Out of stock" and still counts as low stock.
- **Stock adjustment** (`POST /api/products/:id/adjust-stock`) is a single conditional
  `UPDATE ... SET quantity_on_hand = quantity_on_hand + delta WHERE quantity_on_hand >= -delta`.
  Concurrent adjustments therefore cannot overwrite each other or push stock below zero; a test
  fires 15 simultaneous `-1` adjustments at 10 units and checks that exactly 10 succeed. Each
  adjustment records who made it and an optional note (`last_updated_by_id`,
  `last_adjustment_note`); there is deliberately no movement history (out of scope).
- **Last updated by**: every create, edit and adjustment stores the acting user, shown on the
  edit page with the timestamp.

## 7. API reference

All endpoints are under `/api`. Everything except health, signup, login and logout requires a
session.

| Method | Path | Body | Result |
| --- | --- | --- | --- |
| GET | `/health` | | `{ status: "ok" }` |
| POST | `/auth/signup` | `email, password, confirmPassword, organizationName` | `201` account, sets cookie |
| POST | `/auth/login` | `email, password` | account, sets cookie |
| POST | `/auth/logout` | | `204`, revokes session |
| GET | `/auth/me` | | current account and organization |
| GET | `/dashboard` | | totals, low-stock count and items, default threshold |
| GET | `/products?q=` | | products sorted by name; `q` matches name or SKU, case-insensitive |
| POST | `/products` | product fields | `201` product |
| GET | `/products/:id` | | product |
| PUT | `/products/:id` | all product fields | updated product |
| POST | `/products/:id/adjust-stock` | `delta` (non-zero integer), `note?` | updated product |
| DELETE | `/products/:id` | | `204` |
| GET | `/settings` | | organization name and default threshold |
| PUT | `/settings` | `defaultLowStockThreshold` | updated settings |

Product fields: `name` (required), `sku` (required; letters, digits, `. _ - /`), `description`,
`quantityOnHand` (required integer ≥ 0), `costPrice`, `sellingPrice` (non-negative, up to two
decimals), `lowStockThreshold` (integer ≥ 0, or `null` for the organization default).

## 8. Web client

`web/src/` is a React 19 single-page app built with Vite and styled with Tailwind CSS v4.

| Folder | Contents |
| --- | --- |
| `api/` | `client.ts` (the only place that calls `fetch`; turns error bodies into `ApiError`), `types.ts` (response shapes) |
| `hooks/` | `useAccount` (session, login, signup, logout), `useInventory` (products, dashboard, settings queries and mutations), `useForm` (form state and validation), small utilities |
| `lib/` | `validation.ts` (zod schemas mirroring the server rules), `format.ts` (number, price, time formatting) |
| `components/` | Shared UI: layout, buttons, text fields, dialog, alert, stock status badge, toast |
| `pages/` | One component per route |
| `products/` | The adjust-stock and delete-confirmation dialogs |

**Routing and auth state** (`App.tsx`). On load the app calls `GET /api/auth/me`. With no session
only `/login` and `/signup` exist and any other address redirects to login, remembering where the
person was going. With a session the app layout and pages render. If any request later returns
`401` (for example, the session expired), a global handler in `main.tsx` clears the account and
the person is sent back to login.

**Server state** uses TanStack Query. After any product change the product list and dashboard
queries are invalidated, so totals and low-stock status update immediately. Logging in or out
clears the whole cache so nothing from one organization is shown to the next person.

**Forms** validate on blur and on submit with the same rules as the server, and show the
server's field errors (for example a duplicate SKU) next to the right field. The server always
validates again; client validation is only for faster feedback. Submit buttons are disabled with
a progress label while a request is in flight, and a confirmation notice appears only after the
server has confirmed the change.

**Accessibility**: every input has a visible `<label>`; errors are linked with
`aria-describedby` and `aria-invalid`; the first invalid field is focused on submit; dialogs use
the native `<dialog>` element (focus trapping, Escape to close); icon-only buttons have
`aria-label`s; status changes are announced through `role="status"`/`aria-live`.

**Responsive layout**: a sidebar on large screens; a top bar and bottom tab bar on phones and
tablets. The product table becomes a stacked list below the `md` breakpoint, and form sections
collapse to one column.

## 9. Testing

- `server/test/*.test.ts`: integration tests that run the real Express app against a real
  PostgreSQL database (`storiva_test`). Every test starts from empty tables. The suite refuses
  to run unless the database name ends in `_test`, so it cannot wipe a database with real data.
- `web/src/**/*.test.ts`: unit tests for client-side validation, payload conversion and the
  stock status rule.

## 10. Deployment

`render.yaml` describes one Render web service:

- **Build**: `npm ci --include=dev && npm run build`. `--include=dev` is needed because
  `NODE_ENV=production` would otherwise skip the TypeScript and Vite build tools. The build
  generates the Prisma client, compiles the server and bundles the web app.
- **Start**: `npm start` runs `prisma migrate deploy` (applies any pending migrations, never
  drops data) and then `node dist/index.js`.
- **Health check**: `GET /api/health`.
- **Database**: a managed PostgreSQL instance (Neon). Its connection string is the only secret
  and is set as `DATABASE_URL` in Render, never committed.

With `NODE_ENV=production` the server sets the `Secure` cookie flag, trusts Render's proxy, and
serves `web/dist` with long-lived caching for hashed assets and `no-cache` for `index.html`.

## 11. Decisions and trade-offs

| Decision | Reason | Trade-off |
| --- | --- | --- |
| Server-side sessions instead of JWT | Logout and expiry are enforced by the server; tokens are revocable | One indexed lookup per request |
| One service for API and web app | Same origin: simple, secure cookies, no CORS | The API and UI deploy together |
| 404 for other organizations' resources | Does not reveal which IDs exist | Slightly less specific than 403 |
| Case-insensitive SKU uniqueness in the database | Prevents near-duplicates like `ab-1`/`AB-1`, even under concurrent requests | Needs a hand-written index in the migration |
| Prices as `DECIMAL` and strings | Exact cents end to end | The client formats strings for display |
| Server-side search | Scales past what a client-side filter can hold | A request per (debounced) keystroke |
| Hard delete | Allowed by the PRD; keeps the model simple | Deleted products cannot be restored |
