#!/usr/bin/env bash
# Writes the release source archive, the control-plane SBOM, and their SHA-256 checksums.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

usage() {
  cat <<EOF
Usage: ${0##*/} <output-dir> [<git-ref>]

Builds, from <git-ref> (default: HEAD):
  3rr-cs2-<version>.tar.gz             source archive (git archive)
  3rr-control-plane-<version>.cdx.json CycloneDX SBOM of the panel's production dependencies
  SHA256SUMS                           checksums of both files

<output-dir> must not exist yet, or must be empty. Nothing is published.
EOF
}

if [[ $# -lt 1 || $# -gt 2 || "$1" == "-h" || "$1" == "--help" ]]; then
  usage
  [[ $# -ge 1 && ("$1" == "-h" || "$1" == "--help") ]] && exit 0
  exit 2
fi

OUT_DIR="$1"
REF="${2:-HEAD}"

if [[ -e "${OUT_DIR}" && ! -d "${OUT_DIR}" ]]; then
  printf 'Output path exists and is not a directory: %s\n' "${OUT_DIR}" >&2
  exit 1
fi
if [[ -d "${OUT_DIR}" ]] && [[ -n "$(ls -A -- "${OUT_DIR}")" ]]; then
  printf 'Output directory is not empty: %s\n' "${OUT_DIR}" >&2
  exit 1
fi

commit="$(git -C "${ROOT}" rev-parse --verify "${REF}^{commit}")"
version="$(git -C "${ROOT}" show "${commit}:control-plane/package.json" | jq -r '.version')"
if [[ ! "${version}" =~ ^[0-9A-Za-z.+-]+$ ]]; then
  printf 'Unexpected control-plane version: %s\n' "${version}" >&2
  exit 1
fi

# The SBOM describes the lockfile of the checked-out control plane, so it must match the ref.
# Check before writing anything, so a refused run leaves the output directory empty.
if ! git -C "${ROOT}" diff --quiet "${commit}" -- control-plane/package.json control-plane/package-lock.json; then
  printf 'control-plane/package.json or package-lock.json differ from %s; check out that ref first.\n' "${REF}" >&2
  exit 1
fi

mkdir -p -- "${OUT_DIR}"
# git -C resolves relative paths against ROOT, so pin the directory the caller meant.
OUT_DIR="$(cd -- "${OUT_DIR}" && pwd)"
archive="3rr-cs2-${version}.tar.gz"
sbom="3rr-control-plane-${version}.cdx.json"

git -C "${ROOT}" archive --format=tar.gz --prefix="3rr-cs2-${version}/" -o "${OUT_DIR}/${archive}" "${commit}"
(cd "${ROOT}/control-plane" && npm sbom --sbom-format cyclonedx --omit dev) >"${OUT_DIR}/${sbom}"

if command -v sha256sum >/dev/null 2>&1; then
  (cd "${OUT_DIR}" && sha256sum "${archive}" "${sbom}") >"${OUT_DIR}/SHA256SUMS"
else
  (cd "${OUT_DIR}" && shasum -a 256 "${archive}" "${sbom}") >"${OUT_DIR}/SHA256SUMS"
fi

printf 'Wrote release artifacts for %s (%s) to %s\n' "${version}" "${commit}" "${OUT_DIR}"
