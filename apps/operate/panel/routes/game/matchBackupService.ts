import { runGameCmd } from './helpers';
import type { LatestBackupState } from './matchContracts';

export interface BackupRestoreResponse {
  status: number;
  body: Record<string, unknown>;
}

export async function restoreLatestBackup(
  serverId: string,
  backup: LatestBackupState
): Promise<BackupRestoreResponse> {
  if (backup.backup_state === 'file') {
    await runGameCmd(serverId, `mp_backup_restore_load_file ${backup.file}`);
    await runGameCmd(serverId, 'css_matchzy_pause');
    return {
      status: 200,
      body: {
        message: `Latest backup restore commands sent (${backup.file}).`,
        backup_state: 'restore_requested',
        observed: false,
        backup_file: backup.file,
      },
    };
  }
  if (backup.backup_state === 'none') {
    return {
      status: 200,
      body: { message: 'No latest backup reported by server.', backup_state: 'none' },
    };
  }
  if (backup.backup_state === 'unsafe_filename') {
    return {
      status: 502,
      body: {
        error: 'Latest backup response contained an unsafe filename; backup state unknown',
        backup_state: 'unsafe_filename',
      },
    };
  }
  const error =
    backup.backup_state === 'unknown'
      ? 'Latest backup response was empty; backup state unknown'
      : 'Latest backup response was malformed; backup state unknown';
  return { status: 502, body: { error, backup_state: backup.backup_state } };
}
