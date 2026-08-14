#!/usr/bin/env bash
# Shared private, atomic output writer for bootstrap scripts.

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
  local output_dir

  base_name="${target##*/}"
  output_dir="${target%/*}"
  # Write privately, then rename, so consumers never read a partial output file.
  TEMP_FILE="$(mktemp "${output_dir}/.${base_name}.XXXXXX")"
  chmod 600 "${TEMP_FILE}"
  cat >"${TEMP_FILE}"
  mv -f "${TEMP_FILE}" "${target}"
  TEMP_FILE=""
}
