import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';

export function loopbackFetch(urlValue: string, init: RequestInit = {}): Promise<Response> {
  const url = new URL(urlValue);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port) {
    throw new TypeError('Test requests must target an explicit IPv4 loopback port');
  }
  if (init.body !== undefined && typeof init.body !== 'string') {
    throw new TypeError('Test request bodies must be strings');
  }

  return new Promise<Response>((resolve, reject) => {
    const request = httpRequest(
      {
        hostname: '127.0.0.1',
        port: Number(url.port),
        path: `${url.pathname}${url.search}`,
        method: init.method ?? 'GET',
        headers: Object.fromEntries(new Headers(init.headers).entries()),
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.once('end', () => {
          resolve(
            new Response(Buffer.concat(chunks), {
              status: response.statusCode,
              headers: response.headers as Record<string, string>,
            })
          );
        });
      }
    );
    request.once('error', reject);
    if (init.body !== undefined) request.write(init.body);
    request.end();
  });
}

export async function getPageCsrfToken(
  port: number,
  cookie?: string | null,
  pagePath = '/servers'
): Promise<string | null> {
  const res = await fetch(`http://127.0.0.1:${port}${pagePath}`, {
    headers: cookie ? { cookie } : {},
  });
  const text = await res.text();
  const m = text.match(/name="csrf-token"\s+content="([^"]+)"/);
  return m?.[1] || null;
}

export async function getLoginPageCsrfAndCookie(
  port: number
): Promise<{ cookie: string; csrfToken: string }> {
  const res = await fetch(`http://127.0.0.1:${port}/`);
  const setCookie = res.headers.get('set-cookie');
  assert.ok(setCookie, 'Login page must set a session cookie');
  const cookie = setCookie.split(';')[0];
  assert.ok(cookie, 'Login page session cookie must not be empty');
  const text = await res.text();
  const m = text.match(/name="csrf-token"\s+content="([^"]+)"/);
  assert.ok(m, 'CSRF token not found in login page');
  const csrfToken = m[1];
  assert.ok(csrfToken, 'CSRF token must not be empty');
  return { cookie, csrfToken };
}

export async function loginAndGetSession(
  port: number,
  username: string,
  password: string
): Promise<{ sessionCookie: string; csrfToken: string }> {
  const { cookie, csrfToken: initialCsrfToken } = await getLoginPageCsrfAndCookie(port);
  const loginRes = await fetch(`http://127.0.0.1:${port}/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie,
      'x-csrf-token': initialCsrfToken,
    },
    body: JSON.stringify({ username, password }),
  });
  assert.equal(loginRes.status, 200, `Login failed for ${username}`);

  const sessionCookie = loginRes.headers.get('set-cookie')?.split(';')[0] ?? '';
  const csrfToken = await getPageCsrfToken(port, sessionCookie);
  assert.ok(csrfToken, 'CSRF token should exist after login');
  return { sessionCookie, csrfToken };
}
