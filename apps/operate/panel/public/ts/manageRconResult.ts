import { showToast } from './common';
import { appendRconOutput } from './manageRconAppend';

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
  if (!data.output || type === 'info') showToast(data.message, type);
}
