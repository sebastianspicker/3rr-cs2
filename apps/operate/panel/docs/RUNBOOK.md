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

## Validation

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run validate`

The umbrella repository adds a root-level `./scripts/verify.sh` that runs this module together with `maintain` and `provision`.
