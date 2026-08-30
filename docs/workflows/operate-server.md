# Operate a running server

1. Install and configure the [control plane](../../control-plane/README.md).
2. Confirm `GET /api/health` returns `200` with `"ready": true`.
3. Sign in and add the existing server's host, port, and RCON password. The
   control plane probes the credentials before saving the server.
4. Confirm inventory shows an observed connection state.
5. Use a read-only status or player request before sending state-changing
   commands.
6. Enable only controls whose CFG files, maps, and plugins are installed on the
   server. See [CS2 server requirements](../../control-plane/docs/SERVER-SETUP.md).

The control plane records sent-command history, not proof that a server applied
a command. Check returned state and server logs when an operation matters.
Keep host updates in `host-updater`; do not add host command execution to the
control plane.
