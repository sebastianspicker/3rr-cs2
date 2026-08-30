#!/usr/bin/env bash
# Creates the isolated mock command environment used by all updater scenarios.
initialize_test_environment() {
    tmpdir="$(mktemp -d ./tmp.XXXXXX)"
    trap 'rm -rf "$tmpdir"' EXIT
    real_awk="$(command -v awk)"

    # Create a mock df that supports --version, -k, and configurable available space.
    cat > "$tmpdir/df" << 'MOCKEOF'
#!/usr/bin/env bash
avail="${DF_AVAILABLE:-500000}"
if [ "$1" = "--version" ]; then
    echo "df (mock)"
    exit 0
fi
echo "Filesystem 1K-blocks Used Available Use% Mounted on"
echo "/dev/mock 1000000 500000 $avail 50% /"
MOCKEOF
    chmod +x "$tmpdir/df"

    # Track build ID reads in the same ordered event log as the service and
    # SteamCMD stubs, then delegate to the real awk implementation.
    cat > "$tmpdir/awk" << EOF
#!/usr/bin/env bash
set -euo pipefail
if [ -n "\${UPDATER_EVENTS_FILE:-}" ]; then
    for arg in "\$@"; do
        case "\$arg" in
            */steamapps/appmanifest_*.acf)
                printf '%s\n' "buildid read" >> "\$UPDATER_EVENTS_FILE"
                break
                ;;
        esac
    done
fi
exec "$real_awk" "\$@"
EOF
    chmod +x "$tmpdir/awk"

    export PATH="$tmpdir:$PWD/tests/bin:$PATH"
}

setup_cs2_dir() {
    local buildid
    buildid="$1"
    mkdir -p "$tmpdir/cs2/steamapps"
    cat > "$tmpdir/cs2/steamapps/appmanifest_730.acf" << EOF
"AppState"
{
    "appid"  "730"
    "buildid"    "$buildid"
}
EOF
}
