# Roost HQ — Project Context for Claude Code

Self-hosted, single-family calendar + chores + rewards hub. Runs on a Proxmox Ubuntu
VM, reachable over the internet via Cloudflare Tunnel, with a Raspberry Pi kiosk as a
wall touch display. React + NestJS + Prisma + MySQL, Docker Compose. Open source (MIT).

> **State of the codebase:** built rapidly across many sessions. As of 2026-07-14,
> Phases 1–5 plus per-profile PINs were live-verified end-to-end against the real
> deployment (see `PLANNING.md` §12) — two real bugs found in that pass (an infinite
> polling loop, and a kiosk-identity/cookie-priority bug in `AuthGuard`) are fixed.
> This is Casey's test platform, not real family production use yet — mutations
> against it for testing don't need the caution a real production system would.
> New features still need their own verification pass; when something breaks, ask for
> `docker compose logs` output and fix from the actual error.

## Repo layout

```
server/            NestJS API (TypeScript, Prisma, MySQL)
  prisma/schema.prisma   the data model — source of truth
  src/<feature>/         one folder per module (auth, calendars, chores, tokens,
                         prizes, display, invites, users, family, locations, google)
web/               React + Vite + Tailwind (TypeScript)
  src/pages/             routed pages (Calendar dashboard, Chores, Store, Profiles, Settings)
  src/Display.tsx        the Pi kiosk view (?display=1)
  src/api.ts             all API calls + types; `choreClient(kioskToken?)` for kiosk actions
  public/logo-mark*.svg  pixel-owl brand marks (light/dark)
docker-compose.yml         dev services (db, server, web)
docker-compose.prod.yml    prod overlay (Caddy + cloudflared, builds web)
Caddyfile                  single-origin reverse proxy (/api -> server, / -> web)
DEPLOY.md                  full VM + Cloudflare Tunnel setup
PLANNING.md                architecture + roadmap + decisions log
```

## Architecture conventions (important)

- **Single origin.** API is served under `/api` (NestJS global prefix). The frontend
  calls relative `/api`; Caddy routes `/api`->server, `/`->web. Vite dev has a proxy
  for `/api`. Don't hardcode hosts.
- **Auth.** Google OAuth -> app session in an httpOnly cookie (`AuthGuard`). The kiosk
  acts as a selected profile via a short-lived **kiosk token** sent as `x-kiosk-token`
  (AuthGuard accepts it too). Read-only kiosk data uses a **display token** in `?token=`.
- **Theming.** CSS variables in `web/src/index.css` (`--bg`, `--surface`, `--text`,
  `--accent`, `--today`, `--surface-off`, etc.). Dark mode flips via
  `data-theme="dark"` on `<html>`. There is a **utility bridge** in index.css that
  remaps the Tailwind classes actually used (`bg-white`, `text-slate-*`, `border`,
  `bg-slate-800` -> accent) to tokens, plus base styles for form controls and a
  `.panel` class. Prefer using existing classes so the bridge themes them; new brand
  surfaces should use `.panel` / token vars.
- **Chores model.** A chore has `assignmentType` SPECIFIC (many `ChoreAssignee`) or
  ANYONE (claimable). Occurrences are `ChoreInstance` rows; `claimedByUserId` records
  who did it. Completion is blocked for future occurrences (enforces once-per-period);
  adults self-approve their own; approval awards tokens to the claimer and spawns the
  next occurrence. Token balances are **derived by summing `TokenLedger`** (never store
  a balance).
- **Displays.** `DisplayConfig` = a named kiosk layout (calendars, features, theme).
  Kiosk links (`DisplayToken.displayConfigId`) bind a Pi to one config, so different
  houses show different things.

## Running & deploying

**Local dev:** `docker compose up --build`, then `docker compose exec server npx prisma db push`.
API at :3000 (`/api/health`), web at :5173.

**Prod (on the VM, `/opt/roost-hq`):**
```bash
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build server web
docker compose exec server npx prisma db push
```
Full first-time setup (Docker install, Cloudflare Tunnel, Google OAuth) is in `DEPLOY.md`.

### Gotchas learned the hard way
- **Prisma + Alpine fails.** The server image is `node:20-slim` + `openssl` on purpose.
- **`prisma db push` may need `--accept-data-loss`** in the non-interactive container
  when a column/table changes.
- **Dependency changes need `--renew-anon-volumes`** on the `up` command, or Docker
  keeps a stale `node_modules` volume and new packages appear missing.
- **git must run natively on the user's machine**, not in any sandbox mounted over the
  Windows folder (file-locking fails). Use HTTPS remote or an SSH key registered on
  GitHub (public key on GitHub, not `authorized_keys`).
- **The build is `tsc && vite build`** — TypeScript errors fail the whole web build;
  read `docker compose logs web` for the exact file/line.
- Google OAuth is in **Testing** mode (100-user cap, 7-day token expiry). Publish the
  OAuth app to **Production** (unverified is fine for one family) for durable logins.

## Deploy target specifics
- Host: Proxmox Ubuntu VM, project at `/opt/roost-hq`, auto-starts via Docker restart
  policies (optional systemd unit in `deploy/roost-hq.service`).
- Public URL via Cloudflare Tunnel -> `caddy:80` (no open router ports). Redirect URI
  in Google must be `https://<host>/api/auth/google/callback`.
- Kiosk: Chromium on a Raspberry Pi pointed at `https://<host>/?display=1&token=<token>`.

## Working style the user prefers
- Be direct; lead with the most useful thing; flag risks honestly.
- After each code change, give a copy-paste `git commit` line.
- Verify by reading files / checking `docker compose logs`, not by assuming.
