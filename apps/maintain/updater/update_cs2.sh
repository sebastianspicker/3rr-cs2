#!/bin/bash
# update_cs2.sh - Updates the CS2 Dedicated Server and restarts it if an update is applied.
#
# Modularized and hardened:
#   - Update detection via SteamCMD + optional buildid compare
#   - Atomic lock directory with controlled cleanup via trap
#   - Functions for each logical step
#   - SteamCMD run as 'steam' user under root cron
#   - Robust logging and error handling
#
# Usage:
#   Run as root (e.g., via cron) so no sudo prompts are needed.
#   Configure the variables below to match your environment.
#   For testing: ALLOW_NONROOT=1 (run as current user), NO_SLEEP=1 (skip sleep between retries).

set -euo pipefail

# Cron can provide a minimal PATH; keep common locations available.
PATH="${PATH:-/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin}:/usr/games"
export PATH

# Version (match CHANGELOG)
VERSION="1.8.0"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Parse arguments (before loading config so --dry-run/--config can be set)
DRY_RUN="${DRY_RUN:-0}"
CLI_DRY_RUN_SET=0
STATUS_ONLY=0
CONFIG_FILE="${CONFIG_FILE:-}"
while [ $# -gt 0 ]; do
    arg="$1"
    case "$arg" in
        -h | --help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Updates the CS2 dedicated server via SteamCMD and restarts the"
            echo "service when an update is available. Run as root (e.g. via cron)."
            echo ""
            echo "Options:"
            echo "  -h, --help           Show this help and exit"
            echo "  -v, --version        Show version and exit"
            echo "  --dry-run            Check for updates only; do not stop/update/start"
            echo "  --status             Print whether an update is available, then exit"
            echo "  --config=FILE, -c    Load config from FILE (default: cs2-auto-update.conf"
            echo "                         next to the script)"
            echo ""
            echo "Configuration (via config file or environment variables):"
            echo "  CS2_DIR              CS2 install directory       [/home/steam/cs2]"
            echo "  SERVICE_NAME         Systemd unit name           [cs2.service]"
            echo "  STEAMCMD             SteamCMD binary path        [/usr/games/steamcmd]"
            echo "  LOGFILE              Log file path               [/home/steam/update_cs2.log]"
            echo "  REQUIRED_SPACE       Min free disk space in KB   [5000000 (~5 GB)]"
            echo "  MAX_ATTEMPTS         Retries for stop/start      [5]"
            echo "  SLEEP_SECS           Seconds between retries     [5]"
            echo "  LOG_LEVEL            quiet or normal             [normal]"
            echo ""
            echo "Examples:"
            echo "  sudo $0                     # check and apply updates"
            echo "  sudo $0 --dry-run           # check only, do not update"
            echo "  sudo $0 --status            # print update status and exit"
            echo "  sudo $0 --config=/etc/cs2.conf"
            echo ""
            echo "Cron:    0 7 * * * /home/steam/update_cs2.sh"
            echo "See README.md for systemd timer setup."
            exit 0
            ;;
        -v | --version)
            echo "$VERSION"
            exit 0
            ;;
        --dry-run)
            DRY_RUN=1
            CLI_DRY_RUN_SET=1
            shift
            ;;
        --status)
            STATUS_ONLY=1
            shift
            ;;
        -c)
            if [ $# -lt 2 ]; then
                echo "ERROR: -c requires an argument. Use -c /path/to/config" >&2
                exit 1
            fi
            CONFIG_FILE="$2"
            shift 2
            ;;
        -c=*)
            CONFIG_FILE="${arg#-c=}"
            shift
            ;;
        -c*)
            CONFIG_FILE="${arg#-c}"
            shift
            ;;
        --config=*)
            CONFIG_FILE="${arg#--config=}"
            shift
            ;;
        --config)
            if [ $# -lt 2 ]; then
                echo "ERROR: --config requires an argument. Use --config=/path/to/config" >&2
                exit 1
            fi
            CONFIG_FILE="$2"
            shift 2
            ;;
        -*)
            echo "ERROR: Unknown option: $arg" >&2
            exit 1
            ;;
        *)
            echo "ERROR: Unexpected positional argument: $arg" >&2
            exit 1
            ;;
    esac
done

#### Configuration ####
LOCKDIR="${LOCKDIR:-/tmp/update_cs2.lock}"
LOGFILE="${LOGFILE:-/home/steam/update_cs2.log}"
CS2_DIR="${CS2_DIR:-/home/steam/cs2}"
SERVICE_NAME="${SERVICE_NAME:-cs2.service}"
STEAMCMD="${STEAMCMD:-/usr/games/steamcmd}"
CS2_APP_ID="${CS2_APP_ID:-730}"
REQUIRED_SPACE="${REQUIRED_SPACE:-5000000}" # in KB (e.g., ~5GB)
MAX_ATTEMPTS="${MAX_ATTEMPTS:-5}"
SLEEP_SECS="${SLEEP_SECS:-5}"

# Apply default when empty (single source of truth; run after config load and after trim).
apply_defaults() {
    local var
    for var in LOCKDIR REQUIRED_SPACE MAX_ATTEMPTS SLEEP_SECS SERVICE_NAME; do
        if [ -z "${!var}" ]; then
            case "$var" in
                LOCKDIR) LOCKDIR="/tmp/update_cs2.lock" ;;
                REQUIRED_SPACE) REQUIRED_SPACE="5000000" ;;
                MAX_ATTEMPTS) MAX_ATTEMPTS="5" ;;
                SLEEP_SECS) SLEEP_SECS="5" ;;
                SERVICE_NAME) SERVICE_NAME="cs2.service" ;;
            esac
        fi
    done
}
apply_defaults

# Testing helper: set to 1 to allow running as non-root (runs SteamCMD as the current user).
ALLOW_NONROOT="${ALLOW_NONROOT:-0}"
NO_SLEEP="${NO_SLEEP:-0}"
# quiet = only ERROR/WARNING; normal = all
LOG_LEVEL="${LOG_LEVEL:-normal}"
# Single source of truth for operator config-file keys and trimming.
CONFIG_AND_TRIM_VARS="LOCKDIR LOGFILE CS2_DIR SERVICE_NAME STEAMCMD CS2_APP_ID REQUIRED_SPACE MAX_ATTEMPTS SLEEP_SECS LOG_LEVEL DRY_RUN"
CRITICAL_CONFIG_VARS="LOCKDIR LOGFILE CS2_DIR SERVICE_NAME STEAMCMD CS2_APP_ID REQUIRED_SPACE MAX_ATTEMPTS SLEEP_SECS"
# Keep old keys visible to operators after feature removal. Warning is safer
# than silently ignoring a config file copied from an older deployment.
REMOVED_CONFIG_VARS="NOTIFY_WEBHOOK_URL NOTIFY_PLAYERS_MESSAGE RCON_CLI RCON_HOST RCON_PORT RCON_PASSWORD"
REMOVED_CONFIG_KEYS=""
CONFIG_FILE_KEYS=""

trim_whitespace() {
    local value
    value="$1"
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"
    printf '%s' "$value"
}

strip_unquoted_comment() {
    local input out char quote i
    input="$1"
    out=""
    quote=""

    for ((i = 0; i < ${#input}; i++)); do
        char="${input:$i:1}"
        if [ -z "$quote" ]; then
            case "$char" in
                "#") break ;;
                "'" | '"') quote="$char" ;;
            esac
        elif [ "$char" = "$quote" ]; then
            quote=""
        fi
        out+="$char"
    done

    printf '%s' "$out"
}

parse_config_value() {
    local value quote
    value="$(trim_whitespace "$1")"
    if [ -z "$value" ]; then
        printf ''
        return 0
    fi

    quote="${value:0:1}"
    if [ "$quote" = '"' ] || [ "$quote" = "'" ]; then
        value="${value:1}"
        if [ "${value: -1}" = "$quote" ]; then
            value="${value:0:${#value}-1}"
        fi
    fi

    printf '%s' "$value"
}

remember_removed_config_key() {
    local key existing
    key="$1"
    for existing in $REMOVED_CONFIG_KEYS; do
        [ "$existing" = "$key" ] && return 0
    done
    REMOVED_CONFIG_KEYS="${REMOVED_CONFIG_KEYS}${REMOVED_CONFIG_KEYS:+ }${key}"
}

detect_removed_env_config_keys() {
    local key
    for key in $REMOVED_CONFIG_VARS; do
        if [ "${!key+x}" = "x" ]; then
            remember_removed_config_key "$key"
        fi
    done
}

load_config_file() {
    local path line key val allowed removed matched critical existing duplicate
    path="$1"
    while IFS= read -r line || [ -n "$line" ]; do
        line="$(trim_whitespace "$(strip_unquoted_comment "$line")")"
        if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
            key="${BASH_REMATCH[1]}"
            val="$(parse_config_value "${BASH_REMATCH[2]}")"
            # Keep parser portable to older /bin/bash versions (e.g., macOS bash 3.2).
            val="${val//$'\r'/}"
            val="${val//$'\n'/}"
            matched=0
            for allowed in $CONFIG_AND_TRIM_VARS; do
                if [ "$key" = "$allowed" ]; then
                    duplicate=0
                    for existing in $CONFIG_FILE_KEYS; do
                        if [ "$key" = "$existing" ]; then
                            duplicate=1
                            break
                        fi
                    done
                    if [ "$duplicate" = "1" ]; then
                        echo "ERROR: Duplicate config key: $key" >&2
                        exit 1
                    fi
                    CONFIG_FILE_KEYS="${CONFIG_FILE_KEYS}${CONFIG_FILE_KEYS:+ }${key}"
                    for critical in $CRITICAL_CONFIG_VARS; do
                        if [ "$key" = "$critical" ] && [ -z "$val" ]; then
                            echo "ERROR: Config key $key must not be empty. Leave it commented to use the default." >&2
                            exit 1
                        fi
                    done
                    printf -v "$key" '%s' "$val"
                    matched=1
                    break
                fi
            done
            if [ "$matched" = "0" ]; then
                for removed in $REMOVED_CONFIG_VARS; do
                    if [ "$key" = "$removed" ]; then
                        remember_removed_config_key "$key"
                        matched=1
                        break
                    fi
                done
                if [ "$matched" = "0" ]; then
                    echo "ERROR: Unknown config key: $key" >&2
                    exit 1
                fi
            fi
        fi
    done < "$path"
}

# Optional config file (same variable names as env); overrides defaults
[ -z "${CONFIG_FILE:-}" ] && CONFIG_FILE="$SCRIPT_DIR/cs2-auto-update.conf"
if [ "$CONFIG_FILE" = "-" ]; then
    echo "ERROR: CONFIG_FILE must not be '-' (stdin)." >&2
    exit 1
fi
if [ -n "$CONFIG_FILE" ] && [[ "$CONFIG_FILE" == -* ]]; then
    echo "ERROR: CONFIG_FILE must not look like an option: $CONFIG_FILE" >&2
    exit 1
fi
if [ -n "$CONFIG_FILE" ] && [[ "$CONFIG_FILE" == *".."* ]]; then
    echo "ERROR: CONFIG_FILE must not contain '..': $CONFIG_FILE" >&2
    exit 1
fi
if [ -n "$CONFIG_FILE" ] && [ -e "$CONFIG_FILE" ] && [ ! -f "$CONFIG_FILE" ]; then
    echo "ERROR: CONFIG_FILE must be a regular file: $CONFIG_FILE" >&2
    exit 1
fi
if [ -f "$CONFIG_FILE" ]; then
    load_config_file "$CONFIG_FILE"
    apply_defaults
fi

# Consolidation: Trim leading/trailing whitespace (same vars as config whitelist).
trim_config_vars() {
    local var val
    for var in $CONFIG_AND_TRIM_VARS; do
        val="${!var}"
        val="${val#"${val%%[![:space:]]*}"}"
        val="${val%"${val##*[![:space:]]}"}"
        printf -v "$var" '%s' "$val"
    done
}
trim_config_vars
apply_defaults
detect_removed_env_config_keys

# CLI flags must have highest precedence over config file values.
if [ "$CLI_DRY_RUN_SET" = "1" ]; then
    DRY_RUN=1
fi

#### Internal state ####
CLEANUP_ENABLED=0
TMP_UPDATE_OUTPUT=""
TMP_GET_REMOTE_BUILDID=""
LOCK_PID_FILE=""
LOCK_META_FILE=""

#### Helper Functions ####
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
    printf '%s\n' "$msg" >> "$LOGFILE" 2> /dev/null || true
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

# Validate numeric config and LOCKDIR; call after require_root so we can exit_with_error.
validate_config() {
    if [ "$LOCKDIR" = "/" ] || [[ "$LOCKDIR" =~ ^/+$ ]]; then
        exit_with_error "LOCKDIR must not be root (/). Use a subdirectory, e.g. /tmp/update_cs2.lock"
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
    if [ "$MAX_ATTEMPTS" -gt 100 ]; then
        exit_with_error "MAX_ATTEMPTS must be at most 100. Current: $MAX_ATTEMPTS"
    fi
    if ! [[ "${CS2_APP_ID:-}" =~ ^[0-9]+$ ]]; then
        exit_with_error "CS2_APP_ID must be a numeric app id (e.g. 730). Current: $CS2_APP_ID"
    fi
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
    if [ "$LOGFILE" = "/" ] || [[ "$LOGFILE" =~ ^/+$ ]]; then
        exit_with_error "LOGFILE must not be root (/). Use a file path, e.g. /home/steam/update_cs2.log"
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

ensure_logfile_writable() {
    local logdir created_dir created_file
    logdir=$(dirname "$LOGFILE")
    created_dir=0
    created_file=0
    if [ ! -d "$logdir" ]; then
        mkdir -p "$logdir" || exit_with_error "Failed to create log directory: $logdir"
        created_dir=1
    fi
    if [ ! -e "$LOGFILE" ]; then
        : > "$LOGFILE" 2> /dev/null || exit_with_error "Failed to create log file: $LOGFILE"
        chmod 0640 "$LOGFILE" 2> /dev/null || true
        created_file=1
    fi
    touch "$LOGFILE" 2> /dev/null || exit_with_error "Log file is not writable: $LOGFILE"
    # Only change ownership for paths created in this run, never for pre-existing files.
    if [ "${EUID:-$(id -u)}" -eq 0 ] && [ "$ALLOW_NONROOT" != "1" ]; then
        if [ "$created_dir" -eq 1 ]; then
            chown steam:steam "$logdir" 2> /dev/null || chown steam: "$logdir" 2> /dev/null || true
            chmod 0750 "$logdir" 2> /dev/null || true
        fi
        if [ "$created_file" -eq 1 ]; then
            chown steam:steam "$LOGFILE" 2> /dev/null || chown steam: "$LOGFILE" 2> /dev/null || true
        fi
    fi
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

cleanup() {
    # Remove temp file used for SteamCMD output (if any).
    if [ -n "$TMP_UPDATE_OUTPUT" ] && [ -f "$TMP_UPDATE_OUTPUT" ]; then
        rm -f "$TMP_UPDATE_OUTPUT"
        TMP_UPDATE_OUTPUT=""
    fi
    if [ -n "$TMP_GET_REMOTE_BUILDID" ] && [ -f "$TMP_GET_REMOTE_BUILDID" ]; then
        rm -f "$TMP_GET_REMOTE_BUILDID"
        TMP_GET_REMOTE_BUILDID=""
    fi
    if [ -n "$LOCK_PID_FILE" ] && [ -f "$LOCK_PID_FILE" ]; then
        rm -f "$LOCK_PID_FILE" 2> /dev/null || true
        LOCK_PID_FILE=""
    fi
    if [ -n "$LOCK_META_FILE" ] && [ -f "$LOCK_META_FILE" ]; then
        rm -f "$LOCK_META_FILE" 2> /dev/null || true
        LOCK_META_FILE=""
    fi
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
trap cleanup EXIT INT TERM HUP

#### Step 1: Create Lock ####
# Call validate_config before this so LOCKDIR is not a file/symlink.
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

pid_exists() {
    local pid
    pid="$1"
    kill -0 "$pid" 2> /dev/null || ps -p "$pid" > /dev/null 2>&1
}

write_lock_pid() {
    LOCK_PID_FILE="${LOCKDIR%/}/pid"
    printf '%s\n' "$$" > "$LOCK_PID_FILE" || exit_with_error "Failed to write lock PID file: $LOCK_PID_FILE"
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

init_lock() {
    local owner_uid current_uid lock_pid_file lock_pid lock_meta_file
    current_uid="${EUID:-$(id -u)}"

    # mkdir is atomic; avoids races when two instances start simultaneously.
    if mkdir "$LOCKDIR" 2> /dev/null; then
        CLEANUP_ENABLED=1
        write_lock_pid
        write_lock_metadata
        log "Lock acquired."
        return 0
    fi

    if [ -d "$LOCKDIR" ]; then
        owner_uid="$(path_owner_uid "$LOCKDIR")"
        if [ -n "$owner_uid" ] && [ "$owner_uid" != "$current_uid" ]; then
            exit_with_error "Lock directory exists but is owned by uid $owner_uid (current uid $current_uid). Refusing to trust it: $LOCKDIR"
        fi

        lock_pid_file="${LOCKDIR%/}/pid"
        lock_meta_file="${LOCKDIR%/}/meta"
        if [ -f "$lock_pid_file" ]; then
            lock_pid="$(awk 'NR==1{print; exit}' "$lock_pid_file" 2> /dev/null || true)"
            lock_pid="${lock_pid//[[:space:]]/}"
            if [[ "$lock_pid" =~ ^[0-9]+$ ]] && pid_exists "$lock_pid"; then
                if [ -f "$lock_meta_file" ]; then
                    if lock_matches_running_process "$lock_pid" "$lock_meta_file"; then
                        log "An update process is already running (lock: $LOCKDIR, pid: $lock_pid). Exiting."
                        exit 0
                    fi
                    log "WARNING: Lock metadata does not match the running process; treating lock as stale."
                else
                    log "WARNING: Legacy lock detected without metadata; trusting running pid $lock_pid."
                    exit 0
                fi
            fi

            log "WARNING: Stale lock detected (pid ${lock_pid:-unknown} not running). Attempting recovery..."
            rm -f "$lock_pid_file" || exit_with_error "Failed to remove stale lock PID file: $lock_pid_file"
            rm -f "$lock_meta_file" 2> /dev/null || true
            if rmdir "$LOCKDIR" 2> /dev/null; then
                if mkdir "$LOCKDIR" 2> /dev/null; then
                    CLEANUP_ENABLED=1
                    write_lock_pid
                    write_lock_metadata
                    log "Recovered stale lock and acquired a new lock."
                    return 0
                fi
                exit_with_error "Recovered stale lock but failed to re-acquire lock: $LOCKDIR"
            fi
            exit_with_error "Stale lock detected but lock directory is not empty; remove manually: $LOCKDIR"
        fi
        # Lock dir exists but no PID file — treat as stale (e.g., killed between mkdir and write_lock_pid).
        log "WARNING: Lock directory exists without PID file (stale). Attempting recovery: $LOCKDIR"
        if rmdir "$LOCKDIR" 2> /dev/null; then
            if mkdir "$LOCKDIR" 2> /dev/null; then
                CLEANUP_ENABLED=1
                write_lock_pid
                write_lock_metadata
                log "Recovered stale lock (no PID file) and acquired a new lock."
                return 0
            fi
            exit_with_error "Recovered stale lock but failed to re-acquire lock: $LOCKDIR"
        fi
        exit_with_error "Lock directory exists without PID file but is not empty; remove manually: $LOCKDIR"
    fi

    exit_with_error "Failed to create lock directory: $LOCKDIR"
}

#### Step 2: Check Disk Space ####
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

#### Step 3: Stop Service ####
stop_service() {
    log "Stopping $SERVICE_NAME..."
    retry_systemctl stop || exit_with_error "Failed to stop $SERVICE_NAME after $MAX_ATTEMPTS attempts."
    log "$SERVICE_NAME stopped."
    sleep_s "$SLEEP_SECS"
}

#### Step 4: Run SteamCMD Update ####
run_update() {
    local update_ret
    TMP_UPDATE_OUTPUT=$(mktemp "${TMPDIR:-/tmp}/cs2_update.XXXXXX") || exit_with_error "Failed to create temporary file."
    log "Running SteamCMD update as 'steam' user..."
    update_ret=0
    run_as_steam "$STEAMCMD" +login anonymous \
        +force_install_dir "$CS2_DIR" \
        +app_update "$CS2_APP_ID" validate +quit > "$TMP_UPDATE_OUTPUT" 2>&1 || update_ret=$?
    log "SteamCMD output:"
    log_multiline "steamcmd: " < "$TMP_UPDATE_OUTPUT"
    rm -f "$TMP_UPDATE_OUTPUT"
    TMP_UPDATE_OUTPUT=""
    if [ "$update_ret" -ne 0 ]; then
        log "Attempting to start $SERVICE_NAME after failed update..."
        if retry_systemctl start; then
            if wait_for_service_active; then
                log "$SERVICE_NAME restart after failed update confirmed active."
            else
                log "WARNING: Service restart after failed update did not become active."
            fi
        else
            log "WARNING: Service restart after failed update also failed."
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
    run_as_steam "$STEAMCMD" +login anonymous +app_info_update 1 +app_info_print "$CS2_APP_ID" +quit > "$tmpfile" 2>&1 || run_ret=$?
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

#### Step 5: Start Service ####
start_service() {
    log "Starting $SERVICE_NAME..."
    retry_systemctl start || exit_with_error "Failed to start $SERVICE_NAME after $MAX_ATTEMPTS attempts."
    wait_for_service_active || exit_with_error "$SERVICE_NAME start command succeeded but service is not active after $MAX_ATTEMPTS checks."
    log "$SERVICE_NAME started and active."
}

#### Step 6: Ensure Service Running ####
ensure_service_running() {
    require_cmd systemctl
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        log "$SERVICE_NAME is already running."
    else
        log "$SERVICE_NAME is not running; starting..."
        start_service
    fi
}

#### Main Execution Flow ####
require_root
require_steam_user
validate_config
ensure_logfile_writable
warn_removed_config_keys
require_cmd awk
require_cmd df
require_cmd ps

if [ ! -x "$STEAMCMD" ]; then
    exit_with_error "SteamCMD not found or not executable at '$STEAMCMD'. Install it (apt install steamcmd) or set STEAMCMD=/path/to/steamcmd in your config."
fi

if [ ! -d "$CS2_DIR" ]; then
    exit_with_error "CS2 installation directory not found: $CS2_DIR. Set CS2_DIR in your config if CS2 is installed elsewhere."
fi

UPDATE_START_TIME=$(date +%s)
log "=== Update process initiated ==="
init_lock
check_space

BUILDID_BEFORE=$(read_buildid)
log "Detected buildid before update: ${BUILDID_BEFORE:-unknown}"

REMOTE_BUILDID=$(get_remote_buildid)
log "Detected remote buildid: ${REMOTE_BUILDID:-unknown}"
UPDATE_STATE=$(determine_update_state "$BUILDID_BEFORE" "$REMOTE_BUILDID")

if [ "$STATUS_ONLY" = "1" ]; then
    case "$UPDATE_STATE" in
        up-to-date)
            log "Status: up-to-date (buildid $BUILDID_BEFORE)"
            log "=== Update process completed (status only, $(($(date +%s) - UPDATE_START_TIME))s) ==="
            exit 0
            ;;
        update-required)
            log "Status: update available (local ${BUILDID_BEFORE:-unknown}, remote ${REMOTE_BUILDID:-unknown})"
            log "=== Update process completed (status only, $(($(date +%s) - UPDATE_START_TIME))s) ==="
            exit 0
            ;;
        *)
            log "Status: unknown (local ${BUILDID_BEFORE:-unknown}, remote ${REMOTE_BUILDID:-unknown})"
            log "=== Update process completed (status only, $(($(date +%s) - UPDATE_START_TIME))s) ==="
            exit 1
            ;;
    esac
fi

case "$UPDATE_STATE" in
    up-to-date)
        log "No update required (local buildid matches remote)."
        ensure_service_running
        log "=== Update process completed ($(($(date +%s) - UPDATE_START_TIME))s) ==="
        exit 0
        ;;
    update-required)
        log "Update required (local buildid differs from remote)."
        ;;
    *)
        log "Unable to determine update requirement reliably; refusing to stop the service while remote status is unknown."
        log "=== Update process completed ($(($(date +%s) - UPDATE_START_TIME))s) ==="
        exit 1
        ;;
esac

if [ "$DRY_RUN" = "1" ]; then
    log "Dry run: skipping service stop, SteamCMD update, and service start."
    log "=== Update process completed (dry run, $(($(date +%s) - UPDATE_START_TIME))s) ==="
    exit 0
fi

stop_service
run_update

BUILDID_AFTER=$(read_buildid)
log "Detected buildid after update: ${BUILDID_AFTER:-unknown}"

start_service

POST_UPDATE_STATE=$(determine_post_update_state "$BUILDID_BEFORE" "$REMOTE_BUILDID" "$BUILDID_AFTER")

case "$POST_UPDATE_STATE" in
    update-applied)
        log "Update applied successfully (before ${BUILDID_BEFORE:-unknown}, after ${BUILDID_AFTER:-unknown}, remote ${REMOTE_BUILDID:-unknown})."
        log "=== Update process completed ($(($(date +%s) - UPDATE_START_TIME))s) ==="
        exit 0
        ;;
    no-change-after-update)
        log "ERROR: SteamCMD exited successfully but buildid did not change after the update attempt (still ${BUILDID_AFTER:-unknown})."
        log "=== Update process completed ($(($(date +%s) - UPDATE_START_TIME))s) ==="
        exit 1
        ;;
    *)
        log "ERROR: Update attempt did not converge to the expected build (before ${BUILDID_BEFORE:-unknown}, after ${BUILDID_AFTER:-unknown}, remote ${REMOTE_BUILDID:-unknown})."
        log "=== Update process completed ($(($(date +%s) - UPDATE_START_TIME))s) ==="
        exit 1
        ;;
esac
