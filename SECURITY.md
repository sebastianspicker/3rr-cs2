# Security Policy

3RR is preparing its first public alpha. There is no supported stable release.
Security fixes are developed on the `main` branch and included in subsequent
alpha candidates.

## Reporting

Open a private [GitHub security advisory](https://github.com/sebastianspicker/cs2-server-ops/security/advisories/new)
before disclosing a vulnerability publicly. Include reproduction steps, affected versions,
impact, and any known mitigation. Do not place secrets or live RCON credentials in the report.

## Priority Areas

- `apps/operate/panel`: auth, session handling, CSRF, RCON secret handling, network boundary validation
- `apps/maintain/updater`: privilege boundaries, lock handling, service control, SteamCMD execution
- `apps/provision/bootstrap`: secret templates, admin bootstrap data, startup command safety

## Boundary Notes

- RCON console input must remain single-command ASCII input. Reject separators, control bytes, and non-ASCII characters before handing commands to the RCON client. Any protocol-driven exception requires a documented threat model, focused regression tests, and maintainer approval before implementation.
