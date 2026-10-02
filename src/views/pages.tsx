import { Layout, Flash } from './layout';
import type { User, WishlistItem } from '../types';
import type { SearchResult } from '../prices';
import { dealUrl } from '../prices';
import {
  RULE_LABELS, dealLabel, describeTarget, discountPct, itemStatus, money, targetPrice,
  type PriceState, type Rule, type Status,
} from '../rules';

export interface DashRow extends WishlistItem {
  title: string;
  thumb: string | null;
  current_price: number | null;
  retail_price: number | null;
  historical_low: number | null;
  historical_low_date: number | null;
  current_deal_id: string | null;
  store_name: string | null;
  last_checked: number | null;
}

export const priceState = (r: Pick<DashRow, 'current_price' | 'retail_price' | 'historical_low' | 'historical_low_date'>): PriceState => ({
  current: r.current_price,
  retail: r.retail_price,
  low: r.historical_low,
  lowDate: r.historical_low_date,
});

export const statusOf = (r: DashRow): Status => itemStatus(r.state, r.rule as Rule, r.target_value, priceState(r));

const statusClass = (s: Status) => `status status-${s.toLowerCase().replace(/\s+/g, '-')}`;

function ago(ts: number | null): string {
  if (!ts) return 'not yet';
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

const fmtDate = (ts: number | null) => (ts ? new Date(ts).toISOString().slice(0, 10) : '—');

function SearchBox(props: { q?: string; autofocus?: boolean }) {
  return (
    <form action="/search" method="get" class="search">
      <input
        type="search"
        name="q"
        value={props.q ?? ''}
        placeholder="Search a game or paste a Steam store link"
        aria-label="Search a game or paste a Steam store link"
        autofocus={props.autofocus}
        required
      />
      <button class="btn" type="submit">Search</button>
    </form>
  );
}

export function LandingPage(props: { user: User | null }) {
  return (
    <Layout user={props.user}>
      <section class="hero">
        <h1>One wishlist.<br />Every store.</h1>
        <p class="lede">
          Track games across Steam, GOG, Epic, Humble and more. Choose the price you want to pay.
          We'll email you when it gets there.
        </p>
        <SearchBox autofocus />
        <p class="muted small">Free. No password. Sign in with a code sent to your email.</p>
      </section>

      <section class="mock card">
        <div class="mock-row head"><span>Game</span><span>Now</span><span>Lowest ever</span><span>Your price</span><span>Status</span></div>
        <div class="mock-row"><span>Cyberpunk 2077</span><span>$29.99</span><span>$19.99</span><span>$20.00</span><span class={statusClass('WAIT')}>WAIT</span></div>
        <div class="mock-row"><span>Baldur's Gate 3</span><span>$47.99</span><span>$35.99</span><span>$39.00</span><span class={statusClass('CLOSE')}>CLOSE</span></div>
        <div class="mock-row"><span>Hades II</span><span>$22.49</span><span>$22.49</span><span>$25.00</span><span class={statusClass('TARGET HIT')}>TARGET HIT</span></div>
      </section>

      <section class="features">
        <div>
          <h2>Stop checking sales.</h2>
          <p>Add a game once and set your price. SnagDeals checks prices every hour so you don't have to.</p>
        </div>
        <div>
          <h2>Know if a deal is actually good.</h2>
          <p>See the lowest price ever, the normal price, and the cheapest store right now. A big "% off" isn't always a good deal.</p>
        </div>
        <div>
          <h2>Never pay twice.</h2>
          <p>Mark games as owned or purchased and see how much you saved by waiting.</p>
        </div>
      </section>
    </Layout>
  );
}

export function LoginPage(props: { next: string; error?: string; email?: string }) {
  return (
    <Layout user={null} title="Sign in">
      <section class="narrow card">
        <h1>Sign in</h1>
        <p class="muted">We'll email you a 6-digit code. New here? This creates your account.</p>
        {props.error && <Flash kind="error">{props.error}</Flash>}
        <form method="post" action="/login" class="stack">
          <input type="hidden" name="next" value={props.next} />
          <label>
            Email
            <input type="email" name="email" value={props.email ?? ''} autocomplete="email" required autofocus />
          </label>
          <button class="btn" type="submit">Email me a code</button>
        </form>
      </section>
    </Layout>
  );
}

export function VerifyPage(props: { email: string; next: string; code?: string; error?: string; sent?: boolean }) {
  return (
    <Layout user={null} title="Check your email">
      <section class="narrow card">
        <h1>Check your email</h1>
        {props.sent && <p class="muted">We sent a code to <b>{props.email}</b>. It expires in 15 minutes.</p>}
        {props.error && <Flash kind="error">{props.error}</Flash>}
        <form method="post" action="/verify" class="stack">
          <input type="hidden" name="email" value={props.email} />
          <input type="hidden" name="next" value={props.next} />
          <label>
            6-digit code
            <input
              name="code"
              value={props.code ?? ''}
              inputmode="numeric"
              autocomplete="one-time-code"
              pattern="[0-9]{6}"
              maxlength={6}
              required
              autofocus={!props.code}
              class="code-input"
            />
          </label>
          <button class="btn" type="submit">Sign in</button>
        </form>
        <p class="small muted"><a href={`/login?next=${encodeURIComponent(props.next)}`}>Use a different email or send a new code</a></p>
      </section>
    </Layout>
  );
}

export function SearchPage(props: { user: User | null; q: string; results: SearchResult[] | null; tracked: Set<string>; error?: string }) {
  const next = `/search?q=${encodeURIComponent(props.q)}`;
  return (
    <Layout user={props.user} title={props.q ? `Search: ${props.q}` : 'Search'}>
      <SearchBox q={props.q} autofocus={!props.q} />
      {props.error && <Flash kind="error">{props.error}</Flash>}
      {props.results && props.results.length === 0 && <p class="muted">No games found for "{props.q}".</p>}
      {props.results && props.results.length > 0 && (
        <ul class="results">
          {props.results.map((r) => (
            <li class="result card">
              {r.thumb ? <img src={r.thumb} alt="" loading="lazy" /> : <div class="thumb-fallback" />}
              <div class="result-body">
                <div class="result-title">{r.title}</div>
                <div class="muted small">Cheapest now: {money(r.cheapest)}</div>
              </div>
              {props.tracked.has(r.gameId) ? (
                <span class="muted small">On your wishlist</span>
              ) : props.user ? (
                <form method="post" action="/app/track">
                  <input type="hidden" name="gameId" value={r.gameId} />
                  <button class="btn btn-small" type="submit">Track</button>
                </form>
              ) : (
                <a class="btn btn-small" href={`/login?next=${encodeURIComponent(next)}`}>Track</a>
              )}
            </li>
          ))}
        </ul>
      )}
    </Layout>
  );
}

const FILTERS: { key: string; label: string; match: (s: Status) => boolean }[] = [
  { key: 'all', label: 'All', match: () => true },
  { key: 'hit', label: 'Target hit', match: (s) => s === 'TARGET HIT' || s === 'HISTORICAL LOW' },
  { key: 'waiting', label: 'Waiting', match: (s) => s === 'WAIT' || s === 'CLOSE' || s === 'NO PRICE' },
  { key: 'owned', label: 'Owned & purchased', match: (s) => s === 'OWNED' || s === 'PURCHASED' },
];

export function DashboardPage(props: { user: User; rows: DashRow[]; savedThisYear: number; filter: string; flash?: string }) {
  const filter = FILTERS.find((f) => f.key === props.filter) ?? FILTERS[0];
  const rows = props.rows.filter((r) => filter.match(statusOf(r)));
  const hits = props.rows.filter((r) => statusOf(r) === 'TARGET HIT').length;
  return (
    <Layout user={props.user} title="Your wishlist" wide>
      {props.flash && <Flash>{props.flash}</Flash>}
      <section class="stats">
        <div class="stat card">
          <div class="stat-label">Saved this year</div>
          <div class="stat-value">{money(props.savedThisYear)}</div>
          <div class="muted small">by waiting for the right price</div>
        </div>
        <div class="stat card">
          <div class="stat-label">Tracking</div>
          <div class="stat-value">{props.rows.filter((r) => r.state === 'tracking').length}</div>
          <div class="muted small">games on your wishlist</div>
        </div>
        <div class="stat card">
          <div class="stat-label">Targets hit</div>
          <div class="stat-value">{hits}</div>
          <div class="muted small">ready to snag now</div>
        </div>
      </section>

      <div class="toolbar">
        <nav class="tabs">
          {FILTERS.map((f) => (
            <a href={`/app?filter=${f.key}`} class={f.key === filter.key ? 'tab active' : 'tab'}>{f.label}</a>
          ))}
        </nav>
        <a class="btn btn-small" href="/search">+ Add a game</a>
      </div>

      {props.rows.length === 0 ? (
        <section class="card empty">
          <h2>Your wishlist is empty</h2>
          <p class="muted">Search for a game or paste a Steam link to start tracking it.</p>
          <SearchBox autofocus />
        </section>
      ) : rows.length === 0 ? (
        <p class="muted">Nothing here.</p>
      ) : (
        <div class="table card">
          <div class="trow thead">
            <span>Game</span><span>Now</span><span>Lowest ever</span><span>Your price</span><span>Status</span>
          </div>
          {rows.map((r) => {
            const p = priceState(r);
            const s = statusOf(r);
            const off = discountPct(r.current_price, r.retail_price);
            return (
              <a class="trow" href={`/app/item/${r.id}`}>
                <span class="game">
                  {r.thumb ? <img src={r.thumb} alt="" loading="lazy" /> : <span class="thumb-fallback" />}
                  <span>
                    <span class="game-title">{r.title}</span>
                    <span class="muted small">{r.store_name ?? '—'}</span>
                  </span>
                </span>
                <span data-label="Now">{money(r.current_price)}{off ? <span class="off">-{off}%</span> : null}</span>
                <span data-label="Lowest ever">{money(r.historical_low)}</span>
                <span data-label="Your price">{r.state === 'tracking' ? describeTarget(r.rule as Rule, r.target_value, p) : money(r.purchased_price)}</span>
                <span><span class={statusClass(s)}>{s}</span></span>
              </a>
            );
          })}
        </div>
      )}
    </Layout>
  );
}

function Sparkline(props: { points: { price: number; checked_at: number }[] }) {
  const pts = props.points;
  if (pts.length < 2) return <p class="muted small">Price history builds up as we check prices every hour.</p>;
  const w = 600, h = 120, pad = 8;
  const xs = pts.map((p) => p.checked_at), ys = pts.map((p) => p.price);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  const sx = (x: number) => pad + ((x - x0) / Math.max(1, x1 - x0)) * (w - 2 * pad);
  const sy = (y: number) => h - pad - ((y - y0) / Math.max(0.01, y1 - y0)) * (h - 2 * pad);
  // Step line: a price holds until the next change.
  let d = `M${sx(xs[0])},${sy(ys[0])}`;
  for (let i = 1; i < pts.length; i++) d += ` H${sx(xs[i])} V${sy(ys[i])}`;
  return (
    <figure class="spark">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label="Price history">
        <path d={d} fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke" />
      </svg>
      <figcaption class="muted small">{money(y0)} – {money(y1)} since {fmtDate(x0)}</figcaption>
    </figure>
  );
}

export function ItemPage(props: {
  user: User;
  row: DashRow;
  history: { price: number; checked_at: number }[];
  deals: { store: string; price: number; dealId: string }[];
  isNew?: boolean;
  flash?: string;
  error?: string;
}) {
  const r = props.row;
  const p = priceState(r);
  const s = statusOf(r);
  const label = dealLabel(p);
  const t = targetPrice(r.rule as Rule, r.target_value, p);
  const off = discountPct(r.current_price, r.retail_price);
  return (
    <Layout user={props.user} title={r.title}>
      {props.flash && <Flash>{props.flash}</Flash>}
      {props.error && <Flash kind="error">{props.error}</Flash>}
      <p><a href="/app" class="small">← Wishlist</a></p>
      <section class="item-head">
        {r.thumb ? <img src={r.thumb} alt="" /> : <div class="thumb-fallback big" />}
        <div>
          <h1>{r.title}</h1>
          <span class={statusClass(s)}>{s}</span>
          {label && <span class="label">{label}</span>}
        </div>
      </section>

      <section class="facts card">
        <div><div class="stat-label">Now</div><div class="fact">{money(r.current_price)}{off ? <span class="off">-{off}%</span> : null}</div><div class="muted small">{r.store_name ?? '—'}</div></div>
        <div><div class="stat-label">Lowest ever</div><div class="fact">{money(r.historical_low)}</div><div class="muted small">{fmtDate(r.historical_low_date)}</div></div>
        <div><div class="stat-label">Full price</div><div class="fact">{money(r.retail_price)}</div><div class="muted small">checked {ago(r.last_checked)}</div></div>
        <div><div class="stat-label">Your price</div><div class="fact">{money(t)}</div><div class="muted small">{RULE_LABELS[r.rule as Rule]}</div></div>
      </section>

      {r.current_deal_id && r.state === 'tracking' && (
        <p><a class="btn" href={dealUrl(r.current_deal_id)} rel="noopener sponsored" target="_blank">Open {r.store_name ?? 'store'} · {money(r.current_price)}</a></p>
      )}

      {r.state === 'tracking' && (
        <section class={props.isNew ? 'card highlight' : 'card'}>
          <h2>When should we email you?</h2>
          <form method="post" action={`/app/item/${r.id}/target`} class="target-form">
            {(Object.keys(RULE_LABELS) as Rule[]).map((rule) => (
              <label class="radio">
                <input type="radio" name="rule" value={rule} checked={r.rule === rule} />
                <span>{RULE_LABELS[rule]}</span>
                {rule === 'price' && (
                  <span class="inline-input">$<input type="number" name="price" min="0.01" max="1000" step="0.01" value={r.rule === 'price' ? String(r.target_value ?? '') : ''} placeholder={r.historical_low != null ? r.historical_low.toFixed(2) : '20.00'} /></span>
                )}
                {rule === 'percent' && (
                  <span class="inline-input"><input type="number" name="percent" min="1" max="99" step="1" value={r.rule === 'percent' ? String(r.target_value ?? '') : ''} placeholder="50" />% off</span>
                )}
              </label>
            ))}
            <button class="btn" type="submit">Save</button>
          </form>
        </section>
      )}

      {props.deals.length > 0 && (
        <section class="card">
          <h2>Prices right now</h2>
          <ul class="deals">
            {props.deals.map((d) => (
              <li><a href={dealUrl(d.dealId)} rel="noopener sponsored" target="_blank">{d.store}</a><span>{money(d.price)}</span></li>
            ))}
          </ul>
        </section>
      )}

      <section class="card">
        <h2>Price history</h2>
        <Sparkline points={props.history} />
      </section>

      <section class="card">
        <h2>{r.state === 'tracking' ? 'Got it?' : 'Status'}</h2>
        {r.state === 'tracking' ? (
          <div class="actions">
            <form method="post" action={`/app/item/${r.id}/purchased`} class="inline-form">
              <label>Bought for $<input type="number" name="price" min="0" max="1000" step="0.01" value={r.current_price != null ? r.current_price.toFixed(2) : ''} required /></label>
              <button class="btn btn-small" type="submit">Mark purchased</button>
            </form>
            <form method="post" action={`/app/item/${r.id}/state`}>
              <input type="hidden" name="state" value="owned" />
              <button class="btn btn-small btn-ghost" type="submit">I already own it</button>
            </form>
          </div>
        ) : (
          <div class="actions">
            <p class="muted">
              {r.state === 'purchased'
                ? `Purchased for ${money(r.purchased_price)}${r.retail_at_purchase != null && r.purchased_price != null && r.retail_at_purchase > r.purchased_price ? ` · you saved ${money(r.retail_at_purchase - r.purchased_price)}` : ''}.`
                : 'Marked as owned. We won\'t alert you about it.'}
            </p>
            <form method="post" action={`/app/item/${r.id}/state`}>
              <input type="hidden" name="state" value="tracking" />
              <button class="btn btn-small btn-ghost" type="submit">Track again</button>
            </form>
          </div>
        )}
        <form method="post" action={`/app/item/${r.id}/delete`} class="danger-zone">
          <button class="link-danger" type="submit">Remove from wishlist</button>
        </form>
      </section>
    </Layout>
  );
}

export function SettingsPage(props: { user: User; flash?: string }) {
  return (
    <Layout user={props.user} title="Settings">
      {props.flash && <Flash>{props.flash}</Flash>}
      <h1>Settings</h1>
      <section class="card">
        <h2>Email alerts</h2>
        <p class="muted">Signed in as <b>{props.user.email}</b>.</p>
        <form method="post" action="/settings/alerts" class="inline-form">
          <label class="radio">
            <input type="checkbox" name="email_alerts" value="1" checked={props.user.email_alerts === 1} />
            <span>Email me when a game hits my price</span>
          </label>
          <button class="btn btn-small" type="submit">Save</button>
        </form>
      </section>
      <section class="card">
        <h2>Session</h2>
        <form method="post" action="/logout"><button class="btn btn-small btn-ghost" type="submit">Sign out</button></form>
      </section>
      <section class="card">
        <h2>Delete account</h2>
        <p class="muted">Deletes your account and wishlist. This can't be undone.</p>
        <form method="post" action="/settings/delete" class="inline-form">
          <label>Type <b>delete</b> to confirm <input name="confirm" required pattern="delete" /></label>
          <button class="btn btn-small btn-danger" type="submit">Delete account</button>
        </form>
      </section>
    </Layout>
  );
}

export function MessagePage(props: { user: User | null; title: string; children: any }) {
  return (
    <Layout user={props.user} title={props.title}>
      <section class="narrow card">
        <h1>{props.title}</h1>
        {props.children}
      </section>
    </Layout>
  );
}
