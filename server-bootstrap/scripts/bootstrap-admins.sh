#!/usr/bin/env bash
# Generates private CounterStrikeSharp administrator bootstrap files in a chosen directory.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/bootstrap-output.sh"

usage() {
  printf 'Usage: %s [--force] [OUT_DIR]\n' "${0##*/}" >&2
}

FORCE=0
OUT_DIR=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --force)
      FORCE=1
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    -*)
      usage
      exit 2
      ;;
    *)
      if [[ -n "${OUT_DIR}" ]]; then
        usage
        exit 2
      fi
      OUT_DIR="$1"
      shift
      ;;
  esac
done
OUT_DIR="${OUT_DIR:-./output}"
mkdir -p "${OUT_DIR}"

ADMIN_GROUPS="${OUT_DIR}/admin_groups.json"
ADMINS="${OUT_DIR}/admins.json"
validate_output_target "${ADMIN_GROUPS}"
validate_output_target "${ADMINS}"

# Operators edit these files after generation; never replace them silently.
if ((FORCE == 0)); then
  for target in "${ADMIN_GROUPS}" "${ADMINS}"; do
    if [[ -e "${target}" || -L "${target}" ]]; then
      printf 'Refusing to overwrite existing file: %s\nRe-run with --force to replace it.\n' "${target}" >&2
      exit 1
    fi
  done
fi

# CounterStrikeSharp schema: group names start with '#'; an admin entry is keyed by
# a display name and carries the SteamID in "identity".
write_atomic "${ADMIN_GROUPS}" <<'EOF'
{
  "#3rr/superadmin": {
    "flags": ["@css/root", "@css/config"]
  },
  "#3rr/moderator": {
    "flags": ["@css/slay", "@css/kick"]
  }
}
EOF

write_atomic "${ADMINS}" <<'EOF'
{
  "admin": {
    "identity": "REPLACE_WITH_STEAMID64",
    "groups": ["#3rr/superadmin"]
  }
}
EOF

printf 'Wrote admin bootstrap files to %s\n' "${OUT_DIR}"
