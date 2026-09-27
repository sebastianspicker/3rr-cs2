#!/usr/bin/env bash
# Exercises immutable image-reference validation without contacting a registry.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
CHECKER="${SCRIPT_DIR}/check-deployment-contract.sh"
DIGEST="0000000000000000000000000000000000000000000000000000000000000000"

fail() {
  printf 'Deployment contract test failed: %s\n' "$*" >&2
  exit 1
}

expect_valid() {
  local image output
  image="$1"
  if ! output="$("${CHECKER}" --image "${image}" 2>&1)"; then
    fail "expected valid image ${image}; output: ${output}"
  fi
}

expect_invalid() {
  local image
  image="$1"
  if "${CHECKER}" --image "${image}" >/dev/null 2>&1; then
    fail "expected invalid image to be rejected: ${image}"
  fi
}

expect_valid "registry.example/cs2@sha256:${DIGEST}"
expect_valid "ghcr.io/example/cs2-server:stable@sha256:${DIGEST}"
expect_invalid "!!!@sha256:${DIGEST}"
expect_invalid "registry.example//cs2@sha256:${DIGEST}"
expect_invalid $'cs2\njunk@sha256:'"${DIGEST}"
expect_invalid ""

printf 'Deployment image-reference contract tests passed.\n'
