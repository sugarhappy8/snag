# Business, banking, investment firms and inventing: rework design

Date: 2026-10-12 · Base: `main` v2.1.3 · Target: v2.2.0

## What the player asked for

> Go through the current game and fix all bugs. Also rework most of the business, the investment
> firms, banking business, and finally fully change the inventor talent and invention gameplay.
> Make the game better and more fun.

## What is wrong today (observed by reading the code and dumping the menus as text)

- **Inventor** is a research-administration simulator: 38 topics × 3 approaches × 8 fields, "topic
  points", "evidence thresholds", grants, strain, replication. Every topic shows the same six
  buttons; nearly all are disabled with long explanations. Finished IP then needs fabs, staff,
  sliders and patents per country before it sells anything. There is almost no story and nothing
  funny or surprising happens. It is visible only to players with the talent.
- **Banks and investment firms** are a wall of 10+ sliders (controls, reserves, two rates, lending
  share, staffing, three budgets, leverage, fees) and long legal disclaimers. The player cannot tell
  what a good year looks like. Generic programs ("Local sourcing", "Premium positioning") and
  "Owned Inventions" appear on a bank. The market screen says the banking market is "$0 a year".
  A Business-talent or elite-CEO investment firm earns ~35–45% a year ("perfect foresight"), which
  is an exploit, not a game.
- **Classic businesses** are deep and mostly sound (Annual Report minigame, market screen, boards,
  conglomerates), but the company screen opens with ~11 info lines, a 100-row country list and
  inventions clutter; the IPO bar ($300M of yearly profit) is out of reach for nearly every life;
  there are few milestones to celebrate.

## Principles (all workstreams)

1. **Decisions over sliders.** A year should offer 1–3 meaningful choices with visible trade-offs,
   then a result the player can read in one glance. Sliders stay only where a number really is the
   decision (rates, fees, amounts).
2. **Drama.** Popups with choices (BitLife style) for the moments that matter: bank runs, unicorns,
   scandals, explosions in the garage, history being made.
3. **Honest numbers.** Money is conserved: customers' deposits and clients' assets are never company
   cash; every dollar the player receives is earned by a modeled event. No guaranteed returns, no
   foresight exploits. Talents give honest purple hints and better odds, never certainty.
4. **Short text.** Info lines ≤ ~140 characters. Explanations live in the one popup where they matter,
   not on every row.
5. **Golden rules from `docs/ARCHITECTURE.md` still apply**: plain-JSON state, all randomness through
   `rng.ts` (or deterministic `seeded()` / `economicRoll` streams for yearly sims), menus pure (no
   mutation, no RNG), engine money in constant 2026 USD shown via `formatMoney`, era gates on menus
   AND resolvers, teen-appropriate text, real brands only where the registry allows (never real living
   people, nothing negative about a real company; scams and scandals use fictional names).
6. **Old saves keep loading** and keep their value: every new state reader normalizes missing or legacy
   data without throwing; migrations never grant free money.

---

## 1. Inventor 2.0 — "The Workshop" (full replacement)

### Access and the talent
- **Activities → 💡 Inventor's Workshop**, for everyone from age 8 (not in prison, not dead).
- The **Inventor talent** makes you a genius: about 3× as many ideas, +20 prototype quality, double
  skill growth, half the explosion risk, access to *history-race* ideas, and purple hints that reveal
  an idea's real market appeal and the best launch route (computed from the same math the resolver
  uses). Main Character Syndrome counts as having it (`hasTalent`).
- New talent perk text: "Ideas strike constantly. Build better prototypes, race history to its greatest
  inventions, and see which ideas will sell."
- Childhood discovery text and hints in `life.ts TALENTS` updated to point at the Workshop.

### Core loop
1. **Ideas** go into a notebook (max 12). Sources: a yearly spark (talent: 1–2 per year from age 6;
   others ~15% a year from age 10), the **💭 Brainstorm** action (2 a year; odds from smarts and
   talent), and occasional life-event sparks ("While folding laundry you had an idea…": write it down
   / forget it).
2. **Catalog** (`inventor-catalog.ts`, 120+ ideas): each has id, name, emoji, one-line blurb,
   category (gadget, home, toy, health, transport, energy, computing, food, fashion, weird), era window
   `from`/`to`, difficulty 1–5 and base appeal 1–5. Mix of practical, clever and silly (umbrella hat,
   alarm clock that runs away, sock-pairing robot), with era-correct technology (no apps in 1930).
3. **History race**: ~25–30 real inventions under generic names (ballpoint pen 1938, zipper 1913,
   sliced-bread machine 1928, bubble gum 1928, electric traffic light 1914, pop-up toaster 1919,
   television 1927, microwave oven 1947, transistor 1947, seat belt (3-point) 1959, laser 1960, puzzle
   cube 1974, sticky notes 1980, personal computer 1977, handheld mobile phone 1973, web browser 1990,
   MP3 player 1998, touchscreen smartphone 2007, tablet computer 2010 …). Available to talent holders
   (or skill ≥ 80) from 25 years before the real date until the real year; afterwards "already invented
   in this timeline". Launching one first is a **"You beat history"** moment: big fame, reputation,
   and a counter (`historyFirsts`). No real inventor's name is ever shown.
4. **🔧 Build a prototype** (3 builds a year, talent 5). Choose an approach in a popup:
   🛡️ Play it safe (low variance) · 🚀 Go bold (high variance, more masterpieces and explosions) ·
   💸 Cheap & cheerful (40% of the cost, lower quality). Cost by difficulty (≈ $150 / $1.5K / $8K /
   $40K / $250K, local price scale); kids under 16 can build difficulty ≤ 2 from scrap for free.
   Result: 💥 disaster (funny line, small health/happiness hit), 🔩 sort of works, ✅ works,
   🌟 masterpiece. Quality = best build so far (0–100). Every build raises **skill** (0–100,
   diminishing; ×2 with the talent).
5. **📜 Patent** (quality ≥ 40): pay the home filing fee (existing `nationalPatentLaw` data) or
   worldwide (×6). A patented idea becomes an **Asset** (kind `'invention'`) so it shows in Assets,
   counts in net worth, can be sold and is inherited. Unpatented ideas can still launch but invite
   knockoffs.
6. **🚀 Launch** (quality ≥ 30) — pick one route:
   - **Sell the rights**: 1–3 offers from companies (real brands from the registry where a fitting
     category exists, else fictional); lump sum taxed as income. The idea is done.
   - **License for royalties**: a manufacturer makes it; you earn a royalty (3–10%, better with quality
     and reputation) on yearly sales.
   - **Pitch to investors** (TV pitch show from 2001, trade fair before): offers of cash for a cut of
     your royalties, or no deal (embarrassing). Fun lines.
   - **Crowdfund** (2009+): set a goal; success pays a launch budget and you own production (a bigger
     margin); failing to deliver costs reputation.
   - **Make it in my company**: a compatible company you control books the sales margin as company
     income each year (+ brand). Compatibility by category ↔ industry family.
   - **Give it to the world** (open source): karma, fame, reputation, no money.
7. **Market life**: a launched invention has a sales curve (rise 2–4 years, peak, decline; faster
   decline after the patent ends or without one). Peak units come from appeal × quality × category ×
   era market size × country wealth. Yearly log lines, plus a popup for big moments (first million,
   bestseller, history first).
8. **Events** (owner-scoped, once each): knockoff (sue / ignore / license them), recall (if quality was
   low), viral moment or celebrity endorsement (×2 sales for a year), buyout offer for a royalty
   stream, "Inventor of the Year" award, patent troll, science fair (ages 8–17), a rival inventor.
9. **Reputation & rank** (0–100): Tinkerer → Garage Inventor → Patent Holder → Renowned Inventor →
   Legendary Inventor. Shown at the top of the Workshop with skill, ideas, launches and lifetime
   royalties.
10. **Crossover**: Inventor talent unlocks "Invent a trading algorithm" at your hedge fund (§3).

### State, saves and removal of the old system
- State: `g.flags['workshop']` (plain JSON, stamped with the owner's character id; heirs start a fresh
  notebook but inherit invention assets). Assets: `kind: 'invention'`, `details.inv2` with idea id,
  quality, patent, deal, launch year, curve, units, earnings.
- **Migration** (pure reader + one-time write in the yearly hook): old `special.inventor` expertise →
  skill, reputation kept; an active old project becomes a notebook idea with matching prototype
  quality (no refund, no free money). Old personal invention assets (`details.inventorIp`) become
  patented, not-yet-launched inventions. Old company-level invention products / patents / research /
  closed financial systems convert to the new "made in my company" or equivalent bounded effects, or
  are retired with their book value preserved — never a crash, never a money jump.
- The old modules (`inventor*.ts`, `invention-*.ts`, `business/invention-*.ts`, `business/inventions.ts`,
  `business/closed-inventions.ts`, company research in `business/expansion.ts`, "Owned Inventions" on
  every company) are removed or reduced to migration readers. Their tests are replaced by tests of the
  new system (removing tests of deleted code is expected; exploit guards get new equivalents).

## 2. Banking 2.0

The bank stays a `BizState` business (industries `bank` and `onlineBank`) simulated by the finance
dispatcher, but with a new model, menus and events. Interface kept: `isFinanceFirm`, `financeView`
(fields used by conglomerates), `simulateFinanceYear` → `YearResult` with `bank: { bankLoss, bankRun,
bankLending }` for the living-world economy, `financeManagerTurn`, `queueFinanceReport`, `financeNodes`,
`financeInfo`, `financeEraBlock`.

- **Books**: customer deposits and the loan book are client money (never `b.cash`); `b.cash` is the
  shareholders' capital. **Capital ratio** = capital ÷ risk-weighted loans, against the country/era
  minimum. **Trust** 0–100. **Bad loans** %.
- **Levers**:
  1. Savings rate and loan rate — two sliders labelled against the country's market rate
     (`policyRate`/`savingsRate`): stingy / competitive / generous.
  2. Lending appetite: 🛡️ Prime only · ⚖️ Balanced · 🎲 High-yield.
  3. **Products** (switch on, era-gated, one-off setup cost): 🏠 Mortgages, 🏢 Business loans,
     🚗 Auto loans (1920+), 💳 Credit cards (1958+), 💼 Wealth management (1970+, fee income),
     🏛️ Investment banking (lumpy deal fees; needs size), 📱 Mobile app (2008+, cheaper deposits, cyber
     risk), ₿ Crypto desk (2015+, volatile). Each line has yield, default rate and growth effects.
  4. Branches through the existing Locations menu (online bank: marketing instead).
  5. One "🎯 Marketing campaign" a year.
- **Year**: deposits grow with trust, rate competitiveness, branches, marketing and the economy; loan
  demand by product lines, loan rate and the cycle, capped by capital and reserves; defaults by
  appetite, product mix, recession and the risk officer. Profit = interest margin + fees − losses −
  costs, all booked in the statement.
- **Regulator**: below the minimum ratio → warning, then forced shrinking and a fine; far below →
  a popup: inject capital or the bank is seized (company closed). Hired CEOs keep within limits.
- **Bank run** popup when trust collapses or a crisis hits: 🎤 reassure on TV (smarts/looks/fame
  check), 💵 emergency central-bank loan (penalty-rate debt), 🏷️ sell loans at a discount,
  🙏 ask for a bailout (only big banks in a crisis; karma/fame). Deposit insurance era-aware.
- **Events** (choices): rogue employee fraud, big client default, regulator audit (comply / fight /
  bribe = crime risk), merger offer from a larger bank, fintech rival, cyber attack (online era),
  laundering temptation (fictional cartel; crime risk), "too big to fail" in a crisis, historical
  crashes via the existing economy cycle.
- **Dashboard + yearly report**: one card with deposits, loans, capital ratio vs minimum (bar), trust,
  bad loans, profit and rank among the country's banks.
- **Hired CEO** autopilot sets rates/appetite/products by skill; no foresight returns.

## 3. Investment firms 2.0

At founding choose a firm type (old saves map: `retail` → Asset Manager, `private` → Hedge Fund,
`brokerage` → Brokerage):

- **📈 Asset Manager**: management fee on AUM; a yearly **fund style** (🏛️ Index · 💎 Value ·
  🚀 Growth · 🌍 Global · 💵 Bonds). Return = market move (existing `indexMove` for the country/year)
  × style beta + skill alpha (key staff, CEO) + noise. Performance rank among peers drives inflows and
  outflows; a fee slider trades margin for growth; capacity by staff.
- **🦈 Hedge Fund**: 2-and-20 style (fee + performance fee above the high-water mark). Each year pick a
  **strategy** (Long/Short, Global Macro, Quant (needs computers), Event-driven) and for Macro a
  **market call** (📈 bull / 📉 bear / ➡️ flat) with leverage 1–3×. The Investing talent's honest gut
  read (`marketInstinct`) appears as a purple hint. Firm capital can co-invest. Inventor talent:
  "Invent a trading algorithm" (a decaying quant edge, never certain).
- **🦄 Venture Capital** (1946+): raise a fund from LPs (client money); 3–5 **startup pitches** a year
  (procedural fictional names, era-appropriate sectors, founder traits, ask and valuation, hidden
  quality). Due diligence (paid) narrows the quality band; Business/Investing talent adds a hint.
  Portfolio companies advance stages, raise follow-ons (pro-rata choice), die, or exit via
  acquisition/IPO; unicorn popups. Revenue = management fees + 20% carry on realized gains; Fund II
  size depends on Fund I's multiple.
- **🧾 Brokerage**: accounts, commission slider, trading volume by era (online brokerage boom, meme
  frenzy 2021); simple and steady.
- **Events**: star manager poached, insider-tip temptation (regulator investigation; crime), rogue
  trader, redemptions in a crash, big pension mandate pitch, Ponzi temptation (fake returns → collapse
  and prison), activist campaign, client lawsuit.
- **League table** for funds: "your fund beat 82% of peers this year".
- Remove the "perfect foresight" financial returns; elite CEOs and the Business talent improve odds
  and costs modestly.

## 4. Running a company (all industries)

1. **Company dashboard**: replace the ~11 info lines with a compact card: identity line; cash ·
   valuation · your stake; last year revenue/profit with ▲▼ vs the year before; market rank/share;
   a health label (Thriving / Steady / Struggling / In danger) and one plain advice line.
2. **Milestones**: per-company achievements (first profitable year, revenue $1M / $10M / $100M /
   $1B, 10 / 100 / 1,000 locations, #1 in its market, $1B valuation "unicorn", IPO, 10/25/50-year
   anniversaries) → popup + log + small happiness/fame; a Milestones submenu (done and next).
3. **More events** (era/industry aware, choices with trade-offs): franchise pitch, food critic,
   influencer collaboration (2010+), data breach (tech), union drive, big contract bid, copycat rival,
   employee's product idea, landlord rent hike, prime-location bidding war, celebrity investor, a
   trend wave (e.g. plant-based craze), tax audit.
4. **Franchising** (consumer-facing classic industries): sell franchises for an upfront fee + royalty
   on franchisee sales; grows reach and valuation without capex; bad franchisees can hurt the brand.
5. **IPO** reachable: profit threshold scaled to something a successful mid-size company reaches
   (≈ $25M a year, deep tech/studios keep their own rules), still subject to the board.
6. **Menu cleanup**: no inventions or generic national-strategy programs on financial firms; the country
   comparison collapsed to the best few; finance key-staff role blurbs fixed; "Leadership team (0/3)"
   counts match.
7. **Bugs** found by the bug hunt (separate branches) are merged first.

## Workstreams and ownership

| Stream | Owns (new or rewritten) | Shared files it may touch |
|---|---|---|
| Bug fixes (3 hunters) | anywhere except the rewritten modules | — |
| Inventor 2.0 | `inventor*.ts`, `invention*.ts`, `business/invention*.ts`, `business/inventions.ts`, `business/closed-inventions.ts`, invention parts of `business/expansion.ts` | `talents.ts`, `life.ts` (talent text), `menus.ts`, `aging.ts`, `business/economy.ts`, `business/yearly.ts` (remove hooks) |
| Banking 2.0 | `business/bank*.ts`, bank half of finance files | founding text for banks |
| Investment firms 2.0 | `business/fund*.ts`, investment half of finance files | `business/founding.ts` (firm type) |
| Company 2.0 | `business/dashboard.ts`, `business/milestones.ts`, `business/franchise.ts`, new events | `business/manage.ts`, `business/events.ts`, `business/exit.ts` |

A thin dispatcher (`business/finance-firm.ts`) routes banks and investment firms to their modules so
the two finance streams don't collide.

## Testing

Each stream ships focused deterministic tests: money conservation (deposits/AUM never become cash;
lifetime payouts equal booked income), no NaN/Infinity, menus pure (JSON before/after), save round
trip and old-save migration fixtures, era gates, talent effects honest (hint equals resolver), and a
short random monkey test. Full `tsc --noEmit`, `vitest run`, `npm run build` and headless browser
playthroughs before the PR.
