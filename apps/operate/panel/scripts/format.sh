#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

ROOT="$(repo_root)"

require_cmd shfmt

shfmt -w -i 2 -bn -ci "${ROOT}/scripts"
