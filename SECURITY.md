# Security policy

Roost HQ is self-hosted software that holds a family's schedule, chores and
(for kids) reward history. Security reports are taken seriously.

## Reporting a vulnerability

Please **do not open a public issue** for a security problem. Use GitHub's
private reporting instead: on the repository page choose **Security**, then
**Report a vulnerability**. Include what you found, how to reproduce it, and
which version or commit you tested.

You can expect an acknowledgement within a few days. This is a small
project run by one maintainer, so fix timelines depend on severity, but
anything that lets one person act as another, read another family's data, or
reach the host will be treated as urgent.

## Supported versions

Only the latest tagged release is supported. Run the "stable" update channel
(the default) to receive tagged releases.

## What the project already does

- Role checks are made against the database on every request, never trusted
  from the session token.
- Passwords and PINs are hashed with scrypt; Google tokens are encrypted at
  rest (AES-256-GCM); display (kiosk) tokens are stored hashed and revocable.
- The server refuses to start with the placeholder secrets from `.env.example`.
- Creating the first (owner) account on a new instance requires a one-time
  setup code printed in the server log.
- Login, registration, password reset, Google sign-in and PIN unlock are
  rate limited per IP, and accounts lock out after repeated failures.
- In production the database and API ports are bound to localhost only; the
  app is reached through the reverse proxy / Cloudflare Tunnel.
- Every update takes a database snapshot first.

## Known limitations

These are documented rather than hidden; fixes are welcome.

- **Sessions are not revocable.** A session cookie is a signed token valid for
  30 days; logging out clears the cookie but a stolen token stays valid until it
  expires, and changing a password does not end other sessions. Rotating
  `SESSION_SECRET` signs everyone out.
- **Kiosk tokens use the same signing key as sessions** and can be refreshed
  without a PIN while the display link itself is valid. Treat a display link
  like a password and revoke it from Settings if a screen is lost.
- The updater has access to the Docker socket. It can only be triggered by the
  instance owner, but anyone who controls the update source (the repository
  you point `UPDATE_REPO_URL` at) controls your host. Do not point it at a
  repository you do not trust.
- Self-hosters are responsible for TLS (the documented Cloudflare Tunnel setup
  provides it), host firewalling, OS updates and backups.
