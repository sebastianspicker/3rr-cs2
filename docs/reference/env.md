# Environment Contract

Shared naming rules:

- `CS2_*` for runtime-specific server values
- `RCON_*` for remote-console credentials and crypto material
- `SESSION_*` for web session behavior
- `PANEL_*` for panel-only host or URL settings when needed

Minimum secrets:

- `SESSION_SECRET`: 32+ character secret for `operate`
- `RCON_SECRET_KEY`: 32-byte base64 or hex key for encrypted RCON secrets
- `RCON_PASSWORD`: per-server runtime credential

Do not publish placeholder secrets in compose files or startup templates.

The committed `*.env.example` files are reference material only. Shared compose examples are written to consume operator-local env files or exported shell variables instead of loading committed placeholder secrets directly.
