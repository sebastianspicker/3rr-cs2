# Deployment examples

This directory contains Compose and systemd examples for a 3RR deployment.
Adapt the container images, secret storage, host paths, and network settings to
your host, then test the resulting deployment before putting it into service.

## Local environment files

Create local Compose environment files from the committed examples, then
replace the sample values with settings for your deployment:

```bash
cp -n control-plane/.env.example deploy/compose/panel.env
cp -n server-bootstrap/env/server.env.example deploy/compose/server.env
chmod 0600 deploy/compose/panel.env deploy/compose/server.env
```

Both destination paths are ignored by Git. Keep secrets and host-specific
values out of committed files.

## Choose the CS2 image

Run these examples from the repository root. `server-runtime.compose.yaml`
requires `CS2_IMAGE` and does not provide a floating default. Set it to the
immutable OCI reference you intend to deploy, including its digest:

```bash
export CS2_IMAGE='registry.example/cs2@sha256:<64-hex-digest>'
scripts/check-deployment-contract.sh --image "$CS2_IMAGE"
docker compose --env-file deploy/compose/server.env \
  -f deploy/compose/server-runtime.compose.yaml config
```

Replace the example registry and digest with the exact image selected for the
host. The repository does not provide a default digest.

Before changing a running CS2 deployment, save these details in a private
deployment record:

```text
change_utc=
repository_revision=
previous_cs2_image_digest=
candidate_cs2_image_digest=
previous_cs2_build_id=
candidate_cs2_build_id=
plugin_versions=
bootstrap_capabilities_checksum=
cfg_bundle_checksum_manifest=
backup_manifest_sha256=
```

Fill in the previous values from the running deployment before pulling or
starting the candidate. List each plugin package and version instead of using a
directory timestamp. Generate checksum manifests from the stopped backup as
described in `docs/recovery.md`. Keep the previous image digest and installation
record until the candidate passes the live CS2 startup, local RCON, plugin, map,
and rollback checks.

## Redis state

The control-plane example keeps Redis data during routine container recreation.
The recovery procedure starts with a new, empty Redis volume, which signs users
out and resets rate-limit counters. If your policy requires sessions to survive
recovery, back up the Redis volume separately and test restoring it. Otherwise,
leave Redis data out of the restore.

## Record and restore the previous image

Before changing the running container, record its image ID and available
immutable references:

```bash
CS2_CONTAINER=$(docker compose --env-file deploy/compose/server.env \
  -f deploy/compose/server-runtime.compose.yaml ps -q cs2-runtime)
test -n "$CS2_CONTAINER" || exit 1
PREVIOUS_IMAGE_ID=$(docker inspect --format '{{.Image}}' "$CS2_CONTAINER")
docker image inspect --format '{{json .RepoDigests}}' "$PREVIOUS_IMAGE_ID"
```

From that output, choose the reference for the deployed repository and save it
as `previous_cs2_image_digest`. If the image has no registry digest, preserve
and test the local image before attempting an upgrade. The image does not
contain the persistent game files managed by SteamCMD, so back up the stopped
installation, its build ID, and its plugin versions and checksums with the
[recovery procedure](../docs/recovery.md).

To rehearse a rollback, use the recorded previous digest as `CS2_IMAGE`. Point a
private Compose override at a restored copy of the previous installation, set
`RECOVERY_OVERRIDE` to that file, and leave the original installation unchanged:

```bash
export CS2_IMAGE="$PREVIOUS_CS2_IMAGE_DIGEST"
bash scripts/check-deployment-contract.sh --image "$CS2_IMAGE"
docker compose --env-file deploy/compose/server.env \
  -f deploy/compose/server-runtime.compose.yaml \
  -f "${RECOVERY_OVERRIDE:?Set RECOVERY_OVERRIDE to the private override file}" \
  up -d cs2-runtime
```

Set `PREVIOUS_CS2_IMAGE_DIGEST`, `RECOVERY_OVERRIDE`, and the restored volume
from the recovery record. Confirm the restored build ID, plugins, map, and RCON
access before relying on the rollback.
