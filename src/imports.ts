// Steam library + wishlist sync. Owned games are marked owned; wishlist games are queued,
// matched to CheapShark games a few at a time (subrequest budget), then added to the wishlist.
import { gameIdForSteamApp, getGames, MAX_IDS_PER_REQUEST, PriceApiError } from './prices';
import { gameUpdateStatements } from './cron';
import { getSteamName, getSteamOwned, getSteamWishlist } from './steam';
import type { Env, Game } from './types';

export const MAX_WISHLIST_ITEMS = 200;

export interface LinkedAccount {
  user_id: string;
  provider: string;
  external_id: string;
  display_name: string | null;
  owned_count: number | null;
  wishlist_count: number | null;
  last_synced_at: number | null;
  sync_error: string | null;
  created_at: number;
}

export const PRIVATE_PROFILE_HELP =
  "We couldn't see your Steam games. In Steam, open Profile → Edit Profile → Privacy Settings and set Game details to Public, then sync again.";

/** Reads the user's Steam wishlist and library and records them. Uses 2–3 subrequests. */
export async function syncSteam(env: Env, userId: string, now = Date.now()): Promise<LinkedAccount | null> {
  const acct = await env.DB.prepare(`SELECT * FROM linked_accounts WHERE user_id = ? AND provider = 'steam'`).bind(userId).first<LinkedAccount>();
  if (!acct) return null;

  let wishlist: string[] = [];
  let owned: string[] | null = null;
  let error: string | null = null;
  try {
    [wishlist, owned] = await Promise.all([getSteamWishlist(env, acct.external_id), getSteamOwned(env, acct.external_id)]);
    if (!acct.display_name) acct.display_name = await getSteamName(env, acct.external_id);
  } catch (e) {
    console.error('steam sync failed', e);
    error = "Steam didn't respond. Try syncing again in a few minutes.";
  }
  if (!error && wishlist.length === 0 && (owned == null || owned.length === 0)) error = PRIVATE_PROFILE_HELP;

  const stmts: D1PreparedStatement[] = [];
  if (owned != null) {
    stmts.push(
      env.DB.prepare(`DELETE FROM owned_apps WHERE user_id = ? AND provider = 'steam'`).bind(userId),
      env.DB.prepare(`INSERT OR IGNORE INTO owned_apps (user_id, provider, app_id) SELECT ?, 'steam', value FROM json_each(?)`).bind(userId, JSON.stringify(owned)),
    );
  }
  stmts.push(
    // Anything they own stops being tracked.
    env.DB.prepare(
      `UPDATE wishlist_items SET state = 'owned'
       WHERE user_id = ?1 AND state = 'tracking' AND game_id IN (
         SELECT g.id FROM games g JOIN owned_apps o ON o.app_id = g.steam_app_id
         WHERE o.user_id = ?1 AND o.provider = 'steam')`,
    ).bind(userId),
    env.DB.prepare(
      `INSERT OR IGNORE INTO import_queue (user_id, provider, app_id, created_at)
       SELECT ?1, 'steam', value, ?2 FROM json_each(?3)
       WHERE value NOT IN (SELECT app_id FROM owned_apps WHERE user_id = ?1 AND provider = 'steam')`,
    ).bind(userId, now, JSON.stringify(wishlist)),
    env.DB.prepare(
      `UPDATE linked_accounts SET display_name = ?, owned_count = ?, wishlist_count = ?, last_synced_at = ?, sync_error = ?
       WHERE user_id = ? AND provider = 'steam'`,
    ).bind(acct.display_name, owned?.length ?? acct.owned_count, error === PRIVATE_PROFILE_HELP || !error ? wishlist.length : acct.wishlist_count, now, error, userId),
  );
  await env.DB.batch(stmts);
  return { ...acct, sync_error: error, last_synced_at: now };
}

interface QueueRow {
  user_id: string;
  app_id: string;
  game_id: string | null;
  mapped: number;
}

/**
 * Matches queued Steam app ids to CheapShark games and adds them to wishlists.
 * Spends at most `budget` subrequests. Returns how many wishlist items were added.
 */
export async function processImportQueue(env: Env, budget: number, now = Date.now(), userId?: string): Promise<number> {
  if (budget < 2) return 0;
  const { results: rows } = await env.DB.prepare(
    `SELECT q.user_id, q.app_id, m.game_id, (m.app_id IS NOT NULL) AS mapped
     FROM import_queue q LEFT JOIN steam_app_map m ON m.app_id = q.app_id
     ${userId ? 'WHERE q.user_id = ?1' : ''}
     ORDER BY q.created_at LIMIT 300`,
  ).bind(...(userId ? [userId] : [])).all<QueueRow>();
  if (!rows.length) return 0;

  // 1) Look up unmapped app ids, keeping budget for game detail fetches.
  const detailBudget = Math.min(2, budget - 1);
  let lookups = budget - detailBudget;
  const unmapped = [...new Set(rows.filter((r) => !r.mapped).map((r) => r.app_id))];
  const newlyMapped = new Map<string, string | null>();
  for (const appId of unmapped) {
    if (lookups-- <= 0) break;
    try {
      newlyMapped.set(appId, await gameIdForSteamApp(env, appId));
    } catch (e) {
      console.error('steam app lookup failed', appId, e);
      if (e instanceof PriceApiError && e.status === 429) break;
    }
  }
  if (newlyMapped.size) {
    await env.DB.batch(
      [...newlyMapped].map(([appId, gameId]) =>
        env.DB.prepare('INSERT OR REPLACE INTO steam_app_map (app_id, game_id, checked_at) VALUES (?, ?, ?)').bind(appId, gameId, now),
      ),
    );
  }
  const resolved = rows
    .map((r) => (r.mapped ? r : newlyMapped.has(r.app_id) ? { ...r, game_id: newlyMapped.get(r.app_id)!, mapped: 1 } : r))
    .filter((r) => r.mapped);
  if (!resolved.length) return 0;

  // 2) Make sure each matched game has a row with prices.
  const gameIds = [...new Set(resolved.map((r) => r.game_id).filter((g): g is string => !!g))];
  const existing = new Set<string>();
  if (gameIds.length) {
    const { results } = await env.DB.prepare('SELECT id FROM games WHERE id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(gameIds)).all<{ id: string }>();
    results.forEach((g) => existing.add(g.id));
  }
  const missing = gameIds.filter((g) => !existing.has(g));
  for (let i = 0, calls = 0; i < missing.length && calls < detailBudget; i += MAX_IDS_PER_REQUEST, calls++) {
    const chunk = missing.slice(i, i + MAX_IDS_PER_REQUEST);
    try {
      const details = await getGames(env, chunk);
      const stmts: D1PreparedStatement[] = [];
      for (const [id, d] of details) {
        stmts.push(env.DB.prepare('INSERT OR IGNORE INTO games (id, title, created_at) VALUES (?, ?, ?)').bind(id, d.title, now));
        stmts.push(...gameUpdateStatements(env, { id, current_price: null, historical_low: null, historical_low_date: null } as Game, d, now));
        existing.add(id);
      }
      if (stmts.length) await env.DB.batch(stmts);
    } catch (e) {
      console.error('import game fetch failed', e);
    }
  }

  // 3) Add to wishlists (respecting the cap and removed games), and clear handled queue rows.
  const users = [...new Set(resolved.map((r) => r.user_id))];
  const counts = new Map<string, number>();
  const ignored = new Set<string>();
  for (const u of users) {
    const c = await env.DB.prepare('SELECT COUNT(*) AS n FROM wishlist_items WHERE user_id = ?').bind(u).first<{ n: number }>();
    counts.set(u, c?.n ?? 0);
    // Removed games and games already on the wishlist are both skipped.
    const { results } = await env.DB.prepare(
      'SELECT game_id FROM import_ignored WHERE user_id = ?1 UNION SELECT game_id FROM wishlist_items WHERE user_id = ?1',
    ).bind(u).all<{ game_id: string }>();
    results.forEach((r) => ignored.add(`${u}:${r.game_id}`));
  }
  const stmts: D1PreparedStatement[] = [];
  let added = 0;
  for (const r of resolved) {
    if (r.game_id && !existing.has(r.game_id)) continue; // details not fetched yet; retry next run
    if (r.game_id && !ignored.has(`${r.user_id}:${r.game_id}`) && (counts.get(r.user_id) ?? 0) < MAX_WISHLIST_ITEMS) {
      stmts.push(
        env.DB.prepare(
          `INSERT INTO wishlist_items (id, user_id, game_id, rule, created_at, source) VALUES (?, ?, ?, 'historical_low', ?, 'steam')
           ON CONFLICT(user_id, game_id) DO NOTHING`,
        ).bind(crypto.randomUUID(), r.user_id, r.game_id, now),
      );
      counts.set(r.user_id, (counts.get(r.user_id) ?? 0) + 1);
      ignored.add(`${r.user_id}:${r.game_id}`);
      added++;
    }
    stmts.push(env.DB.prepare(`DELETE FROM import_queue WHERE user_id = ? AND provider = 'steam' AND app_id = ?`).bind(r.user_id, r.app_id));
  }
  if (stmts.length) await env.DB.batch(stmts);
  return added;
}

/** Steam app ids the user owns, for "You own this" hints. */
export async function ownedSteamApps(env: Env, userId: string): Promise<Set<string>> {
  const { results } = await env.DB.prepare(`SELECT app_id FROM owned_apps WHERE user_id = ? AND provider = 'steam'`).bind(userId).all<{ app_id: string }>();
  return new Set(results.map((r) => r.app_id));
}

export async function queuedCount(env: Env, userId: string): Promise<number> {
  const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM import_queue WHERE user_id = ?').bind(userId).first<{ n: number }>();
  return r?.n ?? 0;
}
