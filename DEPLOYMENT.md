# GiveBlack - VPS Deployment Guide

Complete guide to deploy GiveBlack on your Hostinger VPS.

---

## Architecture Overview

```
Your VPS (Hostinger)
+-- Nginx (reverse proxy, SSL/HTTPS)
+-- Node.js API (Fastify, port 5001)
|   +-- REST API for mobile app + admin
|   +-- Serves admin panel static files at /admin/
+-- PostgreSQL database
+-- PM2 (process manager, keeps API running)

Mobile App
+-- Expo / React Native
+-- Connects to API via EXPO_PUBLIC_API_URL
```

---

## Quick Setup (One Command)

If you have a fresh Ubuntu VPS with the repo cloned:

```bash
cd /var/www/giveblack
DB_PASS=your_db_password bash deploy/setup-vps.sh
```

This single command:
1. Installs Node.js, PM2, Nginx, Certbot, PostgreSQL
2. Creates the database and user
3. Generates `.env` with secure random JWT secrets
4. Builds the admin panel and API
5. Initializes the database schema and seeds data
6. Starts the API via PM2
7. Configures Nginx with SSL
8. Verifies everything works

Options:
```bash
DOMAIN=giveblackapp.com \
DB_NAME=giveblack_db \
DB_USER=giveblack_user \
DB_PASS=your_db_password \
bash deploy/setup-vps.sh
```

---

## Manual Setup (Step by Step)

### Step 1: Push to GitHub

```bash
git remote add github https://github.com/mazu-sharaf/GiveBlackApp.git
git push github main
```

### Step 2: VPS Prerequisites

SSH into your Hostinger VPS:

```bash
sudo apt update && sudo apt upgrade -y

# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# PM2, Nginx, Certbot, PostgreSQL
sudo npm install -g pm2
sudo apt install -y nginx certbot python3-certbot-nginx postgresql postgresql-contrib
```

### Step 3: Set Up PostgreSQL

```bash
sudo -u postgres psql

CREATE DATABASE giveblack_db;
CREATE USER giveblack_user WITH ENCRYPTED PASSWORD 'YOUR_STRONG_PASSWORD';
GRANT ALL PRIVILEGES ON DATABASE giveblack_db TO giveblack_user;
ALTER DATABASE giveblack_db OWNER TO giveblack_user;
\q
```

### Step 4: Clone and Configure

```bash
sudo mkdir -p /var/www/giveblack
git clone https://github.com/mazu-sharaf/GiveBlackApp.git /var/www/giveblack
cd /var/www/giveblack

# Create .env from template
cp .env.example .env
nano .env   # Fill in DATABASE_URL, JWT secrets, etc.
```

**Required .env values:**

```env
DATABASE_URL=postgresql://giveblack_user:YOUR_PASSWORD@localhost:5432/giveblack_db
JWT_ACCESS_SECRET=<random 64-char string>
JWT_REFRESH_SECRET=<random 64-char string>
CORS_ORIGINS=https://giveblackapp.com,https://www.giveblackapp.com
EXPO_PUBLIC_API_URL=https://giveblackapp.com/app
VITE_API_URL=https://giveblackapp.com/app
```

Generate random secrets:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### Step 5: Deploy

```bash
bash deploy/deploy.sh
```

This builds the app, initializes the database, and starts PM2.

### Step 6: Configure Nginx + SSL

Use `deploy/nginx-giveblackapp.com.conf` (landing on `/`, API under `/app/`, admin under `/admin/`). See **Switching to Production Domain** below for certbot and file paths, or run `deploy/setup-vps.sh` with `DOMAIN=giveblackapp.com` (defaults to this domain).

### Step 7: Verify

```bash
# API health (through Nginx /app prefix)
curl https://giveblackapp.com/app/health

# API data
curl https://giveblackapp.com/app/api/organizations
curl https://giveblackapp.com/app/api/categories

# Admin panel (open in browser)
# https://giveblackapp.com/admin/
```

---

## Stripe Webhook

1. Go to [Stripe Dashboard > Webhooks](https://dashboard.stripe.com/webhooks)
2. Add endpoint: `https://giveblackapp.com/app/api/webhooks/stripe`
3. Select events: `payment_intent.succeeded`, `payment_intent.payment_failed`, `customer.subscription.*`
4. Copy webhook signing secret to `.env` as `STRIPE_WEBHOOK_SECRET`
5. Restart: `pm2 restart giveblack-api`

---

## Mobile App

### Development (Expo Go)

```bash
cd /var/www/giveblack
export EXPO_PUBLIC_API_URL=https://giveblackapp.com/app
npx expo start --tunnel
```

Scan the QR code with Expo Go on your phone.

### Production (App Store / Google Play)

```bash
npm install -g eas-cli
eas login
eas build --platform ios --profile production
eas build --platform android --profile production
eas submit --platform ios
eas submit --platform android
```

---

## Updating After Changes

```bash
cd /var/www/giveblack
git pull origin main
bash deploy/deploy.sh
```

---

## Admin Panel

- URL: `https://giveblackapp.com/admin/`
- Email: `admin@giveblackapp.com`
- Password: `Admin@123` (change after first login)

---

## Nginx Configs

Two Nginx configs are provided:

| File | Domain | Use |
|------|--------|-----|
| `deploy/nginx-giveblackapp.com.conf` | `giveblackapp.com` | Production (landing + `/app/` + `/admin/`) |
| `deploy/nginx-giveblack-mawa-pro.conf` | `giveblack.mawa.pro` | Optional legacy staging only |

**Key detail**: The `proxy_pass` directive MUST have a trailing slash:
```nginx
location /app/ {
    proxy_pass http://127.0.0.1:5001/;  # <-- trailing slash strips /app/
}
```

Without the trailing slash, the backend receives `/app/api/organizations` instead of `/api/organizations` and returns 404.

---

## Useful Commands

```bash
# API status
pm2 status
pm2 logs giveblack-api --lines 50

# Restart API
pm2 restart giveblack-api

# Check Nginx
sudo nginx -t
sudo systemctl status nginx

# Check PostgreSQL
sudo systemctl status postgresql
sudo -u postgres psql -d giveblack_db -c "SELECT count(*) FROM users;"

# SSL certificate
sudo certbot certificates
sudo certbot renew --dry-run
```

---

## Troubleshooting

### API not responding
```bash
pm2 logs giveblack-api --err --lines 100
```

### 502 Bad Gateway
The API process is not running. Fix:
```bash
pm2 restart giveblack-api
pm2 logs giveblack-api
```

### 404 on /app/api/* endpoints
The Nginx `proxy_pass` is missing the trailing slash. Check:
```bash
cat /etc/nginx/sites-enabled/giveblackapp.com
# Look for: proxy_pass http://127.0.0.1:5001/;
# NOT:      proxy_pass http://127.0.0.1:5001;
```

### Database connection issues
```bash
psql postgresql://giveblack_user:PASSWORD@localhost:5432/giveblack_db -c "SELECT 1;"
```

### Mobile app can't connect
1. Check CORS_ORIGINS in `.env` includes your domain
2. Check EXPO_PUBLIC_API_URL is set correctly
3. Test from phone browser: `https://giveblackapp.com/app/api/organizations`

### Database permission errors
```bash
sudo -u postgres psql -d giveblack_db -c "
  GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO giveblack_user;
  GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO giveblack_user;
"
pm2 restart giveblack-api
```

---

## Switching to Production Domain (giveblackapp.com)

**DNS must hit the same machine as Nginx.** Verify with `nslookup giveblackapp.com 8.8.8.8` — the A record should be your **VPS** IP (where PM2 + Nginx run). If it points elsewhere (e.g. shared hosting), Let's Encrypt and the API will fail until you update A/`www` (and optional `*`) at your registrar.

**Production URL layout** (see `deploy/nginx-giveblackapp.com.conf`):

| Path | Served as |
|------|-----------|
| `/` | Static landing (`/var/www/Giveblack-website/out`) |
| `/admin` | Admin SPA via Fastify on port 5001 |
| `/app/...` | API (use `EXPO_PUBLIC_API_URL=https://giveblackapp.com/app`) |
| `/api/...` | Same API, direct prefix (optional) |

**Stripe webhook (canonical):** `https://giveblackapp.com/app/api/webhooks/stripe`

### First-time SSL (DNS already points to VPS)

1. Install HTTP bootstrap vhost, then obtain certificates:
   ```bash
   sudo cp deploy/nginx-giveblackapp-http-bootstrap.conf /etc/nginx/sites-available/giveblackapp.com
   sudo ln -sf /etc/nginx/sites-available/giveblackapp.com /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   sudo certbot --nginx -d giveblackapp.com -d www.giveblackapp.com --redirect
   ```
2. Replace with the HTTPS vhost and reload:
   ```bash
   sudo cp deploy/nginx-giveblackapp.com.conf /etc/nginx/sites-available/giveblackapp.com
   sudo nginx -t && sudo systemctl reload nginx
   ```
3. Optional: keep a separate staging vhost (e.g. `giveblack.mawa.pro`) only if you still use it; otherwise remove its symlink.

### Env on the VPS (align with public URLs)

- `CORS_ORIGINS=https://giveblackapp.com,https://www.giveblackapp.com`
- `EXPO_PUBLIC_DOMAIN=giveblackapp.com`
- `EXPO_PUBLIC_API_URL=https://giveblackapp.com/app`
- `APP_URL=https://giveblackapp.com`
- Admin build: `VITE_API_URL=https://giveblackapp.com/app`

Then: `pm2 restart giveblack-api --update-env`, rebuild admin (`npm run build:admin`), rebuild mobile with updated `EXPO_PUBLIC_*`.
