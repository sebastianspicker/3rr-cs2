# Migrate from a Pterodactyl-style deployment

3RR does not include a Pterodactyl egg. Use these steps to move an existing
Pterodactyl-style server to the supplied Compose runtime.

1. Record the existing CS2 installation path, startup arguments, ports, player
   limit, map, CFG file, Game Server Login Token, and RCON password.
2. Export server CFG files, maps, plugins, CounterStrikeSharp data, and any
   persistent volumes.
3. Copy the applicable values into a local environment file based on
   `server-bootstrap/env/server.env.example`.
4. Start with `deploy/compose/server-runtime.compose.yaml` and adapt its storage
   paths to the target host.
5. Start the server without the panel or updater. Confirm map loading and RCON
   authentication.
6. Install the updater only on a Linux/systemd host where it can control the
   selected CS2 service.
7. Connect the control plane after the server runtime is stable.

Keep the old deployment stopped and ready to restore until you have tested the
new runtime, configuration, data, and RCON access.
