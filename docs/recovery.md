# Recovery rehearsal and restore

This guide covers the control-plane SQLite database and a CS2 runtime. Rehearse
the steps with disposable paths before relying on a backup. Scheduling backups
and running these commands in production remain deployment responsibilities.

## Record the backup and protect the key

Before stopping any service, create a private recovery record. Include the
repository revision, current and candidate CS2 image digests, installed CS2
build ID, plugin package names and versions, the checksum of
`server-bootstrap/capabilities.json`, the repository CFG checksum manifest, the
backup checksum manifest, the backup time, and the name of the person who tested
the restore. [The deployment guide](../deploy/README.md) lists the exact field
names.

Keep `RCON_SECRET_KEY` outside the database backup. Store it in the deployment's
secret manager or in offline recovery escrow, under a separately controlled key
reference. The recovery record may contain that reference and key version, but
never the key itself. Before making a change, confirm that you can access both
the database backup and its matching key. Credentials stored as `enc:v1` cannot
be decrypted with a missing or different key.

Set `BACKUP_ROOT` to a private filesystem away from the running host. These
commands create a timestamped directory and stop if that path already exists:

```bash
: "${BACKUP_ROOT:?Set BACKUP_ROOT to a private backup filesystem}"
RECOVERY_ID="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="${BACKUP_ROOT%/}/3rr/${RECOVERY_ID}"
sudo test ! -e "$BACKUP_DIR" || exit 1
sudo install -d -m 0700 "$BACKUP_DIR"
```

Do not reuse or overwrite a prior backup.

## Stop services before copying data

Disable updater automation first. For a CS2 server managed by systemd, use the
systemd stop command. For the supplied Compose runtime, use the Compose stop
command. Run both only when both deployments exist.

```bash
sudo systemctl stop 3rr-update.timer
sudo systemctl stop 3rr-update.service
sudo systemctl stop cs2.service

docker compose --env-file deploy/compose/server.env \
  -f deploy/compose/server-runtime.compose.yaml stop cs2-runtime

docker compose --env-file deploy/compose/panel.env \
  -f deploy/compose/control-plane.compose.yaml stop panel redis
```

Before copying any files, confirm that the CS2 runtime and panel are stopped.
`systemctl is-active` should report `inactive`, and `docker compose ps` should
show no running `cs2-runtime` or `panel` container. Never copy the SQLite main
file while a process can still write its journal or WAL.

## Back up the SQLite files

Set `DB_PATH_ON_HOST` to the actual host file behind `DB_PATH`. If you use the
supplied named volume, inspect it to find the file instead of assuming a Docker
data-root path. Once the panel is stopped, copy the main database and every
sidecar that exists as one set:

```bash
: "${DB_PATH_ON_HOST:?Set DB_PATH_ON_HOST to the resolved SQLite file}"
sudo test -f "$DB_PATH_ON_HOST" || exit 1
sudo install -d -m 0700 "$BACKUP_DIR/control-plane"
for source in \
  "$DB_PATH_ON_HOST" \
  "$DB_PATH_ON_HOST-wal" \
  "$DB_PATH_ON_HOST-shm" \
  "$DB_PATH_ON_HOST-journal"; do
  if sudo test -f "$source"; then
    sudo install -m 0600 "$source" "$BACKUP_DIR/control-plane/$(basename "$source")"
  fi
done
sudo sh -c 'cd "$1" && find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS' \
  sh "$BACKUP_DIR/control-plane"
sudo chmod 0600 "$BACKUP_DIR/control-plane/SHA256SUMS"
sudo sh -c 'cd "$1" && sha256sum -c SHA256SUMS' sh "$BACKUP_DIR/control-plane"
```

The backup must contain the main database. A sidecar is optional only if it did
not exist after the clean stop. Keep any `-wal`, `-shm`, and `-journal` files
with the main file while checking and restoring the backup. Never mix in a
sidecar from another backup.

## Back up CS2

Include all of the following:

- the complete persistent CS2 installation or Compose volume, including
  `steamapps/appmanifest_730.acf`;
- private bootstrap files such as `admins.json` and `admin_groups.json`, with
  their owner-only permissions;
- private server CFG and generated `3rr-secrets.cfg`, or independently held
  source secrets sufficient to recreate it;
- the repository CFG bundle from `server-bootstrap/assets/cfg` and the exact
  repository revision;
- every installed map and plugin, with package name, version, and upstream
  artifact checksum where available.

Read and record the installed build ID from the stopped volume:

```bash
: "${CS2_VOLUME:?Set CS2_VOLUME to the stopped CS2 installation root}"
awk -F'"' '$2 == "buildid" && $4 != "" { print $4; exit }' \
  "$CS2_VOLUME/steamapps/appmanifest_730.acf"
sha256sum server-bootstrap/capabilities.json
find server-bootstrap/assets/cfg -type f -print0 | sort -z | xargs -0 sha256sum \
  | sudo tee "$BACKUP_DIR/repository-cfg.SHA256SUMS" > /dev/null
sudo chmod 0600 "$BACKUP_DIR/repository-cfg.SHA256SUMS"
```

Copy the stopped CS2 volume, private bootstrap files, repository CFG bundle,
and plugin-version list into private subdirectories under `BACKUP_DIR`.
Preserve their ownership and modes. Generate and check a checksum manifest for
the complete backup with the same `find | sort | sha256sum` pattern used for
SQLite. Check it again after transferring the backup off the host.

## Restore SQLite in a separate location

Restore into an empty private directory and leave the original untouched:

```bash
: "${RESTORE_ROOT:?Set RESTORE_ROOT to a private restore filesystem}"
RESTORE_DB_DIR="${RESTORE_ROOT%/}/control-plane-data-${RECOVERY_ID}"
sudo test ! -e "$RESTORE_DB_DIR" || exit 1
sudo install -d -m 0700 "$RESTORE_DB_DIR"
DB_BASENAME=$(basename "$DB_PATH_ON_HOST")
sudo sh -eu -c '
  cd "$1"
  test -f "$3"
  sha256sum -c SHA256SUMS
  for source in "$3" "$3-wal" "$3-shm" "$3-journal"; do
    if test -f "$source"; then install -m 0600 "$source" "$2/$source"; fi
  done
  install -m 0600 SHA256SUMS "$2/SHA256SUMS"
  cd "$2"
  sha256sum -c SHA256SUMS
' sh "$BACKUP_DIR/control-plane" "$RESTORE_DB_DIR" "$DB_BASENAME"
```

Set the restored directory and files to the actual panel runtime owner. Inspect
the deployed image or existing volume to find the correct UID, and add it to the
recovery record. Create a private Compose override that mounts `RESTORE_DB_DIR`
at `/home/container/data`. In that override, set `DB_PATH` to
`/home/container/data/` plus the restored database basename and provide the
matching `RCON_SECRET_KEY` from its separate storage. Set `RECOVERY_OVERRIDE` to
the path of the override file.

Add the new, empty Redis volume described below to the private override before
starting any service. Keep the original Redis volume intact. Start Redis and
the panel, then check the restored database and credentials:

```bash
docker compose --env-file deploy/compose/panel.env \
  -f deploy/compose/control-plane.compose.yaml \
  -f "${RECOVERY_OVERRIDE:?Set RECOVERY_OVERRIDE to the private override file}" \
  up -d redis panel
curl --fail --silent --show-error http://127.0.0.1:3000/api/health
```

Sign in and make one authenticated, read-only server status request. As part of
the rehearsal, provide a known wrong key and confirm that the panel cannot
decrypt a stored RCON credential. Restore the correct key before continuing.
Confirm that restored directories use mode `0700` and that database, sidecar,
bootstrap, and private CFG files use mode `0600`. Compare the source and backup
checksums again to make sure the rehearsal did not modify either copy.

## Restore CS2 in a separate location

Restore the CS2 volume to an empty path or a new named volume. Check the full
backup manifest before copying and check it again at the destination. Confirm:

1. `appmanifest_730.acf` contains the recorded build ID.
2. Repository CFG checksums match the recorded repository revision.
3. Bootstrap and private CFG files are owner-only and contain the intended
   deployment data.
4. Every required plugin ID in `server-bootstrap/capabilities.json` maps to an
   installed, recorded plugin package and version.
5. The selected `CS2_IMAGE` equals the recorded immutable candidate digest.

Keep the original volume and previous image digest intact. Start the restored
runtime against the new volume and check CS2 startup, the configured map, local
RCON authentication, and plugin loading. Stop it, then confirm that the previous
image can still start with the original volume. This completes the rollback
rehearsal.

## Choose how to recover Redis

By default, recovery starts Redis with no existing data. This invalidates active
sessions and resets rate-limit counters. In a private Compose override, replace
the `redis` service's `/data` mount with a new named volume such as
`redis-recovery-data`. Keep the existing `panel-redis` volume. Confirm that the
new volume is empty, then start Redis with the override before starting the
restored panel.

Restore Redis data only when your deployment requires session continuity. In
that case, document the decision, stop Redis after the panel, back up its volume
separately, and rehearse that restore separately. If you cannot confirm the
copy's integrity or key continuity, discard it and require users to sign in
again.

## Bring services back in order

After the separate restore passes its checks, start Redis, then the panel, then
the CS2 runtime. Check `/api/health`, sign-in, read-only status, local RCON, the
build ID, CFG checksums, and plugin versions. Run the updater once with
`--dry-run`, followed by one supervised normal run. Re-enable
`3rr-update.timer` only after every check passes. Keep controls that change
server state disabled until both the control plane and CS2 work as expected.

The repository also includes checks for the backup and restore directory
layout:

```bash
bash scripts/recovery-layout-rehearsal.test.sh
cd control-plane
npm run build
node --test --test-name-pattern='recovery rehearsal' dist/test/integration/recovery-rehearsal.test.js
```

These commands do not test a production backup, secret manager, Docker volume,
CS2, RCON, Redis, SteamCMD, systemd, or network path.
