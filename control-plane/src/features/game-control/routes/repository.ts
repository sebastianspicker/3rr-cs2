/** SQLite persistence for the most recently requested match setup per server. */
import type Database from 'better-sqlite3';

export function createMatchRepository(db: Database.Database) {
  const updateRequestedSetupStmt = db.prepare(`
    UPDATE servers
       SET last_map        = ?,
           last_game_type  = ?,
           last_game_mode  = ?
     WHERE id = ?
  `);

  function updateRequestedSetup(
    mapName: string,
    gameType: string,
    gameMode: string,
    serverId: string
  ): void {
    updateRequestedSetupStmt.run(mapName, gameType, gameMode, serverId);
  }

  return { updateRequestedSetup };
}

export type MatchRepository = ReturnType<typeof createMatchRepository>;
