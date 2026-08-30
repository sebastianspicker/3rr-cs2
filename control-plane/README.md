# 3RR Control Plane

`control-plane` is the Node 22 Express/TypeScript application for authenticated
control of existing Counter-Strike 2 servers over RCON. It stores operational
state in SQLite, uses Redis for production sessions and rate limits, renders
EJS pages, and builds browser assets from maintained web sources.

It does not install or update CS2, CFG files, maps, or plugins, and it never
runs commands on a CS2 host.

## Architecture

`src/main.ts` is the sole process composition root. It constructs SQLite,
Redis, RCON, and the Express application. The dependency rules are enforced by
`npm run check:architecture`:

- `src/app`: composition, lifecycle, authentication, security, rate limits,
  and health
- `src/features`: HTTP routes and feature behavior
- `src/infrastructure`: SQLite, Redis, and logging
- `src/integrations`: RCON and external network boundary
- `src/shared`: dependency-leaf utilities
- `web/client`, `web/assets`, `web/views`: maintained browser sources
- `web/generated`: generated assets; do not edit directly

`features`, `infrastructure`, and `integrations` must not depend on `app`.
`shared` must not depend on any of those layers.

Keep RCON credential encoding in
`src/infrastructure/credentials/rconCredential.ts`, server-access behavior in
`src/features/server-access`, game-catalog data in `src/features/game-catalog`,
and RCON command parsing/policy in
`src/integrations/rcon/rconCommandPolicy.ts`.

## Install and run

```bash
npm ci
cp .env.example .env
```

Set `SESSION_SECRET` and `RCON_SECRET_KEY` in `.env`. In production,
`SESSION_SECRET` must be at least 32 characters and `RCON_SECRET_KEY` must be a
32-byte base64 or hex key.

For an empty database only, set `ALLOW_DEFAULT_CREDENTIALS=true`,
`DEFAULT_USERNAME`, and a 12-character-or-longer `DEFAULT_PASSWORD`; remove
them and set `ALLOW_DEFAULT_CREDENTIALS=false` after creating the first admin.

```bash
npm run build
node --env-file=.env dist/src/main.js
```

`npm start` runs the already-built `dist/src/main.js` with the environment
provided by the process. `npm run dev` watches the application after building
web assets.

## Configuration

| Variable                  | Required        | Default                       | Purpose                                                   |
| ------------------------- | --------------- | ----------------------------- | --------------------------------------------------------- |
| `SESSION_SECRET`          | Production      | Development-only fallback     | Signs session cookies; production requires 32+ characters |
| `RCON_SECRET_KEY`         | Production      | Unset                         | Encrypts stored RCON passwords as `enc:v1` values         |
| `REDIS_URL`               | Production      | Unset                         | Redis sessions and rate limits                            |
| `PORT`                    | No              | `3000`                        | HTTP port                                                 |
| `DB_PATH`                 | No              | `/home/container/data/3rr.db` | SQLite file                                               |
| `TRUST_PROXY`             | Proxy-dependent | `false`                       | Explicit trusted proxy configuration                      |
| `SESSION_COOKIE_SECURE`   | No              | `true` in production          | Requires HTTPS when enabled                               |
| `SESSION_COOKIE_SAMESITE` | No              | `strict`                      | Cookie SameSite mode                                      |
| `SESSION_COOKIE_NAME`     | No              | `3rr.sid`                     | Session cookie name                                       |
| `SESSION_MAX_AGE_MS`      | No              | `86400000`                    | Rolling session lifetime                                  |
| `RCON_COMMAND_TIMEOUT_MS` | No              | `2000`                        | RCON command timeout                                      |
| `HEALTHCHECK_VERBOSE`     | No              | `false`                       | Enables detailed health output                            |

`PANEL_BIND_ADDRESS` belongs to
[`../deploy/compose/control-plane.compose.yaml`](../deploy/compose/control-plane.compose.yaml),
not the Node process. The full shared contract is in
[../docs/reference/env.md](../docs/reference/env.md).

## Commands

```bash
npm run check
npm run validate -- --require-docker
npm run ci
```

`npm run check` runs format, lint, architecture, type, unit/integration/contract
tests, and build checks. The Docker validation command verifies deployment
configuration but does not validate a live CS2/RCON environment.

## Deployment and safety

Start the supplied control-plane and Redis deployment from a local env file:

```bash
docker compose --env-file ./panel.env \
  -f ../deploy/compose/control-plane.compose.yaml up --build
```

It binds `127.0.0.1:3000` by default and does not terminate TLS. Put it behind
a TLS reverse proxy, set `TRUST_PROXY` only to known hops, and restrict RCON
access to the control-plane network.

SQLite migrations are forward-only through `PRAGMA user_version`; version 3 is
currently supported. Back up the database before upgrading. Preserve CSRF on
authenticated state-changing routes, per-server serialized RCON commands,
explicit RCON connection/authentication state, timeouts, network validation,
and the one-command printable-ASCII console policy.

Read [docs/API.md](docs/API.md), [docs/RUNBOOK.md](docs/RUNBOOK.md),
[docs/SERVER-SETUP.md](docs/SERVER-SETUP.md), and
[docs/FRONTEND.md](docs/FRONTEND.md) before changing their respective
contracts.
