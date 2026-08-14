/** Composes authenticated game-control routes from cohesive feature groups. */
import express from 'express';
import { registerModifierControls } from './modifierControls';
import { registerPluginControls } from './pluginControls';
import { registerPracticeControls } from './practiceControls';
import { registerScrimControls } from './scrimControls';

const router = express.Router();

registerPracticeControls(router);
registerScrimControls(router);
registerModifierControls(router);
registerPluginControls(router);

export default router;
