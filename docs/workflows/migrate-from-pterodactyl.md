# Migrate From Pterodactyl-Style Setups

This repository does not treat Pterodactyl as the primary deployment model.

Migration path:

1. Export the effective startup arguments and server secrets from the old setup.
2. Map them into `apps/provision/bootstrap/env/server.env.example`.
3. Choose either the compose example or a host-level startup command.
4. Install `apps/maintain/updater` for updates.
5. Attach `apps/operate/panel` only if you want a web control plane.
