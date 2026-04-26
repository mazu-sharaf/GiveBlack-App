# GiveBlackMain — VPS: clone or update, deploy API, verify push env

**First-time full production setup:** [VPS-FULL-SETUP.md](VPS-FULL-SETUP.md) (prereqs, `.env`, DB init, PM2, nginx).

Use on the **production VPS** for routine updates, **after** the revision you want is already on GitHub **`main`** (push or merge from your machine first, then pull here). PM2 app name is usually **`giveblack-api`** (see [ecosystem.config.cjs](../ecosystem.config.cjs)).

**Canonical repo:**

- `https://github.com/mazu-sharaf/GiveBlackMain.git`
- `git@github.com:mazu-sharaf/GiveBlackMain.git`

```bash
REPO=/var/www/giveblack   # change if your server path differs

# If this folder is NOT a clone yet:
#   git clone https://github.com/mazu-sharaf/GiveBlackMain.git "$REPO"
#   OR: git clone git@github.com:mazu-sharaf/GiveBlackMain.git "$REPO"

cd "$REPO"
git remote -v
git fetch origin && git checkout main && git pull origin main
npm install

# Build (pick one)
bash scripts/production-build.sh
# OR API only: npm run api:build

# Root .env (same dir PM2 cwd uses — see ecosystem.config.cjs): set ONE of
#   EXPO_TOKEN=...
#   EXPO_ACCESS_TOKEN=...
# from expo.dev → Account → Access tokens. Do NOT paste secrets in chat.

pm2 restart giveblack-api
# If name differs: pm2 ls

curl -s https://giveblackapp.com/app/health
curl -s https://giveblackapp.com/app/api/system/features
# Expect expoPushDeliveryConfigured / expoPush true when env is loaded.

pm2 logs giveblack-api --lines 80
```

**Why build:** PM2 runs `apps/api/dist/index.js`, not TypeScript source — `npm install` alone does not refresh `dist/`.

**API README:** [`GET /health`](../apps/api/README.md) documents `expoPushDeliveryConfigured`.

## Full scripted deploy

From repo root (requires `.env` with `DATABASE_URL`, etc.):

```bash
bash deploy/deploy.sh
```

## On failure

Paste **command**, **exit code**, **curl output**, **log lines** — redact tokens/passwords.
