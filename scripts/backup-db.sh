#!/usr/bin/env bash
# GiveBlack — daily PostgreSQL backup to Cloudflare R2
# Runs nightly via cron. See deploy/README or the project docs for details.
#
# What it does:
#   1. pg_dump → compressed custom-format dump (best for pg_restore)
#   2. Uploads to s3://giveblack-backups/daily/YYYY-MM-DD/giveblack-<ts>.dump
#   3. Prunes local copies older than 7 days (R2 keeps a 30-day window via
#      lifecycle rule)
#   4. Logs duration + size to stdout (captured to /var/log/giveblack-backup.log)
#
# Exit codes:
#   0  success
#   1  config / env error
#   2  pg_dump failed
#   3  R2 upload failed

set -euo pipefail

# ── Load env ───────────────────────────────────────────────────────────────
ENV_FILE="/var/www/giveblack/.env"
if [[ ! -r "$ENV_FILE" ]]; then
  echo "ERROR: cannot read $ENV_FILE" >&2
  exit 1
fi
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

: "${DATABASE_URL:?DATABASE_URL missing from .env}"
: "${R2_ENDPOINT:?R2_ENDPOINT missing from .env}"

# Backup bucket has its own credentials (separate from giveblack-uploads).
BACKUP_BUCKET="${R2_BACKUP_BUCKET:-giveblack-backups}"
AWS_PROFILE="${R2_BACKUP_AWS_PROFILE:-r2-backup}"

# ── Paths ──────────────────────────────────────────────────────────────────
DUMP_DIR="/var/backups/giveblack"
mkdir -p "$DUMP_DIR"

TS="$(date +%FT%H-%M)"          # 2026-05-24T03-30
DAY="$(date +%F)"               # 2026-05-24
DUMP_FILE="$DUMP_DIR/giveblack-$TS.dump"

START_EPOCH="$(date +%s)"
log() { printf '[%s] %s\n' "$(date -Iseconds)" "$*"; }

log "=== Backup start (timestamp $TS) ==="

# ── 1. Dump ────────────────────────────────────────────────────────────────
log "Dumping database to $DUMP_FILE"
if ! pg_dump "$DATABASE_URL" \
    --format=custom \
    --compress=9 \
    --no-owner \
    --no-acl \
    --file="$DUMP_FILE"; then
  log "ERROR: pg_dump failed"
  exit 2
fi

SIZE_BYTES="$(stat -c%s "$DUMP_FILE")"
SIZE_HUMAN="$(du -h "$DUMP_FILE" | cut -f1)"
log "Dump complete ($SIZE_HUMAN, $SIZE_BYTES bytes)"

# ── 2. Upload to R2 ────────────────────────────────────────────────────────
R2_KEY="daily/$DAY/giveblack-$TS.dump"
log "Uploading to s3://$BACKUP_BUCKET/$R2_KEY"
if ! aws --profile "$AWS_PROFILE" \
    --endpoint-url "$R2_ENDPOINT" \
    s3 cp "$DUMP_FILE" "s3://$BACKUP_BUCKET/$R2_KEY"; then
  log "ERROR: R2 upload failed"
  exit 3
fi
log "Upload complete"

# ── 3. Prune local dumps older than 7 days ─────────────────────────────────
log "Pruning local dumps older than 7 days from $DUMP_DIR"
find "$DUMP_DIR" -type f -name 'giveblack-*.dump' -mtime +7 -print -delete | \
  while read -r f; do log "  removed $f"; done

# ── 4. Heartbeat (optional — set HEARTBEAT_URL in .env if you want one) ────
if [[ -n "${HEARTBEAT_URL:-}" ]]; then
  log "Pinging heartbeat $HEARTBEAT_URL"
  curl -fsS --retry 3 --max-time 10 "$HEARTBEAT_URL" >/dev/null || \
    log "WARN: heartbeat ping failed (continuing)"
fi

END_EPOCH="$(date +%s)"
log "=== Backup OK in $((END_EPOCH - START_EPOCH))s — $SIZE_HUMAN ==="
