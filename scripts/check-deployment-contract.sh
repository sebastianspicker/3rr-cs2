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
  local image reference repository last_component tag first_component component
  local path_component_re registry_re tag_re
  local -a components
  local path_start index

  image="$1"
  if [[ "${image}" =~ [[:space:]] ]]; then
    fail "CS2_IMAGE must not contain whitespace"
  fi
  if [[ ! "${image}" =~ ^(.+)@sha256:[0-9a-fA-F]{64}$ ]]; then
    fail "CS2_IMAGE must be an immutable image reference ending in @sha256:<64 hex characters>"
  fi

  reference="${BASH_REMATCH[1]}"
  repository="${reference}"
  last_component="${reference##*/}"
  tag_re='^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$'
  if [[ "${last_component}" == *:* ]]; then
    tag="${last_component##*:}"
    [[ "${tag}" =~ ${tag_re} ]] || fail "CS2_IMAGE contains an invalid image tag"
    repository="${reference%:*}"
  fi

  [[ "${repository}" != /* && "${repository}" != */ && "${repository}" != *//* ]] \
    || fail "CS2_IMAGE contains an invalid Docker/OCI image name"

  IFS='/' read -r -a components <<<"${repository}"
  ((${#components[@]} > 0)) || fail "CS2_IMAGE contains an invalid Docker/OCI image name"

  # Docker/OCI repository path components are lowercase. A first component
  # containing a dot or port (or named localhost) is a registry authority.
  path_component_re='^[a-z0-9]+(([._]|__|-+)[a-z0-9]+)*$'
  registry_re='^([a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*|\[[0-9A-Fa-f:.]+\])(:[0-9]+)?$'
  first_component="${components[0]}"
  path_start=0
  if ((${#components[@]} > 1)) \
    && [[ "${first_component}" == *.* || "${first_component}" == *:* || "${first_component}" == "localhost" || "${first_component}" == \[* ]]; then
    [[ "${first_component}" =~ ${registry_re} ]] || fail "CS2_IMAGE contains an invalid registry name"
    path_start=1
  fi

  for ((index = path_start; index < ${#components[@]}; index++)); do
    component="${components[index]}"
    [[ "${component}" =~ ${path_component_re} ]] || fail "CS2_IMAGE contains an invalid Docker/OCI image name"
  done
}

image=""
image_supplied=0
while (($# > 0)); do
  case "$1" in
    --image)
      (($# >= 2)) || fail "--image requires a value"
      image="$2"
      image_supplied=1
      shift 2
      ;;
    --image=*)
      image="${1#--image=}"
      image_supplied=1
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

if ((image_supplied)); then
  validate_image "${image}"
fi

printf 'Deployment contract checks passed.\n'
