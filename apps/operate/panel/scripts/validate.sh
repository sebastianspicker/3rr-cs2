#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

require_docker=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --require-docker)
      require_docker=1
      shift
      ;;
    -h | --help)
      cat <<EOF
Usage: ${0##*/} [--require-docker]

Validates shell formatting/lint and config files.

Flags:
  --require-docker   Also run docker build/compose validation (fails if Docker isn't available)
EOF
      exit 0
      ;;
    *)
      die "unknown argument: $1"
      ;;
  esac
done

log "validate: shell scripts"
require_cmd shellcheck
require_cmd shfmt

run shfmt -d -i 2 -bn -ci "${ROOT}/scripts"

sh_files=()
while IFS= read -r file; do
  sh_files+=("$file")
done < <(find "${ROOT}/scripts" -type f -name '*.sh' -print)

if [[ ${#sh_files[@]} -gt 0 ]]; then
  run shellcheck -x -P "${ROOT}/scripts" "${sh_files[@]}"
fi

log "validate: json"
require_cmd jq
run jq . "${ROOT}/cfg/maps.json" >/dev/null
run jq . "${ROOT}/package.json" >/dev/null
run jq . "${ROOT}/package-lock.json" >/dev/null

log "validate: yaml"
require_cmd ruby
run ruby -ryaml -e "YAML.load_file('${ROOT}/docker-compose.yaml')" >/dev/null

log "validate: repo hygiene"

hygiene_violations=()
scan_cmd=(find "${ROOT}" -type f)
if have git && git -C "${ROOT}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  scan_cmd=(git -C "${ROOT}" ls-files)
fi

while IFS= read -r tracked_file; do
  if [[ "$tracked_file" == "${ROOT}"/* ]]; then
    tracked_file="${tracked_file#"${ROOT}/"}"
  fi
  if [[ "$tracked_file" =~ (^|/)\.DS_Store$ ]]; then
    hygiene_violations+=("$tracked_file")
    continue
  fi
  if [[ "$tracked_file" =~ \.tmp$ ]]; then
    hygiene_violations+=("$tracked_file")
    continue
  fi
  if [[ "$tracked_file" =~ \.swp$ || "$tracked_file" =~ \.swo$ ]]; then
    hygiene_violations+=("$tracked_file")
    continue
  fi
done < <("${scan_cmd[@]}")

if [[ ${#hygiene_violations[@]} -gt 0 ]]; then
  printf 'repo hygiene violations detected:\n' >&2
  printf ' - %s\n' "${hygiene_violations[@]}" >&2
  die "remove temporary/junk tracked files before release"
fi

if [[ $require_docker -eq 1 ]]; then
  log "validate: docker"
  docker_ok || die "$(docker_unavailable_message)"

  run docker build -t cs2-server-ops-operate-panel:local "${ROOT}"

  # docker compose config requires .env referenced by env_file; use .env.example
  # as a stand-in when .env doesn't exist (CI, fresh clones).
  env_created=0
  cleanup_temp_env() {
    if [[ $env_created -eq 1 ]]; then
      rm -f "${ROOT}/.env"
    fi
  }

  if [[ ! -f "${ROOT}/.env" ]]; then
    cp "${ROOT}/.env.example" "${ROOT}/.env"
    env_created=1
  fi
  trap cleanup_temp_env EXIT

  if docker compose version >/dev/null 2>&1; then
    run docker compose -f "${ROOT}/docker-compose.yaml" config -q
  elif have docker-compose; then
    run docker-compose -f "${ROOT}/docker-compose.yaml" config -q
  else
    die "docker compose not available (need 'docker compose' plugin or 'docker-compose' binary)"
  fi

  cleanup_temp_env
  trap - EXIT
else
  if docker_ok; then
    log "validate: docker (skipped; pass --require-docker to enforce)"
  else
    log "validate: docker (skipped; $(docker_unavailable_message))"
  fi
fi

log "validate: ok"
