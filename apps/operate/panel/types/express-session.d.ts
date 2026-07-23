/** Extends session state with the authenticated user and per-session CSRF token. */
import 'express-session';

declare module 'express-session' {
  interface SessionData {
    user?: { id: number; username: string; is_admin?: number };
    csrfToken?: string;
  }
}
