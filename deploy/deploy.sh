#!/usr/bin/env bash
set -e
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

echo "============================================"
echo " GiveBlack Deploy"
echo "============================================"

if [ -f "$REPO_ROOT/.env" ]; then
  set -a
  . "$REPO_ROOT/.env"
  set +a
  echo "[deploy] Loaded .env"
else
  echo "[deploy] WARNING: No .env file found at $REPO_ROOT/.env"
  echo "[deploy] Copy .env.example to .env and fill in your values"
  exit 1
fi

if [ -z "$DATABASE_URL" ]; then
  echo "[deploy] ERROR: DATABASE_URL is not set in .env"
  exit 1
fi

echo "[deploy] Installing dependencies..."
npm install --production=false

echo "[deploy] Building admin panel + API..."
bash scripts/production-build.sh

echo "[deploy] Initializing database..."
DATABASE_URL="$DATABASE_URL" \
ADMIN_BOOTSTRAP_PASSWORD="${ADMIN_BOOTSTRAP_PASSWORD:-Admin@123}" \
node apps/api/scripts/init-db.mjs

if command -v pm2 &>/dev/null; then
  if pm2 describe giveblack-api &>/dev/null; then
    echo "[deploy] Restarting giveblack-api (PM2)..."
    pm2 restart giveblack-api
  else
    echo "[deploy] Starting giveblack-api with PM2..."
    pm2 start ecosystem.config.cjs
    pm2 save
  fi
else
  echo "[deploy] PM2 not found. Install it: npm install -g pm2"
  echo "[deploy] Then run: pm2 start ecosystem.config.cjs && pm2 save && pm2 startup"
fi

sleep 3

echo ""
echo "[deploy] Verifying API health..."
if curl -sf http://localhost:${PORT:-5001}/health > /dev/null 2>&1; then
  echo "[deploy] API is healthy!"
else
  echo "[deploy] WARNING: API health check failed. Check logs: pm2 logs giveblack-api"
fi

if command -v nginx &>/dev/null; then
  DOMAIN_CONF=""
  if [ -f /etc/nginx/sites-enabled/giveblack.mawa.pro ]; then
    DOMAIN_CONF="giveblack.mawa.pro"
  elif [ -f /etc/nginx/sites-enabled/giveblackapp.com ]; then
    DOMAIN_CONF="giveblackapp.com"
  fi

  if [ -n "$DOMAIN_CONF" ]; then
    echo "[deploy] Reloading Nginx..."
    sudo nginx -t && sudo systemctl reload nginx
  fi
fi

echo ""
echo "============================================"
echo " Deploy Complete!"
echo "============================================"
echo ""
echo "  API:   http://localhost:${PORT:-5001}/health"
echo "  Admin: http://localhost:${PORT:-5001}/admin/"
echo ""
echo "  Test:  curl http://localhost:${PORT:-5001}/api/organizations"
echo ""
