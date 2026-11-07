/** Parses narrow workshop and restore inputs before requests reach the server. */
export function restoreRoundFromInput(value: string): number | null {
  // Digits only: Number() would turn "1e1" into 10 and "0x1A" into 26.
  const round = /^\d{1,2}$/.test(value.trim()) ? Number(value.trim()) : 0;
  return round >= 1 ? round : null;
}

export function workshopIdFromInput(value: string): string | null {
  if (/^\d{5,20}$/.test(value)) return value;
  return value.match(/(?:id=|filedetails\/\?id=)(\d{5,20})/)?.[1] ?? null;
}
