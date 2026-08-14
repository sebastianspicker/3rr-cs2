/** Explicitly discovers setup-game map-policy scenarios by gameplay concern. */
import { registerSetupGameCasualModeScenarios } from './cases/app-setup-game-casual-mode-cases';
import { registerSetupGameMovementModeScenarios } from './cases/app-setup-game-movement-mode-cases';
import { registerSetupGameSpecialModeScenarios } from './cases/app-setup-game-special-mode-cases';

registerSetupGameMovementModeScenarios();
registerSetupGameCasualModeScenarios();
registerSetupGameSpecialModeScenarios();
