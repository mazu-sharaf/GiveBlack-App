# GiveBlack – Master Product & Technical Plan

This document maps the client's full vision to the current codebase, labels feasibility and scope, and outlines a single Stripe-backed, production-ready foundation that is easy to manage in the admin panel and avoids legal and app-store pitfalls.

---

## 1. Client Requirements vs Current State

| Client ask | Current state | Feasibility | Notes |
|------------|---------------|-------------|--------|
| **Donation split: majority to org, ~3% platform, optional 5% “Reinvest in Black Education” (donor can adjust/off)** | Implemented: 3% platform fee, optional education % (default 5%), org can absorb fees, ecosystem opt-in. Donor can toggle education/endowment in donate screen. | Done | Ensure receipts and copy say “Reinvest in Black Education” where appropriate. |
| **Replace tip model with transparent, mission-aligned split** | No “tip” UI; split is the main model. | Done | Keep messaging consistent. |
| **Recurring subscription billing paid by schools/orgs (not donors)** | Connect Hub has SubscriptionsPage and tier config (Free / Growth $99 / Institutional $249). GiveBlack server and Supabase do not yet have org_subscriptions table or Stripe Billing integration. | New work | Stripe Customers + Subscriptions; org pays via Stripe (not in-app). |
| **Free / Growth $99/mo / Institutional $249/mo + plan-based feature access** | Tiers defined in Connect Hub; no enforcement in app or server. | New work | Add subscription tables, Stripe products/prices, webhooks, and feature gating. |
| **Admin dashboard to manage subscriptions** | Connect Hub has SubscriptionsPage (expects org_subscriptions). | Backend + wiring | Create org_subscriptions (and related) in Supabase; backend APIs + Stripe webhooks; Connect Hub already has UI. |
| **Education Endowment: 1–2% optional from donations, tracked separately in ledger** | Endowment % exists in donate flow and in donations table (endowment_contribution). | Partially done | Ensure ledger explicitly separates endowment; persist ledger entries. |
| **Donor receipts: amount to school, processing fees, platform fee, ecosystem contribution** | Receipt (in-app + PDF + web) shows amount to org, platform fee, education reinvestment, endowment. | Done | Add “Processing fees” line if card processing is itemized (e.g. Stripe fee). |
| **Org dashboard: toggle absorb fees, toggle ecosystem, gross vs net breakdown** | Charity fee-settings screen: absorb_fees, ecosystem_opt_in, sample breakdown. | Done | Optional: add explicit “Gross vs net” summary. |
| **Ledger separation: Platform revenue, Education Endowment, Organization payouts** | Connect Hub LedgerPage expects ledger_entries (platform_revenue, education_endowment, org_payout, reinvest_fund). GiveBlack server does not create ledger_entries; no table in main app scripts. | New work | Add ledger_entries table; write entries on each donation (and optionally on subscription revenue); single source of truth. |
| **Dark mode** | ThemeContext + useThemeColors; light/dark/system; AsyncStorage persistence. | Done | app.json has userInterfaceStyle: light; ensure system/default respects user choice. |
| **Auto social media announcements after donation (donor permission)** | Not implemented. | New work | Post-donation opt-in (“Share this donation?”); then post to Twitter/FB or copy share text. No auto-publish without consent. |
| **Corporate partners: separate onboarding flow** | Only donor and charity signup. | New work | New flow: “Corporate partner” signup (form + optional approval); separate dashboard or limited org view. |
| **Shareable crowdfunding links per campaign** | /campaign/:id and /donate/:orgId exist; Open Graph meta. | Done | Optional: custom slug per org (e.g. giveblack.org/c/org-slug). |
| **Volunteer signup (supporters sign up to volunteer, not just donate)** | Volunteers table, POST /api/volunteers, volunteer/[orgId] screen, campaign “Volunteer” CTA; Connect Hub VolunteersPage. | Done | Ensure volunteers table exists in Supabase and is used everywhere (remove in-memory fallback). |
| **Push notifications: admin draft/schedule, user opt-in, org of the week/month, campaigns, milestones** | push_tokens table; POST /api/notifications/send (admin); app registers token. No scheduling, no per-user opt-in categories in DB. | Extension | Add notification_preferences (e.g. org_highlights, campaigns, milestones); admin UI to draft/schedule (cron or queue); opt-in UI in app. |
| **NIL category: Athletes, collectives, HBCU – same as schools/orgs, campaign pages, donation tracking** | NIL/Athlete category and sample orgs exist in server seed; admin-routes has athlete-nil category. | Small | Ensure categories table has Athlete & NIL; treat as normal category; no rebuild. |
| **Single Stripe account for everything** | Stripe used for card tokenization and (optionally) Connect. No Stripe Billing for org subscriptions yet. | Extension | One Stripe account: (1) Donations: existing flow; (2) Org subscriptions: Stripe Billing (Customers + Subscriptions); (3) Connect for org payouts if used. |

---

## 2. What Requires a Larger Architectural Shift

- **Org-paid subscriptions:** New surface area (Stripe Products/Prices, webhooks, org_subscriptions, feature gating) but fits existing architecture (Express + Supabase). No full rebuild.
- **Ledger as source of truth:** New table(s) and writing to them on every donation (and subscription payment). Admin and reporting read from ledger. Clear separation of platform vs endowment vs org payouts.
- **Scheduled push and per-topic opt-in:** Needs a small “notification campaigns” or “scheduled push” model and a job runner (cron or background worker) plus user preference flags. Moderate addition.
- **Corporate onboarding:** New user/org type or tag and a separate flow; can reuse existing auth and org/campaign model.

Nothing in the client list requires replacing the app or backend; it’s additive and configuration.

---

## 3. Recommended Foundation (Build Order)

### Phase A – Data and money (foundation)

1. **Ledger**
   - Add `ledger_entries` in Supabase: id, donation_id (nullable), subscription_payment_id (nullable), account_type (platform_revenue | education_endowment | reinvest_fund | org_payout), amount, org_id (nullable), description, created_at.
   - On every donation: insert one or more ledger rows (platform fee → platform_revenue; education → reinvest_fund; endowment → education_endowment; net to org → org_payout). Use existing platform_fee, education_contribution, endowment_contribution, net_to_org from donations.
   - Connect Hub LedgerPage already expects this; ensure API or direct Supabase access for admin.

2. **Receipts**
   - Add “Processing fees” to receipt when payment method is card (e.g. Stripe fee or a fixed %). Keep: Amount to school, Platform fee, Reinvest in Black Education, Education Endowment.

3. **Stripe – one account**
   - Confirm single Stripe account: same account for donor payments and (next) org subscriptions.
   - Document: dashboard link, webhook signing secret, Connect (if used) and Billing setup.

### Phase B – Org subscriptions (schools/orgs pay)

4. **Supabase**
   - `org_subscriptions`: id, org_id (FK organizations), stripe_customer_id, stripe_subscription_id, stripe_price_id, tier (free | growth | institutional), status, current_period_start, current_period_end, cancel_at_period_end, canceled_at, created_at, updated_at.
   - Optional: `subscription_plans` or use app_settings for Stripe price IDs (Free $0, Growth $99, Institutional $249).

5. **Stripe**
   - Create Products: “GiveBlack Growth”, “GiveBlack Institutional”.
   - Create recurring Prices: $99/month, $249/month.
   - Store price IDs in env or app_settings; Connect Hub already has product_id/price_id in subscription-tiers.ts (replace with live IDs).

6. **GiveBlack server**
   - POST /api/subscriptions/create-checkout (org_id, tier): create or reuse Stripe Customer, create Checkout Session for subscription; return session URL. Auth: charity or admin.
   - Stripe webhook: customer.subscription.created/updated/deleted → upsert org_subscriptions.
   - GET /api/subscriptions/org/:orgId (or /me for charity): return current subscription for org.

7. **Connect Hub**
   - SubscriptionsPage: already lists org_subscriptions; add “Upgrade” / “Change plan” that calls create-checkout and redirects to Stripe.
   - After payment, Stripe redirects to Connect Hub or app; webhook has already updated org_subscriptions.

8. **Feature gating**
   - Middleware or helper: for org actions (e.g. analytics, exports, multi-campaign), check org_subscriptions.tier and status. Free = basic; Growth/Institutional = unlock features. Gate in Connect Hub and, if needed, in GiveBlack server for org-specific endpoints.

### Phase C – Transparency and UX

9. **Donation copy**
   - Use “Reinvest in Black Education” consistently (donate screen, receipt, PDF). Keep endowment as “Education Endowment” (pooled).

10. **Org dashboard (charity app)**
    - Fee settings: already have absorb + ecosystem. Add one “Gross vs net” summary (e.g. last 30 days: total donations, total fees, net to org).

11. **Dark mode**
    - Ensure app respects ThemeContext (light/dark/system) everywhere; add settings toggle if missing. app.json can stay light as default; system follows device.

### Phase D – Optional / next

12. **NIL**
    - Ensure “Athlete & NIL” is in categories (id e.g. athlete-nil or nil); seed if missing. No code change beyond category id.

13. **Social share after donation**
    - After success: “Share this donation?” with pre-filled text (no auto-publish). Use Share API; optional Twitter/Facebook deep links. Only with donor permission.

14. **Corporate partners**
    - New signup path: “Corporate partner” form; create profile/org with type or tag. Optional admin approval. Separate dashboard or limited view (e.g. one campaign, reporting). Reuse auth and org/campaign model.

15. **Push: scheduling and opt-in**
    - DB: notification_preferences (user_id, org_highlights, campaigns, milestones, etc.).
    - Admin: “Compose notification” + “Send at” (immediate or scheduled). Backend job (cron) processes scheduled sends.
    - App: settings screen to toggle categories; register token only if user has at least one opt-in.

16. **Community fundraising**
    - Implement per existing Community Fundraising plan (separate doc): community_campaigns, donations, verification, reporting; donor-only creation; Connect Hub section.

---

## 4. Ledger Separation (Detail)

- **Platform revenue:** Sum of ledger_entries where account_type = platform_revenue (from platform_fee on donations; optionally from subscription revenue if you allocate a portion).
- **Education Endowment:** Sum where account_type = education_endowment (from endowment_contribution).
- **Reinvest fund:** Sum where account_type = reinvest_fund (from education_contribution / “Reinvest in Black Education”).
- **Organization payouts:** Sum where account_type = org_payout (net_to_org). For reporting only unless you actually move money (e.g. Stripe Connect transfers).

Write ledger rows in the same transaction (or immediately after) as donations insert. No in-memory ledger.

---

## 5. Stripe – Single Account, All Flows

- **Donations (donors):** Current flow: tokenize card or use wallet; charge or transfer; record in donations + transactions. Keep as-is; ensure webhook (if any) does not conflict.
- **Subscriptions (orgs):** New: Stripe Billing. Org (or admin) goes to Checkout; after payment, webhook updates org_subscriptions. Billing is separate from donation charges; same Stripe account.
- **Payouts to orgs:** If using Stripe Connect: existing stripe_connect_id on organizations; transfers on donation. If not using Connect, “payouts” are only in ledger until you add bank transfers or manual process.
- **Webhooks:** One endpoint (e.g. /api/webhooks/stripe): handle payment_intent.succeeded (donations), customer.subscription.* (subscriptions), invoice.paid (optional). Use signing secret; idempotent.

---

## 6. Legal and App Store Safety

- **Donations:** Donors give to orgs; platform takes a fee. Clearly disclosed in receipt and in-app. No “purchase” of goods; no IAP required for donations in most jurisdictions. Apple’s guideline 3.2.1: real-world donations to charities are typically outside IAP if no digital good is delivered.
- **Subscriptions:** Paid by orgs (schools/orgs), not by donors, and not inside the donor app flow. So org subscription is a B2B payment (Stripe Checkout on web or in Connect Hub), not in-app. No Apple/Google IAP for this.
- **In-app purchases:** If you ever sell digital goods or premium donor features inside the app, that would need IAP. Current scope (donations + org subscriptions outside app) keeps you clear.
- **Privacy:** Donor permission for social share; push opt-in; clear privacy policy and in-app disclosure for data use (receipts, analytics, notifications).
- **Financial compliance:** Ledger and receipts support transparency; no specific regulatory advice here—client should confirm with legal for their jurisdiction.

---

## 7. Admin Panel (Connect Hub) – Ease of Management

- **Dashboard:** Overview KPIs; platform fee vs education vs endowment (from ledger or donations).
- **Campaigns (organizations):** CRUD, feature, verify; link to org subscription (tier).
- **Donations / Transactions:** List, filter, export; link to receipt.
- **Ledger:** Filter by account type; export; totals per bucket (already in LedgerPage).
- **Subscriptions:** List orgs and tier/status; “Upgrade” to Stripe Checkout; webhook keeps status in sync.
- **Push notifications:** Compose + send now or schedule; list sent; user opt-in managed in app (admin can see counts).
- **Charity requests:** Approve/reject; on approve, optionally prompt to add subscription (Free by default).
- **Settings:** Stripe keys, webhook URL, app_settings (platform_fee_percent, min/max donation, etc.).

All in one place; single Supabase + single Stripe account.

---

## 8. NIL as a Category

- Add or keep category id `athlete-nil` (or `nil`) with name “Athlete & NIL”.
- Organizations can have category_id = athlete-nil; they appear under that filter like any other category.
- Campaign pages, donation tracking, reporting: no change. No separate “NIL app”; it’s the same infrastructure.

---

## 9. Summary: Feasibility and Effort

| Area | Feasible | Effort | Blockers |
|------|----------|--------|----------|
| Donation split + receipts + org fee toggles | Yes | Done / small tweaks | None |
| Ledger separation | Yes | Medium (table + write on donation) | None |
| Org subscriptions (Free/Growth/Institutional) | Yes | Medium (Stripe Billing + webhooks + gating) | Stripe price IDs; webhook endpoint |
| Dark mode | Yes | Done | None |
| Volunteer signup | Yes | Done (ensure DB only) | None |
| Shareable campaign links | Yes | Done | None |
| NIL category | Yes | Small (category + seed) | None |
| Social share after donation (with permission) | Yes | Small | None |
| Push scheduling + opt-in | Yes | Medium | Job runner for scheduled sends |
| Corporate onboarding | Yes | Medium | Product definition |
| Community fundraising | Yes | Per community plan | None |
| Single Stripe account | Yes | Configuration + Billing | None |

No item requires a full rebuild. The right foundation is: (1) ledger as source of truth for money flows, (2) org_subscriptions + Stripe Billing for org-paid plans, (3) feature gating by tier, (4) one Stripe account and one webhook endpoint, (5) clear receipts and donor/org controls. Then add scheduling, corporate flow, and community fundraising on top.
