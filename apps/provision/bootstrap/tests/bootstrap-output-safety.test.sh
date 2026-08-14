#!/usr/bin/env bash
# Verifies bootstrap writers preserve permissions and reject unsafe output destinations.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "${TMP_DIR}"
}

trap cleanup EXIT

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

file_mode() {
  if stat -c '%a' "$1" >/dev/null 2>&1; then
    stat -c '%a' "$1"
  else
    stat -f '%Lp' "$1"
  fi
}

assert_regular_private_file() {
  local path="$1"

  [[ -f "${path}" ]] || fail "expected regular file ${path}"
  [[ ! -L "${path}" ]] || fail "expected ${path} not to be a symlink"
  [[ "$(file_mode "${path}")" == "600" ]] || fail "expected ${path} mode 600"
}

assert_symlink_is_replaced() {
  local script="$1"
  local symlink_name="$2"
  local other_output_name="$3"
  local script_name
  local output_dir
  local victim

  script_name="$(basename "${script}")"
  output_dir="${TMP_DIR}/${script_name}-symlink"
  victim="${TMP_DIR}/${script_name}-victim"

  mkdir -p "${output_dir}"
  printf 'unchanged victim\n' >"${victim}"
  ln -s "${victim}" "${output_dir}/${symlink_name}"

  "${script}" "${output_dir}"

  [[ "$(<"${victim}")" == "unchanged victim" ]] || fail "symlink victim changed for ${script}"
  assert_regular_private_file "${output_dir}/${symlink_name}"
  assert_regular_private_file "${output_dir}/${other_output_name}"
}

assert_directory_is_refused_before_writes() {
  local script="$1"
  local directory_name="$2"
  local other_output_name="$3"
  local script_name
  local output_dir

  script_name="$(basename "${script}")"
  output_dir="${TMP_DIR}/${script_name}-directory"

  mkdir -p "${output_dir}/${directory_name}"

  if "${script}" "${output_dir}"; then
    fail "expected directory destination to fail for ${script}"
  fi

  [[ -d "${output_dir}/${directory_name}" ]] || fail "directory destination was changed for ${script}"
  [[ ! -e "${output_dir}/${other_output_name}" ]] || fail "wrote ${other_output_name} after rejecting a directory"
}

assert_directory_symlink_is_refused() {
  local script="$1"
  local symlink_name="$2"
  local other_output_name="$3"
  local script_name
  local output_dir
  local victim_dir

  script_name="$(basename "${script}")"
  output_dir="${TMP_DIR}/${script_name}-directory-symlink"
  victim_dir="${TMP_DIR}/${script_name}-directory-victim"
  mkdir -p "${output_dir}" "${victim_dir}"
  ln -s "${victim_dir}" "${output_dir}/${symlink_name}"

  if "${script}" "${output_dir}"; then
    fail "expected directory symlink destination to fail for ${script}"
  fi

  [[ -L "${output_dir}/${symlink_name}" ]] || fail "directory symlink was replaced for ${script}"
  [[ -d "${victim_dir}" ]] || fail "directory symlink victim was changed for ${script}"
  [[ ! -e "${output_dir}/${other_output_name}" ]] || fail "wrote ${other_output_name} after rejecting a directory symlink"
}

assert_failed_atomic_write_cleans_temp_file() {
  local script="$1"
  local script_name
  local output_dir
  local fake_bin
  local temp_files

  script_name="$(basename "${script}")"
  output_dir="${TMP_DIR}/${script_name}-failed-rename"
  fake_bin="${TMP_DIR}/${script_name}-fake-bin"
  mkdir -p "${output_dir}" "${fake_bin}"
  printf '#!/usr/bin/env bash\nexit 1\n' >"${fake_bin}/mv"
  chmod 700 "${fake_bin}/mv"

  if PATH="${fake_bin}:${PATH}" "${script}" "${output_dir}"; then
    fail "expected atomic rename to fail for ${script}"
  fi

  shopt -s nullglob
  temp_files=("${output_dir}"/.*.??????)
  [[ "${#temp_files[@]}" == "0" ]] || fail "left temporary output file after failed rename for ${script}"
}

ADMIN_SCRIPT="${ROOT}/scripts/bootstrap-admins.sh"
PLUGIN_SCRIPT="${ROOT}/scripts/bootstrap-plugins.sh"

assert_symlink_is_replaced "${ADMIN_SCRIPT}" "admin_groups.json" "admins.json"
assert_directory_is_refused_before_writes "${ADMIN_SCRIPT}" "admins.json" "admin_groups.json"
assert_directory_symlink_is_refused "${ADMIN_SCRIPT}" "admins.json" "admin_groups.json"
assert_symlink_is_replaced "${PLUGIN_SCRIPT}" "plugins.env" "plugins.txt"
assert_directory_is_refused_before_writes "${PLUGIN_SCRIPT}" "plugins.txt" "plugins.env"
assert_directory_symlink_is_refused "${PLUGIN_SCRIPT}" "plugins.txt" "plugins.env"
assert_failed_atomic_write_cleans_temp_file "${ADMIN_SCRIPT}"
assert_failed_atomic_write_cleans_temp_file "${PLUGIN_SCRIPT}"

printf 'Provision bootstrap output safety tests passed.\n'
