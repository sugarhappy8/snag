# AnotherLife

**A life simulator that runs entirely in your browser.**

AnotherLife is a browser game that plays like BitLife. You're born, you press **+ Age**,
and you live a whole life one year at a time. Along the way you go to school, get jobs and get
promoted, date, marry, have kids and adopt pets, buy houses and cars, start companies and invest,
gamble, commit crimes, go to prison and try to escape, get famous, and finally die and earn a
ribbon. Then you can carry on as one of your children.

Every part of the story is built in and runs on your device:

- each year's life-log lines and random events with choices come from a large event library
  that knows your age, country, era, family, job and situation, and doesn't repeat itself;
- **Do Anything**: type any action ("start a garage band with my best friend") and the game
  reads its keywords and works out what happens, within the rules for your age, money and
  whether you're behind bars (a few times a year);
- job interviews draw from a pool of scored questions, and applications are screened against
  your CV and the local job market;
- your obituary is written from the life you actually lived.

Money changes your life too. Once you're rich, your kids want pocket money, cars, vacations and
a house, and friends and family come asking for loans. Companies grow without hard caps: unlimited
R&D and product lines, as many stores, offices and factory lines as the market and your cash
allow, picked with sliders. Hire a CEO to run them (the best ones above skill 75 optimize like
real executives and write you a yearly letter), answer to a board of directors once outsiders
own part of the company, and merge your companies into a conglomerate.

Choose from 45 company sectors. National demand, input costs and customer tastes change over
time; study your markets and run up to three local strategy programs per country. Elite CEOs
bring stronger operating performance and turnaround planning, and ask for an initial 2–10%
equity grant. Any positive company or conglomerate stake prevents voluntary resignation or
retirement, even after dilution or skill growth; salary and board dismissal still apply.
Group CEOs recruit division leaders at their own rating or higher.
Large stock orders affect execution prices and market quotes, and major company declines
shake national-sector confidence. With the **Inventor** talent, fund risky multi-year research
into alternate-history technologies: a 15-year head start or a fictional frontier breakthrough
with 20 years of product exclusivity. Even a monopoly needs cash, staff and production capacity.
For a completed tier invention, open **Inventor Lab → the invention → Patent in All Nations**
to file every remaining country at once. The confirmation shows the combined national fees;
existing filings are skipped, and each country's patent term and enforcement still apply.

Game studios can develop their own technology from **Game Engines** on the company screen:
build an indie, professional, or flagship engine, then select it when greenlighting games for
royalty-free use. Offer three-year licenses for annual fees or revenue royalties, or sell the
engine IP outright. Development uses the studio's existing developers and company cash;
licensing demand follows quality, reputation, engine age, and the market. Selling transfers
future licensing income and new-game rights while preserving use in existing games.

There is no server and no account: the game never sends anything anywhere.

> AnotherLife is a fan-made game inspired by BitLife's gameplay. It is not affiliated with or
> endorsed by Candywriter, and it uses no BitLife names, art or assets.

> The game names real brands, companies, products, places, market indices, investment funds and
> cryptocurrencies (including Bitcoin, Ethereum and Dogecoin), because those names help a life feel
> grounded in its time. Their names and trademarks belong to their respective owners and are used
> only for identification. AnotherLife is a fictional simulation, not market data or a statement
> about any company or asset: every price, return, event, competitor profile, market share and
> outcome is simulated or modelled for gameplay, is not a quote, fact, forecast or recommendation,
> and no named brand, company, fund, index, coin or person has endorsed, sponsored or is affiliated
> with this project.

## Play it

AnotherLife is a static website hosted on Cloudflare. Open the game at its Cloudflare URL (see
[Deploying](#deploying-to-cloudflare)), e.g. `https://snag.<your-account>.workers.dev`, and press
**New Life**: a random life, or a custom one (name, gender, country, birth year from 1900 to
today, starting stats and up to three special talents). Your current life, your ribbons and your
graveyard are saved in this browser.

## Deploying to Cloudflare

This repo is connected to a Cloudflare Worker named **`snag`** through Workers Builds. Every push
to the Worker's production branch rebuilds and redeploys the site. `wrangler.jsonc` declares a
static-assets Worker: `wrangler deploy` runs `npm run build` (typecheck + Vite) and uploads
`dist/`, so a build that doesn't compile is never deployed. The site is served at
`https://snag.<your-account>.workers.dev` plus any custom domain attached to the Worker under
**Settings → Domains & Routes**.

To deploy by hand from your computer:

```bash
npm install
npx wrangler login
npm run deploy
```

## Run it locally instead

```bash
npm install
npm run dev
```

Open <http://localhost:5173>.

## Settings (⚙️)

| Setting | What it does |
|---|---|
| **Currency** | *Local currency* (yen in Japan, Deutsche Marks in 1980s Germany...) or *US dollars* everywhere. Only the display changes. |
| **Prices** | *As they were*: amounts in the money of the year being lived. *Today's money*: every year in today's prices. |
| **Sandbox: unlimited Time Machine** | Removes the limit on Time Machine jumps (normally 3 per life, to the start of one of the last 10 years). |
| **Danger Zone** | Abandon the current life, or reset your ribbons and graveyard. |

Upgrading from a version that had an AI narrator: your saves keep working, and the old AI
settings (provider, server URLs, API keys, models) are deleted from this browser the first time
the new version starts.

## Development

```bash
npm run dev          # dev server
npm test             # unit tests (Vitest)
npm run typecheck    # TypeScript
npm run build        # production build into dist/ (serve it with `npm run preview`)
npm run deploy       # build and deploy to Cloudflare (needs `npx wrangler login` once)
# Headless playthrough in Chromium (fails on page errors, console errors or any outside request):
npm i --no-save playwright && npm run build && npx vite preview --port 4341 --strictPort &
node scripts/e2e-play.mjs http://localhost:4341/ --years 120 --seed 1
```

The engine (`src/game`) is plain TypeScript with a seeded RNG and no React; the React UI is in
`src/ui`. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the pieces fit together.
