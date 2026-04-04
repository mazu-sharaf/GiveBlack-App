# GiveBlack – What you need to do manually

This list covers connections and one-time setup only. Code is already in place.

---

## 1. Run the new SQL in Supabase

- Open **Supabase Dashboard** → your project → **SQL Editor**.
- Run **after** `scripts/setup-supabase-v2.sql` (if you haven’t already):
  - **File:** `scripts/setup-community-and-subscriptions.sql`
- This creates: `org_subscriptions`, `community_campaign_categories`, `community_campaigns`, `community_campaign_photos`, `community_campaign_updates`, `community_campaign_donations`, `community_campaign_reports`, and RLS/policies.

---

## 2. Stripe – Products and Prices for subscriptions

- In **Stripe Dashboard** → **Products**:
  - Create product **Growth** ($99/month) and a recurring **Price** (monthly).
  - Create product **Institutional** ($249/month) and a recurring **Price** (monthly).
- Copy each **Price ID** (starts with `price_`). You will use them in step 3.

---

## 3. Environment variables

### GiveBlack server (`.env` in project root)

- **`STRIPE_SECRET_KEY`** – Stripe secret key (you should already have this).
- **`STRIPE_WEBHOOK_SECRET`** – From Stripe **Developers → Webhooks**. Add endpoint:
  - URL: `https://giveblackapp.com/app/api/webhooks/stripe` (Nginx maps `/app/` to the API; backend route is `POST /api/webhooks/stripe`)
  - Events: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`
  - Copy the **Signing secret** into `STRIPE_WEBHOOK_SECRET`.
- **`STRIPE_PRICE_GROWTH`** – Price ID for Growth ($99/month).
- **`STRIPE_PRICE_INSTITUTIONAL`** – Price ID for Institutional ($249/month).
- **`ADMIN_PANEL_URL`** (optional) – Full URL of Connect Hub (e.g. `https://admin.giveblack.com`) so subscription success/cancel redirects go to the right place.
- **`SESSION_SECRET`** – Used for admin JWT; keep strong and secret.
- **`SUPABASE_URL`**, **`SUPABASE_SERVICE_ROLE_KEY`**, **`SUPABASE_ANON_KEY`** – Already set if Supabase is working.

### GiveBlack Connect Hub (admin panel `.env`)

- **`VITE_SUPABASE_URL`**, **`VITE_SUPABASE_PUBLISHABLE_KEY`** (or `VITE_SUPABASE_ANON_KEY`) – Already set if Supabase is working.
- **`VITE_API_URL`** – Full base URL of the GiveBlack API (e.g. `https://api.giveblack.com`). Required so that:
  - Admin login can call `POST /api/admin/login` and get a JWT.
  - Ledger, Subscriptions, and Community Campaigns pages can use the backend (RLS blocks anon key on those tables).
- If you do **not** set `VITE_API_URL`, Ledger and Subscriptions (and admin Community Campaigns) will not load data unless the admin app uses the Supabase **service role** key (not recommended in the browser).

### Expo app

- **`EXPO_PUBLIC_DOMAIN`** – Public domain for deep links (e.g. `giveblackapp.com`, no `https://`).

---

## 4. Connect Hub – Admin login and API

- Default admin credentials for the **server** are in the code: **admin@gb.com** / **Admin@gb** (change in production).
- In Connect Hub, use the **same** credentials and set **`VITE_API_URL`** so that:
  1. Login calls the GiveBlack server `POST /api/admin/login` and stores the JWT.
  2. Ledger, Subscriptions, and Community Campaigns use that JWT to call `/api/admin/ledger`, `/api/admin/subscriptions`, `/api/admin/community-campaigns`, etc.

---

## 5. Subscriptions – “Upgrade” flow — now built-in: recurring billing, Actions (Upgrade / Manage billing), plan-based feature access

- **Recurring billing:** Stripe Checkout (subscription mode) and webhook update `org_subscriptions`; Stripe handles recurring charges.
- **Admin dashboard:** Subscriptions page has **Actions** per row: **Upgrade** (Stripe Checkout), **Manage billing** (Stripe Billing Portal). Configure Stripe Dashboard → Settings → Billing → Customer portal.
- **Plan-based feature access:** `GET /api/subscriptions/org/:orgId/features` returns tier and features; use in the hub to gate features (e.g. Advanced reports = Institutional).

---

## 6. Community campaign photos (optional)

- Campaign **cover_image_url** and **community_campaign_photos** expect a URL. You can:
  - Upload images to **Supabase Storage** (e.g. bucket `community-campaigns`), then set `cover_image_url` or insert into `community_campaign_photos` with the public URL, or
  - Add a small upload API on the server that uploads to Supabase Storage and returns the URL, then wire the app/Connect Hub to it.

---

## 7. CORS

- Ensure the GiveBlack server allows the Connect Hub origin in CORS (e.g. via **`ADMIN_PANEL_URL`** or your CORS config). The code uses `ADMIN_PANEL_URL` to allow that origin.

---

## Summary checklist

| Step | What to do |
|------|------------|
| 1 | Run `scripts/setup-community-and-subscriptions.sql` in Supabase SQL Editor. |
| 2 | Create Stripe Products/Prices for Growth and Institutional; copy Price IDs. |
| 3 | Set server env: `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_GROWTH`, `STRIPE_PRICE_INSTITUTIONAL`; set Connect Hub `VITE_API_URL`; set Expo `EXPO_PUBLIC_DOMAIN` if needed. |
| 4 | Use same admin credentials in Connect Hub and server; ensure Connect Hub calls server login when `VITE_API_URL` is set. |
| 5 | (Optional) Add “Upgrade” button in admin that calls create-checkout and redirects to Stripe. |
| 6 | (Optional) Wire community campaign image upload to Supabase Storage. |
| 7 | Ensure CORS allows the admin panel origin. |

After these steps, org subscriptions, community fundraising, ledger, and admin flows should work end-to-end.
