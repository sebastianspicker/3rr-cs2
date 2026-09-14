import { currentExecutionOptions } from '../../shared/executionContext';
/** Bounded RCON autocomplete cache for authenticated operator input. */
import type { RconManager } from '../../integrations/rcon/rcon';
import logger from '../../infrastructure/logging';
import { parseAutocompleteOutput } from '../../integrations/rcon/rconParsers';
import { isRconCommandAllowed } from '../../integrations/rcon/rconCommandPolicy';

const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 15;

export interface AutocompleteCacheEntry {
  expiresAt: number;
  suggestions: string[];
  observedAt: string;
  error: string | null;
}

export interface AutocompleteLoadResult {
  entry: AutocompleteCacheEntry;
  cached: boolean;
}

export function parseAutocompleteLimit(value: unknown): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.min(Math.max(parsed, 1), MAX_LIMIT);
}

export function autocompleteQuery(value: unknown): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .slice(0, 64);
}

function collectAutocompleteResult(
  result: PromiseSettledResult<string>,
  name: string,
  serverId: string,
  outputs: string[],
  errors: string[]
): void {
  if (result.status === 'fulfilled') outputs.push(result.value);
  else {
    logger.warn({ server_id: serverId, err: result.reason }, `[rcon] ${name} failed`);
    errors.push(`${name} unavailable`);
  }
}

export function createAutocompleteLoader(rcon: RconManager) {
  const cache = new Map<string, AutocompleteCacheEntry>();

  async function loadAutocomplete(
    serverId: string,
    refresh: boolean
  ): Promise<AutocompleteLoadResult> {
    const cached = cache.get(serverId);
    if (!refresh && cached && cached.expiresAt > Date.now()) return { entry: cached, cached: true };
    const results = await Promise.allSettled([
      rcon.executeCommand(serverId, 'cmdlist', {
        ...currentExecutionOptions(),
        classification: 'observation',
      }),
      rcon.executeCommand(serverId, 'cvarlist', {
        ...currentExecutionOptions(),
        classification: 'observation',
      }),
    ]);
    const outputs: string[] = [];
    const errors: string[] = [];
    collectAutocompleteResult(
      results[0] as PromiseSettledResult<string>,
      'cmdlist',
      serverId,
      outputs,
      errors
    );
    collectAutocompleteResult(
      results[1] as PromiseSettledResult<string>,
      'cvarlist',
      serverId,
      outputs,
      errors
    );
    const entry: AutocompleteCacheEntry = {
      expiresAt: Date.now() + CACHE_TTL_MS,
      suggestions: parseAutocompleteOutput(...outputs).filter(isRconCommandAllowed),
      observedAt: outputs.length ? new Date().toISOString() : '',
      error: errors.length ? errors.join('; ') : null,
    };
    cache.set(serverId, entry);
    return { entry, cached: false };
  }
  return { loadAutocomplete };
}
