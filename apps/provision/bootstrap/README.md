# Provision: Bootstrap

This module contains generic bootstrap assets for self-hosted CS2 server runtimes.

It is intentionally not a shipping replacement for the archived egg. Its job is to provide
clean, reviewable starting points:

- environment templates
- startup wrappers
- plugin bootstrap
- admin/bootstrap manifest generation

Use the shared examples in `../../../configs/examples/` together with these scripts.

Recommended flow:

1. Copy `env/server.env.example` to a local env file outside version control.
2. Run `scripts/bootstrap-admins.sh ../../../configs/examples/compose/bootstrap`.
3. Run `scripts/bootstrap-plugins.sh ../../../configs/examples/compose/bootstrap`.
4. Start from `../../../configs/examples/compose/server-runtime.compose.yaml` or `../../../configs/examples/startup/server-start.sh`.
