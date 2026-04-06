# GiveBlack API (full-control backend)

## Features
- JWT auth with refresh-token rotation and session revocation
- Realtime WebSocket channels
- Stripe payment intent + webhook flow
- Brevo transactional email notifications
- Expo push notification delivery

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
- `GET /health`
- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/payments/create-intent`
- `POST /api/webhooks/stripe` — production URL behind Nginx: `https://giveblackapp.com/app/api/webhooks/stripe`
- `POST /api/notifications/push-token`
- `POST /api/admin/notifications/broadcast`
