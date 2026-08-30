# Control-plane repository map

## Runtime and dependency layers

- `src/main.ts`: sole process composition root and executable entry point
- `src/app/`: Express assembly, lifecycle, authentication, security, rate
  limits, and health
- `src/features/`: auth, server inventory, game control, status, console,
  Workshop, user management, `server-access`, and `game-catalog` HTTP/support
  behavior
- `src/infrastructure/`: SQLite, Redis, logging, and RCON credential encoding
- `src/integrations/rcon/`: connection state, authentication, serialization,
  timeouts, validation, command policy/parsing, and shutdown
- `src/shared/`: dependency-leaf utilities

Use `npm run check:architecture` to validate the layer boundaries.

## Browser and assets

- `web/views/`: EJS pages and partials
- `web/client/`: browser TypeScript
- `web/assets/`: maintained CSS and images
- `web/generated/`: build output
- `src/features/game-catalog/maps.json`: map metadata owned by the game catalog feature

## Build, deployment, and tests

- `package.json`: supported npm commands and dependencies
- `Dockerfile`: Node 22 container image
- `.env.example`: safe variable names and empty secret values
- `scripts/`: browser build, architecture, formatting, and validation helpers
- `test/unit/`, `test/integration/`, `test/contract/`: Node test suites
- `docs/API.md`: HTTP contract
- `docs/RUNBOOK.md`: deployment, migration, health, and recovery
- `docs/SERVER-SETUP.md`: CS2-side prerequisites

Repository-wide Compose and systemd examples live under `../deploy/`.
