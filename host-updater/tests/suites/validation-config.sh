#!/usr/bin/env bash
# Configuration and validation scenarios in their established execution order.
# shellcheck disable=SC2154
run_validation_config_suite() {
    # Validation tests (reject bad config or expect normalized success)
    run_validation_test "reject LOCKDIR=/" 1 "LOCKDIR must not be root" LOCKDIR="/" LOGFILE="$tmpdir/log" CS2_DIR="$tmpdir/cs2"
    run_validation_test "reject LOCKDIR create failure" 1 "Failed to create lock directory" LOCKDIR="$tmpdir/no-write-parent/lock"

    run_validation_test "reject invalid SERVICE_NAME" 1 "SERVICE_NAME must contain only safe" SERVICE_NAME="cs2;evil"

    run_validation_test "reject SLEEP_SECS > 3600" 1 "SLEEP_SECS must be at most 3600" SLEEP_SECS="5000"
    run_validation_test "reject invalid LOG_LEVEL" 1 "LOG_LEVEL must be one of" LOG_LEVEL="loud"
    run_validation_test "reject unused LOG_LEVEL=verbose" 1 "LOG_LEVEL must be one of: quiet, normal" LOG_LEVEL="verbose"
    run_validation_test "reject invalid NO_SLEEP" 1 "NO_SLEEP must be 0 or 1" NO_SLEEP="yes"
    run_validation_test "reject invalid DRY_RUN" 1 "DRY_RUN must be 0 or 1" DRY_RUN="maybe"
    run_validation_test "reject STEAMCMD_TIMEOUT_SECS=0" 1 "STEAMCMD_TIMEOUT_SECS must be a positive integer" STEAMCMD_TIMEOUT_SECS="0"

    run_validation_test "reject LOGFILE=/" 1 "LOGFILE must not be root" LOGFILE="/" SLEEP_SECS="0"
    run_validation_test "reject LOGFILE non-regular" 1 "LOGFILE must be a regular file path" LOGFILE="/dev/null"

    # LOGFILE must not be a symlink (avoid writing to symlink target)
    touch "$tmpdir/logtarget"
    ln -sf "$tmpdir/logtarget" "$tmpdir/loglink"
    run_validation_test "reject LOGFILE symlink" 1 "LOGFILE must not be a symlink" LOGFILE="$(cd "$tmpdir" && pwd)/loglink"

    mkdir -p "$tmpdir/unsafe-logdir"
    chmod 0777 "$tmpdir/unsafe-logdir"
    run_validation_test "reject writable LOGFILE parent" 1 "Log directory must not be group- or world-writable" LOGFILE="$tmpdir/unsafe-logdir/update.log"
    chmod 0700 "$tmpdir/unsafe-logdir"

    mkdir -p "$tmpdir/unsafe-log-ancestor/safe-child"
    chmod 0777 "$tmpdir/unsafe-log-ancestor"
    chmod 0700 "$tmpdir/unsafe-log-ancestor/safe-child"
    run_validation_test "reject writable LOGFILE ancestor" 1 "Log path ancestor must not be group- or world-writable" LOGFILE="$tmpdir/unsafe-log-ancestor/safe-child/update.log"
    chmod 0700 "$tmpdir/unsafe-log-ancestor"

    touch "$tmpdir/writable-log"
    chmod 0660 "$tmpdir/writable-log"
    run_validation_test "reject writable LOGFILE" 1 "Log file must not be group- or world-writable" LOGFILE="$tmpdir/writable-log"

    run_validation_test "reject CONFIG_FILE=-" 1 "must not be '-'" CONFIG_FILE="-"
    run_validation_test "reject CONFIG_FILE like option" 1 "must not look like an option" CONFIG_FILE="--dry-run"

    # Empty SERVICE_NAME normalized to default (expect success)
    run_validation_test "empty SERVICE_NAME normalized" 0 "Update process" SERVICE_NAME=""
    # Normalization yields success; assert exit 0 already done by helper; needle "Update process" in stdout

    cat > "$tmpdir/unknownconf" << 'CONFEOF'
BOGUS_KEY=evil
CONFEOF
    run_validation_test "reject unknown config key" 1 "Unknown config key: BOGUS_KEY" CONFIG_FILE="$tmpdir/unknownconf"

    cat > "$tmpdir/testhelperconf" << 'CONFEOF'
ALLOW_NONROOT=1
NO_SLEEP=1
CONFEOF
    run_validation_test "reject test helpers in config file" 1 "Unknown config key: ALLOW_NONROOT" CONFIG_FILE="$tmpdir/testhelperconf"

    cat > "$tmpdir/emptycriticalconf" << 'CONFEOF'
SERVICE_NAME=
CONFEOF
    run_validation_test "reject empty SERVICE_NAME in config" 1 "Config key SERVICE_NAME must not be empty" CONFIG_FILE="$tmpdir/emptycriticalconf"

    cat > "$tmpdir/duplicateconf" << 'CONFEOF'
SLEEP_SECS=0
SLEEP_SECS=1
CONFEOF
    run_validation_test "reject duplicate config key" 1 "Duplicate config key: SLEEP_SECS" CONFIG_FILE="$tmpdir/duplicateconf"

    cat > "$tmpdir/malformedconf" << 'CONFEOF'
SERVICE_NAME cs2.service
CONFEOF
    run_validation_test "reject malformed config assignment" 1 "Malformed config line 1" CONFIG_FILE="$tmpdir/malformedconf"

    cat > "$tmpdir/bareconf" << 'CONFEOF'
this-is-not-an-assignment
CONFEOF
    run_validation_test "reject bare config token" 1 "Malformed config line 1" CONFIG_FILE="$tmpdir/bareconf"

    cat > "$tmpdir/unclosedquoteconf" << 'CONFEOF'
SERVICE_NAME="cs2.service
CONFEOF
    run_validation_test "reject unterminated config quote" 1 "unterminated quoted value" CONFIG_FILE="$tmpdir/unclosedquoteconf"

    cat > "$tmpdir/quotedconf" << 'CONFEOF'
SERVICE_NAME='custom.service' # quoted value with trailing comment
SLEEP_SECS=0
CONFEOF
    run_validation_test "quoted config value overrides default service" 0 "custom.service is already running" CONFIG_FILE="$tmpdir/quotedconf"
}
