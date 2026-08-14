# Contributing to the maintain updater

## Requirements

Install ShellCheck 0.10.0 or later and shfmt 3.8.0 or later. The helper below
downloads pinned copies and verifies their checksums:

```bash
cd apps/maintain/updater
./scripts/ci-install-tools.sh
```

## Development

```bash
make lint
make test
make security
make ci
```

`make fmt` applies the repository shfmt style. Use Bash 4 or later,
`set -euo pipefail`, four-space indentation, local function variables, and
quoted expansions.

Changes to update detection, locking, path validation, service control, signal
handling, retry behavior, or logging require focused tests. Preserve the rule
that an unknown remote build ID leaves the CS2 service running.

Pull requests must describe the behavior change and include relevant,
credential-free logs. Update the README and configuration example when
operator-facing behavior changes.

Report security issues through a private
[GitHub security advisory](https://github.com/sebastianspicker/3rr/security/advisories/new).
