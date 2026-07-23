# 3RR - Operate

This module is the `operate` surface of `3rr`.

It is part of the repository's public-alpha candidate. Review the root
[release status](../../../RELEASE_STATUS.md) before treating a local build as a releasable
artifact.

It provides an authenticated web control plane for Counter-Strike 2 servers:

- server inventory and access control
- RCON-backed actions and status checks
- session-backed operator auth
- Docker-friendly deployment

This module does not own host patch orchestration or bootstrap packaging. Those concerns live in
the umbrella repository’s `maintain` and `provision` modules.

## Request And Data Flow

1. Operators authenticate through Express sessions.
2. SQLite stores users, server inventory, server-access grants, and last-known game selections.
3. Server routes authorize every server-scoped action through `server_access`.
4. The RCON manager keeps live sockets per server and serializes commands for the same server.
5. RCON passwords are fetched from SQLite at connect time; the in-memory cache keeps host/port only.

## Requirements

- Node.js `22.x`
- npm `10.x`
- Docker for container deployment
- Redis with `REDIS_URL` for production sessions and rate limits

## Quick Start

```bash
npm ci
cp .env.example .env
npm run build
npm start
```

Then open `http://localhost:3000`.

On an empty database, first-admin creation is opt-in: set
`ALLOW_DEFAULT_CREDENTIALS=true`, `DEFAULT_USERNAME`, and a 12+ character
`DEFAULT_PASSWORD` for the initial start. After the administrator exists, remove the
bootstrap credentials and set `ALLOW_DEFAULT_CREDENTIALS=false`.

## Important Environment Variables

| Variable                    | Required           | Default                  | Notes                                                |
| --------------------------- | ------------------ | ------------------------ | ---------------------------------------------------- |
| `SESSION_SECRET`            | yes in production  | generated in development | Must be strong in production                         |
| `PORT`                      | no                 | `3000`                   | Listen port                                          |
| `DB_PATH`                   | no                 | runtime-dependent        | SQLite database path                                 |
| `REDIS_URL`                 | yes in production  | unset                    | Required for production sessions and rate limits     |
| `TRUST_PROXY`               | proxy-dependent    | `false`                  | Set only for known reverse-proxy hops                |
| `SESSION_COOKIE_SECURE`     | no                 | `true` in production     | Set `TRUST_PROXY=1` behind a reverse proxy           |
| `RCON_SECRET_KEY`           | yes in production  | unset                    | 32-byte base64 or hex key for encrypted RCON secrets |
| `RCON_COMMAND_TIMEOUT_MS`   | no                 | `2000`                   | Per-command timeout                                  |
| `ALLOW_DEFAULT_CREDENTIALS` | first startup only | `false`                  | Explicitly permits first-admin bootstrap             |

See:

- [docs/API.md](docs/API.md)
- [docs/RUNBOOK.md](docs/RUNBOOK.md)
- [docs/SERVER-SETUP.md](docs/SERVER-SETUP.md)
- [docs/REPO_MAP.md](docs/REPO_MAP.md)
- [docs/FRONTEND.md](docs/FRONTEND.md)
- [docs/UI_UX_AUDIT.md](docs/UI_UX_AUDIT.md)

## Scripts

| Command               | Purpose                                       |
| --------------------- | --------------------------------------------- |
| `npm run dev`         | Development server with client rebuild        |
| `npm run build`       | Compile server and bundle the browser console |
| `npm test`            | Compile and run the Node test suite           |
| `npm run test:e2e`    | Build the app and run Playwright E2E tests    |
| `npm run screenshots` | Capture the sanitized panel tour              |
| `npm run lint`        | ESLint                                        |
| `npm run typecheck`   | TypeScript checks                             |
| `npm run validate`    | Shell, JSON, YAML, and Docker validation      |

## End-To-End Tests

The E2E suite uses Playwright with Chromium only. It starts the built Express app on
`127.0.0.1:3210`, creates an isolated SQLite database under `.e2e/`, and covers login,
server/status truth, add-server validation, RCON console/history, Workshop favorites,
user rendering, logout, and health behavior.

```bash
npm ci
npm run test:e2e:install
npm run test:e2e
```

## Deployment

The included Compose deployment runs the panel with Redis and publishes the
panel on loopback by default:

```bash
cp .env.example .env
docker compose up --build
```

Set `PANEL_BIND_ADDRESS=0.0.0.0` only when direct network exposure is
intentional and TLS or equivalent network controls are already present. This
variable is consumed by Compose and is not read by the Node process.

## Scope Boundary

- Use the root repo’s `apps/maintain/updater` for unattended updates
- Use the root repo’s `apps/provision/bootstrap` and `configs/examples/` for bootstrap templates
- Treat this module as the day-to-day operator surface only

## Panel Tour

These screenshots were generated with `npm run screenshots` from an isolated
SQLite database. The fixture uses the reserved `203.0.113.10` documentation
address, leaves credentials empty in public views, and does not connect to a
live RCON server. Unknown and unobserved status labels are therefore expected.

### 1. Authenticate

The signed-out entry point keeps operator credentials inside the authenticated
panel boundary.

![3RR operator login](docs/screenshots/01-login.png)

### 2. Review Servers

The inventory keeps connection state, address, player observation, and primary
actions visible in one row. The documentation fixture remains explicitly
unknown because no RCON observation occurred.

![3RR server inventory](docs/screenshots/02-servers.png)

### 3. Register A Server

Operators add an existing CS2 endpoint and its RCON credential. The screenshot
uses a TEST-NET-3 address and leaves the password field empty.

![3RR add-server form](docs/screenshots/03-add-server.png)

### 4. Operate A Server

The management surface combines requested game setup, RCON-observed status,
player state, the console, and guarded match controls without presenting an
unobserved fixture as connected.

![3RR server management surface](docs/screenshots/04-manage.png)

Capture provenance and the publication checklist are recorded in the
[screenshot manifest](docs/screenshots/README.md).
