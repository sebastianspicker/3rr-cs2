# Environment variables

Keep deployment values in untracked environment files or a secret store. The
committed examples document names and defaults; they are not usable credentials.

## Operate panel

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `NODE_ENV` | No | Development behavior | Set to `production` for production checks and cookie defaults |
| `PORT` | No | `3000` | HTTP listen port |
| `DB_PATH` | No | `/home/container/data/3rr.db` | Local development can fall back to `./data/3rr.db` when unset |
| `SESSION_SECRET` | Production | Temporary development value | Production requires at least 32 characters |
| `REDIS_URL` | Production | Unset | Redis storage for sessions and rate limits |
| `TRUST_PROXY` | Proxy dependent | `false` | Boolean or trusted proxy hop count |
| `SESSION_COOKIE_SECURE` | No | `true` in production | Requires HTTPS when true |
| `SESSION_COOKIE_SAMESITE` | No | `strict` | Invalid values fall back to `lax` |
| `SESSION_COOKIE_NAME` | No | `3rr.sid` | Session cookie name |
| `SESSION_MAX_AGE_MS` | No | `86400000` | Rolling session lifetime |
| `RCON_SECRET_KEY` | Production | Unset | 32-byte base64 or hex key for stored RCON passwords |
| `RCON_COMMAND_TIMEOUT_MS` | No | `2000` | Per-command timeout |
| `HEALTHCHECK_VERBOSE` | No | `false` | Allows detailed unauthenticated health responses |
| `LOG_LEVEL` | No | Application default | Pino log level |

In production, the `DB_PATH` parent directory must be owned by the panel user
or root and must not be group- or world-writable. The database must be a regular
single-link file owned by the panel user or root with mode `0600`; a new database
is created with that mode. Symlinked and hard-linked database files are rejected.

First-administrator variables apply only to an empty database:

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `ALLOW_DEFAULT_CREDENTIALS` | No | `false` | Must be `true` to permit first-administrator creation |
| `DEFAULT_USERNAME` | During bootstrap | Empty | Initial administrator username |
| `DEFAULT_PASSWORD` | During bootstrap | Empty | Initial password; minimum 12 characters |

After the administrator exists, remove `DEFAULT_USERNAME` and
`DEFAULT_PASSWORD` and set `ALLOW_DEFAULT_CREDENTIALS=false`.

`PANEL_BIND_ADDRESS` is read by
`apps/operate/panel/docker-compose.yaml`, not by the Node process. It defaults
to `127.0.0.1`.

## CS2 runtime and provision assets

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `CS2_INSTALL_DIR` | No | Startup script directory | Root containing `game/cs2.sh` and `game/csgo` |
| `CS2_HOSTNAME` | No | `Example CS2 Server` | Server hostname |
| `CS2_MAP` | No | `de_dust2` | Initial map |
| `CS2_PORT` | No | `27015` | TCP and UDP port, 1 through 65535 |
| `CS2_MAXPLAYERS` | No | `16` | Player limit, 1 through 64 |
| `CS2_GSLT` | No | Empty | Game Server Login Token |
| `CS2_CFG_FILE` | No | `server.cfg` | CFG executed before the secret CFG |
| `RCON_PASSWORD` | Yes | Empty | Written to the owner-only secret CFG |
| `CSS_ADMINS_FILE` | No | Unset | Optional CounterStrikeSharp admin file to link into the runtime |
| `CSS_GROUPS_FILE` | No | Unset | Optional CounterStrikeSharp group file to link into the runtime |

The startup wrapper removes `CS2_GSLT` and `RCON_PASSWORD` from the environment
before executing the server.

## Maintain updater

The updater reads these keys from `3rr-update.conf`:

| Key | Default | Purpose |
| --- | --- | --- |
| `LOCKDIR` | `/tmp/3rr-update.lock` | Atomic process lock directory |
| `LOGFILE` | `/var/log/3rr/update.log` | Root-owned update log |
| `CS2_DIR` | `/home/steam/cs2` | CS2 installation directory |
| `SERVICE_NAME` | `cs2.service` | systemd unit to stop and start |
| `STEAMCMD` | `/usr/games/steamcmd` | SteamCMD executable |
| `CS2_APP_ID` | `730` | Steam application ID |
| `REQUIRED_SPACE` | `5000000` | Required free space in KB |
| `MAX_ATTEMPTS` | `5` | Service and update retry limit |
| `SLEEP_SECS` | `5` | Delay between retries |
| `STEAMCMD_TIMEOUT_SECS` | `1800` | Timeout for each SteamCMD invocation |
| `LOG_LEVEL` | `normal` | `quiet` or `normal` |
| `DRY_RUN` | `0` | Set to `1` for status-only behavior |

Unknown keys, duplicate active keys, malformed lines, and empty critical values
fail validation. `ALLOW_NONROOT` and `NO_SLEEP` are test-only environment
controls and are not accepted in the configuration file.
