/** SQLite persistence for per-user Workshop favorites. */
import type Database from 'better-sqlite3';
import { SQLITE_UTC_NOW } from '../../infrastructure/sqlite';

export interface WorkshopFavoriteRow {
  id: number;
  workshop_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export function createWorkshopRepository(db: Database.Database) {
  const base = `SELECT id, workshop_id, name, created_at, updated_at FROM workshop_favorites WHERE user_id = ? AND server_id = ?`;
  const listStmt = db.prepare(`${base} ORDER BY updated_at DESC, id DESC`);
  const upsertStmt = db.prepare(
    `INSERT INTO workshop_favorites (user_id, server_id, workshop_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ${SQLITE_UTC_NOW}, ${SQLITE_UTC_NOW}) ON CONFLICT(user_id, server_id, workshop_id) DO UPDATE SET name = excluded.name, updated_at = ${SQLITE_UTC_NOW}`
  );
  const byWorkshopStmt = db.prepare(`${base} AND workshop_id = ?`);
  const byIdStmt = db.prepare(`${base} AND id = ?`);
  const updateStmt = db.prepare(
    `UPDATE workshop_favorites SET workshop_id = ?, name = ?, updated_at = ${SQLITE_UTC_NOW} WHERE id = ? AND user_id = ? AND server_id = ?`
  );
  const removeStmt = db.prepare(
    `DELETE FROM workshop_favorites WHERE id = ? AND user_id = ? AND server_id = ?`
  );

  function listFavorites(userId: number | undefined, serverId: string): WorkshopFavoriteRow[] {
    return listStmt.all(userId, serverId) as WorkshopFavoriteRow[];
  }

  function upsertFavorite(
    userId: number | undefined,
    serverId: string,
    workshopId: string,
    name: string
  ): void {
    upsertStmt.run(userId, serverId, workshopId, name);
  }

  function findByWorkshopId(
    userId: number | undefined,
    serverId: string,
    workshopId: string
  ): WorkshopFavoriteRow | undefined {
    return byWorkshopStmt.get(userId, serverId, workshopId) as WorkshopFavoriteRow | undefined;
  }

  function findById(
    userId: number | undefined,
    serverId: string,
    id: number
  ): WorkshopFavoriteRow | undefined {
    return byIdStmt.get(userId, serverId, id) as WorkshopFavoriteRow | undefined;
  }

  function updateFavorite(
    workshopId: string,
    name: string,
    id: number,
    userId: number | undefined,
    serverId: string
  ): void {
    updateStmt.run(workshopId, name, id, userId, serverId);
  }

  function deleteFavorite(id: number, userId: number | undefined, serverId: string): number {
    return removeStmt.run(id, userId, serverId).changes;
  }

  return {
    listFavorites,
    upsertFavorite,
    findByWorkshopId,
    findById,
    updateFavorite,
    deleteFavorite,
  };
}

export type WorkshopRepository = ReturnType<typeof createWorkshopRepository>;
