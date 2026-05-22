# Stripe Card-Testing Mitigations

GiveBlack added the following protections around donation and payment creation endpoints.

## Implemented Controls

- Cloudflare Turnstile verification before issuing guest/public donation session tokens.
- Short-lived, signed donation session tokens that bind org, campaign, amount, currency, and donor identity before guest/public Stripe Checkout or PaymentIntent creation.
- Configurable payment endpoint rate limits by IP and by identity/session.
- Failed payment tracking from `payment_intent.payment_failed` webhooks, with temporary throttling for identities or sessions that accumulate failures.
- Authenticated payment creation endpoints remain behind app sessions and now have payment-specific velocity limits.
- Stripe metadata now includes donation session ID, donor email/name where available, user/session context, org/campaign IDs, app environment, source, and hashed client IP.
- Safe audit logging for security events without logging card data, CVCs, raw payment methods, client secrets, Turnstile tokens, or API secrets.

## Cloudflare Turnstile Setup

1. In Cloudflare, create a Turnstile site for `giveblackapp.com`.
2. Set the server values:
   - `CLOUDFLARE_TURNSTILE_SITE_KEY`
   - `CLOUDFLARE_TURNSTILE_SECRET_KEY`
3. Set frontend public site-key values where applicable:
   - `EXPO_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY`
   - `VITE_CLOUDFLARE_TURNSTILE_SITE_KEY`
4. Keep `CLOUDFLARE_TURNSTILE_DEV_BYPASS=0` in production.

## Suggested Stripe Note

We implemented Cloudflare Turnstile bot verification for guest/public donation session creation, short-lived signed donation-session validation before Stripe Checkout/PaymentIntent creation, configurable IP and identity velocity limits, failed-payment throttling via Stripe webhooks, improved Stripe metadata for fraud analysis, and safe security logging. Small donations remain allowed; mitigations focus on automation, missing sessions, repeated attempts, and failed-payment velocity.
