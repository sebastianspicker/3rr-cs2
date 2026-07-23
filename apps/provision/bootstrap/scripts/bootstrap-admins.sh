#!/usr/bin/env bash
# Generates private CounterStrikeSharp administrator bootstrap files in a chosen directory.
set -euo pipefail

OUT_DIR="${1:-./output}"
mkdir -p "${OUT_DIR}"

TEMP_FILE=""

cleanup_temp_file() {
  if [[ -n "${TEMP_FILE}" ]]; then
    rm -f -- "${TEMP_FILE}"
  fi
}

trap cleanup_temp_file EXIT

validate_output_target() {
  local target="$1"

  # A directory (including a symlink to one) cannot be replaced atomically by
  # rename. Refuse it before writing either bootstrap file.
  if [[ -d "${target}" ]]; then
    printf 'Refusing to replace output directory: %s\n' "${target}" >&2
    return 1
  fi
}

write_atomic() {
  local target="$1"
  local base_name

  base_name="${target##*/}"
  # Write privately, then rename, so consumers never read a partial admin file.
  TEMP_FILE="$(mktemp "${OUT_DIR}/.${base_name}.XXXXXX")"
  chmod 600 "${TEMP_FILE}"
  cat >"${TEMP_FILE}"
  mv -f "${TEMP_FILE}" "${target}"
  TEMP_FILE=""
}

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
