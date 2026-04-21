# Provision A Server

Use this workflow when you are bringing up a new modded CS2 server.

1. Start with the environment template in `apps/provision/bootstrap/env/server.env.example`.
2. Copy the values you need into a local env file next to your deployment artifacts; do not point Compose at the committed example file directly.
3. Seed admin and plugin artifacts into `configs/examples/compose/bootstrap/` with the scripts in `apps/provision/bootstrap/scripts/`. The compose example mounts this directory at `/bootstrap` inside the container.
4. Pick a deployment pattern from `configs/examples/compose/` or `configs/examples/startup/`.
5. Install the updater if you want unattended patching.
6. Attach the panel only after the runtime is reachable and stable.
