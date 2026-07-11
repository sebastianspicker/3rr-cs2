export function validRestoreRound(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 99;
}

export function workshopIdFromInput(value: string): string | null {
  if (/^\d{5,20}$/.test(value)) return value;
  return value.match(/(?:id=|filedetails\/\?id=)(\d{5,20})/)?.[1] ?? null;
}
