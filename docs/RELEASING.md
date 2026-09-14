# Releasing

Use tags such as `v1.1.0-alpha.1` for 3RR prereleases. The control-plane package
is private: do not publish it to npm. Keep its package and lockfile versions in
sync with the repository release. The host updater has its own script version
and changelog.

## Scope

A release can include the control plane, server-bootstrap assets, the
Linux/systemd updater, and deployment examples. It does not provide a hosted
service or automatic host provisioning. It also does not claim Pterodactyl
compatibility or support for network and deployment layouts that have not been
tested.

## Release checklist

1. Choose one clean candidate commit from `main`.
2. Align the tag, package and lockfile versions, updater version, and
   changelogs.
3. Run `./scripts/verify.sh` with Node 22, the documented shell tools,
   loopback networking, and a working Docker daemon.
4. Test a representative CS2/RCON deployment, including login, a
   CSRF-protected write, one read-only status request, and one controlled
   state-changing operation.
5. Run an updater dry run and supervised update on a Linux/systemd/SteamCMD
   host.
6. Test SQLite backup and restore, container health, graceful shutdown, and
   rollback with artifacts built from the candidate commit.
7. Review the tracked tree and release artifacts for credentials, local paths,
   databases, temporary files, and private host details.
8. Build source and container artifacts from the candidate commit. Record
   checksums, an SBOM, supported platforms, known limitations, and rollback
   instructions with the release.
9. If the panel's templates, styles, or demo changed, run
   `node design-preview/build.mjs` to refresh the static demo, then
   `node design-preview/verify.mjs`. Compare it with the application and test
   the session flow at desktop and mobile widths. The repository gate checks
   that its generated markup and styles match their sources.
10. Prepare release notes from the changelogs, create the tag, and publish the
    prerelease.

Run every release check against the same candidate commit. In the release
record, list the exact commands and tool versions, along with any skipped checks
or environment problems. Source checks alone do not test Docker, CS2, RCON,
SteamCMD, systemd, Redis, or the production network.

## Rollback

Keep the previous source or image and a compatible database backup. To roll back
the control plane, stop the new container, restore the previous image and SQLite
backup, then check `/api/health` and make an authenticated, read-only status
request. To roll back the updater, restore the previous script, configuration,
and unit files before enabling its timer.
