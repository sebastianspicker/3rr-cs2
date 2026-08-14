# Contributing to the operate panel

## Setup

```bash
cd apps/operate/panel
npm ci
npm run dev
```

Keep `ALLOW_DEFAULT_CREDENTIALS=false` unless a test specifically needs
first-administrator creation. `npm run dev` reads the current process
environment, not `.env`. Never commit `.env`, SQLite files, credentials, or
captured operator data.

## Checks

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
npm run validate -- --require-docker
```

`npm run validate` without the flag does not require Docker. Run the root
`./scripts/verify.sh` before release work.

## Change requirements

- Keep routes, authorization, CSRF, storage, and RCON changes focused.
- Preserve per-server RCON command serialization and explicit connection state.
- Add regression tests for behavior changes.
- Update `docs/API.md` for HTTP contract changes.
- Update `docs/RUNBOOK.md` or `.env.example` for operational changes.

Use the root issue templates for defects and feature requests. Report security
issues through a private
[GitHub security advisory](https://github.com/sebastianspicker/3rr/security/advisories/new).
