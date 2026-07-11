#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

fail() {
    echo "FAIL: $*" >&2
    exit 1
}

assert_contains() {
    local needle haystack
    needle="$1"
    haystack="$2"
    if ! grep -Fq "$needle" <<< "$haystack"; then
        fail "Expected to find '$needle' in: $haystack"
    fi
}

assert_not_contains() {
    local needle haystack
    needle="$1"
    haystack="$2"
    if grep -Fq "$needle" <<< "$haystack"; then
        fail "Expected NOT to find '$needle' in: $haystack"
    fi
}

read_events() {
    if [ -n "${UPDATER_EVENTS_FILE:-}" ] && [ -f "$UPDATER_EVENTS_FILE" ]; then
        cat "$UPDATER_EVENTS_FILE"
    fi
}

assert_ordered_events() {
    local last_index needle index event matched events
    last_index=0
    for needle in "$@"; do
        index=0
        matched=0
        while IFS= read -r event; do
            index=$((index + 1))
            if [ "$index" -le "$last_index" ]; then
                continue
            fi
            if [ "$event" = "$needle" ]; then
                last_index="$index"
                matched=1
                break
            fi
        done < "${UPDATER_EVENTS_FILE:-/dev/null}"
        if [ "$matched" -ne 1 ]; then
            events="$(read_events)"
            fail "Expected ordered event '$needle' after position $last_index in: $events"
        fi
    done
}

assert_no_event() {
    local needle
    needle="$1"
    assert_not_contains "$needle" "$(read_events)"
}

unset_removed_config_env() {
    unset NOTIFY_WEBHOOK_URL NOTIFY_PLAYERS_MESSAGE RCON_CLI RCON_HOST RCON_PORT RCON_PASSWORD
}

# Run script, assert exit code and that combined output contains needle. Pass env overrides as KEY=val.
# Baseline env is reset each time so tests do not inherit from previous runs.
run_validation_test() {
    local name expected_rc needle pair key val rc
    name="$1"
    expected_rc="$2"
    needle="$3"
    shift 3
    export LOCKDIR="$tmpdir/lock"
    export LOGFILE="$tmpdir/log"
    export CS2_DIR="$tmpdir/cs2"
    export SERVICE_NAME="cs2.service"
    export STEAMCMD="$PWD/tests/bin/steamcmd"
    export CS2_APP_ID="730"
    export REQUIRED_SPACE="1"
    export MAX_ATTEMPTS="1"
    export SLEEP_SECS="0"
    export ALLOW_NONROOT="1"
    export NO_SLEEP="1"
    export LOG_LEVEL="normal"
    export DRY_RUN="0"
    export CONFIG_FILE=""
    export REMOTE_BUILDID="100"
    export STEAMCMD_UPDATE_EXIT="0"
    export STEAMCMD_APPINFO_EXIT="0"
    export STEAMCMD_UPDATE_BUILDID="100"
    export STEAMCMD_CALLS_FILE="$tmpdir/steamcmd.calls"
    export SYSTEMCTL_CALLS_FILE="$tmpdir/systemctl.calls"
    export SYSTEMCTL_STATE_FILE="$tmpdir/systemctl.state"
    export UPDATER_EVENTS_FILE="$tmpdir/events"
    export SYSTEMCTL_STOP_EXIT="0"
    export SYSTEMCTL_START_EXIT="0"
    export SYSTEMCTL_START_STATE="active"
    unset_removed_config_env
    rm -rf "$tmpdir/cs2" "$tmpdir/lock" "$tmpdir/log" "$tmpdir/systemctl.calls" "$tmpdir/systemctl.state" "$tmpdir/steamcmd.calls" "$tmpdir/events"
    setup_cs2_dir "100"
    echo "active" > "$SYSTEMCTL_STATE_FILE"
    for pair in "$@"; do
        key="${pair%%=*}"
        val="${pair#*=}"
        export "$key"="$val"
    done
    echo "==> $name"
    set +e
    ./update_cs2.sh > "$tmpdir/stdout" 2> "$tmpdir/stderr"
    rc=$?
    set -e
    [ "$rc" -eq "$expected_rc" ] || fail "expected rc=$expected_rc, got $rc; stderr=$(cat "$tmpdir/stderr")"
    assert_contains "$needle" "$(cat "$tmpdir/stdout" "$tmpdir/stderr")"
    pass
}

PASS_COUNT=0
pass() { PASS_COUNT=$((PASS_COUNT + 1)); }

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

run_case() {
    local name local_build remote_build update_exit initial_state rc calls stdout stderr events
    name="$1"
    local_build="$2"
    remote_build="$3"
    update_exit="$4" # 0 or 1
    initial_state="${5:-active}"

    echo "==> $name"

    rm -rf "$tmpdir/cs2" "$tmpdir/lock" "$tmpdir/log" "$tmpdir/systemctl.calls" "$tmpdir/systemctl.state" "$tmpdir/steamcmd.calls" "$tmpdir/events"
    setup_cs2_dir "$local_build"

    export LOCKDIR="$tmpdir/lock"
    export LOGFILE="$tmpdir/log"
    export CS2_DIR="$tmpdir/cs2"
    export SERVICE_NAME="cs2.service"
    export STEAMCMD="$PWD/tests/bin/steamcmd"
    export CS2_APP_ID="730"
    export REQUIRED_SPACE="1"
    export MAX_ATTEMPTS="1"
    export SLEEP_SECS="0"
    export NO_SLEEP="1"
    export ALLOW_NONROOT="1"
    export CONFIG_FILE="$tmpdir/nonexistent.conf"

    export REMOTE_BUILDID="$remote_build"
    export STEAMCMD_UPDATE_EXIT="$update_exit"
    export STEAMCMD_APPINFO_EXIT="0"
    export STEAMCMD_UPDATE_BUILDID="$remote_build"
    export STEAMCMD_CALLS_FILE="$tmpdir/steamcmd.calls"

    export SYSTEMCTL_CALLS_FILE="$tmpdir/systemctl.calls"
    export SYSTEMCTL_STATE_FILE="$tmpdir/systemctl.state"
    export UPDATER_EVENTS_FILE="$tmpdir/events"
    export SYSTEMCTL_STOP_EXIT="0"
    export SYSTEMCTL_START_EXIT="0"
    export SYSTEMCTL_START_STATE="active"
    unset_removed_config_env
    echo "$initial_state" > "$SYSTEMCTL_STATE_FILE"

    set +e
    ./update_cs2.sh > "$tmpdir/stdout" 2> "$tmpdir/stderr"
    rc=$?
    set -e

    calls=""
    if [ -f "$SYSTEMCTL_CALLS_FILE" ]; then
        calls="$(cat "$SYSTEMCTL_CALLS_FILE")"
    fi

    stdout="$(cat "$tmpdir/stdout")"
    stderr="$(cat "$tmpdir/stderr")"
    events="$(read_events)"

    case "$name" in
        "no-update")
            [ "$rc" -eq 0 ] || fail "expected rc=0, got $rc; stderr=$stderr"
            assert_contains "No update required" "$stdout"
            assert_not_contains "stop" "$calls"
            assert_not_contains "start" "$calls"
            assert_ordered_events "buildid read" "steamcmd app_info_print" "systemctl is-active"
            assert_no_event "systemctl stop"
            assert_no_event "steamcmd app_update"
            assert_no_event "systemctl start"
            ;;
        "update-applied")
            [ "$rc" -eq 0 ] || fail "expected rc=0, got $rc; stderr=$stderr"
            assert_contains "Update required" "$stdout"
            assert_contains "Update applied successfully" "$stdout"
            assert_contains "stop" "$calls"
            assert_contains "start" "$calls"
            assert_ordered_events "buildid read" "steamcmd app_info_print" "systemctl stop" "steamcmd app_update" "buildid read" "systemctl start" "systemctl is-active"
            ;;
        "update-failed")
            [ "$rc" -ne 0 ] || fail "expected non-zero rc, got $rc"
            assert_contains "SteamCMD update failed" "$stdout"
            assert_contains "stop" "$calls"
            assert_contains "start" "$calls"
            assert_ordered_events "buildid read" "steamcmd app_info_print" "systemctl stop" "steamcmd app_update" "systemctl start" "systemctl is-active"
            ;;
        "unknown-remote")
            [ "$rc" -ne 0 ] || fail "expected non-zero rc, got $rc"
            assert_contains "refusing to stop the service while remote status is unknown" "$stdout"
            assert_not_contains "stop" "$calls"
            assert_not_contains "start" "$calls"
            assert_not_contains "+app_update" "$(cat "$tmpdir/steamcmd.calls" 2> /dev/null || true)"
            assert_ordered_events "buildid read" "steamcmd app_info_print"
            assert_no_event "systemctl stop"
            assert_no_event "steamcmd app_update"
            assert_no_event "systemctl start"
            ;;
        "false-success-update")
            [ "$rc" -ne 0 ] || fail "expected non-zero rc, got $rc"
            assert_contains "buildid did not change after the update attempt" "$stdout"
            assert_contains "stop" "$calls"
            assert_contains "start" "$calls"
            assert_ordered_events "buildid read" "steamcmd app_info_print" "systemctl stop" "steamcmd app_update" "buildid read" "systemctl start" "systemctl is-active"
            ;;
        "start-failed-after-update")
            [ "$rc" -ne 0 ] || fail "expected non-zero rc, got $rc"
            assert_contains "Failed to start $SERVICE_NAME after $MAX_ATTEMPTS attempts." "$stdout"
            assert_contains "stop" "$calls"
            assert_contains "start" "$calls"
            assert_ordered_events "buildid read" "steamcmd app_info_print" "systemctl stop" "steamcmd app_update" "buildid read" "systemctl start"
            ;;
        "no-update-service-inactive")
            [ "$rc" -eq 0 ] || fail "expected rc=0, got $rc; stderr=$stderr"
            assert_contains "No update required" "$stdout"
            assert_contains "not running; starting" "$stdout"
            assert_not_contains "stop" "$calls"
            assert_contains "start" "$calls"
            assert_ordered_events "buildid read" "steamcmd app_info_print" "systemctl is-active" "systemctl start" "systemctl is-active"
            assert_not_contains "systemctl stop" "$events"
            assert_not_contains "steamcmd app_update" "$events"
            ;;
        *)
            fail "unknown case: $name"
            ;;
    esac
    pass
}

run_with_args_case() {
    local name expected_rc args initial_state rc
    name="$1"
    expected_rc="$2"
    args="$3"
    initial_state="${4:-active}"

    echo "==> $name"

    rm -rf "$tmpdir/cs2" "$tmpdir/lock" "$tmpdir/log" "$tmpdir/systemctl.calls" "$tmpdir/systemctl.state" "$tmpdir/events"
    setup_cs2_dir "100"

    export LOCKDIR="$tmpdir/lock"
    export LOGFILE="$tmpdir/log"
    export CS2_DIR="$tmpdir/cs2"
    export SERVICE_NAME="cs2.service"
    export STEAMCMD="$PWD/tests/bin/steamcmd"
    export CS2_APP_ID="730"
    export REQUIRED_SPACE="1"
    export MAX_ATTEMPTS="1"
    export SLEEP_SECS="0"
    export NO_SLEEP="1"
    export ALLOW_NONROOT="1"
    export CONFIG_FILE=""
    export REMOTE_BUILDID="200"
    export STEAMCMD_UPDATE_EXIT="0"
    export STEAMCMD_APPINFO_EXIT="0"
    export STEAMCMD_UPDATE_BUILDID="200"
    export STEAMCMD_CALLS_FILE="$tmpdir/steamcmd.calls"
    export SYSTEMCTL_CALLS_FILE="$tmpdir/systemctl.calls"
    export SYSTEMCTL_STATE_FILE="$tmpdir/systemctl.state"
    export UPDATER_EVENTS_FILE="$tmpdir/events"
    export SYSTEMCTL_STOP_EXIT="0"
    export SYSTEMCTL_START_EXIT="0"
    export SYSTEMCTL_START_STATE="active"
    unset_removed_config_env
    echo "$initial_state" > "$SYSTEMCTL_STATE_FILE"

    set +e
    # shellcheck disable=SC2086
    ./update_cs2.sh $args > "$tmpdir/stdout" 2> "$tmpdir/stderr"
    rc=$?
    set -e
    [ "$rc" -eq "$expected_rc" ] || fail "expected rc=$expected_rc, got $rc; stderr=$(cat "$tmpdir/stderr")"
    pass
}

run_lock_case() {
    local name prepare_fn expected_rc needle rc
    name="$1"
    prepare_fn="$2"
    expected_rc="$3"
    needle="$4"

    echo "==> $name"

    rm -rf "$tmpdir/cs2" "$tmpdir/lock" "$tmpdir/log" "$tmpdir/systemctl.calls" "$tmpdir/systemctl.state" "$tmpdir/events"
    setup_cs2_dir "100"

    export LOCKDIR="$tmpdir/lock"
    export LOGFILE="$tmpdir/log"
    export CS2_DIR="$tmpdir/cs2"
    export SERVICE_NAME="cs2.service"
    export STEAMCMD="$PWD/tests/bin/steamcmd"
    export CS2_APP_ID="730"
    export REQUIRED_SPACE="1"
    export MAX_ATTEMPTS="1"
    export SLEEP_SECS="0"
    export NO_SLEEP="1"
    export ALLOW_NONROOT="1"
    export CONFIG_FILE=""
    export REMOTE_BUILDID="100"
    export STEAMCMD_UPDATE_EXIT="0"
    export STEAMCMD_APPINFO_EXIT="0"
    export STEAMCMD_UPDATE_BUILDID="100"
    export STEAMCMD_CALLS_FILE="$tmpdir/steamcmd.calls"
    export SYSTEMCTL_CALLS_FILE="$tmpdir/systemctl.calls"
    export SYSTEMCTL_STATE_FILE="$tmpdir/systemctl.state"
    export UPDATER_EVENTS_FILE="$tmpdir/events"
    export SYSTEMCTL_STOP_EXIT="0"
    export SYSTEMCTL_START_EXIT="0"
    export SYSTEMCTL_START_STATE="active"
    unset_removed_config_env
    echo "active" > "$SYSTEMCTL_STATE_FILE"

    "$prepare_fn"

    set +e
    ./update_cs2.sh > "$tmpdir/stdout" 2> "$tmpdir/stderr"
    rc=$?
    set -e
    [ "$rc" -eq "$expected_rc" ] || fail "expected rc=$expected_rc, got $rc; stderr=$(cat "$tmpdir/stderr")"
    assert_contains "$needle" "$(cat "$tmpdir/stdout" "$tmpdir/stderr")"
    pass
}

prepare_stale_lock_with_dead_pid() {
    mkdir -p "$tmpdir/lock"
    printf '999999\n' > "$tmpdir/lock/pid"
}

prepare_stale_lock_with_live_pid_mismatched_metadata() {
    mkdir -p "$tmpdir/lock"
    printf '%s\n' "$$" > "$tmpdir/lock/pid"
    cat > "$tmpdir/lock/meta" << EOF
pid=$$
started=Thu Jan  1 00:00:00 1970
script=$PWD/update_cs2.sh
EOF
}

run_case "no-update" "100" "100" "0"
run_case "update-applied" "100" "200" "0"
run_case "update-failed" "100" "200" "1"
run_case "unknown-remote" "100" "" "0"
run_case "no-update-service-inactive" "100" "100" "0" "inactive"
run_lock_case "stale-lock-recovery" "prepare_stale_lock_with_dead_pid" 0 "Recovered stale lock and acquired a new lock."
run_lock_case "stale-lock-live-pid-metadata-mismatch" "prepare_stale_lock_with_live_pid_mismatched_metadata" 0 "Recovered stale lock and acquired a new lock."

# Validation tests (reject bad config or expect normalized success)
run_validation_test "reject LOCKDIR=/" 1 "LOCKDIR must not be root" LOCKDIR="/" LOGFILE="$tmpdir/log" CS2_DIR="$tmpdir/cs2"
run_validation_test "reject LOCKDIR create failure" 1 "Failed to create lock directory" LOCKDIR="$tmpdir/no-write-parent/lock"

run_validation_test "reject invalid SERVICE_NAME" 1 "SERVICE_NAME must contain only safe" SERVICE_NAME="cs2;evil"

run_validation_test "reject SLEEP_SECS > 3600" 1 "SLEEP_SECS must be at most 3600" SLEEP_SECS="5000"
run_validation_test "reject invalid LOG_LEVEL" 1 "LOG_LEVEL must be one of" LOG_LEVEL="loud"
run_validation_test "reject unused LOG_LEVEL=verbose" 1 "LOG_LEVEL must be one of: quiet, normal" LOG_LEVEL="verbose"
run_validation_test "reject invalid NO_SLEEP" 1 "NO_SLEEP must be 0 or 1" NO_SLEEP="yes"
run_validation_test "reject invalid DRY_RUN" 1 "DRY_RUN must be 0 or 1" DRY_RUN="maybe"

run_validation_test "reject LOGFILE=/" 1 "LOGFILE must not be root" LOGFILE="/" SLEEP_SECS="0"
run_validation_test "reject LOGFILE non-regular" 1 "LOGFILE must be a regular file path" LOGFILE="/dev/null"

# LOGFILE must not be a symlink (avoid writing to symlink target)
touch "$tmpdir/logtarget"
ln -sf "$tmpdir/logtarget" "$tmpdir/loglink"
run_validation_test "reject LOGFILE symlink" 1 "LOGFILE must not be a symlink" LOGFILE="$(cd "$tmpdir" && pwd)/loglink"

run_validation_test "reject CONFIG_FILE=-" 1 "must not be '-'" CONFIG_FILE="-"
run_validation_test "reject CONFIG_FILE like option" 1 "must not look like an option" CONFIG_FILE="--dry-run"

# Empty SERVICE_NAME normalized to default (expect success)
run_validation_test "empty SERVICE_NAME normalized" 0 "Update process" SERVICE_NAME=""
# Normalization yields success; assert exit 0 already done by helper; needle "Update process" in stdout

cat > "$tmpdir/unknownconf" << 'CONFEOF'
BOGUS_KEY=evil
CONFEOF
run_validation_test "reject unknown config key" 1 "Unknown config key: BOGUS_KEY" CONFIG_FILE="$tmpdir/unknownconf"

cat > "$tmpdir/testhelperconf" << 'CONFEOF'
ALLOW_NONROOT=1
NO_SLEEP=1
CONFEOF
run_validation_test "reject test helpers in config file" 1 "Unknown config key: ALLOW_NONROOT" CONFIG_FILE="$tmpdir/testhelperconf"

cat > "$tmpdir/emptycriticalconf" << 'CONFEOF'
SERVICE_NAME=
CONFEOF
run_validation_test "reject empty SERVICE_NAME in config" 1 "Config key SERVICE_NAME must not be empty" CONFIG_FILE="$tmpdir/emptycriticalconf"

cat > "$tmpdir/duplicateconf" << 'CONFEOF'
SLEEP_SECS=0
SLEEP_SECS=1
CONFEOF
run_validation_test "reject duplicate config key" 1 "Duplicate config key: SLEEP_SECS" CONFIG_FILE="$tmpdir/duplicateconf"

cat > "$tmpdir/quotedconf" << 'CONFEOF'
SERVICE_NAME='custom.service' # quoted value with trailing comment
SLEEP_SECS=0
CONFEOF
run_validation_test "quoted config value overrides default service" 0 "custom.service is already running" CONFIG_FILE="$tmpdir/quotedconf"

# CLI --dry-run must win over config DRY_RUN=0 (safety).
cat > "$tmpdir/conf" << 'EOF'
DRY_RUN=0
EOF
run_with_args_case "dry-run CLI overrides config" 0 "--dry-run --config=$tmpdir/conf" "inactive"
assert_contains "Dry run: skipping service stop, SteamCMD update, and service start." "$(cat "$tmpdir/stdout")"
assert_not_contains "stop" "$(cat "$tmpdir/systemctl.calls" 2> /dev/null || true)"
assert_not_contains "start" "$(cat "$tmpdir/systemctl.calls" 2> /dev/null || true)"
assert_ordered_events "buildid read" "steamcmd app_info_print"
assert_no_event "systemctl stop"
assert_no_event "steamcmd app_update"
assert_no_event "systemctl start"

# Unknown options should fail fast to avoid silent misconfiguration.
run_with_args_case "reject unknown option" 1 "--does-not-exist"
assert_contains "Unknown option" "$(cat "$tmpdir/stdout" "$tmpdir/stderr")"

{
    printf '%s\n' 'NOTIFY_WEBHOOK_URL=https://hooks.example.invalid/webhook'
    printf 'RCON_PASSWORD=%s\n' "old-$(date +%s)-value"
} > "$tmpdir/removedconf"
run_validation_test "warn removed webhook config key" 0 "Config key NOTIFY_WEBHOOK_URL is no longer supported" CONFIG_FILE="$tmpdir/removedconf"
run_validation_test "warn removed RCON config key" 0 "Config key RCON_PASSWORD is no longer supported" CONFIG_FILE="$tmpdir/removedconf"
run_validation_test "warn removed webhook env key" 0 "Config key NOTIFY_WEBHOOK_URL is no longer supported" NOTIFY_WEBHOOK_URL="https://hooks.example.invalid/webhook"

# Security helper must fail without echoing the detected secret into logs.
echo "==> security scan redacts detected secret values"
rm -rf "$tmpdir/security-redaction"
mkdir -p "$tmpdir/security-redaction/scripts"
cp scripts/security.sh "$tmpdir/security-redaction/scripts/security.sh"
fake_token="$(printf 'g%s_' 'hp')$(printf 'a%.0s' {1..36})"
printf 'TOKEN=%s\n' "$fake_token" > "$tmpdir/security-redaction/leak.txt"
(
    cd "$tmpdir/security-redaction"
    git init -q
    git add leak.txt scripts/security.sh
)
set +e
(
    cd "$tmpdir/security-redaction"
    ./scripts/security.sh
) > "$tmpdir/stdout" 2> "$tmpdir/stderr"
rc=$?
set -e
[ "$rc" -eq 1 ] || fail "security redaction: expected rc=1, got $rc"
combined_output="$(cat "$tmpdir/stdout" "$tmpdir/stderr")"
assert_contains "[REDACTED]" "$combined_output"
assert_contains "Potential secret material detected" "$combined_output"
assert_not_contains "$fake_token" "$combined_output"
pass

# CLI: --help
echo "==> --help flag"
set +e
./update_cs2.sh --help > "$tmpdir/stdout" 2> "$tmpdir/stderr"
rc=$?
set -e
[ "$rc" -eq 0 ] || fail "--help: expected rc=0, got $rc"
assert_contains "Usage:" "$(cat "$tmpdir/stdout")"
pass

# CLI: --version
echo "==> --version flag"
set +e
./update_cs2.sh --version > "$tmpdir/stdout" 2> "$tmpdir/stderr"
rc=$?
set -e
[ "$rc" -eq 0 ] || fail "--version: expected rc=0, got $rc"
# Version string should be a number pattern like X.Y.Z
grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$' "$tmpdir/stdout" || fail "--version: output not in X.Y.Z format: $(cat "$tmpdir/stdout")"
pass

# CLI: --status (up-to-date)
echo "==> --status up-to-date"
rm -rf "$tmpdir/cs2" "$tmpdir/lock" "$tmpdir/log" "$tmpdir/systemctl.calls" "$tmpdir/systemctl.state"
setup_cs2_dir "100"
export LOCKDIR="$tmpdir/lock" LOGFILE="$tmpdir/log" CS2_DIR="$tmpdir/cs2"
export SERVICE_NAME="cs2.service" STEAMCMD="$PWD/tests/bin/steamcmd" CS2_APP_ID="730"
export REQUIRED_SPACE="1" MAX_ATTEMPTS="1" SLEEP_SECS="0" NO_SLEEP="1" ALLOW_NONROOT="1"
export CONFIG_FILE="" REMOTE_BUILDID="100" STEAMCMD_UPDATE_EXIT="0"
export SYSTEMCTL_CALLS_FILE="$tmpdir/systemctl.calls" SYSTEMCTL_STATE_FILE="$tmpdir/systemctl.state"
echo "active" > "$SYSTEMCTL_STATE_FILE"
set +e
./update_cs2.sh --status > "$tmpdir/stdout" 2> "$tmpdir/stderr"
rc=$?
set -e
[ "$rc" -eq 0 ] || fail "--status up-to-date: expected rc=0, got $rc"
assert_contains "up-to-date" "$(cat "$tmpdir/stdout")"
assert_not_contains "stop" "$(cat "$tmpdir/systemctl.calls" 2> /dev/null || true)"
pass

# CLI: --status (update available)
echo "==> --status update-available"
rm -rf "$tmpdir/lock" "$tmpdir/log" "$tmpdir/systemctl.calls"
export REMOTE_BUILDID="200"
set +e
./update_cs2.sh --status > "$tmpdir/stdout" 2> "$tmpdir/stderr"
rc=$?
set -e
[ "$rc" -eq 0 ] || fail "--status update-available: expected rc=0, got $rc"
assert_contains "update available" "$(cat "$tmpdir/stdout")"
assert_not_contains "stop" "$(cat "$tmpdir/systemctl.calls" 2> /dev/null || true)"
pass

# CLI: --status (unknown remote)
echo "==> --status unknown"
rm -rf "$tmpdir/lock" "$tmpdir/log" "$tmpdir/systemctl.calls" "$tmpdir/steamcmd.calls"
export REMOTE_BUILDID=""
export STEAMCMD_APPINFO_EXIT="1"
set +e
./update_cs2.sh --status > "$tmpdir/stdout" 2> "$tmpdir/stderr"
rc=$?
set -e
unset STEAMCMD_APPINFO_EXIT
[ "$rc" -ne 0 ] || fail "--status unknown: expected non-zero rc, got $rc"
assert_contains "Status: unknown" "$(cat "$tmpdir/stdout")"
assert_not_contains "stop" "$(cat "$tmpdir/systemctl.calls" 2> /dev/null || true)"
pass

# CLI: --status should not require a working systemctl implementation.
echo "==> --status without systemctl"
old_path="$PATH"
cat > "$tmpdir/systemctl" << 'EOF'
#!/usr/bin/env bash
exit 127
EOF
chmod +x "$tmpdir/systemctl"
rm -rf "$tmpdir/lock" "$tmpdir/log" "$tmpdir/systemctl.calls"
export PATH="$tmpdir:$PWD/tests/bin:$PATH"
export REMOTE_BUILDID="100"
set +e
./update_cs2.sh --status > "$tmpdir/stdout" 2> "$tmpdir/stderr"
rc=$?
set -e
export PATH="$old_path"
rm -f "$tmpdir/systemctl"
[ "$rc" -eq 0 ] || fail "--status without systemctl: expected rc=0, got $rc"
assert_contains "up-to-date" "$(cat "$tmpdir/stdout")"
pass

# CLI: -c FILE (space-separated config)
echo "==> -c FILE config loading"
rm -rf "$tmpdir/lock" "$tmpdir/log" "$tmpdir/systemctl.calls"
cat > "$tmpdir/conf2" << 'CONFEOF'
DRY_RUN=0
CONFEOF
export REMOTE_BUILDID="200" CONFIG_FILE=""
run_with_args_case "-c FILE config loading" 0 "-c $tmpdir/conf2"
pass

# SteamCMD exit 0 but unchanged buildid must fail.
echo "==> unchanged buildid after update"
rm -rf "$tmpdir/cs2" "$tmpdir/lock" "$tmpdir/log" "$tmpdir/systemctl.calls" "$tmpdir/systemctl.state" "$tmpdir/steamcmd.calls" "$tmpdir/events"
setup_cs2_dir "100"
export LOCKDIR="$tmpdir/lock" LOGFILE="$tmpdir/log" CS2_DIR="$tmpdir/cs2"
export SERVICE_NAME="cs2.service" STEAMCMD="$PWD/tests/bin/steamcmd" CS2_APP_ID="730"
export REQUIRED_SPACE="1" MAX_ATTEMPTS="1" SLEEP_SECS="0" NO_SLEEP="1" ALLOW_NONROOT="1"
export CONFIG_FILE="" REMOTE_BUILDID="200" STEAMCMD_UPDATE_EXIT="0" STEAMCMD_UPDATE_BUILDID="100"
export SYSTEMCTL_CALLS_FILE="$tmpdir/systemctl.calls" SYSTEMCTL_STATE_FILE="$tmpdir/systemctl.state"
export UPDATER_EVENTS_FILE="$tmpdir/events"
export SYSTEMCTL_START_STATE="active"
echo "active" > "$SYSTEMCTL_STATE_FILE"
set +e
./update_cs2.sh > "$tmpdir/stdout" 2> "$tmpdir/stderr"
rc=$?
set -e
[ "$rc" -ne 0 ] || fail "unchanged buildid: expected non-zero rc, got $rc"
assert_contains "buildid did not change after the update attempt" "$(cat "$tmpdir/stdout")"
assert_contains "stop" "$(cat "$tmpdir/systemctl.calls")"
assert_contains "start" "$(cat "$tmpdir/systemctl.calls")"
assert_ordered_events "buildid read" "steamcmd app_info_print" "systemctl stop" "steamcmd app_update" "buildid read" "systemctl start" "systemctl is-active"
pass

# Start failure after an update attempt must fail the run.
echo "==> start failure after update"
rm -rf "$tmpdir/cs2" "$tmpdir/lock" "$tmpdir/log" "$tmpdir/systemctl.calls" "$tmpdir/systemctl.state" "$tmpdir/events"
setup_cs2_dir "100"
export LOCKDIR="$tmpdir/lock" LOGFILE="$tmpdir/log" CS2_DIR="$tmpdir/cs2"
export SERVICE_NAME="cs2.service" STEAMCMD="$PWD/tests/bin/steamcmd" CS2_APP_ID="730"
export REQUIRED_SPACE="1" MAX_ATTEMPTS="1" SLEEP_SECS="0" NO_SLEEP="1" ALLOW_NONROOT="1"
export CONFIG_FILE="" REMOTE_BUILDID="200" STEAMCMD_UPDATE_EXIT="0" STEAMCMD_UPDATE_BUILDID="200"
export SYSTEMCTL_CALLS_FILE="$tmpdir/systemctl.calls" SYSTEMCTL_STATE_FILE="$tmpdir/systemctl.state"
export UPDATER_EVENTS_FILE="$tmpdir/events"
export SYSTEMCTL_START_EXIT="1"
export SYSTEMCTL_START_STATE="active"
echo "active" > "$SYSTEMCTL_STATE_FILE"
set +e
./update_cs2.sh > "$tmpdir/stdout" 2> "$tmpdir/stderr"
rc=$?
set -e
unset SYSTEMCTL_START_EXIT
[ "$rc" -ne 0 ] || fail "start failure after update: expected non-zero rc, got $rc"
assert_contains "Failed to start cs2.service after 1 attempts." "$(cat "$tmpdir/stdout")"
assert_contains "stop" "$(cat "$tmpdir/systemctl.calls")"
assert_contains "start" "$(cat "$tmpdir/systemctl.calls")"
assert_ordered_events "buildid read" "steamcmd app_info_print" "systemctl stop" "steamcmd app_update" "buildid read" "systemctl start"
pass

# Start returning success is not enough if the service is still inactive.
echo "==> start succeeds but service remains inactive"
rm -rf "$tmpdir/cs2" "$tmpdir/lock" "$tmpdir/log" "$tmpdir/systemctl.calls" "$tmpdir/systemctl.state" "$tmpdir/events"
setup_cs2_dir "100"
export LOCKDIR="$tmpdir/lock" LOGFILE="$tmpdir/log" CS2_DIR="$tmpdir/cs2"
export SERVICE_NAME="cs2.service" STEAMCMD="$PWD/tests/bin/steamcmd" CS2_APP_ID="730"
export REQUIRED_SPACE="1" MAX_ATTEMPTS="1" SLEEP_SECS="0" NO_SLEEP="1" ALLOW_NONROOT="1"
export CONFIG_FILE="" REMOTE_BUILDID="200" STEAMCMD_UPDATE_EXIT="0" STEAMCMD_UPDATE_BUILDID="200"
export SYSTEMCTL_CALLS_FILE="$tmpdir/systemctl.calls" SYSTEMCTL_STATE_FILE="$tmpdir/systemctl.state"
export UPDATER_EVENTS_FILE="$tmpdir/events"
export SYSTEMCTL_START_EXIT="0"
export SYSTEMCTL_START_STATE="inactive"
echo "active" > "$SYSTEMCTL_STATE_FILE"
set +e
./update_cs2.sh > "$tmpdir/stdout" 2> "$tmpdir/stderr"
rc=$?
set -e
unset SYSTEMCTL_START_EXIT SYSTEMCTL_START_STATE
[ "$rc" -ne 0 ] || fail "inactive after start: expected non-zero rc, got $rc"
assert_contains "start command succeeded but service is not active" "$(cat "$tmpdir/stdout")"
assert_not_contains "Update applied successfully" "$(cat "$tmpdir/stdout")"
assert_ordered_events "buildid read" "steamcmd app_info_print" "systemctl stop" "steamcmd app_update" "buildid read" "systemctl start" "systemctl is-active"
pass

# Validation: reject LOCKDIR with ..
run_validation_test "reject LOCKDIR with .." 1 "LOCKDIR must not contain" LOCKDIR="$tmpdir/../lock"

# Validation: reject non-numeric REQUIRED_SPACE
run_validation_test "reject REQUIRED_SPACE non-numeric" 1 "REQUIRED_SPACE must be" REQUIRED_SPACE="abc"

# Validation: reject MAX_ATTEMPTS=0
run_validation_test "reject MAX_ATTEMPTS=0" 1 "MAX_ATTEMPTS must be a positive integer" MAX_ATTEMPTS="0"

# Validation: reject MAX_ATTEMPTS > 100
run_validation_test "reject MAX_ATTEMPTS > 100" 1 "MAX_ATTEMPTS must be at most 100" MAX_ATTEMPTS="200"

# Validation: reject non-numeric CS2_APP_ID
run_validation_test "reject non-numeric CS2_APP_ID" 1 "CS2_APP_ID must be" CS2_APP_ID="abc"

# Validation: reject LOGFILE with ..
run_validation_test "reject LOGFILE with .." 1 "LOGFILE must not contain" LOGFILE="$tmpdir/../log"

# Validation: reject CS2_DIR with ..
run_validation_test "reject CS2_DIR with .." 1 "CS2_DIR must not contain" CS2_DIR="$tmpdir/../cs2"

# Validation: reject STEAMCMD with ..
run_validation_test "reject STEAMCMD with .." 1 "STEAMCMD must not contain" STEAMCMD="$tmpdir/../steamcmd"

# Validation: reject CONFIG_FILE with ..
echo "==> reject CONFIG_FILE with .."
set +e
CONFIG_FILE="$tmpdir/../conf" LOCKDIR="$tmpdir/lock" LOGFILE="$tmpdir/log" CS2_DIR="$tmpdir/cs2" \
    SERVICE_NAME="cs2.service" SLEEP_SECS="0" ALLOW_NONROOT="1" NO_SLEEP="1" \
    LOG_LEVEL="normal" DRY_RUN="0" \
    ./update_cs2.sh > "$tmpdir/stdout" 2> "$tmpdir/stderr"
rc=$?
set -e
[ "$rc" -eq 1 ] || fail "CONFIG_FILE ..: expected rc=1, got $rc"
assert_contains "must not contain '..'" "$(cat "$tmpdir/stdout" "$tmpdir/stderr")"
pass

# Disk space: insufficient space triggers error
echo "==> insufficient disk space"
rm -rf "$tmpdir/cs2" "$tmpdir/lock" "$tmpdir/log" "$tmpdir/systemctl.calls" "$tmpdir/systemctl.state"
setup_cs2_dir "100"
export LOCKDIR="$tmpdir/lock" LOGFILE="$tmpdir/log" CS2_DIR="$tmpdir/cs2"
export SERVICE_NAME="cs2.service" STEAMCMD="$PWD/tests/bin/steamcmd" CS2_APP_ID="730"
export REQUIRED_SPACE="999999999" MAX_ATTEMPTS="1" SLEEP_SECS="0" NO_SLEEP="1" ALLOW_NONROOT="1"
export CONFIG_FILE="" REMOTE_BUILDID="100" STEAMCMD_UPDATE_EXIT="0" STEAMCMD_APPINFO_EXIT="0" STEAMCMD_UPDATE_BUILDID="100"
export SYSTEMCTL_CALLS_FILE="$tmpdir/systemctl.calls" SYSTEMCTL_STATE_FILE="$tmpdir/systemctl.state"
export SYSTEMCTL_STOP_EXIT="0" SYSTEMCTL_START_EXIT="0" SYSTEMCTL_START_STATE="active"
export DF_AVAILABLE="100"
echo "active" > "$SYSTEMCTL_STATE_FILE"
set +e
./update_cs2.sh > "$tmpdir/stdout" 2> "$tmpdir/stderr"
rc=$?
set -e
unset DF_AVAILABLE
[ "$rc" -eq 1 ] || fail "disk space: expected rc=1, got $rc"
assert_contains "Not enough free disk space" "$(cat "$tmpdir/stdout" "$tmpdir/stderr")"
pass

# Stale lock without PID file recovery
prepare_stale_lock_no_pid() {
    mkdir -p "$tmpdir/lock"
}
run_lock_case "stale-lock-no-pid-recovery" "prepare_stale_lock_no_pid" 0 "Recovered stale lock (no PID file)"

# Config file: multi-key and comment stripping
echo "==> config file multi-key and comments"
rm -rf "$tmpdir/cs2" "$tmpdir/lock" "$tmpdir/log" "$tmpdir/systemctl.calls" "$tmpdir/systemctl.state"
setup_cs2_dir "100"
cat > "$tmpdir/multiconf" << 'CONFEOF'
# This is a comment
SLEEP_SECS=0
LOG_LEVEL=quiet
CONFEOF
export LOCKDIR="$tmpdir/lock" LOGFILE="$tmpdir/log" CS2_DIR="$tmpdir/cs2"
export SERVICE_NAME="cs2.service" STEAMCMD="$PWD/tests/bin/steamcmd" CS2_APP_ID="730"
export REQUIRED_SPACE="1" MAX_ATTEMPTS="1" NO_SLEEP="1" ALLOW_NONROOT="1"
export CONFIG_FILE="$tmpdir/multiconf" REMOTE_BUILDID="100" STEAMCMD_UPDATE_EXIT="0" STEAMCMD_APPINFO_EXIT="0" STEAMCMD_UPDATE_BUILDID="100"
export SYSTEMCTL_CALLS_FILE="$tmpdir/systemctl.calls" SYSTEMCTL_STATE_FILE="$tmpdir/systemctl.state"
export SYSTEMCTL_STOP_EXIT="0" SYSTEMCTL_START_EXIT="0" SYSTEMCTL_START_STATE="active"
echo "active" > "$SYSTEMCTL_STATE_FILE"
set +e
./update_cs2.sh > "$tmpdir/stdout" 2> "$tmpdir/stderr"
rc=$?
set -e
[ "$rc" -eq 0 ] || fail "config multi-key: expected rc=0, got $rc; stderr=$(cat "$tmpdir/stderr")"
pass

echo ""
echo "OK ($PASS_COUNT tests passed)"
