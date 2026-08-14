/** Discovers status endpoint scenarios and owns their shared lifecycle. */
import { after, afterEach, before } from 'node:test';
import { registerStatusScenarios } from './cases/status-cases';
import { createStatusFixture, type StatusFixture } from './support/status-fixture';

let fixture: StatusFixture;

before(async () => {
  fixture = await createStatusFixture();
});

afterEach(() => {
  fixture.resetRcon();
});

after(async () => {
  await fixture.close();
});

registerStatusScenarios(() => fixture);
