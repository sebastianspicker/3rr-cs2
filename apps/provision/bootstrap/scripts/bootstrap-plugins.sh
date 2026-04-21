#!/usr/bin/env bash
set -euo pipefail

OUT_DIR="${1:-./output}"
mkdir -p "${OUT_DIR}"

cat >"${OUT_DIR}/plugins.env" <<'EOF'
# Comma-separated plugin list consumed by your startup wrapper or container env.
CS2_PLUGINS=metamod,counterstrikesharp
EOF

cat >"${OUT_DIR}/plugins.txt" <<'EOF'
metamod
counterstrikesharp
EOF

printf 'Wrote plugin bootstrap files to %s\n' "${OUT_DIR}"
