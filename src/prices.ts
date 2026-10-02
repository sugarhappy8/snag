// CheapShark client. Free, keyless API covering Steam, GOG, Epic, Humble, Fanatical and more.
// https://apidocs.cheapshark.com — please keep request volume modest.
import type { Env } from './types';

const DEFAULT_API = 'https://www.cheapshark.com/api/1.0';
const STEAM_STORE_ID = '1';
export const MAX_IDS_PER_REQUEST = 25;

export interface SearchResult {
  gameId: string;
  title: string;
  thumb: string | null;
  steamAppId: string | null;
  cheapest: number | null;
}

export interface GameDetails {
  id: string;
  title: string;
  thumb: string | null;
  steamAppId: string | null;
  current: number | null;
  retail: number | null;
  storeId: string | null;
  dealId: string | null;
  low: number | null;
  lowDate: number | null;
  deals: { storeId: string; dealId: string; price: number; retail: number }[];
}

export class PriceApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string | null => (v == null || v === '' ? null : String(v));

async function get<T>(env: Env, path: string): Promise<T> {
  const res = await fetch(`${env.CHEAPSHARK_API || DEFAULT_API}${path}`, {
    headers: { 'User-Agent': 'SnagDeals/1.0 (+https://snagdeals.store)', Accept: 'application/json' },
  });
  if (!res.ok) throw new PriceApiError(res.status, `CheapShark ${path} -> ${res.status}`);
  return (await res.json()) as T;
}

/** Extracts a Steam app id from a store URL like https://store.steampowered.com/app/1245620/ELDEN_RING/ */
export function steamAppIdFromInput(q: string): string | null {
  const m = q.match(/store\.steampowered\.com\/app\/(\d+)/i) ?? q.match(/steamcommunity\.com\/app\/(\d+)/i);
  return m ? m[1] : null;
}

export async function searchGames(env: Env, q: string): Promise<SearchResult[]> {
  const appId = steamAppIdFromInput(q);
  const path = appId
    ? `/games?steamAppID=${encodeURIComponent(appId)}`
    : `/games?title=${encodeURIComponent(q.trim())}&limit=24`;
  const rows = await get<any[]>(env, path);
  return (Array.isArray(rows) ? rows : []).map((r) => ({
    gameId: String(r.gameID),
    title: String(r.external ?? r.internalName ?? 'Unknown'),
    thumb: str(r.thumb),
    steamAppId: str(r.steamAppID),
    cheapest: num(r.cheapest),
  }));
}

export function parseGame(id: string, raw: any): GameDetails | null {
  if (!raw || !raw.info) return null;
  const deals = (Array.isArray(raw.deals) ? raw.deals : [])
    .map((d: any) => ({ storeId: String(d.storeID), dealId: String(d.dealID), price: num(d.price), retail: num(d.retailPrice) }))
    .filter((d: any) => d.price != null && d.retail != null) as GameDetails['deals'];
  const best = deals.reduce<GameDetails['deals'][number] | null>((a, d) => (!a || d.price < a.price ? d : a), null);
  // "Full price" from Steam when listed (it's the most honest MSRP), else the highest store list price.
  const steam = deals.find((d) => d.storeId === STEAM_STORE_ID);
  const retail = steam ? steam.retail : deals.length ? Math.max(...deals.map((d) => d.retail)) : null;
  const lowDate = num(raw.cheapestPriceEver?.date);
  return {
    id,
    title: String(raw.info.title ?? 'Unknown'),
    thumb: str(raw.info.thumb),
    steamAppId: str(raw.info.steamAppID),
    current: best ? best.price : null,
    retail,
    storeId: best ? best.storeId : null,
    dealId: best ? best.dealId : null,
    low: num(raw.cheapestPriceEver?.price),
    lowDate: lowDate != null ? lowDate * 1000 : null,
    deals: deals.sort((a, b) => a.price - b.price),
  };
}

/** Fetches up to 25 games in one request. Missing ids are absent from the map. */
export async function getGames(env: Env, ids: string[]): Promise<Map<string, GameDetails>> {
  const out = new Map<string, GameDetails>();
  if (!ids.length) return out;
  if (ids.length > MAX_IDS_PER_REQUEST) throw new Error('too many ids');
  const data = await get<Record<string, any>>(env, `/games?ids=${ids.map(encodeURIComponent).join(',')}`);
  for (const id of ids) {
    const g = parseGame(id, data?.[id]);
    if (g) out.set(id, g);
  }
  return out;
}

export async function getStores(env: Env): Promise<{ id: string; name: string }[]> {
  const rows = await get<any[]>(env, '/stores');
  return (Array.isArray(rows) ? rows : []).map((s) => ({ id: String(s.storeID), name: String(s.storeName) }));
}

/** CheapShark's redirect link sends the buyer to the store page for that deal. */
export function dealUrl(dealId: string): string {
  return `https://www.cheapshark.com/redirect?dealID=${encodeURIComponent(dealId)}`;
}

/** CheapShark game id for a Steam app id, or null if CheapShark doesn't list it. */
export async function gameIdForSteamApp(env: Env, appId: string): Promise<string | null> {
  const rows = await get<any[]>(env, `/games?steamAppID=${encodeURIComponent(appId)}`);
  const hit = (Array.isArray(rows) ? rows : []).find((r) => String(r.steamAppID) === appId) ?? null;
  return hit ? String(hit.gameID) : null;
}
