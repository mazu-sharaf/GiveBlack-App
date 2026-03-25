# Admin panel – API setup (Categories & full control)

For the admin panel to **add/edit/delete categories** and use all API-backed features:

1. **Run the API server** (port 5001)
   ```bash
   cd /var/www/giveblack
   node server_dist/index.js
   ```
   Or with PM2: `pm2 start server_dist/index.js --name giveblack-api`

2. **Set admin API URL** in `apps/admin/.env`:
   - Local: `VITE_API_URL="http://localhost:5001"`
   - Production: `VITE_API_URL="https://giveblackapp.com/app"`

3. **Use the correct Supabase service role key** in the **root** `.env`:
   - `SUPABASE_SERVICE_ROLE_KEY` must be from the **same project** as `SUPABASE_URL` (e.g. `mwapnzwgusstkgjguhur`).
   - Get it: Supabase Dashboard → your project → Project Settings → API → copy the `service_role` secret.

4. **Log in to the admin panel** (email + password). That stores the API token so Categories and other API routes work.

If the API is not running or the key is wrong, Categories will still **load** (fallback to Supabase) but **add/edit/delete** will fail until the above is done.
