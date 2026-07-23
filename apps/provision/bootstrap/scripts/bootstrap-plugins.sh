#!/usr/bin/env bash
# Generates private plugin bootstrap assets in a chosen deployment directory.
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
  # Write privately, then rename, so consumers never read a partial plugin file.
  TEMP_FILE="$(mktemp "${OUT_DIR}/.${base_name}.XXXXXX")"
  chmod 600 "${TEMP_FILE}"
  cat >"${TEMP_FILE}"
  mv -f "${TEMP_FILE}" "${target}"
  TEMP_FILE=""
}

PLUGINS_ENV="${OUT_DIR}/plugins.env"
PLUGINS_TXT="${OUT_DIR}/plugins.txt"
validate_output_target "${PLUGINS_ENV}"
validate_output_target "${PLUGINS_TXT}"

write_atomic "${PLUGINS_ENV}" <<'EOF'
# Comma-separated plugin list consumed by your startup wrapper or container env.
CS2_PLUGINS=metamod,counterstrikesharp
EOF

write_atomic "${PLUGINS_TXT}" <<'EOF'
metamod
counterstrikesharp
EOF

printf 'Wrote plugin bootstrap files to %s\n' "${OUT_DIR}"
