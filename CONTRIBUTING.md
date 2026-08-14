# Contributing

## Scope

Keep changes within one module when possible:

- `apps/provision/bootstrap`
- `apps/maintain/updater`
- `apps/operate/panel`

Change root documentation, shared examples, or repository scripts only when the
change affects more than one module or a shared contract.

Do not add production dependencies without maintainer approval. Do not include
credentials, local databases, environment files, machine-specific paths,
temporary notes, or local tool state.

## Development standards

- TypeScript targets Node 22 and uses strict type checking.
- Bash scripts use `set -euo pipefail` and must pass ShellCheck and shfmt.
- Runtime behavior changes require focused tests.
- Public HTTP, environment, storage, and RCON contracts must be updated with
  their implementation.

## Verification

Run the focused module checks first. Then run:

```bash
./scripts/verify.sh
```

The full script requires the documented shell tools and a working Docker
daemon. If an environmental limitation prevents a check, record the exact
command and failure instead of treating a partial run as complete.

Panel contributors should also read
[apps/operate/panel/CONTRIBUTING.md](apps/operate/panel/CONTRIBUTING.md).
Updater contributors should read
[apps/maintain/updater/CONTRIBUTING.md](apps/maintain/updater/CONTRIBUTING.md).

## Pull requests

Describe the behavior change, affected module, compatibility impact, and
verification results. Use the pull request template and include relevant logs
with secrets removed.

Use the issue templates for reproducible defects and bounded feature requests.
Report vulnerabilities through a private
[GitHub security advisory](https://github.com/sebastianspicker/3rr/security/advisories/new).
