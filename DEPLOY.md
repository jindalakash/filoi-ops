# Deploying Filoi Ops on a Hostinger VPS

End result: **https://ops.filoi.in** (use any sub-domain you like) running in Docker on your VPS —
the app, its PostgreSQL database, uploaded files and daily backups — with free HTTPS from Caddy.

```
Internet ──443──▶ Caddy (HTTPS, on the VPS) ──▶ app container :3000 ──▶ db container (PostgreSQL 17)
                                                    │                       │
                                         uploads volume            pgdata volume
                                         /opt/filoi-ops/backups (daily backups, on the VPS disk)
```

Commands marked **Mac** run in Terminal on your MacBook; everything else runs on the VPS over SSH.
Replace `VPS_IP` with your server's IP (hPanel → VPS → Overview) and `ops.filoi.in` with your sub-domain.

---

## 0. Before you start

- VPS with Ubuntu 22.04/24.04 and Docker (already done). **2 GB RAM minimum**, 4 GB is comfortable.
- Root SSH access: `ssh root@VPS_IP` works from your Mac.
- Access to the DNS for `filoi.in` (wherever the domain is managed — Hostinger, GoDaddy, Cloudflare…).
- Decide: **A) move your current data from the Mac** (recommended — keeps projects, users, settings, AI key)
  or **B) start empty** with just an admin user.

---

## 1. Point the sub-domain at the VPS

In your DNS manager add:

| Type | Name | Value | TTL |
|---|---|---|---|
| A | `ops` | `VPS_IP` | 300 |

Check from the Mac after a few minutes (should print the VPS IP):

```bash
dig +short ops.filoi.in
```

---

## 2. Prepare the server

```bash
ssh root@VPS_IP
```

```bash
apt update && apt -y upgrade
apt -y install git ufw
docker --version && docker compose version     # both must print a version
```

**Firewall** — allow only SSH and web traffic (the app's port 3000 is never exposed):

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
```

If hPanel → VPS → **Firewall** has rules enabled, allow 22, 80 and 443 there too.

**Swap** (only if the VPS has 2 GB RAM or less — the build needs memory):

```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

**Ports 80/443 must be free** (some Hostinger templates pre-install a web server):

```bash
ss -tlnp | grep -E ':80 |:443 '
```

No output = good. If Apache/Nginx shows up and you don't use it: `systemctl disable --now apache2 nginx`.

---

## 3. Get the code

```bash
cd /opt
git clone https://github.com/jindalakash/filoi-ops.git
cd /opt/filoi-ops
```

> If you make the GitHub repo private (recommended for company code), create a token at
> GitHub → Settings → Developer settings → Fine-grained tokens (read-only "Contents" on this repo) and clone with
> `git clone https://<token>@github.com/jindalakash/filoi-ops.git`.

---

## 4. Create the server's `.env`

Generate secrets (run three times, copy each result):

```bash
openssl rand -hex 32
```

```bash
cp .env.example .env
nano .env
```

Set these (delete or ignore the other lines — the database URL and file paths are set by Docker):

```ini
POSTGRES_PASSWORD="<random value #1>"
SESSION_SECRET="<random value #2>"
ENCRYPTION_KEY="<see below>"
APP_URL="https://ops.filoi.in"
COOKIE_SECURE="1"
ADMIN_USERNAME="admin"
ADMIN_EMAIL="admin@filoi.in"
ADMIN_PASSWORD="<only needed for option B>"
```

**ENCRYPTION_KEY**
- **Option A (moving data):** use the *same* value as your Mac. On the Mac: `grep ENCRYPTION_KEY ~/Documents/GitHub/filoi-ops/.env`.
  It decrypts the saved Claude API key and SMTP password — a different key makes them unreadable (you'd re-enter them).
- **Option B (fresh):** random value #3.

Save with `Ctrl+O`, `Enter`, `Ctrl+X`. Then lock it down and **keep a copy of this file somewhere safe** (password manager):

```bash
chmod 600 .env
```

---

## 5. Start the database

```bash
docker compose up -d db
docker compose ps        # db should be "running"
```

---

## 6A. Move your data from the Mac (recommended)

**Mac** — export the database and copy it plus the uploaded files to the server:

```bash
cd ~/Documents/GitHub/filoi-ops
PGPASSWORD='YOUR_MAC_DB_PASSWORD' /Library/PostgreSQL/17/bin/pg_dump -h localhost -U postgres -Fc --no-owner --no-acl -d filoi_ops_fresh -f filoi.dump
scp filoi.dump root@VPS_IP:/opt/filoi-ops/
scp -r storage/files root@VPS_IP:/opt/filoi-ops/migrate-files
```

**VPS** — load it into the empty database:

```bash
cd /opt/filoi-ops
docker compose cp filoi.dump db:/tmp/filoi.dump
docker compose exec db pg_restore -U filoi -d filoi_ops --no-owner --role=filoi /tmp/filoi.dump
docker compose exec db psql -U filoi -d filoi_ops -c 'SELECT username, role FROM "User";'
```

The last command should list your users (admin, neeraj, akash). Continue with step 7, then come back for the files (7a).

## 6B. …or start fresh

Nothing to do here — the admin is created in step 7b.

---

## 7. Build and start the app

```bash
cd /opt/filoi-ops
docker compose up -d --build        # first build takes 5–10 minutes
docker compose logs -f app          # wait for "Ready" / "scheduler started", then Ctrl+C
```

Database migrations run automatically every time the app starts.

**7a. Option A — copy the uploaded files in:**

```bash
docker compose cp migrate-files/. app:/app/storage/uploads/
docker compose exec app ls /app/storage/uploads | head
rm -rf migrate-files filoi.dump
```

**7b. Option B — create the first admin:**

```bash
docker compose exec app node node_modules/tsx/dist/cli.mjs prisma/seed.ts
```

Quick check (should print `200` or `307`):

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/login
```

---

## 8. HTTPS with Caddy

Install Caddy from its official repository (works on Ubuntu 22.04 and 24.04):

```bash
apt -y install debian-keyring debian-archive-keyring apt-transport-https curl gnupg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
apt update && apt -y install caddy
```

Point it at the app:

```bash
cat > /etc/caddy/Caddyfile <<'EOF'
ops.filoi.in {
    encode gzip
    reverse_proxy 127.0.0.1:3000
}
EOF
systemctl reload caddy
systemctl status caddy --no-pager | head -5
```

Caddy fetches a free Let's Encrypt certificate automatically (DNS from step 1 must already point here).
Open **https://ops.filoi.in** — you should see the sign-in page with a padlock.

---

## 9. First sign-in and settings

1. Sign in (option A: your usual usernames/passwords; option B: `admin` + `ADMIN_PASSWORD`).
   Option B: remove `ADMIN_PASSWORD` from `.env` afterwards.
2. **Settings → Email**: add SMTP so reminders, assignments, @mentions and the Monday digest actually send.
   - Google Workspace / Gmail: `smtp.gmail.com`, port `587`, your address, an **App password**.
   - Hostinger email: `smtp.hostinger.com`, port `465` (SSL on), mailbox + password.
   - Click **Send test email**.
3. **Settings → AI**: click **Test** — option A keeps your Claude key; option B: add it.
4. **Settings → Reminders**: check the hour (server runs on India time) and the always-copy finance emails.
5. **Settings → Backups**: click **Back up now** once; leave "copy to folder" empty on the server.
6. Option A: stop using the Mac copy from now on (or you'll have two diverging databases).

---

## 10. Backups

- The app makes a **daily backup** (database + uploaded files) into `/opt/filoi-ops/backups`, keeping 14 daily + 8 weekly.
- Also keep copies **off the server**:
  - hPanel → VPS → **Backups / Snapshots**: enable weekly backups or take a snapshot before updates.
  - **Mac** — pull the backup folder down whenever you like:
    ```bash
    rsync -avz root@VPS_IP:/opt/filoi-ops/backups/ ~/FiloiOpsBackups/
    ```
- Keep the server `.env` in your password manager — without `ENCRYPTION_KEY` a restored backup can't read saved keys.

Restoring is described in **Settings → Backups** in the app.

---

## 11. Updating to a new version

```bash
cd /opt/filoi-ops
git pull
docker compose up -d --build
docker compose logs --tail 50 app
```

Data, uploads and backups live in Docker volumes / the backups folder and survive updates.

---

## 12. Everyday commands

| What | Command (in `/opt/filoi-ops`) |
|---|---|
| Status | `docker compose ps` |
| App logs | `docker compose logs -f app` |
| Restart app | `docker compose restart app` |
| Stop / start everything | `docker compose down` / `docker compose up -d` |
| Database shell | `docker compose exec db psql -U filoi -d filoi_ops` |
| Run reminders now | Settings → Reminders → *Run reminder check now* |
| Disk space | `df -h` and `docker system df` |
| Clean old build layers | `docker image prune -f` |

## Troubleshooting

- **Site doesn't open / certificate error** — `dig +short ops.filoi.in` must show the VPS IP; `journalctl -u caddy -n 50`; ports 80/443 open in ufw *and* hPanel firewall.
- **502 Bad Gateway** — the app isn't running: `docker compose ps`, `docker compose logs --tail 100 app`.
- **Build killed / "JavaScript heap out of memory"** — add swap (step 2) and run the build again.
- **Sign-in loops back to login** — `COOKIE_SECURE="1"` requires opening the site over **https**.
- **Emails not arriving** — Settings → Email → Send test email; the reminder log on Settings → Reminders shows each attempt.
- **Uploads fail for big files** — Caddy has no size limit; if you swapped in Nginx, set `client_max_body_size 60M;`.
- **"Library → Import from templates-bank"** — that folder isn't shipped to the server; upload past proposals through the Library page instead.
