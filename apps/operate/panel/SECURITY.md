# Security Policy

## Reporting a Vulnerability

Please do not open public issues for security reports.

Open a private
[GitHub security advisory](https://github.com/sebastianspicker/cs2-server-ops/security/advisories/new).

Include:

- A clear description of the issue
- Steps to reproduce
- Potential impact
- Any suggested mitigations

## Supported Versions

This module follows the umbrella repository release flow. There is no supported
stable release during the public-alpha phase. Security fixes target `main` and
subsequent alpha candidates.

## Security Expectations

- Use a strong `SESSION_SECRET` in production.
- Configure `RCON_SECRET_KEY` in production so stored RCON credentials are encrypted.
- Enable `SESSION_COOKIE_SECURE=true` behind HTTPS.
- Configure Redis sessions via `REDIS_URL` for production use.
- Avoid default credentials unless explicitly allowed with `ALLOW_DEFAULT_CREDENTIALS=true`.
- Treat RCON console input as single-command ASCII input. Reject separators, control bytes, and non-ASCII characters before sending commands to the RCON client.

## Automated Scans

CI is configured to run:

- Secret scanning (Gitleaks)
- The root repository verification suite

See `docs/RUNBOOK.md` for verification commands.
