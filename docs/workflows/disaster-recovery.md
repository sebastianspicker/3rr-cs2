# Disaster recovery

Back up these operator-owned files:

- CS2 configuration, maps, plugins, and CounterStrikeSharp data
- the panel SQLite database selected by `DB_PATH`
- deployment secrets and environment values
- the updater configuration and systemd units

Recovery order:

1. Restore the CS2 installation and its configuration.
2. Restore or recreate the bootstrap files and confirm their ownership and
   `0600` permissions.
3. Start the CS2 service and verify RCON locally.
4. Restore the updater configuration. Run `--dry-run` before enabling its
   timer.
5. Restore a SQLite backup compatible with the selected panel version.
6. Start Redis and the panel.
7. Confirm `GET /api/health` returns `200` and `"ready": true`.
8. Sign in and test one read-only server status request.
9. Resume state-changing controls and updater automation only after those checks
   succeed.

Do not store the only copy of secrets, plugin lists, or administrator data
inside a replaceable container or runtime directory.
