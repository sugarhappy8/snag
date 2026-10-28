// R3-Q10 (E.T5): the pace rule for the career kit.
//   (a) the table: every crisis of the four kit careers is in one of 8 families, a family has 2 or more crises, and the families of every
//       engine fit under PACE.maxFamilies;
//   (b) the weight: a family that came to you through one career weighs a quarter as much for every career, in the offer and in the
//       odds the hints print (one function), it is pure, and a crisis in no family is left alone;
//   (c) the year slot: one unrequested career choice a year across careers (pace.kit), read in choiceRoom and taken in offerChoice,
//       only in the yearly settle, so an action the player asked for is never refused for a crisis that came first. The budgets
//       (YEARLY_BUDGET, ACTION_BUDGET) and the pending cap are unchanged.
import { describe, expect, it } from 'vitest'
import { yearActionsUsed } from '../src/game/core'
import { ASK_FAMILIES } from '../src/game/events/ask-families'
import { EVENT_LIBRARY, eventPaceFamily } from '../src/game/events'
import { BIZ_EVENT_FAMILIES } from '../src/game/business/event-families'
import { ACTOR_DEFS } from '../src/game/special/actor-events'
import { ASTRO_DEFS } from '../src/game/special/astronaut-events'
import { hire } from '../src/game/special/common'
import { KIT_FAMILIES, kitPaceKey } from '../src/game/special/kit/families'
import { CRISIS_ODDS, defineCrises, type CrisisDef } from '../src/game/special/kit/crisis'
import { defineCareerState, int } from '../src/game/special/kit/state'
import { ACTION_BUDGET, YEARLY_BUDGET, careerCtx, choiceRoom, offerChoice, pendingCareerChoices, settleYear, type CareerCtx } from '../src/game/special/kit/year'
import { MODEL_DEFS, modelCrises } from '../src/game/special/model-events'
import { modelStore } from '../src/game/special/model-state'
import { MUSIC_DEFS } from '../src/game/special/music-events'
import { readTextMem } from '../src/game/text/memory'
import { KIN_FAMILIES, PACE, notePopup, paceKey, withPaceOff } from '../src/game/text/pace'
import type { ChoiceModal, GameState } from '../src/game/types'
import { makeTestGame } from './helpers'

const MODEL_IDS = MODEL_DEFS.map((d) => d.id)
const DEFS = { actor: ACTOR_DEFS, astronaut: ASTRO_DEFS, model: MODEL_DEFS, music: MUSIC_DEFS } as const

function families(): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const [key, fam] of Object.entries(KIT_FAMILIES)) out.set(fam, [...(out.get(fam) ?? []), key])
  return out
}

describe('the families table', () => {
  it('names every crisis of the four kit careers once, as career.id, and nothing else', () => {
    const real: string[] = []
    for (const [career, defs] of Object.entries(DEFS)) for (const def of defs) real.push(`${career}.${def.id}`)
    expect(real.length).toBeGreaterThanOrEqual(30)
    for (const key of real) expect(KIT_FAMILIES[key], `${key} has no family`).toBeDefined()
    for (const key of Object.keys(KIT_FAMILIES)) expect(real.includes(key), `${key} is not a crisis`).toBe(true)
    expect(Object.keys(KIT_FAMILIES)).toHaveLength(new Set(real).size)
  })

  it('has 8 families or fewer, each with 2 or more crises', () => {
    const g = families()
    expect(g.size).toBeLessThanOrEqual(8)
    for (const [fam, keys] of g) expect(keys.length, fam).toBeGreaterThanOrEqual(2)
  })

  it('keeps a family across careers: the same crisis id in two careers can be in one family', () => {
    expect(KIT_FAMILIES['actor.injury']).toBe(KIT_FAMILIES['model.injury'])
    expect(KIT_FAMILIES['actor.scandalLeak']).toBe(KIT_FAMILIES['music.scandal'])
    expect(kitPaceKey('actor', 'injury')).toBe('pop.kit.body')
    expect(kitPaceKey('actor', 'injury')).toBe(paceKey('kit', 'body'))
    expect(kitPaceKey('probe', 'rush')).toBeUndefined()
    expect(kitPaceKey('actor', 'not.a.crisis')).toBeUndefined()
  })

  it('fits, with the event, ask, company and career families, under the 80 the text memory leaves for popups', () => {
    const events = new Set(EVENT_LIBRARY.map((e) => eventPaceFamily(e.id)).filter((f): f is string => f !== undefined)).size
    const asks = new Set(Object.values(ASK_FAMILIES).map((e) => e.family)).size
    const biz = new Set(Object.values(BIZ_EVENT_FAMILIES)).size
    expect(events + asks + biz + families().size + KIN_FAMILIES.length).toBeLessThanOrEqual(PACE.maxFamilies)
  })
})

// ---------------------------------------------------------------------------------------------------------------
// The weight. A model in 2026 has two crises open at once, in two families: the injury (body) and the likeness licence (offer).

function model(seed = 1): GameState {
  const g = makeTestGame(seed, { age: 30, money: 100_000 })
  g.year = 2026
  hire(g, { defId: 'model', title: 'Model', company: 'Agency', salary: 50_000 })
  // A heavy workload: the injury weighs 0.29 against the licence's 0.5, so the two share the offers about 37 to 63.
  modelStore.mut(g).strain = 100
  return g
}

describe('the weight of a crisis', () => {
  it('is set up: a model in 2026 has an injury and a likeness licence open, in different families', () => {
    const g = model()
    const s = modelStore.view(g)
    expect(modelCrises.odds(g, s, 'injury')).toBeGreaterThan(0)
    expect(modelCrises.odds(g, s, 'likenessLicence')).toBeGreaterThan(0)
    expect(KIT_FAMILIES['model.injury']).toBe('body')
    expect(KIT_FAMILIES['model.likenessLicence']).toBe('offer')
  })

  it('weighs a quarter as much, in the odds the hints print, once the family came to you within 5 years, through any career', () => {
    const g = model()
    const s = modelStore.view(g)
    const injury = modelCrises.odds(g, s, 'injury')
    const licence = modelCrises.odds(g, s, 'likenessLicence')
    // The two are all that is open, so the offer roll is shared between them and nothing else.
    expect(injury + licence).toBeCloseTo(CRISIS_ODDS, 12)
    // The injury of an ACTOR was the last body trouble: the memory is the player's, not the career's.
    notePopup(g, kitPaceKey('actor', 'injury')!)
    const injury2 = modelCrises.odds(g, s, 'injury')
    const licence2 = modelCrises.odds(g, s, 'likenessLicence')
    expect(injury2).toBeLessThan(injury)
    expect(licence2).toBeGreaterThan(licence)
    expect(injury2 / licence2).toBeCloseTo((injury / licence) * PACE.weight, 9)
    // The roll is the same: the weights move which crisis comes, not whether one comes.
    expect(injury2 + licence2).toBeCloseTo(CRISIS_ODDS, 12)
  })

  it('is the base again 5 years later and inside withPaceOff, and is not read back from a later year', () => {
    const g = model()
    const s = modelStore.view(g)
    const base = modelCrises.odds(g, s, 'injury')
    notePopup(g, paceKey('kit', 'body'))
    expect(withPaceOff(() => modelCrises.odds(g, s, 'injury'))).toBe(base)
    for (const step of [0, PACE.window - 1, PACE.window]) {
      const noted = structuredClone(g)
      noted.year += step
      const twin = structuredClone(g)
      twin.year += step
      delete twin.flags.textMem
      const withNote = modelCrises.odds(noted, s, 'injury')
      const without = modelCrises.odds(twin, s, 'injury')
      if (step < PACE.window) expect(withNote, `${step} years after`).toBeLessThan(without)
      else expect(withNote, `${step} years after`).toBeCloseTo(without, 12)
    }
    const later = model()
    const ls = modelStore.view(later)
    const lbase = modelCrises.odds(later, ls, 'injury')
    later.year += 3
    notePopup(later, paceKey('kit', 'body'))
    later.year -= 3
    expect(modelCrises.odds(later, ls, 'injury')).toBe(lbase)
  })

  it('draws nothing in a read and notes nothing', () => {
    const g = model()
    const s = modelStore.view(g)
    const rng = g.rng
    for (const id of MODEL_IDS) modelCrises.odds(g, s, id)
    expect(g.rng).toBe(rng)
    expect(Object.keys(readTextMem(g).f).filter((k) => k.startsWith('pop.'))).toEqual([])
  })

  /** Which crisis the model is offered at the settle of each seed (the offer rolls 35%), with or without a body family note. */
  function offered(noteBody: boolean, seeds: number): { injury: number; licence: number; other: number; rngs: number[] } {
    const out = { injury: 0, licence: 0, other: 0, rngs: [] as number[] }
    for (let seed = 1; seed <= seeds; seed++) {
      const g = model(seed)
      if (noteBody) notePopup(g, paceKey('kit', 'body'))
      const c = careerCtx(g, 'model', modelStore.mut(g), { choices: 1, notices: 2 })
      const hit = modelCrises.offer(c)
      out.rngs.push(g.rng)
      if (!hit) continue
      const m = g.queue.find((x): x is ChoiceModal => x.kind === 'choice')
      if (m?.scriptId === 'career.model.injury') out.injury++
      else if (m?.scriptId === 'career.model.likenessLicence') out.licence++
      else out.other++
    }
    return out
  }

  it('offers the heavy family less often, and the other family more often, and the same number of rolls', () => {
    const base = offered(false, 500)
    const noted = offered(true, 500)
    expect(base.other).toBe(0)
    expect(base.injury).toBeGreaterThan(30)
    expect(base.licence).toBeGreaterThan(30)
    // Quarter weight: the injury share of the offers falls from about a half to about a fifth.
    expect(noted.injury / (noted.injury + noted.licence)).toBeLessThan((base.injury / (base.injury + base.licence)) * 0.7)
    expect(noted.licence / (noted.injury + noted.licence)).toBeGreaterThan(base.licence / (base.injury + base.licence))
    // The weights move the pick, not the rolls: the same seeds make the same number of draws (the same g.rng after the offer).
    expect(noted.rngs).toEqual(base.rngs)
  })
})

// ---------------------------------------------------------------------------------------------------------------
// The year slot. Three synthetic careers share one job and one year; each has one crisis that is always eligible.

function career(id: string): { run: (g: GameState) => void; ctxs: CareerCtx[]; script: string } {
  const store = defineCareerState({ key: `${id}.sim`, version: 1, migrate: [(r) => ({ ...r })], extra: (r) => ({ stock: int(r.stock, 0, 0, 1e6) }) })
  const def: CrisisDef<any, { n: number }> = {
    id: 'rush',
    title: `Rush ${id}`,
    emoji: '\u{1F4BC}',
    weight: () => 1,
    make: () => ({ n: 1 }),
    scene: () => 'A client needs it by Friday. What will you do?',
    options: { safe: { label: 'Say no', emoji: '\u{1F645}', good: () => ({ text: () => 'You passed.', fx: { standing: 1 } }) } },
  }
  const crises = defineCrises({ career: id, store, talent: 'Acting', defs: [def] })
  const ctxs: CareerCtx[] = []
  const run = settleYear({
    career: id,
    store,
    incomeLabel: 'Fees',
    active: (g) => g.character.job?.defId === 'probe',
    run: (c) => {
      ctxs.push(c)
    },
    crises,
  })
  return { run, ctxs, script: `career.${id}.rush` }
}

const A = career('slota')
const B = career('slotb')
const C = career('slotc')

function probeGame(seed: number): GameState {
  const g = makeTestGame(seed, { age: 30, money: 100_000 })
  hire(g, { defId: 'probe', title: 'Prober', company: 'Probe Co', salary: 50_000 })
  return g
}

const careerChoices = (g: GameState): number => g.queue.filter((m) => m.kind === 'choice' && typeof m.scriptId === 'string' && m.scriptId.startsWith('career.')).length

describe('the year slot', () => {
  it('keeps the budgets and the pending cap', () => {
    expect(YEARLY_BUDGET).toEqual({ choices: 1, notices: 2 })
    expect(ACTION_BUDGET).toEqual({ choices: 3, notices: 6 })
  })

  it('lets one unrequested career choice through a year across three careers', () => {
    let years = 0
    let offered = 0
    for (let seed = 1; seed <= 300; seed++) {
      const g = probeGame(seed)
      for (const sim of [A, B, C]) sim.run(g)
      const n = careerChoices(g)
      expect(n, `seed ${seed}`).toBeLessThanOrEqual(1)
      expect(yearActionsUsed(g, 'pace.kit'), `seed ${seed}`).toBe(n)
      years++
      if (n === 1) offered++
    }
    // Three rolls of 35%: about 70% of the years have one.
    expect(years).toBe(300)
    expect(offered).toBeGreaterThan(150)
  })

  it('opens the slot again the next year', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const g = probeGame(seed)
      for (const sim of [A, B, C]) sim.run(g)
      if (careerChoices(g) !== 1) continue
      // The next years: the age-up empties the year's actions, and a choice comes again within a few years.
      let again = 0
      for (let year = 0; year < 40 && again === 0; year++) {
        g.queue = []
        g.yearActions = {}
        g.year += 1
        g.character.age += 1
        for (const sim of [A, B, C]) sim.run(g)
        expect(careerChoices(g), `year ${year}`).toBeLessThanOrEqual(1)
        again = careerChoices(g)
      }
      expect(again).toBe(1)
      return
    }
    throw new Error('no year with a career choice in 300 seeds')
  })

  it('reads the slot in choiceRoom and takes it in offerChoice, in the yearly settle', () => {
    const rooms: boolean[] = []
    let took = false
    const first = settleYear({
      career: 'slotd',
      store: defineCareerState({ key: 'slotd.sim', version: 1, migrate: [(r) => ({ ...r })], extra: () => ({}) }),
      incomeLabel: 'Fees',
      active: (g) => g.character.job?.defId === 'probe',
      run: (c) => {
        rooms.push(choiceRoom(c))
        took = offerChoice(c, 'career.slotd.none', 'A deal', 'Sign or walk. What will you do?', [{ id: 'sign', label: 'Sign', emoji: '\u{270D}\u{FE0F}' }], {}, '\u{1F4BF}')
        rooms.push(choiceRoom(c))
      },
    })
    const second = settleYear({
      career: 'slote',
      store: defineCareerState({ key: 'slote.sim', version: 1, migrate: [(r) => ({ ...r })], extra: () => ({}) }),
      incomeLabel: 'Fees',
      active: (g) => g.character.job?.defId === 'probe',
      run: (c) => {
        rooms.push(choiceRoom(c))
      },
    })
    const g = probeGame(1)
    first(g)
    second(g)
    expect(took).toBe(true)
    // Career d: room before, none after (its own budget is spent too); career e: no room, the slot is gone though its budget is whole.
    expect(rooms).toEqual([true, false, false])
    expect(yearActionsUsed(g, 'pace.kit')).toBe(1)
    // The next year both have room again.
    g.queue = []
    g.yearActions = {}
    g.year += 1
    g.character.age += 1
    rooms.length = 0
    first(g)
    second(g)
    expect(rooms).toEqual([true, false, false])
  })

  it('never refuses an action the player asked for: an action context needs no slot and takes none', () => {
    const g = probeGame(1)
    g.yearActions['pace.kit'] = 1
    const store = defineCareerState({ key: 'slotf.sim', version: 1, migrate: [(r) => ({ ...r })], extra: () => ({}) })
    const c = careerCtx(g, 'slotf', store.mut(g), { ...ACTION_BUDGET })
    expect(choiceRoom(c)).toBe(true)
    expect(offerChoice(c, 'career.slotf.none', 'Pitch', 'Pick one. What will you do?', [{ id: 'a', label: 'A', emoji: '\u{1F4BC}' }], {}, '\u{1F4BC}')).toBe(true)
    expect(yearActionsUsed(g, 'pace.kit')).toBe(1)
  })

  it('keeps the pending cap of 2 career choices for an action too', () => {
    const g = probeGame(1)
    const store = defineCareerState({ key: 'slotg.sim', version: 1, migrate: [(r) => ({ ...r })], extra: () => ({}) })
    const c = careerCtx(g, 'slotg', store.mut(g), { ...ACTION_BUDGET })
    const ask = (): boolean => offerChoice(c, 'career.slotg.none', 'Pitch', 'Pick one. What will you do?', [{ id: 'a', label: 'A', emoji: '\u{1F4BC}' }], {}, '\u{1F4BC}')
    expect(ask()).toBe(true)
    expect(ask()).toBe(true)
    expect(pendingCareerChoices(g)).toBe(2)
    expect(ask()).toBe(false)
  })
})
