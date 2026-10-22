// R3-M7 (C.3): the studio engines on the Effort engine. The only labor-driven build runs on `quote` and `step`: its pace comes from the
// quote (years, with the owner's ambition and know-how in them), the team ratio, the operations and the open share stay the studio's own,
// no engine ever fails, and a finished engine teaches the next one. What this file pins:
//   engine     a developing engine calls the core quote; the adapter is a leaf and the old inline formulas are gone from the wrapper
//   parity     at the default actor (ambition 50, steady, no know-how, no fatigue) the studio grid of the oracle (recorded on v5.0.0) holds,
//              the lifecycle is exact, and so is a studio run through its asset (the owner-run path) against one run without it
//   default    no engine ever fails or sets back: no draw from the risk stream, no `fx` on the engine, no team change
//   push       only an owner-run studio at the posture push can set an engine back: one draw from outcomeStream 'effort.risk' per engine
//              and year, the year's gain cut to half, never the stored progress and never the team, and never a draw from g.rng
//   teaching   a finished engine banks know-how in 'studio.engine' (company map), the next engine builds a little faster (at most 15%),
//              another field is untouched, a hired CEO's studio banks too and is never driven, and a year is booked once
//   saved      a default engine saves what v5.0.0 saved; a setback stores a valid, bounded `fx`; a damaged one is dropped on load
//   reads      a quote and the pace words draw nothing, read a deep-frozen game, and never lower a price: 100 times the cash, the staff and
//              the sales change nothing of the cost; the pace stays under the engine's ceilings
// No pinned seed: every life is made with makeTestGame's own arguments, and the setback lives are found by search over the life id.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'

const spy = vi.hoisted(() => ({ quotes: 0, luck: [] as { tag: string; year: number; id: string }[] }))
vi.mock('../src/game/effort/engine', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/game/effort/engine')>()
  return {
    ...real,
    quote: (...args: Parameters<typeof real.quote>) => {
      spy.quotes += 1
      return real.quote(...args)
    },
  }
})
vi.mock('../src/game/kernel/streams', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/game/kernel/streams')>()
  return {
    ...real,
    outcomeStream: (...args: Parameters<typeof real.outcomeStream>) => {
      spy.luck.push({ tag: String(args[1]), year: Number(args[2]), id: String(args[3] ?? '') })
      return real.outcomeStream(...args)
    },
  }
})

import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { ENGINE_TIERS, normalizeEngines, type EngineTier, type StudioEngine } from '../src/game/business/gamestudio-engine-state'
import { engineDevelopmentBlock, simulateStudioEngines, startStudioEngine } from '../src/game/business/gamestudio-engines'
import { assignedDevs, normalizeStudio } from '../src/game/business/gamestudio-state'
import { saveStudio, simulateStudioYear, studioNodes, studioOf } from '../src/game/business/gamestudio'
import {
  ENGINE_FIELD,
  SETBACK_KEEP,
  SETBACK_MAX,
  engineActor,
  engineOutcome,
  enginePace,
  engineProgress,
  engineQuality,
  engineQuote,
  engineTask,
  setbackChance,
  setbackLuck,
} from '../src/game/business/studio-effort'
import { bizOf } from '../src/game/business/state'
import { ownerRuns } from '../src/game/business/research-effort'
import { RHO_MAX } from '../src/game/effort/limits'
import { newFx } from '../src/game/effort/fx'
import { knowHowOf } from '../src/game/effort/knowhow'
import { readYou, writeYou } from '../src/game/effort/persona'
import type { GameState, Json, MenuGroup, MenuNode } from '../src/game/types'
import { cycleComponents, readImportGraph } from './arch-kit'
import { expectLifecycle, expectParity, neutralAmbition } from './effort-parity-kit'
import { deepFreeze } from './fuzz-kit'
import { noDraw } from './lab-kit'
import { makeTestGame } from './helpers'
import { STREAM_SLICES } from './stream-tap'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)
const ADAPTER = 'src/game/business/studio-effort.ts'
const operation = { employees: 60, wage: 50_000, quality: 90, leadership: 90, brand: 80, operations: 1, open: 1, market: 1 }

/** A studio of the player's, run by its owner at the default ambition (50). */
function studio(life = 'studio-life') {
  const g = makeTestGame(1, { age: 35, money: 10_000_000, countryId: 'us', talents: [] })
  g.lifeId = life
  const a = createBusinessAsset(g, 'Aurora Games', newBiz(g, 'gameStudio', 'us', 'Chicago', { cash: 100_000_000, employees: 60, quality: 90, brand: 80 }), 1_000_000)
  g.assets.push(a)
  neutralAmbition(g)
  return { g, a, b: bizOf(g, a) }
}
type Studio = ReturnType<typeof studio>

/** The owner at the posture push; `driven` also takes willpower and discipline to the top (ambition 100). */
function push(g: GameState, driven = false): void {
  const y = readYou(g)
  y.posture = 'push'
  y.effective = 'push'
  writeYou(g, y)
  if (driven) {
    g.character.hidden.willpower = 100
    g.character.hidden.discipline = 100
  }
}

/** The engine under construction, after `startStudioEngine` has paid for it. */
function building(f: Studio, tier: EngineTier = 'professional', name = 'Aurora Engine') {
  startStudioEngine(f.g, f.a.id, tier, name)
  const st = studioOf(f.a)
  return { st, x: st.engines[st.engines.length - 1]! }
}

/** One year of the engines of `st`, run for `asset` (the owner-run path) or for no asset (what the oracle runs). */
function year(f: Studio, st: ReturnType<typeof studioOf>, y: number, asset = true) {
  return simulateStudioEngines(f.g, st, y, asset ? { ...operation, asset: f.a } : operation)
}

const engineQuoteOf = (f: Studio, tier: EngineTier = 'professional') => engineQuote(f.g, tier, engineActor(f.g, ownerRuns(f.g, f.b)), f.b.knowHow)

/** The first life id in which the stream says "set back" for engine1 in `y` at the chance the owner's quote has, found by search. */
function setbackLife(y: number, driven: boolean): string {
  for (let i = 0; i < 2000; i++) {
    const f = studio(`push-${i}`)
    push(f.g, driven)
    const q = engineQuoteOf(f)
    if (setbackLuck(f.g, y, 'engine1') < setbackChance(q, engineActor(f.g, true))) return f.g.lifeId
  }
  throw new Error('no life with a setback found')
}

/** The first life id in which the stream says "carry on" for engine1 in `y` (every life but about 1 in 10). */
function quietLife(y: number, driven: boolean): string {
  for (let i = 0; i < 2000; i++) {
    const f = studio(`push-${i}`)
    push(f.g, driven)
    const q = engineQuoteOf(f)
    if (!(setbackLuck(f.g, y, 'engine1') < setbackChance(q, engineActor(f.g, true)))) return f.g.lifeId
  }
  throw new Error('no quiet life found')
}

const risk = (): number => spy.luck.filter((c) => c.tag === 'effort.risk').length

/** A node by id, searched through the menus. */
function find(g: GameState, nodes: MenuNode[], id: string): MenuNode | undefined {
  for (const n of nodes) {
    if (n.id === id) return n
    if (n.type === 'menu') {
      const hit = find(g, n.children(g), id)
      if (hit) return hit
    }
  }
  return undefined
}

describe('the studio engine is on the engine', () => {
  it('calls the core quote for a developing engine, and the quote it calls is the task of its tier', () => {
    const f = studio()
    const { st, x } = building(f)
    const before = spy.quotes
    year(f, st, f.g.year)
    expect(spy.quotes).toBeGreaterThan(before)
    expect(x.stage).toBe('dev')
    const t = engineTask('professional')
    expect(t.field).toBe(ENGINE_FIELD)
    expect(t.baseYears).toBe(2)
    expect(t.cost).toBe(60_000)
    expect(t.kmax).toBe(1)
    expect(t.knowYears).toBe(0.15)
    expect(t.quality).toBeNull()
    for (const tier of ENGINE_TIERS) {
      const task = engineTask(tier.id)
      expect([task.baseYears, task.cost]).toEqual([tier.years, tier.research])
    }
  })

  it('has the leaf adapter and nothing of the old formula in the wrapper', async () => {
    const g = await readImportGraph(ROOT)
    const inCycle = new Set(cycleComponents(g).flat())
    expect(g.has(ADAPTER)).toBe(true)
    expect(inCycle.has(ADAPTER)).toBe(false)
    for (const to of g.get(ADAPTER) ?? []) expect(inCycle.has(to), `${ADAPTER} imports ${to}, a member of an import cycle`).toBe(false)
    expect([...(g.get('src/game/business/gamestudio-engines.ts') ?? [])]).toContain(ADAPTER)
    expect(readFileSync(join(ROOT, ADAPTER), 'utf8')).not.toMatch(DASH)
    const wrapper = readFileSync(join(ROOT, 'src/game/business/gamestudio-engines.ts'), 'utf8')
    expect(wrapper).not.toContain('100 / tier.years')
    expect(wrapper).not.toContain('Math.pow(ratio, .8)')
    expect(wrapper).not.toContain('30 + opts.quality')
    expect(readFileSync(join(ROOT, ADAPTER), 'utf8')).toMatch(/\bquote\(/)
  })

  it('writes the studio risk stream down in the tap table, driven, with the slices it can reach', () => {
    const row = STREAM_SLICES['effort.risk']
    expect(row).toBeDefined()
    expect(row!.driven).toBe(true)
    expect(row!.idle).toBeFalsy()
    expect(row!.slices).toContain('assets')
    expect(row!.slices).not.toContain('rng')
  })
})

describe('parity with v5.0.0 at the default actor', () => {
  it('every row of the studio grid of the oracle holds within a point, with the price exact', () => {
    expectParity('studio')
  })

  it('an engine built to its end leaves the same years, progress, quality, spend, license luck and g.rng', () => {
    expectLifecycle('studio')
  })

  it.each(ENGINE_TIERS)('runs a $label through its asset (the owner-run path) exactly as it runs without one', (tier) => {
    const drawn = risk()
    const a = studio()
    const b = studio()
    const one = building(a, tier.id)
    const two = building(b, tier.id)
    for (let i = 0; i < tier.years + 2; i++) {
      const r1 = year(a, one.st, a.g.year + i, false)
      const r2 = year(b, two.st, b.g.year + i, true)
      // The owner-run studio says what the finished engine taught, after the line the oracle's run has; everything else is the same.
      expect({ ...r2, notes: r2.notes.slice(0, r1.notes.length) }).toEqual(r1)
      expect(r2.notes.length - r1.notes.length).toBe(r1.notes.length > 0 ? 1 : 0)
      expect(two.st.engines).toEqual(one.st.engines)
    }
    expect(one.st.engines[0]!.stage).toBe('ready')
    expect(b.g.rng).toBe(a.g.rng)
    expect(risk()).toBe(drawn)
  })

  it('keeps the first year of every tier at 100 over its years, at a team of the tier, and quality by the old formula', () => {
    for (const tier of ENGINE_TIERS) {
      const f = studio()
      const { st, x } = building(f, tier.id)
      year(f, st, f.g.year)
      expect(x.progress).toBe(100 / tier.years)
      expect(x.quality).toBe(Math.min(98, Math.max(20, 30 + 90 * 0.45 + 90 * 0.2 + Math.min(10, 1 * 5))))
    }
  })

  it('uses the old quality formula and the old team curve for any team: ratio to the power .8, never past 3', () => {
    expect(engineQuality(90, 90, 1)).toBe(93.5)
    expect(engineQuality(0, 0, 0)).toBe(30)
    expect(engineQuality(1000, 1000, 9)).toBe(98)
    expect(engineQuality(-1000, -1000, 0)).toBe(20)
    const f = studio()
    const q = engineQuoteOf(f)
    expect(engineProgress(q, 0, 1, 1)).toBe(0)
    expect(engineProgress(q, 0.5, 1, 1)).toBe((100 / 2) * Math.pow(0.5, 0.8))
    expect(engineProgress(q, 3, 1.2, 0.5)).toBe((100 / 2) * Math.pow(3, 0.8) * 1.2 * 0.5)
    expect(engineProgress(q, 99, 1, 1)).toBe(engineProgress(q, 3, 1, 1))
  })
})

describe('no engine fails by default', () => {
  it('never draws from the risk stream, never stores an fx and never loses the team, at the steady posture whatever the ambition', () => {
    const drawn = risk()
    for (const driven of [false, true]) {
      for (const tier of ENGINE_TIERS) {
        const f = studio(`quiet-${tier.id}-${driven}`)
        if (driven) {
          f.g.character.hidden.willpower = 100
          f.g.character.hidden.discipline = 100
        }
        const { st, x } = building(f, tier.id)
        const team = x.team
        for (let i = 0; i < 6 && x.stage === 'dev'; i++) {
          year(f, st, f.g.year + i)
          if (x.stage === 'dev') expect(x.team).toBe(team)
          expect(x.fx).toBeUndefined()
        }
        expect(x.stage).toBe('ready')
        expect(x.fx).toBeUndefined()
      }
    }
    expect(risk()).toBe(drawn)
  })

  it('has a quote that says it works whoever builds and whatever they know: odds 1, no hit, no line of reasons', () => {
    const f = studio()
    const quotes = [engineQuoteOf(f)]
    f.b.knowHow = { [ENGINE_FIELD]: 100 }
    quotes.push(engineQuoteOf(f))
    f.g.flags.household = { owner: `${f.g.generation}:${f.g.character.id}`, fatigue: 100 } as Json
    push(f.g, true)
    quotes.push(engineQuoteOf(f))
    f.b.ceo = 'manager'
    quotes.push(engineQuoteOf(f))
    for (const q of quotes) {
      expect(q.p).toBe(1)
      expect(q.hitP).toBe(0)
      expect(q.reasons).toEqual([])
      expect(q.quality).toBeNull()
    }
  })

  it('leaves a paused engine and a closed studio alone: no draw, no progress, no setback', () => {
    const f = studio('paused')
    push(f.g, true)
    const { st, x } = building(f)
    x.team = 0
    const before = risk()
    year(f, st, f.g.year)
    expect(x.progress).toBe(0)
    x.team = 12
    simulateStudioEngines(f.g, st, f.g.year + 1, { ...operation, open: 0, asset: f.a })
    expect(x.progress).toBe(0)
    expect(risk()).toBe(before)
    expect(x.fx).toBeUndefined()
  })
})

describe('a push can set an engine back', () => {
  it('cuts the year\'s gain to half, keeps the team and the stored progress, records it, and draws once from the risk stream', () => {
    const y = 2030
    const life = setbackLife(y, true)
    const hit = studio(life)
    hit.g.year = y
    push(hit.g, true)
    const { st, x } = building(hit)
    const team = x.team
    const devs = assignedDevs(st)
    const q = engineQuoteOf(hit)
    const full = engineProgress(q, 1, 1, 1)
    const before = risk()
    const rng = hit.g.rng
    const out = year(hit, st, y)
    expect(risk()).toBe(before + 1)
    expect(spy.luck.at(-1)).toEqual({ tag: 'effort.risk', year: y, id: `studio:${x.id}` })
    expect(hit.g.rng).toBe(rng)
    expect(x.progress).toBeCloseTo(full * SETBACK_KEEP, 9)
    expect(x.progress).toBeGreaterThan(0)
    expect(x.team).toBe(team)
    expect(assignedDevs(st)).toBe(devs)
    expect(x.fx?.setbacks).toBe(1)
    expect(x.stage).toBe('dev')
    expect(out.notes.join('\n')).toContain(x.name)
    expect(out.notes.join('\n')).toMatch(/set .*back|setback|crunch/i)
    // The same year with no setback is the full gain, and the money is the same either way.
    const quiet = studio(quietLife(y, true))
    quiet.g.year = y
    push(quiet.g, true)
    const other = building(quiet)
    const r2 = year(quiet, other.st, y)
    expect(other.x.progress).toBeCloseTo(full, 9)
    expect(other.x.fx).toBeUndefined()
    expect(r2.costs).toBe(out.costs)
    expect(other.x.spent).toBe(x.spent)
  })

  it('draws nothing from the risk stream at the steady posture and the lean one, in the life and year a push is set back', () => {
    const y = 2030
    const life = setbackLife(y, true)
    for (const posture of ['steady', 'lean'] as const) {
      const f = studio(life)
      f.g.year = y
      f.g.character.hidden.willpower = 100
      f.g.character.hidden.discipline = 100
      const yy = readYou(f.g)
      yy.posture = posture
      yy.effective = posture
      writeYou(f.g, yy)
      const { st, x } = building(f)
      const before = risk()
      year(f, st, y)
      expect(risk()).toBe(before)
      expect(x.fx).toBeUndefined()
    }
  })

  it('draws nothing for a hired CEO\'s studio, whatever posture the owner is in', () => {
    const y = 2030
    const f = studio(setbackLife(y, true))
    f.g.year = y
    push(f.g, true)
    const { st, x } = building(f)
    f.b.ceo = 'manager'
    const before = risk()
    year(f, st, y)
    expect(risk()).toBe(before)
    expect(x.fx).toBeUndefined()
    expect(x.progress).toBe(50)
  })

  it('moves the pace of the owner with ambition and posture, never past the ceiling, and never the hired CEO\'s', () => {
    const f = studio()
    const steady = engineQuoteOf(f).effort.speed
    expect(steady).toBe(1)
    f.g.character.hidden.willpower = 100
    f.g.character.hidden.discipline = 100
    const driven = engineQuoteOf(f).effort.speed
    expect(driven).toBeGreaterThan(1)
    push(f.g, true)
    const pushed = engineQuoteOf(f).effort.speed
    expect(pushed).toBeGreaterThan(driven)
    expect(pushed).toBeLessThanOrEqual(RHO_MAX)
    f.b.ceo = 'manager'
    expect(engineQuoteOf(f).effort.speed).toBe(1)
  })

  it('has a luck that is a pure function of the life, the year and the engine, and a chance under the ceiling', () => {
    const f = studio('luck')
    expect(setbackLuck(f.g, 2030, 'engine1')).toBe(setbackLuck(f.g, 2030, 'engine1'))
    expect(setbackLuck(f.g, 2030, 'engine1')).not.toBe(setbackLuck(f.g, 2031, 'engine1'))
    expect(setbackLuck(f.g, 2030, 'engine1')).not.toBe(setbackLuck(f.g, 2030, 'engine2'))
    for (const driven of [false, true]) {
      const g = studio('chance')
      push(g.g, driven)
      const c = setbackChance(engineQuoteOf(g), engineActor(g.g, true))
      expect(c).toBeGreaterThan(0)
      expect(c).toBeLessThanOrEqual(SETBACK_MAX)
    }
    const steadyOwner = studio('chance-steady')
    expect(setbackChance(engineQuoteOf(steadyOwner), engineActor(steadyOwner.g, true))).toBe(0)
  })

  it('plays years without a setback to the end, and a set-back engine still finishes: progress only goes up', () => {
    const f = studio(setbackLife(2030, true))
    f.g.year = 2030
    push(f.g, true)
    const { st, x } = building(f)
    let last = 0
    for (let i = 0; i < 8 && x.stage === 'dev'; i++) {
      year(f, st, 2030 + i)
      expect(x.progress).toBeGreaterThanOrEqual(last)
      last = x.progress
    }
    expect(x.stage).toBe('ready')
    expect(x.fx).toBeDefined()
    expect(x.fx!.setbacks).toBeGreaterThanOrEqual(1)
    expect(x.fx!.progress).toBe(1)
    expect(x.fx!.last).toBeGreaterThanOrEqual(2030)
  })
})

describe('a finished engine teaches the next', () => {
  it('banks know-how in the studio field, in the company map, and the ready line says so in words', () => {
    const f = studio()
    const { st, x } = building(f, 'indie')
    expect(f.b.knowHow).toBeUndefined()
    const out = year(f, st, f.g.year)
    expect(x.stage).toBe('ready')
    expect(Object.keys(f.b.knowHow ?? {})).toEqual([ENGINE_FIELD])
    const k = knowHowOf(f.b.knowHow, ENGINE_FIELD)
    expect(k).toBeGreaterThan(0)
    expect(k).toBeLessThanOrEqual(100)
    const text = out.notes.join('\n')
    expect(text).toContain('game engine is ready')
    expect(text).toMatch(/next engine/i)
    for (const note of out.notes) {
      expect(note.length).toBeLessThanOrEqual(120)
      expect(note).not.toMatch(DASH)
    }
  })

  it('makes the next engine of the tier build faster by the know-how, at most 15 percent, and teaches nothing to any other field', () => {
    const f = studio()
    const first = building(f, 'professional', 'First')
    year(f, first.st, f.g.year)
    const gain1 = first.x.progress
    year(f, first.st, f.g.year + 1)
    expect(first.x.stage).toBe('ready')
    saveStudio(f.a, first.st)
    const k = knowHowOf(f.b.knowHow, ENGINE_FIELD)
    const second = building(f, 'professional', 'Second')
    expect(second.x.id).toBe('engine2')
    year(f, second.st, f.g.year + 2)
    expect(second.x.progress).toBeGreaterThan(gain1)
    expect(second.x.progress / gain1).toBeCloseTo(1 + (0.15 * k) / 100, 9)
    expect(second.x.progress / gain1).toBeLessThanOrEqual(1.15)
    expect(Object.keys(f.b.knowHow ?? {})).toEqual([ENGINE_FIELD])
    // The same year without the company's know-how is the old number.
    const bare = studio()
    const fresh = building(bare, 'professional', 'Fresh')
    year(bare, fresh.st, bare.g.year)
    expect(fresh.x.progress).toBe(gain1)
  })

  it('never lets know-how past 100 or the speed past a sixth more, however many engines it has built', () => {
    const f = studio()
    for (let i = 0; i < 70; i++) {
      const { st, x } = building(f, 'indie', `E${i}`)
      year(f, st, f.g.year + i)
      expect(x.stage).toBe('ready')
      // The catalog holds 32 engines: the know-how is the company's, so a built engine can leave the list.
      st.engines = []
      saveStudio(f.a, st)
      f.b.cash = 100_000_000
      f.b.employees = 60
    }
    expect(knowHowOf(f.b.knowHow, ENGINE_FIELD)).toBeLessThanOrEqual(100)
    expect(engineQuoteOf(f).effort.speed).toBeLessThanOrEqual(1.15 + 1e-9)
    expect(Object.keys(f.b.knowHow ?? {})).toEqual([ENGINE_FIELD])
  })

  it('banks for a hired CEO\'s studio too, at ambition 50 and steady, and books a year once', () => {
    const f = studio()
    f.b.ceo = 'manager'
    f.g.character.hidden.willpower = 100
    const { st, x } = building(f, 'indie')
    year(f, st, f.g.year)
    expect(x.stage).toBe('ready')
    const k = knowHowOf(f.b.knowHow, ENGINE_FIELD)
    expect(k).toBeGreaterThan(0)
    const snapshot = JSON.stringify(f.b.knowHow)
    year(f, st, f.g.year)
    expect(JSON.stringify(f.b.knowHow)).toBe(snapshot)
    // The owner's own record (the player's know-how) was not the target: a company banks in its own map.
    expect(readYou(f.g).fieldK[ENGINE_FIELD]).toBeUndefined()
  })

  it('banks nothing for an engine run without an asset (the oracle\'s run), and nothing is written to any game flag', () => {
    const f = studio()
    const { st, x } = building(f, 'indie')
    const flags = JSON.stringify(f.g.flags)
    year(f, st, f.g.year, false)
    expect(x.stage).toBe('ready')
    expect(f.b.knowHow).toBeUndefined()
    expect(JSON.stringify(f.g.flags)).toBe(flags)
  })

  it('plays through the studio year the yearly loop calls: the engine finishes, the company learns and the report keeps the line', () => {
    const f = studio()
    startStudioEngine(f.g, f.a.id, 'indie', 'Year Engine')
    const started = studioOf(f.a)
    started.engines[0]!.progress = 99
    saveStudio(f.a, started)
    simulateStudioYear(f.g, f.a, f.b, f.g.year, 0)
    const done = studioOf(f.a)
    expect(done.engines[0]!.stage).toBe('ready')
    expect(knowHowOf(f.b.knowHow, ENGINE_FIELD)).toBeGreaterThan(0)
    expect(done.report?.releases.join('\n')).toContain('game engine is ready')
  })
})

describe('what is saved', () => {
  it('keeps a default engine byte for byte what v5.0.0 saved: no fx key from start to ready', () => {
    const f = studio()
    startStudioEngine(f.g, f.a.id, 'professional', 'Plain')
    const started = JSON.stringify(f.a.details.studio)
    expect(started).not.toContain('"fx"')
    const st = studioOf(f.a)
    year(f, st, f.g.year)
    year(f, st, f.g.year + 1)
    saveStudio(f.a, st)
    expect(JSON.stringify(f.a.details.studio)).not.toContain('"fx"')
    expect(Object.keys(st.engines[0]!)).toEqual(['id', 'name', 'tier', 'stage', 'progress', 'quality', 'team', 'started', 'released', 'spent', 'terms', 'licenses', 'licenseSeq', 'lastYear', 'lastRevenue', 'earned', 'soldFor'])
  })

  it('stores a valid, bounded fx after a setback, and it survives a round trip through JSON', () => {
    const y = 2030
    const f = studio(setbackLife(y, true))
    f.g.year = y
    push(f.g, true)
    const { st, x } = building(f)
    year(f, st, y)
    expect(x.fx).toBeDefined()
    saveStudio(f.a, st)
    const again = normalizeStudio(JSON.parse(JSON.stringify(f.a.details.studio)) as Json)
    expect(again.engines[0]!.fx).toEqual(x.fx)
    expect(again.engines[0]!.fx!.setbacks).toBe(1)
    expect(again.engines[0]!.fx!.last).toBe(x.fx!.last)
  })

  it('drops a damaged fx and an empty one on load, cuts a hostile one to its caps, and loads an engine with none', () => {
    const f = studio()
    const { st } = building(f)
    const raw = JSON.parse(JSON.stringify(st.engines)) as Record<string, Json>[]
    const load = (fx: Json | undefined): StudioEngine => {
      const row = { ...raw[0]! }
      if (fx !== undefined) row.fx = fx
      return normalizeEngines([row as unknown as Json])[0]!
    }
    expect(load(undefined).fx).toBeUndefined()
    expect(load('junk').fx).toBeUndefined()
    expect(load(5).fx).toBeUndefined()
    expect(load(null).fx).toBeUndefined()
    expect(load({ ...newFx(2030), last: -1 } as unknown as Json).fx).toBeUndefined()
    const hostile = load({ v: 1, progress: 9, quality: 1e12, spent: 1e30, hours: -4, setbacks: 1e9, insight: 500, fatigue: 900, last: 1e9 } as unknown as Json).fx!
    expect(hostile.progress).toBe(1)
    expect(hostile.quality).toBe(10000)
    expect(hostile.spent).toBe(1e13)
    expect(hostile.hours).toBe(0)
    expect(hostile.setbacks).toBe(99)
    expect(hostile.insight).toBe(100)
    expect(hostile.fatigue).toBe(100)
    expect(hostile.last).toBe(9999)
    const good = load({ v: 1, progress: 0, quality: 0, spent: 0, hours: 0, setbacks: 2, insight: 0, fatigue: 0, last: 2029 } as unknown as Json).fx
    expect(good?.setbacks).toBe(2)
  })

  it('still holds the 32-engine and 999,999,999 guards', () => {
    const f = studio()
    const st = studioOf(f.a)
    st.engines = Array.from({ length: 32 }, (_, i) => ({
      id: `engine${i + 1}`, name: `E${i}`, tier: 'indie', stage: 'ready', progress: 100, quality: 50, team: 0, started: 2020, released: 2021, spent: 1, terms: 'private',
      licenses: [], licenseSeq: 0, lastYear: 2021, lastRevenue: 0, earned: 0, soldFor: 0,
    } as StudioEngine))
    st.engineSeq = 32
    saveStudio(f.a, st)
    expect(engineDevelopmentBlock(f.g, f.a, 'indie')).toContain('catalog is full')
    const st2 = studioOf(f.a)
    st2.engines = []
    st2.engineSeq = 999_999_999
    saveStudio(f.a, st2)
    expect(engineDevelopmentBlock(f.g, f.a, 'indie')).toContain('catalog is full')
  })
})

describe('the words the player reads', () => {
  it('says nothing about the pace at the default and says it plainly otherwise, short and with no dash', () => {
    const f = studio()
    expect(enginePace(engineQuoteOf(f))).toBe('')
    f.b.knowHow = { [ENGINE_FIELD]: 40 }
    const know = enginePace(engineQuoteOf(f))
    expect(know).toMatch(/faster/)
    expect(know).toMatch(/know-how/)
    push(f.g, true)
    const pushed = enginePace(engineQuoteOf(f))
    expect(pushed).toMatch(/faster/)
    f.g.flags.household = { owner: `${f.g.generation}:${f.g.character.id}`, fatigue: 90 } as Json
    const tired = enginePace(engineQuoteOf(f))
    expect(tired.length).toBeGreaterThan(0)
    for (const text of [know, pushed, tired]) {
      expect(text.length).toBeLessThanOrEqual(90)
      expect(text).not.toMatch(DASH)
      expect(text).not.toMatch(/\d/)
    }
  })

  it('puts the pace in the start notice and the engine screen when there is any, and leaves them as they were when there is none', () => {
    const plain = studio()
    startStudioEngine(plain.g, plain.a.id, 'professional', 'Plain')
    const base = plain.g.queue.map((m) => (m.kind === 'notice' ? m.text : '')).join('\n')
    expect(base).toContain('About 2 years with 12 developers.')
    expect(base).not.toMatch(/faster|slower/)
    const header = (f: Studio): string => {
      const menu = find(f.g, studioNodes(f.g, f.a), `studio.engines.${f.a.id}`) as MenuGroup
      const node = find(f.g, menu.children(f.g), `studio.engine.engine1.${f.a.id}`) as MenuGroup
      return node.header!(f.g)
    }
    expect(header(plain)).toContain('About 2 years with 12 developers.')
    expect(header(plain)).not.toMatch(/faster|slower/)
    const taught = studio()
    taught.b.knowHow = { [ENGINE_FIELD]: 50 }
    startStudioEngine(taught.g, taught.a.id, 'professional', 'Taught')
    const text = taught.g.queue.map((m) => (m.kind === 'notice' ? m.text : '')).join('\n')
    expect(text).toContain('About 2 years with 12 developers.')
    expect(text).toMatch(/faster/)
    expect(header(taught)).toMatch(/faster/)
    expect(text).not.toMatch(DASH)
  })
})

describe('a quote is a read, and money buys nothing here', () => {
  it('draws nothing from g.rng and nothing from the risk stream, and reads a deep-frozen game', () => {
    const f = studio('reads')
    push(f.g, true)
    f.b.knowHow = { [ENGINE_FIELD]: 70 }
    const before = risk()
    expect(noDraw(f.g, () => engineQuoteOf(f))).toBe(true)
    expect(noDraw(f.g, () => enginePace(engineQuoteOf(f)))).toBe(true)
    expect(risk()).toBe(before)
    const want = engineQuoteOf(f)
    deepFreeze(f.g)
    expect(engineQuoteOf(f)).toEqual(want)
  })

  it('never scales a price: 100 times the cash, the staff and the sales change nothing of the cost, and k stays one', () => {
    const f = studio()
    const q1 = engineQuoteOf(f)
    f.b.cash *= 100
    f.b.employees *= 100
    f.b.yearIncome = 1e12
    f.g.character.money *= 100
    const q2 = engineQuoteOf(f)
    expect(q2.spend).toBe(q1.spend)
    expect(q1.spend).toBe(60_000)
    expect(q2.k).toBe(1)
    expect(q2).toEqual(q1)
    for (const tier of ENGINE_TIERS) expect(engineQuoteOf(f, tier.id).spend).toBe(tier.research)
  })

  it('keeps the pace under its ceilings at the largest inputs: ambition 100 pushing, know-how in the billions, a hostile map', () => {
    const f = studio()
    push(f.g, true)
    f.b.knowHow = { [ENGINE_FIELD]: 1e9 }
    const q = engineQuoteOf(f)
    expect(knowHowOf(f.b.knowHow, ENGINE_FIELD)).toBe(100)
    expect(q.effort.speed).toBeLessThanOrEqual(RHO_MAX * 1.15 + 1e-9)
    expect(q.k).toBeLessThanOrEqual(1)
    for (const tier of ENGINE_TIERS) {
      const t = engineQuoteOf(f, tier.id)
      expect(engineProgress(t, 99, 1, 1)).toBeLessThanOrEqual((100 / tier.years) * Math.pow(3, 0.8) * RHO_MAX * 1.15 + 1e-9)
    }
    f.b.knowHow = { [ENGINE_FIELD]: Number.NaN } as unknown as Record<string, number>
    expect(engineQuoteOf(f).effort.speed).toBeGreaterThan(0)
    f.b.knowHow = 'junk' as unknown as Record<string, number>
    expect(engineQuoteOf(f).effort.speed).toBeGreaterThan(0)
  })

  it('has an outcome that is a plain win and an actor that is the owner only when the owner runs it', () => {
    const o = engineOutcome()
    expect(o.kind).toBe('works')
    expect(o.cause).toBeNull()
    expect(o.done).toBe(1)
    const f = studio()
    expect(engineActor(f.g, true).you).toBe(true)
    expect(engineActor(f.g, false)).toEqual({ you: false, posture: 'steady' })
    push(f.g)
    expect(engineActor(f.g, true).posture).toBe('push')
    expect(engineActor(f.g, false).posture).toBe('steady')
  })
})
