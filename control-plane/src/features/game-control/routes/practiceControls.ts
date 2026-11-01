/** Registers validated practice and quick-control RCON routes. */
import type { Router } from 'express';
import { z } from 'zod';
import type { RequestHandler } from 'express';
import { parseConVarValue, parseIntBody } from '../../../integrations/rcon';
import type { createGameRouteFactories } from './gameRouteFactories';
import { createRouteRateLimit } from '../../../shared/routeRateLimit';

const routeRateLimit = createRouteRateLimit();

const VALID_GIVE_WEAPONS = [
  'weapon_flashbang',
  'weapon_smokegrenade',
  'weapon_hegrenade',
  'weapon_molotov',
  'weapon_decoy',
  'weapon_incgrenade',
] as const;
const GIVE_WEAPON_ERROR = `weapon must be one of: ${VALID_GIVE_WEAPONS.join(', ')}`;
// The object-level error keeps the same message for a missing or non-object body.
const GiveWeaponBodySchema = z.object(
  { weapon: z.enum(VALID_GIVE_WEAPONS, { error: GIVE_WEAPON_ERROR }) },
  { error: GIVE_WEAPON_ERROR }
);

export function registerPracticeControls(
  router: Router,
  isAuthenticated: RequestHandler,
  {
    makeBodyCmdRoute,
    makeFixedTemplateSequenceRoute,
    makePresetRoute,
    makeSimpleCmdRoute,
    makeToggleRoute,
  }: ReturnType<typeof createGameRouteFactories>
): void {
  router.post('/api/cheats-toggle', isAuthenticated, makeToggleRoute('cheats-toggle', 'sv_cheats'));
  router.post(
    '/api/free-armor-toggle',
    isAuthenticated,
    makeToggleRoute('free-armor-toggle', 'mp_free_armor')
  );
  router.post(
    '/api/buy-anywhere-toggle',
    isAuthenticated,
    makeToggleRoute('buy-anywhere-toggle', 'mp_buy_anywhere')
  );
  router.post(
    '/api/grenade-trajectory-toggle',
    isAuthenticated,
    makeToggleRoute(
      'grenade-trajectory-toggle',
      'sv_grenade_trajectory_prac_pipreview',
      'sv_grenade_trajectory'
    )
  );
  router.post(
    '/api/show-impacts-toggle',
    isAuthenticated,
    makeToggleRoute('show-impacts-toggle', 'sv_showimpacts')
  );

  router.post(
    '/api/respawn-toggle',
    isAuthenticated,
    makeFixedTemplateSequenceRoute({
      action: 'respawn-toggle',
      parseValue: parseConVarValue,
      allowlist: [0, 1],
      invalidValueMessage: 'value must be 0 or 1',
      commandTemplates: [
        { command: 'mp_respawn_on_death_ct' },
        { command: 'mp_respawn_on_death_t' },
      ],
      successMessage: (value) => `Respawn command sequence sent with value ${value}.`,
    })
  );

  router.post(
    '/api/infinite-ammo-toggle',
    isAuthenticated,
    makePresetRoute('infinite-ammo-toggle', 'sv_infinite_ammo', [0, 1, 2])
  );
  router.post(
    '/api/set-freezetime',
    isAuthenticated,
    makePresetRoute('set-freezetime', 'mp_freezetime', [0, 5, 10, 15, 20])
  );

  router.post(
    '/api/set-startmoney',
    isAuthenticated,
    makeFixedTemplateSequenceRoute({
      action: 'set-startmoney',
      parseValue: (value) => parseIntBody(value),
      allowlist: [0, 800, 1600, 3200, 16000],
      invalidValueMessage: 'value must be one of: 0, 800, 1600, 3200, 16000',
      commandTemplates: [
        { command: 'mp_startmoney' },
        { command: 'mp_maxmoney', valueForCommand: (value) => Math.max(value, 16000) },
      ],
      successMessage: (value) => `Start money command sequence sent with value ${value}.`,
    })
  );

  router.post(
    '/api/bot-difficulty',
    isAuthenticated,
    makePresetRoute('bot-difficulty', 'bot_difficulty', [0, 1, 2, 3])
  );

  router.post(
    '/api/set-roundtime',
    isAuthenticated,
    makeFixedTemplateSequenceRoute({
      action: 'set-roundtime',
      parseValue: (value) => parseIntBody(value),
      allowlist: [1, 2, 5, 60],
      invalidValueMessage: 'value must be one of: 1, 2, 5, 60',
      commandTemplates: [{ command: 'mp_roundtime' }, { command: 'mp_roundtime_defuse' }],
      successMessage: (value) => `Round time command sequence sent with value ${value} min.`,
    })
  );

  router.post(
    '/api/bot-add-ct',
    isAuthenticated,
    makeSimpleCmdRoute('bot-add-ct', 'bot_add ct', 'CT bot add command sent.')
  );
  router.post(
    '/api/bot-add-t',
    isAuthenticated,
    makeSimpleCmdRoute('bot-add-t', 'bot_add t', 'T bot add command sent.')
  );
  router.post(
    '/api/bot-kick-ct',
    isAuthenticated,
    makeSimpleCmdRoute('bot-kick-ct', 'bot_kick ct', 'CT bot kick command sent.')
  );
  router.post(
    '/api/bot-kick-t',
    isAuthenticated,
    makeSimpleCmdRoute('bot-kick-t', 'bot_kick t', 'T bot kick command sent.')
  );

  router.post(
    '/api/give-weapon',
    isAuthenticated,
    routeRateLimit,
    makeBodyCmdRoute(
      'give-weapon',
      GiveWeaponBodySchema,
      ({ weapon }) => `give ${weapon}`,
      ({ weapon }) => `Give ${weapon} command sent.`
    )
  );
}
