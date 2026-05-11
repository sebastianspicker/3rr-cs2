# Security Policy

## Reporting a Vulnerability

Please do not open public issues for security reports.

Please open a GitHub Security Advisory at your fork's `/security/advisories/new` page (e.g. `https://github.com/<owner>/<repo>/security/advisories/new`).

Include:

- A clear description of the issue
- Steps to reproduce
- Potential impact
- Any suggested mitigations

We will acknowledge receipt within 7 days and provide a remediation plan or request more details.

## Supported Versions

This module follows the umbrella repository release flow. The `main` branch is the supported branch for security fixes.

## Security Expectations

- Use `SESSION_SECRET` in production.
- Enable `SESSION_COOKIE_SECURE=true` behind HTTPS.
- Configure Redis sessions via `REDIS_URL` for production use.
- Avoid default credentials unless explicitly allowed with `ALLOW_DEFAULT_CREDENTIALS=true`.
- Treat RCON console input as single-command ASCII input. Reject separators, control bytes, and non-ASCII characters before sending commands to the RCON client.

## Automated Scans

CI is configured to run:

- Secret scanning (Gitleaks)
- The root repository verification suite

See `docs/RUNBOOK.md` for verification commands.
