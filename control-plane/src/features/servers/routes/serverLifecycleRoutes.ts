import express from 'express';
import type Database from 'better-sqlite3';
import type { RequestHandler } from 'express';
import logger from '../../../infrastructure/logging';
import { isValidServerHostResolved, type RconManager } from '../../../integrations/rcon';
import { RconSecretDecryptError } from '../../../infrastructure/credentials/rconCredential';
import type { ServerAccess } from '../../server-access/access';
import { createServersRepository } from '../repository';
const RCON_CREDENTIAL_STORAGE_ERROR =
  'Stored RCON credential could not be decrypted; check RCON_SECRET_KEY or saved credential';

export function createServerLifecycleRoutes(
  db: Database.Database,
  rcon: RconManager,
  isAuthenticated: RequestHandler,
  { authenticatedUserId, requireServerId }: ServerAccess
): express.Router {
  const router = express.Router();
  const repository = createServersRepository(db);

  async function cleanupDeletedServerRcon(
    serverId: string,
    serverDeleted: boolean
  ): Promise<boolean> {
    if (!serverDeleted) return true;
    try {
      await rcon.removeServer(serverId);
      return true;
    } catch (err) {
      logger.error({ err, server_id: serverId }, '[server] delete-server RCON cleanup failed');
      return false;
    }
  }

  router.post('/api/reconnect-server', isAuthenticated, async (req, res) => {
    try {
      const serverId = requireServerId(req, res);
      if (!serverId) return;
      const server = repository.findAccessibleServerFull(serverId, req.session.user?.id);
      if (!server) return res.status(404).json({ error: 'Server not found' });
      if (!(await isValidServerHostResolved(server.serverIP))) {
        logger.warn(
          { server_id: serverId, serverIP: server.serverIP },
          '[server] reconnect blocked: IP resolves to a blocked local/control range'
        );
        return res.status(400).json({ error: 'Server address resolves to a disallowed IP range' });
      }
      if (!(await rcon.connectServer(server))) {
        return res.status(502).json({
          error: 'Unable to establish an authenticated RCON connection for this server',
        });
      }
      res.status(200).json({ message: 'Reconnected successfully' });
    } catch (err) {
      logger.error({ err }, '[server] reconnect-server error');
      if (err instanceof RconSecretDecryptError) {
        return res.status(500).json({
          error: RCON_CREDENTIAL_STORAGE_ERROR,
          credential_error: err.kind,
        });
      }
      res.status(500).json({ error: 'An error occurred while reconnecting to the server.' });
    }
  });

  router.post('/api/delete-server', isAuthenticated, async (req, res) => {
    try {
      const serverId = requireServerId(req, res);
      if (!serverId) return;
      const ownerId = authenticatedUserId(req);
      if (ownerId === null) return res.status(401).json({ error: 'Unauthorized' });
      const deleted = repository.deleteServerAndAccess(serverId, ownerId);
      if (!deleted.found) return res.status(404).json({ error: 'Server not found' });
      if (!(await cleanupDeletedServerRcon(serverId, deleted.serverDeleted))) {
        return res.status(500).json({
          error: 'Server deleted, but RCON cleanup failed',
          server_deleted: true,
          rcon_cleanup: 'failed',
        });
      }
      return res.status(200).json({
        message: deleted.serverDeleted
          ? 'Server deleted successfully'
          : 'Server access removed successfully',
        server_deleted: deleted.serverDeleted,
        rcon_cleanup: deleted.serverDeleted ? 'completed' : 'not_needed',
      });
    } catch (err) {
      logger.error({ err }, '[server] delete-server error');
      res.status(500).json({ error: 'An error occurred while deleting the server.' });
    }
  });

  return router;
}
