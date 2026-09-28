# Running the panel (control plane)

## At a glance

1. Install Node 26 and npm. For production you also need Redis, and Docker Compose if you use
   the container setup.
2. Create `.env` and set the session secret, the RCON encryption key, and the Redis address.
3. Create the first administrator once, then turn default credentials off.
4. Build and start the panel.
5. Back up the database, and store the RCON encryption key somewhere else.

Two mistakes cause the worst outcomes, and both are covered below:

- **Losing the RCON encryption key** makes the stored RCON passwords unreadable.
- **Copying the database while the panel is running** can produce a broken backup.

## What you need

- Node.js 26
- npm
- Redis, for production
- Docker with Compose, for the included container deployment
- `shellcheck`, `shfmt`, `jq`, and `ruby`, for configuration validation

## Configure

```bash
cd control-plane
npm ci
cp -n .env.example .env
chmod 0600 .env
```

`chmod 0600` makes the settings file readable and writable only by its owner.

Production requires three settings, and the panel checks each one:

| Setting           | Requirement                                                                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SESSION_SECRET`  | A strong value of **at least 32 characters**. Placeholders, repeated or sequential values, and values that use only one kind of character are rejected. |
| `RCON_SECRET_KEY` | The RCON encryption key: a **32-byte key in base64 or hex**.                                                                                            |
| `REDIS_URL`       | The address of a Redis instance the panel can reach.                                                                                                    |

- Keep `SESSION_COOKIE_SECURE=true` when the panel runs behind HTTPS.
- Set `TRUST_PROXY` only to the known number of reverse proxies in front of the panel (the
  "hop count").
- The included Compose file starts Redis and makes the panel reachable only from the host
  itself (the loopback interface).

## Create the first administrator

On an **empty** database:

1. Set `ALLOW_DEFAULT_CREDENTIALS=true`, choose a `DEFAULT_USERNAME`, and set
   `DEFAULT_PASSWORD` to **at least 12 characters**. In production, known placeholder
   passwords are rejected even when they are long enough.
2. Start the panel and sign in with this account.
3. Remove `DEFAULT_USERNAME` and `DEFAULT_PASSWORD`, set `ALLOW_DEFAULT_CREDENTIALS=false`,
   and restart.

If the database already contains a user, these settings do **not** create another
administrator.

## Build and start

```bash
npm run build
node --env-file=.env dist/src/main.js
```

The panel listens on `PORT`, which defaults to `3000`.

**Watch out:** `npm start` runs the same compiled program but does **not** load `.env`. It sees
only variables already present in the process environment.

## Database location, permissions, and upgrades

**Location.** `DB_PATH` sets where the SQLite database lives. The default is
`/home/container/data/3rr.db`. Outside production, if `DB_PATH` is unset and the default path
cannot be opened, the panel can fall back to `./data/3rr.db`.

**Permissions in production.** The panel refuses to start unless all of these hold:

- The database folder is owned by the panel's user or root, and neither the group nor anyone
  else can write to it.
- An existing database is a regular file with exactly one link, owned by the panel's user or
  root, with mode `0600` (owner-only).
- The database path is not a symbolic link or a hard link.

New databases are created with mode `0600`.

**Automatic upgrades.** At startup the panel reads the database's version number
(`PRAGMA user_version`) and applies forward database migrations. Version 3 is current. The
panel can open:

- an empty database;
- the compatible pre-versioned schema (from before version numbers were used);
- schema versions 1 and 2;
- schema version 3.

A database with a **newer** version, or one that is missing required columns, stops startup.
**Back up the database before every upgrade.**

**Coming from an older install.**

- If you still use the former default filename `cspanel.db`, either point `DB_PATH` at it, or
  stop the panel and rename the file to `3rr.db`.
- The session cookie is now called `3rr.sid`. Sessions stored under the old name do not carry
  over, so everyone signs in again once.

## Health checks and shutdown

- Anyone can request `GET /api/health`. By default the answer contains only `ok` and `ready`.
- Signed-in callers, and deployments with `HEALTHCHECK_VERBOSE=true`, also see database,
  Redis, and RCON startup details.
- It returns HTTP `503` (service unavailable) when SQLite is unhealthy, or when a configured
  Redis connection is unhealthy.
- It does not check your CS2 servers or the updater (see
  [Architecture](../../docs/architecture.md#deployment-startup-and-shutdown)).

**Shutdown.** `SIGTERM` or `SIGINT` starts a graceful shutdown of the web server, the RCON
connections, the Redis client, and the SQLite connection. The process has 15 seconds to
finish. A second signal forces it to exit.

## Checking the code before deploying

```bash
npm run typecheck
npm run build
npm run validate -- --require-docker
```

`npm run validate` needs Docker only when you pass `--require-docker`.

## Backup and recovery

**Back up**

1. **Stop the panel first.** Never copy the database while it is running.
2. Copy the database file (`DB_PATH`) **together with** every companion file that exists
   (`-wal`, `-shm`, `-journal`), as one consistent set.
3. Store them in a private folder and set the database and companion files to mode `0600`.
4. Verify checksums before and after moving the files.

**The key**

- Store the RCON encryption key (`RCON_SECRET_KEY`) **separately** from the database backup.
- With the backup, record only where the key is kept (its secret-manager reference) and its
  version, never the key itself.
- Without the matching key, the panel cannot decrypt the stored `enc:v1` RCON credentials.

**Restore**

1. Restore into an empty private folder with a compatible panel version. Leave the source
   backup unchanged.
2. Verify checksums and permissions.
3. Start the panel with the restored database and the matching key.
4. Check `/api/health`, sign in, and make one signed-in, **read-only** server-status request.
5. Only after that, let operators change server state.

**Redis after a restore.** A normal recovery starts Redis empty, with new sessions and
rate-limit counters, so users sign in again. Restore Redis only if your deployment has an
explicit persistence policy that needs session continuity, **and** you have a verified backup
of that state.

For the complete procedure, see the [recovery guide](../../docs/recovery.md). It covers
stopping services, checksums, restoring to a new location, the CS2 layout, plugin versions,
rollback, and a disposable rehearsal.

## Glossary

- **Checksum**: a fingerprint of a file (here SHA-256), used to prove a copy is identical.
- **Companion files**: the `-wal`, `-shm`, and `-journal` files SQLite may keep next to the
  database. They belong to it and must be copied with it. Also called sidecars.
- **Database migration**: an automatic, forward-only upgrade of the database structure at
  startup.
- **`enc:v1`**: the format used for encrypted stored RCON passwords.
- **File mode `0600`**: readable and writable by the owner only.
- **Hard link / symbolic link**: a second name or pointer for a file; not allowed for the
  database path.
- **Loopback interface**: `127.0.0.1`, reachable only from the same machine.
- **Panel (control plane)**: 3RR's web application.
- **RCON encryption key (`RCON_SECRET_KEY`)**: the key that encrypts stored RCON passwords.
- **Redis**: a data store for login sessions and rate limits in production.
- **Reverse proxy**: the HTTPS web server in front of the panel.
- **SIGTERM / SIGINT**: standard signals that ask a process to stop.
- **SQLite**: the single-file database that holds the panel's data.
