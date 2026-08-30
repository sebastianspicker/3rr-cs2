# Update a CS2 server

Use this procedure on the Linux host that owns the CS2 systemd service.

1. Install the script, libraries, and config while preserving the established
   installation layout:

   ```bash
   sudo install -d /opt/3rr/apps/maintain/updater/lib
   sudo install -m 0755 host-updater/3rr-update.sh /opt/3rr/apps/maintain/updater/3rr-update.sh
   sudo install -m 0644 host-updater/lib/*.sh /opt/3rr/apps/maintain/updater/lib/
   sudo install -m 0600 host-updater/3rr-update.conf.example /opt/3rr/apps/maintain/updater/3rr-update.conf
   ```

2. Configure `/opt/3rr/apps/maintain/updater/3rr-update.conf`.
3. Run a dry run before enabling automation:

   ```bash
   sudo /opt/3rr/apps/maintain/updater/3rr-update.sh \
     --config=/opt/3rr/apps/maintain/updater/3rr-update.conf --dry-run
   ```

4. Run one supervised update with the same config, monitoring the service and
   configured log. An unknown remote build must leave the service running.
5. Install `deploy/systemd/3rr-update.service` and
   `deploy/systemd/3rr-update.timer`, then run `sudo systemctl daemon-reload`.
6. Enable the timer only after the supervised update succeeds:

   ```bash
   sudo systemctl enable --now 3rr-update.timer
   ```

The control-plane `/api/health` endpoint reports control-plane readiness, not
host-updater execution state.
