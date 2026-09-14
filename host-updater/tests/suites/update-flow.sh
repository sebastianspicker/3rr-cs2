#!/usr/bin/env bash
# Update and lock lifecycle scenarios in their established execution order.
# shellcheck disable=SC2154,SC2016 # sed patterns match literal parameter defaults.
run_update_flow_suite() {
    run_case "no-update" "100" "100" "0"
    run_case "no-log-fd-inheritance" "100" "100" "0"
    run_case "update-applied" "100" "200" "0"
    run_case "update-failed" "100" "200" "1"
    run_case "update-timeout" "100" "200" "0"
    run_case "stop-partial-failure" "100" "200" "0"
    run_case "stop-timeout-after-state-change" "100" "200" "0"
    run_case "signal-during-stop" "100" "200" "0"
    run_case "unknown-remote" "100" "" "0"
    run_case "no-update-service-inactive" "100" "100" "0" "inactive"
    run_lock_case "stale-lock-recovery" "prepare_stale_lock_with_dead_pid" 0 "Recovered stale lock and acquired a new lock."
    run_lock_case "live-lock-metadata-mismatch-fails-closed" "prepare_stale_lock_with_live_pid_mismatched_metadata" 1 "ownership metadata cannot be verified"
    [ -f "$tmpdir/lock/pid" ] || fail "live unverifiable lock must remain intact"
    assert_no_event "steamcmd app_info_print"
    assert_no_event "systemctl stop"
}

run_timeout_budget_contract_suite() {
    local steam_timeout systemctl_timeout attempts sleep_secs start_budget stop_budget
    steam_timeout=$(sed -n 's/^STEAMCMD_TIMEOUT_SECS="${STEAMCMD_TIMEOUT_SECS:-\([0-9]*\)}"/\1/p' 3rr-update.sh)
    systemctl_timeout=$(sed -n 's/^SYSTEMCTL_TIMEOUT_SECS="${SYSTEMCTL_TIMEOUT_SECS:-\([0-9]*\)}"/\1/p' 3rr-update.sh)
    attempts=$(sed -n 's/^MAX_ATTEMPTS="${MAX_ATTEMPTS:-\([0-9]*\)}"/\1/p' 3rr-update.sh)
    sleep_secs=$(sed -n 's/^SLEEP_SECS="${SLEEP_SECS:-\([0-9]*\)}"/\1/p' 3rr-update.sh)

    # Absolute configured ceiling includes both SteamCMD calls, a pre-stop
    # status check, every normal lifecycle retry, a failed start sequence,
    # cleanup restoration retries/status checks, and all retry sleeps.
    start_budget=$((2 * (steam_timeout + 10) + (1 + 5 * attempts) * (systemctl_timeout + 10) + (5 * (attempts - 1) + 1) * sleep_secs))
    [ "$start_budget" -eq 6325 ] || fail "default updater budget changed; recalculate the unit and documentation"
    [ "$start_budget" -lt $((120 * 60)) ] || fail "default updater budget exceeds TimeoutStartSec"

    # systemd may signal while one systemctl call is still inside its timeout;
    # cleanup can then consume a complete start/status restoration budget.
    stop_budget=$(((1 + 2 * attempts) * (systemctl_timeout + 10) + 2 * (attempts - 1) * sleep_secs))
    [ "$stop_budget" -eq 1140 ] || fail "default shutdown restoration budget changed; recalculate TimeoutStopSec"
    [ "$stop_budget" -lt $((20 * 60)) ] || fail "default restoration budget exceeds TimeoutStopSec"

    grep -Fq 'TimeoutStartSec=120min' ../deploy/systemd/3rr-update.service || fail "systemd start timeout does not match the documented budget"
    grep -Fq 'TimeoutStopSec=20min' ../deploy/systemd/3rr-update.service || fail "systemd stop timeout does not match the documented restoration budget"
    grep -Fq '6,325 seconds (105 minutes 25 seconds)' README.md || fail "README must document the default updater budget"
    grep -Fq '1,140 seconds (19 minutes)' README.md || fail "README must document the default restoration budget"
    pass
}
