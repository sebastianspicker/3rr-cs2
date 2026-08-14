#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd -- "${SCRIPT_DIR}/../../../.." && pwd)"
STARTUP_SCRIPT="${ROOT}/configs/examples/startup/server-start.sh"

tmpdir="$(mktemp -d)"
cleanup() {
  rm -rf "${tmpdir}"
}
trap cleanup EXIT

file_mode() {
  if stat -c '%a' "$1" >/dev/null 2>&1; then
    stat -c '%a' "$1"
  else
    stat -f '%Lp' "$1"
  fi
}

workspace="${tmpdir}/links"
install_dir="${workspace}/install"
argv_file="${workspace}/server-argv.txt"
admins_source="${workspace}/admins.json"
groups_source="${workspace}/admin_groups.json"
config_dir="${install_dir}/game/csgo/addons/counterstrikesharp/configs"
secret_cfg="${install_dir}/game/csgo/cfg/3rr-secrets.cfg"
secret_victim="${workspace}/secret-victim.txt"
rcon_probe="test-rcon-password"
gslt_probe="test-gslt-token"

mkdir -p "${install_dir}/game" "$(dirname -- "${secret_cfg}")"
cat >"${install_dir}/game/cs2.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [[ "${RCON_PASSWORD+x}" == "x" || "${CS2_GSLT+x}" == "x" ]]; then
  printf 'Startup secrets remained in the CS2 process environment\n' >&2
  exit 1
fi
printf '%s\n' "$@" >"${CS2_ARGV_FILE:?}"
EOF
chmod +x "${install_dir}/game/cs2.sh"
printf '{}\n' >"${admins_source}"
printf '{"groups":[]}\n' >"${groups_source}"
printf 'unchanged victim\n' >"${secret_victim}"
ln -s "${secret_victim}" "${secret_cfg}"

(
  cd "${workspace}"
  RCON_PASSWORD="${rcon_probe}" \
    CS2_GSLT="${gslt_probe}" \
    CS2_INSTALL_DIR="${install_dir}" \
    CS2_ARGV_FILE="${argv_file}" \
    CSS_ADMINS_FILE="admins.json" \
    CSS_GROUPS_FILE="admin_groups.json" \
    "${STARTUP_SCRIPT}"
)

if grep -Fq "${rcon_probe}" "${argv_file}" || grep -Fq "${gslt_probe}" "${argv_file}"; then
  printf 'Startup secret leaked into CS2 argv\n' >&2
  exit 1
fi
grep -Fq '+exec' "${argv_file}"
grep -Fq '3rr-secrets.cfg' "${argv_file}"
grep -Fq "rcon_password \"${rcon_probe}\"" "${secret_cfg}"
grep -Fq "sv_setsteamaccount \"${gslt_probe}\"" "${secret_cfg}"
grep -Fxq 'unchanged victim' "${secret_victim}"
[[ -f "${secret_cfg}" && ! -L "${secret_cfg}" ]]
[[ "$(file_mode "${secret_cfg}")" == "600" ]]
[[ "$(realpath "${config_dir}/admins.json")" == "$(realpath "${admins_source}")" ]]
[[ "$(realpath "${config_dir}/admin_groups.json")" == "$(realpath "${groups_source}")" ]]

directory_workspace="${tmpdir}/directory-destination"
directory_install="${directory_workspace}/install"
directory_admins="${directory_workspace}/admins.json"
directory_target="${directory_install}/game/csgo/addons/counterstrikesharp/configs/admins.json"
directory_error="${directory_workspace}/stderr"

mkdir -p "${directory_install}/game" "${directory_target}"
cat >"${directory_install}/game/cs2.sh" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
chmod +x "${directory_install}/game/cs2.sh"
printf '{}\n' >"${directory_admins}"

if (
  cd "${directory_workspace}"
  RCON_PASSWORD="${rcon_probe}" \
    CS2_INSTALL_DIR="${directory_install}" \
    CSS_ADMINS_FILE="admins.json" \
    "${STARTUP_SCRIPT}"
) 2>"${directory_error}"; then
  printf 'Startup wrapper accepted a directory link destination\n' >&2
  exit 1
fi

grep -Fq 'Link destination must not be a directory' "${directory_error}"
[[ ! -e "${directory_target}/admins.json" ]]

printf 'Provision startup wrapper safety tests passed.\n'
