# Update A Server

Use this workflow when the server already exists and you want safe unattended maintenance.

1. Install the updater script and config from the repository checkout:

   ```bash
   sudo install -D -m 0755 apps/maintain/updater/3rr-update.sh /opt/3rr/apps/maintain/updater/3rr-update.sh
   sudo install -m 0600 apps/maintain/updater/3rr-update.conf.example /opt/3rr/apps/maintain/updater/3rr-update.conf
   ```

2. Configure `/opt/3rr/apps/maintain/updater/3rr-update.conf`.
3. Run `/opt/3rr/apps/maintain/updater/3rr-update.sh --config=/opt/3rr/apps/maintain/updater/3rr-update.conf --dry-run` before enabling automation.
4. Install `configs/examples/systemd/3rr-update.service` and
   `configs/examples/systemd/3rr-update.timer`, then enable the timer only after a dry-run and
   one supervised real update succeed.
5. Monitor the systemd unit and the configured updater log. The panel `/api/health`
   endpoint reports panel readiness, not updater execution state.
