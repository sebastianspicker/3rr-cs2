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

file_mode() {
  if stat -c '%a' "$1" >/dev/null 2>&1; then
    stat -c '%a' "$1"
  else
    stat -f '%Lp' "$1"
  fi
}

install_playwright_chromium() {
  # Root and CI images need browser OS dependencies; developer machines usually do not.
  if [[ "${CI:-}" == "true" ]] || [[ "$(id -u)" == "0" ]]; then
    run npx playwright install --with-deps chromium
  else
    run npx playwright install chromium
  fi
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
  # with a developer's local panel or another verification run.
  PANEL_PROBE_CID="$(docker run -d \
    -p 127.0.0.1::3000 \
    -e NODE_ENV=development \
    -e DB_PATH=/tmp/3rr.db \
    -e SESSION_SECRET="${session_secret}" \
    -e RCON_SECRET_KEY="${rcon_secret}" \
    3rr-operate-panel:local)"

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
  local install_dir argv_file secret_cfg secret_victim rcon_probe gslt_probe admins_source groups_source admins_target groups_target
  install_dir="${tmpdir}/cs2"
  argv_file="${tmpdir}/cs2-argv.txt"
  secret_cfg="${install_dir}/game/csgo/cfg/3rr-secrets.cfg"
  secret_victim="${tmpdir}/secret-victim.txt"
  rcon_probe="probe-rcon-$(date +%s)-value"
  gslt_probe="probe-gslt-$(date +%s)-value"
  admins_source="${tmpdir}/admins.json"
  groups_source="${tmpdir}/admin_groups.json"
  admins_target="${install_dir}/game/csgo/addons/counterstrikesharp/configs/admins.json"
  groups_target="${install_dir}/game/csgo/addons/counterstrikesharp/configs/admin_groups.json"

  mkdir -p "${install_dir}/game"
  cat >"${install_dir}/game/cs2.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [[ "${RCON_PASSWORD+x}" == "x" || "${CS2_GSLT+x}" == "x" ]]; then
  printf 'Startup secrets remained in the CS2 process environment\n' >&2
  exit 1
fi
printf '%s\n' "$@" > "${CS2_ARGV_FILE:?}"
EOF
  chmod +x "${install_dir}/game/cs2.sh"
  printf '{}\n' >"${admins_source}"
  printf '{"groups":[]}\n' >"${groups_source}"
  mkdir -p "$(dirname -- "${secret_cfg}")"
  printf 'unchanged victim\n' >"${secret_victim}"
  ln -s "${secret_victim}" "${secret_cfg}"

  (
    cd "${tmpdir}"
    RCON_PASSWORD="${rcon_probe}" \
      CS2_GSLT="${gslt_probe}" \
      CS2_INSTALL_DIR="${install_dir}" \
      CS2_ARGV_FILE="${argv_file}" \
      CSS_ADMINS_FILE="admins.json" \
      CSS_GROUPS_FILE="admin_groups.json" \
      "${ROOT}/configs/examples/startup/server-start.sh"
  )

  if grep -Fq "${rcon_probe}" "${argv_file}"; then
    printf 'RCON password leaked into startup argv\n' >&2
    exit 1
  fi
  if grep -Fq "${gslt_probe}" "${argv_file}"; then
    printf 'GSLT leaked into startup argv\n' >&2
    exit 1
  fi
  grep -Fq '+exec' "${argv_file}"
  grep -Fq '3rr-secrets.cfg' "${argv_file}"
  grep -Fq "rcon_password \"${rcon_probe}\"" "${secret_cfg}"
  grep -Fq "sv_setsteamaccount \"${gslt_probe}\"" "${secret_cfg}"
  grep -Fxq 'unchanged victim' "${secret_victim}"
  [[ -f "${secret_cfg}" && ! -L "${secret_cfg}" ]]
  [[ "$(file_mode "${secret_cfg}")" == "600" ]]
  cmp -s "${admins_source}" "${admins_target}"
  cmp -s "${groups_source}" "${groups_target}"
}

require_cmd make
require_cmd shellcheck
require_cmd shfmt
require_cmd jq
require_cmd ruby
require_cmd curl
require_cmd cmp

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
run ruby "${ROOT}/scripts/check-doc-links.rb"
for github_yaml in "${ROOT}"/.github/ISSUE_TEMPLATE/*.yml "${ROOT}"/.github/workflows/*.yml; do
  run ruby -ryaml -e "YAML.safe_load(File.read(ARGV.fetch(0)), aliases: false, filename: ARGV.fetch(0))" "${github_yaml}" >/dev/null
done
grep -Fq "TRUST_PROXY: \${TRUST_PROXY:-false}" "${ROOT}/configs/examples/compose/panel.compose.yaml"
if grep -Fq "TRUST_PROXY: \${TRUST_PROXY:-1}" "${ROOT}/configs/examples/compose/panel.compose.yaml"; then
  printf 'Panel Compose must not trust proxy headers by default\n' >&2
  exit 1
fi
grep -Fq "REDIS_URL: \${REDIS_URL:-redis://redis:6379}" "${ROOT}/configs/examples/compose/panel.compose.yaml"
grep -Fq "\"\${PANEL_BIND_ADDRESS:-127.0.0.1}:3000:3000\"" "${ROOT}/configs/examples/compose/panel.compose.yaml"
grep -Fq "\"\${CS2_PORT:-27015}:\${CS2_PORT:-27015}/udp\"" "${ROOT}/configs/examples/compose/server-runtime.compose.yaml"
grep -Fq "\"\${CS2_PORT:-27015}:\${CS2_PORT:-27015}/tcp\"" "${ROOT}/configs/examples/compose/server-runtime.compose.yaml"
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
run apps/provision/bootstrap/tests/bootstrap-output-safety.test.sh
run apps/provision/bootstrap/scripts/bootstrap-admins.sh "${tmpdir}/provision"
run apps/provision/bootstrap/scripts/bootstrap-plugins.sh "${tmpdir}/provision"
run startup_secret_probe

log "verification complete"
