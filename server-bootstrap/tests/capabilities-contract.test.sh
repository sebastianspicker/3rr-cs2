#!/usr/bin/env bash
# Validates the server bootstrap asset inventory and deployment wiring.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"
BOOTSTRAP_DIR="${ROOT}/server-bootstrap"
MANIFEST="${BOOTSTRAP_DIR}/capabilities.json"
STARTUP="${BOOTSTRAP_DIR}/scripts/server-start.sh"
COMPOSE="${ROOT}/deploy/compose/server-runtime.compose.yaml"

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

command -v jq >/dev/null 2>&1 || fail 'jq is required for capability validation'

jq -e '
  .schemaVersion == 1 and
  (.shippedCfg | type == "array" and length > 0) and
  (.externalServerProvidedCfg | type == "array") and
  (.requiredPluginIds | type == "array" and length > 0) and
  ([.shippedCfg[] | select((.id | type) != "string" or (.path | type) != "string")] | length == 0) and
  ([.externalServerProvidedCfg[] | select((.id | type) != "string" or (.path | type) != "string" or (.runtimePath | type) != "string")] | length == 0) and
  ([.shippedCfg[].id, .externalServerProvidedCfg[].id] | length == (unique | length)) and
  ([.shippedCfg[].path, .externalServerProvidedCfg[].path] | length == (unique | length)) and
  ([.requiredPluginIds[]] | length == (unique | length)) and
  ([.requiredPluginIds[] | select(test("^[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?$") | not)] | length == 0) and
  (([.externalServerProvidedCfg[].path] - [.shippedCfg[].path] | length) == (.externalServerProvidedCfg | length))
' "${MANIFEST}" >/dev/null || fail 'capabilities manifest schema is invalid'

while IFS=$'\t' read -r id path; do
  [[ "${path}" == assets/cfg/*.cfg && "${path}" != *..* ]] || fail "invalid shipped CFG path for ${id}: ${path}"
  [[ -f "${BOOTSTRAP_DIR}/${path}" ]] || fail "shipped CFG missing for ${id}: ${path}"
  cfg_name="${path##*/}"
  grep -Fq " ${cfg_name}" "${STARTUP}" || fail "startup wrapper does not install declared shipped CFG: ${path}"
done < <(jq -r '.shippedCfg[] | [.id, .path] | @tsv' "${MANIFEST}")

while IFS=$'\t' read -r id path runtime_path; do
  [[ "${path}" == assets/cfg/server-provided/*.cfg && "${path}" != *..* ]] || fail "invalid external CFG path for ${id}: ${path}"
  [[ "${runtime_path}" != */* && "${runtime_path}" == *.cfg ]] || fail "invalid external runtime path for ${id}: ${runtime_path}"
  [[ -f "${BOOTSTRAP_DIR}/${path}" ]] || fail "external CFG reference missing for ${id}: ${path}"
done < <(jq -r '.externalServerProvidedCfg[] | [.id, .path, .runtimePath] | @tsv' "${MANIFEST}")

# shellcheck disable=SC2016 # Match the literal runtime expansion in the startup wrapper.
grep -Fq 'install_shipped_cfg_bundle "${CS2_CFG_BUNDLE_DIR:-}"' "${STARTUP}"
if grep -Fq 'server-provided' "${STARTUP}"; then
  fail 'startup wrapper must not automatically install external server-provided CFGs'
fi
grep -Fq '../../server-bootstrap/scripts/server-start.sh:/opt/3rr/server-start.sh:ro' "${COMPOSE}"
grep -Fq '../../server-bootstrap/assets/cfg:/opt/3rr/cfg-assets:ro' "${COMPOSE}"
grep -Fq 'CS2_CFG_BUNDLE_DIR: /opt/3rr/cfg-assets' "${COMPOSE}"

printf 'Server bootstrap capability contract passed.\n'
