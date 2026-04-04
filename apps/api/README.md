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

## Important endpoints
- `GET /health`
- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/payments/create-intent`
- `POST /api/webhooks/stripe` — production URL behind Nginx: `https://giveblackapp.com/app/api/webhooks/stripe`
- `POST /api/notifications/push-token`
- `POST /api/admin/notifications/broadcast`
