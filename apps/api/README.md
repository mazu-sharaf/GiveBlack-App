# GiveBlack API (full-control backend)

## Features
- JWT auth with refresh-token rotation and session revocation
- Realtime WebSocket channels
- Stripe payment intent + webhook flow
- Brevo transactional email notifications
- Expo push notification delivery

## Email (Brevo)

Set **`BREVO_API_KEY`** (v3 key from Brevo **SMTP & API** → **API keys**) and **`BREVO_SENDER_EMAIL`** (must be a **verified sender** in Brevo). Restart the API after changes. If Brevo returns `401` / *API Key is not enabled*, enable that key in Brevo or create a new one; avoid duplicate `BREVO_API_KEY` lines in `.env` (the last one wins). Strip quotes/BOM if you pasted from a doc.

## Quick start
1. Copy root `.env.example` into `.env` and set API variables.
2. Install dependencies from repo root: `npm install`
3. Initialize DB schema:
   - `npm run api:db:init`
4. Start API:
   - `npm run api:dev`

## App Store review accounts

From repo root (with `DATABASE_URL` in `.env`), upserts donor + charity logins and an `organizations` row for charity resolution:

`npm run review-accounts -w @giveblack/api`

The same step runs automatically when executing `apps/api/scripts/seed-demo-campaigns.mjs`. Credentials are defined in [`scripts/provision-review-accounts.mjs`](scripts/provision-review-accounts.mjs) (password is shared for both roles).

## Public support page

- **Routes:** `GET /support` → redirects to `/support/`; `GET /support/` → HTML (template [`server/templates/support-page.html`](../../server/templates/support-page.html), rendered by [`src/routes/support-page.ts`](src/routes/support-page.ts)).
- **Env:** `SUPPORT_EMAIL` (fallback `info@giveblackapp.com`), `APP_URL` (fallback `https://giveblackapp.com/`), optional `APP_STORE_URL` and `PLAY_STORE_URL` for store links.
- **Production URL:** `https://giveblackapp.com/support/` requires Nginx to proxy `/support` to the API (see `location ^~ /support` in [`deploy/nginx-giveblackapp.com.conf`](../deploy/nginx-giveblackapp.com.conf)) **before** the catch-all `location /` to the marketing site. After updating the site config, run `sudo nginx -t && sudo systemctl reload nginx`.

## Important endpoints
- `GET /health` — includes `expoPushDeliveryConfigured` (boolean, no secrets) when `EXPO_TOKEN` or `EXPO_ACCESS_TOKEN` is set. VPS pull/build/restart: [`deploy/VPS-POST-PULL.md`](../deploy/VPS-POST-PULL.md).
- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/payments/create-intent`
- `POST /api/webhooks/stripe` — production URL behind Nginx: `https://giveblackapp.com/app/api/webhooks/stripe` (canonical). The API also accepts the legacy alias `POST /api/stripe/webhook` (same handler; raw body enabled for both).
- `POST /api/notifications/push-token`
- `POST /api/admin/notifications/broadcast`

## Push notification setup

Push delivery requires two things to be configured:

1. **`EXPO_ACCESS_TOKEN`** (required for delivery) — Create an access token at [expo.dev](https://expo.dev) under **Account → Access Tokens**. Set it as a server secret. Without this, the backend logs `[push] EXPO_ACCESS_TOKEN not set; push delivery skipped` and silently drops all pushes.

2. **EAS project ID** — Already set in `app.json` under `extra.eas.projectId`. The mobile app reads this at runtime to obtain a valid Expo push token. No extra server config needed.

Once `EXPO_ACCESS_TOKEN` is set and the mobile app is built with EAS (not Expo Go on Android), push notifications will be delivered to all registered devices.

## Stripe / card-testing mitigations (Turnstile, sessions, rate limits)

GiveBlack reduces automated card-testing abuse without blocking legitimate small donations (e.g. \$1–\$10) on amount alone.

- **Cloudflare Turnstile** — `POST /api/payments/donation-session` verifies a Turnstile token server-side before issuing a short-lived **signed donation session** (`PAYMENT_SECURITY_TOKEN_SECRET` / `JWT_ACCESS_SECRET`). Public and guest checkout endpoints require that token before creating Stripe Checkout sessions or PaymentIntents. Configure `CLOUDFLARE_TURNSTILE_SITE_KEY` + `CLOUDFLARE_TURNSTILE_SECRET_KEY`; never expose the secret to clients. In non-production, `CLOUDFLARE_TURNSTILE_DEV_BYPASS=1` allows local testing without Turnstile keys.
- **Session binding** — Donation sessions bind org, campaign, amount, currency, and identity (guest email or logged-in donor id when `Authorization: Bearer` is sent to `donation-session`). Sessions are single-use (`consume: true` at checkout).
- **Rate limits** — `checkPaymentRateLimit` enforces per-IP and per-identity (email / user / session) windows (`PAYMENT_RATE_LIMIT_*`). **Strict** limits apply to unauthenticated Stripe-creation paths (`PAYMENT_RATE_LIMIT_STRICT_*`). Failed payments (Stripe webhook `payment_intent.payment_failed`) feed `recordPaymentFailure` for temporary identity-based backoff.
- **Velocity logging** — Optional log-only signal when many attempts from one IP are below `PAYMENT_VELOCITY_LOW_USD_MAX` (`suspicious_low_amount_velocity`); tune or disable via env (set max to `0`).
- **Stripe metadata** — PaymentIntents and Checkout include hashed IP, app environment, campaign/org ids, donation session id, and (after DB insert) **`donationId`** (internal UUID) for Radar and support correlation. PII is minimized in logs (`logPaymentSecurityEvent` strips risky keys).

**Env summary:** see root `.env.example` under “Payment anti-abuse / Cloudflare Turnstile”. **For Stripe support:** we use Turnstile + server-issued donation sessions, stricter rate limits on public payment creation, webhook-driven failure tracking, and enriched PaymentIntent metadata (no card data logged).
