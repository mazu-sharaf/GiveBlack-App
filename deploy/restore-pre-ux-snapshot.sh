#!/usr/bin/env bash
# Restore GiveBlack to the pre-UI/UX snapshot (tag v2.2.5-pre-ux).
# Rebuilds admin SPA, syncs nginx for admin.giveblackapp.com, optionally restarts API.
#
# Usage (from repo root):
#   bash deploy/restore-pre-ux-snapshot.sh              # rebuild admin from current checkout
#   bash deploy/restore-pre-ux-snapshot.sh --checkout   # git checkout backup branch first
#   bash deploy/restore-pre-ux-snapshot.sh --api        # also pm2 restart giveblack-api
#
# UX branches (for experiments; restore discards uncommitted work when using --checkout):
#   backup/pre-ux-2026-06-14  — frozen snapshot (same as tag v2.2.5-pre-ux)
#   feature/ux-donate-flow    — mobile donate / fundraising UX
#   feature/ux-admin          — admin dashboard UX

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

TAG="v2.2.5-pre-ux"
BACKUP_BRANCH="backup/pre-ux-2026-06-14"

DO_CHECKOUT=0
DO_API=0
for arg in "$@"; do
  case "$arg" in
    --checkout) DO_CHECKOUT=1 ;;
    --api) DO_API=1 ;;
    -h|--help)
      sed -n '1,14p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown option: $arg (use --checkout, --api, or --help)"
      exit 1
      ;;
  esac
done

echo "============================================"
echo " Restore pre-UX snapshot ($TAG)"
echo "============================================"

if [ "$DO_CHECKOUT" -eq 1 ]; then
  if ! git rev-parse "$TAG" >/dev/null 2>&1; then
    echo "[restore] Tag $TAG not found. Fetch: git fetch github --tags"
    exit 1
  fi
  echo "[restore] Checking out $BACKUP_BRANCH..."
  git fetch github "$BACKUP_BRANCH" "$TAG" 2>/dev/null || true
  git checkout "$BACKUP_BRANCH"
  git reset --hard "$TAG"
fi

CURRENT="$(git rev-parse --short HEAD)"
echo "[restore] HEAD=$CURRENT"

if [ -f "$REPO_ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$REPO_ROOT/.env"
  set +a
fi

echo "[restore] Building admin panel (apps/admin/dist)..."
npm run build:admin

if command -v nginx &>/dev/null && [ -f "$REPO_ROOT/deploy/nginx-admin.giveblackapp.com.conf" ]; then
  echo "[restore] Syncing nginx admin vhost..."
  sudo cp "$REPO_ROOT/deploy/nginx-admin.giveblackapp.com.conf" /etc/nginx/sites-available/admin.giveblackapp.com
  sudo ln -sf /etc/nginx/sites-available/admin.giveblackapp.com /etc/nginx/sites-enabled/admin.giveblackapp.com
  if [ -f "$REPO_ROOT/deploy/nginx-giveblackapp.com.conf" ] && [ -f /etc/nginx/sites-enabled/giveblackapp.com ]; then
    sudo cp "$REPO_ROOT/deploy/nginx-giveblackapp.com.conf" /etc/nginx/sites-available/giveblackapp.com
  fi
  sudo nginx -t
  sudo systemctl reload nginx
  echo "[restore] Admin: https://admin.giveblackapp.com/"
else
  echo "[restore] Skipping nginx (not installed or config missing)"
fi

if [ "$DO_API" -eq 1 ] && command -v pm2 &>/dev/null; then
  echo "[restore] Restarting giveblack-api..."
  pm2 restart giveblack-api --update-env || true
fi

echo ""
echo "============================================"
echo " Restore complete"
echo "============================================"
echo "  Tag:        $TAG"
echo "  Commit:     $CURRENT"
echo "  Admin dist: $REPO_ROOT/apps/admin/dist"
echo ""
echo "  Start mobile UX:  git checkout feature/ux-donate-flow"
echo "  Start admin UX:   git checkout feature/ux-admin"
echo ""
