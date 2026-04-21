#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
: "${CS2_INSTALL_DIR:=${SCRIPT_DIR}}"
: "${CS2_MAP:=de_dust2}"
: "${CS2_PORT:=27015}"
: "${CS2_MAXPLAYERS:=16}"
: "${CS2_CFG_FILE:=server.cfg}"
: "${RCON_PASSWORD:?RCON_PASSWORD must be set}"

require_integer_in_range() {
  local value name min max
  value="$1"
  name="$2"
  min="$3"
  max="$4"

  if [[ ! "$value" =~ ^[0-9]+$ ]] || ((value < min || value > max)); then
    printf '%s must be an integer between %s and %s\n' "$name" "$min" "$max" >&2
    exit 1
  fi
}

link_if_present() {
  local source_path target_path
  source_path="$1"
  target_path="$2"

  if [[ -z "$source_path" ]]; then
    return 0
  fi
  if [[ ! -f "$source_path" ]]; then
    printf 'Expected file not found: %s\n' "$source_path" >&2
    exit 1
  fi

  mkdir -p "$(dirname -- "$target_path")"
  ln -sf "$source_path" "$target_path"
}

require_integer_in_range "$CS2_PORT" CS2_PORT 1 65535
require_integer_in_range "$CS2_MAXPLAYERS" CS2_MAXPLAYERS 1 64

CS2_BIN="${CS2_INSTALL_DIR}/game/cs2.sh"
if [[ ! -x "$CS2_BIN" ]]; then
  printf 'CS2 binary not found or not executable: %s\n' "$CS2_BIN" >&2
  exit 1
fi

link_if_present "${CSS_ADMINS_FILE:-}" "${CS2_INSTALL_DIR}/game/csgo/addons/counterstrikesharp/configs/admins.json"
link_if_present "${CSS_GROUPS_FILE:-}" "${CS2_INSTALL_DIR}/game/csgo/addons/counterstrikesharp/configs/admin_groups.json"

args=(
  -dedicated
  +map "${CS2_MAP}"
  +game_type 0
  +game_mode 1
  -maxplayers_override "${CS2_MAXPLAYERS}"
  -port "${CS2_PORT}"
  +rcon_password "${RCON_PASSWORD}"
  +exec "${CS2_CFG_FILE}"
)

if [[ -n "${CS2_HOSTNAME:-}" ]]; then
  args+=(+hostname "${CS2_HOSTNAME}")
fi

if [[ -n "${CS2_GSLT:-}" ]]; then
  args+=(+sv_setsteamaccount "${CS2_GSLT}")
fi

exec "$CS2_BIN" "${args[@]}"
