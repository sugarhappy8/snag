# Sector families Implementation Plan

> **For agentic workers:** use superpowers:subagent-driven-development (or superpowers:executing-plans when you run the tasks inline yourself). Steps use checkbox (`- [ ]`) syntax.

**Parallel work:** other releases are being built in parallel on other branches and touch `yearly.ts`, `state.ts`, `manage.ts` and `economy.ts`, so keep every edit to a shared hot file minimal, additive and in its own hunk. Implementers must re-read the real code of every file before editing it: the anchors and line numbers in this plan come from v3.0.0 (`main` at d061c0d) and may have moved.

**Goal:** give 18 of the 35 generic-only trades an Operations Desk: Food and Drink Service (restaurant, foodTruck, cafe, bakery), Care, Education and Personal Services (clinic, education, gym, salon, petCare, homeCare, autoShop) and Utilities, Land and Fleets (energy, solar, water, telecom, dataCenter, farm, logistics). Each trade gets one optional saved record, a yearly rule that writes only the generic channels, levers with a price and a trade-off, at most one family event a year, one extra key role and a hired-CEO step. The first year after the record appears only measures.

**Architecture:** a framework in `business/sector-*.ts` plus three families that plug into a registry.
- `sector-state.ts` (record, reader, family map) and `sector-data.ts` (roles, history rows, trade tables) are light leaves that `state.ts`, `events.ts`, `industries.ts` and `staff.ts` may import.
- `sector-kit.ts` holds the shared types, the registry (`registerFamily`, `modelOf`) and the pure helpers. It imports no other sector file at run time except `sector-state.ts` and `sector-data.ts`, so family files never import `sector-core.ts` back.
- `sector-core.ts` is the yearly hook, the clamped effect dispatch and the money booking. `sector-events.ts`, `sector-menu.ts`, `sector-ceo.ts` are the three generic front ends.
- Each family is a math file (`sector-food.ts`) and a play file (`sector-food-play.ts`: levers, events, copy table) that registers itself. `sector-families.ts` is the one barrel that imports the three play files; `sector-core.ts` imports the barrel.
- The classic engine stays the only source of money and demand. `economy.ts`, `franchise.ts`, `supply.ts` are not edited.

**Tech stack:** TypeScript (strict), Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-19-sector-families-design.md` is the authority ("spec 4.2" below is its section). Branch `claude/sector-families` (Track C). Release notes and the version bump are not in this plan: they happen at the v4.0.0 integration.

## How to run it (waves, all Sonnet)

| Wave | Tasks | Agents at once |
|---|---|---|
| A | 1 Framework state, hook, money | 1 |
| B | 2 Events engine, desk menu, CEO step: events (step 2.3) and menu (step 2.4) in parallel, then the CEO step (2.5) | 2, then 1 |
| C | 3 then 4 Food, 5 then 6 Care, 7 then 8 Utilities | 3, one per family |
| D | 9 Story, voice, regression | 1 |

- Model rule (`CLAUDE.md`): every task is Sonnet. If a task fails twice, escalate that one task to a single Opus session, never two Opus sessions at once.
- Wave B: the events agent takes `test/sector-events.test.ts` and step 2.3, the menu agent `test/sector-menu.test.ts` and step 2.4, then one agent takes `test/sector-ceo.test.ts` and step 2.5. Each writes its own test file at step 2.1 and runs only its own file until the joint run at step 2.6.
- Wave C agents own only their pair's files. The three trade tables share `sector-data.ts`, so Task 1 creates it with three banner blocks (`// ---- food (Task 3)`, `// ---- care (Task 5)`, `// ---- util (Task 7)`) and each pair edits only inside its own block.
- A typecheck error in a file that is not on your task's list belongs to another agent: wait and re-run, never fix it.
- Measured runtimes below are single-worker runs of the v3.0.0 suites on this machine at load 1 to 2, vitest start-up included. Expect up to twice as long while the other tracks build.

## Global constraints

- Checks per task: `npm run typecheck` (about 10 s), then `npx vitest run --maxWorkers=1 <only the files named in the task>`. Never the full suite, never omit `--maxWorkers=1` (4 CPUs shared by four build tracks), never add a file the task does not name.
- Tests that play whole years pass an explicit timeout (60_000 to 300_000); the repo default is 15_000.
- No release notes, no `package.json` version edit, no `docs/FEATURE-ROADMAP.md` edit in any task.
- Commit with explicit pathspecs (`git add <files>` then `git commit ... -- <files>`), never `git add -A`; every message ends with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01Tq5bMwVNBuT54ZtqpiXV13`.
- Determinism: the layer uses `g.rng` in exactly three places of its own (`chance` and `weightedPick` in `maybeSectorEvent`, `rand` in the `sector.event` script), plus the board's own vote when `boardAllows` needs one and, in the hired-CEO step, `t.judge`, which `smartManagerTurn` already owns; everything else uses `hashOf` and `mix` from `product-market.ts`; no `Math.random`, no `Date`.
- Save: `SAVE_SCHEMA` stays 2 (`core.ts`), `BIZ_VERSION` stays 2, the new field is `BizState.sector?: Json` and only `readSector` validates it; a record with `v` above 1 or of another family is never read and never overwritten.
- Money: only `b.cash` together with `b.yearIncome` (income) or `b.yearCosts` (cost), whole dollars, through `bookIncome` and `bookCost`; nothing else moves money.
- Bounds: `fx.demand` .80 to 1.35, `fx.cost` .90 to 1.12, `fx.capLoss` at most .35, `fx.open` at least .8, each random flow at most 12% of `baseRevenue`, `b.demandShock` clamped .3 to 2, ledger 4 rows, diary 6 lines, one pending event.
- Idempotence: `st.lastYear = fiscal` is saved before any other write of the yearly rule; the fiscal year is `g.year - 1` inside `yearlyBusinessImpl`.
- Authorization lives inside `applyLever` and the `sector.event` script, in this order: `manageBlock`, record slot, option legality, `yearActionsUsed`, `boardAllows` (owner) or `capexLeft` plus reserve (CEO), `useYearAction`, payment.
- Pure presentation: menus, hints, previews and headers never write state and never touch `g.rng` or `g.nextId`.
- Voice (`docs/VOICE.md`): log 90, outcome 120, scene 140, tooltip 120 characters of static text, choice label 5 words, scenes end with `What will you do?`, money through `money()`; no U+2014 and no escape for it in any file you write (`voice-guards` caps em-dashes at 24 and the tree is at exactly 24); no new string over 180 characters (`long` stays 436).
- Counts to keep: 55 trades (`business-expansion`), 5 breakthroughs per trade (`heavy-data`), `emDash` 24, `SAVE_SCHEMA` 2.
- Hot-file hunks: `state.ts` 2, `yearly.ts` 4, `manage.ts` 2, `board-ceo.ts` 2, `events.ts` 2, `industries.ts` 3, `staff.ts` 2; each additive and separate; `sector-menu.ts` must not import `manage.ts` or `board-ceo.ts` (they import it).
- Strict types: no `any`, no `@ts-ignore`, no non-null assertion on game data.

## Review focus

Five failure modes the reviewer checks first. Each is pinned by a named test in the owning task.

1. **Money booked twice or from nowhere.** Task 1 `sector-core.test.ts` "books every dollar once"; Task 2 `sector-menu.test.ts` "a paid lever books its cost once".
2. **A yearly rule that runs twice, or an observation year that is not v3.0.0.** Task 1 `sector-core.test.ts` "is idempotent" and "the observation year books exactly as v3.0.0".
3. **Foresight in hints, the CEO or previews.** Task 1 "expected mode never reads past g.year"; Task 2 `sector-menu.test.ts` "hints never read next year's draws" and `sector-events.test.ts` "the best-choice hint equals the resolver's own expectation".
4. **A write path that skips authorization.** Task 2 `sector-menu.test.ts` "refuses direct and restored calls" and `sector-events.test.ts` "forged, replayed and expired tokens do nothing".
5. **Hostile or unbounded saved state.** Task 1 `sector-state.test.ts` "clamps a hostile record" and `sector-core.test.ts` "clamps a wild model to the bounds".

## File ownership

Paths are under `src/game/business/` unless they start with `test/`.

| Task | Creates | Modifies |
|---|---|---|
| 1 | `sector-state.ts`, `sector-data.ts`, `sector-kit.ts`, `sector-core.ts`, `sector-families.ts`, `sector-food-play.ts`, `sector-care-play.ts`, `sector-util-play.ts` (the last three as one-line `export {}` until Tasks 4, 6, 8), `test/sector-kit.ts`, `test/sector-state.test.ts`, `test/sector-core.test.ts` | `state.ts` (2), `yearly.ts` (2), `industries.ts` (3), `staff.ts` (2) |
| 2 | `sector-events.ts`, `sector-menu.ts`, `sector-ceo.ts`, `test/sector-events.test.ts`, `test/sector-menu.test.ts`, `test/sector-ceo.test.ts` | `yearly.ts` (2), `manage.ts` (2), `board-ceo.ts` (2), `events.ts` (2) |
| 3 | `sector-food.ts`, `test/sector-food.test.ts` | `sector-data.ts` (food block) |
| 4 | none | `sector-food-play.ts`, `test/sector-food.test.ts` |
| 5 | `sector-care.ts`, `test/sector-care.test.ts` | `sector-data.ts` (care block) |
| 6 | none | `sector-care-play.ts`, `test/sector-care.test.ts` |
| 7 | `sector-util.ts`, `test/sector-util.test.ts` | `sector-data.ts` (util block) |
| 8 | none | `sector-util-play.ts`, `test/sector-util.test.ts` |
| 9 | `test/sector-story.test.ts`, `test/sector-voice.test.ts` | none (table rows in `sector-data.ts` only if a test demands it) |

---

## Task 1: Framework state, hook, money (spec 4.1)

**Read first:** `venues.ts` (the light precedent: `venueView` reader, `prepareVenueYear`, `spendCompany`), `franchise-state.ts` and `bookFranchiseYear` in `franchise.ts` (a light reader, booking through `yearIncome`, idempotence through `booked`), `bookYear` in `economy.ts` (`alreadyBooked = yearCosts - yearIncome`), the loop in `yearlyBusinessImpl`, `sector()` and `INDUSTRIES` in `industries.ts`, and `managed()` in `test/ceo.test.ts`.

**Files:**
- Create: `src/game/business/sector-state.ts`, `src/game/business/sector-data.ts`, `src/game/business/sector-kit.ts`, `src/game/business/sector-core.ts`, `src/game/business/sector-families.ts`, `src/game/business/sector-food-play.ts`, `src/game/business/sector-care-play.ts`, `src/game/business/sector-util-play.ts`, `test/sector-kit.ts`.
- Modify: `src/game/business/state.ts` (2 hunks), `src/game/business/yearly.ts` (2 hunks), `src/game/business/industries.ts` (3 hunks), `src/game/business/staff.ts` (2 hunks).
- Test: `test/sector-state.test.ts`, `test/sector-core.test.ts`.

**Interfaces.**

Consumes (exist): `clampN, num, rec, str, toJson, money, pct` (`util.ts`); `BizState, bizOf, readBiz, findBusiness, normalizeBiz, BIZ_VERSION` (`state.ts`); `planFor, localEcon, bizWorth, fxValue, type Worth, type BizFx` (`economy.ts`); `hashOf, mix` (`product-market.ts`); `activeMarketEvents` (`history/market-events.ts`); `bizHas, sameRole` (`era.ts`); `isIndustryLegal` (`data/markets.ts`); `type RoleDef, type IndustryDef` (`industries.ts`, type-only import); `log` (`core.ts`); tests: `adult, company, drain` (`test/market-kit.ts`).

Produces:

```ts
// sector-state.ts (imports only types and util.ts)
export type FamilyId = 'food' | 'care' | 'util'
export const SECTOR_VERSION = 1
export interface SectorRow { year: number; income: number; costs: number; demand: number; cost: number; capLoss: number }
export interface SectorBase { v: 1; family: FamilyId; since: number; lastYear: number; lastEvent: number; ledger: SectorRow[]; pending: { token: string; id: string; year: number } | null; diary: string[] }
export interface FoodState extends SectorBase { family: 'food'; hygiene: number; rating: number; menu: 0 | 1 | 2; channel: 0 | 1 | 2; hours: 0 | 1; audit: number }
export interface CareState extends SectorBase { family: 'care'; loyal: number; plans: number; planTarget: number; payer: number; acc: number; intake: 0 | 1 | 2; program: number }
export interface UtilState extends SectorBase { family: 'util'; condition: number; contract: number; hedge: number; cover: 0 | 1; overhaul: number; outages: number } // outages: 3-bit history, bit 0 = last booked year
export type SectorState = FoodState | CareState | UtilState
export const FAMILY_TRADES: Readonly<Record<FamilyId, readonly string[]>>
export function familyOf(industry: string): FamilyId | null
export type SectorSlot = 'none' | 'own' | 'foreign'   // own: v is 1 and the family is the trade's; foreign: a plain object with v above 1 or another family; none: anything else (absent, not an object, {}, no family)
export function sectorSlot(b: Pick<BizState, 'sector' | 'industry'>): SectorSlot
export function blankRecord(family: FamilyId, since: number): SectorState   // the quality-50 defaults, lastYear = since
export function clampRecord(st: SectorState): SectorState                    // table ranges, integers, diary 6 x 90, ledger 4
export function readSector(b: Pick<BizState, 'sector' | 'industry'>): SectorState | null
export function saveSector(b: Pick<BizState, 'sector'>, st: SectorState): void   // clamps, stores toJson(st); does nothing when the stored value is a foreign slot (v above 1, or another family)
export function addDiary(st: SectorState, line: string): void
export const SEC_KEYS: Readonly<Record<FamilyId, readonly string[]>>   // the fields an event's sec may touch: food hygiene rating menu channel hours audit; care loyal plans planTarget payer acc intake program; util condition contract hedge cover overhaul outages
export function sectorOwnsEvent(b: Pick<BizState, 'sector' | 'industry'>, id: string): boolean   // food with a live record (since below lastYear: never in the observation year): 'inspection', 'critic'

// sector-data.ts (type-only imports)
export interface SectorRole extends RoleDef { blurb: string }
export const SECTOR_ROLES: Readonly<Record<string, SectorRole>>               // the 18 roles of spec 4.2 to 4.4
export function withSectorRoles<T extends Record<string, IndustryDef>>(raw: T): T   // new roles arrays, the extra role last
export function sectorRoleBlurb(industry: string, title: string): string | null
export interface SectorHistoryRow { event: string; trade: string; demand: number; internet?: number }
export const SECTOR_HISTORY: readonly SectorHistoryRow[]                                   // spec 4.5

// sector-kit.ts
export type FxMode = 'book' | 'expected'
export interface SectorCtx { use: number; base: number; level: number; going: number }   // use = calm demand / max(1, calm capacity)
export interface SectorFx { demand: number; cost: number; capLoss: number; open: number; income: number; costs: number; randIncome: number; randCosts: number; next: SectorState; note: { text: string; tone: 'good' | 'bad' | 'neutral' } | null }
export interface LeverOption { value: number; label: string; tip: string }
export interface LeverDef { id: string; label: string; paid: boolean; options(g: GameState, b: BizState, st: SectorState): LeverOption[]; current(st: SectorState, year: number): number; apply(st: SectorState, value: number, year: number): SectorState; cost(g: GameState, b: BizState, st: SectorState, value: number, cx: SectorCtx): number }
export interface SecFx { add?: Record<string, number>; set?: Record<string, number> }
export interface Branch { p: number; fx: BizFx; sec?: SecFx; text: string; vals?: Record<string, string | number> }   // text is a copy key, vals fill its holes (computed inside `branches()`, so a shown fine is the fine `fx` applies)
export interface SectorChoice { id: string; label: string; branches(g: GameState, b: BizState, st: SectorState): Branch[] }
export interface SectorEvent { id: string; family: FamilyId; title: string; emoji: string; weight(g: GameState, b: BizState, st: SectorState): number; scene(g: GameState, a: Asset, b: BizState, st: SectorState): string; choices(g: GameState, b: BizState, st: SectorState): SectorChoice[] }
export type CopyTable = Readonly<Record<string, string>>   // the key suffix gives the voice role: .scene scene, .out outcome, .log log, .tip tooltip, .label label, .head title (event titles, at most 40 characters)
export interface FamilyModel { family: FamilyId; copy: CopyTable; seed(g: GameState, a: Asset, b: BizState, since: number): SectorState; effects(g: GameState, a: Asset, b: BizState, st: SectorState, fiscal: number, mode: FxMode, cx: SectorCtx): SectorFx; header(g: GameState, b: BizState, st: SectorState | null): string[]; levers: readonly LeverDef[]; events: readonly SectorEvent[] }
export function registerFamily(m: FamilyModel): void   // replaces an earlier model of the same family (a test's stub, a hot reload)
export function modelOf(f: FamilyId): FamilyModel | null
export function registeredModels(): FamilyModel[]
export function seasonIndex(g: Pick<GameState, 'lifeId'>, a: Pick<Asset, 'id'>, year: number, salt: string): number   // 2 * mix(hashOf(lifeId|id|year|salt), hashOf(salt), 1) - 1
export function readYear(g: Pick<GameState, 'year'>, fiscal: number, mode: FxMode): number   // 'expected': min(fiscal, g.year)
export function roleSkill(b: Pick<BizState, 'staff'>, title: string): number   // skill / 100 of the sameRole holder, else 0
export function baseRevenue(g: GameState, b: BizState): number
export function sectorCtx(g: GameState, b: BizState, year: number): SectorCtx
export function historyFactor(g: GameState, b: BizState, year: number): number   // .9 to 1.1
export function sectorHistoryLine(g: GameState, b: BizState): string | null   // while a SECTOR_HISTORY row is active at g.year for this trade: `The 2020 crash moved your demand by about ${signed pct}. That's a rough estimate.` (the factor minus 1 through pct, with a + for a gain); else null
export function sectorText(table: CopyTable, key: string, vals?: Record<string, string | number>): string   // fills ${name}; an unknown key gives ''
export function copyLines(table: CopyTable): { key: string; role: 'scene' | 'outcome' | 'log' | 'tooltip' | 'label' | 'title'; text: string }[]   // one entry per key, the role from its suffix; a key with another suffix throws

// sector-core.ts
export const SECTOR_BOUNDS: { demand: readonly [number, number]; cost: readonly [number, number]; capLoss: number; open: number; random: number }
export function bookIncome(b: BizState, x: number): number     // rounds, b.cash += n, b.yearIncome += n, returns n
export function bookCost(b: BizState, x: number): number       // rounds, b.cash -= n, b.yearCosts += n, returns n
export function seedSector(g: GameState, a: Asset, b: BizState, since: number): SectorState | null   // saves; null for no family or a foreign slot
export function sectorEffects(g: GameState, a: Asset, b: BizState, st: SectorState, fiscal: number, mode: FxMode, cx?: SectorCtx): SectorFx   // pure, clamped; default cx = sectorCtx(g, b, readYear(g, fiscal, mode))
export function sectorValue(g: GameState, b: BizState, w: Worth, fx: SectorFx): number
export function prepareSectorYear(g: GameState, a: Asset, b: BizState, fiscal: number): void

// test/sector-kit.ts
export function deskGame(trade: Industry, opts?: { seed?: number; year?: number; cash?: number; talent?: boolean; countryId?: string }): { g: GameState; a: Asset; b: BizState }   // defaults: seed 1, year 2024, cash 20,000,000, talent true, countryId 'us'; company() builds quality 70, so tests that need quality 50 set b.quality
export function playYear(g: GameState): ChoiceModal[]   // year +1, age +1, yearActions cleared, yearlyBusinessImpl; returns the choice popups queued, then drains them exactly as `drain` in test/market-kit.ts does
export function inert(b: BizState): void                // b.sector = { v: 2 }: the layer is off and the company books as v3.0.0
export function jail(g: GameState): void                // g.character.prison = { name: 'State Pen', security: 'medium', crime: 'Burglary', sentenceYears: 4, yearsServed: 1, respect: 50, appealed: false, escapeAttempts: 0 }
export function stubModel(opts?: { fx?: Partial<SectorFx>; levers?: readonly LeverDef[]; events?: readonly SectorEvent[]; copy?: CopyTable }): void  // registerFamily of a 'food' stub: effects return fx (neutral by default: demand 1, cost 1, capLoss 0, open 1, money 0, note null) with next = { ...st, hygiene: st.hygiene + 1 }; levers, events and copy default to empty; header returns ['stub']
export function frozen<T>(x: T): T                       // deep Object.freeze
export function managedDesk(trade: Industry, skill: number, opts?: { seed?: number; cash?: number }): { g: GameState; a: Asset; b: BizState }   // copy of managed() in test/ceo.test.ts (6 sites, a hired CEO of this skill, `g.queue` empty)
```

Decisions:
- `sectorEffects` calls `modelOf(st.family)`, then clamps demand, cost, capLoss and open to `SECTOR_BOUNDS`, income and costs to at least 0, `randIncome` and `randCosts` each to `SECTOR_BOUNDS.random * baseRevenue(g, b)`, and passes `next` through `clampRecord`.
- `FamilyModel` and `LeverDef` members are declared with method syntax, so a family can narrow `st` to its own state type (`foodFx` takes a `FoodState`) and still be assigned to the interface.
- `sectorValue` is `w.contrib * (min(fx.demand, 1 / w.util) - 1) - (fx.cost - 1) * w.cogs + fx.income - fx.costs + fx.randIncome - fx.randCosts`, plus `fxValue(g, { ...b, capacityLoss: 0 }, w, { capacityTo: fx.capLoss })` (zero or negative).
- `deskGame` builds on `adult(seed, year, countryId)` and `company(g, trade, { cash })` from `test/market-kit.ts`; the Business talent stays on unless `talent: false`. A new company's first hook is the first `playYear`.
- The `SECTOR_HISTORY` rows are spec 4.5: `crash2020` clinic -.08, education -.10 with `internet` +.06, petCare +.05, homeCare +.06, bakery +.03 (no `housing2008` row: autoShop is already mapped to `fuel`, which that event hits). A row's value is `strength * demand`, clamped by `historyFactor` to .9 to 1.1; strength comes from `activeMarketEvents(b.countryId, year)`.
- Copy keys (the voice test reads them): `<family>.lever.<lever>.<value>.label` and `.tip`; `<family>.ev.<event>.head` and `.scene` (a variant scene is `<family>.ev.<event>.<variant>.scene`); `<family>.ev.<event>.<choice>.label`; `<family>.ev.<event>.<choice>.<k>.out` for the k-th branch; `<family>.<name>.log`. `MENU_COPY` and `CEO_COPY` use `menu.<name>.<suffix>` and `ceo.<name>.<suffix>`. Lever option labels and tips and event choice labels are `sectorText` lookups, never inline strings.
- `FamilyModel.header(g, b, null)` returns `[]`; `deskLines` then says `The desk opens at the next year end.`
- `registerFamily` replaces a model of the same family, and every test file that calls `stubModel` uses only stubbed families (vitest isolates module state per file, so the real models are untouched elsewhere).
- Seeding: a record made by the yearly hook has `since = lastYear = fiscal` (observation year, nothing else written); a record made by a lever action has `since = lastYear = g.year - 1`, so the year the player acted in is live.

**Steps:**
- [ ] **1.1 Failing state tests** (`test/sector-state.test.ts`):
  - "maps exactly the 18 trades": `familyOf` gives `food` for the 4, `care` for the 7, `util` for the 7 and `null` for bar, brewery, grocery, software, bank, semiconductor; `FAMILY_TRADES` lengths are 4, 7, 7.
  - "clamps a hostile record": a restaurant with `b.sector = { v: 1, family: 'food', hygiene: NaN, rating: 99, menu: 7, channel: -1, hours: 'x', audit: 1e12, diary: 100 lines of 500 characters, ledger: 1000 rows with income 1e30, costs -5, demand 9, capLoss 5, pending: { token: 200 characters, id: 5, year: NaN } }` reads as hygiene 71, rating 5, menu 2, channel 0, hours 0, audit 0, `diary.length` 6 with each line at most 90 characters, `ledger.length` 4 with income at most 1e15, costs at least 0, demand at most 2, capLoss at most 1, `pending` null. Care, on a clinic: `{ v: 1, family: 'care', loyal: NaN, plans: .26, planTarget: 9, payer: -1, acc: 1e9, intake: 5, program: 'x' }` reads loyal .72, plans .3, planTarget .6, payer 0, acc 100, intake 2, program 0. Util, on an energy company: `{ v: 1, family: 'util', condition: -5, contract: NaN, hedge: 5, cover: 3, overhaul: 1e12, outages: 99 }` reads condition 0, contract .5, hedge .8, cover 1, overhaul 0, outages 7.
  - "never reads or overwrites a foreign record": `{ v: 2, family: 'food' }` and `{ v: 1, family: 'care' }` on a restaurant give `readSector` null and `sectorSlot` `'foreign'`; `{}` and an absent field give `'none'`; after `saveSector` of a fresh record the slot is `'own'`; `saveSector` onto a foreign slot leaves `b.sector` unchanged; `{ v: 1 }` (no family) is `'none'`.
  - "round trips": for each family on its own trade (a restaurant, a clinic, an energy company), `saveSector(b, blankRecord(f, 2020))` then `readSector` toEqual the record, and `JSON.parse(JSON.stringify(b.sector))` toEqual `b.sector`.
  - "addDiary": ten calls with 200-character lines leave 6 lines of at most 90 characters, the newest last.
  - "normalizeBiz keeps only a plain object": an object is kept; `[]`, `7`, `'x'`, `null` are dropped; an absent record stays absent; `SAVE_SCHEMA` is 2 and `BIZ_VERSION` is 2.
  - "sectorOwnsEvent": true for `inspection` and `critic` on a restaurant with a live food record (`since` below `lastYear`); false for a record with `since === lastYear` (the observation year), without a record, with a version-2 record, for a bar, and for every id on care and util records.
  - "adds one extra key role to the 18 trades": for each entry of `SECTOR_ROLES`, `INDUSTRIES[id].roles.at(-1)` equals `{ title, focus, pay }` of the entry and titles are unique within the trade; restaurant has 7 roles, foodTruck 4, cafe 6, bakery 5, bar still 5; `maxKeyStaff` of a 3-site foodTruck is 4 and of a 1-site one 3; `roleBlurb({ industry: 'restaurant' }, role)` is the sector blurb for the new role and `Raises quality` for Head Chef.
- [ ] **1.2 Run** `npx vitest run --maxWorkers=1 test/sector-state.test.ts`. Expected: fails with `Failed to resolve import "../src/game/business/sector-state"`.
- [ ] **1.3 Implement** `sector-state.ts`, `sector-data.ts` (roles, blurbs, `SECTOR_HISTORY`, three empty banner blocks) and the hot-file hunks.
  - Reader ranges (every number through `clampN`, rounded where the type is an integer): hygiene 0 to 100 (default 71); rating 1 to 5 (3.4); menu and channel 0 to 2 (1 and 0); hours and cover 0 to 1; loyal .2 to 1 (.72); plans and payer 0 to .6 in .1 steps and planTarget 0 to .6 in .2 steps (snapped, then rounded to 2 decimals so .6 stays .6); acc 0 to 100 (62); intake 0 to 2; condition 0 to 100 (80); contract 0 to 1 (.5); hedge 0 to .8; outages 0 to 7; `audit`, `program`, `overhaul` 0 or a year 1800 to 2300; `since`, `lastYear`, `lastEvent` 0 or a year; ledger rows year, income and costs 0 to 1e15, demand and cost .5 to 2, capLoss 0 to 1; `pending.token` and `pending.id` strings of 1 to 24 characters, else `pending` is null; diary lines cut to 90, last 6 kept, ledger last 4.
  - `state.ts`: in `BizState` after `venueOwner?: Json` add `sector?: Json` with a one-line doc comment; in `normalizeBiz` after the `venueOwner` spread add `...(d.sector && typeof d.sector === 'object' && !Array.isArray(d.sector) ? { sector: d.sector } : {}),`.
  - `industries.ts`: import `{ withSectorRoles } from './sector-data'`; rename `export const INDUSTRIES: Record<Industry, IndustryDef> = {` to `const RAW_INDUSTRIES: Record<Industry, IndustryDef> = {`; after its closing brace add `export const INDUSTRIES: Record<Industry, IndustryDef> = withSectorRoles(RAW_INDUSTRIES)`.
  - `staff.ts`: import `{ sectorRoleBlurb } from './sector-data'`; in `roleBlurb`, after the finance branch and before the final `return`, add `const own = sectorRoleBlurb(b.industry, role.title)` and `if (own) return own`.
  - Role blurbs (at most 50 characters, the sector score first, then the generic effect): Food Safety Lead `Raises hygiene and quality`; Clinical Governance Lead, Registrar, Pet Welfare Officer, Safety and Vetting Officer `Raises accreditation and quality`; Member Experience Lead, Client Relations Lead, Fleet Accounts Manager `Keeps clients and brings in more`; the seven utility roles `Fewer outages, slower wear, more capacity`.
- [ ] **1.4 Run** `npx vitest run --maxWorkers=1 test/sector-state.test.ts`. Expected: all pass.
- [ ] **1.5 Failing core tests** (`test/sector-core.test.ts`; write `test/sector-kit.ts` with them; each test calls `stubModel({ fx })` in `beforeEach` and builds games with `deskGame('restaurant')`):
  - "books every dollar once": two twin games with the same seed and a live record each (`since = g.year - 1`), game A with the stub `{ fx: { income: 1000, costs: 2000, randIncome: 300, randCosts: 500 } }` and game B with the neutral stub. After `prepareSectorYear` A's `b.cash` is B's minus 1,200, `b.yearIncome` is 1,300 above B's and `b.yearCosts` 2,500 above, and A's newest ledger row has `income 1300, costs 2500`. After `simulateYear(g, b, fiscal, 0, 1)` on both, A's `stmt.other` is 2,500 above B's and `stmt.otherIncome` 1,300 above, and A's final `b.cash` is below B's by more than 480 and at most 1,200 (the tax relief returns part of the 1,200 net cost; a double booking would show more than 1,200, a missing one 0).
  - "is idempotent": a second call for the same fiscal year leaves `JSON.stringify(g)` unchanged, `st.lastYear` equals the fiscal year and `st.hygiene` is the seed plus 1 (the stub's `next`), not plus 2.
  - "the observation year books exactly as v3.0.0": two games with the same seed, game 1 with the stub and no record, game 2 with `inert(b)`; after one `playYear` each, `JSON.stringify` of both games is equal once `a.details.sector` is removed; game 1 holds a record with `since === lastYear === fiscal` and an empty ledger; after a second `playYear` its ledger has 1 row.
  - "a record made mid-year is live": a record saved with `since = g.year - 1` is processed by the next hook (ledger 1 row, `hygiene` plus 1, no observation).
  - "logs a note once and stays bounded": a stub `note` of `{ text: 'Test grade moved.', tone: 'good' }` adds exactly one life-log entry in the hook and a 200-character note is cut to 90; `note: null` adds none; after 7 live years the ledger has 4 rows (the newest four fiscal years).
  - "clamps a wild model to the bounds": stub `demand 5, cost .1, capLoss .9, open .1, randIncome 1e9, randCosts 1e9`; `sectorEffects` returns demand 1.35, cost .9, capLoss .35, open .8 and random flows at most `.12 * baseRevenue`; after the hook `b.demandShock` is within .3 to 2, `b.capacityLoss` at most .35, `b.openFraction` at least .8.
  - "writes nothing for the wrong company": no family (software), a dead character, a foreign slot, and a clinic in Cuba (`deskGame('clinic', { countryId: 'cu' })`, where `isIndustryLegal('cu', 'clinic', g)` is false): no record, no channel changed, no money moved.
  - "never touches g.rng and never writes outside its channels": `g.rng` equal before and after; with a null note, only `demandShock`, `costShock`, `capacityLoss`, `openFraction`, `cash`, `yearIncome`, `yearCosts` and `sector` differ.
  - "is pure on frozen inputs": `sectorEffects(frozen(g), frozen(a), frozen(b), frozen(st), fiscal, 'book')` does not throw and `next` is a different object.
  - "expected mode never reads past g.year": `readYear({ year: 2019 }, 2020, 'expected')` is 2019, `'book'` gives 2020, `({ year: 2026 }, 2020, 'expected')` gives 2020.
  - "history rows": `historyFactor` is .92 for a clinic in 2020, .96 for education 2020, 1.05 petCare 2020, 1.06 homeCare 2020, 1.03 bakery 2020, 1.021 homeCare 2021, 1 for autoShop in 2009 (the engine already maps it), 1 for a restaurant in 2020 and for any trade in 2019. `sectorHistoryLine` is null for a restaurant in 2020 and for a clinic in 2019, and for a clinic with `g.year` 2020 it is `The 2020 crash moved your demand by about -8%. That's a rough estimate.` (homeCare: `about +6%`).
  - "seasonIndex": equal inputs give equal outputs; always within -1 to 1; different salts differ; the mean over years 2000 to 2399 is within -.08 to .08; `g.rng` unchanged.
  - "baseRevenue": `b.last.netRevenue` when positive, otherwise the calm plan's units (`min(demand, capacity)`, as `normalYear` in `economy.ts` takes them) times `suggested` over `1 + taxRate` (above 0 for a new company).
  - "key roles": `roleSkill(b, 'Food Safety Lead')` is 0 without the hire and `skill / 100` with one.
- [ ] **1.6 Run** `npx vitest run --maxWorkers=1 test/sector-core.test.ts`. Expected: fails with `Failed to resolve import "../src/game/business/sector-core"`.
- [ ] **1.7 Implement** `sector-kit.ts`, `sector-core.ts`, `sector-families.ts` (three side-effect imports of the play files), the three placeholder play files (`export {}` with a one-line comment naming the task that fills them) and `test/sector-kit.ts`.
  - `prepareSectorYear` follows spec 4.1 steps 1 to 7: return unless `familyOf`, alive, `isIndustryLegal(b.countryId, b.industry, g)`, a registered model and a slot that is not `'foreign'`.
  - No record: `saveSector(b, model.seed(g, a, b, fiscal))` and return. Record with `lastYear >= fiscal`: return.
  - Otherwise save `lastYear = fiscal` first, then `fx = sectorEffects(g, a, b, st, fiscal, 'book')`.
  - Write the channels: `b.demandShock = clampN(b.demandShock * fx.demand, .3, 2)`, `b.costShock *= fx.cost`, `b.capacityLoss = 1 - (1 - b.capacityLoss) * (1 - fx.capLoss)`, `b.openFraction = Math.min(b.openFraction, fx.open)`.
  - Book the four money amounts (`income`, `randIncome` as income; `costs`, `randCosts` as cost). Store `fx.next`, a ledger row of what was booked, and `fx.note` as one `log` line of at most 90 characters; save.
  - `sector-core.ts` imports `'./sector-families'` for its side effect. `yearly.ts` hunks: import `{ prepareSectorYear } from './sector-core'` after the venues import; call `prepareSectorYear(g, a, b, fiscal)` on the line after `prepareVenueYear(g, a, b, fiscal)`.
- [ ] **1.8 Run** `npx vitest run --maxWorkers=1 test/sector-state.test.ts test/sector-core.test.ts`. Expected: all pass.
- [ ] **1.9 Regression** (suites that pin the legacy behaviour this task touches): `npx vitest run --maxWorkers=1 test/business-save-normalization.test.ts test/business-expansion.test.ts test/business-venues.test.ts test/company-dashboard.test.ts test/world2-business-supply.test.ts test/save-schema.test.ts`. About 6 + 18 + 7 + 20 + 8 + 18 = 77 s.
- [ ] **1.10** `npm run typecheck`.
- [ ] **1.11 Commit.** `git add` the files listed under Create and Modify, then `git commit -m "feat: sector framework: state, yearly hook, money booking, key roles" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01Tq5bMwVNBuT54ZtqpiXV13" -- <the same files and the two test files>`.

---

## Task 2: Events engine, desk menu, hired-CEO step (spec 4.1)

**Read first:** `events.ts` (`weightFor`, `scorer`, `presentInspection` with `markBest`), `venues.ts` (`OWNER_SCRIPT` token check, `venueOwnerMenu`), `board-ceo.ts` (`Turn`, `spendable`, `productTurn`, `smartManagerTurn`), `board-vote.ts` (`boardAllows`, `capexLeft`, `noteSpend`), `career.ts` (`ceoLetter`, `letterWords`), `manage.ts` (`cachedHint`, `hinting`), and `managed()` in `test/ceo.test.ts`.

**Files:**
- Create: `src/game/business/sector-events.ts`, `src/game/business/sector-menu.ts`, `src/game/business/sector-ceo.ts`.
- Modify: `src/game/business/yearly.ts` (2 hunks), `src/game/business/manage.ts` (2), `src/game/business/board-ceo.ts` (2), `src/game/business/events.ts` (2).
- Test: `test/sector-events.test.ts`, `test/sector-menu.test.ts`, `test/sector-ceo.test.ts`.

**Interfaces.**

Consumes: Task 1 outputs; `scriptChoice, notice, useYearAction, yearActionsUsed, log` (`core.ts`); `defineScript` (`scripts.ts`); `chance, weightedPick, rand, uid` (`rng.ts`); `markBest, money, pct, rec, str` (`util.ts`); `expectedFx, bizWorth, LASTING_YEARS, type BizFx` (`economy.ts`); `manageBlock` (`gate.ts`); `boardAllows, capexLeft, noteSpend, reserveDollars` (`board-vote.ts`); `boardOf, type BoardState` (`board-state.ts`); `SMART_SKILL, letterWords, LETTER_WORDS` (`career.ts`); `hasTalent, talentHint` (`talents.ts`); `eraFits` (`era.ts`); `runsIt, readBiz, bizOf, findBusiness, type Manager` (`state.ts`). `MAX_PAYBACK` stays in `board-ceo.ts` and arrives as an argument, because `board-ceo.ts` imports `sector-ceo.ts`.

Produces:

```ts
// sector-events.ts
export const SECTOR_EVENT_SCRIPT = 'sector.event'
export const SECTOR_EVENT_P = { owner: .14, managed: .09 } as const
export function maybeSectorEvent(g: GameState, a: Asset, b: BizState, year: number, managed: boolean): boolean
export function applySec(st: SectorState, sec?: SecFx): SectorState   // pure: the `add` deltas, then the `set` values, on the keys of SEC_KEYS[st.family] only, then clampRecord
export function applySectorFx(g: GameState, b: BizState, st: SectorState, fx: BizFx, sec?: SecFx): SectorState   // cash by bookIncome (positive) or bookCost (negative); brand, quality, morale added and clamped 0..100; `wage` added to `b.wageLevel` (clamp .7 to 1.5, 2 decimals, as the generic raises do); `demandTo` below 1 gives `b.demandShock = Math.min(b.demandShock, v)`, else `Math.max`; `capacityTo` gives `b.capacityLoss = Math.max(b.capacityLoss, v)`; `costTo` gives `b.costShock = Math.max(b.costShock, v)` (the moves `fxValue` prices); the sec part through applySec
export function choiceValue(g: GameState, a: Asset, b: BizState, st: SectorState, ev: SectorEvent, choiceId: string, w?: Worth): number   // sum of p * (fxValue + secValue), mean draws
export function eventProblems(ev: SectorEvent, g: GameState, a: Asset, b: BizState, st: SectorState): string[]   // [] when valid; reports: branch probabilities not summing to 1 (1e-9) or outside 0 to 1; a `sec` key outside SEC_KEYS[family]; an `fx` key outside cash, brand, quality, morale, demandTo, capacityTo, costTo, wage; a non-finite number; the bounds of spec 4.1 (cash at most max(.12 * baseRevenue, 3000 * level), brand, quality and morale within 12, demandTo .85 to 1.15, capacityTo at most .35, costTo at most 1.12, wage within .08); a scene not ending with `What will you do?`; a label over 5 words; fewer than 2 choices; a `text` key missing from the family copy table
// sector-menu.ts
export type LeverResult = { ok: true; paid: number } | { ok: false; why: string }
export const MENU_COPY: CopyTable
export function applyLever(g: GameState, a: Asset, lever: string, option: number, by: 'owner' | 'ceo'): LeverResult
export function leverValue(g: GameState, a: Asset, b: BizState, st: SectorState, lever: LeverDef, option: number, w?: Worth, cx?: SectorCtx): number
export function deskLines(g: GameState, a: Asset): string[]
export function sectorMenu(a: Asset): MenuGroup
// sector-ceo.ts
export const SECTOR_MAX_CHANGES = 2
export const CEO_COPY: CopyTable
export interface SectorTurn { g: GameState; a: Asset; b: BizState; m: Manager; st: BoardState; judge: (v: number) => number; lines: string[]; moved: number; reserved: number }
export function sectorTurn(t: SectorTurn, maxPayback: number): void   // board-ceo's own Turn is passed as t; it mutates t.lines, t.moved
```

Decisions this task fixes (the spec leaves them open):
- The outcome line of a branch is its `text` (a copy key) filled with its `vals`; the notice title is `SectorEvent.title`; the diary line is `${g.year} ${title}. ${choice label}.` cut to 90 characters.
- `secValue` is `LASTING_YEARS` times the change in `sectorValue` of `sectorEffects(..., 'expected')` between `st` and `applySec(st, sec)`, both evaluated with `fiscal = g.year` (the year being lived).
- `leverValue` rolls the record 3 years forward with weights 1, 1, .7, in `'expected'` mode, for the current setting and for the option, and subtracts `lever.cost`. Year k (0, 1, 2) uses `fiscal = g.year + k`; `readYear` keeps market history at `g.year` at most, so all three years share one `cx` (the `cx` argument when given, else `sectorCtx(g, b, g.year)`).
- Hints are memoised in a private map (key: `g.lifeId`, asset id, `g.year` and `JSON.stringify(a.details)`, as `cachedHint` in `manage.ts` does; 32 entries, oldest dropped), appear only when `hasTalent(g, 'Business')` and `manageBlock` is null (as `hinting` does there), and mark the best option of a lever only.
- `option` in `applyLever` and `leverValue` is the option's `value`, compared with `Math.abs(x - y) < 1e-9`; `contractOptions` and every lever's values are rounded to 2 decimals.
- The gate of `applyLever` depends on `by`: `'owner'` uses `manageBlock`; `'ceo'` needs only the company still owned (`findBusiness`), the character alive, `b.ceo === 'manager'`, `b.manager` and `skill > SMART_SKILL` (the owner's jail or age must not stop their manager). The owner may use a lever whoever runs the company; the once-a-year key is shared.
- Menus, headers and hints read `readBiz(g, a)`, never `bizOf` (it normalizes in place); `sectorMenu` is visible only when `familyOf(industry)` is set and `modelOf(family)` is registered; a menu action's `run` calls `applyLever` and, on `ok: false`, `notice(g, 'Operations Desk', why, { emoji })`; on success it adds nothing (the row shows the new setting). `deskLines` ends with the last 2 diary lines when there are any.
- A CEO letter line says `worth ${money}` with `(value + cost) / LASTING_YEARS` rounded, the gross yearly gain.
- `gain` passed to `boardAllows` is `max(0, leverValue / LASTING_YEARS)` when finite, else 0.

**Steps:**
- [ ] **2.1 Failing tests.**
  - `test/sector-events.test.ts` (stub family with two events, one of weight 0):
    - "rolls at most one event per company-year and none in the observation year" (over 12 years, at most one popup with `scriptId` `sector.event` per fiscal year, and none the first year).
    - "uses g.rng exactly twice when it fires and once when it does not" (compare `g.rng` with `nextRandom` applied once or twice to the old state).
    - "sets b.lastEvent, st.lastEvent and a token".
    - "forged, replayed and expired tokens do nothing" (wrong token; the right token twice; `g.year + 1`): `JSON.stringify(g)` is unchanged after each refused call and the cost is applied once after the good one.
    - "refuses a blocked owner" (`jail(g)`, age 17, sold company): the record keeps `pending` and no money moves.
    - "the best-choice hint equals the resolver's own expectation": with the Business talent the choice that `markBest` marks has the highest `choiceValue`, and `choiceValue` equals `expectedFx` of the same `branches` plus `secValue`.
    - "branch probabilities sum to 1": through `eventProblems`, which also reports a deliberately broken event (sum .9, an unknown `sec` key, a scene without the closer, a label of six words).
    - "event load at most .45": `SECTOR_EVENT_P.owner + (1 - SECTOR_EVENT_P.owner) * .3` and the managed figure with .18 are both at most .45, and 1,000 simulated company-years on the stub give a rate at most .48.
    - "the generic inspection and critic are off for food with a live record": `businessEventInternals.possible(g, b)` lacks `'inspection'` and `'critic'` with a record whose `since` is below `lastYear`, has both with a record whose `since === lastYear` (the observation year) and without one, and a bar keeps `'inspection'`.
    - "event outcomes are bounded": `eventProblems` reports a branch with cash 1e9, one with brand 40, one with `fx.payroll`, one with `wage` .2 and one with `demandTo` .5.
  - `test/sector-menu.test.ts`:
    - "menus are pure": walk every node of `sectorMenu(a)` and of `businessView(g, a)`, with and without the talent; `JSON.stringify(g)`, `g.rng` and `g.nextId` are unchanged.
    - "refuses direct and restored calls": company sold, `jail(g)` with `by: 'owner'`, age 17, dead character, unknown lever, an option not offered (a value between two options), a second change of the same lever in one year (by the owner, then by a CEO, and the other way round), `by: 'ceo'` on an owner-run company, `by: 'ceo'` at skill 75, a foreign slot. Each returns `ok: false` and leaves `JSON.stringify(g)` unchanged.
    - "a hired CEO works while the owner is in jail": `managedDesk` at skill 80 and `jail(g)`: `applyLever(..., 'ceo')` is `ok`, `'owner'` is refused.
    - "a board can refuse an owner's paid lever": outside investors own 40% (`b.share = .6`) and `boardOf(b).limits = { capex: 0, reserve: 3, pay: 1.5 }`; `applyLever` of the paid option holds a vote (`boardOf(b).votes` grows by 1 whichever way it goes); when `ok` is false cash, `yearCosts` and the lever's year-action count are unchanged, when true the cost is booked once.
    - "a paid lever books its cost once": cash down by the cost, `yearCosts` up by the cost, and the next `simulateYear` does not move cash by it again.
    - "a lever on a company with no record creates one live this year": `since === g.year - 1` and the next hook writes a ledger row.
    - "shows the desk header": no record, the text contains `The desk opens at the next year end.`; a hired CEO of skill 75, it contains `Your CEO adjusts these levers at skill 76 or more.`; skill 76 and owner-run, neither; with 3 diary lines the last 2 end the text.
    - "hints never read next year's draws": a stub whose `effects` counts its `'book'` calls and uses `seasonIndex` there: none while `leverValue`, the menu's hints (with the talent) and `choiceValue` run; and `leverValue` with a hand-made `w` and `cx` is identical in two games that differ only in `lifeId`.
    - "menu shape": id `sector.desk.${a.id}`, `disabledReason` equals `manageBlock`, one submenu per lever, one action per option, the current option marked, paid options have `confirm`.
  - `test/sector-ceo.test.ts` (stub family with three free levers each worth more than 0 and one paid lever with options costing 1,000 and 3,000):
    - "stays modeled": `outlook(g, a, b).modeled` is true for a restaurant, a clinic and an energy company.
    - "skill 75 changes no lever, skill 76 changes at most 2".
    - "obeys the budget and the reserve": with `capex: 0`, or cash at the reserve, no paid lever runs; spending never takes cash below `reserveDollars`; `st.spent` stays at most `capexBudget`.
    - "a cash mandate picks the cheaper option" when the two values are within 5%.
    - "letter lines": each at most 12 words by `letterWords`, each contains a digit, none starts with Cut, Let, Closed, Retired, Opened or Built, none has a colon join; one letter a year still holds.
- [ ] **2.2 Run** `npx vitest run --maxWorkers=1 test/sector-events.test.ts test/sector-menu.test.ts test/sector-ceo.test.ts`. Expected: each file fails with `Failed to resolve import` for its new module.
- [ ] **2.3 Implement 2.1 events** in `sector-events.ts`.
  - `maybeSectorEvent` returns false for a dead or imprisoned owner, no record or no registered model, `st.since >= year`, `st.lastEvent >= year`. An old `pending` (year below `g.year`) is dropped with a diary line.
  - Then `chance(g, managed ? SECTOR_EVENT_P.managed : SECTOR_EVENT_P.owner)`, candidates are the family events with weight above 0 whose rendered scene passes `eraFits`, `weightedPick`.
  - Set `b.lastEvent = st.lastEvent = year` and `st.pending = { token: uid(g, 'secEv'), id, year: g.year }`, save, then `scriptChoice(g, SECTOR_EVENT_SCRIPT, ev.title, `${a.name}\n\n${scene}`, choices with `markBest` hints, { emoji, data: { assetId, token } })`.
  - The script: `findBusiness`, `manageBlock` null, token and `pending.year === g.year` match, the choice exists, `rand(g)` over `branches(g, b, st)`, `applySectorFx`, clear `pending`, one diary line, one notice with the event title and the branch text.
  - Hunks. `events.ts`: import `{ sectorOwnsEvent } from './sector-state'` and, in `weightFor` after the finance line, `if (sectorOwnsEvent(b, e.id)) return 0`. `yearly.ts`: import `{ maybeSectorEvent } from './sector-events'` and a new statement on the line above the long chain: `if (!eventQueued && maybeSectorEvent(g, a, b, fiscal, managed)) eventQueued = true`.
- [ ] **2.4 Implement 2.2 menu** in `sector-menu.ts`.
  - `applyLever` order: find the business; the gate for `by` (see Decisions); slot not foreign; lever and option legal; `yearActionsUsed(g, 'sector.' + lever + '.' + a.id) >= 1` refuses; company cash covers the cost.
  - Owner paid levers call `boardAllows(g, a, b, { kind: 'capex', by: 'owner', amount: cost, gain, label })`. CEO levers need `cost <= capexLeft(g, b, st)` and `b.cash - cost >= reserveDollars(b, st)`, then `noteSpend`.
  - Create the record with `seedSector(g, a, b, g.year - 1)` if none; then `useYearAction`, `bookCost`, `lever.apply`, `saveSector`.
  - `sectorMenu` is a `MenuGroup` shaped like `venueOwnerMenu` (`visible` by `familyOf` and a registered model, `disabledReason: manageBlock`, `header` from `deskLines`).
  - Hunks in `manage.ts`: import `{ sectorMenu } from './sector-menu'` and `{ familyOf } from './sector-state'` next to the venues imports; one line after `if (isVenue(health.industry)) nodes.push(venueOwnerMenu(a))`: `if (familyOf(health.industry)) nodes.push(sectorMenu(a))`.
- [ ] **2.5 Implement 2.3 CEO** in `sector-ceo.ts`.
  - `sectorTurn` returns unless `t.m.skill > SMART_SKILL` and a record exists.
  - It lists every option of every lever, scores `t.judge(leverValue(...))`, and takes at most `SECTOR_MAX_CHANGES` best, each only when `value > 0` and its cost is inside `max(0, min(capexLeft(t.g, t.b, t.st), t.b.cash - reserveDollars(t.b, t.st) - t.reserved))`.
  - Paid levers need payback `cost / ((value + cost) / LASTING_YEARS)` within `maxPayback`, except audit, program and overhaul, which need only `value > 0`. Under a cash mandate it picks the cheaper option when values are within 5%.
  - It calls `applyLever(..., 'ceo')`, adds `paid` to `t.moved`, and pushes one line from `CEO_COPY`, for example `Set the menu to Lean, worth ${money} a year.`
  - Hunks in `board-ceo.ts`: import `{ sectorTurn } from './sector-ceo'` and `sectorTurn(t, MAX_PAYBACK[t.st.mandate])` on the line after `productTurn(t)` in `smartManagerTurn`.
- [ ] **2.6 Run** `npx vitest run --maxWorkers=1 test/sector-state.test.ts test/sector-core.test.ts test/sector-events.test.ts test/sector-menu.test.ts test/sector-ceo.test.ts`. Expected: all pass.
- [ ] **2.7 Regression:** `npx vitest run --maxWorkers=1 test/company-events.test.ts test/business-venues.test.ts test/company-dashboard.test.ts test/ceo.test.ts test/ceo-letter-voice.test.ts test/board.test.ts`. About 13 + 7 + 20 + 58 + 27 + 21 = 146 s.
- [ ] **2.8** `npm run typecheck`.
- [ ] **2.9 Commit.** `git add` the Create and Modify files plus the three test files; message `feat: sector framework: events engine, operations desk, hired CEO step`; the two trailers; explicit pathspecs.

---

## Task 3: Food and Drink Service, state and math (spec 4.2)

**Read first:** the tiny facades `deeptech.ts` and `finance-firm.ts` (how a family hides behind a dispatcher), `planFor`, `priceBounds` and `staffPower` in `economy.ts`, `franchiseUnits` in `franchise-state.ts`, `nationalMarket` in `dynamics.ts`.

**Files:**
- Create: `src/game/business/sector-food.ts`.
- Modify: `src/game/business/sector-data.ts` (food block only).
- Test: `test/sector-food.test.ts`.

**Interfaces.**

Consumes: Task 1 kit and state (`FxMode, SectorCtx, SectorFx, seasonIndex, readYear, roleSkill, historyFactor, sectorHistoryLine`, `FoodState`); `staffPower` (`economy.ts`); `franchiseUnits` (`franchise-state.ts`); `nationalMarket` (`dynamics.ts`); `bizHas` (`era.ts`).

Produces:

```ts
// sector-data.ts, food block
export interface DayPart { name: string; share: number; seat: number }
export interface FoodRow { dayparts: readonly DayPart[]; amp: number; waste: number; platform: number; fleet: number }   // fleet 0: none
export const FOOD: Readonly<Record<'restaurant' | 'foodTruck' | 'cafe' | 'bakery', FoodRow>>   // the spec 4.2 table
// sector-food.ts
export function foodRow(industry: string): FoodRow | null
export function gradeOf(hygiene: number): 'A' | 'B' | 'C'                       // A from 85, B from 65
export function squeeze(row: FoodRow, use: number): number                      // 0 to .12
export function auditCost(b: BizState, cx: SectorCtx): number                   // max(1500 * level, .004 * base)
export function kitchenFine(b: BizState, cx: SectorCtx): number              // max(2500 * level, .008 * base)
export function foodSeed(g: GameState, a: Asset, b: BizState, since: number): FoodState
export function foodFx(g: GameState, a: Asset, b: BizState, st: FoodState, fiscal: number, mode: FxMode, cx: SectorCtx): SectorFx
export function foodHeader(g: GameState, b: BizState, st: FoodState | null): string[]
```

Decisions:
- The effects read the stocks at the start of the year (grade, rating factor) and write the updated stocks to `next`.
- Seed: `hygiene = clampN(56 + .3 * quality, 0, 100)`, `rating = clampN(2.4 + .02 * quality, 1, 5)`, menu 1, channel 0, hours 0, audit 0, `lastYear = since`.
- Wages for the hours lever are `b.last?.wages ?? .3 * cx.base`.
- Nothing food-related is random, so `randIncome` and `randCosts` are 0. Commission and wages are `costs`.

**Steps:**
- [ ] **3.1 Failing tests** (`test/sector-food.test.ts`, `describe('food math')`; call `foodFx` directly with a hand-made `cx = { use, base: 1_000_000, level: 1, going }`, `b.price = going`, `b.quality = 50` and `b.morale = 60`; the synthetic `Worth` is `{ contrib: .68 * base, revenue: base, cogs: .32 * base, util }` with the `util` each test names):
  - "seeds": quality 50 gives hygiene 71, rating 3.4, `gradeOf(71)` B; quality 100 gives hygiene 86; `gradeOf` is C at 64.9, B at 65 and 84.9, A at 85.
  - "squeeze thresholds": the first daypart fills at use .75 restaurant, .889 foodTruck, .70 cafe, .786 bakery (`squeeze` is 0 just below and above 0 just over each); restaurant at .85 loses .040 (within .0005); foodTruck at .85 loses 0; every trade at 1.3 loses exactly .12.
  - "neutral identity": for each trade, seed state, use .5, expected mode: `demand` 1 (within 1e-9), `income` and `costs` 0, `cost` between 1 and 1.02 (the bakery's waste term is the largest, 1.0156), `capLoss` 0, `open` 1.
  - "hygiene": a skill-100 Food Safety Lead gives 78.7, 83.7, 87.0 over three chained `next` states (grade A on the third); with `audit` set to the fiscal year each year, 82.9 then 90.6; one audit at skill 0 gives 75.2. Hygiene below 65 gives demand x .92. `franchiseUnits` 16 lowers the target by 12; morale 30 lowers it by 8.
  - "rating": restaurant at use .85 with neutral levers gives 3.376, 3.362, 3.353, 3.348 (within .001); the demand factor is `1 + .06 * (rating - 3.4)`.
  - "menu": Lean gives demand x .97 and cost x .93, Signature x 1.05 and x 1.07, Balanced x 1 and 1.0104 for a restaurant with no ops staff (the waste term). With the synthetic `Worth`, `sectorValue` ranks Signature first at `util` .5 and Lean first at `util` 1.
  - "delivery": a platform at use .5 nets between +1% and +2% of base through `sectorValue` over the seed settings (`util` .5) and loses money at use 1 (`util` 1); its commission is `.30 * share * base * (1 + new)`; a fleet pays `.10 * share * base * (1 + new)` plus `.015 * base`; foodTruck has no fleet.
  - "pandemic shield": restaurant in the `us`, fiscal 2020, channel 1, `'book'`: shield above 0 and at most `.8 * share * (1 - events.demand)`; in `'expected'` mode with `g.year` 2019 the shield is 0 (no foresight).
  - "extended hours": use is divided by 1.15 in the squeeze and `costs` rise by `.05 * wages`.
  - "mean-preserving": 400 fiscal years from 2000, each evaluated from the seed state at use .5 in `'book'` mode; mean demand within .97 to 1.02 and mean cost within .995 to 1.02, for each trade.
  - "cost floors": at `base` 10,000 and `level` 1, `auditCost` is 1,500 and `kitchenFine` 2,500; at `base` 1,000,000 they are 4,000 and 8,000.
  - "12 years, finite": each trade chained 12 years in `'book'` mode stays finite and inside the bounds; identical calls give identical results; `g.rng` is unchanged; frozen inputs do not throw.
  - "header": for a restaurant at the seed the lines joined with a space equal `Grade B, hygiene 71. Rating 3.4. Dinner fills above 75% use. Menu Balanced. Delivery off. Standard hours.` and each line is at most 140 characters; a bakery in 2020 adds the `sectorHistoryLine` and a restaurant never does.
- [ ] **3.2 Run** `npx vitest run --maxWorkers=1 test/sector-food.test.ts`. Expected: fails with `Failed to resolve import "../src/game/business/sector-food"`.
- [ ] **3.3 Implement** the food table block and `sector-food.ts` per spec 4.2 "Yearly rule": peak squeeze, rating, hygiene, menu cost, delivery, pandemic shield, hours, season `1 + amp * seasonIndex(g, a, fiscal, 'wx')` (index 0 in expected mode), and `demand = (1 - lost) * ratingFactor * gradeFactor * menuDemand * season * (1 + new + shield)`, times `historyFactor(g, b, readYear(g, fiscal, mode))` for the bakery row only.
- [ ] **3.4 Run** `npx vitest run --maxWorkers=1 test/sector-food.test.ts test/sector-core.test.ts`. Expected: all pass.
- [ ] **3.5 Regression:** this task edits no hot file and registers nothing, but `industries.ts` imports `sector-data.ts` at load, so a broken table block would break every suite. Run `npx vitest run --maxWorkers=1 test/sector-state.test.ts test/business-expansion.test.ts` (the 55-trade suite takes about 18 s, the new state suite a few seconds).
- [ ] **3.6** `npm run typecheck`.
- [ ] **3.7 Commit.** `git add src/game/business/sector-food.ts src/game/business/sector-data.ts test/sector-food.test.ts`; message `feat: sector families: Food and Drink Service state and math`; the two trailers; explicit pathspecs.

---

## Task 4: Food and Drink Service, levers, events, copy (spec 4.2)

**Read first:** `presentInspection` and `inspectionPassP` in `events.ts` and `presentCritic` in `events-extra.ts` (the two generic events this family replaces), `test/heavy-voice.test.ts` (the copy test style), Task 2's `eventProblems`.

**Files:**
- Modify: `src/game/business/sector-food-play.ts` (replace the placeholder).
- Test: `test/sector-food.test.ts` (append `describe('food desk')`).

**Interfaces.**

Consumes: Task 3 outputs; Task 1 kit and state; `bizHas, eraFits` (`era.ts`). The play file imports no other sector file (`sector-menu.ts` and `sector-events.ts` import `sector-core.ts`, which imports the barrel that imports this file). The tests in `describe('food desk')` import `applyLever`, `deskLines` (`sector-menu.ts`) and `eventProblems` (`sector-events.ts`).

Produces:

```ts
export const FOOD_COPY: CopyTable                       // every string of the family, under the key scheme of Task 1
export const FOOD_LEVERS: readonly LeverDef[]           // 'menu' (0 Lean, 1 Balanced, 2 Signature), 'delivery' (0 Off, 1 Platform, 2 Own fleet), 'hours' (0 Standard, 1 Extended), 'audit' (paid, option 1)
export const FOOD_EVENTS: readonly SectorEvent[]        // inspection, review, platformHike, recall, festival, chefOffer, noise, rush
export const FOOD_MODEL: FamilyModel                    // registerFamily(FOOD_MODEL) runs at import
```

Decisions:
- Choice ids (tests pin them): inspection `open`, `audit`, `stall`; review `comp`, `invite`, `ignore`; platformHike `pay`, `fleet`, `drop`; recall `pull`, `ride`; festival `book`, `skip`; chefOffer `match`, `release`; noise `cut`, `proof`, `ignore`; rush `staff`, `turn`, `ride`. Labels are imperative and at most 5 words.
- Weights from spec 4.2: platformHike .8 only at channel 1, noise .6 only at hours 1, rush .5 only with `bizHas(g, b.countryId, 'socialMedia')`.
- Inspection `p(fail) = clamp(.55 - hygiene / 180, .03, .5)`, times .35 when `st.audit >= g.year - 1` (an audit paid in the year just booked or this year; the event fires at the start of `g.year`, so last year's audit counts) or the `audit` choice is taken. That choice costs `auditCost` unless `st.audit === g.year` already (then 0) and sets `st.audit = g.year` through `sec.set`.
- The review scene says critic before `socialMedia` and blogger after it (two copy keys).
- Branch costs that scale with the company (`auditCost`, `kitchenFine`) use `cx = sectorCtx(g, b, g.year)` inside `branches()`.
- Delivery option 1 needs `bizHas(g, b.countryId, 'smartphone')` and `row.platform > 0`; option 2 needs `row.fleet > 0`. The audit lever costs `auditCost`.

**Steps:**
- [ ] **4.1 Failing tests** (append to `test/sector-food.test.ts`):
  - "registers the food model": after importing `sector-core`, `modelOf('food')` is not null, has levers `menu, delivery, hours, audit` and exactly the 8 event ids; `sectorOwnsEvent` is true for `critic` with a live record.
  - "offers delivery by trade and era": restaurant in 2026 has options `[0, 1, 2]`, foodTruck `[0, 1]`, restaurant in 1985 `[0, 2]`.
  - "levers through applyLever": menu is free; `audit` costs `auditCost(b, cx)` (cash and `yearCosts` move once); a second audit in the year is refused; after the next hook the hygiene is above a control run's by `.35 * 12` within .05.
  - "events are valid": `eventProblems` is `[]` for all 8 events in three probe states (seed; channel 1 with hours 1; hygiene 40), and every scene, outcome and log renders with no `${` left and no `NaN` or `undefined`.
  - "inspection odds": `p(fail)` of `open` is .155 at hygiene 71, .03 at 100 and .5 at 0; the `audit` choice's fail odds are .35 of the `open` ones, and so are `open`'s with `st.audit = g.year - 1`.
  - "era": `rush` has weight 0 in 1970 and above 0 in 2026; the review scene contains `critic` in 1960 and `blogger` in 2020, and `eraFits` accepts both.
  - "gated by state": `platformHike` weight 0 at channel 0 and above 0 at 1; `noise` likewise by hours.
  - "no generic duplicates over 12 years": restaurant and bakery, 3 seeds, 12 `playYear` calls each: no queued choice has `scriptId` `business.ev.inspection` or `business.ev.critic`, at most one popup whose `scriptId` is `sector.event` or starts with `business.ev.` per company-year, and the `sector.event` rate over those 72 company-years is at most .30.
  - "copy keys": `copyLines(FOOD_COPY)` has at least 40 lines, every key starts with `food.`, each lever option and each event choice has its `.label`, each event its `.head` and `.scene`, and every branch `text` key exists.
- [ ] **4.2 Run** `npx vitest run --maxWorkers=1 test/sector-food.test.ts`. Expected: the new tests fail with `expected null not to be null` on `modelOf('food')`.
- [ ] **4.3 Implement** `sector-food-play.ts`: the copy table first (scene and outcome style of spec 4.5, for example `An inspector walks into the kitchen at 11:40. The lunch rush starts in twenty minutes. What will you do?`), then the levers (option label and tip with cost and trade-off, tip at most 120 characters), the events (branches per the spec 4.2 table, using `kitchenFine`, `auditCost` and `sec` deltas for hygiene, rating, channel, hours), `FOOD_MODEL` (`seed: foodSeed`, `effects: foodFx`, `header: foodHeader`, `copy: FOOD_COPY`) and `registerFamily(FOOD_MODEL)`.
- [ ] **4.4 Run** `npx vitest run --maxWorkers=1 test/sector-food.test.ts test/sector-core.test.ts test/sector-events.test.ts test/sector-menu.test.ts`. Expected: all pass.
- [ ] **4.5 Regression** (the food trades now run through the layer): `npx vitest run --maxWorkers=1 test/ceo-letter-voice.test.ts test/franchise.test.ts test/company-events.test.ts`. About 27 + 12 + 13 = 52 s.
- [ ] **4.6** `npm run typecheck`.
- [ ] **4.7 Commit.** `git add src/game/business/sector-food-play.ts test/sector-food.test.ts`; message `feat: sector families: Food and Drink Service levers, events and copy`; the two trailers; explicit pathspecs.

---

## Task 5: Care, Education and Personal Services, state and math (spec 4.3)

**Read first:** Task 3's `sector-food.ts` as the shape to follow; `staffPower` in `economy.ts`; `licencePremium` in `economy.ts` (the clinic's existing licence effect, which stays); `franchise.ts` `FRANCHISE_INDUSTRIES` (six of the seven trades franchise, so loyalty and accreditation reach royalties through own sales).

**Files:**
- Create: `src/game/business/sector-care.ts`.
- Modify: `src/game/business/sector-data.ts` (care block only).
- Test: `test/sector-care.test.ts`.

**Interfaces.**

Consumes: Task 1 kit and state (`CareState`, `historyFactor`, `sectorHistoryLine`, `roleSkill`, `readYear`, `seasonIndex`); `staffPower` (`economy.ts`); `units, pct` (`util.ts`).

Produces:

```ts
// sector-data.ts, care block
export interface PayerRow { disc: number; up: number; deny: number }
export interface CareRow { visits: number; r0: number; crowd: number; amp: number; payer: PayerRow | null }
export const CARE: Readonly<Record<'clinic' | 'education' | 'gym' | 'salon' | 'petCare' | 'homeCare' | 'autoShop', CareRow>>   // the spec 4.3 table
// sector-care.ts
export function careRow(industry: string): CareRow | null
export function accTier(acc: number): 'provisional' | 'standard' | 'high'   // below 50, 50 to 79.9, 80 and above
export function careRoleMoves(b: Pick<BizState, 'industry'>): 'acc' | 'ret'   // by the extra role's focus: quality moves acc, sales moves ret
export function accProgramCost(b: BizState, cx: SectorCtx): number                // max(2000 * level, .006 * base)
export function clientsOf(b: BizState, row: CareRow): number                   // Math.round((b.last?.sold ?? 0) / row.visits)
export function careSeed(g: GameState, a: Asset, b: BizState, since: number): CareState
export function careFx(g: GameState, a: Asset, b: BizState, st: CareState, fiscal: number, mode: FxMode, cx: SectorCtx): SectorFx
export function careHeader(g: GameState, b: BizState, st: CareState | null): string[]
```

Decisions:
- `plans` ramps toward `planTarget` by at most .10 a year, and the year's plan cost and retention use the ramped value; loyalty demand uses the loyalty at the start of the year.
- The history factor multiplies demand; the header ends with the kit's `sectorHistoryLine` while a history row is active.
- Header lines, in order: `About ${units(clients)} clients, ${pct(loyal)} come back.`; `Plans ${pct(plans)}.` (with `, target ${pct(planTarget)}` before the full stop while they differ); `Provisional, score ${n}.` below 50, `Accredited, score ${n}.` from 50 to 79, `Top tier, score ${n}.` from 80 (n is the rounded `acc`); `Payer mix ${pct(payer)}.` only for a trade with a payer row; `Intake open.`, `Intake steady at 90%.` or `Intake protected at 75%.`; then `sectorHistoryLine` when it is not null.
- The extra role moves `acc` for quality-focus roles (clinic, education, petCare, homeCare) and `ret` for sales-focus roles (gym, salon, autoShop).
- Seed: `loyal = r0`, `plans = planTarget = payer = 0`, `acc = clampN(62 + .3 * (quality - 50), 30, 90)`, intake 0, `program` 0, `lastYear = since`.
- Care has no hashed draws except the season; `randIncome` and `randCosts` are 0.

**Steps:**
- [ ] **5.1 Failing tests** (`test/sector-care.test.ts`, `describe('care math')`; hand-made `cx`, `b.quality = 50`, `b.morale = 60`; the synthetic `Worth` is `{ contrib: c * base, revenue: base, cogs: .2 * base, util }` with the `c` and `util` each test names):
  - "seeds": loyal equals `r0`; plans, planTarget and payer are 0; acc is 62 at quality 50 and 71 at quality 80, clamped 30 to 90; intake 0.
  - "satisfaction and retention": gym at use .82 gives satisfaction .476, retention target .681 (within .001), loyalty demand exactly 1, and at the seed in expected mode `demand` exactly 1 with `income` and `costs` 0.
  - "client base repairs slowly": after a star leaves (`loyal = r0 - .08`) the gap to the retention target halves each yearly update (about .040, .020, .010, within .002), so 87.5% of it is repaired after three; loyalty demand reads the start-of-year value.
  - "plans": gym, target .4 from the seed, use .82, six chained years give demand 1, 1.0077, 1.0191, 1.0323, 1.0464, 1.0534 and `costs / base` .006, .012, .018, .024, .024, .024 (within .001). Through `sectorValue` with `c` .8 and `util` .5 the yearly net is negative in years 1 to 3 and positive from year 4. Plans cut the season swing by `1 - .6 * plans` (check in `'book'` mode at plans .6).
  - "payer mix": clinic at payer .4 gives demand x 1.22 and `costs / base` .1415 (within .002); with `acc` 80 or more the discount part is x .86; finance staff power 1 cuts denials by 25%; with `c` .78 the payer lever is worth more than 0 at `util` .7 and less than 0 at `util` .98; salon and petCare have `payer: null` and never bill payers.
  - "accreditation": the target is `62 + 25 * roleSkill + 20 * program + .2 * (quality - 50) - (use > .95 ? 6 : 0)`; below 50 demand x .93 and `capLoss` .05; 80 or more demand x 1.04; `careRoleMoves` is `acc` for clinic, education, petCare, homeCare and `ret` for gym, salon, autoShop.
  - "intake": use 1.0 with intake 1 gives `capLoss` .10 and with intake 2 gives .25; intake 0 gives 0; satisfaction uses `min(use, cap)`.
  - "history": clinic in the `us` in 2020 multiplies demand by .92 in `'book'` mode, and by 1 in `'expected'` mode with `g.year` 2019.
  - "mean-preserving": 400 fiscal years from 2000 per trade, each evaluated from the seed state at use .5 in `'book'` mode; mean demand within .97 to 1.02, mean cost within .995 to 1.02.
  - "cost floor": `accProgramCost` is 2,000 at `base` 10,000 and `level` 1, and 6,000 at `base` 1,000,000.
  - "12 years, finite" and purity as in Task 3, for all seven trades.
  - "header": for a gym at the seed with `b.last.sold` 3,444 the lines joined with a space are `About 3,444 clients, 68% come back. Plans 0%. Accredited, score 62. Payer mix 0%. Intake open.`, each line at most 140 characters; a salon has no payer line; with `acc` 45 the third line is `Provisional, score 45.`; with `planTarget` .4 and `plans` .1 the second is `Plans 10%, target 40%.`; a clinic with `g.year` 2020 ends with the `sectorHistoryLine`.
- [ ] **5.2 Run** `npx vitest run --maxWorkers=1 test/sector-care.test.ts`. Expected: fails with `Failed to resolve import "../src/game/business/sector-care"`.
- [ ] **5.3 Implement** the care table block and `sector-care.ts` per spec 4.3 "Yearly rule": satisfaction, retention target and loyalty, loyalty demand, plans, payer mix, accreditation, intake, program cost, `demand = loyaltyDemand * (1 + up * payer) * accTier * seasonPlan * history`.
- [ ] **5.4 Run** `npx vitest run --maxWorkers=1 test/sector-care.test.ts test/sector-core.test.ts`. Expected: all pass.
- [ ] **5.5 Regression:** as 3.5: `npx vitest run --maxWorkers=1 test/sector-state.test.ts test/business-expansion.test.ts` (about 18 s plus a few seconds).
- [ ] **5.6** `npm run typecheck`.
- [ ] **5.7 Commit.** `git add src/game/business/sector-care.ts src/game/business/sector-data.ts test/sector-care.test.ts`; message `feat: sector families: Care, Education and Personal Services state and math`; the two trailers; explicit pathspecs.

---

## Task 6: Care, Education and Personal Services, levers, events, copy (spec 4.3)

**Read first:** Task 4's `sector-food-play.ts` as the shape to follow; `presentDisaster` and its resolver in `events.ts` for how `b.insured` softens a cost (`covered = damage * .85`).

**Files:**
- Modify: `src/game/business/sector-care-play.ts` (replace the placeholder).
- Test: `test/sector-care.test.ts` (append `describe('care desk')`).

**Interfaces.**

Consumes: Task 5 outputs; Task 1 kit and state, and the test imports, as in Task 4 (the play file imports no other sector file).

Produces:

```ts
export const CARE_COPY: CopyTable
export const CARE_LEVERS: readonly LeverDef[]    // 'plans' (0, .2, .4, .6), 'payer' (0, .2, .4, .6; only trades with a payer row), 'intake' (0 Open, 1 Steady 90%, 2 Protected 75%), 'program' (paid, option 1)
export const CARE_EVENTS: readonly SectorEvent[] // accreditationReview, starLeaves, payerAudit, rush, incident, contractOffer, waitlist
export const CARE_MODEL: FamilyModel
```

Decisions:
- Choice ids: accreditationReview `prepare`, `bluff`, `time`; starLeaves `counter`, `release`, `enforce`; payerAudit `pay`, `contest`, `drop`; rush `temps`, `cap`, `ride`; incident `settle`, `fight`, `report`; contractOffer `sign`, `negotiate`, `decline`; waitlist `hours`, `small`.
- Weights from spec 4.3: payerAudit .8 when `payer > 0`, contractOffer .5 when `b.brand >= 30`, waitlist .4 when `loyal` is above `r0`.
- Review pass odds are `clamp(acc / 110 + bonus, .1, .97)` with bonus +.15 for `prepare` (which costs `accProgramCost`), +.05 for `time`, -.10 for `bluff`; a failed review sets `sec.add.acc = -12`.
- `starLeaves` `counter` costs `loyal` -.03 and `wage` +.02, `release` costs `loyal` -.08, `enforce` costs `loyal` -.08 and brand -5.
- `incident`: when `b.insured`, the cash cost is 15% of what it would be (insurance pays 85%, as the disaster event does).
- The care `rush` scene names the season by trade: gym January, education exam season, clinic and homeCare flu season, salon and petCare the holiday week, autoShop the first frost.
- Branch costs use `cx = sectorCtx(g, b, g.year)` inside `branches()`.

**Steps:**
- [ ] **6.1 Failing tests** (append):
  - "registers the care model": levers `plans, payer, intake, program`, 7 events; salon and petCare offer no `payer` lever and clinic does.
  - "levers through applyLever": plans set `planTarget` and the stock ramps by .10 a year; payer applies at once; `program` costs `accProgramCost` once, sets `st.program` and raises `acc` at the next hook.
  - "events are valid": `eventProblems` is `[]` in three probe states (seed; payer .4 with brand 60 and loyal above `r0`; acc 40); at acc 62 the review's `prepare` odds exceed `time`'s, which exceed `bluff`'s, each equal to `clamp(acc / 110 + bonus, .1, .97)`; the fail branch has `sec.add.acc` -12; `counter` loses less `loyal` (-.03) than `release` (-.08).
  - "gated by state": `payerAudit` weight 0 at payer 0; `contractOffer` weight 0 below brand 30; `waitlist` weight 0 when `loyal` is at or below `r0`.
  - "no free lever": with a synthetic `Worth` (`contrib` .78 * base, `util` .7 then .98) the best payer option by `leverValue` has a payer share above 0 at `util` .7 and is payer 0 at `util` .98 (clinic and gym).
  - "no generic double": clinic and gym, 3 seeds, 12 years: at most one popup whose `scriptId` is `sector.event` or starts with `business.ev.` per company-year, `sector.event` rate at most .30, finite numbers.
  - "copy keys" as in Task 4 with the `care.` prefix, at least 40 lines.
- [ ] **6.2 Run** `npx vitest run --maxWorkers=1 test/sector-care.test.ts`. Expected: the new tests fail with `expected null not to be null` on `modelOf('care')`.
- [ ] **6.3 Implement** `sector-care-play.ts`: copy table in the spec 4.5 style (for example `Your ${person} gave notice. ${n} regulars have booked with them at the new place. What will you do?`), levers, events, `CARE_MODEL`, `registerFamily(CARE_MODEL)`.
- [ ] **6.4 Run** `npx vitest run --maxWorkers=1 test/sector-care.test.ts test/sector-core.test.ts test/sector-events.test.ts test/sector-menu.test.ts`. Expected: all pass.
- [ ] **6.5 Regression** (gym, salon and education now run through the layer): `npx vitest run --maxWorkers=1 test/franchise.test.ts test/company-events.test.ts test/world2-business-supply.test.ts test/business-expansion.test.ts`. About 12 + 13 + 8 + 18 = 51 s.
- [ ] **6.6** `npm run typecheck`.
- [ ] **6.7 Commit.** `git add src/game/business/sector-care-play.ts test/sector-care.test.ts`; message `feat: sector families: Care, Education and Personal Services levers, events and copy`; the two trailers; explicit pathspecs.

---

## Task 7: Utilities, Land and Fleets, state and math (spec 4.4)

**Read first:** Task 3's `sector-food.ts`; `nationalMarket` in `dynamics.ts` (`events.costs` is what the hedge offsets); `history/market-events.ts` `MARKET_EVENTS` (`oil1973`, `oilGlut`); `bookSupply` in `supply.ts` (farm already reads `capacityLoss` as capacity, so weather needs no profile).

**Files:**
- Create: `src/game/business/sector-util.ts`.
- Modify: `src/game/business/sector-data.ts` (util block only).
- Test: `test/sector-util.test.ts`.

**Interfaces.**

Consumes: Task 1 kit and state (`UtilState`, `seasonIndex`, `readYear`, `roleSkill`); `nationalMarket` (`dynamics.ts`); `pct` (`util.ts`).

Produces:

```ts
// sector-data.ts, util block
export interface UtilRow { wear: number; hits: 'capacity' | 'cost'; amp: number; floor: number; spot: number; vol: number; disc: number; fuel: number; overhaul: number; sla: boolean }
export const UTIL: Readonly<Record<'energy' | 'solar' | 'water' | 'telecom' | 'dataCenter' | 'farm' | 'logistics', UtilRow>>   // the spec 4.4 table
// sector-util.ts
export function utilRow(industry: string): UtilRow | null
export function outageP(condition: number, bad: number, roleSkillValue: number): number   // clamp(.03 + max(0, 65 - cond) / 180 + .05 * bad, .02, .45) * (1 - .5 * skill)
export function outageSize(condition: number): number                                      // min(.5, .15 + .35 * (1 - cond / 100))
export function overhaulCost(b: BizState, row: UtilRow, cx: SectorCtx): number            // max(row.overhaul * base, 2000 * level)
export function contractOptions(floor: number): number[]                                   // floor, floor + .25 ... below 1, then 1
export function spotSettlement(row: UtilRow, st: UtilState, index: number): number         // (1 - contract) * vol * index, a share of base
export function utilSeed(g: GameState, a: Asset, b: BizState, since: number): UtilState
export function utilFx(g: GameState, a: Asset, b: BizState, st: UtilState, fiscal: number, mode: FxMode, cx: SectorCtx): SectorFx
export function utilHeader(g: GameState, b: BizState, st: UtilState | null): string[]
```

Decisions:
- In `'book'` mode an outage hits when `(seasonIndex(g, a, fiscal, 'out') + 1) / 2 < P`; in `'expected'` mode the outage loss is the expectation `P * size` and the repair and SLA costs are `P` times their amounts.
- The repair cost `.8 * overhaulCost` and the SLA cost (1.5% of base for SLA trades) are random flows (`randCosts`). Spot settlement is split into `randIncome` (positive) and `randCosts` (negative) and is 0 in `'expected'` mode.
- Weather uses `bad = max(0, -idx)` and `good = max(0, idx)` of `seasonIndex(..., 'wx')`, both 0 in `'expected'` mode. Cover scales every weather hit by `1 - .5 * cover`.
- `outages` is the 3-bit history `((outages << 1) | hit) & 7`; the header counts its set bits. `regulated` in the header is the table `floor`.
- Header lines, in order: `Condition ${round(condition)}. ${n} outage in 3 years.` (`outages` when n is not 1); for a trade with spot vol above 0 `Contract ${pct(contract)}, regulated ${pct(floor)}.`, otherwise `Regulated ${pct(floor)}.`; `Hedge ${pct(hedge)}.` only when `fuel > 0`; `Weather cover on.` or `Weather cover off.`.
- Hedge reads `nationalMarket(g, b.industry, b.countryId, readYear(g, fiscal, mode)).events.costs`. `utilFx` writes no demand multiplier (`demand` 1).
- The `wear` column is the one calibration knob: tests read it from `UTIL` and never hard-code it, so Task 9 can retune rows without rewriting tests.

**Steps:**
- [ ] **7.1 Failing tests** (`test/sector-util.test.ts`, `describe('util math')`; hand-made `cx = { use: .8, base: 8_600_000, level: 1, going }`):
  - "seeds": condition is `clampN(80 - min(25, 2 * (since - b.founded)), 40, 95)` (80 for a new company, 55 at 13 years or more); `contract = max(floor, 1 - spot)` gives energy .5, solar .6, water 1, telecom 1, dataCenter .7, farm .2, logistics .5; hedge 0, cover 0, outages 0.
  - "outage odds and size": `outageP(80, 0, 0)` .03; `outageP(60, 0, 0)` .0578 (within .0001); `outageP(60, 1, 1)` .0539; `outageP(0, 1, 0)` .441; never above .45 or below .02; `outageSize(60)` .29 and `outageSize(0)` .5.
  - "condition": energy unattended falls by its table `wear` a year; with a skill-1 Reliability Engineer by `wear - 4`; an overhaul year uses `condition + 12` for the odds and then decays from it; condition stays within 0 to 100.
  - "overhaul": the cost for energy at base 8.6M is 172,000 (floor `2000 * level` for tiny bases). At condition 60 it cuts the expected output loss by about .009, .018, .024 over the next three years when the table wear is 5 (within .003; derive the expectation from the table when wear differs). With a synthetic `Worth` (`contrib` .8 * base, `cogs` .19 * base, `util` 1) its `leverValue` is above 0 at conditions 55 and 60, below 0 at 75 and 85, and never increases across 40 to 90 in steps of 5. With `util` .7 the same overhaul is worth less than with 1 (spare capacity absorbs outages).
  - "weather": capacity trades lose `amp * bad * (1 - .5 * cover)` of capacity and a good year cuts unit cost by `.5 * amp * good`; dataCenter takes cost `1 + amp * bad`; `capLoss` combines weather and outage as `1 - (1 - w) * (1 - o)`; cover costs `.006 * base`.
  - "spot and contract": `spotSettlement(row, st, 1)` equals minus `spotSettlement(row, st, -1)` and for energy at contract .5 is .09; contract 1 gives no spot flows; moving off the seed mix earns or pays `(contract0 - contract) * disc * base`; water and telecom have no spot options; `contractOptions(.5)` is `[.5, .75, 1]`, `contractOptions(.3)` is `[.3, .55, .8, 1]`, `contractOptions(0)` is `[0, .25, .5, .75, 1]`.
  - "hedge": logistics (fuel .40) with hedge .8 in the `us`: fiscal 1974 (`events.costs` 1.18) gives cost factor .9424, fiscal 2015 (.92) gives 1.0256, fiscal 2030 (1.0) gives 1; the premium is `.025 * .8 * .40 * base`; solar and telecom have fuel 0.
  - "mean": 400 fiscal years from 2000 at seed levers: `demand` exactly 1 for every trade; mean cost within .01 of the analytic mean (`1 - .5 * amp * .25` for capacity trades, `1 + amp * .25` for dataCenter). For farm, solar, water and logistics that sits outside the .995 to 1.02 band of food and care, by design (a storm year costs capacity, a mild one saves a little); mean `capLoss` at most `amp * .25 + .06`.
  - "12 years, finite" and purity for all seven trades; an unattended energy plant never leaves the bounds.
  - "header": for an energy plant at the seed the lines joined with a space contain `Condition 80. 0 outages in 3 years.` and `Contract 50%, regulated 50%. Hedge 0%. Weather cover off.`, each line at most 140 characters; a solar company has no hedge line, a water company reads `Regulated 80%. Weather cover off.`, and `outages` 1 reads `1 outage in 3 years.`.
- [ ] **7.2 Run** `npx vitest run --maxWorkers=1 test/sector-util.test.ts`. Expected: fails with `Failed to resolve import "../src/game/business/sector-util"`.
- [ ] **7.3 Implement** the util table block and `sector-util.ts` per spec 4.4 "Yearly rule": condition, outage, weather, spot and contract, hedge, overhaul, cover.
- [ ] **7.4 Run** `npx vitest run --maxWorkers=1 test/sector-util.test.ts test/sector-core.test.ts`. Expected: all pass.
- [ ] **7.5 Regression:** as 3.5: `npx vitest run --maxWorkers=1 test/sector-state.test.ts test/business-expansion.test.ts` (about 18 s plus a few seconds).
- [ ] **7.6** `npm run typecheck`.
- [ ] **7.7 Commit.** `git add src/game/business/sector-util.ts src/game/business/sector-data.ts test/sector-util.test.ts`; message `feat: sector families: Utilities, Land and Fleets state and math`; the two trailers; explicit pathspecs.

---

## Task 8: Utilities, Land and Fleets, levers, events, copy (spec 4.4)

**Read first:** Task 4's `sector-food-play.ts`; `presentDisaster` and `presentSupplier` in `events.ts` (a cost shock and a capacity loss as `BizFx`).

**Files:**
- Modify: `src/game/business/sector-util-play.ts` (replace the placeholder).
- Test: `test/sector-util.test.ts` (append `describe('util desk')`).

**Interfaces.**

Consumes: Task 7 outputs; Task 1 kit and state, and the test imports, as in Task 4 (the play file imports no other sector file).

Produces:

```ts
export const UTIL_COPY: CopyTable
export const UTIL_LEVERS: readonly LeverDef[]    // 'overhaul' (paid, option 1), 'contract' (contractOptions; trades with spot vol above 0), 'hedge' (0, .5, .8; trades with fuel above 0), 'cover' (0, 1)
export const UTIL_EVENTS: readonly SectorEvent[] // storm, rateCase, fuelSpike, subsidy, bigCustomer, shortage, recall
export const UTIL_MODEL: FamilyModel
```

Decisions:
- Choice ids: storm `crews`, `degraded`, `power`; rateCase `file`, `accept`, `settle`; fuelSpike `hedge`, `pass`, `absorb`; subsidy `apply`, `skip`; bigCustomer `discount`, `release`, `lock`; shortage `raise`, `temps`, `cut`; recall `replace`, `wait`.
- Weights from spec 4.4: storm `1 + max(0, 65 - condition) / 50` (1.5 at condition 40); rateCase .8 when the trade's `floor >= .5`; fuelSpike .7 when `fuel > 0`; subsidy .5 for energy, solar, water, farm; bigCustomer .6 for dataCenter, telecom, logistics; shortage .6 for logistics, farm, dataCenter; recall .4.
- `storm`: `crews` pays and avoids most of the capacity loss, `degraded` keeps the money and loses capacity and condition, `power` pays more and loses neither.
- `fuelSpike` `hedge` sets `sec.set.hedge` to .5 only when it is lower, and then its branch cost shock is lower than `absorb`'s; when `st.hedge` is already .5 or more it protects nothing extra, so its cost shock equals `absorb`'s and it still pays the premium.
- Telecom copy mentions broadband only when `bizHas(g, b.countryId, 'internet')`; every scene passes `eraFits`.
- Branch costs use `cx = sectorCtx(g, b, g.year)` inside `branches()`.

**Steps:**
- [ ] **8.1 Failing tests** (append):
  - "registers the util model": 4 levers and 7 events; water and telecom offer no `contract` lever, solar and telecom no `hedge`, energy all four.
  - "levers through applyLever": overhaul costs `overhaulCost` once and sets `st.overhaul`; after the next hook the condition is the old value plus 12 minus `wear`; hedge and cover are free to change once a year and cost their premium in the hook (a ledger row with costs above 0).
  - "events are valid": `eventProblems` is `[]` in three probe states (seed; condition 40 with hedge .5; contract 1); `storm` weight is higher at condition 40 than at 80; the `hedge` choice of `fuelSpike` beats `absorb` by expected value when `st.hedge` is 0 and does not when it is already .8.
  - "no free lever": with the synthetic `Worth` of 7.1 (`util` 1) the best overhaul option by `leverValue` is "do it" at condition 60 and "leave it" at 85 (energy and logistics).
  - "no generic double": energy and farm, 3 seeds, 12 years: at most one popup whose `scriptId` is `sector.event` or starts with `business.ev.` per company-year, `sector.event` rate at most .30, finite numbers.
  - "copy keys" as in Task 4 with the `util.` prefix, at least 40 lines.
- [ ] **8.2 Run** `npx vitest run --maxWorkers=1 test/sector-util.test.ts`. Expected: the new tests fail with `expected null not to be null` on `modelOf('util')`.
- [ ] **8.3 Implement** `sector-util-play.ts`: copy table in the spec 4.5 style (`A storm took out two lines overnight. The crews need a decision by noon. What will you do?`), levers, events, `UTIL_MODEL`, `registerFamily(UTIL_MODEL)`.
- [ ] **8.4 Run** `npx vitest run --maxWorkers=1 test/sector-util.test.ts test/sector-core.test.ts test/sector-events.test.ts test/sector-menu.test.ts`. Expected: all pass.
- [ ] **8.5 Regression** (energy, logistics, solar, water, telecom and dataCenter now run through the layer): `npx vitest run --maxWorkers=1 test/economy-sectors.test.ts test/market-events.test.ts test/world2-business-supply.test.ts test/business-expansion.test.ts`. About 3 + 13 + 8 + 18 = 42 s.
- [ ] **8.6** `npm run typecheck`.
- [ ] **8.7 Commit.** `git add src/game/business/sector-util-play.ts test/sector-util.test.ts`; message `feat: sector families: Utilities, Land and Fleets levers, events and copy`; the two trailers; explicit pathspecs.

---

## Task 9: Story, voice, regression (spec 6, 7)

**Read first:** `docs/VOICE.md`, `unitFlags` and `LIMITS` in `scripts/voice/rules.mjs`, `test/heavy-voice.test.ts` (the copy test style), `test/heavy-story.test.ts` and `years()` in `test/ceo.test.ts` (the story style).

**Files:**
- Create: `test/sector-story.test.ts`, `test/sector-voice.test.ts`.
- Modify: none, except table rows in `src/game/business/sector-data.ts` or a copy table in a play file if a test demands it (say which in the commit message).
- Test: the two new files, then the regression set.

**Interfaces.**

Consumes: everything above; `drain, adult, company` (`test/market-kit.ts`); `deskGame, playYear, inert, managedDesk` (`test/sector-kit.ts`); `unitFlags, staticLength, LIMITS` (`scripts/voice/rules.mjs`); `registeredModels, copyLines` (kit); `MENU_COPY`, `CEO_COPY`, `SECTOR_ROLES`; `letterWords` (`career.ts`).

Produces: two test files, no source.

**Steps:**
- [ ] **9.1 Failing tests.**
  - `test/sector-story.test.ts`, one `it` per family with a 300,000 ms timeout (expect 2 to 4 minutes in total).
    - Arm A (owner-run, never touches a lever): for each trade, seeds 1 to 3, 12 years from 2024 with `deskGame` and `playYear`, once with the layer and once with `inert(b)` before year 1 (same seed). Per trade: every number of the company is finite; the median over the three seeds of the 12-year sum of `history[].profit` with the layer over the same sum without it is within .90 to 1.10 for food and care and within .70 to 1.05 for util (an unattended plant decays by design, spec 4.4); the layer run's final cash is at most 25% of the control's 12-year revenue below the control's final cash (no cash spiral caused by the layer alone).
    - Arm B (a hired CEO of skill 90 on both runs, `managedDesk`): restaurant, clinic, energy, seeds 1 and 2, 10 years, ratio within .90 to 1.12.
  - `test/sector-voice.test.ts`: for every model in `registeredModels()`, every `copyLines` entry, plus `MENU_COPY`, `CEO_COPY` and every `SECTOR_ROLES` blurb:
    - holes `${name}` become `${...}` before measuring (`staticLength` only strips `${...}`); `staticLength` is within `LIMITS` for its role (scene 140, outcome 120, log 90, tooltip 120), and a `title` (`.head`) is at most 40 characters;
    - `unitFlags(text, role)` without `'over-aim'` is `[]`, labels are at most 5 words, scenes end with `What will you do?`, no string is over 180 characters; CEO lines (`CEO_COPY`) are at most 12 words by `letterWords` with `${option}` filled by the longest option label of the registered families and `${money}` by `$99.9M`; each model's `header(...)` lines for a seed record of each of its trades pass `unitFlags(line, 'text')` with no flag and are at most 140 characters;
    - no string contains U+2014, and the text of every `src/game/business/sector-*.ts` file contains neither U+2014 nor a unicode escape for it (the pattern `/\\u\{?0*2014\}?/i`).
- [ ] **9.2 Run** `npx vitest run --maxWorkers=1 test/sector-voice.test.ts`, then `npx vitest run --maxWorkers=1 test/sector-story.test.ts`. Expected on a first run: the voice test fails only where a family wrote a string over a cap or kept a banned phrase; the story test fails only where a trade's table row drifts.
- [ ] **9.3 Fix** whatever 9.2 reports. Copy fixes go in the play file's table. Drift fixes go in the trade's row in `sector-data.ts`, `wear` first for util, never a formula; when the drift traces to one event (compare the ledger and the event notices of a failing seed), tune that branch's cash in the play file instead. Re-run only the failing `it`. Record the changed rows in the commit message.
- [ ] **9.4 Run** both new files again. Expected: all pass.
- [ ] **9.5 Regression, once.** The legacy set of spec 7: `npx vitest run --maxWorkers=1 test/business-expansion.test.ts test/business-save-normalization.test.ts test/business-venues.test.ts test/franchise.test.ts test/ceo.test.ts test/ceo-letter-voice.test.ts test/company-dashboard.test.ts test/world2-business-supply.test.ts test/heavy-data.test.ts test/voice-guards.test.ts test/save-schema.test.ts`. About 18 + 6 + 7 + 12 + 58 + 27 + 20 + 8 + 7 + 4 + 18 = 185 s.
  - Only if that is green, the suites most likely to need a new seeded baseline because the event roll moves the random stream for these trades: `npx vitest run --maxWorkers=1 test/growth.test.ts test/business.test.ts test/company-events.test.ts test/board.test.ts test/talent-business.test.ts test/market-events.test.ts test/economy-sectors.test.ts test/year-integration.test.ts`. About 23 + 23 + 13 + 21 + 92 + 13 + 3 + 8 = 196 s.
  - A failure there is re-baselined only when the assertion is a seeded number, never an invariant; say which in the commit message.
- [ ] **9.6** `node scripts/voice-report.mjs --json` and confirm `emDash` is 24 and `long` is 436, then `npm run typecheck`.
- [ ] **9.7 Commit.** `git add test/sector-story.test.ts test/sector-voice.test.ts` plus any table file named in 9.3; message `test: sector families story and voice`; the two trailers; explicit pathspecs.

---

## Self-review (done when this plan was written)

- **Spec coverage:** 4.1 framework (Tasks 1, 2), 4.2 Food (3, 4), 4.3 Care (5, 6), 4.4 Utilities (7, 8), 4.5 copy and history (1, 4, 6, 8, 9), 5 deferred families (nothing built), 6 balance guards (mean-preserving, no free lever, bounds and no foresight in Tasks 1 to 8, story and cash spiral in 9), 7 tests (every file named), 8 risks (seeded drift in 9.5, hot-file hunks in the constraints, role count in Task 1, event load in Task 2).
- **Roadmap invariants:** no foresight (Review 3, `readYear`), deterministic (constraint and the `g.rng` tests), conservation (Review 1), authorization (Review 4), save compatibility (constraint, Review 5), idempotence (Review 2), pure presentation (Task 2 menu test), bounded state (Review 5), truthful copy (Task 2 header lines, Task 9 voice), honest purple hints (Task 2 hint-equals-resolver test).
- **Departures from the spec, for the reviewer:**
  - `sector-kit.ts` and `sector-families.ts` are new files, and `seasonIndex`, `roleSkill`, `baseRevenue` live in the kit, so no family file imports `sector-core.ts` back (no import cycle).
  - `SectorFx` carries `randIncome` and `randCosts` instead of one signed swing, so the ledger shows gross random money.
  - `UtilState.outages` is a 3-bit history. Care roles move `acc` or `ret` by their focus.
  - Review aligned the spec to the formulas: grade A at the third update, an unattended plant below condition 65 in 3 to 5 years (so the util story arm is wider, .70 to 1.05, and `wear` is the first knob in Task 9), and the mean-cost band .995 to 1.02 for food and care with an analytic mean for weather trades.
  - Review changes: `sectorOwnsEvent` needs a live record, so the observation year keeps the generic inspection and critic and books as v3.0.0; no `housing2008` autoShop row (autoShop is already mapped to `fuel`); family events use `wage`, not `payroll`; `Branch.vals` fills outcome holes; `applySec` is the pure half of `applySectorFx`; the clashing names `applyFx`, `inspectionFine`, `programCost`, `HISTORY` became `applySectorFx`, `kitchenFine`, `accProgramCost`, `SECTOR_HISTORY`.
  - Expected mode reads market history only up to `g.year` (`readYear`), which the spec implies but does not name.
  - Copy lives in per-family `CopyTable`s so the voice test measures exactly what the game prints.
- **Known risks, not fixed here:** valuation does not read condition, so selling a run-down plant is not penalised (bounded by the outage cap); the spot lever has a small positive expectation by design (a risk premium) with swings capped at 12% of base; one extra role raises `maxKeyStaff` for small multi-site companies; about 150 new strings need one human pass beyond the tests.
