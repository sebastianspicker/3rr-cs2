# Releasing a public alpha

Umbrella prerelease tags use a form such as `v1.1.0-alpha.1`. The panel package
is private, but its package and lockfile versions must match the repository
candidate. The updater has its own script version and changelog.

`RELEASE_STATUS.md` records the current candidate, completed checks, blocked
checks, and remaining work. A partial local run does not authorize a tag.

## Release scope

A repository release can include:

- provision examples and startup files
- the Linux/systemd updater
- the authenticated operate panel

It does not imply hosted operation, automatic host provisioning, Pterodactyl
runtime support, or support for untested network and deployment topologies.

## Candidate procedure

1. Select one clean candidate commit from `main`.
2. Verify badge links, advisory links, and clone instructions against
   `sebastianspicker/3rr`.
3. Align the proposed tag, package and lockfile version, updater version,
   changelogs, and `RELEASE_STATUS.md`.
4. Run `./scripts/verify.sh` with Node 22, the documented shell tools, loopback
   networking, and a working Docker daemon.
5. Test one representative CS2 and RCON deployment, updater dry run and
   supervised update, container health, graceful shutdown, backup, and restore.
6. Run `npm run screenshots` from `apps/operate/panel` at the candidate commit.
   Review every image using the
   [screenshot manifest](../apps/operate/panel/docs/screenshots/README.md).
7. Review tracked files for credentials, tokens, local paths, databases,
   temporary files, and private host details.
8. Build source and container artifacts from the selected commit. Record
   checksums, an SBOM, supported platforms, known limitations, and rollback
   instructions. Do not publish the private panel package to npm.
9. Prepare GitHub prerelease notes from the changelogs. Create the tag and
   publish only after owner approval.

## Verification record

Record exact commands, tool versions, test totals, skipped checks,
environmental blockers, and the candidate commit in `RELEASE_STATUS.md`. Do not
apply results from another commit or a smaller test subset to the candidate.

## Rollback

Keep the previous source or image artifact and a compatible database backup.
For the panel, stop the new container, restore the previous image and SQLite
backup, then verify `/api/health` and an authenticated read-only status request.
For the updater, restore the previous script, configuration, and unit files
before enabling the timer.
