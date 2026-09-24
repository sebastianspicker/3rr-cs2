/** Carries one deadline through an HTTP action, including command sequences. */
import type { RequestHandler } from 'express';
import { executionContext } from '../shared/executionContext';
import type { RconManager } from '../integrations/rcon';

export function executionLifetime(rcon: RconManager): RequestHandler {
  return (req, res, next) => {
    const controller = new AbortController();
    const abandon = () => controller.abort();
    const close = () => {
      if (!res.writableFinished) abandon();
      req.off('aborted', abandon);
    };
    req.once('aborted', abandon);
    res.once('close', close);
    executionContext.run(
      { deadlineAt: Date.now() + (rcon.totalDeadlineMs ?? 12_000), signal: controller.signal },
      next
    );
  };
}
