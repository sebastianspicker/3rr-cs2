/** Runs stateful E2E groups serially so shared database fixtures cannot race. */
import { test } from './panel-fixture';
import { registerCoreCases } from './panel-core-cases';
import { registerManageCases } from './panel-manage-cases';
import { registerStatusCases } from './panel-status-cases';

test.describe.configure({ mode: 'serial' });
registerCoreCases();
registerManageCases();
registerStatusCases();
