# Operate panel runbook

## Prerequisites

- Node.js 22
- npm
- Redis for production
- Docker with Compose for the included container deployment
- `shellcheck`, `shfmt`, `jq`, and `ruby` for validation

## Initial configuration

```bash
cd apps/operate/panel
npm ci
cp .env.example .env
```

For production, set:

- `SESSION_SECRET` to a value of at least 32 characters
- `RCON_SECRET_KEY` to a 32-byte base64 or hex key
- `REDIS_URL` to a reachable Redis instance

Keep `SESSION_COOKIE_SECURE=true` behind HTTPS. Set `TRUST_PROXY` only to the
known reverse-proxy hop count. The included Compose file provides Redis and
publishes the panel on loopback.

## First administrator

On an empty database, set `ALLOW_DEFAULT_CREDENTIALS=true`, choose a
`DEFAULT_USERNAME`, and set `DEFAULT_PASSWORD` to a local value of at least 12
characters.

Start the panel and sign in. Then remove `DEFAULT_USERNAME` and
`DEFAULT_PASSWORD`, set `ALLOW_DEFAULT_CREDENTIALS=false`, and restart the
panel.

The application does not create another administrator when the database already
contains a user.

## Build and start

```bash
npm run build
node --env-file=.env dist/app.js
```

The process listens on `PORT`, which defaults to `3000`. `npm start` is
equivalent only when the variables have already been exported into the process
environment; it does not load `.env`.

## Storage and migrations

`DB_PATH` selects the SQLite file. The default is
`/home/container/data/3rr.db`. When `DB_PATH` is unset outside production and
that path cannot be opened, the application can use `./data/3rr.db`.

Startup migrations use `PRAGMA user_version`. The current schema version is 3.
Supported inputs are:

- an empty database
- the compatible pre-versioned schema
- schema versions 1 and 2
- schema version 3

A database with a newer version or missing required columns fails at startup.
Back up the database before upgrading.

Installations that used the former default `cspanel.db` filename must either set
`DB_PATH` explicitly or stop the panel and rename that file to `3rr.db`. The
default cookie name is now `3rr.sid`, so sessions created with the former name
do not carry over.

## Health and shutdown

`GET /api/health` is unauthenticated. Its default response contains only `ok`
and `ready`. Authenticated callers, or deployments with
`HEALTHCHECK_VERBOSE=true`, also receive database, Redis, and RCON
initialization details.

The endpoint returns `503` when SQLite is unhealthy or a configured Redis
connection is unhealthy.

`SIGTERM` and `SIGINT` start graceful shutdown of the HTTP server, RCON
connections, Redis client, and SQLite connection. The shutdown deadline is 15
seconds. A second signal forces exit.

## Validation

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
npm run validate -- --require-docker
```

`npm run validate` alone does not require Docker. The repository-level
`./scripts/verify.sh` runs the panel checks with the maintain and provision
checks.

## Backup and recovery

Stop the panel before taking a file-level SQLite backup. Protect the database
and backup because they can contain encrypted or plaintext RCON credentials,
depending on how the database was created and whether `RCON_SECRET_KEY` was
configured.

Restore a database only with a compatible application version. Start the panel,
check `/api/health`, sign in, and test a read-only server status request before
resuming operator changes.
