# Cursor prompt: Stripe feature generation

Generate a production-safe Stripe feature for `apps/api`.

Checklist:
- Add request validation with `zod`.
- Use idempotency keys on write actions.
- Persist Stripe object IDs in local DB.
- Verify webhook signatures with `STRIPE_WEBHOOK_SECRET`.
- Store webhook events in `webhook_events` with unique `(provider, event_id)`.
- Make handlers retry-safe (no duplicate side effects).
- Emit realtime events for admin and mobile consumers.

Must include:
- Route changes
- SQL migration updates
- Tests for webhook replay and failure retry
