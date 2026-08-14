/** Explicitly discovers CSRF and session-invalidation scenarios. */
import { registerCsrfProtectionScenarios } from './cases/app-csrf-protection-cases';
import { registerCsrfToggleScenarios } from './cases/app-csrf-toggle-cases';
import { registerSessionInvalidationScenarios } from './cases/app-session-invalidation-cases';

registerCsrfToggleScenarios();
registerCsrfProtectionScenarios();
registerSessionInvalidationScenarios();
