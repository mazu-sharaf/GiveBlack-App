# GiveBlack full backend setup (Hostinger VPS)

## 1) Install and initialize
- Run from repo root:
  - `npm install`
  - `npm run api:db:init`
  - `npm run api:migrate:supabase` (imports organizations/campaigns/categories/images from Supabase into your backend DB)
  - `npm run api:dev`

## 2) Required environment variables
Set these in `.env`:
- `DATABASE_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `BREVO_API_KEY`
- `BREVO_SENDER_EMAIL`
- `EXPO_ACCESS_TOKEN`
- `EXPO_PUBLIC_API_URL` (for mobile app)
- `VITE_API_URL` (for admin app)

## 3) App connections
- Mobile (Expo): uses `EXPO_PUBLIC_API_URL` and calls:
  - `/api/organizations`
  - `/api/categories`
  - `/api/notifications/push-token`
- Admin: uses `VITE_API_URL` and can call:
  - `/api/auth/login`
  - `/api/admin/notifications/broadcast`
  - `/api/admin/db/query` + `/api/admin/db/mutate` (Supabase-compat layer now backed by your own API)

## 4) Stripe setup
- Point Stripe webhook endpoint to:
  - `https://giveblackapp.com/app/api/webhooks/stripe`
- Enable events:
  - `payment_intent.succeeded`
  - `payment_intent.payment_failed`

## 5) Brevo setup
- Verify sender domain in Brevo.
- Use transactional API key in `BREVO_API_KEY`.
- Use `BREVO_SENDER_EMAIL` as verified sender.

## 6) Realtime setup
- WebSocket endpoint:
  - `wss://your-domain.com/ws?token=<jwt>&channels=donation_updates,campaign_updates,admin_alerts`

## 7) Deploy notes
- Keep API behind Nginx reverse proxy.
- Enable HTTPS and websocket upgrade headers.
- Run `apps/api` as systemd service or PM2 process.
- Admin Supabase client has been switched to backend-compat mode (`apps/admin/src/integrations/supabase/client.ts`) so runtime data calls no longer require direct Supabase connection.
