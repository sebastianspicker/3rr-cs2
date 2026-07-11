import { cleanRconDisplayText } from './rconDisplay';

export const MAX_RCON_FIELD_LENGTH = 128;

export function cleanRconField(value: string, maxLength = MAX_RCON_FIELD_LENGTH): string {
  return cleanRconDisplayText(value, { trim: true, maxLength });
}
