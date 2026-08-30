#!/usr/bin/env bash
# Assertion primitives shared by updater scenario suites.
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
