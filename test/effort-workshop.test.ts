// R3-M8 (C.3): the Workshop's `buildOdds` and `brainstormOdds` run on the effort engine's `quote`, and a kaboom teaches.
//
//   on quote   both odds functions ask `quote` (spied), for the idea's category and for the brainstorm, as the player
//   parity     at the default actor (ambition 50, steady, rested, no know-how) every number is v5.0.0's: the oracle rows
//              (test/fixtures/effort-parity.json) within 1 point, the lifecycle exact, and a copy of the old formulas bit for bit
//   teaching   a kaboom banks know-how in the idea's category: the next build of it blows up less (by more than 0 and at most 15
//              points, never under the 1% floor), another category's odds do not move, and the reasons name it
//   engine     tiredness costs odds, a bold plan widens the spread and a cautious one narrows it; each is a labelled line
//   purity     nothing here draws: buildOdds, brainstormOdds and buildWhy leave g.rng alone, read a deep-frozen state, and the two
//              draws of a build keep their order (u, then the quality or the health loss, then the text pick)
//   leaf       workshop/effort.ts imports types and the engine only, draws nothing and has no dash
// No pinned seed: every life is makeTestGame's own, and a kaboom is forced by scanning the rng state, not by a seed.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { KNOW_ODDS_MAX } from '../src/game/effort/limits'
import { ambitionOf, readYou, writeYou } from '../src/game/effort/persona'
import { nextRandom, rand } from '../src/game/rng'
import type { GameState } from '../src/game/types'
import { APPROACHES, brainstormOdds, buildOdds, buildWhy, resolveBuild, type Approach } from '../src/game/workshop/build'
import { IDEAS, type IdeaDef } from '../src/game/workshop/catalog'
import { addIdea, mutWorkshop, readWorkshop } from '../src/game/workshop/notebook'
import { expectLifecycle, expectParity, probe } from './effort-parity-kit'
import { deepFreeze } from './fuzz-kit'
import { layerOf } from './layer-kit'
import { makeTestGame } from './helpers'

// The spy: every quote the Workshop asks for is recorded, and the real one answers.
const seen = vi.hoisted(() => ({ calls: [] as { field: string; who: unknown; base: unknown }[] }))
vi.mock('../src/game/effort/engine', async (importOriginal) => {
  const m = await importOriginal<typeof import('../src/game/effort/engine')>()
  return {
    ...m,
    quote: (...args: Parameters<typeof m.quote>) => {
      seen.calls.push({ field: args[1].field, who: args[2].who, base: args[2].base })
      return m.quote(...args)
    },
  }
})

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const TIMEOUT = 120_000
const DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)

/** A US inventor at 30 in 2026 (a genius with `genius`), at ambition exactly 50: the default actor. */
function inventor(opts: { genius?: boolean } = {}): GameState {
  const g = makeTestGame(11, { age: 30, money: 5_000_000, talents: opts.genius ? ['Inventor'] : [], countryId: 'us' })
  g.year = 2026
  g.lifeId = 'ws-effort'
  atAmbition50(g, opts.genius === true)
  return g
}

/** Willpower and discipline so that ambition is exactly 50: 55 and 55, or 50 and 50 with the Inventor talent's 4. */
function atAmbition50(g: GameState, genius: boolean): void {
  g.character.hidden.willpower = genius ? 50 : 55
  g.character.hidden.discipline = genius ? 50 : 55
}

function give(g: GameState, def: IdeaDef): void {
  expect(addIdea(g, mutWorkshop(g), def)).toBe(true)
}

const idea = (def: IdeaDef) => ({ kind: 'idea' as const, id: def.id })
const ofCat = (cat: string, d: number): IdeaDef => IDEAS.find((x) => x.cat === cat && x.d === d) ?? IDEAS.find((x) => x.cat === cat)!
const odds = (g: GameState, def: IdeaDef, ap: Approach = 'bold', builds = 0) => buildOdds(g, readWorkshop(g), def, builds, ap)

/** Moves the rng to a state whose next draw is a kaboom for any approach (a draw under 0.4%, below every floor). */
function forceKaboom(g: GameState): void {
  let s = g.rng
  while (nextRandom(s)[0] >= 0.004) s += 1
  g.rng = s
}

/** One kaboom in a fresh year, with the body, the purse and the inventing skill as they were (so only know-how moves the odds). */
function blowUp(g: GameState, def: IdeaDef, ap: Approach = 'bold') {
  const skill = readWorkshop(g).skill
  g.yearActions = {}
  g.character.stats.health = 100
  g.character.money = 5_000_000
  forceKaboom(g)
  const r = resolveBuild(g, idea(def), ap)
  expect(r?.result).toBe('kaboom')
  mutWorkshop(g).skill = skill
  return r!
}

const know = (g: GameState, cat: string): number => readYou(g).fieldK[`workshop.${cat}`] ?? 0

// --- v5.0.0, copied: the table and the formulas of build.ts before the engine ---------------------------------------------------
const OLD: Record<Approach, { cost: number; shift: number; spread: number; kaboom: number }> = {
  safe: { cost: 1, shift: 0, spread: 16, kaboom: 0.05 },
  bold: { cost: 1, shift: 4, spread: 44, kaboom: 0.14 },
  cheap: { cost: 0.4, shift: -12, spread: 20, kaboom: 0.12 },
}
const r4 = (x: number): number => Math.round(x * 10_000) / 10_000

function oldBuild(skill: number, smarts: number, genius: boolean, d: number, builds: number, ap: Approach) {
  const a = OLD[ap]
  const center = 18 + skill * 0.55 + smarts * 0.15 + (genius ? 20 : 0) - (d - 1) * 10 + Math.min(9, builds * 3) + a.shift
  const kaboom = Math.max(0.01, Math.min(0.6, a.kaboom + (d - 1) * 0.03 - skill * 0.0008)) * (genius ? 0.5 : 1)
  const low = center - a.spread / 2
  const high = center + a.spread / 2
  const master = (1 - kaboom) * Math.max(0, Math.min(1, (high - 88) / a.spread))
  return { kaboom: r4(kaboom), master: r4(master), low, high }
}
const oldBrainstorm = (skill: number, smarts: number, genius: boolean): number =>
  Math.round(Math.max(0.1, Math.min(0.95, 0.2 + smarts / 250 + (genius ? 0.35 : 0) + skill / 500)) * 100) / 100

describe('buildOdds and brainstormOdds run on quote', () => {
  it('a build asks for a quote in the idea\'s category, as the player, with today\'s works-odds as the base', () => {
    const g = inventor()
    const def = ofCat('home', 4)
    seen.calls.length = 0
    odds(g, def, 'bold')
    expect(seen.calls.length).toBeGreaterThan(0)
    expect(seen.calls.every((c) => c.field === 'workshop.home')).toBe(true)
    expect(seen.calls[0].who).toBe('you')
    expect(seen.calls[0].base).toBeCloseTo(1 - OLD.bold.kaboom - 3 * 0.03, 10)
  })

  it('a brainstorm asks for a quote of its own, as the player', () => {
    const g = inventor()
    seen.calls.length = 0
    brainstormOdds(g, readWorkshop(g))
    expect(seen.calls.length).toBeGreaterThan(0)
    expect(seen.calls.every((c) => c.field === 'workshop.brainstorm')).toBe(true)
    expect(seen.calls[0].who).toBe('you')
  })

  it('every category has its own field, and a field is a valid know-how key', () => {
    const g = inventor()
    seen.calls.length = 0
    for (const cat of ['gadget', 'home', 'toy', 'health', 'transport', 'energy', 'computing', 'food', 'fashion', 'weird']) odds(g, ofCat(cat, 2), 'safe')
    expect(new Set(seen.calls.map((c) => c.field)).size).toBe(10)
    for (const c of seen.calls) expect(c.field).toMatch(/^workshop\.[a-z]+$/)
  })
})

describe('parity with v5.0.0 at the default actor', () => {
  it('the grid is played by an actor whose ambition is exactly 50, genius or not', { timeout: TIMEOUT }, () => {
    const rows = probe('workshop', (pt) => ({ extra: { ambition: ambitionOf(pt.g) } }))
    expect(rows.length).toBeGreaterThanOrEqual(1_080)
    expect(rows.every((r) => r.extra?.ambition === 50)).toBe(true)
  })

  it('kaboom, master, low, high, brainstormOdds, skillGain and buildCost are the recorded numbers (within 1 point, years exact)', { timeout: TIMEOUT }, () => {
    expectParity('workshop')
  })

  it('the scripted inventor year (three builds, two brainstorms) leaves g.rng and the notebook as recorded', { timeout: TIMEOUT }, () => {
    expectLifecycle('workshop')
  })

  it('and bit for bit against a copy of the old formulas, over skills, smarts, genius, difficulty, builds and approaches', { timeout: TIMEOUT }, () => {
    let n = 0
    for (const genius of [false, true]) {
      const g = inventor({ genius })
      for (const smarts of [0, 40, 70, 95, 100]) {
        g.character.stats.smarts = smarts
        for (const skill of [0, 7.3, 22, 35.5, 50, 63.9, 90, 100]) {
          const ws = { ...readWorkshop(g), skill }
          expect(brainstormOdds(g, ws), `brainstorm ${genius} ${smarts} ${skill}`).toBe(oldBrainstorm(skill, smarts, genius))
          for (const d of [1, 2, 3, 4, 5]) {
            const def = IDEAS.find((x) => x.d === d)!
            for (const builds of [0, 1, 2, 3, 6]) {
              for (const ap of ['safe', 'bold', 'cheap'] as Approach[]) {
                expect(buildOdds(g, ws, def, builds, ap), `${genius} ${smarts} ${skill} ${d} ${builds} ${ap}`).toEqual(oldBuild(skill, smarts, genius, d, builds, ap))
                n++
              }
            }
          }
        }
      }
    }
    expect(n).toBe(2 * 5 * 8 * 5 * 5 * 3)
  })
})

describe('buildWhy at the default actor', () => {
  it('names skill and difficulty, adds up to what they do to the approach\'s own odds, and holds no noise', () => {
    for (const genius of [false, true]) {
      const g = inventor({ genius })
      for (const skill of [0, 3.6, 22, 50, 90]) {
        const ws = { ...readWorkshop(g), skill }
        for (const d of [1, 2, 3, 4, 5]) {
          for (const ap of ['safe', 'bold', 'cheap'] as Approach[]) {
            const why = buildWhy(g, ws, IDEAS.find((x) => x.d === d)!, 1, ap)
            const kaboom = Math.max(0.01, Math.min(0.6, OLD[ap].kaboom + (d - 1) * 0.03 - skill * 0.0008)) * (genius ? 0.5 : 1)
            const total = why.reduce((a, r) => a + r.pts, 0)
            expect(total, `${genius} ${skill} ${d} ${ap}`).toBeCloseTo((OLD[ap].kaboom - kaboom) * 100, 6)
            for (const r of why) expect(Math.abs(r.pts), `${genius} ${skill} ${d} ${ap} ${r.key}`).toBeGreaterThan(1e-6)
            expect(why.every((r) => r.key === 'team' || r.key === 'hard')).toBe(true)
            expect(why.find((r) => r.key === 'hard')?.pts ?? 0).toBeCloseTo(-(d - 1) * 3 * (genius ? 0.5 : 1), 9)
          }
        }
      }
    }
  })
})

describe('a kaboom teaches', () => {
  const home = ofCat('home', 4)
  const toy = ofCat('toy', 4)

  it('the next build of that category blows up less, by more than 0 and at most 15 points, and another category does not move', () => {
    const g = inventor()
    give(g, home)
    give(g, toy)
    const before = odds(g, home)
    const other = odds(g, toy)
    expect(know(g, 'home')).toBe(0)
    blowUp(g, home)
    const after = odds(g, home)
    expect(know(g, 'home')).toBeGreaterThan(0)
    const drop = before.kaboom - after.kaboom
    expect(drop).toBeGreaterThan(0)
    expect(drop).toBeLessThanOrEqual(KNOW_ODDS_MAX / 100 + 1e-9)
    expect(odds(g, toy)).toEqual(other)
  })

  it('the reasons name it, and the quality is lifted by know-how, a little', () => {
    const g = inventor()
    give(g, home)
    const line = (rs: readonly { key: string; pts: number }[], key: string) => rs.find((r) => r.key === key)?.pts
    expect(line(buildWhy(g, readWorkshop(g), home, 0, 'bold'), 'know')).toBeUndefined()
    const q0 = odds(g, home)
    blowUp(g, home)
    const why = buildWhy(g, readWorkshop(g), home, 0, 'bold')
    expect(line(why, 'know')).toBeGreaterThan(0)
    expect(why.find((r) => r.key === 'know')?.label).toBe('know-how')
    const q1 = odds(g, home)
    expect(q1.low - q0.low).toBeGreaterThanOrEqual(0)
    expect(q1.low - q0.low).toBeLessThanOrEqual(3)
  })

  it('the notice for the kaboom says what it taught, and stays short', () => {
    const g = inventor()
    give(g, home)
    blowUp(g, home)
    const note = g.queue.filter((m) => m.kind === 'notice').at(-1)
    expect(note && 'text' in note ? note.text : '').toMatch(/The failure still taught you the field: know-how \d+\./)
    expect(DASH.test(JSON.stringify(g.queue))).toBe(false)
  })

  it('each build is its own piece of work: a second kaboom in the same year banks again, less than the first', () => {
    const g = inventor()
    give(g, home)
    forceKaboom(g)
    expect(resolveBuild(g, idea(home), 'cheap')?.result).toBe('kaboom')
    const one = know(g, 'home')
    forceKaboom(g)
    expect(resolveBuild(g, idea(home), 'cheap')?.result).toBe('kaboom')
    const two = know(g, 'home')
    expect(one).toBeGreaterThan(0)
    expect(two).toBeGreaterThan(one)
    expect(two - one).toBeLessThan(one)
  })

  it('60 kabooms in a row never take more than 15 points off the blow-up chance and never go under the floor', () => {
    const g = inventor()
    give(g, home)
    const flat = odds(g, home, 'bold').kaboom
    let last = flat
    for (let i = 0; i < 60; i++) {
      blowUp(g, home, 'cheap')
      const now = odds(g, home, 'bold').kaboom
      expect(now).toBeLessThanOrEqual(last + 1e-9)
      expect(flat - now).toBeLessThanOrEqual(KNOW_ODDS_MAX / 100 + 1e-9)
      expect(now).toBeGreaterThanOrEqual(0.01)
      last = now
    }
    expect(know(g, 'home')).toBeLessThanOrEqual(100)
    expect(flat - last).toBeGreaterThan(0.1)
  })

  it('a safe build of an easy idea reaches the 1% floor and stops there (half of it for a genius)', () => {
    const easy = ofCat('gadget', 1)
    for (const genius of [false, true]) {
      const g = inventor({ genius })
      give(g, easy)
      for (let i = 0; i < 40; i++) blowUp(g, easy, 'safe')
      const k = odds(g, easy, 'safe').kaboom
      expect(k).toBeCloseTo(genius ? 0.005 : 0.01, 6)
    }
  })

  it('a win banks no know-how, and leaves the maker a little more driven (0.4 of a point, the engine\'s own)', () => {
    const easy = ofCat('gadget', 1)
    const g = inventor()
    give(g, easy)
    const a0 = ambitionOf(g)
    let wins = 0
    for (let i = 0; i < 30 && wins === 0; i++) {
      g.yearActions = {}
      const k0 = know(g, 'gadget')
      const r = resolveBuild(g, idea(easy), 'safe')
      if (r?.result === 'kaboom') continue
      wins++
      expect(know(g, 'gadget')).toBe(k0)
    }
    expect(wins).toBe(1)
    expect(ambitionOf(g) - a0).toBeCloseTo(0.4, 6)
  })
})

describe('what the engine adds past the default actor', () => {
  const def = ofCat('home', 4)

  it('a tired inventor blows up more and brainstorms worse, and the reasons say tired', () => {
    const rested = inventor()
    const tired = inventor()
    tired.flags.household = { owner: `${tired.generation}:${tired.character.id}`, fatigue: 80 }
    const a = odds(rested, def)
    const b = odds(tired, def)
    expect(b.kaboom).toBeGreaterThan(a.kaboom)
    expect(brainstormOdds(tired, readWorkshop(tired))).toBeLessThan(brainstormOdds(rested, readWorkshop(rested)))
    expect(buildWhy(tired, readWorkshop(tired), def, 0, 'bold').find((r) => r.key === 'tired')?.pts).toBeLessThan(0)
    expect(buildWhy(rested, readWorkshop(rested), def, 0, 'bold').some((r) => r.key === 'tired')).toBe(false)
  })

  it('an ambitious plan spreads wider and blows up more, a cautious one spreads narrower and blows up less', () => {
    const calm = inventor()
    const driven = inventor()
    const lazy = inventor()
    driven.character.hidden.willpower = 90
    driven.character.hidden.discipline = 90
    lazy.character.hidden.willpower = 10
    lazy.character.hidden.discipline = 10
    expect(ambitionOf(driven)).toBeGreaterThan(50)
    expect(ambitionOf(lazy)).toBeLessThan(50)
    const range = (g: GameState) => {
      const o = odds(g, def, 'safe')
      return o.high - o.low
    }
    expect(range(calm)).toBe(APPROACHES.safe.spread)
    expect(range(driven)).toBeGreaterThan(range(calm))
    expect(range(lazy)).toBeLessThan(range(calm))
    expect(odds(driven, def, 'safe').kaboom).toBeGreaterThan(odds(calm, def, 'safe').kaboom)
    expect(odds(lazy, def, 'safe').kaboom).toBeLessThan(odds(calm, def, 'safe').kaboom)
  })

  it('pushing widens a driven maker\'s spread further than a steady pace does', () => {
    const steady = inventor()
    const push = inventor()
    for (const g of [steady, push]) {
      g.character.hidden.willpower = 75
      g.character.hidden.discipline = 75
    }
    const y = readYou(push)
    y.posture = 'push'
    y.effective = 'push'
    writeYou(push, y)
    const range = (g: GameState) => {
      const o = odds(g, def, 'safe')
      return o.high - o.low
    }
    expect(range(push)).toBeGreaterThan(range(steady))
  })

  it('money buys no odds: the same inventor, rich or poor, has the same odds and the same lines', () => {
    const poor = inventor()
    poor.character.money = 0
    const rich = inventor()
    rich.character.money = 5_000_000_000
    expect(buildWhy(poor, readWorkshop(poor), def, 0, 'bold')).toEqual(buildWhy(rich, readWorkshop(rich), def, 0, 'bold'))
    expect(odds(poor, def)).toEqual(odds(rich, def))
  })
})

describe('purity', () => {
  it('buildOdds, brainstormOdds and buildWhy leave g.rng alone', () => {
    const g = inventor({ genius: true })
    const ws = readWorkshop(g)
    const before = g.rng
    for (const d of [1, 3, 5]) for (const ap of ['safe', 'bold', 'cheap'] as Approach[]) {
      odds(g, IDEAS.find((x) => x.d === d)!, ap, 2)
      buildWhy(g, ws, IDEAS.find((x) => x.d === d)!, 2, ap)
    }
    brainstormOdds(g, ws)
    expect(g.rng).toBe(before)
  })

  it('they read a deep-frozen state, and the same answer twice', () => {
    const g = inventor()
    give(g, ofCat('toy', 3))
    blowUp(g, ofCat('toy', 3))
    const ws = readWorkshop(g)
    const frozen = deepFreeze(structuredClone(g))
    const def = ofCat('toy', 3)
    expect(buildOdds(frozen, ws, def, 1, 'bold')).toEqual(buildOdds(g, ws, def, 1, 'bold'))
    expect(buildOdds(frozen, ws, def, 1, 'bold')).toEqual(buildOdds(frozen, ws, def, 1, 'bold'))
    expect(brainstormOdds(frozen, ws)).toBe(brainstormOdds(g, ws))
    expect(buildWhy(frozen, ws, def, 1, 'bold')).toEqual(buildWhy(g, ws, def, 1, 'bold'))
  })

  it('a build draws three numbers in today\'s order, for a kaboom and for a win: the quote and the booking add none', () => {
    const redraw = (start: number): number => {
      const probe = { rng: start } as GameState
      for (let i = 0; i < 3; i++) rand(probe)
      return probe.rng
    }
    const g = inventor()
    give(g, ofCat('gadget', 1))
    forceKaboom(g)
    let start = g.rng
    expect(resolveBuild(g, idea(ofCat('gadget', 1)), 'safe')?.result).toBe('kaboom')
    expect(g.rng).toBe(redraw(start))
    let result = ''
    for (let i = 0; i < 20 && result !== 'works'; i++) {
      g.yearActions = {}
      start = g.rng
      result = resolveBuild(g, idea(ofCat('gadget', 1)), 'safe')?.result ?? ''
      expect(g.rng, `build ${i}`).toBe(redraw(start))
    }
    expect(result).toBe('works')
  })
})

describe('the adapter is a leaf', () => {
  const text = readFileSync(join(ROOT, 'src/game/workshop/effort.ts'), 'utf8')
  const imports = [...text.matchAll(/^import (?:type )?[^'\n]*from '([^']+)'/gm)].map((m) => m[1])

  it('imports the engine and types only, and sits in the domain layer', () => {
    expect(layerOf('src/game/workshop/effort.ts')).toBe(3)
    expect(imports.sort()).toEqual(['../effort/engine', '../effort/task', '../effort/types', '../types', './catalog'])
  })

  it('draws nothing, writes nothing and has no dash', () => {
    expect(text).not.toMatch(/\b(rand|randInt|randFloat|chance|pick|weightedPick|shuffle)\(|Math\.random|g\.flags|g\.character\.\w+\s*=|spend\(|notice\(|log\(/)
    expect(DASH.test(text)).toBe(false)
  })

})
