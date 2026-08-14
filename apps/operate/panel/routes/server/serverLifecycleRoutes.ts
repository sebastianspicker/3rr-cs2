import express from 'express';
import { better_sqlite_client } from '../../db';
import isAuthenticated from '../../modules/middleware';
import rcon from '../../modules/rcon';
import logger from '../../utils/logger';
import { isValidServerHostResolved } from '../../utils/networkValidation';
import { RconSecretDecryptError } from '../../utils/rconSecret';
import {
  authenticatedUserId,
  requireServerId,
  selectAccessibleServerSql,
} from '../../utils/serverAccess';

const router = express.Router();
const RCON_CREDENTIAL_STORAGE_ERROR =
  'Stored RCON credential could not be decrypted; check RCON_SECRET_KEY or saved credential';

interface ServerFullRow {
  id: number;
  serverIP: string;
  serverPort: number;
  rconPassword: string;
}

const selectServerByIdStmt = better_sqlite_client.prepare(
  selectAccessibleServerSql('s.id, s.serverIP, s.serverPort, s.rconPassword')
);
const deleteServerAccessStmt = better_sqlite_client.prepare(
  'DELETE FROM server_access WHERE server_id = ? AND user_id = ?'
);
const deleteOrphanServerStmt = better_sqlite_client.prepare(
  'DELETE FROM servers WHERE id = ? AND NOT EXISTS (SELECT 1 FROM server_access WHERE server_id = ?)'
);
const deleteServerAndAccess = better_sqlite_client.transaction(
  (serverId: string, ownerId: number): { found: boolean; serverDeleted: boolean } => {
    const accessResult = deleteServerAccessStmt.run(serverId, ownerId);
    if (accessResult.changes === 0) return { found: false, serverDeleted: false };
    const orphanResult = deleteOrphanServerStmt.run(serverId, serverId);
    return { found: true, serverDeleted: orphanResult.changes > 0 };
  }
);

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
    const server = selectServerByIdStmt.get(serverId, req.session.user?.id) as
      | ServerFullRow
      | undefined;
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
    const deleted = deleteServerAndAccess(serverId, ownerId);
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

export default router;
