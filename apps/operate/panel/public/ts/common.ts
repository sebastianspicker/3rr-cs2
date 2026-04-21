export interface ApiResponse {
  message: string;
  output?: string;
}

export function escapeHtml(str: unknown): string {
  if (str == null) return '';
  const s = String(str);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function sendPostRequest(
  endpoint: string,
  data: Record<string, unknown> = {},
): Promise<ApiResponse> {
  const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  });
  if (!resp.ok) {
    if (resp.status === 401) {
      window.location.href = '/?expired=1';
      throw new Error('Session expired — redirecting to login');
    }
    let errMsg = `Request failed (${resp.status})`;
    try {
      const errBody = await resp.json() as { error?: string; message?: string };
      if (errBody.error) errMsg = errBody.error;
      else if (errBody.message) errMsg = errBody.message;
    } catch { /* non-JSON body — keep default */ }
    throw new Error(errMsg);
  }
  return resp.json() as Promise<ApiResponse>;
}

export function initToast(): void {
  if (!document.getElementById('cs-toast-container')) {
    const container = document.createElement('div');
    container.id = 'cs-toast-container';
    container.setAttribute('role', 'status');
    container.setAttribute('aria-live', 'polite');
    document.body.appendChild(container);
  }
}

export function toastError(fallback: string): (e: unknown) => void {
  return (e) => showToast(e instanceof Error ? e.message : fallback, 'error');
}

export function withLoading(btn: HTMLButtonElement | null, action: () => Promise<void>): void {
  if (btn) { btn.disabled = true; btn.classList.add('btn-loading'); }
  action()
    .catch(() => { /* caller already handles errors via .catch(toastError(...)) */ })
    .finally(() => { if (btn) { btn.disabled = false; btn.classList.remove('btn-loading'); } });
}

export function showToast(msg: string, type: 'success' | 'error' | 'info'): void {
  const container = document.getElementById('cs-toast-container');
  if (!container) return;
  const t = document.createElement('div');
  t.className = `cs-toast cs-toast--${type}`;
  t.textContent = msg;
  container.appendChild(t);
  requestAnimationFrame(() => { t.classList.add('cs-toast--visible'); });
  setTimeout(() => {
    t.classList.remove('cs-toast--visible');
    setTimeout(() => t.remove(), 220);
  }, 3000);
}

export function showConfirm(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'cs-modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'cs-modal';

    const msgEl = document.createElement('p');
    msgEl.className = 'cs-modal-message';
    msgEl.textContent = message;

    const actions = document.createElement('div');
    actions.className = 'cs-modal-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-secondary cs-modal-cancel';
    cancelBtn.textContent = 'Cancel';

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'btn btn-danger cs-modal-confirm';
    confirmBtn.textContent = 'Confirm';

    actions.append(cancelBtn, confirmBtn);
    modal.append(msgEl, actions);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'cs-modal-msg');
    msgEl.id = 'cs-modal-msg';
    const previouslyFocused = document.activeElement as HTMLElement | null;
    confirmBtn.focus();

    const focusableEls: HTMLButtonElement[] = [cancelBtn, confirmBtn];
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cleanup(false);
      } else if (e.key === 'Tab') {
        e.preventDefault();
        const idx = focusableEls.indexOf(document.activeElement as HTMLButtonElement);
        const next = e.shiftKey
          ? (idx - 1 + focusableEls.length) % focusableEls.length
          : (idx + 1) % focusableEls.length;
        focusableEls[next]?.focus();
      }
    };

    const cleanup = (result: boolean) => {
      cancelBtn.disabled = true;
      confirmBtn.disabled = true;
      document.removeEventListener('keydown', keyHandler);
      overlay.remove();
      previouslyFocused?.focus();
      resolve(result);
    };

    cancelBtn.addEventListener('click', () => cleanup(false));
    confirmBtn.addEventListener('click', () => cleanup(true));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cleanup(false);
    });
    document.addEventListener('keydown', keyHandler);
  });
}
