# AREA A: world and accounting kernel (main v4.0.2)

## 1. WHAT EXISTS TODAY

**State shape.** `GameState` (types.ts:674) has 17 keys: one `character` (the player), `people[]` (the player's contacts), `assets[]` (the player's holdings, businesses included), log, queue, ancestors, counters and `flags`, a drawer of about 190 keys where the world also lives (`worldEconomy`, `nation.policy`, `techWaves`, `heavy.*`, `marketShocks`). `SAVE_SCHEMA = 2` has one migration step; features add optional fields behind normalizing readers (readBiz, economyState, npcLife). `isLoadableGame` (save-schema.ts:518) checks shell, people, assets; flags need only be finite JSON under `MAX_JSON_NODES = 500,000`.

**Measured** (throwaway probe, 30-year life, 3 companies): 1.78 MB, 103,728 nodes. `worldEconomy` is 96% of both: 102 countries x (5.4 KB now + 5.5 KB `previous` copy + 32-year history). People 7 KB, assets 22 KB, log 40 KB: entities are under 1%. `ageUp` costs 65-100 ms/yr for a light life (35 ordered hooks, aging.ts; economy transition 22-40 ms). LIVING-WORLD.md: ~80 ms per company-year (1.7-2.2 s for 22 firms), NPC progression 24 ms for 60 contacts.

**People.** Real records only around the player: `Person` (types.ts:378) for family, partners, friends, classmates, coworkers. Coworkers carry an employer-name `contextId` and are deleted when you leave (core.ts:567); exes are capped at 20. Only family, partners and friends get an `NpcLife` (npc-lives.ts, 449 lines: skill, ambition, income, debt, housing, employer string); they study, move, divorce, found companies. Strangers (candidates, neighbors, career rivals) are seeded, never stored ("peers are derived, never stored", special/kit/rivals.ts): the level-of-detail precedent.

**Companies.** Player and family firms are full `BizState` (business/state.ts:246, ~90 fields, ~7.5 KB). A family NPC's firm sits in `person.data.npcCompany` and runs the same `simulateYear`. Rivals are procedural: `rosterOf(familySeed, industry, scope)` (competition-roster.ts:373, real brands plus a seeded tail) plus a financial overlay of at most 192 `RivalActor`s in 24 markets near the player. Market size is curve x economy x history (`sizeRatio`).

**Property.** Homes are seeded listings, id `2031:re-residential-3` (assets.ts:579). No stock, seller, owner registry or location entity. Mortgage and loan `lender` are display strings. Tenants live inside `Asset.details.landlord`; rent and sale proceeds go to nobody.

**Jobs.** An infinite board: `fullTimeListings` (careers.ts:375) shuffles 179 definitions by `listingSeed(lifeId, age)` with an invented employer. `jobMarket` (cv.ts:302) is a score plus "applicants per opening". Salary appears via `earnIncome` (careers.ts:1363); tax vanishes (finance.ts:593). Staff is `employees: number` plus named KeyStaff generated at interview (staff.ts:58) who vanish on exit. Firms touch labor only via `recordEconomicActivity` (clamped +-4%).

**Goods, banks, governments.** No goods entity: company inventory and input basket, `SectorState` aggregates, four traded baskets x three suppliers (economy/trade.ts), four household cohorts. Player banks keep segregated books (bank*.ts, 2.3k lines) and report only loss/run/lending observations; all other credit is created from nothing and repaid into nothing. Budgets are GDP shares, not wallets (economy/government.ts); `CountryPolicy` (nation/state.ts) holds laws, tariffs, seats; the NPC head of government is a `leaderParty` string.

**Heirs.** `continueAsChild` (life.ts:1137) rebuilds people from scratch and flags from a whitelist (~:1520: worldEconomy, marketShocks, workshop.firsts, heavy/wave/bench keys). **`nation.policy` is not on it.** A probe confirmed that a law passed as President is gone in the heir, though nation/state.ts:2 and test/nation.test.ts:92 say it survives (that test never calls `continueAsChild`). Non-heir siblings' holdings become cash (life.ts:1206); other contacts are dropped.

**Invariants and tests.** `addMoney/spend/earnIncome` (core.ts:62) round and reject non-finite: ~460 call sites, plus ~160 `b.cash +=` and 65 `p.money +=`. No ledger, no counterparty. `career-money-scan.test.ts` (48 lines) is a regex ban on those calls in new special-career files (they use the kit's `c.earn/c.pay`, test-only audit sink). Conservation is per feature (hedge-fund, will-estate, share-structure, franchise, world2-trade-invariants). `fuzz-kit.ts checkInvariants` (:538): finite JSON, stat bounds, unique ids, year/age, loans >= 0, a windfall note. Nothing sums money across entities or counts jobs, houses, people. Time Machine `pack()` (save.ts:570) chunks only `worldEconomy`.

## 2. GAPS

1. The world is 96% aggregate, under 1% entities: no registry of people, firms, homes or jobs.
2. Money is an open system: wages, rent, tax, loan principal, sale proceeds have no counterparty.
3. Jobs are infinite; coworkers, bosses, laid-off and poached staff do not persist or matter.
4. Housing has no stock; buying removes no home; no landlord or seller exists.
5. Strangers have no lives; rivals are rosters and buffers, not named owners.
6. No supplier-to-buyer product flow; banks have no depositors or borrowers.
7. Heirs: world state is a whitelist (laws lost), siblings are liquidated.
8. No global conservation test; the save budget (nodes, Time Machine chunking) blocks any registry.

## 3. DESIGN PROPOSAL: THE WORLD KERNEL

**One home.** A new optional top-level `g.world`, not `flags`. `continueAsChild` clones state, so it survives heirs by default and the whitelist bug class ends. Personal state stays owner-stamped in `flags`. Readers normalize and cache by root identity; writers replace roots.

**Ids and ownership.** `EntityRef = kind:key`. Seeded entities take `hash(familySeed, kind, country, year, slot)`; sequenced ones take `world.seq`. One `holdings` table `[owner, asset, share]` generalizes `BizState.share`, `familyShares`, `npc-stake`, conglomerate groups and mortgages; shares sum to 1. First, registries are *indexes over existing records* (`Person.wid`, firm header `{id, lod, ref}`), no duplication.

**Three levels of detail.** Tier 0 *named* (full record): player, kin, partner, friends, boss and ~12 coworkers, landlord, tenants, creditors, top-3 customers, top-8 rivals per market, heads of state, owners of Tier 0 firms. Relevance is graph distance to the player, kept while any obligation exists. Caps: 400 people, 60 firms (20 full `BizState`, the rest `FirmLite` on the 192-actor formula), 150 properties, 600 job slots. Tier 1 *pools* (today's `economy/`): per country x sector x cohort counts and balances (unemployed, vacancies, housing stock by bracket, loans by bank). Tier 2 *seeded*: generated on demand, identical every call. **Promotion** (hire a candidate, meet a coworker, buy a listed home, face a rival) writes a record under the seed key, so regeneration gives the same entity, and the pool count drops by one. **Demotion** (no relevance or obligation for 5 years) folds the record into pool counts and its cash into the pool account.

**Money ledger.** `book(g, reason, from, to, amount, token)`; `AcctRef` = person, firm, bank, `gov:country`, `pool:hh:country`, `pool:landlords`, `abroad`. `addMoney/earnIncome/spend` become wrappers with an optional reason and default counterparty (wage from `pool:hh`, tax to `gov`, rent to `pool:landlords`). Tokens reuse the `economy.receipts` idempotence pattern. Pools start at 0 and may go negative (cumulative net flow), so old saves need no invented opening balances. Money enters or leaves only through declared mint/burn: inflation erosion (aging.ts), bank lending creation, write-offs, emigration. A bounded `flows` table (country x reason x 2 years, ~4K nodes) feeds the P&L views of area G.

**Yearly world step** (a hook right after `yearlyEconomy`; reads opening frame W0, writes W1; sorted ids; `world.year` marker; per-entity `seeded(familySeed|kind|id|year|outcomeTag)`, never `g.rng`): W1 demography (births, deaths, estates through the ledger, migration); W2 labor (separations, then hires into last year's vacancies; unemployment *derived*); W3 firms (Tier 0 via `simulateYear`, FirmLite by formula; wages and sales booked); W4 housing and credit (rent, mortgage, default, completions, demolitions); W5 government (taxes = sum of tax flows, spending to transfers and public jobs); W6 prices and pools for next year (lagged, as `economy/` does); W7 promotion, demotion, invariant check (assert in tests, heal in play).

**Conservation checks.** Money: balances plus declared mint/burn constant; each year's flows net to zero per reason. People: births - deaths +- migration = change in (Tier 0 + pools); parents exist or are founders; one spouse, mutual; one viewpoint. Property: holdings sum to 1; one household per unit; owned + rented + vacant = stock; stock moves only by logged construction or demolition. Jobs: persons with `jobId` = filled slots; one full-time job each; wage bill = pay flows. Goods: opening + output + imports - sales - spoilage - exports = closing, per basket (start with the four traded baskets, housing, labor-hours). Wired into `checkInvariants` and a 100-year probe.

**Generations.** The viewpoint id swaps; `g.people` becomes the player's *edges* over world persons. Non-heirs keep their firms and homes as holdings (no liquidation, life.ts:1206). Estates run through the ledger for NPCs too. Dead Tier 0 persons compact to an archive row (cap 500).

**Strangler order.** Each step ships alone; old saves load; absent `world` reads as empty and `ensureWorld` seeds without retroactive flows.

**Budgets.** Added state ~17K nodes, 250-400 KB (400 people x 15, 60 firms x 25, 150 homes x 10, 600 slots x 6, flows 4K). Pay by thinning `worldEconomy`: drop `previous` (562 KB) or keep its read fields, history 32 to 16 years: ~0.6 MB back. Generalize `pack()` to chunk any `world.*` shard (Time Machine budget is 45.9% used). Time: world step at most 60 ms/yr desktop (400 people at ~0.05 ms); light-life `ageUp` under 160 ms (250 mobile); full firms capped near 20.

## 4. WORK BREAKDOWN

- K0 (S) classify the ~190 flag keys world or personal, a test failing on an unclassified new key, add `nation.policy` to heirs, fix test/nation.test.ts:92. Deps: none.
- K1 (M) ledger, wrap three primitives, ratchet test (unreasoned calls may not rise), flows table, conservation probe. Deps: K.
- K2 (L) `g.world` skeleton, EntityRef, holdings, index over Person/Asset/npcCompany, invariants in fuzz-kit, `ensureWorld`. Deps: D, K.
- K3 (L) jobs: headcount, slots, board from real vacancies, persistent coworkers and bosses, derived `jobMarket`, cross-firm layoffs and hires. Deps: I, C, D.
- K4 (L) property: listings as promotions, city stock, landlord and seller pools, rent flows, construction. Deps: B, G.
- K5 (XL) Tier 1/2 population: pools, promotion, demotion, archive, FirmLite. Deps: D, F, H.
- K6 (M) banking: lender ids, deposits, loan creation as declared mint, failure hits depositors. Deps: B.
- K7 (L) goods flows per basket tied to firm output, imports, consumption. Deps: C, F.
- K8 (M) heir rewrite: edges over world, siblings keep holdings, NPC estates. Deps: D.
- K9 (M) save diet, chunked `pack()`, node-cap review, perf probe. Deps: K.

## 5. RISKS

- Size and speed: registry plus 80 ms full firms can blow the budget. Hold caps, FirmLite, thin `previous`.
- Determinism: promotion order must not matter. Seed keys, sorted ids; test that replay, reload and a Time Machine fork give identical JSON.
- Exploits: pool prices invite arbitrage (buy from pool, sell to pool). Use bid-ask spreads, stock-linked price indexes, transaction costs; only declared mints create money, each capped.
- Migration: 460 money call sites; use a ratchet test and idempotence tokens.
- Test cost: CI is 25-35 min; use seeded 50-100 year probes under 30 s.
- Riskiest edits: npc-lives.ts, `continueAsChild`, will code.

## 6. OPEN QUESTIONS

1. Closed money system, or only "every flow has a named counterparty, pools may run negative"? Default: the second.
2. Persist every stranger, or only those touched? Default: touched only.
3. Rewrite old saves' NPC firms? Default: no, index them in place.
4. Do heirs inherit kin's debts automatically? Default: yes, via holdings.
5. Is 250 ms per year on mobile acceptable? Default: yes, with a cap setting.
