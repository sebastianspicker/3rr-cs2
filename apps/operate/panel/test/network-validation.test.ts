import { afterEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import dns from 'dns';
import {
  isBlockedIP,
  isValidServerHost,
  isValidServerHostResolved,
} from '../utils/networkValidation';

afterEach(() => {
  mock.restoreAll();
});

describe('isBlockedIP', () => {
  it('blocks IPv4 loopback 127.0.0.1', () => assert.equal(isBlockedIP('127.0.0.1'), true));
  it('blocks IPv4 loopback 127.0.0.2', () => assert.equal(isBlockedIP('127.0.0.2'), true));
  it('blocks link-local 169.254.169.254', () => assert.equal(isBlockedIP('169.254.169.254'), true));
  it('blocks unspecified 0.0.0.0', () => assert.equal(isBlockedIP('0.0.0.0'), true));
  it('blocks IPv6 loopback ::1', () => assert.equal(isBlockedIP('::1'), true));
  it('blocks IPv6 unspecified ::', () => assert.equal(isBlockedIP('::'), true));
  it('blocks the full IPv6 link-local fe80::/10 range', () => {
    assert.equal(isBlockedIP('fe80::1'), true);
    assert.equal(isBlockedIP('fe90::1'), true);
    assert.equal(isBlockedIP('febf::1'), true);
  });
  it('allows IPv6 outside the link-local fe80::/10 range', () =>
    assert.equal(isBlockedIP('fec0::1'), false));
  it('blocks IPv4-mapped IPv6 ::ffff:127.0.0.1', () =>
    assert.equal(isBlockedIP('::ffff:127.0.0.1'), true));
  it('blocks expanded IPv6 loopback 0:0:0:0:0:0:0:1', () =>
    assert.equal(isBlockedIP('0:0:0:0:0:0:0:1'), true));

  it('allows private LAN 10.0.0.1', () => assert.equal(isBlockedIP('10.0.0.1'), false));
  it('allows private LAN 172.16.0.1', () => assert.equal(isBlockedIP('172.16.0.1'), false));
  it('allows private LAN 192.168.1.1', () => assert.equal(isBlockedIP('192.168.1.1'), false));
  it('allows public IP 1.2.3.4', () => assert.equal(isBlockedIP('1.2.3.4'), false));
  it('allows public IP 8.8.8.8', () => assert.equal(isBlockedIP('8.8.8.8'), false));
});

describe('isValidServerHost', () => {
  it('accepts valid IPv4', () => assert.equal(isValidServerHost('192.168.1.100'), true));
  it('accepts valid public IP', () => assert.equal(isValidServerHost('1.2.3.4'), true));
  it('accepts valid hostname', () =>
    assert.equal(isValidServerHost('my-server.example.com'), true));
  it('accepts single-label hostname', () => assert.equal(isValidServerHost('myserver'), true));

  it('rejects loopback IP', () => assert.equal(isValidServerHost('127.0.0.1'), false));
  it('rejects link-local IP', () => assert.equal(isValidServerHost('169.254.1.1'), false));
  it('rejects localhost hostname', () => assert.equal(isValidServerHost('localhost'), false));
  it('rejects empty string', () => assert.equal(isValidServerHost(''), false));
  it('rejects very long hostname', () => assert.equal(isValidServerHost('a'.repeat(254)), false));
  it('rejects hostname with leading hyphen', () =>
    assert.equal(isValidServerHost('-invalid.com'), false));
  it('rejects hostname with trailing hyphen', () =>
    assert.equal(isValidServerHost('invalid-.com'), false));
  it('rejects hostname with special chars', () =>
    assert.equal(isValidServerHost('invalid!.com'), false));
  it('rejects non-string input', () =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    assert.equal(isValidServerHost(42 as any), false));
});

describe('isValidServerHostResolved', () => {
  it('accepts private LAN IPv4 10.x.x.x', async () => {
    assert.equal(await isValidServerHostResolved('10.0.0.1'), true);
  });
  it('accepts private LAN IPv4 172.16/12', async () => {
    assert.equal(await isValidServerHostResolved('172.16.0.1'), true);
  });
  it('accepts private LAN IPv4 192.168.x.x', async () => {
    assert.equal(await isValidServerHostResolved('192.168.1.100'), true);
  });
  it('rejects loopback IPv4', async () => {
    assert.equal(await isValidServerHostResolved('127.0.0.1'), false);
  });
  it('rejects link-local IPv4', async () => {
    assert.equal(await isValidServerHostResolved('169.254.169.254'), false);
  });
  it('rejects literal IPv6 link-local addresses across fe80::/10', async () => {
    assert.equal(await isValidServerHostResolved('fe80::1'), false);
    assert.equal(await isValidServerHostResolved('fe90::1'), false);
    assert.equal(await isValidServerHostResolved('febf::1'), false);
  });
  it('rejects hostname when any resolved answer is disallowed', async () => {
    mock.method(dns.promises, 'lookup', async () => [
      { address: '203.0.113.10', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ]);
    assert.equal(await isValidServerHostResolved('example.com'), false);
  });
  it('accepts hostname when all resolved answers are allowed', async () => {
    mock.method(dns.promises, 'lookup', async () => [
      { address: '203.0.113.10', family: 4 },
      { address: '2001:db8::10', family: 6 },
    ]);
    assert.equal(await isValidServerHostResolved('example.com'), true);
  });
  it('rejects hostname when any resolved answer is IPv6 link-local', async () => {
    mock.method(dns.promises, 'lookup', async () => [
      { address: '203.0.113.10', family: 4 },
      { address: 'fe90::1', family: 6 },
    ]);
    assert.equal(await isValidServerHostResolved('example.com'), false);
  });
});
