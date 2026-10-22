// R3-M2 (C.3): product R&D on the Effort engine. `rdQuote` takes its odds, years and quality from `quote`, a finished project is booked
// through `step`, and the odds say why in labelled lines. What this file pins:
//   engine     `rdQuote` calls the core's `quote`; its `why` names the team, the funding, the know-how and the tiredness, in the odds line
//              of docs/VOICE.md ("Odds 62%: team +9, funding +7"); the money buys odds, speed and quality and never a lower price
//   parity     at the default actor (ambition 50, steady, no know-how, no fatigue) the rd grid of the oracle (recorded on v5.0.0) holds
//              within a point and the lifecycle (three projects to their end: lines, brand, years, g.rng) is exact
//   banking    a flop banks know-how in the product's family, in the company's own map: the next quote of that family is higher by more
//              than 0 and at most 15 points, another family's is the same, and the results line says what failed and what it taught
//   rules      only the player's companies bank (an NPC company's year leaves g.flags byte for byte); a win banks nothing and lifts the
//              owner's ambition; a project with no `fx` (a hired CEO's, a v5.0.0 save) resolves and banks; a default project saves what
//              v5.0.0 saved; a quote is a read (no draw, a deep-frozen game is fine); the draws stay chance, chance, rand
// No pinned seed: every life is the test kits' own, with a tuple of arguments, and the flops and wins are found with findSeed.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'

const engine = vi.hoisted(() => ({ calls: 0 }))
vi.mock('../src/game/effort/engine', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/game/effort/engine')>()
  return {
    ...real,
    quote: (...args: Parameters<typeof real.quote>) => {
      engine.calls += 1
      return real.quote(...args)
    },
  }
})

import { causeLine } from '../src/game/effort/why'
import { ambitionOf, readYou, writeYou } from '../src/game/effort/persona'
import { KNOW_ODDS_MAX, WIN_SHIFT } from '../src/game/effort/limits'
import { newBiz } from '../src/game/business/founding'
import { lineInfo } from '../src/game/business/product-market'
import { classicIdeas } from '../src/game/business/products'
import { businessAssetView } from '../src/game/business'
import { advanceRd, bestRdIdea, HIT_P, HIT_QUALITY, launchP, QUALITY_SPREAD, rdCost, rdCrowding, rdOf, rdQuote, rdRange, rdValue, RD_MAX, startRd } from '../src/game/business/rd'
import { rdField, rdOddsLine, rdTask } from '../src/game/business/rd-effort'
import { normalizeBiz, type BizState, type RdProject } from '../src/game/business/state'
import { cycleComponents, readImportGraph } from './arch-kit'
import { expectLifecycle, expectParity, setCompany, tradeFixture } from './effort-parity-kit'
import { deepFreeze } from './fuzz-kit'
import { noDraw } from './lab-kit'
import { allNodes } from './market-kit'
import { findSeed } from './seed-kit'
import type { Json } from '../src/game/types'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)
const ADAPTER = 'src/game/business/rd-effort.ts'

type Fixture = ReturnType<typeof tradeFixture>

/** A restaurant of the player's, in its second year, run by the owner at the default ambition. */
const fixture = (seed: number): Fixture => tradeFixture('restaurant', [seed, 2030])

/** The idea at `index` of the trade's classics, and what a normal budget for it is. */
const ideaAt = (f: Fixture, index = 0): string => classicIdeas(f.g, f.b)[index]!
const normal = (f: Fixture, idea: string): number => rdCost(f.b, idea)

/** One ordinary project of the stored kind that finishes this year, at the stored odds given. */
function project(f: Fixture, idea: string, odds: number, over: Partial<RdProject> = {}): RdProject {
  const info = lineInfo(idea, f.b.industry)
  return { id: `rd-t-${idea}`, name: idea, budget: normal(f, idea), years: 1, progress: 0, odds, boost: 0, quality: 60, family: info.family, kind: info.kind, started: f.g.year, ...over }
}

/** Play the year-end the way economy.evolve does for R&D: the calendar moves on, then `advanceRd` closes the year just booked. */
function yearEnd(f: Fixture, b: BizState = f.b): void {
  f.g.year += 1
  advanceRd(f.g, b, f.g.year - 1)
}

/** A restaurant with one project on the way at `odds`, played to its end. */
function play(seed: number, odds: number, edit: (f: Fixture) => void = () => {}): Fixture & { idea: string; won: boolean } {
  const f = fixture(seed)
  edit(f)
  const idea = ideaAt(f)
  rdOf(f.b).push(project(f, idea, odds))
  yearEnd(f)
  return { ...f, idea, won: f.b.products.some((p) => p.name === idea) }
}

/** A life where the project at the stored odds floor flops, found by search (the stored odds clamp at .02, so nearly every life does). */
const flopSeed = (edit?: (f: Fixture) => void): number => findSeed((seed) => !play(seed, 0.02, edit).won, { label: edit ? 'rd flop, edited' : 'rd flop' })
const winSeed = (): number => findSeed((seed) => play(seed, 0.98).won, { label: 'rd win' })

const textsOf = (f: Fixture): string[] => f.g.log.flatMap((y) => y.entries.map((e) => e.text))
const resultsOf = (f: Fixture): string => f.g.queue.flatMap((m) => (m.kind === 'notice' && /R&D Results/.test(m.title) ? [m.text] : [])).join('\n')
const keysOf = (q: { why: readonly { key: string }[] }): string[] => q.why.map((r) => r.key)

describe('rdQuote is the engine', () => {
  it('calls the core quote at least once for every rdQuote, and for the values built on it', () => {
    const f = fixture(1)
    const idea = ideaAt(f)
    const before = engine.calls
    rdQuote(f.g, f.b, idea, normal(f, idea))
    expect(engine.calls).toBeGreaterThan(before)
    const mid = engine.calls
    rdValue(f.g, f.b, idea, normal(f, idea))
    expect(engine.calls).toBeGreaterThan(mid)
  })

  it('names the team and the funding, in the odds line of the research screens', () => {
    const f = fixture(2)
    setCompany(f.g, f.b, { manager: 60, quality: 50, scientists: 3, staff: 0, projects: 0 })
    const idea = ideaAt(f)
    const q = rdQuote(f.g, f.b, idea, normal(f, idea) * 2)
    expect(keysOf(q)).toContain('team')
    expect(keysOf(q)).toContain('funding')
    const line = rdOddsLine(f.g, q)
    expect(line).toMatch(/^Odds \d+%: /)
    expect(line).toContain('team +')
    expect(line).toContain('funding +')
    expect(line).toContain(`${Math.round(q.odds * 100)}%`)
    expect(line.length).toBeLessThanOrEqual(110)
    expect(line).not.toMatch(DASH)
  })

  it('writes the team as the odds points the scientists add to the company, and a thin budget as a loss of funding', () => {
    const f = fixture(3)
    const idea = ideaAt(f)
    setCompany(f.g, f.b, { manager: 60, quality: 50, scientists: 3, staff: 0, projects: 0 })
    const withTeam = launchP(f.g, f.b)
    const q = rdQuote(f.g, f.b, idea, Math.round(normal(f, idea) * 0.5))
    setCompany(f.g, f.b, { manager: 60, quality: 50, scientists: 0, staff: 0, projects: 0 })
    const without = launchP(f.g, f.b)
    expect(q.why.find((r) => r.key === 'team')?.pts).toBe(Math.round((withTeam - without) * 100))
    expect(q.why.find((r) => r.key === 'funding')?.pts).toBeLessThan(0)
    expect(rdOddsLine(f.g, q)).toMatch(/funding -\d+/)
  })

  it('has no line at a normal budget with no team, and the odds line is just the odds', () => {
    const f = fixture(4)
    setCompany(f.g, f.b, { manager: 60, quality: 50, scientists: 0, staff: 0, projects: 0 })
    const idea = ideaAt(f)
    const q = rdQuote(f.g, f.b, idea, normal(f, idea))
    expect(q.why).toEqual([])
    expect(rdOddsLine(f.g, q)).toBe(`Odds ${Math.round(q.odds * 100)}%`)
    expect(q.k).toBe(1)
  })

  it('writes a tired owner as a line of its own, and the odds go down with it', () => {
    const f = fixture(5)
    const idea = ideaAt(f)
    const rested = rdQuote(f.g, f.b, idea, normal(f, idea))
    f.g.flags.household = { owner: `${f.g.generation}:${f.g.character.id}`, fatigue: 70 } as Json
    const tired = rdQuote(f.g, f.b, idea, normal(f, idea))
    expect(keysOf(tired)).toContain('tired')
    expect(tired.why.find((r) => r.key === 'tired')!.pts).toBeLessThan(0)
    expect(tired.odds).toBeLessThan(rested.odds)
  })

  it('writes the lines under the budget slider of the R&D screen, with the odds the quote has', () => {
    const f = fixture(14)
    setCompany(f.g, f.b, { quality: 50, scientists: 2, staff: 0, projects: 0, manager: undefined })
    const idea = ideaAt(f)
    const node = allNodes(f.g, businessAssetView(f.g, f.a)).find((n) => n.id === `biz.launch.${idea}.${f.a.id}`)
    expect(node?.type).toBe('action')
    const input = node?.type === 'action' ? node.input : undefined
    expect(input?.kind).toBe('slider')
    const budget = rdRange(f.b, idea).normal * 2
    const text = input?.kind === 'slider' ? input.preview!(f.g, budget) : ''
    const q = rdQuote(f.g, f.b, idea, budget)
    expect(text).toContain(rdOddsLine(f.g, q))
    expect(text).toMatch(/Odds \d+%: team \+\d+, funding \+\d+/)
    expect(text).toContain(`quality ~${q.quality}`)
  })

  it('does not let a hired manager be tired or driven: the owner is the player, the manager is steady at ambition 50', () => {
    const f = fixture(6)
    f.g.flags.household = { owner: `${f.g.generation}:${f.g.character.id}`, fatigue: 70 } as Json
    const y = readYou(f.g)
    y.posture = 'push'
    y.effective = 'push'
    writeYou(f.g, y)
    setCompany(f.g, f.b, { manager: 60, quality: 50, scientists: 0, staff: 0, projects: 0 })
    const idea = ideaAt(f)
    const hired = rdQuote(f.g, f.b, idea, normal(f, idea))
    expect(keysOf(hired)).not.toContain('tired')
    expect(hired.odds).toBe(launchP(f.g, f.b))
  })
})

describe('parity with v5.0.0 at the default actor', () => {
  it('every row of the rd grid of the oracle holds within a point, with the years and the price exact', () => {
    expectParity('rd')
  })

  it('three projects played to their end leave the same lines, brand, years and g.rng', () => {
    expectLifecycle('rd')
  })

  it('keeps the numbers of the product task: the odds clamp, the years, the quality bounds, the hit and the spread', () => {
    const t = rdTask(50_000, 1.5, 'Espresso Bar Drink', RD_MAX, 0.4)
    expect([t.oddsExp, t.yearsExp, t.minYears, t.maxYears, t.oddsLo, t.oddsHi]).toEqual([0.4, 0.5, 1, 4, 0.05, 0.95])
    expect(t.quality).toEqual({ up: 28, down: 14, exp: 0.8, ceiling: 97, room: 0, lo: 5, hi: 97 })
    expect(t.hit).toEqual({ p: HIT_P, bonus: HIT_QUALITY })
    expect(t.spread).toBe(QUALITY_SPREAD)
    expect(t.kmax).toBe(RD_MAX)
    expect(t.mode).toBe('project')
    expect(t.cost).toBe(50_000)
    expect(t.field).toBe(rdField('Espresso Bar Drink'))
  })

  it('makes a field of a family: the words of the family in a know-how key, bounded, and one per family', () => {
    expect(rdField('Espresso Bar Drink')).toMatch(/^rd\.[a-z][a-zA-Z0-9]*$/)
    expect(rdField('Espresso Bar Drink')).not.toBe(rdField('Weekend Brunch'))
    expect(rdField('Espresso Bar Drink')).toBe(rdField('Espresso Bar Drink'))
    for (const odd of ['', '   ', '!!!', 'x'.repeat(300), 'Wi-Fi Router (2nd gen)']) expect(rdField(odd), odd).toMatch(/^[a-z][a-zA-Z0-9.]{0,39}$/)
    expect(rdField(undefined as unknown as string)).toMatch(/^[a-z][a-zA-Z0-9.]{0,39}$/)
  })
})

describe('a flop banks know-how', () => {
  const seed = flopSeed()

  /** The quote with and without what the company has banked, at the same state of the world (a year later the manager is a year more experienced). */
  function withAndWithout(f: Fixture, idea: string): { with: ReturnType<typeof rdQuote>; without: ReturnType<typeof rdQuote> } {
    const budget = normal(f, idea)
    const withKnow = rdQuote(f.g, f.b, idea, budget)
    const saved = f.b.knowHow
    delete f.b.knowHow
    const without = rdQuote(f.g, f.b, idea, budget)
    if (saved !== undefined) f.b.knowHow = saved
    return { with: withKnow, without }
  }

  it('banks it in the family, in the company map: the next quote of that family is higher by 1 to 15 points, another family is the same', () => {
    const f = fixture(seed)
    const idea = ideaAt(f)
    const other = ideaAt(f, 1)
    expect(lineInfo(other, f.b.industry).family).not.toBe(lineInfo(idea, f.b.industry).family)
    rdOf(f.b).push(project(f, idea, 0.02))
    yearEnd(f)
    expect(f.b.products.some((p) => p.name === idea)).toBe(false)
    expect(f.b.knowHow).toBeDefined()
    expect(Object.keys(f.b.knowHow!)).toEqual([rdField(lineInfo(idea, f.b.industry).family)])
    const mine = withAndWithout(f, idea)
    const points = (mine.with.odds - mine.without.odds) * 100
    expect(points).toBeGreaterThan(0)
    expect(points).toBeLessThanOrEqual(KNOW_ODDS_MAX)
    expect(keysOf(mine.with)).toContain('know')
    expect(keysOf(mine.without)).not.toContain('know')
    expect(rdOddsLine(f.g, mine.with)).toContain('know-how +')
    expect(mine.with.quality).toBeGreaterThanOrEqual(mine.without.quality)
    const theirs = withAndWithout(f, other)
    expect(theirs.with).toEqual(theirs.without)
    // The same family under another name (a next generation) has what the first taught.
    expect(keysOf(rdQuote(f.g, f.b, `${lineInfo(idea, f.b.industry).family} Mk II`, normal(f, idea)))).toContain('know')
  })

  it('stays under 15 points however many flops there are, and the know-how stays at 100', () => {
    const f = fixture(seed)
    const idea = ideaAt(f)
    for (let i = 0; i < 40; i++) {
      rdOf(f.b).push(project(f, idea, 0.02))
      yearEnd(f)
    }
    expect(Math.max(...Object.values(f.b.knowHow ?? {}))).toBeLessThanOrEqual(100)
    const q = withAndWithout(f, idea)
    expect((q.with.odds - q.without.odds) * 100).toBeLessThanOrEqual(KNOW_ODDS_MAX + 1e-9)
    expect((q.with.odds - q.without.odds) * 100).toBeGreaterThan(KNOW_ODDS_MAX - 4)
  })

  it('says what failed and what it taught on the results line, after the words the tests and the log already have', () => {
    const f = play(seed, 0.02)
    const results = resultsOf(f)
    expect(results).toContain(`${f.idea} flopped in testing (`)
    expect(results).toMatch(/of R&D\)\. .+know-how \d+/)
    const line = results.split('\n').find((l) => l.includes('flopped in testing'))!
    const cause = line.split('of R&D). ')[1]!.split('. ')[0]! + '.'
    expect(cause.length).toBeLessThanOrEqual(60)
    expect(line).not.toMatch(DASH)
    // The log line is the one it always was.
    expect(textsOf(f)).toContain(`${f.a.name}'s ${f.idea} flopped.`)
    expect(textsOf(f).every((t) => t.length <= 90 || !t.includes('flopped'))).toBe(true)
  })

  it('names a tired owner as the cause, and a thin budget as the cause of a thin budget', () => {
    const tiredSeed = flopSeed((f) => {
      f.g.flags.household = { owner: `${f.g.generation}:${f.g.character.id}`, fatigue: 80 } as Json
    })
    const tired = play(tiredSeed, 0.02, (f) => {
      f.g.flags.household = { owner: `${f.g.generation}:${f.g.character.id}`, fatigue: 80 } as Json
    })
    expect(resultsOf(tired)).toContain(causeLine('tired', tired.idea))
    const f = fixture(seed)
    const idea = ideaAt(f)
    rdOf(f.b).push(project(f, idea, 0.02, { budget: Math.round(normal(f, idea) * 0.5) }))
    yearEnd(f)
    expect(resultsOf(f)).toContain(causeLine('starved', idea))
  })

  it('is booked once for a project: the year-end that decides it leaves the know-how and nothing more on a second call', () => {
    const f = fixture(seed)
    const idea = ideaAt(f)
    const p = project(f, idea, 0.02)
    rdOf(f.b).push(p)
    yearEnd(f)
    const once = JSON.stringify(f.b.knowHow)
    advanceRd(f.g, f.b, f.g.year - 1)
    expect(JSON.stringify(f.b.knowHow)).toBe(once)
  })

  it('teaches a hired CEO\'s company too: a project with no `fx` resolves, banks and writes the same results', () => {
    const f = play(seed, 0.02, (g) => setCompany(g.g, g.b, { manager: 70, quality: 50, scientists: 0, staff: 0, projects: 0 }))
    expect(f.b.knowHow).toBeDefined()
    expect(f.b.rd ?? []).toHaveLength(0)
    expect(textsOf(f)).toContain(`${f.a.name}'s ${f.idea} flopped.`)
  })
})

describe('a win', () => {
  const seed = winSeed()

  it('banks no know-how, adds no key to the company and lifts the owner\'s ambition by the win shift', () => {
    const f = fixture(seed)
    const before = ambitionOf(f.g)
    const idea = ideaAt(f)
    rdOf(f.b).push(project(f, idea, 0.98))
    yearEnd(f)
    expect(f.b.products.some((p) => p.name === idea)).toBe(true)
    expect(f.b.knowHow).toBeUndefined()
    expect(JSON.stringify(f.b)).not.toContain('knowHow')
    expect(readYou(f.g).shift).toBe(WIN_SHIFT)
    expect(ambitionOf(f.g) - before).toBeCloseTo(WIN_SHIFT, 5)
  })

  it('does not lift the ambition of a hired manager\'s company, and says nothing about know-how it does not have', () => {
    const f = play(seed, 0.98, (g) => setCompany(g.g, g.b, { manager: 70, quality: 50, scientists: 0, staff: 0, projects: 0 }))
    expect(f.won).toBe(true)
    expect(readYou(f.g).shift).toBe(0)
    expect(resultsOf(f)).not.toContain('know-how')
  })

  it('names the know-how the company holds on the launch line, when it holds some', () => {
    const f = fixture(seed)
    const idea = ideaAt(f)
    f.b.knowHow = { [rdField(lineInfo(idea, f.b.industry).family)]: 30 }
    rdOf(f.b).push(project(f, idea, 0.98))
    yearEnd(f)
    expect(resultsOf(f)).toContain('Know-how in the field holds at 30')
  })
})

describe('only the player\'s companies bank', () => {
  it('leaves g.flags byte for byte and the company with no know-how when a company with no asset flops', () => {
    const seed = flopSeed()
    const f = fixture(seed)
    const npc = newBiz(f.g, 'restaurant', 'us', f.b.city, { cash: 5_000_000 })
    expect(f.g.assets.some((a) => (a.details as unknown) === npc)).toBe(false)
    const idea = ideaAt(f)
    rdOf(npc).push(project(f, idea, 0.02))
    const flags = JSON.stringify(f.g.flags)
    const queue = f.g.queue.length
    yearEnd(f, npc)
    expect(npc.products.some((p) => p.name === idea)).toBe(false)
    expect(JSON.stringify(f.g.flags)).toBe(flags)
    expect(npc.knowHow).toBeUndefined()
    expect(f.g.queue.length).toBe(queue)
  })

  it('leaves the NPC company\'s win, too: no ambition, no key', () => {
    const seed = winSeed()
    const f = fixture(seed)
    const npc = newBiz(f.g, 'restaurant', 'us', f.b.city, { cash: 5_000_000 })
    rdOf(npc).push(project(f, ideaAt(f), 0.98))
    const flags = JSON.stringify(f.g.flags)
    yearEnd(f, npc)
    expect(npc.products.length).toBe(1)
    expect(JSON.stringify(f.g.flags)).toBe(flags)
  })
})

describe('what is saved', () => {
  it('keeps a default project byte for byte what v5.0.0 saved: no `fx` key at the steady posture with no fatigue', () => {
    const f = fixture(7)
    const idea = ideaAt(f)
    const p = startRd(f.g, f.a, f.b, idea, normal(f, idea))!
    expect(p).not.toBeNull()
    expect('fx' in p).toBe(false)
    expect(Object.keys(p)).toEqual(['id', 'name', 'budget', 'years', 'progress', 'odds', 'boost', 'quality', 'family', 'kind', 'started'])
  })

  it('stores an `fx` when the owner starts it strained (a push, or tired), and it is a valid record that survives a round trip', () => {
    const f = fixture(8)
    const y = readYou(f.g)
    y.posture = 'push'
    y.effective = 'push'
    writeYou(f.g, y)
    f.g.flags.household = { owner: `${f.g.generation}:${f.g.character.id}`, fatigue: 40 } as Json
    const idea = ideaAt(f)
    const p = startRd(f.g, f.a, f.b, idea, normal(f, idea))!
    expect(p.fx).toBeDefined()
    expect(p.fx!.fatigue).toBe(40)
    expect(p.fx!.last).toBe(f.g.year - 1)
    const again = normalizeBiz(JSON.parse(JSON.stringify(f.b)) as Record<string, Json>, f.g.year)
    expect(again.rd?.[0]?.fx).toEqual(p.fx)
  })

  it('drops a damaged `fx` and a damaged `knowHow` on load, and keeps a good one', () => {
    const f = fixture(9)
    const idea = ideaAt(f)
    const raw = JSON.parse(JSON.stringify(f.b)) as Record<string, Json>
    const stored = (fx: Json, knowHow: Json): BizState => normalizeBiz({ ...raw, rd: [{ ...project(f, idea, 0.5), fx } as unknown as Json], knowHow }, f.g.year)
    expect(stored('junk', 'junk').rd?.[0]?.fx).toBeUndefined()
    expect(stored('junk', 'junk').knowHow).toBeUndefined()
    expect(stored({ v: 1, progress: 9, spent: -4, last: 'x' } as Json, { 'rd.fizz': 500, 'bad key': 4 } as Json).knowHow).toEqual({ 'rd.fizz': 100 })
    expect(stored({ v: 1, progress: 0.5, quality: 60, spent: 1000, hours: 0, setbacks: 1, insight: 3, fatigue: 20, last: 2030 } as Json, { 'rd.fizz': 12 } as Json).rd?.[0]?.fx?.setbacks).toBe(1)
  })
})

describe('a quote is a read, and money buys odds, never a lower price', () => {
  it('draws nothing: rdQuote, rdValue and bestRdIdea leave g.rng where it was', () => {
    const f = fixture(10)
    const idea = ideaAt(f)
    expect(noDraw(f.g, () => rdQuote(f.g, f.b, idea, normal(f, idea)))).toBe(true)
    expect(noDraw(f.g, () => rdValue(f.g, f.b, idea, normal(f, idea)))).toBe(true)
    expect(noDraw(f.g, () => bestRdIdea(f.g, f.b, classicIdeas(f.g, f.b).slice(0, 4), 10_000_000))).toBe(true)
  })

  it('reads a deep-frozen game: it writes nothing', () => {
    const f = fixture(11)
    const idea = ideaAt(f)
    const budget = normal(f, idea)
    const want = rdQuote(f.g, f.b, idea, budget)
    deepFreeze(f.g)
    expect(rdQuote(f.g, f.b, idea, budget)).toEqual(want)
  })

  it('never lowers the price and never passes the budget ceiling: 100 times the cash, the sales and the sites change nothing of the cost', () => {
    const f = fixture(12)
    const idea = ideaAt(f)
    const cost = normal(f, idea)
    const q1 = rdQuote(f.g, f.b, idea, cost * RD_MAX)
    f.b.cash *= 100
    f.b.outlets[0]!.count *= 100
    f.g.character.money *= 100
    expect(rdCost(f.b, idea)).toBe(cost)
    expect(rdQuote(f.g, f.b, idea, cost * RD_MAX).cost).toBe(cost)
    for (const times of [1, 4, 100, 10_000]) {
      const q = rdQuote(f.g, f.b, idea, cost * times * rdCrowding(f.b))
      expect(q.k).toBeLessThanOrEqual(RD_MAX)
      expect(q.odds).toBeLessThanOrEqual(0.95)
      expect(q.quality).toBeLessThanOrEqual(97)
      expect(q.years).toBeGreaterThanOrEqual(1)
    }
    expect(q1.k).toBeLessThanOrEqual(RD_MAX)
  })

  it('buys odds, speed and quality with the budget, with the diminishing returns it always had', () => {
    const f = fixture(13)
    const idea = ideaAt(f)
    const cost = normal(f, idea)
    const q = [0.5, 1, 2, 4].map((k) => rdQuote(f.g, f.b, idea, cost * k))
    for (let i = 1; i < q.length; i++) {
      expect(q[i]!.odds).toBeGreaterThanOrEqual(q[i - 1]!.odds)
      expect(q[i]!.years).toBeLessThanOrEqual(q[i - 1]!.years)
      expect(q[i]!.quality).toBeGreaterThan(q[i - 1]!.quality)
    }
    expect(q[3]!.quality - q[2]!.quality).toBeLessThan(q[2]!.quality - q[1]!.quality)
  })
})

describe('the adapter is a leaf, and the old formulas are gone from the wrapper', () => {
  it('rd-effort.ts imports nothing from the import cycle and no dash character, and rd.ts calls quote and not the old exponent', async () => {
    const g = await readImportGraph(ROOT)
    const inCycle = new Set(cycleComponents(g).flat())
    expect(g.has(ADAPTER)).toBe(true)
    expect(inCycle.has(ADAPTER)).toBe(false)
    for (const to of g.get(ADAPTER) ?? []) expect(inCycle.has(to), `${ADAPTER} imports ${to}, a member of an import cycle`).toBe(false)
    expect([...(g.get('src/game/business/rd.ts') ?? [])]).toContain(ADAPTER)
    expect(readFileSync(join(ROOT, ADAPTER), 'utf8')).not.toMatch(DASH)
    const rd = readFileSync(join(ROOT, 'src/game/business/rd.ts'), 'utf8')
    expect(rd).toMatch(/\bquote\(/)
    expect(rd).not.toContain('Math.pow(k, -0.4)')
    expect(rd).not.toContain('Math.sqrt(k)')
  })
})
