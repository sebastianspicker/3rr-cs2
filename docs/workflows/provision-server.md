# Provision a CS2 server

Run these commands from the repository root.

1. Copy the environment reference to an ignored local file:

   ```bash
   cp apps/provision/bootstrap/env/server.env.example \
     configs/examples/compose/server.env
   ```

2. Set `RCON_PASSWORD` and any required `CS2_*` values. Do not point Compose at
   the committed example without supplying local credentials.
3. Write the reference CounterStrikeSharp files:

   ```bash
   apps/provision/bootstrap/scripts/bootstrap-admins.sh \
     configs/examples/compose/bootstrap
   apps/provision/bootstrap/scripts/bootstrap-plugins.sh \
     configs/examples/compose/bootstrap
   ```

4. Review the files under `configs/examples/compose/bootstrap`. Replace the
   reference identities and plugin list with values appropriate for the server.
5. Review `configs/examples/compose/server-runtime.compose.yaml`. It uses the
   external `cm2network/cs2` image, stores the runtime in a named volume, and
   mounts the bootstrap directory read-only.
6. Export the local environment or pass it with Compose:

   ```bash
   docker compose \
     --env-file configs/examples/compose/server.env \
     -f configs/examples/compose/server-runtime.compose.yaml \
     up -d
   ```

7. Confirm the server starts, the configured map loads, and RCON authentication
   succeeds before connecting the panel.

The startup wrapper writes `game/csgo/cfg/3rr-secrets.cfg` with mode `0600` and
removes `RCON_PASSWORD` and `CS2_GSLT` from the launched process environment.
The provision module does not install plugins, maps, SteamCMD, or host services.
