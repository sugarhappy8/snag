import { afterEach, describe, expect, it, vi } from 'vitest';
import { steamLoginUrl, steamReturnTo, verifySteamLogin } from '../src/steam';

const origin = 'https://snagdeals.store';
const state = 'abc123';
const id = 'https://steamcommunity.com/openid/id/76561197960287930';

function callback(overrides: Record<string, string> = {}) {
  return new URLSearchParams({
    state,
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'id_res',
    'openid.op_endpoint': 'https://steamcommunity.com/openid/login',
    'openid.claimed_id': id,
    'openid.identity': id,
    'openid.return_to': steamReturnTo(origin, state),
    'openid.response_nonce': '2026-10-02T00:00:00Zx',
    'openid.assoc_handle': '1234567890',
    'openid.signed': 'signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle',
    'openid.sig': 'sig=',
    ...overrides,
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('steam openid', () => {
  it('builds a login url back to this site', () => {
    const u = new URL(steamLoginUrl(origin, state));
    expect(u.origin + u.pathname).toBe('https://steamcommunity.com/openid/login');
    expect(u.searchParams.get('openid.return_to')).toBe(`${origin}/connect/steam/callback?state=${state}`);
    expect(u.searchParams.get('openid.realm')).toBe(origin);
  });

  it('accepts a response Steam confirms, asking with check_authentication', async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = new URLSearchParams(String(init.body));
      expect(body.get('openid.mode')).toBe('check_authentication');
      expect(body.has('state')).toBe(false);
      return new Response('ns:http://specs.openid.net/auth/2.0\nis_valid:true\n');
    });
    vi.stubGlobal('fetch', fetchMock);
    expect(await verifySteamLogin(callback(), steamReturnTo(origin, state))).toBe('76561197960287930');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('rejects when Steam says invalid', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('ns:http://specs.openid.net/auth/2.0\nis_valid:false\n')));
    expect(await verifySteamLogin(callback(), steamReturnTo(origin, state))).toBeNull();
  });

  it('rejects forged fields without calling Steam', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const expected = steamReturnTo(origin, state);
    expect(await verifySteamLogin(callback({ 'openid.return_to': 'https://evil.example/cb' }), expected)).toBeNull();
    expect(await verifySteamLogin(callback({ 'openid.op_endpoint': 'https://evil.example/openid' }), expected)).toBeNull();
    expect(await verifySteamLogin(callback({ 'openid.claimed_id': 'https://evil.example/id/76561197960287930' }), expected)).toBeNull();
    expect(await verifySteamLogin(callback({ 'openid.mode': 'cancel' }), expected)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
