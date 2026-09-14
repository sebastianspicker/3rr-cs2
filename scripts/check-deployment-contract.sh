#!/usr/bin/env bash
# Validates repository deployment invariants without contacting a registry or host.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
SERVER_COMPOSE="${ROOT}/deploy/compose/server-runtime.compose.yaml"
CONTROL_COMPOSE="${ROOT}/deploy/compose/control-plane.compose.yaml"
DEPLOYMENT_DOC="${ROOT}/deploy/README.md"

fail() {
  printf 'Deployment contract failed: %s\n' "$*" >&2
  exit 1
}

validate_image() {
  local image
  image="$1"
  if [[ ! "${image}" =~ ^[^[:space:]]+@sha256:[0-9a-fA-F]{64}$ ]]; then
    fail "CS2_IMAGE must be an immutable image reference ending in @sha256:<64 hex characters>"
  fi
}

image=""
while (($# > 0)); do
  case "$1" in
    --image)
      (($# >= 2)) || fail "--image requires a value"
      image="$2"
      shift 2
      ;;
    --image=*)
      image="${1#--image=}"
      shift
      ;;
    *) fail "unknown argument: $1" ;;
  esac
done

[[ -f "${SERVER_COMPOSE}" ]] || fail "missing ${SERVER_COMPOSE}"
[[ -f "${CONTROL_COMPOSE}" ]] || fail "missing ${CONTROL_COMPOSE}"
[[ -f "${DEPLOYMENT_DOC}" ]] || fail "missing ${DEPLOYMENT_DOC}"

# shellcheck disable=SC2016 # Match the literal Compose interpolation token.
grep -Fq 'image: "${CS2_IMAGE:?' "${SERVER_COMPOSE}" || fail "server Compose must require CS2_IMAGE"
if grep -Eq 'image:[[:space:]]+cm2network/cs2([[:space:]]|$)|\$\{CS2_IMAGE:-' "${SERVER_COMPOSE}"; then
  fail "server Compose must not provide a floating or fallback CS2 image"
fi

grep -Fq '["redis-server", "--appendonly", "yes"]' "${CONTROL_COMPOSE}" || fail "control-plane Compose must preserve its established Redis configuration"
grep -Fq 'panel-redis:' "${CONTROL_COMPOSE}" || fail "control-plane Compose must preserve its established Redis volume"

for field in \
  repository_revision \
  previous_cs2_image_digest \
  candidate_cs2_image_digest \
  previous_cs2_build_id \
  candidate_cs2_build_id \
  plugin_versions \
  bootstrap_capabilities_checksum \
  cfg_bundle_checksum_manifest \
  backup_manifest_sha256; do
  grep -Fq "${field}=" "${DEPLOYMENT_DOC}" || fail "deployment record is missing ${field}"
done

if [[ -n "${image}" ]]; then
  validate_image "${image}"
fi

printf 'Deployment contract checks passed.\n'
