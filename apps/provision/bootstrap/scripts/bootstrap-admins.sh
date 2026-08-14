#!/usr/bin/env bash
# Generates private CounterStrikeSharp administrator bootstrap files in a chosen directory.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/bootstrap-output.sh"

OUT_DIR="${1:-./output}"
mkdir -p "${OUT_DIR}"

ADMIN_GROUPS="${OUT_DIR}/admin_groups.json"
ADMINS="${OUT_DIR}/admins.json"
validate_output_target "${ADMIN_GROUPS}"
validate_output_target "${ADMINS}"

write_atomic "${ADMIN_GROUPS}" <<'EOF'
{
  "superadmin": {
    "flags": ["@css/root", "@css/config"]
  },
  "moderator": {
    "flags": ["@css/slay", "@css/kick"]
  }
}
EOF

write_atomic "${ADMINS}" <<'EOF'
{
  "76561198000000000": {
    "identity": "replace-me",
    "groups": ["superadmin"]
  }
}
EOF

printf 'Wrote admin bootstrap files to %s\n' "${OUT_DIR}"
