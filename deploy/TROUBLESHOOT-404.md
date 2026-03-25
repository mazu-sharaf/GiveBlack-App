# Fix 404 on giveblackapp.com/app/api/health

The 404 with "ErrorDocument" usually means **Apache** is serving the site. Do one of the following.

## Option A: Use Nginx (recommended)

1. On the VPS, install Nginx and use it for giveblackapp.com:
   ```bash
   sudo cp /var/www/giveblack/deploy/nginx-giveblackapp.com.conf /etc/nginx/sites-available/giveblackapp.com
   sudo ln -sf /etc/nginx/sites-available/giveblackapp.com /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   ```
2. Disable the Apache vhost for giveblackapp.com (or stop Apache if Nginx handles all sites).
3. Ensure the API is running: `pm2 list` should show `giveblack-api` online, and:
   ```bash
   curl -s http://127.0.0.1:5001/api/health
   ```
   should return `{"status":"ok",...}`.

## Option B: Keep Apache – proxy /app/ to Node

1. Enable proxy modules:
   ```bash
   sudo a2enmod proxy proxy_http
   ```
2. Add a config that proxies `/app/` to the API. Example (adjust to your Apache setup):
   ```apache
   ProxyPass /app/ http://127.0.0.1:5001/
   ProxyPassReverse /app/ http://127.0.0.1:5001/
   ```
   See `deploy/apache-giveblackapp.com.conf` for a full snippet.
3. Reload Apache: `sudo systemctl reload apache2`.
4. Ensure the API is running on port 5001 (see curl above).

## Check on the VPS

Run these **on the server** that serves giveblackapp.com (72.60.26.227):

```bash
# Is the API up?
curl -s http://127.0.0.1:5001/api/health

# Is something listening on 5001?
ss -tlnp | grep 5001

# Which web server is handling the site?
# If Nginx: ls /etc/nginx/sites-enabled/
# If Apache: ls /etc/apache2/sites-enabled/
```

After the proxy is correct, https://giveblackapp.com/app/api/health should return JSON, not 404.
