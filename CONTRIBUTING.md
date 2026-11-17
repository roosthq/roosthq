# Contributing to Roost HQ

Thanks for helping. Roost HQ is a small, family-focused project, so changes
that keep it simple and kid-safe are the easiest to accept.

## Before you start

- Open an issue first for anything bigger than a bug fix, so we can agree on
  the approach before you spend time on it.
- Security problems go through the private process in [SECURITY.md](SECURITY.md),
  not a public issue.

## Running it locally

See the [README](README.md#quick-start-development). In short:

```bash
node scripts/gen-secrets.js     # creates .env with fresh secrets
docker compose up --build       # db, API (:3000), web (:5173)
```

On first start the server prints a setup code; use it to create the owner
account.

## Making changes

- **Database changes need a migration.** Edit `server/prisma/schema.prisma`,
  then create a migration with `npx prisma migrate dev --name <what-changed>`
  and commit the generated folder under `server/prisma/migrations/`. CI fails
  if the schema and migrations disagree. Prefer additive changes; a migration
  containing `DROP`, `DELETE` or `TRUNCATE` must carry a `-- destructive-ok: <why>`
  line and a note in the changelog, because strangers upgrade through it.
- Keep user-visible text kid-readable and free of em dashes.
- `npm run build` in both `server/` and `web/` must pass (the web build runs
  the TypeScript checker).
- Add a line to [CHANGELOG.md](CHANGELOG.md) under "Unreleased".

## Pull requests

Describe what changed and how you tested it. Small, focused PRs are reviewed
fastest. By contributing you agree your work is released under the project's
AGPL-3.0 license.
