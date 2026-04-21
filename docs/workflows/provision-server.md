# Provision A Server

Use this workflow when you are bringing up a new modded CS2 server.

1. Start with the environment template in `apps/provision/bootstrap/env/server.env.example`.
2. Pick a deployment pattern from `configs/examples/compose/` or `configs/examples/startup/`.
3. Seed plugin and admin assets with the scripts in `apps/provision/bootstrap/scripts/`.
4. Install the updater if you want unattended patching.
5. Attach the panel only after the runtime is reachable and stable.
