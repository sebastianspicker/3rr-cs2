# shellcheck shell=bash
# shellcheck disable=SC2034 # Runtime state is consumed by the cleanup library.
# Disk, SteamCMD, and systemd operations for 3rr-update.

check_space() {
    local avail
    avail=$(df -Pk "$CS2_DIR" 2> /dev/null | awk 'NR==2 {print $4}')
    if [ -z "$avail" ]; then
        exit_with_error "Failed to determine free disk space for: $CS2_DIR"
    fi
    avail="${avail//[[:space:]]/}"
    if ! [[ "$avail" =~ ^[0-9]+$ ]]; then
        exit_with_error "Invalid disk space value from df: $avail"
    fi
    if [ "$avail" -lt "$REQUIRED_SPACE" ]; then
        exit_with_error "Not enough free disk space ($avail KB available, $REQUIRED_SPACE KB required)."
    fi
    log "Disk space check passed ($avail KB available)."
}

run_as_steam() {
    if [ "$ALLOW_NONROOT" = "1" ]; then
        "$@"
        return
    fi

    if [ "${EUID:-$(id -u)}" -eq 0 ]; then
        if command -v runuser > /dev/null 2>&1; then
            runuser -u steam -- "$@"
            return
        fi
        if command -v su > /dev/null 2>&1; then
            local cmd_str
            cmd_str=$(printf "%q " "$@")
            cmd_str="${cmd_str% }"
            su -s /bin/bash -c "$cmd_str" steam
            return
        fi
        if command -v sudo > /dev/null 2>&1; then
            sudo -u steam "$@"
            return
        fi
        exit_with_error "Cannot run SteamCMD as the 'steam' user: none of runuser, su, or sudo found in PATH."
    fi

    exit_with_error "Must run as root or set ALLOW_NONROOT=1 (cannot run as 'steam' user)."
}

run_steamcmd_with_timeout() {
    run_as_steam timeout --foreground --kill-after=10 "$STEAMCMD_TIMEOUT_SECS" "$@"
}

retry_systemctl() {
    local action
    action="$1"
    require_cmd systemctl

    local attempt
    for ((attempt = 1; attempt <= MAX_ATTEMPTS; attempt++)); do
        if systemctl "$action" "$SERVICE_NAME"; then
            return 0
        fi
        if [ "$attempt" -lt "$MAX_ATTEMPTS" ]; then
            log "Attempt ${attempt}/${MAX_ATTEMPTS}: systemctl $action failed, retrying in ${SLEEP_SECS}s..."
            sleep_s "$SLEEP_SECS"
        fi
    done

    return 1
}

wait_for_service_active() {
    local attempt
    require_cmd systemctl

    for ((attempt = 1; attempt <= MAX_ATTEMPTS; attempt++)); do
        if systemctl is-active --quiet "$SERVICE_NAME"; then
            return 0
        fi
        if [ "$attempt" -lt "$MAX_ATTEMPTS" ]; then
            log "Attempt ${attempt}/${MAX_ATTEMPTS}: $SERVICE_NAME is not active after start, retrying in ${SLEEP_SECS}s..."
            sleep_s "$SLEEP_SECS"
        fi
    done

    return 1
}

stop_service() {
    log "Stopping $SERVICE_NAME..."
    require_cmd systemctl
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        # Record restoration responsibility before stop: systemctl may change
        # service state even when its command ultimately returns non-zero.
        SERVICE_STOPPED_BY_UPDATER=1
    fi
    retry_systemctl stop || exit_with_error "Failed to stop $SERVICE_NAME after $MAX_ATTEMPTS attempts."
    log "$SERVICE_NAME stopped."
    sleep_s "$SLEEP_SECS"
}

run_update() {
    local update_ret
    TMP_UPDATE_OUTPUT=$(mktemp "${TMPDIR:-/tmp}/cs2_update.XXXXXX") || exit_with_error "Failed to create temporary file."
    log "Running SteamCMD update as 'steam' user..."
    update_ret=0
    run_steamcmd_with_timeout "$STEAMCMD" +login anonymous \
        +force_install_dir "$CS2_DIR" \
        +app_update "$CS2_APP_ID" validate +quit > "$TMP_UPDATE_OUTPUT" 2>&1 || update_ret=$?
    log "SteamCMD output:"
    log_multiline "steamcmd: " < "$TMP_UPDATE_OUTPUT"
    rm -f "$TMP_UPDATE_OUTPUT"
    TMP_UPDATE_OUTPUT=""
    if [ "$update_ret" -ne 0 ]; then
        if [ "$update_ret" -eq 124 ] || [ "$update_ret" -eq 137 ]; then
            exit_with_error "SteamCMD update timed out after ${STEAMCMD_TIMEOUT_SECS}s."
        fi
        exit_with_error "SteamCMD update failed."
    fi
}

read_buildid() {
    local manifest
    manifest="${CS2_DIR%/}/steamapps/appmanifest_${CS2_APP_ID}.acf"

    if [ ! -f "$manifest" ]; then
        printf ''
        return 0
    fi

    # ACF is key/value; trim key and value for robustness (whitespace, format variants).
    awk -F'"' '
        { gsub(/^[ \t]+|[ \t]+$/, "", $2); gsub(/^[ \t]+|[ \t]+$/, "", $4) }
        $2 == "buildid" && $4 != "" { print $4; exit }
    ' "$manifest" 2> /dev/null || log "WARNING: Failed to parse buildid from manifest: $manifest" >&2
}

get_remote_buildid() {
    local tmpfile buildid run_ret

    tmpfile=$(mktemp "${TMPDIR:-/tmp}/cs2_appinfo.XXXXXX") || {
        log "WARNING: mktemp failed; remote build status is unknown." >&2
        printf ''
        return 0
    }
    TMP_GET_REMOTE_BUILDID="$tmpfile"
    run_ret=0
    run_steamcmd_with_timeout "$STEAMCMD" +login anonymous +app_info_update 1 +app_info_print "$CS2_APP_ID" +quit > "$tmpfile" 2>&1 || run_ret=$?
    if [ "$run_ret" -ne 0 ]; then
        log "SteamCMD app_info_print failed; output:" >&2
        log_multiline "steamcmd: " < "$tmpfile" >&2
        rm -f "$tmpfile"
        TMP_GET_REMOTE_BUILDID=""
        printf ''
        return 0
    fi

    # Best-effort: find buildid of public branch; fallback to first "buildid" in output (parse from file to avoid large variable).
    buildid=$(
        awk -F'"' '
            /"branches"/ { in_branches=1 }
            in_branches && /"public"/ { in_public=1 }
            in_public && $2=="buildid" && $4 != "" { print $4; exit }
        ' "$tmpfile" 2> /dev/null
    )
    if [ -z "$buildid" ]; then
        buildid=$(awk -F'"' '$2=="buildid" && $4 != "" { print $4; exit }' "$tmpfile" 2> /dev/null)
    fi

    rm -f "$tmpfile"
    TMP_GET_REMOTE_BUILDID=""
    printf '%s' "$buildid"
}

determine_update_state() {
    local before remote
    before="$1"
    remote="$2"

    # Downtime is allowed only when both sides of the comparison are known.
    # Unknown remote status is a hard stop so transient SteamCMD/network issues
    # cannot trigger speculative service restarts.
    if [ -n "$before" ] && [ -n "$remote" ]; then
        if [ "$before" = "$remote" ]; then
            printf 'up-to-date'
        else
            printf 'update-required'
        fi
        return 0
    fi

    printf 'unknown-status'
}

determine_post_update_state() {
    local before remote after
    before="$1"
    remote="$2"
    after="$3"

    # SteamCMD can exit 0 without changing the installed build. Treat that as
    # failed convergence, not as a successful update.
    if [ -z "$after" ]; then
        printf 'update-failed'
        return 0
    fi
    if [ "$after" = "$before" ]; then
        printf 'no-change-after-update'
        return 0
    fi
    if [ -n "$remote" ] && [ "$after" != "$remote" ]; then
        printf 'update-failed'
        return 0
    fi

    printf 'update-applied'
}

start_service() {
    log "Starting $SERVICE_NAME..."
    retry_systemctl start || exit_with_error "Failed to start $SERVICE_NAME after $MAX_ATTEMPTS attempts."
    wait_for_service_active || exit_with_error "$SERVICE_NAME start command succeeded but service is not active after $MAX_ATTEMPTS checks."
    SERVICE_STOPPED_BY_UPDATER=0
    log "$SERVICE_NAME started and active."
}

ensure_service_running() {
    require_cmd systemctl
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        log "$SERVICE_NAME is already running."
    else
        log "$SERVICE_NAME is not running; starting..."
        start_service
    fi
}
