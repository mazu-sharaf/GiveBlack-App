#!/usr/bin/env bash
# Expand the existing Let's Encrypt certificate so it includes admin.giveblackapp.com.
# Fixes: NET::ERR_CERT_COMMON_NAME_INVALID on https://admin.giveblackapp.com
#
# Prereqs: DNS A record for admin → this VPS; nginx site from deploy/nginx-giveblackapp.com.conf loaded.
#
# Usage (from repo root on the VPS):
#   CERTBOT_EMAIL=you@example.com bash deploy/ssl-expand-giveblackapp-admin.sh
#   bash deploy/ssl-expand-giveblackapp-admin.sh you@example.com
#
# If --cert-name fails, run: sudo certbot certificates
# and set CERT_NAME below to the "Certificate Name" shown for giveblackapp.com.

set -euo pipefail

EMAIL="${1:-${CERTBOT_EMAIL:-}}"
if [[ -z "${EMAIL}" ]]; then
  echo "Set CERTBOT_EMAIL or pass email as first argument."
  echo "  CERTBOT_EMAIL=you@example.com bash deploy/ssl-expand-giveblackapp-admin.sh"
  exit 1
fi

# Match the "Certificate Name" from \`sudo certbot certificates\` (usually the primary domain).
CERT_NAME="${CERT_NAME:-giveblackapp.com}"

echo "Expanding certificate '${CERT_NAME}' to include admin.giveblackapp.com ..."
sudo certbot certonly --nginx \
  --non-interactive --agree-tos -m "${EMAIL}" \
  --cert-name "${CERT_NAME}" \
  --expand \
  -d giveblackapp.com -d www.giveblackapp.com -d admin.giveblackapp.com

sudo nginx -t && sudo systemctl reload nginx

echo ""
echo "SAN check (look for DNS:admin.giveblackapp.com):"
openssl s_client -connect admin.giveblackapp.com:443 -servername admin.giveblackapp.com </dev/null 2>/dev/null \
  | openssl x509 -noout -ext subjectAltName || true
