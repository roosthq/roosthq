# Deploying Roost HQ (Ubuntu VM + Cloudflare Tunnel)

This is a step-by-step guide to run Roost HQ on an Ubuntu VM (e.g. on Proxmox) and
reach it from anywhere - phones, other locations - with HTTPS and **no open router
ports**. It's written to be copy-paste simple. Everything runs in Docker and comes
back automatically after a reboot.

```
phone / browser
      │  https://roost.yourdomain.com
      ▼
 Cloudflare edge (TLS)
      │  encrypted tunnel (no open ports)
      ▼
 cloudflared ─▶ Caddy ──/api/*──▶ server (NestJS)
                       └──/*──────▶ web (frontend)
                          server ──▶ MySQL
```

## What you need first

- An Ubuntu VM (22.04 or 24.04), 2 vCPU / 4 GB RAM / 20 GB disk is plenty.
- A domain added to a free Cloudflare account.
- A Google account (for the Calendar API) - see step 4.

---

## Step 1 - Install the required packages

SSH into the VM and install Docker + git in one go (this script works on any Ubuntu
version and installs Docker Engine plus the `docker compose` plugin):

```bash
sudo apt update
curl -fsSL https://get.docker.com | sudo sh
sudo apt install -y git
```

Let your user run Docker without `sudo`, then apply it (log out/in, or run `newgrp`):

```bash
sudo usermod -aG docker $USER
newgrp docker
```

Make sure Docker itself starts on boot (usually already enabled):

```bash
sudo systemctl enable --now docker
```

Verify:

```bash
docker --version
docker compose version
```

## Step 2 - Get the code

Put the project in `/opt/roost-hq` (a standard place for self-hosted services). Using
`/opt` keeps it out of a personal home folder and works well with the auto-start unit
below.

```bash
sudo mkdir -p /opt/roost-hq
sudo chown $USER:$USER /opt/roost-hq
git clone https://github.com/roosthq/<your-repo>.git /opt/roost-hq
cd /opt/roost-hq
```

(If you'd rather keep it in your home folder, `git clone ... ~/roost-hq` also works -
just use that path everywhere below, including in the systemd unit.)

## Step 3 - Configure `.env`

```bash
cp .env.example .env
```

Generate two strong secrets and paste them into `.env`:

```bash
echo "SESSION_SECRET=$(openssl rand -hex 32)"
echo "TOKEN_ENCRYPTION_KEY=$(openssl rand -hex 32)"
```

Then edit `.env` (`nano .env`) and set:

```
NODE_ENV=production
MYSQL_ROOT_PASSWORD=<pick a strong password>
MYSQL_PASSWORD=<pick a strong password>
DATABASE_URL="mysql://roosthq:<same MYSQL_PASSWORD>@db:3306/roosthq"
SESSION_SECRET=<from above>
TOKEN_ENCRYPTION_KEY=<from above>
WEB_URL=https://roost.yourdomain.com
GOOGLE_CLIENT_ID=<from step 4>
GOOGLE_CLIENT_SECRET=<from step 4>
GOOGLE_CALLBACK_URL=https://roost.yourdomain.com/api/auth/google/callback
VITE_API_BASE_URL=/api
CLOUDFLARE_TUNNEL_TOKEN=<from step 5>
```

## Step 4 - Google OAuth (one-time)

1. [Google Cloud Console](https://console.cloud.google.com/) → new project "Roost HQ".
2. **APIs & Services → Library** → enable **Google Calendar API**.
3. **OAuth consent screen** → External → **Testing**. Add every family member's Google
   address under **Test users** (Testing mode allows up to 100 users with no app
   verification - perfect for one family).
4. **Credentials → Create OAuth client ID → Web application.** Add Authorized redirect
   URIs:
   - `https://roost.yourdomain.com/api/auth/google/callback`
   - `http://localhost:3000/api/auth/google/callback` (for local testing)
5. Copy the Client ID + Secret into `.env`.

## Step 5 - Cloudflare Tunnel

1. Cloudflare dashboard → **Zero Trust → Networks → Tunnels → Create a tunnel →
   Cloudflared**. Name it `roost`.
2. Cloudflare asks you to choose an operating system / environment (Windows, Mac,
   Debian, Red Hat, **Docker**). Pick **Docker**. It shows a `docker run ...` command -
   **you do NOT run it.** You only need the token inside it: copy the long string that
   comes after `--token` (starts with `eyJ...`) and paste it into `.env`:
   ```
   CLOUDFLARE_TUNNEL_TOKEN=eyJhIjoi...<long string>...
   ```
   Our `docker-compose.prod.yml` already runs the connector with this token, so running
   Cloudflare's command yourself would just start a duplicate - skip it.
3. On the tunnel's **Public Hostname** tab, add:
   - Subdomain `roost`, your domain → `roost.yourdomain.com`
   - Service: **HTTP** → `caddy:80`

## Step 6 - Launch

```bash
cd /opt/roost-hq
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
# Create the database tables from the schema (first run):
docker compose exec server npx prisma db push
```

Open `https://roost.yourdomain.com` and sign in with Google. Family members can now
reach it from their phones anywhere.

## Step 7 - Auto-start on reboot

**The easy way (already done):** every container uses `restart: unless-stopped`, and
Docker itself is enabled on boot (step 1). So after any reboot or power loss, Docker
starts and brings the whole stack back up automatically. Nothing else required.

**Optional belt-and-suspenders (systemd):** if you want the VM to explicitly run
`docker compose up` at boot (handy if you ever `docker compose down` manually and want
it restored on reboot), install the included unit:

```bash
sudo cp /opt/roost-hq/deploy/roost-hq.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now roost-hq
```

Check it: `sudo systemctl status roost-hq`. (If you cloned somewhere other than
`/opt/roost-hq`, edit the `WorkingDirectory` in the unit first.)

## Step 8 - Kiosk (Raspberry Pi)

In the app (as owner): **Display access → Generate kiosk link**. You get
`https://roost.yourdomain.com/?display=1&token=...`. Point the Pi's browser at it - no
login, works over the internet.

## Step 9 - App updates from inside the app (optional)

Once this is set up, the owner account can check for and install updates from
**Settings → Instance → App updates** instead of SSHing in every time (the manual
`git pull` flow under **Day-to-day** below still always works too - this is optional,
not a replacement).

It's a separate, unpublished `updater` container that does the actual git/docker work
(see `PLANNING.md` #15 for the full design) - `server` only ever talks to it over the
internal Docker network, authenticated with a shared secret. Nobody outside the box
can reach it.

**Set these in `.env`:**

```bash
echo "UPDATE_SHARED_SECRET=$(openssl rand -hex 32)"
```

```bash
# Must match Step 2's clone path exactly:
HOST_REPO_PATH=/opt/roost-hq
# Absolute path to this VM user's own .ssh dir (already has whatever key
# makes plain `git pull` work today - the updater container reuses it
# rather than needing separate credentials of its own):
HOST_SSH_DIR=/home/YOUR_USER/.ssh
```

Find your actual `$HOME` first if unsure: `echo $HOME`.

**Then bring the new service up:**

```bash
cd /opt/roost-hq
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build updater server
```

That's it - **Settings → Instance → App updates** now works. Two channels:

| Channel | Source | Notes |
|---|---|---|
| Stable releases | Newest GitHub tag | Recommended - tested, versioned. |
| Main branch | Tip of `main` | Gets fixes sooner, less tested. |

Auto-check (daily, records what it finds) and auto-install (unattended, restarts the
whole app for the whole family - off by default even if auto-check is on) are both
under the same panel. There's one level of rollback: installing captures the commit
you were on first, so "Roll back to previous version" undoes exactly the most recent
install.

**If you're running your own fork**, point `UPDATE_REPO_URL` (and `UPDATE_BRANCH` if
not `main`) at it in `.env` - never editable from inside the app itself, on purpose
(see PLANNING.md #15 for why).

**Creating a release tag** (for the Stable channel to have something to find):

```bash
git tag v1.2.3
git push origin v1.2.3
```

Or use GitHub's UI: Releases → Draft a new release.

---

## Day-to-day

**Update to the latest code:**

```bash
cd /opt/roost-hq
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker compose exec server npx prisma db push
```

> If a pull **changed dependencies** (`package.json`), add `--renew-anon-volumes` to
> the `up` command so the container's `node_modules` volume is refreshed - otherwise
> Docker keeps the stale volume and new packages appear missing.

**View logs:** `docker compose logs -f`

**Back up the database:**

```bash
docker compose exec db mysqldump -u root -p roosthq > ~/roosthq-backup-$(date +%F).sql
```

**Reminders:**
- No router ports are opened - all traffic comes through the tunnel. Don't port-forward.
- Don't change `SESSION_SECRET` / `TOKEN_ENCRYPTION_KEY` after launch (it logs everyone
  out and invalidates stored Google tokens).
- Still a single-family app: only Google accounts you added as test users can sign in.
