# GiveBlack — Donation & Charity Management Platform

## Overview

A fintech-enabled donation and charity management platform. It comprises:
- **Mobile App** (Expo/React Native) — for donors and charities
- **Admin Panel** (React + Vite) — web-based administration dashboard on port 8080
- **Backend API** (Fastify + Node.js) — REST API on port 5000

## Architecture

Monorepo with npm workspaces:
- `app/` — React Native/Expo mobile app (Expo Router, @tanstack/react-query, Stripe React Native)
  - `app/(tabs)/` — Donor-facing bottom tab navigation (Home, Community, Favourite, Categories, Account)
  - `app/(org)/` — Charity/Organization dashboard with 5-tab navigation (Dashboard, Campaigns, Donations, Plans, Settings)
  - `app/(auth)/` — Login/signup flows for donors and charities
  - `app/(charity)/` — Legacy charity screens (fee-settings, plan, donations) — being replaced by `(org)` tabs
- `apps/admin/` — Admin dashboard (React 19, Vite, Tailwind CSS, Radix UI, Recharts)
- `apps/api/` — Fastify backend (PostgreSQL via `pg`, JWT auth, Stripe, Brevo email)
- `packages/shared/` — Shared TypeScript types

## Workflows

- **Start Backend** — `node_modules/.bin/tsx watch apps/api/src/index.ts` on port 5000
- **Start Admin** — `cd apps/admin && ../../node_modules/.bin/vite --port 8080 --host` on port 8080
- **Start Frontend** — `node_modules/.bin/expo start --localhost` for the Expo mobile app (port 8081)

## Key Dependencies

- **Backend**: `fastify`, `pg`, `stripe`, `zod`, `@fastify/jwt`, `@fastify/cors`, `bcryptjs`, `tsx`, `dotenv`
- **Admin**: `vite`, `@vitejs/plugin-react-swc`, `tailwindcss`, `@radix-ui/*`, `recharts`, `react-router-dom`
- **Mobile**: `expo`, `react-native`, `expo-router`, `@stripe/stripe-react-native`, `@tanstack/react-query`

## VPS Proxy Mode (Optional)

When `VPS_BACKEND_URL` is set, the local Fastify backend acts as a proxy:
- `/api/*` requests are forwarded to the VPS backend
- `/uploads/*` requests are forwarded to the VPS backend
- Local database initialization is skipped
- Stripe routes are NOT registered locally (proxied to VPS to avoid JWT mismatch)
- Org-scoped routes (`/api/org/*`) are registered BEFORE the proxy and run locally with local DB

Currently running in **standalone mode** (no VPS proxy) with local PostgreSQL database.

## Org-Scoped API Routes

`apps/api/src/routes/org-campaigns.ts` — authenticated routes for charity/org users:
- `GET /api/org/my-campaigns` — list all campaigns for the authenticated user's org (all statuses)
- `POST /api/org/campaigns` — create a new campaign
- `PUT /api/org/campaigns/:campaignId` — update a campaign (with ownership check)
- `DELETE /api/org/campaigns/:campaignId` — delete a campaign (with ownership check)
- `GET /api/org/my-donations` — list all donations received by the user's org

## Environment Variables

- `VPS_BACKEND_URL` — External VPS backend URL for proxy mode (e.g. `https://giveblack.mawa.pro/app`)
- `EXPO_PUBLIC_API_URL` — API URL the mobile app uses (set to `http://localhost:5000` for proxy mode)
- `EXPO_PUBLIC_DOMAIN` — Domain for the app (e.g. `giveblack.mawa.pro`)
- `DATABASE_URL` — PostgreSQL connection string (only needed when NOT in VPS proxy mode)
- `JWT_ACCESS_SECRET` — Min 32 chars, used for access token signing
- `JWT_REFRESH_SECRET` — Min 32 chars, used for refresh token signing
- `NODE_ENV` — `development` or `production`
- `PORT` — API port (default 5000)
- `STRIPE_SECRET_KEY` — Stripe secret key (optional, for payments)
- `STRIPE_WEBHOOK_SECRET` — Stripe webhook secret (optional)
- `BREVO_API_KEY` — Brevo (email) API key (optional)
- `ADMIN_BOOTSTRAP_PASSWORD` — If set, creates an admin user on startup

## Database

PostgreSQL (Replit-managed). Schema initialized from `apps/api/src/db/schema.sql` on startup (only when not in VPS proxy mode).
Seed data loaded from `apps/api/src/db/seed.sql`.

## Shared AppHeader Component

`components/AppHeader.tsx` — sticky header with GiveBlack logo (dark/light theme variants), optional back button, search, and notifications.
- Integrated at layout level in `app/(tabs)/_layout.tsx` and `app/(org)/_layout.tsx` so all tab screens get it automatically
- Sub-pages use `<AppHeader showBack title="..." showSearch={false} />` directly
- Applied to: donate/[orgId], settings/[page], community/create, community/[id], volunteer/[orgId], search, notifications, campaign/[id], category/[id], all-campaigns, organization/[id], (account)/impact
- Logo assets: `assets/images/logo-black.webp` (light mode) and `logo-white.webp` (dark mode)

## Subscription & Feature Gating

- **Subscription Tiers**: Free, Growth ($99/mo), Institutional ($249/mo)
- **Volunteer signup**: Restricted to Growth and Institutional plans only
  - Backend: `POST /api/volunteers` checks org's active subscription tier, returns 403 for non-allowed tiers
  - Frontend: Volunteer button hidden on campaign and organization detail pages when `org_tier` is not `growth` or `institutional`
- **Public API org_tier**: `GET /api/campaigns/:id` and `GET /api/organizations/:id` return `org_tier` (via lateral join to `org_subscriptions`, defaults to `'free'`)
- **Subscription auto-expire**: Stripe webhook handlers downgrade tier to `'free'` on:
  - `invoice.payment_failed` — sets status to `past_due`, tier to `free`
  - `customer.subscription.deleted` — sets status to `canceled`, tier to `free`
  - `customer.subscription.updated` with non-active/non-trialing status — sets tier to `free`

## Donation Flow

The donate screen (`app/donate/[orgId].tsx`) has a multi-step flow:
1. **Amount selection** — preset amounts ($5–$200), anonymous toggle
2. **Fee breakdown** — shows platform fee (3%), optional Education Reinvestment (0–10%, default 5%), optional Education Endowment (0–2%, default 1%), with toggles and dot sliders
3. **Payment processing** — Hybrid Stripe: tries native payment sheet first (`@stripe/stripe-react-native`), auto-falls back to web Stripe Checkout if native unavailable
4. **Success** — confetti animation + donation receipt card (donor, org, date, reference, breakdown, Download/Share/Done)

The confetti component is at `components/Confetti.tsx` — pure React Native Animated API, 50 pieces with random colors/shapes.

The checkout result screen (`app/checkout-result.tsx`) also uses confetti animation on success with receipt download/share.

**Hybrid Payment Flow** (platform-split modules):
- `lib/stripe-confirm.ts` (web) — pure stub, always returns `NATIVE_UNAVAILABLE` (never imports `@stripe/stripe-react-native` to avoid Metro web bundling crash)
- `lib/stripe-confirm.native.ts` (native) — real native Stripe PaymentSheet implementation via `@stripe/stripe-react-native`
- On native devices: tries PaymentSheet → if unavailable → web checkout via `expo-web-browser`
- On web: always uses Stripe Checkout URL redirect
- Receipt **Download** generates PDF via `expo-print` and shares via `expo-sharing`
- Receipt **Share** uses `react-native Share` API (native) or Web Share API / clipboard (web)

**Token Storage Keys**: Both `context/AuthContext.tsx` and `lib/query-client.ts` must use `@gb_access_token` and `@gb_refresh_token` for AsyncStorage keys. Mismatched keys break token refresh and cause 401 errors on all authenticated API calls.

## Public Campaign Donation Page

Standalone web pages served by the backend for direct campaign donations (no app required):

- **`/c/:campaignId`** — Campaign donation page with:
  - Campaign info (title, org, progress bar, description)
  - Amount selection (preset buttons + custom input)
  - Anonymous toggle (hides name/email fields when enabled)
  - Name/Email fields for non-anonymous donors
  - Fee breakdown (3% platform fee)
  - Stripe Checkout redirect via `/api/payments/public-donate-checkout` (no auth required)

- **`/c/:campaignId/thank-you`** — Post-payment receipt page with:
  - Donation receipt (amount, donor, campaign, org, date, reference)
  - Shows "Anonymous" for anonymous donors
  - App Store and Google Play download buttons
  - No navigation to other app pages — standalone

- **`/api/payments/public-donate-checkout`** — Public endpoint (no auth) that creates Stripe Checkout sessions for campaign page donations. Supports anonymous donations with `is_anonymous` flag.

- **Admin panel** — Donations page shows "Anonymous" badge for anonymous donors, hides email for anonymous entries.

Route file: `apps/api/src/routes/campaign-page.ts`

## Organization Logos

All 10 organizations have AI-generated logo images stored at `uploads/logo-{org-slug}.png` and referenced in the database as `/uploads/logo-{org-slug}.png`. The mobile app resolves relative image URLs via `resolveImg()` in `context/AppContext.tsx` (prepends `EXPO_PUBLIC_API_URL`). The admin panel uses `resolveImageUrl()` from `apps/admin/src/lib/api.ts` (prepends `VITE_API_URL`).

## Image Loading Optimization

All `Image` components across the mobile app use `expo-image` with:
- `cachePolicy="memory-disk"` for aggressive caching
- `transition={200}` for smooth fade-in
- `placeholder={{ blurhash: "..." }}` for instant blurred preview on campaign images
- `recyclingKey` for proper list recycling

## Notes

- Admin panel proxies `/api` and `/uploads` to `http://127.0.0.1:5000`
- All binaries (tsx, vite, expo) are in root `node_modules/.bin/` — use direct paths to avoid `npx` interactive prompts
- Admin vite is referenced as `../../node_modules/.bin/vite` when running from `apps/admin/`
- Uploads are stored in `uploads/` (root-level, served by Fastify static plugin)
- Secrets are managed through Replit's Secrets tab, NOT a `.env` file
