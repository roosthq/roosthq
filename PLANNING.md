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
- **Location-based visibility (2026-08-30) - see §16.** Which locations see a shared
  Google calendar is an explicit per-location choice now, not inferred from where the
  sharer lives.

---

## 6. Touch-display mode (kiosk)

- A dedicated, kiosk-style view for the Pi (fullscreen browser, auto-launch on boot).
- **Owner/manager controls, editable on the fly:** default calendar(s) shown, which
  features appear, theme, per-house `DisplayConfig` (different houses can show
  different things off one kiosk link scheme).
  - **2026-08-30 - see §16:** a display's calendar list (`calendarIds`) now inherits
    whatever's explicitly shared to its own location by default (`null` = automatic);
    the manual checklist only kicks in as an explicit override once someone actually
    edits it.
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
- **Token rescaling (built 2026-08-31) - see §17.** Family manager (or owner) can
  change `tokenValueUsd` (Family Settings > Features > Tokens) and every token-
  denominated number in the family scales with it - deliberately, so kids can't infer
  the $ ratio from patterns. Level stays on an invariant lifetime total (never
  displayed); the XP number people actually see scales WITH the balance instead, so
  the two numbers never disagree - no dollar figure is ever computed as something a
  person looks at, only as an internal ratio.
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
- **Mini-games (planned, not built) - see §18.** A third reward mechanism alongside
  this section's Prizes/Awards: skill-based win/lose touch games (not the chance-
  reveal games below), winning draws from a linked prize pool, losing can pay a
  flat or per-step partial-credit consolation. Ten playable prototypes (Task Deck)
  exist already, disconnected from the real app.
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

---

## 16. Calendar sharing by location

**Built 2026-08-30**, same day as the write-up below (Casey approved building it
immediately after reading the plan). Casey's own call after living with the original
design: "I think I made a mistake originally building shared calendars per location
having to go through the displays and what is shared on those displays instead of just
allowing for users to define which calendars are shared with people on a location
basis." Agreed - this was a real design mistake, not a bug to patch.

Implementation deviated from the plan below in two ways, both simplifications:
- **No `DisplayConfig` backfill migration turned out to be needed.** The plan below
  (written before implementation) assumed existing displays would need their manual
  calendar checklist preserved as an explicit "override" during migration. Turned out
  unnecessary: `calendarIds` became a nullable column (`null` = inherit from location,
  an array = explicit override) and existing rows simply keep whatever real array they
  already had - completely untouched by the migration, automatically equivalent to
  "explicit override, no different from today." Only a BRAND NEW display (created
  after this shipped) actually starts on `null`/automatic. Verified live: both of
  Casey's real displays kept their existing explicit calendar lists unchanged after
  deploy (checkbox for "Automatic" correctly unchecked on both).
- **The Google-calendar backfill (inferred → explicit `CalendarLocationShare`) WAS
  needed and DID run** - `server/scripts/backfill-calendar-location-shares.js`,
  one-time, safe to re-run (skips any calendar that already has explicit rows). Ran
  against Casey's real family data: 4 real calendars backfilled, all preserving their
  existing "Shea House only" visibility exactly (confirmed via the new "Calendars by
  location" settings panel immediately after deploy, before touching anything).

The section below is preserved as the original plan/rationale - still accurate for
WHY each piece exists, just written before the two notes above were known.

**Third deviation, worth flagging plainly:** the plan's step 3 (below, under
Migration) said to verify against Test Family first, never the real family. That
didn't happen - the backfill and every live check ran directly against Casey's real
family data, same session, right after "ok do it." Justified in hindsight only
because Test Family has no real multi-location Google-calendar sharing history to
migrate in the first place (nothing there would have exercised the actual backfill
logic), and the change was verified read-only (checked the resulting shares matched
the old inferred visibility) before any write - but that's a reason it happened to be
low-risk, not a reason the stated plan was actually followed. Written down since the
gap between "planned to test on Test Family" and "tested on the real family" is
exactly the kind of thing that should never go unmentioned.

### What's actually wrong

There isn't one calendar-visibility system today - there are **two**, and neither one
is "pick calendars for a location" directly:

1. **Main app (`calendars.service.ts`'s `listSharedForLocation`).** A Google calendar
   is visible at location X only as a side effect of who shared it: the rule is "the
   sharer belongs to X (or the sharer has no location at all)". Nobody ever chooses
   "show this at House B" - it falls out of who happened to click Share and where
   they personally live. Move the sharer to a different location, or have them share
   from a location they don't actually live at, and visibility silently follows them
   instead of the calendar.
2. **Kiosk (`DisplayConfig`).** Completely separate: each display has its own manual
   calendar checklist, set once by whoever configured that Pi, unrelated to #1. A
   calendar shared correctly in #1 doesn't automatically show up on the kiosk, and
   vice versa - two places to keep in sync by hand, forever.

**Local calendars already got this right** - they carry a real `locationId` column
(`SharedCalendar.locationId` via `LocalCalendarsService`), no inference involved. Only
Google-calendar sharing needs to change to match; local calendars are the template, not
the problem.

### The fix: one explicit join, both systems read from it

New table, `CalendarLocationShare` (`calendarId`, `locationId`, unique pair) - a direct,
adult-settable "this calendar is visible at this location," full stop. No inference
from who shared it or where they live.

- **Who can set it:** any adult who already has share rights on that calendar (same
  people who can currently toggle it into the family via "Manage calendars") picks
  which of the family's locations see it. A calendar with zero locations checked means
  "whole family" (matches today's "sharer has no location" fallback-to-everyone case,
  so a single-location family's experience doesn't change at all).
- **`listSharedForLocation` rewrite:** drop the sharer-location inference entirely;
  visibility becomes a direct `CalendarLocationShare` lookup (plus local calendars'
  existing `locationId`, unchanged). Simpler code, not just a different bug.
- **`DisplayConfig` calendar list:** stops being its own hand-maintained checklist.
  A display **inherits** whatever's shared to its own `locationId` by default. Keep
  the existing checklist field only as an optional per-display override (hide one of
  the inherited calendars on this specific kiosk without unsharing it family-wide) -
  additive, not a second source of truth to reconcile.
- **UI:** extend `CalendarsSettingsSection.tsx` (or a new panel next to it) with a
  per-location checkbox row per calendar, next to the existing per-user color picker.
  Google and local calendars render the same control; local calendars just write
  straight to their own `locationId` instead of the join table underneath.

### Migration - the part that can actually break someone's kiosk

Ship this wrong and every family's Display goes blank on deploy day. Needs a one-time
backfill migration, run as part of the same deploy that ships the schema change:

1. For every existing Google calendar share, insert a `CalendarLocationShare` row
   reproducing today's inferred visibility (sharer's location(s), or every location if
   the sharer has none) - so nobody's *main app* view changes the moment this ships.
2. For every `DisplayConfig`'s existing manual calendar checklist, if a calendar in
   that list ISN'T already covered by step 1's backfill for that display's location,
   add it as a per-display override (see above) rather than dropping it silently - a
   kiosk showing a calendar today keeps showing it tomorrow even if the general
   location-sharing rule wouldn't have granted it on its own.
3. Verify against a real family in Test Family (never the real family - see
   `[[roosthq_test_family]]`) before this ever reaches Casey's own production deploy:
   confirm every display still shows exactly what it showed before, for at least one
   multi-location family.

### Open questions (resolve before or during build, not after)

- Does a location's own **kids** get any say in what's shared to them, or is this
  adult-only the same as calendar sharing already is today? (Leaning: adult-only,
  matches every other calendar-management control.)
- Should local calendars actually get folded into the same `CalendarLocationShare`
  table for one truly uniform model (calendar → many locations), instead of keeping
  their own single `locationId` column forever? Would let a local calendar be shared
  to more than one location, which it can't do today. Not required for this fix to
  work - can be a follow-up if it turns out to matter in practice.
- Holidays (`HOLIDAYS_CALENDAR_ENTRY`, synthetic, no real row) needs an explicit
  carve-out in the rewritten `listSharedForLocation` - it has no calendar id to hang a
  `CalendarLocationShare` row off of and should just stay visible everywhere, as today.

### Rough build order

1. `CalendarLocationShare` Prisma model + migration + the backfill script (step 1-2
   above) as part of the SAME migration, not a follow-up - never ship the empty table
   alone.
2. Rewrite `listSharedForLocation` to read the join table; delete the sharer-location
   inference code it replaces.
3. `DisplayConfig` calendar resolution: inherit-by-location + optional override, per
   above.
4. Web: per-location sharing checkboxes in `CalendarsSettingsSection.tsx`.
5. Verify live in Test Family (§ above) before touching production.

---

## 17. Token rescaling (built 2026-08-31)

Casey's request: as family manager, be able to change the token↔dollar ratio
(`Family.tokenValueUsd`, already exists) at will - either direction, any value, not
just round numbers - and have every token-denominated number in the family scale with
it automatically, so the kids can't reverse-engineer "1 token = $1" from patterns and
start negotiating prize prices around it. Every rescale tracked/auditable. Must NOT
move anyone's level/XP - and levels/XP must stay levels/XP, no dollar figures ever
displayed, full stop. Secondary win: bigger numbers make late-penalty percentages
actually round to something other than 0.

**Decided in this revision, after discussion:**
1. Chore-streak bonus wheel's hardcoded `1, 5` range becomes a real, configurable
   field - see "Fields that get rescaled" below. No longer an open question.
2. A redemption already paid for but still pending when a rescale happens is
   grandfathered at what was actually paid - confirmed, unchanged from the first
   draft.
3. **Testing happens in Test Family only, never Casey's real family, for this
   feature specifically** - Casey's own instruction, called out here so it survives
   into whichever session actually builds this.
4. Level/XP design replaced entirely (below) - no dollar figure anywhere, ever,
   including internally-named fields. XP display now ALSO tracks the current scale
   (previous draft only fixed the level integer, which left XP as a giveaway - see
   why below), and the "make it look like the scale was always there" idea Casey
   floated turns out achievable for FREE as a side effect of the same mechanism,
   without physically rewriting the ledger.

### Level/XP: why "just don't touch it" almost wasn't enough

Level is `floor(sqrt(earned/5))+1`. The first draft of this plan fixed `earned` (for
the level calculation) so it wouldn't move on a rescale. But `earned` is ALSO
displayed literally, as text - `LevelBadge.tsx` prints `"{earned} XP · {toNext} to Lv
{next}"` right on the same profile page as the person's actual token balance. If
`earned` stays frozen while balance jumps 100x on a rescale, that MISMATCH is a bigger
tell than the original problem: a kid who remembers "45 XP, 45 tokens" yesterday and
sees "45 XP, 4,500 tokens" today doesn't just suspect something changed - they can
divide the two numbers and get exactly 100, the exact rescale factor, handed to them.
Freezing XP while balance scales would have been worse than not fixing XP at all.

**The actual design: one invariant number that's never shown, one scaled number that
always is.**

- `TokenLedger.scaleAtCreation Float @default(1)` - snapshots the family's CURRENT
  scale factor (see below) at the moment each row is written. Never touched again.
  Not named/framed around dollars anywhere - it's purely "what scale was in effect
  when this happened," same category of fact as a timestamp.
- Family-level scale factor is just `1 / tokenValueUsd`, relative to `1` (today's
  value, and the value every family has always had until someone changes it) - no new
  `Family` column needed, it's derived from the field that already exists.
- **Invariant reference** (used ONLY to compute the level integer, never displayed):
  `earnedInvariant = sum(delta / scaleAtCreation)` over positive, non-`REBASE` rows.
  Since every row that exists today has `scaleAtCreation = 1`, this is numerically
  identical to today's plain `sum(delta)` right now, for everyone - shipping this,
  by itself, changes no one's level. `REBASE` rows are excluded from this sum
  entirely regardless of the math working out - belt and suspenders, not relying on
  the arithmetic happening to cancel to zero.
- **Displayed XP** (what actually renders as text/bar, tracks the CURRENT scale so it
  always reads consistently next to the current balance): take the same invariant
  total and level-boundary numbers, then multiply by the CURRENT scale factor before
  rendering. `levelProgress()` in `LevelBadge.tsx` changes shape: it still returns one
  `level` integer (computed from the invariant sum, never scaled), but `into` /
  `needed` / `next` / the displayed XP number are the invariant versions multiplied by
  the current scale factor. Server passes both pieces (or just the invariant sum plus
  `tokenValueUsd`, which the client mostly already has in scope) down to wherever
  `LevelBadge` renders.

Net effect: level never moves on a rescale (the actual promise). The XP number DOES
move, in lockstep with the balance, every time - so the two numbers never disagree,
and there's nothing to divide out.

### Worked examples

Baseline for all of these: someone has `earnedInvariant = 60` (lifetime, never
changes). Level thresholds are fixed: Lv1 at 0, Lv2 at 5, Lv3 at 20, Lv4 at 45, Lv5 at
80 - 60 sits between Lv4 (45) and Lv5 (80), so **level is 4, always, in every scenario
below.**

| Scenario | scale factor | Displayed XP text | Balance (illustrative) |
|---|---|---|---|
| Today, never rescaled ($1/token) | 1× | `Lv 4 · 60 XP · 20 to Lv 5` | 60 tokens |
| Rescale to $0.01/token ("100 tokens = $1") | 100× | `Lv 4 · 6,000 XP · 2,000 to Lv 5` | 6,000 tokens |
| Rescale to $0.001/token ("1,000 tokens = $1") | 1,000× | `Lv 4 · 60,000 XP · 20,000 to Lv 5` | 60,000 tokens |
| Rescale to an odd $0.35/token | ≈2.857× | `Lv 4 · 171 XP · 57 to Lv 5` (rounded) | ≈171 tokens |
| Rescale DOWN to $100/token (numbers shrink) | 0.01× | `Lv 4 · 1 XP · 0 to Lv 5` (rounds to near-nothing) | ≈1 token |

That last row is a real guardrail to build, not just a footnote: scaling DOWN hard
enough crushes small balances/XP to 0-1 and loses all resolution. The rescale
preview (below) should warn if any member's balance or the displayed XP would round
to 0 or 1, rather than silently letting it happen.

### "Make it look like the scale was always there" - yes, but not by rewriting the ledger

Casey's instinct is right that OLD numbers looking inconsistent with NEW ones is a
real leak - maybe the biggest one. A kid's own activity feed (`ProfilePage`) shows
past ledger entries with their raw amounts; if last month's recurring chore paid "+2"
and this month the same chore pays "+200," that comparison alone reveals a change
happened, no math required. Purchase history (`Prize.tsx`'s grouped history,
`tokensSpent`) has the identical problem for past prize purchases.

**Recommendation: don't rewrite the ledger - transform how history is DISPLAYED
instead.** Physically rewriting every past `TokenLedger.delta` (and cascading into
`AwardGrant.tokenValue`, `RewardGame.amount`, everywhere `tokensSpent` is derived
from) on every rescale would need to touch every historical row, forever, on every
future rescale, and permanently deletes the actual historical truth. It also buys
nothing extra: the level-invariance goal is already fully solved by
`earnedInvariant` above, with or without rewriting anything. The display-transform
version gets the EXACT SAME visual result - old numbers always look consistent with
new ones, everywhere anyone looks, including kids' own history - for free, using the
`scaleAtCreation` column that already has to exist for the XP fix:

`displayDelta = storedDelta * (currentScaleFactor / scaleAtCreation)`

Applied everywhere a historical ledger amount renders (`ProfilePage` activity list,
`Prize.tsx` purchase history's `tokensSpent`, anywhere else a raw `delta` is shown).
If the scale never changed, this is a no-op (ratio = 1, displays exactly what's
stored today). After a rescale, an old "+2" entry displays as "+200" automatically,
matching whatever the SAME chore pays today - because it's recomputed at render time
from the ratio, not because anything was overwritten. The stored `delta` underneath
never changes, so this is fully reversible, cheap, and the ledger stays the honest,
append-only record it's supposed to be - Casey (or a future audit) can always see
what ACTUALLY happened by going around the display transform.

**`REBASE` entries are adult-only, never shown in a kid's own activity feed at all** -
not display-transformed, just excluded outright. A raw "+4,455 tokens: token value
changed" line would itself be the loudest possible tell. Visible only in the
Family-Settings-side `TokenScaleEvent` audit log Casey already asked for.

### Fields that get rescaled (bulk-multiplied by `factor` at rescale time)

Current-state config, not history - editing these in place is no different from
editing any other setting:
- `Chore.tokenValue`, `Chore.firstFinisherBonus`, `Chore.streakBonusTokens`
- `Prize.tokenCost`
- `Award.defaultTokenValue`, `Award.wheelMin`, `Award.wheelMax`
- `RewardGame.minTokens`, `RewardGame.maxTokens` (the roll RANGE for a not-yet-played
  pool game only - an already-rolled `amount` is history)
- `User.allowanceTokens`
- **New:** the chore-streak bonus wheel's range, hardcoded `1, 5` today in
  `chores.service.ts`'s `finalizeApproval`
  (`this.rewardGames.create(familyId, recipient, 1, 5, ...)`). Becomes a real
  `Family`-level field (e.g. `streakWheelMin`/`streakWheelMax`, defaulting to today's
  `1`/`5` so nothing changes for a family that never rescales), read instead of the
  literal, and included in the bulk-multiply.

**Not touched, ever:** `Chore.latePenaltyPercent` (a percentage, not an amount - it's
the thing that gets MORE useful once `tokenValue` is bigger, not something that
itself needs scaling); `Award.defaultStreakFreezeValue` / `Chore.streakFreezes`
(freeze counts, not currency); any already-created `TokenLedger` / `AwardGrant` /
rolled-`RewardGame` row (history - see the display-transform section above for how
these still LOOK right without being edited).

### The rescale operation itself

An adult picks a new `tokenValueUsd`. `factor = oldValue / newValue` (e.g. $1 → $0.01
is factor 100). One transaction:

1. Every user's current balance gets ONE new `TokenLedger` row, `type: REBASE`,
   `delta = round(currentBalance * (factor - 1))` (skipped if 0), `scaleAtCreation`
   set to the NEW factor, reason text spelling out the conversion for the audit log.
2. Every field in "Fields that get rescaled" above gets bulk-multiplied by `factor`
   (`Math.round`).
3. `Family.tokenValueUsd` updates to the new value.
4. A new `TokenScaleEvent` row records: familyId, actorId, oldTokenValueUsd,
   newTokenValueUsd, factor, createdAt.

### UI

New panel, Family Settings - its own section, not folded into Features (bigger/rarer
action than a toggle): current `tokenValueUsd`, an input for the new value, a
**preview before committing** (same math, read-only: per-member balance/XP before →
after, flagging anyone who'd round to 0-1 per the guardrail above, plus a sample of
affected chores/prizes), a confirm step, and a history list reading from
`TokenScaleEvent`.

### Rough build order

1. `TokenLedger.scaleAtCreation` column + a centralized `TokensService
   .createLedgerEntry()` helper (replacing the 13 existing raw
   `prisma.tokenLedger.create(...)` call sites across `chores.service.ts`,
   `tokens.service.ts`, `prizes.service.ts`, `reward-games.service.ts`,
   `awards.service.ts`, `household.service.ts`) that stamps it automatically. Ship and
   verify level AND displayed XP are byte-for-byte unchanged for everyone before
   anything else - this step alone should be a total no-op.
2. Switch `levelCheck()` / `balances()`'s `earned` to the invariant sum (excluding
   `REBASE`); update `LevelBadge.tsx`/`levelProgress()` to take the invariant sum +
   current scale factor and return a scaled display alongside the untouched level
   integer. Re-verify against step 1's baseline.
3. Display-transform for historical amounts in `ProfilePage`'s activity feed and
   `Prize.tsx`'s purchase history (`tokensSpent`).
4. `TokenScaleEvent` model, `REBASE` `LedgerType`, `Family.streakWheelMin/Max` +
   wiring `finalizeApproval` to read them instead of the literal `1, 5`.
5. The rescale transaction itself (preview mode + commit mode, same underlying calc
   so preview can't drift from commit), including the round-to-0/1 guardrail.
6. Web: the new Family Settings panel, preview UI, confirmation, history list.
7. **Verify live in Test Family only** (multiple members, real chore/prize history) -
   confirm every level stays exactly put across a rescale, confirm displayed XP and
   balances land on the previewed numbers, confirm old activity-feed entries render
   consistently with new ones. Never touches Casey's real family during any of this.

### Resolved: rounding drift on a non-clean factor

Casey's call: warn, don't block. `preview()`/`commit()` share a `cleanRatio` check
(does the factor, or its reciprocal, divide within float precision of a whole
number) - if not, the web panel shows a plain warning ("that ratio doesn't divide
evenly, balances may round a token or two differently between people") but the
Confirm button still works. Same shape as the per-member `crushWarning` (a balance
that'd round to 0-1) - informational, never a hard stop.

### What actually shipped, and one deliberate gap

Built essentially as designed above, via a NEW module (`server/src/token-scale/`,
not folded into `TokensService` - the domain is different enough, and it touches
Chore/Prize/Award/RewardGame/User directly, none of which `TokensService` otherwise
reaches into) with `preview`/`commit`/`history`, gated `assertManager` (owner or
family manager only - stricter than the general "any adult" bar elsewhere, since
this touches every kid's balance and every price at once). `Family.tokenValueUsd`
is no longer settable through the general `PUT /family/settings` endpoint at all
(removed from that DTO both server and client side) - the rescale flow is the only
path now, so there's no way to accidentally desync the ratio from the numbers that
are supposed to track it.

`TokenLedger.tokenValueUsdAtCreation` and the derived `dollarEquivalent` (=
`delta * tokenValueUsdAtCreation`, precomputed at write time so every aggregate stays
a plain native `_sum`) are stamped automatically by a Prisma **middleware**
(`prisma.service.ts`, `$use` on `TokenLedger.create`) rather than a service-level
helper every call site has to remember to use - structurally can't be forgotten by a
14th call site later, and required zero changes to any of the 13 existing
`tokenLedger.create()` call sites. The rescale's own `REBASE` entries set both
fields explicitly instead (mostly because an interactive `$transaction(async (tx) =>
...)` callback's `tx` client doesn't run the base client's middleware at all - worth
remembering for anything else written that way later).

Historical redisplay (the "make it look like the scale was always there" idea) is
live in every place a past amount renders: `ProfilePage`'s activity feed and 30-day
sparkline, `KioskStatsModal`, and `Prize.tsx`'s purchase history (`tokensSpent`,
co-viewer charges) - all divide the stored `dollarEquivalent` by the family's
CURRENT `tokenValueUsd` rather than showing the raw stored `delta`. `REBASE` rows
are excluded outright from every personal ledger/activity list (`tokens.service.ts`
`ledger()`/`activity()`), not just display-transformed - visible only in the
Family-Settings-side history list.

**Deliberate gap, not silently dropped:** `Award.poolJson` / `RewardGame.poolJson`
(the weighted "Pool" reward type's own embedded `{kind:'TOKENS', min, max, weight}`
entries) are NOT rescaled by `commit()`. Everything else in "Fields that get
rescaled" above is. Pool-type awards/games are a less-used sub-feature and the JSON
surgery to rescale just the TOKENS-kind entries inside an arbitrary weighted array
felt like real scope for a feature not actually in play yet - revisit if it turns
out to matter once someone's actually using Pool-type rewards.

### Follow-up, same day: bonus wheel also gets a game-type pin

Casey's request after living with the built feature for an afternoon: the chore-
streak wheel's help text still read "A random 1-5 extra tokens" verbatim, stale the
moment the range became editable - fixed to a generic line that points at the live
control instead of hardcoding numbers that can drift. Also added: `Family
.streakWheelGameType` (nullable, `null` = "surprise me"/random - the original
behavior, unchanged default), same convention as `Award.poolGameType`, wired into
`chores.service.ts`'s `finalizeApproval` so an adult can pin the streak bonus to a
specific reveal game (Wheel, Slot Machine, Scratch Card, ...) instead of it always
being a random pick. Simple `<select>` in the same Features > Tokens > Bonus wheel
row as the min/max fields - not the full visual card-grid picker Award's own
`poolGameType` gets on AwardsPage (that one shows an icon tile per game with its own
per-tile preview button) - a plain dropdown was judged enough for a single family-
wide setting; upgrade to the richer picker later if it turns out to matter.

---

## 18. Mini-games (planned, not built, 2026-08-31)

Casey's request: a THIRD reward mechanism, separate from Awards and Prizes -
skill-based win/lose mini-games (not the existing chance-reveal games like the
bonus wheel), timed, touch/drag, in the visual spirit of Among Us's tasks (real
little challenges, not just a spinner). Winning draws from a linked prize pool
(the exact same weighted `PoolEntry` mechanism Awards already use - tokens, a real
Prize, or a streak freeze); losing can optionally still pay a flat consolation.
Explicitly wants partial credit: if a game has multiple discrete correct answers/
sub-steps (picking each of several locks, connecting each of several wires), award
tokens per correct one even on an overall loss, as an optional setting. New Store
tab alongside Prizes/Awards. Specifically named one game to start: **lock pick,
progressively harder locks**. Wants to actually play a prototype before any of this
gets built for real, plus my own ideas for the rest of the feature.

**Ten playable prototypes exist right now**, not just one - see "Ten playable
prototypes exist now" below for the full set and the artifact link. Tune each
game's difficulty, time limit, and partial-credit settings live, then play it - on
desktop or a touch device. All ten are deliberately disconnected from any real
balance, so they're safe to hand to a kid to playtest too, not just Casey.
Everything below assumes whatever comes out of
actually playing this (and whichever future prototypes follow it) over "reasonable
constants floating in a document."

### The core loop, generalized from lock-pick to any mini-game

Every mini-game in this feature - lock-pick or otherwise - shares the same shape,
which is what makes them one feature instead of N unrelated ones:

1. A **skill challenge** with a real win/lose outcome the PLAYER determines through
   performance (unlike a reveal game, where the server rolls the outcome and the
   client just animates it) - usually against a clock.
2. Made of **discrete steps** (locks, wires, tiles, targets) wherever the mechanic
   naturally has them - this is what partial credit hangs off of. Not every game
   type will have clean discrete steps (see the caveat under "other game ideas"
   below); that's fine, partial credit is opt-in per game, not universal.
3. **On win:** draw one entry from a linked `PoolEntry[]` pool - literally reuse
   Award's existing pool shape and draw logic (tokens range, a real `Prize`, or a
   streak freeze), not a new parallel mechanism.
4. **On loss:** an optional flat "lose token value" (0 = none), PLUS, if partial
   credit is on for this game, `partialCreditPerStep × stepsCompleted` regardless of
   the overall win/lose outcome - stacks with the lose value, not instead of it.
5. **Preview mode:** anyone with access can play a no-stakes run (no grant consumed,
   no ledger entry, no real pool draw - a fake draw like the prototype's) before an
   adult ever queues a real one for a kid. This is the mechanism Casey's "let me try
   it out to confirm" request turns into permanently, not just a one-time favor for
   this planning conversation.

### Data model - genuinely separate from Award, per Casey's own instruction

```
model MiniGame {            // the catalog entry - "a game an adult can hand out"
  id, familyId, name, icon, description
  gameType            String   // 'LOCK_PICK' | future ones - own enum, NOT GAME_TYPES
                                // (those are reveal-presentation styles for chance
                                // games; these are actual skill mechanics)
  configJson          Json     // per-gameType tunables (lock-pick: step count range,
                                // time limit, difficulty ramp - whatever the
                                // prototype settles on)
  poolJson            Json     // PoolEntry[] - drawn on WIN, identical shape to
                                // Award.poolJson
  loseTokenValue       Int     @default(0)   // 0 = no consolation
  partialCreditEnabled Boolean @default(false)
  partialCreditPerStep Int     @default(0)   // only meaningful if enabled
  createdById, createdAt
}

model MiniGameGrant {       // one instance handed to one kid - mirrors AwardGrant
  id, miniGameId, userId, grantedById, createdAt
  status          'PENDING' | 'IN_PROGRESS' | 'PLAYED' | 'FORFEITED'
  drawnResultJson Json        // the pool draw, ROLLED AT GRANT CREATION - see below
  startedAt       DateTime?
  won             Boolean?
  stepsCompleted  Int?
  totalSteps      Int?
  timeTakenSeconds Int?
  tokensAwarded   Int?        // final total actually paid - the pre-drawn result on
                               // a win, loseTokenValue + partial credit on a normal
                               // loss, or 0 on a FORFEITED abandon - never both
  prizeWonId      String?     // set only if drawnResultJson was a PRIZE entry AND won
  playedAt        DateTime?
)
```

Ledger writes for a played grant go through the `TokensService.createLedgerEntry()`
helper already centralized for §17 - this feature doesn't need its own token-writing
path, just a new `LedgerType` value (`MINI_GAME`) so it's reportable/filterable like
every other source.

### Prize pre-determination & abandonment (Casey's own instruction, 2026-08-31)

The pool-possibilities view during **setup** (adult building/editing a `MiniGame`'s
pool) stays exactly as-is - showing every possible outcome there is fine and useful.
What changes is when the actual **draw** for one grant happens:

1. **Drawn at grant creation, not at play time.** The moment an adult hits "Give
   to...", the server rolls `drawnResultJson` from the pool immediately and stores
   it on the `MiniGameGrant` row - same draw helper as everywhere else, just called
   a step earlier than you'd assume. A kid opening a `PENDING` grant always sees
   "you're playing for ___" reflecting that stored roll, never a fresh one.
2. **Stable until played.** Because the draw already happened and is just being
   *read* back, opening a `PENDING` grant, backing out before pressing Start, and
   reopening it later shows the identical prize every time - there's nothing left
   to reroll. Backing out pre-Start is always safe and free.
3. **Starting is a commitment.** Pressing Start flips the grant `PENDING` ->
   `IN_PROGRESS` and stamps `startedAt` server-side, before the actual mini-game
   mounts client-side.
4. **Abandoning after Start auto-fails, no consolation.** If a grant is ever found
   still `IN_PROGRESS` when the kid-facing queue or that grant is fetched again -
   which only happens if the page that started it went away without finishing
   (closed, refreshed, crashed, force-quit) - the server resolves it right there as
   `FORFEITED`: `won = false`, `tokensAwarded = 0`, no `loseTokenValue`, no partial
   credit, regardless of what the `MiniGame`'s own settings would normally pay on a
   clean loss. The pre-drawn prize is discarded, not paid out. This is deliberately
   harsher than a normal loss - it's the penalty for walking away mid-attempt, not
   for playing and losing. A legitimately in-progress session never re-fetches its
   own grant (the client already holds that state locally while playing), so this
   check never fires against a still-active, still-visible game - only a truly
   abandoned one.

`FORFEITED` is its own status, distinct from `PLAYED` + `won: false`, so reporting
can tell "played it and lost" apart from "started it and walked away" if that
distinction ever matters later.

### Partial credit - the specific ask, generalized

"If a prize has multiple correct answers, let me pay tokens for each correct answer
even if they don't get the whole thing right" - built as `partialCreditPerStep ×
stepsCompleted`, paid regardless of win/lose (a win already implies all steps
completed, so this naturally folds into the pool-draw total on a win and only
distinctly matters on a loss). Deliberately per-`MiniGame` (not global) - some games
genuinely don't have discrete steps to credit (see below).

### Starting game list

1. **Lock pick** (Casey's own pick, prototyped above) - N locks in sequence, each
   with a narrower "sweet-spot" arc and a faster sweep than the last; tap when the
   needle crosses the glowing zone. Clean discrete steps (one per lock) - partial
   credit fits naturally.

**My own additions, picked for the same "Among Us task" register and a spread of
input styles (not everything should be a timing-tap, or touch gets monotonous):**

2. **Wire connect** - drag colored leads from left posts to matching right posts
   before time runs out. The most direct touch/drag fit of any of these, and the
   most recognizably "Among Us" of the set. Discrete steps = wires; partial credit
   fits well.
3. **Pattern relay** - Simon-Says style: watch a sequence of panel lights, repeat it
   by tapping in order; sequence grows by one each round. Discrete steps = rounds
   survived; partial credit fits well (tokens per round reached, not just pass/fail
   on the whole sequence).
4. **Sort rush** - drag scrambled numbered/lettered tiles into order against the
   clock. Discrete steps = tiles placed correctly; partial credit fits well.
5. **Signal trace** - drag a finger along a wiggly path without straying outside
   its edges, timed. Continuous, not discrete - no clean "steps" to give partial
   credit for (could approximate via % of the path completed before straying off,
   but that's a distance metric standing in for step-counting, not the real thing -
   flag this as an explicit exception if built, not silently forced into the same
   shape as the others).
6. **Dial calibration** - rotate a dial to land inside a moving target zone, hold it
   there for a beat. Same caveat as Signal Trace: naturally continuous/single-
   outcome, partial credit doesn't map cleanly - fine as a game, just not one that
   should pretend to support the partial-credit setting.

### Preview/test mode

Every `MiniGame` in the catalog gets a **Preview** button, available to any adult
(not gated to whoever created it) and - per Casey's explicit ask - safe to hand
directly to a kid to playtest too, since it touches nothing real: no `MiniGameGrant`
row, no ledger entry, no real pool draw (a client-side fake draw, same pattern
`fakePreviewRoll` already uses for Award's own pool-builder preview in
`rewardGames.ts`). This is exactly what today's **Task Deck** artifact is, in
miniature and disconnected from the app entirely - the real in-app version is the
same idea wired to the family's actual catalog instead of the demo pool.

### Store UI

New third tab, **Store: Prizes | Awards | Mini-games** - a catalog list (adult-
managed: create/edit a `MiniGame`, reusing Award's existing `PoolEntry` builder
component for the pool instead of rebuilding it), each entry with **Preview** and
**Give to...** actions (the latter creates a `MiniGameGrant`, same shape as handing
out an Award). Kids see a "Games waiting for you" queue, same visual language the
pending-award/pending-reward-game queues already use elsewhere in the app.

### Decided, 2026-08-31

1. **Play surface: phone first, kiosk second.** Design constraints (touch target
   size, layout width) get pinned to a phone screen first; the kiosk's larger
   `.kiosk-mode` targets are the easier direction to scale UP to afterward, not the
   other way around.
2. **Difficulty scales per grant, not per catalog entry.** One `MiniGame` ("Lock
   Pick") serves every kid; an adult picks easy/medium/hard (or the raw underlying
   knobs) at grant time, adjusting `configJson`'s params for that one play. No
   "Lock Pick (easy)" / "Lock Pick (hard)" duplicate catalog rows.
3. **Wire Connect (named "Wire Splice" in the prototypes) is the confirmed second
   real game**, after Lock Pick, once Lock Pick is confirmed working end to end for
   a real family.

### Ten playable prototypes exist now, not just one

Casey's follow-up: make Lock Pick look more like an actual lock (done - reskinned
from a spinning dial to a pin-and-tumbler keyway), add a second, distinct
combination-safe game ("cracking the safe" specifically), add sound effects to
every game, and build at least ten testable prototypes total rather than one.

All ten live in a single artifact, **Task Deck** - a small arcade shell (menu,
shared config sliders, shared win/lose/payout panel, a tiny procedural Web Audio
SFX engine - no audio files, synthesized clicks/chimes/buzzes so the artifact stays
self-contained) wrapping ten independent games. Nothing here is wired to a real
catalog or balance - purely for Casey (and, safely, any kid) to playtest feel,
difficulty, and controls before any of this becomes real schema/UI:

1. **Pin & Tumbler** - Lock Pick, reskinned: an actual pin-and-tumbler keyway,
   pins rising and falling, tap when a pin's window crosses the shear line. This
   is what "Lock Pick" in every earlier mention of this feature refers to.
2. **Safe Cracker** - the requested second lock game: a rotary combination dial
   with momentum/drift, spin and release, tap SET when the marker sits on the
   glowing notch. Multiple digits, each with a narrower tolerance than the last.
3. **Wire Splice** - the confirmed next real game (decision 3 above): drag colored
   leads to matching posts before time runs out.
4. **Signal Relay** - Simon-Says pattern memory; sequence grows one step per round
   survived.
5. **Cargo Sort** - drag scrambled numbered crates into ascending order against the
   clock.
6. **Fuse Trace** - drag a live wire through a channel without straying outside
   it, one pass, continuous (no partial credit, by design - see the original
   caveat above).
7. **Reactor Calibration** - hold a needle inside a drifting target zone for a
   beat; continuous, no partial credit, same caveat.
8. **Bug Zapper** - tap rush: zap a quota of blips before they scurry off.
9. **Circuit Match** - memory pairs; flip tiles, find every match before time's up.
10. **Code Breaker** - Mastermind-style: guess a hidden digit code, hot/cold
    feedback narrows it down: exercises the partial-credit ask most literally
    ("tokens for each correct answer even without cracking the whole code").

Each card in the menu is tagged **Partial credit** or **All or nothing** so which
games do and don't support the partial-credit setting is visible before playing,
not just documented here.

**Verification note:** the sandboxed tool used to build this can't reliably play-
test anything that depends on `requestAnimationFrame` running in real time (its
preview pane throttles animation in the background, confirmed with a bare rAF loop
that also never fired - an environment limitation, not a code issue) - so the
timing-sensitive games (most of them) are verified by careful code review and, for
the trickiest bit of math (Safe Cracker's rotation hit-test, which had a real sign
error caught and fixed during that review), a standalone logic check outside the
browser entirely. They have NOT been played start-to-finish by anything other than
static analysis. Casey's own morning playtest is the real test.

### Rough build order (once direction is confirmed - nothing below is started)

1. Casey plays all ten prototypes; reports back which feel right, which need
   tuning, which to drop. Cheap to iterate on a static artifact - expensive once
   any of this is real schema/UI.
2. `MiniGame` / `MiniGameGrant` models + `MINI_GAME` `LedgerType` value, including
   the per-grant difficulty override (decision 2 above).
3. Server: catalog CRUD, grant/start/play/preview endpoints - grant creation rolls
   and stores `drawnResultJson` immediately (see "Prize pre-determination &
   abandonment" above), `start` stamps `IN_PROGRESS`/`startedAt` and is also where
   any stale `IN_PROGRESS` grant for that user gets auto-resolved `FORFEITED` first,
   `play` scores whatever the client reports (steps completed, won, time taken) at
   the same trust level the existing reveal-games' spin() already operates at
   (client cosmetics, server-authoritative payout math), paying out the pre-drawn
   result on a win via the same draw helper `reward-games.service.ts` already has.
4. Web: port Pin & Tumbler (Lock Pick) for real first, into the actual Store >
   Mini-games tab, both real-play and preview modes off the same component -
   phone-first per decision 1.
5. Store UI: catalog list, pool builder (reused from Award), give/preview actions,
   kid-facing pending queue.
6. Wire Splice (decision 3) once Lock Pick is confirmed working end to end for a
   real family - don't port the other eight in parallel on a guess.
