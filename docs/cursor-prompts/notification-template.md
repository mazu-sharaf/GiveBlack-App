# Cursor prompt: notifications generation (Brevo + Expo)

Generate a notification feature with both email and push channels.

Scope:
- Brevo transactional email sender with template keys.
- Expo push sender with token chunking and receipt handling.
- Queue jobs using worker-safe retry semantics.
- Respect user notification preferences.
- Add admin broadcast endpoint guarded by role.

Implementation notes:
- Persist delivery attempts and provider responses.
- Mark invalid push tokens as disabled.
- Include observability logs and error taxonomy.

Test coverage:
- Email send success + provider failure.
- Push send success + invalid token cleanup.
- Permission tests for admin-only broadcast route.
