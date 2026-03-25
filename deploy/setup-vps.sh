#!/usr/bin/env bash
set -e

echo "============================================"
echo " GiveBlack - VPS Setup Script"
echo " One-step setup for fresh Ubuntu VPS"
echo "============================================"
echo ""

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

DOMAIN="${DOMAIN:-giveblack.mawa.pro}"
DB_NAME="${DB_NAME:-giveblack_db}"
DB_USER="${DB_USER:-giveblack_user}"
DB_PASS="${DB_PASS:-}"
PORT="${PORT:-5001}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@giveblackapp.com}"

print_step() {
  echo ""
  echo "--------------------------------------------"
  echo "  STEP: $1"
  echo "--------------------------------------------"
}

# ---- Step 1: System Dependencies ----
print_step "Installing system dependencies"

if ! command -v node &>/dev/null; then
  echo "Installing Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt install -y nodejs
fi
echo "Node.js: $(node --version)"
echo "npm:     $(npm --version)"

if ! command -v pm2 &>/dev/null; then
  echo "Installing PM2..."
  sudo npm install -g pm2
fi

if ! command -v nginx &>/dev/null; then
  echo "Installing Nginx..."
  sudo apt update
  sudo apt install -y nginx
fi

if ! command -v certbot &>/dev/null; then
  echo "Installing Certbot..."
  sudo apt install -y certbot python3-certbot-nginx
fi

if ! command -v psql &>/dev/null; then
  echo "Installing PostgreSQL..."
  sudo apt install -y postgresql postgresql-contrib
  sudo systemctl enable postgresql
  sudo systemctl start postgresql
fi

# ---- Step 2: PostgreSQL Setup ----
print_step "Setting up PostgreSQL"

if [ -z "$DB_PASS" ]; then
  echo ""
  echo "ERROR: DB_PASS is required."
  echo ""
  echo "Usage: DB_PASS=your_password bash deploy/setup-vps.sh"
  echo ""
  echo "Full options:"
  echo "  DOMAIN=giveblack.mawa.pro \\"
  echo "  DB_NAME=giveblack_db \\"
  echo "  DB_USER=giveblack_user \\"
  echo "  DB_PASS=your_db_password \\"
  echo "  bash deploy/setup-vps.sh"
  exit 1
fi

if echo "$DB_NAME" | grep -qP '[^a-zA-Z0-9_]'; then
  echo "ERROR: DB_NAME contains invalid characters. Use only letters, numbers, and underscores."
  exit 1
fi
if echo "$DB_USER" | grep -qP '[^a-zA-Z0-9_]'; then
  echo "ERROR: DB_USER contains invalid characters. Use only letters, numbers, and underscores."
  exit 1
fi
if echo "$DB_PASS" | grep -q "'"; then
  echo "ERROR: DB_PASS must not contain single quotes."
  exit 1
fi

sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | grep -q 1 || {
  echo "Creating database $DB_NAME..."
  sudo -u postgres psql -c "CREATE DATABASE $DB_NAME;"
}

sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname = '$DB_USER'" | grep -q 1 || {
  echo "Creating user $DB_USER..."
  sudo -u postgres psql -c "CREATE USER $DB_USER WITH ENCRYPTED PASSWORD '$DB_PASS';"
}

sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"
sudo -u postgres psql -c "ALTER DATABASE $DB_NAME OWNER TO $DB_USER;"
sudo -u postgres psql -d "$DB_NAME" -c "GRANT ALL ON SCHEMA public TO $DB_USER;"
echo "PostgreSQL configured: $DB_NAME / $DB_USER"

# ---- Step 3: Create .env if missing ----
print_step "Checking .env configuration"

DATABASE_URL="postgresql://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME"

if [ ! -f "$REPO_ROOT/.env" ]; then
  echo "Creating .env file..."

  JWT_ACCESS=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")
  JWT_REFRESH=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")

  cat > "$REPO_ROOT/.env" <<ENVEOF
NODE_ENV=production
PORT=$PORT
API_HOST=0.0.0.0
DATABASE_URL=$DATABASE_URL

JWT_ACCESS_SECRET=$JWT_ACCESS
JWT_REFRESH_SECRET=$JWT_REFRESH
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL_DAYS=30

CORS_ORIGINS=https://$DOMAIN
ADMIN_BOOTSTRAP_PASSWORD=Admin@123

EXPO_PUBLIC_DOMAIN=$DOMAIN
EXPO_PUBLIC_API_URL=https://$DOMAIN/app

# Stripe (fill in from your Stripe dashboard)
# STRIPE_SECRET_KEY=sk_live_...
# STRIPE_WEBHOOK_SECRET=whsec_...

# Brevo email (optional)
# BREVO_API_KEY=xkeysib-...
# BREVO_SENDER_EMAIL=no-reply@giveblackapp.com

# Expo push notifications (optional)
# EXPO_ACCESS_TOKEN=expo-token-here
ENVEOF
  echo ".env created at $REPO_ROOT/.env"
else
  echo ".env already exists. Skipping creation."
fi

set -a
. "$REPO_ROOT/.env"
set +a

# ---- Step 4: Install Dependencies & Build ----
print_step "Installing dependencies and building"

npm install --production=false

echo "Building admin panel + API..."
bash scripts/production-build.sh

# ---- Step 5: Initialize Database ----
print_step "Initializing database schema and seed data"

DATABASE_URL="$DATABASE_URL" \
ADMIN_BOOTSTRAP_PASSWORD="${ADMIN_BOOTSTRAP_PASSWORD:-Admin@123}" \
node apps/api/scripts/init-db.mjs

sudo -u postgres psql -d "$DB_NAME" -c "
  GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO $DB_USER;
  GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO $DB_USER;
  GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO $DB_USER;
"
echo "Database permissions applied."

# ---- Step 6: Start API with PM2 ----
print_step "Starting API with PM2"

if pm2 describe giveblack-api &>/dev/null 2>&1; then
  pm2 restart giveblack-api
else
  pm2 start ecosystem.config.cjs
fi

pm2 save
CURRENT_USER=$(whoami)
CURRENT_HOME=$(eval echo "~$CURRENT_USER")
pm2 startup systemd -u "$CURRENT_USER" --hp "$CURRENT_HOME" 2>/dev/null || true
echo "PM2 configured and running as $CURRENT_USER."

sleep 3

echo "Testing API locally..."
if curl -sf http://localhost:$PORT/health; then
  echo ""
  echo "API is healthy!"
else
  echo "WARNING: API health check failed. Check: pm2 logs giveblack-api"
fi

# ---- Step 7: Configure Nginx ----
print_step "Configuring Nginx"

NGINX_CONF="/etc/nginx/sites-available/$DOMAIN"

if [ "$DOMAIN" = "giveblack.mawa.pro" ]; then
  sudo cp "$REPO_ROOT/deploy/nginx-giveblack-mawa-pro.conf" "$NGINX_CONF"
elif [ "$DOMAIN" = "giveblackapp.com" ]; then
  sudo cp "$REPO_ROOT/deploy/nginx-giveblackapp.com.conf" "$NGINX_CONF"
else
  echo "Creating generic Nginx config for $DOMAIN..."
  sudo tee "$NGINX_CONF" > /dev/null <<NGINXEOF
server {
    listen 80;
    server_name $DOMAIN;
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name $DOMAIN;

    ssl_certificate     /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;

    location /admin/ {
        alias /var/www/giveblack/apps/admin/dist/;
        try_files \$uri \$uri/ /admin/index.html;
    }

    location /app/ {
        proxy_pass http://127.0.0.1:$PORT/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 86400;
    }

    location / {
        proxy_pass http://127.0.0.1:$PORT/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINXEOF
fi

sudo ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# ---- Step 8: SSL Certificate ----
print_step "SSL Certificate"

if [ -d "/etc/letsencrypt/live/$DOMAIN" ]; then
  echo "SSL certificate already exists for $DOMAIN."
else
  echo "Obtaining SSL certificate for $DOMAIN..."
  sudo systemctl stop nginx 2>/dev/null || true
  sudo certbot certonly --standalone -d "$DOMAIN" --agree-tos --non-interactive -m "$ADMIN_EMAIL" || {
    echo "WARNING: SSL certificate failed. You may need to run certbot manually."
    echo "  sudo certbot certonly --standalone -d $DOMAIN"
  }
fi

sudo nginx -t && sudo systemctl start nginx && sudo systemctl enable nginx
echo "Nginx configured and running."

# ---- Done ----
echo ""
echo "============================================"
echo " GiveBlack Setup Complete!"
echo "============================================"
echo ""
echo "  Domain:  https://$DOMAIN"
echo "  API:     https://$DOMAIN/app/api/organizations"
echo "  Health:  https://$DOMAIN/health"
echo "  Admin:   https://$DOMAIN/admin/"
echo ""
echo "  Admin Login:"
echo "    Email:    admin@giveblackapp.com"
echo "    Password: Admin@123"
echo ""
echo "  Verify with:"
echo "    curl https://$DOMAIN/app/api/organizations"
echo "    curl https://$DOMAIN/app/api/categories"
echo "    curl https://$DOMAIN/health"
echo ""
echo "  Logs:    pm2 logs giveblack-api"
echo "  Status:  pm2 status"
echo ""
