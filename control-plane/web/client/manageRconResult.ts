/** Presents RCON results without treating partial execution as unqualified success. */
import { showToast } from './common';
import { appendRconOutput } from './manageRconAppend';
import { setText } from './manageShared';

export interface RconCommandResponse {
  message: string;
  output?: string;
  history_recorded?: boolean;
  partial?: boolean;
}

export function renderRconCommandResult(command: string, data: RconCommandResponse): void {
  if (data.output) {
    appendRconOutput(command, data.output);
  }
  const type = data.history_recorded === false && data.partial ? 'info' : 'success';
  setText(
    'rcon-command-status',
    `RCON command completed at ${new Date().toLocaleTimeString()}: ${data.message}`
  );
  if (!data.output || type === 'info') showToast(data.message, type);
}
