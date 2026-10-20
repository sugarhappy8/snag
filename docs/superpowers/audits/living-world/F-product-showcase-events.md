# Area F: product showcase and company events

## 1. WHAT EXISTS TODAY

Paths are under `src/game/`. Verdict: promotion is flat menu actions plus one-company random events. There is no world calendar, no rivals in the room, no payee for any dollar.

- **Launch is silent.** `business/rd.ts advanceRd` (490 lines) rolls quality, sets `launched: year+1`, brand +3 or +8, one "R&D Results" popup. No date, price positioning, press, hype or orders per product. `products.ts` (315) is an idea-name generator. `product-market.ts` (634) compares lines with rivals' versions by hash thresholds, so rivals never launch on a date.
- **Rival products are free knowledge.** `market-menu.ts rivalsMenu` prints "Sells: X (64) · Y (58)" for every rival, exact, no research.
- **Marketing is sliders.** `marketingLevel` 0-3, one-year `campaignBoost`, brand drifting 20% a year (`economy.ts` ~903), regional campaigns (`market-strategy.ts`), studio "Trailer Drop".
- **Costs have no payee and scale with wealth.** `b.cash -= cost; b.yearCosts += cost`. `scaledCost` and `events.ts scaled()` are max(usBase x sqrt(outlets), revenue x share).
- **Events are private and flat.** `events.ts` 1,058 + `events-extra.ts` 987 + `competition-events.ts` 827 lines: about 30 events, one a year (30%, 18% managed). Celebrity endorsement is a fixed 15% scandal. Rival scandals hit fictional rivals only (`data/brands.ts` rules: no invented scandals for real brands, no real living people).
- **Showcases exist in five places, none shared.** Deep-tech SHOWCASE (`deeptech-menu.ts`, 4 trades, ~60 lines: once a year, p = clamp(0.3 + level/180 + safety/400)). AI Lab release popup (`deeptech-bench.ts releaseText`) and world firsts. Studio hype per game and Trailer Drop (`gamestudio.ts`). `gamedev-career.ts attendConvention` ($250, canned lines, person only). Legacy model Fashion Week (one roll, pay via `earnIncome`). Workshop pitch show (`workshop/market.ts pitchOdds`).
- **Awards are mostly dead.** Studio `awards: string[]` is always `[]`, yet `gamestudio-state.ts:216` multiplies its length by 30. Author prize is one 12% `stableRoll`. Real ones: actor `stepAwards` and music award night with named nominees.
- **Templates worth copying.** `special/music-tour.ts` (316 lines, gate, 25% promoter, crew, travel, merch, exact identity), kit ledger `c.earn/c.pay`, sector families (`sector-kit.ts` FamilyModel, SectorEvent, CopyTable), kit `Stance` crises with one `optionOdds`, `recordEconomicActivity` receipts keyed by id and year, `outcomeTag` for forks.
- **Timing and insider machinery exists.** Tech waves (`tech-waves.ts`, `tech-wave-factors.ts`, `history/tech-waves.ts`: hype and delivery per kind and year, `announceWave`, market news cap 20) and the insider rule (`wave-insider.ts`).
- **Payees already exist as rows.** TIFF, Glastonbury, Edinburgh Fringe are `entertainment` rival rows; JWT, Ogilvy, Nielsen are `marketing` rows (`market-data-services.ts`). `economic-actors.ts` gives rivals cash and debt.
- IPO (`exit.ts goPublic`) has a day-one pop but no road show, investor day or analyst. No franchise expo.

## 2. GAPS

1. No shared calendar of shows across companies, rivals or heirs.
2. Product launch has no event, hype, press cycle or orders.
3. Outcome ignores presenter and team (`ceoSkill` is smarts; key staff never present).
4. No payee; costs scale with revenue.
5. Rival information needs no attendance (area H).
6. Thin consequences: no deposits, partnerships, hiring effect, stock reaction, rival reaction.
7. Text is `pick()` from flat pools, no memory.
8. Careers reinvent show moments with no named field at festivals or fairs.
9. No ceiling on stacked promotion terms (marketingLevel x campaignBoost x hype x brand), the studio-loop pattern.

## 3. DESIGN: THE SHOW CIRCUIT

**Entities.**
- `ShowSeries`, static, about 90 rows: id, name, kind, host city, years, cadence, season slot 1-4, trades served, tech gate (`hasTech`), prestige, tier prices, organiser row id (an existing entertainment, hotel or marketing row, else a generic sink).
- About 18 kinds: auto, electronics, games, film, fashion week, science and world fair, air and defence, food, book, music and awards, medical, build, travel, industrial, investor conference, fan convention, self-hosted keynote, demo day.
- Era anchors (real analogs): motor shows 1900+, Cannes-class festival 1946, electronics 1967, phone congress 1987, game expo 1995, keynotes 2008, AI launches 2023.
- 2020-21 editions run virtual at 40% reach; a war at the host cancels. Post-2026 successors are seeded from the family id.
- `Edition(series, year)`, derived and pure: city, buzz 0-100 from prestige and wave hype, attendance, rivals present (top 12 by pull from `fieldFor`).
- Stored `BizState.shows?`, optional, read through `readShows`: entries (cap 12) `{id, year, tier, lines<=3, staff<=3, presenter, celebs<=2, stance, spend, result}`, `rep{press,trade}`, `hype{family}`, `deposits`, `intel` (cap 24, 2-year expiry), `recent` (24 clause ids).
- World `g.flags['shows.world']`: winners and awards (cap 60), shared by heirs and rivals.

**Yearly step.** `settleShows` runs before `bookYear`, one receipt per `show:${asset}:${edition}`, so a re-run does nothing. Book any time; settlement draws by hash (family seed, company, edition, salt), never `g.rng`, plus the player's stance: no save-scum, pure menus. Budget: 1 choice and 2 notices per company-year.

**Score.** One pure `showScore(inputs)` feeds the roll, the hint and the best-stance flag:
- 40% product: `effectiveQuality` of lines shown minus the field's version (`edgeOf`), novelty (new 1.0, old 0.5, third year -20%). A prototype (rd project at least 50% done) risks a crash of (1 - progress) x risk.
- 25% presenter and team: owner = 0.4 smarts + 0.2 looks + 0.2 fame + experience; hired = executive skill; `staffPower` sales and quality; trait charmer or visionary; rehearsal spend. Shared `workQuality` with area C.
- 15% budget, 1 - exp(-spend / tierBase), flat past 2.5x.
- 10% timing: wave delivery minus hype. High hype raises expectations; quality below them costs brand.
- 10% luck (hash).
- Stance safe, bold, moonshot (A = 0, 1, 2): mean +6A, variance x(1 + A), incident 3% + 5A%, cut by rehearsal.
Rivals score with the same function from quality, tech, tier. Output: rank of N, tier (best in show, standout, seen, overlooked), incident (demo crash, leak, safety, celebrity no-show).

**Actions** (Company > Shows & Events; careers get the same rows): visit; book table, booth, island or flagship; self-host a keynote (venue + production, audience limited to own brand and hype); sponsor (no demo risk, steep diminishing returns); audience weights summing to 100 (press, trade, investors, talent); invite 2 celebrities (fee by prestige, hidden risk shown as a word); skip; join a boycott (cuts organiser income and buzz). Caps per year: 2 booths, 1 keynote, 3 visits. Hired CEO: policy none, modest or ambitious; a flagship needs a board vote.

**Consequences** (bounded, decaying):
- Demand: `showBoost` at most +0.15, halving yearly, beside `campaignBoost` in `appealOf`; product of all promotion terms capped at 1.35.
- Orders become customer deposits, a liability recognized at delivery and refunded if delivery slips over a year; they pull forward at most 25% of next year's modeled sales.
- Brand -8 to +6 a show; hype per family at most 60 from shows, decay x0.85.
- Stock: `showMood` at most +-4% a show, +-8% with waves, only for top quarter and above-median quality. Fresh positions open an insider case.
- Hiring: `rep.trade` lifts candidate skill 0-6. One partnership offer per show from existing modules (B2B bid, franchise pitch, VC round, publisher, label, agent).
- Rivals: an outscored rival gets a bounded `RivalMod` (price cut or +3 quality over 2 years).
- News: one market headline per edition (id `show-series-year`), one for the company if top 3 or an incident. Awards are records (finalists up to 5); the studio x30 term gets a clamp.
- Real-brand rivals only win or lose rank.

**Accounting.**
- Rows: booth fee (to the organiser's rival actor; intercompany and eliminated if the player hosts), stand and freight and travel (services sink via `recordEconomicActivity`), talent fees, ads (marketing-row agencies), tickets and sponsorship (hosting).
- Exhibitor fees come from rival cash, capped at 0.8% of sales; tickets are consumer spending from the economy aggregate.
- Tier prices are fixed per series, scaled by `localEcon` only, never revenue.
- Tests: cash delta equals ledger sum; fees paid equal organiser income.

**Text.** A composer fills slots (opener, decisive factor, consequence, incident) from about 8 x 6 x 6 x 4 clauses per tier with real facts (rank, rival names, product, queue, a books number). The `recent` ring excludes used clauses. Lines obey `docs/VOICE.md` caps. Test: 100 shows, no identical outcome within 10. Area E reuses it.

**Across trades** (`SHOW_FAMILIES` registry): restaurants, cafes, bakeries bring dishes to food festivals (head chef and supplier decide; stars; walk-ins); banks and funds attend investor conferences (capital ratio and returns; inflows; no demo); studios bring a build to the expo (bugs drive crash risk; wishlist hype; publisher offers; replaces Trailer Drop); AI labs launch models by keynote (`labStanding` vs best rival; open/closed; safety incident); devices use spec-vs-market rows; EV makers show concepts; biotech presents trial data; fashion walks the model career's week; the 4 deep-tech showcases become configs.

**Across careers** (kit adapter, same score): actor at festival competitions against named rivals; author at book fairs (rights sales, shortlist); musician at awards and showcases; model at fashion week (replaces legacy); developer at the convention (replaces `attendConvention`); inventor at the fair.

**Information (with H).** Calendar and exhibitor list are public. Rival products show only to attendees: a visit gives a +-10 band for 3 rivals, a booth +-5 for neighbours, one reveal per rival-family-year, stored as expiring `intel`. Non-attendees get headlines a year late. Exact score parts need a paid debrief.

## 4. WORK BREAKDOWN

- F1 M: series data, editions, era and cancellation. Needs A, H.
- F2 L: score engine, rival field, hint parity. Needs C.
- F3 L: state, ledger, receipts, deposits, intel, payees, money scan. Needs A, K.
- F4 M: menu, booking, CEO policy, board vote. Needs G.
- F5 M: consequence wiring (`appealOf`, valuation mood, hiring, offers, `RivalMod`). Needs E.
- F6 L: composer, pools, recent ring (shared with E).
- F7 XL: trade adapters, six families first (food, finance, studio, AI lab, devices, deep tech).
- F8 M: career adapters. Needs I.
- F9 M: hosting an organiser. Needs A, J.
- F10 S: awards ledger, headlines, Annual Report block. Needs E, G.
- F11 M: tests and probes. Needs K.
About 9,000 source and 2,500 test lines.

## 5. RISKS

- Pump and dump: capped mood, top-quarter gate, insider case.
- Spend to win: budget is 15%, saturating, not revenue-scaled.
- Intel farming: noise, three rivals a visit, expiry.
- Award farming: one per category per 3 years, clamp the x30 term.
- Orders into IPO: deposits are liabilities; valuation reads earnings.
- Performance: field built only for booked or visited editions.
- Saves: optional fields, clamped readers, capped lists.
- Tests: conservation scan, idempotent re-run, hint equals roll over 10,000 draws, 100-year probe over 40 lives, text uniqueness, Time Machine reroll, real-brand scandal ban, era gate (no video keynote in 1950).

## 6. OPEN QUESTIONS

1. Names: real or invented? Default: real where the registry has the organiser (TIFF, Glastonbury), invented elsewhere, real host cities.
2. Resolve at the year step with one stance choice, or instantly? Default: year step.
3. Can real-brand rivals suffer a demo crash? Default: no.
4. Do hired-CEO companies attend? Default: yes, by policy with budget cap and board vote.
5. Hosting an organiser now? Default: no, build the payee interface now, hosting after F1-F8.
