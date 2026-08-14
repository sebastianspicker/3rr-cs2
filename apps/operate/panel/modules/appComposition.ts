/** Constructs the Express application while preserving middleware and route order. */
import express, { type NextFunction, type Request, type Response } from 'express';
import logger from '../utils/logger';
import gameRoutes from '../routes/game';
import serverRoutes from '../routes/server';
import authRoutes from '../routes/auth';
import statusRoutes from '../routes/status';
import userRoutes from '../routes/users';
import operatorRoutes from '../routes/operator';
import { configureSecurity } from './appSecurity';
import { configureRateLimits } from './appRateLimits';
import { registerHealthRoute } from './appHealth';

export function createPanelApp(nodeEnv: string, runtimeDir: string): express.Express {
  const app = express();
  app.disable('x-powered-by');
  const bodyLimit = '512kb';
  app.use(express.json({ limit: bodyLimit }));
  app.use(express.urlencoded({ extended: false, limit: bodyLimit, parameterLimit: 100 }));
  app.set('query parser', 'simple');
  configureSecurity(app, nodeEnv, runtimeDir);
  configureRateLimits(app, nodeEnv);
  app.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.set('view engine', 'ejs');
  app.use('/', authRoutes);
  app.use('/', serverRoutes);
  app.use('/', gameRoutes);
  app.use('/', statusRoutes);
  app.use('/', operatorRoutes);
  app.use('/', userRoutes);
  registerHealthRoute(app);
  app.get('/', (req, res) => {
    if (req.session.user) return void res.redirect('/servers');
    res.render('login', { sessionExpired: req.query.expired === '1' });
  });
  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });
  app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
    void next;
    logger.error({ err: error }, '[app] unhandled route error');
    if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
  });
  return app;
}
