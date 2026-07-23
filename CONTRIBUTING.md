# Contributing

## Scope

Keep changes inside one module whenever possible:

- `apps/provision/bootstrap`
- `apps/maintain/updater`
- `apps/operate/panel`

Shared documentation, examples, and CI belong at the repository root only when
they affect more than one module.

## Standards

- TypeScript: Node 22, strict types, no `any`
- Bash: `set -euo pipefail`, ShellCheck-clean
- Public documentation: no machine-specific paths, local harness guidance, or
  private workflow notes

## Verification

Run the full repository check before requesting review:

```bash
./scripts/verify.sh
```

If you touch only one module, run its focused checks first and the full
repository gate before release.

Use the pull request template to record focused checks, environment-blocked checks, and
public documentation impact. Do not convert a partial local run into a release-readiness
claim; update `RELEASE_STATUS.md` only with reproducible evidence.

## Issues And Security

- Use the repository issue templates for reproducible bugs and bounded feature proposals.
- Report vulnerabilities through a private
  [GitHub security advisory](https://github.com/sebastianspicker/cs2-server-ops/security/advisories/new),
  never a public issue.

## Commits

Prefer small logical commit blocks that preserve the module split:

1. shared docs and contracts
2. operate changes
3. maintain changes
4. provision changes
5. CI and verification updates

Do not include local agent state, audit packets, remediation ledgers, generated screenshots,
credentials, or machine-specific paths in a public change.
