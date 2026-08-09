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
