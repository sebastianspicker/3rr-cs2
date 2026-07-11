const UNSAFE_RCON_DISPLAY_CODE_POINTS = new Set([0x0b, 0x0c, 0x7f, 0x2060, 0xfeff]);
const UNSAFE_RCON_DISPLAY_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x00, 0x08],
  [0x0e, 0x1f],
  [0x200b, 0x200f],
  [0x2028, 0x202f],
  [0xfff9, 0xfffb],
];

function isUnsafeRconDisplayCharacter(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  return (
    UNSAFE_RCON_DISPLAY_CODE_POINTS.has(code) ||
    UNSAFE_RCON_DISPLAY_RANGES.some(([start, end]) => code >= start && code <= end)
  );
}

interface RconDisplayCleanOptions {
  maxLength?: number;
  trim?: boolean;
}

export function cleanRconDisplayText(value: string, options: RconDisplayCleanOptions = {}): string {
  let cleaned = [...value].filter((char) => !isUnsafeRconDisplayCharacter(char)).join('');
  if (options.trim) cleaned = cleaned.trim();
  if (options.maxLength === undefined) return cleaned;
  return cleaned.slice(0, Math.max(0, options.maxLength));
}
