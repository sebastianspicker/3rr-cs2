# Contributing

Keep changes inside one module where possible:

- `control-plane/`
- `host-updater/`
- `server-bootstrap/`
- `deploy/`, `docs/`, and `scripts/` only for shared contracts

Do not add production dependencies without maintainer approval. Never commit
credentials, local databases, environment files, machine-specific paths,
temporary evidence, or tool state.

## Development standards

- Control-plane TypeScript targets Node 22 and must preserve the dependency
  direction enforced by `npm run check:architecture`.
- Bash uses `set -euo pipefail` and must pass ShellCheck and shfmt.
- Runtime behavior changes need focused tests.
- Keep public HTTP/API, environment, SQLite, RCON, updater CLI/config/install,
  and bootstrap capability-manifest contracts in sync with their documentation.
- Treat `web/generated` as build output; edit `web/client`, `web/assets`, or
  `web/views` instead.

## Verification

Run the narrowest relevant module checks first:

```bash
cd control-plane && npm run check
cd control-plane && npm run validate -- --require-docker
cd host-updater && make ci
bash server-bootstrap/tests/bootstrap-output-safety.test.sh
bash server-bootstrap/tests/capabilities-contract.test.sh
bash server-bootstrap/tests/startup-wrapper-safety.test.sh
```

Then run `./scripts/verify.sh` when the change crosses modules or release
contracts. If a required environment is unavailable, record the exact skipped
command and blocker; partial local verification is not release evidence.

## Pull requests

Describe behavior, affected module, compatibility impact, and commands run.
Call out changes to CSRF/session/RCON safety, SQLite migrations or `enc:v1`,
environment names, updater installation and systemd integration, or deployment
examples. Remove secrets from any attached logs.

Report vulnerabilities through the private
[GitHub security advisory](https://github.com/sebastianspicker/3rr/security/advisories/new).
