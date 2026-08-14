# Migrate from a Pterodactyl-style deployment

3RR does not provide a Pterodactyl egg or treat Pterodactyl as its default
runtime.

1. Record the existing CS2 installation path, startup arguments, ports, player
   limit, map, CFG file, Game Server Login Token, and RCON password.
2. Export server CFG files, maps, plugins, CounterStrikeSharp data, and any
   persistent volumes.
3. Map applicable values to
   `apps/provision/bootstrap/env/server.env.example`.
4. Choose
   `configs/examples/compose/server-runtime.compose.yaml` or
   `configs/examples/startup/server-start.sh` and adapt storage paths to the
   target host.
5. Start the server without the panel or updater. Confirm map loading and RCON
   authentication.
6. Install the updater only on a Linux/systemd host where it can control the
   selected CS2 service.
7. Connect the panel after the server runtime is stable.

Keep the old deployment stopped and recoverable until the new runtime,
configuration, data, and RCON access have been verified.
