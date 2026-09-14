# 3RR control plane

The control plane is a Node 22 application for managing existing
Counter-Strike 2 servers over RCON. It provides an authenticated Express API
and EJS web interface, stores application data in SQLite, and uses Redis for
sessions and rate limits in production. The browser code is written in
TypeScript and bundled as part of the build.

It does not install or update CS2, configuration files, maps, or plugins. It
also never runs shell commands on a CS2 host.

## Architecture

`src/main.ts` starts the process and wires together SQLite, Redis, RCON, and
the Express application. `npm run check:architecture` enforces the source
dependencies:

- `src/app`: application assembly, lifecycle, authentication, security, rate
  limits, and health
- `src/features`: HTTP routes and feature behavior
- `src/infrastructure`: SQLite, Redis, and logging
- `src/integrations`: RCON and other external network connections
- `src/shared`: utilities that do not depend on another application layer
- `web/client`, `web/assets`, `web/views`: browser source files
- `web/generated`: generated assets; do not edit directly

The feature, infrastructure, and integration layers cannot import `app`, and
`shared` cannot import any other application layer.

Keep RCON credential encoding in
`src/infrastructure/credentials/rconCredential.ts`, server-access behavior in
`src/features/server-access`, game-catalog data in `src/features/game-catalog`,
and RCON command parsing/policy in
`src/integrations/rcon/rconCommandPolicy.ts`.

## Quick start

```bash
npm ci
cp -n .env.example .env
chmod 0600 .env
```

Set `SESSION_SECRET` and `RCON_SECRET_KEY` in `.env`. In production,
`SESSION_SECRET` must be a strong value of at least 32 characters and
`RCON_SECRET_KEY` must be a 32-byte base64 or hex key. Placeholder, repeated,
sequential, and single-character-class session secrets are rejected.

To create the first administrator in an empty database, set
`ALLOW_DEFAULT_CREDENTIALS=true`, `DEFAULT_USERNAME`, and a
`DEFAULT_PASSWORD` of at least 12 characters. After signing in, remove the
username and password from the environment, set
`ALLOW_DEFAULT_CREDENTIALS=false`, and restart the application. Production
rejects known placeholder passwords.

```bash
npm run build
node --env-file=.env dist/src/main.js
```

`npm start` runs the existing `dist/src/main.js` build with variables already
present in the process environment; it does not load `.env`. `npm run dev`
builds the web assets and watches the application for changes.

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

`PANEL_BIND_ADDRESS` configures
[`../deploy/compose/control-plane.compose.yaml`](../deploy/compose/control-plane.compose.yaml),
not the Node process. See [the environment reference](../docs/reference/env.md)
for every shared setting.

## Development and checks

```bash
npx playwright install chromium
npm run check
npm run validate -- --require-docker
npm run ci
```

`npm run check` checks formatting, lint rules, architecture, and browser types;
creates a clean build; and runs the backend unit, integration, and contract
tests plus the Chromium browser tests. `npm run validate -- --require-docker`
also checks the deployment configuration. It does not connect to a live CS2
server over RCON.

`npm run test:compiled` and `npm run test:browser` reuse the current build.
`npm test` creates a clean build before running both suites. The browser tests
start the real Express application with a temporary SQLite database and fixed
RCON responses, so they do not need a production server or credentials.

On Linux, install Chromium and its system dependencies once before running the
tests:

```bash
npx playwright install --with-deps chromium
```

Use `npm ci` for local and CI installations so both use the versions in the
checked-in lockfile. Docker creates its own clean production build.

## Deployment and safety

Start the supplied control-plane and Redis deployment with the local `.env`
file created above:

```bash
docker compose --env-file ./.env \
  -f ../deploy/compose/control-plane.compose.yaml up --build
```

The example publishes the application at `127.0.0.1:3000` by default and does
not terminate TLS. Put it behind a TLS reverse proxy, set `TRUST_PROXY` only
for known proxy hops, and allow RCON traffic only from the control-plane
network.

SQLite migrations move forward through `PRAGMA user_version`; schema version 3
is current. Back up the database before upgrading. Changes to the application
must preserve CSRF protection for authenticated state changes, serialized RCON
commands per server, separate RCON connection and authentication states,
timeouts, network validation, and the console rule that accepts one printable
ASCII command at a time.

For more detail, see the [API reference](docs/API.md), [operations
runbook](docs/RUNBOOK.md), [CS2 server requirements](docs/SERVER-SETUP.md), and
[frontend guide](docs/FRONTEND.md).
