#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
# Load root .env so VITE_API_URL is available for admin build (Vite bakes it in at build time)
if [ -f "$SCRIPT_DIR/.env" ]; then
  set -a
  . "$SCRIPT_DIR/.env"
  set +a
fi
echo "Building admin panel..."
cd "$SCRIPT_DIR/apps/admin" && npm run build
echo "Building API..."
cd "$SCRIPT_DIR/apps/api" && npx tsc -p tsconfig.json
echo "Copying SQL files to dist..."
mkdir -p "$SCRIPT_DIR/apps/api/dist/db"
cp "$SCRIPT_DIR/apps/api/src/db/schema.sql" "$SCRIPT_DIR/apps/api/dist/db/schema.sql"
cp "$SCRIPT_DIR/apps/api/src/db/migrations.sql" "$SCRIPT_DIR/apps/api/dist/db/migrations.sql"
cp "$SCRIPT_DIR/apps/api/src/db/seed.sql" "$SCRIPT_DIR/apps/api/dist/db/seed.sql"
echo "Build complete!"
