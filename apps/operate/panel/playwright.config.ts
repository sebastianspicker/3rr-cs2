import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const e2ePort = Number(process.env.E2E_PORT || 3210);
const e2eRunId = process.env.E2E_RUN_ID || `${Date.now()}-${process.pid}`;
const e2eStateDir = path.resolve('.e2e', e2eRunId);

fs.mkdirSync(e2eStateDir, { recursive: true });

export default defineConfig({
  testDir: './test/e2e',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: true,
  reporter: process.env.CI ? 'github' : 'list',
  outputDir: 'test-results/e2e',
  use: {
    baseURL: `http://127.0.0.1:${e2ePort}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'node dist/app.js',
    url: `http://127.0.0.1:${e2ePort}/api/health`,
    reuseExistingServer: false,
    timeout: 15_000,
    env: {
      NODE_ENV: 'test',
      PORT: String(e2ePort),
      DB_PATH: path.join(e2eStateDir, 'cspanel.db'),
      DEFAULT_USERNAME: 'e2eadmin',
      DEFAULT_PASSWORD: 'e2epassword12345',
      ALLOW_DEFAULT_CREDENTIALS: 'true',
      SESSION_SECRET: 'e2e-session-secret-strong-value-123456',
    },
  },
});
