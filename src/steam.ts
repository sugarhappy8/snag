// Steam account linking and library/wishlist reads.
// Sign-in uses Steam's official OpenID 2.0 endpoint: we never see the user's Steam password.
import type { Env } from './types';

const OPENID_NS = 'http://specs.openid.net/auth/2.0';
const OPENID_LOGIN = 'https://steamcommunity.com/openid/login';
const DEFAULT_API = 'https://api.steampowered.com';
const api = (env: Env) => env.STEAM_API || DEFAULT_API;

export const steamReturnTo = (origin: string, state: string) => `${origin}/connect/steam/callback?state=${encodeURIComponent(state)}`;

/** `origin` is the site the user is on, so the session cookie is there when Steam sends them back. */
export function steamLoginUrl(origin: string, state: string): string {
  const returnTo = steamReturnTo(origin, state);
  const p = new URLSearchParams({
    'openid.ns': OPENID_NS,
    'openid.mode': 'checkid_setup',
    'openid.return_to': returnTo,
    'openid.realm': origin,
    'openid.identity': `${OPENID_NS}/identifier_select`,
    'openid.claimed_id': `${OPENID_NS}/identifier_select`,
  });
  return `${OPENID_LOGIN}?${p}`;
}

/**
 * Verifies the OpenID response with Steam and returns the SteamID64, or null.
 * `params` is the callback's query string; `expectedReturnTo` must match what we sent.
 */
export async function verifySteamLogin(params: URLSearchParams, expectedReturnTo: string): Promise<string | null> {
  if (params.get('openid.mode') !== 'id_res') return null;
  if (params.get('openid.op_endpoint') !== OPENID_LOGIN) return null;
  if (params.get('openid.return_to') !== expectedReturnTo) return null;
  const claimed = params.get('openid.claimed_id') ?? '';
  const m = claimed.match(/^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/);
  if (!m || params.get('openid.identity') !== claimed) return null;

  const check = new URLSearchParams();
  for (const [k, v] of params) if (k.startsWith('openid.')) check.set(k, v);
  check.set('openid.mode', 'check_authentication');
  const res = await fetch(OPENID_LOGIN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: check.toString(),
  });
  const text = await res.text();
  return res.ok && /(^|\n)is_valid:true(\n|$)/.test(text) ? m[1] : null;
}

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Steam ${new URL(url).pathname} -> ${res.status}`);
  return res.json();
}

/** Public wishlist app ids. Empty when the wishlist is private or empty. */
export async function getSteamWishlist(env: Env, steamId: string): Promise<string[]> {
  const d = await getJson(`${api(env)}/IWishlistService/GetWishlist/v1/?steamid=${steamId}`);
  return (d?.response?.items ?? []).map((i: any) => String(i.appid));
}

/** Owned app ids, or null when there's no API key or the library is private. */
export async function getSteamOwned(env: Env, steamId: string): Promise<string[] | null> {
  if (!env.STEAM_API_KEY) return null;
  const d = await getJson(`${api(env)}/IPlayerService/GetOwnedGames/v1/?key=${env.STEAM_API_KEY}&steamid=${steamId}&include_played_free_games=1`);
  const games = d?.response?.games;
  return Array.isArray(games) ? games.map((g: any) => String(g.appid)) : null;
}

export async function getSteamName(env: Env, steamId: string): Promise<string | null> {
  if (!env.STEAM_API_KEY) return null;
  try {
    const d = await getJson(`${api(env)}/ISteamUser/GetPlayerSummaries/v2/?key=${env.STEAM_API_KEY}&steamids=${steamId}`);
    return d?.response?.players?.[0]?.personaname ?? null;
  } catch {
    return null;
  }
}
