# Maintain updater security

The component follows the repository release policy. There is no supported
stable release line.

Report vulnerabilities through a private
[GitHub security advisory](https://github.com/sebastianspicker/3rr/security/advisories/new),
not a public issue.

The updater normally runs as root and controls systemd, SteamCMD, the CS2
installation, and a root-owned log path. Treat configuration paths, command
construction, lock handling, signal handling, service restoration, and
ownership checks as security boundaries.
