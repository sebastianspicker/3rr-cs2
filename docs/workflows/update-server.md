# Update A Server

Use this workflow when the server already exists and you want safe unattended maintenance.

1. Configure `apps/maintain/updater/cs2-auto-update.conf.example`.
2. Install the script and systemd units from `configs/examples/systemd/`.
3. Run `update_cs2.sh --dry-run` before enabling automation.
4. Enable the timer only after a dry-run and one supervised real update succeed.
5. Optionally monitor the result from the panel health endpoint.
