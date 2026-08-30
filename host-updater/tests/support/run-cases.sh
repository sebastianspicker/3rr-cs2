#!/usr/bin/env bash
# Shared scenario setup, execution, and assertion helpers.
# shellcheck disable=SC2154
# Run script, assert exit code and that combined output contains needle. Pass env overrides as KEY=val.
# Baseline env is reset each time so tests do not inherit from previous runs.
run_validation_test() {
    local name expected_rc needle pair key val rc
    name="$1"
    expected_rc="$2"
    needle="$3"
    shift 3
    # Reset the baseline for each case so environment leakage cannot mask a regression.
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
    export STEAMCMD_TIMEOUT_SECS="1800"
    export TIMEOUT_FORCE_APP_UPDATE="0"
    export STEAMCMD_CALLS_FILE="$tmpdir/steamcmd.calls"
    export STEAMCMD_FD_PROBE_FILE=""
    export SYSTEMCTL_CALLS_FILE="$tmpdir/systemctl.calls"
    export SYSTEMCTL_STATE_FILE="$tmpdir/systemctl.state"
    export UPDATER_EVENTS_FILE="$tmpdir/events"
    export SYSTEMCTL_STOP_EXIT="0"
    export SYSTEMCTL_STOP_CHANGES_STATE="0"
    export SYSTEMCTL_SIGNAL_DURING_STOP=""
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
    ./3rr-update.sh > "$tmpdir/stdout" 2> "$tmpdir/stderr"
    rc=$?
    set -e
    [ "$rc" -eq "$expected_rc" ] || fail "expected rc=$expected_rc, got $rc; stderr=$(cat "$tmpdir/stderr")"
    assert_contains "$needle" "$(cat "$tmpdir/stdout" "$tmpdir/stderr")"
    pass
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
    export STEAMCMD_TIMEOUT_SECS="1800"
    export TIMEOUT_FORCE_APP_UPDATE="0"
    if [ "$name" = "update-timeout" ]; then
        export TIMEOUT_FORCE_APP_UPDATE="1"
    fi
    export STEAMCMD_CALLS_FILE="$tmpdir/steamcmd.calls"
    export STEAMCMD_FD_PROBE_FILE=""
    if [ "$name" = "no-log-fd-inheritance" ]; then
        export STEAMCMD_FD_PROBE_FILE="$tmpdir/steamcmd-fd-probe"
    fi

    export SYSTEMCTL_CALLS_FILE="$tmpdir/systemctl.calls"
    export SYSTEMCTL_STATE_FILE="$tmpdir/systemctl.state"
    export UPDATER_EVENTS_FILE="$tmpdir/events"
    export SYSTEMCTL_STOP_EXIT="0"
    export SYSTEMCTL_STOP_CHANGES_STATE="0"
    export SYSTEMCTL_SIGNAL_DURING_STOP=""
    export SYSTEMCTL_START_EXIT="0"
    export SYSTEMCTL_START_STATE="active"
    if [ "$name" = "stop-partial-failure" ]; then
        export SYSTEMCTL_STOP_EXIT="1"
        export SYSTEMCTL_STOP_CHANGES_STATE="1"
    fi
    if [ "$name" = "signal-during-stop" ]; then
        export SYSTEMCTL_SIGNAL_DURING_STOP="TERM"
    fi
    unset_removed_config_env
    echo "$initial_state" > "$SYSTEMCTL_STATE_FILE"

    set +e
    ./3rr-update.sh > "$tmpdir/stdout" 2> "$tmpdir/stderr"
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
        "no-log-fd-inheritance")
            [ "$rc" -eq 0 ] || fail "expected rc=0, got $rc; stderr=$stderr"
            assert_contains "No update required" "$stdout"
            [ "$(cat "$STEAMCMD_FD_PROBE_FILE")" = "closed" ] || fail "SteamCMD inherited writable fd 3"
            assert_not_contains "UNTRUSTED_FD3_WRITE" "$(cat "$LOGFILE")"
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
            [ "$(grep -c '^start$' "$SYSTEMCTL_CALLS_FILE")" -eq 1 ] || fail "failed update must restore the service exactly once"
            ;;
        "update-timeout")
            [ "$rc" -ne 0 ] || fail "expected timeout to fail"
            assert_contains "SteamCMD update timed out" "$stdout"
            assert_ordered_events "buildid read" "steamcmd app_info_print" "systemctl stop" "steamcmd app_update" "systemctl start" "systemctl is-active"
            assert_contains "active" "$(cat "$SYSTEMCTL_STATE_FILE")"
            [ "$(grep -c '^start$' "$SYSTEMCTL_CALLS_FILE")" -eq 1 ] || fail "timeout recovery must start the service exactly once"
            ;;
        "stop-partial-failure")
            [ "$rc" -ne 0 ] || fail "expected partial stop failure to fail"
            assert_contains "Failed to stop $SERVICE_NAME" "$stdout"
            assert_contains "active" "$(cat "$SYSTEMCTL_STATE_FILE")"
            assert_ordered_events "systemctl is-active" "systemctl stop" "systemctl start" "systemctl is-active"
            assert_no_event "steamcmd app_update"
            [ "$(grep -c '^start$' "$SYSTEMCTL_CALLS_FILE")" -eq 1 ] || fail "partial stop failure must restore the service exactly once"
            ;;
        "signal-during-stop")
            [ "$rc" -eq 143 ] || fail "expected SIGTERM exit 143, got $rc"
            assert_contains "Received TERM" "$stdout"
            assert_contains "active" "$(cat "$SYSTEMCTL_STATE_FILE")"
            assert_ordered_events "systemctl is-active" "systemctl stop" "systemctl start" "systemctl is-active"
            assert_no_event "steamcmd app_update"
            [ "$(grep -c '^start$' "$SYSTEMCTL_CALLS_FILE")" -eq 1 ] || fail "signal cleanup must restore the service exactly once"
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
    export STEAMCMD_TIMEOUT_SECS="1800"
    export TIMEOUT_FORCE_APP_UPDATE="0"
    export STEAMCMD_CALLS_FILE="$tmpdir/steamcmd.calls"
    export STEAMCMD_FD_PROBE_FILE=""
    export SYSTEMCTL_CALLS_FILE="$tmpdir/systemctl.calls"
    export SYSTEMCTL_STATE_FILE="$tmpdir/systemctl.state"
    export UPDATER_EVENTS_FILE="$tmpdir/events"
    export SYSTEMCTL_STOP_EXIT="0"
    export SYSTEMCTL_STOP_CHANGES_STATE="0"
    export SYSTEMCTL_SIGNAL_DURING_STOP=""
    export SYSTEMCTL_START_EXIT="0"
    export SYSTEMCTL_START_STATE="active"
    unset_removed_config_env
    echo "$initial_state" > "$SYSTEMCTL_STATE_FILE"

    set +e
    # shellcheck disable=SC2086
    ./3rr-update.sh $args > "$tmpdir/stdout" 2> "$tmpdir/stderr"
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
    export STEAMCMD_TIMEOUT_SECS="1800"
    export TIMEOUT_FORCE_APP_UPDATE="0"
    export STEAMCMD_FD_PROBE_FILE=""
    export STEAMCMD_CALLS_FILE="$tmpdir/steamcmd.calls"
    export SYSTEMCTL_CALLS_FILE="$tmpdir/systemctl.calls"
    export SYSTEMCTL_STATE_FILE="$tmpdir/systemctl.state"
    export UPDATER_EVENTS_FILE="$tmpdir/events"
    export SYSTEMCTL_STOP_EXIT="0"
    export SYSTEMCTL_STOP_CHANGES_STATE="0"
    export SYSTEMCTL_SIGNAL_DURING_STOP=""
    export SYSTEMCTL_START_EXIT="0"
    export SYSTEMCTL_START_STATE="active"
    unset_removed_config_env
    echo "active" > "$SYSTEMCTL_STATE_FILE"

    "$prepare_fn"

    set +e
    ./3rr-update.sh > "$tmpdir/stdout" 2> "$tmpdir/stderr"
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
script=$PWD/3rr-update.sh
EOF
}
