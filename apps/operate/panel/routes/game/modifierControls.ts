/** Registers general game modifiers and quick practice commands. */
import type { Router } from 'express';
import isAuthenticated from '../../modules/middleware';
import { makePresetRoute, makeSimpleCmdRoute, makeToggleRoute } from './helpers';

export function registerModifierControls(router: Router): void {
  router.post(
    '/api/damage-print-toggle',
    isAuthenticated,
    makeToggleRoute('damage-print-toggle', 'mp_damage_print_enable', 'Damage Print')
  );
  router.post(
    '/api/set-buytime',
    isAuthenticated,
    makePresetRoute('set-buytime', 'mp_buytime', [10, 15, 30, 45, 90])
  );
  router.post(
    '/api/noclip',
    isAuthenticated,
    makeSimpleCmdRoute('noclip', 'noclip', 'Noclip command sent.')
  );
  router.post(
    '/api/rethrow-grenade',
    isAuthenticated,
    makeSimpleCmdRoute(
      'rethrow-grenade',
      'sv_rethrow_last_grenade',
      'Rethrow grenade command sent.'
    )
  );
}
