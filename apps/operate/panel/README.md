# Operate: Panel

This module is the `operate` surface of `cs2-server-ops`.

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
- Redis only when you want production multi-instance sessions

## Quick Start

```bash
npm ci
cp .env.example .env
npm run build
npm start
```

Then open `http://localhost:3000`.

## Important Environment Variables

| Variable                  | Required          | Default                  | Notes                                                |
| ------------------------- | ----------------- | ------------------------ | ---------------------------------------------------- |
| `SESSION_SECRET`          | yes in production | generated in development | Must be strong in production                         |
| `PORT`                    | no                | `3000`                   | Listen port                                          |
| `REDIS_URL`               | no                | unset                    | Enables Redis-backed sessions                        |
| `SESSION_COOKIE_SECURE`   | no                | `true` in production     | Set `TRUST_PROXY=1` behind a reverse proxy           |
| `RCON_SECRET_KEY`         | yes in production | unset                    | 32-byte base64 or hex key for encrypted RCON secrets |
| `RCON_COMMAND_TIMEOUT_MS` | no                | `2000`                   | Per-command timeout                                  |

See:

- [docs/API.md](docs/API.md)
- [docs/RUNBOOK.md](docs/RUNBOOK.md)
- [docs/SERVER-SETUP.md](docs/SERVER-SETUP.md)
- [docs/REPO_MAP.md](docs/REPO_MAP.md)

## Scripts

| Command             | Purpose                                       |
| ------------------- | --------------------------------------------- |
| `npm run dev`       | Development server with client rebuild        |
| `npm run build`     | Compile server and bundle the browser console |
| `npm test`          | Compile and run the Node test suite           |
| `npm run test:e2e`  | Build the app and run Playwright E2E tests    |
| `npm run lint`      | ESLint                                        |
| `npm run typecheck` | TypeScript checks                             |
| `npm run validate`  | Shell, JSON, YAML, and Docker validation      |

## End-To-End Tests

The E2E suite uses Playwright with Chromium only. It starts the built Express app on
`127.0.0.1:3210`, creates an isolated SQLite database under `.e2e/`, and covers the
operator login, empty server dashboard, add-server validation, logout, and health endpoint.

```bash
npm ci
npm run test:e2e:install
npm run test:e2e
```

## Deployment

```bash
docker build -t cs2-server-ops-operate-panel .
docker run --rm -p 3000:3000 --env-file .env \
  -v "$(pwd)/data:/home/container/data" \
  cs2-server-ops-operate-panel
```

## Scope Boundary

- Use the root repo’s `apps/maintain/updater` for unattended updates
- Use the root repo’s `apps/provision/bootstrap` and `configs/examples/` for bootstrap templates
- Treat this module as the day-to-day operator surface only
