# Update A Server

Use this workflow when the server already exists and you want safe unattended maintenance.

1. Configure `apps/maintain/updater/cs2-auto-update.conf.example`.
2. Install the updater under `/opt/cs2-server-ops/apps/maintain/updater/` so the shared systemd unit and the script's default config lookup agree.
3. Run `update_cs2.sh --dry-run` before enabling automation.
4. Enable the timer only after a dry-run and one supervised real update succeed.
5. Optionally monitor the result from the panel health endpoint.
