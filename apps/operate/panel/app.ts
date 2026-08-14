/** Panel runtime entry point. */
import { createPanelApp } from './modules/appComposition';
import {
  parsePanelPort,
  registerUnhandledRejectionHandler,
  startPanelApp,
} from './modules/appLifecycle';

const nodeEnv = process.env.NODE_ENV ?? 'development';
const app = createPanelApp(nodeEnv, __dirname);

if (require.main === module) startPanelApp(app, parsePanelPort(process.env.PORT ?? 3000, 3000));
registerUnhandledRejectionHandler(nodeEnv);

export default app;
