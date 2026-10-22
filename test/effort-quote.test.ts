// ci: fast
// R3-E3 (C.1, the engine): `quote(g, task, input)` gives the odds, years, quality and the labelled lines of a piece of work. Four things
// have to hold, and each group below guards one:
//   parity     at the neutral actor (ambition 50, steady, no fatigue, no know-how, no crew) the odds, years and quality are exactly the
//              rd.ts product formulas (lines 172 and 173 and the budget curve), over the whole grid of budgets and base odds
//   reasons    the labelled lines add up to the odds, each term writes only its own line, and the caller's terms pass through first
//   purity     a quote never reads `u`, draws nothing, writes nothing, reads nothing but the player's record, and gives the same answer twice
//   ceilings   every input is bounded: k at four times the normal budget, spill and rivals at their points, know-how at 15 points,
//              rho at 1.25, quality under its ceiling, and money only ever buys odds and speed, never a lower price
// No pinned seed: every life is makeTestGame's own, and the grids come from a small local generator, never from g.rng.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { budgetQuality as rdBudgetQuality } from '../src/game/business/rd'
import { clampN } from '../src/game/business/util'
import { quote } from '../src/game/effort/engine'
import { attribute, cleanBaseTerms, deviate, moneyOdds } from '../src/game/effort/factors'
import * as L from '../src/game/effort/limits'
import { YOU_KEY } from '../src/game/effort/persona'
import { defineTask } from '../src/game/effort/task'
import type { EffortInput, Quote, Reason, Task, TaskSpec, TermKey, Worker } from '../src/game/effort/types'
import type { GameState, Json } from '../src/game/types'
import { deepFreeze } from './fuzz-kit'
import { makeTestGame } from './helpers'
import { layerOf } from './layer-kit'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)

/** A life at 30, willpower 50 and discipline 50 (ambition 46). */
const life = (age = 30): GameState => makeTestGame(7, { age })

/** A life whose ambition is exactly 50: willpower and discipline 55, no talent. Quotes for `who: 'you'` are then neutral. */
function neutral(age = 30): GameState {
  const g = life(age)
  g.character.hidden.willpower = 55
  g.character.hidden.discipline = 55
  return g
}

const ownerOf = (g: GameState): string => `${g.generation}:${g.character.id}`

/** The product research task, calibrated the way rd.ts has it: odds clamp .05 to .95, years 1 to 4, quality 5 to 97 as a hard clamp. */
function productTask(over: Partial<TaskSpec> = {}): Task {
  return defineTask({
    field: 'rd.beverage',
    mode: 'project',
    cost: 30_000,
    p0: 0.4,
    baseYears: 1.5,
    minYears: 1,
    maxYears: 4,
    oddsExp: 0.4,
    yearsExp: 0.5,
    oddsLo: 0.05,
    oddsHi: 0.95,
    quality: { up: 28, down: 14, exp: 0.8, ceiling: 97, room: 0, lo: 5, hi: 97 },
    hit: { p: 0.15, bonus: 10 },
    spread: 8,
    ...over,
  })
}

/** The same task with a reference crew, for the crew term. */
const crewed = (over: Partial<TaskSpec> = {}): Task => productTask({ field: 'rd.crewed', fteCap: 6, refCrew: { fte: 3, skill: 60 }, ...over })

/** `n + 1` evenly spaced numbers from `lo` to `hi`. */
const span = (lo: number, hi: number, n: number): number[] => Array.from({ length: n + 1 }, (_, i) => lo + ((hi - lo) * i) / n)

/** A deterministic generator in 0..1 (a local one: nothing here touches g.rng). */
function lcg(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

const sum = (rs: readonly Reason[]): number => rs.reduce((a, r) => a + r.pts, 0)
const keys = (q: Quote): TermKey[] => q.reasons.map((r) => r.key)
const line = (q: Quote, key: TermKey): number | undefined => q.reasons.find((r) => r.key === key)?.pts

// The three rd.ts expressions the product task must reproduce, copied with their lines (business/rd.ts at v5.0.0).
//   :172  const odds = clampN(1 - (1 - p0) * Math.pow(k, -0.4), 0.05, 0.95)
//   :173  const years = Math.round(clampN(Math.ceil(baseYears(b.industry) / Math.sqrt(k) - 1e-9), 1, 4))
//   rdQuality:  Math.round(clampN(q, 5, 97)) with q = ... + budgetQuality(k) + ...
const rdOdds = (p0: number, k: number): number => clampN(1 - (1 - p0) * Math.pow(k, -0.4), 0.05, 0.95)
const rdYears = (baseYears: number, k: number): number => Math.round(clampN(Math.ceil(baseYears / Math.sqrt(k) - 1e-9), 1, 4))
const rdQuality = (q0: number, k: number): number => Math.round(clampN(q0 + rdBudgetQuality(k), 5, 97))

/** An input whose `u` property throws when read: a quote that touches the roll fails the case that uses it. */
function withU<T extends object>(input: T): T & { u: number } {
  return Object.defineProperty({ ...input }, 'u', {
    get(): number {
      throw new Error('quote read u')
    },
    enumerable: true,
  }) as T & { u: number }
}

describe('parity with the rd.ts product formulas', () => {
  it('gives the odds, years, quality and k of rd.ts bit for bit over k .01 to 4 and p0 .1 to .9, passed as the base', () => {
    const g = life()
    const bad: string[] = []
    const ks = [...span(0.01, 0.5, 7), ...span(0.5, 4, 70)]
    for (const baseYears of [1, 1.5, 2]) {
      const task = productTask({ baseYears })
      for (const p0 of span(0.1, 0.9, 16)) {
        for (const k of ks) {
          for (const q0 of [10, 40, 60, 80, 95]) {
            const q = quote(g, task, { k, base: p0, quality0: q0 })
            if (q.p !== rdOdds(p0, k)) bad.push(`odds p0 ${p0} k ${k}: ${q.p} vs ${rdOdds(p0, k)}`)
            if (q.years !== rdYears(baseYears, k)) bad.push(`years ${baseYears} k ${k}: ${q.years} vs ${rdYears(baseYears, k)}`)
            if (q.quality !== rdQuality(q0, k)) bad.push(`quality q0 ${q0} k ${k}: ${q.quality} vs ${rdQuality(q0, k)}`)
            if (q.k !== k) bad.push(`k ${k}: ${q.k}`)
          }
        }
      }
    }
    expect(bad.slice(0, 5)).toEqual([])
  })

  it('gives the same answer when the base is the task\'s own p0', () => {
    const g = life()
    const bad: string[] = []
    for (const p0 of span(0.1, 0.9, 16)) {
      const task = productTask({ p0 })
      for (const k of span(0.5, 4, 35)) {
        const q = quote(g, task, { k, quality0: 50 })
        if (q.p !== rdOdds(p0, k) || q.years !== rdYears(1.5, k) || q.quality !== rdQuality(50, k)) bad.push(`p0 ${p0} k ${k}`)
      }
    }
    expect(bad.slice(0, 5)).toEqual([])
  })

  it('writes no engine line at k = 1 and the neutral actor, and the odds are the base', () => {
    const g = life()
    for (const base of [0.1, 0.25, 0.4, 0.5, 0.6, 0.9]) {
      const q = quote(g, productTask(), { base, quality0: 50 })
      expect(q.reasons).toEqual([])
      expect(q.p).toBe(rdOdds(base, 1))
      expect(q.effort).toEqual({ crew: 1, tools: 0, rho: 1, phi: 1, speed: 1 })
      expect(q.risk).toEqual({ shortcut: 0, explosion: 0, scandal: 0 })
      expect(q.payrollX).toBe(1)
      expect(q.burnout).toBe(false)
      expect(q.capped).toEqual([])
      expect(q.spread).toBe(8)
      expect(q.hitP).toBe(0.15)
    }
  })

  it('is the same for a life whose ambition is exactly 50 asking as the player (who: you)', () => {
    const g = neutral()
    const t = productTask()
    for (const k of span(0.5, 4, 14)) {
      for (const base of [0.2, 0.5, 0.8]) {
        expect(quote(g, t, { who: 'you', k, base, quality0: 50 })).toEqual(quote(g, t, { k, base, quality0: 50 }))
      }
    }
  })

  it('reads the quality floor when there is no quality0, and has no quality at all for a task with no curve', () => {
    const g = life()
    expect(quote(g, productTask(), { k: 1 }).quality).toBe(5)
    expect(quote(g, productTask({ quality: null }), { k: 2, quality0: 80 }).quality).toBeNull()
    expect(quote(g, productTask({ hit: null }), { k: 2 }).hitP).toBe(0)
  })

  it('bends quality under a ceiling that has room, and never passes it', () => {
    const g = life()
    const t = productTask({ quality: { up: 28, down: 14, exp: 0.8, ceiling: 100, room: 20, lo: 0, hi: 1000 } })
    for (const q0 of [0, 40, 70, 80, 90, 150, 1e6]) {
      const q = quote(g, t, { k: 4, quality0: q0 })
      expect(q.quality!).toBeLessThanOrEqual(100)
      expect(q.quality!).toBeGreaterThanOrEqual(0)
    }
    expect(quote(g, t, { k: 1, quality0: 40 }).quality).toBe(40)
  })
})

describe('the lines', () => {
  /** Inputs that make the terms interact, with a seeded spread so the grid is not a pattern. */
  function inputs(n: number, seed: number): { task: Task; input: EffortInput }[] {
    const next = lcg(seed)
    const out: { task: Task; input: EffortInput }[] = []
    for (let a = 0; a < n; a++) {
      const task = crewed({ hardness: 0.5 + 1.5 * next(), p0: 0.05 + 0.9 * next(), oddsLo: next() < 0.2 ? 0.02 : 0.05, oddsHi: next() < 0.2 ? 0.98 : 0.95 })
      const people: Worker[] = next() < 0.5 ? [] : [{ fte: 1 + 10 * next(), skill: 100 * next(), morale: 100 * next(), drive: 100 * next(), fatigue: 100 * next() }]
      const input: EffortInput = {
        k: 0.05 + 4 * next(),
        base: 0.02 + 0.96 * next(),
        quality0: 100 * next(),
        people,
        tools: next(),
        knowledge: 100 * next(),
        ambition: 100 * next(),
        posture: (['lean', 'steady', 'push'] as const)[Math.floor(next() * 3)],
        fatigue: 100 * next(),
        rival: next() < 0.5 ? 0 : 10 * next(),
        spill: next() < 0.5 ? 0 : 20 * next(),
      }
      out.push({ task, input })
    }
    return out
  }

  it('add up to round(p * 100) - round(base * 100) in 4,000 mixed quotes, each a whole number with its own label', () => {
    const g = life()
    const bad: string[] = []
    const labels: Record<string, string[]> = { ...Object.fromEntries(Object.entries(L.TERM_LABEL).map(([k, v]) => [k, [v]])), hard: [L.TERM_LABEL.hard, L.EASY_FIELD_LABEL] }
    inputs(4000, 11).forEach(({ task, input }, n) => {
      const q = quote(g, task, input)
      const base = input.base!
      if (sum(q.reasons) !== Math.round(q.p * 100) - Math.round(base * 100)) bad.push(`#${n} sum ${sum(q.reasons)} vs ${Math.round(q.p * 100) - Math.round(base * 100)}`)
      for (const r of q.reasons) {
        if (!Number.isInteger(r.pts) || r.pts === 0) bad.push(`#${n} line ${r.key} ${r.pts}`)
        if (!labels[r.key]!.includes(r.label)) bad.push(`#${n} label ${r.key} ${r.label}`)
      }
      if (q.p < task.oddsLo || q.p > task.oddsHi) bad.push(`#${n} p ${q.p}`)
      // a term that is quiet in the input never gets a line, whatever the rounding leaves over
      if (input.rival === 0 && line(q, 'rival') !== undefined) bad.push(`#${n} rival line with no rival`)
      if (input.spill === 0 && line(q, 'spill') !== undefined) bad.push(`#${n} spill line with no spill`)
      if (input.people!.length === 0 && line(q, 'crew') !== undefined) bad.push(`#${n} crew line with no crew`)
    })
    expect(bad.slice(0, 5)).toEqual([])
  })

  it('come in the order funding, crew, tools, know, hard, rival, spill, bold, tired, after the caller\'s terms', () => {
    const g = life()
    const t = crewed({ hardness: 1.4 })
    const q = quote(g, t, {
      k: 3,
      base: 0.5,
      baseTerms: [{ key: 'team', label: 'team', pts: 9 }],
      people: [{ fte: 6, skill: 95, morale: 90 }],
      tools: 1,
      knowledge: 100,
      ambition: 100,
      posture: 'push',
      fatigue: 90,
      rival: 8,
      spill: 18,
    })
    const order: TermKey[] = ['team', 'funding', 'crew', 'tools', 'know', 'hard', 'rival', 'spill', 'bold', 'tired']
    const seen = keys(q)
    expect(seen).toEqual(order.filter((k) => seen.includes(k)))
    expect(seen[0]).toBe('team')
    expect(seen).toContain('funding')
    expect(seen).toContain('tired')
  })

  it('passes the caller\'s terms through first, untouched and not counted in the engine\'s sum', () => {
    const g = life()
    const baseTerms: Reason[] = [
      { key: 'team', label: 'team', pts: 9 },
      { key: 'ceo', label: 'steady CEO', pts: 2 },
    ]
    const withTerms = quote(g, productTask(), { k: 2, base: 0.4, baseTerms })
    const without = quote(g, productTask(), { k: 2, base: 0.4 })
    expect(withTerms.reasons.slice(0, 2)).toEqual(baseTerms)
    expect(withTerms.reasons.slice(2)).toEqual(without.reasons)
    expect(withTerms.p).toBe(without.p)
    expect(sum(withTerms.reasons.slice(2))).toBe(Math.round(withTerms.p * 100) - 40)
    expect(withTerms.reasons[0]).not.toBe(baseTerms[0])
  })

  it('drops terms it cannot print (an unknown key, no points, a label that is not text) and bounds the rest', () => {
    const hostile: unknown[] = [
      null,
      'team',
      { key: 'nope', label: 'x', pts: 3 },
      { key: 'team', label: 'x', pts: Number.NaN },
      { key: 'team', label: 'x', pts: '3' },
      { key: 'team', label: 7, pts: 4 },
      { key: 'ceo', pts: 1e9 },
      { key: 'tools', label: 'x'.repeat(500), pts: -1e9 },
    ]
    const rows = cleanBaseTerms(hostile)
    expect(rows).toEqual([
      { key: 'team', label: L.TERM_LABEL.team, pts: 4 },
      { key: 'ceo', label: L.TERM_LABEL.ceo, pts: 100 },
      { key: 'tools', label: 'x'.repeat(40), pts: -100 },
    ])
    expect(cleanBaseTerms('nope')).toEqual([])
    expect(cleanBaseTerms(Array.from({ length: 100 }, () => ({ key: 'team', label: 't', pts: 1 })))).toHaveLength(12)
    const q = quote(life(), productTask(), { baseTerms: hostile as Reason[] })
    expect(q.reasons.map((r) => r.key)).toEqual(['team', 'ceo', 'tools'])
  })

  describe('each term writes its own line and moves its own numbers only', () => {
    const g = life()
    const t = productTask()
    const calm = (extra: EffortInput = {}): Quote => quote(g, t, { base: 0.5, quality0: 50, ...extra })

    it('funding: a bigger budget buys odds, years and quality, and shows as funding alone', () => {
      const q = calm({ k: 2 })
      expect(keys(q)).toEqual(['funding'])
      expect(q.p).toBe(rdOdds(0.5, 2))
      expect(line(q, 'funding')).toBe(Math.round(q.p * 100) - 50)
      expect(q.spend).toBe(60_000)
      const cheap = calm({ k: 0.5 })
      expect(keys(cheap)).toEqual(['funding'])
      expect(line(cheap, 'funding')!).toBeLessThan(0)
    })

    it('tools: six points at full tools, 30% faster, and nothing else moves', () => {
      const q = calm({ tools: 1 })
      expect(keys(q)).toEqual(['tools'])
      expect(line(q, 'tools')).toBe(6)
      expect(q.effort.speed).toBeCloseTo(1.3, 12)
      expect(q.quality).toBe(calm().quality)
      expect(q.spread).toBe(calm().spread)
      expect(calm({ tools: 0.5 }).p).toBeLessThan(q.p)
    })

    it('know-how: up to 15 points, a little quality, and the same speed', () => {
      const q = calm({ knowledge: 100 })
      expect(keys(q)).toEqual(['know'])
      expect(line(q, 'know')).toBe(15)
      expect(q.quality).toBe(calm().quality! + 3)
      expect(q.effort.speed).toBe(1)
      expect(line(calm({ knowledge: 50 }), 'know')!).toBeGreaterThan(0)
      expect(line(calm({ knowledge: 50 }), 'know')!).toBeLessThan(15)
    })

    it('a hard field costs points and an easy one gives them back, in its own words', () => {
      const hard = quote(g, productTask({ hardness: 1.5 }), { base: 0.5 })
      expect(keys(hard)).toEqual(['hard'])
      expect(line(hard, 'hard')).toBe(-15)
      expect(hard.reasons[0]!.label).toBe('hard field')
      const easy = quote(g, productTask({ hardness: 0.5 }), { base: 0.5 })
      expect(keys(easy)).toEqual(['hard'])
      expect(line(easy, 'hard')).toBe(15)
      expect(easy.reasons[0]!.label).toBe('easy field')
    })

    it('rivals and public research: minus eight and plus eighteen at most, in their own words', () => {
      const rival = calm({ rival: 1000 })
      expect(keys(rival)).toEqual(['rival'])
      expect(line(rival, 'rival')).toBe(-8)
      expect(rival.reasons[0]!.label).toBe('rival pressure')
      const spill = calm({ spill: 1000 })
      expect(keys(spill)).toEqual(['spill'])
      expect(line(spill, 'spill')).toBe(18)
      expect(spill.reasons[0]!.label).toBe('public research')
      expect(line(calm({ rival: 4 }), 'rival')).toBe(-4)
      expect(line(calm({ spill: 9 }), 'spill')).toBe(9)
    })

    it('a bold plan costs a favourite and helps a long shot, widens the spread and the hit chance, and costs nothing at even odds', () => {
      const fav = quote(g, t, { base: 0.8, quality0: 50, ambition: 100 })
      expect(keys(fav)).toEqual(['bold'])
      expect(line(fav, 'bold')!).toBeLessThan(0)
      const long = quote(g, t, { base: 0.2, quality0: 50, ambition: 100 })
      expect(keys(long)).toEqual(['bold'])
      expect(line(long, 'bold')!).toBeGreaterThan(0)
      expect(keys(calm({ ambition: 100 }))).toEqual([])
      expect(fav.spread).toBeCloseTo(12, 12)
      expect(fav.hitP).toBeCloseTo(0.15 * 1.4, 12)
      const careful = quote(g, t, { base: 0.8, quality0: 50, ambition: 0 })
      expect(line(careful, 'bold')!).toBeGreaterThan(0)
      expect(careful.spread).toBeCloseTo(4, 12)
      expect(careful.hitP).toBeCloseTo(0.15 * 0.6, 12)
    })

    it('tiredness costs up to ten points and pace, and a burnout flag from 85', () => {
      const q = calm({ fatigue: 100 })
      expect(keys(q)).toEqual(['tired'])
      expect(line(q, 'tired')).toBe(-10)
      expect(q.effort.phi).toBeCloseTo(0.74, 12)
      expect(q.burnout).toBe(true)
      expect(calm({ fatigue: 85 }).burnout).toBe(true)
      expect(calm({ fatigue: 84.9 }).burnout).toBe(false)
      expect(keys(calm({ fatigue: 35 }))).toEqual([])
      expect(calm({ fatigue: 35 }).effort.phi).toBe(1)
    })

    it('crew: a bigger and better crew adds points, a thin one loses them, and only with a reference crew', () => {
      const ct = crewed()
      const strong = quote(g, ct, { base: 0.5, people: [{ fte: 6, skill: 95, morale: 95 }] })
      expect(keys(strong)).toEqual(['crew'])
      expect(line(strong, 'crew')!).toBeGreaterThan(0)
      const weak = quote(g, ct, { base: 0.5, people: [{ fte: 1, skill: 20, morale: 30 }] })
      expect(keys(weak)).toEqual(['crew'])
      expect(line(weak, 'crew')!).toBeLessThan(0)
      expect(strong.effort.crew).toBeGreaterThan(1)
      expect(weak.effort.crew).toBeLessThan(1)
      // no reference crew in the task: the crew is not asked about
      expect(quote(g, productTask(), { base: 0.5, people: [{ fte: 6, skill: 95, morale: 95 }] }).reasons).toEqual([])
      // the reference crew itself is neutral
      expect(quote(g, ct, { base: 0.5, people: [{ fte: 3, skill: 60, morale: 50 }] }).effort.crew).toBeCloseTo(1, 12)
    })

    it('a driven crew is a little better and a tired one a little worse, but the neutral worker is the old formula', () => {
      const ct = crewed()
      const crewOf = (w: Partial<Worker>): number => quote(g, ct, { base: 0.5, people: [{ fte: 4, skill: 70, morale: 60, ...w }] }).effort.crew
      const plain = crewOf({})
      expect(crewOf({ drive: 50, fatigue: 0 })).toBe(plain)
      expect(crewOf({ drive: 100 })).toBeGreaterThan(plain)
      expect(crewOf({ drive: 0 })).toBeLessThan(plain)
      expect(crewOf({ fatigue: 90 })).toBeLessThan(plain)
      expect(crewOf({ drive: 100 }) / plain).toBeLessThan(1.12)
    })
  })

  it('works each term out alone at the money odds, so changing one never moves the effect of another', () => {
    const next = lcg(5)
    const quiet = { crew: 0, tools: 0, know: 0, hard: 0, rival: 0, spill: 0, tired: 0 }
    const bad: string[] = []
    for (let n = 0; n < 400; n++) {
      const pk = 0.1 + 0.8 * next()
      const pts = { crew: 12 * (next() - 0.5), tools: 6 * next(), know: 15 * next(), hard: -15 * next(), rival: -8 * next(), spill: 18 * next(), tired: -10 * next() }
      const a = deviate(pk, 0.02, 0.98, pts, 0.3).pieces
      const b = deviate(pk, 0.02, 0.98, { ...pts, tools: 6 }, 0.3).pieces
      a.forEach((x, i) => {
        if (x.key !== 'tools' && x.pts !== b[i]!.pts) bad.push(`#${n} ${x.key} moved when tools did`)
      })
      if (b.find((x) => x.key === 'tools')!.pts < a.find((x) => x.key === 'tools')!.pts) bad.push(`#${n} tools fell`)
    }
    expect(bad.slice(0, 5)).toEqual([])
    // and each is the points it says: the rest of a quote is only what the terms do together
    expect(deviate(0.5, 0, 1, { ...quiet, tools: 6 }, 0).pieces.find((x) => x.key === 'tools')!.pts).toBeCloseTo(6, 9)
  })

  it('goes to the largest line when rounding leaves a point, and into funding when nothing else is there', () => {
    // two lines whose own effects are 2.4 and 2.4: each rounds to 2, the odds moved 5, so the first (tie) gets the point
    expect(
      attribute(0.5, 0.55, [
        { key: 'crew', pts: 2.4 },
        { key: 'tools', pts: 2.4 },
      ]),
    ).toEqual([
      { key: 'crew', label: 'crew', pts: 3 },
      { key: 'tools', label: 'tools', pts: 2 },
    ])
    expect(attribute(0.5, 0.5, [{ key: 'funding', pts: 1e-14 }])).toEqual([])
    // 0.065 is 6.5 points and the odds a hair under (fp noise at k = 1): the whole point is funding's, the only line there is
    expect(attribute(0.065, 0.06499999999999995, [{ key: 'funding', pts: -5e-14 }])).toEqual([{ key: 'funding', label: 'funding', pts: -1 }])
    expect(attribute(0.5, 0.5, [])).toEqual([])
  })
})

describe('years and speed', () => {
  const g = life()
  const t = crewed({ baseYears: 4, maxYears: 12 })
  const years = (extra: EffortInput = {}): number => quote(g, t, { k: 1, base: 0.5, ...extra }).yearsExact

  it('are baseYears over the square root of the budget, exactly, at the neutral actor', () => {
    expect(years()).toBe(4)
    expect(years({ k: 4 })).toBe(2)
    expect(quote(g, t, { k: 4 }).years).toBe(2)
    const t2 = crewed({ baseYears: 4, maxYears: 12, yearsExp: 0.3 })
    expect(quote(g, t2, { k: 2 }).yearsExact).toBeCloseTo(4 / Math.pow(2, 0.3), 12)
  })

  it('shorten with ambition, push, tools and a good crew, and lengthen with lean, fatigue and a thin crew', () => {
    expect(years({ ambition: 100, posture: 'push' })).toBeLessThan(years())
    expect(years({ ambition: 100, posture: 'steady' })).toBeLessThan(years())
    expect(years({ ambition: 0, posture: 'steady' })).toBeGreaterThan(years())
    expect(years({ posture: 'lean' })).toBeGreaterThan(years())
    expect(years({ ambition: 80, posture: 'lean' })).toBeGreaterThan(years({ ambition: 80, posture: 'steady' }))
    expect(years({ tools: 1 })).toBeLessThan(years())
    expect(years({ fatigue: 100 })).toBeGreaterThan(years())
    expect(years({ people: [{ fte: 6, skill: 95, morale: 95 }] })).toBeLessThan(years())
    expect(years({ people: [{ fte: 1, skill: 20, morale: 30 }] })).toBeGreaterThan(years())
  })

  it('are whole years between minYears and maxYears, with a small tolerance before they round up', () => {
    expect(quote(g, t, { k: 1, base: 0.5 }).years).toBe(4)
    expect(quote(g, t, { k: 1, base: 0.5, tools: 1e-12 }).years).toBe(4)
    expect(quote(g, productTask({ baseYears: 0.2, minYears: 1 }), { k: 4 }).years).toBe(1)
    expect(quote(g, productTask({ baseYears: 40, maxYears: 4 }), { k: 0.01 }).years).toBe(4)
  })

  it('speed up with know-how only for a task that has knowYears (the studio engine)', () => {
    expect(years({ knowledge: 100 })).toBe(4)
    const tk = crewed({ baseYears: 4, maxYears: 12, knowYears: 0.15 })
    expect(quote(g, tk, { k: 1, knowledge: 100 }).effort.speed).toBeCloseTo(1.15, 12)
    expect(quote(g, tk, { k: 1, knowledge: 100 }).yearsExact).toBeCloseTo(4 / 1.15, 12)
    expect(quote(g, tk, { k: 1, knowledge: 0 }).yearsExact).toBe(4)
  })

  it('give a push pay of 15% overtime and a risk to report, never to roll', () => {
    expect(quote(g, t, { posture: 'push' }).payrollX).toBe(L.OVERTIME_PAY)
    expect(quote(g, t, { posture: 'steady' }).payrollX).toBe(1)
    expect(quote(g, t, { posture: 'lean' }).payrollX).toBe(1)
    const q = quote(g, crewed({ hardness: 2 }), { ambition: 100, posture: 'push' })
    expect(q.risk.shortcut).toBeGreaterThan(0)
    expect(q.risk.explosion).toBeGreaterThan(0)
    expect(q.risk.scandal).toBeGreaterThan(0)
    for (const r of Object.values(q.risk)) expect(r).toBeLessThanOrEqual(L.RISK_MAX)
    expect(quote(g, t, { ambition: 100, posture: 'steady' }).risk.scandal).toBe(0)
    expect(quote(g, t, { ambition: 100, posture: 'lean' }).risk.scandal).toBe(0)
    expect(quote(g, t, { ambition: 0, posture: 'push' }).risk.shortcut).toBe(0)
  })
})

describe('who: you', () => {
  const field = 'rd.beverage'

  it('fills ambition, the posture in force, fatigue and know-how in this field from the player\'s record', () => {
    const g = life()
    g.character.hidden.willpower = 90
    g.character.hidden.discipline = 80
    g.flags[YOU_KEY] = { v: 1, owner: ownerOf(g), shift: 0, posture: 'steady', effective: 'push', over: 0, fieldK: { [field]: 60 }, at: {}, burnouts: 0, burnAt: -1, last: -1 } as unknown as Json
    g.flags.household = { owner: ownerOf(g), fatigue: 70 } as unknown as Json
    const t = productTask()
    const you = quote(g, t, { who: 'you', k: 1, base: 0.5 })
    const same = quote(g, t, { k: 1, base: 0.5, ambition: 0.5 * 90 + 0.3 * 80 + 6, posture: 'push', fatigue: 70, knowledge: 60 })
    expect(you).toEqual(same)
    expect(you.effort.phi).toBeCloseTo(1 - 0.004 * 35, 12)
    expect(line(you, 'know')!).toBeGreaterThan(0)
    expect(line(you, 'tired')!).toBeLessThan(0)
    expect(you.payrollX).toBe(L.OVERTIME_PAY)
  })

  it('leaves the record out when the caller does not say who, so the same life asks as a neutral maker', () => {
    const g = life()
    g.flags[YOU_KEY] = { v: 1, owner: ownerOf(g), shift: 0, posture: 'push', effective: 'push', over: 0, fieldK: { [field]: 100 }, at: {}, burnouts: 0, burnAt: -1, last: -1 } as unknown as Json
    g.flags.household = { owner: ownerOf(g), fatigue: 90 } as unknown as Json
    const t = productTask()
    expect(quote(g, t, { k: 1, base: 0.5 })).toEqual(quote(life(), t, { k: 1, base: 0.5 }))
  })

  it('lets what the caller says win over the record, field by field', () => {
    const g = life()
    g.flags[YOU_KEY] = { v: 1, owner: ownerOf(g), shift: 0, posture: 'push', effective: 'push', over: 0, fieldK: { [field]: 100 }, at: {}, burnouts: 0, burnAt: -1, last: -1 } as unknown as Json
    g.flags.household = { owner: ownerOf(g), fatigue: 90 } as unknown as Json
    const t = productTask()
    const q = quote(g, t, { who: 'you', k: 1, base: 0.5, posture: 'steady', fatigue: 0, knowledge: 0, ambition: 50 })
    expect(q.reasons).toEqual([])
    expect(q.payrollX).toBe(1)
    const half = quote(g, t, { who: 'you', k: 1, base: 0.5, posture: 'steady', fatigue: 0, ambition: 50 })
    expect(line(half, 'know')).toBe(15)
  })

  it('is neutral for a life that has never touched the record and has no fatigue, and reads know-how by the task\'s own field', () => {
    const g = neutral()
    const t = productTask()
    expect(quote(g, t, { who: 'you', base: 0.5 }).reasons).toEqual([])
    const g2 = neutral()
    g2.flags[YOU_KEY] = { v: 1, owner: ownerOf(g2), shift: 0, posture: 'steady', effective: 'steady', over: 0, fieldK: { 'rd.other': 80 }, at: {}, burnouts: 0, burnAt: -1, last: -1 } as unknown as Json
    expect(quote(g2, t, { who: 'you', base: 0.5 }).reasons).toEqual([])
    expect(line(quote(g2, productTask({ field: 'rd.other' }), { who: 'you', base: 0.5 }), 'know')!).toBeGreaterThan(0)
  })

  it('does not read the record of another life', () => {
    const g = neutral()
    g.flags[YOU_KEY] = { v: 1, owner: '0:somebody', shift: 0, posture: 'push', effective: 'push', over: 40, fieldK: { [field]: 100 }, at: {}, burnouts: 0, burnAt: -1, last: -1 } as unknown as Json
    expect(quote(g, productTask(), { who: 'you', base: 0.5 }).reasons).toEqual([])
  })
})

describe('purity', () => {
  it('never reads u: an input with a throwing u gives the quote of the plain input', () => {
    const g = neutral()
    const t = crewed({ hardness: 1.2 })
    for (const input of [
      {},
      { k: 2, base: 0.4, quality0: 60, tools: 0.5, knowledge: 30, ambition: 80, posture: 'push' as const, fatigue: 50, rival: 3, spill: 4, people: [{ fte: 3, skill: 60, morale: 50 }] },
      { who: 'you' as const, k: 3 },
    ]) {
      expect(quote(g, t, withU(input))).toEqual(quote(g, t, input))
    }
  })

  it('gives the same quote twice, and a fresh object each time, and leaves the input alone', () => {
    const g = life()
    const t = crewed()
    const input = deepFreeze<EffortInput>({ k: 2.5, base: 0.45, baseTerms: [{ key: 'team', label: 'team', pts: 7 }], people: [{ fte: 4, skill: 70, morale: 60 }], tools: 0.4, knowledge: 20, ambition: 70, posture: 'push', fatigue: 40, rival: 2, spill: 3 })
    const a = quote(g, t, input)
    const b = quote(g, t, input)
    expect(a).toEqual(b)
    expect(a).not.toBe(b)
    expect(a.reasons).not.toBe(b.reasons)
    expect(a.capped).not.toBe(b.capped)
    a.reasons.push({ key: 'team', label: 'x', pts: 1 })
    expect(quote(g, t, input)).toEqual(b)
  })

  it('draws nothing and writes nothing: a deep-frozen state whose rng cannot be read reads fine, as the player and as anyone', () => {
    const state = neutral()
    state.flags[YOU_KEY] = { v: 1, owner: ownerOf(state), shift: 2, posture: 'push', effective: 'push', over: 3, fieldK: { 'rd.beverage': 30 }, at: { 'rd.beverage': 2025 }, burnouts: 1, burnAt: 2020, last: 2025 } as unknown as Json
    state.flags.household = { owner: ownerOf(state), fatigue: 60 } as unknown as Json
    const before = JSON.stringify(state)
    deepFreeze(state)
    const g = new Proxy(state, {
      get(target, key, receiver): unknown {
        if (key === 'rng') throw new Error('quote touched g.rng')
        return Reflect.get(target, key, receiver)
      },
    })
    const t = crewed()
    expect(() => quote(g, t, { who: 'you', k: 2 })).not.toThrow()
    expect(() => quote(g, t, { k: 2, people: [{ fte: 3, skill: 60, morale: 50 }] })).not.toThrow()
    expect(Object.isFrozen(state.flags)).toBe(true)
    expect(JSON.stringify(state)).toBe(before)
  })

  it('reads nothing from the game when it is not asked about the player', () => {
    const trap = new Proxy({}, {
      get(): never {
        throw new Error('quote read the game')
      },
      has(): never {
        throw new Error('quote read the game')
      },
    }) as unknown as GameState
    expect(() => quote(trap, crewed(), { k: 2, base: 0.4, ambition: 90, posture: 'push', fatigue: 30, knowledge: 10 })).not.toThrow()
  })

  it('reads no cash: money changes nothing in a quote, and spend is the budget times the normal cost', () => {
    const poor = neutral()
    const rich = neutral()
    poor.character.money = 0
    rich.character.money = 1e12
    const t = productTask()
    for (const k of [0.5, 1, 2, 4]) {
      const a = quote(poor, t, { who: 'you', k, base: 0.5 })
      expect(quote(rich, t, { who: 'you', k, base: 0.5 })).toEqual(a)
      expect(a.spend).toBe(k * t.cost)
    }
    // a hundred times the cash and the same idea cost the same: inputs buy odds and speed, never a lower price
    expect(quote(rich, t, { k: 1 }).spend).toBe(30_000)
  })

  it('is total: garbage in every field reads as the neutral value and nothing throws', () => {
    const g = life()
    const junk: unknown[] = [Number.NaN, Infinity, -Infinity, '12', null, undefined, {}, [], true, -5, 1e300]
    const t = crewed()
    for (const v of junk) {
      for (const field of ['k', 'base', 'quality0', 'tools', 'knowledge', 'ambition', 'posture', 'fatigue', 'rival', 'spill', 'people', 'baseTerms', 'who']) {
        const q = quote(g, t, { [field]: v } as unknown as EffortInput)
        expect(Number.isFinite(q.p), `${field}=${String(v)}`).toBe(true)
        expect(q.p).toBeGreaterThanOrEqual(t.oddsLo)
        expect(q.p).toBeLessThanOrEqual(t.oddsHi)
        for (const n of [q.years, q.yearsExact, q.quality!, q.spread, q.hitP, q.k, q.spend, q.effort.speed, q.effort.rho, q.effort.phi, q.effort.crew]) {
          expect(Number.isFinite(n), `${field}=${String(v)}`).toBe(true)
        }
      }
    }
    for (const bad of [null, undefined, 7, 'x', []]) {
      expect(() => quote(g, t, bad as unknown as EffortInput)).not.toThrow()
      expect(quote(g, t, bad as unknown as EffortInput).reasons).toEqual([])
    }
  })

  it('reads a posture that is not one as steady, and a people list of junk as no crew', () => {
    const g = life()
    const t = crewed()
    expect(quote(g, t, { posture: 'sprint' as unknown as 'push', ambition: 100 })).toEqual(quote(g, t, { posture: 'steady', ambition: 100 }))
    expect(quote(g, t, { people: [null, 4, 'x', { fte: 'a' }, {}] as unknown as Worker[] })).toEqual(quote(g, t, {}))
    expect(quote(g, t, { posture: '__proto__' as unknown as 'push' }).payrollX).toBe(1)
  })
})

describe('ceilings', () => {
  const g = life()

  it('cuts k to the task\'s most (at most four times) and says so; a k that is not a number is the normal budget', () => {
    const t = productTask()
    const big = quote(g, t, { k: 400, base: 0.5 })
    expect(big.k).toBe(4)
    expect(big.capped).toContain('k')
    expect(big.spend).toBe(4 * t.cost)
    expect(big.p).toBe(quote(g, t, { k: 4, base: 0.5 }).p)
    expect(quote(g, t, { k: 4, base: 0.5 }).capped).toEqual([])
    expect(quote(g, productTask({ kmax: 2 }), { k: 3 }).k).toBe(2)
    expect(quote(g, productTask({ kmax: 2 }), { k: 3 }).capped).toContain('k')
    expect(quote(g, t, { k: Infinity }).k).toBe(4)
    expect(quote(g, t, { k: Number.NaN }).k).toBe(1)
    expect(quote(g, t, { k: Number.NaN }).capped).toEqual([])
    expect(quote(g, t, { k: 0 }).k).toBe(L.K_MIN)
    expect(quote(g, t, { k: -3 }).k).toBe(L.K_MIN)
    expect(quote(g, t, { k: 0 }).capped).toEqual([])
  })

  it('takes a crew of 4,000 as no better than the labor the task can use, and says so', () => {
    const t = crewed()
    const a = quote(g, t, { people: [{ fte: 4000, skill: 100, morale: 100 }] })
    const b = quote(g, t, { people: [{ fte: 40, skill: 100, morale: 100 }] })
    expect(a.capped).toContain('fte')
    expect(a.effort.crew).toBeLessThanOrEqual(4)
    expect(a.effort.crew).toBeCloseTo(b.effort.crew, 6)
    expect(line(a, 'crew')!).toBeLessThanOrEqual(L.CREW_PTS_MAX)
    expect(quote(g, t, { people: [{ fte: 6, skill: 100, morale: 100 }] }).capped).not.toContain('fte')
  })

  it('takes know-how at 100 at most: 15 odds points, and the cap shows from 100', () => {
    const t = productTask()
    for (const knowledge of [100, 101, 500, 1e9, Infinity]) {
      const q = quote(g, t, { knowledge, base: 0.5 })
      expect(line(q, 'know')).toBe(L.KNOW_ODDS_MAX)
      expect(q.capped).toContain('knowledge')
    }
    expect(quote(g, t, { knowledge: 99, base: 0.5 }).capped).not.toContain('knowledge')
  })

  it('keeps quality under the ceiling and says so when the ceiling binds', () => {
    const t = productTask()
    const q = quote(g, t, { k: 4, quality0: 1000 })
    expect(q.quality).toBe(97)
    expect(q.capped).toContain('quality')
    expect(quote(g, t, { k: 1, quality0: 50 }).capped).not.toContain('quality')
    const soft = productTask({ quality: { up: 28, down: 14, exp: 0.8, ceiling: 100, room: 20, lo: 0, hi: 1000 } })
    expect(quote(g, soft, { k: 4, quality0: 1000 }).capped).toContain('quality')
    expect(quote(g, soft, { k: 1, quality0: 40 }).capped).not.toContain('quality')
  })

  it('keeps public research to 18 points and rivals to 8, alone and together, at any odds', () => {
    const t = productTask({ oddsLo: 0, oddsHi: 1 })
    const bad: string[] = []
    for (const base of span(0.02, 0.98, 48)) {
      const none = quote(g, t, { base }).p
      const spill = quote(g, t, { base, spill: 1000 }).p - none
      const rival = quote(g, t, { base, rival: 1000 }).p - none
      const both = quote(g, t, { base, spill: 1000, rival: 1000 }).p - none
      if (spill > L.SPILL_TERM_MAX / 100 + 1e-12 || spill < 0) bad.push(`spill at ${base}: ${spill}`)
      if (rival < -L.RIVAL_PTS / 100 - 1e-12 || rival > 0) bad.push(`rival at ${base}: ${rival}`)
      if (both > L.SPILL_TERM_MAX / 100 + 1e-12 || both < -L.RIVAL_PTS / 100 - 1e-12) bad.push(`both at ${base}: ${both}`)
      const q = quote(g, t, { base, spill: 1000, rival: 1000 })
      if ((line(q, 'spill') ?? 0) > L.SPILL_TERM_MAX + 6 || (line(q, 'rival') ?? 0) < -L.RIVAL_PTS - 6) bad.push(`lines at ${base}`)
    }
    expect(bad.slice(0, 5)).toEqual([])
    // each alone is exactly its cap in points; together the lines share what the two do jointly
    expect(line(quote(g, productTask(), { base: 0.5, spill: 1000 }), 'spill')).toBe(L.SPILL_TERM_MAX)
    expect(line(quote(g, productTask(), { base: 0.5, rival: 1000 }), 'rival')).toBe(-L.RIVAL_PTS)
  })

  it('keeps the pace of ambition to 1.25 at the most: no ambition and posture buys more, and the cap shows only if it binds', () => {
    const t = crewed({ baseYears: 10, maxYears: 50 })
    for (const ambition of [0, 25, 50, 75, 100, 1000, Infinity]) {
      for (const posture of ['lean', 'steady', 'push'] as const) {
        const q = quote(g, t, { ambition, posture })
        expect(q.effort.rho).toBeLessThanOrEqual(L.RHO_MAX)
        expect(q.effort.rho).toBeGreaterThanOrEqual(L.RHO_MIN)
        expect(q.effort.speed).toBeLessThanOrEqual(L.RHO_MAX)
      }
    }
    expect(quote(g, t, { ambition: 100, posture: 'push' }).effort.rho).toBeCloseTo(1.24, 12)
  })

  it('has a 100x probe: every input at a hundred times its normal size leaves every output inside its bound', () => {
    const t = crewed({ cost: 100_000, baseYears: 3, maxYears: 6, hardness: 1.2, p0: 0.3 })
    const bad: string[] = []
    for (const x of [1, 100]) {
      const q = quote(g, t, {
        k: 2 * x,
        base: 0.3,
        quality0: 50 * x,
        people: [{ fte: 4 * x, skill: 100, morale: 100, drive: 100 }],
        tools: x,
        knowledge: 100 * x,
        ambition: 100 * x,
        posture: 'push',
        fatigue: 10 * x,
        rival: 8 * x,
        spill: 18 * x,
      })
      if (q.k > L.K_MAX) bad.push(`k ${q.k}`)
      if (q.p > t.oddsHi || q.p < t.oddsLo) bad.push(`p ${q.p}`)
      if (q.years < t.minYears || q.years > t.maxYears) bad.push(`years ${q.years}`)
      if (q.quality! > t.quality!.ceiling) bad.push(`quality ${q.quality}`)
      if (q.effort.rho > L.RHO_MAX) bad.push(`rho ${q.effort.rho}`)
      if (q.effort.crew > 4) bad.push(`crew ${q.effort.crew}`)
      if (q.effort.tools > 1) bad.push(`tools ${q.effort.tools}`)
      if (q.spend > L.K_MAX * t.cost) bad.push(`spend ${q.spend}`)
      if ((line(q, 'know') ?? 0) > L.KNOW_ODDS_MAX + 6) bad.push(`know ${line(q, 'know')}`)
      if ((line(q, 'crew') ?? 0) > L.CREW_PTS_MAX + 6) bad.push(`crew line ${line(q, 'crew')}`)
      for (const r of Object.values(q.risk)) if (r > L.RISK_MAX) bad.push(`risk ${r}`)
    }
    expect(bad).toEqual([])
  })

  it('never lets money, crew or tools lower a price: spend depends on k and the task alone', () => {
    const t = crewed()
    const base = quote(g, t, { k: 2 }).spend
    for (const extra of [{ tools: 1 }, { knowledge: 100 }, { ambition: 100, posture: 'push' as const }, { people: [{ fte: 40, skill: 100, morale: 100 }] }, { fatigue: 100 }]) {
      expect(quote(g, t, { k: 2, ...extra }).spend).toBe(base)
    }
  })
})

describe('the pieces', () => {
  it('moneyOdds is the rd.ts expression cut to the clamp', () => {
    const t = productTask()
    for (const k of span(0.01, 4, 40)) for (const b of span(0, 1, 10)) expect(moneyOdds(t, b, k)).toBe(clampN(1 - (1 - b) * Math.pow(k, -0.4), 0.05, 0.95))
  })

  it('deviate gives the money odds itself when every term is quiet, and keeps the odds inside the clamp when they are not', () => {
    const quiet = { crew: 0, tools: 0, know: 0, hard: 0, rival: 0, spill: 0, tired: 0 }
    for (const pk of [0.05, 0.3, 0.4999999, 0.95]) {
      const r = deviate(pk, 0.05, 0.95, quiet, 0)
      expect(r.p).toBe(pk)
      expect(r.pieces.every((x) => x.pts === 0)).toBe(true)
    }
    const loud = { crew: 12, tools: 6, know: 15, hard: 15, rival: 8, spill: 18, tired: 10 }
    for (const pk of span(0.05, 0.95, 18)) {
      const up = deviate(pk, 0.05, 0.95, loud, 1.3)
      expect(up.p).toBeLessThanOrEqual(0.95)
      expect(up.p).toBeGreaterThanOrEqual(0.05)
      const down = deviate(pk, 0.05, 0.95, { ...loud, crew: -12, tools: -6, know: -15, hard: -15, rival: -8, spill: -18, tired: -10 }, -1.3)
      expect(down.p).toBeLessThanOrEqual(0.95)
      expect(down.p).toBeGreaterThanOrEqual(0.05)
    }
  })

  it('deviate moves the odds by the points a term says, alone, anywhere in 0.1 to 0.9', () => {
    const quiet = { crew: 0, tools: 0, know: 0, hard: 0, rival: 0, spill: 0, tired: 0 }
    for (const pk of span(0.1, 0.9, 16)) {
      for (const key of ['crew', 'tools', 'know', 'rival', 'spill', 'tired'] as const) {
        for (const pts of [-8, -3, 3, 6, 15]) {
          const r = deviate(pk, 0, 1, { ...quiet, [key]: pts }, 0)
          const room = pts > 0 ? 0.999999 - pk : pk - 1e-6
          if (Math.abs(pts) / 100 < room - 0.01) expect(Math.abs(r.p - pk - pts / 100), `${key} ${pts} at ${pk}`).toBeLessThan(1e-9)
        }
      }
    }
  })
})

describe('the files', () => {
  const read = (name: string): string => readFileSync(join(ROOT, 'src', 'game', 'effort', `${name}.ts`), 'utf8')
  const strip = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

  it('are layer 2, hold no dash, and import nothing that draws, books money or reads the clock', () => {
    for (const name of ['factors', 'engine']) {
      expect(layerOf(`src/game/effort/${name}.ts`)).toBe(2)
      const text = read(name)
      expect(DASH.test(text)).toBe(false)
      expect(text).not.toMatch(/from '\.\.\/(rng|cash|ledger|spend|streams|core)'/)
      expect(text).not.toMatch(/from '\.\.\/kernel\//)
      expect(text).not.toMatch(/from '\.\.\/(household|business)/)
      expect(strip(text)).not.toMatch(/\b(Math\.random|Date|performance)\b|\.rng\b|\brand\(|\bchance\(/)
    }
  })

  it('factors.ts reads nothing of the game, and engine.ts reads the game only through persona.ts', () => {
    const f = read('factors')
    expect(f).not.toMatch(/from '\.\.\//)
    expect(strip(f)).not.toMatch(/\bg\.[a-z]/)
    const e = read('engine')
    const from = [...e.matchAll(/^import .* from '([^']+)'/gm)].map((m) => m[1])
    for (const mod of from) expect(['../types', './curves', './factors', './limits', './num', './persona', './types', './world'], `engine imports ${mod}`).toContain(mod)
    expect(strip(e)).not.toMatch(/\bg\.[a-z]/)
  })

  it('never walks the input: only named fields are read, so an input that carries anything else is never looked at', () => {
    const e = strip(read('engine'))
    expect(e).not.toMatch(/\.\.\.\s*(input|i)\b|Object\.(keys|entries|values|assign|getOwnPropertyNames)\(\s*(input|i)\b|JSON\.stringify\(\s*(input|i)\b|for \(const \w+ (in|of) (input|i)\)/)
    expect(e).not.toMatch(/\.u\b|\bu:/)
  })

  it('read no import while the module loads (rule d): a module-level const holds literals only', () => {
    for (const name of ['factors', 'engine']) {
      const text = read(name)
      const imported = new Set<string>()
      for (const m of text.matchAll(/^import \{([^}]*)\} from/gm)) for (const n of m[1]!.split(',')) if (n.trim() !== '') imported.add(n.trim().split(/\s+as\s+/).pop()!)
      for (const m of text.matchAll(/^(?:export )?const ([A-Za-z_]+)(?:: [^=]+)? = (.+)$/gm)) {
        for (const n of imported) expect(m[2], `${name}: ${m[1]} reads ${n}`).not.toMatch(new RegExp(`\\b${n}\\b`))
      }
    }
  })
})
