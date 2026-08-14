# shellcheck shell=bash
# Runtime validation, logging, and cleanup helpers for 3rr-update.

log() {
    local ts level msg
    if [ "$LOG_LEVEL" = "quiet" ]; then
        case "$*" in
            ERROR:* | *ERROR* | WARNING:* | *WARNING*) ;;
            *) return 0 ;;
        esac
    fi
    ts=$(date +"%Y-%m-%d %H:%M:%S")
    level="INFO"
    case "$*" in
        ERROR:* | *ERROR*) level="ERROR" ;;
        WARNING:* | *WARNING*) level="WARN" ;;
    esac
    msg="[$ts] [$level] $*"

    # Always emit to stdout for journald/cron capture; best-effort append to logfile.
    printf '%s\n' "$msg"
    if [ "$LOGFILE_READY" -eq 1 ]; then
        printf '%s\n' "$msg" >> "$LOGFILE" 2> /dev/null || true
    fi
}

# Read from stdin to avoid ARG_MAX when logging large output (e.g. SteamCMD).
# Call only with stdin connected (e.g. log_multiline "prefix" < file or ... | log_multiline "prefix").
log_multiline() {
    local prefix line
    prefix="${1:-}"
    while IFS= read -r line || [ -n "$line" ]; do
        log "${prefix}${line}"
    done
}

warn_removed_config_keys() {
    local key
    for key in $REMOVED_CONFIG_KEYS; do
        log "WARNING: Config key $key is no longer supported and was ignored."
    done
}

require_root() {
    if [ "$ALLOW_NONROOT" = "1" ]; then
        return 0
    fi

    if [ "${EUID:-$(id -u)}" -ne 0 ]; then
        log "ERROR: This script must run as root. Use: sudo $0"
        exit 1
    fi
}

# Ensure the 'steam' user exists when we need to run commands as that user.
require_steam_user() {
    if [ "$ALLOW_NONROOT" = "1" ]; then
        return 0
    fi
    if ! id -u steam > /dev/null 2>&1; then
        exit_with_error "User 'steam' does not exist. Create it or set ALLOW_NONROOT=1 for testing."
    fi
}

require_cmd() {
    local cmd
    cmd="$1"
    command -v "$cmd" > /dev/null 2>&1 || exit_with_error "Missing required command: $cmd"
}

# Call after require_root so validation failures can use exit_with_error.
validate_lockdir_config() {
    if [ "$LOCKDIR" = "/" ] || [[ "$LOCKDIR" =~ ^/+$ ]]; then
        exit_with_error "LOCKDIR must not be root (/). Use a subdirectory, e.g. /tmp/3rr-update.lock"
    fi
    if [[ "$LOCKDIR" == *".."* ]]; then
        exit_with_error "LOCKDIR must not contain '..': $LOCKDIR"
    fi
    if [ -L "$LOCKDIR" ]; then
        exit_with_error "LOCKDIR must not be a symlink. Use a real directory: $LOCKDIR"
    fi
    if [ -e "$LOCKDIR" ] && [ ! -d "$LOCKDIR" ]; then
        exit_with_error "Lock path exists but is not a directory (stale file?). Remove it: $LOCKDIR"
    fi
}

validate_numeric_timing_config() {
    if ! [[ "$REQUIRED_SPACE" =~ ^[0-9]+$ ]]; then
        exit_with_error "REQUIRED_SPACE must be a non-negative integer (KB). Current: $REQUIRED_SPACE"
    fi
    if ! [[ "$MAX_ATTEMPTS" =~ ^[0-9]+$ ]] || [ "$MAX_ATTEMPTS" -lt 1 ]; then
        exit_with_error "MAX_ATTEMPTS must be a positive integer. Current: $MAX_ATTEMPTS"
    fi
    if ! [[ "$SLEEP_SECS" =~ ^[0-9]+$ ]] || [ "$SLEEP_SECS" -lt 0 ]; then
        exit_with_error "SLEEP_SECS must be a non-negative integer. Current: $SLEEP_SECS"
    fi
    if [ "$SLEEP_SECS" -gt 3600 ]; then
        exit_with_error "SLEEP_SECS must be at most 3600 (1 hour). Current: $SLEEP_SECS"
    fi
    if ! [[ "$STEAMCMD_TIMEOUT_SECS" =~ ^[0-9]+$ ]] || [ "$STEAMCMD_TIMEOUT_SECS" -lt 1 ]; then
        exit_with_error "STEAMCMD_TIMEOUT_SECS must be a positive integer. Current: $STEAMCMD_TIMEOUT_SECS"
    fi
    if [ "$STEAMCMD_TIMEOUT_SECS" -gt 86400 ]; then
        exit_with_error "STEAMCMD_TIMEOUT_SECS must be at most 86400 (24 hours). Current: $STEAMCMD_TIMEOUT_SECS"
    fi
    if [ "$MAX_ATTEMPTS" -gt 100 ]; then
        exit_with_error "MAX_ATTEMPTS must be at most 100. Current: $MAX_ATTEMPTS"
    fi
    if ! [[ "${CS2_APP_ID:-}" =~ ^[0-9]+$ ]]; then
        exit_with_error "CS2_APP_ID must be a numeric app id (e.g. 730). Current: $CS2_APP_ID"
    fi
}

validate_mode_config() {
    case "${LOG_LEVEL:-}" in
        quiet | normal) ;;
        *) exit_with_error "LOG_LEVEL must be one of: quiet, normal. Current: $LOG_LEVEL" ;;
    esac
    if ! [[ "${ALLOW_NONROOT:-}" =~ ^[01]$ ]]; then
        exit_with_error "ALLOW_NONROOT must be 0 or 1. Current: $ALLOW_NONROOT"
    fi
    if ! [[ "${NO_SLEEP:-}" =~ ^[01]$ ]]; then
        exit_with_error "NO_SLEEP must be 0 or 1. Current: $NO_SLEEP"
    fi
    if ! [[ "${DRY_RUN:-}" =~ ^[01]$ ]]; then
        exit_with_error "DRY_RUN must be 0 or 1. Current: $DRY_RUN"
    fi
}

validate_logfile_config() {
    if [ "$LOGFILE" = "/" ] || [[ "$LOGFILE" =~ ^/+$ ]]; then
        exit_with_error "LOGFILE must not be root (/). Use a file path, e.g. /var/log/3rr/update.log"
    fi
    if [[ "$LOGFILE" == *".."* ]]; then
        exit_with_error "LOGFILE must not contain '..': $LOGFILE"
    fi
    if [ -L "$LOGFILE" ]; then
        exit_with_error "LOGFILE must not be a symlink: $LOGFILE"
    fi
    if [ -e "$LOGFILE" ] && [ ! -f "$LOGFILE" ]; then
        exit_with_error "LOGFILE must be a regular file path: $LOGFILE"
    fi
}

validate_runtime_path_config() {
    # Prefer a user or log directory; avoid system paths (e.g. under /etc).
    if [[ "${CS2_DIR:-}" == *".."* ]]; then
        exit_with_error "CS2_DIR must not contain '..': $CS2_DIR"
    fi
    if [ -z "${SERVICE_NAME:-}" ]; then
        exit_with_error "SERVICE_NAME must not be empty."
    fi
    # systemd unit names: alphanumeric, dot, hyphen, underscore, @
    if ! [[ "${SERVICE_NAME}" =~ ^[a-zA-Z0-9_.@-]+$ ]]; then
        exit_with_error "SERVICE_NAME must contain only safe unit name characters [a-zA-Z0-9_.@-]. Current: $SERVICE_NAME"
    fi
    if [[ "${STEAMCMD:-}" == *".."* ]]; then
        exit_with_error "STEAMCMD must not contain '..': $STEAMCMD"
    fi
}

# Validate numeric config and LOCKDIR; call after require_root so we can exit_with_error.
validate_config() {
    validate_lockdir_config
    validate_numeric_timing_config
    validate_mode_config
    validate_logfile_config
    validate_runtime_path_config
}

path_mode() {
    local path mode
    path="$1"
    mode=$(stat -c '%a' "$path" 2> /dev/null || true)
    if [ -n "$mode" ]; then
        printf '%s' "$mode"
        return 0
    fi
    mode=$(stat -f '%Lp' "$path" 2> /dev/null || true)
    printf '%s' "$mode"
}

path_owner_uid() {
    local path owner
    path="$1"
    owner=""
    owner=$(stat -c '%u' "$path" 2> /dev/null || true)
    if [ -n "$owner" ]; then
        printf '%s' "$owner"
        return 0
    fi
    owner=$(stat -f '%u' "$path" 2> /dev/null || true)
    if [ -n "$owner" ]; then
        printf '%s' "$owner"
        return 0
    fi
    printf ''
}

require_secure_log_path() {
    local path kind owner_uid current_uid mode mode_value
    path="$1"
    kind="$2"
    current_uid="${EUID:-$(id -u)}"

    if [ -L "$path" ]; then
        exit_with_error "$kind must not be a symlink: $path"
    fi
    owner_uid="$(path_owner_uid "$path")"
    if [ -z "$owner_uid" ] || [ "$owner_uid" != "$current_uid" ]; then
        exit_with_error "$kind must be owned by uid $current_uid: $path"
    fi
    mode="$(path_mode "$path")"
    if ! [[ "$mode" =~ ^[0-7]+$ ]]; then
        exit_with_error "Failed to inspect permissions for $kind: $path"
    fi
    mode_value=$((0$mode))
    if [ "$((mode_value & 0022))" -ne 0 ]; then
        exit_with_error "$kind must not be group- or world-writable: $path"
    fi
}

require_secure_log_ancestors() {
    local child ancestor owner_uid child_owner_uid current_uid mode mode_value
    child="$1"
    ancestor=$(dirname "$child")
    current_uid="${EUID:-$(id -u)}"

    while [ "$ancestor" != "$child" ]; do
        if [ -L "$ancestor" ]; then
            exit_with_error "Log path ancestor must not be a symlink: $ancestor"
        fi
        owner_uid="$(path_owner_uid "$ancestor")"
        if [ -z "$owner_uid" ] || { [ "$owner_uid" != "0" ] && [ "$owner_uid" != "$current_uid" ]; }; then
            exit_with_error "Log path ancestor must be owned by root or uid $current_uid: $ancestor"
        fi
        mode="$(path_mode "$ancestor")"
        if ! [[ "$mode" =~ ^[0-7]+$ ]]; then
            exit_with_error "Failed to inspect permissions for log path ancestor: $ancestor"
        fi
        mode_value=$((0$mode))
        if [ "$((mode_value & 0022))" -ne 0 ]; then
            if [ "$((mode_value & 01000))" -eq 0 ]; then
                exit_with_error "Log path ancestor must not be group- or world-writable: $ancestor"
            fi
            child_owner_uid="$(path_owner_uid "$child")"
            if [ -z "$child_owner_uid" ] || { [ "$child_owner_uid" != "0" ] && [ "$child_owner_uid" != "$current_uid" ]; }; then
                exit_with_error "Sticky log path ancestor does not protect its child: $ancestor"
            fi
        fi
        child="$ancestor"
        ancestor=$(dirname "$child")
    done
}

ensure_logfile_writable() {
    local logdir parent
    logdir=$(dirname "$LOGFILE")
    if [ ! -d "$logdir" ]; then
        parent=$(dirname "$logdir")
        if [ ! -d "$parent" ]; then
            exit_with_error "Log directory parent does not exist: $parent"
        fi
        require_secure_log_path "$parent" "Log directory parent"
        require_secure_log_ancestors "$parent"
        mkdir "$logdir" || exit_with_error "Failed to create log directory: $logdir"
        chmod 0750 "$logdir" || exit_with_error "Failed to secure log directory: $logdir"
    fi
    require_secure_log_path "$logdir" "Log directory"
    require_secure_log_ancestors "$logdir"

    if [ ! -e "$LOGFILE" ]; then
        (umask 027 && set -o noclobber && : > "$LOGFILE") 2> /dev/null \
            || exit_with_error "Failed to create log file safely: $LOGFILE"
        chmod 0640 "$LOGFILE" || exit_with_error "Failed to secure log file: $LOGFILE"
    fi
    if [ ! -f "$LOGFILE" ]; then
        exit_with_error "LOGFILE must be a regular file path: $LOGFILE"
    fi
    require_secure_log_path "$LOGFILE" "Log file"

    : >> "$LOGFILE" || exit_with_error "Log file is not writable: $LOGFILE"
    LOGFILE_READY=1
}

sleep_s() {
    local secs
    secs="$1"

    if [ "$NO_SLEEP" = "1" ]; then
        return 0
    fi

    sleep "$secs"
}

exit_with_error() {
    log "ERROR: $*"
    cleanup
    exit 1
}

restore_service_if_needed() {
    if [ "$SERVICE_STOPPED_BY_UPDATER" -ne 1 ]; then
        return 0
    fi

    # Clear first so repeated EXIT/signal cleanup cannot start the service twice.
    SERVICE_STOPPED_BY_UPDATER=0
    log "Restoring $SERVICE_NAME before updater exit..."
    if ! command -v systemctl > /dev/null 2>&1; then
        log "ERROR: Cannot restore $SERVICE_NAME because systemctl is unavailable."
        return 1
    fi
    if retry_systemctl start && wait_for_service_active; then
        log "$SERVICE_NAME restoration confirmed active."
        return 0
    fi

    log "ERROR: Failed to restore $SERVICE_NAME before updater exit."
    return 1
}

remove_update_output_temp() {
    if [ -n "$TMP_UPDATE_OUTPUT" ] && [ -f "$TMP_UPDATE_OUTPUT" ]; then
        rm -f "$TMP_UPDATE_OUTPUT"
        TMP_UPDATE_OUTPUT=""
    fi
}

remove_remote_buildid_temp() {
    if [ -n "$TMP_GET_REMOTE_BUILDID" ] && [ -f "$TMP_GET_REMOTE_BUILDID" ]; then
        rm -f "$TMP_GET_REMOTE_BUILDID"
        TMP_GET_REMOTE_BUILDID=""
    fi
}

remove_lock_metadata() {
    if [ -n "$LOCK_PID_FILE" ] && [ -f "$LOCK_PID_FILE" ]; then
        rm -f "$LOCK_PID_FILE" 2> /dev/null || true
        LOCK_PID_FILE=""
    fi
    if [ -n "$LOCK_META_FILE" ] && [ -f "$LOCK_META_FILE" ]; then
        rm -f "$LOCK_META_FILE" 2> /dev/null || true
        LOCK_META_FILE=""
    fi
}

release_cleanup_lock() {
    # Use a safe prefix for temp file removal if needed or just handle registered ones.
    # Remove the lock dir only if we created it and it is not a symlink (safety). Idempotent: run once.
    if [ "$CLEANUP_ENABLED" -eq 1 ] && [ -d "$LOCKDIR" ] && [ ! -L "$LOCKDIR" ]; then
        if rmdir "$LOCKDIR" 2> /dev/null; then
            log "Lock removed."
        else
            log "WARNING: Could not remove lock directory (non-empty?). Remove manually if needed: $LOCKDIR"
        fi
        CLEANUP_ENABLED=0
    fi
}

cleanup() {
    if [ "$CLEANUP_RUNNING" -eq 1 ]; then
        return 0
    fi
    CLEANUP_RUNNING=1

    # Restore availability before releasing the single-updater lock.
    restore_service_if_needed || true
    remove_update_output_temp
    remove_remote_buildid_temp
    remove_lock_metadata
    release_cleanup_lock
    CLEANUP_RUNNING=0
}
