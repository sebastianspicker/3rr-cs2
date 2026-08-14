# shellcheck shell=bash
# shellcheck disable=SC2034 # Defaults are consumed by other sourced updater libraries.
# Configuration parsing and normalization for 3rr-update.

# Apply default when empty (single source of truth; run after config load and after trim).
apply_defaults() {
    local var
    for var in LOCKDIR REQUIRED_SPACE MAX_ATTEMPTS SLEEP_SECS STEAMCMD_TIMEOUT_SECS SERVICE_NAME; do
        if [ -z "${!var}" ]; then
            case "$var" in
                LOCKDIR) LOCKDIR="/tmp/3rr-update.lock" ;;
                REQUIRED_SPACE) REQUIRED_SPACE="5000000" ;;
                MAX_ATTEMPTS) MAX_ATTEMPTS="5" ;;
                SLEEP_SECS) SLEEP_SECS="5" ;;
                STEAMCMD_TIMEOUT_SECS) STEAMCMD_TIMEOUT_SECS="1800" ;;
                SERVICE_NAME) SERVICE_NAME="cs2.service" ;;
            esac
        fi
    done
}

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
        if [ "${#value}" -lt 2 ] || [ "${value: -1}" != "$quote" ]; then
            return 1
        fi
        value="${value:1}"
        value="${value:0:${#value}-1}"
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

config_list_contains() {
    local key candidates candidate
    key="$1"
    candidates="$2"
    for candidate in $candidates; do
        [ "$key" = "$candidate" ] && return 0
    done
    return 1
}

parse_config_assignment() {
    local line line_number key_var value_var parsed_key raw_value parsed_value
    line="$1"
    line_number="$2"
    key_var="$3"
    value_var="$4"

    if ! [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
        echo "ERROR: Malformed config line $line_number (expected KEY=value)." >&2
        exit 1
    fi

    parsed_key="${BASH_REMATCH[1]}"
    raw_value="${BASH_REMATCH[2]}"
    if ! parsed_value="$(parse_config_value "$raw_value")"; then
        echo "ERROR: Malformed config line $line_number (unterminated quoted value)." >&2
        exit 1
    fi

    # Keep parser portable to older /bin/bash versions (e.g., macOS bash 3.2).
    parsed_value="${parsed_value//$'\r'/}"
    parsed_value="${parsed_value//$'\n'/}"
    printf -v "$key_var" '%s' "$parsed_key"
    printf -v "$value_var" '%s' "$parsed_value"
}

ensure_unique_config_key() {
    local key
    key="$1"
    if config_list_contains "$key" "$CONFIG_FILE_KEYS"; then
        echo "ERROR: Duplicate config key: $key" >&2
        exit 1
    fi
    CONFIG_FILE_KEYS="${CONFIG_FILE_KEYS}${CONFIG_FILE_KEYS:+ }${key}"
}

ensure_critical_config_value() {
    local key value
    key="$1"
    value="$2"
    if config_list_contains "$key" "$CRITICAL_CONFIG_VARS" && [ -z "$value" ]; then
        echo "ERROR: Config key $key must not be empty. Leave it commented to use the default." >&2
        exit 1
    fi
}

assign_config_value() {
    printf -v "$1" '%s' "$2"
}

route_config_assignment() {
    local key value
    key="$1"
    value="$2"

    if config_list_contains "$key" "$CONFIG_AND_TRIM_VARS"; then
        ensure_unique_config_key "$key"
        ensure_critical_config_value "$key" "$value"
        assign_config_value "$key" "$value"
        return 0
    fi

    if config_list_contains "$key" "$REMOVED_CONFIG_VARS"; then
        remember_removed_config_key "$key"
        return 0
    fi

    echo "ERROR: Unknown config key: $key" >&2
    exit 1
}

process_config_line() {
    local line line_number key value
    line="$1"
    line_number="$2"
    parse_config_assignment "$line" "$line_number" key value
    route_config_assignment "$key" "$value"
}

load_config_file() {
    local path line line_number
    path="$1"
    line_number=0
    while IFS= read -r line || [ -n "$line" ]; do
        line_number=$((line_number + 1))
        line="$(trim_whitespace "$(strip_unquoted_comment "$line")")"
        [ -z "$line" ] && continue
        process_config_line "$line" "$line_number"
    done < "$path"
}

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
