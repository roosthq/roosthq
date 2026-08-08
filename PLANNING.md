# Family Calendar System — Planning & Architecture

**Status:** Draft v0.1 · **Owner:** Casey · **Date:** 2026-07-13

This is the working plan for a **self-hosted, single-family, open-source** calendar +
chores + token/reward app, displayed on a Raspberry Pi touch screen and on
phones/tablets, backed by shared Google Calendars. Each family runs their own
instance; there is no central server holding other families' data.

---

## 1. Name

**Chosen: Roost HQ.** The family's home base — where everyone lands and checks in.

Availability notes (from a July 2026 search):
- No software product owns "RoostHQ." The bare word "Roost" is used by several
  unrelated products (a deposit app, a laptop stand, the ROOST safety nonprofit), but
  the "HQ" qualifier disambiguates cleanly.
- **Still to confirm before registering:** GitHub org handle (`roosthq`), npm scope
  (`@roosthq`), and a domain (`roosthq.app` / `.dev` recommended for a dev project).
- Suggested identifiers: repo/org `roosthq`, package scope `@roosthq/*`, product name
  displayed as "Roost HQ".

---

## 2. Scope decision (locked)

**Single-family, self-hosted, open source.** One instance for one family
(Docker on a Proxmox VM / home server). There is no multi-tenant SaaS and no central
database of other people's children.

**Internet-accessible for that one family.** The family spans multiple locations
(split household), so the instance is reachable from anywhere via a **Cloudflare
Tunnel** (TLS, no open router ports) — not LAN-only. This does *not* make it
multi-tenant: only Google accounts added as OAuth test users can sign in, so it stays
under Google's 100-user cap with no app verification, and COPPA still doesn't apply
(you're the data controller for your own children). See `DEPLOY.md`.

What this buys you:

- **COPPA largely does not apply.** COPPA governs *operators of online services who
  collect children's data*. A self-hosted app where a parent runs the server for their
  own household is closer to a family address book than a regulated service — the
  parent is the data controller for their own kids. You still ship a privacy note and
  make deletion easy, but there is no third-party consent regime to build.
- **No data-isolation burden.** One family per instance. No cross-tenant query
  scoping, no shared-DB leak risk.
- **Simpler auth.** Accounts are just the people in one household.

**Keep `family_id` in the schema anyway** (see §10). It's cheap, keeps the door open
to multi-family later, and costs nothing now — but it is not a v1 requirement.

Your remaining obligations are ordinary good hygiene, not compliance work:

- Encrypt Google OAuth tokens at rest; never log them.
- A clear "delete a person and their data" action.
- A short privacy/README note so self-hosters know what's stored and where.

---

## 3. Recommended stack

**Full-stack TypeScript.**

| Layer | Choice | Why |
|---|---|---|
| Frontend | React + Vite, TypeScript | SPA, works on Pi browser + mobile web |
| Styling | Tailwind CSS | Fast, responsive, good for touch layouts |
| Backend | Node + NestJS (or Express), TypeScript | One language end-to-end; shared types with frontend |
| DB | MySQL 8 | Fine for this workload (Postgres is a marginal upgrade, optional) |
| ORM | Prisma | Type-safe, migrations, works with MySQL |
| Realtime | SSE (or Socket.IO) | Push live updates to the touch display |
| Auth | Google OAuth 2.0 + app sessions (JWT or server sessions) | Calendar access + login in one |
| Packaging | **Docker Compose** (app + MySQL in one `docker compose up`) | The core self-host deliverable |
| Hosting | Self-hosted: home server, NAS, or the Pi itself | No cloud bill; runs on the LAN |

**Decided: Node/TypeScript.** One language across client and server, native real-time,
shared types, and it packages cleanly into a single Docker image for self-hosters.
(PHP was considered and set aside — its weak spots were exactly this app's real-time
and OAuth-refresh needs.)

**Mobile:** responsive web (PWA) first — installable, works on iOS/Android, no app
stores. Wrap in Capacitor later only if you need native push notifications.

---

## 4. Roles & accounts

- **Family** — the tenant. Everything belongs to one family.
- **Owner / main account** — full control; controls touch-display settings, manages
  members, handles data deletion.
- **Adult** — CRUD chores, approve chores, manage tokens/prizes, assign locations.
- **Kid** — completes chores, spends tokens, views assigned prizes. Kid accounts are
  linked to the family and may not have their own email (parent-managed login).
- **User switching** — the touch display and shared devices support fast profile
  switching (pick-a-face screen) rather than full logout/login. A per-profile PIN is
  optional for adults; kids can be no-PIN for convenience.

A person can be one login mapped to a role, or a managed profile with no independent
credentials (typical for younger kids).

---

## 5. Google Calendar integration

- **Self-host caveat:** each deployer registers their *own* Google Cloud project and
  OAuth client ID/secret, set via env vars. Document this in the README — it's the one
  non-obvious setup step. While the OAuth consent screen is unverified/in "testing",
  Google caps it at 100 users and shows an "unverified app" warning; that's fine for a
  household. Verification is only needed for public distribution.
- Each adult connects one or more Google accounts via OAuth (scope:
  `calendar.readonly` at minimum; `calendar.events` if the app should write events).
- On connect, list the user's calendars and let them choose which to **share** into
  the family.
- **Deduplication:** calendars are identified by their Google calendar ID; events by
  their iCalUID. If two family members share the same calendar, store it once and
  attribute the share to multiple users. Never render the same event twice.
- Show a count: "N calendars shared." Each viewer can toggle which shared calendars
  are visible in their view.
- **Event source of truth = Google.** The app reads/renders; it does not maintain its
  own separate event store (beyond caching + the sharing/visibility metadata). Chores
  and tokens are the app's *own* native data — keep that boundary clean.
- Sync strategy: use Google's incremental sync tokens + webhook push notifications
  (`watch`) rather than polling, to stay near-real-time and within quota.

---

## 6. Touch-display mode

- A dedicated, kiosk-style view for the Pi (fullscreen browser, auto-launch on boot).
- **Owner controls, editable on the fly:** default calendar(s) shown, which features
  appear (calendar / chores / tokens / prizes), theme, idle behavior.
- **Real-time updates:** the display holds an open SSE connection. When the owner
  changes a display setting from their phone, the server pushes the change and the
  display re-renders without a reload.
- ✅ Built: **display token** — owner mints a long-lived, revocable, read-only token
  (stored hashed) that the Pi carries in its kiosk URL (`?token=`). A flexible guard
  accepts either a user session or a display token on the read-only display routes
  (`/display/settings`, `/display/events`, `/display/stream`); all admin routes stay
  session/owner-only. This is what makes the Pi-as-thin-client architecture work.

---

## 7. Chores

- Assignable to any person (kid or adult).
- **Recurrence:** none (single), daily, weekly, bi-weekly, monthly, and custom
  (e.g., "every Tue/Thu", "first of month"). Model with an RRULE-style rule so custom
  cases are expressible without new code each time.
- **Location (split households):** a chore can carry an optional location. Adults are
  assigned a single location; kids can have multiple locations. When adding/viewing
  chores, a person only sees the locations available to them. This cleanly supports a
  kid who splits time between two homes sharing one family calendar.
- **Checklist / sub-tasks:** a chore can have an ordered checklist. Kids tick items
  off as they go; the chore isn't "done" until all required items are checked.
- **Token value** shown on each chore.
- **Completion flow:** kid marks complete → chore goes **Pending** → an adult approves
  → tokens awarded to the kid's balance. Rejection sends it back with an optional note.

---

## 8. Tokens

- Digital balance per kid is the source of truth.
- Adults can **rename the token** (default: "Tokens").
- Adults can **manually award or subtract** tokens with a required reason (audit log
  keeps every change: who, when, delta, reason, linked chore if any).
- **Physical tokens = reconciliation, not tracking.** The app cannot know how many
  coins are in a jar. Design for it:
  - On approval, the app prompts "hand over N tokens" and logs the digital award.
  - A **manual physical-adjustment action** lets an adult re-sync the digital balance
    to reality (lost, found, spent in person). This is the whole feature — make
    correcting the balance easy rather than pretending the software knows the count.

---

## 9. Prizes

- Adults add prizes kids can buy with tokens.
- Fields: name, description, image, URL/link, **real price**, **token cost**,
  scope (global vs. specific kids), and type (**item** or **event** — e.g., movie
  trip, an hour at Dave & Buster's).
- **Kids never see the real price** — it's stored but withheld from kid sessions.
- Kids see global prizes plus any prizes assigned specifically to them.
- **Auto-import from Amazon/Walmart/Target: not in v1.** There is no clean, free,
  ToS-compliant API for "paste a product → get price + image." Amazon's Product
  Advertising API needs an approved affiliate account with qualifying sales;
  Walmart/Target are gated. Scraping violates ToS and breaks constantly. Ship
  **manual entry with URL + image upload**, and revisit auto-fill as a someday-maybe.
- Redemption flow: kid requests → adult approves → tokens deducted → for events, mark
  scheduled/fulfilled.

---

## 10. Data model (first cut)

```
families            (id, name, owner_user_id, created_at)
users               (id, family_id, role, display_name, email?, pin_hash?, avatar)
locations           (id, family_id, name)
user_locations      (user_id, location_id)          -- kids: many; adults: one
google_accounts     (id, user_id, google_sub, tokens_encrypted)
calendars           (id, family_id, google_calendar_id, name, color)   -- dedup key: google_calendar_id
calendar_shares     (calendar_id, user_id)           -- who shared / who can see
display_settings    (family_id, default_calendar_ids, enabled_features, theme, ...)
chores              (id, family_id, title, assignee_user_id, location_id?, token_value,
                     recurrence_rule, status, created_by)
chore_checklist     (id, chore_id, label, sort, required)
chore_instances     (id, chore_id, due_date, status[open|pending|approved|rejected],
                     completed_at, approved_by)
chore_item_checks   (chore_instance_id, checklist_id, checked_at)
token_ledger        (id, user_id, delta, reason, type[chore|manual|physical|redeem],
                     ref_id?, created_by, created_at)
prizes              (id, family_id, name, description, image, url, real_price,
                     token_cost, type[item|event], scope[global|specific])
prize_assignments   (prize_id, user_id)              -- for scope=specific
redemptions         (id, prize_id, user_id, status, requested_at, approved_by)
```

Balance is derived from `token_ledger` (sum of deltas) — don't store a mutable
balance field; compute or cache it. This gives you a full audit trail for free.

---

## 11. Hygiene checklist (self-hosted)

No compliance regime applies to a self-hosted single-family instance, but do these
anyway — they're just good practice:

- [ ] Encrypt Google OAuth tokens at rest; never log them.
- [ ] "Delete a person and their data" action.
- [ ] Short README/privacy note: what's stored, where, and how to back it up/delete.
- [ ] No third-party ad/tracking SDKs anywhere.
- [ ] Sensible defaults for a LAN deployment (bind to local network, optional auth
      on the display device).

If you ever pivot to hosting instances for other families, COPPA and data-isolation
work come back — revisit §2 of the prior draft before doing that.

---

## 12. Phased roadmap

**Phase 0 — Foundations:** repo, license (see §13), Docker Compose (app + MySQL),
`.env.example`, README with Google OAuth setup steps, auth (Google OAuth + sessions),
family/user model.

**Phase 1 — Calendar core:** ✅ built and **live-verified 2026-07-14** on the real
deployment — Google OAuth login + multi-account connect, share/dedup calendars
(unique `[familyId, googleCalendarId]`), events aggregated and deduped by iCalUID,
read/write event CRUD, viewer visibility toggles, weekly list view. Confirmed against
a real family (2 users, 4 calendars, no duplicate events).

**Phase 2 — Touch display:** ✅ built and **live-verified** — kiosk view at
`/?display=1`, owner-controlled settings (default calendars, enabled features, theme),
live SSE updates (theme change on the owner's device pushed to the kiosk tab with zero
reload, confirmed). Also fixed the connect-account ambiguity: `mode=self` (add own
calendar) vs `mode=member` (add person). As of 2026-07-14 the signed-in kiosk view is
side-by-side, not stacked: the calendar shrinks (`Calendar` `size="compact"`) and a
sidebar (`ChoresPanel` `variant="today"`) shows that profile's token balance and only
the chores actionable *right now* (due today, or pending approval) — no page scroll
needed down to a 1024×768 kiosk. Below ~480px tall (e.g. the official Pi 7"
touchscreen) a 6-row month grid still doesn't fit; that's a hardware ceiling, not
solved by this pass — a week-view fallback for tiny screens is a future option.

**Phase 3 — Chores:** ✅ built and **live-verified** — CRUD, recurrence
(daily/weekly/biweekly/monthly + single), locations (adult single / kid multiple),
checklists with required-item gating, completion → pending → approval; approval
awards tokens and spawns the next instance. Confirmed the full kid-claims →
adult-approves loop end-to-end, including the once-per-period block.

**Phase 4 — Tokens:** ✅ built and **live-verified** — ledger-derived balances,
chore-approval awards, manual adjustment with a required reason (`POST
/tokens/adjust`), full audit trail. Physical-reconciliation UX and token rename are
still just an API (`PUT /family/settings`) with no dedicated "hand over tokens" prompt
in the UI yet.

**Phase 5 — Prizes:** ✅ built and **live-verified** — CRUD, global/specific scoping,
item/event types, real price hidden from kid sessions (confirmed the field is absent
from the API response entirely, not just masked), redeem → reject-with-refund and
redeem → fulfill both confirmed against the ledger.

**Phase 6 — Polish:** per-profile PINs ✅ built and **live-verified** (wrong-PIN
rejection, correct-PIN unlock, adults blocked from the kiosk until a PIN is set).
PWA install, notifications, and image uploads are **not built** — confirmed absent
from the code, not just untested.

### Bugs found and fixed during the 2026-07-14 live verification pass
- **Infinite polling loop** (`ChoresPanel`/`Display.tsx`): an unmemoized `client`
  object was reconstructed every render, destabilizing a `useCallback`/`useEffect`
  chain and hammering `/chores/balances` continuously — worst on the always-on kiosk.
  Fixed with `useMemo`.
- **Kiosk identity bug** (`server/src/auth/auth.guard.ts`): an ambient session cookie
  outranked the explicit `x-kiosk-token` header, so a kid's kiosk actions could
  silently run (or get rejected) as whoever's cookie happened to be in that browser
  instead of the profile actually selected. Real risk on any device also used for
  normal login (e.g. the owner's "Display ↗" preview link). Fixed by giving the kiosk
  header priority.
- Cleaned up 3 orphan `Family` rows left over from before the invite-based-joining fix
  (commit `1afea46`) — harmless but confusing junk data.

Prove the calendar loop works on the Pi before building the reward economy on top of
it. Because it's self-hosted, "shipping" a phase = tagging a release others can
`docker compose up`.

---

## 13. Open decisions

1. ~~Final name~~ → **Roost HQ** (GitHub org `roosthq` created).
2. ~~License~~ → **AGPL-3.0** (switched from MIT 2026-08-08, pre-publication; deters commercial rehosting while staying open source).
3. ~~Read vs. read/write Google Calendar~~ → **Read/write** (scope
   `.../auth/calendar`); Phase 1 implements event create/update/delete.
4. Target deploy hardware: run the app on the same Pi as the display, or a separate
   home server / NAS with the Pi as a thin display client? (Affects performance.)
5. Notifications channel: email, web push, or both?
6. Backup story for self-hosters (documented `mysqldump`, or a built-in export).
```
