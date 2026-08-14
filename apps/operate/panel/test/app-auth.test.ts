/** Explicitly discovers authentication, protected-route, and health scenarios. */
import { registerAuthPageScenarios } from './cases/app-auth-page-cases';
import { registerAuthSessionScenarios } from './cases/app-auth-session-cases';
import { registerHealthScenarios } from './cases/app-health-cases';
import { registerProtectedApiScenarios } from './cases/app-protected-api-cases';

registerAuthPageScenarios();
registerAuthSessionScenarios();
registerProtectedApiScenarios();
registerHealthScenarios();
