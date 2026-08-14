/** Discovers the forward-only migration scenario group. */
import { after, before } from 'node:test';
import { registerMigrationScenarios } from './cases/migration-cases';
import { createMigrationWorkspace } from './support/migration-fixture';

let migrationWorkspace: ReturnType<typeof createMigrationWorkspace>;

before(() => {
  migrationWorkspace = createMigrationWorkspace();
});

after(() => {
  migrationWorkspace.close();
});

registerMigrationScenarios((name) => migrationWorkspace.dbPathFor(name));
