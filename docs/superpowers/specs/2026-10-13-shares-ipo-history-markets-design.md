# Shares, IPO float and historical market events (v2.4.0)

## What the player asked for

1. After inheriting with siblings, selling all your shares leaves the company or group in your
   list with "₩0 yours". A company you own none of should leave your list.
2. A slider for how much of the company an IPO floats.
3. A slider at founding for how many shares the company has in total.
4. More shares (a lower price per share) appeal to retail investors: more people buy at the IPO.
5. Markets that follow real history: the 1970s oil shocks, the dot-com boom and crash, the
   2007–09 housing crash, the 2020 crash and oil collapse, the 2022 crash and the 2023–26 AI boom.
   Every company, the player's included, is hit hard if it is in the affected market and mildly
   otherwise.

Assumptions: "only historical to real events" means the big market moves come from real events in
their real years. The procedural future invents none. Ongoing standing instruction: no review
gate, ship when done.

## 1. Selling out of a family company

**Cause.** `sellShares` (exit.ts) and `sellGroupShares` (conglomerate-actions.ts) skip removal
whenever relatives hold family shares, so the asset stays at 0%.

**Fix.** When the player's stake hits 0 (or a sliver below 0.5% / 1%):
- Each relative's stake becomes part of their own wealth at its market value. This uses the
  existing `payHolder` routing: living relatives get money, the will's charity gets a log line,
  and late owners' slices go to their heirs.
- The company or group leaves the player's assets, as in the no-family branch.

The notice says what happened to the relatives' shares.

A year-end sweep removes **listed** companies and groups where the player holds 0%, which fixes
saves that already sold out. Private family holdings shown to an excluded heir stay as designed
(docs/DYNASTY.md).

## 2. Share count, IPO float and retail demand

**Share count** (new optional `BizState.shareCount`):
- Chosen at founding by a slider from 1,000 to 10 billion (default 10 million), right after the
  starting capital.
- Changeable while private from Capital & Ownership ("Share Count"). This is a free split and
  changes nobody's ownership.
- Old saves and NPC companies have no count. They keep today's rule: about $25 a share at the IPO.
- The preview shows the price a share would have at today's value and at IPO size
  (`IPO_PROFIT` × industry multiple), plus how retail investors would see that price.

**Retail appeal** (`retailAppeal(price)`, 0–1, pure, in constant 2026 dollars):
- Highest for affordable shares, about $3–$30.
- Falls for expensive shares: 0.7 at $100, 0.35 at $1,000.
- Falls below $1, where shares look like a penny stock.
- More shares means a lower price, and so more retail buyers, down to the penny-stock floor.

**IPO float slider:** 5–60% of the company, default 25%. New shares are issued; proceeds go to
company cash, less 6% fees, as today.
- **Pricing:** the price per share is the pre-money value ÷ the share count. Without a count it
  comes out at about $25.
- **Demand (coverage):** `(0.55 + 0.9 × appeal) × (0.25 / float)^0.35 × market mood`.
  - Mood is the year's historical event valuation factor for the industry, damped.
  - Oversubscribed (coverage ≥ 1): priced up to +15% higher, with a bigger day-one pop.
  - Undersubscribed: only that part of the offer sells, at a discount.
- **Preview** (pure): the shares issued, the price, the expected raise, the stake you keep, the
  retail verdict and the expected coverage. It warns when you'd keep under half.
- **Group IPOs** get the same float slider. Their share count follows the $25 rule.
- **Later share sales:** retail appeal deepens the market for the player's share sales, a modest
  depth factor of 0.8–1.25.

## 3. Historical market events

New pure module `src/game/history/market-events.ts`.

**Exposure groups** (each industry belongs to at most one):

| Group | Industries |
| --- | --- |
| oil | energy |
| fuel users | logistics, farm, manufacturing, packaging, food truck, auto shop, recycling |
| clean energy | solar, battery, electric vehicles |
| property | real estate, construction, furniture |
| banking | bank, online bank |
| investing | investment firm |
| internet | software, e-commerce, marketing, telecom, game studio, cybersecurity |
| chips | semiconductor, data center |
| AI | AI lab (robotics and quantum at half strength) |
| travel | travel, hotel, live entertainment, casino |
| going out | restaurant, bar, cafe, nightclub, strip club, gym, salon |
| retail | fashion, beauty |

Everything else feels only the "everyone" effect.

**Events.** Each has an intensity by year, home countries (full strength), a strength abroad, and
effects per group plus an "everyone" effect on demand, costs and valuation multiples:

| Event | Years |
| --- | --- |
| Great Depression | 1929–1933 |
| Oil embargo | 1973–1975 |
| Iranian oil shock and high rates | 1979–1982 |
| Gulf War oil spike | 1990–91 |
| Japan's bubble bursts | 1990–1993, Japan |
| Dot-com boom | 1995–1999 |
| Asian financial crisis | 1997–98, local |
| Dot-com crash | 2000–2003 |
| 2008 oil spike | 2008 |
| Housing crash and financial crisis | 2007–2011, US/UK/IE/ES/IS at full strength |
| Euro crisis | 2010–2012, local |
| Oil price collapse | 2014–2016 |
| 2020 crash and oil collapse | 2020–21 |
| 2022 crash | 2022–23 |
| AI boom | 2023–2026, fading gently 2027–2030 with no crash invented |

**Factors** (summed per event): demand clamped 0.45–1.8, costs 0.75–1.5, value 0.3–3.
- World-market industries (software, chips, AI…) already carry the dot-com dip and AI growth in
  their market-size curves, so they get only 35% of an event's demand effect. Valuation effects
  apply in full.
- In 2026, the year every test runs in, the AI boom has no "everyone" effect, only its own
  groups.

**Hooks** (one pure lookup each, deterministic):
- Demand and costs: `nationalMarket`. This covers player companies, NPC companies, deep tech,
  studios and the planner.
- Valuation multiples: `valuationOf`, in the year of the last booked record; and deep-tech
  `operatingValue`.
- Listed player companies and groups: `exchangeMove` uses the real index return in history
  years, so their prices move with the real market.
- Economic rivals: `advanceActor` sector demand and costs.

**News:**
- A "Markets" notice (deterministic id, once per event per generation) when an event first hits
  hard (intensity ≥ 0.5) and the player owns a company. It lists how each company is exposed.
- The Annual Report's market note names the year's events for that company.
- The company's Market & Competition screen lists the active events with this company's demand,
  cost and valuation effects.

## Testing

- **Unit tests:**
  - Event factors: the exposed group is hit harder than everyone else, home countries are hit
    harder than abroad, the factors are clamped, nothing happens outside the event years, and the
    AI fade invents no crash.
  - Retail appeal shape; IPO float math and conservation (stake, shares, raise).
  - The share-count slider; family sell-out payouts and removal.
- **Existing tests:** update where they pin the 25% IPO (keep 25% as the default) or a
  2026 AI-sector valuation.
- **Full suite, build, and browser checks** of the founding share slider, the IPO slider, a
  sell-out with siblings, and a 2008 real-estate company.
