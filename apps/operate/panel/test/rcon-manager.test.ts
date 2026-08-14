/** RCON lifecycle scenario composition; fixture mocks load before RconManager. */
import { afterEach } from 'node:test';
import { registerRconCleanupScenarios } from './cases/rcon-manager-cleanup-cases';
import { registerRconHeartbeatScenarios } from './cases/rcon-manager-heartbeat-cases';
import { registerRconReconnectScenarios } from './cases/rcon-manager-reconnect-cases';
import { registerRconSerializationScenarios } from './cases/rcon-manager-serialization-cases';
import { resetRconFixture } from './support/rcon-manager-fixture';

afterEach(resetRconFixture);

registerRconSerializationScenarios();
registerRconReconnectScenarios();
registerRconCleanupScenarios();
registerRconHeartbeatScenarios();
