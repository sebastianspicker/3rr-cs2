import { z } from 'zod';
import { better_sqlite_client } from '../../db';
import { RCON_USERID_RE } from '../../utils/rconParsers';
import { sanitizeBackupFileName } from './helpers';

export const updateRequestedSetupStmt = better_sqlite_client.prepare(`
  UPDATE servers
     SET last_map        = ?,
         last_game_type  = ?,
         last_game_mode  = ?
   WHERE id = ?
`);

export const SetupGameBodySchema = z.object({
  game_type: z.string().min(1),
  game_mode: z.string().min(1),
  selectedMap: z.string().min(1),
  team1: z.string().optional(),
  team2: z.string().optional(),
});
export const WorkshopMapBodySchema = z.object({
  workshop_id: z.string().regex(/^\d{5,20}$/, 'workshop_id must be 5-20 digits'),
});
export const RestoreRoundBodySchema = z.object({
  round_number: z.number().int().min(1).max(99),
});
export const MatchzyReadyRequiredBodySchema = z.object({
  value: z.number().int().min(0).max(10),
});
export const MatchzyCoachBodySchema = z.object({ side: z.enum(['ct', 't']) });
export const MatchFileBodySchema = z.object({
  filename: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-zA-Z0-9_.-]+\.json$/, 'filename must be a .json file with safe characters'),
});
export const PlayerUserIdBodySchema = z.object({
  userid: z
    .string()
    .regex(RCON_USERID_RE, 'userid must be 1–5 digits (use `status` in RCON to find it)'),
});
export const PlayerSteamId64BodySchema = z.object({
  steamid: z.string().regex(/^\d{17}$/, 'steamid must be exactly 17 digits (SteamID64)'),
});
export const MapGroupBodySchema = z.object({
  group: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9_]+$/, 'group must contain only alphanumeric characters and underscores'),
});
export const WorkshopCollectionBodySchema = z.object({
  collection_id: z.string().regex(/^\d{5,20}$/, 'collection_id must be 5–20 digits'),
});

export type LatestBackupState =
  | { backup_state: 'file'; file: string }
  | { backup_state: 'none' }
  | { backup_state: 'unknown' }
  | { backup_state: 'malformed_response' }
  | { backup_state: 'unsafe_filename'; raw_value: string };

function backupStateFromRawValue(rawValue: string): LatestBackupState {
  const raw = rawValue.trim();
  if (!raw) return { backup_state: 'none' };
  const file = sanitizeBackupFileName(raw);
  return file
    ? { backup_state: 'file', file }
    : { backup_state: 'unsafe_filename', raw_value: raw };
}

function backupValueFromLine(line: string): string | null {
  const quoted = line.match(/^\s*"?mp_backup_round_file_last"?\s*=\s*"([^"\r\n]*)"/);
  const quotedValue = quoted?.at(1);
  if (typeof quotedValue === 'string') return quotedValue;
  const unquoted = line.match(/^\s*"?mp_backup_round_file_last"?\s*=\s*([^\s\r\n]+)/);
  const unquotedValue = unquoted?.at(1);
  return typeof unquotedValue === 'string' ? unquotedValue : null;
}

export function parseLatestBackupState(text: unknown): LatestBackupState {
  if (typeof text !== 'string' || text.trim().length === 0) return { backup_state: 'unknown' };
  for (const line of text.split(/\r?\n/)) {
    const value = backupValueFromLine(line);
    if (value !== null) return backupStateFromRawValue(value);
  }
  return { backup_state: 'malformed_response' };
}

export function isExplicitNoBackupList(text: string): boolean {
  return /\b(no|none)\b.*\b(backups?|files?)\b|\b(backups?|files?)\b.*\b(no|none)\b/i.test(text);
}
