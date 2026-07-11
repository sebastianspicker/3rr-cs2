const isPositiveSafeInteger = (value: number): boolean => {
  return Number.isSafeInteger(value) && value > 0;
};

const parseServerId = (val: unknown): string | null => {
  if (val == null || val === '' || Array.isArray(val)) return null;
  if (typeof val === 'number') return isPositiveSafeInteger(val) ? String(val) : null;
  const trimmed = String(val).trim();
  if (!/^[1-9]\d*$/.test(trimmed)) return null;
  const id = Number(trimmed);
  return isPositiveSafeInteger(id) ? String(id) : null;
};

export { parseServerId };
