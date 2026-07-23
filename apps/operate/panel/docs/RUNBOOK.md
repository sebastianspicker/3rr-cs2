# Runbook

## Purpose

Use this module to authenticate operators, store server inventory, and send RCON-backed actions to running CS2 servers.

## Prerequisites

- Node.js 22.x
- npm 10.x
- Docker for container deployment
- `shellcheck`, `shfmt`, `jq`, and `ruby` for `npm run validate`

## Environment

For local development, copy `.env.example` to `.env` and set the values needed
by the scenario.

For production, set:

- `SESSION_SECRET`
- `RCON_SECRET_KEY`
- `REDIS_URL`

Redis is required in production for shared sessions and rate-limit storage. It
must be reachable before the panel is considered ready.

Keep these production settings in place:

- set `TRUST_PROXY=1` behind a reverse proxy
- keep `SESSION_COOKIE_SECURE=true`

## First Administrator Bootstrap

For an empty database only, set `ALLOW_DEFAULT_CREDENTIALS=true` with
`DEFAULT_USERNAME` and `DEFAULT_PASSWORD`. Start the panel, confirm the
administrator exists, then remove those credentials and set
`ALLOW_DEFAULT_CREDENTIALS=false`. These bootstrap values are not production
runtime requirements after the first administrator is created.

## Build and Run

```bash
npm ci
npm run build
npm start
```

## SQLite Storage

The panel stores users, server inventory, access grants, operator favorites, and
RCON command history in SQLite. `DB_PATH` selects the database file. In the
container runtime the default is `/home/container/data/3rr.db`; local
development falls back to `./data/3rr.db` only when the container path is
unwritable and `DB_PATH` is unset.

When upgrading an installation created before the 3RR rebrand, stop the panel
and rename the legacy `cspanel.db` database file to `3rr.db` before starting
with the new defaults.
An explicitly configured `DB_PATH` remains authoritative. The default cookie name also changed,
so existing browser sessions are intentionally invalidated.

Migrations run at startup through `PRAGMA user_version`. The current schema is
`user_version = 3`.

Supported startup inputs are:

- an empty database or no schema at `user_version = 0`
- the pre-versioned inline panel schema at `user_version = 0`
- `user_version = 1` baseline schemas, including compatible databases where
  `users.is_admin` already exists
- `user_version = 2` admin schemas before operator favorites/history tables
- `user_version = 3` current schemas

Future schema versions and historical schemas missing required columns fail at
startup with an explicit unsupported-schema error. Back up `3rr.db` before
upgrades. Do not remove an older migration path unless a fixture test proves the
new boundary and the operator impact is documented.

## Validation

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run validate`

The umbrella repository adds a root-level `./scripts/verify.sh` that runs this module together with `maintain` and `provision`.
