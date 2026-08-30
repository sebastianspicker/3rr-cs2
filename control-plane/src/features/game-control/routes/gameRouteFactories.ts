import type { NextFunction, RequestHandler } from 'express';
import logger from '../../../infrastructure/logging';
import type { RconManager } from '../../../integrations/rcon/rcon';
import type { ServerAccess } from '../../server-access/access';
import {
  runGameCmd as executeGameCmd,
  runGameCmdSequence as executeGameCmdSequence,
  sendGameRouteError,
} from './gameCommandExecution';
import {
  parseConVarValue,
  parseIntBody,
  requireAllowlisted,
  sanitizeCfgName,
} from '../../../integrations/rcon/rconCommandPolicy';

type FixedTemplateCommand = Readonly<{
  command: string;
  valueForCommand?: (value: number) => number;
}>;

type FixedTemplateSequenceRouteOptions = Readonly<{
  action: string;
  parseValue: (value: unknown) => number | null;
  allowlist: readonly number[];
  invalidValueMessage: string;
  commandTemplates: readonly [FixedTemplateCommand, FixedTemplateCommand];
  successMessage: (value: number) => string;
}>;

function forwardRouteResult(result: Promise<void>, next: NextFunction): void {
  void result.catch((error: unknown) => next(error));
}

function runRouteAction(handler: () => Promise<void>, next: NextFunction): void {
  forwardRouteResult(handler(), next);
}

export function createGameRouteFactories(
  rcon: RconManager,
  { requireAuthorizedServerId }: ServerAccess
) {
  const runGameCmd = (serverId: string, command: string) => executeGameCmd(rcon, serverId, command);
  const runGameCmdSequence = (serverId: string, commands: readonly string[]) =>
    executeGameCmdSequence(rcon, serverId, commands);
  function makeToggleRoute(action: string, convar: string, msgLabel?: string): RequestHandler {
    return (req, res, next) => {
      runRouteAction(async () => {
        try {
          const serverId = requireAuthorizedServerId(req, res);
          if (!serverId) return;
          const value = parseConVarValue(req.body?.value);
          if (value === null) {
            res.status(400).json({ error: 'value must be 0 or 1' });
            return;
          }
          logger.info(
            { user: req.session?.user?.username ?? 'unknown', action, value },
            '[game] action'
          );
          await runGameCmd(serverId, `${convar} ${value}`);
          res
            .status(200)
            .json({ message: `${msgLabel ?? convar} command sent with value ${value}.` });
        } catch (err) {
          sendGameRouteError(res, err, action);
        }
      }, next);
    };
  }

  function makeSimpleCmdRoute(
    action: string,
    command: string,
    successMessage: string
  ): RequestHandler {
    return (req, res, next) => {
      runRouteAction(async () => {
        try {
          const serverId = requireAuthorizedServerId(req, res);
          if (!serverId) return;
          logger.info({ user: req.session?.user?.username ?? 'unknown', action }, '[game] action');
          await runGameCmd(serverId, command);
          res.status(200).json({ message: successMessage });
        } catch (err) {
          sendGameRouteError(res, err, action);
        }
      }, next);
    };
  }

  function makeSequenceRoute(
    action: string,
    steps: (string | { cfg: string })[],
    successMessage: string
  ): RequestHandler {
    return (req, res, next) => {
      runRouteAction(async () => {
        try {
          const serverId = requireAuthorizedServerId(req, res);
          if (!serverId) return;
          logger.info({ user: req.session?.user?.username ?? 'unknown', action }, '[game] action');
          const commands = steps.map((step) => {
            if (typeof step === 'string') return step;
            const safeName = sanitizeCfgName(step.cfg);
            if (!safeName) throw new Error('Invalid cfg name');
            return `exec ${safeName}`;
          });
          await runGameCmdSequence(serverId, commands);
          res.status(200).json({ message: successMessage });
        } catch (err) {
          sendGameRouteError(res, err, action);
        }
      }, next);
    };
  }

  function makePresetRoute(
    action: string,
    convar: string,
    allowlist: readonly number[]
  ): RequestHandler {
    return (req, res, next) => {
      runRouteAction(async () => {
        try {
          const serverId = requireAuthorizedServerId(req, res);
          if (!serverId) return;
          const value = parseIntBody(req.body?.value);
          if (
            !requireAllowlisted(
              res,
              value,
              allowlist,
              `value must be one of: ${allowlist.join(', ')}`
            )
          ) {
            return;
          }
          logger.info(
            { user: req.session?.user?.username ?? 'unknown', action, value },
            '[game] action'
          );
          await runGameCmd(serverId, `${convar} ${value}`);
          res.status(200).json({ message: `${convar} command sent with value ${value}.` });
        } catch (err) {
          sendGameRouteError(res, err, action);
        }
      }, next);
    };
  }

  /** Creates a validated two-command route from fixed command templates. */
  function makeFixedTemplateSequenceRoute({
    action,
    parseValue,
    allowlist,
    invalidValueMessage,
    commandTemplates,
    successMessage,
  }: FixedTemplateSequenceRouteOptions): RequestHandler {
    return (req, res, next) => {
      runRouteAction(async () => {
        try {
          const serverId = requireAuthorizedServerId(req, res);
          if (!serverId) return;
          const value = parseValue(req.body?.value);
          const numericValue = value ?? Number.NaN;
          if (!requireAllowlisted(res, numericValue, allowlist, invalidValueMessage)) return;
          logger.info(
            { user: req.session?.user?.username ?? 'unknown', action, value: numericValue },
            '[game] action'
          );
          await runGameCmdSequence(
            serverId,
            commandTemplates.map(
              ({ command, valueForCommand }) =>
                `${command} ${valueForCommand ? valueForCommand(numericValue) : numericValue}`
            )
          );
          res.status(200).json({ message: successMessage(numericValue) });
        } catch (err) {
          sendGameRouteError(res, err, action);
        }
      }, next);
    };
  }
  return {
    makeToggleRoute,
    makeSimpleCmdRoute,
    makeSequenceRoute,
    makePresetRoute,
    makeFixedTemplateSequenceRoute,
    runGameCmd,
    runGameCmdSequence,
    execCfg: (serverId: string, cfg: string) =>
      executeGameCmd(rcon, serverId, `exec ${sanitizeCfgName(cfg)}`),
  };
}
