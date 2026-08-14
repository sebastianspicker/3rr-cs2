/** Explicitly discovers production entrypoint scenarios. */
import { registerEntrypointBootstrapScenarios } from './cases/entrypoint-bootstrap-cases';
import { registerEntrypointRuntimeScenarios } from './cases/entrypoint-runtime-cases';
import { registerEntrypointValidationScenarios } from './cases/entrypoint-validation-cases';

registerEntrypointRuntimeScenarios();
registerEntrypointBootstrapScenarios();
registerEntrypointValidationScenarios();
