import { alertEmail, sendEmails, type AlertLine } from './email';
import { getGames, getStores, dealUrl, MAX_IDS_PER_REQUEST, PriceApiError, type GameDetails } from './prices';
import { dealLabel, describeTarget, isRule, shouldAlert, targetMet, type PriceState } from './rules';
import { unsubscribeUrl } from './auth';
import type { Env, Game } from './types';

// Workers Free allows 50 subrequests per invocation. Spend at most 8 on prices
// (8 x 25 = 200 games/hour) and leave room for Resend batches and the store list.
const PRICE_BATCHES_PER_RUN = 8;
const MAX_ALERT_EMAILS_PER_RUN = 300;

export async function refreshPrices(env: Env, now = Date.now()): Promise<number> {
  const { results: games } = await env.DB.prepare(
    `SELECT g.* FROM games g
     WHERE EXISTS (SELECT 1 FROM wishlist_items w WHERE w.game_id = g.id AND w.state = 'tracking')
     ORDER BY COALESCE(g.last_checked, 0) ASC
     LIMIT ?`,
  ).bind(PRICE_BATCHES_PER_RUN * MAX_IDS_PER_REQUEST).all<Game>();

  let updated = 0;
  for (let i = 0; i < games.length; i += MAX_IDS_PER_REQUEST) {
    const chunk = games.slice(i, i + MAX_IDS_PER_REQUEST);
    let details;
    try {
      details = await getGames(env, chunk.map((g) => g.id));
    } catch (err) {
      console.error('price fetch failed', err);
      if (err instanceof PriceApiError && err.status === 429) break; // back off until next run
      continue;
    }
    const stmts: D1PreparedStatement[] = [];
    for (const old of chunk) {
      const d = details.get(old.id);
      if (!d) {
        stmts.push(env.DB.prepare('UPDATE games SET last_checked = ? WHERE id = ?').bind(now, old.id));
        continue;
      }
      stmts.push(...gameUpdateStatements(env, old, d, now));
      updated++;
    }
    if (stmts.length) await env.DB.batch(stmts);
  }
  return updated;
}

/** Statements that write fresh price data for a game we already store. */
export function gameUpdateStatements(
  env: Env,
  old: Pick<Game, 'id' | 'current_price' | 'historical_low' | 'historical_low_date'>,
  d: GameDetails,
  now: number,
): D1PreparedStatement[] {
  let low = old.historical_low;
  let lowDate = old.historical_low_date;
  for (const [p, at] of [[d.low, d.lowDate], [d.current, now]] as const) {
    if (p != null && (low == null || p < low - 0.005)) {
      low = p;
      lowDate = at ?? now;
    }
  }
  const stmts = [
    env.DB.prepare(
      `UPDATE games SET title = ?, thumb = ?, steam_app_id = ?, current_price = ?, retail_price = ?,
         current_store_id = ?, current_deal_id = ?, historical_low = ?, historical_low_date = ?, last_checked = ?
       WHERE id = ?`,
    ).bind(d.title, d.thumb, d.steamAppId, d.current, d.retail, d.storeId, d.dealId, low, lowDate, now, old.id),
  ];
  if (d.current != null && (old.current_price == null || Math.abs(old.current_price - d.current) > 0.005)) {
    stmts.push(
      env.DB.prepare('INSERT INTO price_history (game_id, price, store_id, checked_at) VALUES (?, ?, ?, ?)')
        .bind(old.id, d.current, d.storeId, now),
    );
  }
  return stmts;
}

interface AlertRow {
  item_id: string;
  user_id: string;
  email: string;
  rule: string;
  target_value: number | null;
  last_alert_price: number | null;
  game_id: string;
  title: string;
  current_price: number | null;
  retail_price: number | null;
  historical_low: number | null;
  historical_low_date: number | null;
  current_deal_id: string | null;
  store_name: string | null;
}

export async function sendAlerts(env: Env, now = Date.now()): Promise<number> {
  const { results } = await env.DB.prepare(
    `SELECT w.id AS item_id, w.user_id, u.email, w.rule, w.target_value, w.last_alert_price,
            g.id AS game_id, g.title, g.current_price, g.retail_price, g.historical_low, g.historical_low_date,
            g.current_deal_id, s.name AS store_name
     FROM wishlist_items w
     JOIN users u ON u.id = w.user_id
     JOIN games g ON g.id = w.game_id
     LEFT JOIN stores s ON s.id = g.current_store_id
     WHERE w.state = 'tracking' AND u.email_alerts = 1 AND g.current_price IS NOT NULL`,
  ).all<AlertRow>();

  const resets: D1PreparedStatement[] = [];
  const byUser = new Map<string, AlertRow[]>();
  for (const r of results) {
    if (!isRule(r.rule)) continue;
    const p: PriceState = { current: r.current_price, retail: r.retail_price, low: r.historical_low, lowDate: r.historical_low_date };
    const met = targetMet(r.rule, r.target_value, p);
    if (!met && r.last_alert_price != null) {
      // Price went back up: re-arm so the next drop alerts again.
      resets.push(env.DB.prepare('UPDATE wishlist_items SET last_alert_price = NULL WHERE id = ?').bind(r.item_id));
    } else if (shouldAlert(met, r.current_price, r.last_alert_price)) {
      byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r]);
    }
  }
  if (resets.length) await env.DB.batch(resets);

  const users = [...byUser.entries()].slice(0, MAX_ALERT_EMAILS_PER_RUN);
  const messages = [];
  const marks: D1PreparedStatement[] = [];
  for (const [userId, rows] of users) {
    const lines: AlertLine[] = rows.map((r) => {
      const p: PriceState = { current: r.current_price, retail: r.retail_price, low: r.historical_low, lowDate: r.historical_low_date };
      return {
        title: r.title,
        price: r.current_price!,
        store: r.store_name ?? 'the store',
        target: describeTarget(r.rule as any, r.target_value, p),
        label: dealLabel(p, now),
        buyUrl: r.current_deal_id ? dealUrl(r.current_deal_id) : `${env.APP_URL}/app/item/${r.item_id}`,
        itemUrl: `${env.APP_URL}/app/item/${r.item_id}`,
      };
    });
    messages.push(alertEmail(rows[0].email, lines, await unsubscribeUrl(env, userId)));
    for (const r of rows) {
      marks.push(env.DB.prepare('UPDATE wishlist_items SET last_alert_price = ?, last_alert_at = ? WHERE id = ?').bind(r.current_price, now, r.item_id));
    }
  }
  // Mark only after Resend accepts, so failures retry next run.
  await sendEmails(env, messages);
  if (marks.length) await env.DB.batch(marks);
  return messages.length;
}

export async function refreshStores(env: Env): Promise<void> {
  const stores = await getStores(env);
  if (!stores.length) return;
  await env.DB.batch(
    stores.map((s) => env.DB.prepare('INSERT INTO stores (id, name) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name').bind(s.id, s.name)),
  );
}

export async function cleanup(env: Env, now = Date.now()): Promise<void> {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now),
    env.DB.prepare('DELETE FROM login_codes WHERE expires_at < ?').bind(now),
    env.DB.prepare('DELETE FROM rate_limits WHERE window_start < ?').bind(now - 24 * 3600 * 1000),
  ]);
}

export async function runScheduled(env: Env, now = Date.now()): Promise<void> {
  const updated = await refreshPrices(env, now);
  const sent = await sendAlerts(env, now);
  if (new Date(now).getUTCHours() === 4) {
    await refreshStores(env).catch((e) => console.error('store refresh failed', e));
    await cleanup(env, now);
  }
  console.log(`cron: refreshed ${updated} games, sent ${sent} alert emails`);
}
