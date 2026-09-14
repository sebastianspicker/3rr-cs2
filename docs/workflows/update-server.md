# Update a CS2 server

Run these steps on the Linux host where systemd manages the CS2 service.

1. Install the script, libraries, and configuration at the path expected by the
   systemd unit:

   ```bash
   sudo install -d /opt/3rr/apps/maintain/updater/lib
   sudo install -m 0755 host-updater/3rr-update.sh /opt/3rr/apps/maintain/updater/3rr-update.sh
   sudo install -m 0644 host-updater/lib/*.sh /opt/3rr/apps/maintain/updater/lib/
   if ! sudo test -e /opt/3rr/apps/maintain/updater/3rr-update.conf; then
     sudo install -m 0600 host-updater/3rr-update.conf.example /opt/3rr/apps/maintain/updater/3rr-update.conf
   fi
   ```

2. Configure `/opt/3rr/apps/maintain/updater/3rr-update.conf`.
3. Run a dry run before enabling automation:

   ```bash
   sudo /opt/3rr/apps/maintain/updater/3rr-update.sh \
     --config=/opt/3rr/apps/maintain/updater/3rr-update.conf --dry-run
   ```

4. Run one supervised update with the same configuration while watching the
   service and updater log. If SteamCMD cannot determine the public build, the
   updater must leave the service running.
5. Install `deploy/systemd/3rr-update.service` and
   `deploy/systemd/3rr-update.timer`, then run `sudo systemctl daemon-reload`.
6. Enable the timer only after the supervised update succeeds:

   ```bash
   sudo systemctl enable --now 3rr-update.timer
   ```

`/api/health` reports the control plane's readiness. Check the updater's log and
systemd status separately.
