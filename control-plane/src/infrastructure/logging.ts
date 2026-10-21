/** Central structured logger so runtime diagnostics share one policy. */
import pino from 'pino';
import { executionContext } from '../shared/executionContext';

/** Request correlation fields added to every log line written during a request. */
export function logContextFields(): { request_id?: string; server_id?: string } {
  const store = executionContext.getStore();
  if (!store?.requestId) return {};
  return store.serverId
    ? { request_id: store.requestId, server_id: store.serverId }
    : { request_id: store.requestId };
}

const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  mixin: logContextFields,
  // Request bodies carry passwords, and URL errors carry their input (REDIS_URL holds the
  // Redis password); never let an error object or field write them out.
  redact: {
    paths: [
      'err.body',
      'err.input',
      'err.cause.body',
      'err.cause.input',
      'error.body',
      'error.input',
      'reason.body',
      'reason.input',
      '*.body',
      'body',
      'password',
      'rcon_password',
      'rconPassword',
      'currentPassword',
      'newPassword',
      '*.password',
      '*.rcon_password',
      '*.rconPassword',
      '*.*.password',
      '*.*.rcon_password',
      '*.*.rconPassword',
    ],
    censor: '[redacted]',
  },
});

export default logger;
