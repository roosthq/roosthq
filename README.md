<div align="center">

<img src="web/public/logo-mark.svg" alt="Roost HQ" width="72" height="82">

# Roost HQ

**The family's home base** — a self-hosted calendar, chores, and rewards hub for a
Raspberry Pi wall display and everyone's phone.

[![License: AGPL v3](https://img.shields.io/badge/license-AGPL--3.0-4E7A4C.svg)](./LICENSE)
[![Self-hosted](https://img.shields.io/badge/deploy-self--hosted-4E7A4C.svg)](./DEPLOY.md)
[![Stack](https://img.shields.io/badge/stack-React%20%C2%B7%20NestJS%20%C2%B7%20MySQL-4E7A4C.svg)](#stack)

[Wiki](https://github.com/roosthq/roosthq/wiki) · [Quick start](#quick-start-development) · [Deploy guide](./DEPLOY.md) · [Kiosk setup](./KIOSK.md) · [Planning doc](./PLANNING.md)

</div>

---

Backed by shared Google Calendars (deduped across accounts) or fully local
calendars — no Google required. Self-hosted, single-family, open source
(AGPL-3.0). Each household runs its own instance; nobody else's data ever
touches it.

📖 **The [wiki](https://github.com/roosthq/roosthq/wiki) is the full user guide** —
one page per feature area, written for running the thing day to day. This README
covers running it as a *developer*; [`PLANNING.md`](./PLANNING.md) covers the
architecture, roadmap, and decisions log behind it.

## Contents

- [What's in it](#whats-in-it)
- [Stack](#stack)
- [Repo layout](#repo-layout)
- [Quick start (development)](#quick-start-development)
- [Google OAuth setup (optional)](#google-oauth-setup-optional)
- [Deploying for real](#deploying-for-real)
- [Kiosk (Raspberry Pi wall display)](#kiosk-raspberry-pi-wall-display)
- [API](#api)
- [Environment variables](#environment-variables)
- [License](#license)

## What's in it

| Area | Highlights |
|---|---|
| 📅 **Calendar** | Shared Google Calendars (deduped) and/or fully local calendars, month/2-week/1-week views, multi-day events, swipe navigation |
| ✅ **Chores** | Recurring (daily/weekly/monthly/custom), per-location, checklists, photo-proof, auto-approve, claimable "anyone" chores, streaks + streak freezes |
| 🪙 **Tokens** | Ledger-derived balances (never a stored number), manual adjustments with an audit trail, family-configurable token name/icon |
| 🎁 **Prizes & Store** | Kid-requested redemptions, adult approval, real price hidden from kids, item or event type, per-location scoping |
| 🏆 **Awards** | One-off recognitions with a note, optional bonus token wheel or streak-freeze grant |
| 📋 **Rules** | Shared and per-kid house rules, viewable from the app or the kiosk |
| 🎡 **Gamification** | Levels/XP, bonus spin wheels, weighted prize pools, chore races — all per-family toggles |
| 🏠 **Household widgets** | Meal plan, grocery list, countdowns, announcements — family-wide or per-house scoped |
| 📍 **Presence** | Home/away/vacation status per person, so a kid staying elsewhere doesn't lose a chore streak |
| 🔔 **Notifications** | In-app, push, and email, with per-adult control over which kid + which type goes to which channel |
| 👥 **Accounts** | Google OAuth and/or local username+password; kid accounts need no email at all |
| 🏘️ **Multi-family + ghosting** | An instance-owner role can manage several families and "ghost" into any account for support |
| 🖥️ **Kiosk (Pi touch display)** | Profile picker with live badges, PIN unlock, big touch targets, swipe carousels |
| 📱 **PWA + mobile** | Installable, bottom tab bar on phones, header-level pending-approvals indicator everywhere |
| 🔍 **Search** | One box across chores, events, notifications, rules, prizes, and awards |
| 🔄 **App updates** | Owner-only check/install/rollback from inside the app, with an optional daily auto-update |

See the [wiki](https://github.com/roosthq/roosthq/wiki) for how each of these actually works.

## Stack

- **Frontend:** React + Vite + TypeScript + Tailwind (`web/`)
- **Backend:** NestJS + TypeScript + Prisma (`server/`)
- **Database:** MySQL 8
- **Packaging:** Docker Compose
- **Auth:** Google OAuth 2.0 and/or local password auth; a short-lived kiosk token for
  the touch display, and a separate read-only display token for unattended kiosk boot

## Repo layout

```
.
├── docker-compose.yml       # app + MySQL, one-command local run
├── docker-compose.prod.yml  # prod overlay: Caddy, Cloudflare Tunnel, backups, updater
├── .env.example             # copy to .env and fill in
├── server/                  # NestJS API + Prisma
│   └── prisma/schema.prisma
├── web/                     # React + Vite frontend
├── updater/                 # tiny internal service behind the owner-only app-update feature
├── DEPLOY.md                # step-by-step VM + Cloudflare Tunnel deploy guide
├── KIOSK.md                 # step-by-step Raspberry Pi kiosk setup guide
└── PLANNING.md              # architecture, roadmap, and decisions log
```

## Quick start (development)

1. **Clone and configure**

   ```bash
   git clone https://github.com/roosthq/roosthq.git
   cd roosthq
   cp .env.example .env
   # edit .env with your Google OAuth credentials (see below, optional if you only
   # want local accounts) and a DB password
   ```

2. **Run with Docker Compose**

   ```bash
   docker compose up --build
   ```

   - API: http://localhost:3000 (all routes under `/api`; health at `/api/health`)
   - Web: http://localhost:5173 (calls the API at same-origin `/api` via the Vite proxy)
   - MySQL: localhost:3306

3. **Apply the database schema** (first run)

   ```bash
   docker compose exec server npx prisma db push
   ```

## Google OAuth setup (optional)

Google sign-in and Google Calendar sharing are optional. Local accounts (username +
password, including kid accounts with no email) work without any Google setup at all.
Skip this section entirely for a Google-free deployment.

Because Roost HQ is self-hosted, **you register your own Google OAuth client** if you
want Google features. There is no shared central app.

1. Go to the [Google Cloud Console](https://console.cloud.google.com/) and create a
   new project (e.g. "Roost HQ").
2. Enable the **Google Calendar API** under *APIs & Services → Library*.
3. Configure the **OAuth consent screen**:
   - User type: **External**, status **Testing** is fine for a household.
   - Add each family Google account under **Test users** (Testing mode caps at 100
     users and shows an "unverified app" notice — expected for self-hosting).
   - Scopes: `openid`, `email`, `profile`, and
     `https://www.googleapis.com/auth/calendar` (full read/write — the app both
     displays and creates/edits events).
4. Create an **OAuth client ID** (type: Web application):
   - Authorized redirect URI (dev): `http://localhost:3000/api/auth/google/callback`
   - Add the production URI too once deployed:
     `https://roost.yourdomain.com/api/auth/google/callback` (see [`DEPLOY.md`](./DEPLOY.md)).
5. Copy the **Client ID** and **Client Secret** into your `.env`
   (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`).

## Deploying for real

To reach Roost HQ from phones and other locations, deploy behind a **Cloudflare
Tunnel** (no open router ports, automatic HTTPS).

**[`DEPLOY.md`](./DEPLOY.md)** is a copy-paste, step-by-step guide covering: installing
Docker + git on a fresh Ubuntu VM, where to put the project (`/opt/roost-hq`),
generating secrets, the tunnel and Google setup, launching, auto-starting on reboot,
and (optionally) turning on in-app update checks/installs.

It's still a single-family-per-instance app. If you use Google sign-in, only accounts
you add as test users can sign in; local accounts have no such cap.

## Kiosk (Raspberry Pi wall display)

**[`KIOSK.md`](./KIOSK.md)** walks through turning a Pi + touchscreen into a
full-screen wall display: flashing the OS, autostart, keeping the screen awake,
rotation, touch-input quirks, recovering a stuck kiosk, and moving to new hardware.
The short version: **Settings → Touch displays → Display access → Generate kiosk
link**, then point the Pi's Chromium at the resulting URL — no login needed.

## API

Every feature area above has its own NestJS module under `server/src/<feature>/`
(`auth`, `calendars`, `chores`, `tokens`, `prizes`, `awards`, `rules`, `display`,
`family`, `locations`, `users`, `owner`, `presence`, `notifications`, `updates`,
`google`, …), each exposing routes under `/api/<feature>`. The route list has grown
too large to hand-maintain here without drifting out of date. Read the controller in
the relevant module for the exact routes, or `web/src/api.ts` for the client-side call
signatures the frontend actually uses.

## Environment variables

See [`.env.example`](./.env.example) for the full list. Never commit `.env`.

## License

AGPL-3.0. See [`LICENSE`](./LICENSE).

