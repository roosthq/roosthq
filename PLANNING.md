# Roost HQ: Planning & Architecture

**Status:** Living document, updated as features ship · **Owner:** Casey · **Last updated:** 2026-08-09

This is the working plan for a **self-hosted, single-family, open-source** calendar,
chores, and token/reward app, displayed on a Raspberry Pi touch screen and on
phones/tablets, backed by shared Google Calendars (or fully local calendars). Each
family runs their own instance; there is no central server holding other families' data.

---

## 1. Name

**Chosen: Roost HQ.** The family's home base, where everyone lands and checks in.

GitHub org `roosthq`, repo `roosthq/roosthq`, product name displayed as "Roost HQ".

---

## 2. Scope decision (locked)

**Single-family, self-hosted, open source.** One instance for one family (Docker on
a Proxmox VM or home server). There is no multi-tenant SaaS and no central database
of other people's children. (The app does have an app-owner role that can manage
several families under one deployment for support/hosting-on-behalf-of purposes; see
§12 Phase 7. That's an operational convenience for the person running the server, not
a SaaS offering.)

**Internet-accessible for that one family.** The family spans multiple locations
(split household), so the instance is reachable from anywhere via a **Cloudflare
Tunnel** (TLS, no open router ports), not LAN-only. This does not make it
multi-tenant: only Google accounts added as OAuth test users (or local accounts you
create) can sign in, so it stays under Google's 100-user cap with no app
verification needed, and COPPA still doesn't apply (you're the data controller for
your own children). See `DEPLOY.md`.

What this buys you:

- **COPPA largely does not apply.** COPPA governs operators of online services who
  collect children's data. A self-hosted app where a parent runs the server for
  their own household is closer to a family address book than a regulated service:
  the parent is the data controller for their own kids. You still ship a privacy
  note and make deletion easy, but there is no third-party consent regime to build.
- **No data-isolation burden.** One family per instance (or a handful, under one
  operator, for the app-owner case). No cross-tenant query scoping, no shared-DB leak
  risk beyond what the operator already controls.
- **Simpler auth.** Accounts are just the people in one household.

**Keep `familyId` in the schema anyway** (see §10). It's cheap, keeps the door open
to multi-family later, and costs nothing now.

Your remaining obligations are ordinary good hygiene, not compliance work:

- Encrypt Google OAuth tokens at rest; never log them.
- A clear "delete a person and their data" action.
- A short privacy/README note so self-hosters know what's stored and where.

---

## 3. Stack

**Full-stack TypeScript.**

| Layer | Choice | Why |
|---|---|---|
| Frontend | React + Vite, TypeScript | SPA, works on Pi browser + mobile web |
| Styling | Tailwind CSS | Fast, responsive, good for touch layouts |
| Backend | NestJS, TypeScript | One language end to end; shared types with frontend |
| DB | MySQL 8 | Fine for this workload |
| ORM | Prisma | Type-safe, migrations, works with MySQL |
| Realtime | SSE | Push live updates to the touch display |
| Auth | Google OAuth 2.0 and/or local password auth, app sessions | Calendar access + login, or Google-free |
| Packaging | Docker Compose (app + MySQL in one `docker compose up`) | The core self-host deliverable |
| Hosting | Self-hosted: home server, NAS, or the Pi itself | No cloud bill; runs on the LAN or a tunnel |

**Mobile:** responsive web (PWA), installable, works on iOS/Android, no app stores.
A bottom tab bar replaces the desktop nav below the tablet breakpoint.

---

## 4. Roles & accounts

- **Family:** the tenant. Everything belongs to one family.
- **App owner:** operates the deployment itself; can create/manage families and
  ghost into any account for support (see §12 Phase 7). Not a per-family role.
- **Owner / Family manager:** full control of one family: display settings, member
  management, data deletion. (Originally called "Owner"; renamed to Family Manager
  partway through so a family can have more than one, see §12 Phase 7.)
- **Adult:** CRUD chores, approve chores, manage tokens/prizes, assign locations.
- **Kid:** completes chores, spends tokens, views assigned prizes and awards, reads
  rules, checks their own stats. Kid accounts are linked to the family and don't need
  their own email (local account, parent-managed).
- **User switching:** the touch display and shared devices support fast profile
  switching (pick-a-face screen) rather than full logout/login. A per-profile PIN is
  optional for adults; kids can be no-PIN for convenience.

A person can be a full login mapped to a role (Google or local), or a managed profile
with no independent credentials (typical for younger kids).

- **"Self, or strictly senior" permission shape (2026-08):** several adult-only actions
  that touch another member's data - deleting a `TokenLedger` entry (a co-view charge,
  a manual adjustment, ...), managing a PIN, toggling `tokensDisabled` - use the same
  rule rather than a blanket owner/family-manager-only lock: allowed if the actor
  created the thing themselves, OR if the actor's role is strictly senior to the
  target's (owner over everyone else; family manager over adult/kid; plain adult over
  kid only). Never a kid, even one who technically "created" something (e.g. their own
  REDEEM spend) - that would just let them undo their own spending. See
  `tokens.service.deleteLedgerEntry` for the canonical version; `ProfilePage.tsx`'s
  `canDeleteLedgerEntry` mirrors it client-side just to decide whether to show the
  button - the server is still the real enforcement.

---

## 5. Google Calendar integration

- **Self-host caveat:** each deployer registers their own Google Cloud project and
  OAuth client ID/secret, set via env vars. Google features are entirely optional; a
  deployment can run local-accounts-only with local calendars and skip this.
- Each adult connects one or more Google accounts via OAuth (scope: full calendar
  read/write, since the app both displays and creates/edits events).
- On connect, list the user's calendars and let them choose which to **share** into
  the family.
- **Deduplication:** calendars are identified by their Google calendar ID; events by
  their iCalUID. If two family members share the same calendar, store it once and
  attribute the share to multiple users. Never render the same event twice.
- **Local calendars** exist alongside Google ones (see §12 Phase 8): a family can
  create its own calendar with no Google account involved at all, with multi-day and
  timed events and its own notification pipeline.
- **Event source of truth for Google calendars = Google.** The app reads/renders; it
  does not maintain its own separate event store for those (beyond caching and
  sharing/visibility metadata). Local calendars are the app's own native data, same
  boundary as chores and tokens.

---

## 6. Touch-display mode (kiosk)

- A dedicated, kiosk-style view for the Pi (fullscreen browser, auto-launch on boot).
- **Owner/manager controls, editable on the fly:** default calendar(s) shown, which
  features appear, theme, per-house `DisplayConfig` (different houses can show
  different things off one kiosk link scheme).
- **Real-time updates:** the display holds an open SSE connection. When an owner
  changes a display setting from their phone, the server pushes the change and the
  display re-renders without a reload.
- **Display token**: owner/manager mints a long-lived, revocable, read-only token
  (stored hashed) that the Pi carries in its kiosk URL (`?token=`). A flexible guard
  accepts either a user session or a display token on the read-only display routes;
  admin routes stay session/owner-only.
- **Kiosk profile ("switch/lock") auth**: a selected profile on the kiosk authenticates
  with a short-lived kiosk token (`x-kiosk-token` header), not a cookie session. Any
  endpoint behind the standard auth guard already works from the kiosk once the
  client-side API call forwards that token, so kiosk feature parity with the main app
  is mostly a client-side wiring question, not a new backend surface.
- **Kid-facing kiosk parity (2026-08 pass):** kids can open Rules and a stats modal
  (balance, earned, spent, best streak, level, awards with notes) directly from the
  kiosk, not just the main app. All kiosk buttons, checkboxes, and radios use enlarged
  touch targets (`.kiosk-mode` CSS bridge) so small hands on a wall-mounted tablet
  don't mis-tap. Household widgets (dinner plan, etc.) use a shared swipe-carousel
  hook (`useWeekSwipe`) for left/right week navigation, both on the kiosk and in the
  main app.

---

## 7. Chores

- Assignable to a specific person, several specific people, or open to anyone
  (first-claimer wins; "race" chores can pay a bonus for it).
- **Recurrence:** none (single), daily, weekly, bi-weekly, monthly, multi-day (e.g.
  Mon-Fri), and custom rules.
- **Location (split households):** a chore can carry an optional location. Adults are
  assigned a single location; kids can have multiple. This supports a kid who splits
  time between two homes sharing one family calendar.
- **Checklist / sub-tasks:** a chore can have an ordered checklist; the chore isn't
  done until required items are checked.
- **Photo proof:** a chore can require a photo attached before it counts as complete.
- **Auto-approve:** a family or a specific chore can skip the adult-approval step.
- **Due-by time**, escalating due-soon notifications, and streaks (with a streak
  freeze option) all layer on top of the base completion flow.
- **Token value** shown on each chore.
- **Completion flow:** kid marks complete, chore goes Pending, an adult approves,
  tokens award to the kid's balance. Rejection sends it back with an optional note.
  Adults self-approve their own chores.

---

## 8. Tokens

- Digital balance per person, always **derived from the ledger** (sum of deltas),
  never stored as a mutable field.
- Adults can rename the token and pick its icon.
- Adults can manually award or subtract tokens with a required reason (audit log
  keeps every change: who, when, delta, reason, linked chore/award if any).
- **Physical tokens are reconciliation, not tracking.** The app cannot know how many
  coins are in a jar: on approval it logs the digital award, and a manual
  physical-adjustment action lets an adult re-sync the digital balance to reality.

---

## 9. Prizes, Awards, and Rules

- **Prizes/Store:** adults add prizes kids can buy with tokens. Fields: name,
  description, image, URL, real price, token cost, scope (global vs. specific kids),
  type (item or event). Kids never see the real price. Redemption flow: kid
  requests, adult approves, tokens deducted; events can be marked scheduled/fulfilled.
- **Awards:** one-off recognitions an adult grants (not tied to a recurring chore),
  each with an optional note ("helped without asking"), visible to the kid who earned
  it alongside their other stats. An award can carry a bonus token wheel spin.
- **Rules:** shared house rules and per-kid rules, adult-managed, viewable by
  everyone (including from the kiosk).
- **Co-viewing fairness (2026-08):** a shared-resource prize (screen time,
  movie night) lets a sibling watch/use it alongside whoever actually paid,
  for free - the real unfairness is that the sibling's own daily screen-time
  cap (see §8) never gets touched, not just that nobody paid twice. Solved as
  an adult action on a `FULFILLED` `Redemption`, not a new `Prize.type`:
  co-viewing is about who *consumes* a redemption, orthogonal to what the
  prize *is*. "+ Charge a co-viewer" in the prize's Purchase history (Store
  page, adults only) lets an adult retroactively debit another member the
  same `tokenCost` as the prize itself (not a discount - a cheaper co-view
  rate would let siblings launder screen time around their own cap) via a
  `CO_VIEW` `TokenLedger` entry (`refId` = the redemption). No real-time
  session/"who's in the room" tracking - still relies on an adult noticing,
  same as any other house rule. Deliberately kept off the kiosk's kid-facing
  `PrizesPanel` (that view is read-and-redeem only by design) and off the
  pending-redemption indicators - it lives only in the adult Store/Prizes
  admin view, same place as Edit/Delete/Fulfill.
  - **Historical spend, not current price:** a redemption's "tokens spent"
    is read back from its own `REDEEM` ledger entry's `delta` (negative
    entries only, so a later refund's positive entry doesn't cancel it out),
    never from `Prize.tokenCost` - that's the prize's *current* price and
    silently drifts if it's changed since. No new column: the ledger entry
    created at redeem() time already IS the historical record, same "derive,
    don't duplicate" rule as balances (§8). A #5 reward-game win has no
    REDEEM entry at all (never spent anything) and correctly shows 0.
  - **Grouped purchase history:** the Store page's per-prize history
    collapses same person + same calendar day + same status (+ same
    used/not-used, for an EVENT, so "mark as used" toggling the group stays
    unambiguous) into one row - a repeatable prize bought several times in a
    day would otherwise flood the list. Shows the purchase count and the
    summed spend for the group. Grouping is display-only, done client-side
    in `Prize.tsx` - the server's `redemptions()` still returns raw
    ungrouped rows, since StorePage's pending/eventsToFulfill queues need to
    act on each real redemption individually. Existing co-view charges are
    shown un-collapsed across the whole group (not just the one purchase a
    charge happens to be linked to) specifically so a second adult sees
    "already charged Freddy" before charging again themselves.

---

## 10. Data model (representative, not exhaustive)

The schema has grown well past this first cut; `server/prisma/schema.prisma` is the
actual source of truth. The shape that matters for understanding the app:

```
families            (id, name, disabledFeatures, ...)
users               (id, familyId, role, displayName, email?, passwordHash?, pinHash?, avatar)
locations           (id, familyId, name)
userLocations       (userId, locationId)              -- kids: many; adults: one
googleAccounts      (id, userId, googleSub, tokensEncrypted)
calendars           (id, familyId, googleCalendarId?, name, color)   -- local calendars have no googleCalendarId
displayConfig       (id, familyId, name, defaultCalendarIds, enabledFeatures, theme, ...)
displayToken        (id, familyId, tokenHash, displayConfigId?, revokedAt?)
chores              (id, familyId, title, assignmentType[specific|anyone], locationId?,
                     tokenValue, recurrenceRule, createdBy)
choreAssignee       (choreId, userId)
choreInstance       (id, choreId, dueDate, status[open|pending|approved|rejected],
                     claimedByUserId?, completedAt, approvedBy, currentStreak)
tokenLedger         (id, userId, delta, reason, type, refId?, createdBy, createdAt)
prizes              (id, familyId, name, realPrice, tokenCost, type[item|event], scope)
redemptions         (id, prizeId, userId, status, requestedAt, approvedBy)
awards              (id, familyId, name, icon, description, bonusWheel?)
awardGrant          (id, awardId, userId, note?, createdAt)
rules               (id, familyId, text, targetUserId?)
```

Balance is derived from `tokenLedger`, giving a full audit trail for free.

---

## 11. Hygiene checklist (self-hosted)

No compliance regime applies to a self-hosted single-family instance, but do these
anyway, they're just good practice:

- [x] Encrypt Google OAuth tokens at rest; never log them.
- [ ] "Delete a person and their data" action (partial: profile edit exists; a full
      family-member delete with data cleanup is not yet built).
- [x] Short README/privacy note: what's stored, where.
- [x] Nightly `mysqldump` backups (prod overlay `backup` sidecar), pruned by
      `BACKUP_RETENTION_DAYS`.
- [x] No third-party ad/tracking SDKs anywhere.

---

## 12. Roadmap (phases, in build order)

**Phase 0: Foundations.** Repo, license, Docker Compose (app + MySQL), `.env.example`,
README with Google OAuth setup steps, auth (Google OAuth + sessions), family/user model.

**Phase 1: Calendar core.** Built and live-verified 2026-07-14 on the real deployment:
Google OAuth login + multi-account connect, share/dedup calendars, events aggregated
and deduped by iCalUID, read/write event CRUD, viewer visibility toggles, weekly list
view.

**Phase 2: Touch display.** Built and live-verified: kiosk view at `/?display=1`,
owner-controlled settings, live SSE updates. Signed-in kiosk view is side-by-side
(compact calendar + a "today" chores sidebar) so a 1024x768 kiosk needs no scroll.

**Phase 3: Chores.** Built and live-verified: CRUD, recurrence, locations, checklists
with required-item gating, completion → pending → approval, once-per-period block.

**Phase 4: Tokens.** Built and live-verified: ledger-derived balances, chore-approval
awards, manual adjustment with a required reason, full audit trail.

**Phase 5: Prizes.** Built and live-verified: CRUD, global/specific scoping,
item/event types, real price hidden from kid sessions, redeem → reject-with-refund
and redeem → fulfill both confirmed against the ledger.

**Phase 6: Polish round 1.** Per-profile PINs built and live-verified (wrong-PIN
rejection, correct-PIN unlock, adults blocked from the kiosk until a PIN is set).

**Phase 7: Multi-family + ghosting.** App-owner role, multi-family management,
app-owner "ghost into a family or specific account" for support, with a persistent
"Ghosting as X" banner and a one-click way back. `Owner` role renamed to
`FAMILY_MANAGER` so a family can have more than one. Kiosk touch-swipe pagination
fixed.

**Phase 8: Local accounts + local calendars.** Password auth alongside Google OAuth;
kid account creation from Settings needs no Google account or email at all. Local
calendars (model, CRUD, multiple calendars per family, no Google dependency) with
their own event notification pipeline.

**Phase 9: Rules & Awards.** Rules page (shared and per-kid). Awards system with a
default token value, adjustable per-grant amount, a history view, and remove-awarded
support. Token history gained delete-entry and reveal-awarder/approver for adults.

**Phase 10: Chore depth.** Due-by time, escalating due-soon notifications, multi-day
chore scheduling (e.g. Mon-Fri), household-scoped kid task views, auto-approve option.

**Phase 11: Public site + hosting.** Built `roosthq-website` (marketing/contact site,
separate repo) and stood up `roosthq.org` on Lightsail.

**Phase 12: Mobile + PWA.** Installable PWA manifest, bottom tab bar on phones,
profile/family cards shrunk globally for smaller screens, kid task grouping
(today-first) with streak sparklines on the profile page.

**Phase 13: Household widgets + gamification.** Meal plan, grocery list, countdowns,
and announcements (family-wide or per-house scoped). Levels/XP, streak freeze, bonus
spin wheel, chore races, all gated behind a per-family feature-flag/toggle
infrastructure (`Family.disabledFeatures`, default-on for new features).

**Phase 14: Photo proof + simple mode + more polish.** Photo-proof chores, a
simplified "My Day" view for younger kids, bedtime mode, a weekly digest, allowance,
starter packs for chores/prizes, completion celebrations and kiosk sounds, an
approval inbox for adults, self-managed birthdays for non-kid members.

**Phase 15: Test fixture + mobile audit.** Built a permanent Test Family fixture
(fixed IDs, PINs, seeded chores/prizes/awards/rules/meals) so every future change has
a safe, repeatable place to verify without touching the real family's data. Full
mobile audit and fixes across every page and role.

**Phase 16 (2026-08-09): Kiosk kid-parity + cross-cutting fixes.** This pass:
- Fixed a ghosting-banner bug: profile edits while ghosted were dropping the
  `ghostedBy` claim (a controller wasn't threading it through), silently ending the
  banner without ending the actual ghost session. Fixed server-side and client-side
  (merge instead of replace on profile update).
- Dinner-plan list enlarged and made swipe-navigable (carousel-style, shared
  `useWeekSwipe` hook) on the kiosk and in the main app.
- Kiosk token/level badges on the profile picker now refresh live off the existing
  SSE stream instead of only on next full reload.
- All kiosk buttons, checkboxes, and radios enlarged for small hands on a touch
  display (`.kiosk-mode` CSS bridge).
- Kids can now open Rules and a stats modal (balance, earned, spent, streak, level,
  awards with notes) from the kiosk itself, not just the main app; award notes are
  now visible to kids (not just adults) on the profile page and in the kiosk stats
  modal.
- A pending-approvals indicator is now visible in the header on every page, for both
  adults (with inline approve/reject/fulfill actions) and kids (read-only), using a
  new lightweight `rhq:data-refresh` pub/sub event so it (and the chores panel) stay
  current without a manual reload.
- The header logo is now a link back to the app's home page.
- Found and fixed a real data-integrity gap while verifying the above: minting a
  display token never checked that the `displayConfigId` you passed actually belonged
  to your own family, so a cross-family token could silently get created. Ownership
  is now checked at mint time.

---

## 13. Open decisions

1. ~~Final name~~ → **Roost HQ** (GitHub org `roosthq` created).
2. ~~License~~ → **AGPL-3.0** (switched from MIT 2026-08-08, pre-publication; deters
   commercial rehosting while staying open source).
3. ~~Read vs. read/write Google Calendar~~ → **Read/write**.
4. ~~Target deploy hardware~~ → **separate home server (Proxmox Ubuntu VM)**, Pi runs
   only the kiosk browser as a thin display client.
5. ~~Backup story~~ → **nightly `mysqldump` sidecar**, pruned by `BACKUP_RETENTION_DAYS`
   (see §11). A family-pullable export (not just an operator-only VM backup) is on
   the backlog, §14.
6. Notifications channel: in-app notifications (with a weekly digest) are built.
   Email or web push for off-device alerts is not decided or built.

---

## 14. Feature backlog (not yet built)

Pulled from Casey's own list plus suggestions made alongside it. Nothing in this
section is built; check here before picking the next batch of work.

1. **Out-to-eat picker.** Adults maintain a list of places the family likes; a
   meal-plan day can be marked "Out" instead of a dish name, optionally spinning a
   wheel to pick where. Likely reuses the existing wheel-spin fairness pattern
   (server rolls the pick, client is theater), weighted away from recent picks.
2. **More sound options.** Per-action sound choice (chore complete, approval,
   redemption, wheel spin, notification), not just one on/off toggle. A small curated
   set with preview, stored per-user and on `DisplayConfig` for the kiosk.
3. **Real emoji/icon picker.** One shared searchable component (name/keyword search,
   recent-use row) to replace the curated-grid-or-raw-text icon fields used for
   awards, prizes, calendars, announcements, and countdowns.
4. **New-family defaults need verification.** Nobody has confirmed a brand-new family
   doesn't look empty/broken on first login. Wants an explicit "new family checklist"
   and a first-run banner flagging anything still unset.
5. **Award packages.** Curated bundles an owner/adult can import in one click,
   mirroring how chore starter packs already work.
6. **Design pass.** Current look reads flat; wants gradients, shadows, more depth.
   Needs to route through the existing CSS-variable theme tokens (not hardcoded
   colors) so it still holds up across every color theme and both light/dark modes,
   with the same page-by-page mobile-verification rigor as the last mobile audit.
7. **More varied kid reward interactions.** Not just the wheel every time: mystery
   box (pick 1 of several), scratch-off card, milestone "crates," slot-machine style.
   Keep the server-rolls/client-displays fairness rule for every mechanic; consider
   rotating which mechanic is active so kids don't even pick the flavor.
8. **Adult+ "Dashboard" page.** New primary landing page for adults, replacing
   Calendar as the header/logo click target. Calendar stays reachable as its own nav
   item. Move the family-links styling currently on the Calendar page to the Profiles
   page. Kids may want their own dashboard, possibly with a leaderboard (needs a
   family-manager toggle and a fair ranking metric, not just raw token balance).
9. **Level-up celebration.** On-screen, dynamic celebration when a kid crosses a
   level threshold, shown on the kiosk and in the app the next time either is opened
   or switched to (an "unseen level-up" flag per user, similar to the existing
   unseen-notification pattern, reusing the existing chore-completion
   celebration/confetti plumbing).
10. **Family-manager-togglable "mystery box" leveling gamification.** Optional
    (default off) feature where leveling up can award a mystery box with real and/or
    virtual chance-style prizes. The leveling-specific case of item 7; same fairness
    rule, gated behind `Family.disabledFeatures`, with a manager-configured prize
    pool mixing real `Prize` rows and virtual-only chance items.

**Other suggestions, independent of the above, for when there's room:**
- Recipe linking for the meal plan (ties into item 1).
- In-app data export for a family (today, backups are operator-only `mysqldump` on
  the VM).
- Search across chores/calendar/notifications; nothing is findable once history grows.
- A printable/agenda view of the week for a fridge printout (today this only really
  works via the kiosk).
- A rare, unscheduled tiny "surprise" reward every so often (variable-ratio
  reinforcement), same fairness pattern as item 7, server-triggered instead of
  goal-triggered.

---

## 15. App updates (owner feature)

**Built 2026-08-21**, feature-parity target was nomad-eye's own OTA-update system per
Casey's request - see `updater/`, `server/src/updates/`, `web/src/UpdatesPanel.tsx`,
and DEPLOY.md Step 9. Gated on the literal `OWNER` role only (not `FAMILY_MANAGER`),
per explicit instruction, same tier as `OwnerService`'s own `assertOwner`. Lets the
instance owner see what version is running, check for a newer one, and update -
manually or automatically - without SSHing into the VM. Two release channels:
**Stable** (tagged releases) and **Latest** (tip of a branch). The repo it updates
FROM is configurable via env var (so a self-hoster running their own fork points at
that instead), default to the real roosthq/roosthq repo. Casey's own repo still needs
to go public before this has "full access to it like that" - see the repo-visibility
note below for what that actually gates and what it doesn't.

Deviations from the original design plan below, and why:
- No async job-id endpoint (`GET /update/:jobId`) - one global in-progress/last-result
  status, same as nomad-eye's own updater, is simpler and this is a single-instance
  service where only one update ever runs at a time anyway.
- Auto-check runs on an hourly `@Interval` that compares the current hour against the
  owner-configured `autoCheckHour`, rather than a cron expression rebuilt at runtime
  (NestJS's `@Cron` wants a fixed expression; the hour itself is a DB-backed setting).
- `InstanceSettings.lastUpdateResult`/`previousCommit` persist in the DB (nomad-eye
  deliberately keeps none of this across a restart) - worth the small extra state for
  the one-level rollback capability the original plan actually asked for.

### Why this is scarier than a normal feature

Updating yourself means: pull new code from a remote, then rebuild and restart the
whole stack. That's arbitrary code execution by design - it's what "update" IS. Every
design choice below is trying to keep that power (a) owner-only, (b) not reachable
from outside the box, and (c) not something a compromised in-app session can quietly
redirect at a malicious repo. Treat those three as harder requirements than anything
else in this plan.

### Where the actual git/docker work happens

The `server` container can't just run `git pull && docker compose up --build` on
itself - it doesn't have the host's repo checkout or `docker.sock`, and giving the
main app container either of those is a much bigger blast radius than this feature
needs. Instead: a small dedicated **`updater` service**, new in `docker-compose.prod.yml`
only (no reason to run it in dev):

- Mounts the host repo directory (bind mount, same path `server`/`web` already build
  from) and `/var/run/docker.sock`.
- Tiny HTTP API, **not published** in the compose file - reachable only from `server`
  over the internal Docker network (`http://updater:PORT`), never from outside.
- Every request requires a shared-secret bearer token (`UPDATE_SHARED_SECRET` env var,
  same value given to both `server` and `updater`) - belt-and-suspenders on top of
  "not published," in case anything else ever lands on that network.
- Endpoints (rough):
  - `GET /version` - `git rev-parse HEAD` + `git describe --tags --exact-match`
    (null if not exactly on a tag) + working-tree-dirty check, read live off the
    actual checkout (more honest than baking a version string into the image at
    build time, which can drift if server/web ever get built at slightly different
    moments).
  - `GET /check?channel=stable|latest` - see below.
  - `POST /update` `{channel, ref}` - fetch, checkout, `docker compose up -d --build`,
    returns a job id; long-running, so async (poll or SSE), not a blocking request.
  - `GET /update/:jobId` - status + tailed output, so a failed pull/build is
    debuggable from the UI instead of "it just didn't come back."

`server` gets a new owner-only module (`updates/`) that's a thin authenticated proxy
in front of `updater` - same `assertInstanceOwner`-style gate `OwnerService`/
`HolidaysService` already use, nothing new to invent there.

### Channel checks: plain git, not the GitHub API

Recommend `git ls-remote` over the GitHub REST API for "what's the latest available":

- Stable: `git ls-remote --tags --sort=-v:refname <repo>`, take the top semver-looking
  tag.
- Latest: `git ls-remote <repo> refs/heads/<branch>` (branch from `UPDATE_BRANCH`,
  default `main`).

This works identically whether the repo is public or private (uses whatever git
credentials the VM already has configured per `DEPLOY.md`), needs no token, and has
no API rate limit to worry about. It's also exactly what a self-hoster's own private
fork needs too, so there's no special-case for "repo isn't public yet."

### The repo-visibility note, unpacked

Casey's flagged that the repo needs to be public before the app has "full access to
it like that." Worth separating two different things that could mean:

- **Git operations (fetch/pull/checkout)** - already work today regardless of
  visibility, using the VM's existing git credentials (SSH key or HTTPS token per
  `DEPLOY.md`). Nothing about *this feature* strictly requires the repo to be public.
- **A brand-new self-hoster cloning it for the first time** - THIS is where public
  matters: someone standing up their own instance from scratch needs to `git clone`
  without Casey's own credentials. That's a prerequisite for **distribution**, not for
  the update feature itself, but it's also clearly the actual point (an owner-facing
  updater feature is much less interesting if nobody outside Casey's own VM can use
  it) - so treat "make the repo public" as a parallel/prerequisite task, tracked
  against the existing licensing-relicense plan (`[[roosthq_licensing_plan]]`), not
  something this feature's design needs to work around.

### Config surface

- **Env vars only** (`.env`, not UI-editable): `UPDATE_REPO_URL` (default
  `https://github.com/roosthq/roosthq.git`), `UPDATE_BRANCH` (default `main`),
  `UPDATE_SHARED_SECRET`. Deliberately NOT a UI setting - if the source repo were
  editable from inside the app, a compromised owner session could repoint it at a
  malicious fork and then trigger an update, which is full remote code execution.
  Changing it requires host/SSH access, same trust tier as everything else in
  `DEPLOY.md`.
- **DB-backed, owner-editable in the UI**: selected channel (stable/latest),
  auto-update on/off, auto-update schedule (e.g. daily at a set hour). Small
  singleton-style settings, same shape as `AppSlotIcon`/`DisplaySettings` already in
  the schema - a new `InstanceSettings` table (or reuse a generic key-value one if it
  ever gets built for something else first) rather than a file the updater manages,
  so it round-trips through the normal API/DB/UI path everything else uses.

### Auto vs. manual

- **Manual** (v1, do this first): owner clicks "Check for updates" → shows current
  vs. latest for the selected channel → if newer, "Update now" (confirmed - this
  restarts the stack, brief downtime for the whole family) → progress/log view →
  done.
- **Auto** (v2, default OFF): a scheduled check (`@Cron`/`@Interval` in `server`,
  hitting `updater`'s `/check`). Recommend two independent toggles, not one:
  1. **Auto-check + notify** - safe default once auto is turned on at all: tells the
     owner a new version exists, doesn't touch anything.
  2. **Auto-apply** - actually runs the update unattended. This is the one that can
     surprise a family with a mid-evening restart or a broken update nobody's
     watching - gate it behind its own separate confirmation/toggle, off by default
     even if auto-check is on.
- Either way, surface it as an owner-facing in-app banner/indicator, not a
  family-wide `Notification` row - this is instance-level, not per-family, and
  doesn't fit the existing family-scoped notification model without stretching it.

### Safety net

- Before applying, capture the current commit so there's an explicit "roll back to
  previous version" one level deep - an update that boots into a broken state with no
  way back is much worse than not having auto-update at all.
- Run `prisma db push` as part of the same update job (matches the existing manual
  deploy flow in `CLAUDE.md`/`DEPLOY.md`) - flag this as the actual risky part of any
  update in the UI copy; a code update alone is safe to roll back, a schema change
  that already ran is not.
- Stretch goal, not v1: post-update health check (does `server` come back up within
  N seconds) with auto-rollback on failure.

### Rough build order

1. `updater` service (compose + minimal HTTP server + the four endpoints above).
2. `server`'s owner-only `updates` module proxying to it.
3. `InstanceSettings` table + API for channel/auto-update prefs.
4. Web: owner-only "Updates" panel (current version, channel picker, check/update
   buttons, log view) - same shape as `OwnerFamiliesPanel.tsx`.
5. Auto-check scheduler + owner-facing "update available" indicator.
6. Auto-apply toggle, gated separately as above.
7. `DEPLOY.md`: new env vars, and a note that a fresh self-hoster still needs the
   repo public (or their own credentials) to clone it at all - separate from whether
   this feature works, per the note above.
