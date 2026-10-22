// R3-M3 (C.3): Heavy R&D on the Effort engine. A breakthrough's odds, years, price and quality come from `quote` with a fixed budget
// (kmax 1: money buys nothing here, the 8x price is the whole lever), a flop banks know-how in the breakthrough's own field, and the
// words say why.
//
// What this file pins:
//   - every read of a breakthrough (odds, quality, years, the why) goes through the engine's `quote` (a spy on it), and the legacy
//     names are wrappers over it: heavyOdds, heavyQuality, heavyYears, heavyCost keep their signatures and their numbers;
//   - parity against test/fixtures/effort-parity.json (recorded on v5.0.0): odds and quality within 1 point, years and price exact,
//     through the legacy names and through the engine's own quote, and the scripted lifecycle byte for byte (g.rng, the line on
//     sale, the record, the news);
//   - a flop banks know-how in that breakthrough's field, so the next heavyOdds for that name is higher by more than 0 and at most 15
//     points, another breakthrough's is not, the reasons name it, the results line carries a cause and what it taught, and the
//     five-year cooldown still blocks the next start;
//   - the clamp (8% to 60%) and the budget (k 1) hold at 100x inputs, the price never moves with cash, and the quality stays under 97;
//   - a hired-CEO company is steady, ambition 50 (D11), the player's own company is the player (ambition, posture);
//   - nothing here draws a number or writes the game (noDraw, a deep-frozen state), an NPC company banks nothing, and a project from
//     a v5.0.0 save (no fx) resolves and banks.
//
// No pinned seed: a life is the kit's own, with a tuple of arguments, and the one flop is found with findSeed.
import { describe, expect, it, vi } from 'vitest'
import { TOP_CEO_MAX_PTS, topCeoSteady } from '../src/game/business/ceo-edge'
import { advanceRd } from '../src/game/business/rd'
import { quote } from '../src/game/effort/engine'
import { newFx } from '../src/game/effort/fx'
import { KNOW_ODDS_MAX } from '../src/game/effort/limits'
import { ambitionOf, readYou, writeYou } from '../src/game/effort/persona'
import { isField } from '../src/game/effort/task'
import { BREAKTHROUGHS, breakthroughsFor } from '../src/game/business/heavy-data'
import {
  advanceHeavy,
  HEAVY_COOLDOWN,
  heavyBlock,
  heavyCost,
  heavyGain,
  heavyOdds,
  heavyQuality,
  heavyQuote,
  heavyTask,
  heavyWhy,
  heavyWhyLine,
  heavyYears,
  startHeavy,
} from '../src/game/business/heavy-rd'
import { businessAssetView } from '../src/game/business'
import { heavyField } from '../src/game/business/heavy-effort'
import { launchP, rdQuality } from '../src/game/business/rd'
import type { BizState, RdProject } from '../src/game/business/state'
import type { Asset, GameState, MenuAction, MenuNode } from '../src/game/types'
import { PRESENT_YEAR } from '../src/game/history/timeline'
import { expectLifecycle, expectParity, neutralAmbition, setCompany, TOL, tradeFixture, type Point } from './effort-parity-kit'
import { ceoSlack } from './ceo-edge-kit'
import { deepFreeze } from './fuzz-kit'
import { labGame, noDraw } from './lab-kit'
import { allNodes } from './market-kit'
import { findSeed } from './seed-kit'

// The engine's `quote`, wrapped: the real one answers, the spy counts. Every import of it (the adapter's) sees the wrapper.
vi.mock('../src/game/effort/engine', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/game/effort/engine')>()
  return { ...real, quote: vi.fn(real.quote) }
})
const spy = vi.mocked(quote)

const DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)
const LIFE = [7, 2030] as const
const NAMES = breakthroughsFor('restaurant').map((x) => x.name)
const NAME = NAMES[1]!
const OTHER = NAMES[2]!

/** A restaurant at the default actor (ambition 50, steady, fatigue 0), its owner running it. */
function owned(life: readonly [number, number] = LIFE) {
  return tradeFixture('restaurant', life)
}

/** The same company with a hired manager of `skill` and a research team of `scientists`. */
function hired(skill: number, scientists = 0, life: readonly [number, number] = LIFE) {
  const f = owned(life)
  setCompany(f.g, f.b, { manager: skill, quality: 50, scientists, staff: 0, projects: 0 })
  return f
}

/** A breakthrough ready to be decided this year-end, started the way the menu starts one. */
function ready(f: { g: GameState; a: Asset; b: BizState }, name = NAME, odds?: number): RdProject {
  const p = startHeavy(f.g, f.a, f.b, name)
  if (p === null) throw new Error('the breakthrough did not start')
  if (odds !== undefined) p.odds = odds
  p.progress = p.years
  f.g.queue = []
  return p
}

/** The measure of the oracle's heavy grid, read through the engine's own quote instead of the legacy names. */
const engineMeasure = ({ g, b }: Point) => {
  const q = heavyQuote(g, b!)
  return { odds: q.p, years: q.years, quality: q.quality ?? -1, cost: q.spend }
}

const rowsOf = (g: GameState, a: Asset): MenuAction[] => {
  const menu = allNodes(g, businessAssetView(g, a)).find((n) => n.type === 'menu' && n.id === `biz.products.${a.id}`)
  if (!menu || menu.type !== 'menu') throw new Error('no products menu')
  return menu.children(g).filter((n: MenuNode): n is MenuAction => n.type === 'action' && n.id.startsWith('biz.heavy.'))
}

describe('every read of a breakthrough goes through the engine', () => {
  it('heavyOdds, heavyQuality and heavyYears call quote, with a task in the breakthrough’s own field and a budget of one', () => {
    const { g, b } = owned()
    for (const read of [() => heavyOdds(g, b, NAME), () => heavyQuality(g, b), () => heavyWhy(g, b, NAME), () => heavyWhyLine(g, b, NAME), () => heavyQuote(g, b, NAME), () => heavyGain(g, b, NAME)]) {
      spy.mockClear()
      read()
      expect(spy).toHaveBeenCalled()
    }
    spy.mockClear()
    heavyOdds(g, b, NAME)
    const [, task, input] = spy.mock.calls.at(-1)!
    expect(task.field).toBe(heavyField(NAME))
    expect(task.mode).toBe('project')
    expect(task.kmax).toBe(1)
    expect(input.k).toBe(1)
  })

  it('startHeavy and the menu row quote the engine too, and the row says why', () => {
    const f = hired(100, 3)
    spy.mockClear()
    const rows = rowsOf(f.g, f.a)
    expect(rows.length).toBeGreaterThan(0)
    const row = rows.find((r) => r.id.startsWith(`biz.heavy.${NAME}`))!
    const text = row.confirm?.(f.g) ?? ''
    expect(spy).toHaveBeenCalled()
    expect(text).toContain(`Start ${NAME}?`)
    expect(text).toMatch(/Odds \d+%: /)
    expect(text).toContain('team +')
    spy.mockClear()
    expect(startHeavy(f.g, f.a, f.b, NAME)).not.toBeNull()
    expect(spy).toHaveBeenCalled()
  })

  it('the know-how key of every catalogue name is a valid, unique field of at most 40 characters', () => {
    const keys = new Set<string>()
    let n = 0
    for (const list of Object.values(BREAKTHROUGHS)) {
      for (const x of list) {
        const key = heavyField(x.name)
        expect(isField(key), x.name).toBe(true)
        expect(key.startsWith('heavy.'), x.name).toBe(true)
        expect(key.length, x.name).toBeLessThanOrEqual(40)
        keys.add(key)
        n++
      }
    }
    expect(n).toBeGreaterThan(50)
    expect(keys.size).toBe(n)
    expect(heavyField('')).toBe('heavy')
    expect(isField(heavyField('!!! ???'))).toBe(true)
    expect(isField(heavyField(undefined))).toBe(true)
  })
})

describe('parity with v5.0.0: odds and quality within 1 point, years and price exact', () => {
  it('the legacy names give the recorded grid', () => {
    expectParity('heavy', undefined, TOL, ceoSlack)
  })

  it('the engine’s own quote gives the recorded grid (odds, years, quality, and spend equal to the price)', () => {
    expectParity('heavy', engineMeasure, TOL, ceoSlack)
  })

  it('the scripted lifecycle is byte for byte the recorded one (g.rng, the line on sale, the record, the news)', () => {
    expectLifecycle('heavy')
  })

  it('the odds are the legacy formula at the default actor, over a grid of skills and teams, and the years are the legacy ones in every trade', () => {
    const f = owned()
    let n = 0
    for (const skill of [0, 20, 50, 80, 100]) {
      for (const scientists of [0, 1, 4, 6]) {
        setCompany(f.g, f.b, { manager: skill, quality: 50, scientists, staff: 0, projects: 0 })
        // J.8: a hired manager rated 90 or more adds up to 3 points (ceo-edge.ts), kept under the legacy ceiling.
        const want = Math.min(0.6, Math.max(0.08, 0.55 * launchP(f.g, f.b)) + (TOP_CEO_MAX_PTS * topCeoSteady(skill)) / 100)
        expect(heavyOdds(f.g, f.b, NAME), `${skill}/${scientists}`).toBeCloseTo(want, 12)
        n++
      }
    }
    expect(n).toBe(20)
    for (const industry of Object.keys(BREAKTHROUGHS)) {
      const legacy = heavyYears({ industry })
      expect(legacy).toBeGreaterThanOrEqual(4)
      expect(legacy).toBeLessThanOrEqual(6)
    }
  })
})

describe('a failed breakthrough banks know-how in its own field', () => {
  /** Plays one year-end on a breakthrough forced to a 2% chance; the result and what the company knows afterwards. */
  const play = (seed: number, make: (seed: number) => { g: GameState; a: Asset; b: BizState }) => {
    const f = make(seed)
    const before = heavyOdds(f.g, f.b, NAME)
    const otherBefore = heavyOdds(f.g, f.b, OTHER)
    const p = ready(f, NAME, 0.02)
    const year = f.g.year
    const r = advanceHeavy(f.g, f.a, f.b, p, year)
    return { ...f, before, otherBefore, r, year, p }
  }
  const flopSeed = (label: string, make: (seed: number) => { g: GameState; a: Asset; b: BizState }) =>
    findSeed((seed) => !play(seed, make).r.won, { label, tries: 40 })

  it('the next heavyOdds for that name is higher by more than 0 and at most 15 points, another breakthrough’s is not, and the reasons say so', () => {
    const make = (seed: number) => owned([seed, 2030])
    const seed = flopSeed('heavy flop owner', make)
    const { g, b, before, otherBefore, r } = play(seed, make)
    expect(r.won).toBe(false)
    expect(b.knowHow?.[heavyField(NAME)]).toBeGreaterThan(0)
    const after = heavyOdds(g, b, NAME)
    const gained = (after - before) * 100
    expect(gained).toBeGreaterThan(0)
    expect(gained).toBeLessThanOrEqual(KNOW_ODDS_MAX + 1e-9)
    expect(heavyOdds(g, b, OTHER)).toBe(otherBefore)
    const know = heavyWhy(g, b, NAME).find((x) => x.key === 'know')
    expect(know?.pts ?? 0).toBeGreaterThan(0)
    expect(heavyWhy(g, b, OTHER).some((x) => x.key === 'know')).toBe(false)
    expect(heavyWhyLine(g, b, NAME)).toMatch(/know-how \+\d+/)
  })

  it('the quality is the legacy number to within the three points know-how may add, and never over 97', () => {
    const make = (seed: number) => owned([seed, 2030])
    const seed = flopSeed('heavy flop owner', make)
    const { g, b } = play(seed, make)
    const legacy = Math.min(97, rdQuality(g, b, 2.5) + 14)
    const q = heavyQuality(g, b)
    expect(q).toBeLessThanOrEqual(97)
    expect(q - legacy).toBeGreaterThanOrEqual(0)
    expect(q - legacy).toBeLessThanOrEqual(3)
    // With nothing banked it is the legacy number exactly.
    delete b.knowHow
    expect(heavyQuality(g, b)).toBe(legacy)
  })

  it('the results line keeps the pinned words and gains a cause and what the failure taught', () => {
    const make = (seed: number) => owned([seed, 2030])
    const seed = flopSeed('heavy flop owner', make)
    const { r, p } = play(seed, make)
    expect(r.line).toContain(`${NAME} flopped in testing (`)
    expect(r.line).toMatch(/of R&D\)\./)
    expect(r.line).toMatch(/The failure (still )?taught you/)
    expect(r.line).toMatch(/know-how \d+/)
    expect(p.name).toBe(NAME)
    for (const sentence of r.line.split(/(?<=\.)\s+/)) expect(sentence.length).toBeLessThanOrEqual(90)
  })

  it('the five-year cooldown still blocks the next start, with its year', () => {
    const make = (seed: number) => owned([seed, 2030])
    const seed = flopSeed('heavy flop owner', make)
    const { g, a, b, p, year } = play(seed, make)
    // advanceRd takes a finished project off the list; this test called advanceHeavy on its own.
    b.rd = (b.rd ?? []).filter((x) => x !== p)
    expect(b.heavyLast).toBe(year)
    g.year = year + 1
    const why = heavyBlock(g, b, NAME, a.id)
    expect(why).toContain(`Your last breakthrough ended in ${year}`)
    expect(why).toContain(`can start in ${year + HEAVY_COOLDOWN}`)
    g.year = year + HEAVY_COOLDOWN
    expect(heavyBlock(g, b, NAME, a.id) ?? '').not.toContain('Your last breakthrough')
  })

  it('a company with a hired CEO banks in its own map too', () => {
    const make = (seed: number) => hired(60, 2, [seed, 2030])
    const seed = flopSeed('heavy flop hired', make)
    const { g, b, before } = play(seed, make)
    expect(b.ceo).toBe('manager')
    expect(b.knowHow?.[heavyField(NAME)]).toBeGreaterThan(0)
    expect(heavyOdds(g, b, NAME)).toBeGreaterThan(before)
  })

  it('an NPC company (no asset) banks nothing and writes no flag', () => {
    const f = owned()
    const p = ready(f, NAME, 0.02)
    const flags = JSON.stringify(f.g.flags)
    const know = JSON.stringify(f.b.knowHow ?? null)
    let lost = 0
    for (let seed = 1; seed <= 12 && lost < 3; seed++) {
      const h = owned([seed, 2030])
      const q = ready(h, NAME, 0.02)
      const before = JSON.stringify(h.g.flags)
      const r = advanceHeavy(h.g, null, h.b, q, h.g.year)
      if (r.won) continue
      lost++
      expect(JSON.stringify(h.g.flags)).toBe(before)
      expect(h.b.knowHow).toBeUndefined()
    }
    expect(lost).toBe(3)
    expect(p.progress).toBe(p.years)
    expect(JSON.stringify(f.g.flags)).toBe(flags)
    expect(JSON.stringify(f.b.knowHow ?? null)).toBe(know)
  })

  it('a win banks none, and an owner-run win lifts the owner’s ambition a little', () => {
    let won = 0
    for (let seed = 1; seed <= 40 && won < 3; seed++) {
      const f = owned([seed, 2030])
      const p = ready(f, NAME, 0.98)
      const shift = readYou(f.g).shift
      const r = advanceHeavy(f.g, f.a, f.b, p, f.g.year)
      if (!r.won) continue
      won++
      expect(f.b.knowHow).toBeUndefined()
      expect(readYou(f.g).shift).toBeGreaterThan(shift)
    }
    expect(won).toBe(3)
  })

  it('a project from a v5.0.0 save (no fx) resolves and banks, and one stepped this year is a replay that changes nothing', () => {
    const seed = flopSeed('heavy flop owner', (s) => owned([s, 2030]))
    const f = owned([seed, 2030])
    const p = ready(f, NAME, 0.02)
    expect(p.fx).toBeUndefined()
    const r = advanceHeavy(f.g, f.a, f.b, p, f.g.year)
    expect(r.won).toBe(false)
    expect(f.b.knowHow?.[heavyField(NAME)]).toBeGreaterThan(0)

    const h = owned([seed, 2030])
    const q = ready(h, NAME, 0.02)
    q.fx = { ...newFx(h.g.year), last: h.g.year }
    const r2 = advanceHeavy(h.g, h.a, h.b, q, h.g.year)
    expect(r2.won).toBe(false)
    expect(h.b.knowHow).toBeUndefined()
  })

  it('goes through advanceRd the way the year-end does, and the notice carries the line', () => {
    const seed = flopSeed('heavy flop owner', (s) => owned([s, 2030]))
    const f = owned([seed, 2030])
    ready(f, NAME, 0.02)
    advanceRd(f.g, f.b, f.g.year)
    const n = f.g.queue.find((m) => m.kind === 'notice' && m.title.endsWith('R&D Results'))
    const text = n && n.kind === 'notice' ? n.text : ''
    expect(text).toContain(`${NAME} flopped in testing (`)
    expect(text).toMatch(/know-how \d+/)
  })
})

describe('the engine’s caps hold at 100x', () => {
  it('odds stay inside 8% to 60% and quality at 97 whatever the company is, knows or is told', () => {
    const f = hired(100, 6)
    f.b.quality = 100
    f.b.cash *= 100
    f.b.valuation *= 100
    f.b.knowHow = { [heavyField(NAME)]: 100 }
    const q = heavyQuote(f.g, f.b, NAME)
    expect(q.p).toBeLessThanOrEqual(0.6)
    expect(q.p).toBeGreaterThanOrEqual(0.08)
    expect(q.quality ?? 0).toBeLessThanOrEqual(97)
    expect(q.k).toBe(1)
    const low = hired(0, 0)
    low.b.quality = 0
    expect(heavyOdds(low.g, low.b, NAME)).toBeGreaterThanOrEqual(0.08)
    expect(heavyOdds(low.g, low.b, NAME)).toBeLessThan(0.3)
  })

  it('money buys nothing: a budget of 100 is cut to one, and cash, valuation and headcount leave the price alone', () => {
    const f = hired(60, 2)
    const task = heavyTask(f.g, f.b, NAME)
    const asked = quote(f.g, task, { k: 100, people: [{ fte: 1000, skill: 100, morale: 100 }] })
    expect(asked.k).toBe(1)
    expect(asked.capped).toContain('k')
    expect(asked.spend).toBe(task.cost)
    const price = heavyCost(f.g, f.b)
    expect(price).not.toBeNull()
    expect(task.cost).toBe(price)
    const odds = heavyOdds(f.g, f.b, NAME)
    f.b.cash *= 100
    f.b.valuation *= 100
    expect(heavyCost(f.g, f.b)).toBe(price)
    expect(heavyQuote(f.g, f.b, NAME).spend).toBe(price)
    expect(heavyOdds(f.g, f.b, NAME)).toBe(odds)
  })

  it('a trade with no classic idea still answers the odds (the price is only the spend)', () => {
    const f = labGame(LIFE[0], 'software', { year: LIFE[1] })
    f.g.year = 1900
    expect(heavyCost(f.g, f.b)).toBeNull()
    expect(heavyOdds(f.g, f.b, NAME)).toBeGreaterThanOrEqual(0.08)
    expect(heavyQuote(f.g, f.b, NAME).spend).toBeGreaterThan(0)
  })
})

describe('who is working', () => {
  it('a hired CEO’s company is steady whatever the player is like; the player’s own is the player', () => {
    const calm = hired(60, 2)
    const bold = hired(60, 2)
    bold.g.character.hidden.willpower = 100
    bold.g.character.hidden.discipline = 100
    expect(heavyOdds(bold.g, bold.b, NAME)).toBe(heavyOdds(calm.g, calm.b, NAME))
    expect(heavyWhy(bold.g, bold.b, NAME).some((x) => x.key === 'bold')).toBe(false)

    const mine = owned()
    const eager = owned()
    eager.g.character.hidden.willpower = 100
    eager.g.character.hidden.discipline = 100
    expect(ambitionOf(eager.g)).toBeGreaterThan(80)
    expect(heavyWhy(eager.g, eager.b, NAME).some((x) => x.key === 'bold')).toBe(true)
    expect(heavyWhy(mine.g, mine.b, NAME).some((x) => x.key === 'bold')).toBe(false)
    expect(heavyOdds(eager.g, eager.b, NAME)).not.toBe(heavyOdds(mine.g, mine.b, NAME))
  })

  it('an owner who pushes hard builds it a year sooner in a slow trade, and the menu and the start agree', () => {
    const f = labGame(LIFE[0], 'manufacturing', { year: LIFE[1] })
    neutralAmbition(f.g)
    const calm = heavyQuote(f.g, f.b).years
    expect(calm).toBe(heavyYears(f.b))
    expect(calm).toBe(6)
    f.g.character.hidden.willpower = 100
    f.g.character.hidden.discipline = 100
    const you = readYou(f.g)
    writeYou(f.g, { ...you, shift: 12, posture: 'push', effective: 'push' })
    expect(ambitionOf(f.g)).toBeGreaterThan(95)
    const pushed = heavyQuote(f.g, f.b)
    expect(pushed.years).toBe(5)
    expect(pushed.years).toBeGreaterThanOrEqual(4)
    // The legacy reader is the calibration: the default actor's years.
    expect(heavyYears(f.b)).toBe(6)
  })
})

describe('reads draw nothing and write nothing', () => {
  it('noDraw around every read, and a deep-frozen state reads fine', () => {
    const f = hired(70, 3)
    f.b.knowHow = { [heavyField(NAME)]: 40 }
    const { g, a, b } = f
    expect(noDraw(g, () => heavyOdds(g, b, NAME))).toBe(true)
    expect(noDraw(g, () => heavyQuality(g, b))).toBe(true)
    expect(noDraw(g, () => heavyQuote(g, b, NAME))).toBe(true)
    expect(noDraw(g, () => heavyWhy(g, b, NAME))).toBe(true)
    expect(noDraw(g, () => heavyWhyLine(g, b, NAME))).toBe(true)
    expect(noDraw(g, () => heavyGain(g, b, NAME))).toBe(true)
    expect(noDraw(g, () => rowsOf(g, a).forEach((r) => r.confirm?.(g)))).toBe(true)
    const state = JSON.stringify(g)
    heavyOdds(g, b, NAME)
    heavyWhyLine(g, b, NAME)
    expect(JSON.stringify(g)).toBe(state)
    const frozen = hired(70, 3, [LIFE[0] + 1, LIFE[1]])
    frozen.b.knowHow = { [heavyField(NAME)]: 40 }
    deepFreeze(frozen.g)
    expect(heavyOdds(frozen.g, frozen.b, NAME)).toBeGreaterThan(0)
    expect(heavyWhy(frozen.g, frozen.b, NAME).length).toBeGreaterThan(0)
    expect(heavyQuality(frozen.g, frozen.b)).toBeGreaterThan(0)
  })

  it('the why is a line of at most 110 characters that names the people, and nothing else a reader could not act on', () => {
    const f = hired(100, 4)
    const line = heavyWhyLine(f.g, f.b, NAME)
    expect(line).toMatch(/^Odds \d+%: /)
    expect(line.length).toBeLessThanOrEqual(110)
    expect(line).toContain('skill +')
    expect(line).toContain('team +')
    expect(line).not.toMatch(DASH)
    const flat = hired(50, 0)
    expect(heavyWhyLine(flat.g, flat.b, NAME)).toMatch(/^Odds \d+%$/)
  })
})

it('the present year is the present year (the fixture’s years are not a pin of this file)', () => {
  expect(PRESENT_YEAR).toBeGreaterThanOrEqual(2026)
})
