# Roost HQ

The family's home base — a self-hosted calendar, chore, and reward hub designed for a
Raspberry Pi touch display and mobile devices, backed by shared Google Calendars.

Self-hosted, single-family, open source (MIT). Each household runs its own instance.

See [`PLANNING.md`](./PLANNING.md) for the full architecture and feature plan.

## Stack

- **Frontend:** React + Vite + TypeScript + Tailwind (`web/`)
- **Backend:** NestJS + TypeScript + Prisma (`server/`)
- **Database:** MySQL 8
- **Packaging:** Docker Compose
- **Auth / calendar:** Google OAuth 2.0

## Repo layout

```
.
├── docker-compose.yml     # app + MySQL, one-command local run
├── .env.example           # copy to .env and fill in
├── server/                # NestJS API + Prisma
│   └── prisma/schema.prisma
├── web/                   # React + Vite frontend
└── PLANNING.md            # architecture & roadmap
```

## Quick start (development)

1. **Clone and configure**

   ```bash
   git clone git@github.com:roosthq/<repo>.git
   cd <repo>
   cp .env.example .env
   # edit .env with your Google OAuth credentials (see below) and a DB password
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

## Google OAuth setup (required, one-time)

Because Roost HQ is self-hosted, **you register your own Google OAuth client** — there
is no shared central app.

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
     `https://roost.yourdomain.com/api/auth/google/callback` (see `DEPLOY.md`).
5. Copy the **Client ID** and **Client Secret** into your `.env`
   (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`).

## Deployment (internet access)

To reach Roost HQ from phones and other locations, deploy behind a **Cloudflare
Tunnel** (no open router ports, automatic HTTPS). **[`DEPLOY.md`](./DEPLOY.md) is a
copy-paste, step-by-step guide** covering: installing Docker + git on a fresh Ubuntu
VM, where to put the project (`/opt/roost-hq`), generating secrets, the tunnel + Google
setup, launching, and **auto-starting on reboot** (via Docker restart policies, plus an
optional systemd unit at [`deploy/roost-hq.service`](./deploy/roost-hq.service)).

It's still a single-family app — only Google accounts you add as test users can sign in.

## API endpoints (Phase 1)

All routes are served under the `/api` prefix (e.g. `GET /api/health`, `GET /api/auth/me`).

Auth:
- `GET /auth/google` — start Google consent flow.
- `GET /auth/google/callback` — OAuth callback; sets session cookie, redirects to web.
  If already signed in, links the new Google account into the current family.
- `GET /auth/me` — current signed-in user.
- `GET /auth/members` — all members of the family (for profile switching).
- `POST /auth/logout` — clear session.

Calendars:
- `GET /calendars/google` — calendars available on connected Google accounts (picker).
- `POST /calendars/share` — share selected calendars into the family (deduped).
- `GET /calendars` — shared calendars with share counts.
- `GET /calendars/events?calendarIds=a,b&start=ISO&end=ISO` — deduped events (by iCalUID).
- `POST /calendars/:calendarId/events` — create an event.
- `PATCH /calendars/:calendarId/events/:eventId` — update an event.
- `DELETE /calendars/:calendarId/events/:eventId` — delete an event.

Display (Phase 2):
- `GET /display/settings` — current display settings (session **or** display token).
- `GET /display/events` — this week's deduped events for the default calendars
  (session **or** display token; server resolves which calendars from settings).
- `GET /display/stream` — Server-Sent Events; pushes settings changes live to the
  kiosk (session **or** display token via `?token=`).
- `PUT /display/settings` — update settings (owner only): `defaultCalendarIds`,
  `enabledFeatures`, `theme`.

Display tokens (unattended kiosk auth, owner only):
- `POST /display/tokens` `{ label? }` — mint a token (raw value returned **once**).
- `GET /display/tokens` — list tokens (no raw values).
- `DELETE /display/tokens/:id` — revoke.

Kiosk setup: in the app (as owner) open **Display access → Generate kiosk link**, copy
the URL, and point the Pi's browser at it. The link looks like
`http://<server>:5173/?display=1&token=<token>` and needs no login. Revoke anytime.

Locations (Phase 3):
- `GET /locations`, `POST /locations`, `PATCH /locations/:id`, `DELETE /locations/:id`
- `POST /locations/:id/assign` `{ userId }`, `DELETE /locations/:id/users/:userId`

Chores & tokens (Phase 3):
- `GET /chores` (optional `?assigneeUserId=&locationId=`), `POST /chores`,
  `GET /chores/:id`, `PATCH /chores/:id`, `DELETE /chores/:id`
- `POST /chores/instances/:id/check` `{ checklistId, checked }`
- `POST /chores/instances/:id/complete` — kid marks done → pending
- `POST /chores/instances/:id/approve` — adult approves → awards tokens, spawns next
- `POST /chores/instances/:id/reject` — back to open
- `GET /chores/balances` — token balances per family member (derived from the ledger)

## Environment variables

See [`.env.example`](./.env.example) for the full list. Never commit `.env`.

## License

MIT — see [`LICENSE`](./LICENSE).
