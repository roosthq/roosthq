# Changelog

All notable changes to Roost HQ. Releases are git tags (`v0.1.0`); the default
"stable" update channel installs the newest tag.

## Unreleased

## 0.1.0

First tagged release.

### Added
- Versioned database migrations. Existing installs (created before migrations
  existed) are adopted automatically on the first start after updating; no
  action needed.
- Every in-app update takes a database snapshot first
  (`backups/pre-update_*.sql.gz`, newest 5 kept) and only reports success once
  the server is healthy again.
- First-time setup requires a setup code printed in the server log.
- `scripts/gen-secrets.js` fills in `.env` secrets for a new install.
- CI: build, migration checks, boot test and secret scan on every push.

### Security
- See [SECURITY.md](SECURITY.md). Fixed: kids could add adults through the
  Google member flow; family managers could take over the owner account;
  placeholder secrets were accepted at startup; kids could change locations;
  prize links and push endpoints were not validated; invite emails trusted the
  request's Origin header.
- Production no longer publishes the database, API or dev web ports on the
  host's network interfaces.
