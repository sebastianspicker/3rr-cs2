# Backup, restore, and recovery rehearsal

## In short

This guide covers the panel's (control plane's) SQLite database and a CS2 runtime.
**Rehearse every step on disposable paths before you rely on a backup.** Scheduling backups
and running these commands in production are your deployment's job; 3RR does not do them for
you.

The order of work:

1. Write a recovery record and confirm you can reach the RCON encryption key.
2. Stop the updater, CS2, and the panel.
3. Back up the database and its companion files as one set.
4. Back up CS2.
5. Restore the database **into a new location** and check it.
6. Restore CS2 **into a new location** and check it, including rollback.
7. Decide how to handle Redis.
8. Start services again in order, and switch automation back on last.

Rules that apply throughout:

- Never copy data while a service can still write it.
- Never overwrite or reuse an earlier backup.
- Never restore over the original.
- Never store the key with the backup.

## Before you start: the recovery record and the key

**The recovery record.** Before you stop any service, create a private record with:

- the repository revision;
- the current and candidate CS2 image digests;
- the installed CS2 build ID;
- plugin package names and versions;
- the checksum of `server-bootstrap/capabilities.json`;
- the repository CFG checksum manifest;
- the backup checksum manifest;
- the backup time;
- the name of the person who tested the restore.

The [deployment guide](../deploy/README.md) lists the exact field names.

**The RCON encryption key** (`RCON_SECRET_KEY`):

- Keep it **outside** the database backup, in your secret manager or in offline recovery
  escrow, under a separately controlled key reference.
- The recovery record may contain that reference and the key version, but **never the key
  itself**.
- Before you change anything, confirm that you can reach both the database backup and its
  matching key. Credentials stored as `enc:v1` cannot be decrypted with a missing or
  different key.

**Create a fresh backup folder.** Set `BACKUP_ROOT` to a private filesystem away from the
running host. These commands create a timestamped folder and stop if that path already
exists:

```bash
: "${BACKUP_ROOT:?Set BACKUP_ROOT to a private backup filesystem}"
RECOVERY_ID="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="${BACKUP_ROOT%/}/3rr/${RECOVERY_ID}"
sudo test ! -e "$BACKUP_DIR" || exit 1
sudo install -d -m 0700 "$BACKUP_DIR"
```

Do not reuse or overwrite an earlier backup.

## Stop services before copying data

Stop the updater's automation **first**. Then stop CS2 and the panel:

- If CS2 is managed by systemd, use the systemd commands.
- If you use the supplied Compose runtime, use the Compose command.
- Run both only if both deployments exist.

```bash
sudo systemctl stop 3rr-update.timer
sudo systemctl stop 3rr-update.service
sudo systemctl stop cs2.service

docker compose --env-file deploy/compose/server.env \
  -f deploy/compose/server-runtime.compose.yaml stop cs2-runtime

docker compose --env-file deploy/compose/panel.env \
  -f deploy/compose/control-plane.compose.yaml stop panel redis
```

**Confirm they are stopped before copying anything:**

- `systemctl is-active` should report `inactive`.
- `docker compose ps` should show no running `cs2-runtime` or `panel` container.

Never copy the main SQLite file while a process can still write its journal or WAL file.

## Back up the database

1. Set `DB_PATH_ON_HOST` to the actual file on the host behind `DB_PATH`. If you use the
   supplied named volume, inspect the volume to find the file; don't assume a Docker
   data-root path.
2. With the panel stopped, copy the main database and every companion file that exists, as
   one set:

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

The commands above:

- copy the database and each companion file with owner-only permissions;
- write a `SHA256SUMS` checksum file;
- immediately check the copies against it.

**Rules for the set:**

- The backup **must** contain the main database.
- A companion file (`-wal`, `-shm`, `-journal`) may be missing only if it did not exist after
  the clean stop.
- Keep companion files with the main file while checking and restoring.
- **Never mix in a companion file from another backup.**

## Back up CS2

Include all of the following:

- the complete persistent CS2 installation or Compose volume, including
  `steamapps/appmanifest_730.acf` (the file where Steam records the installed build);
- private bootstrap files such as `admins.json` and `admin_groups.json`, with their
  owner-only permissions;
- private server CFG files and the generated `3rr-secrets.cfg`, or source secrets held
  separately that are enough to recreate it;
- the repository CFG bundle from `server-bootstrap/assets/cfg`, and the exact repository
  revision;
- every installed map and plugin, with package name, version, and upstream artifact checksum
  where available.

Read and record the installed build ID from the stopped volume, and record the repository
checksums:

```bash
: "${CS2_VOLUME:?Set CS2_VOLUME to the stopped CS2 installation root}"
awk -F'"' '$2 == "buildid" && $4 != "" { print $4; exit }' \
  "$CS2_VOLUME/steamapps/appmanifest_730.acf"
sha256sum server-bootstrap/capabilities.json
find server-bootstrap/assets/cfg -type f -print0 | sort -z | xargs -0 sha256sum \
  | sudo tee "$BACKUP_DIR/repository-cfg.SHA256SUMS" > /dev/null
sudo chmod 0600 "$BACKUP_DIR/repository-cfg.SHA256SUMS"
```

Then:

1. Copy the stopped CS2 volume, the private bootstrap files, the repository CFG bundle, and
   the plugin-version list into private subfolders under `BACKUP_DIR`. Keep their ownership
   and modes.
2. Generate and check a checksum manifest for the **complete** backup, using the same
   `find | sort | sha256sum` pattern as for the database.
3. Check it again after moving the backup off the host.

## Restore the database in a separate location

Restore into an empty private folder and leave the original untouched:

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

The checksums are checked both before and after copying.

**Prepare the restored panel:**

1. Give the restored folder and files to the actual user the panel runs as. Inspect the
   deployed image or the existing volume to find the correct UID (numeric user ID), and add
   it to the recovery record.
2. Create a private Compose override file. In it:
   - mount `RESTORE_DB_DIR` at `/home/container/data`;
   - set `DB_PATH` to `/home/container/data/` followed by the restored database's file name;
   - provide the matching `RCON_SECRET_KEY` from its separate storage.
3. Set `RECOVERY_OVERRIDE` to the path of that override file.
4. Before you start any service, add the new, empty Redis volume to the override. See
   [Redis: fresh start or restore](#redis-fresh-start-or-restore). Keep the original Redis
   volume intact.

Start Redis and the panel, then check the restored database and credentials:

```bash
docker compose --env-file deploy/compose/panel.env \
  -f deploy/compose/control-plane.compose.yaml \
  -f "${RECOVERY_OVERRIDE:?Set RECOVERY_OVERRIDE to the private override file}" \
  up -d redis panel
curl --fail --silent --show-error http://127.0.0.1:3000/api/health
```

**Checks:**

- Sign in and make one signed-in, **read-only** server status request.
- **Wrong-key test** (rehearsal): provide a known wrong key and confirm that the panel
  *cannot* decrypt a stored RCON credential. Restore the correct key before you continue.
- Confirm that restored folders use mode `0700`, and that the database, companion,
  bootstrap, and private CFG files use mode `0600`.
- Compare the source and backup checksums again to make sure the rehearsal changed neither
  copy.

## Restore CS2 in a separate location

Restore the CS2 volume to an empty path or a new named volume. Check the full backup manifest
before copying, and check it again at the destination. Then confirm:

1. `appmanifest_730.acf` contains the recorded build ID.
2. The repository CFG checksums match the recorded repository revision.
3. The bootstrap and private CFG files are owner-only and contain the intended deployment
   data.
4. Every required plugin ID in `server-bootstrap/capabilities.json` maps to an installed,
   recorded plugin package and version.
5. The selected `CS2_IMAGE` equals the recorded, immutable candidate digest.

**Rollback rehearsal.** Keep the original volume and the previous image digest intact, then:

1. Start the restored runtime against the new volume.
2. Check CS2 startup, the configured map, local RCON login, and plugin loading.
3. Stop the restored runtime.
4. Confirm that the previous image still starts with the original volume.

That last check completes the rollback rehearsal.

## Redis: fresh start or restore

**Default: start Redis empty.** This ends all active logins and resets rate-limit counters.

1. In the private Compose override, replace the `redis` service's `/data` mount with a new
   named volume, for example `redis-recovery-data`.
2. Keep the existing `panel-redis` volume.
3. Confirm the new volume is empty.
4. Start Redis with the override **before** starting the restored panel.

**Restore Redis data only if your deployment needs logins to survive.** In that case:

1. Document the decision.
2. Stop Redis after the panel.
3. Back up the Redis volume separately.
4. Rehearse that restore separately.

If you cannot confirm the copy's integrity or that the key matches, discard it and make users
sign in again.

## Bring services back in order

After the separate restore passes its checks:

1. Start Redis, then the panel, then the CS2 runtime.
2. Check:
   - `/api/health`;
   - sign-in;
   - a read-only status request;
   - local RCON;
   - the build ID;
   - CFG checksums;
   - plugin versions.
3. Run the updater once with `--dry-run` (it reports what it would do without doing it), then
   once as a normal run while you watch.
4. Turn `3rr-update.timer` back on **only after every check passes**.

Keep the controls that change server state disabled until both the panel and CS2 work as
expected.

## Verify your recovery procedure

A disposable recovery rehearsal should cover your own backup layout and
deployment. The repository build checks do not exercise:

- a production backup;
- a secret manager;
- a Docker volume;
- CS2 or RCON;
- Redis;
- SteamCMD or systemd;
- a network path.

Only your own rehearsal on disposable paths shows that your backups can actually be restored.

See also: the [panel runbook](../control-plane/docs/RUNBOOK.md#backup-and-recovery) for the
short version, and [Architecture](architecture.md#where-data-lives) for what data lives where.

## Glossary

- **Checksum / `SHA256SUMS`**: a fingerprint of each file, and the file that lists them. Used
  to prove a copy is identical to the original.
- **Companion files**: the `-wal`, `-shm`, and `-journal` files SQLite may keep next to the
  database. Also called sidecars.
- **Compose override**: an extra Compose file that changes settings of the main one without
  editing it.
- **Dry run (`--dry-run`)**: running the updater so it reports what it would do without doing
  it.
- **`enc:v1`**: the format used for encrypted stored RCON passwords.
- **Escrow**: keeping a secret with a trusted custodian, offline, for recovery.
- **Image digest**: a fixed identifier for one exact container image version.
- **Named volume**: storage that Docker manages for a container.
- **Panel (control plane)**: 3RR's web application.
- **RCON encryption key (`RCON_SECRET_KEY`)**: the key that encrypts stored RCON passwords.
- **Redis**: the data store for login sessions and rate limits.
- **Rollback**: going back to the previous working version.
- **systemd timer**: a scheduled trigger; `3rr-update.timer` starts the updater automatically.
- **UID**: the numeric ID of a Linux user.
