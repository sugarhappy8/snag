# R5 plan, Facts and Paper (track paper)

> Status: planning pass 1, 2026-10-31. Base: `release/v5.4.0` = `main` at v5.3.0 (1c73b31). Code read in `/home/user/snag` on that commit; every anchor below was re-read now and section 6 lists the grep or command behind each. Nothing under `src/`, `test/`, `scripts/` or `.github/` was edited and nothing was added to git. Three throwaway probes (economy thresholds, collapse rule, history volume) ran from the session scratchpad `paper/` folder; their numbers are in section 1 and marked "measured". Task ids are `R5-N1` to `R5-N11`. House rules bind every task: no U+2014 or U+2013, contractions in player text, saves untouched (schema 3), no `g.rng` draw, no money, fixtures re-recorded only in R5-N11, seeds only through `findSeed` or a variable (never a new `seed: N` line).

## 1. Track summary

**Items and sizes.** E.N1 facts and detectors 1,500, E.N2 outlets and templates 1,200, E.N3 editions 600, E.N4 player stories 500, E.N6 the Paper screen 1,200, E.N8 tests 400 (roadmap total 5,400). This plan: 5,230 source lines in 11 tasks, about 8,050 test lines, about 600 doc lines, about 26 agent-hours (the roadmap rate is 509 lines an hour), 10 wall hours with three lanes. E.N1 runs +200 (the collapse rule and the market glue) and E.N3 +250 (the shard, the schedule strip, the seal); E.N8 is mostly test lines and lives in every task plus R5-N10.

**The design in one paragraph.** Facts in, one neutral edition out, outlets only at render time. A yearly module `news.desk` (phase `news`, which `docs/KERNEL.md` keeps empty for it) runs detectors over state the game already computes, ranks what they find, and emits at most 16 facts a year on the bus; the R2 recorder `world.facts` stores them next to the R4 `life.*` and `social.*` facts. An edition is a pure function of the year's facts, the history table's headlines and a small context, scored by the design formula and cut to a front page and 33 stories. The live edition is composed at read time; the first thing the desk does next year is seal it into the new world shard `paper` (3 sealed editions; older ones leave a front page and the player's stories in a 30-year archive). Outlets (fictional, with trust, lean, sensationalism, era reach and regime control) and the 189 headline cells exist only in a lazily loaded zone: the same story reads differently in the Courier, the Wire, the Star and the Trade Review, and the outlet chips are the player's way to "check the story" without paying anyone. The Paper draws no random number (outlet and variant choice use `hunit(lifeId, year, key)`), books no money, and on a life without the `fx` stamp it changes nothing but the `world` slice.

```
year Y, aging seam (ageUp, aging.ts:56)
  life/37 life.kin, life/55 life.estates, close/6 society.acts    emit life.* and social.* facts           (R4, unchanged)
  news/10 news.desk  (added to the registry in R5-N11)
    1 seal    composeEdition(Y-1: facts of Y-1, table rows of Y-1, ctx of cy) -> world.paper.ed (3); the fourth evicts to .ar (30)
    2 detect  EconSnap, MarketSnap, TechSnap -> Candidate[] -> collapse -> rank -> at most 16 emit(g, fact) -> world.facts (R2 recorder)
    3 player  fame tier, you.* facts, capped fame and notoriety (lives with fx only)
    4 stamp   cy = [Y, country], then y = Y (last, so a throw leaves the year undone and the next run redoes it)
the player opens the Paper (lazy chunk)
  liveEdition(g)  = composeEdition(Y, facts of Y, table rows of Y, ctx now)             pure
  paperView(g, { edition, outlet, open }) -> renderStory(row, y, outlet, ctx) per row   pure, outlet only changes the words
```

**What it reads, by exact name.** R2: `emit`, `Fact`, `normalizeFact`, `FACT_LIMITS` (`kernel/fact.ts`, `kernel/bus.ts`), `readFacts`, `recordFact`, `FACT_CAP`, `FACTS_PER_KIND_YEAR` (`world/facts.ts`), `registerShard`, `ensureWorld`, `worldShard` (`world/state.ts`), `registerModules`, `yearlyEntries`, `withYearly`, `YEARLY_PHASES` (`kernel/registry.ts`), `hunit`, `hpick`, `fnv1a` (`text/hash.ts`). R3: `economyState`, `EconomyPoint`, `CountryEconomy`, `economyFocus` (`economy/*`), `readMarketNews`, `activeMarketEvents`, `eventWords`, `MARKET_EVENTS` (`history/market-events.ts`), `readTechWaves` (`business/tech-wave-factors.ts`), `exchangeYear`, `IndexMove` (`invest/engine.ts`), `exchangeRate`, `currencyChangeAt` (`data/currencies.ts`), `institutionStrength` (`nation/data.ts`), `policyOf` (`nation/state.ts`), `allHeadlines`, `eraSafe` (`history/*`), `techAdoption` (`history/timeline.ts`). R4: the declared kinds `life.wed`, `life.birth`, `life.death`, `life.estate`, `social.leak`, `social.feud` as facts only, `personEntity`, `personKey`, `playerRef`. Nothing from `Edge` or the registry shards.

**What the player sees.** A newspaper button in the header (flag `paper`) with a dot while the year's edition is unread, and a "Read" chip on the existing newspaper-icon line of the year log. The sheet shows This year (live) and the last three sealed editions, a front page, seven sections (World, Nation, Business and Markets, Tech, Sport and Culture, Local, Gossip), a "Coming up" strip (the Games, nothing else yet), outlet chips that re-tell the same stories (a trusted wire, a loud tabloid, trade press, a state outlet that drops bad news), stories about you by fame (local 15, national 35, front page 60, world 85) and a 30-year front-page archive. A national story can add +1 fame a year (never more than +2 fame and +2 notoriety) on lives born after the flip.

**State and bundle.** One optional world shard `paper`, worst case 1,924 nodes and about 26 KB (section 2), inside the R5 allotment `WORLD_ALLOTMENT.r5` 6,000 (`world/caps.ts:36`) and the 30 KB roadmap line; it leaves about 4,000 nodes for the other R5 tracks. No new key in the saved `flags` bag and no `Person` or `Biz` field; the build flag `paper` is the one new key of `FLAG_DEFS`. Bundle, in gzip bytes, at 4.1 a source line (R4 X48, UNVERIFIED as a model): eager about 2,940 lines with the edits, target at most 13,000 over the entry; the lazy Paper zone (outlets, bias, templates, render, view model, sheet, about 2,200 lines of which 450 are text) at most 26,000 as its own chunk, measured by `scripts/bundle-budget.mjs` after R5-N9 and R5-N11. The initial bundle must stay under the Bundle track's ceiling (`initialMaxGzBytes` 2,560,000 after B1 to B6); this track asks B6 for a `packMaxGzBytes` row `PaperSheet` 26,000.

| Eager (in the first download, about 2,740 lines and 195 lines of edits) | Lazy Paper zone (own chunk, about 2,200 lines) |
|---|---|
| `news/kinds.ts` 130, `story.ts` 100, `score.ts` 70, `snap.ts` 60, `rank.ts` 120, `fame.ts` 120, `edition.ts` 260, `hist.ts` 80, `schedule.ts` 70, `outlet-kinds.ts` 40 | `news/outlets.ts` 260, `bias.ts` 150, `render.ts` 200, `templates-econ.ts`, `templates-market.ts`, `templates-people.ts` 450, `link.ts` 60 |
| `detect-econ.ts` 330, `detect-market.ts` 220, `detect-tech.ts` 130, `detect-rumor.ts` 90, `detect-you.ts` 160 | `hubs/paper-view.ts` 390, `ui/components/PaperSheet.tsx` 340, `PaperStory.tsx` 120, `ui/paper/lazy.tsx` 40 (the gate is eager), styles 100 |
| `world/paper.ts` 260, `modules/news-desk.ts` 500 (190 in N2, then 90, 160 and 60 from N3, N4, N7) | |
| edits: `Header.tsx` 30, `GameScreen.tsx` 35, `LifeLog.tsx` 40, `ui/store.ts` 12, `life.ts` 4, `flags.ts` 8, `shards.ts` 2, `budget.ts` 12, `invariants.ts` 10, `investments.ts` 2, `modules/index.ts` 2 | |

**Measured: the thresholds against the data the game computes** (6 seeded lives 1900 to 2075, 155 distinct years, 102 countries; countries firing in a year, mean / p90 / max by era; probe `paper/probe-econ`).

| Roadmap detector | What the game computes (anchor) | 1901-1945 | 1946-1989 | 1990-2026 | 2027-2075 | Rule used |
|---|---|---|---|---|---|---|
| inflation over 8% | `EconomyPoint.inflation`, to 1e24 (`economy/model.ts:24`, `INFLATION_CEILING`) | 24 / 85 / 91 | 34 / 70 / 81 | 27 / 55 / 62 | 6 / 10 / 102 | the level fires for a third of the world every year: use the onset (crossing 0.08); `econ.hyper` at 0.5 |
| unemployment plus 2 points | `EconomyPoint.unemployment` | 11 / 64 / 102 | 4 / 9 / 91 | 7 / 18 / 100 | 0 / 0 / 0 | fires in history (1930-32, 1974, 2009, 2020 hit 90+ countries) and never in a procedural year |
| rate plus 100 bp | `EconomyPoint.rate` (to 1e5) | 10 / 81 / 85 | 12 / 28 / 91 | 15 / 45 / 92 | 13 / 74 / 102 | as written; skip a country already in `econ.hyper` |
| currency minus 10% | `exchangeRate(c, y-1) / exchangeRate(c, y) - 1` (`data/currencies.ts:1457`); the sim index `CountryEconomy.currency` moved 10% in 0 of 155 years for the focus countries (the only ones with a previous frame); its smoothing, `0.85 old + 0.15 target` at `economy/simulation.ts:130`, needs a target 0.67 away to do it | 12 / 42 / 46 | 15 / 32 / 35 | 14 / 28 / 44 | 0 | history only; skip a year with a `currencyChangeAt` |
| housing minus 8% | `EconomyPoint.housing` level change | 10 / 46 / 62 | 9 / 16 / 77 | 13 / 34 / 83 | 4 / 7 / 89 | as written |
| recession | `EconomyPoint.growth`: onset (growth under 0 after 0 or more); `econ.slump` at growth of -0.05 or lower | 7 / 20 / 102 | 5 / 5 / 92 | 8 / 18 / 97 | 16 / 26 / 51 | onset, never the level |
| bank stress, shortage | `CountryEconomy.bankStress` over 0.25 (0 in all six lives: it rises only from the player's own banks); `supply` over 0.12 (the existing `around.supply` line, `economy/index.ts:56`) | level means: bank 0, shortage 14 | 0, 7 | 0, 18 | 0, 21 | bank kept for a saved life that owns banks, tested with synthetic input |

**Measured: why the detectors rank and collapse.** Raw firings average 66 country-kinds a year (median 37, p90 167, max 328). The collapse rule (8 or more countries of one kind become one `world.*` fact plus at most 2 focus countries, otherwise at most 3) leaves 5.9 facts a year (median 6, p90 9, max 12). `DETECT_MAX` is 16, so the cap almost never binds, and the store's "first 12 a kind-year" cannot push out the best fact. Scripted layer: `allHeadlines(year)` holds 11.9 rows a year for 1900 to 2026 (min 6, max 22) and 1.9 for 2027 to 2100; a country sees 2.9 to 3.6 of them through `worldEvents`. So a historical edition holds about 20 to 25 stories and a future one 8 to 12. 33 is a cap, not a promise (section 5, Q2).

**Where the roadmap is stale** (the plan is written against the code).
1. "`history/events.ts`, `history/market-events.ts`, `economy/*` detectors" are hot files. The plan edits none of them: detectors are new pure readers over plain snapshots. This frees the Bundle track's R5-B5, which lists "the Paper's first merge of `history/events.ts`" as a dependency (`bundle.md:98,159`); B5 may go first.
2. The audit's `worldLog` does not exist (no match in `src/`); the store is `world/facts.ts`. The roadmap's stored story `{k,y,c,e,v,s,o,sec}` becomes a 6 to 7 field row without `y` (the edition holds it), `e` or `o` (the outlet is chosen at render, which makes the edition outlet-neutral).
3. "Detectors over economy" assumed per-country frames. `worldEconomy.previous` keeps only the focus countries (`economy/focus.ts:19-21`), but `history[c]` keeps 16 points for all 102 (`economy/index.ts:46`), so the detectors read `history`, with `previous` only for `bankStress` and `supply`.
4. A real company can sit behind a rival or a listed slot (`RivalActor.real`, `isRealSecId`, `investments.ts:2243`). No story names one: stories about firms are generic ("a listed mining firm"), a fictional name is used only where the row carries one.
5. Regime control: `nation/regime.ts` is the player's own power steps. The press reads two existing numbers, `institutionStrength(c, y)` (`nation/data.ts:236`) and `policyOf(g, c).institutions.mediaControl` (`nation/state.ts:42`).
6. The roadmap's "brand within its 16-point cap": the business brand already takes `fame / 10` for an owner CEO (`business/economy.ts:895-898`), at most 10 points, so a fame effect reaches brand through the existing formula and this track writes no brand.
7. "60 fact kinds by 3 classes": this plan has 53 kinds (44 with templates in 3 classes, 9 that pass the history headline through); R7, R9 and R11 append rows.

**Not in this track, and why.** Hooks, offers and exposes, money of any kind (E.N5, the Offers track; the Paper reads no cash). Showcase fairs (E.N7, R9; the schedule strip has a provider seam for them). Wars (R7 owns the conflict ledger; the history table already carries war headlines). Politics and crime detectors (R7, R10). NPC lives (R6). "Check the story" as a paid action (Q7). A palette entry for the Paper (Q13). `history/events.ts` edits (Bundle track). Text composer and `textMem` (Offers, reputation and composer track).

| Task | Item | Needs | Source | Tests | Model |
|---|---|---|---|---|---|
| R5-N1 story model, kinds, shard, flag | E.N1, E.N3 | none | 640 | 900 | Sonnet |
| R5-N2 desk, edition, seal, archive, schedule | E.N3 | N1 | 600 | 850 | Sonnet, Opus fallback |
| R5-N3 economy detectors, rank, collapse | E.N1 | N2 | 560 | 1,000 | Sonnet |
| R5-N4 market, tech, rival and rumour detectors | E.N1 | N2 | 620 | 850 | Sonnet |
| R5-N5 outlets, bias, regime control | E.N2 | N1 | 500 | 650 | Sonnet |
| R5-N6 templates and render | E.N2 | N1, N5 | 650 | 750 | Sonnet |
| R5-N7 player stories and fame effects | E.N4 | N2 | 450 | 600 | Sonnet |
| R5-N8 view model, Paper sheet, header door | E.N6 | N2, N6 | 670 | 750 | Sonnet |
| R5-N9 chips, links, archive, folding, log chip | E.N6 | N8 | 450 | 600 | Sonnet |
| R5-N10 acceptance, ceilings, docs | E.N8 | N1 to N9 | 40 | 1,100 | Sonnet |
| R5-N11 the flip (lead) | all | N10 | 50 | fixtures | lead |
| Total | | | 5,230 | 8,050 | |

Waves: A N1. B N2, N5. C N3, N4, N7, N6. D N8. E N9. F N10. G N11. Merge order N1, N2, N5, N3, N4, N7, N6, N8, N9, N10, N11. Only N2 carries an Opus fallback mark, and only if Sonnet fails its idempotence and replay tests; never beside another track's Opus session.

**Acceptance owned, and the test that proves each** (roadmap R5 block).

| Criterion | Proven by | Task |
|---|---|---|
| Stories keyed `${year}:${kind}:${subject}` are idempotent | `news-edition.test.ts` (compose twice, desk twice, seal twice: same JSON, same root identity) | N2, N10 |
| Outlets are fictional; tabloids round up at most 20% | `paper-outlets.test.ts` (denylist of real mastheads, 20% bound over 1e-6 to 1e12) | N5 |
| Rumours read current state only | `paper-foresight.test.ts` (spy on `exchangeYear`, `economyOf`, `exchangeRate`: no year above `g.year`; rumour cells hold no future tense) | N4, N10 |
| Stories about the player by fame | `news-player.test.ts` (tier table 15/35/60/85, caps) | N7 |
| Repetition and quiet gates | section 1 "thin gates" below, `paper-isolation.test.ts` | N10 |
| Folding never hides a weight-3 item | `paper-view.test.ts` (random editions: no folded row has weight 3, a front-page, a `you.*` row or a kin `life.*` row) | N9 |
| Hook money and buzz capped | not in this track (E.N5, E.N7). N10 asserts the desk books no ledger flow (`flowsOf` and `checkLedger` equal with the desk on and off), so those tracks start from zero | N10 |
| Folding never hides a notice before a choice | the desk and the Paper queue no popup and no notice (`g.queue` equal with the desk on and off); the digest fold is R3 `closeYear` and is not touched | N10 |
| Old saves | `paper-oldsaves.test.ts` (v4.0.2, v5.2.0-social, v5.3.0 heavy and stamped run 5 years with the desk) | N10 |

**Ceilings: every growth term with its probe at 100 times the input** (rows in `test/ceiling-list.json` and `test/ceiling-kit.ts`, all pure functions on synthetic input, each well under a second at 1, 10, 100 and 1,000 times): `news-detect` (`DETECT_MAX` 16 facts from 102 x 1,000 countries), `news-score` (`SCORE_MAX` 23), `news-edition` (`EDITION_MAX` 34 rows from 1,000 times the facts), `news-bias` (`BIAS_MAX` 0.2 over every outlet and kind), `news-fame` (`FAME_GAIN_MAX` 2, `NOTORIETY_GAIN_MAX` 2 from 1,000 stories), `news-bytes` (`PAPER_CAPS`, 1,924 nodes, 30,000 bytes).

**Protecting the thin gates (text-repeat 42 of 42, quiet-acceptance 7.32% of 8%, text-kit 4.7% of 5%).** The desk writes no log line, no `notice`, no popup and registers no `defineLines` pool (the headline cells are plain arrays, linted by `unitFlags(text, 'headline' | 'deck')` in `paper-text.test.ts`, so they cannot enter `registeredLines()` and the registry walk of `text-hash.test.ts:185`). The year log keeps its existing newspaper-icon line (`history/events.ts:183`) and its existing state lines (`economy/index.ts:50-60`); the Paper adds a chip beside the first in the UI and nothing to either. `paper-isolation.test.ts` plays 3 lives x 25 years with and without the desk and asserts the log, the popup list and every slice except `world` are byte-equal, which is the proof that the three gates cannot move.

## 2. Contracts

Frozen at the merge of R5-N1 (F1: the kind row, the story row, the edition, the shard, the caps, the snapshot types), R5-N2 (F2: `EditionCtx`, `composeEdition`, `liveEdition`, the desk step list, the module id) and R5-N6 (F3: `Outlet`, `renderStory`, the cell shape). The Offers track reads F1 and F2 only. A move after a freeze makes other tracks rework.

```ts
// src/game/news/kinds.ts (L3; imports kernel/fact only)
export const SECTIONS = ['world', 'nation', 'business', 'tech', 'culture', 'local', 'gossip'] as const   // index = SectionId, append-only
export type SectionId = 0 | 1 | 2 | 3 | 4 | 5 | 6
export interface NewsKind { k: string; sec: SectionId | 'home'; scope: 'country' | 'world' | 'person' | 'firm' | 'you' | 'hist'
  sev: number; src: 'desk' | 'bus' | 'table'; govNeg?: true; again?: true }       // sev 0-100 default; 'home' = Nation at home, else World
export const NEWS_KINDS: readonly NewsKind[]        // 53 rows sorted by k; later releases append; kindOf(k)
// src/game/news/story.ts
export type StoryRow = readonly [k: string, c: string, v: number, s: number, sec: SectionId, r: number, n?: string]   // r = prior editions in a row, n = names (40)
export interface Edition { y: number; cc: string; n: number; f: StoryRow | null; s: StoryRow[] }                       // n = stories before the cut
export type ArchiveRow = readonly [y: number, cc: string, front: StoryRow | null, you: StoryRow[]]
export function storyKey(y: number, row: StoryRow): string                  // `${y}:${k}:${c}`
export function normalizeStoryRow(raw: unknown): StoryRow | null            // total; unknown kind, NaN, long text: null or cut
export function weightOf(row: StoryRow): 1 | 2 | 3                         // 3: severity 75+, any you.* row, kin life.*
// src/game/news/score.ts
export const SCORE_MAX = 23
export function scoreOf(i: { sev: 0 | 1 | 2 | 3; near: 0 | 1 | 2 | 3; rel: number; first: boolean; repeats: number }): number   // sev x4 + near + rel(0-6) + 2 first - 2 repeats
// src/game/news/snap.ts (types) and rank.ts
export const DETECT_MAX = 16
export interface Candidate { k: string; c?: string; a?: string; v?: number; s: number; near: 0 | 1 | 2 | 3 }
export interface EconRow { id: string; pts: readonly EconomyPoint[]; bankStress: number; supply: number; prev?: { bankStress: number; supply: number } }
export interface EconSnap { year: number; home: string; focus: ReadonlySet<string>; rows: readonly EconRow[] }
export function collapse(c: readonly Candidate[], focus: ReadonlySet<string>): Candidate[]    // 8+ of a kind -> one world.* + 2 focus
// src/game/world/paper.ts (L2; registerShard('paper'))
export const PAPER_CAPS = { editions: 3, stories: 33, archive: 30, you: 3, name: 40 } as const
export interface PaperShard { v: 1; fy: number; y: number; sy?: number; fx?: 1; tw?: number; ft?: number; cy?: readonly [number, string]; ed: Edition[]; ar: ArchiveRow[] }
export function normalizePaper(raw: unknown): PaperShard | undefined          // total, a valid shard comes back as itself
export type PaperPatch = Partial<Pick<PaperShard, 'y' | 'sy' | 'tw' | 'ft' | 'cy' | 'ed' | 'ar'>>
export function readPaper(g: GameState): PaperShard | null                    // pure
export function ensurePaper(g: GameState): PaperShard                         // creates { v: 1, fy: year, y: year - 1, ed: [], ar: [] } when missing; the desk calls it first
export function stampPaper(g: GameState): void                                // R5-N7: at life creation, creates the shard with fx: 1; nothing if a shard exists
export function patchPaper(g: GameState, p: PaperPatch): boolean              // the one writer, replaces the root, never edits it
export function paperProblems(raw: unknown): string[]                         // for world invariants
// src/game/news/edition.ts (F2)
export interface EditionCtx { home: string; continent: string; focus: ReadonlySet<string>; you: string; rel(ref: string): number; nameOf(ref: string): string; prior(k: string, c: string): number; seen(k: string): boolean }
export function composeEdition(year: number, facts: readonly Fact[], hist: readonly WorldEvent[], ctx: EditionCtx): Edition   // pure
// src/game/modules/news-desk.ts (L4)
export const newsModule: ModuleDef            // id 'news.desk', layer 4, slices ['world.paper'], facts = the desk's kinds; the yearly entry is added in R5-N11
export function yearlyNews(g: GameState): void                // idempotent by paper.y; the step list is append-only
export function liveEdition(g: GameState): Edition            // pure, same ctx builder as the seal
// src/game/news/fame.ts
export const STORY_TIERS = [15, 35, 60, 85] as const         // local, national, front page, world
export function fameTier(fame: number): 0 | 1 | 2 | 3 | 4
// lazy zone (F3): src/game/news/outlets.ts, bias.ts, render.ts, templates-*.ts, hubs/paper-view.ts, ui
export type OutletClass = 'wire' | 'tabloid' | 'trade'
export interface Outlet { id: string; name: string; cls: OutletClass; lean: -1 | 0 | 1; sens: 0 | 1 | 2 | 3; trust: number; state?: true }
export function rosterFor(lifeId: string, country: string, year: number, control: number): readonly Outlet[]   // 3 to 8 outlets, era reach
export const BIAS_MAX = 0.2
export function shownFigure(v: number, o: Outlet, k: string): number          // within 20% of v, never more
export function renderStory(row: StoryRow, y: number, o: Outlet, ctx: RenderCtx): { head: string; deck: string; drop: boolean }
export function paperView(g: GameState, opts: { edition: number; outlet: string; open: readonly string[] }): PaperView   // pure
```

**Consumed from the other R5 tracks.** Bundle (frozen at its B1/B2): `PackNotLoaded` and `packReady(id)` (`kernel/packs.ts`), the source-shim convention (`history/headlines-source.ts` appears at B5 and `allHeadlines` keeps its signature), `lazyView` gates (exists), a `packMaxGzBytes` row for the Paper chunk (asked of B6). Offers, reputation and composer: nothing at run time. The five kinds that track declares (`tech.landed`, `tech.rival`, `tech.disclosed`, `social.scandal`, `offer.paid`) are listed in `NOT_NEWS` by N1, so the Paper does not headline them in 5.4.0 (the desk has its own `tech.wave` and `tech.breakthrough`, and the scandal and the offer already have a log line and a notice); promoting one later is a `NEWS_KINDS` row and three cells. The Paper stamps `paper.fx` in its own shard and does not use bit 8 of `social.ft`. Offers consumes this track's F1 and F2 (`NEWS_KINDS`, `storyKey`, `readPaper`, `liveEdition`, `fameTier`, `STORY_TIERS`) and appends kinds and cells by the rule in risk 5. Cycles: nothing.

The 53 kinds. Economy, country (12): `econ.recession`, `econ.slump`, `econ.recovery`, `econ.inflation`, `econ.hyper`, `econ.jobless`, `econ.rates.up`, `econ.rates.down`, `econ.currency.fall`, `econ.housing.fall`, `econ.bank.stress`, `econ.shortage`. World, collapsed (7): `world.recession`, `world.inflation`, `world.jobless`, `world.rates`, `world.currency`, `world.housing`, `world.shortage`. Markets (7): `market.crash`, `market.boom`, `market.event`, `market.scandal`, `market.bankrupt`, `market.takeover`, `market.crypto`. Tech and rivals (4): `tech.wave`, `tech.breakthrough`, `rival.failed`, `rival.expanded`. History table (9): `hist.war`, `hist.economy`, `hist.tech`, `hist.politics`, `hist.culture`, `hist.disaster`, `hist.sport`, `hist.health`, `hist.space`. Life, R4 (4) and social, R4 (2): the six declared kinds. Player (5): `you.wealth`, `you.job`, `you.firm.open`, `you.arrest`, `you.fame`. Rumours (3): `rumor.bank`, `rumor.firm`, `rumor.job`. The desk declares the 38 kinds with `src: 'desk'` in `ModuleDef.facts`; `hist.*` are never emitted (the table is static), the six R4 kinds stay declared by their owners.

**Shard arithmetic (a row is an array plus its fields).** Story row 7 nodes, 8 with a name. Edition: object 1 + `y`, `cc`, `n` 3 + front 8 + array 1 + 33 x 8 = 277; three of them 831. Archive row: array 1 + 2 + front 8 + array 1 + 3 x 8 = 36; thirty 1,080. Header 13. Total 1,924 nodes. Bytes at the longest name (40 characters) 110 per row: editions 3 x 34 x 110 = 11.2 KB, archive 30 x (4 x 110 + 40) = 14.4 KB, so under 26 KB. `paper` sits in the middle drop class of `normalizeWorld` (not in `WORLD_DROP_FIRST` or `WORLD_KEEP_LAST`), so `test/world-state.test.ts:233` does not move.

**Where it lives and how heirs treat it.** A world shard `g.world.paper`, not the `social` shard (R4 keeps that for the stamp and the Offers track's `rep`) and not a personal flag (`world-flags.ts` classifies `flags` keys only). Editions and the archive are the world's history and reach the heir by default (`continueAsChild`, `life.ts:1159`); `fx` and the unread marker `sy` travel with it, which is harmless. A story about the player stores the player's name at the time (`n`) and the player's ref (`c = playerRef(g)`); the renderer says "you" only when `c` equals the current `playerRef(g)`, so the parent's stories read as the parent's name in the heir's Paper. No `world-flags.ts` rule is needed.

**Layers.** `news/` is a new L3 domain that imports only L0 to L2 (kernel, `text/`, `history/`, `world/`, `economy/`) so the domain ratchet (rule c, `test/layers-domains.test.ts`) gains no pair. Everything that reads another L3 domain (`business/tech-wave-factors`, `invest/engine`, `business/state`, `prison`, `investments`) sits in `modules/news-desk.ts` and `hubs/paper-view.ts` (L4), which hand plain snapshots to the pure functions. `nation/data.ts` and `nation/state.ts` are read in L4 only, and the control number reaches `rosterFor` as an argument.

## 3. Tasks

Process (as R4): one worktree per task off the release head; `npm run typecheck` plus the named `npx vitest run --maxWorkers=1 <files>`; never the full suite; explicit pathspecs; the lead merges and re-records. After each new file run `test/layers.test.ts test/layers-domains.test.ts test/lazy-zones.test.ts test/foresight-scan.test.ts test/voice-guards.test.ts`.

### R5-N1 Story model, kinds table, the `paper` shard, the flag
**Goal.** The data every other task builds on, frozen at F1. **Needs.** none. **Size.** 640 source, 900 test. **Model.** Sonnet.
**Files.** Create `src/game/news/kinds.ts` (130), `story.ts` (100), `score.ts` (70), `snap.ts` (60), `src/game/world/paper.ts` (240), `docs/PAPER.md` (first draft: the kinds, the shard, the caps). Modify `world/shards.ts:10` (`import './paper'` between `./met` and `./social`), `world/budget.ts:126` (a `case 'paper'` before `case 'frontier'`: editions, stories, archive rows against `PAPER_CAPS`), `world/invariants.ts:155-159` (`for (const p of paperProblems(world.paper))`), `docs/WORLD.md`. The `paper` key in `flags.ts` and its line in `test/flags.test.ts` are the lead task P3 (cross-check C2): N1 only reads `flagOn('paper')`. N1 needs P3 and B3 (the bundle headroom gate) (shard table, nodes).
**Interfaces.** Section 2 (kinds, story, score, snap types, shard).
**Steps.** 1 Red: `news-kinds.test.ts` (`NOT_NEWS` is a sorted list in `kinds.ts` that starts with the five kinds the composer track declares: `offer.paid`, `social.scandal`, `tech.disclosed`, `tech.landed`, `tech.rival`; the test checks one way, every kind a module declares is a row or in `NOT_NEWS`, and does not fail on a `NOT_NEWS` entry no module declares yet, so N1 can merge before O9, O11 and O13; 53 rows, unique, sorted, every kind passes `isFactKind`, section ids valid, the 38 `desk` kinds do not repeat a kind another module declares, `again` only on the seven kinds named in N6). 2 Red: `news-story.test.ts` (`normalizeStoryRow` total over garbage, NaN, 1e308, 10 KB names, unknown kind, wrong length; fixed point; `weightOf`; `scoreOf` table: max 23, min 0, `repeats` 3 floors at 0). 3 Red: `paper-shard.test.ts` (reader total on 500 editions, `__proto__`, a future year, a wrong `v`; a valid shard returns itself; `patchPaper` replaces the root and freezes what it stores; a patch of nothing writes nothing; the maximal shard is 1,924 nodes and under 30,000 bytes and `capsOf` reports it). 4 Code. 5 Docs.
**Tests that move.** `test/flags.test.ts:88-98` is edited once by P3 for all four R5 keys (eleven become fifteen), not by N1; `test/save-world-adapter.test.ts:26` (the sorted shard list gains `paper`); `test/world-budget.test.ts` maximal-world builder (:257-296) gains `paper` at its caps and one pin for 1,924. Fixtures: none. Ceilings: `news-bytes`. Hostile: above.

### R5-N2 The desk, the edition, the seal, the archive, the schedule strip
**Goal.** `news.desk` with an empty detector list: composing, sealing, evicting to the archive, all idempotent. **Needs.** N1. **Size.** 600 source, 850 test. **Model.** Sonnet; the one Opus fallback mark of the track (stateful, replay and fork sensitive, hot module list).
**Files.** Create `src/game/news/edition.ts` (260: candidates from facts and history rows, scoring, dedupe by `storyKey`, front page, section order, cut to 34 rows), `news/hist.ts` (80: `histCandidates(year, home, rows)`, nearness from `ev.region` against the home country and continent, 12 rows at most, `eraSafe`, a `PackNotLoaded` or any throw reads as no rows), `news/schedule.ts` (70: `scheduledAhead(g)`, a calendar table of the Summer and Winter Games, one year of lookahead, no result field, plus `registerSchedule` so R9 adds fairs), `src/game/modules/news-desk.ts` (190: `newsModule`, `yearlyNews`, `liveEdition`, the ctx builder, `timed('news', ...)` from `world/budget.ts`), `test/paper-kit.ts` (`withPaperDesk(fn)`). Modify `modules/index.ts:24-37` (`newsModule` after `...MENU_MODULES`, before `societyModule`: ids ascend `menus.*`, `news.desk`, `society.acts`).
**Steps.** 1 Red: `news-edition.test.ts` (pure under `deepFreeze`; same input same JSON; shuffled facts same edition; a repeat of a kind scores 2 less per prior edition; first-of-kind +2; a dedupe of two facts with one key keeps the stronger; 100,000 facts cut to 34 rows with `n` set; a fact of an unknown kind is dropped; the front page is the top row and ties break on the key string). 2 Red: `news-desk.test.ts` (uses `test/paper-kit.ts` `withPaperDesk(fn)`, which appends the desk entry to `yearlyEntries('aging')` through `withYearly`): the first run creates `{v:1, fy, y, cy}` and seals nothing; the second year seals year 1 into `ed`; a fourth sealed edition moves the oldest front page and `you` rows to `ar`; the 31st archive row drops the oldest; running a year twice leaves the same root identity; a stamp from the future runs once and is put right; the desk makes no `g.rng`, `g.nextId`, log, queue or cash change; `scheduledAhead` reads no result. 3 Code. 4 Docs: `docs/ARCHITECTURE.md` "News (news/*.ts)" paragraph, `docs/PAPER.md`.
**Context and history rows (exact).** `ctx.home = g.character.countryId`, `continent = getCountry(home).continent`, `focus = economyFocus(g)` (one walk of at most 100,000 nodes, as `yearlyEconomy` already pays), `you = playerRef(g)`. `rel(ref)`: 6 for `you`, 5 for a spouse, child, parent or sibling record, 3 for a friend, 2 for a coworker, 1 for any other known person, 0 else (found by `personEntity(p) === ref` in `g.people`, then the Met record); `nameOf(ref)`: "First Last" of that person, cut to 40, '' when unknown; `prior(k, c)`: the run of prior years (at most 3) in `ed` and in the `f` and `you` rows of `ar` that hold the same kind and subject; `seen(k)`: any such row of the kind. History rows: `allHeadlines(year)` kept when `eraSafe(headline, home, year)`; near 2 when `region` lists the home country, 1 when it is `'world'` or the home continent, else 0; severity 0 to 3 maps to `s` 10, 35, 60, 90; section by `WorldEventKind` (economy to business, tech and space to tech, culture and sport to culture, politics to nation when near is 2 and else world, war, disaster and health to world); `c = ev.id.slice(0, 40)` and render finds the row again by that prefix. Sections are ordered by `SECTIONS` index, rows inside by score then key. The Games table: Summer in years divisible by 4 from 1900 except 1916, 1940 and 1944; Winter in years divisible by 4 from 1924 to 1992 except 1940 and 1944, then years with remainder 2 from 1994. `scheduledAhead` returns items for this year and the next only, as `{ id, year, label }` with no outcome field. The next-year read is a calendar lookup: `foresight-scan.test.ts` watches market-year readers and does not match it, D19 allows it, and the test asserts the item has no result field.

**Seal rule.** At the news phase of year Y the desk first seals the live edition of `cy[0]` when `cy[0] < Y` and no sealed edition has that year, composing with the country in `cy[1]`; then it sets `cy = [Y, country]`, runs the detector steps, then the player step, then writes `y = Y` last. A skipped year (Time Machine, import) seals the last live edition once.
**Tests that move.** `test/hub-entry.test.ts` HUBS gains `['modules/news-desk', ...]`. Fixtures: none (the module has no yearly entry until N11, so `kernel-parity.json` is unchanged). Ceilings: `news-edition`, `news-score`.

### R5-N3 Economy detectors, ranking, the collapse rule
**Goal.** The twelve country kinds and seven world kinds from the economy, at most 16 facts a year. **Needs.** N2. **Size.** 560 source, 1,000 test. **Model.** Sonnet.
**Files.** Create `src/game/news/detect-econ.ts` (330: `detectEconomy(snap: EconSnap): Candidate[]`), `news/rank.ts` (120: `rankCandidates`, `collapse`, `DETECT_MAX`), and in `news-desk.ts` (+90) the snapshot builder (`economyState(g).history`, `previous` only for `bankStress` and `supply`, `economyFocus(g)` for focus, `g.character.countryId` for home) and the emit loop (`emit(g, { k, y: g.year, c, a, v, s })` in rank order, then `emit` of the world fact first).
**Rules (exact).** Needs two points (`pts[-1].year === year`, `pts[-2].year === year - 1`). `econ.recession`: growth under 0 after 0 or more; `econ.slump` instead when growth is -0.05 or lower; `econ.recovery`: growth 0.03 or more after a negative year; `econ.inflation`: inflation over 0.08 after 0.08 or less; `econ.hyper` instead at 0.5 or more (then no `rates.*` or `currency.fall` for that country that year); `econ.jobless`: unemployment up 0.02 or more; `econ.rates.up` and `.down`: 0.01 or more either way; `econ.currency.fall`: the exchange ratio 10% or worse, only when `year <= PRESENT_YEAR` and neither year has `currencyChangeAt`; `econ.housing.fall`: level down 8% or more; `econ.bank.stress`: `bankStress` over 0.25 after 0.25 or less; `econ.shortage`: `supply` over 0.12 after 0.12 or less. Severity `s` is the excess over the threshold scaled to 0 to 100 and clamped (a value of 1e23 clamps; `v` is clamped by `normalizeFact`). Near: 3 home, 2 focus, 1 same continent, 0 else. Collapse: 8 or more countries of one kind give one `world.*` fact (`c: 'world'`, `v` the count, `a` the worst country, `s` the worst severity) plus at most 2 focus facts; fewer give at most 3 by (near, severity, id). Total cut to `DETECT_MAX` by `scoreOf` rank. Pure: no `g` in `detectEconomy`.
**Steps.** 1 Red: `news-detect-econ.test.ts` (a table per detector on both sides of every threshold; hyperinflation 1e23 and rate 1e5 rows; a first-year state with one point; a redenomination year; six lives from `findSeed` as a bounded count (assert the mean at most 8 and the maximum at most `DETECT_MAX`; print the measured 5.9 and 12, never assert them, since seeds differ); emission order is rank order; replay emits nothing new because `recordFact` dedupes). 2 Red: purity and `deepFreeze`. 3 Code. 4 Docs: `docs/PAPER.md` threshold table with the measured counts of section 1.
**Tests that move.** none. Fixtures: none. Ceilings: `news-detect` (102 x 1,000 rows, under 50 ms). Hostile: NaN points, a country id of 10 KB, 500 rows with one year.

### R5-N4 Market, tech, rival and rumour detectors
**Goal.** The remaining desk kinds (`market.*`, `tech.*`, `rival.*`, `rumor.*`). **Needs.** N2. **Size.** 620 source, 850 test. **Model.** Sonnet.
**Files.** Create `news/detect-market.ts` (220), `detect-tech.ts` (130), `detect-rumor.ts` (90). Modify `news-desk.ts` (+160: the snapshot glue) and `investments.ts` end of file (+2: `export { fam as marketFamily, anchor as marketAnchor }`, no call-site edit; the glue needs the family seed and anchor that `newsLines` uses at :2211, and duplicating them would fork the market).
**Rules.** Market (home exchange plus at most 3 focus exchanges, `exchangeYear(marketFamily(g), marketAnchor(g), exchangeInfo(country), g.year)` only): `market.crash` when `index.crash` or `ret <= -0.20`, `market.boom` when `index.boom` or `ret >= 0.30`; `market.event` for each `activeMarketEvents(home, year)` with strength 0.5 or more in its first or peak year (`c` the event id, text from `eventWords`, which already holds the pre-technology wording); `market.scandal`, `market.bankrupt`, `market.takeover` from `SecYear.event` and `ended.kind`, at most 2 of each, never a name (`a: 'real'` or `'fict'` only); `market.crypto` when `cryptoYear` says winter or mania and `cryptoExists`. Tech: `tech.wave` for `readTechWaves(g)` rows with `year === g.year` (`c` the wave id, name looked up at render); `tech.breakthrough` for `readMarketNews(g)` rows of the year (`c` the id cut to 40). Rivals: `rival.failed` when a `RivalActor` is `failed` and its newest `history` point before this year was not (`c: industry`, `a: scope`; generic text); `rival.expanded` for `expanded`; at most 2 each. Rumours (current state only): `rumor.bank` for `bankStress` from 0.10 to 0.25, `rumor.firm` for a `distressed` rival, `rumor.job` for unemployment up 0.01 to under 0.02. Every reader is asked for `g.year` and nothing later.
**Steps.** 1 Red: `news-detect-market.test.ts`, `news-detect-tech.test.ts`, `paper-foresight.test.ts` (a spy on `exchangeYear`, `cryptoYear`, `economyOf`, `exchangeRate` as `foresight-scan.test.ts` does; no year above `g.year`; the `rumor.*` cells hold no `will`, `next year`, `soon`, `expected`, `may`). 2 Code. 3 Docs.
**Tests that move.** none (`foresight-scan.test.ts` scans the new files with no edit). Fixtures: none. Hostile: a rival frame with 192 rows, a market news list of 20 with 600-character text, an `ended.kind` that is not a string.

### R5-N5 Outlets, bias, regime control
**Goal.** Who tells the story, and how far each may bend the figure. **Needs.** N1. **Size.** 500 source, 650 test. **Model.** Sonnet.
**Files.** Create `news/outlet-kinds.ts` (eager, 40: kinds and the technology each needs), `news/outlets.ts` (260, lazy zone: `rosterFor`), `news/bias.ts` (150, lazy zone: `shownFigure`, `niceCeil`, `niceFloor`, `BIAS_MAX`). The control number is computed in `hubs/paper-view.ts` (N8) as `clamp((100 - institutionStrength(c, y)) / 100 + 0.5 * policyOf(g, c).institutions.mediaControl, 0, 1)` and passed in.
**Rules.** Roster of 3 to 8, deterministic from `hunit(lifeId, year, key)`: a daily ("{City} Courier" or "The {City} Ledger", city from `getCountry(c).cities`), a wire ("Meridian Wire", "Continental Wire"), a tabloid ("{City} Star"), trade press ("The Commerce Review"), radio news from `techAdoption(c, 'radio', y)` 0.02, TV news from `'tv'`, an online outlet from `'internet'`, and a state outlet when `control >= 0.45` (a gazette before TV, a broadcaster after). Class: daily and wire and radio and TV `wire`, tabloid and online `tabloid`, trade `trade`. Lean is a relation to the government, not a party: -1 critical, 0 independent, +1 supportive, state +2 mapped to +1 with `state: true`. Trust 30 to 85. Bias: a figure shown for a kind with `govNeg` moves up by `0.05 x sens + 0.05 x -lean`, down for a supportive or state outlet, always inside 20% of the truth, then to a nice number (`niceCeil` smallest of 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8 times a power of ten that is at least `v` and at most `1.2 v`). A state outlet drops a `govNeg` story when `hunit(...) < control` (`drop: true`, the row is not shown and the chip says so). No outlet states a private person's cash.
**Steps.** 1 Red: `paper-outlets.test.ts` (names pass a denylist of real mastheads: Times, Post, Guardian, Tribune, Herald, Reuters, Associated Press, BBC, CNN, Fox, Pravda, Xinhua, Bloomberg; no radio before 1920, no TV before 1946, no online before 1991 per `TECH` rows; the same life, country and year give the same roster; 8 at most). 2 Red: `paper-bias.test.ts` (ratio in [0.8, 1.2] for 100,000 values from 1e-6 to 1e24 across every outlet and kind; NaN and infinity pass through as 0; same input same output). 3 Code.
**Tests that move.** none. Ceilings: `news-bias`. Bundle: lazy zone.

### R5-N6 Templates and render
**Goal.** The words: 44 kinds in three classes, plus a follow-up line for seven kinds and a second variant for twelve (132 + 21 + 36 = 189 cells). **Needs.** N1, N5. **Size.** 650 source, 750 test. **Model.** Sonnet. Freezes F3.
**Files.** Create `news/templates-econ.ts`, `templates-market.ts`, `templates-people.ts` (450 in all, one cell per line: `kind: { wire: [head, deck], tabloid: [head, deck?], trade: [head, deck], again?: ..., alt?: ... }`), `news/render.ts` (200: `renderStory`, `fmtFigure(kind, v)`, slot filling, the `RenderCtx` lookups, a generic fallback for a row whose lookup is gone).
**Rules.** Headline at most 70 characters (aim 55), deck at most 110 (aim 90), contractions, no dash characters; slots are `{c}` country, `{city}`, `{v}` figure, `{n}` names, `{t}` title, `{ind}` industry, `{w}` wealth word, each kind lists the slots it may use; `again` cells for `econ.recession`, `econ.slump`, `econ.inflation`, `econ.hyper`, `econ.jobless`, `econ.housing.fall`, `market.crash` (seven, used when `r >= 1`); variants for the twelve most frequent kinds, picked by `hpick(lifeId, y, key, ...)`. `life.*`, `social.*` and `you.*` cells use no `{v}` (private money). `you.wealth` says "millionaire" to "centibillionaire" from a tier index, never a currency amount. `hist.*` pass the table headline through, cut to 70, with no deck. Rumour cells use present tense only. No cell names a real company, person or outlet.
**Steps.** 1 Red: `paper-text.test.ts` (every kind and class has a cell or a documented fallback; `unitFlags(text, 'headline' | 'deck')` clean and `LIMITS` held from `scripts/voice/rules.mjs:48`; every slot is allowed for its kind; 1,000 fuzz fillers leave no `{` in the output; the rumour wording rule; no `{v}` in the private kinds; render is pure and draws nothing). 2 Code. 3 Docs: a Paper section in `docs/VOICE.md` (roles exist at :52-53).
**Tests that move.** none. Text gates: the cells are not `defineLines` pools and nothing in `src/game` calls them, so `text-repeat`, `quiet-acceptance` and `text-kit` cannot see them.

### R5-N7 Player stories and fame effects
**Goal.** Stories about you, by fame, with a small capped effect. **Needs.** N2. **Size.** 450 source, 600 test. **Model.** Sonnet.
**Files.** Create `news/fame.ts` (120: `STORY_TIERS`, `fameTier`, `coverage(tier, rows)`, the caps `FAME_GAIN_MAX` 2 and `NOTORIETY_GAIN_MAX` 2), `news/detect-you.ts` (160: `detectYou(snap)`), in `news-desk.ts` (+60) the player snapshot and the effect call. Modify `life.ts` near :1025 (`if (flagOn('paper')) stampPaper(g)`, +4 with the import) and `world/paper.ts` (+20: `stampPaper(g)` creates the shard `{ v: 1, fy: year, y: year, fx: 1, ed: [], ar: [] }` at life creation, once, and does nothing on a life that has a shard).
**Rules.** Kinds from year-stamped state: `you.wealth` when `netWorth(g)` (`core.ts:482`) crosses 1e6, 1e7, 1e8, 1e9, 1e10, 1e11 above the stored `tw`; `you.job` when `job.yearsInRole === 0` (one a year); `you.firm.open` when an owned business was founded this year (`businessAssets`, `BizState.founded`); `you.arrest` when `inPrison(g)` and `prisonLife(g).admittedAge === age`; `you.fame` when `fameTier` passes the stored `ft`. A `you.*` or kin `life.*` row is kept only when its tier is met: fame under 15 none; 15 or more local (1 a year); 35 national (2); 60 front page (the top `you.*` row may lead the front); 85 world (3, the cap `PAPER_CAPS.you`). Effect only when `paper.fx === 1`: a national or higher positive story adds `addHidden(g, 'fame', 1)` once a year (2 at front page or world), a negative one (`you.arrest`, a `social.leak` about the player) adds notoriety 1 or 2; both through `addHidden` (clamped 0 to 100); nothing else is written, brand follows fame through `business/economy.ts:895`. `stampPaper(g)` writes `fx: 1` at life creation only when the build flag is on. `tw` and `ft` are the world's high-water marks, so an heir does not hear "first millionaire" again.
**Steps.** 1 Red: `news-player.test.ts` (tier table at 14, 15, 34, 35, 59, 60, 84, 85 and 100, NaN, -5; no effect without `fx`; the caps at 1,000 stories; `tw` and `ft` only rise; an heir keeps the shard and the parent's rows read the parent's name; arrest sets notoriety once). 2 Red: create `paper-isolation.test.ts` with part A (3 lives x 25 years, a life without `fx`, desk on and off: the log, the popups and every slice but `world` byte-equal; part B, with `fx`, all but `world` and `character`, in N10). 3 Code.
**Tests that move.** none before N11. In N11 the golden `character` slice may move for lives that reach fame 35 after the flip. Ceilings: `news-fame`.

### R5-N8 View model, the Paper sheet, the header door
**Goal.** The screen, lazily loaded, with the button. **Needs.** N2, N6. **Size.** 670 source, 750 test. **Model.** Sonnet.
**Files.** Create `src/game/hubs/paper-view.ts` (330: `paperView`, `paperUnread(g)`, the `RenderCtx` builder, control, outline of sections), `src/ui/components/PaperSheet.tsx` (230: `Sheet`, masthead, edition tabs, front page card, section lists), `src/ui/paper/lazy.tsx` (40: `PaperLazy = lazyView('paper', () => import('../components/PaperSheet'))` with a fallback sheet "Loading the Paper." and the built-in Try again; `lazyView` registers it, so the idle prefetch warms the chunk as it does for the person profile, `ui/people/lazy.tsx`). Modify `ui/components/Header.tsx:47` (+30: optional `paper?: { unread: boolean; onOpen }`, a button after the bell, shown only when given), `ui/screens/GameScreen.tsx:32,224` (+25: `SheetKind` gains `'paper'`; `flagOn('paper')` passes the prop; the sheet mounts beside the inbox), `ui/store.ts:661` area (+12: `markPaperSeen()` through `act`, like `markInboxSeen`), `test/lazy-zones.test.ts` (a PAPER zone: `PaperSheet.tsx`, `PaperStory.tsx`, `hubs/paper-view.ts`, `news/outlets.ts`, `bias.ts`, `render.ts`, `templates-*.ts`; gate `src/ui/paper/lazy.tsx`).
**Steps.** 1 Red: `paper-view.test.ts` (pure under `deepFreeze`: JSON, `g.rng`, `g.nextId` unchanged; every string passes the headline and deck caps; the same view twice is equal; an empty year shows "A quiet year."; a hostile shard renders; an edition index out of range clamps). 2 Red: `paper-sheet.test.tsx` (renders after `PaperLazy.preload()`; focus trap and Escape as the other sheets, pattern of `test/a11y-modal.test.ts`; the button is absent with the flag off and the dot follows `sy`). 3 Red: the lazy-zone guard fails on a static import of a zone file from `main.tsx`'s closure. 4 Code. 5 Docs.
**Tests that move.** `test/lazy-zones.test.ts` (one zone added, no expectation changed); `test/screens.test.ts` and the Header tests only gain a case. Bundle: measure after this task, eager over the entry and the chunk separately.

### R5-N9 Source chips, links, the archive, folding, the log door
**Goal.** The rest of E.N6. **Needs.** N8. **Size.** 450 source, 600 test. **Model.** Sonnet.
**Files.** Create `src/ui/components/PaperStory.tsx` (120: one story row with its outlet chip showing name, a trust word and a lean word), `news/link.ts` (60, lazy zone: `storyLink(row, ctx)` returns a place key in the `placeKey` grammar of `ui/nav/place.ts` or null; people go to `relationships/person.<id>`, markets and money to a menu group, checked by `placeOfLink` and `placeToReopen`). Extend `paper-view.ts` (+60: chips, "Coming up", archive list) and `PaperSheet.tsx` (+110: outlet switcher, archive tab, "About you" group). Modify `ui/components/LifeLog.tsx:205` (+40: an optional `onOpenPaper` prop; the line with `isNewsLine(text)` gets a small "Read" button), `GameScreen.tsx:202` (+10: pass the callback when the flag is on).
**Rules.** Each section shows its top 4 rows and folds the rest into "More (n)", but never folds weight 3, the front page, a `you.*` row or a kin `life.*` row. A dropped story (`drop: true`) is listed once as "{outlet} left this out" so a state outlet's silence is visible. The outlet chips re-render the same rows; nothing is bought.
**Steps.** 1 Red: `paper-view.test.ts` cases (random editions of 1 to 34 rows: no folded row has weight 3; every row is in `shown` or in one folded group; chips for every roster outlet; a vanished link target trims to its parent). 2 Red: `lifelog-paper.test.tsx` (the chip appears only with the flag and the callback). 3 Code.
**Tests that move.** the `LifeLog` snapshot tests only if they render a news line with the new prop (a case added, none changed). Fixtures: none.

### R5-N10 Acceptance, ceilings, docs
**Goal.** E.N8 and the evidence for every criterion in section 1. **Needs.** N1 to N9. **Size.** 40 source, 1,100 test. **Model.** Sonnet.
**Files.** Extend `test/paper-kit.ts` (`playPaperLife`) and `paper-isolation.test.ts` with part B (the `fx` lives: all slices but `world` and `character`; fame and notoriety move by at most the caps), `paper-acceptance.test.ts` (4 lives to 90 as `text-kit` does: budget meter within `WORLD_BUDGET`, `paper` at most 1,924 nodes and 30,000 bytes, facts at most 400, the desk at most 10 ms a year, the Paper never calls `notice` or `log`, a replay, a reload (`roundTrip` in `test/career-kit.ts:402`) and a Time Machine fork give the same `world.paper` JSON), `paper-oldsaves.test.ts`, `paper-hostile.test.ts` (garbage, NaN, 500 editions, another life's rows, `__proto__`, 1e308), edits to `test/ceiling-list.json` (six rows) and `test/ceiling-kit.ts` (six rows), `docs/PAPER.md` final, `docs/CI.md` rows, `docs/ARCHITECTURE.md`.
**Steps.** Red: the files above fail until the pieces exist. The nightly old-saves job gains the desk. Update `docs/PAPER.md` with measured numbers from the runs.
**Tests that move.** `test/ceiling-list.test.ts` (the list grows by six, each token exists) and `test/ceiling-probe.test.ts` (a row per entry). Fixtures: none.

### R5-N11 The flip (lead only)
**Goal.** The one commit that turns the whole release on: the Paper, and the composer's three keys (cross-check C3: composer O14 no longer flips or re-records). **Needs.** N10, O14, Y8, B4, B5, B7, B10, P2, P4 and the lead's walk. **Size.** 50 source. **Model.** Lead.
**Steps.** 1 Add the yearly entry to `newsModule` (phase `news`, order 10, run `yearlyNews`). 2 `flags.ts`: `paper`, `composer`, `standing` and `tips` default true, with `package.json` 5.4.0 in the same commit (`test/flags.test.ts` fails on either half). The re-record covers the composer's list too (`golden-digests.json` text, world, character, rng and people slices; `r2-parity.json`; `kernel-parity.json` menus; `social-parity-lives*.json`; `life-pins.json` and `people-ui-exact.json` only where a block moves), each with its reason; the rehearsal is a scratch branch with the four defaults forced, as R4's E16 rehearsal was. 3 `node scripts/golden.mjs check`, read which slices moved, then `update --reason`. Expected: `world` on every life (facts and the shard); `character` only on a life that reaches fame 35 under `fx`; in the Paper-only pass (`paper` true, the three composer keys false) any move in `rng`, `people`, `assets`, `economy`, `flagsWorld`, `flagsPersonal` or `text` means the desk leaks into the simulation, so stop; the composer's own pass (its three keys true, `paper` false) is expected to move `text`, `world`, `character`, `rng`, `people` and `flagsPersonal`, and the all-keys pass is the union (cross-check 7.2). 4 `kernel-parity.json` aging list 44 to 45 (`news.desk`); `lives`, `menus`, `views` should not move; re-record `r2-parity.json`, `social-parity-*.json` and `life-pins.json` only where the check fails and only in `world`. 5 `docs/KERNEL.md` news row (phase table :30), `docs/RELEASE-v5.4.0.md` known limits (Q5). 6 The walk on a new life at 360 px: 1969, 2008, 2020 editions, an outlet switch, a state outlet, the log door, a heir.
**Tests that move.** `test/fixtures/kernel-parity.json`, `golden-digests.json` and possibly `r2-parity.json`, `social-parity-*.json`, `life-pins.json`: reason "the Paper's facts and shard enter g.world; the desk draws nothing". Rows in `moved-tests.md` format.

## 4. Risks

1. **A detector floods the store.** Measured 66 firings a year raw; the collapse and `DETECT_MAX` cut it to 5.9 (max 12). A new detector must pass the same golden count test in `news-detect-econ.test.ts`.
2. **The desk leaks into the simulation.** The only writes are `world.facts`, `world.paper` and, with `fx`, `hidden.fame` and `hidden.notoriety`. `paper-isolation.test.ts` is the guard and N11 reads the golden check as a second one.
3. **Layer and cycle ratchets.** A pure `news/` file that imports `business/`, `invest/`, `nation/` or `investments.ts` adds an L3 pair and fails `layers-domains.test.ts`. The rule is: L4 glue reads, `news/` stays pure.
4. **History table in a pack.** R5-B5 moves headline rows behind `readPack('history.headlines')`. `allHeadlines` keeps its signature; the desk and view catch `PackNotLoaded` and compose from facts alone. In tests the shim preloads.
5. **Other tracks add fact kinds.** The Offers track emits reputation and offer facts. `news-kinds.test.ts` fails on a kind declared by a `news.*` module without a row; kinds from other modules need a row or an entry in a `NOT_NEWS` list in `kinds.ts`. The first R5 merge that adds a kind updates it.
6. **Fame effect moves balance.** +1 fame a year at national tier and above, +2 cap, new lives only. It moves `character` in the golden check for lives with fame 35 or more; the 200-seed nightly balance probe reads it. Cheap to remove: it is one function.
7. **Template quality and anachronism.** 189 cells written by hand. B9's static era gate and `paper-text.test.ts` catch tech words and caps; the rest is the lead's read of the 1969, 2008 and 2020 editions.
8. **Phone width.** A fourth header icon. The N11 walk checks 360 px; the fallback is a row in the inbox sheet.
9. **CI time.** About 20 new test files, 6 of them play lives (the economy golden count 3 lives x 40 years, `news-desk`, `paper-isolation` 3 x 25, `paper-acceptance` 4 x 90, `paper-oldsaves` 5 saves x 5 years; none over 45 s). They enter the 8 shards at the default 5 s weight until the nightly refresh (`scripts/ci-shard.mjs` `DEFAULT_SECONDS`).
10. **Merge friction.** `modules/index.ts`, `world/shards.ts`, `world/budget.ts`, `flags.ts`, `GameScreen.tsx`, `ui/store.ts` and `test/lazy-zones.test.ts` are shared one-line seams; each task touches them with an anchored insert.

## 5. Questions the plan raised, with the default and who decides

| # | Question | Default | Decides |
|---|---|---|---|
| Q1 | 53 kinds, not "about 60" | 53 now; R7, R9, R11 append. The 189 cells are the cost driver. | lead |
| Q2 | An edition holds 8 to 12 stories in the future and 20 to 25 in history (measured), not 33 | 33 stays the cap; no filler stories | owner |
| Q3 | The edition is outlet-neutral and the outlet is chosen at render (departs from the stored `o`) | yes; it makes the switcher free | lead |
| Q4 | A small fame and notoriety effect (+2 and +2 a year at most, `fx` lives only) | on, behind the stamp | owner |
| Q5 | Currency minus 10% and unemployment plus 2 points never fire after 2026 (0 of 49 years); housing fires 4 a year | keep the thresholds, say so in the release notes; no invented future currency story | owner |
| Q6 | A log line when you first reach the front page | none: it protects the 5% / 8% / 12% gates; the dot and the chip are the signal | owner |
| Q7 | "Check the story" as a paid action | out: no money in this track; the outlet chips are the free cross-check; E.N5 may add a paid one with a real counterparty | owner |
| Q8 | Door: a header button with an unread dot, plus the log chip | yes, flag `paper` | lead |
| Q9 | Variants: two for the twelve most frequent kinds | yes | lead |
| Q10 | Scheduled events: the Games only, one year ahead, calendar only (D19); fairs through `registerSchedule` in R9 | yes | owner (D19 already says yes) |
| Q11 | `history/events.ts` is not edited by this track | yes; B5 may go first | Bundle lead |
| Q12 | The one release flip is shared with the other tracks | R5-N11 is this track's step of it | lead |
| Q13 | A palette entry "The Paper" | no; the palette indexes menu places only | lead |
| Q14 | `paper` stays out of `WORLD_DROP_FIRST` (the middle class) | yes; a world over the cap sheds `facts` first | lead |

## 6. Plan against code: what I relied on, and how it was confirmed

| Claim | Anchor | Command or reading |
|---|---|---|
| Facts store: 400 rows, 12 a kind-year, oldest dropped, key (k,y,c,a) | `world/facts.ts:36,38,112-135` | read; `grep -n FACT_CAP src/game/world/facts.ts` |
| A fact is `{k,y,c?,a?,v?,s?}`, kind dotted lower case up to 40, severity 0 to 100 | `kernel/fact.ts:20,47` | read |
| The bus drops a kind no module declared; 64 handler runs a cascade | `kernel/bus.ts:57-75` | read |
| R4 declared kinds and emitters | `modules/kin-years.ts:16`, `modules/kin-estates.ts:221`, `society/module.ts:51`; emit sites `kin.ts:285`, `kin-estates.ts:150`, `society/feud.ts:278`, `society/secret.ts:295` | `grep -n "facts:" src/game/modules/*.ts src/game/society/module.ts`; `grep -n "emit(g" ...` |
| Phase `news` exists and is last; docs list it empty | `kernel/registry.ts:30-47`, `docs/KERNEL.md:30` | read |
| Module list sorted by id, `societyModule` follows `MENU_MODULES` | `modules/index.ts:24-37` | read |
| `withYearly` replaces the whole seam list (so the test helper appends) | `kernel/registry.ts:406-421` | read |
| `ageUp` runs `yearlyEconomy` then every aging entry under `withQueueSource` | `aging.ts:45,56-57` | read |
| Economy: 16 history points for all countries, `previous` only for focus | `economy/index.ts:46`, `economy/focus.ts:19-21`, `economy/model.ts:24,202` | read |
| Threshold counts (inflation, jobless, rates, housing, recession, currency, shortage) | scratch probes `paper/probe-econ.ts`, `probe-collapse.ts` (6 lives, 155 years) | `node build.mjs ...; node probe-econ.mjs` in the scratchpad |
| `exchangeRate` and `currencyChangeAt` | `data/currencies.ts:1457,1313` | read; the sim index never moved 10% (probe `fxAlt` 0) |
| The `around.supply` crossing (0.12) exists, and logs a state line for the player's country | `economy/index.ts:50-60` | read |
| History table: 11.9 rows a year, 1.9 after 2026; `worldEvents` 2.9 to 3.6 | `history/events.ts:98,144` | scratch probe `paper/probe-hist2.ts`, `probe-hist.ts` |
| Market events, market news, waves | `history/market-events.ts:226,249,298,304`; `business/tech-wave-factors.ts:51,181` | read |
| Exchange data, `IndexMove`, `SecYear.event`, `ended.kind` | `invest/engine.ts:191,898,1279`; `investments.ts:2243-2246,2211` | read |
| `fam` and `anchor` are file-local in `investments.ts` | `investments.ts:195,200` | `grep -n "^function fam\|^function anchor" src/game/investments.ts` |
| A real company can sit behind a rival or a listed slot | `economy/actors-state.ts:8-12` (`real`), `investments.ts:2243` (`isRealSecId`) | read |
| Press freedom numbers | `nation/data.ts:236`, `nation/state.ts:42,306` | read |
| World shards: registered in the hub, budget `capsOf` switch, invariants loop | `world/shards.ts:6-17`, `world/budget.ts:66,126`, `world/invariants.ts:155-159` | read |
| World cap 80,000, allotment `r5` 6,000, budget 55,000 nodes 800,000 bytes | `world/caps.ts:29,36`, `world/budget.ts:26` | read |
| `normalizeWorld` classes: `paper` falls in the middle class | `world/caps.ts:43,50`, `world/state.ts:134-137` | read; `test/world-state.test.ts:233` pins the first list |
| Layers: `economy/`, `world/`, `nation/state.ts` are L2; `history/`, `text/`, `world.ts` L1; `modules/`, `hubs/` L4; new dir is L3 | `test/layer-kit.ts:60-107` | read |
| Flag keys are a closed list; shipping rule | `flags.ts:27-48`; `test/flags.test.ts:61-98` | read |
| Stamp pattern and its create-time call | `world/social.ts` header; `life.ts:1025` | read |
| `continueAsChild` carries the world | `life.ts:1159` | read |
| Header bell, sheet kinds, inbox mount, store seen-marker | `Header.tsx:47,74`, `GameScreen.tsx:32,224`, `store.ts:661` | read |
| Lazy views, gates and the zone guard | `ui/lazy/lazyView.tsx`, `ui/people/lazy.tsx`, `test/lazy-zones.test.ts:42-81` | read |
| Log news line and its id | `history/events.ts:47,183`; `test/history.test.ts:169,491` | read |
| Voice roles headline 70 / deck 110 exist | `scripts/voice/rules.mjs:48,51`, `docs/VOICE.md:52-53` | `grep -n headline scripts/voice/rules.mjs` |
| `hunit` / `hpick` draw nothing | `text/hash.ts:27,32` | read |
| Registry walk would lint `defineLines` pools as `log` | `test/text-hash.test.ts:185` | read |
| Fame and notoriety are hidden stats 0 to 100; brand reads fame/10 | `core.ts:49`; `business/economy.ts:895-898` | read |
| `netWorth`, `inPrison`, `admittedAge`, `yearsInRole` | `core.ts:482`; `prison.ts:61-86`; `special/common.ts:255` | read |
| Ceiling list has 53 rows with `id`, `file`, `token`, `cap` and a kit row each | `test/ceiling-list.json`, `test/ceiling-kit.ts:1-12`, `test/ceiling-list.test.ts` | read |
| Fixtures that a registry entry moves | `test/fixtures/kernel-parity.json` keys `aging` (44 ids), `lives`, `menus`, `views`; `golden-digests.json` nine slices | `python3` over the JSON; `test/golden-kit.ts:37` |
| Bundle track dependencies on `history/events.ts` | `docs/superpowers/plans/2026-10-31-r5-v5.4.0/bundle.md:98,159` | read |
| `ModuleDef` fields `slices`, `yearly`, `handles`, `facts` | `kernel/registry.ts:78-92` | read |
| `nodeCount` counts each value as one node, keys not at all | `world/state.ts:110-124` | read |
| One HUBS row per module that registers at load | `test/hub-entry.test.ts:58` (`world/edges`) | read |
| `playLife` options `untilAge`, `rich`, `onYear` and the seed argument | `test/play-kit.ts:32-60`; seeds only via `findSeed` (`test/seed-kit.ts:106`) | read |
| The three thin gates exist as named | `test/text-repeat.test.ts`, `quiet-acceptance.test.ts`, `text-kit.test.ts` | `ls test \| grep -i 'text-\|quiet-'` |
| `src/game/news` and `src/ui/paper` do not exist | | `ls src/game/news src/ui/paper` |

## Cross-check amendments (2026-10-31, `00-crosscheck.md` wins over any line above)

1. **Flag keys are the lead's (P3).** One edit adds `paper`, `composer`, `standing`, `tips` to `FLAG_DEFS` and moves `test/flags.test.ts` from eleven keys to fifteen. N1 and the composer's O1 need P3 and drop their own edits of those two files.
2. **NOT_NEWS** starts with the composer's five kinds (N1, step 1). The Paper does not headline `social.scandal` in 5.4.0; the lead may promote it at the flip walk (one row, three cells) if the 1969, 2008 and 2020 editions read thin.
3. **Era words in new files (B9).** Outlet names and template cells are new files judged by the static era gate, which treats an untagged literal in a new file as 1900 text. Every cell or name that holds a word of `ERA_RULES` (crypto, internet, online, radio, TV, airline, nuclear and the rest) carries the `@` tag of `events/era.ts` (`@+crypto`, `@tv`, `@1945`), and `render.ts` and `outlets.ts` strip it with their own regex `/^@[\w!+,-]+\s+/`. `news/` must not import `events/era.ts` (a new L3 domain pair). `paper-text.test.ts` gains a case: no cell holds an `ERA_RULES` word without a tag (the test imports the rules; a test may). N5 and N6 need B8 and B9 (N5 lists them, N6 follows N5).
4. **Stamp.** The Paper's stamp is `paper.fx` in its own shard (N7). Bit 8 of the composer's `social.ft` stays unused. Both stamp calls sit in `createNewLife` next to `stampSocial`: the composer's line is first, N7 adds its own line after it.
5. **Flip.** N11 is the one flip for the release (above). The Paper's own fixture moves are unchanged; the composer's moves join the same commit.
6. **Layer reminder.** `news/render.ts`, `outlets.ts` and the templates may not import `events/`, `business/`, `invest/` or `nation/`; every lookup arrives as an argument from `hubs/paper-view.ts`; the era tag regex is a local constant (amendment 3).

