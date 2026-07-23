# 3RR

[![CI](https://github.com/sebastianspicker/cs2-server-ops/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/sebastianspicker/cs2-server-ops/actions/workflows/ci.yml)
[![Secret Scan](https://github.com/sebastianspicker/cs2-server-ops/actions/workflows/secret-scan.yml/badge.svg?branch=main)](https://github.com/sebastianspicker/cs2-server-ops/actions/workflows/secret-scan.yml)

3RR is a source repository for operating self-hosted Counter-Strike 2 servers.
It separates static provisioning assets, host-level update automation, and an
authenticated web panel. The three modules can be adopted independently.

> [!WARNING]
> This repository is preparing a public alpha. No alpha tag has been published
> from the current checkout. Interfaces, configuration names, default paths, and
> SQLite migrations may change between alpha releases. Review
> [RELEASE_STATUS.md](RELEASE_STATUS.md) before evaluating a candidate.

## Current Capabilities

- `provision` writes reference admin and plugin bootstrap files and provides a
  CS2 startup wrapper.
- `maintain` compares local and remote Steam build IDs, then runs a bounded
  SteamCMD and systemd update sequence only when an update is known to be needed.
- `operate` stores users, access grants, server inventory, operator preferences,
  and RCON history in SQLite. It exposes authenticated server status and
  allowlisted RCON-backed controls.
- The panel supports an optional Redis client in development and requires Redis
  for production session and rate-limit storage.

## Known Limitations

- The updater targets Linux hosts with systemd, SteamCMD, GNU `timeout`, and a
  dedicated CS2 service account.
- The panel controls an already-running server over RCON. It does not provision
  hosts, run SteamCMD, or install game plugins.
- Plugin-backed modes work only when the required server-side plugins, maps, and
  CFG files are installed separately.
- Pterodactyl-style setups are covered only by migration guidance. They are not
  the default runtime model.
- The current candidate has not completed its Docker, production-like CS2/RCON,
  artifact, rollback, or supported-platform release matrix.
- The panel tour uses isolated fixture data and intentionally does not claim a
  live CS2/RCON connection.

## Requirements

Common development and verification tools:

- Node.js `22.x` and npm `10.x` for the panel
- Docker with Compose for container deployment and the full repository gate
- `make`, `shellcheck`, `shfmt`, `jq`, `ruby`, and `curl`

Runtime requirements differ by module. The updater requirements are documented
in [apps/maintain/updater/README.md](apps/maintain/updater/README.md), and the
panel requirements are documented in
[apps/operate/panel/README.md](apps/operate/panel/README.md).

## Installation And Usage

### Operate Panel

For a local development build:

```bash
cd apps/operate/panel
npm ci
cp .env.example .env
npm run build
npm start
```

Configure `SESSION_SECRET` and `RCON_SECRET_KEY`. For an empty database, set
`ALLOW_DEFAULT_CREDENTIALS=true` with `DEFAULT_USERNAME` and a password of at
least 12 characters. After the first administrator exists, remove the bootstrap
credentials and set `ALLOW_DEFAULT_CREDENTIALS=false`.

For the included production container and Redis example:

```bash
cd apps/operate/panel
cp .env.example .env
docker compose up --build
```

The Compose example binds `127.0.0.1:3000` by default. Set
`PANEL_BIND_ADDRESS=0.0.0.0` only when direct network exposure is intentional and
TLS or equivalent network controls are already in place. Production secure
cookies require HTTPS. Use `SESSION_COOKIE_SECURE=false` only for local HTTP
evaluation.

See the [panel runbook](apps/operate/panel/docs/RUNBOOK.md) for production
configuration, first-admin setup, SQLite migrations, and validation commands.

### Maintain Updater

Use the installation and systemd instructions in
[apps/maintain/updater/README.md](apps/maintain/updater/README.md). Run a dry-run
and one supervised update before enabling the timer.

### Provision Bootstrap

Start with [apps/provision/bootstrap/README.md](apps/provision/bootstrap/README.md)
and [docs/workflows/provision-server.md](docs/workflows/provision-server.md).
Generated admin, plugin, environment, and secret files are local deployment
artifacts and do not belong in version control.

## Configuration

- [Environment and secret names](docs/reference/env.md)
- [Deployment topology](docs/reference/topology.md)
- [Module architecture](docs/architecture.md)
- [Panel HTTP API](apps/operate/panel/docs/API.md)
- [Panel server prerequisites](apps/operate/panel/docs/SERVER-SETUP.md)
- [Updater workflow](docs/workflows/update-server.md)
- [Migration guidance](docs/workflows/migrate-from-pterodactyl.md)
- [Disaster recovery](docs/workflows/disaster-recovery.md)

## Screenshots

The [panel tour](apps/operate/panel/README.md#panel-tour) covers login, server
inventory, endpoint registration, and the per-server management surface. The
images are generated from an isolated documentation database; see the
[screenshot manifest](apps/operate/panel/docs/screenshots/README.md) for capture
provenance and the release-candidate checklist.

## Development And Validation

Install panel dependencies with `npm ci` under Node 22. The focused module
commands are:

```bash
cd apps/operate/panel
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
npm run validate -- --require-docker
```

Updater checks:

```bash
cd apps/maintain/updater
make ci
```

The authoritative repository gate is:

```bash
./scripts/verify.sh
```

It installs the locked panel dependencies, runs formatting, lint, type checks,
unit and browser tests, builds and probes the panel container, runs updater CI,
and exercises provision and startup safety checks. A focused or
environment-limited run is not equivalent to this gate.

## Repository Structure

```text
apps/
  provision/bootstrap/   Static bootstrap inputs and writers
  maintain/updater/      SteamCMD and systemd updater
  operate/panel/         Express, SQLite, Redis, RCON, EJS, and browser assets
configs/examples/        Compose, startup, and systemd examples
docs/reference/          Shared contracts and provenance
docs/workflows/          Operator workflows
scripts/                 Root verification entry points
```

## Troubleshooting

- `REDIS_URL is required in production`: use the included Redis Compose service
  or set `REDIS_URL` to an external Redis instance.
- Login succeeds but the browser remains signed out over local HTTP: production
  cookies are secure by default. Put the panel behind HTTPS, or set
  `SESSION_COOKIE_SECURE=false` only for local evaluation.
- Updater status is `unknown`: check SteamCMD connectivity and output. The
  updater intentionally leaves the CS2 service running when it cannot confirm a
  remote build ID.
- `./scripts/verify.sh` stops before panel checks: use Node 22 or start a working
  Docker daemon so the verifier can use its Node 22 container fallback.

## Contributing, Security, And License

Contribution requirements are in [CONTRIBUTING.md](CONTRIBUTING.md). Report
vulnerabilities through the private process in [SECURITY.md](SECURITY.md), not a
public issue. 3RR is distributed under the [MIT License](LICENSE). Module origin
and retained license boundaries are recorded in
[docs/reference/provenance.md](docs/reference/provenance.md).
