# Operate panel repository map

## Runtime

- `app.ts`: Express startup, middleware, sessions, rate limits, routes, health,
  and shutdown
- `db.ts`: SQLite connection, migrations, credential storage, and optional
  first-administrator creation
- `modules/rcon.ts`: RCON connections, authentication state, command queues,
  timeouts, and shutdown
- `modules/middleware.ts`: shared authentication middleware
- `routes/auth.ts`: login and logout
- `routes/server.ts`: server inventory, access checks, reconnect, and deletion
- `routes/game/`: fixed game controls and validated console operations
- `routes/status.ts`: live server observations
- `routes/users.ts`: password changes and administrator user management
- `utils/`: validation, maps, logging, secrets, and Redis

## User interface

- `views/`: EJS pages and partials
- `public/ts/`: browser TypeScript
- `public/css/`: stylesheet modules and `panel.css` bundle
- `public/fonts/`: font files copied during the build
- `public/images/`: static image assets
- `cfg/`: game presets and map metadata

## Build and deployment

- `package.json`: npm scripts and dependencies
- `Dockerfile`: two-stage Node 22 image
- `docker-compose.yaml`: panel and Redis deployment
- `.env.example`: configuration names and safe empty secret values
- `scripts/`: build, validation, and utility scripts

## Tests and documentation

- `test/*.test.ts`: Node test entry files
- `test/support/`: the narrow RCON DNS-pinning mock seam
- `docs/API.md`: HTTP contract
- `docs/FRONTEND.md`: browser architecture and behavior
- `docs/RUNBOOK.md`: deployment and operation
- `docs/SERVER-SETUP.md`: CS2-side prerequisites
