#!/bin/bash
# 3RR updater: applies dedicated-server updates and restores the service lifecycle.
#
# The updater compares local and remote build IDs before it stops the configured
# service. It serializes runs with an atomic lock, bounds SteamCMD execution,
# runs SteamCMD as the 'steam' account, and restores the service after failures.
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
VERSION="1.9.0-alpha.1"
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
            echo "  --config=FILE, -c    Load config from FILE (default: 3rr-update.conf"
            echo "                         next to the script)"
            echo ""
            echo "Configuration (via config file or environment variables):"
            echo "  CS2_DIR              CS2 install directory       [/home/steam/cs2]"
            echo "  SERVICE_NAME         Systemd unit name           [cs2.service]"
            echo "  STEAMCMD             SteamCMD binary path        [/usr/games/steamcmd]"
            echo "  LOGFILE              Root-owned log file path    [/var/log/3rr/update.log]"
            echo "  REQUIRED_SPACE       Min free disk space in KB   [5000000 (~5 GB)]"
            echo "  MAX_ATTEMPTS         Retries for stop/start      [5]"
            echo "  SLEEP_SECS           Seconds between retries     [5]"
            echo "  STEAMCMD_TIMEOUT_SECS Max seconds per SteamCMD run [1800]"
            echo "  LOG_LEVEL            quiet or normal             [normal]"
            echo ""
            echo "Examples:"
            echo "  sudo $0                     # check and apply updates"
            echo "  sudo $0 --dry-run           # check only, do not update"
            echo "  sudo $0 --status            # print update status and exit"
            echo "  sudo $0 --config=/etc/3rr-update.conf"
            echo ""
            echo "Timer:   configs/examples/systemd/3rr-update.timer"
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
LOCKDIR="${LOCKDIR:-/tmp/3rr-update.lock}"
LOGFILE="${LOGFILE:-/var/log/3rr/update.log}"
CS2_DIR="${CS2_DIR:-/home/steam/cs2}"
SERVICE_NAME="${SERVICE_NAME:-cs2.service}"
STEAMCMD="${STEAMCMD:-/usr/games/steamcmd}"
CS2_APP_ID="${CS2_APP_ID:-730}"
REQUIRED_SPACE="${REQUIRED_SPACE:-5000000}" # in KB (e.g., ~5GB)
MAX_ATTEMPTS="${MAX_ATTEMPTS:-5}"
SLEEP_SECS="${SLEEP_SECS:-5}"
STEAMCMD_TIMEOUT_SECS="${STEAMCMD_TIMEOUT_SECS:-1800}"

# Testing helper: set to 1 to allow running as non-root (runs SteamCMD as the current user).
ALLOW_NONROOT="${ALLOW_NONROOT:-0}"
NO_SLEEP="${NO_SLEEP:-0}"
# quiet = only ERROR/WARNING; normal = all
LOG_LEVEL="${LOG_LEVEL:-normal}"
# Single source of truth for operator config-file keys and trimming.
CONFIG_AND_TRIM_VARS="LOCKDIR LOGFILE CS2_DIR SERVICE_NAME STEAMCMD CS2_APP_ID REQUIRED_SPACE MAX_ATTEMPTS SLEEP_SECS STEAMCMD_TIMEOUT_SECS LOG_LEVEL DRY_RUN"
CRITICAL_CONFIG_VARS="LOCKDIR LOGFILE CS2_DIR SERVICE_NAME STEAMCMD CS2_APP_ID REQUIRED_SPACE MAX_ATTEMPTS SLEEP_SECS STEAMCMD_TIMEOUT_SECS"
# Keep old keys visible to operators after feature removal. Warning is safer
# than silently ignoring a config file copied from an older deployment.
REMOVED_CONFIG_VARS="NOTIFY_WEBHOOK_URL NOTIFY_PLAYERS_MESSAGE RCON_CLI RCON_HOST RCON_PORT RCON_PASSWORD"
REMOVED_CONFIG_KEYS=""
CONFIG_FILE_KEYS=""

# shellcheck source=lib/config.sh
source "$SCRIPT_DIR/lib/config.sh"
# shellcheck source=lib/runtime.sh
source "$SCRIPT_DIR/lib/runtime.sh"
# shellcheck source=lib/locking.sh
source "$SCRIPT_DIR/lib/locking.sh"
# shellcheck source=lib/operations.sh
source "$SCRIPT_DIR/lib/operations.sh"

apply_defaults

# Optional config file (same variable names as env); overrides defaults
[ -z "${CONFIG_FILE:-}" ] && CONFIG_FILE="$SCRIPT_DIR/3rr-update.conf"
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
LOGFILE_READY=0
SERVICE_STOPPED_BY_UPDATER=0
CLEANUP_RUNNING=0

trap cleanup EXIT
trap 'trap - INT TERM HUP; log "WARNING: Received INT; stopping updater safely."; cleanup; trap - EXIT; exit 130' INT
trap 'trap - INT TERM HUP; log "WARNING: Received TERM; stopping updater safely."; cleanup; trap - EXIT; exit 143' TERM
trap 'trap - INT TERM HUP; log "WARNING: Received HUP; stopping updater safely."; cleanup; trap - EXIT; exit 129' HUP

#### Main Execution Flow ####
require_root
require_steam_user
validate_config
ensure_logfile_writable
warn_removed_config_keys
require_cmd awk
require_cmd df
require_cmd ps
require_cmd timeout

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
