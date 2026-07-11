# Verification baseline

Baseline refreshed on 2026-05-26 against the current working tree.

Verdict: PARTIAL. The panel's non-Docker checks pass under a supported Node 22
runner, and the updater module CI passes. Docker-required verification remains
blocked because the Docker daemon is not reachable from this environment, so the
canonical root verifier, Docker image validation, compose validation with
`--require-docker`, and container health smoke are not complete.

## Environment observed

| Tool | Observed version / state | Impact |
| --- | --- | --- |
| Host Node.js | `v26.0.0` | Non-canonical for the panel; `package.json` requires `>=22 <23`. |
| Host npm / npx | `11.12.1` | Non-canonical with Node 26 for this repo. |
| Node 22 via npx | `v22.22.3` | Used for panel checks in this baseline. |
| npm via npx | `10.9.8` | Used for panel checks in this baseline. |
| make | GNU Make 3.81 | Available. |
| shellcheck | 0.11.0 | Available. |
| shfmt | 3.13.1 | Available. |
| jq | jq-1.7.1 | Available. |
| ruby | 2.6.10p210 | Available. |
| Docker | Docker 29.5.2 installed; daemon not reachable | Blocks root verifier Docker fallback, Docker validation, and panel container smoke. |

Docker daemon probe:

```text
Cannot connect to the Docker daemon at unix:///Users/sebastian/.docker/run/docker.sock. Is the docker daemon running?
```

## Commands discovered

### Root

| Purpose | Command | Source / notes |
| --- | --- | --- |
| Full repository verification | `./scripts/verify.sh` | README and `scripts/verify.sh`; canonical verifier. |
| Root validation | `./scripts/validate.sh` | Wrapper around `scripts/verify.sh`. |

`./scripts/verify.sh` runs shared shell/config checks, panel verification,
Docker panel validation/smoke, updater checks, provision bootstrap checks, and
startup secret probe checks. If host Node is not major version 22, it attempts
the panel suite in `node:22-bookworm-slim` via Docker.

### Operate panel

Directory: `apps/operate/panel`

| Purpose | Command |
| --- | --- |
| Install dependencies | `npm ci` |
| Start compiled app | `npm start` |
| Development server | `npm run dev` |
| Build | `npm run build` |
| Client bundle only | `npm run build:client` |
| Format check | `npm run format:check` |
| Format write | `npm run format` |
| Shell format write | `npm run format:shell` |
| Lint | `npm run lint` |
| Typecheck/static analysis | `npm run typecheck` |
| Unit tests | `npm test` |
| Install E2E browser | `npm run test:e2e:install` |
| E2E tests | `npm run test:e2e` |
| Panel validation | `npm run validate` |
| Panel CI | `npm run ci` |

The panel declares `engine-strict=true` and requires Node `>=22 <23`.

### Updater

Directory: `apps/maintain/updater`

| Purpose | Command |
| --- | --- |
| Lint | `make lint` |
| Format write | `make fmt` |
| Tests | `make test` |
| Security checks | `make security` |
| Module CI | `make ci` |

## Commands actually run

Panel commands below were run through `npx -y -p node@22 -p npm@10 npm ...`
unless a command explicitly says otherwise.

| Command | Result | Evidence |
| --- | --- | --- |
| `node --version` | Exit 0 | Host Node `v26.0.0`; not canonical for panel checks. |
| `npm --version` / `npx --version` | Exit 0 | Host npm/npx `11.12.1`; not canonical for panel checks. |
| `npx -y node@22 --version` | Exit 0 | `v22.22.3`. |
| `npx -y -p node@22 -p npm@10 npm --version` | Exit 0 | `10.9.8`. |
| `docker info` | Exit 1 | Docker daemon unavailable. |
| `npm run format:check` in `apps/operate/panel` under Node 22 | Exit 0 | Prettier reported all matched files use Prettier style. |
| `npm run lint` in `apps/operate/panel` under Node 22 | Exit 0 | ESLint completed with no reported findings. |
| `npm run typecheck` in `apps/operate/panel` under Node 22 | Exit 0 | Server and client TypeScript checks completed. |
| `npm run build` in `apps/operate/panel` under Node 22 | Exit 0 | Copied fonts, ran `tsc`, and bundled `public/js/console.js`. |
| `npm test` in `apps/operate/panel` under Node 22 | Exit 0 | `240` tests across `13` suites passed. |
| `npm run test:e2e` in `apps/operate/panel` under Node 22 | Exit 0 | Playwright Chromium ran `5` tests; all passed. |
| `npm run validate` in `apps/operate/panel` under Node 22 | Exit 0 | Shell, JSON, YAML, repo hygiene passed; Docker check skipped because daemon access is unavailable. |
| `npm run validate -- --require-docker` in `apps/operate/panel` under Node 22 | Exit 1 | Same non-Docker checks passed; failed at Docker daemon access. |
| `make ci` in `apps/maintain/updater` | Exit 0 | Lint passed, `./tests/run.sh` reported `OK (49 tests passed)`, secret scan passed, SCA reported no dependency manifests. |
| `./scripts/verify.sh` at repo root | Exit 1 | Shared checks passed; operate module attempted Docker Node 22 fallback and failed because Docker daemon was unavailable. |

Additional RP-002 evidence:

```text
rg -n "defaultExport|namedExports" apps/operate/panel/test apps/operate/panel/types
```

returned no matches after the mock-module compatibility update. A Node 26
targeted run of `dist/test/game-helpers.test.js` also passed without
`mock.module()` deprecation warnings; only Node's experimental module-mocking
warning remained.

## Failures and blockers

### Canonical root verification

`./scripts/verify.sh` still fails because the host Node is not 22, causing the
script to use its Docker Node 22 fallback before panel checks:

```text
==> operate module
+ docker run --rm ... node:22-bookworm-slim ...
Cannot connect to the Docker daemon at unix:///Users/sebastian/.docker/run/docker.sock. Is the docker daemon running?
```

The root verifier did not reach Docker panel validation/smoke, updater checks,
provision bootstrap checks, or startup secret probe checks in this canonical
flow.

### Docker-required panel validation

`npm run validate -- --require-docker` fails at Docker access:

```text
validate: docker
error: docker is installed but the current environment cannot access the daemon
```

The non-Docker validation steps pass first.

## Skipped or unavailable checks

- `npm ci` was not run. Existing dependencies were reused, and the panel checks
  were executed under Node 22 via `npx`.
- `npm run ci` in `apps/operate/panel` was not run as a single command because
  its Docker-required validation component is known to fail in this environment;
  its non-Docker components were run separately.
- Docker image build, compose validation with required Docker, and panel
  container health smoke were not completed because Docker daemon access is
  unavailable.
- Root provision bootstrap checks and startup secret probe checks did not run in
  the root verifier because the root verifier stopped at the operate module
  Docker fallback.
- No live CS2 server, Steam/CS2 service, Redis service, or RCON endpoint was
  exercised.
- `make fmt`, `npm run format`, and `npm run format:shell` were not run because
  they are write commands.

## Trust notes

- The supported Node 22 panel test/build/lint/typecheck/E2E surface is now a
  useful local signal for behavior slices.
- Host-side Node 26 panel results remain non-canonical for the full suite because
  this repository pins the panel runtime to Node 22.
- Docker-dependent verification remains externally blocked. Do not claim full
  repository verification until the Docker daemon is available and
  `./scripts/verify.sh` completes.
- No automated check in this baseline proves real CS2/RCON runtime behavior.

## Stronger verification path

1. Run `./scripts/verify.sh` on a machine or session with Docker daemon access.
2. Run `cd apps/operate/panel && npm ci && npm run ci` under a native supported
   Node 22 environment if Docker remains unavailable.
3. Add a runtime smoke against real or representative CS2/RCON infrastructure
   for RCON behavior changes.
