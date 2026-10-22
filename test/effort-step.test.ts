// ci: fast
// R3-E5 (C.1, the engine): `resolve` turns the caller's single draw into an outcome, `landQuality` is the launch roll of rd.ts with
// the caller's draw, `step` books what a run taught (a failure banks know-how, a win lifts ambition a little) and the `fx` record is
// the nine numbers a project keeps about its own effort. The engine draws nothing: the caller draws one number (and a second only on
// a win) in today's order and hands it over, so every old draw sequence is kept.
//
// The cases that matter most: 10,000 seeded draws give the same win count as `chance`, the second draw happens only on a win, a
// second `step` in one year changes nothing, know-how never passes 100 over 400 failures (so the odds it banks never pass 15 points),
// and the sink Knowledge binds hears about each run once and never about a replay.
//
// No pinned seed: every life is makeTestGame's own, with a tuple of arguments.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { FX_CAPS, newFx, normalizeFx } from '../src/game/effort/fx'
import { KNOW_MAX, KNOW_ODDS_MAX, SHIFT_MAX, WIN_SHIFT } from '../src/game/effort/limits'
import { knowOdds } from '../src/game/effort/curves'
import { YOU_KEY, ambitionOf, readYou } from '../src/game/effort/persona'
import { causeOf, landQuality, resolve, step } from '../src/game/effort/step'
import { defineTask } from '../src/game/effort/task'
import type { Fx, Outcome, OutcomeKind, Quote, TermKey } from '../src/game/effort/types'
import { chance, rand } from '../src/game/rng'
import type { GameState } from '../src/game/types'
import { makeTestGame } from './helpers'
import { layerOf } from './layer-kit'

// Knowledge binds the real sink later; here the sink is a spy, so these cases hold whoever binds it.
const sink = vi.hoisted(() => vi.fn())
vi.mock('../src/game/effort/hooks', async (importOriginal) => ({ ...(await importOriginal<typeof import('../src/game/effort/hooks')>()), revealedSink: sink }))

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)

const FIELD = 'rd.beverage'
const TASK = defineTask({
  field: FIELD, mode: 'project', cost: 50_000, hit: { p: 0.1, bonus: 8 }, partial: 0.1,
  quality: { up: 28, down: 14, exp: 0.8, ceiling: 97, room: 0, lo: 5, hi: 97 },
})

/** A quote with these terms; everything not named is neutral. */
function quoteOf(p: number, over: Partial<Quote> = {}, rows: readonly (readonly [TermKey, number])[] = []): Quote {
  return {
    p, hitP: 0, years: 2, yearsExact: 2, quality: 60, spread: 8, k: 1, spend: 50_000, payrollX: 1,
    reasons: rows.map(([key, pts]) => ({ key, label: key, pts })),
    effort: { crew: 1, tools: 0, rho: 1, phi: 1, speed: 1 },
    risk: { shortcut: 0, explosion: 0, scandal: 0 }, burnout: false, capped: [],
    ...over,
  }
}

const adult = (): GameState => makeTestGame(7, { age: 30 })

/** A failed run and a win, as `resolve` would hand them over. */
const fail = (done = 0.5): Outcome => ({ kind: 'fail', margin: -20, cause: 'deadEnd', done })
const win = (kind: OutcomeKind = 'works'): Outcome => ({ kind, margin: 20, cause: null, done: 1 })

/** A state whose rng cannot be read or written: any draw inside `step` throws. */
function noRng(g: GameState): GameState {
  Object.defineProperty(g, 'rng', {
    get() {
      throw new Error('step touched g.rng')
    },
    set() {
      throw new Error('step wrote g.rng')
    },
    configurable: true,
  })
  return g
}

describe('the files', () => {
  it('are layer 2, hold no dash, and draw and book nothing', () => {
    for (const name of ['step', 'fx']) {
      expect(layerOf(`src/game/effort/${name}.ts`)).toBe(2)
      const text = readFileSync(join(ROOT, 'src', 'game', 'effort', `${name}.ts`), 'utf8')
      expect(DASH.test(text)).toBe(false)
      expect(text).not.toMatch(/from '\.\.\/(rng|cash|ledger|spend|streams)'/)
      expect(text).not.toMatch(/from '\.\.\/kernel\//)
      expect(text).not.toMatch(/\b(Math\.random|Date)\b|\.rng\b/)
    }
  })
})

describe('resolve', () => {
  it('works exactly when the draw is under the odds, the test chance() makes (10,000 seeded draws)', () => {
    for (const p of [0.05, 0.37, 0.5, 0.95]) {
      const a = makeTestGame(3)
      const b = makeTestGame(3)
      const q = quoteOf(p)
      let winsA = 0
      let winsB = 0
      for (let i = 0; i < 10_000; i++) {
        if (chance(a, p)) winsA++
        if (resolve(q, rand(b)).kind === 'works') winsB++
      }
      expect(winsB).toBe(winsA)
      expect(b.rng).toBe(a.rng)
    }
  })

  it('is strict at the edge: a draw equal to the odds fails, one just under works', () => {
    const q = quoteOf(0.5)
    expect(resolve(q, 0.5).kind).toBe('fail')
    expect(resolve(q, 0.5 - 1e-12).kind).toBe('works')
    expect(resolve(q, 0).kind).toBe('works')
    expect(resolve(quoteOf(0), 0).kind).toBe('fail')
  })

  it('draws nothing itself and calls the hit draw only on a win with a hit chance, in today\'s order', () => {
    const p = 0.55
    const hitP = 0.1
    const q = quoteOf(p, { hitP })
    const a = makeTestGame(11)
    const b = makeTestGame(11)
    let calls = 0
    let wins = 0
    for (let i = 0; i < 3_000; i++) {
      // today (rd.ts advanceRd): chance(p); on a win chance(HIT_P) and then one rand for the quality spread
      const wonA = chance(a, p)
      const hitA = wonA ? chance(a, hitP) : false
      const rA = wonA ? rand(a) : -1
      const o = resolve(q, rand(b), { drawHit: () => (calls++, rand(b)) })
      const wonB = o.kind === 'works' || o.kind === 'hit'
      const rB = wonB ? rand(b) : -1
      expect(wonB).toBe(wonA)
      expect(o.kind === 'hit').toBe(hitA)
      expect(rB).toBe(rA)
      if (wonB) wins++
    }
    expect(calls).toBe(wins)
    expect(b.rng).toBe(a.rng)
  })

  it('never calls the hit draw when there is no hit chance, and never counts a hit without one', () => {
    const draw = vi.fn(() => 0)
    for (let i = 0; i <= 20; i++) expect(resolve(quoteOf(0.5), i / 20, { drawHit: draw }).kind).not.toBe('hit')
    expect(draw).not.toHaveBeenCalled()
    expect(resolve(quoteOf(0.5, { hitP: 0.3 }), 0.1).kind).toBe('works')
  })

  it('makes a hit only when the second draw is under the hit chance', () => {
    const q = quoteOf(0.9, { hitP: 0.2 })
    expect(resolve(q, 0.1, { drawHit: () => 0.19 }).kind).toBe('hit')
    expect(resolve(q, 0.1, { drawHit: () => 0.2 }).kind).toBe('works')
    expect(resolve(q, 0.95, { drawHit: () => 0 }).kind).toBe('fail')
  })

  it('finds a partial result in the band just over the odds, only when the task has one', () => {
    const q = quoteOf(0.5)
    expect(resolve(q, 0.55, { partial: 0.1 }).kind).toBe('partial')
    expect(resolve(q, 0.6, { partial: 0.1 }).kind).toBe('fail')
    expect(resolve(q, 0.55).kind).toBe('fail')
    expect(resolve(q, 0.45, { partial: 0.1 }).kind).toBe('works')
    expect(resolve(q, 0.55, { partial: 0 }).kind).toBe('fail')
  })

  it('reports the margin as (p - u) * 100, negative on a failure', () => {
    expect(resolve(quoteOf(0.6), 0.4).margin).toBeCloseTo(20, 9)
    expect(resolve(quoteOf(0.6), 0.9).margin).toBeCloseTo(-30, 9)
  })

  it('says how far the work got: what the caller passes, cut to 0..1, else whole for a win and half for the rest', () => {
    const q = quoteOf(0.5)
    expect(resolve(q, 0.1).done).toBe(1)
    expect(resolve(q, 0.9).done).toBe(0.5)
    expect(resolve(q, 0.9, { done: 0.2 }).done).toBe(0.2)
    expect(resolve(q, 0.9, { done: 7 }).done).toBe(1)
    expect(resolve(q, 0.9, { done: -3 }).done).toBe(0)
    expect(resolve(q, 0.9, { done: Number.NaN }).done).toBe(0.5)
    expect(resolve(q, 0.55, { partial: 0.1 }).done).toBe(0.5)
  })

  it('is total: a draw or a quote that is not a number fails instead of throwing', () => {
    for (const u of [Number.NaN, Infinity, -Infinity, undefined as unknown as number, 'x' as unknown as number]) {
      expect(resolve(quoteOf(0.5), u).kind).toBe('fail')
    }
    for (const q of [null, undefined, 5, 'q', {}, { p: 'high' }, { p: Number.NaN }]) {
      expect(() => resolve(q as unknown as Quote, 0.3)).not.toThrow()
      expect(resolve(q as unknown as Quote, 0.3).kind).toBe('fail')
    }
  })

  it('does not change the quote it reads', () => {
    const q = Object.freeze(quoteOf(0.5, {}, [['funding', -5]]))
    expect(() => resolve(q, 0.9)).not.toThrow()
  })
})

describe('the cause of a failure', () => {
  const lose = (rows: readonly (readonly [TermKey, number])[]) => resolve(quoteOf(0.3, {}, rows), 0.9).cause

  it('is the largest negative line, named for what it was', () => {
    expect(lose([['funding', -9], ['hard', -3]])).toBe('starved')
    expect(lose([['crew', -7], ['funding', -2]])).toBe('churn')
    expect(lose([['rival', -8]])).toBe('rival')
    expect(lose([['tired', -6]])).toBe('tired')
    expect(lose([['bold', -5]])).toBe('shortcut')
  })

  it('is a dead end when the biggest loss is the field itself, or nothing was negative', () => {
    expect(lose([['hard', -12], ['funding', -3]])).toBe('deadEnd')
    expect(lose([['team', -4]])).toBe('deadEnd')
    expect(lose([['team', 9], ['funding', 7]])).toBe('deadEnd')
    expect(lose([])).toBe('deadEnd')
  })

  it('ignores gains and goes by size, the earlier line winning a tie', () => {
    expect(lose([['team', 20], ['tired', -4], ['funding', -4]])).toBe('tired')
    expect(lose([['funding', -4], ['tired', -4]])).toBe('starved')
    expect(lose([['funding', -4], ['tired', -4.5]])).toBe('tired')
  })

  it('is a pure function of the reasons, with no cause for a result that worked', () => {
    const q = quoteOf(0.3, {}, [['funding', -9]])
    expect(causeOf(q.reasons)).toBe('starved')
    expect(causeOf(q.reasons)).toBe(causeOf(q.reasons))
    expect(resolve(q, 0.1).cause).toBeNull()
    expect(resolve(q, 0.35, { partial: 0.1 }).cause).toBeNull()
  })

  it('reads hostile reasons as no reason', () => {
    for (const reasons of [null, undefined, 5, 'x', [null, 3, 'a', { key: 'funding', pts: 'x' }, { key: 'funding', pts: Number.NaN }, { pts: -5 }]]) {
      expect(causeOf(reasons as never)).toBe('deadEnd')
    }
  })
})

describe('landQuality', () => {
  it('is round(clamp(quality + (2r - 1) * spread + the hit bonus)) within the bounds', () => {
    const q = quoteOf(0.5, { quality: 60, spread: 8 })
    expect(landQuality(q, TASK, 0.5, false)).toBe(60)
    expect(landQuality(q, TASK, 1, false)).toBe(68)
    expect(landQuality(q, TASK, 0, false)).toBe(52)
    expect(landQuality(q, TASK, 0.5, true)).toBe(68)
    expect(landQuality(q, TASK, 1, true)).toBe(76)
    expect(landQuality(q, TASK, 0.3125, false)).toBe(Math.round(60 + (2 * 0.3125 - 1) * 8))
  })

  it('takes the caller\'s bounds, else the task\'s quality curve, else 0 to 100', () => {
    const q = quoteOf(0.5, { quality: 95, spread: 8 })
    expect(landQuality(q, TASK, 1, true, { lo: 5, hi: 99 })).toBe(99)
    expect(landQuality(q, TASK, 1, true)).toBe(97)
    expect(landQuality(quoteOf(0.5, { quality: 3 }), TASK, 0, false, { lo: 5, hi: 99 })).toBe(5)
    const bare = defineTask({ field: 'x.bare', mode: 'project', cost: 1000 })
    expect(landQuality(quoteOf(0.5, { quality: 99, spread: 8 }), bare, 1, true)).toBe(100)
    expect(landQuality(quoteOf(0.5, { quality: 1, spread: 8 }), bare, 0, false)).toBe(0)
  })

  it('draws nothing, reads a draw outside 0..1 as the nearest end, and answers 0 for a task with no quality', () => {
    const q = quoteOf(0.5, { quality: 60, spread: 8 })
    expect(landQuality(q, TASK, 5, false)).toBe(landQuality(q, TASK, 1, false))
    expect(landQuality(q, TASK, -5, false)).toBe(landQuality(q, TASK, 0, false))
    expect(landQuality(q, TASK, Number.NaN, false)).toBe(60)
    expect(landQuality(quoteOf(0.5, { quality: null }), TASK, 0.5, false)).toBe(0)
    expect(() => landQuality(null as unknown as Quote, TASK, 0.5, false)).not.toThrow()
  })

  it('matches the launch roll of rd.ts over a grid of qualities and draws', () => {
    for (let quality = 5; quality <= 97; quality += 8) {
      for (let r = 0; r <= 1; r += 0.125) {
        for (const hit of [false, true]) {
          const today = Math.round(Math.min(99, Math.max(5, quality + (r * 2 - 1) * 8 + (hit ? 8 : 0))))
          expect(landQuality(quoteOf(0.5, { quality, spread: 8 }), TASK, r, hit, { lo: 5, hi: 99 })).toBe(today)
        }
      }
    }
  })
})

describe('the fx record', () => {
  const KEYS = ['v', 'progress', 'quality', 'spent', 'hours', 'setbacks', 'insight', 'fatigue', 'last']

  it('starts at zero, stamped the year before it began so the first year books', () => {
    expect(newFx(2030)).toEqual({ v: 1, progress: 0, quality: 0, spent: 0, hours: 0, setbacks: 0, insight: 0, fatigue: 0, last: 2029 })
    expect(Object.keys(newFx(2030))).toEqual(KEYS)
  })

  it('reads a good record back unchanged', () => {
    const f: Fx = { v: 1, progress: 0.5, quality: 71, spent: 120_000, hours: 480, setbacks: 2, insight: 34.5, fatigue: 12.5, last: 2031 }
    expect(normalizeFx(f)).toEqual(f)
    expect(normalizeFx(JSON.parse(JSON.stringify(f)))).toEqual(f)
  })

  it('is total and cuts every number to its cap, whatever a save holds', () => {
    const hostile: unknown[] = [
      null, undefined, 'fx', 42, true, [], [1, 2], Number.NaN, () => 1,
      {}, { progress: 'x', quality: Number.NaN, spent: Infinity, hours: -Infinity, setbacks: {}, insight: [], fatigue: null, last: 'y' },
      { v: 9, progress: 1e9, quality: 1e9, spent: 1e30, hours: 1e30, setbacks: 1e9, insight: 1e9, fatigue: 1e9, last: 1e9 },
      { progress: -5, quality: -5, spent: -5, hours: -5, setbacks: -5, insight: -5, fatigue: -5, last: -1e9 },
      JSON.parse('{"__proto__":{"progress":1},"constructor":{"x":1},"progress":0.25,"junk":[1,2,3]}'),
    ]
    for (const raw of hostile) {
      let f: Fx | undefined
      expect(() => (f = normalizeFx(raw))).not.toThrow()
      expect(Object.keys(f!)).toEqual(KEYS)
      expect(f!.v).toBe(1)
      for (const k of KEYS.slice(1)) {
        const v = (f as unknown as Record<string, number>)[k]!
        expect(Number.isFinite(v)).toBe(true)
        expect(v).toBeGreaterThanOrEqual(k === 'last' ? -1 : 0)
        expect(v).toBeLessThanOrEqual((FX_CAPS as Record<string, number>)[k]!)
      }
      expect(normalizeFx(f)).toEqual(f)
    }
    expect(normalizeFx({ progress: 1e9 }).progress).toBe(FX_CAPS.progress)
    expect(normalizeFx({ setbacks: 2.7 }).setbacks).toBe(3)
    expect(normalizeFx(JSON.parse('{"__proto__":{"progress":1}}')).progress).toBe(0)
    expect(({} as Record<string, unknown>).progress).toBeUndefined()
  })

  it('names caps a person could defend', () => {
    expect(FX_CAPS.progress).toBe(1)
    expect(FX_CAPS.insight).toBe(KNOW_MAX)
    expect(FX_CAPS.fatigue).toBe(100)
  })
})

describe('step: a failure banks know-how', () => {
  it('teaches the player the field and stamps the year, without touching ambition on a loss', () => {
    const g = adult()
    const before = ambitionOf(g)
    const r = step(g, TASK, fail(), { year: 2030, who: 'you' })
    const y = readYou(g)
    expect(r.replay).toBe(false)
    expect(r.learned).toBeGreaterThan(0)
    expect(r.knowledge).toBe(y.fieldK[FIELD])
    expect(r.knowledge).toBe(r.learned)
    expect(y.at[FIELD]).toBe(2030)
    expect(r.shift).toBe(0)
    expect(y.shift).toBe(0)
    expect(ambitionOf(g)).toBe(before)
    expect(r.reveals).toHaveLength(1)
  })

  it('banks the damped share of how far it got, so a run that got further teaches more', () => {
    const lo = step(adult(), TASK, fail(0.2), { year: 2030, who: 'you' })
    const hi = step(adult(), TASK, fail(1), { year: 2030, who: 'you' })
    expect(hi.learned).toBeGreaterThan(lo.learned)
    expect(step(adult(), TASK, fail(0), { year: 2030, who: 'you' }).learned).toBe(0)
  })

  it('banks less the more you know, and never past 100 over 400 failures', () => {
    const g = adult()
    let last = Infinity
    for (let i = 0; i < 12; i++) {
      const r = step(g, TASK, fail(1), { year: 2030 + i, who: 'you' })
      expect(r.learned).toBeLessThanOrEqual(last)
      last = r.learned
    }
    for (let i = 12; i < 400; i++) {
      const r = step(g, TASK, fail(1), { year: 2030 + (i % 7000), who: 'you' })
      expect(r.knowledge).toBeLessThanOrEqual(KNOW_MAX)
      expect(readYou(g).fieldK[FIELD]!).toBeLessThanOrEqual(KNOW_MAX)
    }
    expect(readYou(g).fieldK[FIELD]!).toBeGreaterThan(90)
  })

  it('never buys more than 15 odds points, however many projects fail', () => {
    const g = adult()
    for (let i = 0; i < 400; i++) step(g, TASK, fail(1), { year: 2030 + (i % 7000), who: 'you' })
    expect(knowOdds(readYou(g).fieldK[FIELD]!)).toBeLessThanOrEqual(KNOW_ODDS_MAX)
    expect(knowOdds(readYou(g).fieldK[FIELD]!)).toBeGreaterThan(14)
  })

  it('banks for a partial result too (it did not work), but not for a win', () => {
    expect(step(adult(), TASK, { kind: 'partial', margin: -2, cause: null, done: 0.5 }, { year: 2030, who: 'you' }).learned).toBeGreaterThan(0)
    for (const kind of ['works', 'hit'] as const) {
      const g = adult()
      const r = step(g, TASK, win(kind), { year: 2030, who: 'you' })
      expect(r.learned).toBe(0)
      expect(readYou(g).fieldK).toEqual({})
    }
  })
})

describe('step: a win lifts ambition a little', () => {
  it('adds WIN_SHIFT to the shift on a win or a hit, and nothing else', () => {
    for (const kind of ['works', 'hit'] as const) {
      const g = adult()
      const before = ambitionOf(g)
      const r = step(g, TASK, win(kind), { year: 2030, who: 'you' })
      expect(WIN_SHIFT).toBe(0.4)
      expect(r.shift).toBe(0.4)
      expect(readYou(g).shift).toBe(0.4)
      expect(ambitionOf(g)).toBeCloseTo(before + 0.4, 9)
    }
  })

  it('stops at SHIFT_MAX', () => {
    const g = adult()
    let total = 0
    for (let i = 0; i < 100; i++) total += step(g, TASK, win(), { year: 2030 + i, who: 'you' }).shift
    expect(readYou(g).shift).toBe(SHIFT_MAX)
    expect(total).toBeCloseTo(SHIFT_MAX, 9)
    expect(step(g, TASK, win(), { year: 2200, who: 'you' }).shift).toBe(0)
  })
})

describe('step: once a year', () => {
  it('a second step in the same year with the same fx changes nothing and says so', () => {
    const g = adult()
    const fx = newFx(2030)
    const first = step(g, TASK, fail(), { year: 2030, who: 'you', fx, k: 1, weeks: 4 })
    const flags = JSON.stringify(g.flags)
    const fxText = JSON.stringify(fx)
    sink.mockClear()
    const again = step(g, TASK, fail(), { year: 2030, who: 'you', fx, k: 1, weeks: 4 })
    expect(first.replay).toBe(false)
    expect(again.replay).toBe(true)
    expect(again.learned).toBe(0)
    expect(again.shift).toBe(0)
    expect(again.reveals).toEqual([])
    expect(again.knowledge).toBe(first.knowledge)
    expect(JSON.stringify(g.flags)).toBe(flags)
    expect(JSON.stringify(fx)).toBe(fxText)
    expect(sink).not.toHaveBeenCalled()
  })

  it('a step with no fx is stopped by the year stamp on the field', () => {
    const g = adult()
    step(g, TASK, win(), { year: 2030, who: 'you' })
    const once = JSON.stringify(g.flags)
    const again = step(g, TASK, win(), { year: 2030, who: 'you' })
    expect(again.replay).toBe(true)
    expect(JSON.stringify(g.flags)).toBe(once)
    expect(step(g, TASK, win(), { year: 2031, who: 'you' }).replay).toBe(false)
  })

  it('two projects in the same field and year each book when each has its own fx', () => {
    const g = adult()
    const a = step(g, TASK, fail(), { year: 2030, who: 'you', fx: newFx(2030) })
    const b = step(g, TASK, fail(), { year: 2030, who: 'you', fx: newFx(2030) })
    expect(a.replay).toBe(false)
    expect(b.replay).toBe(false)
    expect(b.knowledge).toBeGreaterThan(a.knowledge)
  })

  it('the first step in the year a project starts books (a fresh fx is stamped the year before)', () => {
    expect(step(adult(), TASK, fail(), { year: 2030, who: 'you', fx: newFx(2030) }).replay).toBe(false)
  })
})

describe('step: the fx record', () => {
  it('keeps progress, quality, spend, hours, setbacks and insight, and stamps the year', () => {
    const g = adult()
    const fx = newFx(2030)
    const r1 = step(g, TASK, fail(0.4), { year: 2030, who: 'you', fx, k: 2, weeks: 3 })
    expect(fx.progress).toBe(0.4)
    expect(fx.spent).toBe(100_000)
    expect(fx.hours).toBe(120)
    expect(fx.setbacks).toBe(1)
    expect(fx.insight).toBe(r1.learned)
    expect(fx.last).toBe(2030)
    const r2 = step(g, TASK, win(), { year: 2031, who: 'you', fx, k: 1, weeks: 2, quality: 71 })
    expect(fx.progress).toBe(1)
    expect(fx.quality).toBe(71)
    expect(fx.spent).toBe(150_000)
    expect(fx.hours).toBe(200)
    expect(fx.setbacks).toBe(1)
    expect(fx.insight).toBe(r1.learned)
    expect(fx.last).toBe(2031)
    expect(r2.replay).toBe(false)
  })

  it('never lets progress fall back, and keeps every number inside its caps', () => {
    const g = adult()
    const fx = newFx(2030)
    step(g, TASK, fail(0.9), { year: 2030, who: 'you', fx })
    step(g, TASK, fail(0.1), { year: 2031, who: 'you', fx })
    expect(fx.progress).toBe(0.9)
    for (let i = 0; i < 300; i++) step(g, TASK, fail(1), { year: 2032 + i, who: 'you', fx, k: 1e9, weeks: 1e9, quality: 1e12 })
    expect(normalizeFx(fx)).toEqual(fx)
    expect(fx.setbacks).toBe(FX_CAPS.setbacks)
    expect(fx.spent).toBeLessThanOrEqual(FX_CAPS.spent)
    expect(fx.hours).toBeLessThanOrEqual(FX_CAPS.hours)
    expect(fx.quality).toBeLessThanOrEqual(FX_CAPS.quality)
    expect(fx.insight).toBeLessThanOrEqual(FX_CAPS.insight)
  })

  it('leaves the fatigue field to the caller', () => {
    const g = adult()
    const fx = { ...newFx(2030), fatigue: 33 }
    step(g, TASK, fail(), { year: 2030, who: 'you', fx })
    expect(fx.fatigue).toBe(33)
  })

  it('reads a damaged fx as a fresh one and repairs it in place instead of throwing', () => {
    const g = adult()
    const fx = { v: 7, progress: 'x', quality: Number.NaN, spent: -9, hours: Infinity, setbacks: 1e9, insight: {}, fatigue: 500, last: 'later' }
    expect(() => step(g, TASK, fail(), { year: 2030, who: 'you', fx: fx as unknown as Fx })).not.toThrow()
    expect(normalizeFx(fx)).toEqual(fx)
    expect(fx.last).toBe(2030)
    expect(fx.v).toBe(1)
  })

  it('does nothing to a state when there is no fx, no player and no map', () => {
    const g = adult()
    const before = JSON.stringify(g)
    const r = step(g, TASK, fail(), { year: 2030 })
    expect(r).toMatchObject({ replay: false, knowledge: 0, learned: 0, shift: 0 })
    expect(r.reveals).toHaveLength(1)
    expect(r.reveals[0]!.strength).toBeCloseTo(0.175, 9)
    expect(JSON.stringify(g)).toBe(before)
  })
})

describe('step: a company keeps its own know-how', () => {
  it('banks into the map it is given and leaves the player\'s flags byte for byte', () => {
    const g = adult()
    const before = JSON.stringify(g)
    const know: Record<string, number> = {}
    const r = step(g, TASK, fail(), { year: 2030, know })
    expect(know[FIELD]).toBe(r.learned)
    expect(r.knowledge).toBe(know[FIELD])
    expect(r.shift).toBe(0)
    expect(JSON.stringify(g)).toBe(before)
    expect(YOU_KEY in g.flags).toBe(false)
  })

  it('a win changes neither the map nor the player', () => {
    const g = adult()
    const before = JSON.stringify(g)
    const know = { [FIELD]: 20 }
    const r = step(g, TASK, win(), { year: 2030, know })
    expect(know).toEqual({ [FIELD]: 20 })
    expect(r.knowledge).toBe(20)
    expect(r.learned).toBe(0)
    expect(JSON.stringify(g)).toBe(before)
  })

  it('an owner-run company (who: you with a map) teaches the map and lifts the player\'s ambition, not the player\'s know-how', () => {
    const g = adult()
    const know: Record<string, number> = {}
    step(g, TASK, fail(), { year: 2030, who: 'you', know })
    expect(know[FIELD]).toBeGreaterThan(0)
    expect(readYou(g).fieldK).toEqual({})
    const r = step(g, TASK, win(), { year: 2031, who: 'you', know })
    expect(r.shift).toBe(0.4)
    expect(readYou(g).shift).toBe(0.4)
  })

  it('stays inside the know-how field cap and the 0..100 range', () => {
    const know: Record<string, number> = {}
    for (let i = 0; i < 40; i++) know[`f.f${i}`] = 10 + i
    const g = adult()
    for (let i = 0; i < 400; i++) step(g, TASK, fail(1), { year: 2030, know })
    expect(Object.keys(know).length).toBeLessThanOrEqual(40)
    expect(know[FIELD]).toBeLessThanOrEqual(KNOW_MAX)
  })

  it('reads a map that is not a map as no map', () => {
    for (const bad of [null, 5, 'x', [1, 2, 3]]) {
      const g = adult()
      expect(() => step(g, TASK, fail(), { year: 2030, know: bad as unknown as Record<string, number> })).not.toThrow()
      expect(JSON.stringify(g.flags)).toBe('{}')
    }
  })
})

describe('step: study, practice and intel', () => {
  it('study and practice teach what the task says, win or lose, and give no ambition', () => {
    for (const mode of ['study', 'practice'] as const) {
      const task = defineTask({ field: 'skill.piano', mode, cost: 100, learn: 12 })
      const g = adult()
      const r = step(g, task, win(), { year: 2030, who: 'you' })
      expect(r.learned).toBeCloseTo(12, 9)
      expect(r.shift).toBe(0)
      expect(readYou(g).shift).toBe(0)
      const lose = step(adult(), task, fail(), { year: 2030, who: 'you' })
      expect(lose.learned).toBeCloseTo(12, 9)
    }
  })

  it('intel reveals and banks no know-how', () => {
    const task = defineTask({ field: 'intel.rival', mode: 'intel', cost: 100 })
    const g = adult()
    const r = step(g, task, fail(), { year: 2030, who: 'you' })
    expect(r.learned).toBe(0)
    expect(r.reveals).toHaveLength(1)
    expect(readYou(g).fieldK).toEqual({})
  })
})

describe('step: the reveal', () => {
  it('returns one reveal: .35 of how far a failure got, and .5 plus half of it for a win', () => {
    const fails = step(adult(), TASK, fail(0.6), { year: 2030, who: 'you' }).reveals
    expect(fails).toHaveLength(1)
    expect(fails[0]).toMatchObject({ field: FIELD, kind: 'fail' })
    expect(fails[0]!.strength).toBeCloseTo(0.21, 9)
    const wins = step(adult(), TASK, { ...win('hit'), done: 0.8 }, { year: 2030, who: 'you' }).reveals
    expect(wins).toHaveLength(1)
    expect(wins[0]).toMatchObject({ field: FIELD, kind: 'hit' })
    expect(wins[0]!.strength).toBeCloseTo(0.9, 9)
    expect(step(adult(), TASK, win(), { year: 2030, who: 'you' }).reveals[0]!.strength).toBe(1)
  })

  it('goes to the sink once, after the booking, and never on a replay', () => {
    const g = adult()
    const fx = newFx(2030)
    let seen: unknown = null
    sink.mockReset()
    sink.mockImplementation((state: GameState) => {
      seen = { last: fx.last, k: readYou(state).fieldK[FIELD] ?? 0 }
    })
    const r = step(g, TASK, fail(), { year: 2030, who: 'you', fx })
    expect(sink).toHaveBeenCalledTimes(1)
    expect(sink).toHaveBeenCalledWith(g, r.reveals)
    expect(seen).toEqual({ last: 2030, k: r.knowledge })
    step(g, TASK, fail(), { year: 2030, who: 'you', fx })
    expect(sink).toHaveBeenCalledTimes(1)
    step(g, TASK, win(), { year: 2031, who: 'you', fx })
    expect(sink).toHaveBeenCalledTimes(2)
    sink.mockReset()
  })
})

describe('step: pure of rolls and money', () => {
  it('draws no random number and moves no dollar', () => {
    const g = noRng(adult())
    const money = g.character.money
    const books = JSON.stringify(g.assets)
    expect(() => {
      step(g, TASK, fail(), { year: 2030, who: 'you', fx: newFx(2030), k: 2, weeks: 3 })
      step(g, TASK, win(), { year: 2031, who: 'you', know: {} })
      step(g, TASK, win('hit'), { year: 2032 })
    }).not.toThrow()
    expect(g.character.money).toBe(money)
    expect(JSON.stringify(g.assets)).toBe(books)
  })

  it('is total: a task, an outcome or a context that is not what it should be changes nothing', () => {
    const g = adult()
    const before = JSON.stringify(g)
    const none = { replay: false, knowledge: 0, learned: 0, shift: 0, reveals: [] }
    for (const task of [null, undefined, 5, 'rd', {}, { field: 'Bad Field!' }]) {
      expect(step(g, task as never, fail(), { year: 2030, who: 'you' })).toEqual(none)
    }
    for (const outcome of [null, undefined, 5, {}, { kind: 'dud' }]) {
      expect(step(g, TASK, outcome as never, { year: 2030, who: 'you' })).toEqual(none)
    }
    for (const ctx of [null, undefined, 5, {}, { year: Number.NaN }, { year: 'later' }]) {
      expect(() => step(g, TASK, fail(), ctx as never)).not.toThrow()
    }
    expect(JSON.stringify(g)).toBe(before)
  })

  it('reads a year that is not a year as this game\'s year', () => {
    const g = adult()
    step(g, TASK, win(), { year: Number.NaN, who: 'you' })
    expect(readYou(g).at[FIELD]).toBe(g.year)
  })
})
