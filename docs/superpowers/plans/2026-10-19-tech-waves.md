# Tech Waves Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When something breakthrough-class happens, move the company markets together the way real life would (demand, costs, valuation, deep-tech VC heat, rivals), for the player's, NPC and rival companies.

**Architecture:** A wave record (`TechWave` in `g.flags.techWaves`) plus a static history table feed one pure reaction formula (`waveFactors`). Writers (heavy launches, deep-tech milestones, Workshop firsts, seeded rival landings) call one idempotent `announceWave`. Readers apply the factors at the spots the market events already use (`marketCtxFor`, `nationalMarket`, `valuationOf` through a stamp, `industryCycle`, `advanceRivals`), each with its own clamp and none inside a cache that lacks game state.

**Tech Stack:** TypeScript (strict, `noUnusedLocals`), Vitest, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-19-tech-waves-design.md`. Release 1 only (no stocks, release notes, version bump or full run: those are integration, v4.0.0). **Where this plan and the spec differ, the plan wins**; spec section 11 repeats D1-D22 and lists the few choices beyond them (entrants through `waveNewcomers`, the history-kind refusal in `announceWave`, the 2-a-year cap, the 0.85 stall, the `waveScrutiny` clamp, `nextState`, `historyFactors`).

## Decisions that override the spec (cited by number in the tasks)

- D1 Wave id `${source}:${kind}:${year}:${hashOf(origin).toString(36)}`; origin: heavy `${heavyKey}#${family}`, deeptech `${assetId}#${milestone}`, workshop and race the IdeaDef id, rival `${trade}|${market}`. `announceWave(g, { kind, source, origin, name, size, market, year?, home? })` is idempotent (returns the stored wave); news ids are no guard (MarketNews keeps 20).
- D2 `TechWave.skip?: string` replaces `skipCore`: source 'heavy' only, the one trade whose demand term is skipped (in the wave's own market, where the record lives). Costs are never skipped. D3 Reach: market 'world' is reach 1 everywhere; a country wave is 1 at home and `0.35 + 0.4 x delivery` elsewhere; history rows carry their own reach. World-scope trades take history demand at x 1/3; dynamic waves are undamped.
- D4 Demand only in `marketCtxFor` (`clampN(heavyPulse x wave.demand, 0.45, 1.8)`, after `buildCtx`, on the spread copy); costs only in `nationalMarket` (`clampN(events.costs x wave.costs, 0.75, 1.5)`); value in `valuationOf` (`clampN(eventValue x wave.v, 0.3, 3)`) and, for deep tech, `industryCycle`'s `wave` echo (value only, seed unchanged).
- D5 Pure `waveFactors(trade, market, year, waves, base?, worldMarket = false)`; `waveFactorsFor(g, trade, market, year)` adds `techBase` and returns a shared frozen neutral. `readTechWaves` caches by raw array identity and length; a memo per (trade, market, year) hangs off the validated list. D6 `techBase` keys are `${trade}|${market}`, demand 0.8-1.5, costs 0.8-1.0, folded at the wave's own market.
- D7 `history/tech-waves.ts` exports `HISTORY_WAVES`, `waveAt`, `historyWaveStates` (type-only import from `business/tech-wave-data`, a pure leaf). Drafts: `/tmp/claude-0/-home-user-snag/91204518-72c3-5880-a3f8-357fc9b44d53/scratchpad/tech-waves-research/draft-tech-wave-data.ts.txt` and `draft-history-tech-waves.ts.txt` (strip the leading `SOURCE ...` line).
- D8 `advanceTechWaves(g)` runs at the END of `yearlyBusinessImpl` and on its `list.length === 0` return, once a year behind `last`. `landRivalWaves(g)` is a new `YEARLY_HOOKS` entry (ageUp only), only for year > `PRESENT_YEAR` (2026), so `nextYear` fixtures never see rival waves. D9 `advanceRivals` computes the wave factors and passes them to `advanceActor` as a trailing parameter, non-real rivals only.
- D10 `BizState.wave?: { v: number; y: number }`, written by `stampWave(g, b, fiscal)` when a classic company's year is booked; never for deep tech or `b.public`. History waves are read directly in `valuationOf`. The reader validates (bizOf does not re-normalize a current record). D11 Delivery: heavy = `heavyLevel(rec, year).adoption`; deeptech = the lab's market share / 0.25 clamped 0-1 (seeded path if the asset is gone); workshop, race, rival = `0.08 + 0.22 u` with a 25% stall, `u` from `seeded` and `outcomeTag`.
- D12 News: none for heavy, workshop, race. Deeptech and rival post MarketNews `wave-${id}` only when they touch a player company's trade or came from the player; deeptech also queues one notice. D13 `waveLines` is pure: at most 1 line in the Annual Report (clamp 400 to 520), 3 rows in Market Overview; two sentences, no new em-dash; every line passes `anachronismsIn` or is skipped.
- D14 `RdResult` gains `won` and `approved`; `afterResearch` writes from `DEEPTECH_WAVES` (`${trade}:${programId}`); at most 2 non-rival waves a year. D15 `WORKSHOP_WAVES` per IdeaDef id ('workshop' = history firsts, 'race' = future wins, market 'world', size 0.2-0.6, no macro feed). D16 `HEAVY_WAVES` keys `trade|Catalogue Name`, heavy-eligible trades only, hook inside `advanceHeavy`.
- D17 Macro feed `recordEconomicActivity(g, 'wave:${id}:${year}', home, coreTrade, { innovation: min(0.3, 0.1 x size x gain) })`, not for workshop or race. D18 `antitrustOf` multiplies its chance by `waveScrutiny`; `antitrustChance` is unchanged. D19 `SAVE_SCHEMA` (core.ts) stays 2. D20 Stocks stay wave-free; `waveWorldFlags` never emits 'market.news'. D21 No existing test changes. D22 No release notes, bump or full run.

## Global Constraints

- Clamps: value 0.3-3, demand 0.45-1.8, costs 0.75-1.5 (`FACTOR_BOUNDS`); `techBase` demand 0.8-1.5, costs 0.8-1.0; at most 64 waves (`MAX_WAVES`); wave ids at most 100 characters.
- `SAVE_SCHEMA` stays 2; `techWaves`, `techBase` and `BizState.wave` are optional, bounded and validated on read; a life without them stores nothing and stays byte-identical.
- `Json` has no `undefined`: optional fields use conditional spreads (`...(x ? { x } : {})`). Use `clampN` (`src/game/business/util.ts`), never core.ts `clamp`.
- No `g.rng`, `rand`, `chance`, `uid` or `Math.random` in wave code; draws come from `seeded(...)` keyed by `familyId(g.lifeId)` plus `outcomeTag(g, year)`; reads never write; writers replace the array or object, never edit in place; readers take `Pick<GameState, 'flags'>`.
- Import direction: `history/` imports only types from `business/`; `tech-wave-data.ts` has `import type` imports only (no runtime import, so no `clampN` there: use `Math.min`/`Math.max`) and exports constants plus small pure lookups; `tech-waves.ts` does no top-level work that calls a cycle module; `state.ts` never imports `tech-waves.ts`.
- VOICE (`docs/VOICE.md`, `scripts/voice/rules.mjs`): two short sentences, never a colon join, never end on a 1-3 word sentence, contractions, minus sign U+2212; **no new em-dash literal anywhere in src** (`voice-guards` caps at 24, exactly 24 today); caps log 90, outcome 120, scene 140 static characters.
- Per task run only `npm run typecheck` (must pass at each task end, about 12 s) and the vitest files named in that task, in one `npx vitest run <files>` call; never the full suite. If an existing test fails in a game year 1946-2024 with a trade in a wave role, a live history wave is the cause: stop and report the test and the delta, do not edit the test.
- All tasks and reviews run on Sonnet (project `CLAUDE.md`); never parallel Opus. Every commit message ends with these two lines after a blank line: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01Tq5bMwVNBuT54ZtqpiXV13`.

## Review Focus

Inputs the spec implies that no feature test would hit by default, most likely first; each is pinned by the named test.

1. A life with no company (every new life): the yearly hook and `advanceTechWaves` write nothing (no empty `techWaves`/`techBase`, no news) and `JSON.stringify(g)` equals a twin without the hook (Task 3, `a life with no company is byte-identical`).
2. A malformed or hostile saved `techWaves`, `techBase` or `BizState.wave` (non-list, kind `constructor`, NaN, 1,000,000 entries, a future `last`, a raw v2 record with a damaged stamp): reads empty or clamped, never throws, never writes (Task 2 readers, Task 4 `BizState.wave on load`, Task 3 heirs).
3. An heir inheriting waves: carried validated, damage repaired, flood capped, no duplicate `market.news`, same draws through `familyId` (Task 3 `heirs`, Task 2 `waveDraw`).
4. A wave whose originating company was sold or died, or whose heavy record is gone: delivery falls back to the seeded path and nothing throws (Task 2, `the seeded path ... is also the fallback`).
5. A Time Machine fork rerolling the unfinished year: a finished year keeps its draw, the unfinished year rerolls, restored flags win (Task 3, `time machine`).

## Task 1: Data tables and the history table

**Files:**
- Create: `src/game/business/tech-wave-data.ts`, `src/game/history/tech-waves.ts`
- Test: `test/tech-wave-data.test.ts`

**Interfaces:**
- Consumes: `INDUSTRY_IDS` (`src/game/data/markets.ts`), `COUNTRIES` (`src/game/world.ts`).
- Produces: `tech-wave-data.ts`: `WaveKindDef`, `WAVE_KINDS` (23 kinds), `type WaveKind`, `isWaveKind(k: unknown): k is WaveKind` (own keys only). `history/tech-waves.ts`: `WavePoint`, `HistoryWave`, `HISTORY_WAVES` (11 rows), `waveAt(w: HistoryWave, year: number): { hype: number; delivery: number } | null`, `HistoryWaveState { id; kind; name; size; hype; delivery; reach }`, `historyWaveStates(country: string, year: number): HistoryWaveState[]` (`country` is a country id or the market key `'world'`), `historyKindActive(kind: string, year: number): boolean`.

- [ ] **Step 1: Write the failing test** `test/tech-wave-data.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { INDUSTRY_IDS } from '../src/game/data/markets'
import { COUNTRIES } from '../src/game/world'
import { WAVE_KINDS, isWaveKind } from '../src/game/business/tech-wave-data'
import { HISTORY_WAVES, historyKindActive, historyWaveStates, waveAt } from '../src/game/history/tech-waves'

const TRADES: ReadonlySet<string> = new Set(INDUSTRY_IDS)
const KINDS = ['ai', 'chips', 'drug', 'space', 'ev', 'automation', 'quantum', 'security', 'fusion', 'neuro', 'drones', 'carbon',
  'transistor', 'television', 'microcomputer', 'mobilephone', 'smartphone', 'cloud', 'solarbattery', 'reusablerocket', 'evboom', 'mrna', 'glp1']
const EM_DASH = /—|–/

describe('WAVE_KINDS', () => {
  it('has the 23 kinds, real trades, one role per trade per kind, a core each, unique labels and emojis, own keys only', () => {
    expect(Object.keys(WAVE_KINDS).sort()).toEqual([...KINDS].sort())
    const defs = Object.values(WAVE_KINDS)
    for (const d of defs) {
      const all = [...d.core, ...d.supply, ...d.disrupted]
      expect(d.core.length).toBeGreaterThan(0); expect(new Set(all).size).toBe(all.length); expect(EM_DASH.test(d.label)).toBe(false)
      for (const t of all) expect(TRADES.has(t)).toBe(true)
    }
    expect(new Set(defs.map((d) => d.label)).size).toBe(23); expect(new Set(defs.map((d) => d.emoji)).size).toBe(23)
    for (const k of ['constructor', '__proto__', 'toString', '', 7]) expect(isWaveKind(k)).toBe(false)
    expect(isWaveKind('ai')).toBe(true)
  })
})

describe('HISTORY_WAVES', () => {
  it('has 11 well-formed rows', () => {
    expect(HISTORY_WAVES).toHaveLength(11)
    const ids = new Set(COUNTRIES.map((c) => c.id))
    for (const w of HISTORY_WAVES) {
      expect(w.id).toBe('hist:' + w.kind); expect(isWaveKind(w.kind)).toBe(true); expect(w.size).toBeGreaterThan(0); expect(w.size).toBeLessThanOrEqual(1)
      expect(w.home.every((c) => ids.has(c))).toBe(true); expect(EM_DASH.test(w.name + w.source)).toBe(false)
      const p = w.points, last = p[p.length - 1], prev = p[p.length - 2]
      expect(p[0][2]).toBeLessThanOrEqual(0.2); expect([last[1], last[2]]).toEqual([0, 0]); expect(prev[1]).toBeLessThanOrEqual(0.6); expect(prev[2]).toBeLessThanOrEqual(0.55)
      p.forEach((q, i) => { if (i) { expect(q[0]).toBeGreaterThan(p[i - 1][0]); if (q[0] - p[i - 1][0] === 1) for (const k of [1, 2]) expect(Math.abs(q[k] - p[i - 1][k])).toBeLessThanOrEqual(0.6) } })
    }
  })
  it('waveAt is null outside the years and zero on the closing year, the table is quiet in 1962-1974, 2001-2005 and 2025 on, and historyKindActive follows the rows', () => {
    const tv = HISTORY_WAVES.find((w) => w.kind === 'television')!
    expect([waveAt(tv, 1945), waveAt(tv, 1962), waveAt(tv, NaN)]).toEqual([null, null, null]); expect(waveAt(tv, 1961)).toEqual({ hype: 0, delivery: 0 })
    for (const y of [...Array.from({ length: 13 }, (_, i) => 1962 + i), ...Array.from({ length: 5 }, (_, i) => 2001 + i), ...Array.from({ length: 21 }, (_, i) => 2025 + i)]) expect(historyWaveStates('us', y)).toEqual([])
    expect([historyKindActive('television', 1950), historyKindActive('television', 1965), historyKindActive('ai', 2030)]).toEqual([true, false, false])
  })
  it('1950 has transistor and television; reach is home 1, the row\'s abroad value, or 0.35 + 0.4 x delivery; a world market sees all of it', () => {
    const s = (c: string, y: number, k: string) => historyWaveStates(c, y).find((x) => x.kind === k)!
    expect(historyWaveStates('us', 1950).map((x) => x.kind).sort()).toEqual(['television', 'transistor']); expect(s('us', 1950, 'television').name.length).toBeGreaterThan(0)
    expect([s('us', 1950, 'television').reach, s('br', 1950, 'television').reach]).toEqual([1, 0.25]); expect(s('br', 2012, 'cloud').reach).toBeCloseTo(0.35 + 0.4 * 0.65, 2)
    for (const x of historyWaveStates('world', 2011)) expect(x.reach).toBe(1)
  })
})
```

- [ ] **Step 2: Run it to see it fail:** `npx vitest run test/tech-wave-data.test.ts`. Expected: FAIL, "Failed to resolve import ../src/game/business/tech-wave-data".
- [ ] **Step 3: Copy the two drafts into the tree** (strip each leading `SOURCE ...` line), then edit the history file: `HistoryWaveState` gains `name` (the row's `name`); `historyWaveStates` gives every row `reach: 1` when `country === 'world'`; add `historyKindActive(kind, year)` (true when a row of that kind has `waveAt(row, year)` non-null with hype or delivery above 0). Change nothing else: the drafts' 23 kinds, 11 rows, control points, `home` lists and `abroad` values already satisfy every assertion above, so a failing assertion means a copy error, not a number to tune.
- [ ] **Step 4: Run it to see it pass:** `npx vitest run test/tech-wave-data.test.ts`. Expected: all PASS.
- [ ] **Step 5: Regression.** `npm run typecheck`, then `npx vitest run test/market-events.test.ts test/voice-guards.test.ts` (9.5 s + 2.5 s; the em-dash count must stay 24).
- [ ] **Step 6: Commit**
```bash
git add src/game/business/tech-wave-data.ts src/game/history/tech-waves.ts test/tech-wave-data.test.ts
git commit -m "feat(waves): wave kinds and the history table" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Tq5bMwVNBuT54ZtqpiXV13"
```

## Task 2: The core module (types, readers, announce, factors, advance)

**Files:**
- Create: `src/game/business/tech-waves.ts`
- Modify: `src/game/history/market-events.ts` (export `FACTOR_BOUNDS`)
- Test: `test/tech-waves.test.ts`

**Interfaces:**
- Consumes: Task 1 exports; `seeded` (`src/game/assets.ts`), `outcomeTag` (`src/game/timeMachine.ts`), `familyId` (`src/game/business/competition-roster.ts`), `hashOf` (`product-market.ts`), `clampN`, `isIndustry`, `readHeavy` and `heavyLevel` (`heavy-rd.ts`), `readBiz`, `marketStateOf` (`competition-core.ts`), `type MarketFactors`.
- Produces (`src/game/business/tech-waves.ts`):
  - `WAVES_KEY = 'techWaves'`, `BASE_KEY = 'techBase'`, `MAX_WAVES = 64`, `type WaveSource = 'heavy' | 'deeptech' | 'workshop' | 'rival' | 'race'`
  - `interface TechWave { id: string; kind: WaveKind; name: string; source: WaveSource; year: number; market: string; size: number; hype: number; delivery: number; last: number; origin?: string; home?: string; skip?: string; mature?: number }`; `interface TechBase { demand: number; costs: number }`; `interface WaveInput { kind: WaveKind; source: WaveSource; origin: string; name: string; size: number; market: string; year?: number; home?: string }`
  - `roleOf(kind: WaveKind, trade: string): 'core' | 'supply' | 'disrupted' | null`
  - `readTechWaves(g: Pick<GameState, 'flags'>): readonly TechWave[]`; `readTechBase(g: Pick<GameState, 'flags'>): Readonly<Record<string, TechBase>>`; `announceWave(g: GameState, a: WaveInput): TechWave | null`
  - `waveFactors(trade: string, market: string, year: number, waves: readonly TechWave[], base?: Readonly<Record<string, TechBase>>, worldMarket?: boolean): MarketFactors`; `waveFactorsFor(g: Pick<GameState, 'flags'>, trade: string, market: string, year: number): MarketFactors`
  - `nextState(w: TechWave, delivery: number, stall: boolean, year: number): { hype: number; delivery: number; mature: number; fate: 'live' | 'settle' | 'drop' }`
  - `waveDraw(g: GameState, id: string, year: number): { u: number; stall: boolean }`; `rivalWave(fam: string, trade: string, year: number): { kind: WaveKind; size: number } | null`
  - `advanceTechWaves(g: GameState): void`; `waveWorldFlags(g: Pick<GameState, 'flags'>): Record<string, Json>`
  - `lowerLead(name: string): string`: lowercases a leading capital unless the next letter is a capital too, so a wave name reads inside a sentence (`'Frontier AI'` gives `'frontier AI'`, `'A new drug'` gives `'a new drug'`, `'AI agents'` stays); the news and entrant lines of Tasks 4 and 6 use it
  - `src/game/history/market-events.ts`: `FACTOR_BOUNDS = { demand: [0.45, 1.8], costs: [0.75, 1.5], value: [0.3, 3] } as const`

- [ ] **Step 1: Write the failing tests** `test/tech-waves.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { seeded } from '../src/game/assets'
import { addHeavy } from '../src/game/business/heavy-rd'
import { hashOf } from '../src/game/business/product-market'
import { MAX_WAVES, advanceTechWaves, announceWave, lowerLead, nextState, readTechBase, readTechWaves, rivalWave, waveDraw, waveFactors, waveFactorsFor, waveWorldFlags, type TechBase, type TechWave } from '../src/game/business/tech-waves'
import { INDUSTRY_IDS } from '../src/game/data/markets'
import { FACTOR_BOUNDS, marketEventFactors } from '../src/game/history/market-events'
import type { GameState, Json } from '../src/game/types'
import { makeTestGame } from './helpers'

const flagsOnly = (flags: Record<string, Json>): Pick<GameState, 'flags'> => ({ flags })
const W = (o: Partial<TechWave> = {}): TechWave => ({ id: 'deeptech:ai:2031:x', kind: 'ai', name: 'Frontier AI', source: 'deeptech', year: 2031, market: 'world', size: 0.5, hype: 0.8, delivery: 0.6, last: 2031, ...o })
const J = (v: unknown): Json => v as Json
const N = { demand: 1, costs: 1, value: 1 }
const near = (n: number) => expect.closeTo(n, 6)
const calm = (g: GameState, year: number) => { for (let i = 0; ; i++) if (!waveDraw(g, `c${i}`, year).stall) return `c${i}` }

describe('readTechWaves and readTechBase (hostile flags)', () => {
  const read = (v: Json | undefined) => readTechWaves(flagsOnly(v === undefined ? {} : { techWaves: v }))
  it('reads anything that is not a list as empty, drops damaged entries, and shares one frozen empty list', () => {
    for (const v of [7, 'x', true, null, { id: 'a' }, undefined, [] as Json]) expect(read(v)).toEqual([])
    const bad = [null, 4, 'a', [], { ...W(), kind: 'constructor' }, { ...W(), kind: '__proto__' }, { ...W(), market: 'zz' }, { ...W(), source: 'x' }, { ...W(), size: NaN }, { ...W(), delivery: Infinity }, { ...W(), id: '' }]
    expect(read(J([...bad, W()]))).toHaveLength(1); expect(read(undefined)).toBe(read(7)); expect(Object.isFrozen(read(undefined))).toBe(true)
  })
  it('clamps numbers, caps strings, keeps at most 64 with the first copy of an id winning, and scans a million entries fast', () => {
    const [w] = read(J([{ ...W(), year: 99999, size: 7, hype: -3, delivery: 2, last: 0, id: 'i'.repeat(500), name: 'n'.repeat(200), origin: 'o'.repeat(500) }]))
    expect([w.year, w.size, w.hype, w.delivery, w.last]).toEqual([2300, 1, 0, 1, 2300]); expect([w.id.length, w.name.length, w.origin!.length]).toEqual([100, 60, 64])
    expect(read(J(Array.from({ length: 100 }, (_, i) => ({ ...W(), id: `w${i}` }))))).toHaveLength(MAX_WAVES)
    expect(read(J([{ ...W(), size: 0.2 }, { ...W(), size: 0.9 }]))[0].size).toBe(0.2)
    const t = Date.now(); read(J(new Array(1_000_000).fill(W()))); expect(Date.now() - t).toBeLessThan(250)
  })
  it('validates a stored array once, re-validates a replaced or longer one, never writes or draws', () => {
    const g = makeTestGame(5); g.flags.techWaves = J([W()]); const a = readTechWaves(g), before = JSON.stringify(g), rng = g.rng
    expect(readTechWaves(g)).toBe(a); for (let i = 0; i < 100; i++) waveFactorsFor(g, 'aiLab', 'world', 2035)
    expect([JSON.stringify(g), g.rng]).toEqual([before, rng])
    g.flags.techWaves = J([...(g.flags.techWaves as Json[]), { ...W(), id: 'two' }]); expect(readTechWaves(g)).toHaveLength(2)
  })
  const base = (v: Json | undefined) => readTechBase(flagsOnly(v === undefined ? {} : { techBase: v }))
  it('reads junk as empty, keeps only real trade|market keys, clamps demand to 0.8-1.5 and costs to 0.8-1.0, keeps at most 64', () => {
    for (const v of [7, 'x', null, [], undefined]) expect(base(v as Json)).toEqual({})
    const ok = { demand: 1.2, costs: 0.9 }
    expect(Object.keys(base({ 'aiLab|world': ok, 'aiLab|zz': ok, 'nope|us': ok, 'constructor|us': ok, aiLab: ok, 'bakery|us': 5 }))).toEqual(['aiLab|world'])
    expect([base({ 'aiLab|world': { demand: 9, costs: 0 } })['aiLab|world'], base({ 'aiLab|world': { demand: 0, costs: 2 } })['aiLab|world']]).toEqual([{ demand: 1.5, costs: 0.8 }, { demand: 0.8, costs: 1 }])
    expect(Object.keys(base(Object.fromEntries(INDUSTRY_IDS.map((t) => [`${t}|world`, ok])))).length).toBeLessThanOrEqual(64)
  })
})

describe('announceWave', () => {
  const input = { kind: 'ai', source: 'deeptech', origin: 'biz1#frontier', name: 'Frontier AI', size: 0.6, market: 'world' } as const
  it('writes id, hype 0.3 + 0.7 size, delivery 0, last = year; a second call writes nothing and draws nothing; the array is replaced', () => {
    const g = makeTestGame(3); g.year = 2031; const rng = g.rng, nextId = g.nextId
    const w = announceWave(g, input)!, old = g.flags.techWaves
    expect(w.id).toBe(`deeptech:ai:2031:${hashOf('biz1#frontier').toString(36)}`); expect([w.hype, w.delivery, w.last]).toEqual([near(0.72), 0, 2031])
    expect(announceWave(g, input)).toBe(readTechWaves(g)[0]); expect(g.flags.techWaves).toBe(old); expect([g.rng, g.nextId]).toEqual([rng, nextId])
    announceWave(g, { ...input, origin: 'biz9#agents' }); expect(g.flags.techWaves).not.toBe(old); expect(old).toHaveLength(1)
  })
  it('sets skip (the record trade) for heavy waves only, lets year lead g.year, and picks a home', () => {
    const g = makeTestGame(3, { countryId: 'jp' }); g.year = 2031
    const h = announceWave(g, { ...input, source: 'heavy', origin: 'heavy.software|world#Autonomous Agent Platform', year: 2032 })!
    expect([h.skip, h.year, h.last, h.home]).toEqual(['software', 2032, 2032, 'jp']); expect(announceWave(g, { ...input, origin: 'biz2#agents' })!.skip).toBeUndefined()
    expect(announceWave(g, { ...input, kind: 'cloud', market: 'us', source: 'rival', origin: 'a' })!.home).toBe('us')
  })
  it('refuses an unknown kind, a third non-rival wave in a year, a 65th wave, and a covered history kind', () => {
    const g = makeTestGame(3); g.year = 2031
    expect(announceWave(g, { ...input, kind: 'nope' as never })).toBeNull()
    expect([announceWave(g, { ...input, origin: 'o1' }), announceWave(g, { ...input, origin: 'o2' })].every(Boolean)).toBe(true); expect(announceWave(g, { ...input, origin: 'o3' })).toBeNull()
    g.flags.techWaves = J(Array.from({ length: MAX_WAVES }, (_, i) => ({ ...W(), id: `w${i}`, year: 2000 + (i % 20) }))); expect(announceWave(g, { ...input, source: 'rival', origin: 'full' })).toBeNull()
    const old = makeTestGame(3); old.year = 1950
    expect(announceWave(old, { ...input, kind: 'television', source: 'workshop', origin: 'hist-picture-box' })).toBeNull(); expect(announceWave(old, { ...input, kind: 'television', source: 'rival', origin: 'x|world' })).not.toBeNull()
  })
})

describe('waveFactors', () => {
  const w = [W()] // kind ai, size .5, hype .8, delivery .6: r = .36, size x delivery = .3
  const f = (t: string, m = 'world', y = 2035, ws: readonly TechWave[] = w, b?: Readonly<Record<string, TechBase>>, world = false) => waveFactors(t, m, y, ws, b, world)
  it('core, supply and disrupted follow the spec formulas', () => {
    expect(f('aiLab')).toMatchObject({ demand: near(1.09), costs: near(0.97), value: near(1.126) }); expect(f('semiconductor')).toMatchObject({ demand: near(1.06), costs: 1, value: near(1.0612) })
    expect(f('software')).toMatchObject({ demand: near(0.925), costs: 1, value: near(0.922) }); expect(f('bakery')).toEqual(N)
  })
  it('reach: a world wave counts in full everywhere; a country wave abroad counts 0.35 + 0.4 x delivery; nothing counts before its year; skip drops only the origin trade\'s demand term', () => {
    const us = [W({ market: 'us' })], h = [W({ source: 'heavy', skip: 'aiLab' })]
    expect(f('aiLab', 'us', 2035, us).value).toBeCloseTo(1.126, 6); expect(f('aiLab', 'jp', 2035, w).value).toBeCloseTo(1.126, 6)
    expect(f('aiLab', 'jp', 2035, us).value).toBeCloseTo(1 + (0.35 + 0.4 * 0.6) * 0.126, 6); expect(f('aiLab', 'world', 2030)).toEqual(N); expect(f('aiLab', 'world', 2045)).toEqual(f('aiLab', 'world', 2035))
    expect(f('aiLab', 'world', 2035, h)).toMatchObject({ demand: 1, costs: near(0.97) }); expect(f('semiconductor', 'world', 2035, h).demand).toBeCloseTo(1.06, 6)
  })
  it('history: transistor core in 1957 is about +15.5% value and +9.7% demand; a world-scope read damps demand to a third', () => {
    expect(f('semiconductor', 'us', 1957, []).value).toBeCloseTo(1.155, 2); expect(f('semiconductor', 'us', 1957, []).demand).toBeCloseTo(1.097, 2)
    const us = f('software', 'us', 2011, []), wd = f('software', 'world', 2011, [], undefined, true)
    expect(wd.demand).toBeCloseTo(1 + (us.demand - 1) / 3, 6); expect(wd.value).toBeCloseTo(us.value, 6)
  })
  it('quiet years are neutral and every output stays in FACTOR_BOUNDS, alone and stacked with 30 waves or a market event', () => {
    for (const t of INDUSTRY_IDS) for (const y of [1965, 1970, 2003, 2031]) expect(f(t, 'us', y, [])).toEqual(N)
    const stack = Array.from({ length: 30 }, (_, i) => W({ id: `s${i}`, size: 1, hype: 1, delivery: 1 }))
    for (const t of INDUSTRY_IDS) for (const y of [1957, 1999, 2011, 2035]) for (const ws of [[], stack]) {
      const r = f(t, 'us', y, ws); for (const k of ['demand', 'costs', 'value'] as const) { expect(r[k]).toBeGreaterThanOrEqual(FACTOR_BOUNDS[k][0]); expect(r[k]).toBeLessThanOrEqual(FACTOR_BOUNDS[k][1]) }
    }
    expect(marketEventFactors('telecom', 'us', 1999).value * f('telecom', 'us', 1999, []).value).toBeLessThan(3)
  })
  it('techBase multiplies demand and costs at its own market only; waveFactorsFor shares one frozen neutral', () => {
    const b = { 'aiLab|world': { demand: 1.2, costs: 0.9 } }
    expect(f('aiLab', 'world', 2035, [], b)).toEqual({ demand: 1.2, costs: 0.9, value: 1 }); expect(f('aiLab', 'us', 2035, [], b)).toEqual(N)
    const g = makeTestGame(1), a = waveFactorsFor(g, 'aiLab', 'world', 2035); expect(a).toBe(waveFactorsFor(g, 'bakery', 'us', 2040)); expect(Object.isFrozen(a)).toBe(true)
  })
})

describe('nextState', () => {
  it('hype closes on delivery at 0.30 when delivery leads and 0.45 when it lags; a stall adds nothing and cools hype 15%', () => {
    expect(nextState(W({ hype: 0.4, delivery: 0.4 }), 0.8, false, 2032).hype).toBeCloseTo(0.4 + 0.4 * 0.3, 6)
    expect(nextState(W({ hype: 0.9, delivery: 0.2 }), 0.2, false, 2032).hype).toBeCloseTo(0.9 - 0.7 * 0.45, 6)
    const s = nextState(W({ hype: 0.9, delivery: 0.2 }), 0.2, true, 2032); expect([s.hype, s.delivery]).toEqual([near((0.9 - 0.7 * 0.45) * 0.85), 0.2])
  })
  it('the premium holds when delivery matches hype and unwinds when it lags', () => {
    const run = (s: TechWave) => { for (let i = 0; i < 4; i++) { const x = nextState(s, s.delivery, false, 2032 + i); s = { ...s, hype: x.hype, mature: x.mature } } return s }
    const v = (s: TechWave) => waveFactors('aiLab', 'world', 2040, [s]).value
    expect(v(run(W({ hype: 0.8, delivery: 0.8 })))).toBeCloseTo(v(W({ hype: 0.8, delivery: 0.8 })), 6); expect(v(run(W({ hype: 0.9, delivery: 0.2 })))).toBeLessThan(v(W({ hype: 0.9, delivery: 0.2 })))
  })
  it('mature counts years at delivery >= 0.9 within 0.05 of hype; 5 settle; delivery below 0.1 after 6 years drops', () => {
    expect(nextState(W({ hype: 1, delivery: 1, mature: 3 }), 1, false, 2040)).toMatchObject({ mature: 4, fate: 'live' }); expect(nextState(W({ hype: 1, delivery: 1, mature: 4 }), 1, false, 2040)).toMatchObject({ mature: 5, fate: 'settle' })
    expect(nextState(W({ hype: 0.5, delivery: 1, mature: 4 }), 1, false, 2040)).toMatchObject({ mature: 0, fate: 'live' })
    const low = W({ year: 2031, hype: 0.3, delivery: 0.05 }); expect([nextState(low, 0.05, false, 2037).fate, nextState(low, 0.05, false, 2036).fate]).toEqual(['drop', 'live'])
  })
})

describe('advanceTechWaves', () => {
  const game = (waves: TechWave[], year = 2032) => { const g = makeTestGame(7); g.year = year; g.flags.techWaves = J(waves); return g }
  it('writes nothing without waves; steps once a year behind the last marker, once after a gap, and not before the wave\'s own year', () => {
    const none = makeTestGame(7), nb = JSON.stringify(none); advanceTechWaves(none); expect(JSON.stringify(none)).toBe(nb)
    const g = game([W({ source: 'race', last: 2031 })]); advanceTechWaves(g); const once = g.flags.techWaves
    advanceTechWaves(g); expect(g.flags.techWaves).toBe(once); expect(readTechWaves(g)[0].last).toBe(2032)
    const gap = game([W({ source: 'race', last: 2028 })], 2035); advanceTechWaves(gap); expect(readTechWaves(gap)[0].last).toBe(2035)
    const early = game([W({ source: 'race', year: 2040, last: 2040 })]), eb = JSON.stringify(early.flags); advanceTechWaves(early); expect(JSON.stringify(early.flags)).toBe(eb)
    const fut = game([W({ source: 'race', last: 2300 })], 2035); advanceTechWaves(fut); expect(readTechWaves(fut)[0].last).toBe(2035)   // a hostile future `last` cannot freeze a wave
  })
  it('waveDraw takes u first, then the stall draw, from the family stream; heirs share it, other families do not; g.rng is untouched', () => {
    const s = seeded('fam|wave|w1|2031'), d = (id: string) => { const g = makeTestGame(1); g.lifeId = id; const r = g.rng; const x = waveDraw(g, 'w1', 2031); expect(g.rng).toBe(r); return x }
    expect(d('fam-g3')).toEqual({ u: s.next(), stall: s.next() < 0.25 }); expect(d('fam-g1')).toEqual(d('fam-g3')); expect(d('fam2-g1')).not.toEqual(d('fam-g1'))
  })
  it('the seeded path gains 0.08 + 0.22 u (or nothing on a stall), and is also the fallback when the company or the heavy record is gone', () => {
    const lost = [W({ source: 'race', delivery: 0.2 }), W({ source: 'deeptech', origin: 'gone#frontier', delivery: 0.2 }), W({ source: 'heavy', origin: 'heavy.software|world#Autonomous Agent Platform', skip: 'software', delivery: 0.2 })]
    for (const w of lost) {
      const g = game([w]); const { u, stall } = waveDraw(g, w.id, 2032)
      expect(() => advanceTechWaves(g)).not.toThrow(); expect(readTechWaves(g)[0].delivery).toBeCloseTo(stall ? 0.2 : 0.28 + 0.22 * u, 6)
    }
  })
  it('a heavy wave moves toward the record\'s adoption, at most 0.25 a year', () => {
    const g = game([W({ source: 'heavy', origin: 'heavy.software|world#Autonomous Agent Platform', skip: 'software', delivery: 0, hype: 0.5, year: 2025 })])
    addHeavy(g, 'software', 'world', { family: 'Autonomous Agent Platform', year: 2025, years: 4, quality: 80, cost: 1e6, by: 'biz1' }); advanceTechWaves(g); expect(readTechWaves(g)[0].delivery).toBeCloseTo(0.25, 6)
  })
  it('settles a mature wave into techBase at its own market, with the spec\'s full factors', () => {
    const probe = makeTestGame(7); probe.year = 2032
    const g = game([W({ id: calm(probe, 2032), source: 'race', delivery: 1, hype: 1, mature: 4 })]); advanceTechWaves(g)
    const b = readTechBase(g); expect(readTechWaves(g)).toEqual([]); expect([b['aiLab|world'].demand, b['aiLab|world'].costs]).toEqual([near(1.15), near(0.95)])
    expect(b['software|world'].demand).toBeCloseTo(0.875, 6); expect(Object.keys(b).every((k) => k.endsWith('|world'))).toBe(true)
  })
  it('folds only the wave\'s own factors, even in a year when a history wave is live', () => {
    const probe = makeTestGame(7); probe.year = 1982
    const g = game([W({ id: calm(probe, 1982), source: 'race', year: 1980, last: 1981, delivery: 1, hype: 1, mature: 4 })], 1982); advanceTechWaves(g)
    expect(readTechBase(g)['semiconductor|world'].demand).toBeCloseTo(1.1, 6)   // supply 1 + 0.2 x 0.5 x 1; the microcomputer row, where semiconductor is core, is not folded in
  })
})

describe('rivalWave and waveWorldFlags', () => {
  it('lowerLead lowercases a leading capital unless an acronym follows it', () => {
    expect(['Frontier AI', 'A new drug for cancer', 'AI agents', 'Air taxis', ''].map(lowerLead)).toEqual(['frontier AI', 'a new drug for cancer', 'AI agents', 'air taxis', ''])
  })
  it('rivalWave lands about once per 9 trade-years at any year, only for core trades of future-facing kinds, and draws landing, kind, size in that order', () => {
    let hits = 0, first = 0
    for (let y = 2027; y < 4027; y++) if (rivalWave('fam', 'aiLab', y)) { hits++; first ||= y }
    expect(hits).toBeGreaterThan((2000 / 9) * 0.7); expect(hits).toBeLessThan((2000 / 9) * 1.3)
    const s = seeded(`fam|tw-rival|aiLab|${first}`); s.next(); s.next(); expect(rivalWave('fam', 'aiLab', first)).toEqual({ kind: 'ai', size: near(0.2 + 0.4 * s.next()) })
    for (let y = 2027; y < 2100; y++) { expect(rivalWave('fam', 'bakery', y)).toBeNull(); expect(rivalWave('fam', 'dataCenter', y)).toBeNull() }
  })
  it('waveWorldFlags carries validated copies, omits empty parts and never adds market.news', () => {
    expect(waveWorldFlags(flagsOnly({}))).toEqual({})
    const out = waveWorldFlags(flagsOnly({ techWaves: J([null, 7, W()]), techBase: J({ 'aiLab|world': { demand: 9, costs: 1 } }), 'market.news': J([]) }))
    expect(Object.keys(out).sort()).toEqual(['techBase', 'techWaves']); expect(out.techWaves).toHaveLength(1); expect(out.techBase).toEqual({ 'aiLab|world': { demand: 1.5, costs: 1 } })
  })
})
```

- [ ] **Step 2: Run it to see it fail:** `npx vitest run test/tech-waves.test.ts`. Expected: FAIL, "Failed to resolve import ../src/game/business/tech-waves".
- [ ] **Step 3: Export `FACTOR_BOUNDS` from `src/game/history/market-events.ts`** and use it in the three clamp literals of `marketEventFactors` (same numbers).
- [ ] **Step 4: Readers in `tech-waves.ts`.** `cleanWave(x: unknown): TechWave | null` follows `cleanRecord` in `heavy-rd.ts`: reject non-objects and arrays; `id` and `name` trimmed non-empty strings (cut to 100 and 60); `kind` through `isWaveKind`; `source` one of the five; `market` `'world'` or a `COUNTRIES` id (module-level `Set`); `year`, `size`, `hype`, `delivery`, `last` finite numbers (`year` rounded and clamped 1800-2300, the three ratios 0-1, `last` rounded and clamped to `[year, 2300]` so a future `last` cannot freeze a wave); optional `origin` (cut to 64), `home` (a country id), `skip` (an `isIndustry` trade), `mature` (rounded, 0-10, kept only above 0). `readTechWaves` copies the `shocks.ts` cache: `WeakMap<Json[], { length; list }>` on the RAW flag array, scan only the last `MAX_WAVES`, first copy of an id wins, frozen result, one shared frozen empty list. `readTechBase` keys on the raw object identity, scans at most 256 keys, keeps at most 64, splits each key on the first `|` into an `isIndustry` trade and `'world'` or a country id, returns one shared frozen `{}` when empty. Private writers: `storedWave(w): Json` (conditional spreads), `writeWaves(g, list)` assigns a NEW array of NEW objects (`list.slice(-MAX_WAVES).map(storedWave)`), `writeBase(g, base)` assigns a new object.
- [ ] **Step 5: `roleOf`, the private `effectsOf`, `waveFactors`, `waveFactorsFor`.** `effectsOf(trade, market, year, waves, withHistory = true): { name; demand; costs; value }[]` is the single formula path (`waveLines` reuses it in Task 6): one entry per live dynamic wave (`year >= w.year`, trade has a role) and, only when `withHistory`, per `historyWaveStates(market, year)` row, using spec section 2 (`r = size x (0.6 hype + 0.4 delivery)`; core value `1 + 0.35 r`, demand `1 + 0.30 size delivery`, costs `1 - 0.10 size delivery`; supply value `1 + 0.17 r`, demand `1 + 0.20 size delivery`; disrupted value `1 - 0.05 r - 0.20 size delivery`, demand `1 - 0.25 size delivery`), each term scaled by reach (`1 + reach x (f - 1)`). Reach per D3, skip per D2 (`w.skip === trade && market === w.market` zeroes that wave's demand term), history demand terms divided by 3 when `worldMarket`. `waveFactors` multiplies the effects and the `base` entry `${trade}|${market}` (demand, costs), clamps each output to `FACTOR_BOUNDS`, returns the shared frozen neutral when all three are exactly 1; with no waves, an empty base and `year` outside the history table's span it returns neutral before building any key. Memo: `WeakMap<readonly TechWave[], WeakMap<object, Map<string, MarketFactors>>>` (validated list, then base object, then `trade|market|year|world`), cleared past 1024 entries. `waveFactorsFor(g, ...)` is `waveFactors(trade, market, year, readTechWaves(g), readTechBase(g), market === 'world')`.
- [ ] **Step 6: `announceWave`, `waveDraw`, `rivalWave`, `nextState`.** `announceWave`: id per D1 (cut to 100), `year = a.year ?? g.year`, return the stored wave when the id exists; return null for an invalid kind, 64 stored, a third non-rival wave with the same `year`, or a heavy/workshop/race wave whose kind has `historyKindActive(kind, year)`; `size` clamped 0.05-1, `hype = 0.3 + 0.7 size`, `delivery = 0`, `last = max(year, round(g.year))`, `skip` = the trade in `origin` (`origin.slice(6, origin.indexOf('|'))`) for 'heavy' only, `home = a.home ?? (market !== 'world' ? market : g.character.countryId)`; build through `cleanWave`, store through `writeWaves`. `waveDraw`: `const s = seeded(`${familyId(g.lifeId)}${outcomeTag(g, year)}|wave|${id}|${year}`)`, return `{ u: s.next(), stall: s.next() < 0.25 }`, always both draws in that order. `rivalWave(fam, trade, year)`: `s = seeded(`${fam}|tw-rival|${trade}|${year}`)`; candidate kinds are the `WAVE_KINDS` keys with `trade` in `core` that no `HISTORY_WAVES` row uses (none: null); `s.next() >= 1/9` is null; then `kinds[floor(s.next() x kinds.length)]`, then `size = 0.2 + 0.4 s.next()` (the kind draw is taken even for one kind). `nextState`: hype closes on `delivery` at `k = 0.30` when delivery exceeds hype, else `0.45`; a stall multiplies the new hype by 0.85; `delivery` is clamped 0-1; `mature = (w.mature ?? 0) + 1` when `delivery >= 0.9 && |delivery - hype| <= 0.05` (the new hype, after the closing step and the stall cooling), else 0; fate `settle` at `mature >= 5`, `drop` when `year - w.year >= 6 && delivery < 0.1`, else `live`.
- [ ] **Step 7: `advanceTechWaves`, `waveWorldFlags`.** `advanceTechWaves`: return when there are no waves; per wave skip when `last === year` or `year < w.year`; delivery by D11 (heavy: split `origin` on the first `#` into `heavy.<trade>|<market>` and the family, `readHeavy(g, trade, market).find`, target `heavyLevel(rec, year).adoption`, new delivery `delivery + clampN(target - delivery, -0.25, 0.25)`; deeptech: `g.assets.find` by the id before `#`, target `clampN((marketStateOf(readBiz(g, a))?.share ?? 0) / 0.25, 0, 1)`, same cap; every other case, a missing asset or a missing record: `waveDraw`, gain `stall ? 0 : 0.08 + 0.22 u`, no cap); then `nextState`. A `settle` fate folds each role trade's `effectsOf(trade, w.market, year, [w], false)` demand and costs (the wave's own factors, never the history rows live that year) into `techBase['trade|market']` (demand clamped 0.8-1.5, costs 0.8-1.0, multiplied into any existing entry) and removes the wave; `drop` removes it; write once, only when something changed. `waveWorldFlags` returns `{ techWaves, techBase }` through the readers and the stored shapes, omitting an empty part.
- [ ] **Step 8: Run it to see it pass:** `npx vitest run test/tech-waves.test.ts`. Expected: all PASS.
- [ ] **Step 9: Regression.** `npm run typecheck`, then `npx vitest run test/market-events.test.ts test/voice-guards.test.ts test/plan-search-reads.test.ts` (9.5 s + 2.5 s + 6.5 s).
- [ ] **Step 10: Commit**
```bash
git add src/game/business/tech-waves.ts src/game/history/market-events.ts test/tech-waves.test.ts
git commit -m "feat(waves): wave record, readers, factors and the yearly step" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Tq5bMwVNBuT54ZtqpiXV13"
```

## Task 3: Yearly wiring, rival landings, macro feed, heir carry

**Files:**
- Modify: `src/game/business/tech-waves.ts`, `src/game/business/yearly.ts` (`yearlyBusinessImpl`), `src/game/aging.ts` (`YEARLY_HOOKS`), `src/game/life.ts` (`continueAsChild`, import beside line 53)
- Test: `test/tech-waves-wiring.test.ts`

**Interfaces:**
- Consumes: Task 2 (`advanceTechWaves`, `announceWave`, `rivalWave`, `waveWorldFlags`, `waveDraw`, `readTechWaves`), `recordEconomicActivity` (`src/game/economy/index.ts`), `marketKey` (`competition-core.ts`), `businessAssets`, `readBiz` (`state.ts`), `PRESENT_YEAR` (`src/game/history/timeline.ts`).
- Produces: `landRivalWaves(g: GameState): void` (`tech-waves.ts`); the `'techWaves'` hook directly after `'business'`; the macro feed inside `advanceTechWaves`; `...waveWorldFlags(n)` in `continueAsChild`.

- [ ] **Step 1: Write the failing tests** `test/tech-waves-wiring.test.ts`. Fixtures: `W`, `J`, `calm` as in Task 2; `makeTestGame` (`./helpers`); `adult`, `company`, `nextYear` (`./market-kit`); `parent()` (returns `{ g, a, rec, heirId }`) and `handOff(g, heirId)` copied from `test/heavy-handoff.test.ts`; `loadFixtureV1(): GameState` is the `fixture` constant and the `migrated` helper of `test/save-schema.test.ts` (lines 11-19) folded into one function that returns `migrated(structuredClone(fixture)).game`. Imports: `ageUp`, `YEARLY_HOOKS`, `yearlyBusinessImpl`, `createBusinessAsset`, `newBiz`, `getCountry`, `familyId`, `outcomeTag`, `arriveInPast`, `economyState`, `readMarketNews`, `SAVE_SCHEMA`.

```ts
describe('the yearly hook and the business year', () => {
  it('sits right after business and leaves the hedge pin alone', () => {
    const names = YEARLY_HOOKS.map(([k]) => k)
    expect(names.indexOf('techWaves')).toBe(names.indexOf('business') + 1); expect(names.indexOf('hedge')).toBe(names.indexOf('investments') + 1)
  })
  it('a life with no company is byte-identical to a twin without the hook, and stores nothing', () => {
    const g = makeTestGame(7, { age: 40, money: 300_000 }); g.log = [{ age: 40, year: 2026, entries: [] }]; const twin = structuredClone(g)
    ageUp(g)
    const i = YEARLY_HOOKS.findIndex(([k]) => k === 'techWaves'), [hook] = YEARLY_HOOKS.splice(i, 1)
    try { ageUp(twin) } finally { YEARLY_HOOKS.splice(i, 0, hook) }
    expect(JSON.stringify(g)).toBe(JSON.stringify(twin)); expect(['techWaves', 'techBase'].filter((k) => k in g.flags)).toEqual([])
    const r = adult(5, 2030, 'us'); company(r, 'restaurant'); nextYear(r); nextYear(r)
    expect(['techWaves', 'techBase'].filter((k) => k in r.flags)).toEqual([]); expect(readMarketNews(r)).toEqual([])
  })
  it('steps stored waves even with no company (the early return), and once at the end of a pass with companies', () => {
    const g = makeTestGame(7); g.year = 2032; g.flags.techWaves = J([W({ source: 'race', last: 2031 })]); yearlyBusinessImpl(g); expect(readTechWaves(g)[0].last).toBe(2032)
    const h = adult(5, 2033, 'us'); company(h, 'dataCenter'); h.flags.techWaves = J([W({ source: 'race', year: 2030, last: 2033 })]); nextYear(h)
    const after = h.flags.techWaves; advanceTechWaves(h); expect(h.flags.techWaves).toBe(after); expect(readTechWaves(h)[0].last).toBe(h.year)
  })
})

describe('rival landings and the macro feed', () => {
  const lab = (year: number) => { const g = makeTestGame(9, { age: 40, money: 1e9, countryId: 'us' }); g.year = year
    g.assets.push(createBusinessAsset(g, 'Lab', newBiz(g, 'aiLab', 'us', getCountry('us').cities[0], { cash: 1e8, founded: 2020 }), 1e8)); return g }   // the caller pushes the asset
  const fam = (g: GameState, y: number) => `${familyId(g.lifeId)}${outcomeTag(g, y)}`
  const landing = (g: GameState) => { let y = g.year; while (!rivalWave(fam(g, y), 'aiLab', y)) g.year = ++y; return y }
  it('lands the seeded draw once in a year after 2026 and repeats as a no-op', () => {
    const g = lab(2027), y = landing(g), r = rivalWave(fam(g, y), 'aiLab', y)!; landRivalWaves(g); landRivalWaves(g)
    const [w] = readTechWaves(g); expect(readTechWaves(g)).toHaveLength(1)
    expect(w).toMatchObject({ source: 'rival', kind: r.kind, origin: 'aiLab|world', market: 'world', home: 'us', year: y }); expect(w.size).toBeCloseTo(r.size, 6)
  })
  it('lands nothing in a miss year, in 2026 or earlier, without a company, or within 3 years of a wave that cores the trade', () => {
    const g = lab(2027); let y = 2027; while (rivalWave(fam(g, y), 'aiLab', y)) g.year = ++y; landRivalWaves(g); expect(readTechWaves(g)).toEqual([])
    const old = lab(2020); for (let h = 1990; h <= 2026; h++) { old.year = h; landRivalWaves(old) } expect(readTechWaves(old)).toEqual([])
    const none = makeTestGame(9); for (let h = 2027; h < 2060; h++) { none.year = h; landRivalWaves(none) } expect('techWaves' in none.flags).toBe(false)
    const near = lab(2027), z = landing(near); near.flags.techWaves = J([W({ source: 'rival', year: z - 1, last: z - 1 })]); landRivalWaves(near); expect(readTechWaves(near)).toHaveLength(1)
  })
  it('the same seed gives the same waves', () => {
    const run = () => { const g = lab(2027); for (let y = 2027; y < 2090; y++) { g.year = y; landRivalWaves(g); advanceTechWaves(g) } return JSON.stringify(g.flags) }
    const first = run(); expect(first).toBe(run()); expect(first).toContain('"source":"rival"')
  })
  const feed = (w: Partial<TechWave>) => { const g = makeTestGame(7); g.year = 2032; g.flags.techWaves = J([W({ id: calm(g, 2032), last: 2031, delivery: 0.2, hype: 0.5, ...w })]); advanceTechWaves(g); return g }
  const tokens = (g: GameState) => (economyState(g)?.receipts ?? []).filter((r) => r.includes('wave:'))
  it('records one capped innovation entry a year for a deeptech wave with a home, and none for workshop, race or a world wave with no home', () => {
    const g = feed({ source: 'deeptech', home: 'us', size: 1 }); expect(tokens(g)).toHaveLength(1); advanceTechWaves(g); expect(tokens(g)).toHaveLength(1)
    for (const w of [{ source: 'workshop' as const, home: 'us' }, { source: 'race' as const, home: 'us' }, { source: 'deeptech' as const, home: undefined }]) expect(tokens(feed(w))).toEqual([])
  })
})

describe('heirs', () => {
  it('carry validated waves and techBase, repair damage, and do not duplicate the news', () => {
    const { g, heirId } = parent(); const news = readMarketNews(g)
    g.flags.techWaves = J([null, 7, 'x', [], {}, W()]); g.flags.techBase = J({ 'aiLab|world': { demand: 9, costs: 1 }, junk: 1 })
    const n = handOff(g, heirId)
    expect(readTechWaves(n)).toEqual(readTechWaves(g)); expect(n.flags.techWaves).toHaveLength(1); expect(n.flags.techBase).toEqual({ 'aiLab|world': { demand: 1.5, costs: 1 } })
    expect(readMarketNews(n)).toEqual(news); expect(JSON.parse(JSON.stringify(n.flags))).toEqual(n.flags)
  })
  it('cap a flood of 5000 entries at 64 and add no keys for a world with none', () => {
    const big = parent(); big.g.flags.techWaves = J(Array.from({ length: 5000 }, (_, i) => ({ ...W(), id: `w${i}` })))
    expect((handOff(big.g, big.heirId).flags.techWaves as Json[]).length).toBeLessThanOrEqual(64)
    const old = parent(), m = handOff(old.g, old.heirId); expect(['techWaves', 'techBase'].filter((k) => k in m.flags)).toEqual([])
  })
})

describe('time machine and saves', () => {
  it('a finished year keeps its draw, the unfinished year rerolls, and the restored flags win', () => {
    const g = makeTestGame(7); g.year = 2031; g.flags.techWaves = J([W()]); const snap = structuredClone(g)
    const now = structuredClone(g); now.year = 2034; now.flags.techWaves = J([W({ hype: 0.1 })]); const back = arriveInPast(now, snap)
    expect(waveDraw(back, 'w', 2030)).toEqual(waveDraw(g, 'w', 2030)); expect(waveDraw(back, 'w', 2031).u).not.toBe(waveDraw(g, 'w', 2031).u); expect(readTechWaves(back)[0].hype).toBe(0.8)
  })
  it('SAVE_SCHEMA stays 2 and an old save plays years with no wave state', () => {
    expect(SAVE_SCHEMA).toBe(2)
    const game = loadFixtureV1(); for (let i = 0; i < 3; i++) { game.queue = []; ageUp(game) }
    expect(['techWaves', 'techBase'].filter((k) => k in game.flags)).toEqual([])
  })
})
```

- [ ] **Step 2: Run it to see it fail:** `npx vitest run test/tech-waves-wiring.test.ts`. Expected: FAIL (`landRivalWaves` not exported, no `'techWaves'` hook).
- [ ] **Step 3: Wire the yearly step.** `yearly.ts`: call `advanceTechWaves(g)` as the last statement of `yearlyBusinessImpl` (after `bundleCeoLetters`) and make the `list.length === 0` early return call it first. `aging.ts`: add `['techWaves', landRivalWaves]` directly after `['business', yearlyBusiness]` with a one-line comment. `life.ts`: add `...waveWorldFlags(n),` after `...heavyWorldFlags(n),` (comment: waves and the settled factors are world state too) and the import. `nextYear` reaches `advanceTechWaves` through `yearlyBusinessImpl`; a test that moves `g.year` by hand may call it directly (idempotent).
- [ ] **Step 4: `landRivalWaves(g)` and the feed in `tech-waves.ts`.** `landRivalWaves`: return unless `Math.round(g.year) > PRESENT_YEAR`; over `businessAssets(g)` in order take distinct `(industry, marketKey(b))` pairs (at most 24); skip a pair when a stored wave has the trade in `WAVE_KINDS[w.kind].core` and `w.year >= year - 3`; draw `rivalWave(`${familyId(g.lifeId)}${outcomeTag(g, year)}`, trade, year)`; on a landing `announceWave(g, { kind, source: 'rival', origin: `${trade}|${market}`, name: WAVE_KINDS[kind].label, size, market, home: b.countryId, year })`. Feed, inside the per-wave step of `advanceTechWaves` (D17): for source not 'workshop' and not 'race', when the step's delivery gain is above 0 and the wave has a `home` (or a country `market`), `recordEconomicActivity(g, `wave:${w.id}:${year}`, home, WAVE_KINDS[w.kind].core[0], { innovation: Math.min(0.3, 0.1 * w.size * gain) })`.
- [ ] **Step 5: Run it to see it pass:** `npx vitest run test/tech-waves-wiring.test.ts test/tech-waves.test.ts`. Expected: all PASS.
- [ ] **Step 6: Regression.** `npm run typecheck`, then `npx vitest run test/hedge-year.test.ts test/heavy-handoff.test.ts test/life.test.ts test/living-economy.test.ts test/save-schema.test.ts test/time-machine.test.ts test/fuzz-regressions.test.ts test/market-events.test.ts` (heavy-handoff 12.5 s, life 10.6 s, living-economy 17.7 s, save-schema 12.8 s, fuzz-regressions 13.4 s, market-events 9.5 s; hedge-year and time-machine were not timed).
- [ ] **Step 7: Commit**
```bash
git add src/game/business/tech-waves.ts src/game/business/yearly.ts src/game/aging.ts src/game/life.ts test/tech-waves-wiring.test.ts
git commit -m "feat(waves): yearly step, rival landings, macro feed and heir carry" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Tq5bMwVNBuT54ZtqpiXV13"
```

## Task 4: The readers

**Files:**
- Modify: `src/game/business/tech-waves.ts`, `src/game/business/economy.ts` (`marketCtxFor`, `valuationOf`), `src/game/business/dynamics.ts` (`nationalMarket`), `src/game/business/state.ts` (`BizState`, `normalizeBiz`), `src/game/business/deeptech-core.ts` (`IndustryCycle`, `industryCycle`, `operatingValue`), `src/game/business/economic-actors.ts` (`advanceActor`, `advanceRivals`), `src/game/business/competition.ts`, `src/game/business/yearly.ts`, `src/game/npc-lives.ts`
- Test: `test/tech-waves-readers.test.ts`

**Interfaces:**
- Consumes: Task 2 (`waveFactorsFor`, `waveFactors`, `readTechWaves`, `roleOf`), `FACTOR_BOUNDS`, `marketKey`.
- Produces: `stampWave(g: GameState, b: BizState, fiscal: number): void`; `historyFactors(trade: string, market: string, year: number): MarketFactors` (history only, damped when `market === 'world'`); `entrantsDue(g: Pick<GameState, 'flags'>, trade: string, market: string): { id: string; wave: TechWave }[]`; `type WaveStamp = { v: number; y: number }` and `BizState.wave?: WaveStamp` (`state.ts`); `IndustryCycle.wave: number`; `nationalMarket(...)` also returns `wave: MarketFactors`; `advanceActor(old, r, m, opening, year, wave: MarketFactors)`.

- [ ] **Step 1: Write the failing tests** `test/tech-waves-readers.test.ts`. Shared: `AI(o)` = the Task 2 `W` literal; `put(g, ...w)` sets `g.flags.techWaves = J(w)`; `adult`, `company`, `nextYear` (`./market-kit`); `nationalMarket`, `marketCtxFor`, `valuationOf`, `readBiz`, `bizOf`, `normalizeBiz`, `addHeavy`, `breakthroughsFor` from their modules.

```ts
describe('company demand and costs (marketCtxFor, nationalMarket)', () => {
  it('multiplies the potential by the wave demand and is bit-identical with no wave', () => {
    const g = adult(5, 2033, 'us'); const a = company(g, 'dataCenter'); nextYear(g); const b = readBiz(g, a), y = g.year, none = marketCtxFor(g, b, y).pot
    put(g, AI({ year: 2030, last: y })); expect(marketCtxFor(g, b, y).pot).toBeCloseTo(none * 1.06, 6)        // supply: 1 + 0.2 x 0.5 x 0.6
    delete g.flags.techWaves; expect(marketCtxFor(g, b, y).pot).toBe(none)
  })
  it('a heavy wave leaves its origin trade at exactly the heavyPulse potential but moves a disrupted neighbour', () => {
    const g = adult(5, 2030, 'us'); const a = company(g, 'software'), m = company(g, 'marketing'); nextYear(g); const y = g.year
    addHeavy(g, 'software', 'world', { family: breakthroughsFor('software')[0].name, year: 2031, years: 5, quality: 80, cost: 3e6, by: a.id })
    const base = marketCtxFor(g, readBiz(g, a), y).pot, mBase = marketCtxFor(g, readBiz(g, m), y).pot
    put(g, AI({ source: 'heavy', skip: 'software', origin: 'heavy.software|world#x', year: 2031, last: y }))
    expect(marketCtxFor(g, readBiz(g, a), y).pot).toBe(base); expect(marketCtxFor(g, readBiz(g, m), y).pot).toBeCloseTo(mBase * 0.925, 6)   // disrupted: 1 - 0.25 x 0.3
  })
  it('heavyPulse x wave demand is clamped to 1.8', () => {
    const g = adult(5, 2033, 'us'); const a = company(g, 'dataCenter'); nextYear(g); const y = g.year, b = readBiz(g, a), none = marketCtxFor(g, b, y + 10).pot
    addHeavy(g, 'dataCenter', 'us', { family: breakthroughsFor('dataCenter')[0].name, year: 2034, years: 5, quality: 80, cost: 3e6, by: a.id })
    put(g, ...Array.from({ length: 3 }, (_, i) => AI({ id: `c${i}`, kind: 'cloud', size: 1, hype: 1, delivery: 1, year: 2030, last: y })))
    expect(marketCtxFor(g, b, y + 10).pot / none).toBeLessThanOrEqual(1.8 + 1e-9)
  })
  it('moves costs by 1 - 0.1 x size x delivery for a core trade, never demand, stops at the 0.75 floor, and honours reach', () => {
    const g = makeTestGame(1); const n0 = nationalMarket(g, 'aiLab', 'us', 2034); put(g, AI()); const n1 = nationalMarket(g, 'aiLab', 'us', 2034)
    expect(n1.demand).toBe(n0.demand); expect(n1.costs / n0.costs).toBeCloseTo(0.97, 6)
    put(g, ...Array.from({ length: 30 }, (_, i) => AI({ id: `c${i}`, size: 1, hype: 1, delivery: 1 }))); expect(nationalMarket(g, 'aiLab', 'us', 2034).costs / n0.costs).toBeCloseTo(0.75, 6)
    const c0 = nationalMarket(g, 'telecom', 'jp', 2034).costs   // a national trade: a world wave counts in full, a country wave abroad at 0.35 + 0.4 x delivery
    put(g, AI({ kind: 'mobilephone', source: 'workshop', market: 'world' })); expect(nationalMarket(g, 'telecom', 'jp', 2034).costs / c0).toBeCloseTo(0.97, 6)
    put(g, AI({ kind: 'mobilephone', source: 'workshop', market: 'us' })); expect(nationalMarket(g, 'telecom', 'jp', 2034).costs / c0).toBeCloseTo(1 - (0.35 + 0.4 * 0.6) * 0.03, 6)
  })
})

describe('valuation: the stamp, history and the clamp', () => {
  const book = (g: GameState, industry: string, year: number) => { const b = bizOf(g, createBusinessAsset(g, 'Co', newBiz(g, industry, 'us', 'Chicago', { cash: 0 }), 1e6))
    b.history = [year - 2, year - 1, year].map((y) => ({ year: y, revenue: 50e6, profit: 10e6, tax: 0, units: 1e4, price: 5000, staff: 50, valuation: 0, outlets: 1 })); return b }
  it('follows a stamp for the last booked year only, clamped, validated, and ignored for a listed company', () => {
    const g = makeTestGame(1), b = book(g, 'realEstate', 2033), base = valuationOf(b)
    expect(valuationOf({ ...b, wave: { v: 1.3, y: 2033 } }) / base).toBeCloseTo(1.3, 2); expect(valuationOf({ ...b, wave: { v: 1.3, y: 2032 } })).toBe(base)
    expect(valuationOf({ ...b, wave: { v: 99, y: 2033 } }) / base).toBeLessThanOrEqual(3 + 1e-9)
    for (const v of [NaN, Infinity, 'x']) expect(valuationOf({ ...b, wave: { v, y: 2033 } as never })).toBe(base)
    expect(valuationOf({ ...b, public: true, wave: { v: 2, y: 2033 } })).toBe(valuationOf({ ...b, public: true }))
    const wv = waveFactorsFor(g, 'software', 'world', 2011).value, s = book(g, 'software', 2011)   // no stamp: history is read directly; a stamp overrides and already includes it
    expect(wv).toBeGreaterThan(1.1); expect(Math.abs(valuationOf(s) / valuationOf({ ...s, wave: { v: wv, y: 2011 } }) - 1)).toBeLessThan(1e-9); expect(valuationOf({ ...s, wave: { v: 1, y: 2011 } })).toBeLessThan(valuationOf(s))
  })
  it('yearlyBusinessImpl stamps the booked year, deletes a neutral stamp, writes none without a wave, and never stamps a listed company', () => {
    const g = adult(5, 2033, 'us'); const a = company(g, 'dataCenter'); put(g, AI({ year: 2030, last: 2033 })); nextYear(g)
    expect(bizOf(g, a).wave).toEqual({ v: expect.closeTo(1.0612, 3), y: 2033 })
    delete g.flags.techWaves; nextYear(g); expect('wave' in bizOf(g, a)).toBe(false)
    const pub = bizOf(g, a); pub.public = true; pub.wave = { v: 2, y: 2000 }; put(g, AI({ year: 2030, last: g.year })); stampWave(g, pub, g.year - 1); expect(pub.wave).toBeUndefined()
  })
  it('an NPC company books and stamps through the same call', () => {
    const g = adult(5, 2033, 'gb'); company(g, 'dataCenter', { name: 'Player DC' }); nextYear(g); nextYear(g)   // world() of test/heavy-arrivals.test.ts
    const friend = createPerson(g, { relation: 'friend', firstName: 'Adam', age: 30, money: 80_000_000, occupation: 'Engineer', relationship: 90 })
    const life = initializeNpc(g, friend); expect(startNpcCompany(g, friend, 'dataCenter')).toBe(true)
    const y = g.year; put(g, AI({ year: 2030, last: y + 1 })); g.year = y + 1; npcBusinessYear(g, friend, life); expect(npcCompany(friend, g.year)!.b.wave).toEqual({ v: expect.closeTo(1.0612, 3), y })
  })
})

describe('BizState.wave on load', () => {
  const nb = (wave: unknown, industry = 'restaurant') => normalizeBiz({ industry, countryId: 'us', city: 'Chicago', outlets: [{ countryId: 'us', city: 'Chicago', count: 1, opened: 2020 }], wave } as unknown as Record<string, Json>, 2026)
  it('keeps a valid stamp clamped, drops junk and deep tech, and valuationOf ignores a damaged stamp on a raw current-version record', () => {
    expect(nb({ v: 1.2, y: 2030 }).wave).toEqual({ v: 1.2, y: 2030 }); expect(nb({ v: 99, y: 2030 }).wave).toEqual({ v: 3, y: 2030 })
    for (const j of [7, 'x', null, [], {}, { v: 'x', y: 2030 }, { v: Infinity, y: 2030 }, { v: 1.2 }]) expect('wave' in nb(j)).toBe(false)
    expect('wave' in nb({ v: 1.2, y: 2030 }, 'aiLab')).toBe(false)
    const g = makeTestGame(1), a = createBusinessAsset(g, 'Raw', newBiz(g, 'restaurant', 'us', 'Chicago', { cash: 0 }), 1e6), b = bizOf(g, a)
    b.history = [2031, 2032, 2033].map((y) => ({ year: y, revenue: 5e6, profit: 1e6, tax: 0, units: 1e4, price: 50, staff: 50, valuation: 0, outlets: 1 })); const base = valuationOf(b)
    ;(a.details as Record<string, Json>).wave = { v: 'x', y: 2033 }; expect(valuationOf(bizOf(g, a))).toBe(base)
  })
})

describe('deep tech: industryCycle', () => {
  it('adds the value factor only, keeps demand, price, z and the seed, and the value stays within 0.3-3', () => {
    const g = makeTestGame(3); g.year = 2034; const c0 = industryCycle(g, 'aiLab', 2034); put(g, AI()); const c1 = industryCycle(g, 'aiLab', 2034)
    expect([c1.demand, c1.price, c1.z, c1.label]).toEqual([c0.demand, c0.price, c0.z, c0.label]); expect([c0.wave, c1.wave]).toEqual([1, near(1.126)]); expect(c1.value).toBeCloseTo(Math.min(3, c0.value * 1.126), 6)
    put(g, ...Array.from({ length: 30 }, (_, i) => AI({ id: `c${i}`, size: 1, hype: 1, delivery: 1 }))); expect(industryCycle(g, 'aiLab', 2034).value).toBeLessThanOrEqual(3)
  })
  it('lifts the lab\'s tech value and its term sheet, and never double counts through the stamp', () => {
    const g = adultIn('us', 5e9, 3, 90, 2034); const a = dtCompany(g, 'aiLab', { stage: 3, level: 80 }), b = bizOf(g, a), t = techOf(b)   // `adultIn` (line 36) and `company` (line 135, renamed `dtCompany` here so it does not shadow market-kit's) are copied from test/deeptech.test.ts
    const rng = g.rng; refreshTechValue(g, b, t); const v0 = valuationOf(b), pre0 = makeTermSheet(g, a, b, t).pre   // a term sheet draws its roll from g.rng, so both sheets start from the same stream
    put(g, AI({ year: 2030 })); g.rng = rng; refreshTechValue(g, b, t); expect(valuationOf(b)).toBeGreaterThan(v0); expect(makeTermSheet(g, a, b, t).pre).toBeGreaterThan(pre0)
    stampWave(g, b, g.year - 1); expect(b.wave).toBeUndefined(); expect(valuationOf({ ...b, wave: { v: 2, y: g.year - 1 } })).toBe(valuationOf(b))
  })
})

describe('rivals, entrants and the hot path', () => {
  it('a core rival gains from lower costs, a disrupted one cannot gain, a trade with no role is bit-identical', () => {
    const run = (industry: string, on: boolean) => { const x = fixture(2031, industry); const prior = advanceRivals(x.g, x.opening, [], 2030); if (on) put(x.g, AI({ year: 2030, last: 2031 })); return actorFor(industry, advanceRivals(x.g, x.opening, prior, 2031)) }   // fixture and actorFor of test/world2-rivals.test.ts
    expect(run('aiLab', true).cash).toBeGreaterThan(run('aiLab', false).cash); expect(run('software', true).cash).toBeLessThanOrEqual(run('software', false).cash); expect(run('petCare', true)).toEqual(run('petCare', false))
  })
  it('founds one fast follower per delivery threshold crossed, at most 3, never for heavy waves, once each', () => {
    const g = adult(5, 2034, 'us'); company(g, 'telecom'); put(g, AI({ kind: 'mobilephone', source: 'workshop', year: 2030, last: 2034, delivery: 0.55 }))
    expect(entrantsDue(g, 'telecom', 'us').map((e) => e.id)).toHaveLength(2)
    const ids = () => marketStateOf(readBiz(g, businessAssets(g)[0]))!.extra.filter((x) => x.id.startsWith('xw-')).map((x) => x.id)
    nextYear(g); const first = ids(); expect(first).toHaveLength(2)                                        // founded on the delivery of the booked year, before the step moves it
    nextYear(g); expect(ids().slice(0, 2)).toEqual(first); expect(ids().length).toBeLessThanOrEqual(3)      // the step may have crossed 0.75 meanwhile, so 2 or 3, and the first two are never founded again
    put(g, AI({ kind: 'mobilephone', source: 'workshop', year: 2030, last: g.year, delivery: 0.9 })); nextYear(g); expect(ids()).toHaveLength(3)
    put(g, AI({ kind: 'mobilephone', source: 'heavy', skip: 'telecom', year: 2030, last: g.year, delivery: 0.9 })); expect(entrantsDue(g, 'telecom', 'us')).toEqual([])
  })
  it('bestPlan with a live wave keeps buildCtx at 2 calls and JSON.stringify(g) unchanged', () => {
    const { g, b } = multinational(); put(g, AI({ kind: 'automation', year: 2024, last: 2030 }))   // `multinational()` (it returns { g, b }, a manufacturing company in year 2030) and the `competition` spy are copied from test/plan-search-reads.test.ts
    const ctx = vi.spyOn(competition, 'buildCtx'), before = JSON.stringify(g), rng = g.rng; bestPlan(g, b); expect(ctx.mock.calls.length).toBeLessThanOrEqual(2); expect([JSON.stringify(g), g.rng]).toEqual([before, rng])
  })
})
```

- [ ] **Step 2: Run it to see it fail:** `npx vitest run test/tech-waves-readers.test.ts`. Expected: FAIL (`stampWave`, `entrantsDue` not exported; `wave` missing on `industryCycle`; pot ratios 1).
- [ ] **Step 3: `marketCtxFor` and `nationalMarket`.** `economy.ts` `marketCtxFor`: after the existing `pot` line, `const wv = waveFactorsFor(g, b.industry, ctx.key, year)` and return `pot: wv.demand === 1 ? <the old expression> : pot x clampN(heavy.length ? heavyPulse(heavy, year) x wv.demand : wv.demand, ...FACTOR_BOUNDS.demand)` (no wave means bit-identical). `dynamics.ts` `nationalMarket`: `const wave = waveFactorsFor(g, industry, marketDef(industry).scope === 'world' ? 'world' : country, year)`; costs use `wave.costs === 1 ? events.costs : clampN(events.costs x wave.costs, ...FACTOR_BOUNDS.costs)`; return `wave` beside `events`; leave demand and `nationalCache` alone.
- [ ] **Step 4: The stamp.** `state.ts`: `export type WaveStamp = { v: number; y: number }`, `BizState.wave?: WaveStamp` with a doc comment (v = total value factor 0.3-3, y = fiscal year booked, never on deep tech or listed companies, validate before use); `normalizeBiz` whitelists it inline like `heavyLast` (finite `v` clamped 0.3-3 and rounded to 4 places, finite `y` rounded and clamped 1800-2300, dropped for `isDeepTechIndustry`). `tech-waves.ts`: `historyFactors(trade, market, year)` is `waveFactors(trade, market, year, readTechWaves({ flags: {} }), undefined, market === 'world')`; `stampWave(g, b, fiscal)` deletes `b.wave` for deep tech and `b.public`, else reads `waveFactorsFor(g, b.industry, marketKey(b), fiscal).value`, deletes the stamp when `|v - 1| < 0.005`, else sets `{ v: round4(v), y: fiscal }`. Call it in `yearly.ts` immediately before `const rec0 = recordYear(b, s)` and in `src/game/npc-lives.ts` (`npcBusinessYear`) before `recordYear(b, result.stmt)`, both with `fiscal`. `valuationOf`: for `last = history[history.length - 1]`, when `last && !isDeepTech(b) && !b.public`, `wv` is the stamp's `v` if finite and `ws.y === last.year` (clamped 0.3-3), else `historyFactors(b.industry, marketKey(b), last.year).value`; `mood = clampN(eventValue x wv, ...FACTOR_BOUNDS.value)`.
- [ ] **Step 5: Deep tech.** `IndustryCycle.wave: number` (1 with no wave); `industryCycle`: `const wave = waveFactorsFor(g, ind, 'world', year).value`, `value: wave === 1 ? value : clampN(value x wave, ...FACTOR_BOUNDS.value)`; seed, demand, price, z, label untouched. `operatingValue`: `const ic = industryCycle(g, ind, g.year)`, `cyc = ic.wave === 1 ? ic.value x ev : clampN(ic.value x ev, ...FACTOR_BOUNDS.value)`.
- [ ] **Step 6: Rivals and entrants.** `economic-actors.ts`: `advanceRivals` computes `waveFactorsFor(g, m.industry, m.scope, year)` per market and passes it as a trailing `wave: MarketFactors` (default neutral) to `advanceActor`, which multiplies `fx.demand` and `fx.costs` by it in the final simulating branch only (the one that already computes `fx`; real rivals up to `PRESENT_YEAR` take the recorded-history branch and are left alone). `tech-waves.ts` `entrantsDue(g, trade, market)`: for each dynamic wave with source not 'heavy', `trade` in the core of its kind and `w.market === 'world' || w.market === market`, one entry per threshold `[0.25, 0.5, 0.75][k]` with `w.delivery >= threshold`, id `xw-${hashOf(w.id).toString(36)}-${k}`. `competition.ts`: a private `waveNewcomers(g, a, b, st, year)` called right after `lureNewcomer(...)`: for each `{ id, wave }` of `entrantsDue(g, b.industry, st.key)` whose id is not already in `st.extra` or `st.gone`, push an `ExtraRival` (`origin: 'entrant'`, `founded: year + 1`, `ramp: 3`, `pot: 0.6 + 0.8 x wave.size`, name from `rivalName(s, b.industry, d, hq)` with `s = seeded(`${fam}|wave-entrant|${id}`)`, `fam = familyId(g.lifeId)`, `d = marketDef(b.industry)` and the same eight-try clash loop as `lureNewcomer`, skipping the entrant when the name is still taken or real; hq as `lureNewcomer` picks it), keep the `.slice(-12)` cap, and `log(g, `${name} launched to chase the ${lowerLead(wave.name)} wave.`, 'neutral')`. `readExtra` in `competition-state.ts` keeps any non-empty id and name, so the entrant survives `normalizeBiz` as it is.
- [ ] **Step 7: Run it to see it pass:** `npx vitest run test/tech-waves-readers.test.ts test/tech-waves.test.ts`. Expected: all PASS.
- [ ] **Step 8: Regression (existing suites unchanged).** `npm run typecheck`, then `npx vitest run test/plan-search-reads.test.ts test/market-events.test.ts test/business-save-normalization.test.ts test/economy-sectors.test.ts test/world2-rivals.test.ts test/market-roster.test.ts test/heavy-engine.test.ts test/heavy-arrivals.test.ts test/growth.test.ts test/competition.test.ts test/business-expansion.test.ts test/market-moves.test.ts test/living-economy.test.ts test/deeptech-new-trades.test.ts test/deeptech-review.test.ts test/deeptech-autopilot.test.ts test/fund-vc.test.ts` (6.5, 9.5, 5.7, 1.7, 8.2, 5.6, 13.7, 11.9, 15.8, 20.8, 18.1, 14.9, 17.7, 11.5, 17.9, 11.9, 10.4 s). The two slow deeptech suites run once in Task 5.
- [ ] **Step 9: Commit**
```bash
git add src/game/business/tech-waves.ts src/game/business/economy.ts src/game/business/dynamics.ts src/game/business/state.ts src/game/business/deeptech-core.ts src/game/business/economic-actors.ts src/game/business/competition.ts src/game/business/yearly.ts src/game/npc-lives.ts test/tech-waves-readers.test.ts
git commit -m "feat(waves): readers for demand, costs, valuation, deep-tech heat, rivals and entrants" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Tq5bMwVNBuT54ZtqpiXV13"
```

## Task 5: The writers (heavy, deep tech, Workshop)

**Files:**
- Modify: `src/game/business/tech-wave-data.ts` (tables), `src/game/business/heavy-rd.ts` (`advanceHeavy`), `src/game/business/deeptech-rd.ts` (`RdResult`, `advancePrograms`, `resolveTrial`), `src/game/business/deeptech-sim.ts` (`afterResearch` and its call), `src/game/workshop/launch.ts` (`beatHistory`), `test/tech-wave-data.test.ts`
- Test: `test/tech-waves-writers.test.ts`

**Interfaces:**
- Consumes: `announceWave` (Task 2), `breakthroughByName`, `breakthroughsFor`, `heavyEligible`, `heavyKey`, `programDef`, `frontierScore`, `DRUG_AREAS` (`deeptech-data.ts`), `timesDone`, `ALL_IDEAS`.
- Produces (`tech-wave-data.ts`): `HeavyWave { kind: WaveKind; size: number }`, `HEAVY_WAVES: Readonly<Record<string, HeavyWave>>`, `HEAVY_WAVE_WINDOW = 10`, `heavyWaveFor(trade: string, name: string): HeavyWave | null`; `DeepWave { kind: WaveKind; size: number; name: string; first?: true; autonomy?: number }`, `DEEPTECH_WAVES: Readonly<Record<string, DeepWave>>`, `deepWaveFor(trade: string, programId: string): DeepWave | null`; `WORKSHOP_WAVES: Readonly<Record<string, { kind: WaveKind; size?: number }>>`, `CATEGORY_WAVES: Readonly<Partial<Record<Category, WaveKind>>>`, `workshopWaveFor(def: Pick<IdeaDef, 'id' | 'cat' | 'd' | 'future' | 'real'>): { kind: WaveKind; size: number } | null` (default size `Math.min(0.6, Math.max(0.2, 0.1 + 0.1 * d))`, no runtime import). `RdResult.won: string[]`, `RdResult.approved: Drug[]`.

Table content (decisions; keys are verbatim catalogue names and `PROGRAMS` ids, the completeness tests check them):

```
HEAVY_WAVES  'trade|name': kind size   (19 entries, heavy-eligible only; a pioneer counts up to 10 years after the catalogue `first`)
 dataCenter|Liquid-Cooled GPU Hall: ai .35   dataCenter|Hyperscale Cloud Region: cloud .5   software|Autonomous Agent Platform: ai .5
 software|Hosted Subscription Platform: cloud .4   energy|Fusion Pilot Plant: fusion .6   energy|Grid-Scale Battery Plant: solarbattery .35
 battery|Lithium-Ion Cell Line: solarbattery .5   battery|Solid-State Cell Line: ev .5   solar|Photovoltaic Power Plant: solarbattery .4
 solar|Perovskite Tandem Panels: solarbattery .35   manufacturing|Industrial Robot Cell: automation .4   logistics|Driverless Truck Lanes: automation .45
 ecommerce|Robotic Warehouse Floor: automation .3   ecommerce|Drone Delivery Hub: drones .25   telecom|Satellite-to-Phone Service: space .3
 telecom|Cell Tower Network: mobilephone .45   clinic|AI Scan Reading: ai .3   clinic|Robotic Surgery Theater: automation .3   education|AI Tutor Platform: ai .3
DEEPTECH_WAVES  'trade:programId': kind size 'name'   (routine `nextgen` programs never appear)
 semiconductor:euv chips .45 'Leading-edge chips' | semiconductor:aiChip ai .3 'AI accelerators' | aiLab:frontier ai .6 'A new AI architecture' | aiLab:agents automation .3 'AI agents'
 robotics:humanoid automation .45 'Humanoid robots' | robotics:brain ai .3 'Robot foundation models' | biotech:platform drug .35 'Platform medicine'
 spaceTech:reuse space .5 'Reusable rockets' | spaceTech:crew space .3 'Commercial crewed flight' | electricVehicles:solidState ev .5 'Solid-state batteries'
 electricVehicles:selfdrive automation .4 'Self-driving cars' (autonomy 3) | quantum:qec quantum .35 'Error-corrected qubits' (first) | quantum:advantage quantum .6 'Quantum advantage'
 cybersecurity:aiSec security .25 'AI security copilots' | fusion:netGain fusion .5 'Fusion net energy gain' | fusion:pilot fusion .6 'Fusion on the grid'
 neurotech:firstHuman neuro .4 'Thought-controlled implants' | neurotech:approval neuro .55 'Approved brain implants' | drones:bvlos drones .3 'Beyond-sight drone flights'
 drones:typeCert drones .5 'Air taxis' | carbonCapture:demo carbon .25 'Direct air capture' | carbonCapture:storage carbon .3 'Carbon turned to rock'
WORKSHOP_WAVES by IdeaDef id (size defaults to 0.1 + 0.1 d): fut-fusion-cell fusion .6, fut-superwire fusion .4, fut-dream-recorder neuro .4, fut-pocket-quantum quantum .6,
 fut-organ-printer drug .5, fut-cold-cure drug .4, fut-tooth-gel drug .3, fut-plastic-bin carbon .3, fut-robot-chef automation .4 (nine; fut-float-board, fut-air-umbrella,
 fut-free-chocolate and fut-clean-clothes write nothing); hist-picture-box television, hist-crystal-switch transistor, hist-thinking-machine microcomputer, hist-pocket-telephone
 mobilephone, hist-touch-telephone smartphone, hist-touch-slate smartphone .3. CATEGORY_WAVES (history ideas with no entry): computing microcomputer, energy solarbattery, transport ev, health drug
```

- [ ] **Step 1: Write the failing tests.** Add to `test/tech-wave-data.test.ts` (completeness) and create `test/tech-waves-writers.test.ts`.

```ts
// test/tech-wave-data.test.ts additions
it('HEAVY_WAVES: 15-25 entries, each a real catalogue entry of a heavy-eligible trade, size 0.2-0.6, real kind', () => {
  const keys = Object.keys(HEAVY_WAVES); expect(keys.length).toBeGreaterThanOrEqual(15); expect(keys.length).toBeLessThanOrEqual(25)
  for (const k of keys) {
    const trade = k.slice(0, k.indexOf('|')), name = k.slice(k.indexOf('|') + 1), w = HEAVY_WAVES[k]
    expect(breakthroughsFor(trade).some((x) => x.name === name)).toBe(true); expect(heavyEligible({ industry: trade })).toBe(true)
    expect(isWaveKind(w.kind)).toBe(true); expect(w.size).toBeGreaterThanOrEqual(0.2); expect(w.size).toBeLessThanOrEqual(0.6); expect(EM_DASH.test(name)).toBe(false)
  }
  expect(heavyWaveFor('dataCenter', 'Liquid-Cooled GPU Hall')).toEqual({ kind: 'ai', size: 0.35 }); expect(heavyWaveFor('software', 'Autonomous Agent Platform')!.kind).toBe('ai')
  expect(heavyWaveFor('restaurant', 'Open Kitchen Theater')).toBeNull(); expect(heavyWaveFor('constructor', 'x')).toBeNull()
})
it('DEEPTECH_WAVES: all 12 deep-tech trades, real program ids, no nextgen, size 0.2-0.6, short names', () => {
  expect([...new Set(Object.keys(DEEPTECH_WAVES).map((k) => k.split(':')[0]))].sort()).toEqual([...DEEP_TECH_IDS].sort())
  for (const [k, w] of Object.entries(DEEPTECH_WAVES)) {
    const [t, id] = k.split(':'); expect(programDef(t as DeepTechIndustry, id)).toBeDefined(); expect(id).not.toBe('nextgen')
    expect(isWaveKind(w.kind)).toBe(true); expect(w.size).toBeGreaterThanOrEqual(0.2); expect(w.size).toBeLessThanOrEqual(0.6); expect(w.name.length).toBeLessThanOrEqual(60); expect(EM_DASH.test(w.name)).toBe(false)
  }
})
it('WORKSHOP_WAVES: real idea ids, nine of the thirteen future ideas mapped, four novelties silent, sizes 0.2-0.6', () => {
  const ids = new Set(ALL_IDEAS.map((i) => i.id)); for (const [id, w] of Object.entries(WORKSHOP_WAVES)) { expect(ids.has(id)).toBe(true); expect(isWaveKind(w.kind)).toBe(true) }
  const fut = ALL_IDEAS.filter((i) => i.future); expect(fut).toHaveLength(13); expect(fut.filter((i) => workshopWaveFor(i)).length).toBe(9)
  for (const id of ['fut-float-board', 'fut-air-umbrella', 'fut-free-chocolate', 'fut-clean-clothes']) expect(workshopWaveFor(ALL_IDEAS.find((i) => i.id === id)!)).toBeNull()
  for (const i of ALL_IDEAS) { const w = workshopWaveFor(i); if (w) { expect(w.size).toBeGreaterThanOrEqual(0.2); expect(w.size).toBeLessThanOrEqual(0.6) } }
})
```

```ts
// test/tech-waves-writers.test.ts. File-local helpers wrap the named fixtures and loop `for (let seed = 1; seed <= 80; seed++)` until the roll wins:
// launch/launchFollower/launchFlop (biz() and the seed loop of test/heavy-project.test.ts, project as in test/heavy-voice.test.ts:68), labYear/trainYear/approveYear
// (lab() of test/growth.test.ts:653 with simulateDeepTechYearImpl(g, a, b, g.year, 0)), beat (inventor/give/license/idea of test/workshop-fixtures.ts as in test/workshop-race.test.ts:50-76)
describe('heavy launches', () => {
  it('a pioneer launch of a listed entry writes one heavy wave', () => {
    const { g, rec } = launch('software', 'Autonomous Agent Platform', 2030)
    expect(readTechWaves(g)).toHaveLength(1)
    expect(readTechWaves(g)[0]).toMatchObject({ source: 'heavy', kind: 'ai', market: 'world', name: 'Autonomous Agent Platform', size: 0.5, skip: 'software', year: rec.year, origin: 'heavy.software|world#Autonomous Agent Platform' })
  })
  it('a follower, a flop, an unlisted entry and a launch after the window write nothing', () => {
    expect(readTechWaves(launchFollower().g)).toHaveLength(1)                              // the second company's launch of the same family adds none
    expect(readTechWaves(launch('restaurant', 'Open Kitchen Theater', 2030).g)).toEqual([]); expect(readTechWaves(launchFlop().g)).toEqual([])
    expect(readTechWaves(launch('software', 'Hosted Subscription Platform', 2040).g)).toEqual([])   // first 1999 + 10 < 2040
  })
})

describe('deep-tech milestones', () => {
  const FUSION = { stage: 1, level: 80, done: ['magnets', 'shot'] }
  it('a breakthrough-class win writes one wave, for a hired-manager lab too; a routine win, a repeat or a second qec writes none', () => {
    const { g, a } = labYear('fusion', 'netGain', FUSION)
    expect(readTechWaves(g)).toHaveLength(1); expect(readTechWaves(g)[0]).toMatchObject({ source: 'deeptech', kind: 'fusion', market: 'world', name: 'Fusion net energy gain', size: 0.5, origin: `${a.id}#netGain`, home: 'us' })
    expect(readTechWaves(labYear('fusion', 'netGain', FUSION, { manager: true }).g)).toHaveLength(1); expect(readTechWaves(labYear('fusion', 'nextgen', {}).g)).toEqual([])
    expect(readTechWaves(labYear('quantum', 'advantage', { qubits: 200, logical: 4 }).g)[0]).toMatchObject({ name: 'Quantum advantage', size: 0.6 }); expect(readTechWaves(labYear('quantum', 'qec', { done: ['qec'] }).g)).toEqual([])
  })
  it('the first frontier model of a lab writes "Frontier AI" at training time, a second one does not', () => {
    const { g, a } = trainYear({ stage: 3, level: 80, models: [] }), [w] = readTechWaves(g)
    expect(w).toMatchObject({ kind: 'ai', name: 'Frontier AI', size: 0.4 }); expect(w.origin).toMatch(new RegExp(`^${a.id}#model\\d+$`)); expect(readTechWaves(trainYear({ stage: 3, level: 80, models: [frontierModel()] }).g)).toEqual([])
  })
  it('an approved drug with peak >= 4 writes a drug wave sized 0.2 + 0.04 peak, capped at 0.5; peak 3 writes none', () => {
    const [w] = readTechWaves(approveYear({ peak: 6 }).g); expect(w).toMatchObject({ kind: 'drug', size: near(0.44) }); expect(w.name).toMatch(/^A new drug for /); expect(readTechWaves(approveYear({ peak: 3 }).g)).toEqual([])
  })
})

describe('Workshop', () => {
  it('a history first writes a workshop wave and a future win a race wave, with no second modal; an unmapped or silent idea writes nothing', () => {
    expect(readTechWaves(beat('hist-pocket-telephone', 1968).g)[0]).toMatchObject({ source: 'workshop', kind: 'mobilephone', origin: 'hist-pocket-telephone', market: 'world', size: 0.6 })
    const f = beat('fut-cold-cure'); expect(readTechWaves(f.g)[0]).toMatchObject({ source: 'race', kind: 'drug', size: 0.5 }); expect(f.g.queue.filter((m) => /Beat History/.test(JSON.stringify(m)))).toHaveLength(1)
    for (const id of ['hist-color-cube', 'fut-float-board']) expect('techWaves' in beat(id).g.flags).toBe(false)
  })
})
```

- [ ] **Step 2: Run to see it fail:** `npx vitest run test/tech-wave-data.test.ts test/tech-waves-writers.test.ts`. Expected: FAIL (`HEAVY_WAVES` and the others not exported; no wave is written).
- [ ] **Step 3: Tables.** Add them to `tech-wave-data.ts` exactly as listed (flat records; lookups use `Object.hasOwn`; `workshopWaveFor` checks the id entry, then `CATEGORY_WAVES` only when `def.real !== undefined`; types by `import type`; no em-dash).
- [ ] **Step 4: Heavy hook.** In `advanceHeavy` keep `if (pioneer && a) announceLaunch(...)` and add inside the same `if`: `const hw = heavyWaveFor(b.industry, p.name), def = breakthroughByName(p.name)`; when both exist and `rec.year - def.first <= HEAVY_WAVE_WINDOW`, `announceWave(g, { kind: hw.kind, source: 'heavy', origin: `${heavyKey(b.industry, market)}#${p.name}`, name: p.name, size: hw.size, market, year: rec.year, home: b.countryId })`. No new export, no news.
- [ ] **Step 5: Deep-tech hook.** `deeptech-rd.ts`: `RdResult` gains `won: string[]` and `approved: Drug[]` (initialised `[]` in the `out` literal); push `p.id` right after `t.done.push(p.id)` in the non-trial win branch and the drug right after `d.approved = g.year` in `resolveTrial`; no draw is added. `deeptech-sim.ts`: `afterResearch(g, a, b, t, headlines, newModel, stageBefore, runs, won: readonly string[], approved: readonly Drug[])`, call site passes `rd0.won, rd0.approved`; call a new private `announceBreakthroughs(g, a, b, t, won, approved, newModel)` right before `if (headlines.length === 0 && newModel === 0) return` so hired-manager labs count. It: for each won id `deepWaveFor(b.industry, id)`, skipping a `first` wave unless `timesDone(t, id) === 1` and an `autonomy` wave unless `t.autonomy >= w.autonomy`, then `announceWave(g, { kind, source: 'deeptech', origin: `${a.id}#${id}`, name, size, market: 'world', home: b.countryId })`; for biotech approvals with `d.peak >= 4`, kind 'drug', name `A new drug for ${DRUG_AREAS.find((x) => x.id === d.area)?.label ?? 'disease'}`, size `clampN(0.2 + 0.04 d.peak, 0.2, 0.5)`, origin `${a.id}#drug${d.id}`; for an aiLab model `m = t.models.find(x => x.gen === newModel)` with `m.score >= frontierScore(m.year)` and no other model of the lab at or above `frontierScore` of its own year, kind 'ai', name 'Frontier AI', size 0.4, origin `${a.id}#model${m.gen}`.
- [ ] **Step 6: Workshop hook.** At the end of `beatHistory` (after the `I beat history` log) call a private `announceWorkshopWave(g, def)` in `launch.ts`: `const w = workshopWaveFor(def)`; when present `announceWave(g, { kind: w.kind, source: def.future ? 'race' : 'workshop', origin: def.id, name: def.name, size: w.size, market: 'world' })`. The existing modal stays the only notice.
- [ ] **Step 7: Run to see it pass:** `npx vitest run test/tech-wave-data.test.ts test/tech-waves-writers.test.ts`. Expected: all PASS.
- [ ] **Step 8: Regression.** `npm run typecheck`, then `npx vitest run test/heavy-data.test.ts test/heavy-project.test.ts test/heavy-story.test.ts test/heavy-none.test.ts test/heavy-voice.test.ts test/heavy-handoff.test.ts test/deeptech-new-trades.test.ts test/deeptech.test.ts test/deeptech-fusion.test.ts test/growth.test.ts test/world2-business-supply.test.ts test/workshop-race.test.ts test/voice-guards.test.ts` (6.3, 41.7, 43.1, 12.4, 12.0, 12.5, 11.5, 149.1, 122.2, 15.8, 7.7, 10.3, 2.5 s; the two deeptech suites also cover Task 4's `industryCycle` and run only here).
- [ ] **Step 9: Commit**
```bash
git add src/game/business/tech-wave-data.ts src/game/business/heavy-rd.ts src/game/business/deeptech-rd.ts src/game/business/deeptech-sim.ts src/game/workshop/launch.ts test/tech-wave-data.test.ts test/tech-waves-writers.test.ts
git commit -m "feat(waves): heavy launches, deep-tech milestones and Workshop firsts write waves" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Tq5bMwVNBuT54ZtqpiXV13"
```

## Task 6: The surface (lines, news, antitrust, era filter, voice)

**Files:**
- Modify: `src/game/business/tech-waves.ts` (`waveLines`, `waveScrutiny`, news inside `announceWave`), `src/game/history/market-events.ts` (export `signed`), `src/game/business/yearly.ts` (`marketNote`), `src/game/business/deeptech-sim.ts` (`techMarketNote`), `src/game/business/market-menu.ts` (`overviewMenu`), `src/game/business/competition.ts` (`antitrustOf` and its `marketViewOf` caller), `src/game/business/competition-events.ts` (the `antitrustOf` caller), `src/ui/minigames/AnnualReport.tsx`, `test/tech-waves.test.ts` (voice block)
- Test: `test/tech-waves-surface.test.ts`

**Interfaces:**
- Consumes: `effectsOf` (Task 2), `historyWaveStates`, `pushMarketNews`, `readMarketNews`, `anachronismsIn` (`src/game/events/era.ts`), `businessAssets`, `readBiz`, `marketKey`.
- Produces: `waveLines(g: Pick<GameState, 'flags' | 'year'>, b: Pick<BizState, 'industry' | 'countryId'>, year: number = g.year): string[]`; `waveScrutiny(g: Pick<GameState, 'flags'>, trade: string): number` (1 with no wave, at most 2); `antitrustOf(b, share, year, priceRatio = 1, rivals?, scrutiny = 1)`; private `announceWaveNews(g: GameState, w: TechWave): void` called by `announceWave` for a new wave; `export function signed(f: number): string` in `market-events.ts`.

- [ ] **Step 1: Write the failing tests** `test/tech-waves-surface.test.ts` and a `voice` block in `test/tech-waves.test.ts`. Shared: `put`, `AI`, `near` as in Task 4; `bizFor(trade)` builds a `BizState` with `newBiz` as `test/market-events.test.ts` does; `marketNoteOf(g, a)` is `reportData(g, a, readBiz(g, a)).marketNote` (`reportData` is exported from `yearly.ts`, as `test/talent-business.test.ts` imports it); `adultIn` and `dtCompany` are copied from `test/deeptech.test.ts` (lines 36 and 135, `company` renamed so it does not shadow market-kit's).

```ts
describe('waveLines', () => {
  const lines = (industry: string, o: Partial<TechWave> = {}) => { const g = makeTestGame(1); g.year = 2035; put(g, AI({ delivery: 0.8, ...o })); return waveLines(g, { industry, countryId: 'us' }) }   // size .5, hype .8, delivery .8: r = .4
  it('writes two sentences with the spec numbers', () => {
    expect(lines('aiLab')).toEqual(['Frontier AI wave. Demand +12%, costs −4%, value +14%.']); expect(lines('dataCenter')).toEqual(['Frontier AI wave. Demand +8%, value +7%.'])
    expect(lines('software')).toEqual(['Frontier AI wave. Demand −10%, value −10%.']); expect(lines('bakery')).toEqual([])
  })
  it('is pure and finite, and shares one empty array when there is nothing to say', () => {
    const g = makeTestGame(1); expect(waveLines(g, { industry: 'aiLab', countryId: 'us' })).toBe(waveLines(g, { industry: 'bakery', countryId: 'us' }))
    put(g, AI()); const before = JSON.stringify(g), rng = g.rng; for (const l of waveLines(g, { industry: 'aiLab', countryId: 'us' }, 2035)) expect(l).not.toMatch(/NaN|undefined|Infinity/)
    expect([JSON.stringify(g), g.rng]).toEqual([before, rng])
  })
  it('skips a line the era filter flags and keeps the rest', () => {
    let skipped = 0
    for (const c of COUNTRIES.map((x) => x.id)) for (const y of [2007, 2009, 2011]) {
      const g = makeTestGame(1); g.year = y; const out = waveLines(g, { industry: 'software', countryId: c }, y)
      for (const l of out) expect(anachronismsIn(l, y, [c])).toEqual([]); if (!out.some((l) => l.startsWith('Smartphones'))) skipped++
    }
    expect(skipped).toBeGreaterThan(0)
  })
})

describe('antitrust scrutiny', () => {
  it('multiplies the chance by 1 + 0.5 x size x delivery for a core trade only, and the 0.5 clamp still binds', () => {
    const g = makeTestGame(1); put(g, AI())
    expect([waveScrutiny(g, 'aiLab'), waveScrutiny(g, 'dataCenter'), waveScrutiny(makeTestGame(1), 'aiLab')]).toEqual([near(1.15), 1, 1])
    const b = bizFor('aiLab'), p1 = antitrustOf(b, 0.6, 2035).p; expect(p1).toBeGreaterThan(0); expect(antitrustOf(b, 0.6, 2035, 1, undefined, 1.15).p).toBeCloseTo(Math.min(0.5, p1 * 1.15), 6)
  })
})

describe('wave news', () => {
  const ai = (g: GameState, source: 'deeptech' | 'rival', origin: string) => announceWave(g, { kind: 'ai', source, origin, name: 'Frontier AI', size: 0.6, market: 'world', home: 'us' })!
  it('a deep-tech wave posts one item and one notice, once', () => {
    const g = adult(5, 2033, 'us'); const a = company(g, 'aiLab'); const w = ai(g, 'deeptech', `${a.id}#frontier`)
    expect(readMarketNews(g).find((n) => n.id === `wave-${w.id}`)).toMatchObject({ industry: 'aiLab', market: 'world', title: 'Frontier AI Wave' })
    expect(readMarketNews(g)[0].text).toBe('Your lab landed frontier AI. Investors expect a lot. Delivery decides the rest.')
    expect(g.queue.filter((m) => m.id === `wave-${w.id}`)).toHaveLength(1); g.queue = []; ai(g, 'deeptech', `${a.id}#frontier`); expect(g.queue).toEqual([]); expect(readMarketNews(g)).toHaveLength(1)
  })
  it('a rival wave posts news only when it touches a player company, with no notice; heavy, workshop and race post none', () => {
    const g = adult(5, 2033, 'us'); company(g, 'dataCenter'); ai(g, 'rival', 'aiLab|world')
    expect(readMarketNews(g)).toHaveLength(1); expect(g.queue.some((m) => String(m.id).startsWith('wave-'))).toBe(false)
    const h = adult(6, 2033, 'us'); company(h, 'restaurant'); ai(h, 'rival', 'aiLab|world'); expect(readMarketNews(h)).toEqual([])
    const none = makeTestGame(2); none.year = 2033; ai(none, 'rival', 'aiLab|world'); expect(readMarketNews(none)).toEqual([])
    const o = adult(7, 2033, 'us'); for (const source of ['heavy', 'workshop'] as const) announceWave(o, { kind: 'ai', source, origin: source === 'heavy' ? 'heavy.software|world#x' : 'idea-1', name: 'Frontier AI', size: 0.4, market: 'world' })
    expect([readMarketNews(o), o.queue]).toEqual([[], []])
  })
})

describe('the screens', () => {
  it('the Annual Report note gains one wave line after the events, and the UI clamp is 520', () => {
    const g = adult(5, 2033, 'us'); const a = company(g, 'dataCenter'); put(g, AI({ year: 2030, last: 2034 })); nextYear(g)   // last 2034 = the year nextYear reaches, so the yearly step leaves the wave's numbers alone
    expect(marketNoteOf(g, a)).toContain('Frontier AI wave. Demand +6%, value +6%.'); expect(readFileSync('src/ui/minigames/AnnualReport.tsx', 'utf8')).toContain("text(d.marketNote, '', 520)")
  })
  it('Market Overview shows at most 3 wave rows and rendering leaves the state and dice alone; a deep-tech report carries a wave line too', () => {
    const g = adult(5, 2033, 'us'); const a = company(g, 'dataCenter'); put(g, ...['ai', 'cloud', 'chips', 'quantum', 'automation'].map((kind, i) => AI({ id: `w${i}`, kind: kind as never, year: 2030, last: 2033 })))
    const before = JSON.stringify(g), rng = g.rng, rows = renderAll(g, a); renderAll(g, a)
    expect(rows.filter((r) => / wave\. Demand /.test(r)).length).toBeLessThanOrEqual(3); expect([JSON.stringify(g), g.rng]).toEqual([before, rng]); expect(rows.join('\n')).not.toMatch(/NaN|undefined|Infinity|\[object/)
    const d = adultIn('us', 5e9, 3, 90, 2034); const lab = dtCompany(d, 'aiLab', { stage: 3, level: 80 }); put(d, AI({ year: 2030, last: 2034 })); expect(techMarketNote(d, bizOf(d, lab), techOf(bizOf(d, lab)))).toContain('Frontier AI wave.')   // `adultIn` and `dtCompany` as in Task 4
  })
})
```

```ts
// test/tech-waves.test.ts: voice block (template() as in test/heavy-voice.test.ts)
describe('voice', () => {
  const lines: [string, 'outcome' | 'text' | 'log' | 'title'][] = [
    ['Your lab landed ${...}. Investors expect a lot. Delivery decides the rest.', 'outcome'], ['A rival landed ${...}. Investors are watching. Delivery decides the rest.', 'outcome'],
    ['${...} Wave', 'title'], ['${...} launched to chase the ${...} wave.', 'log'], ['Frontier AI wave. Demand +9%, costs −3%, value +13%.', 'text'],
  ]
  it('every wave string passes unitFlags and its length cap', () => {
    for (const [t, role] of lines) { expect(unitFlags(t, role)).toEqual([]); if (role === 'log' || role === 'outcome') expect(staticLength(t)).toBeLessThanOrEqual(role === 'log' ? 90 : 120) }
  })
  it('no wave label, history name or deep-tech name holds an em-dash', () => {
    for (const s of [...Object.values(WAVE_KINDS).map((d) => d.label), ...HISTORY_WAVES.map((w) => w.name), ...Object.values(DEEPTECH_WAVES).map((w) => w.name)]) expect(s).not.toMatch(/—|–/)
  })
})
```

- [ ] **Step 2: Run to see it fail:** `npx vitest run test/tech-waves-surface.test.ts test/tech-waves.test.ts`. Expected: FAIL (`waveLines`, `waveScrutiny` not exported; no news posted).
- [ ] **Step 3: `waveLines`.** Pure; return one shared frozen empty array when there are no dynamic waves and no history state. Per entry of `effectsOf(trade, marketKey(b), year, readTechWaves(g))` with any of `|demand - 1|`, `|costs - 1|`, `|value - 1|` at least 0.005, text `${name} wave. Demand ${signed(demand)}, [costs ${signed(costs)}, ]value ${signed(value)}.` (costs only when it moves; add `export` to `signed` in `market-events.ts`); skip the line when `anachronismsIn(text, year, [b.countryId]).length > 0`; sort by `|value - 1|` descending; every number passes `Number.isFinite` first. No em-dash literal.
- [ ] **Step 4: The news.** Private `announceWaveNews(g, w)`, called by `announceWave` after a NEW wave is stored: return for source 'heavy', 'workshop' and 'race'; for 'rival' return unless some `businessAssets(g)` company has `roleOf(w.kind, readBiz(g, a).industry) !== null`; id `wave-${w.id}`, title `${w.name} Wave`, emoji `WAVE_KINDS[w.kind].emoji`, `industry = WAVE_KINDS[w.kind].core[0]`, `market = w.market`, text deeptech `Your lab landed ${lowerLead(w.name)}. Investors expect a lot. Delivery decides the rest.`, rival `A rival landed ${lowerLead(w.name)}. Investors are watching. Delivery decides the rest.`; `pushMarketNews(...)`, and for 'deeptech' only, when it returns true and `g.character.alive` and the id is not queued, push `{ kind: 'notice', id, title, text, emoji, tone: 'good' }` exactly as `announceLaunch` does. No shakeout notice in this release.
- [ ] **Step 5: Antitrust.** `waveScrutiny(g, trade)`: product over dynamic waves whose kind has `trade` in its core of `1 + 0.5 x size x delivery`, clamped `[1, 2]`, exactly 1 with none. `competition.ts` `antitrustOf` gains the trailing parameter `scrutiny = 1` and applies `p = clampN(p x scrutiny, 0, 0.5)` at its existing final clamp; its caller in `marketViewOf` and the one in `competition-events.ts` pass `waveScrutiny(g, b.industry)`. `antitrustChance` is unchanged.
- [ ] **Step 6: Screens.** `yearly.ts` `marketNote`: directly after the events loop `parts.push(...waveLines(g, b, b.last?.year ?? g.year - 1).slice(0, 1))`; `deeptech-sim.ts` `techMarketNote` (add `export`, the test imports it): after the cycle sentence `parts.push(...waveLines(g, b, g.year - 1).slice(0, 1))`; `AnnualReport.tsx`: raise the `marketNote` clamp from 400 to 520; `market-menu.ts` `overviewMenu`: before the `biz.mkt.ov.era.${a.id}` row, `for (const [i, line] of waveLines(g, b).slice(0, 3).entries()) rows.push(info(`biz.mkt.ov.wave.${i}.${a.id}`, line, '\u{1F30A}'))`. Add nothing to the top-level Market & Competition menu (14-15 rows, capped at 16).
- [ ] **Step 7: Run to see it pass:** `npx vitest run test/tech-waves-surface.test.ts test/tech-waves.test.ts`. Expected: all PASS.
- [ ] **Step 8: Regression.** `npm run typecheck`, then `npx vitest run test/voice-guards.test.ts test/market-events.test.ts test/market-screen.test.ts test/competition-era.test.ts test/annualReport.test.ts test/talents-ui.test.ts test/company-events.test.ts test/market-moves.test.ts test/competition.test.ts test/heavy-voice.test.ts test/deeptech-review.test.ts` (2.5, 9.5, 20.5, 37.4, 10.0, n/a, 11.9, 14.9, 20.8, 12.0, 17.9 s; `talents-ui` was not timed).
- [ ] **Step 9: Commit**
```bash
git add src/game/business/tech-waves.ts src/game/history/market-events.ts src/game/business/yearly.ts src/game/business/deeptech-sim.ts src/game/business/market-menu.ts src/game/business/competition.ts src/game/business/competition-events.ts src/ui/minigames/AnnualReport.tsx test/tech-waves-surface.test.ts test/tech-waves.test.ts
git commit -m "feat(waves): report and overview lines, wave news, antitrust scrutiny" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Tq5bMwVNBuT54ZtqpiXV13"
```

## Task 7: Docs

**Files:**
- Modify: `docs/ARCHITECTURE.md`, `README.md`

**Interfaces:** consumes the module and flag names from Tasks 1-6; produces nothing code-side.

- [ ] **Step 1: ARCHITECTURE.md.** (a) In the Layout block after the `business/product-market.ts product-data.ts` entry add `business/heavy-rd.ts heavy-data.ts` (Heavy R&D, flags `heavy.<trade>|<market>`) and `business/tech-waves.ts tech-wave-data.ts history/tech-waves.ts` (Tech waves, flags `techWaves` and `techBase`, `BizState.wave`). (b) End the market-events paragraph with `Tech waves (below) add the same read-only lines.` (c) After the `### Global market and real rivals` subsection add `### Heavy R&D (business/heavy-rd.ts, heavy-data.ts)` (five breakthroughs per trade, `HeavyRecord` in `g.flags['heavy.<trade>|<market>']` through `readHeavy` and `addHeavy`, `heavyPulse` lifts `marketCtxFor`, rivals follow on `heavyArrival`, news in `market.news`, `heavyWorldFlags` carries both to heirs, product companies only through `heavyEligible`) and `### Tech waves (business/tech-waves.ts, tech-wave-data.ts, history/tech-waves.ts)`: the `TechWave` record and its five writers, hype versus delivery, the three roles, `skip`, reach, where each reader applies its factor and clamp (`marketCtxFor` demand, `nationalMarket` costs, `valuationOf` through `BizState.wave`, `industryCycle` value, `advanceRivals`, `antitrustOf`), caches keyed by the raw flag array, `waveWorldFlags` and the heir carry, optional validated fields, `SAVE_SCHEMA` stays 2, listed stocks untouched (release 1b). (d) Change `Start/buy/run companies in 51 industries` to 55.
- [ ] **Step 2: README.md.** Change `Choose from 51 company sectors.` to `Choose from 55 company sectors.` and add one plain sentence after the market-study sentence: breakthroughs (an AI lab's frontier model, a new drug, a reusable rocket, a Workshop first) now move whole markets, suppliers grow, rivals follow, the companies they replace lose customers, and hype that ships nothing unwinds. No version number (release notes and the bump come at integration).
- [ ] **Step 3: Verify.** `grep -c "### Tech waves" docs/ARCHITECTURE.md` prints 1, `grep -c "### Heavy R&D" docs/ARCHITECTURE.md` prints 1, `grep -n "51 industr\|51 company" docs/ARCHITECTURE.md README.md` prints nothing, then `npm run typecheck` and `npx vitest run test/voice-guards.test.ts` (2.5 s; docs are not scanned, the run proves nothing under `src/` changed).
- [ ] **Step 4: Commit**
```bash
git add docs/ARCHITECTURE.md README.md
git commit -m "docs: tech waves and heavy R&D in the architecture notes, 55 trades" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Tq5bMwVNBuT54ZtqpiXV13"
```
