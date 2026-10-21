# Changelog

## Unreleased

### Changed

- **Upgrade notes.** The control-plane Compose example now requires
  `REDIS_PASSWORD` (add it to `panel.env`) and caps Redis at 128 MB. The CS2
  runtime example requires `RCON_PASSWORD`. Everyone signs in again once,
  because sessions now record the password they were opened with.
- Changing a password signs out the user's other sessions. New passwords are
  limited to the 1024 characters login accepts.
- Setup loads Workshop maps with `host_workshop_map <id>`, and Check result
  accepts a map reported by its bare name.
- `/api/health` `ready` covers only the panel; one unreachable game server no
  longer makes it unready. Detailed health output is limited to admins.
- The startup wrapper refuses an `RCON_PASSWORD` or `CS2_GSLT` containing `"`,
  `\` or non-printable characters instead of altering it.
- `bootstrap-admins.sh` writes CounterStrikeSharp's admin schema
  (`#`-prefixed groups, SteamID in `identity`) and refuses to overwrite
  existing files without `--force`. `capabilities.json` lists plugin needs
  per CFG (`requiresPlugins`).
- The CS2 runtime example can bind RCON's TCP port to one address
  (`CS2_RCON_BIND_ADDRESS`).
- The server build uses NodeNext module resolution (output is still
  CommonJS). Dependencies were updated, including redis 6, connect-redis 10,
  rate-limit-redis 6 and ejs 7.
- The panel logs a warning at startup when `NODE_ENV` is not `production`.
- Host updater (still a scaffold): `--dry-run` never touches the service, the
  default log and lock moved to `/var/lib/3rr/update.log` and
  `/run/3rr-update.lock`, SteamCMD is retried, and `--status` exits 10 when an
  update is available. Details are in `host-updater/CHANGELOG.md`.

- Redesigned the control-plane interface as a strict VGUI system: raised
  elements can be pressed, sunken elements show what the server reported, and
  dashed outlines show requested values that are not yet true. Barlow Semi
  Condensed and Barlow Condensed replace system fonts (Inter and Syne, which
  were unused, are removed). The olive texture is gone, and gold is limited to
  the commit action and the current selection. Tool tabs moved to the top of
  the server page, with the session steps inside Setup. Routes, IDs,
  `data-*` attributes, and behavior are unchanged.

- Automated test suites are no longer part of the public repository. The
  release gate includes a private test run (see `docs/RELEASING.md`).
- Reorganized the repository around `control-plane`, `host-updater`,
  `server-bootstrap`, and `deploy` without changing the HTTP API,
  environment settings, SQLite v3 schema, `enc:v1` credential format, RCON
  behavior, updater commands and configuration, or installed updater paths.
- The control plane now requires Node 26 (`>=26 <27`) and `better-sqlite3`
  13. The container image is pinned to `node:26.9.0-bookworm-slim` by digest.
- RCON code is reached only through `src/integrations/rcon/index.ts`, and its
  SQLite access moved to `src/infrastructure/sqlite`. SQL in the control plane
  now lives only in feature `repository.ts` modules and that directory; the
  architecture check enforces both rules.
- CI runs the verifier's sections as parallel jobs behind one `verify` check.
  `scripts/verify.sh` gained `--only`, `--quick`, and `--help`, needs Bash 4,
  and fails when tracked file modes drift from `scripts/executable-files.txt`.
- The GitHub repository is now `3rr-cs2`; the Pages demo moved to
  <https://sebastianspicker.github.io/3rr-cs2/> and includes a screenshot tour.

### Added

- Every log line written for a request carries `request_id` (also sent as
  `X-Request-Id`) and, once server access is authorised, `server_id`.
- `scripts/release-artifacts.sh` writes a source archive, a CycloneDX SBOM and
  SHA-256 checksums for a release.
- ↑/↓ recall of sent console commands; List backups shows its result on the
  page.
- Dependabot updates for npm, GitHub Actions, and the Docker base image.
- CodeQL analysis for TypeScript/JavaScript and workflows.

### Fixed

- Login and logout enforce CSRF for any path case or trailing slash.
- The console block list also catches quoted, `+`/`-`-prefixed and
  tokenizer-shortened verbs, and covers more RCON, logging, plugin and `exec`
  commands. It remains best-effort.
- Server hosts reject IPv6 zone ids and IPv6 forms that embed a blocked IPv4
  address; RCON passwords must be printable ASCII.
- Rate limiters backed by Redis no longer share one counter per client.
- Cookie-less requests to arbitrary paths no longer create sessions.
- Malformed request bodies return 400 and are never logged; log output
  redacts password fields.
- Unknown usernames take as long to reject as wrong passwords.
- The manage page renders without waiting for RCON; the players list and
  Check result request fresh observations; in-flight buttons cannot be
  double-clicked; inline pages handle expired sessions and timeouts.
- Shipped CFGs no longer repeat announcements or use SourceMod commands.
- `proxy-addr` 2.0.8 (GHSA-jqcg-44mw-7w3h).
- Keep the host updater in its fail-closed unknown state when the public Steam
  branch has no build ID, even if another branch does, and reject malformed
  digest-pinned image names in the deployment preflight.
- Pin patched transitive releases for request query parsing and the ESLint
  filesystem helper.

## [1.1.0-alpha.1] - 2026-07-23

### Changed

- Renamed the project and public identifiers to `3RR`.
- Changed the default SQLite filename and session cookie to `3rr.db` and
  `3rr.sid`.
- Added Redis to the control-plane deployment example and bound its
  published port to `127.0.0.1` by default.
- Renamed the updater, configuration, systemd units, lock path, and log path.
  Existing installations must disable `cs2-auto-update.timer` before enabling
  `3rr-update.timer`.

### Security

- Revalidate RCON hostnames before initial connections and reconnects.
- Serialize same-server RCON commands to prevent shared-connection races.
- Return a generic authentication failure when an add-server request conflicts
  with another user's server.
- Use Redis-backed add-server rate limiting when Redis is configured.

### Fixed

- Keep the CS2 service running when the updater cannot determine the remote
  build, and reject updates reported as successful when the build ID did not change.
- Validate stale-lock process identity, configuration syntax, disk-space
  output, startup values, and database/proxy defaults consistently.
- Run CFG commands before map changes during game setup, and stop the
  production process on unhandled promise rejections.

## [1.0.0] - 2026-04-19

- Combined the existing control-plane and updater projects with the initial
  server-bootstrap assets, deployment examples, and shared documentation.
