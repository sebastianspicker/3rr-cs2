#!/usr/bin/env bash
set -euo pipefail

OUT_DIR="${1:-./output}"
mkdir -p "${OUT_DIR}"

cat >"${OUT_DIR}/admin_groups.json" <<'EOF'
{
  "superadmin": {
    "flags": ["@css/root", "@css/config"]
  },
  "moderator": {
    "flags": ["@css/slay", "@css/kick"]
  }
}
EOF

cat >"${OUT_DIR}/admins.json" <<'EOF'
{
  "76561198000000000": {
    "identity": "replace-me",
    "groups": ["superadmin"]
  }
}
EOF

printf 'Wrote admin bootstrap files to %s\n' "${OUT_DIR}"
