import { Hono, type Context } from 'hono';
import { csrf } from 'hono/csrf';
import { HTTPException } from 'hono/http-exception';
import { secureHeaders } from 'hono/secure-headers';
import type { AppEnv, Env, Game, User } from './types';
import {
  CODE_RESEND_COOLDOWN, CODE_TTL, MAX_CODE_ATTEMPTS, codeHash, createSession, destroySession, loadUser,
  normalizeEmail, randomCode, randomToken, rateLimit, safeEqual, safeNext, unsubscribeToken,
} from './auth';
import { loginEmail, sendEmails } from './email';
import { getGames, searchGames, type SearchResult } from './prices';
import { gameUpdateStatements, runScheduled } from './cron';
import { STATUS_ORDER, isRule } from './rules';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { steamLoginUrl, steamReturnTo, verifySteamLogin } from './steam';
import { ownedSteamApps, processImportQueue, queuedCount, syncSteam, type LinkedAccount } from './imports';
import {
  DashboardPage, ItemPage, LandingPage, LoginPage, MessagePage, SearchPage, SettingsPage, VerifyPage, statusOf, type DashRow,
} from './views/pages';

const app = new Hono<AppEnv>();

app.use('*', secureHeaders({ crossOriginEmbedderPolicy: false }));
// Origin check on form posts. /unsubscribe is exempt: mail clients POST to it
// for one-click unsubscribe, and it is authorized by an HMAC token instead.
app.use('*', async (c, next) => (c.req.path === '/unsubscribe' ? next() : csrf()(c, next)));
app.use('*', async (c, next) => {
  c.set('user', await loadUser(c));
  await next();
});

const requireUser = (c: Context<AppEnv>): User | null => c.get('user');
const loginRedirect = (c: Context<AppEnv>) => c.redirect(`/login?next=${encodeURIComponent(c.req.path + (new URL(c.req.url).search))}`);
const clientIp = (c: Context<AppEnv>) => c.req.header('cf-connecting-ip') ?? 'local';
const now = () => Date.now();

// ---------- Public pages ----------

app.get('/', (c) => c.html(<LandingPage user={c.get('user')} />));

app.get('/search', async (c) => {
  const user = c.get('user');
  const q = (c.req.query('q') ?? '').trim().slice(0, 300);
  let results: SearchResult[] | null = null;
  let error: string | undefined;
  if (q) {
    try {
      results = await searchGames(c.env, q);
    } catch (e) {
      console.error('search failed', e);
      error = 'Search is unavailable right now. Try again in a minute.';
    }
  }
  const tracked = new Set<string>();
  if (user && results?.length) {
    const { results: rows } = await c.env.DB.prepare('SELECT game_id FROM wishlist_items WHERE user_id = ?').bind(user.id).all<{ game_id: string }>();
    rows.forEach((r) => tracked.add(r.game_id));
  }
  const owned = user && results?.length ? await ownedSteamApps(c.env, user.id) : new Set<string>();
  return c.html(<SearchPage user={user} q={q} results={results} tracked={tracked} owned={owned} error={error} />);
});

// ---------- Email sign-in (verification code via Resend) ----------

app.get('/login', (c) => {
  if (c.get('user')) return c.redirect(safeNext(c.req.query('next')));
  return c.html(<LoginPage next={safeNext(c.req.query('next'))} />);
});

app.post('/login', async (c) => {
  const form = await c.req.parseBody();
  const next = safeNext(form.next);
  const email = normalizeEmail(form.email);
  if (!email) return c.html(<LoginPage next={next} email={String(form.email ?? '')} error="Enter a valid email address." />, 400);

  if (!(await rateLimit(c.env, `login-ip:${clientIp(c)}`, 10, 3600_000))) {
    return c.html(<LoginPage next={next} email={email} error="Too many sign-in attempts. Try again in an hour." />, 429);
  }
  const existing = await c.env.DB.prepare('SELECT sent_at, expires_at FROM login_codes WHERE email = ?').bind(email).first<{ sent_at: number; expires_at: number }>();
  if (existing && existing.expires_at > now() && now() - existing.sent_at < CODE_RESEND_COOLDOWN) {
    // A code was just sent; don't send another, just show the code form.
    return c.html(<VerifyPage email={email} next={next} sent />);
  }

  const code = randomCode();
  await c.env.DB.prepare(
    `INSERT INTO login_codes (email, code_hash, expires_at, attempts, sent_at) VALUES (?1, ?2, ?3, 0, ?4)
     ON CONFLICT(email) DO UPDATE SET code_hash = ?2, expires_at = ?3, attempts = 0, sent_at = ?4`,
  ).bind(email, await codeHash(c.env, email, code), now() + CODE_TTL, now()).run();
  try {
    await sendEmails(c.env, [loginEmail(c.env, email, code)]);
  } catch (e) {
    console.error('login email failed', e);
    return c.html(<LoginPage next={next} email={email} error="We couldn't send the email. Try again in a minute." />, 502);
  }
  return c.html(<VerifyPage email={email} next={next} sent />);
});

// Link from the email lands here. It only pre-fills the form, so link scanners
// that prefetch URLs can't use up the code.
app.get('/verify', (c) => {
  const email = normalizeEmail(c.req.query('email'));
  if (!email) return c.redirect('/login');
  const code = (c.req.query('code') ?? '').replace(/\D/g, '').slice(0, 6);
  return c.html(<VerifyPage email={email} next={safeNext(c.req.query('next'))} code={code} />);
});

app.post('/verify', async (c) => {
  const form = await c.req.parseBody();
  const next = safeNext(form.next);
  const email = normalizeEmail(form.email);
  const code = String(form.code ?? '').replace(/\D/g, '');
  if (!email) return c.redirect('/login');

  const row = await c.env.DB.prepare('SELECT code_hash, expires_at, attempts FROM login_codes WHERE email = ?').bind(email).first<{ code_hash: string; expires_at: number; attempts: number }>();
  if (!row || row.expires_at < now() || row.attempts >= MAX_CODE_ATTEMPTS) {
    return c.html(<LoginPage next={next} email={email} error="That code expired. Request a new one." />, 400);
  }
  if (code.length !== 6 || !safeEqual(row.code_hash, await codeHash(c.env, email, code))) {
    await c.env.DB.prepare('UPDATE login_codes SET attempts = attempts + 1 WHERE email = ?').bind(email).run();
    const left = MAX_CODE_ATTEMPTS - row.attempts - 1;
    return c.html(<VerifyPage email={email} next={next} error={left > 0 ? `Wrong code. ${left} ${left === 1 ? 'try' : 'tries'} left.` : 'Too many wrong codes. Request a new one.'} />, 400);
  }

  await c.env.DB.prepare('DELETE FROM login_codes WHERE email = ?').bind(email).run();
  let user = await c.env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<User>();
  if (!user) {
    user = { id: crypto.randomUUID(), email, email_alerts: 1, created_at: now() };
    await c.env.DB.prepare('INSERT INTO users (id, email, email_alerts, created_at) VALUES (?, ?, 1, ?)').bind(user.id, email, user.created_at).run();
  }
  await createSession(c, user.id);
  return c.redirect(next);
});

app.post('/logout', async (c) => {
  await destroySession(c);
  return c.redirect('/');
});

// ---------- Wishlist ----------

const DASH_SELECT = `SELECT w.*, g.title, g.thumb, g.current_price, g.retail_price, g.historical_low, g.historical_low_date,
  g.current_deal_id, g.last_checked, s.name AS store_name
  FROM wishlist_items w JOIN games g ON g.id = w.game_id LEFT JOIN stores s ON s.id = g.current_store_id`;

app.get('/app', async (c) => {
  const user = requireUser(c);
  if (!user) return loginRedirect(c);
  const { results: rows } = await c.env.DB.prepare(`${DASH_SELECT} WHERE w.user_id = ? ORDER BY w.created_at DESC`).bind(user.id).all<DashRow>();
  const yearStart = Date.UTC(new Date().getUTCFullYear(), 0, 1);
  const saved = rows
    .filter((r) => r.state === 'purchased' && (r.purchased_at ?? 0) >= yearStart && r.retail_at_purchase != null && r.purchased_price != null)
    .reduce((sum, r) => sum + Math.max(0, r.retail_at_purchase! - r.purchased_price!), 0);
  rows.sort((a, b) => STATUS_ORDER.indexOf(statusOf(a)) - STATUS_ORDER.indexOf(statusOf(b)));
  return c.html(<DashboardPage user={user} rows={rows} savedThisYear={saved} filter={c.req.query('filter') ?? 'all'} flash={c.req.query('msg') === 'removed' ? 'Removed from your wishlist.' : undefined} />);
});

app.post('/app/track', async (c) => {
  const user = requireUser(c);
  if (!user) return loginRedirect(c);
  const form = await c.req.parseBody();
  const gameId = String(form.gameId ?? '').trim();
  if (!/^\d{1,12}$/.test(gameId)) return c.text('Bad game id', 400);

  const count = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM wishlist_items WHERE user_id = ?').bind(user.id).first<{ n: number }>();
  if ((count?.n ?? 0) >= 200) {
    return c.html(<MessagePage user={user} title="Wishlist full"><p>You can track up to 200 games for now.</p><p><a href="/app">Back to your wishlist</a></p></MessagePage>, 400);
  }

  let game = await c.env.DB.prepare('SELECT * FROM games WHERE id = ?').bind(gameId).first<Game>();
  if (!game || !game.last_checked || now() - game.last_checked > 3600_000) {
    let details;
    try {
      details = (await getGames(c.env, [gameId])).get(gameId);
    } catch (e) {
      console.error('track lookup failed', e);
    }
    if (!details && !game) {
      return c.html(<MessagePage user={user} title="Couldn't add that game"><p>We couldn't load prices for it right now. Try again in a minute.</p><p><a href="/search">Back to search</a></p></MessagePage>, 502);
    }
    if (details) {
      if (!game) {
        await c.env.DB.prepare('INSERT INTO games (id, title, created_at) VALUES (?, ?, ?)').bind(gameId, details.title, now()).run();
        game = { id: gameId, current_price: null, historical_low: null, historical_low_date: null } as Game;
      }
      await c.env.DB.batch(gameUpdateStatements(c.env, game, details, now()));
    }
  }

  const id = crypto.randomUUID();
  const inserted = await c.env.DB.prepare(
    `INSERT INTO wishlist_items (id, user_id, game_id, rule, created_at) VALUES (?, ?, ?, 'historical_low', ?)
     ON CONFLICT(user_id, game_id) DO NOTHING`,
  ).bind(id, user.id, gameId, now()).run();
  if (!inserted.meta.changes) {
    const existing = await c.env.DB.prepare('SELECT id FROM wishlist_items WHERE user_id = ? AND game_id = ?').bind(user.id, gameId).first<{ id: string }>();
    return c.redirect(`/app/item/${existing!.id}`);
  }
  return c.redirect(`/app/item/${id}?new=1`);
});

async function loadItem(c: Context<AppEnv>, user: User): Promise<DashRow | null> {
  return c.env.DB.prepare(`${DASH_SELECT} WHERE w.id = ? AND w.user_id = ?`).bind(c.req.param('id'), user.id).first<DashRow>();
}

const notFound = (c: Context<AppEnv>, user: User | null) =>
  c.html(<MessagePage user={user} title="Not found"><p>That page doesn't exist. <a href="/app">Back to your wishlist</a></p></MessagePage>, 404);

app.get('/app/item/:id', async (c) => {
  const user = requireUser(c);
  if (!user) return loginRedirect(c);
  const row = await loadItem(c, user);
  if (!row) return notFound(c, user);
  const { results: hist } = await c.env.DB.prepare(
    'SELECT price, checked_at FROM (SELECT price, checked_at FROM price_history WHERE game_id = ? ORDER BY checked_at DESC LIMIT 200) ORDER BY checked_at ASC',
  ).bind(row.game_id).all<{ price: number; checked_at: number }>();
  if (row.current_price != null) hist.push({ price: row.current_price, checked_at: row.last_checked ?? now() });

  // Live per-store prices for the comparison table. Best effort: the page still works without them.
  let deals: { store: string; price: number; dealId: string }[] = [];
  try {
    const d = (await getGames(c.env, [row.game_id])).get(row.game_id);
    if (d) {
      const { results: stores } = await c.env.DB.prepare('SELECT id, name FROM stores').all<{ id: string; name: string }>();
      const names = new Map(stores.map((s) => [s.id, s.name]));
      deals = d.deals.slice(0, 8).map((x) => ({ store: names.get(x.storeId) ?? `Store #${x.storeId}`, price: x.price, dealId: x.dealId }));
    }
  } catch (e) {
    console.error('deal lookup failed', e);
  }

  const msg = c.req.query('msg');
  const flash = msg === 'saved' ? 'Saved. We\'ll email you when it hits your price.' : msg === 'updated' ? 'Updated.' : undefined;
  const error = msg === 'invalid' ? 'Enter a valid price or percentage.' : undefined;
  return c.html(<ItemPage user={user} row={row} history={hist} deals={deals} isNew={c.req.query('new') === '1'} flash={flash} error={error} />);
});

app.post('/app/item/:id/target', async (c) => {
  const user = requireUser(c);
  if (!user) return loginRedirect(c);
  const row = await loadItem(c, user);
  if (!row) return notFound(c, user);
  const form = await c.req.parseBody();
  const rule = String(form.rule ?? '');
  if (!isRule(rule)) return c.redirect(`/app/item/${row.id}?msg=invalid`);
  let value: number | null = null;
  if (rule === 'price') {
    value = Math.round(parseFloat(String(form.price ?? '')) * 100) / 100;
    if (!Number.isFinite(value) || value <= 0 || value > 1000) return c.redirect(`/app/item/${row.id}?msg=invalid`);
  } else if (rule === 'percent') {
    value = Math.round(parseFloat(String(form.percent ?? '')));
    if (!Number.isFinite(value) || value < 1 || value > 99) return c.redirect(`/app/item/${row.id}?msg=invalid`);
  }
  // New target: re-arm alerts so an already-met price is emailed on the next run.
  await c.env.DB.prepare('UPDATE wishlist_items SET rule = ?, target_value = ?, last_alert_price = NULL WHERE id = ?').bind(rule, value, row.id).run();
  return c.redirect(`/app/item/${row.id}?msg=saved`);
});

app.post('/app/item/:id/purchased', async (c) => {
  const user = requireUser(c);
  if (!user) return loginRedirect(c);
  const row = await loadItem(c, user);
  if (!row) return notFound(c, user);
  const price = Math.round(parseFloat(String((await c.req.parseBody()).price ?? '')) * 100) / 100;
  if (!Number.isFinite(price) || price < 0 || price > 1000) return c.redirect(`/app/item/${row.id}?msg=invalid`);
  await c.env.DB.prepare(
    `UPDATE wishlist_items SET state = 'purchased', purchased_price = ?, retail_at_purchase = ?, purchased_at = ? WHERE id = ?`,
  ).bind(price, row.retail_price, now(), row.id).run();
  return c.redirect(`/app/item/${row.id}?msg=updated`);
});

app.post('/app/item/:id/state', async (c) => {
  const user = requireUser(c);
  if (!user) return loginRedirect(c);
  const row = await loadItem(c, user);
  if (!row) return notFound(c, user);
  const state = String((await c.req.parseBody()).state ?? '');
  if (state === 'owned') {
    await c.env.DB.prepare(`UPDATE wishlist_items SET state = 'owned' WHERE id = ?`).bind(row.id).run();
  } else if (state === 'tracking') {
    await c.env.DB.prepare(
      `UPDATE wishlist_items SET state = 'tracking', purchased_price = NULL, retail_at_purchase = NULL, purchased_at = NULL, last_alert_price = NULL WHERE id = ?`,
    ).bind(row.id).run();
  } else {
    return c.text('Bad state', 400);
  }
  return c.redirect(`/app/item/${row.id}?msg=updated`);
});

app.post('/app/item/:id/delete', async (c) => {
  const user = requireUser(c);
  if (!user) return loginRedirect(c);
  await c.env.DB.batch([
    // Remember the removal so a Steam re-sync doesn't add it back.
    c.env.DB.prepare('INSERT OR IGNORE INTO import_ignored (user_id, game_id) SELECT user_id, game_id FROM wishlist_items WHERE id = ? AND user_id = ?').bind(c.req.param('id'), user.id),
    c.env.DB.prepare('DELETE FROM wishlist_items WHERE id = ? AND user_id = ?').bind(c.req.param('id'), user.id),
  ]);
  return c.redirect('/app?msg=removed');
});

// ---------- Settings ----------

const SETTINGS_MSGS: Record<string, string> = {
  saved: 'Saved.',
  'steam-connected': 'Steam connected.',
  'steam-synced': 'Synced with Steam.',
  'steam-disconnected': 'Steam disconnected. Games already on your wishlist stay there.',
};
const SETTINGS_ERRORS: Record<string, string> = {
  'steam-failed': "Steam sign-in didn't complete. Try again.",
  'steam-taken': 'That Steam account is already connected to a different SnagDeals account.',
};

app.get('/settings', async (c) => {
  const user = requireUser(c);
  if (!user) return loginRedirect(c);
  const steam = await c.env.DB.prepare(`SELECT * FROM linked_accounts WHERE user_id = ? AND provider = 'steam'`).bind(user.id).first<LinkedAccount>();
  const msg = c.req.query('msg') ?? '';
  return c.html(
    <SettingsPage
      user={user}
      steam={steam}
      queued={steam ? await queuedCount(c.env, user.id) : 0}
      imported={Number(c.req.query('added') ?? '') || 0}
      steamKeySet={!!c.env.STEAM_API_KEY}
      flash={SETTINGS_MSGS[msg]}
      error={SETTINGS_ERRORS[msg]}
    />,
  );
});

// ---------- Connected accounts: Steam ----------

const STEAM_STATE_COOKIE = 'sd_steam_state';
// Budget for matching wishlist games during a request (Workers Free: 50 subrequests).
const IMPORT_BUDGET_PER_REQUEST = 35;

async function syncAndImport(c: Context<AppEnv>, userId: string): Promise<number> {
  await syncSteam(c.env, userId);
  return processImportQueue(c.env, IMPORT_BUDGET_PER_REQUEST, now(), userId);
}

app.get('/connect/steam', (c) => {
  const user = requireUser(c);
  if (!user) return loginRedirect(c);
  const state = randomToken(16);
  const origin = new URL(c.req.url).origin;
  setCookie(c, STEAM_STATE_COOKIE, state, { httpOnly: true, secure: origin.startsWith('https:'), sameSite: 'Lax', path: '/connect/steam', maxAge: 600 });
  return c.redirect(steamLoginUrl(origin, state));
});

app.get('/connect/steam/callback', async (c) => {
  const user = requireUser(c);
  if (!user) return loginRedirect(c);
  const url = new URL(c.req.url);
  const state = url.searchParams.get('state') ?? '';
  const expected = getCookie(c, STEAM_STATE_COOKIE);
  deleteCookie(c, STEAM_STATE_COOKIE, { path: '/connect/steam' });
  let steamId: string | null = null;
  if (state && expected && safeEqual(state, expected)) {
    try {
      steamId = await verifySteamLogin(url.searchParams, steamReturnTo(url.origin, state));
    } catch (e) {
      console.error('steam openid verify failed', e);
    }
  }
  if (!steamId) return c.redirect('/settings?msg=steam-failed');

  const other = await c.env.DB.prepare(`SELECT user_id FROM linked_accounts WHERE provider = 'steam' AND external_id = ? AND user_id != ?`).bind(steamId, user.id).first();
  if (other) return c.redirect('/settings?msg=steam-taken');
  await c.env.DB.prepare(
    `INSERT INTO linked_accounts (user_id, provider, external_id, created_at) VALUES (?, 'steam', ?, ?)
     ON CONFLICT(user_id, provider) DO UPDATE SET external_id = excluded.external_id, display_name = NULL`,
  ).bind(user.id, steamId, now()).run();
  const added = await syncAndImport(c, user.id);
  return c.redirect(`/settings?msg=steam-connected&added=${added}`);
});

app.post('/connect/steam/sync', async (c) => {
  const user = requireUser(c);
  if (!user) return loginRedirect(c);
  const added = await syncAndImport(c, user.id);
  return c.redirect(`/settings?msg=steam-synced&added=${added}`);
});

app.post('/connect/steam/disconnect', async (c) => {
  const user = requireUser(c);
  if (!user) return loginRedirect(c);
  await c.env.DB.batch([
    c.env.DB.prepare(`DELETE FROM linked_accounts WHERE user_id = ? AND provider = 'steam'`).bind(user.id),
    c.env.DB.prepare(`DELETE FROM owned_apps WHERE user_id = ? AND provider = 'steam'`).bind(user.id),
    c.env.DB.prepare(`DELETE FROM import_queue WHERE user_id = ? AND provider = 'steam'`).bind(user.id),
  ]);
  return c.redirect('/settings?msg=steam-disconnected');
});

app.post('/settings/alerts', async (c) => {
  const user = requireUser(c);
  if (!user) return loginRedirect(c);
  const on = (await c.req.parseBody()).email_alerts === '1' ? 1 : 0;
  await c.env.DB.prepare('UPDATE users SET email_alerts = ? WHERE id = ?').bind(on, user.id).run();
  return c.redirect('/settings?msg=saved');
});

app.post('/settings/delete', async (c) => {
  const user = requireUser(c);
  if (!user) return loginRedirect(c);
  if ((await c.req.parseBody()).confirm !== 'delete') return c.redirect('/settings');
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM wishlist_items WHERE user_id = ?').bind(user.id),
    c.env.DB.prepare('DELETE FROM linked_accounts WHERE user_id = ?').bind(user.id),
    c.env.DB.prepare('DELETE FROM owned_apps WHERE user_id = ?').bind(user.id),
    c.env.DB.prepare('DELETE FROM import_queue WHERE user_id = ?').bind(user.id),
    c.env.DB.prepare('DELETE FROM import_ignored WHERE user_id = ?').bind(user.id),
    c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id),
    c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(user.id),
  ]);
  await destroySession(c);
  return c.html(<MessagePage user={null} title="Account deleted"><p>Your account and wishlist are gone. Thanks for trying SnagDeals.</p></MessagePage>);
});

// ---------- Unsubscribe (linked from alert emails) ----------

async function validUnsub(env: Env, u: string, t: string) {
  return !!u && !!t && safeEqual(t, await unsubscribeToken(env, u));
}

app.get('/unsubscribe', async (c) => {
  const u = c.req.query('u') ?? '', t = c.req.query('t') ?? '';
  if (!(await validUnsub(c.env, u, t))) return c.html(<MessagePage user={c.get('user')} title="Link not valid"><p>Manage alerts from <a href="/settings">Settings</a>.</p></MessagePage>, 400);
  return c.html(
    <MessagePage user={c.get('user')} title="Stop price alerts?">
      <p>You'll stop getting emails when games hit your price. Your wishlist stays.</p>
      <form method="post" action={`/unsubscribe?u=${encodeURIComponent(u)}&t=${t}`}><button class="btn" type="submit">Stop alerts</button></form>
    </MessagePage>,
  );
});

app.post('/unsubscribe', async (c) => {
  const u = c.req.query('u') ?? '', t = c.req.query('t') ?? '';
  if (!(await validUnsub(c.env, u, t))) return c.text('Invalid link', 400);
  await c.env.DB.prepare('UPDATE users SET email_alerts = 0 WHERE id = ?').bind(u).run();
  return c.html(<MessagePage user={c.get('user')} title="Alerts stopped"><p>You won't get price alerts anymore. Turn them back on in <a href="/settings">Settings</a>.</p></MessagePage>);
});

app.notFound((c) => notFound(c, c.get('user') ?? null));
app.onError((err, c) => {
  if (err instanceof HTTPException) return err.getResponse();
  console.error(err);
  return c.html(<MessagePage user={null} title="Something went wrong"><p>Please try again. <a href="/">Home</a></p></MessagePage>, 500);
});

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runScheduled(env));
  },
} satisfies ExportedHandler<Env>;
