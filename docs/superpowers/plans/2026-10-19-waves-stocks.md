# Tech waves stocks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Other releases are being built in parallel on other branches** and merged at integration (v4.0.0), so keep every edit to a shared hot file (`economy.ts`, `investments.ts`, `shocks.ts`, `politics.ts`, `manage.ts`, `state.ts`, `deeptech-core.ts`, `heavy-rd.ts`, `deeptech-sim.ts`, `timeMachine.ts`, `docs/ARCHITECTURE.md`) minimal, additive and in its own hunk. **Re-read the actual code of every file before editing it**: the line numbers, snippets and runtimes below were read at HEAD `e4b383a` and may have moved.

**Goal:** When a breakthrough lands, listed stocks, index funds, fund returns, single-stock option settlements, the Investing talent's gut and the player's own listed company move with the wave's sector level, and a founder who trades ahead of their own launch is an insider.

**Architecture:** Each release 1 wave remembers its last six steps and its next projected step, so one pure reader (`stockLevelFor`) gives a sector's price level for any year, the same number before and after the yearly step. `invest/wave-stocks.ts` maps the 35 sector ids to trades and folds that level into the two existing seam functions (`shockFactor`, `indexShockFactor`), so quotes, holdings, funds, bets and the gut agree by construction. A one-line market clock, a stock-grade stamp for quoted companies, one insider-case helper in `politics.ts` and three pure presentation reads finish the slice.

**Tech Stack:** TypeScript (strict, `noUnusedLocals`, `noUnusedParameters`; `test/` is typechecked too), Vitest 5, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-19-waves-stocks-design.md` (release 1b: section 4 decisions S1 to S17, section 5 design). Release 1: spec `2026-10-19-tech-waves-design.md` (its section 11 overrides) and plan `2026-10-19-tech-waves.md`, built on this branch (`claude/tech-waves-stocks`). Every suite named below passes at HEAD. **Where this plan and the spec differ, the plan wins** (P1 to P11).

## Decisions that refine the spec (cited by number in the tasks)

- P1 Stack per wave: `L = clamp(S x Product over waves (1 + STOCK_BETA x (v_w - 1)), 0.3, 3)`, with `v_w` one wave's own value factor from `effectsOf` (history rows count only from `PRESENT_YEAR`, S6). One wave gives spec table 5.3 exactly. The spec's `1 + beta x (V - 1)` of a product breaks "settle keeps the level" for two waves (a gap of `0.75 x a x b`, about 3 points for two 20% waves); the per-wave product does not.
- P2 A wave that is about to drop projects `[0, 0, tag]` (zero hype and delivery make every role neutral), so the level read before the dropping step equals the level read after the wave is gone.
- P3 `outcomeTag` and `timelineForks` (`timeMachine.ts`) take `Pick<GameState, 'flags'>` (type-only widening) so the leaf can read the fork tag. `nextStepTag(g, w)` is the one definition of the tag a stored `nx` must match.
- P4 Settled factors keep their reach (S7 holds for a country-scoped heavy wave read abroad): `base['trade|world'].stock` counts in full in every market; `base['trade|<country>'].stock` counts in full at that country and at 0.75 of its strength (a mature wave's reach, `0.35 + 0.4 x 1`) in other countries, never in the `world` market. The spec reads only the exchange's own market, which would drop that level on the settle date abroad.
- P5 The stamp's `y` is the fiscal year (the match key against `last.year`); its `v` is read at `marketYearOf(fiscal)`. Spec 5.6 says "the year is the market year" and means the year `v` is read at.
- P6 `insiderWarning` has no parameter: it is the constant `INSIDER_WARNING` in `tech-wave-data.ts` beside `heavyStartsWave`, so `manage.ts` and `deeptech-menu.ts` never import `politics.ts`. The Heavy R&D confirm shows it only when the launch would still fall inside `HEAVY_WAVE_WINDOW` (launch year `g.year + years`), the writer's own test.
- P7 `marketFamily` moves to `invest/clock.ts` with `marketYearOf` (`fund-model.ts` re-exports both). The clock takes no shock, macro or wave term. The file is created in Task 2 with `marketYearOf`, `marketFamily` and `marketAnchor` (the index tilt of P10 needs the family and anchor), and Task 3 adds `bookedMarketMove` and the edits of `economy.ts` and `fund-model.ts`.
- P8 The news line is `waveNews(g, exKey, year)` (spec 5.8 names the line only). `waveClause` returns the clause without the ` · ` separator, which `marketLine` adds.
- P9 A heavy wave never disrupts its pioneer trade at any exchange (release 1 exempted it only in the wave's own market, which the settle fold also uses). Stock reads drop that one disrupted effect everywhere, so a heavy AI platform's software sector does not recover by itself on the settle date. `waveLevels` is the one place that applies it.
- P10 The index tilt, the market clause and the news line read the sectors of the stocks listed that year (`listedSectors`: `exchangeYear(...).stocks`, each through `companyDef(info, slot, gen).sector`), never `slotPlan(info)`. A real company sits in a slot of another sector: on the US exchange in 2031 17 of 44 slots differ and the plan's `ai` slot holds a bank, so a smartphone wave's tilt reads +1.9% by the plan and +3.2% by the listing (probed). `n` stays `max(4, slotPlan(info).length)`, the divisor `indexShockFactor` already uses. `waveIndexFactor`, `waveClause` and `waveNews` therefore take a whole `GameState`.
- P11 Index options settle through `indexShockFactor` (`computer/money-options.ts` `settleMove`) and so see the tilt step; their premium (`optionPrice`) takes no game state and is unchanged. Task 2 pins both next to the single-stock option.

## Priority 0 defects (C-03, C-04, C-12 in FEATURE-ROADMAP.md): none fixed, none amplified

C-03 (personal gains omit capital-gains tax): this release adds no sell or realize path and no gain channel, only a bounded mark (at most 15% a step) that realizes through the existing paths; a Task 7 test reads the three new files and asserts none calls `addMoney`, `earnIncome`, `realize` or `spend`. C-04 (bond maturity pays the marked price): bonds, savings, gold, property trusts and coins never parse as engine companies, so no level reaches them; a Task 2 test holds a bond through maturity with a live wave and compares the money with a wave-free twin. C-12 (stale booked marks): the stock-grade stamp counts only when its `y` equals the last booked year, else the mood is 1 (Task 4 test), and `L(y)` does not depend on the order of the yearly hooks (Task 1 test).

## Global Constraints

- Level: `STOCK_BETA = 1.5`; `L` clamped to `FACTOR_BOUNDS.value` (0.3 to 3); settled `TechBase.stock` clamped 0.7 to 1.6, missing is 1; index tilt `1 + sum over the stocks listed that year of (L - 1) / n` clamped 0.5 to 1.5 with `n = max(4, slotPlan(info).length)` (P10).
- State: `TechWave.trail` at most 6 points (`[year, hype, delivery]`, oldest first), one `TechWave.nx` (`[hype, delivery, tag]`), at most 64 waves and 64 `techBase` keys; every new field optional, validated by its reader, `Json` has no `undefined` (conditional spreads); `SAVE_SCHEMA` stays 2.
- Clock: from `PRESENT_YEAR` (2026), `exchangeMove(g, c, fiscal)` is the engine move of year `fiscal + 1` (`bookedMarketMove`, clamped -0.6 to 1.2); history years keep today's code.
- Insider: waves written with `by` only, `w.year === g.year`, shares bought in `w.year` or `w.year - 1`, at most 3 cases per wave (largest stakes), skip `mult - 1 < 0.005` or a gain under `local(g, 1000)`, evidence 0.7 own / 0.55 shares / 0.35 crony, karma -6, case id `wave-<hash>`, `office: 'mayor'` (the inert default).
- Determinism: no `g.rng`, `rand`, `chance`, `uid` or `Math.random` in new code; reads never write; the only draws are release 1's `waveDraw` and the existing `chance` calls in `yearlyAbuse` and the insider script.
- Imports: `invest/wave-stocks.ts` imports `invest/engine`, `invest/clock`, `events/era`, `history/market-events` and the leaf `business/tech-wave-factors.ts` only, never `business/tech-waves.ts`; `invest/clock.ts` imports `invest/engine` and `timeMachine` only; `business/wave-insider.ts` takes `roleOf` and `type TechWave` from the leaf, never from `./tech-waves`; `manage.ts` and `deeptech-menu.ts` never import `politics.ts`.
- VOICE (`docs/VOICE.md`): no new em-dash literal anywhere under `src/` (`voice-guards` caps at 24 and it is exactly 24; use `signed()` for minus); caps log 90, outcome 120, scene 140 static characters; contractions; two short sentences; no colon join except labels.
- Checks per task: `npm run typecheck` (about 12 s) and the vitest files named in that task, always `npx vitest run --maxWorkers=1 <files>` (four build tracks share four CPUs), never the full suite, never a file the task does not name. No release notes or version bump here (integration). Runtimes below were measured at HEAD with one worker at low priority; every named existing suite passed there.
- All tasks and reviews run on Sonnet (project `CLAUDE.md`); never parallel Opus. Commit with explicit pathspecs (`git add <files>`, never `-A`); every message ends with a blank line then `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01Tq5bMwVNBuT54ZtqpiXV13`.

## Review Focus

Failure modes the spec implies that no feature test would hit by default, most likely first; each is pinned by the named test.

1. A world with no wave (every new life, every old save): every stock, index, fund, bet and option price is identical to today, and reads leave `JSON.stringify(g)` and the random stream alone (Task 2, `with no wave every factor is exactly 1`).
2. A damaged saved `trail`, `nx` or `stock` (NaN, wrong shapes, 1,000 points, a 200-character tag): reads clamp or drop it, never throw, never write (Task 1, `reads a damaged trail, nx or stock`).
3. A Time Machine jump after a step was stored: the stored `nx` belongs to another timeline, so the level stays flat until the next step is written, and a finished year keeps its level (Task 1, `ignores a stored step that belongs to another timeline`).
4. Coins, pennies, bonds, savings, gold, property trusts and a share-class line under a live wave: the first six ignore it, a bond pays the same at maturity (C-04), a `~B` line moves with its company (Task 2, `coins, pennies, bonds ...`).
5. An heir after a launch: the waves and the level travel, the owner-stamped insider case never does, and a hired CEO or a plain owner is never charged (Task 5, `a plain owner ... is no insider`; Task 7, `an heir inherits the waves and the level but never the case`).
6. An index tilt, clause or news line read off the exchange plan instead of the listing: on the US exchange the plan has an `ai` slot that holds a bank, so a plan-based tilt would credit a sector nobody lists (Task 2, `the index tilt is the mean level of the stocks the Stocks screen lists`; Task 6, the news test names only a listed sector).

## Task 1: The wave remembers (trail, projection, level reader)

**Files:**
- Modify: `src/game/business/tech-wave-factors.ts`, `src/game/business/tech-waves.ts`, `src/game/timeMachine.ts` (two parameter types, P3)
- Test: `test/wave-stocks-level.test.ts` (create)

**Interfaces:**
- Consumes: release 1 `effectsOf`, `noBase`, `readTechWaves`, `readTechBase`, `FACTOR_BOUNDS`, `clampN`, `nextState`, `waveDraw`, `announceWave`, `advanceTechWaves`; `PRESENT_YEAR` (`history/timeline`); `outcomeTag` (`timeMachine`).
- Produces (leaf, re-exported by `tech-waves.ts`): `STOCK_BETA = 1.5`, `TRAIL_POINTS = 6`; `TechWave.trail?: readonly (readonly [number, number, number])[]`; `TechWave.nx?: readonly [number, number, string]`; `TechBase.stock?: number`; `nextStepTag(g: Pick<GameState, 'flags'>, w: Pick<TechWave, 'last'>): string`; `stateAt(w: TechWave, year: number, tag: string): { hype: number; delivery: number }`; `wavesAt(g: Pick<GameState, 'flags'>, year: number): readonly TechWave[]`; `interface WaveLevel { id: string; name: string; level: number }`; `waveLevels(g: Pick<GameState, 'flags'>, trade: string, market: string, year: number): readonly WaveLevel[]` (each live wave's own level `1 + STOCK_BETA x (v - 1)` on a trade, P9 applied; no history rows, no settled part); `stockLevelFor(g: Pick<GameState, 'flags'>, trade: string, market: string, year: number): number`; `waveSignature(g: Pick<GameState, 'flags'>): string`. In `tech-waves.ts`: `interface WaveStep { hype: number; delivery: number; mature: number; stall: boolean; fate: 'live' | 'settle' | 'drop' }`, `stepWave(g: GameState, w: TechWave, year: number): WaveStep`, `projectWave(g: GameState, w: TechWave): readonly [number, number, string]`.

- [ ] **Step 1: Write the failing test** `test/wave-stocks-level.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { addHeavy } from '../src/game/business/heavy-rd'
import { advanceTechWaves, announceWave, nextState, nextStepTag, projectWave, readTechBase, readTechWaves, stateAt, stepWave, STOCK_BETA, stockLevelFor, waveDraw, waveFactorsFor, waveSignature, type TechWave } from '../src/game/business/tech-waves'
import { INDUSTRY_IDS } from '../src/game/data/markets'
import { arriveInPast } from '../src/game/timeMachine'
import type { GameState, Json } from '../src/game/types'
import { makeTestGame } from './helpers'

const W = (o: Partial<TechWave> = {}): TechWave => ({ id: 'race:ai:2031:x', kind: 'ai', name: 'Frontier AI', source: 'race', year: 2031, market: 'world', size: 0.5, hype: 0.8, delivery: 0.6, last: 2031, ...o })
const J = (v: unknown): Json => v as Json
const near = (n: number) => expect.closeTo(n, 6)
const put = (g: GameState, ...w: TechWave[]) => { g.flags.techWaves = J(w) }
/** An id whose seeded draw for `year` is (or is not) a stall year. */
const pick = (g: GameState, stall: boolean, year: number) => { for (let i = 0; ; i++) if (waveDraw(g, `p${i}`, year).stall === stall) return `p${i}` }
const at = (w: TechWave, trade: string, market = 'world', year = 2035) => { const g = makeTestGame(1); put(g, w); return stockLevelFor(g, trade, market, year) }

describe('the level (S2, S3, P1)', () => {
  it('follows spec table 5.3 at size 0.5: core, supply and disrupted at announcement, half delivered, mature, and a bubble that lags then cools', () => {
    expect(STOCK_BETA).toBe(1.5)   // ai: core aiLab, supply semiconductor, disrupted software
    const rows: [number, number, number[]][] = [[0.65, 0, [1.102375, 1.049725, 0.985375]], [0.8, 0.5, [1.1785, 1.0867, 0.8995]], [1, 1, [1.2625, 1.1275, 0.8125]], [0.9, 0.3, [1.17325, 1.08415, 0.93025]], [0.35, 0.3, [1.086625, 1.042075, 0.942625]]]
    for (const [h, d, [core, supply, disrupted]] of rows) { const w = W({ hype: h, delivery: d, last: 2040 }); expect([at(w, 'aiLab'), at(w, 'semiconductor'), at(w, 'software')]).toEqual([near(core), near(supply), near(disrupted)]) }
  })
  it('a heavy wave never disrupts its pioneer trade at any exchange (P9), and still disrupts another trade', () => {
    const w = W({ source: 'heavy', skip: 'software', origin: 'heavy.software|world#Autonomous Agent Platform', hype: 1, delivery: 1, last: 2040 })
    expect([at(w, 'software', 'world'), at(w, 'software', 'us'), at(w, 'marketing', 'us')]).toEqual([1, 1, near(0.8125)])
  })
  it('one wave moves a level by at most 15% in one yearly step, over a sweep of states, sizes, stalls and gains', () => {
    const g = makeTestGame(1); let worst = 0
    for (const size of [0.2, 0.4, 0.6]) for (let h = 0; h <= 1.001; h += 0.1) for (let d = 0; d <= 1.001; d += 0.1) for (const stall of [false, true]) for (const gain of [0, 0.25, 0.3]) {
      const w = W({ size, hype: Math.min(1, h), delivery: Math.min(1, d), last: 2040 }), s = nextState(w, Math.min(1, d + gain), stall, 2041)
      for (const trade of ['aiLab', 'semiconductor', 'software']) {
        const level = (x: TechWave) => { put(g, x); return stockLevelFor(g, trade, 'world', 2035) }
        worst = Math.max(worst, Math.abs(level({ ...w, hype: s.hype, delivery: s.delivery }) / level(w) - 1))
      }
    }
    expect(worst).toBeLessThanOrEqual(0.15)
  })
  it('several waves multiply per wave (P1) inside 0.3 to 3, and 30 waves of size 1 stay inside it for every trade', () => {
    const g = makeTestGame(1), a = W({ id: 'a', last: 2040 }), b = W({ id: 'b', kind: 'chips', last: 2040 }), lvl = () => stockLevelFor(g, 'aiLab', 'world', 2035)
    put(g, a); const la = lvl(); put(g, b); const lb = lvl(); put(g, a, b); expect(lvl()).toBeCloseTo(la * lb, 9)
    put(g, ...Array.from({ length: 30 }, (_, i) => W({ id: `s${i}`, size: 1, hype: 1, delivery: 1, last: 2040 })))
    for (const t of INDUSTRY_IDS) { const L = stockLevelFor(g, t, 'world', 2035); expect(L).toBeGreaterThanOrEqual(0.3); expect(L).toBeLessThanOrEqual(3) }
  })
  it('is exactly 1 with no wave for every trade, market and year, counts history rows only from 2026, and leaves state and the stream alone', () => {
    const g = makeTestGame(1), before = JSON.stringify(g), rng = g.rng
    for (const t of INDUSTRY_IDS) for (const m of ['world', 'us', 'jp']) for (let y = 1946; y <= 2045; y += 7) expect(stockLevelFor(g, t, m, y), `${t} ${m} ${y}`).toBe(1)
    expect(waveFactorsFor(g, 'software', 'world', 2011).value).toBeGreaterThan(1.1)   // the smartphone row is live in 2011 for companies; the stock tables already carry it, so the stock level (1) must not
    expect([JSON.stringify(g), g.rng, waveSignature(g)]).toEqual([before, rng, ''])
  })
})

describe('stateAt and the stored step', () => {
  const w = W({ last: 2033, hype: 0.8, delivery: 0.5, trail: [[2031, 0.65, 0], [2032, 0.72, 0.25], [2033, 0.8, 0.5]], nx: [0.85, 0.6, ''] })
  it('reads the trail up to last (the first point before it), nx after last while the tag matches, else the current state', () => {
    expect([2030, 2031, 2032, 2033].map((y) => stateAt(w, y, ''))).toEqual([{ hype: 0.65, delivery: 0 }, { hype: 0.65, delivery: 0 }, { hype: 0.72, delivery: 0.25 }, { hype: 0.8, delivery: 0.5 }])
    expect([stateAt(w, 2034, ''), stateAt(w, 2040, '')]).toEqual([{ hype: 0.85, delivery: 0.6 }, { hype: 0.85, delivery: 0.6 }])
    expect(stateAt(w, 2034, '~ab')).toEqual({ hype: 0.8, delivery: 0.5 })
    const old = { ...w, trail: undefined, nx: undefined }; expect([stateAt(old, 2032, ''), stateAt(old, 2034, '')]).toEqual([{ hype: 0.8, delivery: 0.5 }, { hype: 0.8, delivery: 0.5 }])
  })
  it('reads a damaged trail, nx or stock as absent or clamped, never throws, never writes', () => {
    const read = (o: Record<string, unknown>) => { const g = makeTestGame(1); g.flags.techWaves = J([{ ...W(), ...o }]); const before = JSON.stringify(g), [x] = readTechWaves(g); expect(JSON.stringify(g)).toBe(before); return x }
    expect([read({ trail: 'x' }).trail, read({ trail: [[1, 2]] }).trail, read({ nx: [0.5, 0.5] }).nx, read({ nx: [NaN, 0.5, ''] }).nx, read({ nx: [0.5, 0.5, 'x'.repeat(200)] }).nx]).toEqual([undefined, undefined, undefined, undefined, undefined])
    expect(read({ trail: [[2031, NaN, 0.2], [2030, 0.5, 0.5], [2031, 9, -3], 'z', [1, 2]] }).trail).toEqual([[2030, 0.5, 0.5], [2031, 1, 0]])
    const flood = read({ trail: Array.from({ length: 1000 }, (_, i) => [2000 + (i % 40), 0.5, 0.5]) }).trail!
    expect(flood.length).toBeLessThanOrEqual(6); expect(flood.every((p, i) => i === 0 || p[0] > flood[i - 1][0])).toBe(true)
    const base = (v: unknown) => { const g = makeTestGame(1); g.flags.techBase = J(v); return readTechBase(g) }
    const b = base({ 'aiLab|world': { demand: 1.1, costs: 0.9, stock: 99 }, 'bakery|us': { demand: 1, costs: 1, stock: 'x' }, 'software|us': { demand: 1, costs: 1, stock: 0 }, 'telecom|us': { demand: 1, costs: 1, stock: 1 } })
    expect([b['aiLab|world'].stock, b['bakery|us'].stock, b['software|us'].stock, b['telecom|us'].stock]).toEqual([1.6, undefined, 0.7, undefined])
  })
  it('ignores a stored step that belongs to another timeline and keeps a finished year (Time Machine)', () => {
    const g = makeTestGame(7); g.year = 2031; announceWave(g, { kind: 'ai', source: 'race', origin: 'x', name: 'Frontier AI', size: 0.5, market: 'world' })
    const lvl = (x: GameState, y: number) => stockLevelFor(x, 'aiLab', 'world', y)
    expect(lvl(g, 2032)).not.toBeCloseTo(lvl(g, 2031), 3)                          // the stored step moves the level
    const now = structuredClone(g); now.year = 2034; const back = arriveInPast(now, structuredClone(g))
    expect(nextStepTag(back, readTechWaves(back)[0])).not.toBe(''); expect(lvl(back, 2031)).toBeCloseTo(lvl(g, 2031), 9); expect(lvl(back, 2032)).toBeCloseTo(lvl(back, 2031), 9)
  })
})

describe('writing the trail and the projection', () => {
  it('announceWave writes the first point and the projection; each step appends one point (at most 6); a second step in the year writes nothing', () => {
    const g = makeTestGame(7); g.year = 2031
    const w = announceWave(g, { kind: 'ai', source: 'race', origin: 'x', name: 'Frontier AI', size: 0.5, market: 'world' })!
    expect(w.trail).toEqual([[2031, near(0.65), 0]]); expect(w.nx![2]).toBe('')
    for (let y = 2032; y < 2042; y++) {
      g.year = y; advanceTechWaves(g); const once = g.flags.techWaves; advanceTechWaves(g); expect(g.flags.techWaves).toBe(once)
      const cur = readTechWaves(g)[0]; if (!cur) break
      expect(cur.trail!.length).toBeLessThanOrEqual(6); expect(cur.trail![cur.trail!.length - 1]).toEqual([y, near(cur.hype), near(cur.delivery)])
    }
  })
  it('stepWave is the delivery and nextState path advanceTechWaves ran inline, and projectWave is stepWave at last + 1 with the fork tag', () => {
    const g = makeTestGame(7); g.year = 2032; const w = W({ id: pick(g, false, 2032) }), d = waveDraw(g, w.id, 2032), s = stepWave(g, w, 2032)
    expect(s).toMatchObject({ stall: false, delivery: near(Math.min(1, w.delivery + 0.08 + 0.22 * d.u)), fate: 'live' })
    const p = projectWave(g, w); expect([p[0], p[1], p[2]]).toEqual([near(s.hype), near(s.delivery), ''])
  })
  it('a settling wave keeps its level in the settle year and after (stock in techBase, P1), and a dropping wave projects neutral (P2)', () => {
    const g = makeTestGame(7); g.year = 2032; const w = W({ id: pick(g, false, 2032), hype: 1, delivery: 1, mature: 4 }); put(g, { ...w, nx: projectWave(g, w) })
    const lv = (x: GameState, y: number) => [stockLevelFor(x, 'aiLab', 'world', y), stockLevelFor(x, 'software', 'world', y)], before = lv(g, 2032)
    advanceTechWaves(g); expect(readTechWaves(g)).toEqual([]); expect(readTechBase(g)['aiLab|world'].stock).toBeCloseTo(1.2625, 6)
    for (const y of [2032, 2033, 2050]) expect(lv(g, y)).toEqual(before.map(near))          // no scheduled fade (S7)
    const d = makeTestGame(7); d.year = 2032; const dying = W({ id: pick(d, true, 2032), year: 2026, hype: 0.05, delivery: 0.02 }); put(d, { ...dying, nx: projectWave(d, dying) })
    expect(projectWave(d, dying)).toEqual([0, 0, '']); expect(stockLevelFor(d, 'aiLab', 'world', 2032)).toBe(1); advanceTechWaves(d); expect(readTechWaves(d)).toEqual([]); expect(stockLevelFor(d, 'aiLab', 'world', 2032)).toBe(1)
  })
  it('reads the same level before and after the yearly step for heavy, rival, race and workshop waves, year after year (S3)', () => {
    const cases = [{ source: 'heavy', origin: 'heavy.software|world#Autonomous Agent Platform' }, { source: 'rival', origin: 'aiLab|world' }, { source: 'race', origin: 'fut-fusion-cell' }, { source: 'workshop', origin: 'hist-touch-slate' }] as const
    for (const c of cases) for (const seed of [1, 2, 3]) {
      const g = makeTestGame(seed); g.lifeId = `order-${seed}`; g.year = 2031   // the seeded draws follow the family id, not g.rng, so each seed needs its own
      if (c.source === 'heavy') addHeavy(g, 'software', 'world', { family: 'Autonomous Agent Platform', year: 2031, years: 4, quality: 80, cost: 1e6, by: 'biz1' })
      announceWave(g, { kind: 'ai', source: c.source, origin: c.origin, name: 'Frontier AI', size: 0.5, market: 'world' })
      const read = (y: number) => [stockLevelFor(g, 'aiLab', 'world', y), stockLevelFor(g, 'software', 'us', y), stockLevelFor(g, 'semiconductor', 'jp', y)]
      for (let y = 2032; y < 2042; y++) {
        g.year = y; const ahead = read(y), behind = read(y - 1); advanceTechWaves(g)
        expect(read(y), `${c.source} ${seed} ${y}`).toEqual(ahead.map(near)); if (readTechWaves(g).length) expect(read(y - 1)).toEqual(behind.map(near))
      }
    }
  })
  it('waveSignature is empty with no wave and changes when a wave is added or steps', () => {
    const g = makeTestGame(1); put(g, W()); const s = waveSignature(g); put(g, W({ last: 2032 })); expect([s === '', waveSignature(g) === s]).toEqual([false, false])
  })
})
```

- [ ] **Step 2: Run it to see it fail:** `npx vitest run --maxWorkers=1 test/wave-stocks-level.test.ts`. Expected: FAIL, `TypeError: stockLevelFor is not a function` (the new exports are `undefined`).
- [ ] **Step 3: Leaf, `tech-wave-factors.ts`.** Add the two optional `TechWave` fields and `TechBase.stock`. `cleanWave` reads `trail` (an array only; scan its last 12 raw entries; an entry is an array of 3 finite numbers, year rounded and clamped 1800 to 2300, hype and delivery clamped 0 to 1; keep an entry only when its year is above the previous kept one; keep the last `TRAIL_POINTS`; absent when none) and `nx` (an array of 3: hype and delivery finite and clamped, tag matching `/^(~[a-z0-9]{1,16})?$/`; otherwise absent). `storedWave` writes both by conditional spread. `readTechBase` keeps `stock` clamped 0.7 to 1.6 only when finite and not 1; `storedBase` writes it likewise. Then: `nextStepTag(g, w) = outcomeTag(g, w.last + 1)`; `stateAt` returns, for `year > w.last`, `nx` when `nx[2] === tag` else the current state, and otherwise the trail point with the largest year `<= year` (the first point when none, the current state with no trail). `wavesAt(g, year)` returns the validated list with each wave's hype and delivery replaced by `stateAt(w, year, nextStepTag(g, w))` (the same object when unchanged), memoized per validated list and year (cap 64 years). `waveLevels` calls `effectsOf(trade, market, y, [w], false)` for each wave of `wavesAt(g, y)` and keeps the ones with an entry, leaving out a wave whose `skip` is this trade when `roleOf(w.kind, trade)` is `'disrupted'` (P9). `stockLevelFor(g, trade, market, year)` implements P1 and P4 on `y = Math.round(year)`: return 1 at once when `y` is not finite, or when there is no wave and `noBase`; else `level = Product of waveLevels levels x Product over effectsOf(trade, market, y, [], y >= PRESENT_YEAR) of (1 + STOCK_BETA x (e.value - 1))` (the history rows, S6), times the settled part (for each `base` key of this trade: `1 + reach x (stock - 1)` with reach 1 for `|world` or `|<market>`, 0.75 for another country when `market` is a country, 0 otherwise), clamped to `FACTOR_BOUNDS.value`; memoized like `waveFactors` (list, then base object, then `${trade}|${market}|${y}`, 1024 entries). `waveSignature` joins `${id}:${last}:${nx tag}` of the waves and `${key}=${stock}` of the settled entries, `''` when empty. All pure; none draws.
- [ ] **Step 4: `timeMachine.ts`.** Change the parameter type of `outcomeTag` and `timelineForks` from `GameState` to `Pick<GameState, 'flags'>` (nothing else).
- [ ] **Step 5: `tech-waves.ts`.** Extract `stepWave(g, w, year)` from `advanceTechWaves` unchanged (the `deliveryTarget` or seeded-draw delivery, then `nextState`), returning `WaveStep`; `projectWave(g, w)` is `stepWave(g, w, w.last + 1)` as `[hype, delivery, nextStepTag(g, w)]`, or `[0, 0, tag]` when the fate is `'drop'` (P2). `announceWave` gives the new wave `trail: [[last, hype, 0]]` and `nx: projectWave(g, wave)`. `advanceTechWaves` uses `stepWave`, appends `[year, hype, delivery]` to the trail (seeding `[[w.last, w.hype, w.delivery]]` when a wave has none, keeping the last 6), writes `nx: projectWave(g, stepped)` on a live wave, and when a wave settles also writes `stock = clamp(old x (1 + STOCK_BETA x (e.value - 1)), 0.7, 1.6)` per trade next to demand and costs (skip a trade only when demand, costs and value are all 1). Re-export the new leaf names from the existing re-export line.
- [ ] **Step 6: Run it to see it pass:** `npx vitest run --maxWorkers=1 test/wave-stocks-level.test.ts`. Expected: all PASS.
- [ ] **Step 7: Typecheck:** `npm run typecheck` (about 12 s). Expected: no errors, in `src/` and in `test/`.
- [ ] **Step 8: Regression.** `npx vitest run --maxWorkers=1 test/tech-wave-data.test.ts test/tech-waves.test.ts test/tech-waves-readers.test.ts test/tech-waves-wiring.test.ts test/tech-waves-writers.test.ts test/voice-guards.test.ts` (7.2 + 12.6 + 16.0 + 15.0 + 14.1 + 3.0 s). If a release 1 assertion compares a whole stored wave and fails only on the new `trail` or `nx`, change that assertion to `toMatchObject` and say so in the commit message; any other failure is a bug here.
- [ ] **Step 9: Commit**

```bash
git add src/game/business/tech-wave-factors.ts src/game/business/tech-waves.ts src/game/timeMachine.ts test/wave-stocks-level.test.ts
git commit -m "feat(waves): a wave remembers its trail and next step, and gives a stock level" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Tq5bMwVNBuT54ZtqpiXV13"
```

## Task 2: The sector table and the seam

**Files:**
- Create: `src/game/invest/wave-stocks.ts`, `src/game/invest/clock.ts`, `test/wave-stocks-data.test.ts`, `test/wave-stocks-wiring.test.ts`
- Modify: `src/game/invest/shocks.ts` (one import, two multiplications), `src/game/invest/instinct.ts` (one import, the cache key)

**Interfaces:**
- Consumes: Task 1 `stockLevelFor`, `readTechWaves`, `readTechBase`, `noBase`, `waveSignature`; `exchangeByKey`, `exchangeYear`, `companyDef`, `companyKey`, `slotPlan`, `SECTORS`, `type SectorId` (`invest/engine`); `timelineFamily` (`timeMachine`).
- Produces (`invest/wave-stocks.ts`): `SECTOR_TRADE: Readonly<Record<SectorId, Industry | null>>`; `sectorOfSec(secId: string): SectorId | null` (the engine sector of a company id or of one of its `~X` lines; `null` for pennies, coins, bonds and junk); `listedSectors(g: GameState, exKey: string, year: number): readonly SectorId[]` (P10: the sector of each stock the exchange lists that year, in slot order; empty for an unknown exchange); `waveStockFactor(g: Pick<GameState, 'flags'>, secId: string, year: number): number`; `waveIndexFactor(g: GameState, exKey: string, year: number): number`.
- Produces (`invest/clock.ts`, P7, created here): `marketYearOf(fiscal: number): number` (`fiscal + 1`); `marketFamily(g: GameState): string` (`timelineFamily(g, (g.lifeId || 'life').replace(/-g\d+$/, ''))`, the same as `fund-model.ts` today); `marketAnchor(g: GameState): number` (the same as `computer/money-common.ts` `anchor`: `Math.min` of `g.ancestors?.[0]?.bornYear` when it is a finite number and `g.year - g.character.age`, else that difference, `g.year` when not finite). `invest/instinct.ts` and `investments.ts` keep private copies of both helpers, so the clock imports no more than the engine and `timeMachine`.

- [ ] **Step 1: Write the failing tests.** `test/wave-stocks-data.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { roleOf } from '../src/game/business/tech-waves'
import { WAVE_KINDS } from '../src/game/business/tech-wave-data'
import { INDUSTRY_IDS } from '../src/game/data/markets'
import { companyDef, exchangeInfo, pennyDef, SECTORS } from '../src/game/invest/engine'
import { SECTOR_TRADE, sectorOfSec } from '../src/game/invest/wave-stocks'

const IDS = Object.keys(SECTORS) as (keyof typeof SECTORS)[]
describe('SECTOR_TRADE (S4)', () => {
  it('has exactly the 35 sector ids, 23 mapped to a real trade and 12 to none', () => {
    expect([Object.keys(SECTOR_TRADE).sort(), IDS]).toEqual([[...IDS].sort(), IDS]); expect(IDS).toHaveLength(35)
    const mapped = IDS.filter((s) => SECTOR_TRADE[s] !== null); expect(mapped).toHaveLength(23)
    expect(IDS.filter((s) => SECTOR_TRADE[s] === null).sort()).toEqual(['agri', 'airlines', 'banks', 'cosmetics', 'fashion', 'hotels', 'insurance', 'leisure', 'mining', 'property', 'shipping', 'supermarkets'])
    for (const s of mapped) expect(INDUSTRY_IDS).toContain(SECTOR_TRADE[s])
  })
  it('gives every mapped trade a role in some wave kind, maps each deep sector to its own driver, and has exactly three non-driver rows', () => {
    for (const s of IDS) { const t = SECTOR_TRADE[s]; if (t) expect((Object.keys(WAVE_KINDS) as (keyof typeof WAVE_KINDS)[]).some((k) => roleOf(k, t) !== null), `${s} -> ${t}`).toBe(true) }
    for (const s of ['semis', 'ai', 'robotics', 'biotech', 'space', 'ev', 'quantum', 'cyber'] as const) expect(SECTOR_TRADE[s]).toBe(SECTORS[s].drivers[0])
    expect(IDS.filter((s) => SECTOR_TRADE[s] && !SECTORS[s].drivers.includes(SECTOR_TRADE[s]!)).sort()).toEqual(['electronics', 'pharma', 'telecom'])
  })
  it('sectorOfSec reads a company id and its share-class line, and rejects pennies, coins, bonds and junk', () => {
    const info = exchangeInfo('us'), def = companyDef(info, 0, 0)
    expect([sectorOfSec(def.id), sectorOfSec(`${def.id}~B`)]).toEqual([def.sector, def.sector])
    expect([sectorOfSec(pennyDef(info, 0, 0).id), sectorOfSec('crypto#c0g0'), sectorOfSec('bond:us'), sectorOfSec(''), sectorOfSec('constructor')]).toEqual([null, null, null, null, null])
  })
})
```

`test/wave-stocks-wiring.test.ts` (the fixture: smartphone is core for `software` and supply for semiconductor, telecom, game studios, e-commerce and batteries. The US exchange of this world in 2031 lists six `tech` stocks (core, IBM first, listed under the same id in 2032) and supply stocks in e-commerce, telecom and semiconductors, probed against this worktree, so every test below stays on `us`):

```ts
import { describe, expect, it } from 'vitest'
import { marketMove } from '../src/game/business/fund-model'
import { advanceTechWaves, announceWave, roleOf, type TechWave } from '../src/game/business/tech-waves'
import { anchor, fam, type OptionPos } from '../src/game/computer/money-common'
import { settleMove } from '../src/game/computer/money-options'
import { listedTargets, placeBet, settlePrice } from '../src/game/computer/money-stocks'
import { marketAnchor, marketFamily } from '../src/game/invest/clock'
import { exchangeInfo, slotPlan } from '../src/game/invest/engine'
import { marketInstinct } from '../src/game/invest/instinct'
import { shockFactor } from '../src/game/invest/shocks'
import { SECTOR_TRADE, sectorOfSec, waveIndexFactor, waveStockFactor } from '../src/game/invest/wave-stocks'
import { buySecurity, investmentHoldings, investmentListing, yearlyInvestments } from '../src/game/investments'
import type { GameState, Json } from '../src/game/types'
import { makeTestGame } from './helpers'

const J = (v: unknown): Json => v as Json
const SMART = (o: Partial<TechWave> = {}): TechWave => ({ id: 'workshop:smartphone:2030:x', kind: 'smartphone', name: 'Smartphones', source: 'workshop', year: 2030, market: 'world', size: 0.5, hype: 0.8, delivery: 0.6, last: 2031, ...o })
const world = (seed = 7): GameState => { const g = makeTestGame(seed, { age: 30, countryId: 'us', money: 5e9, residence: { status: 'renting', rent: 0 } }); g.lifeId = `waves-${seed}`; g.year = 2031; return g }
const waved = (g: GameState): GameState => { const h = structuredClone(g); h.flags.techWaves = J([SMART()]); return h }
const roleOfStock = (secId: string) => { const s = sectorOfSec(secId), t = s ? SECTOR_TRADE[s] : null; return t ? roleOf('smartphone', t) : null }
const coreStock = (g: GameState) => { const q = investmentListing(g).find((x) => x.type === 'stock' && roleOfStock(x.secId) === 'core'); expect(q, 'no core stock for the smartphone kind on this exchange').toBeDefined(); return q! }
const passYear = (g: GameState, step = false) => { g.year += 1; g.character.age += 1; g.yearActions = {}; g.flags.taxableIncome = 0; g.queue = []; if (step) advanceTechWaves(g); yearlyInvestments(g) }

describe('the seam', () => {
  it('with no wave every factor is exactly 1, and reads leave state and the random stream alone', () => {
    const g = world(), list = investmentListing(g), before = JSON.stringify(g), rng = g.rng
    for (const q of list) expect(waveStockFactor(g, q.secId, 2031), q.name).toBe(1)
    for (const y of [1990, 2008, 2026, 2031, 2045]) for (const c of ['us', 'gb', 'jp', 'de', 'cn']) expect(waveIndexFactor(g, exchangeInfo(c).key, y)).toBe(1)
    expect([JSON.stringify(g), g.rng]).toEqual([before, rng])
  })
  it('a live wave moves the quote, the listed target, the index fund and the fund market move by the factor the reader returns', () => {
    const g0 = world(), g1 = waved(g0), q0 = coreStock(g0), q1 = investmentListing(g1).find((q) => q.secId === q0.secId)!, f = waveStockFactor(g1, q0.secId, 2031)
    expect(f).toBeGreaterThan(1.05); expect(q1.price / q0.price).toBeCloseTo(f, 9)
    const target = (g: GameState) => listedTargets(g).find((t) => t.secId === q0.secId)!.price; expect(target(g1) / target(g0)).toBeCloseTo(f, 9)
    const key = exchangeInfo('us').key, fund = (g: GameState) => investmentListing(g).find((q) => q.type === 'index')!.price, ix = waveIndexFactor(g1, key, 2031)
    expect(ix).toBeGreaterThan(1); expect(fund(g1) / fund(g0)).toBeCloseTo(ix, 9)
    expect((1 + marketMove(g1, 'us', 2031)) / (1 + marketMove(g0, 'us', 2031))).toBeCloseTo(ix / waveIndexFactor(g1, key, 2030), 9)
  })
  it('a holding gains the step the gut reads: the factor for next year is the same before and after the yearly step (S10)', () => {
    const base = world(), twin = structuredClone(base), g = structuredClone(base)
    announceWave(g, { kind: 'smartphone', source: 'workshop', origin: 'x', name: 'Smartphones', size: 0.5, market: 'world' })
    const id = coreStock(g).secId, gut = shockFactor(g, id, 2032) / shockFactor(g, id, 2031), price = (x: GameState) => Number(investmentHoldings(x)[0].details.price)
    for (const x of [twin, g]) expect(buySecurity(x, id, 50_000)).toBe(true)
    const p0 = [price(twin), price(g)]; passYear(twin); passYear(g, true)
    expect(shockFactor(g, id, 2032) / shockFactor(g, id, 2031)).toBeCloseTo(gut, 12); expect(price(g) / p0[1] / (price(twin) / p0[0])).toBeCloseTo(gut, 9)
    // An index call opened in 2031 settles on the same step (P11): the move it settles on carries the tilt of 2032 over 2031.
    const key = exchangeInfo('us').key, call: OptionPos = { id: 'o1', mode: 'real', side: 'buy', dir: 'call', strike: 'atm', k: 0, units: 1e6, premium: 1e4, year: 2031, exKey: key, index: 'x', countryId: 'us', parentId: '' }
    expect((1 + settleMove(g, call)) / (1 + settleMove(twin, call))).toBeCloseTo(waveIndexFactor(g, key, 2032) / waveIndexFactor(g, key, 2031), 9)
  })
  it('an option costs what it costs without the wave and settles on the level (S9)', () => {
    const g0 = world(), g1 = waved(g0), id = coreStock(g0).secId, bet = (g: GameState) => placeBet(g, { via: 'own', secId: id, kind: 'call', strike: 'atm', stake: 100_000 })!
    const b0 = bet(g0), b1 = bet(g1); expect([b1.units, b1.k, b1.premium]).toEqual([b0.units, b0.k, b0.premium]); expect(b1.openPrice / b0.openPrice).toBeCloseTo(waveStockFactor(g1, id, 2031), 9)
    expect(settlePrice(g1, b1) / settlePrice(g0, b0)).toBeCloseTo(waveStockFactor(g1, id, 2032), 9)   // the bet settles at the end of 2032, on the level of that year
  })
  it('the index tilt is the mean level of the stocks the Stocks screen lists, not of the exchange plan (P10), and the clock helpers match money-common', () => {
    const g = waved(world()), info = exchangeInfo('us'), key = info.key, n = Math.max(4, slotPlan(info).length)
    const mean = 1 + listedTargets(g).reduce((sum, t) => sum + waveStockFactor(g, t.secId, 2031) - 1, 0) / n
    expect(waveIndexFactor(g, key, 2031)).toBeCloseTo(Math.max(0.5, Math.min(1.5, mean)), 9); expect(mean).toBeGreaterThan(1.02)
    const heir = structuredClone(g); Object.assign(heir, { ancestors: [{ bornYear: 1950 }] as unknown as GameState['ancestors'] })
    for (const x of [g, heir]) expect([marketFamily(x), marketAnchor(x)]).toEqual([fam(x), anchor(x)])
  })
  it('coins, pennies, bonds, savings, gold and the property trust ignore a live wave, a bond pays the same at maturity (C-04), and a share-class line moves with its company', () => {
    const g0 = world(), g1 = waved(g0), a = investmentListing(g0), b = investmentListing(g1)
    for (const q of a.filter((x) => x.type !== 'stock' && x.type !== 'index')) expect(b.find((x) => x.secId === q.secId)!.price, q.name).toBe(q.price)
    const matured = (g: GameState) => { const q = investmentListing(g).find((x) => x.type === 'bond')!; expect(buySecurity(g, q.secId, 50_000)).toBe(true); investmentHoldings(g)[0].details.maturity = g.year + 1; passYear(g); return [Math.round(g.character.money), investmentHoldings(g).length] }
    const id = coreStock(g1).secId; expect(shockFactor(g1, `${id}~B`, 2031)).toBeCloseTo(shockFactor(g1, id, 2031), 12)
    expect(matured(g1)).toEqual(matured(g0))
  })
  it('the gut recomputes when a wave changes, and 64 waves stay cheap on the hot path', () => {
    const g = makeTestGame(7, { age: 30, countryId: 'us', money: 1e6, talents: ['Investing'] }); g.lifeId = 'gut-waves'; g.year = 2031
    const a = marketInstinct(g)!; expect(marketInstinct(g)).toBe(a); g.flags.techWaves = J([SMART()]); expect(marketInstinct(g)).not.toBe(a)
    g.flags.techWaves = J(Array.from({ length: 64 }, (_, i) => SMART({ id: `w${i}`, year: 2000 + (i % 30) }))); const ids = investmentListing(g).filter((q) => q.type === 'stock').map((q) => q.secId), t = Date.now()
    for (let i = 0; i < 5000; i++) shockFactor(g, ids[i % ids.length], 2031 + (i % 5)); expect(Date.now() - t).toBeLessThan(1000)
  })
})
```

- [ ] **Step 2: Run them to see them fail:** `npx vitest run --maxWorkers=1 test/wave-stocks-data.test.ts test/wave-stocks-wiring.test.ts`. Expected: FAIL, "Failed to resolve import ../src/game/invest/wave-stocks".
- [ ] **Step 3: `invest/wave-stocks.ts`.** `SECTOR_TRADE` is this table, with the three non-driver rows (telecom: it has no drivers; electronics: the chips inside gadgets; pharma: drug makers, core of the drug kinds) commented: telecom `telecom`, utilities `energy`, oil `energy`, automakers `autoShop`, electronics `semiconductor`, industrials `manufacturing`, tech `software`, games `gameStudio`, ecommerce `ecommerce`, media `marketing`, entertainment `entertainment`, pharma `biotech`, construction `construction`, food `bakery`, brewers `brewery`, semis `semiconductor`, ai `aiLab`, robotics `robotics`, biotech `biotech`, space `spaceTech`, ev `electricVehicles`, quantum `quantum`, cyber `cybersecurity`; `null` for banks, insurance, mining, hotels, airlines, shipping, agri, property, supermarkets, fashion, cosmetics, leisure. `sectorOfSec`: `companyKey`, match `/^(.*)#s(\d+)g(\d+)$/`, `exchangeByKey(m[1])` must exist, then `companyDef(info, slot, gen).sector` (`null` for `'penny'`). `waveStockFactor`: return 1 first when `readTechWaves` is empty and `noBase(readTechBase(g))`, then `stockLevelFor(g, SECTOR_TRADE[sector], exchange.home, year)` (1 for a null trade). `listedSectors(g, exKey, year)` (P10): for a known exchange `info`, `exchangeYear(marketFamily(g), marketAnchor(g), info, year).stocks.map((s) => companyDef(info, s.slot, s.gen).sector).filter((s): s is SectorId => s !== 'penny')` (the filter only narrows the type: `SecurityDef.sector` is `SectorId | 'penny'` and a classic stock is never `'penny'`; an unknown exchange or a non-finite year gives `[]`). `waveIndexFactor`: 1 at once with the same early exit as `waveStockFactor` (no wave and `noBase`, checked before anything is listed), else `clamp(1 + sum over listedSectors(g, exKey, year) of (stockLevelFor(g, SECTOR_TRADE[sector], info.home, year) - 1) / n, 0.5, 1.5)` with `n = max(4, slotPlan(info).length)` and a level of 1 for a null trade; memoized per (list, base object) with the key `${marketFamily(g)}|${marketAnchor(g)}|${exKey}|${year}`. `invest/clock.ts` is three small pure functions as specified above.
- [ ] **Step 4: Fold it in.** `shocks.ts` `shockFactor`: multiply the argument of the first `boundedFactor(...)` by `waveStockFactor(g, key, year)` (key is already `companyKey(secId)`). `indexShockFactor`: multiply `breakthrough` by `waveIndexFactor(g, exKey, year)`. `instinct.ts` `marketInstinct`: append `|${waveSignature(g)}` to the cache key. Nothing else: the single-stock and index option premiums (`money-stocks.ts`, `money-options.ts` `optionPrice`) take no `GameState` and stay untouched, and `settlePrice` and `settleMove` already read the two seam functions.
- [ ] **Step 5: Run them to see them pass:** `npx vitest run --maxWorkers=1 test/wave-stocks-data.test.ts test/wave-stocks-wiring.test.ts`. Expected: all PASS.
- [ ] **Step 6: Typecheck:** `npm run typecheck` (about 12 s). Expected: no errors, in `src/` and in `test/`.
- [ ] **Step 7: Regression.** `npx vitest run --maxWorkers=1 test/company-key.test.ts test/investments.test.ts test/stocks-real.test.ts test/talent-investing.test.ts test/hedge-model.test.ts test/plan-search-reads.test.ts` (13.5 + 11.2 + 28.6 + 37.7 + 13.6 + 7.6 s). These pin the wave-free prices.
- [ ] **Step 8: Commit**

```bash
git add src/game/invest/wave-stocks.ts src/game/invest/clock.ts src/game/invest/shocks.ts src/game/invest/instinct.ts test/wave-stocks-data.test.ts test/wave-stocks-wiring.test.ts
git commit -m "feat(waves): the sector table and the stock level in the one seam" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Tq5bMwVNBuT54ZtqpiXV13"
```

## Task 3: The one market clock

**Files:**
- Create: `test/market-clock.test.ts`
- Modify: `src/game/invest/clock.ts` (created in Task 2: gains `bookedMarketMove`), `src/game/business/economy.ts` (`exchangeMove`, two imports), `src/game/business/fund-model.ts` (the two definitions become a re-export, and `timelineFamily` leaves its `timeMachine` import because nothing else in the file reads it: `noUnusedLocals`)

**Interfaces:**
- Consumes: `indexMove`, `exchangeInfo` (`invest/engine`), `marketFamily`, `marketYearOf` (Task 2 `invest/clock`), `PRESENT_YEAR`.
- Produces (`invest/clock.ts`, P7): `bookedMarketMove(g: GameState, countryId: string, fiscal: number): number` (`exp(clamp(logRet, -5, 3)) - 1` of `indexMove(marketFamily(g), exchangeInfo(countryId), fiscal + 1)`, clamped -0.6 to 1.2; no shock, macro or wave term). `fund-model.ts` keeps exporting `marketFamily` and `marketYearOf` as re-exports.

- [ ] **Step 1: Write the failing test** `test/market-clock.test.ts`

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { exchangeMove } from '../src/game/business/economy'
import { marketYearOf as viaFundModel } from '../src/game/business/fund-model'
import { clampN } from '../src/game/business/util'
import { historicalIndexReturn } from '../src/game/history/markets'
import { bookedMarketMove, marketFamily, marketYearOf } from '../src/game/invest/clock'
import { exchangeInfo, indexMove } from '../src/game/invest/engine'
import type { GameState, Json } from '../src/game/types'
import { makeTestGame } from './helpers'

const engine = (g: GameState, c: string, fiscal: number) => clampN(Math.exp(clampN(indexMove(marketFamily(g), exchangeInfo(c), fiscal + 1).logRet, -5, 3)) - 1, -0.6, 1.2)
describe('the market clock (S11)', () => {
  it('is the engine move of fiscal + 1 from 2026 on, in five countries, and one definition serves the funds', () => {
    const g = makeTestGame(3); g.lifeId = 'clock-g1'
    for (const c of ['us', 'gb', 'jp', 'de', 'br']) for (let y = 2026; y <= 2045; y++) { expect(exchangeMove(g, c, y), `${c} ${y}`).toBeCloseTo(engine(g, c, y), 12); expect(bookedMarketMove(g, c, y)).toBe(exchangeMove(g, c, y)) }
    expect([marketYearOf(2030), viaFundModel(2030), viaFundModel === marketYearOf]).toEqual([2031, 2031, true])
  })
  it('keeps the real history: 1990, 2008 and 2020 are the table value, clamped', () => {
    const g = makeTestGame(3); for (const y of [1990, 2008, 2020]) expect(exchangeMove(g, 'us', y)).toBeCloseTo(clampN(historicalIndexReturn('us', y)!, -0.6, 1.2), 9)
  })
  it('an heir shares the family market, another family does not, and a Time Machine fork rerolls only the unfinished year', () => {
    const at = (id: string, forks?: Json) => { const g = makeTestGame(3); g.lifeId = id; if (forks) g.flags.timelineForks = forks; return g }
    expect(exchangeMove(at('fam-g1'), 'us', 2030)).toBe(exchangeMove(at('fam-g3'), 'us', 2030)); expect(exchangeMove(at('other-g1'), 'us', 2030)).not.toBe(exchangeMove(at('fam-g1'), 'us', 2030))
    const forked = at('fam-g1', [{ year: 2030, salt: 'ab1' }]), plain = at('fam-g1')
    expect(exchangeMove(forked, 'us', 2029)).toBe(exchangeMove(plain, 'us', 2029)); expect(exchangeMove(forked, 'us', 2030)).not.toBe(exchangeMove(plain, 'us', 2030))
  })
  it('the listed group year calls the same function and has no market path of its own', () => {
    const src = readFileSync('src/game/business/conglomerate-year.ts', 'utf8'); expect(src).toMatch(/exchangeMove\(g, /); expect(src).not.toMatch(/indexMove\(|bizexchange/)
  })
})
```

- [ ] **Step 2: Run it to see it fail:** `npx vitest run --maxWorkers=1 test/market-clock.test.ts`. Expected: FAIL (`bookedMarketMove is not a function`, and `exchangeMove` still returns the seeded path).
- [ ] **Step 3: `invest/clock.ts`** gains `bookedMarketMove` as above (inline `Math.min`/`Math.max`, no `business/util` import). **`economy.ts` `exchangeMove`:** after the `historicalIndexReturn` branch and before the old seeded path add `if (year >= PRESENT_YEAR) return bookedMarketMove(g, countryId, year)`; import `PRESENT_YEAR` from `../history/timeline` and `bookedMarketMove` from `../invest/clock` as separate import lines; the old path stays for a history year the tables don't list. `updateSharePrice` and `conglomerate-year.ts` need no edit. **`fund-model.ts`:** delete the two function bodies (`marketFamily`, `marketYearOf`), add `import { marketFamily, marketYearOf } from '../invest/clock'` and `export { marketFamily, marketYearOf }`, and change `import { outcomeTag, timelineFamily } from '../timeMachine'` to `import { outcomeTag } from '../timeMachine'` (`fundRng` still uses `outcomeTag`).
- [ ] **Step 4: Run it to see it pass:** `npx vitest run --maxWorkers=1 test/market-clock.test.ts`. Expected: all PASS.
- [ ] **Step 5: Typecheck:** `npm run typecheck` (about 12 s). Expected: no errors, in `src/` and in `test/`.
- [ ] **Step 6: Regression.** `npx vitest run --maxWorkers=1 test/market-events.test.ts test/share-classes-ipo.test.ts test/class-payout.test.ts test/own-listing-story.test.ts test/fund.test.ts` (12.5 + 15.1 + 13.4 + 11.6 + 14.5 s). `market-events` pins `exchangeMove` for 2008 and 2040 and `fund` pins `marketMove(g, 'us', marketYearOf(2026))`; both stay true.
- [ ] **Step 7: Commit**

```bash
git add src/game/invest/clock.ts src/game/business/economy.ts src/game/business/fund-model.ts test/market-clock.test.ts
git commit -m "feat(waves): one market clock for the listed firm, the stocks and the funds" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Tq5bMwVNBuT54ZtqpiXV13"
```

## Task 4: The player's listed company

**Files:**
- Create: `test/wave-listed.test.ts`
- Modify: `src/game/business/tech-waves.ts` (`stampWave`, `waveLines`), `src/game/business/state.ts` (`WaveStamp`, `normalizeBiz`), `src/game/business/economy.ts` (`valuationOf` mood), `src/game/business/deeptech-core.ts` (`industryCycle`, `operatingValue`), `test/tech-waves-readers.test.ts` (four assertions, below)

**Interfaces:**
- Consumes: Task 1 `stockLevelFor`, `STOCK_BETA`; Task 2 `marketYearOf` (`invest/clock`); `isQuoted`, `marketKey`, `FACTOR_BOUNDS`.
- Produces: `WaveStamp = { v: number; y: number; q?: true }`; `industryCycle(g: GameState, ind: DeepTechIndustry, year: number, withWave: boolean | 'stock' = true): IndustryCycle` (`'stock'` sets `wave = stockLevelFor(g, ind, 'world', year)` and `value = clamp(value x wave, 0.3, 3)`); `waveLines(g: Pick<GameState, 'flags' | 'year'>, b: Pick<BizState, 'industry' | 'countryId'> & Partial<Pick<BizState, 'public' | 'group'>>, year?: number): string[]` (the two new fields are optional because release 1 callers and tests pass only `industry` and `countryId`; for a quoted company each line says `price` with `1 + STOCK_BETA x (value - 1)` instead of `value`).

- [ ] **Step 1: Write the failing test** `test/wave-listed.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { marketKey } from '../src/game/business/competition-core'
import { industryCycle } from '../src/game/business/deeptech-core'
import { updateSharePrice, valuationOf } from '../src/game/business/economy'
import { ownListings } from '../src/game/business/own-listing'
import type { BizState } from '../src/game/business/state'
import { stampWave, stockLevelFor, waveFactorsFor, waveLines, type TechWave } from '../src/game/business/tech-waves'
import type { GameState, Json } from '../src/game/types'
import { makeTestGame } from './helpers'
import { founder, listed } from './own-listing-kit'

const J = (v: unknown): Json => v as Json
const SMART = (o: Partial<TechWave> = {}): TechWave => ({ id: 'workshop:smartphone:2030:x', kind: 'smartphone', name: 'Frontier AI', source: 'workshop', year: 2030, market: 'world', size: 0.5, hype: 0.8, delivery: 0.6, last: 2034, ...o })   // core software, hype .8, delivery .6: v 1.126, stock level 1.189
const put = (g: GameState, ...w: TechWave[]) => { g.flags.techWaves = J(w) }

describe('the quoted company (S12, P5)', () => {
  it('a quoted company gets a stock-grade stamp read at the market year, a neutral level deletes it, an unquoted one keeps the old grade', () => {
    const g = founder(41, 'us', 5e10, 2034), { b } = listed(g); put(g, SMART())
    stampWave(g, b, 2033); expect(b.wave).toEqual({ v: expect.closeTo(stockLevelFor(g, 'software', marketKey(b), 2034), 3), y: 2033, q: true }); expect(b.wave!.v).toBeGreaterThan(1.1)
    delete g.flags.techWaves; stampWave(g, b, 2033); expect(b.wave).toBeUndefined()
    const p = { ...b, public: false }; put(g, SMART()); stampWave(g, p, 2033); expect(p.wave).toEqual({ v: expect.closeTo(waveFactorsFor(g, 'software', marketKey(p), 2033).value, 3), y: 2033 })
  })
  it('valuationOf takes a q stamp only for a quoted company and only for the last booked year; every other stamp is ignored for it (C-12)', () => {
    const g = founder(41, 'us', 5e10, 2034), { b } = listed(g, { marketCap: 5e9, profit: 400e6 }), base = valuationOf(b), val = (patch: Partial<BizState>) => valuationOf({ ...b, ...patch })
    expect(val({ wave: { v: 1.3, y: 2033, q: true } }) / base).toBeCloseTo(1.3, 1)
    expect([val({ wave: { v: 1.3, y: 2033 } }), val({ wave: { v: 1.3, y: 2032, q: true } }), val({ wave: { v: NaN, y: 2033, q: true } })]).toEqual([base, base, base])
    expect(val({ public: false, wave: { v: 1.3, y: 2033, q: true } })).toBe(val({ public: false }))
  })
  it('the price closes half the gap each booked year: the ratio to the no-wave price rises, strictly between 1 and the stamp', () => {
    const run = (v: number | null, years: number) => { const g = founder(41, 'us', 5e10, 2034), { b } = listed(g, { share: 0.6, marketCap: 5e9, profit: 400e6 }); b.sharePrice = valuationOf(b) / b.sharesOut; if (v !== null) b.wave = { v, y: 2033, q: true }; for (let i = 0; i < years; i++) updateSharePrice(g, b, g.year); return b.sharePrice }
    const r = [1, 2, 3].map((n) => run(1.3, n) / run(null, n)); expect(r[0]).toBeGreaterThan(1.1); expect(r[0]).toBeLessThan(r[1]); expect(r[1]).toBeLessThan(r[2]); expect(r[2]).toBeLessThan(1.3)
  })
  it('industryCycle takes false, true or "stock": no wave, the private grade, the stock grade', () => {
    const g = makeTestGame(1); g.year = 2034; put(g, SMART({ kind: 'ai', source: 'deeptech' })); const c = (w: boolean | 'stock') => industryCycle(g, 'aiLab', 2034, w)
    expect([c(false).wave, c(true).wave, c('stock').wave]).toEqual([1, expect.closeTo(1.126, 6), expect.closeTo(stockLevelFor(g, 'aiLab', 'world', 2034), 9)]); expect(c('stock').wave).toBeGreaterThan(c(true).wave)
    expect(c('stock').value).toBeCloseTo(Math.min(3, c(false).value * c('stock').wave), 9)
  })
  it('waveLines says price with the stock-grade number for a quoted company and value for a private one; a pure Stocks row ignores a wave alone', () => {
    const g = makeTestGame(1); put(g, SMART()); const line = (pub: boolean) => waveLines(g, { industry: 'software', countryId: 'us', public: pub }, 2034)[0]
    expect(line(false)).toMatch(/value \+13%\.$/); expect(line(true)).toMatch(/price \+19%\.$/); expect(line(true)).not.toMatch(/value/)
    const h = founder(41, 'us', 5e10, 2034); listed(h); const rows = ownListings(h); put(h, SMART()); expect(ownListings(h)).toEqual(rows)
  })
})
```

- [ ] **Step 2: Run it to see it fail:** `npx vitest run --maxWorkers=1 test/wave-listed.test.ts`. Expected: FAIL (a quoted company gets no stamp: `expected undefined to deeply equal ...`).
- [ ] **Step 3: Implement.** `state.ts`: `WaveStamp` gains `q?: true`; `normalizeBiz` keeps `q` only when `ws.q === true` (conditional spread), still dropped for deep tech; update the field's doc comment. `tech-waves.ts` `stampWave`: a deep-tech company still deletes the stamp; a quoted one gets `{ v: round4(L), y: fiscal, q: true }` with `L = clamp(stockLevelFor(g, b.industry, marketKey(b), marketYearOf(fiscal)), 0.3, 3)`, deleted when within 0.005 of 1 (P5); an unquoted company keeps the old code. `waveLines`: widen the parameter type as above; when `isQuoted({ public: b.public === true, group: b.group })` print `price ${signed(1 + STOCK_BETA * (e.value - 1))}` and sort by that distance from 1. `economy.ts` `valuationOf`: the wave block still skips deep tech but no longer skips quoted companies; the stamp counts when `ws.y === last.year`, finite, and `(ws.q === true) === isQuoted(b)`; otherwise a quoted company's wave mood is 1 (history rows are not read for it) and an unquoted company reads the history table as before; combine with `events` under the same clamp. `deeptech-core.ts`: `industryCycle` takes `boolean | 'stock'` as above (docs updated), `operatingValue` passes `isQuoted(b) ? 'stock' : true`.
- [ ] **Step 4: Edit the release 1 pins that assert the lifted behavior.** Spec section 9 names three blocks; reading `test/tech-waves-readers.test.ts` shows four assertions, all in `describe`s that say listed companies are wave-free. Change only these, and say why in the commit message: (a) in `a division of a listed group is valued wave-free ...` (rename it `a division of a listed group takes the stock-grade stamp, and only that grade counts for it`), replace `expect('wave' in m).toBe(wave)` with `expect('wave' in m).toBe(true); expect(m.wave!.q === true).toBe(!wave)` (the next line, `valuationOf({ ...m, wave: { v: 1.3, y: 2033 } }) === valuationOf({ ...m, wave: undefined })` against `!wave`, stays true: a stamp without `q` is ignored for a quoted company); (b) in `the price of a real listed group does not move with a wave ...` (rename it `... moves with a wave, as the same group unlisted does`), replace `expect(value(true, true)).toBe(quiet)` with `toBeGreaterThan(quiet)`; (c) in `yearlyBusinessImpl stamps ... never stamps a listed company` (rename `... and stamps a listed one at the stock grade`), replace the last `expect(pub.wave).toBeUndefined()` with `expect(pub.wave).toEqual({ v: expect.any(Number), y: g.year - 1, q: true })`; (d) in the `describe` named `deep tech: listed companies stay wave-free` (rename the `describe` `deep tech: listed companies take the stock-grade wave` and its `it` `a public lab and a lab in a listed group take the stock-grade wave in their tech value, with no wave nothing changes, and a private lab keeps the private grade`), change `expect(pubWave).toBe(pubNone)` and `expect(grpWave).toBe(val())` to `toBeGreaterThan(pubNone)` and `toBeGreaterThan(val())`. The stamp-without-`q` assertions (`valuationOf({ ...b, public: true, wave: { v: 2, y: 2033 } })` and the listed-group ones with `wave: { v: 1.3, y: 2033 }`) stay true and stay. Any other release 1 failure in a year 1946 to 2024 is a live history row: stop and report it.
- [ ] **Step 5: Run it to see it pass:** `npx vitest run --maxWorkers=1 test/wave-listed.test.ts test/tech-waves-readers.test.ts`. Expected: all PASS.
- [ ] **Step 6: Typecheck:** `npm run typecheck` (about 12 s). Expected: no errors, in `src/` and in `test/`.
- [ ] **Step 7: Regression.** `npx vitest run --maxWorkers=1 test/own-listing.test.ts test/share-classes-integration.test.ts test/dividend-year.test.ts test/hedge-company.test.ts test/deeptech-review.test.ts` (14.7 + 7.0 + 15.0 + 14.5 + 26.5 s). `deeptech.test.ts` (149 s) and `deeptech-fusion.test.ts` (122 s) are not run: a grep over `test/` finds `industryCycle`, `operatingValue` and `refreshTechValue` only in `deeptech-review` and `tech-waves-readers`, and with no wave the new grade is 1.
- [ ] **Step 8: Commit**

```bash
git add src/game/business/tech-waves.ts src/game/business/state.ts src/game/business/economy.ts src/game/business/deeptech-core.ts test/wave-listed.test.ts test/tech-waves-readers.test.ts
git commit -m "feat(waves): a quoted company takes the wave through its fundamental" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Tq5bMwVNBuT54ZtqpiXV13"
```

## Task 5: The insider rule and its warnings

**Files:**
- Create: `src/game/business/wave-insider.ts`, `test/wave-kit.ts`, `test/wave-insider.test.ts`
- Modify: `src/game/special/politics.ts` (the case type, `repairAbuse`, `openInsiderCase`, four text and severity lines), `src/game/business/tech-waves.ts` (`WaveInput.by`, the hook), `src/game/business/heavy-rd.ts` (`by`, the window helper), `src/game/business/deeptech-sim.ts` (`by` at three calls), `src/game/business/tech-wave-data.ts` (`INSIDER_WARNING`, `heavyStartsWave`), `src/game/business/manage.ts` and `src/game/business/deeptech-menu.ts` (the two confirms)

**Interfaces:**
- Consumes: Task 2 `SECTOR_TRADE`, `sectorOfSec`, `waveStockFactor`, `waveIndexFactor`; `roleOf`; `listedTargets`, `type BetTarget` (`computer/money-stocks`); `insiderPositions`, `type InsiderPositions` (`special/politics`, already exported); `local` (`computer/money-common`); `runsIt`, `readBiz`, `businessAssets`; `hashOf`.
- Produces: `WaveInput.by?: string` (the asset id of the originating company; never stored on the wave); `waveInsiderCases(g: GameState, w: TechWave, assetId: string): number` (cases opened); `InsiderCaseInput { target: BetTarget; pos: InsiderPositions; mult: number; indexGain: number; role: 'founder' | 'ceo'; note: string; company: string; key: string }`; `openInsiderCase(g: GameState, input: InsiderCaseInput): boolean` (false when the id exists); `INSIDER_WARNING: string`; `heavyStartsWave(trade: string, entry: { name: string; first: number }, launchYear: number): boolean`.

- [ ] **Step 1: Write the failing tests.** First the shared fixtures, `test/wave-kit.ts` (Task 7 imports them too; the stocks it picks stay listed under one id, probed for seeds 1 to 40):

```ts
// Fixtures shared by test/wave-insider.test.ts and test/wave-stocks-story.test.ts: a founder with a software company, the core or supply
// stocks of a wave kind that stay listed under one id, the case rows the politics profile keeps, and the exposure popup.
import type { RdProject } from '../src/game/business/state'
import { roleOf } from '../src/game/business/tech-waves'
import { anchor, fam } from '../src/game/computer/money-common'
import { listedTargets, type BetTarget } from '../src/game/computer/money-stocks'
import { exchangeInfo, exchangeYear } from '../src/game/invest/engine'
import { SECTOR_TRADE, sectorOfSec } from '../src/game/invest/wave-stocks'
import { yearlySpecial } from '../src/game/special'
import type { Asset, GameState } from '../src/game/types'
import { adult, company } from './market-kit'

export type Row = { cause: string; role?: string; note?: string; via: string; secId: string; status: string; gain: number; stake: number; evidence: number; title: string; office: string; held?: number }
export const rows = (g: GameState): Row[] => (g.flags['special.politics'] as unknown as { abuse?: { cases: Row[] } } | undefined)?.abuse?.cases ?? []
export const founder = (seed = 5, year = 2033): { g: GameState; a: Asset } => { const g = adult(seed, year, 'us'), a = company(g, 'software', { cash: 80_000_000 }); g.queue = []; return { g, a } }
export const warp = (g: GameState, year: number) => { g.character.age += year - g.year; g.year = year; g.yearActions = {} }
const roleFor = (kind: 'smartphone' | 'ai', secId: string) => { const s = sectorOfSec(secId), t = s ? SECTOR_TRADE[s] : null; return t ? roleOf(kind, t) : null }
/** Core or supply stocks of a kind that are listed under one id in every year given (as holdable() of test/insider-fairness.test.ts). */
export function holdable(g: GameState, years: number[], kind: 'smartphone' | 'ai' = 'smartphone'): BetTarget[] {
  const inf = exchangeInfo(g.character.countryId)
  return listedTargets(g).filter((t) => { const r = roleFor(kind, t.secId); return (r === 'core' || r === 'supply') && years.every((y) => exchangeYear(fam(g), anchor(g), inf, y).stocks[t.slot]?.id === t.secId) })
}
/** Years `from` to `to` with the yearly special hook; the exposure popup if one is raised (other popups are dropped). */
export const exposedIn = (g: GameState, from: number, to: number) => { for (let y = from; y <= to; y++) { warp(g, y); yearlySpecial(g); const m = g.queue.find((x) => x.kind === 'choice' && x.scriptId === 'special.pol.abuse.exposed'); if (m) return m; g.queue = [] } return undefined }
/** The finished heavy project of test/tech-waves-writers.test.ts, with the odds the caller picks. */
export const project = (g: GameState, name: string, odds: number): RdProject => ({ id: 'rd-w', name, budget: 2e6, years: 4, progress: 4, odds, boost: 0, quality: 80, family: name, kind: 'breakthrough', heavy: true, cost: 2e6, started: g.year - 4 })
```

Then `test/wave-insider.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { businessAssetView } from '../src/game/business'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { advanceHeavy } from '../src/game/business/heavy-rd'
import { deepWaveFor, INSIDER_WARNING } from '../src/game/business/tech-wave-data'
import { announceWave, type TechWave } from '../src/game/business/tech-waves'
import { readTech } from '../src/game/business/deeptech-state'
import { bizOf } from '../src/game/business/state'
import { waveInsiderCases } from '../src/game/business/wave-insider'
import { moneyState } from '../src/game/computer/money-common'
import { listedTargets } from '../src/game/computer/money-stocks'
import { exchangeInfo } from '../src/game/invest/engine'
import { sectorOfSec } from '../src/game/invest/wave-stocks'
import { buySecurity } from '../src/game/investments'
import { runScript } from '../src/game/scripts'
import { politicianJob } from '../src/game/special/politics'
import type { Asset, GameState, Json, MenuAction } from '../src/game/types'
import { adultIn } from './deeptech-kit'
import { allNodes } from './market-kit'
import { exposedIn, founder, holdable, project, rows, warp } from './wave-kit'

const launch = (g: GameState, a: Asset, extra: Partial<Parameters<typeof announceWave>[1]> = {}): TechWave => announceWave(g, { kind: 'smartphone', source: 'deeptech', origin: `${a.id}#frontier`, name: 'Smartphones', size: 0.5, market: 'world', by: a.id, ...extra })!

describe('load order', () => {
  it('loads in any order: tech-waves, wave-insider and politics each first, in a fresh module registry', async () => {
    for (const load of [() => import('../src/game/business/tech-waves'), () => import('../src/game/business/wave-insider'), () => import('../src/game/special/politics')]) { vi.resetModules(); expect(Object.keys(await load()).length).toBeGreaterThan(0) }
  }, 120_000)
})

describe('who is an insider (S13)', () => {
  it('opens a wave case for a founder who bought a core or supply stock this year, with the spec values, and makes no politician', () => {
    const { g, a } = founder(), [t] = holdable(g, [2033]); expect(t).toBeDefined(); expect(buySecurity(g, t.secId, 200_000)).toBe(true)
    const karma = g.character.hidden.karma; launch(g, a)
    expect(rows(g)).toHaveLength(1); expect(rows(g)[0]).toMatchObject({ cause: 'wave', role: 'founder', note: 'Smartphones', via: 'shares', secId: t.secId, status: 'open', evidence: 0.55, office: 'mayor', title: 'Founder of Test software' })
    expect(rows(g)[0].gain).toBeGreaterThan(1000); expect([g.character.hidden.karma, g.counters.insiderTrades]).toEqual([karma - 6, 1]); expect(politicianJob(g)).toBeNull()
  })
  it('a plain owner of an acquired company is no insider, an acquirer who runs it is a CEO, a founder with a hired CEO is a founder', () => {
    const run = (patch: (g: GameState, a: Asset) => void) => { const { g, a } = founder(), [t] = holdable(g, [2033]); buySecurity(g, t.secId, 200_000); patch(g, a); launch(g, a); return rows(g) }
    const acquired = (g: GameState, a: Asset) => { const b = bizOf(g, a); b.acquired = true; b.founderName = 'A previous owner' }
    expect(run((g, a) => { acquired(g, a); a.details.ceo = 'manager'; g.character.job = null })).toEqual([])
    expect(run(acquired)[0]).toMatchObject({ role: 'ceo', title: 'CEO of Test software' }); expect(run((_g, a) => { a.details.ceo = 'manager' })[0]).toMatchObject({ role: 'founder' })
  })
  it('counts shares bought in the launch year or the year before, not two years before, and skips a tiny gain and a wave dated after the year', () => {
    for (const [boughtIn, n] of [[2031, 0], [2032, 1], [2033, 1]] as const) {
      const { g, a } = founder(), [t] = holdable(g, [2031, 2032, 2033]); warp(g, boughtIn); expect(buySecurity(g, t.secId, 200_000)).toBe(true); warp(g, 2033); launch(g, a); expect(rows(g), String(boughtIn)).toHaveLength(n)
    }
    const tiny = founder(), [t] = holdable(tiny.g, [2033]); buySecurity(tiny.g, t.secId, 2_000); launch(tiny.g, tiny.a); expect(rows(tiny.g)).toEqual([])
    const late = founder(), [u] = holdable(late.g, [2033]); buySecurity(late.g, u.secId, 200_000); launch(late.g, late.a, { year: 2034 }); expect(rows(late.g)).toEqual([])
  })
  it('keeps the three largest stakes, counts an index call but not an index put, and targets only engine securities', () => {
    const { g, a } = founder(), ts = holdable(g, [2033]).slice(0, 5); expect(ts.length).toBeGreaterThanOrEqual(4)
    ts.forEach((t, i) => buySecurity(g, t.secId, 40_000 + 20_000 * i)); launch(g, a); expect(rows(g).map((c) => c.secId).sort()).toEqual(ts.slice(-3).map((t) => t.secId).sort())
    expect(listedTargets(g).every((t) => sectorOfSec(t.secId) !== null)).toBe(true)
    const withPos = (dir: 'call' | 'put') => { const x = founder(), inf = exchangeInfo('us'); moneyState(x.g).positions.push({ id: `opt-${dir}`, mode: 'real', side: 'buy', dir, strike: 'otm', k: 0.05, units: 4_000_000, premium: 100_000, year: x.g.year, exKey: inf.key, index: inf.ex.index, countryId: 'us', parentId: '', fx: 1 }); launch(x.g, x.a); return rows(x.g) }
    expect(withPos('put')).toEqual([]); expect(withPos('call').length).toBeGreaterThan(0); expect(withPos('call').every((c) => c.via === 'own')).toBe(true)
  })
  it('a repeat opens nothing new', () => {
    const { g, a } = founder(), [t] = holdable(g, [2033]); buySecurity(g, t.secId, 200_000); const w = launch(g, a)
    expect([launch(g, a) === w, waveInsiderCases(g, w, a.id), rows(g).length]).toEqual([true, 0, 1])
  })
})

describe('the writers and the existing case code', () => {
  it('a heavy pioneer launch passes the player asset (fiscal year = g.year - 1 as the yearly flow does), a launch dated after the year opens none', () => {
    let won = 0
    for (let seed = 1; seed <= 40 && won < 2; seed++) {
      const { g, a } = founder(seed, 2028), [t] = holdable(g, [2028], 'ai'); expect(t, 'no ai-supply stock listed').toBeDefined(); buySecurity(g, t.secId, 200_000)
      const twin = structuredClone(g)
      if (!advanceHeavy(g, a, bizOf(g, a), project(g, 'Autonomous Agent Platform', 0.98), g.year - 1).won) continue
      won++; expect(rows(g)).toHaveLength(1); expect(rows(g)[0]).toMatchObject({ cause: 'wave', role: 'founder', note: 'Autonomous Agent Platform' })
      advanceHeavy(twin, twin.assets[0], bizOf(twin, twin.assets[0]), project(twin, 'Autonomous Agent Platform', 0.98), twin.year); expect(rows(twin)).toEqual([])
    }
    expect(won).toBeGreaterThan(0)
  })
  it('the press story, the choices and the end of the case run through the existing code', () => {
    let seen = 0
    for (let seed = 1; seed <= 40 && seen < 2; seed++) {
      const { g, a } = founder(seed), [t] = holdable(g, [2033, 2034, 2035, 2036, 2037, 2038]); expect(buySecurity(g, t.secId, 1_000_000)).toBe(true); launch(g, a)
      const m = exposedIn(g, 2034, 2038); if (!m || m.kind !== 'choice') continue
      seen++; expect(m.text).toContain(`bought ${t.name} (${t.symbol}) shares shortly before you launched Smartphones`); expect(m.choices.map((c) => c.id)).toEqual(['deny', 'blame', 'lawyer'])
      expect(g.log.flatMap((l) => l.entries).some((e) => e.text === `The press found out I bought ${t.name} shares before I launched Smartphones.`)).toBe(true)
      g.queue = []; runScript(g, 'special.pol.abuse.exposed', 'lawyer', m.data, m); expect(rows(g)[0].status).toBe('closed'); expect(rows(g)[0].held).toBeUndefined()
    }
    expect(seen).toBeGreaterThan(0)
  }, 90_000)
  it('shows the warning in the Heavy R&D confirm only for a wave that still lands inside the window, and in the deep-tech confirm only for a listed program', () => {
    const heavy = (x: { g: GameState; a: Asset }) => allNodes(x.g, businessAssetView(x.g, x.a)).filter((n): n is MenuAction => n.type === 'action' && n.id.startsWith('biz.heavy.')).map((n) => ({ id: n.id, text: n.confirm?.(x.g) ?? '' }))
    const early = heavy(founder(5, 2028)), late = heavy(founder(5, 2033))
    expect(early.find((r) => r.id.includes('Autonomous Agent Platform'))?.text).toContain(INSIDER_WARNING); expect(early.some((r) => !r.text.includes(INSIDER_WARNING))).toBe(true); expect(late.some((r) => r.text.includes(INSIDER_WARNING))).toBe(false)
    const g = adultIn('us', 5e9, 3, 90, 2034), c = g.character, b = newBiz(g, 'aiLab', c.countryId, c.city, { cash: 0, ceo: 'owner', manager: null }), t = readTech(undefined)
    Object.assign(t, { level: 80, stage: 3 }); b.tech = JSON.parse(JSON.stringify(t)) as Json; const a = createBusinessAsset(g, 'Test aiLab', b, 0); g.assets.push(a)
    const dt = allNodes(g, businessAssetView(g, a)).filter((n): n is MenuAction => n.type === 'action' && n.id.startsWith('dt.rd.'))
    expect(dt.length).toBeGreaterThan(0); for (const n of dt) expect((n.confirm?.(g) ?? '').includes(INSIDER_WARNING), n.id).toBe(deepWaveFor('aiLab', n.id.slice(6).split('.')[0]) !== null)
    expect(dt.some((n) => deepWaveFor('aiLab', n.id.slice(6).split('.')[0]) !== null)).toBe(true)   // stage 3 and level 80 list twelve programs, `agents` and `frontier` among them (probed)
  })
})
```

- [ ] **Step 2: Run it to see it fail:** `npx vitest run --maxWorkers=1 test/wave-insider.test.ts`. Expected: FAIL, "Failed to resolve import ../src/game/business/wave-insider".
- [ ] **Step 3: `tech-wave-data.ts`** (pure, no new runtime import): `export const INSIDER_WARNING = 'If it works, related stocks move. Buying them in the year before the launch can count as insider trading.'` (105 static characters, two sentences, under the 120 cap) and `heavyStartsWave(trade, entry, launchYear)` = `heavyWaveFor(trade, entry.name) !== null && launchYear - entry.first <= HEAVY_WAVE_WINDOW`.
- [ ] **Step 4: `special/politics.ts`.** `InsiderCase.cause` also allows `'wave'`; add `role?: 'founder' | 'ceo'` and `note?: string`; `repairAbuse` accepts the cause, the role (only those two values) and `note` (text, 60 characters). `export interface InsiderCaseInput` and `export function openInsiderCase(g, input)`: id `wave-${input.key}` (return false when any case has it, whatever its status); `age`, `year`, `target`, `symbol`, `secId` from the target and the game; `cause: 'wave'`, `bullish: true`, `role`, `note`, `title` `Founder of ${company}` or `CEO of ${company}`, `office: 'mayor'`, `status: 'open'`, `via: routeOf(pos)`, `crony: pos.cronyName`, `evidence: POLICY_EVIDENCE[via]`, `stake` the sum of the position parts, `gain: Math.round(pos.shares * (mult - 1) + indexGain)`, `countryId` of the character, `quiet: 0`, `extra: []`; `tagBets(g, pos.betIds, id)`; then `addHidden(g, 'karma', -6)`, `count(g, 'insiderTrades')` and ``remember(g, `Traded ${input.target.name} shortly before I launched ${input.note}.`)`` as `announce` does; no heat change. It writes through `abuseData(g)`, so it creates the owner-stamped profile and nothing else. Four small edits: `causeText` gets `case 'wave': return \`launched ${cs.note || 'a breakthrough'}\``; `exposeCase` treats `cause === 'wave'` like a law (`const law = cs.cause === 'policy' || cs.cause === 'wave'`, so a shares case tells the "bought ... shortly before you" story) and its life-log line is `The press found out I bought ${cs.target}${unit} before I launched ${cs.note}.` for shares and `The press found out I bet on ${cs.target} before I launched ${cs.note}.` for a bet (the existing "before my announcement" would be false for a launch; both are under the 90-character log cap); `caseSeverity` skips the mayor and school discount when `cs.role` is set and caps a shares-only wave case at 3; `caseCharges` returns only `cs.extra` for a case with a `role`.
- [ ] **Step 5: `business/wave-insider.ts`: `waveInsiderCases(g, w, assetId)`.** The module imports `roleOf` and `type TechWave` from `./tech-wave-factors` (never `./tech-waves`, which imports this module). Return 0 unless the character is alive and not in prison, `w.year === g.year`, and the asset is one of `businessAssets(g)` whose company the player founded (`b.founderName === \`${first} ${last}\``, `!b.acquired`, role `founder`) or runs (`runsIt`, role `ceo`). Targets: `listedTargets(g)` whose `sectorOfSec` trade has role `core` or `supply` for `w.kind`. For each, `pos = insiderPositions(g, t, false, { freshOnly: true })`, `mult = waveStockFactor(g, t.secId, w.year) / waveStockFactor(g, t.secId, w.year - 1)`, `indexGain = pos.indexUnits x max(0, waveIndexFactor(g, t.exKey, w.year) / waveIndexFactor(g, t.exKey, w.year - 1) - 1)`; skip when `mult - 1 < 0.005`, the stake is 0 or `pos.shares x (mult - 1) + indexGain < local(g, 1000)`. Keep the three largest stakes and call `openInsiderCase` with `key: hashOf(\`${w.id}|${t.secId}\`).toString(36)`, `note: w.name`, `company` the asset's name. Return the count opened.
- [ ] **Step 6: The writers and the confirms.** `tech-waves.ts`: `WaveInput.by?: string`; after `announceWaveNews(g, stored)` in `announceWave` add `if (a.by) waveInsiderCases(g, stored, a.by)` (a repeat returns before it). `heavy-rd.ts` `advanceHeavy`: pass `by: a.id` and replace the inline `rec.year - def.first <= HEAVY_WAVE_WINDOW` with `heavyStartsWave(b.industry, def, rec.year)` (drop `HEAVY_WAVE_WINDOW` from that file's import when it goes unused: `noUnusedLocals`). `deeptech-sim.ts` `announceBreakthroughs`: `by: a.id` on its three `announceWave` calls. `manage.ts` `heavyAction`: its `quote` also returns `wave: heavyStartsWave(b.industry, x, g.year + years)` (`b` and `years` are already in scope there), and the confirm appends ` ${INSIDER_WARNING}` when `q.wave` is true (`x` is the catalogue `Breakthrough`, which has `name` and `first`); import `INSIDER_WARNING` and `heavyStartsWave` from `./tech-wave-data`. `deeptech-menu.ts` `programRow`: the confirm returns the existing funds sentence and `INSIDER_WARNING` joined by a space (either may be absent, `null` when both are) when `deepWaveFor(b.industry, def.id)` is non-null. If the load-order test fails with a "before initialization" error, the cycle is real: drop `by` and the hook from `announceWave` and call `waveInsiderCases` from `advanceHeavy` and `announceBreakthroughs` right after `announceWave` returns a wave whose id was not in `readTechWaves(g)` before the call.
- [ ] **Step 7: Run it to see it pass:** `npx vitest run --maxWorkers=1 test/wave-insider.test.ts`. Expected: all PASS.
- [ ] **Step 8: Typecheck:** `npm run typecheck` (about 12 s). Expected: no errors, in `src/` and in `test/`.
- [ ] **Step 9: Regression.** `npx vitest run --maxWorkers=1 test/politics-abuse.test.ts test/insider-fairness.test.ts test/insider-escrow.test.ts test/company-key.test.ts test/tech-waves-writers.test.ts test/heavy-project.test.ts test/voice-guards.test.ts` (13.5 + 10.7 + 14.1 + 13.5 + 14.1 + 49.9 + 3.0 s). `deeptech.test.ts` (149 s) walks every confirm but is not run here; the new test walks every `dt.rd.*` row.
- [ ] **Step 10: Commit**

```bash
git add src/game/business/wave-insider.ts src/game/special/politics.ts src/game/business/tech-waves.ts src/game/business/heavy-rd.ts src/game/business/deeptech-sim.ts src/game/business/tech-wave-data.ts src/game/business/manage.ts src/game/business/deeptech-menu.ts test/wave-kit.ts test/wave-insider.test.ts
git commit -m "feat(waves): a founder who trades ahead of their own launch is an insider" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Tq5bMwVNBuT54ZtqpiXV13"
```

## Task 6: The tag, the market clause and one news line

**Files:**
- Modify: `src/game/invest/wave-stocks.ts`, `src/game/investments.ts` (the `Quote.wave` field, one set in `listing`, one row in `offerNode`, one clause in `marketLine`, one line in `newsLines`)
- Test: `test/wave-stocks-surface.test.ts` (create)

**Interfaces:**
- Consumes: Task 1 `waveLevels`, `stockLevelFor`, `type WaveLevel`; Task 2 `SECTOR_TRADE`, `sectorOfSec`, `listedSectors`; `signed` (`history/market-events`); `anachronismsIn` (`events/era`); `SECTORS`, `slotPlan`, `exchangeByKey`.
- Produces (P8, P10): `sectorWaves(g: Pick<GameState, 'flags'>, secId: string, year: number): WaveLevel[]` (each live wave's own level `1 + STOCK_BETA x (v - 1)` on that stock's sector, biggest `|level - 1|` first); `waveTag(g: Pick<GameState, 'flags'>, secId: string, year: number): string | null` (`"<Name> wave: sector +19%"`); `waveClause(g: GameState, exKey: string, year: number): string | null` (`"<Name> wave: index +3%"`, the wave with the largest effect on the index, each wave's effect `1 + sum (level - 1) / n` over `listedSectors(g, exKey, year)`, the same `n` and clamp as `waveIndexFactor`); `waveNews(g: GameState, exKey: string, year: number): string | null` (`"<Name> wave moved <Sector label> stocks up 9%."`, `down` for a fall: the listed sector with the largest `|L(year) / L(year - 1) - 1|` of at least 3%, named for the wave that moved it most). All three return `null` below 0.5% (tag, clause) or 3% (news), with no live wave, or when `anachronismsIn(text, year, [exchange home])` flags the text. The news line stays under the 110-character year-digest cap by itself (the longest wave name is 28 characters and the longest sector label 23, so the longest line is about 80). `Quote.wave?: string` (never saved with a holding).

- [ ] **Step 1: Write the failing test** `test/wave-stocks-surface.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { anachronismsIn } from '../src/game/events/era'
import { signed } from '../src/game/history/market-events'
import { exchangeInfo } from '../src/game/invest/engine'
import { SECTOR_TRADE, sectorOfSec, sectorWaves, waveClause, waveIndexFactor, waveNews, waveTag } from '../src/game/invest/wave-stocks'
import { investmentListing, investmentsMenu } from '../src/game/investments'
import { roleOf, type TechWave } from '../src/game/business/tech-waves'
import type { GameState, Json, MenuGroup, MenuNode } from '../src/game/types'
import { COUNTRIES } from '../src/game/world'
import { makeTestGame } from './helpers'
import { allNodes } from './market-kit'

const J = (v: unknown): Json => v as Json
const near = (n: number) => expect.closeTo(n, 6)
const SMART = (o: Partial<TechWave> = {}): TechWave => ({ id: 'workshop:smartphone:2030:x', kind: 'smartphone', name: 'Smartphones', source: 'workshop', year: 2030, market: 'world', size: 0.5, hype: 0.8, delivery: 0.6, last: 2031, ...o })
const put = (g: GameState, ...w: TechWave[]) => { g.flags.techWaves = J(w) }
const world = () => { const g = makeTestGame(7, { age: 30, countryId: 'us', money: 5e9, residence: { status: 'renting', rent: 0 } }); g.lifeId = 'surface-waves'; g.year = 2031; return g }
const stock = (g: GameState, pick: (sector: string | null, role: string | null) => boolean) => investmentListing(g).find((q) => { if (q.type !== 'stock') return false; const s = sectorOfSec(q.secId), t = s ? SECTOR_TRADE[s] : null; return pick(s, t ? roleOf('smartphone', t) : null) })!
const textOf = (g: GameState, n: MenuNode) => (n.type === 'info' ? (typeof n.text === 'function' ? n.text(g) : n.text) : '')
const deepFreeze = (o: unknown): void => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v) } }

describe('the tag, the clause and the news line', () => {
  it('the tag names the live wave with the largest effect on the sector (at least 0.5%), the Quote row shows it, a bank gets none', () => {
    const g = world(); put(g, SMART()); const core = stock(g, (_s, r) => r === 'core'), bank = stock(g, (s) => s === 'banks')
    expect(sectorWaves(g, core.secId, 2031)).toEqual([{ id: 'workshop:smartphone:2030:x', name: 'Smartphones', level: near(1.189) }])
    expect([waveTag(g, core.secId, 2031), waveTag(g, bank.secId, 2031)]).toEqual(['Smartphones wave: sector +19%', null])
    put(g, SMART({ id: 'a' }), SMART({ id: 'b', name: 'Cheap phones', size: 0.2 })); expect(waveTag(g, core.secId, 2031)).toBe('Smartphones wave: sector +19%')
    put(g, SMART({ size: 0.05, hype: 0.1, delivery: 0 })); expect(waveTag(g, core.secId, 2031)).toBeNull()
    put(g, SMART()); const offer = allNodes(g, investmentsMenu.children(g)).find((n) => n.id === `inv-offer-${core.secId}`) as MenuGroup
    expect(offer.children(g).map((n) => textOf(g, n))).toContain('Smartphones wave: sector +19%')
  })
  it('the market line gets one clause for the biggest wave on the index, and the news adds at most one wave line a year, under 110 characters', () => {
    const g = world(), key = exchangeInfo('us').key; expect([waveClause(g, key, 2031), waveNews(g, key, 2031)]).toEqual([null, null])
    put(g, SMART({ year: 2031 }), SMART({ id: 'chips', kind: 'chips', name: 'Chip leap', year: 2031, size: 0.6, hype: 1, delivery: 1 }))   // announced this year, so the year's move is the whole level
    const lines = allNodes(g, investmentsMenu.children(g)).filter((n) => n.id.startsWith('inv-news-')).map((n) => textOf(g, n)), clause = waveClause(g, key, 2031)!
    expect(clause).toMatch(/^[A-Za-z ]+ wave: index [+\u2212]\d+%$/); expect(lines[0].endsWith(` · ${clause}`)).toBe(true)
    const news = lines.filter((l) => / wave moved .+ stocks (up|down) \d+%\.$/.test(l)); expect(news).toHaveLength(1); expect(news[0].length).toBeLessThan(110)
    expect(news[0]).toMatch(/^Chip leap wave moved Semiconductors stocks up 4[34]%\.$/)   // the US lists chip makers as Semiconductors in 2031 and no Electronics company, which the exchange plan would name first (P10)
    put(g, SMART()); expect(waveClause(g, key, 2031)).toBe(`Smartphones wave: index ${signed(waveIndexFactor(g, key, 2031))}`)
    put(g, SMART({ size: 0.05, hype: 0.1, delivery: 0 })); expect([waveClause(g, key, 2031), waveNews(g, key, 2031)]).toEqual([null, null])
  })
  it('skips a name the era check flags and keeps the rest', () => {
    let skipped = 0
    for (const c of COUNTRIES.map((x) => x.id)) for (const y of [2007, 2009, 2011]) {
      const key = exchangeInfo(c).key, g = makeTestGame(1); g.year = y
      put(g, SMART({ year: 2005, last: 2011 })); const s = waveClause(g, key, y); put(g, SMART({ year: 2005, last: 2011, name: 'Frontier AI' })); const f = waveClause(g, key, y)
      if (s !== null) expect(anachronismsIn(s, y, [c])).toEqual([]); else if (f !== null) skipped++
    }
    expect(skipped).toBeGreaterThan(0)
  })
  it('renders from a deep-frozen state and never holds an em-dash, NaN or undefined', () => {
    const g = world(), key = exchangeInfo('us').key; put(g, SMART()); const id = stock(g, (_s, r) => r === 'core').secId; deepFreeze(g)
    const texts = [waveTag(g, id, 2031), waveClause(g, key, 2031), waveNews(g, key, 2031), ...sectorWaves(g, id, 2031).map((x) => x.name)]
    for (const t of texts) expect(t ?? '').not.toMatch(/\u2014|\u2013|NaN|undefined|Infinity/)
  })
})
```

- [ ] **Step 2: Run it to see it fail:** `npx vitest run --maxWorkers=1 test/wave-stocks-surface.test.ts`. Expected: FAIL, `TypeError: sectorWaves is not a function`.
- [ ] **Step 3: Implement in `wave-stocks.ts`.** `sectorWaves` maps the stock to its trade and exchange home and returns `waveLevels` sorted by `|level - 1|` (a wave that does not exist yet or has no role is absent, and the pioneer exemption of P9 applies). The clause sums each wave's `(level - 1) / n` over `listedSectors(g, exKey, year)` (same `n` and clamp 0.5 to 1.5 as `waveIndexFactor`). The news line compares each distinct listed sector's `stockLevelFor` at `year` and `year - 1`, takes the first one (in `listedSectors` order) with the largest `|move|` of at least 3%, and names the wave whose own level changed most on that sector between the two years (`null` when none is live). The three texts are built with `signed` and `SECTORS[sector].label` and pass the era check; none writes.
- [ ] **Step 4: Surface them in `investments.ts`.** `Quote` gets `wave?: string`; in `listing`, set it on each stock quote from `waveTag(g, def.id, y)` (conditional spread, stocks only, not pennies); `offerNode` pushes `q.wave` as one extra info row right after the sector row; `marketLine` appends ` · ${clause}` when `waveClause(g, info.key, ey.year)` is non-null; `newsLines` pushes `waveNews(g, l.info.key, y)` right after the market line when non-null.
- [ ] **Step 5: Run it to see it pass:** `npx vitest run --maxWorkers=1 test/wave-stocks-surface.test.ts`. Expected: all PASS.
- [ ] **Step 6: Typecheck:** `npm run typecheck` (about 12 s). Expected: no errors, in `src/` and in `test/`.
- [ ] **Step 7: Regression.** `npx vitest run --maxWorkers=1 test/investments.test.ts test/stocks-real.test.ts test/voice-guards.test.ts` (11.2 + 28.6 + 3.0 s; the em-dash count must stay 24).
- [ ] **Step 8: Commit**

```bash
git add src/game/invest/wave-stocks.ts src/game/investments.ts test/wave-stocks-surface.test.ts
git commit -m "feat(waves): a stock tag, a market clause and one news line for a wave" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Tq5bMwVNBuT54ZtqpiXV13"
```

## Task 7: The story, heirs, old saves and the architecture notes

**Files:**
- Create: `test/wave-stocks-story.test.ts`
- Modify: `docs/ARCHITECTURE.md` (a "Tech waves and stocks" subsection after "Tech waves"; the layout entries; the two sentences that say listed stocks wait for release 1b)

**Interfaces:**
- Consumes: everything above; `rows`, `holdable`, `exposedIn` and `project` from `test/wave-kit.ts` (Task 5). The hand-off lines and the old-save load are written inline in the test below (they follow `handOff` and `loadFixtureV1` of `test/tech-waves-wiring.test.ts`, which are file-local and not copied).
- Produces: nothing new in `src/`.

- [ ] **Step 1: Write the failing test** `test/wave-stocks-story.test.ts`. The story runs through real code with no rule mocked: `play(seed, position)` builds a 2028 founder with a software company and the Investing talent, optionally buys $200,000 of a stock the `ai` wave lifts, and forces the launch roll the way `test/tech-waves-writers.test.ts` does (odds 0.98, `g.year - 1` as the fiscal year). `rows`, `holdable`, `exposedIn` and `project` are the `test/wave-kit.ts` helpers of Task 5 (here `holdable` is called with the `'ai'` kind, which the US exchange lists as semiconductor supply stocks).

```ts
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { ageUp } from '../src/game/aging'
import { marketMove } from '../src/game/business/fund-model'
import { advanceHeavy } from '../src/game/business/heavy-rd'
import { bizOf } from '../src/game/business/state'
import { readTechWaves } from '../src/game/business/tech-waves'
import { killCharacter } from '../src/game/death'
import { marketInstinct } from '../src/game/invest/instinct'
import { waveStockFactor } from '../src/game/invest/wave-stocks'
import { buySecurity, investmentListing, investmentsMenu } from '../src/game/investments'
import { continueAsChild } from '../src/game/life'
import { createPerson } from '../src/game/people'
import { migrateSave, SAVE_SCHEMA } from '../src/game/save-schema'
import { peek } from '../src/game/special/common'
import type { GameState, MenuNode } from '../src/game/types'
import { adult, allNodes, company } from './market-kit'
import { exposedIn, holdable, project, rows } from './wave-kit'

const textOf = (g: GameState, n: MenuNode) => (n.type === 'info' ? (typeof n.text === 'function' ? n.text(g) : n.text) : '')
function play(seed: number, position: boolean) {
  const g = adult(seed, 2028, 'us'), a = company(g, 'software', { cash: 80_000_000 }); g.queue = []; g.character.talents = ['Business', 'Investing']
  const t = holdable(g, [2028], 'ai')[0]; expect(t, 'no ai-supply stock listed in 2028').toBeDefined(); if (position) expect(buySecurity(g, t.secId, 200_000)).toBe(true)
  const before = structuredClone(g), won = advanceHeavy(g, a, bizOf(g, a), project(g, 'Autonomous Agent Platform', 0.98), g.year - 1).won
  return { g, a, t, before, won }
}
const launched = (position: boolean) => { for (let seed = 1; seed <= 40; seed++) { const p = play(seed, position); if (p.won) return p } throw new Error('no launch won in 40 seeds') }

describe('the story', () => {
  it('a heavy launch lifts the sector level, the quote, the funds, the gut and the screen', () => {
    for (const position of [true, false]) {
      const { g, before, t } = launched(position), lvl = waveStockFactor(g, t.secId, g.year), price = (x: GameState) => investmentListing(x).find((q) => q.secId === t.secId)!.price
      expect(readTechWaves(g)[0]).toMatchObject({ kind: 'ai', year: g.year }); expect(lvl).toBeGreaterThan(1); expect(price(g) / price(before)).toBeCloseTo(lvl, 9)
      expect((1 + marketMove(g, 'us', g.year)) / (1 + marketMove(before, 'us', g.year))).toBeGreaterThan(1); expect(marketInstinct(g)).not.toBe(marketInstinct(before))
      expect(allNodes(g, investmentsMenu.children(g)).some((n) => textOf(g, n).startsWith('Autonomous Agent Platform wave: sector '))).toBe(true)
    }
  })
  it('an insider position is caught on some seed and a clean one never', () => {
    let caught = 0
    for (let seed = 1; seed <= 40 && caught < 2; seed++) {
      const dirty = play(seed, true), clean = play(seed, false); if (!dirty.won) continue
      expect(rows(dirty.g)).toHaveLength(1); expect(rows(dirty.g)[0]).toMatchObject({ cause: 'wave', role: 'founder' })
      if (exposedIn(dirty.g, dirty.g.year + 1, dirty.g.year + 6)) caught++
      if (clean.won) { expect(rows(clean.g)).toEqual([]); expect(exposedIn(clean.g, clean.g.year + 1, clean.g.year + 6)).toBeUndefined() }
    }
    expect(caught).toBeGreaterThan(0)
  }, 120_000)
  it('an heir inherits the waves and the level but never the case', () => {
    const { g, t } = launched(true); expect(rows(g)).toHaveLength(1)
    g.character.age = 70; const heir = createPerson(g, { relation: 'child', age: 40, lastName: g.character.lastName, money: 1_000 }); killCharacter(g, 'Old Age'); g.queue = []
    const n = continueAsChild(g, heir.id)
    expect(readTechWaves(n)).toEqual(readTechWaves(g)); expect(waveStockFactor(n, t.secId, g.year)).toBeCloseTo(waveStockFactor(g, t.secId, g.year), 9); expect([peek(g, 'politics') !== null, peek(n, 'politics')]).toEqual([true, null])
  })
})

describe('old saves, money paths and notes', () => {
  it('an old save loads with no wave state and plays years', () => {
    const r = migrateSave(structuredClone(JSON.parse(gunzipSync(readFileSync('test/fixtures/save-v1.json.gz')).toString()) as Record<string, unknown>))
    if (r.kind !== 'ready') throw new Error(`expected a ready save, got ${JSON.stringify(r)}`)
    const game = r.game; for (let i = 0; i < 3; i++) { game.queue = []; ageUp(game) }
    expect([SAVE_SCHEMA, ['techWaves', 'techBase'].filter((k) => k in game.flags), investmentListing(game).length > 0]).toEqual([2, [], true])
  })
  it('no new code path adds money (C-03)', () => {
    for (const f of ['invest/wave-stocks.ts', 'invest/clock.ts', 'business/wave-insider.ts']) expect(readFileSync(`src/game/${f}`, 'utf8'), f).not.toMatch(/\b(addMoney|earnIncome|realize|spend)\(/)
  })
  it('the architecture notes name the new modules and say listed stocks take the level', () => {
    const arch = readFileSync('docs/ARCHITECTURE.md', 'utf8')
    for (const name of ['invest/wave-stocks.ts', 'invest/clock.ts', 'business/wave-insider.ts', '### Tech waves and stocks']) expect(arch, name).toContain(name)
    for (const stale of ['listed stocks are untouched until release 1b', 'listed stocks stay wave-free until release 1b']) expect(arch).not.toContain(stale)
  })
})
```

- [ ] **Step 2: Run it to see it fail:** `npx vitest run --maxWorkers=1 test/wave-stocks-story.test.ts`. Expected: FAIL on `the architecture notes name the new modules` only (the notes are not written yet); any other failure means an earlier task is incomplete, so fix that task and never loosen an assertion.
- [ ] **Step 3: `docs/ARCHITECTURE.md`.** Add "### Tech waves and stocks (invest/wave-stocks.ts, invest/clock.ts, business/wave-insider.ts)" after the "Tech waves" section, one paragraph each: the trail and `nx` and why a level read is the same before and after the step; `stockLevelFor` and the per-wave product (P1), settled `stock` and its reach (P4); the sector table and the two seam functions; the clock; the quoted company's stamp (`q`, P5) and its deliberate lag; the insider rule and the owner-stamped case; the tag, clause and news; the Priority 0 notes (C-03, C-04, C-12) and what is not in this release (penny stocks, bonds, option premiums, a per-stock beta, put-side insider cases, Workshop and rival waves as insider origins). Add `invest/wave-stocks.ts invest/clock.ts business/wave-insider.ts` to the layout block next to the tech-wave files (the entry at "business/tech-waves.ts tech-wave-factors.ts ..." near the top). Two sentences of the existing "Tech waves" section go stale and change: "listed stocks are untouched until release 1b" in its opening paragraph becomes a sentence saying listed stocks take a sector level (see the new subsection), and in "Where each reader applies its factor" the sentence about a quoted company ("its valuation reads no stamp and no history row, and `operatingValue` asks `industryCycle` without the wave, so listed stocks stay wave-free until release 1b") becomes one saying it reads a stock-grade stamp (`q`) and `industryCycle(..., 'stock')`, with no history row. The test above fails if either old sentence is left.
- [ ] **Step 4: Run it to see it pass:** `npx vitest run --maxWorkers=1 test/wave-stocks-story.test.ts`. Expected: all PASS.
- [ ] **Step 5: Typecheck:** `npm run typecheck` (about 12 s). Expected: no errors, in `src/` and in `test/`.
- [ ] **Step 6: Regression.** `npx vitest run --maxWorkers=1 test/save-schema.test.ts test/tech-waves-wiring.test.ts` (14.2 + 15.0 s). The spec's other must-pass families (`own-listing-menu`, `own-trade`, `share-classes`, `share-classes-menu`, `share-classes-story`, `share-classes-control`, `share-classes-capital`) cover code no task here touches except through `exchangeMove`, `valuationOf` and `shockFactor`, which Tasks 2 to 4 already pin; they and the full suite run once at integration, not here.
- [ ] **Step 7: Commit**

```bash
git add test/wave-stocks-story.test.ts docs/ARCHITECTURE.md
git commit -m "test(waves): the stocks story, heirs and old saves; architecture notes" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Tq5bMwVNBuT54ZtqpiXV13"
```

## Self-review (done when this plan was written)

- Spec coverage: S1 to S3 and S6 to S7 (Task 1), S4 to S5, S9 to S10 (Task 2), S11 (Task 3), S12 (Task 4), S13 and S15 (Task 5), S14 (Task 6), S16 (Tasks 1, 4, 5: every new field optional), S17 (Task 4), sections 8 to 10 (Priority 0 paragraph, Review Focus, Tasks 5 and 7). Spec items changed here are P1 to P11; the spec's `insiderWarning(kind)` became a constant (P6).
- Names across tasks: `stockLevelFor`, `stateAt`, `wavesAt`, `waveLevels`, `WaveLevel`, `nextStepTag`, `stepWave`, `projectWave`, `waveSignature`, `STOCK_BETA` (Task 1) are used unchanged in Tasks 2, 4 and 6; `waveStockFactor`, `waveIndexFactor`, `listedSectors`, `SECTOR_TRADE`, `sectorOfSec` (Task 2) in Tasks 5 and 6; `marketYearOf`, `marketFamily`, `marketAnchor` (Task 2) in Tasks 3 and 4, `bookedMarketMove` (Task 3) only in `economy.ts`; `INSIDER_WARNING`, `heavyStartsWave`, `waveInsiderCases`, `openInsiderCase`, `WaveInput.by` (Task 5) in Task 7; `test/wave-kit.ts` (Task 5) in Task 7; `sectorWaves`, `waveTag`, `waveClause`, `waveNews`, `Quote.wave` only in Task 6.
- Every fixture stays on the US exchange: the stock sectors of an exchange follow its real companies, not `slotPlan`, and the US lists core and supply stocks for every kind the tests use (probed for seeds 1 to 40 in 2028 and 2033 against this worktree).
