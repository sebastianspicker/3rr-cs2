# Security policy

3RR is in alpha and does not yet have a supported stable release line. Security
fixes target `main` and subsequent prereleases.

## Reporting

Please open a private
[GitHub security advisory](https://github.com/sebastianspicker/3rr/security/advisories/new)
before disclosing a vulnerability publicly. Include reproduction steps,
affected versions, impact, and known mitigations. Remove live credentials,
tokens, and private host details from the report.

## What each component handles

- The control plane handles authentication, sessions, CSRF, authorization,
  SQLite data, Redis state, and RCON credentials.
- The host updater runs with host privileges and controls systemd and
  SteamCMD.
- Server bootstrap writes credentials and administrator configuration and
  constructs the CS2 startup command.

Changes to the RCON console must preserve its single-command policy: reject
command separators, control bytes, and non-ASCII characters before calling
the RCON client. Discuss any exception with a maintainer and include a
documented threat model and focused regression tests. Maintainer approval is
required before changing this policy.
