#!/usr/bin/env bash
# Exercises updater decisions with deterministic command doubles instead of a host service.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

# shellcheck source=tests/support/assertions.sh
source tests/support/assertions.sh
# shellcheck source=tests/support/environment.sh
source tests/support/environment.sh
# shellcheck source=tests/support/run-cases.sh
source tests/support/run-cases.sh
# shellcheck source=tests/suites/update-flow.sh
source tests/suites/update-flow.sh
# shellcheck source=tests/suites/validation-config.sh
source tests/suites/validation-config.sh
# shellcheck source=tests/suites/cli-security-recovery.sh
source tests/suites/cli-security-recovery.sh

PASS_COUNT=0
pass() { PASS_COUNT=$((PASS_COUNT + 1)); }

initialize_test_environment
run_update_flow_suite
run_validation_config_suite
run_cli_security_recovery_suite

echo ""
echo "OK ($PASS_COUNT tests passed)"
