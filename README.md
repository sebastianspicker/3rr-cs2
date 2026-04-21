# cs2-server-ops

`cs2-server-ops` is a modular operations stack for self-hosted Counter-Strike 2 servers.
It keeps provisioning, maintenance, and day-to-day control separate so operators can adopt
only the pieces they need.

## Modules

- `apps/provision/bootstrap`: bootstrap examples, startup templates, and plugin/admin seed assets
- `apps/maintain/updater`: unattended update automation for host-level CS2 runtimes
- `apps/operate/panel`: authenticated web control plane for server inventory, status, and RCON-driven actions

## Use It By Job

- Provision a new server: start with [docs/workflows/provision-server.md](docs/workflows/provision-server.md)
- Keep a server patched: use [docs/workflows/update-server.md](docs/workflows/update-server.md)
- Operate running servers: use [docs/workflows/operate-server.md](docs/workflows/operate-server.md)
- Migrate from archived Pterodactyl-style setups: use [docs/workflows/migrate-from-pterodactyl.md](docs/workflows/migrate-from-pterodactyl.md)
- Recover from data loss or a broken runtime: use [docs/workflows/disaster-recovery.md](docs/workflows/disaster-recovery.md)

## Shared Contracts

- Environment and secret naming: [docs/reference/env.md](docs/reference/env.md)
- Deployment topology: [docs/reference/topology.md](docs/reference/topology.md)
- Module boundaries and import rationale: [docs/architecture.md](docs/architecture.md)
- Migration scope and exclusions: [docs/migration-ledger.md](docs/migration-ledger.md)

## Quick Start

### Operate

```bash
cd apps/operate/panel
npm ci
npm run build
npm start
```

### Maintain

```bash
cd apps/maintain/updater
make ci
```

### Verify the Whole Repo

```bash
./scripts/verify.sh
```

## Design Rules

- `operate` is the control plane, not the place for host update orchestration
- `maintain` stays script-first and usable without the panel
- `provision` ships generic bootstrap/reference assets instead of reviving an archived runtime model
- Pterodactyl compatibility is a migration concern, not the default story

## Branching

The publication target for this repository is `dev`.
