# Releasing A Public Alpha

This repository uses umbrella prerelease tags such as `v1.1.0-alpha.1`. The
panel package is private, but its version and lockfile remain aligned with the
umbrella candidate. The updater keeps its own script version and changelog.

`RELEASE_STATUS.md` is the authoritative evidence ledger for the next candidate. A green local
subset is useful development evidence, but it does not authorize a tag or GitHub release.

## Alpha Scope

The public alpha covers:

- static bootstrap examples for a self-hosted CS2 runtime;
- the host/systemd updater with bounded SteamCMD execution; and
- the authenticated panel for inventory, status, and RCON-backed operations.

It does not claim hosted operation, automatic host provisioning, Pterodactyl runtime support,
or production readiness for untested network and deployment topologies.

## Candidate Checklist

1. Reconcile the release branch with `main` and freeze one clean candidate commit.
2. Verify badges, advisory links, and clone instructions against the canonical
   `sebastianspicker/cs2-server-ops` repository.
3. Align the proposed tag, root changelog, panel package and lock version, updater version, module changelogs, and
   `RELEASE_STATUS.md`.
4. Confirm public docs describe the implementation and that every view in the panel's
   [screenshot capture manifest](../apps/operate/panel/docs/screenshots/README.md) is a sanitized
   capture from the exact candidate.
5. Run `./scripts/verify.sh` with Node 22, the documented shell tools, loopback networking, and
   a working Docker daemon.
6. Exercise one production-like CS2/RCON deployment, updater dry-run and supervised update,
   container health/readiness, graceful shutdown, and recovery flow.
7. Review the tracked file list for credentials, local paths, generated tool state, internal
   ledgers, and unreviewed images.
8. Build source and container artifacts from the exact commit and record an
   SBOM, checksums, supported platforms, known limitations, and rollback
   instructions. Do not publish the private panel package to npm.
9. Draft the GitHub prerelease notes from the changelogs. Create the tag and publish only after
   owner approval and all required evidence is attached.

## Verification Record

Record exact commands, versions, test totals, skipped checks, environmental blockers, and the
candidate commit in `RELEASE_STATUS.md`. Do not generalize a focused test result to the full
repository or substitute remote CI from a different commit.

## Rollback

Keep the previous verified image/source artifact and database backup available. For the panel,
stop the new container, restore the previous image and compatible SQLite backup, then verify
`GET /api/health` and one authenticated read-only server-status flow. For updater changes,
restore the previous script/config/unit files before re-enabling the timer.
