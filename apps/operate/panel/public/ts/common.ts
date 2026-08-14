/** Browser helpers for same-origin authenticated panel requests and feedback. */
export interface ApiResponse {
  message: string;
  output?: string;
  command_sent?: boolean;
  history_recorded?: boolean;
  partial?: boolean;
}

type JsonMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';
const apiRequestTimeoutMs = 15_000;

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
    request.timeout = apiRequestTimeoutMs;
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
    request.ontimeout = () => {
      reject(new Error('Request timed out. Retry the action.'));
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
      throw new Error('Session expired - redirecting to login');
    }
    let errMsg = `Request failed (${resp.status})`;
    try {
      const errBody = await resp.json() as { error?: string; message?: string };
      if (errBody.error) errMsg = errBody.error;
      else if (errBody.message) errMsg = errBody.message;
    } catch { /* non-JSON body - keep default */ }
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
  t.setAttribute('role', type === 'error' ? 'alert' : 'status');
  const message = document.createElement('span');
  message.textContent = msg;
  t.appendChild(message);
  const dismiss = () => {
    t.classList.remove('cs-toast--visible');
    setTimeout(() => {
      t.remove();
    }, 220);
  };
  if (type === 'error') {
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'cs-toast-dismiss';
    close.setAttribute('aria-label', 'Dismiss error');
    close.textContent = 'Dismiss';
    close.addEventListener('click', dismiss);
    t.appendChild(close);
  }
  container.appendChild(t);
  requestAnimationFrame(() => { t.classList.add('cs-toast--visible'); });
  if (type !== 'error') setTimeout(dismiss, 3000);
}

interface ConfirmDialogElements {
  overlay: HTMLDivElement;
  cancelBtn: HTMLButtonElement;
  confirmBtn: HTMLButtonElement;
}

interface ConfirmDialogSession {
  elements: ConfirmDialogElements;
  previouslyFocusedHTML: HTMLElement | null;
  keyHandler: (event: KeyboardEvent) => void;
  resolve: (result: boolean) => void;
}

function buildConfirmDialog(message: string, confirmLabel: string): ConfirmDialogElements {
  const overlay = document.createElement('div');
  overlay.className = 'cs-modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'cs-modal-msg');

  const modal = document.createElement('div');
  modal.className = 'cs-modal';
  const msgEl = document.createElement('p');
  msgEl.className = 'cs-modal-message';
  msgEl.id = 'cs-modal-msg';
  msgEl.textContent = message;

  const actions = document.createElement('div');
  actions.className = 'cs-modal-actions';
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn btn-secondary cs-modal-cancel';
  cancelBtn.textContent = 'Cancel';
  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'btn btn-danger cs-modal-confirm';
  confirmBtn.textContent = confirmLabel;

  actions.append(cancelBtn, confirmBtn);
  modal.append(msgEl, actions);
  overlay.appendChild(modal);
  return { overlay, cancelBtn, confirmBtn };
}

function cleanupConfirmDialog(session: ConfirmDialogSession, result: boolean): void {
  session.elements.cancelBtn.disabled = true;
  session.elements.confirmBtn.disabled = true;
  document.removeEventListener('keydown', session.keyHandler);
  session.elements.overlay.remove();
  session.previouslyFocusedHTML?.focus();
  session.resolve(result);
}

function waitForConfirmResult(
  elements: ConfirmDialogElements,
  previouslyFocusedHTML: HTMLElement | null
): Promise<boolean> {
  return new Promise((resolve) => {
    const focusableButtons = [elements.cancelBtn, elements.confirmBtn];
    const session: ConfirmDialogSession = {
      elements,
      previouslyFocusedHTML,
      resolve,
      keyHandler: () => {},
    };
    const cleanup = (result: boolean) => cleanupConfirmDialog(session, result);
    session.keyHandler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        cleanup(false);
      } else if (event.key === 'Tab') {
        event.preventDefault();
        const index = document.activeElement === elements.cancelBtn ? 0 : 1;
        const next = event.shiftKey
          ? (index - 1 + focusableButtons.length) % focusableButtons.length
          : (index + 1) % focusableButtons.length;
        focusableButtons.at(next)?.focus();
      }
    };

    elements.cancelBtn.addEventListener('click', () => cleanup(false));
    elements.confirmBtn.addEventListener('click', () => cleanup(true));
    elements.overlay.addEventListener('click', (event) => {
      if (event.target === elements.overlay) cleanup(false);
    });
    document.addEventListener('keydown', session.keyHandler);
  });
}

export function showConfirm(message: string, confirmLabel = 'Confirm'): Promise<boolean> {
  const elements = buildConfirmDialog(message, confirmLabel);
  const previouslyFocusedHTML = document.activeElement as HTMLElement | null;
  document.body.appendChild(elements.overlay);
  elements.cancelBtn.focus();
  return waitForConfirmResult(elements, previouslyFocusedHTML);
}
