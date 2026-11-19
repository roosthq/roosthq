# Changelog

All notable changes to Roost HQ. Releases are git tags (`v0.1.0`); the default
"stable" update channel installs the newest tag.

## Unreleased

### Changed
- The app and website now serve their own Space Grotesk font files instead of loading
  them from Google Fonts, so opening Roost HQ no longer contacts Google.

### Fixed
- Events on local (non-Google) calendars showed a "?" badge in the calendar. The badge is
  now hidden when an event has no owner.
- On a phone, the intro text above the subject tiles in Learning was squeezed into a
  narrow column beside the Monster Den and My Progress buttons. It now has the full width.

## 0.1.0 (2026-11-17)

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

- Settings, Family: "Download my family data" exports everything the family entered as JSON.
- Home page shows a getting-started checklist for new families; phones and tablets get an
  "Add to Home Screen" prompt (with iPhone instructions).

### Fixed
- A brand-new instance showed every holiday three times (the default holiday list was
  seeded by three simultaneous requests).
- Removing an adult who had created rules, awards, calendars, grants and similar failed
  with a database error. Their work is now handed to another adult, and removing someone
  no longer deletes the chores they created or changes the balance of kids they credited.

### Security
- See [SECURITY.md](SECURITY.md). Fixed: kids could add adults through the
  Google member flow; family managers could take over the owner account;
  placeholder secrets were accepted at startup; kids could change locations;
  prize links and push endpoints were not validated; invite emails trusted the
  request's Origin header.
- Production no longer publishes the database, API or dev web ports on the
  host's network interfaces.
