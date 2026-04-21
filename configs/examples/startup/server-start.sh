#!/usr/bin/env bash
set -euo pipefail

: "${CS2_MAP:=de_dust2}"
: "${CS2_PORT:=27015}"
: "${CS2_MAXPLAYERS:=16}"
: "${RCON_PASSWORD:?RCON_PASSWORD must be set}"

exec ./game/cs2.sh -dedicated +map "${CS2_MAP}" +game_type 0 +game_mode 1 \
  -maxplayers_override "${CS2_MAXPLAYERS}" -port "${CS2_PORT}" +rcon_password "${RCON_PASSWORD}"
