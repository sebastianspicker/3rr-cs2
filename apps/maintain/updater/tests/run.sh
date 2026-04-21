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
    export NOTIFY_WEBHOOK_URL=""
    export REMOTE_BUILDID="100"
    export STEAMCMD_UPDATE_EXIT="0"
    export STEAMCMD_APPINFO_EXIT="0"
    export STEAMCMD_UPDATE_BUILDID="100"
    export STEAMCMD_CALLS_FILE="$tmpdir/steamcmd.calls"
    export SYSTEMCTL_CALLS_FILE="$tmpdir/systemctl.calls"
    export SYSTEMCTL_STATE_FILE="$tmpdir/systemctl.state"
    export SYSTEMCTL_STOP_EXIT="0"
    export SYSTEMCTL_START_EXIT="0"
    rm -rf "$tmpdir/cs2" "$tmpdir/lock" "$tmpdir/log" "$tmpdir/systemctl.calls" "$tmpdir/systemctl.state" "$tmpdir/steamcmd.calls"
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

# Create a mock curl for webhook tests.
cat > "$tmpdir/curl" << 'MOCKEOF'
#!/usr/bin/env bash
echo "$*" >> "${CURL_CALLS_FILE:-/dev/null}"
exit "${CURL_EXIT:-0}"
MOCKEOF
chmod +x "$tmpdir/curl"

# Create a mock rcon-cli for player notification tests.
cat > "$tmpdir/rcon-cli" << 'MOCKEOF'
#!/usr/bin/env bash
echo "$*" >> "${RCON_CALLS_FILE:-/dev/null}"
exit "${RCON_CLI_EXIT:-0}"
MOCKEOF
chmod +x "$tmpdir/rcon-cli"

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
    local name local_build remote_build update_exit initial_state rc calls stdout stderr
    name="$1"
    local_build="$2"
    remote_build="$3"
    update_exit="$4" # 0 or 1
    initial_state="${5:-active}"

    echo "==> $name"

    rm -rf "$tmpdir/cs2" "$tmpdir/lock" "$tmpdir/log" "$tmpdir/systemctl.calls" "$tmpdir/systemctl.state" "$tmpdir/steamcmd.calls"
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
    export SYSTEMCTL_STOP_EXIT="0"
    export SYSTEMCTL_START_EXIT="0"
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

    case "$name" in
        "no-update")
            [ "$rc" -eq 0 ] || fail "expected rc=0, got $rc; stderr=$stderr"
            assert_contains "No update required" "$stdout"
            assert_not_contains "stop" "$calls"
            assert_not_contains "start" "$calls"
            ;;
        "update-applied")
            [ "$rc" -eq 0 ] || fail "expected rc=0, got $rc; stderr=$stderr"
            assert_contains "Update required" "$stdout"
            assert_contains "Update applied successfully" "$stdout"
            assert_contains "stop" "$calls"
            assert_contains "start" "$calls"
            ;;
        "update-failed")
            [ "$rc" -ne 0 ] || fail "expected non-zero rc, got $rc"
            assert_contains "SteamCMD update failed" "$stdout"
            assert_contains "stop" "$calls"
            assert_contains "start" "$calls"
            ;;
        "unknown-remote")
            [ "$rc" -ne 0 ] || fail "expected non-zero rc, got $rc"
            assert_contains "refusing to stop the service while remote status is unknown" "$stdout"
            assert_not_contains "stop" "$calls"
            assert_not_contains "start" "$calls"
            assert_not_contains "+app_update" "$(cat "$tmpdir/steamcmd.calls" 2> /dev/null || true)"
            ;;
        "false-success-update")
            [ "$rc" -ne 0 ] || fail "expected non-zero rc, got $rc"
            assert_contains "buildid did not change after the update attempt" "$stdout"
            assert_contains "stop" "$calls"
            assert_contains "start" "$calls"
            ;;
        "start-failed-after-update")
            [ "$rc" -ne 0 ] || fail "expected non-zero rc, got $rc"
            assert_contains "Failed to start $SERVICE_NAME after $MAX_ATTEMPTS attempts." "$stdout"
            assert_contains "stop" "$calls"
            assert_contains "start" "$calls"
            ;;
        "no-update-service-inactive")
            [ "$rc" -eq 0 ] || fail "expected rc=0, got $rc; stderr=$stderr"
            assert_contains "No update required" "$stdout"
            assert_contains "not running; starting" "$stdout"
            assert_not_contains "stop" "$calls"
            assert_contains "start" "$calls"
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

    rm -rf "$tmpdir/cs2" "$tmpdir/lock" "$tmpdir/log" "$tmpdir/systemctl.calls" "$tmpdir/systemctl.state"
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
    export SYSTEMCTL_STOP_EXIT="0"
    export SYSTEMCTL_START_EXIT="0"
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

    rm -rf "$tmpdir/cs2" "$tmpdir/lock" "$tmpdir/log" "$tmpdir/systemctl.calls" "$tmpdir/systemctl.state"
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
    export SYSTEMCTL_STOP_EXIT="0"
    export SYSTEMCTL_START_EXIT="0"
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

# CLI --dry-run must win over config DRY_RUN=0 (safety).
cat > "$tmpdir/conf" << 'EOF'
DRY_RUN=0
EOF
run_with_args_case "dry-run CLI overrides config" 0 "--dry-run --config=$tmpdir/conf"
assert_contains "Dry run: skipping service stop, SteamCMD update, and service start." "$(cat "$tmpdir/stdout")"
assert_not_contains "stop" "$(cat "$tmpdir/systemctl.calls" 2> /dev/null || true)"
assert_not_contains "start" "$(cat "$tmpdir/systemctl.calls" 2> /dev/null || true)"

# Unknown options should fail fast to avoid silent misconfiguration.
run_with_args_case "reject unknown option" 1 "--does-not-exist"
assert_contains "Unknown option" "$(cat "$tmpdir/stdout" "$tmpdir/stderr")"

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
rm -rf "$tmpdir/cs2" "$tmpdir/lock" "$tmpdir/log" "$tmpdir/systemctl.calls" "$tmpdir/systemctl.state" "$tmpdir/steamcmd.calls"
setup_cs2_dir "100"
export LOCKDIR="$tmpdir/lock" LOGFILE="$tmpdir/log" CS2_DIR="$tmpdir/cs2"
export SERVICE_NAME="cs2.service" STEAMCMD="$PWD/tests/bin/steamcmd" CS2_APP_ID="730"
export REQUIRED_SPACE="1" MAX_ATTEMPTS="1" SLEEP_SECS="0" NO_SLEEP="1" ALLOW_NONROOT="1"
export CONFIG_FILE="" REMOTE_BUILDID="200" STEAMCMD_UPDATE_EXIT="0" STEAMCMD_UPDATE_BUILDID="100"
export SYSTEMCTL_CALLS_FILE="$tmpdir/systemctl.calls" SYSTEMCTL_STATE_FILE="$tmpdir/systemctl.state"
echo "active" > "$SYSTEMCTL_STATE_FILE"
set +e
./update_cs2.sh > "$tmpdir/stdout" 2> "$tmpdir/stderr"
rc=$?
set -e
[ "$rc" -ne 0 ] || fail "unchanged buildid: expected non-zero rc, got $rc"
assert_contains "buildid did not change after the update attempt" "$(cat "$tmpdir/stdout")"
assert_contains "stop" "$(cat "$tmpdir/systemctl.calls")"
assert_contains "start" "$(cat "$tmpdir/systemctl.calls")"
pass

# Start failure after an update attempt must fail the run.
echo "==> start failure after update"
rm -rf "$tmpdir/cs2" "$tmpdir/lock" "$tmpdir/log" "$tmpdir/systemctl.calls" "$tmpdir/systemctl.state"
setup_cs2_dir "100"
export LOCKDIR="$tmpdir/lock" LOGFILE="$tmpdir/log" CS2_DIR="$tmpdir/cs2"
export SERVICE_NAME="cs2.service" STEAMCMD="$PWD/tests/bin/steamcmd" CS2_APP_ID="730"
export REQUIRED_SPACE="1" MAX_ATTEMPTS="1" SLEEP_SECS="0" NO_SLEEP="1" ALLOW_NONROOT="1"
export CONFIG_FILE="" REMOTE_BUILDID="200" STEAMCMD_UPDATE_EXIT="0" STEAMCMD_UPDATE_BUILDID="200"
export SYSTEMCTL_CALLS_FILE="$tmpdir/systemctl.calls" SYSTEMCTL_STATE_FILE="$tmpdir/systemctl.state"
export SYSTEMCTL_START_EXIT="1"
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
export SYSTEMCTL_STOP_EXIT="0" SYSTEMCTL_START_EXIT="0"
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

# Webhook notification: successful notification with curl mock
echo "==> webhook notification"
rm -rf "$tmpdir/cs2" "$tmpdir/lock" "$tmpdir/log" "$tmpdir/systemctl.calls" "$tmpdir/systemctl.state" "$tmpdir/curl.calls"
setup_cs2_dir "100"
export LOCKDIR="$tmpdir/lock" LOGFILE="$tmpdir/log" CS2_DIR="$tmpdir/cs2"
export SERVICE_NAME="cs2.service" STEAMCMD="$PWD/tests/bin/steamcmd" CS2_APP_ID="730"
export REQUIRED_SPACE="1" MAX_ATTEMPTS="1" SLEEP_SECS="0" NO_SLEEP="1" ALLOW_NONROOT="1"
export CONFIG_FILE="" REMOTE_BUILDID="200" STEAMCMD_UPDATE_EXIT="0" STEAMCMD_APPINFO_EXIT="0" STEAMCMD_UPDATE_BUILDID="200"
export NOTIFY_WEBHOOK_URL="https://hooks.example.com/webhook"
export CURL_CALLS_FILE="$tmpdir/curl.calls" CURL_EXIT="0"
export SYSTEMCTL_CALLS_FILE="$tmpdir/systemctl.calls" SYSTEMCTL_STATE_FILE="$tmpdir/systemctl.state"
export SYSTEMCTL_STOP_EXIT="0" SYSTEMCTL_START_EXIT="0"
echo "active" > "$SYSTEMCTL_STATE_FILE"
set +e
./update_cs2.sh > "$tmpdir/stdout" 2> "$tmpdir/stderr"
rc=$?
set -e
unset NOTIFY_WEBHOOK_URL CURL_CALLS_FILE CURL_EXIT
[ "$rc" -eq 0 ] || fail "webhook: expected rc=0, got $rc; stderr=$(cat "$tmpdir/stderr")"
assert_contains "Webhook notification sent" "$(cat "$tmpdir/stdout")"
[ -f "$tmpdir/curl.calls" ] || fail "webhook: curl was not called"
pass

# Config file: multi-key and comment stripping
echo "==> config file multi-key and comments"
rm -rf "$tmpdir/cs2" "$tmpdir/lock" "$tmpdir/log" "$tmpdir/systemctl.calls" "$tmpdir/systemctl.state"
setup_cs2_dir "100"
cat > "$tmpdir/multiconf" << 'CONFEOF'
# This is a comment
SLEEP_SECS=0
LOG_LEVEL=quiet

# Non-whitelisted key should be ignored
BOGUS_KEY=evil
CONFEOF
export LOCKDIR="$tmpdir/lock" LOGFILE="$tmpdir/log" CS2_DIR="$tmpdir/cs2"
export SERVICE_NAME="cs2.service" STEAMCMD="$PWD/tests/bin/steamcmd" CS2_APP_ID="730"
export REQUIRED_SPACE="1" MAX_ATTEMPTS="1" NO_SLEEP="1" ALLOW_NONROOT="1"
export CONFIG_FILE="$tmpdir/multiconf" REMOTE_BUILDID="100" STEAMCMD_UPDATE_EXIT="0" STEAMCMD_APPINFO_EXIT="0" STEAMCMD_UPDATE_BUILDID="100"
export SYSTEMCTL_CALLS_FILE="$tmpdir/systemctl.calls" SYSTEMCTL_STATE_FILE="$tmpdir/systemctl.state"
export SYSTEMCTL_STOP_EXIT="0" SYSTEMCTL_START_EXIT="0"
echo "active" > "$SYSTEMCTL_STATE_FILE"
set +e
./update_cs2.sh > "$tmpdir/stdout" 2> "$tmpdir/stderr"
rc=$?
set -e
[ "$rc" -eq 0 ] || fail "config multi-key: expected rc=0, got $rc; stderr=$(cat "$tmpdir/stderr")"
pass

# Config file: quoted values may contain '#'.
echo "==> config file quoted values with hash"
rm -rf "$tmpdir/cs2" "$tmpdir/lock" "$tmpdir/log" "$tmpdir/systemctl.calls" "$tmpdir/systemctl.state" "$tmpdir/curl.calls"
setup_cs2_dir "100"
cat > "$tmpdir/hashconf" << 'CONFEOF'
SLEEP_SECS=0
NOTIFY_WEBHOOK_URL="https://hooks.example.com/webhook#fragment"
CONFEOF
export LOCKDIR="$tmpdir/lock" LOGFILE="$tmpdir/log" CS2_DIR="$tmpdir/cs2"
export SERVICE_NAME="cs2.service" STEAMCMD="$PWD/tests/bin/steamcmd" CS2_APP_ID="730"
export REQUIRED_SPACE="1" MAX_ATTEMPTS="1" NO_SLEEP="1" ALLOW_NONROOT="1"
export CONFIG_FILE="$tmpdir/hashconf" REMOTE_BUILDID="200" STEAMCMD_UPDATE_EXIT="0" STEAMCMD_APPINFO_EXIT="0" STEAMCMD_UPDATE_BUILDID="200"
export CURL_CALLS_FILE="$tmpdir/curl.calls" CURL_EXIT="0"
export SYSTEMCTL_CALLS_FILE="$tmpdir/systemctl.calls" SYSTEMCTL_STATE_FILE="$tmpdir/systemctl.state"
export SYSTEMCTL_STOP_EXIT="0" SYSTEMCTL_START_EXIT="0"
echo "active" > "$SYSTEMCTL_STATE_FILE"
set +e
./update_cs2.sh > "$tmpdir/stdout" 2> "$tmpdir/stderr"
rc=$?
set -e
[ "$rc" -eq 0 ] || fail "quoted hash config: expected rc=0, got $rc; stderr=$(cat "$tmpdir/stderr")"
assert_contains "https://hooks.example.com/webhook#fragment" "$(cat "$tmpdir/curl.calls")"
pass

# Notification: NOTIFY_PLAYERS_MESSAGE set and RCON succeeds → message sent, update proceeds.
echo "==> notification-sent"
rm -rf "$tmpdir/cs2" "$tmpdir/lock" "$tmpdir/log" "$tmpdir/systemctl.calls" "$tmpdir/systemctl.state" "$tmpdir/rcon.calls"
setup_cs2_dir "100"
export LOCKDIR="$tmpdir/lock" LOGFILE="$tmpdir/log" CS2_DIR="$tmpdir/cs2"
export SERVICE_NAME="cs2.service" STEAMCMD="$PWD/tests/bin/steamcmd" CS2_APP_ID="730"
export REQUIRED_SPACE="1" MAX_ATTEMPTS="1" NO_SLEEP="1" ALLOW_NONROOT="1"
export REMOTE_BUILDID="200" STEAMCMD_UPDATE_EXIT="0" STEAMCMD_APPINFO_EXIT="0" STEAMCMD_UPDATE_BUILDID="200"
export CURL_CALLS_FILE="$tmpdir/curl.calls" CURL_EXIT="0"
export SYSTEMCTL_CALLS_FILE="$tmpdir/systemctl.calls" SYSTEMCTL_STATE_FILE="$tmpdir/systemctl.state"
export SYSTEMCTL_STOP_EXIT="0" SYSTEMCTL_START_EXIT="0"
export NOTIFY_PLAYERS_MESSAGE="Server updating in 30 seconds"
export RCON_CLI="rcon-cli" RCON_HOST="127.0.0.1" RCON_PORT="27015" RCON_PASSWORD="test"
export RCON_CALLS_FILE="$tmpdir/rcon.calls" RCON_CLI_EXIT="0"
echo "active" > "$SYSTEMCTL_STATE_FILE"
set +e
./update_cs2.sh > "$tmpdir/stdout" 2> "$tmpdir/stderr"
rc=$?
set -e
[ "$rc" -eq 0 ] || fail "notification-sent: expected rc=0, got $rc; stderr=$(cat "$tmpdir/stderr")"
assert_contains "Player notification sent via RCON" "$(cat "$tmpdir/stdout" "$tmpdir/stderr")"
assert_contains "say Server updating in 30 seconds" "$(cat "$tmpdir/rcon.calls")"
pass

# Notification: NOTIFY_PLAYERS_MESSAGE set and RCON fails → warning logged, update still proceeds.
echo "==> notification-rcon-fail"
rm -rf "$tmpdir/cs2" "$tmpdir/lock" "$tmpdir/log" "$tmpdir/systemctl.calls" "$tmpdir/systemctl.state" "$tmpdir/rcon.calls"
setup_cs2_dir "100"
export LOCKDIR="$tmpdir/lock" LOGFILE="$tmpdir/log" CS2_DIR="$tmpdir/cs2"
export SERVICE_NAME="cs2.service" STEAMCMD="$PWD/tests/bin/steamcmd" CS2_APP_ID="730"
export REQUIRED_SPACE="1" MAX_ATTEMPTS="1" NO_SLEEP="1" ALLOW_NONROOT="1"
export REMOTE_BUILDID="200" STEAMCMD_UPDATE_EXIT="0" STEAMCMD_APPINFO_EXIT="0" STEAMCMD_UPDATE_BUILDID="200"
export CURL_CALLS_FILE="$tmpdir/curl.calls" CURL_EXIT="0"
export SYSTEMCTL_CALLS_FILE="$tmpdir/systemctl.calls" SYSTEMCTL_STATE_FILE="$tmpdir/systemctl.state"
export SYSTEMCTL_STOP_EXIT="0" SYSTEMCTL_START_EXIT="0"
export NOTIFY_PLAYERS_MESSAGE="Server updating soon"
export RCON_CLI="rcon-cli" RCON_HOST="127.0.0.1" RCON_PORT="27015" RCON_PASSWORD="test"
export RCON_CALLS_FILE="$tmpdir/rcon.calls" RCON_CLI_EXIT="1"
echo "active" > "$SYSTEMCTL_STATE_FILE"
set +e
./update_cs2.sh > "$tmpdir/stdout" 2> "$tmpdir/stderr"
rc=$?
set -e
[ "$rc" -eq 0 ] || fail "notification-rcon-fail: expected rc=0, got $rc; stderr=$(cat "$tmpdir/stderr")"
assert_contains "RCON notification failed" "$(cat "$tmpdir/stdout" "$tmpdir/stderr")"
pass

# Notification: NOTIFY_PLAYERS_MESSAGE empty → no rcon-cli call made.
echo "==> notification-disabled"
rm -rf "$tmpdir/cs2" "$tmpdir/lock" "$tmpdir/log" "$tmpdir/systemctl.calls" "$tmpdir/systemctl.state" "$tmpdir/rcon.calls"
setup_cs2_dir "100"
export LOCKDIR="$tmpdir/lock" LOGFILE="$tmpdir/log" CS2_DIR="$tmpdir/cs2"
export SERVICE_NAME="cs2.service" STEAMCMD="$PWD/tests/bin/steamcmd" CS2_APP_ID="730"
export REQUIRED_SPACE="1" MAX_ATTEMPTS="1" NO_SLEEP="1" ALLOW_NONROOT="1"
export REMOTE_BUILDID="200" STEAMCMD_UPDATE_EXIT="0" STEAMCMD_APPINFO_EXIT="0" STEAMCMD_UPDATE_BUILDID="200"
export CURL_CALLS_FILE="$tmpdir/curl.calls" CURL_EXIT="0"
export SYSTEMCTL_CALLS_FILE="$tmpdir/systemctl.calls" SYSTEMCTL_STATE_FILE="$tmpdir/systemctl.state"
export SYSTEMCTL_STOP_EXIT="0" SYSTEMCTL_START_EXIT="0"
unset NOTIFY_PLAYERS_MESSAGE
export RCON_CALLS_FILE="$tmpdir/rcon.calls" RCON_CLI_EXIT="0"
echo "active" > "$SYSTEMCTL_STATE_FILE"
set +e
./update_cs2.sh > "$tmpdir/stdout" 2> "$tmpdir/stderr"
rc=$?
set -e
[ "$rc" -eq 0 ] || fail "notification-disabled: expected rc=0, got $rc; stderr=$(cat "$tmpdir/stderr")"
[ ! -f "$tmpdir/rcon.calls" ] || [ ! -s "$tmpdir/rcon.calls" ] || fail "notification-disabled: rcon-cli was called but should not have been"
pass

echo ""
echo "OK ($PASS_COUNT tests passed)"
