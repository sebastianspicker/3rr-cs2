# shellcheck shell=bash
# shellcheck disable=SC2034 # Cleanup state is consumed by the runtime library.
# Atomic updater lock helpers for 3rr-update.

# Call validate_config before this so LOCKDIR is not a file/symlink.
pid_exists() {
    local pid
    pid="$1"
    kill -0 "$pid" 2> /dev/null || ps -p "$pid" > /dev/null 2>&1
}

# A lock directory without a PID file younger than this may belong to a run that
# is still acquiring it; an older one is left over from a crash.
LOCK_PIDLESS_STALE_SECS=60

write_lock_pid() {
    LOCK_PID_FILE="${LOCKDIR%/}/pid"
    LOCK_PID_TMP="${LOCKDIR%/}/pid.tmp.$$"
    # Write to a temp file and rename so the PID file is never empty or partial.
    printf '%s\n' "$$" > "$LOCK_PID_TMP" || exit_with_error "Failed to write lock PID file: $LOCK_PID_TMP"
    mv -f "$LOCK_PID_TMP" "$LOCK_PID_FILE" || exit_with_error "Failed to publish lock PID file: $LOCK_PID_FILE"
    LOCK_PID_TMP=""
}

process_start_time() {
    local pid started
    pid="$1"
    started=$(ps -o lstart= -p "$pid" 2> /dev/null | awk '{$1=$1; print}')
    printf '%s' "$started"
}

write_lock_metadata() {
    local started script_path
    started="$(process_start_time "$$")"
    script_path="${SCRIPT_DIR}/$(basename -- "$0")"
    LOCK_META_FILE="${LOCKDIR%/}/meta"
    {
        printf 'pid=%s\n' "$$"
        printf 'started=%s\n' "$started"
        printf 'script=%s\n' "$script_path"
    } > "$LOCK_META_FILE" || exit_with_error "Failed to write lock metadata file: $LOCK_META_FILE"
}

read_lock_metadata() {
    local meta_file key val
    meta_file="$1"
    LOCK_META_PID=""
    LOCK_META_STARTED=""
    LOCK_META_SCRIPT=""
    [ -f "$meta_file" ] || return 1
    while IFS='=' read -r key val; do
        case "$key" in
            pid) LOCK_META_PID="$val" ;;
            started) LOCK_META_STARTED="$val" ;;
            script) LOCK_META_SCRIPT="$val" ;;
        esac
    done < "$meta_file"
    return 0
}

lock_matches_running_process() {
    local pid meta_file live_started script_path
    pid="$1"
    meta_file="$2"
    script_path="${SCRIPT_DIR}/$(basename -- "$0")"

    if ! read_lock_metadata "$meta_file"; then
        return 1
    fi

    live_started="$(process_start_time "$pid")"
    [ -n "$live_started" ] || return 1
    [ "$LOCK_META_PID" = "$pid" ] || return 1
    [ "$LOCK_META_STARTED" = "$live_started" ] || return 1
    [ "$LOCK_META_SCRIPT" = "$script_path" ] || return 1
}

acquire_lock() {
    mkdir "$LOCKDIR" 2> /dev/null || return 1
    CLEANUP_ENABLED=1
    write_lock_pid
    write_lock_metadata
}

refuse_untrusted_lock_owner() {
    local owner_uid current_uid
    current_uid="$1"
    owner_uid="$(path_owner_uid "$LOCKDIR")"
    if [ -n "$owner_uid" ] && [ "$owner_uid" != "$current_uid" ]; then
        exit_with_error "Lock directory exists but is owned by uid $owner_uid (current uid $current_uid). Refusing to trust it: $LOCKDIR"
    fi
}

read_lock_pid() {
    awk 'NR==1{print; exit}' "$1" 2> /dev/null || true
}

exit_for_live_lock() {
    local lock_pid lock_meta_file
    lock_pid="$1"
    lock_meta_file="$2"

    if [ -f "$lock_meta_file" ]; then
        if lock_matches_running_process "$lock_pid" "$lock_meta_file"; then
            log "An update process is already running (lock: $LOCKDIR, pid: $lock_pid). Exiting."
            exit 0
        fi
        exit_with_error "Lock references live pid $lock_pid but ownership metadata cannot be verified; refusing automatic recovery: $LOCKDIR"
    fi

    exit_with_error "Lock references live pid $lock_pid but metadata is missing; refusing automatic recovery: $LOCKDIR"
}

# Remove only the files this updater creates, then the directory itself. Never recursive.
clear_lock_dir() {
    rm -f "${LOCKDIR%/}/pid" "${LOCKDIR%/}/meta" "${LOCKDIR%/}"/pid.tmp.* 2> /dev/null || return 1
    rmdir "$LOCKDIR" 2> /dev/null
}

recover_stale_lock() {
    local lock_pid
    lock_pid="$1"

    log "WARNING: Stale lock detected (pid $lock_pid not running). Attempting recovery..."
    if clear_lock_dir; then
        if acquire_lock; then
            log "Recovered stale lock and acquired a new lock."
            return 0
        fi
        exit_with_error "Recovered stale lock but failed to re-acquire lock: $LOCKDIR"
    fi

    exit_with_error "Stale lock detected but lock directory is not empty; remove manually: $LOCKDIR"
}

# A crash between mkdir and the PID rename leaves a lock without a PID file.
recover_pidless_lock() {
    local mtime now age
    mtime="$(path_mtime "$LOCKDIR")"
    now="$(date +%s)"
    if ! [[ "$mtime" =~ ^[0-9]+$ ]]; then
        exit_with_error "Lock directory exists without PID file and its age is unknown; refusing automatic recovery: $LOCKDIR"
    fi
    age=$((now - mtime))
    if [ "$age" -le "$LOCK_PIDLESS_STALE_SECS" ]; then
        exit_with_error "Lock directory exists without PID file (${age}s old, may still be starting); refusing automatic recovery: $LOCKDIR"
    fi

    log "WARNING: Stale lock detected (no PID file, ${age}s old). Attempting recovery..."
    if clear_lock_dir; then
        if acquire_lock; then
            log "Recovered stale lock and acquired a new lock."
            return 0
        fi
        exit_with_error "Recovered stale lock but failed to re-acquire lock: $LOCKDIR"
    fi

    exit_with_error "Stale lock has unexpected contents; remove manually: $LOCKDIR"
}

handle_existing_lock() {
    local current_uid lock_pid_file lock_pid lock_meta_file
    current_uid="$1"
    refuse_untrusted_lock_owner "$current_uid"

    lock_pid_file="${LOCKDIR%/}/pid"
    lock_meta_file="${LOCKDIR%/}/meta"
    if [ ! -f "$lock_pid_file" ]; then
        recover_pidless_lock
        return 0
    fi

    lock_pid="$(read_lock_pid "$lock_pid_file")"
    lock_pid="${lock_pid//[[:space:]]/}"
    if ! [[ "$lock_pid" =~ ^[0-9]+$ ]]; then
        exit_with_error "Lock PID is missing or invalid; refusing automatic recovery: $LOCKDIR"
    fi

    if pid_exists "$lock_pid"; then
        exit_for_live_lock "$lock_pid" "$lock_meta_file"
    fi

    recover_stale_lock "$lock_pid"
}

init_lock() {
    local current_uid
    current_uid="${EUID:-$(id -u)}"

    # mkdir is atomic; avoids races when two instances start simultaneously.
    if acquire_lock; then
        log "Lock acquired."
        return 0
    fi

    [ -d "$LOCKDIR" ] || exit_with_error "Failed to create lock directory: $LOCKDIR"
    handle_existing_lock "$current_uid"
}
