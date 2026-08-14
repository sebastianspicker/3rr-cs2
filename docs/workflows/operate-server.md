# Operate a running server

1. Install and configure the panel using
   [apps/operate/panel/README.md](../../apps/operate/panel/README.md).
2. Confirm `GET /api/health` returns `200` with `"ready": true`.
3. Sign in and add the existing server's host, port, and RCON password. The
   panel probes the credentials before saving the server.
4. Confirm the inventory shows an observed connection state.
5. Use a read-only status or player request before sending state-changing
   commands.
6. Enable only controls whose CFG files, maps, and plugins are installed on the
   server. See
   [SERVER-SETUP.md](../../apps/operate/panel/docs/SERVER-SETUP.md).

The panel stores sent-command history, not proof that the server applied a
command. Check the returned state and server logs when an operation matters.
Keep host updates in the maintain updater rather than adding host command
execution to the panel.
