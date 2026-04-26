# GiveBlackMain — full VPS setup (production API on Ubuntu-style Linux)

**Canonical repo** (use one):

```bash
git clone https://github.com/mazu-sharaf/GiveBlackMain.git
# OR
git clone git@github.com:mazu-sharaf/GiveBlackMain.git
```

**Typical target directory:** `/var/www/giveblack`  
Adjust `REPO` below if yours differs.

### Git: push first, or pull first?

| Situation | What to do |
|-----------|------------|
| **GitHub already has GiveBlackMain** (normal team setup) | On your **laptop**: `git clone` once, then `git pull` when you want updates. **No push** until you have your own commits to share. On the **VPS**: only **pull** (this doc + [VPS-POST-PULL.md](VPS-POST-PULL.md)) — never push from production unless you intend to. |
| **Code exists only on your PC** (no GitHub repo yet) | Create **GiveBlackMain** on GitHub, `git remote add origin …`, then **`git push -u origin main`**. After that, VPS and teammates use **clone/pull**. |
| **You changed code and want the live server updated** | **Push (or merge) to `main` on GitHub first**, then on the VPS: pull → install → build → `pm2 restart` ([VPS-POST-PULL.md](VPS-POST-PULL.md)). |

---

## 0) Prerequisites (if not already installed)

- **Node.js 20+** LTS, **git**, build tools (python/make) if native modules fail
- **PostgreSQL** reachable from this host
- **Optional:** nginx as reverse proxy; **PM2** for process manager

```bash
sudo npm i -g pm2   # or use your Node version manager
```

---

## 1) Get code

```bash
export REPO=/var/www/giveblack
sudo mkdir -p /var/www && sudo chown -R "$USER:$USER" /var/www   # if needed

# If folder does NOT exist yet:
#   git clone https://github.com/mazu-sharaf/GiveBlackMain.git "$REPO"
#   OR: git clone git@github.com:mazu-sharaf/GiveBlackMain.git "$REPO"

cd "$REPO"
git remote -v
git fetch origin && git checkout main && git pull origin main
```

---

## 2) Environment (never commit secrets; never paste tokens/passwords in chat)

```bash
cp .env.example .env
nano .env   # or vim
```

**Required / common keys** (match [.env.example](../.env.example) and [apps/api README](../apps/api/README.md)):

- `DATABASE_URL=postgresql://USER:PASS@HOST:5432/DBNAME`
- `JWT_ACCESS_SECRET=` (long random, 32+ chars)
- `JWT_REFRESH_SECRET=` (long random, 32+ chars)
- `NODE_ENV=production`
- `PORT=5001` — or your port; must match PM2/nginx upstream
- `API_HOST=0.0.0.0`
- `CORS_ORIGINS=https://giveblackapp.com,https://www.giveblackapp.com`
- `EXPO_PUBLIC_API_URL` / production URLs as in `.env.example` if used by scripts

**Push notifications (API → Expo):**

- `EXPO_TOKEN=...` **or** `EXPO_ACCESS_TOKEN=...`  
  Create at [expo.dev → Account → Access tokens](https://expo.dev/account/settings/access-tokens)

**Stripe / Brevo / etc.:** fill as in `.env.example` for your deployment.

Save `.env`.

---

## 3) Install and database (first deploy only for DB init)

```bash
cd "$REPO"
npm install
```

If `npm install` fails on peer deps in the admin workspace, try: `npm install --legacy-peer-deps`.  
If the repo standardizes on pnpm, use `pnpm install` at root instead.

**First time** (creates schema; read [apps/api README](../apps/api/README.md) before running in production):

```bash
npm run api:db:init
```

---

## 4) Build

Full admin + API (matches [deploy/deploy.sh](deploy.sh)):

```bash
bash scripts/production-build.sh
```

**Or API only:**

```bash
npm run api:build
```

Confirm the file exists: `$REPO/apps/api/dist/index.js`

---

## 5) PM2 ([ecosystem.config.cjs](../ecosystem.config.cjs) expects `cwd` `/var/www/giveblack`)

Edit `ecosystem.config.cjs` if your `REPO` path is not `/var/www/giveblack` (`cwd` + script paths).

```bash
cd "$REPO"
pm2 start ecosystem.config.cjs
# OR if already registered:
pm2 restart giveblack-api

pm2 save
pm2 startup    # follow printed instructions so PM2 survives reboot
```

---

## 6) Nginx (if you terminate TLS / path `/app` here)

Example public API base: `https://giveblackapp.com/app`

See repo: [deploy/nginx-giveblackapp.com.conf](nginx-giveblackapp.com.conf) — proxy `/app/` → `http://127.0.0.1:5001/`

After edits:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

---

## 7) Verify

```bash
curl -sS http://127.0.0.1:5001/health
curl -sS http://127.0.0.1:5001/api/system/features
```

Through public URL (after nginx + DNS):

```bash
curl -sS https://giveblackapp.com/app/health
curl -sS https://giveblackapp.com/app/api/system/features
```

**Expect:** health `ok: true`; features `expoPush: true` if `EXPO_TOKEN` / `EXPO_ACCESS_TOKEN` is loaded (see also `expoPushDeliveryConfigured` on [`GET /health`](../apps/api/README.md)).

```bash
pm2 logs giveblack-api --lines 100
```

---

## 8) Optional full scripted deploy

Loads `.env`, install, build, DB init, PM2 (see script for details):

```bash
bash deploy/deploy.sh
```

---

## 9) After code updates (routine)

See [VPS-POST-PULL.md](VPS-POST-PULL.md): pull → `npm install` → build → `pm2 restart` → curl health/features.

---

## 10) On failure — paste back (redact secrets)

- Output of: `git remote -v`; `node -v`; `npm -v`
- Last 80 lines: `pm2 logs giveblack-api --lines 80`
- `curl` output for `/health` and `/api/system/features` (public or localhost)
- Error from `npm install` / `api:build` (no `.env` contents)

---

## Local machine (developer) — after VPS is good

On your laptop: `git pull origin main` from the same **GiveBlackMain** repo; `npm install` or pnpm per your team; copy new keys from `.env.example` into local `.env` if anything was added.
