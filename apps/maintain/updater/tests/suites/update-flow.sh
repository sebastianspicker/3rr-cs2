#!/usr/bin/env bash
# Update and lock lifecycle scenarios in their established execution order.
# shellcheck disable=SC2154
run_update_flow_suite() {
    run_case "no-update" "100" "100" "0"
    run_case "no-log-fd-inheritance" "100" "100" "0"
    run_case "update-applied" "100" "200" "0"
    run_case "update-failed" "100" "200" "1"
    run_case "update-timeout" "100" "200" "0"
    run_case "stop-partial-failure" "100" "200" "0"
    run_case "signal-during-stop" "100" "200" "0"
    run_case "unknown-remote" "100" "" "0"
    run_case "no-update-service-inactive" "100" "100" "0" "inactive"
    run_lock_case "stale-lock-recovery" "prepare_stale_lock_with_dead_pid" 0 "Recovered stale lock and acquired a new lock."
    run_lock_case "live-lock-metadata-mismatch-fails-closed" "prepare_stale_lock_with_live_pid_mismatched_metadata" 1 "ownership metadata cannot be verified"
    [ -f "$tmpdir/lock/pid" ] || fail "live unverifiable lock must remain intact"
    assert_no_event "steamcmd app_info_print"
    assert_no_event "systemctl stop"
}
