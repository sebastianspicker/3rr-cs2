import { z } from 'zod';
import mapsConfigRaw from '../cfg/maps.json';

const GameModeSchema = z.object({
  exec: z.string(),
  mapGroups: z.array(z.string()),
  comingSoon: z.boolean().optional(),
});

const GameTypeSchema = z.object({
  gameModes: z.record(z.string(), GameModeSchema),
  comingSoon: z.boolean().optional(),
});

const MapGroupSchema = z.object({
  displayName: z.string(),
  maps: z.array(z.string()),
});

const MapsConfigSchema = z.object({
  gameTypes: z.record(z.string(), GameTypeSchema),
  mapGroups: z.record(z.string(), MapGroupSchema),
});

export type GameMode = z.infer<typeof GameModeSchema>;
export type GameType = z.infer<typeof GameTypeSchema>;
export type MapGroup = z.infer<typeof MapGroupSchema>;
export type MapsConfig = z.infer<typeof MapsConfigSchema>;

export const mapsConfig: MapsConfig = MapsConfigSchema.parse(mapsConfigRaw);

function getMapsForMode(gameType: string, gameMode: string): string[] {
  const gt = mapsConfig.gameTypes?.[gameType];
  const gm = gt?.gameModes?.[gameMode];
  if (!gm || !Array.isArray(gm.mapGroups)) return [];
  return gm.mapGroups.flatMap((mg) => mapsConfig.mapGroups?.[mg]?.maps ?? []);
}

export { getMapsForMode };
