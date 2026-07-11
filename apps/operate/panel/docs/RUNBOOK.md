# Runbook

## Purpose

Use this module to authenticate operators, store server inventory, and send RCON-backed actions to running CS2 servers.

## Prerequisites

- Node.js 22.x
- npm 10.x
- Docker for container deployment
- `shellcheck`, `shfmt`, `jq`, and `ruby` for `npm run validate`

## Environment

Copy `.env.example` to `.env` and set at least:

- `SESSION_SECRET`
- `RCON_SECRET_KEY`
- `DEFAULT_USERNAME`
- `DEFAULT_PASSWORD`

For production:

- prefer Redis-backed sessions
- set `TRUST_PROXY=1` behind a reverse proxy
- keep `SESSION_COOKIE_SECURE=true`

## Build and Run

```bash
npm ci
npm run build
npm start
```

## SQLite Storage

The panel stores users, server inventory, access grants, operator favorites, and
RCON command history in SQLite. `DB_PATH` selects the database file. In the
container runtime the default is `/home/container/data/cspanel.db`; local
development falls back to `./data/cspanel.db` only when the container path is
unwritable and `DB_PATH` is unset.

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
startup with an explicit unsupported-schema error. Back up `cspanel.db` before
upgrades. Do not remove an older migration path unless a fixture test proves the
new boundary and the operator impact is documented.

## Validation

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run validate`

The umbrella repository adds a root-level `./scripts/verify.sh` that runs this module together with `maintain` and `provision`.
