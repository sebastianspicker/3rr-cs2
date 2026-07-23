#!/usr/bin/env bash
# Compatibility entry point that delegates all repository validation to verify.sh.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
exec "${SCRIPT_DIR}/verify.sh" "$@"
