# Disaster recovery

Back up:

- CS2 configuration, maps, plugins, and CounterStrikeSharp data
- the control-plane SQLite database selected by `DB_PATH`
- deployment secrets and environment values
- the updater configuration and systemd units

Restore services in this order:

1. Restore the CS2 installation and its configuration.
2. Restore or recreate the bootstrap files and confirm their ownership and
   `0600` permissions.
3. Start the CS2 service and verify RCON locally.
4. Restore the updater configuration. Run `--dry-run` before enabling its
   timer.
5. Restore a SQLite backup compatible with the selected control-plane version.
6. Start Redis and the control plane.
7. Confirm that `GET /api/health` returns `200` with `"ready": true`.
8. Sign in and test one read-only server status request.
9. Resume state-changing controls and updater automation only after those checks
   succeed.

Keep at least one copy of secrets, plugin lists, and administrator data outside
replaceable containers and runtime directories. For a full backup and restore
rehearsal, follow [Recovery rehearsal and restore](../recovery.md).
