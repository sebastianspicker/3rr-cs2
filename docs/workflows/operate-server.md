# Operate a running server

1. Install and configure the [control plane](../../control-plane/README.md).
2. Confirm `GET /api/health` returns `200` with `"ready": true`.
3. Sign in and add the existing server's host, port, and RCON password. The
   control plane probes the credentials before saving the server.
4. Check the connection state in the server list.
5. Send a read-only status or player request before using a control that changes
   server state.
6. Use only controls supported by the CFG files, maps, and plugins installed on
   the server. See [CS2 server requirements](../../control-plane/docs/SERVER-SETUP.md).

The command history shows what the control plane sent. To confirm that CS2
applied an important command, check the returned server state and logs. Run host
updates through `host-updater`; the control plane does not execute host commands.
