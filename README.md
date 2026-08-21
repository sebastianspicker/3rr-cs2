# 3RR

[![CI](https://github.com/sebastianspicker/3rr/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/sebastianspicker/3rr/actions/workflows/ci.yml)
[![Secret Scan](https://github.com/sebastianspicker/3rr/actions/workflows/secret-scan.yml/badge.svg?branch=main)](https://github.com/sebastianspicker/3rr/actions/workflows/secret-scan.yml)

3RR contains three independent modules for self-hosted Counter-Strike 2
servers:

- `provision` provides bootstrap file writers, a startup wrapper, and reference
  deployment configuration.
- `maintain` updates an existing Linux-hosted server through SteamCMD and
  systemd.
- `operate` is an authenticated web panel for inventory, status, and
  RCON-backed server controls.

The modules share configuration conventions but do not depend on one another at
runtime.

> [!WARNING]
> The repository is under alpha development. Configuration names, default
> paths, HTTP contracts, and SQLite migrations may change between prereleases.
> Review [RELEASE_STATUS.md](RELEASE_STATUS.md) before evaluating a release
> candidate.

## Capabilities and limitations

The provision module writes CounterStrikeSharp admin files and plugin lists,
then starts a CS2 runtime with validated port, player-count, CFG, token, and
RCON settings. It does not install CS2, plugins, maps, or host services.

The maintain module compares local and remote Steam build IDs. It stops the
configured systemd service only when both IDs are known and differ, runs a
bounded SteamCMD update, restarts the service, and verifies that the service is
active. It requires Linux, systemd, SteamCMD, GNU `timeout`, and a CS2 service
account named `steam`.

The operate module stores users, server inventory, access grants, Workshop
favorites, and RCON command history in SQLite. It provides authenticated pages,
fixed operator controls, and a single-command RCON console with separator,
character, length, and blocked-command checks. Production sessions and rate
limits require Redis. The panel controls an existing server and does not
provision hosts, run SteamCMD, or install server-side CFG files and plugins.

The current checkout does not establish support for every Docker host, CS2
server configuration, RCON deployment, recovery path, or operating-system
combination. Validate operator-visible workflows against a representative live
deployment before release.

## Requirements

Repository development and the full verification script require:

- Node.js 22
- Docker with Compose
- `make`, `shellcheck`, `shfmt`, `jq`, `ruby`, and `curl`

The panel uses the npm version supplied with the selected Node 22 installation.
The updater and provision modules have separate runtime requirements in their
module READMEs.

## Installation and usage

### Operate panel

```bash
cd apps/operate/panel
npm ci
cp .env.example .env
```

Edit `.env`. For a local non-production start, set `SESSION_SECRET` and
`RCON_SECRET_KEY`, then run:

```bash
npm run build
node --env-file=.env dist/app.js
```

Open `http://localhost:3000`.

To create the first administrator in an empty database, set
`ALLOW_DEFAULT_CREDENTIALS=true`, `DEFAULT_USERNAME`, and a
`DEFAULT_PASSWORD` of at least 12 characters. After the account exists, remove
the bootstrap credentials and restore `ALLOW_DEFAULT_CREDENTIALS=false`.

The included Compose deployment starts the panel and Redis:

```bash
cd apps/operate/panel
docker compose up --build
```

`npm start` runs the built panel with variables already present in the process
environment. It does not load `.env` itself.

It publishes the panel on `127.0.0.1:3000` by default. It does not terminate
TLS. See the [panel runbook](apps/operate/panel/docs/RUNBOOK.md) before exposing
it through a reverse proxy.

### Maintain updater

Install and configure the updater using
[apps/maintain/updater/README.md](apps/maintain/updater/README.md). Run a dry
run and one supervised update before enabling its systemd timer.

### Provision assets

Start with
[apps/provision/bootstrap/README.md](apps/provision/bootstrap/README.md) and the
[server provisioning workflow](docs/workflows/provision-server.md). Keep local
environment files, credentials, tokens, and runtime output outside version
control.

## Configuration

- [Environment variables and secrets](docs/reference/env.md)
- [Deployment topology](docs/reference/topology.md)
- [Module architecture](docs/architecture.md)
- [Panel HTTP API](apps/operate/panel/docs/API.md)
- [Panel server prerequisites](apps/operate/panel/docs/SERVER-SETUP.md)
- [Updater workflow](docs/workflows/update-server.md)
- [Pterodactyl migration](docs/workflows/migrate-from-pterodactyl.md)
- [Disaster recovery](docs/workflows/disaster-recovery.md)
- [Operate workflow](docs/workflows/operate-server.md)
- [Release procedure](docs/RELEASING.md)

## Repository structure

```text
apps/
  provision/bootstrap/   Bootstrap writers, startup wrapper, and env example
  maintain/updater/      SteamCMD and systemd updater
  operate/panel/         Express, SQLite, Redis, RCON, EJS, and browser code
configs/examples/        Compose, startup, and systemd examples
docs/                     Architecture and release documentation
docs/reference/           Environment, topology, and provenance contracts
docs/workflows/          Operator procedures
scripts/                 Repository verification scripts
```

Each module keeps its tests beside the module: panel tests under
`apps/operate/panel/test`, updater tests under
`apps/maintain/updater/tests`, and provision tests under
`apps/provision/bootstrap/tests`.

## Development workflow

Install the panel dependencies from its lockfile:

```bash
cd apps/operate/panel
npm ci
```

Use `npm run dev` for the TypeScript watch server. Run focused checks in the
module being changed, then run the repository gate before requesting review.
See [CONTRIBUTING.md](CONTRIBUTING.md) for module boundaries and review
requirements.

## Testing

Panel checks:

```bash
cd apps/operate/panel
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run validate -- --require-docker
```

Updater checks:

```bash
cd apps/maintain/updater
make ci
```

The full repository gate is:

```bash
./scripts/verify.sh
```

The script checks shell formatting, shell lint, documentation links, JSON,
Compose files, the panel build and tests, the panel container, updater tests,
bootstrap output safety, and startup secret handling. It uses a Node 22
container when the host Node version is not 22.

## Local demonstration and GitHub Pages

The supported local demonstration is the operate panel itself. Run it with the
development configuration described above. It does not simulate or replace a
CS2, RCON, SteamCMD, systemd, Redis, backup, restore, or production network.

GitHub Pages is not a deployment target for the product. The operate module is
an Express service with SQLite, Redis, authentication, and RCON boundaries; the
maintain and provision modules are host-side scripts. A static Pages site could
only present documentation or a clearly simulated walkthrough, and this
repository does not currently include or deploy such an artifact.

## Deployment and operation

Use the included Compose file for the panel and Redis. Keep its loopback bind
unless a TLS-terminating reverse proxy and explicit access controls are in
place. Back up the SQLite database before upgrades.

Install the updater as a root-run systemd oneshot and timer only after validating
its paths, service name, SteamCMD location, disk-space threshold, dry-run
output, and one supervised update.

The example CS2 Compose runtime uses the external `cm2network/cs2` image. Review
that image and pin an appropriate version before relying on it in an
environment you operate.

## Troubleshooting

- `REDIS_URL is required in production`: configure a reachable Redis service.
  The included panel Compose file supplies `redis://redis:6379`.
- The browser returns to the login page over local HTTP: production cookies are
  secure by default. Use HTTPS, or set `SESSION_COOKIE_SECURE=false` only for
  local HTTP testing.
- The updater reports an unknown remote build: inspect SteamCMD connectivity
  and output. The updater leaves the server service running when it cannot
  establish the remote build ID.
- `./scripts/verify.sh` stops before panel checks: install Node 22 or start a
  Docker daemon so the script can use its Node 22 container fallback.
- A panel control fails after connection: confirm that the corresponding CFG,
  map, or plugin is installed on the CS2 server. See
  [SERVER-SETUP.md](apps/operate/panel/docs/SERVER-SETUP.md).

## Security considerations

Do not commit panel session secrets, RCON encryption keys, RCON passwords, Steam
tokens, administrator files, or local environment files. Keep the panel behind
TLS, configure `TRUST_PROXY` only for known proxy hops, and restrict RCON
network access.

RCON console input is intentionally limited to one ASCII command. Do not weaken
the separator, control-byte, or non-ASCII validation without a threat model and
focused regression tests.

Report vulnerabilities through the private process in
[SECURITY.md](SECURITY.md), not a public issue.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md), run the focused module checks, and run
`./scripts/verify.sh` before requesting review. Keep changes within one module
unless they alter a shared contract.

The repository is distributed under the [MIT License](LICENSE). Module origin
and retained license boundaries are listed in
[docs/reference/provenance.md](docs/reference/provenance.md).
