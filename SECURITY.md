# Security policy

The repository is under alpha development and does not have a supported stable
release line. Security fixes target `main` and subsequent prereleases.

## Reporting

Open a private
[GitHub security advisory](https://github.com/sebastianspicker/3rr/security/advisories/new)
before public disclosure. Include reproduction steps, affected versions,
impact, and known mitigations. Do not include live credentials, tokens, or
private host details.

## Security boundaries

- The operate panel handles authentication, sessions, CSRF, authorization,
  SQLite data, Redis state, and RCON credentials.
- The maintain updater runs with host privileges and controls systemd and
  SteamCMD.
- The provision module writes credentials and administrator configuration and
  constructs the CS2 startup command.

RCON console input must remain one ASCII command. Reject separators, control
bytes, and non-ASCII characters before invoking the RCON client. Any exception
requires a documented threat model, focused regression tests, and maintainer
approval.
