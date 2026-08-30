#!/usr/bin/env bash
# Runs the cross-module release verification gate from a reproducible repository root.
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

PANEL_PROBE_CID=""

cleanup() {
  # Ensure temporary probes and containers do not survive an interrupted verification run.
  if [[ -n "${PANEL_PROBE_CID}" ]]; then
    docker rm -f "${PANEL_PROBE_CID}" >/dev/null 2>&1 || true
    PANEL_PROBE_CID=""
  fi
  if [[ -n "${tmpdir:-}" ]]; then
    rm -rf "${tmpdir}"
  fi
}

panel_surface_probe() {
  local port_line port ok _attempt session_secret rcon_secret
  session_secret="verify-session-$(date +%s)-strong-value"
  rcon_secret="$(printf '1%.0s' {1..64})"

  # This probe verifies the built container can start and serve its public
  # health endpoint. The host port is allocated dynamically to avoid conflicts
  # with a local control-plane instance or another verification run.
  PANEL_PROBE_CID="$(docker run -d \
    -p 127.0.0.1::3000 \
    -e NODE_ENV=development \
    -e DB_PATH=/tmp/3rr.db \
    -e SESSION_SECRET="${session_secret}" \
    -e RCON_SECRET_KEY="${rcon_secret}" \
    3rr-control-plane:local)"

  if ! port_line="$(docker port "${PANEL_PROBE_CID}" 3000/tcp)"; then
    exit 1
  fi
  port="${port_line##*:}"
  ok=0

  for _attempt in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
    if curl --fail --silent --show-error "http://127.0.0.1:${port}/api/health" >/dev/null; then
      ok=1
      break
    fi
    sleep 1
  done

  if [[ "${ok}" != "1" ]]; then
    docker logs "${PANEL_PROBE_CID}" >&2 || true
    exit 1
  fi

  docker rm -f "${PANEL_PROBE_CID}" >/dev/null
  PANEL_PROBE_CID=""
}

require_cmd make
require_cmd shellcheck
require_cmd shfmt
require_cmd jq
require_cmd ruby
require_cmd curl

tmpdir="$(mktemp -d)"
trap cleanup EXIT
trap 'cleanup; exit 130' INT
trap 'cleanup; exit 143' TERM

log "shared shell and config checks"
run shellcheck \
  "${ROOT}/scripts/verify.sh" \
  "${ROOT}/server-bootstrap/scripts/bootstrap-admins.sh" \
  "${ROOT}/server-bootstrap/scripts/bootstrap-output.sh" \
  "${ROOT}/server-bootstrap/scripts/server-start.sh" \
  "${ROOT}/server-bootstrap/tests/bootstrap-output-safety.test.sh" \
  "${ROOT}/server-bootstrap/tests/capabilities-contract.test.sh" \
  "${ROOT}/server-bootstrap/tests/startup-wrapper-safety.test.sh"
run shfmt -d -i 2 -bn -ci \
  "${ROOT}/scripts/verify.sh" \
  "${ROOT}/server-bootstrap/scripts/bootstrap-admins.sh" \
  "${ROOT}/server-bootstrap/scripts/bootstrap-output.sh" \
  "${ROOT}/server-bootstrap/scripts/server-start.sh" \
  "${ROOT}/server-bootstrap/tests/bootstrap-output-safety.test.sh" \
  "${ROOT}/server-bootstrap/tests/capabilities-contract.test.sh" \
  "${ROOT}/server-bootstrap/tests/startup-wrapper-safety.test.sh"
run ruby -ryaml -e "YAML.safe_load(File.read('${ROOT}/deploy/compose/control-plane.compose.yaml'), aliases: false, filename: '${ROOT}/deploy/compose/control-plane.compose.yaml')" >/dev/null
run ruby -ryaml -e "YAML.safe_load(File.read('${ROOT}/deploy/compose/server-runtime.compose.yaml'), aliases: false, filename: '${ROOT}/deploy/compose/server-runtime.compose.yaml')" >/dev/null
run ruby "${ROOT}/scripts/check-doc-links.rb"
for github_yaml in "${ROOT}"/.github/ISSUE_TEMPLATE/*.yml "${ROOT}"/.github/workflows/*.yml; do
  run ruby -ryaml -e "YAML.safe_load(File.read(ARGV.fetch(0)), aliases: false, filename: ARGV.fetch(0))" "${github_yaml}" >/dev/null
done
grep -Fq "TRUST_PROXY: \${TRUST_PROXY:-false}" "${ROOT}/deploy/compose/control-plane.compose.yaml"
if grep -Fq "TRUST_PROXY: \${TRUST_PROXY:-1}" "${ROOT}/deploy/compose/control-plane.compose.yaml"; then
  printf 'Panel Compose must not trust proxy headers by default\n' >&2
  exit 1
fi
grep -Fq "REDIS_URL: \${REDIS_URL:-redis://redis:6379}" "${ROOT}/deploy/compose/control-plane.compose.yaml"
grep -Fq "\"\${PANEL_BIND_ADDRESS:-127.0.0.1}:3000:3000\"" "${ROOT}/deploy/compose/control-plane.compose.yaml"
grep -Fq "\"\${CS2_PORT:-27015}:\${CS2_PORT:-27015}/udp\"" "${ROOT}/deploy/compose/server-runtime.compose.yaml"
grep -Fq "\"\${CS2_PORT:-27015}:\${CS2_PORT:-27015}/tcp\"" "${ROOT}/deploy/compose/server-runtime.compose.yaml"
run jq . "${ROOT}/control-plane/package.json" >/dev/null
run jq . "${ROOT}/control-plane/package-lock.json" >/dev/null
run jq . "${ROOT}/control-plane/src/features/game-catalog/maps.json" >/dev/null
run jq . "${ROOT}/server-bootstrap/capabilities.json" >/dev/null

log "control plane"
# Expanded inside the Node 22 container, not by this host-side verifier.
# shellcheck disable=SC2016
control_plane_cmd='set -euo pipefail
cd /workspace/control-plane
npm ci
npm run check'

node_major=""
if have node; then
  node_major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || printf '')"
fi
if [[ "${node_major}" == "22" ]]; then
  require_cmd npm
  require_cmd npx
  cd "${ROOT}/control-plane"
  run npm ci
  run npm run check
else
  require_cmd docker
  # The control plane requires Node 22 because better-sqlite3 ships native bindings and
  # the project pins its runtime engine. Use Docker as the stable fallback when
  # the host Node version is absent or not in range.
  run docker run --rm \
    -v "${ROOT}:/workspace" \
    -v /workspace/control-plane/node_modules \
    -w /workspace \
    node:22-bookworm-slim \
    bash -lc "apt-get update >/dev/null && apt-get install -y git python3 make g++ jq ruby shellcheck shfmt >/dev/null && ${control_plane_cmd}"
fi

log "control-plane docker validation"
require_cmd docker
cd "${ROOT}/control-plane"
run scripts/validate.sh --require-docker

log "control-plane surface probe"
panel_surface_probe

log "host updater"
cd "${ROOT}/host-updater"
run make ci

log "server bootstrap"
cd "${ROOT}"
run server-bootstrap/tests/bootstrap-output-safety.test.sh
run server-bootstrap/tests/capabilities-contract.test.sh
run bash server-bootstrap/tests/startup-wrapper-safety.test.sh
run server-bootstrap/scripts/bootstrap-admins.sh "${tmpdir}/provision"

log "verification complete"
