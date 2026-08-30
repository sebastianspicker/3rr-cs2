# Releasing

3RR prerelease tags use a form such as `v1.1.0-alpha.1`. The control-plane
package is private and must not be published to npm. Its package and lockfile
versions must match the repository release; the host updater keeps its own
script version and changelog.

## Scope

A repository release can include the control plane, server-bootstrap assets,
the Linux/systemd updater, and deployment examples. It does not imply hosted
operation, automatic host provisioning, Pterodactyl compatibility, or support
for untested network and deployment topologies.

## Candidate procedure

1. Select one clean candidate commit from `main`.
2. Align the tag, package and lockfile versions, updater version, and
   changelogs.
3. Run `./scripts/verify.sh` with Node 22, the documented shell tools,
   loopback networking, and a working Docker daemon.
4. Test a representative CS2/RCON deployment, including login, a
   CSRF-protected write, one read-only observation, and one controlled
   state-changing operation.
5. Run an updater dry run and supervised update on a Linux/systemd/SteamCMD
   host.
6. Verify SQLite backup and restore, container health, graceful shutdown, and
   rollback with the candidate artifacts.
7. Review the tracked tree and release artifacts for credentials, local paths,
   databases, temporary files, and private host details.
8. Build source and container artifacts from the candidate commit. Record
   checksums, an SBOM, supported platforms, known limitations, and rollback
   instructions with the release.
9. Prepare release notes from the changelogs, create the tag, and publish the
   prerelease.

Do not reuse evidence from another commit or a smaller test subset. List exact
commands, tool versions, skipped checks, and environmental blockers in the
release record. Local source checks do not substitute for Docker, CS2, RCON,
SteamCMD, systemd, Redis, or production-network validation.

## Rollback

Keep the previous source or image artifact and a compatible database backup.
For the control plane, stop the new container, restore the previous image and
SQLite backup, then verify `/api/health` and an authenticated read-only status
request. For the updater, restore the previous script, configuration, and unit
files before enabling its timer.
