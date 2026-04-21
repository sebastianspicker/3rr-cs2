#!/usr/bin/env bash
set -euo pipefail

log() {
  printf '%s\n' "$*" >&2
}

die() {
  log "error: $*"
  exit 1
}

have() {
  command -v "$1" >/dev/null 2>&1
}

require_cmd() {
  have "$1" || die "missing required command: $1"
}

run() {
  log "+ $*"
  "$@"
}

repo_root() {
  local script_dir
  script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
  (cd -- "${script_dir}/../.." && pwd)
}

docker_ok() {
  have docker && docker info >/dev/null 2>&1
}

docker_status() {
  if ! have docker; then
    printf 'missing\n'
    return 0
  fi

  if docker info >/dev/null 2>&1; then
    printf 'ok\n'
    return 0
  fi

  local err
  err="$(docker info 2>&1 || true)"
  if [[ "$err" == *"permission denied"* || "$err" == *"Cannot connect to the Docker daemon"* ]]; then
    printf 'inaccessible\n'
    return 0
  fi

  printf 'unavailable\n'
}

docker_unavailable_message() {
  case "$(docker_status)" in
    missing)
      printf 'docker is not installed'
      ;;
    inaccessible)
      printf 'docker is installed but the current environment cannot access the daemon'
      ;;
    unavailable)
      printf 'docker daemon not available'
      ;;
    ok)
      printf 'docker is available'
      ;;
    *)
      printf 'docker daemon status unknown'
      ;;
  esac
}
