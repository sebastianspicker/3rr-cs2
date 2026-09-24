/** Composes SQLite user persistence with RCON teardown for orphaned servers. */
import type Database from 'better-sqlite3';
import type { RconManager } from '../../../integrations/rcon';
import type { ServerAccess } from '../../server-access/access';
import { createUsersRepository } from '../repository';

export function createUserPersistence(
  db: Database.Database,
  rcon: RconManager,
  _access: ServerAccess
) {
  const repository = createUsersRepository(db);

  /** Attempts every orphaned-server cleanup and returns only IDs whose RCON teardown failed. */
  async function cleanupDeletedUserServers(serverIds: number[]): Promise<number[]> {
    const cleanupResults = await Promise.allSettled(
      serverIds.map((serverId) => rcon.removeServer(String(serverId)))
    );
    return cleanupResults.flatMap((result, index) => {
      const serverId = serverIds[index];
      return result.status === 'rejected' && serverId !== undefined ? [serverId] : [];
    });
  }

  return {
    ...repository,
    cleanupDeletedUserServers,
  };
}
export type UserPersistence = ReturnType<typeof createUserPersistence>;
