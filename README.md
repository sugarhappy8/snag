# SnagDeals

**One wishlist. Every store. You choose the price.**

SnagDeals tracks game prices across Steam, GOG, Epic, Humble, Fanatical, GreenManGaming and
more. You set the price you want to pay, and it emails you when a game gets there. Live at
[snagdeals.store](https://snagdeals.store) once deployed.

The full product plan is in [`product-plan.txt`](product-plan.txt). This is the MVP from
section 24 of that plan.

## What works today

- Passwordless sign-in: you enter your email, get a 6-digit code (or a link), and that
  verifies the address and creates the account.
- Search games, or paste a Steam store link.
- A unified wishlist with current lowest price, store, lowest price ever, full price and status
  (`TARGET HIT`, `HISTORICAL LOW`, `CLOSE`, `WAIT`, `OWNED`, `PURCHASED`).
- Price targets: a price you choose, a % discount, any discount, or the historical low.
- A deal-quality label based on price history rather than "% off": *New historical low*,
  *Near historical low*, *Good deal*, *Normal price*, and so on.
- Store-by-store price comparison, and a price-history chart that builds up over time.
- An hourly price check that sends one digest email per user when targets are hit. It
  alerts once per drop, again only if the price falls further, and re-arms if the price
  goes back up.
- Mark games as owned or purchased, and a "saved this year" total.
- One-click unsubscribe in alert emails, an alerts toggle, and account deletion.

PlayStation and Xbox aren't included yet, because neither has a public price API.
CheapShark covers PC stores only.

## Stack

| Piece | Service | Free tier |
| --- | --- | --- |
| Hosting + hourly job | [Cloudflare Workers](https://developers.cloudflare.com/workers/) | 100k requests/day, 5 cron triggers, never sleeps |
| Database | [Cloudflare D1](https://developers.cloudflare.com/d1/) (SQLite) | 5 GB, 5M row reads/day, 100k row writes/day |
| Email | [Resend](https://resend.com) | 3,000 emails/month, 100/day |
| Prices | [CheapShark API](https://apidocs.cheapshark.com) | Free, no key |

**Why Workers instead of Render:** Render's free web service sleeps after 15 minutes with
no traffic and has no free cron. A price tracker needs a job that runs every hour. Workers
never sleeps and includes cron for free. It also deploys from GitHub on every push, like
Render.

**Why D1 instead of Turso:** Both are SQLite. D1 lives on the same platform as the app, so
there's no second account, no database token to manage, and no network hop. If you'd
rather use Turso, the queries are plain SQLite and port over directly.

Code layout:

```
src/index.tsx     routes (Hono) + scheduled() entry
src/auth.ts       email codes, sessions, rate limits, unsubscribe tokens
src/cron.ts       hourly price refresh + alert emails
src/prices.ts     CheapShark client
src/email.ts      Resend client + email templates
src/rules.ts      target / status / deal-label logic (pure, unit tested)
src/views/        server-rendered pages (hono/jsx)
public/           CSS + favicon
migrations/       D1 schema
```

## Deploy (about 15 minutes)

You need a free [Cloudflare](https://dash.cloudflare.com/sign-up) account and a free
[Resend](https://resend.com/signup) account.

1. **Install and log in**
   ```sh
   npm install
   npx wrangler login
   ```

2. **Create the database.** Copy the `database_id` this prints into `wrangler.jsonc`,
   then create the tables:
   ```sh
   npx wrangler d1 create snagdeals
   npm run db:migrate
   ```

3. **Point snagdeals.store at Cloudflare.** In the Cloudflare dashboard, choose
   *Add a domain* → `snagdeals.store` → Free plan. Then set the two nameservers it gives
   you at the registrar where you bought the domain.

4. **Set up Resend.** In Resend, go to *Domains* → *Add domain* → `snagdeals.store` and
   add the DNS records it lists in Cloudflare's DNS tab. Once the domain shows
   *Verified*, create an API key with *Sending access*.

5. **Add secrets**
   ```sh
   openssl rand -hex 32 | npx wrangler secret put AUTH_SECRET
   npx wrangler secret put RESEND_API_KEY      # paste the re_... key
   ```

6. **Deploy.** In `wrangler.jsonc`, uncomment the `routes` line so the site serves on
   `snagdeals.store`, then:
   ```sh
   npm run deploy
   ```

7. **Optional: auto-deploy on push, like Render.** In the Cloudflare dashboard, go to
   *Workers & Pages* → `snagdeals` → *Settings* → *Builds* → connect this GitHub repo.

Alerts are sent from `alerts@snagdeals.store`. To change that, edit `FROM_EMAIL` in
`wrangler.jsonc`.

## Local development

```sh
cp .dev.vars.example .dev.vars   # leave RESEND_API_KEY unset to print emails to the console
npm run db:migrate:local
npm run dev                      # http://localhost:8787
```

Sign-in codes and alert emails print in the terminal. To run the hourly job by hand, start
the server with `npx wrangler dev --test-scheduled` and open
`http://localhost:8787/__scheduled`.

```sh
npm test          # unit tests
npm run typecheck
```

## Limits to know about

- **Resend free tier: 100 emails/day.** Sign-in codes and alerts share it. Alerts are
  batched into one digest per user per hour to save quota. Upgrade Resend before a launch
  spike.
- **Workers free tier: 50 outbound requests per run.** Each hourly run refreshes up to the
  200 least-recently-checked games. With more than about 4,800 tracked games, some prices
  will be older than a day.
- **Sign-in rate limits:** 10 code emails per IP per hour, and one per email address per
  minute. Each code allows 5 tries and expires after 15 minutes.
- Prices are in USD (CheapShark's US data). Regional pricing comes later (plan section 30).
