# Operate panel security

The module follows the repository release policy. There is no supported stable
release line.

Report vulnerabilities through a private
[GitHub security advisory](https://github.com/sebastianspicker/3rr/security/advisories/new),
not a public issue. Include reproduction steps, affected versions, impact, and
known mitigations without including live credentials or host details.

## Deployment requirements

- Use a `SESSION_SECRET` of at least 32 characters.
- Configure a 32-byte base64 or hex `RCON_SECRET_KEY`.
- Use Redis for production sessions and rate limits.
- Terminate TLS before the panel and keep secure session cookies enabled.
- Configure `TRUST_PROXY` only for known proxy hops.
- Restrict panel and RCON network access.
- Protect `.env`, SQLite files, backups, and logs.
- Disable first-administrator bootstrap after the account exists.

RCON console input must remain one ASCII command. Reject separators, control
bytes, and non-ASCII characters before sending input to the RCON client.

CI runs secret scanning and the repository verification suite. Validation
commands are listed in [docs/RUNBOOK.md](docs/RUNBOOK.md).
