#!/usr/bin/env bash
# Rehearses the documented CS2 recovery set entirely in disposable directories.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
CAPABILITIES="${ROOT}/server-bootstrap/capabilities.json"
CFG_SOURCE="${ROOT}/server-bootstrap/assets/cfg"
WORKSPACE="$(mktemp -d)"

cleanup() {
  rm -rf "${WORKSPACE}"
}
trap cleanup EXIT

fail() {
  printf 'Recovery layout rehearsal failed: %s\n' "$*" >&2
  exit 1
}

file_mode() {
  if stat -c '%a' "$1" >/dev/null 2>&1; then
    stat -c '%a' "$1"
  else
    stat -f '%Lp' "$1"
  fi
}

file_checksum() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

write_manifest() {
  local base output relative
  base="$1"
  output="$2"
  : >"${output}"
  while IFS= read -r relative; do
    printf '%s  %s\n' "$(file_checksum "${base}/${relative}")" "${relative}" >>"${output}"
  done < <(cd "${base}" && find . -type f ! -name SHA256SUMS -print | LC_ALL=C sort | sed 's#^./##')
}

verify_manifest() {
  local base manifest expected relative actual
  base="$1"
  manifest="$2"
  while read -r expected relative; do
    [[ -n "${expected}" && -n "${relative}" ]] || fail "malformed checksum manifest"
    actual="$(file_checksum "${base}/${relative}")"
    [[ "${actual}" == "${expected}" ]] || fail "checksum mismatch for ${relative}"
  done <"${manifest}"
}

SOURCE="${WORKSPACE}/source"
BACKUP="${WORKSPACE}/backup"
RESTORE="${WORKSPACE}/restore"
mkdir -p \
  "${SOURCE}/cs2-volume/steamapps" \
  "${SOURCE}/bootstrap-private" \
  "${SOURCE}/private-cfg" \
  "${SOURCE}/plugins" \
  "${SOURCE}/metadata"

cat >"${SOURCE}/cs2-volume/steamapps/appmanifest_730.acf" <<'EOF'
"AppState"
{
  "appid" "730"
  "buildid" "123456789"
}
EOF
printf '{"operator":{"groups":["superadmin"]}}\n' >"${SOURCE}/bootstrap-private/admins.json"
printf '{"superadmin":{"flags":["@css/root"]}}\n' >"${SOURCE}/bootstrap-private/admin_groups.json"
printf 'rcon_password "disposable-rehearsal-value"\n' >"${SOURCE}/private-cfg/3rr-secrets.cfg"
printf 'metamod=2.0.0-rehearsal\ncounterstrikesharp=1.0.0-rehearsal\nmatchzy=0.0.0-rehearsal\nrandom-rounds=0.0.0-rehearsal\nroll-the-dice=0.0.0-rehearsal\n' \
  >"${SOURCE}/metadata/plugin-versions.txt"
printf '123456789\n' >"${SOURCE}/metadata/cs2-buildid.txt"

for plugin in metamod counterstrikesharp matchzy random-rounds roll-the-dice; do
  mkdir -p "${SOURCE}/plugins/${plugin}"
  printf '%s\n' "${plugin}-disposable-payload" >"${SOURCE}/plugins/${plugin}/payload.txt"
done
cp -R "${CFG_SOURCE}" "${SOURCE}/repository-cfg"
cp "${CAPABILITIES}" "${SOURCE}/metadata/capabilities.json"
chmod 0700 "${SOURCE}/bootstrap-private" "${SOURCE}/private-cfg"
chmod 0600 "${SOURCE}/bootstrap-private"/*.json "${SOURCE}/private-cfg/3rr-secrets.cfg"

write_manifest "${SOURCE}" "${WORKSPACE}/source-before.SHA256SUMS"
mkdir -p "${BACKUP}"
cp -R "${SOURCE}/." "${BACKUP}/"
write_manifest "${BACKUP}" "${BACKUP}/SHA256SUMS"
chmod 0600 "${BACKUP}/SHA256SUMS"
verify_manifest "${BACKUP}" "${BACKUP}/SHA256SUMS"

mkdir -p "${RESTORE}"
chmod 0700 "${RESTORE}"
cp -R "${BACKUP}/." "${RESTORE}/"
rm "${RESTORE}/SHA256SUMS"
verify_manifest "${RESTORE}" "${BACKUP}/SHA256SUMS"

restored_buildid="$(awk -F'"' '$2 == "buildid" && $4 != "" { print $4; exit }' "${RESTORE}/cs2-volume/steamapps/appmanifest_730.acf")"
[[ "${restored_buildid}" == "123456789" ]] || fail "restored CS2 build ID differs"
[[ "$(file_mode "${RESTORE}/bootstrap-private/admins.json")" == "600" ]] || fail "restored admins.json is not mode 0600"
[[ "$(file_mode "${RESTORE}/bootstrap-private/admin_groups.json")" == "600" ]] || fail "restored admin_groups.json is not mode 0600"
[[ "$(file_mode "${RESTORE}/private-cfg/3rr-secrets.cfg")" == "600" ]] || fail "restored private CFG is not mode 0600"
diff -qr "${CFG_SOURCE}" "${RESTORE}/repository-cfg" >/dev/null || fail "repository CFG bundle differs"
cmp -s "${CAPABILITIES}" "${RESTORE}/metadata/capabilities.json" || fail "capability manifest differs"

while IFS= read -r plugin; do
  grep -Eq "^${plugin}=[^[:space:]]+$" "${RESTORE}/metadata/plugin-versions.txt" || fail "missing recorded version for ${plugin}"
  [[ -f "${RESTORE}/plugins/${plugin}/payload.txt" ]] || fail "missing restored plugin payload for ${plugin}"
done < <(jq -r '.requiredPluginIds[]' "${CAPABILITIES}")

write_manifest "${SOURCE}" "${WORKSPACE}/source-after.SHA256SUMS"
cmp -s "${WORKSPACE}/source-before.SHA256SUMS" "${WORKSPACE}/source-after.SHA256SUMS" || fail "source recovery set changed during rehearsal"

printf 'Disposable CS2 recovery layout rehearsal passed.\n'
