# Security Policy

Security fixes are shipped from the `main` branch.

## Reporting

Open a private security advisory or contact the maintainer directly before disclosing a high-impact issue publicly.

## Priority Areas

- `apps/operate/panel`: auth, session handling, CSRF, RCON secret handling, network boundary validation
- `apps/maintain/updater`: privilege boundaries, lock handling, service control, SteamCMD execution
- `apps/provision/bootstrap`: secret templates, admin bootstrap data, startup command safety

## Boundary Notes

- RCON console input must remain single-command ASCII input. Reject separators, control bytes, and non-ASCII characters before handing commands to the RCON client.
