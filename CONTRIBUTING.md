# Contributing

Start with the module you want to change. Each has its own README and checks:

- [Control plane](control-plane/README.md): browser UI, HTTP API, and RCON access.
- [Host updater](host-updater/README.md): Linux host updates through SteamCMD and systemd.
- [Server bootstrap](server-bootstrap/README.md): CS2 configuration and startup files.
- [Browser demo](design-preview/README.md): a standalone, simulated design preview.

Use `deploy/`, `docs/`, and `scripts/` for configuration, documentation, and
checks shared by those modules. Keep a change within one module when possible.

Discuss new production dependencies with a maintainer before adding them.
Keep credentials, local databases, environment files, personal paths,
temporary reports, and tool state out of commits.

## Working on the code

The control plane uses Node 22. Follow the module's setup instructions before
running its checks. `npm run check:architecture` checks the permitted import
directions between application layers.

For browser changes, edit `control-plane/web/client`, `web/assets`, or
`web/views`. The build writes `web/generated`; do not edit those files directly.
Bash scripts use `set -euo pipefail` and must pass ShellCheck and shfmt.

Add focused tests when changing runtime behavior. Update the relevant docs
when changing an HTTP response, environment setting, SQLite schema, RCON
behavior, updater command or installation step, or bootstrap capability.

## Running checks

Run the checks for the module you changed. These commands can be run from the
repository root:

```bash
(cd control-plane && npm run check)
(cd control-plane && npm run validate -- --require-docker)
(cd host-updater && make ci)
bash server-bootstrap/tests/bootstrap-output-safety.test.sh
bash server-bootstrap/tests/capabilities-contract.test.sh
bash server-bootstrap/tests/startup-wrapper-safety.test.sh
node --check design-preview/preview.js
node design-preview/verify.mjs
```

For documentation changes, check local links and whitespace:

```bash
ruby scripts/check-doc-links.rb
git diff --check
```

If a frontend change affects the README tour, rebuild and refresh the
screenshots using the temporary test data:

```bash
cd control-plane
npm run build
node scripts/capture-screenshots.mjs
```

The [capture guide](docs/screenshots/README.md) lists the browser requirements.

Run `./scripts/verify.sh` from the repository root when a change crosses
modules or affects release requirements. If you cannot run a required check,
include the command and the reason in your pull request. A skipped deployment
check still needs to pass before release.

## Opening a pull request

Explain the problem, what your change does, and which modules it affects.
Include the commands you ran and their results, plus any checks you could not
run.

Call out changes to session or CSRF protection, RCON access, SQLite migrations,
the `enc:v1` credential format, environment names, updater installation,
systemd integration, or deployment examples. Remove secrets from attached logs.

Use the [security policy](SECURITY.md) to report vulnerabilities privately.
