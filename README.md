# 3RR

[![CI](https://github.com/sebastianspicker/3rr/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/sebastianspicker/3rr/actions/workflows/ci.yml)
[![Secret Scan](https://github.com/sebastianspicker/3rr/actions/workflows/secret-scan.yml/badge.svg?branch=main)](https://github.com/sebastianspicker/3rr/actions/workflows/secret-scan.yml)

3RR is a modular operations stack for self-hosted Counter-Strike 2 servers.
Its control plane, host updater, and bootstrap assets share configuration and
documentation, but they are independently deployable and do not call one
another at runtime.

> [!WARNING]
> This repository is alpha software. Review the
> [release requirements](docs/RELEASING.md) and validate workflows in a
> representative deployment before relying on it.

## Modules

| Path | Purpose | Does not do |
| --- | --- | --- |
| [`control-plane/`](control-plane/README.md) | Node 22 Express/TypeScript web and API control plane with SQLite, Redis, EJS, and RCON | Install CS2, run SteamCMD, or execute host commands |
| [`host-updater/`](host-updater/README.md) | Linux/systemd/SteamCMD update transaction for an existing CS2 host | Provide a web UI or operate RCON |
| [`server-bootstrap/`](server-bootstrap/README.md) | Static CFG assets, administrator bootstrap output, startup wrapper, and capability manifest | Install CS2, plugins, maps, SteamCMD, or systemd units |
| [`deploy/`](deploy/) | Compose examples and updater systemd units | Replace local secrets or deployment review |

The control plane authenticates operators and controls running servers over
RCON. The host updater performs a bounded transaction only after confirming a
new Steam build. Server bootstrap writes and links server-owned assets without
turning them into a background service.

## Quick start

### Control plane

```bash
cd control-plane
npm ci
cp .env.example .env
# Set SESSION_SECRET and RCON_SECRET_KEY in .env.
npm run build
node --env-file=.env dist/src/main.js
```

Open `http://localhost:3000`. For an empty database, set
`ALLOW_DEFAULT_CREDENTIALS=true`, `DEFAULT_USERNAME`, and a 12-character-or-
longer `DEFAULT_PASSWORD` only long enough to create the first administrator.
Remove those bootstrap values afterwards.

To run the supplied panel-and-Redis deployment, start from the copied local env
file rather than committing secrets:

```bash
docker compose --env-file ./panel.env -f deploy/compose/control-plane.compose.yaml up --build
```

The Compose example binds to loopback by default and does not terminate TLS.

### Host updater

Follow [host-updater/README.md](host-updater/README.md). Its installed layout
remains `/opt/3rr/apps/maintain/updater`; run a dry run and one supervised
update before enabling `3rr-update.timer`.

### Server bootstrap

Follow [server-bootstrap/README.md](server-bootstrap/README.md) and
[the provisioning workflow](docs/workflows/provision-server.md). Keep runtime
environment files, administrator identities, tokens, and generated output out
of version control.

## Architecture and contracts

- [Architecture](docs/architecture.md)
- [Environment variables](docs/reference/env.md)
- [Deployment topology](docs/reference/topology.md)
- [Control-plane API](control-plane/docs/API.md)
- [Control-plane runbook](control-plane/docs/RUNBOOK.md)
- [CS2-side requirements](control-plane/docs/SERVER-SETUP.md)
- [Updater workflow](docs/workflows/update-server.md)
- [Operation workflow](docs/workflows/operate-server.md)
- [Recovery](docs/workflows/disaster-recovery.md)
- [Pterodactyl-style migration](docs/workflows/migrate-from-pterodactyl.md)

## Development and verification

The root verifier requires Node 22 or Docker, plus `make`, `shellcheck`,
`shfmt`, `jq`, `ruby`, and `curl`.

```bash
cd control-plane && npm ci && npm run check
cd control-plane && npm run validate -- --require-docker
cd host-updater && make ci
./scripts/verify.sh
```

`./scripts/verify.sh` checks documentation links, configuration and Compose
syntax, the control plane, the built container surface, updater tests, and
bootstrap safety. It does not prove a live CS2, RCON, SteamCMD, systemd, Redis,
backup, or production-network deployment.

## Security

Do not commit session secrets, RCON encryption keys or passwords, CS2 tokens,
administrator files, or local environment files. Keep the control plane behind
TLS, set `TRUST_PROXY` only for proxy hops you operate, and restrict RCON to
the control-plane network.

RCON console input is intentionally one printable ASCII command with separator
and dangerous-command checks. Do not weaken this boundary without a threat
model and focused regression tests.

Read [CONTRIBUTING.md](CONTRIBUTING.md) before changing shared contracts. See
[docs/reference/provenance.md](docs/reference/provenance.md) for origin and
license context.
