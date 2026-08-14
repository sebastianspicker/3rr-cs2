# Update a CS2 server

Use this procedure on the Linux host that owns the CS2 systemd service.

1. Install the updater script and config from the repository checkout:

   ```bash
   sudo install -D -m 0755 apps/maintain/updater/3rr-update.sh /opt/3rr/apps/maintain/updater/3rr-update.sh
   sudo install -d /opt/3rr/apps/maintain/updater/lib
   sudo install -m 0644 apps/maintain/updater/lib/*.sh /opt/3rr/apps/maintain/updater/lib/
   sudo install -m 0600 apps/maintain/updater/3rr-update.conf.example /opt/3rr/apps/maintain/updater/3rr-update.conf
   ```

2. Configure `/opt/3rr/apps/maintain/updater/3rr-update.conf`.
3. Run `/opt/3rr/apps/maintain/updater/3rr-update.sh --config=/opt/3rr/apps/maintain/updater/3rr-update.conf --dry-run` before enabling automation.
4. Run one supervised update with the same `--config` path. Monitor the service
   and the configured log.
5. Install `configs/examples/systemd/3rr-update.service` and
   `configs/examples/systemd/3rr-update.timer`.
6. Run `sudo systemctl daemon-reload`, then
   `sudo systemctl enable --now 3rr-update.timer`.
7. Monitor the systemd unit and the configured updater log. The panel `/api/health`
   endpoint reports panel readiness, not updater execution state.
