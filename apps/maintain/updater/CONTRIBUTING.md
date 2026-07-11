# Contributing

Thanks for considering a contribution.

## Local Setup

Install the linting and formatting tools. GitHub Actions installs these via
`apt`. The repository keeps a pinned downloader only for local/manual setup when
the host package manager cannot provide the required versions and checksum
verification is useful:

```bash
./scripts/ci-install-tools.sh   # Downloads shellcheck + shfmt with SHA256 verification
```

Or install manually: [shellcheck](https://github.com/koalaman/shellcheck) 0.10.0+, [shfmt](https://github.com/mvdan/sh) 3.8.0+.

## Development

- Run `make ci` (lint + test + security) before submitting. This is the same pipeline that runs in GitHub Actions.
- Use `make fmt` to auto-format scripts (shfmt style: `-i 4 -ci -bn -sr`).
- Use `make help` to list all available targets.
- Keep changes focused and avoid unrelated refactors.

### Coding Style

- Bash 4.x+ with `set -euo pipefail`
- 4-space indentation (enforced by shfmt)
- Declare all function-scoped variables with `local`
- Quote all variable expansions

## Pull Requests

- Describe the problem and the proposed solution.
- Include verification steps and relevant logs (redact secrets).
- Update documentation if behavior changes.
- CODEOWNERS requires maintainer review for changes to `update_cs2.sh`, `Makefile`, `scripts/`, and `.github/`.

## Commit Messages

Use conventional commits: `fix:`, `feat:`, `docs:`, `test:`, `ci:`, `refactor:`, `security:`, `chore:`

## Security

Please do not file public issues for security-sensitive reports. Use GitHub Security Advisories if available.
