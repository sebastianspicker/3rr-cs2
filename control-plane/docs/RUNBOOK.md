# Control plane operations

## Prerequisites

- Node.js 22
- npm
- Redis for production
- Docker with Compose for the included container deployment
- `shellcheck`, `shfmt`, `jq`, and `ruby` for validation

## Initial configuration

```bash
cd control-plane
npm ci
cp -n .env.example .env
chmod 0600 .env
```

Production requires:

- `SESSION_SECRET` to a strong value of at least 32 characters; placeholders,
  repeated or sequential values, and single-character-class values are rejected
- `RCON_SECRET_KEY` to a 32-byte base64 or hex key
- `REDIS_URL` to a reachable Redis instance

Keep `SESSION_COOKIE_SECURE=true` when the application runs behind HTTPS. Set
`TRUST_PROXY` only to the known reverse-proxy hop count. The included Compose
file starts Redis and publishes the control plane on the loopback interface.

## First administrator

For an empty database, set `ALLOW_DEFAULT_CREDENTIALS=true`, choose a
`DEFAULT_USERNAME`, and set `DEFAULT_PASSWORD` to a value of at least 12
characters.

Production rejects known placeholder passwords even when they meet the minimum
length.

Start the control plane and sign in with this account. Then remove
`DEFAULT_USERNAME` and `DEFAULT_PASSWORD`, set
`ALLOW_DEFAULT_CREDENTIALS=false`, and restart the application.

If the database already contains a user, the application does not create
another administrator from these variables.

## Build and start

```bash
npm run build
node --env-file=.env dist/src/main.js
```

The process listens on `PORT`, which defaults to `3000`. `npm start` runs the
same compiled entry point, but it only sees variables already present in the
process environment and does not load `.env`.

## Storage and migrations

`DB_PATH` sets the location of the SQLite database. The default is
`/home/container/data/3rr.db`. When `DB_PATH` is unset outside production and
the default path cannot be opened, the application can fall back to
`./data/3rr.db`.

In production, the database directory must be owned by the control-plane user
or root and cannot be writable by the group or everyone. An existing database
must be a regular file with one link, owned by the control-plane user or root,
and have mode `0600`. New databases are created with mode `0600`. Startup
rejects a database path that is a symbolic or hard link.

Startup reads `PRAGMA user_version` and applies forward migrations. Schema
version 3 is current. The application can open:

- an empty database
- the compatible pre-versioned schema
- schema versions 1 and 2
- schema version 3

A database with a newer version, or one that is missing required columns,
causes startup to fail. Back up the database before upgrading.

If an installation still uses the former default filename `cspanel.db`, either
set `DB_PATH` to that file or stop the application and rename it to `3rr.db`.
The default session cookie is now named `3rr.sid`; sessions stored under the
former name do not carry over.

## Health and shutdown

Anyone can request `GET /api/health`. By default, its response contains only
`ok` and `ready`. Authenticated callers, and deployments with
`HEALTHCHECK_VERBOSE=true`, also receive database, Redis, and RCON
initialization details.

The endpoint returns `503` when SQLite is unhealthy or a configured Redis
connection is unhealthy.

`SIGTERM` and `SIGINT` begin a graceful shutdown of the HTTP server, RCON
connections, Redis client, and SQLite connection. The process has 15 seconds to
finish. A second signal forces it to exit.

## Validation

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run validate -- --require-docker
```

`npm run validate` does not require Docker unless you pass
`--require-docker`. From the repository root, `./scripts/verify.sh` runs these
checks together with the host-updater and server-bootstrap checks.

## Backup and recovery

Stop the application before making a file-level SQLite backup. Copy `DB_PATH`
and every existing `-wal`, `-shm`, and `-journal` sidecar together as one
consistent set. Store the files in a private directory, set the database and
sidecars to mode `0600`, and verify checksums before and after transferring
them.

Store `RCON_SECRET_KEY` separately from the database backup. With the backup,
record only the key's secret-manager reference and version. Without the matching
key, the application cannot decrypt the stored `enc:v1` RCON credentials.

Restore into an empty private directory with a compatible application version,
leaving the source backup unchanged. Verify checksums and permissions, then
start the control plane with the restored database and matching key. Check
`/api/health`, sign in, and make one authenticated, read-only server-status
request before allowing operators to change server state.

A normal recovery starts Redis with new sessions and rate-limit counters. Only
restore Redis when the deployment has an explicit persistence policy that
requires session continuity and a verified backup of that state.

See [the recovery guide](../../docs/recovery.md) for the complete stop,
checksum, new-location restore, CS2 layout, plugin-version, rollback, and
disposable rehearsal procedure.
