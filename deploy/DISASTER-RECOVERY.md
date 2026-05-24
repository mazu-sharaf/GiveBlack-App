# GiveBlack — Disaster Recovery Runbook

**When to use this:** Your VPS is gone (deleted, corrupted, hacked, billing issue, etc.) and you need to bring GiveBlack back online on a brand-new server.

**Realistic recovery time:** 1.5 – 2 hours if you have everything below ready.

**Worst-case data loss:** up to 24 hours (since the last 3:30 AM backup).

---

## 0) Before disaster — what you must already have

Save this list in a **private Google Doc** titled `GiveBlack — Recovery Kit` (or password-protected PDF). Without these, recovery is impossible.

> **Security rules for the recovery doc:**
> 1. Enable **2FA on your Google account** (authenticator app, not SMS)
> 2. Set the doc to **Restricted — only you** in sharing settings
> 3. Don't put it in any shared folder
> 4. Don't email the doc as backup
> 5. If exporting as PDF, password-protect the PDF
> 6. Store Google account recovery codes offline (printed paper / safe)

| Item | Where it lives | How to get it back if lost |
|------|----------------|----------------------------|
| **`.env` contents** (production) | Google Doc "GiveBlack — Recovery Kit" → `.env` section | Some values can be recovered from EAS env vars; others (DB password, JWT secrets) **must be saved or recreated and you lose all sessions** |
| **Cloudflare account** | `Mawatrixtechnologies@gmail.com` + password | Cloudflare account recovery |
| **R2 backup credentials** | Recovery Kit doc + `.env` | Can recreate in Cloudflare dashboard |
| **Hostinger account** (or new VPS provider) | Recovery Kit doc | Login at hostinger.com |
| **GitHub account** | Recovery Kit doc | Use GitHub recovery codes |
| **Apple Developer account** | Recovery Kit doc | appleid.apple.com |
| **Google Play Console account** | Recovery Kit doc | play.google.com/console |
| **Domain DNS access** (`giveblackapp.com`) | Hostinger registrar or Cloudflare | Whoever holds the registrar account |
| **Expo / EAS account** (`mawamedia`) | Recovery Kit doc | expo.dev |

---

## 1) Provision a new VPS (15 min)

1. Buy a VPS — recommended: **Hostinger KVM2** (same spec as before) or any provider that gives root SSH on Ubuntu 22.04 / 24.04 LTS.
2. SSH in as root once it's ready:
   ```bash
   ssh root@<new-vps-ip>
   ```
3. Update system:
   ```bash
   apt update && apt upgrade -y
   timedatectl set-timezone UTC
   ```
4. Create a 2 GB swap file (helps small VPSes during npm install):
   ```bash
   fallocate -l 2G /swapfile && chmod 600 /swapfile
   mkswap /swapfile && swapon /swapfile
   echo '/swapfile none swap sw 0 0' >> /etc/fstab
   ```

---

## 2) Install dependencies (15 min)

```bash
# Node 20 LTS via nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm install 20 && nvm use 20 && nvm alias default 20

# PostgreSQL 16, nginx, certbot, system tools
apt install -y postgresql postgresql-client nginx certbot python3-certbot-nginx \
               git curl unzip jq build-essential

# PM2 for the API service
npm install -g pm2 wrangler

# AWS CLI v2 (for restoring backups from R2)
cd /tmp && curl -s "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o awscliv2.zip
unzip -q awscliv2.zip && ./aws/install --update && rm -rf awscliv2.zip aws
```

Verify:
```bash
node --version && pg_dump --version && nginx -v && pm2 --version && aws --version
```

---

## 3) Restore code from GitHub (5 min)

```bash
mkdir -p /var/www && cd /var/www
git clone https://github.com/mazu-sharaf/GiveBlackMain.git giveblack
cd giveblack
npm install
```

If `npm install` fails on the mobile app deps (only relevant on dev machines), you can skip it — the API doesn't need React Native packages compiled. Use:
```bash
npm install --workspaces=apps/api --workspaces=apps/admin
```

---

## 4) Restore `.env` from your Recovery Kit (5 min)

1. Open your **Google Doc "GiveBlack — Recovery Kit"** (or the password-protected PDF).
2. Copy the entire `.env` section.
3. Paste into `/var/www/giveblack/.env`:
   ```bash
   nano /var/www/giveblack/.env
   # paste, save (Ctrl+O Enter, Ctrl+X)
   chmod 600 /var/www/giveblack/.env
   ```
4. Sanity check key vars exist:
   ```bash
   grep -E '^(DATABASE_URL|JWT_ACCESS_SECRET|STRIPE_SECRET_KEY|R2_ACCESS_KEY_ID)' /var/www/giveblack/.env
   ```

---

## 5) Restore PostgreSQL database from R2 (10 min)

### 5a) Create the database

```bash
# Read DB credentials from the new .env
set -a && . /var/www/giveblack/.env && set +a

# Extract user + password + dbname from DATABASE_URL
# Format: postgresql://USER:PASSWORD@HOST:PORT/DBNAME
DB_USER=$(echo "$DATABASE_URL" | sed -E 's|.*://([^:]+):.*|\1|')
DB_PASS=$(echo "$DATABASE_URL" | sed -E 's|.*://[^:]+:([^@]+)@.*|\1|')
DB_NAME=$(echo "$DATABASE_URL" | sed -E 's|.*/([^/?]+).*|\1|')

sudo -u postgres psql <<SQL
CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}';
CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};
GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};
SQL
```

### 5b) Configure AWS CLI for R2 access

```bash
mkdir -p /root/.aws

# Use the R2 backup credentials saved in your Recovery Kit doc
cat > /root/.aws/credentials <<EOF
[r2-backup]
aws_access_key_id = <YOUR_R2_BACKUP_ACCESS_KEY>
aws_secret_access_key = <YOUR_R2_BACKUP_SECRET>
EOF

cat > /root/.aws/config <<EOF
[profile r2-backup]
region = auto
s3 =
    request_checksum_calculation = when_required
    response_checksum_validation = when_required
EOF

chmod 600 /root/.aws/credentials /root/.aws/config
```

### 5c) Download the latest backup

```bash
R2_ENDPOINT=$(grep '^R2_ENDPOINT=' /var/www/giveblack/.env | cut -d= -f2)

# Find the most recent dump
LATEST=$(aws --profile r2-backup --endpoint-url "$R2_ENDPOINT" \
  s3 ls s3://giveblack-backups/daily/ --recursive | sort | tail -1 | awk '{print $4}')
echo "Latest backup: $LATEST"

# Download it
aws --profile r2-backup --endpoint-url "$R2_ENDPOINT" \
  s3 cp "s3://giveblack-backups/$LATEST" /tmp/restore.dump
```

### 5d) Restore

```bash
PGPASSWORD="$DB_PASS" pg_restore \
  --host=localhost \
  --username="$DB_USER" \
  --dbname="$DB_NAME" \
  --no-owner --no-acl \
  --verbose \
  /tmp/restore.dump

# Sanity check
PGPASSWORD="$DB_PASS" psql -h localhost -U "$DB_USER" -d "$DB_NAME" -c "
  SELECT 'users' AS t, COUNT(*) FROM users
  UNION ALL SELECT 'campaigns', COUNT(*) FROM campaigns
  UNION ALL SELECT 'donations', COUNT(*) FROM donations;
"
rm /tmp/restore.dump
```

If counts look reasonable (users > 0, campaigns > 0), the restore worked.

---

## 6) Restore nginx + SSL (15 min)

```bash
# Copy nginx config from the repo
cp /var/www/giveblack/deploy/nginx-giveblackapp.com.conf \
   /etc/nginx/sites-available/giveblackapp.com
ln -sf /etc/nginx/sites-available/giveblackapp.com /etc/nginx/sites-enabled/

# Remove default
rm -f /etc/nginx/sites-enabled/default

# Test config
nginx -t

# Boot with HTTP only first (for certbot to validate)
cp /var/www/giveblack/deploy/nginx-giveblackapp.com-http-only.conf \
   /etc/nginx/sites-available/giveblackapp.com
ln -sf /etc/nginx/sites-available/giveblackapp.com /etc/nginx/sites-enabled/

systemctl restart nginx
```

**You can only run certbot after DNS points to this new VPS — see Step 8.**

---

## 7) Start the API (10 min)

```bash
cd /var/www/giveblack

# If there's a build step
npm run api:build 2>/dev/null || echo "skipped — no build step"

# Start with PM2
pm2 start ecosystem.config.js --env production || \
  pm2 start apps/api/dist/server.js --name giveblack-api
pm2 save

# Auto-start on reboot
pm2 startup systemd
# Follow the printed instruction (a command starting with `sudo env PATH=...`)
```

Check it's listening:
```bash
curl -s http://localhost:5001/health || curl -s http://localhost:3000/health
pm2 logs giveblack-api --lines 50
```

---

## 8) DNS update (5 min + 5–60 min propagation)

This is the moment you actually go live.

1. Open your DNS provider (Cloudflare or Hostinger).
2. Edit the **A records** for `giveblackapp.com` and `www.giveblackapp.com` → point both at the **new VPS IP**.
3. Lower the **TTL** to 60 seconds during the change (set back to 1 hour afterward).
4. Wait for propagation:
   ```bash
   dig +short giveblackapp.com   # should return the new IP
   ```

Once DNS resolves:
```bash
certbot --nginx -d giveblackapp.com -d www.giveblackapp.com \
        --non-interactive --agree-tos --email mazu@mawamedia.com

# Swap to the full HTTPS config
cp /var/www/giveblack/deploy/nginx-giveblackapp.com.conf \
   /etc/nginx/sites-available/giveblackapp.com
nginx -t && systemctl reload nginx
```

---

## 9) Smoke tests (10 min)

Run through this checklist:

- [ ] **HTTPS loads:** `curl -I https://giveblackapp.com` returns `200`
- [ ] **API healthy:** `curl https://giveblackapp.com/api/health` returns `{"ok":true}` (or your equivalent)
- [ ] **Admin panel loads** in browser: https://giveblackapp.com (or wherever admin is mounted)
- [ ] **Mobile app signs in** (Apple + Google) — install from TestFlight / Play Store
- [ ] **Profile image loads** — confirms R2 connection
- [ ] **$1 test donation** — confirms Stripe live keys + webhook
- [ ] **Push notification arrives** — confirms Expo push service

If all 7 pass, **you're back in business**.

---

## 10) Re-enable backups (5 min)

The new VPS doesn't have the cron yet:

```bash
# Verify the backup script is in place
ls /var/www/giveblack/scripts/backup-db.sh

# Add the daily cron
( crontab -l 2>/dev/null | grep -v 'backup-db.sh' ; \
  echo "30 3 * * * /var/www/giveblack/scripts/backup-db.sh >> /var/log/giveblack-backup.log 2>&1" ) | crontab -

# Run one manual backup to confirm
/var/www/giveblack/scripts/backup-db.sh

# Confirm in healthchecks.io: ping should appear
```

You're now fully back to pre-disaster state.

---

## Troubleshooting

### `pg_restore` complains about extensions or roles
Add `--no-owner --no-acl` to the pg_restore command (already in this doc). Ignore errors about extensions that don't exist on the new host — they're harmless.

### Stripe webhook stops working
Stripe webhooks point at a fixed URL. After DNS swap, they'll work again automatically. If you changed domains:
- Go to Stripe Dashboard → Developers → Webhooks → edit the endpoint URL.

### Google Sign-In or Apple Sign-In broken
Both depend on certificate fingerprints / bundle IDs registered with Apple and Google. These don't change with your server, so they should keep working. If broken, check:
- Apple: Bundle ID + Apple Team ID in `app.json` matches App Store Connect
- Google: SHA1 fingerprint in Google Cloud Console matches your EAS Android signing key

### Images broken / 404 from R2
- Confirm `R2_*` env vars in `.env` are correct
- Visit a known image URL directly — if R2 still serves it, the issue is your API's signed-URL generation
- Run the smoke test: `aws --profile r2-backup --endpoint-url $R2_ENDPOINT s3 ls s3://giveblack-uploads/ | head`

### Cron not running backup at 3:30 AM
- `crontab -l` to verify entry exists for **root**
- `systemctl status cron` to confirm cron daemon is running
- Check `/var/log/giveblack-backup.log` — if empty, cron isn't firing
- Verify timezone: `date` should show UTC (or whatever you set)

### `npm install` runs out of memory
- Add more swap (Step 1)
- Or use: `npm install --no-audit --no-fund --maxsockets=1`

---

## Time / cost summary

| Phase | Time | Notes |
|------|------|-------|
| 1. New VPS | 15 min | Hostinger ~ $5–10/mo |
| 2. Dependencies | 15 min | one-time |
| 3. Code from GitHub | 5 min | |
| 4. `.env` from Recovery Kit doc | 5 min | |
| 5. DB from R2 | 10 min | up to 24h data loss |
| 6. nginx + SSL prep | 15 min | SSL deferred until DNS |
| 7. Start API | 10 min | |
| 8. DNS update | 5–60 min | mostly waiting |
| 9. Smoke tests | 10 min | |
| 10. Re-enable backups | 5 min | |
| **TOTAL** | **~1.5–2 hours** | |

---

## Belt-and-suspenders — extra safety nets to add later

| Layer | Cost | Recovery improvement |
|------|------|---------------------|
| **Hostinger weekly VPS snapshot** | $1–2/month | 10-min full restore vs. 1.5 hour rebuild |
| **PostgreSQL PITR (WAL archiving to R2)** | Free | < 5 min data loss vs. < 24 hours |
| **Secondary cron on a different host** | varies | Cron job that periodically downloads + verifies the latest R2 backup |
| **Off-cloud monthly archive** | Free | `aws s3 sync` once a month to a laptop / external drive |

Pure paranoia, but adds 3 nines of recovery confidence at near-zero cost.

---

## Last-resort: contact info

If something in the cloud is broken and you can't recover:

- **Cloudflare support:** dash.cloudflare.com → Support widget (paid plans get faster response)
- **Hostinger support:** 24/7 chat on hpanel.hostinger.com
- **Stripe support:** support.stripe.com (urgent for payment issues)
- **Expo support:** expo.dev/support (email; not 24/7)
- **Apple Developer:** developer.apple.com/support (slow but works)

---

## Appendix A — Recovery Kit Google Doc template

Create a Google Doc called **"GiveBlack — Recovery Kit"** and paste this template. Fill in the angle-bracket placeholders. Update it whenever any value changes.

```text
================ GIVEBLACK — RECOVERY KIT ================
Last reviewed: <YYYY-MM-DD>
Doc owner: <your email>

WARNING — DO NOT SHARE THIS DOC WITH ANYONE.
- Sharing setting: Restricted (only you)
- 2FA must be enabled on this Google account

--------- VPS (current) ---------
Provider: Hostinger
Plan: KVM2
Hostname: srv1373325.hstgr.cloud
IP: <fill in>
Root password: <fill in>
SSH private key path (Windows): C:\Users\mashu\.ssh\giveblack_vps

--------- DOMAIN ---------
Registrar: Hostinger
Domain: giveblackapp.com
DNS managed via: <Hostinger or Cloudflare>

--------- DATABASE ---------
Engine: PostgreSQL 16
Connection URL: postgresql://giveblack_user:<password>@localhost:5432/giveblack_db
User: giveblack_user
Password: <fill in>
DB name: giveblack_db

--------- CLOUDFLARE ---------
Account email: Mawatrixtechnologies@gmail.com
Account password: <fill in>
Account ID: f68f9b2895ba3bfc647f839874021a62
Dashboard: https://dash.cloudflare.com

R2 — uploads bucket
  Bucket: giveblack-uploads
  Endpoint: https://f68f9b2895ba3bfc647f839874021a62.r2.cloudflarestorage.com
  Public URL: https://images.giveblackapp.com
  Access Key: <fill in>
  Secret: <fill in>

R2 — backups bucket
  Bucket: giveblack-backups
  Access Key: <fill in>
  Secret: <fill in>
  Lifecycle: delete daily/* after 30 days

--------- STRIPE ---------
Dashboard: https://dashboard.stripe.com
Account email: <fill in>
Live secret key: sk_live_<fill in>
Live publishable key: pk_live_<fill in>
Webhook signing secret: whsec_<fill in>
Webhook endpoint URL: https://giveblackapp.com/api/webhooks/stripe

--------- AUTH / SECRETS ---------
JWT access secret: <fill in>
JWT refresh secret: <fill in>
Admin 2FA encryption key: <fill in>
Admin bootstrap password: <fill in>

--------- EMAIL (BREVO) ---------
Brevo API key: xkeysib-<fill in>
Sender email: support@giveblackapp.com

--------- TURNSTILE ---------
Site key: <fill in>
Secret key: <fill in>

--------- EXPO / EAS ---------
Account: mawamedia
Login email: mawamediaglobal@gmail.com
Login password: <fill in>
Project ID: aac9a673-6322-424e-b349-dfcf7f9331d2
EAS token: <fill in>

--------- APPLE ---------
Apple ID: <fill in>
Apple ID password: <fill in>
Team ID: W5NB3UT9SS
App Store Connect API key (stored on EAS, key ID): 2GNFRVP4GM
Bundle ID: com.giveblack.app

--------- GOOGLE PLAY ---------
Console login: <fill in>
Console password: <fill in>
Package name: com.giveblack.app
Service account JSON file (if set up): <where stored>

--------- OAUTH / SOCIAL SIGN-IN ---------
Apple Sign-In client ID: com.giveblack.app
Google iOS client ID: 686496134866-k5a914jeu1b3si5gl4ratimoaphll6f3...
Google Web client ID: 686496134866-<...>
Admin Google client ID: 686496134866-4t9jvtvmhd70jgjfa9b43fen26863ats...

--------- HEARTBEAT MONITORING ---------
Provider: healthchecks.io
Backup heartbeat URL: https://hc-ping.com/f662b490-3552-4cb4-b0b3-236d3602b7f0

--------- GIT REMOTES ---------
Primary GitHub: github.com/mazu-sharaf/GiveBlackMain
Secondary GitHub: github.com/mazu-sharaf/GiveBlack-App
GitLab mirror: gitlab.com/mawatrix/giveblack

--------- KEY PEOPLE / VENDORS ---------
Hostinger support: 24/7 chat at hpanel.hostinger.com
Cloudflare support: dash.cloudflare.com (paid plans = faster)
Stripe support: support.stripe.com
Expo support: expo.dev/support

============== FULL .env FILE FOLLOWS ==============
(paste entire /var/www/giveblack/.env contents below this line)

# Last synced from VPS: <YYYY-MM-DD>

<paste .env here>

================ END OF RECOVERY KIT ================
```

When you change anything in `.env`, also update this doc and bump the "Last reviewed" date.

---

_Last updated: May 2026. Keep this doc current if you change credentials, paths, or providers._
