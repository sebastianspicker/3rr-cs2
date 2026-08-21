import assert from 'node:assert/strict';
import fs from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import express from 'express';
import { configureRateLimits, rateLimitClientKey } from '../modules/appRateLimits';
import { configureSecurity } from '../modules/appSecurity';

const RATE_LIMIT_PATH = '/api/rate-limit-probe';
const RATE_LIMIT = 60;

async function withRateLimitProbe(
  run: (request: (forwardedFor: string) => Promise<Response>) => Promise<void>
): Promise<void> {
  const originalTrustProxy = process.env.TRUST_PROXY;
  process.env.TRUST_PROXY = '1';

  const app = express();
  configureSecurity(app, 'test', process.cwd());
  configureRateLimits(app, 'production');
  app.get(RATE_LIMIT_PATH, (req, res) => res.json({ ip: req.ip }));

  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    await run((forwardedFor) =>
      fetch(`http://127.0.0.1:${port}${RATE_LIMIT_PATH}`, {
        headers: { 'x-forwarded-for': forwardedFor },
      })
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (originalTrustProxy === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = originalTrustProxy;
  }
}

async function consume(
  request: (forwardedFor: string) => Promise<Response>,
  forwardedFor: string,
  count: number
): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    const response = await request(forwardedFor);
    assert.equal(response.status, 200);
    assert.ok(response.headers.has('ratelimit-policy'));
  }
}

test('TRUST_PROXY shares a rate-limit key between IPv4 and IPv4-mapped IPv6', async () => {
  await withRateLimitProbe(async (request) => {
    await consume(request, '198.51.100.40', RATE_LIMIT - 1);
    await consume(request, '::ffff:198.51.100.40', 1);

    const blocked = await request('198.51.100.40');
    assert.equal(blocked.status, 429);
    assert.ok(blocked.headers.has('ratelimit-policy'));
  });
});

test('TRUST_PROXY keeps equivalent hexadecimal IPv4-mapped IPv6 forms in one bucket', async () => {
  await withRateLimitProbe(async (request) => {
    await consume(request, '::ffff:c633:6428', RATE_LIMIT - 1);
    await consume(request, '0:0:0:0:0:ffff:c633:6428', 1);

    assert.equal((await request('::ffff:c633:6428')).status, 429);
  });
});

test('TRUST_PROXY keeps equivalent NAT64 forms in one bucket', async () => {
  await withRateLimitProbe(async (request) => {
    await consume(request, '64:ff9b::c633:6428', RATE_LIMIT - 1);
    await consume(request, '0064:ff9b:0000:0000:0000:0000:c633:6428', 1);

    assert.equal((await request('64:ff9b::c633:6428')).status, 429);
  });
});

test('TRUST_PROXY keeps malformed forwarded representations in one bounded bucket', async () => {
  await withRateLimitProbe(async (request) => {
    await consume(request, '010.000.000.001', RATE_LIMIT - 2);
    await consume(request, '198.51.100.40/24', 1);
    await consume(request, 'not-an-ip-address', 1);

    assert.equal((await request('010.000.000.001')).status, 429);
  });
});

test('missing proxy-derived IP values use the bounded invalid-client bucket', () => {
  assert.equal(rateLimitClientKey({}), rateLimitClientKey({ ip: 'not-an-ip-address' }));
});

test('the add-server limiter uses the shared client-key function', () => {
  const source = fs.readFileSync('routes/serverAdd.ts', 'utf8');
  assert.match(source, /keyGenerator: rateLimitClientKey/);
});
