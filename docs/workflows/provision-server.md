# Provision a CS2 server

Run these commands from the repository root.

1. Copy the environment reference to an ignored local file:

   ```bash
   cp server-bootstrap/env/server.env.example deploy/compose/server.env
   ```

2. Set `RCON_PASSWORD` and required `CS2_*` values in that local file.
3. Write CounterStrikeSharp administrator assets into a local, non-versioned
   directory:

   ```bash
   server-bootstrap/scripts/bootstrap-admins.sh deploy/compose/bootstrap
   ```

4. Review the generated `admins.json` and `admin_groups.json`, then review the
   `server-bootstrap` capability manifest and the Compose deployment:

   ```bash
   jq . server-bootstrap/capabilities.json
   docker compose --env-file deploy/compose/server.env \
     -f deploy/compose/server-runtime.compose.yaml config
   ```

5. Start the runtime only after adapting storage, network, and image choices to
   the host:

   ```bash
   docker compose --env-file deploy/compose/server.env \
     -f deploy/compose/server-runtime.compose.yaml up -d
   ```

6. Confirm server startup, the configured map, and RCON authentication before
   connecting the control plane.

The startup wrapper writes `game/csgo/cfg/3rr-secrets.cfg` with mode `0600` and
removes `RCON_PASSWORD` and `CS2_GSLT` from the launched process environment.
Bootstrap does not install plugins, maps, SteamCMD, or host services.
