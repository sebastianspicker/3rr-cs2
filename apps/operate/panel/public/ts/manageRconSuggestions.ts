export function renderSuggestions(container: HTMLElement | null, suggestions: string[]): void {
  if (!container) return;
  container.replaceChildren();
  container.hidden = suggestions.length === 0;
  suggestions.forEach(suggestion => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'suggestion-row btn btn-secondary';
    button.textContent = suggestion;
    button.dataset.suggestion = suggestion;
    container.appendChild(button);
  });
}
