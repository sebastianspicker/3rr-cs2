# Repository Map

## Root files

- `README.md`: module overview and usage
- `Dockerfile`: production image
- `docker-compose.yaml`: container deployment example
- `.env.example`: environment template
- `package.json`: scripts and dependencies

## Application

- `app.ts`: Express entrypoint, security middleware, sessions, routes, health endpoint
- `db.ts`: SQLite connection, migrations, RCON-secret upgrade, and optional first-admin bootstrap
- `modules/rcon.ts`: live RCON socket manager, heartbeat/reconnect handling, per-server command queue
- `modules/middleware.ts`: shared authentication guard
- `routes/auth.ts`: login/logout flow
- `routes/server.ts`: server inventory, ownership/access checks, RCON reconnect/delete paths
- `routes/game/`: RCON-backed game setup, match controls, bot controls, and allowlisted console command routes
- `routes/status.ts`: live status endpoint backed by RCON and persisted last-known game selections
- `routes/users.ts`: password changes and admin-only user management
- `utils/`: validation, maps config, logging, secret handling, Redis client factory
- `views/`: EJS templates including login, servers, management, settings, and admin user management
- `public/`: static assets
- `cfg/`: gameplay presets and map metadata

## Scripts and tests

- `scripts/copy-fonts.js`: font asset copy helper
- `scripts/validate.sh`: shell, JSON, YAML, and Docker validation
- `test/`: module test suite

## Docs

- `docs/API.md`: HTTP contract
- `docs/RUNBOOK.md`: operator runbook
- `docs/SERVER-SETUP.md`: server setup guidance
- `docs/REPO_MAP.md`: this file
