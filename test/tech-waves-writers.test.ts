// Tech waves, the writers (plan Task 5): a pioneer heavy launch, a breakthrough-class deep-tech win and a
// Workshop first each write one wave through announceWave, and nothing else does. The fixtures wrap the
// ones the existing suites use (heavy-project, growth, workshop-race); every roll that has to win loops
// over seeds, because the odds can't be forced.
import { describe, expect, it } from 'vitest'
import { readAiFirsts } from '../src/game/business/ai-bench-claims'
import { CAP_IDS } from '../src/game/business/ai-bench-data'
import { becomeCeo } from '../src/game/business/career'
import { marketKey } from '../src/game/business/competition-core'
import { familyId } from '../src/game/business/competition-roster'
import { techOf } from '../src/game/business/deeptech-core'
import { maxStage, programDef } from '../src/game/business/deeptech-data'
import { startProgram, startTrial } from '../src/game/business/deeptech-rd'
import { simulateDeepTechYearImpl } from '../src/game/business/deeptech-sim'
import { readTech, timesDone, type AiModel, type Drug, type TechState } from '../src/game/business/deeptech-state'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { advanceHeavy, readHeavy, type HeavyRecord } from '../src/game/business/heavy-rd'
import { bizOf, type RdProject } from '../src/game/business/state'
import { readTechWaves } from '../src/game/business/tech-waves'
import type { Industry } from '../src/game/data/markets'
import { readMarketNews } from '../src/game/history/market-events'
import { createNewLife } from '../src/game/life'
import { chance, rand } from '../src/game/rng'
import type { Asset, GameState, Json } from '../src/game/types'
import { getCountry } from '../src/game/world'
import { ALL_IDEAS } from '../src/game/workshop/catalog'
import { license } from '../src/game/workshop/launch'
import { raceYear } from '../src/game/workshop/market'
import { offBest, rated } from './ai-bench-kit'
import { adult, company, nextYear } from './market-kit'
import { give, idea, inventor } from './workshop-fixtures'

const near = (n: number) => expect.closeTo(n, 6)

// ---------------------------------------------------------------------------
// Heavy launches (copies the biz() and the seed loop of test/heavy-project.test.ts)

function biz(seed: number, trade: Industry, year: number) {
  const g = adult(seed, year, 'us')
  const a = company(g, trade, { cash: 80_000_000 })
  nextYear(g)
  g.queue = []
  return { g, a, b: bizOf(g, a) }
}

/** The project of test/heavy-voice.test.ts: finished, with the odds the caller picks. */
function project(g: GameState, name: string, odds: number): RdProject {
  return { id: 'rd-w', name, budget: 2e6, years: 4, progress: 4, odds, boost: 0, quality: 80, family: name, kind: 'breakthrough', heavy: true, cost: 2e6, started: g.year - 4 }
}

/** A pioneer launch that works, found by seed. `year` is the opening year, the launch year of the record is two later. */
function launch(trade: Industry, name: string, year: number): { g: GameState; rec: HeavyRecord } {
  for (let seed = 1; seed <= 80; seed++) {
    const { g, a, b } = biz(seed, trade, year)
    if (!advanceHeavy(g, a, b, project(g, name, 0.98), g.year).won) continue
    return { g, rec: readHeavy(g, trade, marketKey(b)).find((r) => r.family === name)! }
  }
  throw new Error(`no launch of ${name} won in 80 seeds`)
}

/** Two companies of one trade: the first launches the kind, then the second launches the same kind. */
function launchFollower(): { g: GameState } {
  for (let seed = 1; seed <= 80; seed++) {
    const { g, a, b } = biz(seed, 'software', 2030)
    const second = company(g, 'software', { cash: 80_000_000, name: 'Second Software' })
    if (!advanceHeavy(g, a, b, project(g, 'Autonomous Agent Platform', 0.98), g.year).won) continue
    if (!advanceHeavy(g, second, bizOf(g, second), project(g, 'Autonomous Agent Platform', 0.98), g.year).won) continue
    return { g }
  }
  throw new Error('no follower launch won in 80 seeds')
}

function launchFlop(): { g: GameState } {
  for (let seed = 1; seed <= 80; seed++) {
    const { g, a, b } = biz(seed, 'software', 2030)
    if (advanceHeavy(g, a, b, project(g, 'Autonomous Agent Platform', 0.02), g.year).won) continue
    return { g }
  }
  throw new Error('no flop in 80 seeds')
}

describe('heavy launches', () => {
  it('a pioneer launch of a listed entry writes one heavy wave', () => {
    const { g, rec } = launch('software', 'Autonomous Agent Platform', 2030)
    expect(readTechWaves(g)).toHaveLength(1)
    expect(readTechWaves(g)[0]).toMatchObject({ source: 'heavy', kind: 'ai', market: 'world', name: 'Autonomous Agent Platform', size: 0.5, skip: 'software', year: rec.year, origin: 'heavy.software|world#Autonomous Agent Platform' })
    expect(readMarketNews(g).some((n) => n.id.startsWith('wave-'))).toBe(false)
  })
  it('a follower, a flop, an unlisted entry and a launch after the window write nothing', () => {
    expect(readTechWaves(launchFollower().g)).toHaveLength(1)                               // the second company's launch of the same family adds none
    expect(readTechWaves(launch('restaurant', 'Open Kitchen Theater', 2030).g)).toEqual([]); expect(readTechWaves(launchFlop().g)).toEqual([])
    expect(readTechWaves(launch('software', 'Hosted Subscription Platform', 2040).g)).toEqual([])   // first 1999 + 10 < 2040
  })
  it('the window is ten years after the catalogue date, counted to the launch year of the record (first 2025)', () => {
    const at = (year: number) => { const r = launch('software', 'Autonomous Agent Platform', year); return { years: r.rec.year, waves: readTechWaves(r.g).length } }
    expect(at(2033)).toEqual({ years: 2035, waves: 1 }); expect(at(2034)).toEqual({ years: 2036, waves: 0 })
  })
  it('a heavy launch of a kind a history row covers that year writes nothing (Hosted Subscription Platform in the cloud years)', () => {
    expect(readTechWaves(launch('software', 'Hosted Subscription Platform', 2005).g)).toEqual([])
    expect(readTechWaves(launch('software', 'Hosted Subscription Platform', 2000).g)).toHaveLength(1)
  })
  it('draws nothing on the game random stream: the odds, the hit chance and the quality spread, as before', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const { g, a, b } = biz(seed, 'software', 2030)
      const probe = { rng: g.rng } as unknown as GameState
      if (chance(probe, 0.98)) { chance(probe, 0.35); rand(probe) }
      const won = advanceHeavy(g, a, b, project(g, 'Autonomous Agent Platform', 0.98), g.year).won
      expect(g.rng, `seed ${seed}`).toBe(probe.rng)
      if (won) { expect(readTechWaves(g)).toHaveLength(1); return }
    }
    throw new Error('no launch won in 40 seeds')
  })
})

// ---------------------------------------------------------------------------
// Deep-tech milestones (lab() of test/growth.test.ts and the call of test/world2-business-supply.test.ts)

function lab(industry: Industry, patch: Record<string, unknown> = {}, manager = false): { g: GameState; a: Asset } {
  const g = createNewLife({ seed: 30, year: 2000, countryId: 'us' })
  g.queue = []
  g.year = 2030
  g.character.age = 35
  g.character.money = 1e9
  const city = getCountry('us').cities[0]
  const b0 = newBiz(g, industry, 'us', city, {
    cash: 5e9,
    ...(manager ? { ceo: 'manager' as const, manager: { firstName: 'Pat', lastName: 'Lee', gender: 'female' as const, skill: 70, salary: 200_000, since: g.year } } : {}),
  })
  b0.outlets = [{ countryId: 'us', city, count: 1, opened: 2025 }]
  const t = readTech(undefined)
  Object.assign(t, { level: 80, venture: 0 }, patch)
  b0.tech = JSON.parse(JSON.stringify(t)) as Json
  const a = createBusinessAsset(g, 'Lab Co', b0, 0)
  g.assets.push(a)
  if (!manager) becomeCeo(g, a, b0)
  return { g, a }
}

/**
 * One lab year with `programId` finished, repeated over seeds until the program works. Returns the game
 * after that year (`afterResearch` has run for the lab, owner-run or hired).
 */
function labYear(industry: Industry, programId: string, patch: Record<string, unknown>, opts: { manager?: boolean } = {}): { g: GameState; a: Asset } {
  const def = programDef(industry as Parameters<typeof programDef>[0], programId)!
  for (let seed = 1; seed <= 80; seed++) {
    const { g, a } = lab(industry, patch, opts.manager)
    const b = bizOf(g, a), t = techOf(b)
    const p = startProgram(g, b, t, def, 3)
    if (!p) throw new Error(`${industry}:${programId} cannot start: ${def.gate(t, 'us')}`)
    const before = timesDone(t, programId)
    p.progress = p.years
    g.rng = seed
    simulateDeepTechYearImpl(g, a, b, g.year, 0)
    if (timesDone(techOf(b), programId) > before) return { g, a }
  }
  throw new Error(`${industry}:${programId} did not work in 80 seeds`)
}

/** One AI training year that finishes a model (a big rented cluster, so a strong lab beats the frontier). */
const trainYear = (patch: Record<string, unknown>) => labYear('aiLab', 'train', { rented: 15, ...patch })

const frontierModel = (): AiModel => ({ gen: 1, name: 'Atlas 1', score: 99, open: false, year: 2029 })

/** One regulatory-review year for a drug of the given peak, repeated over seeds until it is approved. */
function approveYear(over: Partial<Drug> = {}): { g: GameState; a: Asset } {
  const drug: Drug = { id: 'd1', name: 'Zorvelglutide', area: 'obesity', phase: 3, quality: 80, peak: 6, filed: 2028, approved: 0, royalty: 1, partner: '', failed: false, ...over }
  for (let seed = 1; seed <= 80; seed++) {
    const { g, a } = lab('biotech', { drugs: [drug] })
    const b = bizOf(g, a), t: TechState = techOf(b)
    const p = startTrial(g, b, t, t.drugs[0])
    if (!p) throw new Error('the review cannot start')
    p.progress = p.years
    g.rng = seed
    simulateDeepTechYearImpl(g, a, b, g.year, 0)
    if (techOf(b).drugs[0].approved > 0) return { g, a }
  }
  throw new Error('the drug was not approved in 80 seeds')
}

describe('deep-tech milestones', () => {
  const FUSION = { stage: 1, level: 80, done: ['magnets', 'shot'] }
  it('a breakthrough-class win writes one wave, for a hired-manager lab too; a routine win, a repeat or a second qec writes none', () => {
    const { g, a } = labYear('fusion', 'netGain', FUSION)
    expect(readTechWaves(g)).toHaveLength(1); expect(readTechWaves(g)[0]).toMatchObject({ source: 'deeptech', kind: 'fusion', market: 'world', name: 'Fusion net energy gain', size: 0.5, origin: `${a.id}#netGain`, home: 'us' })
    expect(readTechWaves(labYear('fusion', 'netGain', FUSION, { manager: true }).g)).toHaveLength(1); expect(readTechWaves(labYear('fusion', 'nextgen', { stage: maxStage('fusion') }).g)).toEqual([])
    expect(readTechWaves(labYear('quantum', 'advantage', { qubits: 200, logical: 4 }).g)[0]).toMatchObject({ name: 'Quantum advantage', size: 0.6 }); expect(readTechWaves(labYear('quantum', 'qec', { qubits: 200, done: ['qec'] }).g)).toEqual([])
  })
  it('the first error-correction win writes a wave, a self-driving win only once the cars are autonomous enough', () => {
    expect(readTechWaves(labYear('quantum', 'qec', { qubits: 200 }).g)[0]).toMatchObject({ kind: 'quantum', name: 'Error-corrected qubits', size: 0.35 })
    expect(readTechWaves(labYear('electricVehicles', 'selfdrive', { autonomy: 2 }).g)[0]).toMatchObject({ kind: 'automation', name: 'Self-driving cars', size: 0.4 })
    expect(readTechWaves(labYear('electricVehicles', 'selfdrive', { autonomy: 0 }).g)).toEqual([])
  })
  it('the first frontier model of a lab writes "Frontier AI" at training time, a second one does not', () => {
    const { g, a } = trainYear({ stage: 3, level: 100, plant: 6, caps: Object.fromEntries(CAP_IDS.map((c) => [c, 10])), models: [] }), [w] = readTechWaves(g)
    expect(w).toMatchObject({ kind: 'ai', name: 'Frontier AI', size: 0.4 }); expect(w.origin).toMatch(new RegExp(`^${a.id}#model\\d+$`)); expect(readTechWaves(trainYear({ stage: 3, level: 100, models: [frontierModel()] }).g)).toEqual([])
  })
  it('a weak lab trains a model that does not lead, so it writes no "Frontier AI" wave', () => {
    expect(readTechWaves(trainYear({ stage: 3, level: 40, rented: 0, models: [] }).g)).toEqual([])
  })
  it('a managed lab claims at training, is never asked to hold, and its model is never held', () => {
    // lab() here sets g.year = 2030 on createNewLife({ seed: 30, year: 2000, countryId: 'us' }). A maxed lab's new model sits at the ceiling, 90 over the market's best
    // (a rated model of 2029 at +80 does not lift it), which is past the second milestone of vision, which the market reaches only after 2030: the claim does not depend on luck.
    const fam = familyId(createNewLife({ seed: 30, year: 2000, countryId: 'us' }).lifeId)
    const { g, a } = labYear('aiLab', 'train', { rented: 15, stage: 3, level: 100, plant: 6, caps: Object.fromEntries(CAP_IDS.map((c) => [c, 10])), models: [rated(fam, 7, 2029, offBest(fam, 2029, 80))] }, { manager: true })
    expect(g.queue.some((m) => m.kind === 'choice' && m.scriptId === 'deeptech.release')).toBe(false)
    expect(Object.keys(readAiFirsts(g))).toContain('vision.2'); expect(techOf(bizOf(g, a)).models.some((m) => m.held)).toBe(false)
  })
  it('an approved drug with peak >= 4 writes a drug wave sized 0.2 + 0.04 peak, capped at 0.5; peak 3 writes none', () => {
    const [w] = readTechWaves(approveYear({ peak: 6 }).g); expect(w).toMatchObject({ kind: 'drug', size: near(0.44) }); expect(w.name).toMatch(/^A new drug for /); expect(readTechWaves(approveYear({ peak: 3 }).g)).toEqual([])
    expect(readTechWaves(approveYear({ peak: 8 }).g)[0].size).toBeCloseTo(0.5, 6)
  })
})

// ---------------------------------------------------------------------------
// Workshop (inventor/give/license/idea of test/workshop-fixtures.ts, as in test/workshop-race.test.ts)

/** The idea beaten in a game where it is a first: a history idea five years before its real date, a future idea the year before the rival's. */
function beat(id: string, year?: number): { g: GameState } {
  const def = ALL_IDEAS.find((i) => i.id === id)!
  if (def.future) {
    const g = inventor({ genius: true, year: 2010 })
    g.year = raceYear(g, def)! - 1
    give(g, id, 80)
    license(g, idea(id))
    return { g }
  }
  const g = inventor({ genius: true, year: year ?? def.real! - 5, age: 40, seed: 7 })
  give(g, id, 85)
  license(g, idea(id))
  return { g }
}

const beatModals = (g: GameState) => g.queue.filter((m) => /Beat History/.test(JSON.stringify(m)))

describe('Workshop', () => {
  it('a history first writes a workshop wave and a future win a race wave, with no second modal; an unmapped or silent idea writes nothing', () => {
    expect(readTechWaves(beat('hist-pocket-telephone', 1968).g)[0]).toMatchObject({ source: 'workshop', kind: 'mobilephone', origin: 'hist-pocket-telephone', market: 'world', size: 0.6 })
    const f = beat('fut-cold-cure'); expect(readTechWaves(f.g)[0]).toMatchObject({ source: 'race', kind: 'drug', size: 0.4 }); expect(beatModals(f.g)).toHaveLength(1)
    for (const id of ['hist-color-cube', 'fut-float-board']) { const r = beat(id); expect(beatModals(r.g), id).toHaveLength(1); expect('techWaves' in r.g.flags, id).toBe(false) }
  })
})
