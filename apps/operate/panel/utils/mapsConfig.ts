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

export const mapsConfig = MapsConfigSchema.parse(mapsConfigRaw);
const mapGroupsByName = new Map(Object.entries(mapsConfig.mapGroups));
const gameTypesByName = new Map(Object.entries(mapsConfig.gameTypes));

function getMapsForMode(gameType: string, gameMode: string): string[] {
  const gameTypeConfig = gameTypesByName.get(gameType);
  if (!gameTypeConfig) return [];
  const gameModeConfig = new Map(Object.entries(gameTypeConfig.gameModes)).get(gameMode);
  if (!gameModeConfig) return [];
  return gameModeConfig.mapGroups.flatMap(
    (mapGroupName) => mapGroupsByName.get(mapGroupName)?.maps ?? []
  );
}

export { getMapsForMode };
