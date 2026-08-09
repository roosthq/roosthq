# Roost HQ

The family's home base: a self-hosted calendar, chores, and rewards hub for a
Raspberry Pi touch display and mobile devices, backed by shared Google Calendars
(or fully local calendars, no Google required).

Self-hosted, single-family, open source (AGPL-3.0). Each household runs its own instance.

See [`PLANNING.md`](./PLANNING.md) for the full architecture, roadmap, and feature backlog.

## What's in it

- **Calendar:** shared Google Calendars (deduped) and/or fully local calendars, month/2-week/1-week
  views, multi-day event spanning, swipe navigation between periods.
- **Chores:** recurring (daily/weekly/monthly/custom), per-location, checklists, photo-proof,
  auto-approve, "claim it" (open-to-anyone) chores, streaks and streak freezes.
- **Tokens:** ledger-derived balances, manual adjustments with an audit trail, family-configurable
  token name/icon.
- **Prizes & Store:** kid-requested redemptions, adult approval, real price hidden from kids,
  item or event type.
- **Awards:** one-off recognitions with a note ("helped without asking"), visible to the kid who
  earned them, with an optional bonus token wheel.
- **Rules:** shared and per-kid house rules, viewable from the app or the kiosk.
- **Gamification:** levels/XP, bonus spin wheels, chore races, per-family toggle.
- **Household widgets:** meal plan, grocery list, countdowns, announcements; family-wide or
  per-house scoped.
- **Accounts:** Google OAuth and/or local username+password; kid accounts can be created without
  any email at all.
- **Multi-family + ghosting:** an app-owner role can manage several families and "ghost" into any
  account for support, with a persistent banner and a one-click way back.
- **Kiosk (Pi touch display):** profile picker with live token/level badges, PIN unlock,
  big touch targets, dinner-plan swipe carousel, and in-kiosk access to Rules and My Stats so a kid
  never has to leave the wall display.
- **PWA + mobile:** installable, bottom tab bar on phones, a header-level pending-approvals
  indicator visible on every page for both adults and kids.

## Stack

- **Frontend:** React + Vite + TypeScript + Tailwind (`web/`)
- **Backend:** NestJS + TypeScript + Prisma (`server/`)
- **Database:** MySQL 8
- **Packaging:** Docker Compose
- **Auth:** Google OAuth 2.0 and/or local password auth; a short-lived kiosk token for the touch
  display, and a separate read-only display token for unattended kiosk boot

## Repo layout

```
.
├── docker-compose.yml     # app + MySQL, one-command local run
├── .env.example           # copy to .env and fill in
├── server/                # NestJS API + Prisma
│   └── prisma/schema.prisma
├── web/                   # React + Vite frontend
└── PLANNING.md            # architecture, roadmap, and backlog
```

## Quick start (development)

1. **Clone and configure**

   ```bash
   git clone git@github.com:roosthq/<repo>.git
   cd <repo>
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
     users and shows an "unverified app" notice, expected for self-hosting).
   - Scopes: `openid`, `email`, `profile`, and
     `https://www.googleapis.com/auth/calendar` (full read/write, the app both
     displays and creates/edits events).
4. Create an **OAuth client ID** (type: Web application):
   - Authorized redirect URI (dev): `http://localhost:3000/api/auth/google/callback`
   - Add the production URI too once deployed:
     `https://roost.yourdomain.com/api/auth/google/callback` (see `DEPLOY.md`).
5. Copy the **Client ID** and **Client Secret** into your `.env`
   (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`).

## Deployment (internet access)

To reach Roost HQ from phones and other locations, deploy behind a **Cloudflare
Tunnel** (no open router ports, automatic HTTPS). **[`DEPLOY.md`](./DEPLOY.md) is a
copy-paste, step-by-step guide** covering: installing Docker + git on a fresh Ubuntu
VM, where to put the project (`/opt/roost-hq`), generating secrets, the tunnel and
Google setup, launching, and **auto-starting on reboot** (via Docker restart
policies, plus an optional systemd unit at [`deploy/roost-hq.service`](./deploy/roost-hq.service)).

It's still a single-family app. If you use Google sign-in, only accounts you add as
test users can sign in; local accounts have no such cap.

## API

Every feature area above has its own NestJS module under `server/src/<feature>/`
(`auth`, `calendars`, `chores`, `tokens`, `prizes`, `awards`, `rules`, `display`,
`family`, `locations`, `users`, `owner`, `google`), each exposing routes under
`/api/<feature>`. The route list has grown too large to hand-maintain here without
drifting out of date. Read the controller in the relevant module for the exact
routes, or `web/src/api.ts` for the client-side call signatures the frontend
actually uses.

Kiosk setup: in the app (as owner or family manager) open **Display access →
Generate kiosk link**, copy the URL, and point the Pi's browser at it. The link
looks like `https://<server>/?display=1&token=<token>` and needs no login. Revoke
anytime.

## Environment variables

See [`.env.example`](./.env.example) for the full list. Never commit `.env`.

## License

AGPL-3.0. See [`LICENSE`](./LICENSE).
