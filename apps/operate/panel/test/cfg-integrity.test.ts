import fs from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapsConfig } from '../utils/mapsConfig';

const repoManagedCfgs = new Set(fs.readdirSync('cfg'));
const serverProvidedCfgs = new Set(['live.cfg']);

function cfgExists(cfgName: string): boolean {
  return repoManagedCfgs.has(cfgName) || serverProvidedCfgs.has(cfgName);
}

test('maps.json game mode exec targets exist in cfg root', () => {
  const missing: string[] = [];

  for (const [gameTypeName, gameType] of Object.entries(mapsConfig.gameTypes)) {
    for (const [gameModeName, gameMode] of Object.entries(gameType.gameModes)) {
      assert.match(
        gameMode.exec,
        /^[a-zA-Z0-9_.-]+\.cfg$/,
        `${gameTypeName}/${gameModeName} must use a safe .cfg exec target`
      );
      if (!repoManagedCfgs.has(gameMode.exec)) {
        missing.push(`${gameTypeName}/${gameModeName}: ${gameMode.exec}`);
      }
    }
  }

  assert.deepEqual(missing, []);
});

test('hard-coded route cfg targets are repo-managed or explicitly server-provided', () => {
  const routeCfgs = [
    'warmup.cfg',
    'knife.cfg',
    'live.cfg',
    'random_rounds_on.cfg',
    'random_rounds_off.cfg',
    'rtd_on.cfg',
    'rtd_off.cfg',
  ];

  const missing = routeCfgs.filter((cfgName) => !cfgExists(cfgName));

  assert.deepEqual(missing, []);
});

test('maps.json game modes reference existing map groups with maps', () => {
  const invalidReferences: string[] = [];

  for (const [gameTypeName, gameType] of Object.entries(mapsConfig.gameTypes)) {
    for (const [gameModeName, gameMode] of Object.entries(gameType.gameModes)) {
      for (const mapGroupName of gameMode.mapGroups) {
        const mapGroup = mapsConfig.mapGroups[mapGroupName];
        if (!mapGroup || mapGroup.maps.length === 0) {
          invalidReferences.push(`${gameTypeName}/${gameModeName}: ${mapGroupName}`);
        }
      }
    }
  }

  assert.deepEqual(invalidReferences, []);
});
