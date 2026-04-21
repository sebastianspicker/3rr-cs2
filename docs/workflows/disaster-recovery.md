# Disaster Recovery

Recovery order:

1. Recreate the runtime from `provision` assets.
2. Restore server config and plugin/admin bootstrap data.
3. Re-enable the updater service and confirm dry-run status.
4. Reconnect the panel and verify `/api/health`.

Keep secrets, plugin lists, and admin manifests outside generated runtime directories.
