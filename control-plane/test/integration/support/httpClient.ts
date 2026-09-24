/** Minimal HTTP client and session helpers shared by route-level SQLite contract tests. */
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';

export interface HttpResult {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

export function request(
  port: number,
  path: string,
  options: { method?: string; headers?: Record<string, string>; body?: string } = {}
): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method: options.method ?? 'GET',
        headers: options.headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.once('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString(),
          })
        );
      }
    );
    req.once('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

export function sessionCookie(result: {
  headers: Record<string, string | string[] | undefined>;
}): string {
  const value = result.headers['set-cookie'];
  const cookie = Array.isArray(value) ? value[0] : value;
  assert.ok(cookie);
  return cookie.split(';', 1)[0] ?? '';
}

export function csrfToken(result: { body: string }): string {
  const match = result.body.match(/name="csrf-token"\s+content="([^"]+)"/);
  assert.ok(match?.[1]);
  return match[1];
}

/** Session cookies are unrelated to the CSRF token minted for a fresh, unauthenticated visit. */
export async function freshCsrf(port: number, cookie: string): Promise<string> {
  const page = await request(port, '/servers', { headers: { cookie, accept: 'text/html' } });
  return csrfToken(page);
}

/** Login regenerates the session and rotates its CSRF token, so the returned token is
 * always read from a post-login page rather than the pre-login token used to log in. */
export async function loginAs(
  port: number,
  username: string,
  password: string
): Promise<{ cookie: string; csrf: string }> {
  const initial = await request(port, '/');
  const response = await request(port, '/auth/login', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      cookie: sessionCookie(initial),
      'x-csrf-token': csrfToken(initial),
    },
    body: JSON.stringify({ username, password }),
  });
  assert.equal(response.status, 200);
  const cookie = sessionCookie(response);
  return { cookie, csrf: await freshCsrf(port, cookie) };
}
