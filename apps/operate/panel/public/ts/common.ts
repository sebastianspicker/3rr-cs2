export interface ApiResponse {
  message: string;
  output?: string;
  command_sent?: boolean;
  history_recorded?: boolean;
  partial?: boolean;
}

type JsonMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

interface JsonRequestOptions {
  method?: JsonMethod;
  data?: Record<string, unknown>;
}

function csrfHeaders(): Record<string, string> {
  const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
  return csrfToken ? { 'X-CSRF-Token': csrfToken } : {};
}

function requestSameOrigin(endpoint: string, init: RequestInit): Promise<Response> {
  const url = new URL(endpoint, window.location.origin);
  if (url.origin !== window.location.origin) {
    throw new TypeError('API requests must remain on the panel origin');
  }

  return new Promise<Response>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open(init.method ?? 'GET', `${url.pathname}${url.search}`);
    new Headers(init.headers).forEach((value, name) => {
      request.setRequestHeader(name, value);
    });
    request.responseType = 'text';
    request.onload = () => {
      resolve(
        new Response(request.responseText, {
          status: request.status,
          statusText: request.statusText,
        })
      );
    };
    request.onerror = () => {
      reject(new TypeError('Network request failed'));
    };
    request.send(typeof init.body === 'string' ? init.body : null);
  });
}

export async function fetchJson<T>(
  endpoint: string,
  options: JsonRequestOptions = {},
): Promise<T> {
  const method = options.method ?? 'GET';
  const init: RequestInit = { method };
  if (method !== 'GET') {
    init.headers = {
      'Content-Type': 'application/json',
      ...csrfHeaders(),
    };
  }
  if (options.data !== undefined) {
    init.body = JSON.stringify(options.data);
  }

  const resp = await requestSameOrigin(endpoint, init);
  if (!resp.ok) {
    if (resp.status === 401) {
      window.location.assign('/?expired=1');
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
  return resp.json() as Promise<T>;
}

export async function sendPostRequest(
  endpoint: string,
  data: Record<string, unknown> = {},
): Promise<ApiResponse> {
  return fetchJson<ApiResponse>(endpoint, { method: 'POST', data });
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

export function toastError(fallback: string) {
  return (error: unknown): void => {
    showToast(error instanceof Error ? error.message : fallback, 'error');
  };
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
    setTimeout(() => {
      t.remove();
    }, 220);
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
    const previouslyFocusedHTML = document.activeElement as HTMLElement | null;
    confirmBtn.focus();

    const focusableButtons: HTMLButtonElement[] = [cancelBtn, confirmBtn];
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cleanup(false);
      } else if (e.key === 'Tab') {
        e.preventDefault();
        const idx = document.activeElement === cancelBtn ? 0 : 1;
        const next = e.shiftKey
          ? (idx - 1 + focusableButtons.length) % focusableButtons.length
          : (idx + 1) % focusableButtons.length;
        focusableButtons.at(next)?.focus();
      }
    };

    const cleanup = (result: boolean) => {
      cancelBtn.disabled = true;
      confirmBtn.disabled = true;
      document.removeEventListener('keydown', keyHandler);
      overlay.remove();
      previouslyFocusedHTML?.focus();
      resolve(result);
    };

    cancelBtn.addEventListener('click', () => {
      cleanup(false);
    });
    confirmBtn.addEventListener('click', () => {
      cleanup(true);
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cleanup(false);
    });
    document.addEventListener('keydown', keyHandler);
  });
}
