# Operate: Panel

This module is the `operate` surface of `cs2-server-ops`.

It provides an authenticated web control plane for Counter-Strike 2 servers:

- server inventory and access control
- RCON-backed actions and status checks
- session-backed operator auth
- Docker-friendly deployment

This module does not own host patch orchestration or bootstrap packaging. Those concerns live in
the umbrella repository’s `maintain` and `provision` modules.

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

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `SESSION_SECRET` | yes in production | generated in development | Must be strong in production |
| `PORT` | no | `3000` | Listen port |
| `REDIS_URL` | no | unset | Enables Redis-backed sessions |
| `SESSION_COOKIE_SECURE` | no | `true` in production | Set `TRUST_PROXY=1` behind a reverse proxy |
| `RCON_SECRET_KEY` | recommended | unset | 32-byte base64 or hex key for encrypted RCON secrets |
| `RCON_COMMAND_TIMEOUT_MS` | no | `2000` | Per-command timeout |

See:

- [docs/API.md](docs/API.md)
- [docs/RUNBOOK.md](docs/RUNBOOK.md)
- [docs/SERVER-SETUP.md](docs/SERVER-SETUP.md)
- [docs/REPO_MAP.md](docs/REPO_MAP.md)

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server with client rebuild |
| `npm run build` | Compile server and bundle the browser console |
| `npm test` | Compile and run the Node test suite |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript checks |
| `npm run validate` | Shell, JSON, YAML, and Docker validation |
| `npm run seed-users` | Seed default users and shared-server access |

## Deployment

```bash
docker build -t cs2-server-ops-operate-panel .
docker run --rm -p 3000:3000 --env-file .env \
  -v "$(pwd)/data:/app/data" \
  cs2-server-ops-operate-panel
```

## Scope Boundary

- Use the root repo’s `apps/maintain/updater` for unattended updates
- Use the root repo’s `apps/provision/bootstrap` and `configs/examples/` for bootstrap templates
- Treat this module as the day-to-day operator surface only
