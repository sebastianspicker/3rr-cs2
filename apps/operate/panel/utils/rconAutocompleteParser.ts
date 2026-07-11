function isAutocompleteDataLine(line: string): boolean {
  if (!line || /^[-=]+$/.test(line) || /^(cmdlist|cvarlist)$/i.test(line)) return false;
  return !/\b(total|commands?|cvars?)\b/i.test(line) && !/^\]/.test(line);
}

export function parseAutocompleteOutput(...outputs: string[]): string[] {
  const suggestions = new Set<string>();
  for (const output of outputs) {
    if (typeof output !== 'string') continue;
    for (const rawLine of output.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!isAutocompleteDataLine(line)) continue;
      const suggestion = line.match(/^"?([A-Za-z0-9_:+.-]{2,64})"?\b/)?.[1];
      if (suggestion) suggestions.add(suggestion);
    }
  }
  return [...suggestions].sort((a, b) => a.localeCompare(b));
}
