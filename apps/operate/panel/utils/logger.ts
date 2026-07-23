/** Central structured logger so runtime diagnostics share one policy. */
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
});

export default logger;
