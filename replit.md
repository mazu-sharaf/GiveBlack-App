# GiveBlack Platform

A comprehensive platform supporting Black-led education and community programs, connecting donors with charitable organizations.

## Architecture

This is an npm workspace monorepo with three applications:

### Apps
- **`apps/api/`** — Fastify (Node.js/TypeScript) REST API backend, port 5000
- **`apps/admin/`** — Vite + React admin dashboard, port 8080 (`/admin/` base path)
- **Root `/`** — Expo React Native mobile app (Expo Router), port 8081

### Shared
- **`packages/shared/`** — Common TypeScript types shared across API and admin

## Tech Stack

- **Backend**: Fastify 5, TypeScript, Drizzle ORM, PostgreSQL (`pg`)
- **Admin Frontend**: React 19, Vite, Tailwind CSS, Radix UI (shadcn/ui), React Router
- **Mobile**: React Native 0.81 / Expo 54, Expo Router, TanStack Query
- **Auth**: JWT (`@fastify/jwt`), bcryptjs, Google OAuth, Apple Sign-In
- **Payments**: Stripe (server-side `stripe`, mobile `@stripe/stripe-react-native`)
- **Email**: Brevo (transactional email)
- **Real-time**: WebSockets via `@fastify/websocket`

## Workflows

| Workflow | Command | Port |
|---|---|---|
| Start Backend | `tsx watch apps/api/src/index.ts` | 5000 |
| Start Admin | `cd apps/admin && vite --port 8080 --host` | 8080 |
| Start Frontend | Expo Metro bundler | 8081 |

## Environment Variables / Secrets Required

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Auto-set by Replit PostgreSQL |
| `JWT_ACCESS_SECRET` | Min 32 chars — used for access tokens |
| `JWT_REFRESH_SECRET` | Min 32 chars — used for refresh tokens |
| `STRIPE_SECRET_KEY` | Optional — for payment processing |
| `STRIPE_WEBHOOK_SECRET` | Optional — for Stripe webhook verification |
| `BREVO_API_KEY` | Optional — for transactional emails |

## Key Directories

- `apps/api/src/` — API source code
  - `config/env.ts` — Environment variable validation (Zod)
  - `db/schema.sql` — Database schema (auto-applied on startup)
  - `db/seed.sql` — Seed data
- `apps/admin/src/` — Admin dashboard source
- `app/` — Expo mobile app screens (file-based routing)
- `uploads/` — Uploaded files (images, etc.) served statically
- `packages/shared/src/` — Shared TypeScript types

## Notes

- The API automatically initializes the database schema on startup (runs `schema.sql` and `seed.sql`)
- Admin panel proxies `/api` and `/uploads` to the backend at `http://127.0.0.1:5000`
- The `ADMIN_BOOTSTRAP_PASSWORD` secret can be set to auto-create the admin user on first startup
