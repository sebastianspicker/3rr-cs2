/** Explicitly discovers game-route authentication, validation, and setup-edge scenarios. */
import { registerGameRouteAuthGuardScenarios } from './cases/app-game-auth-guard-cases';
import { registerGameRouteValidationScenarios } from './cases/app-game-validation-cases';
import { registerSetupGameEdgeScenarios } from './cases/app-setup-game-edge-cases';

registerGameRouteAuthGuardScenarios();
registerGameRouteValidationScenarios();
registerSetupGameEdgeScenarios();
