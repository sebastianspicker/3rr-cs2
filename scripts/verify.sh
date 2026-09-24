#!/usr/bin/env bash
# Runs the cross-module release verification gate from a reproducible repository root.
set -euo pipefail

if ((BASH_VERSINFO[0] < 4)); then
  printf 'verify.sh requires Bash 4 or newer (found %s); on macOS install it with Homebrew.\n' "${BASH_VERSION}" >&2
  exit 1
fi

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

ALL_SECTIONS=(shared control-plane docker host-updater bootstrap)

usage() {
  cat <<EOF
Usage: ${0##*/} [--only <section>[,<section>...]] [--quick] [-h|--help]

Runs the cross-module release verification gate. With no arguments, runs
every section below, in order; that is the release gate.

Sections (run order): ${ALL_SECTIONS[*]}

Flags:
  --only <section>[,<section>...]  Run only the given sections
  --quick                          Run every section except 'docker'
                                    (not a substitute for a full release gate run)
  -h, --help                       Show this help and exit
EOF
}

only_arg=""
quick=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --only)
      if [[ $# -lt 2 ]]; then
        printf 'Missing value for --only\n' >&2
        exit 2
      fi
      only_arg="$2"
      shift 2
      ;;
    --only=*)
      only_arg="${1#--only=}"
      shift
      ;;
    --quick)
      quick=1
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      printf 'Unknown argument: %s\n' "$1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ -n "${only_arg}" && "${quick}" -eq 1 ]]; then
  printf -- '--only and --quick cannot be combined\n' >&2
  exit 2
fi

SELECTED_SECTIONS=()

if [[ -n "${only_arg}" ]]; then
  IFS=',' read -r -a requested_sections <<<"${only_arg}"
  declare -A requested=()
  for requested_section in "${requested_sections[@]}"; do
    known=0
    for candidate_section in "${ALL_SECTIONS[@]}"; do
      if [[ "${requested_section}" == "${candidate_section}" ]]; then
        known=1
        break
      fi
    done
    if [[ "${known}" -eq 0 ]]; then
      printf 'Unknown section: %s\n' "${requested_section}" >&2
      printf 'Valid sections: %s\n' "${ALL_SECTIONS[*]}" >&2
      exit 2
    fi
    requested["${requested_section}"]=1
  done
  for candidate_section in "${ALL_SECTIONS[@]}"; do
    if [[ -n "${requested[${candidate_section}]:-}" ]]; then
      SELECTED_SECTIONS+=("${candidate_section}")
    fi
  done
elif [[ "${quick}" -eq 1 ]]; then
  for candidate_section in "${ALL_SECTIONS[@]}"; do
    if [[ "${candidate_section}" != "docker" ]]; then
      SELECTED_SECTIONS+=("${candidate_section}")
    fi
  done
else
  SELECTED_SECTIONS=("${ALL_SECTIONS[@]}")
fi

section_selected() {
  local target="$1" candidate
  for candidate in "${SELECTED_SECTIONS[@]}"; do
    if [[ "${candidate}" == "${target}" ]]; then
      return 0
    fi
  done
  return 1
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

# Checks that every tracked file's index mode and working-tree executable bit
# match scripts/executable-files.txt, in both directions. This catches both a
# stray chmod (executable bit set but unlisted) and a missing chmod (listed
# but not executable).
check_file_modes() {
  local list_file="${ROOT}/scripts/executable-files.txt"

  if ! have git || ! git -C "${ROOT}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    printf 'Skipping executable-file mode guard: git is unavailable or %s is not a git work tree\n' "${ROOT}"
    return 0
  fi

  local -A listed=()
  local listed_entry
  while IFS= read -r listed_entry; do
    [[ -z "${listed_entry}" ]] && continue
    listed["${listed_entry}"]=1
  done <"${list_file}"

  local -A index_executable=()
  local index_prefix index_mode index_path
  while IFS=$'\t' read -r index_prefix index_path; do
    index_mode="${index_prefix%% *}"
    if [[ "${index_mode}" == "100755" ]]; then
      index_executable["${index_path}"]=1
    fi
  done < <(git -C "${ROOT}" ls-files -s)

  local violations=()
  local mode_check_file
  for mode_check_file in "${!listed[@]}"; do
    if [[ -z "${index_executable[${mode_check_file}]:-}" ]]; then
      violations+=("${mode_check_file}: listed in scripts/executable-files.txt but tracked mode is not 100755")
    fi
  done
  for mode_check_file in "${!index_executable[@]}"; do
    if [[ -z "${listed[${mode_check_file}]:-}" ]]; then
      violations+=("${mode_check_file}: tracked mode is 100755 but not listed in scripts/executable-files.txt")
    fi
  done

  local diff_line diff_rest diff_old_mode diff_new_mode diff_path
  while IFS= read -r diff_line; do
    [[ "${diff_line}" == *" mode change "* ]] || continue
    diff_rest="${diff_line#* mode change }"
    diff_old_mode="${diff_rest%% =>*}"
    diff_rest="${diff_rest#*=> }"
    diff_new_mode="${diff_rest%% *}"
    diff_path="${diff_rest#* }"
    violations+=("${diff_path}: working-tree executable bit (${diff_old_mode} => ${diff_new_mode}) does not match the index")
  done < <(git -C "${ROOT}" diff --summary)

  if [[ ${#violations[@]} -gt 0 ]]; then
    printf 'Executable file-mode guard failed:\n' >&2
    printf ' - %s\n' "${violations[@]}" >&2
    exit 1
  fi
}

run_shared() {
  log "shared shell and config checks"
  run shellcheck \
    "${ROOT}/scripts/verify.sh" \
    "${ROOT}/scripts/check-deployment-contract.sh" \
    "${ROOT}/scripts/recovery-layout-rehearsal.test.sh" \
    "${ROOT}/server-bootstrap/scripts/bootstrap-admins.sh" \
    "${ROOT}/server-bootstrap/scripts/bootstrap-output.sh" \
    "${ROOT}/server-bootstrap/scripts/server-start.sh" \
    "${ROOT}/server-bootstrap/tests/bootstrap-output-safety.test.sh" \
    "${ROOT}/server-bootstrap/tests/capabilities-contract.test.sh" \
    "${ROOT}/server-bootstrap/tests/startup-wrapper-safety.test.sh"
  run shfmt -d -i 2 -bn -ci \
    "${ROOT}/scripts/verify.sh" \
    "${ROOT}/scripts/check-deployment-contract.sh" \
    "${ROOT}/scripts/recovery-layout-rehearsal.test.sh" \
    "${ROOT}/server-bootstrap/scripts/bootstrap-admins.sh" \
    "${ROOT}/server-bootstrap/scripts/bootstrap-output.sh" \
    "${ROOT}/server-bootstrap/scripts/server-start.sh" \
    "${ROOT}/server-bootstrap/tests/bootstrap-output-safety.test.sh" \
    "${ROOT}/server-bootstrap/tests/capabilities-contract.test.sh" \
    "${ROOT}/server-bootstrap/tests/startup-wrapper-safety.test.sh"
  run ruby -ryaml -e "YAML.safe_load(File.read('${ROOT}/deploy/compose/control-plane.compose.yaml'), aliases: false, filename: '${ROOT}/deploy/compose/control-plane.compose.yaml')" >/dev/null
  run ruby -ryaml -e "YAML.safe_load(File.read('${ROOT}/deploy/compose/server-runtime.compose.yaml'), aliases: false, filename: '${ROOT}/deploy/compose/server-runtime.compose.yaml')" >/dev/null
  run bash "${ROOT}/scripts/check-deployment-contract.sh"
  run bash "${ROOT}/scripts/recovery-layout-rehearsal.test.sh"
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

  log "shared executable file-mode guard"
  check_file_modes
}

run_control_plane() {
  log "control plane"
  # Expanded inside the Node 26 container, not by this host-side verifier.
  # shellcheck disable=SC2016
  local control_plane_cmd='set -euo pipefail
cd /workspace/control-plane
npm ci
npx playwright install --with-deps chromium
npm run check
node --check ../design-preview/preview.js
node ../design-preview/verify.mjs'

  local node_major=""
  if have node; then
    node_major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || printf '')"
  fi
  if [[ "${node_major}" == "26" ]]; then
    require_cmd npm
    require_cmd npx
    cd "${ROOT}/control-plane"
    run npm ci
    run npm run check
    run node --check "${ROOT}/design-preview/preview.js"
    run node "${ROOT}/design-preview/verify.mjs"
  else
    require_cmd docker
    # The control plane requires Node 26 because better-sqlite3 ships native bindings and
    # the project pins its runtime engine. Use Docker as the stable fallback when
    # the host Node version is absent or not in range.
    run docker run --rm \
      -v "${ROOT}:/workspace" \
      -v /workspace/control-plane/node_modules \
      -w /workspace \
      node:26.9.0-bookworm-slim@sha256:582460f614631b59b824ac6020533b9bf339c7fdf3a6d7db31abb6b4065f0212 \
      bash -lc "apt-get update >/dev/null && apt-get install -y git python3 make g++ jq ruby shellcheck shfmt >/dev/null && ${control_plane_cmd}"
  fi
}

run_docker() {
  log "control-plane docker validation"
  require_cmd docker
  cd "${ROOT}/control-plane"
  run scripts/validate.sh --require-docker

  log "control-plane surface probe"
  panel_surface_probe
}

run_host_updater() {
  log "host updater"
  cd "${ROOT}/host-updater"
  run make ci
}

run_bootstrap() {
  log "server bootstrap"
  cd "${ROOT}"
  run server-bootstrap/tests/bootstrap-output-safety.test.sh
  run server-bootstrap/tests/capabilities-contract.test.sh
  run bash server-bootstrap/tests/startup-wrapper-safety.test.sh
  run server-bootstrap/scripts/bootstrap-admins.sh "${tmpdir}/provision"
}

if section_selected shared; then
  require_cmd shellcheck
  require_cmd shfmt
  require_cmd jq
  require_cmd ruby
fi
if section_selected docker; then
  require_cmd docker
  require_cmd curl
fi
if section_selected host-updater; then
  require_cmd make
fi

tmpdir="$(mktemp -d)"
trap cleanup EXIT
trap 'cleanup; exit 130' INT
trap 'cleanup; exit 143' TERM

if section_selected shared; then
  run_shared
fi
if section_selected control-plane; then
  run_control_plane
fi
if section_selected docker; then
  run_docker
fi
if section_selected host-updater; then
  run_host_updater
fi
if section_selected bootstrap; then
  run_bootstrap
fi

log "verification complete"
