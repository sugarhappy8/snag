import type { Child } from 'hono/jsx';
import type { User } from '../types';

export function Layout(props: { title?: string; user: User | null; children: Child; wide?: boolean }) {
  const title = props.title ? `${props.title} · SnagDeals` : 'SnagDeals · One wishlist. Every store.';
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        <meta name="description" content="Track games across Steam, GOG, Epic and more. Choose the price you want to pay. SnagDeals tells you when it gets there." />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="stylesheet" href="/styles.css" />
      </head>
      <body>
        <header class="topbar">
          <div class="wrap topbar-inner">
            <a href={props.user ? '/app' : '/'} class="logo">Snag<span>Deals</span></a>
            <nav>
              <a href="/search">Search</a>
              {props.user ? (
                <>
                  <a href="/app">Wishlist</a>
                  <a href="/settings">Settings</a>
                </>
              ) : (
                <a href="/login" class="btn btn-small">Sign in</a>
              )}
            </nav>
          </div>
        </header>
        <main class={props.wide ? 'wrap wide' : 'wrap'}>{props.children}</main>
        <footer class="wrap footer">
          <span>SnagDeals helps you buy what you already want, at the right price.</span>
          <span>
            Price data from <a href="https://www.cheapshark.com" rel="noopener">CheapShark</a>. Prices in USD.
          </span>
        </footer>
      </body>
    </html>
  );
}

export function Flash(props: { kind?: 'ok' | 'error'; children: Child }) {
  return <div class={`flash ${props.kind ?? 'ok'}`}>{props.children}</div>;
}
