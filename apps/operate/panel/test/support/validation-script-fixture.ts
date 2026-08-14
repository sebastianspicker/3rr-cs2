/** Temporary-workspace and subprocess helpers for validation script tests. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const projectRoot = path.resolve(__dirname, '..', '..', '..');

export async function rmRecursiveWithRetry(target: string): Promise<void> {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      fs.rmSync(target, { recursive: true, force: true });
      return;
    } catch (err) {
      if (attempt === 5) throw err;
      await new Promise((resolve) => setTimeout(resolve, attempt * 100));
    }
  }
}

export function createValidationFixture(): { workspace: string } {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'cs2-panel-validate-fixture-'));
  const scriptsDir = path.join(workspace, 'scripts');
  const libDir = path.join(scriptsDir, 'lib');
  const fakeBinDir = path.join(workspace, 'fake-bin');
  const cfgDir = path.join(workspace, 'cfg');

  fs.mkdirSync(cfgDir, { recursive: true });
  fs.mkdirSync(libDir, { recursive: true });
  fs.mkdirSync(fakeBinDir, { recursive: true });
  for (const relativePath of [
    'scripts/validate.sh',
    'scripts/lib/common.sh',
    '.env.example',
    'docker-compose.yaml',
    'package.json',
    'package-lock.json',
    'cfg/maps.json',
  ]) {
    fs.copyFileSync(path.join(projectRoot, relativePath), path.join(workspace, relativePath));
  }

  for (const stub of ['shellcheck', 'shfmt', 'jq', 'ruby']) {
    fs.writeFileSync(path.join(fakeBinDir, stub), '#!/usr/bin/env bash\nexit 0\n', {
      mode: 0o755,
    });
  }
  fs.writeFileSync(
    path.join(fakeBinDir, 'docker'),
    `#!/usr/bin/env bash
set -euo pipefail
if [[ "$1" == "info" || "$1" == "build" ]]; then exit 0; fi
if [[ "$1" == "compose" && "$2" == "version" ]]; then exit 0; fi
if [[ "$1" == "compose" ]]; then exit 42; fi
echo "unexpected docker invocation: $*" >&2
exit 99
`,
    { mode: 0o755 }
  );
  return { workspace };
}

export function runValidation(workspace: string): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'bash',
      ['-lc', 'PATH="$PWD/fake-bin:$PATH" scripts/validate.sh --require-docker'],
      { cwd: workspace, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] }
    );
    let output = '';
    child.stdout?.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.stderr?.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.once('error', reject);
    child.once('exit', (code) => resolve({ code, output }));
  });
}

export function gitCheckIgnoreExitCode(filePath: string): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['check-ignore', '--quiet', filePath], {
      cwd: projectRoot,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code !== 0 && code !== 1) {
        reject(new Error(`git check-ignore failed for ${filePath}: ${stderr}`));
        return;
      }
      resolve(code);
    });
  });
}
