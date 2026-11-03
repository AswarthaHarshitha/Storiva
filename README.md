# Storiva

A simpler way to stay in control of your inventory.

Storiva is a multi-tenant inventory application for small sellers. Each business signs up as its
own organization, keeps a list of its products with stock levels and prices, and sees at a
glance which products are running low.

- **Live application:** _added after deployment_
- **Repository:** https://github.com/AswarthaHarshitha/Storiva

## The problem

Small shops and makers often track stock in a spreadsheet or a notebook. It works until someone
forgets to update it, two people edit it at once, or a best-seller quietly runs out. Storiva
covers the essentials and nothing more: one place for the product list, quantities that are
always current, and a clear list of what needs reordering.

## Features

- **Accounts and organizations.** Sign up with an email, password and organization name. Each
  signup creates a private organization; its data is never visible to any other organization.
- **Products.** Create, view, edit and delete products with a name, SKU (unique within the
  organization, case-insensitive), description, quantity on hand, cost and selling price, and
  an optional low-stock threshold. Deleting asks for confirmation first.
- **Search.** Find products by name or SKU.
- **Stock updates.** Change the quantity in the edit form, or use the quick adjust dialog to add
  or remove units with an optional note. Stock can never go below zero, even with simultaneous
  updates. Each product shows who changed it last and when.
- **Dashboard.** Total products, total units on hand and the number of low-stock products,
  followed by a table of everything at or below its threshold. A new account sees a short guide
  to adding its first product instead.
- **Settings.** An organization-wide default low-stock threshold (5 unless changed), used for any
  product without a threshold of its own.

Out of scope for this version, as defined by the product requirements: multiple warehouses,
variants, categories, images, orders, purchasing, suppliers, integrations, imports,
notifications, staff accounts, audit history and billing.

## Technology

| Layer | Choice |
| --- | --- |
| Web client | React 19, TypeScript, Vite, Tailwind CSS v4, TanStack Query, React Router, Lucide icons |
| API | Node.js 22, Express 5, TypeScript, zod validation |
| Database | PostgreSQL with Prisma ORM and migrations |
| Authentication | bcrypt password hashing, server-side sessions in an `HttpOnly` cookie |
| Testing | Vitest and Supertest against a real PostgreSQL test database |
| Hosting | Render (application) and Neon (PostgreSQL) |

## Architecture

```
Browser ──same-origin /api/*──▶ Express ──▶ services ──▶ Prisma ──▶ PostgreSQL
        ◀──── built web app ────┘
```

In production a single Node service serves both the JSON API and the built React app, so the
session cookie is first-party and no CORS is needed. Each API request goes through
route → controller (input validation) → service (database access). The organization used by
every query is taken from the server-side session, never from the request.

[docs/architecture.md](docs/architecture.md) walks through the request lifecycle, data model,
authentication, tenant isolation, API endpoints, web client and deployment in detail.
[REQUIREMENTS.md](REQUIREMENTS.md) maps each requirement to its implementation and tests.

## Project structure

```
server/
  prisma/              schema.prisma and SQL migrations
  src/
    app.ts             Express app: security headers, JSON parsing, routes, static web app
    config/env.ts      Validated environment variables
    routes/            URL → controller mapping
    controllers/       Request parsing and responses
    services/          Business logic and database access
    validation/        zod schemas for request bodies
    middleware/        Authentication, validation helper, error handling
    lib/               Prisma client and error types
  test/                API integration tests
web/
  src/
    api/               Fetch wrapper and response types
    hooks/             Data fetching, auth state and form state
    pages/             One component per screen
    components/        Shared UI components
    products/          Stock adjustment and delete dialogs
    lib/               Client validation and formatting
docs/architecture.md   Technical walkthrough
render.yaml            Render deployment blueprint
```

## Database design

| Table | Purpose |
| --- | --- |
| `organizations` | One per signup; holds the default low-stock threshold |
| `users` | Owner account: lower-cased email, bcrypt hash, organization |
| `sessions` | Active logins, stored as SHA-256 hashes of the cookie token |
| `products` | Inventory, always tied to one organization |

Constraints are enforced in PostgreSQL as well as in the application: SKU is unique per
organization ignoring case, quantity/threshold/prices cannot be negative, and prices are
`DECIMAL(12,2)` so amounts stay exact. See [docs/architecture.md](docs/architecture.md#3-data-model).

## Running locally

**Prerequisites:** Node.js 22 (see `.nvmrc`) and PostgreSQL 14 or newer.

```bash
git clone https://github.com/AswarthaHarshitha/Storiva.git
cd Storiva
npm install

# Create a development database and a separate one for the tests
createdb storiva
createdb storiva_test

# Configure the API
cp server/.env.example server/.env
# then edit server/.env and set DATABASE_URL, e.g.
# DATABASE_URL="postgresql://YOUR_USER@localhost:5432/storiva"

# Apply the migrations
npm run db:migrate -w server

# Start the API (port 4000) and the web app (port 5173) in two terminals
npm run dev:server
npm run dev:web
```

Open http://localhost:5173 and create an account. The inventory starts empty.

### Environment variables

Set in `server/.env` locally, or in the hosting provider's dashboard in production.

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `PORT` | No | API port, default `4000` (Render sets it automatically) |
| `NODE_ENV` | No | `development`, `test` or `production`. Production enables `Secure` cookies, trusts the hosting proxy and serves the built web app |
| `SESSION_TTL_DAYS` | No | How long a login lasts, 1–90 days, default `7` |

The web app needs no environment variables; it calls the API on its own origin.

### Database migrations

```bash
npm run db:migrate -w server          # development: apply migrations (and create new ones after schema changes)
npx prisma migrate deploy             # production: apply pending migrations only (run from server/)
```

In production `npm start` runs `prisma migrate deploy` before starting the server.

## Testing

The API tests run against a real PostgreSQL database. They empty its tables before every test,
so they refuse to run unless the database name ends in `_test`.

```bash
# server/.env.test
DATABASE_URL="postgresql://YOUR_USER@localhost:5432/storiva_test"
NODE_ENV=test
```

```bash
npm test             # API integration tests and web unit tests
npm run typecheck    # TypeScript, both workspaces
npm run lint         # ESLint, both workspaces
npm run build        # production build of the web app and the API
```

The API tests cover signup, login, logout and protected routes; product validation, search,
updates, deletion and concurrent stock adjustments; dashboard totals and low-stock rules;
settings persistence; and cross-organization read, update, adjust and delete attempts.

## Deployment

The repository includes a Render Blueprint (`render.yaml`) for one web service. It uses a
PostgreSQL database hosted on Neon.

1. **Create the database.** In Neon, create a project and copy its connection string. Use the
   direct (not pooled) connection string, which must include `sslmode=require`.
2. **Create the service.** In Render, choose **New → Blueprint**, select this repository and
   confirm. When asked, paste the Neon connection string as `DATABASE_URL`.
3. **Deploy.** Render runs `npm ci --include=dev && npm run build`, then `npm start`, which
   applies the migrations and starts the server. The health check is `GET /api/health`.

Render's free plan stops idle services, so the first request after a quiet period can take
around a minute while the service starts.

## Screenshots

_Added from the live deployment._
