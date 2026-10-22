# Inventor 2.0 — The Workshop

**Activities → 💡 Inventor's Workshop** is open to everyone from age 8 (alive, not in prison).
The **Inventor** talent (Main Character Syndrome counts, through `hasTalent`) makes you a genius:
about 3× as many ideas, +20 prototype quality, double skill growth, half the explosion risk, the
history race, and purple hints that show an idea's real appeal and its best launch route.
The code lives in `src/game/workshop/`.

## The loop

1. **Ideas** go into a notebook (max 12). Geniuses get 1-2 sparks a year from age 6; everyone
   else about one year in seven from age 10. Some sparks arrive as a popup ("While folding
   laundry, you had an idea…": write it down / forget it); the scene fits your stage of life
   (school for kids, meetings and traffic for adults, the garden for retirees) and the era
   (`yearly.sparkScenes`). **💭 Brainstorm** twice a year; the odds come from smarts, skill and the
   talent. Ideas offered lately (forgotten or scrapped) wait their turn while fresh ones remain
   (`Workshop.seen`, the last 40).
2. **The catalog** (`catalog.ts`): 160+ everyday ideas in ten categories (gadget, home, toy,
   health, transport, energy, computing, food, fashion, weird), practical to silly (umbrella hat,
   runaway alarm clock, sock-pairing robot), each with an era window, difficulty 1-5 and the
   appeal people expect (★1-5). The real appeal can be one star off; only geniuses see it.
3. **The history race**: 34 real inventions under generic names (Pop-Up Toaster, Rolling-Ball Ink
   Pen, Radar Cooking Box, Pocket Telephone, Touch-Glass Slate…). Open to geniuses, or anyone
   with skill 80+, from 25 years before the real date until that year. Launching one first is a
   **🏆 You Beat History** moment (fame, reputation, `historyFirsts`). After the real year an
   unlaunched one leaves the notebook: someone else got there. No real person is ever named.
   The **future race** gives modern lives the same chase: 13 clearly fictional breakthroughs
   (Pocket Fusion Cell, Dream Recorder, Tooth-Regrowing Gel…) open from 2016-2025, each with a
   rival's deadline rolled per family (10-40 years after it opens; `market.raceYear`), so no real
   date is ever claimed. Nine of the 13 sit in a field of the world frontier (`market.FUTURE_FIELD`):
   a leap in that field (R3, `world/frontier.ts`) pulls the rival's deadline in by the whole years
   of its lead (`market.raceShift`), never below `from + 10`, never above the rolled year and never
   before the year of the latest push. The idea's page says so ("Recent leaps pulled this race in
   by N years."); with no leap, or for a history idea, nothing moves. Firsts are world state
   (`g.flags['workshop.firsts']`, kept for heirs): history can't be beaten twice in one timeline.
4. **🔧 Build a prototype** (3 a year, 5 for geniuses) in a popup: 🛡️ Play it safe (narrow
   range), 🚀 Go bold (wide range: more masterpieces and more explosions) or 💸 Cheap & cheerful
   (40% of the cost, lower quality). Costs by difficulty ≈ $150 / $1.5K / $8K / $40K / $250K
   at local prices; kids under 16 build easy things from scrap for free. Results: 💥 disaster
   (funny line, small health/happiness hit), 🔩 sort of works, ✅ works, 🌟 masterpiece (88+).
   Quality is the best build so far. Every build raises skill (0-100, diminishing).
5. **📜 Patent** (quality 40+): the home filing fee (`patentLaw`, from the national market data)
   or worldwide (×6). A patented idea becomes an Asset (`kind: 'invention'`) that shows in
   Assets, counts in net worth, can be sold and is inherited. Worldwide patents sell everywhere;
   unpatented launches sell less, fade faster and invite knockoffs. An expired patent gives no
   reach and can't be extended. A notebook idea shows its patent and launch rows only once its
   prototype reaches 40 and 30; before that one line says what unlocks them.
6. **🚀 Launch** (quality 30+, one big deal a year): sell the rights (1-3 offers, real brands from
   the registry where a category fits, else fictional), license it (3-10% royalty, better with
   quality and reputation), pitch it (a TV pitch show from 2001 where television exists, an
   invention fair before; cash now for a cut of royalties, or "I'm out"). Under 18 a parent or
   guardian signs every deal and lump sums (rights, investor cash) are 80% of an adult's
   (`MINOR_DEAL`; the hints include it); royalty rates are the same. Crowdfund it (2009+, adults;
   three goals trade success odds against your own-production margin; delivery can go wrong),
   make it in a compatible company you control (30% of sales booked as company profit, +brand),
   or give it to the world (karma, fame, reputation, no money).
7. **Sales** rise for 1-3 years, peak, then fade (faster without a patent or after it expires).
   Peak units come from difficulty × real appeal × quality × category × era market size ×
   country wealth and patent reach, times a hidden launch luck (0.65-1.35). Your own products
   compete for shelf space. Big moments pop up: the first million, a bestseller.
8. **Events** (once each, at most one popup a year): knockoffs (sue / license them / ignore),
   recalls of low-quality launches (recall / keep quiet), viral moments (×2 sales for a year),
   royalty buyout offers, patent trolls, Inventor of the Year, the school science fair (ages 8-17
   at school, from 1930) and a rival inventor's duel.
9. **Reputation and rank** (0-100, gains shrink near the top): Tinkerer → Garage Inventor →
   Patent Holder → Renowned Inventor → Legendary Inventor.

## Money

Personal royalties, margins, sale prices and prizes go through `earnIncome` (taxed by the yearly
finance hook). The `workshop` yearly hook runs before `business` and `finance`; company-made
inventions add their margin to the company's `b.cash` **and** `b.yearIncome`, so the business
simulation books it once as other income. Sales are settled once per fiscal year per invention.
Hints (`routeQuotes`, `buildOdds`, `brainstormOdds`, `pitchOdds`, `crowdOdds`, event odds) are
pure and are exactly the numbers the resolvers roll against; they never reveal the launch luck.

Balance (scripted lives, Workshop earnings only, before income tax, 2026 dollars): a dedicated
genius earns roughly $6-15M over a life born in 1900 or 1950 (4-6 history firsts born in 1900),
$15-26M born in 1990 or 2010 (crowdfunding); a lucky race first such as the Touch-Glass Pocket
Telephone made in your own company can be worth far more. A dedicated non-genius earns about
$3-4M, a casual genius about $2-5M and a casual tinkerer under $1M. A strong professional career
earns about $6-10M; businesses scale further.

## State and old saves

`g.flags['workshop']` (plain JSON, stamped with the owner) holds skill, reputation, the notebook,
counters and the Hall of Fame; heirs start a fresh notebook but inherit invention assets, which
keep selling. Invention assets keep everything in `Asset.details.inv2`.

Old saves migrate through `migrate.ts` (pure readers for menus; one write in the yearly hook or
the first Workshop action): the old Inventor profile becomes skill (best field expertise) and
reputation, and an active project becomes a notebook idea at a matching prototype quality (no
refund). Old personal IP (`details.inventorIp`) becomes a patented, not-yet-launched invention
with the same asset id, valued at no less than before; outside manufacturing licences keep
paying as a licensed launch. Company invention products, research in progress and patents become
"made in my company" inventions; their factory and stock book values stay in the company's
equipment and valuation (`legacy-capital.ts`), invention staff leave the payroll, and closed
financial systems are retired in place. Old popups resolve harmlessly.
