#!/usr/bin/env bash
# Generates private plugin bootstrap assets in a chosen deployment directory.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/bootstrap-output.sh"

OUT_DIR="${1:-./output}"
mkdir -p "${OUT_DIR}"

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
