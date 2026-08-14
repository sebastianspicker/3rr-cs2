/** Discovers Source RCON protocol scenarios after installing test doubles. */
import { mockModule } from './support/mock-module';
import { registerRconManagerProtocolScenarios } from './cases/rcon-manager-protocol-cases';

process.env.RCON_COMMAND_TIMEOUT_MS = '50';
const TEST_AUTH_TIMEOUT_MS = 50;

mockModule('../../db.js', {
  better_sqlite_client: {
    prepare: () => ({
      all: () => [],
      get: () => undefined,
    }),
  },
});

mockModule('../../utils/networkValidation.js', {
  resolveValidServerHost: async (host: string) => host,
});

registerRconManagerProtocolScenarios(TEST_AUTH_TIMEOUT_MS);
