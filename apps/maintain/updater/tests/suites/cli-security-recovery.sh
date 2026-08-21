#!/usr/bin/env bash
# CLI, security, recovery, and remaining validation scenarios in execution order.
# shellcheck disable=SC2154,SC2329
run_cli_security_recovery_suite() {
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
    ./3rr-update.sh --help > "$tmpdir/stdout" 2> "$tmpdir/stderr"
    rc=$?
    set -e
    [ "$rc" -eq 0 ] || fail "--help: expected rc=0, got $rc"
    assert_contains "Usage:" "$(cat "$tmpdir/stdout")"
    pass

    # CLI: --version
    echo "==> --version flag"
    set +e
    ./3rr-update.sh --version > "$tmpdir/stdout" 2> "$tmpdir/stderr"
    rc=$?
    set -e
    [ "$rc" -eq 0 ] || fail "--version: expected rc=0, got $rc"
    # Version output accepts a stable semantic version or a prerelease candidate.
    grep -qE '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$' "$tmpdir/stdout" || fail "--version: output is not a semantic version: $(cat "$tmpdir/stdout")"
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
    ./3rr-update.sh --status > "$tmpdir/stdout" 2> "$tmpdir/stderr"
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
    ./3rr-update.sh --status > "$tmpdir/stdout" 2> "$tmpdir/stderr"
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
    ./3rr-update.sh --status > "$tmpdir/stdout" 2> "$tmpdir/stderr"
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
    ./3rr-update.sh --status > "$tmpdir/stdout" 2> "$tmpdir/stderr"
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
    ./3rr-update.sh > "$tmpdir/stdout" 2> "$tmpdir/stderr"
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
    ./3rr-update.sh > "$tmpdir/stdout" 2> "$tmpdir/stderr"
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
    ./3rr-update.sh > "$tmpdir/stdout" 2> "$tmpdir/stderr"
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
        ./3rr-update.sh > "$tmpdir/stdout" 2> "$tmpdir/stderr"
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
    ./3rr-update.sh > "$tmpdir/stdout" 2> "$tmpdir/stderr"
    rc=$?
    set -e
    unset DF_AVAILABLE
    [ "$rc" -eq 1 ] || fail "disk space: expected rc=1, got $rc"
    assert_contains "Not enough free disk space" "$(cat "$tmpdir/stdout" "$tmpdir/stderr")"
    pass

    # Stale lock without PID file recovery
    prepare_stale_lock_no_pid() {
        # shellcheck disable=SC2317 # Invoked indirectly by run_lock_case.
        mkdir -p "$tmpdir/lock"
    }
    run_lock_case "lock-without-pid-fails-closed" "prepare_stale_lock_no_pid" 1 "refusing automatic recovery"
    [ -d "$tmpdir/lock" ] || fail "unverifiable lock directory must remain intact"

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
    ./3rr-update.sh > "$tmpdir/stdout" 2> "$tmpdir/stderr"
    rc=$?
    set -e
    [ "$rc" -eq 0 ] || fail "config multi-key: expected rc=0, got $rc; stderr=$(cat "$tmpdir/stderr")"
    pass
}
