# GiveBlack — Disaster Recovery Using Cursor (Step-by-Step)

**Audience:** You. Your old VPS is gone. You have a Windows laptop with Cursor installed. You want the fastest, lowest-stress path back online.

**This guide is for non-experts.** Instead of remembering 100+ Linux commands, you'll connect Cursor to a fresh VPS and tell it what to do in plain English. The AI inside Cursor already knows the GiveBlack codebase, so it can run the recovery for you.

**Total time:** 1.5 – 2 hours. About 30 minutes of typing, the rest is waiting for installs/builds.

For a non-Cursor reference (raw commands only), see [DISASTER-RECOVERY.md](DISASTER-RECOVERY.md).

---

## Before you start — open your Recovery Kit

Open your Google Doc **"GiveBlack — Recovery Kit"** in a browser tab. You'll copy values from it as you go.

You need it to have:
- Cloudflare R2 backup access keys
- The full contents of the old `.env`
- DNS provider login (Hostinger or Cloudflare)

Don't have a Recovery Kit yet? Stop here and build one using [Appendix A in DISASTER-RECOVERY.md](DISASTER-RECOVERY.md#appendix-a--recovery-kit-google-doc-template). Without it, recovery is impossible.

---

## STEP 1 — Buy a new VPS (~10 min)

### 1.1 — Go to Hostinger (or whatever provider)

1. Open [**hostinger.com**](https://hpanel.hostinger.com) → log in.
2. Go to **VPS** → **Buy VPS Plan**.
3. Pick **KVM2** (same as before — 2 vCPU / 8 GB RAM / 100 GB SSD).
4. Pay for at least 1 month.

### 1.2 — Configure the new VPS

When Hostinger asks:

| Setting | Value |
|---|---|
| Location | Closest to most of your users (US-East if Minnesota-based) |
| OS | **Ubuntu 24.04 LTS** (or 22.04 — both work) |
| Hostname | `giveblack-vps` or similar |
| Root password | **Generate a strong one** and paste it into your Recovery Kit doc immediately |

### 1.3 — Get the connection info

Once provisioning finishes (~5 min):

1. Hostinger dashboard → your VPS → **Overview** page
2. Copy:
   - **IP address** (e.g. `198.51.100.42`)
   - **Root password** (you set this above)
3. Paste both into your Recovery Kit doc.

---

## STEP 2 — First SSH connection (~5 min)

This step is from your **Windows laptop**, not from Cursor yet.

### 2.1 — Open PowerShell

Press `Windows` key → type `PowerShell` → open it.

### 2.2 — Connect to the new VPS

```powershell
ssh root@<NEW-VPS-IP>
```

It will ask:
- **"Are you sure you want to continue connecting"** → type `yes`
- **password** → paste the root password

If you see a `root@giveblack-vps:~#` prompt, you're in.

### 2.3 — (Optional but recommended) Set up SSH key auth

Avoids typing the password every time. From PowerShell **on your laptop** (in a NEW window, leave the SSH session open):

```powershell
# Generate a new key dedicated to this VPS
ssh-keygen -t ed25519 -f "$env:USERPROFILE\.ssh\giveblack_vps_new" -C "giveblack-recovery"
# Press Enter twice for no passphrase
```

Then copy the public key to the VPS:

```powershell
type "$env:USERPROFILE\.ssh\giveblack_vps_new.pub" | ssh root@<NEW-VPS-IP> "cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
```

Test it works without a password:

```powershell
ssh -i "$env:USERPROFILE\.ssh\giveblack_vps_new" root@<NEW-VPS-IP>
```

If you log in without a password prompt, you're golden.

### 2.4 — Add the host to your SSH config

This makes Cursor able to find it. Edit (or create) `C:\Users\<you>\.ssh\config`:

```sshconfig
Host giveblack-vps
    HostName <NEW-VPS-IP>
    User root
    IdentityFile ~/.ssh/giveblack_vps_new
    ServerAliveInterval 30
```

Save the file.

---

## STEP 3 — Connect Cursor to the new VPS (~3 min)

This is where Cursor takes over the work.

### 3.1 — Open Cursor on your laptop

Make sure you have the **Remote-SSH extension** installed (it's built-in to Cursor by default).

### 3.2 — Connect to the host

1. Press `Ctrl+Shift+P` → opens the command palette.
2. Type `Remote-SSH: Connect to Host` → Enter.
3. Pick `giveblack-vps` from the list.
4. Cursor opens a new window connected to the new VPS.
5. Wait 30 seconds while Cursor sets up its server on the VPS.

You'll see at the bottom-left: **"SSH: giveblack-vps"** — that confirms you're connected.

### 3.3 — Open a terminal in Cursor

`Ctrl+\`` (backtick) → terminal opens, prompted as `root@giveblack-vps:~#`.

You're now ready to drive the rest of the recovery using Cursor's AI.

---

## STEP 4 — Use Cursor AI to set up the VPS (~25 min)

Now the fun part. Open the Cursor chat panel (`Ctrl+L` or click the chat icon). Make sure you're in **Agent mode** (top of the chat).

Send these prompts **one at a time**, waiting for each to finish before sending the next.

### Prompt 1 — Install everything

Paste into chat:

> Set up this fresh Ubuntu VPS to host GiveBlack. Install Node.js 20 (via nvm), PostgreSQL 16, nginx, certbot, PM2, AWS CLI v2, and git. Configure a 2 GB swap file. Set timezone to UTC. Show me a summary when done.

Cursor will run apt installs, the nvm script, etc. Watch it work. When it says it's done, send the next prompt.

### Prompt 2 — Clone the code

> Clone the GiveBlack repo from https://github.com/mazu-sharaf/GiveBlackMain.git into /var/www/giveblack, then run npm install. If npm install runs out of memory, use --maxsockets=1.

### Prompt 3 — Paste in your .env

Open your Recovery Kit doc → copy the entire `.env` section. Then paste into Cursor chat:

> Here is the production .env file from our backup. Save it to /var/www/giveblack/.env with mode 600. Verify it has DATABASE_URL, JWT secrets, Stripe live keys, and R2 credentials.
>
> ```
> <paste full .env here>
> ```

Cursor will write the file and verify.

### Prompt 4 — Restore the database

> Restore the GiveBlack PostgreSQL database from the latest backup in Cloudflare R2. Steps:
>
> 1. Configure /root/.aws/credentials with the r2-backup profile using these keys:
>    Access Key: <paste from Recovery Kit>
>    Secret: <paste from Recovery Kit>
>
> 2. Create the PostgreSQL user and database from DATABASE_URL in .env.
>
> 3. List backups in s3://giveblack-backups/daily/ and download the most recent dump.
>
> 4. Run pg_restore --no-owner --no-acl on the downloaded dump.
>
> 5. Show me the row counts for users, profiles, campaigns, donations.

When it shows row counts that look reasonable (matching what was on the old VPS), the database is restored.

### Prompt 5 — Set up nginx + SSL

> Set up nginx for giveblackapp.com using deploy/nginx-giveblackapp.com.conf and deploy/nginx-giveblackapp.com-http-only.conf in the repo.
>
> Start with the HTTP-only config first (we'll add HTTPS after DNS updates). Verify nginx is running and listening on port 80.

### Prompt 6 — Start the API

> Start the GiveBlack API with PM2 using ecosystem.config.js or apps/api/dist/server.js. Configure PM2 to auto-start on reboot. Then curl http://localhost:5001/health (or the right port) and show me the response.

If you get `{"ok":true}` (or similar), the API is alive.

### Prompt 7 — Re-enable daily backups

> Set up the daily PostgreSQL backup using scripts/backup-db.sh. Add a cron job to run it nightly at 3:30 AM. Run it once manually now to verify it can reach R2. Tail /var/log/giveblack-backup.log to confirm.

---

## STEP 5 — Update DNS (~5 min + propagation)

This is the moment your site goes live again.

### 5.1 — Go to your DNS provider

Either Cloudflare (`dash.cloudflare.com`) or Hostinger DNS (`hpanel.hostinger.com` → Domains → DNS Zone).

### 5.2 — Update A records

| Record type | Name | Value |
|---|---|---|
| A | `giveblackapp.com` (or `@`) | `<NEW-VPS-IP>` |
| A | `www` | `<NEW-VPS-IP>` |
| A | `images` | `<keep pointing to R2/Cloudflare>` |

**Lower the TTL to 60 seconds during the change** (raise back to 1 hour afterward).

### 5.3 — Wait for DNS propagation

From PowerShell on your laptop:

```powershell
nslookup giveblackapp.com
```

When it returns the new IP, you're propagated. Usually 1–10 minutes.

---

## STEP 6 — Get HTTPS working (~5 min)

Back in Cursor chat:

### Prompt 8 — Issue SSL cert

> DNS now points to this VPS. Run certbot to issue a Let's Encrypt SSL certificate for giveblackapp.com and www.giveblackapp.com. Then swap nginx to use the full HTTPS config (deploy/nginx-giveblackapp.com.conf) and reload nginx. Verify https://giveblackapp.com returns 200.

---

## STEP 7 — Smoke test everything (~10 min)

### 7.1 — In Cursor chat:

> Run these smoke tests and tell me which pass/fail:
>
> 1. curl -I https://giveblackapp.com
> 2. curl https://giveblackapp.com/api/health
> 3. List the last 5 rows in the users table
> 4. List campaigns count
> 5. Tail PM2 logs to check for errors
> 6. Verify R2 connectivity by listing 1 file from giveblack-uploads

### 7.2 — On your phone:

Open the GiveBlack app:

- [ ] App opens, splash screen plays
- [ ] Sign in with Apple (iPhone) or Google (Android) works
- [ ] Campaign list loads
- [ ] A campaign image displays (proves R2 still works)
- [ ] Make a **$1 test donation** in live mode → confirms Stripe live keys
- [ ] Receive donation receipt email → confirms Brevo email
- [ ] Push notification arrives within 1 minute of donating

If all 7 pass, **you're back**. 🎉

---

## Common problems & fixes

### "Cursor can't connect to the VPS"

- Check `~/.ssh/config` has the right IP
- Test from PowerShell first: `ssh -i ~/.ssh/giveblack_vps_new root@<IP>`
- If that works but Cursor doesn't, restart Cursor

### "npm install fails with out-of-memory"

In Cursor chat:

> npm install ran out of memory. Add more swap space (4 GB total), then retry with --maxsockets=1.

### "Database restore says permission denied"

In Cursor chat:

> The pg_restore failed. Check that giveblack_user exists, has correct password, owns the database, and that we used --no-owner --no-acl flags.

### "Stripe webhook keeps failing"

The webhook URL is fine because DNS points to the new VPS. But verify:

> Check nginx logs for /api/webhooks/stripe POST requests. If they're hitting nginx but failing, check PM2 logs for the API.

If Stripe still complains, go to Stripe Dashboard → Developers → Webhooks → click the endpoint → "Send test event" to retrigger it.

### "App says network error on phone"

The app is hitting the API URL baked into the build (`EXPO_PUBLIC_API_URL`). If you didn't change anything, it points at `giveblackapp.com` and DNS should resolve. If you changed domains, you must rebuild the app via EAS.

---

## After recovery — clean up

When everything is verified working:

1. **In your Recovery Kit doc:** update the VPS IP, hostname, and "Last reviewed" date.
2. **Bump the DNS TTL** back to 1 hour (3600 seconds).
3. **Delete the old VPS** if it still exists in Hostinger to save money.
4. **Check next morning** that the 3:30 AM backup ran:
   ```bash
   tail -20 /var/log/giveblack-backup.log
   ```
5. **Update SSH config** on your laptop — replace the old IP everywhere.

---

## Why this approach works

Recovering a server traditionally requires remembering:
- How to install Node, PostgreSQL, nginx, PM2 versions
- The exact apt package names
- nginx config syntax
- pg_restore flag combinations
- PM2 ecosystem configuration
- certbot non-interactive flags
- cron syntax
- AWS CLI quirks for R2

**With Cursor in agent mode, you don't need to remember any of it.** You only need to remember:
1. What you're trying to achieve at each step
2. Where the secrets/credentials live (Recovery Kit doc)
3. How to verify things are working

Cursor's AI knows the codebase, has the deployment scripts available, and can read your existing config files for context. As long as you have your Recovery Kit and SSH access, it can rebuild GiveBlack in about 90 minutes — even under panic conditions.

---

_Last updated: May 2026. Keep this doc current when paths, secrets, or providers change._
