# Contributing

## Scope

Keep changes inside one module whenever possible:

- `apps/provision/bootstrap`
- `apps/maintain/updater`
- `apps/operate/panel`

Shared docs, examples, and CI belong at repo root only when they affect more than one module.

## Standards

- TypeScript: Node 22, strict types, no `any`
- Bash: `set -euo pipefail`, shellcheck-clean
- Public docs only: no machine-specific paths, no local harness guidance, no private workflow notes

## Verification

Run the full repository check before publishing:

```bash
./scripts/verify.sh
```

If you touch only one module, still keep the full repo green before release.

## Commits

Prefer small logical commit blocks that preserve the module split:

1. shared docs and contracts
2. operate changes
3. maintain changes
4. provision changes
5. CI and verification updates
