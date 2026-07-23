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

Panel deployment settings:

- `DB_PATH` selects the SQLite database file.
- `REDIS_URL` is required when `NODE_ENV=production` and optional in development.
- `TRUST_PROXY` must match the number of trusted reverse-proxy hops. Leave it
  false when clients can reach the panel directly.
- `SESSION_COOKIE_SECURE` defaults to true in production and requires HTTPS.
- `PANEL_BIND_ADDRESS` is consumed by the Compose examples, not by the Node
  process. It defaults published port 3000 to `127.0.0.1`.

First-admin bootstrap for an empty panel database is explicit and temporary:

- `ALLOW_DEFAULT_CREDENTIALS=true` opts in to creating the first administrator.
- `DEFAULT_USERNAME` and `DEFAULT_PASSWORD` provide that initial account; the password must
  contain at least 12 characters and must not be a known placeholder in production.
- Once an administrator exists, remove both credential values and set
  `ALLOW_DEFAULT_CREDENTIALS=false`.

Do not publish placeholder secrets in compose files or startup templates.

The committed `*.env.example` files are reference material only. Shared compose examples are written to consume operator-local env files or exported shell variables instead of loading committed placeholder secrets directly.
