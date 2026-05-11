# Script Dry-Run Report

Date: 2026-05-11

## Repo Overview

`cs2-server-ops` is split into three operational modules:

- `apps/provision/bootstrap`: generates bootstrap admin and plugin seed files.
- `apps/maintain/updater`: Bash-based CS2 update automation that talks to SteamCMD and `systemd`.
- `apps/operate/panel`: Node/TypeScript web panel for server inventory, health, and RCON-driven operations.

The target runtime for host operations is Linux/Docker/VPS. This review was run from a Windows checkout, so the dry-run method avoids real CS2 hosts, real SteamCMD updates, and real service restarts.

## Safe Environment

Safe commands were limited to:

- shell parsing and repository metadata checks;
- updater test harnesses that use fake `steamcmd` and fake `systemctl`;
- updater probes with temp `LOCKDIR`, `LOGFILE`, and `CS2_DIR`;
- provision bootstrap output into a temp directory;
- help/version commands.

Unsafe/default host paths were not used for successful dry-runs. Direct updater execution with defaults was tested only to confirm it is not suitable off-host.

Observed local tooling:

- Bash: GNU Bash 5.2.21 through Windows `bash.exe`.
- Node: `v24.15.0`; the panel requires Node `>=22 <23`, so local Node is out of range.
- Missing from the local Bash environment: `shellcheck`, `shfmt`, `make`, `docker`.
- `jq` is available to PowerShell as `jq.cmd`, but not inside this Bash/WSL environment.

## Commands Run

| Command | Result | Notes |
| --- | --- | --- |
| `git ls-files --eol '*.sh'` | Pass after fix | All tracked shell scripts now show `w/lf` with `attr/text eol=lf`. |
| `bash -lc 'set -euo pipefail; git ls-files "*.sh" \| xargs bash -n'` | Pass | All tracked shell scripts parse with Bash. |
| `bash apps/maintain/updater/tests/run.sh` | Pass | Stub suite completed with `OK (49 tests passed)`. |
| `bash apps/maintain/updater/update_cs2.sh --help` | Pass | Help text prints successfully. |
| Temp-path fake-binary `update_cs2.sh --status` probe | Pass | Reported `Status: up-to-date`; no `systemctl` calls were recorded. |
| Temp-path fake-binary `update_cs2.sh --dry-run` probe | Pass | Reported update required and skipped stop/update/start; no `systemctl` calls were recorded. |
| Provision bootstrap scripts into temp directory | Pass | Generated admin/plugin files; JSON was parse-checked when a parser was available. |
| `bash apps/operate/panel/scripts/validate.sh --help` | Pass | Help text prints successfully after LF normalization. |
| `bash apps/maintain/updater/scripts/lint.sh` | Blocked | Fails because `shellcheck` is not installed in this Bash environment. |
| `bash apps/operate/panel/scripts/validate.sh` | Blocked | Fails because `shellcheck` is not installed in this Bash environment. |
| `bash scripts/verify.sh` | Blocked | Fails at the first missing required command: `shellcheck`. |
| `bash apps/maintain/updater/update_cs2.sh --status` with defaults | Expected fail | Expects Linux host state: `steam` user and `/home/steam/update_cs2.log`. |

## Issues And Fixing Proposals

### High: Windows checkout produced CRLF shell scripts

Before this fix, several shell scripts had CRLF working-tree endings and failed under Bash with errors like:

```text
set: pipefail\r: invalid option name
```

Affected working-tree files included root verification scripts, panel validation scripts, provision bootstrap scripts, and the startup wrapper.

Fix applied:

- Added `.gitattributes` with LF enforcement for shell assets.
- Renormalized tracked `*.sh` working-tree files to LF.

Follow-up:

- Keep `.editorconfig` as editor guidance.
- Rely on `.gitattributes` for Git checkout behavior.
- Re-run `git ls-files --eol '*.sh'` before release; every shell script should show `w/lf`.

### High: Direct updater defaults are host-specific

`apps/maintain/updater/update_cs2.sh --status` with defaults fails off-host because it expects:

- a `steam` user;
- Linux filesystem paths such as `/home/steam/cs2`;
- a writable `/home/steam/update_cs2.log`;
- real SteamCMD and, outside `--status`/`--dry-run`, `systemd`.

Fix proposal:

- Keep direct default execution documented as a configured Linux host operation only.
- Add or document a safe dry-run wrapper that always sets `ALLOW_NONROOT=1`, temp `LOCKDIR`, temp `LOGFILE`, temp `CS2_DIR`, fake `STEAMCMD`, `NO_SLEEP=1`, and `CONFIG_FILE=""`.
- Prefer the existing updater stub suite for development dry-runs.

### Medium: Full repo validation requires Linux/container tooling not present locally

Root verification and panel validation require tools that are missing here, especially `shellcheck`, `shfmt`, Docker, and Node 22.

Fix proposal:

- Run full verification inside a disposable Linux environment with the same prerequisites as CI.
- For Windows developers, prefer a Docker/WSL workflow rather than native PowerShell execution for Bash validation.
- Do not run panel `npm` checks on host Node 24; use Node 22 as specified by `apps/operate/panel/package.json`.

### Medium: Provision scripts write files by design

The provision bootstrap scripts are safe when pointed at a temp directory, but their default `./output` path writes into the current working directory.

Fix proposal:

- Always pass an explicit temp output directory in dry-run docs and test commands.
- Consider documenting that default output is for deliberate local generation, not verification.

## Safe Dry-Run Recipe

Use this pattern for updater probes:

```bash
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/cs2/steamapps"
cat >"$tmp/cs2/steamapps/appmanifest_730.acf" <<'EOF'
"AppState"
{
  "appid" "730"
  "buildid" "100"
}
EOF

LOCKDIR="$tmp/lock" \
LOGFILE="$tmp/log" \
CS2_DIR="$tmp/cs2" \
SERVICE_NAME="cs2.service" \
STEAMCMD="$PWD/apps/maintain/updater/tests/bin/steamcmd" \
CS2_APP_ID="730" \
REQUIRED_SPACE="1" \
MAX_ATTEMPTS="1" \
SLEEP_SECS="0" \
ALLOW_NONROOT="1" \
NO_SLEEP="1" \
CONFIG_FILE="" \
REMOTE_BUILDID="200" \
STEAMCMD_CALLS_FILE="$tmp/steamcmd.calls" \
SYSTEMCTL_CALLS_FILE="$tmp/systemctl.calls" \
SYSTEMCTL_STATE_FILE="$tmp/systemctl.state" \
bash apps/maintain/updater/update_cs2.sh --dry-run
```

Expected dry-run behavior:

- acquires and removes only the temp lock;
- writes only the temp log;
- reads only the temp CS2 manifest;
- calls fake SteamCMD only for app info;
- does not call `systemctl stop`, `systemctl start`, or real SteamCMD update.

## Follow-Up Verification Checklist

- `git ls-files --eol '*.sh'` shows `w/lf` for every shell script.
- `bash -lc 'set -euo pipefail; git ls-files "*.sh" | xargs bash -n'` passes.
- `bash apps/maintain/updater/tests/run.sh` passes.
- Temp-path updater `--status` and `--dry-run` probes pass and record no `systemctl` calls.
- Provision bootstrap scripts are run only against temp directories during verification.
- Full `scripts/verify.sh` is run in Linux/CI or a container with Node 22, Docker, `make`, `shellcheck`, `shfmt`, `jq`, `ruby`, and `curl`.
