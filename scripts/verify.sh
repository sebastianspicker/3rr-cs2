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

install_playwright_chromium() {
  if [[ "${CI:-}" == "true" ]] || [[ "$(id -u)" == "0" ]]; then
    run npx playwright install --with-deps chromium
  else
    run npx playwright install chromium
  fi
}

PANEL_PROBE_CID=""

cleanup() {
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
  # with a developer's local panel or another verification run.
  PANEL_PROBE_CID="$(docker run -d \
    -p 127.0.0.1::3000 \
    -e NODE_ENV=development \
    -e DB_PATH=/tmp/cspanel.db \
    -e SESSION_SECRET="${session_secret}" \
    -e RCON_SECRET_KEY="${rcon_secret}" \
    cs2-server-ops-operate-panel:local)"

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

startup_secret_probe() {
  local install_dir argv_file secret_cfg rcon_probe gslt_probe
  install_dir="${tmpdir}/cs2"
  argv_file="${tmpdir}/cs2-argv.txt"
  secret_cfg="${install_dir}/game/csgo/cfg/cs2-server-ops-secrets.cfg"
  rcon_probe="probe-rcon-$(date +%s)-value"
  gslt_probe="probe-gslt-$(date +%s)-value"

  mkdir -p "${install_dir}/game"
  cat >"${install_dir}/game/cs2.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$@" > "${CS2_ARGV_FILE:?}"
EOF
  chmod +x "${install_dir}/game/cs2.sh"

  RCON_PASSWORD="${rcon_probe}" \
    CS2_GSLT="${gslt_probe}" \
    CS2_INSTALL_DIR="${install_dir}" \
    CS2_ARGV_FILE="${argv_file}" \
    configs/examples/startup/server-start.sh

  if grep -Fq "${rcon_probe}" "${argv_file}"; then
    printf 'RCON password leaked into startup argv\n' >&2
    exit 1
  fi
  if grep -Fq "${gslt_probe}" "${argv_file}"; then
    printf 'GSLT leaked into startup argv\n' >&2
    exit 1
  fi
  grep -Fq '+exec' "${argv_file}"
  grep -Fq 'cs2-server-ops-secrets.cfg' "${argv_file}"
  grep -Fq "rcon_password \"${rcon_probe}\"" "${secret_cfg}"
  grep -Fq "sv_setsteamaccount \"${gslt_probe}\"" "${secret_cfg}"
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
run ruby -ryaml -e "YAML.safe_load(File.read('${ROOT}/configs/examples/compose/panel.compose.yaml'), aliases: false, filename: '${ROOT}/configs/examples/compose/panel.compose.yaml')" >/dev/null
run ruby -ryaml -e "YAML.safe_load(File.read('${ROOT}/configs/examples/compose/server-runtime.compose.yaml'), aliases: false, filename: '${ROOT}/configs/examples/compose/server-runtime.compose.yaml')" >/dev/null
run jq . "${ROOT}/apps/operate/panel/package.json" >/dev/null
run jq . "${ROOT}/apps/operate/panel/package-lock.json" >/dev/null
run jq . "${ROOT}/apps/operate/panel/cfg/maps.json" >/dev/null

log "operate module"
# Expanded inside the Node 22 container, not by this host-side verifier.
# shellcheck disable=SC2016
operate_cmd='set -euo pipefail
cd /workspace/apps/operate/panel
npm ci
if [[ "${CI:-}" == "true" ]] || [[ "$(id -u)" == "0" ]]; then
  npx playwright install --with-deps chromium
else
  npx playwright install chromium
fi
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build'

node_major=""
if have node; then
  node_major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || printf '')"
fi
if [[ "${node_major}" == "22" ]]; then
  require_cmd npm
  require_cmd npx
  cd "${ROOT}/apps/operate/panel"
  run npm ci
  install_playwright_chromium
  run npm run format:check
  run npm run lint
  run npm run typecheck
  run npm test
  run npm run test:e2e
  run npm run build
else
  require_cmd docker
  # The panel requires Node 22 because better-sqlite3 ships native bindings and
  # the project pins its runtime engine. Use Docker as the stable fallback when
  # the host Node version is absent or not in range.
  run docker run --rm \
    -v "${ROOT}:/workspace" \
    -v /workspace/apps/operate/panel/node_modules \
    -w /workspace \
    node:22-bookworm-slim \
    bash -lc "apt-get update >/dev/null && apt-get install -y git python3 make g++ jq ruby shellcheck shfmt >/dev/null && ${operate_cmd}"
fi

log "operate docker validation"
require_cmd docker
cd "${ROOT}/apps/operate/panel"
run scripts/validate.sh --require-docker

log "operate surface probe"
panel_surface_probe

log "maintain module"
cd "${ROOT}/apps/maintain/updater"
run make ci

log "provision module"
cd "${ROOT}"
run apps/provision/bootstrap/scripts/bootstrap-admins.sh "${tmpdir}/provision"
run apps/provision/bootstrap/scripts/bootstrap-plugins.sh "${tmpdir}/provision"
run startup_secret_probe

log "verification complete"
