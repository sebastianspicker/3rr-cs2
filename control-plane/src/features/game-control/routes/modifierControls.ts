/** Registers general game modifiers and quick practice commands. */
import type { Router } from 'express';
import type { RequestHandler } from 'express';
import type { createGameRouteFactories } from './gameRouteFactories';

export function registerModifierControls(
  router: Router,
  isAuthenticated: RequestHandler,
  {
    makePresetRoute,
    makeSimpleCmdRoute,
    makeToggleRoute,
  }: ReturnType<typeof createGameRouteFactories>
): void {
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
