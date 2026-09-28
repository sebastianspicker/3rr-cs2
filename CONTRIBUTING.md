# Contributing

Start with the module you want to change. Each has its own README and checks:

- [Control plane](control-plane/README.md): browser UI, HTTP API, and RCON access.
- [Host updater](host-updater/README.md): Linux host updates through SteamCMD and systemd.
- [Server bootstrap](server-bootstrap/README.md): CS2 configuration and startup files.
- [Browser demo](design-preview/README.md): a standalone, simulated design preview.

Use `deploy/` and `docs/` for shared configuration and documentation.
Keep a change within one module when possible.

Discuss new production dependencies with a maintainer before adding them.
Keep credentials, local databases, environment files, personal paths,
temporary reports, and tool state out of commits.

## Working on the code

The control plane uses Node 26. Follow the module's setup instructions before
building it. Keep the import directions in the
[architecture guide](docs/architecture.md#control-plane-structure).

For browser changes, edit `control-plane/web/client`, `web/assets`, or
`web/views`. The build writes `web/generated`; do not edit those files directly.
Control-plane shell helpers must pass ShellCheck and shfmt. Updater scripts must
pass `bash -n` and ShellCheck; bootstrap scripts must pass `bash -n`.

Update the relevant docs when changing an HTTP response, environment setting,
SQLite schema, RCON behavior, updater command or installation step, or
bootstrap capability.

## Running checks

Run the checks for the module you changed. These commands can be run from the
repository root:

```bash
(cd control-plane && npm ci && npm run typecheck && npm run build)
(cd control-plane && npm run validate -- --require-docker)
node --check design-preview/preview.js
node design-preview/build.mjs --check
bash scripts/check-deployment-contract.sh
```

For documentation changes, check whitespace:

```bash
git diff --check
```

If a frontend change affects the browser demo, regenerate its assets with
`node design-preview/build.mjs` and review the result. Include the commands
you ran and any checks you could not run in your pull request.

## Opening a pull request

Explain the problem, what your change does, and which modules it affects.
Include the commands you ran and their results, plus any checks you could not
run.

Call out changes to session or CSRF protection, RCON access, SQLite migrations,
the `enc:v1` credential format, environment names, updater installation,
systemd integration, or deployment examples. Remove secrets from attached logs.

Use the [security policy](SECURITY.md) to report vulnerabilities privately.
