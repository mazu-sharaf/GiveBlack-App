# GiveBlack deployment – giveblackapp.com

This doc covers deploying the **landing page**, **admin panel**, and **app/API** under one domain and what you need to do manually (Stripe, Supabase, Nginx, SSL).

## Deploy (on the VPS)

After code is on the VPS (e.g. `git pull` in `/var/www/giveblack`):

```bash
cd /var/www/giveblack && ./deploy/deploy.sh
```

This builds the admin panel, restarts the API if managed by PM2, and reloads Nginx. To run the API with PM2 (first time):

```bash
cd /var/www/giveblack && NODE_ENV=production pm2 start server_dist/index.js --name giveblack-api
```

Landing site: build in `/var/www/Giveblack-website` (e.g. `npm run build`) and ensure static output is in `out/` if you use static export.

---

## Quick manual checklist

| Step | What you do |
|------|----------------|
| **Stripe webhook** | Dashboard → Webhooks → Add endpoint **`https://giveblackapp.com/app/api/webhooks/stripe`**; select events: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `payment_intent.succeeded`; copy Signing secret → set `STRIPE_WEBHOOK_SECRET` on VPS. |
| **Supabase** | Use same project for app + admin; set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` in API server env on VPS. |
| **VPS env** | Set all vars in §4 (Stripe, Supabase, `EXPO_PUBLIC_DOMAIN=giveblackapp.com`, `EXPO_PUBLIC_API_URL=https://giveblackapp.com/app`, `PORT=5001`, `CORS_ORIGINS` including `https://giveblackapp.com`). |
| **Nginx** | Use `deploy/nginx-giveblackapp-http-bootstrap.conf` first if certs do not exist, run certbot, then `deploy/nginx-giveblackapp.com.conf`. Ensure DNS A records for `giveblackapp.com` point to this VPS before certbot. The repo includes `location ^~ /support` so **`https://giveblackapp.com/support/`** is served by the API (port 5001); copy the updated config and reload nginx after deploy. |
| **Paths on VPS** | Ensure landing at `/var/www/Giveblack-website/out`, admin at `/var/www/giveblack/apps/admin/dist`, repo at `/var/www/giveblack`. |
| **Start API** | Run `node server_dist/index.js` (or PM2) with `PORT=5000` and the env above. |

---

## What is done in code (no action needed)

- **Admin app** is built to run under `/admin` (Vite `base: "/admin/"`, React Router `basename="/admin"`).
- **API/Express** serves health, donations, Stripe Checkout, Connect, webhooks, and app routes. The webhook route is: `POST /api/webhooks/stripe`.
- **Stripe webhook** is implemented in the server; you only need to add the endpoint URL and signing secret in Stripe and in env (see below).

---

## 1. Builds (run on your machine or CI)

```bash
# From repo root: /var/www/giveblack
cd /var/www/giveblack

# Admin panel (output: apps/admin/dist)
npm run build:admin

# API server (output: server_dist/) – only if server/index.ts exists in repo
npm run server:build
```
If `server/index.ts` is not in the repo, use the existing `server_dist/` bundle (it already includes Stripe webhook and all routes).

**Landing site** (separate project):

```bash
cd /var/www/Giveblack-website
npm install
npm run build
# Output: out/
```

---

## 2. Stripe – webhook URL and secret (manual)

1. **Stripe Dashboard** → [Developers → Webhooks](https://dashboard.stripe.com/webhooks) → **Add endpoint**.
2. **Endpoint URL** (with API under `/app`):
   ```text
   https://giveblackapp.com/app/api/webhooks/stripe
   ```
3. **Events to send** (select these):
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `payment_intent.succeeded`
4. **Signing secret**: after creating the endpoint, open it and reveal **Signing secret** (starts with `whsec_`).
5. On the VPS, set in the **same env** used to run the Node server:
   ```bash
   STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxx
   ```

---

## 3. Supabase (no extra steps for “connection”)

- App and admin both use the **same Supabase project** (same URL and anon key in their env).
- Ensure production env has:
  - `SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_URL`
  - `SUPABASE_ANON_KEY` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY` for the API server (for server-side writes and RLS bypass where needed).

---

## 4. Environment variables on the VPS (manual)

On **72.60.26.227**, in the env used to start the **Node API** (e.g. `~/.env`, systemd, or PM2), set at least:

```bash
# Domain (used for Stripe redirects, links)
EXPO_PUBLIC_DOMAIN=giveblackapp.com

# Supabase (same project for app + admin)
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_ANON_KEY=eyJ...

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
# Optional: for subscription products
STRIPE_PRICE_GROWTH=price_xxx
STRIPE_PRICE_INSTITUTIONAL=price_xxx

# Server
PORT=5000
NODE_ENV=production
SESSION_SECRET=your-random-secret
```

Admin panel is static files; it gets config at **build time** via `VITE_*` in `apps/admin/.env` (see below). No need to set Supabase/Stripe on the VPS for the admin **files** themselves.

**Admin build-time env** (when you run `npm run build:admin`), in `apps/admin/.env`:

```bash
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_PROJECT_ID=your-project-ref
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key
VITE_API_URL=https://giveblackapp.com/app
```

Then rebuild admin so the built JS has the right API URL.

---

## 5. Nginx on the VPS (manual)

- DNS for **giveblackapp.com** (and www if you use it) should point to **72.60.26.227**.
- Install Nginx and (recommended) Certbot for HTTPS:
  ```bash
  sudo apt install nginx certbot python3-certbot-nginx
  sudo certbot --nginx -d giveblackapp.com -d www.giveblackapp.com
  ```
- Create a site config, e.g. `/etc/nginx/sites-available/giveblackapp.com`:

```nginx
server {
    listen 80;
    server_name giveblackapp.com www.giveblackapp.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name giveblackapp.com www.giveblackapp.com;

    ssl_certificate     /etc/letsencrypt/live/giveblackapp.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/giveblackapp.com/privkey.pem;

    # Landing (Next/static)
    root /var/www/Giveblack-website/out;
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Admin SPA
    location /admin/ {
        alias /var/www/giveblack/apps/admin/dist/;
        try_files $uri $uri/ /admin/index.html;
    }

    # App + API (Express on port 5000)
    location /app/ {
        proxy_pass http://127.0.0.1:5000/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

- Enable and reload:
  ```bash
  sudo ln -sf /etc/nginx/sites-available/giveblackapp.com /etc/nginx/sites-enabled/
  sudo nginx -t && sudo systemctl reload nginx
  ```

---

## 6. Run the API server (manual)

On the VPS, from the repo directory, run the built server (or use PM2):

```bash
cd /var/www/giveblack
NODE_ENV=production node server_dist/index.js
# Or: pm2 start server_dist/index.js --name giveblack-api
```

Ensure it listens on **5000** (or set `PORT` in env and match Nginx `proxy_pass`).

---

## 7. Resulting URLs

| URL | Served by |
|-----|-----------|
| `https://giveblackapp.com/` | Landing (Giveblack-website `out/`) |
| `https://admin.giveblackapp.com` | Admin login + dashboard |
| `https://giveblackapp.com/app/*` | Express (API, donate, campaign pages, etc.) |
| `https://giveblackapp.com/app/api/webhooks/stripe` | Stripe webhook (POST only) |

Stripe webhook link to use in Dashboard: **`https://giveblackapp.com/app/api/webhooks/stripe`**.
