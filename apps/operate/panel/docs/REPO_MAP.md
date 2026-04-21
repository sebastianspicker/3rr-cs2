# Repository Map

## Root files

- `README.md`: module overview and usage
- `Dockerfile`: production image
- `docker-compose.yaml`: container deployment example
- `.env.example`: environment template
- `package.json`: scripts and dependencies

## Application

- `app.ts`: Express entrypoint, security middleware, sessions, routes, health endpoint
- `db.ts`: SQLite bootstrap and schema setup
- `modules/`: middleware and RCON integration helpers
- `routes/`: auth, server CRUD, gameplay actions, status routes, user management
- `utils/`: validation, maps config, logging, secret handling, Redis client factory
- `views/`: EJS templates including login, servers, management, settings, and admin user management
- `public/`: static assets
- `cfg/`: gameplay presets and map metadata

## Scripts and tests

- `scripts/copy-fonts.js`: font asset copy helper
- `scripts/seed-users.ts`: bootstrap seeded users and shared access
- `scripts/validate.sh`: shell, JSON, YAML, and Docker validation
- `test/`: module test suite

## Docs

- `docs/API.md`: HTTP contract
- `docs/RUNBOOK.md`: operator runbook
- `docs/SERVER-SETUP.md`: server setup guidance
- `docs/REPO_MAP.md`: this file
