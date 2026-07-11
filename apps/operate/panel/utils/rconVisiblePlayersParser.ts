export function parseVisibleMaxPlayers(text: string): number | null {
  if (typeof text !== 'string' || !text.trim()) return null;
  const value = Number.parseInt(
    text.match(/sv_visiblemaxplayers"?\s*(?:=|:)?\s*"?(-?\d+)/i)?.[1] ?? '',
    10
  );
  return value > 0 ? value : null;
}
