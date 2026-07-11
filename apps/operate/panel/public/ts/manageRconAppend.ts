import { cleanRconDisplayText } from '../../utils/rconDisplay';
import { el } from './manageShared';

export function appendRconOutput(command: string, output: string): void {
  const resultText = el<HTMLElement>('#rconResultText');
  if (!resultText) return;
  const previous = resultText.textContent ?? '';
  const entry = `[${new Date().toLocaleTimeString()}] > ${cleanRconDisplayText(command)}\n${cleanRconDisplayText(output)}`;
  resultText.textContent = previous ? `${previous}\n${entry}` : entry;
  resultText.scrollTop = resultText.scrollHeight;
  const resultBox = el<HTMLElement>('#rconResultBox');
  if (resultBox) resultBox.style.display = 'block';
}
