#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

log() {
  printf '\n==> %s\n' "$*"
}

run() {
  printf '+'
  for arg in "$@"; do
    printf ' %q' "$arg"
  done
  printf '\n'
  "$@"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'Missing required command: %s\n' "$1" >&2
    exit 1
  fi
}

have() {
  command -v "$1" >/dev/null 2>&1
}

require_cmd npm
require_cmd make
require_cmd shellcheck
require_cmd shfmt
require_cmd jq
require_cmd ruby

tmpdir="$(mktemp -d)"
trap 'rm -rf "${tmpdir}"' EXIT

log "shared shell and config checks"
run shellcheck \
  "${ROOT}/scripts/verify.sh" \
  "${ROOT}/scripts/validate.sh" \
  "${ROOT}/apps/provision/bootstrap/scripts/bootstrap-admins.sh" \
  "${ROOT}/apps/provision/bootstrap/scripts/bootstrap-plugins.sh" \
  "${ROOT}/configs/examples/startup/server-start.sh"
run shfmt -d -i 2 -bn -ci \
  "${ROOT}/scripts/verify.sh" \
  "${ROOT}/scripts/validate.sh" \
  "${ROOT}/apps/provision/bootstrap/scripts/bootstrap-admins.sh" \
  "${ROOT}/apps/provision/bootstrap/scripts/bootstrap-plugins.sh" \
  "${ROOT}/configs/examples/startup/server-start.sh"
run ruby -ryaml -e "YAML.load_file('${ROOT}/configs/examples/compose/panel.compose.yaml')" >/dev/null
run ruby -ryaml -e "YAML.load_file('${ROOT}/configs/examples/compose/server-runtime.compose.yaml')" >/dev/null
run jq . "${ROOT}/apps/operate/panel/package.json" >/dev/null
run jq . "${ROOT}/apps/operate/panel/package-lock.json" >/dev/null
run jq . "${ROOT}/apps/operate/panel/cfg/maps.json" >/dev/null

log "operate module"
operate_cmd='set -euo pipefail
cd /workspace/apps/operate/panel
if [[ ! -d node_modules ]]; then
  npm ci
fi
npm run lint
npm run typecheck
npm test
npm run build
npm run validate'

node_major="$(node -p 'process.versions.node.split(".")[0]')"
if [[ "${node_major}" == "22" ]]; then
  cd "${ROOT}/apps/operate/panel"
  if [[ ! -d node_modules ]]; then
    run npm ci
  fi
  run npm run lint
  run npm run typecheck
  run npm test
  run npm run build
  run npm run validate
else
  require_cmd docker
  run docker run --rm \
    -v "${ROOT}:/workspace" \
    -w /workspace \
    node:22-bookworm-slim \
    bash -lc "apt-get update >/dev/null && apt-get install -y jq ruby shellcheck shfmt >/dev/null && ${operate_cmd}"
fi

log "maintain module"
cd "${ROOT}/apps/maintain/updater"
run make ci

log "provision module"
cd "${ROOT}"
run apps/provision/bootstrap/scripts/bootstrap-admins.sh "${tmpdir}/provision"
run apps/provision/bootstrap/scripts/bootstrap-plugins.sh "${tmpdir}/provision"

log "verification complete"
