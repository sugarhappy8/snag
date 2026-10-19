import { afterEach, describe, expect, it } from 'vitest'
import { randFloat } from '../src/game/rng'
import { runScript } from '../src/game/scripts'
import { yearlySpecial } from '../src/game/special'
import { scriptChoice } from '../src/game/core'
import { actorJob, genListings, yearlyActor, type Listing } from '../src/game/special/actor'
import { TYPE_IDS } from '../src/game/special/actor-data'
import {
  CONTRACT_SCRIPT,
  auditionBlock,
  awardsCampaign,
  backEnd,
  closeYear,
  contractEV,
  feeMult,
  hireCostars,
  landProject,
  payActor,
  pressTour,
  pushOdds,
  releaseFilm,
  seasonTv,
  setWindow,
  slotBlock,
  stepAwards,
  stepDry,
  stepResiduals,
  stepWrap,
  walkAway,
  wrapShoot,
  developProject,
} from '../src/game/special/actor-pipeline'
import { actorSim } from '../src/game/special/actor-sim'
import { actorStore, adoptLegacy, type ActorState, type Proj } from '../src/game/special/actor-state'
import { ACTOR_SPEC, breakEvenOf, clashOf, grossOf, scaleOf } from '../src/game/special/actor-world'
import { hire, ownerKey } from '../src/game/special/common'
import { CAREER_SIMS, yearlyCareerSims } from '../src/game/special/kit/careers'
import { activeField } from '../src/game/special/kit/rivals'
import { ACTION_BUDGET, careerCtx, setCareerAudit, type AuditEvent, type CareerCtx } from '../src/game/special/kit/year'
import type { ChoiceModal, GameState, Json, ModalItem } from '../src/game/types'
import { assertMenuPure, careerRoots, checkLedger, nextYear } from './career-kit'
import { makeTestGame } from './helpers'

const FLAG = 'special.actor.sim'
const LEGACY = 'special.actor'

const listing = (o: Partial<Listing> = {}): Listing => ({ title: 'The Silent Harbor', kind: 'film', genre: 'Drama', role: 'Lead', studio: 'Silverline Studios', pay: 400_000, budget: 'studio', ...o })

/** A notice-kind modal: runScript keeps no replay token for it, so a script's own guards are what is tested. */
let serial = 0
const fake = (): ModalItem => ({ kind: 'notice', id: `t${++serial}`, title: '', text: '' })

const ctxOf = (g: GameState, s: ActorState = actorStore.mut(g)): CareerCtx<ActorState> => careerCtx(g, 'actor', s, { ...ACTION_BUDGET })

const agent = (o: Partial<{ quality: number; cut: number }> = {}) => ({ personId: '', name: 'Mia Chen', firm: 'Starlight Talent', quality: 40, cut: 0.1, loyalty: 60, since: 1995, ...o })

/** A 1995 life with an actor job, an adopted record and a trained actor (no project, no credits). */
function newActor(seed = 5, o: { year?: number; country?: string; skill?: number; gifted?: boolean } = {}): { g: GameState; s: ActorState } {
  const g = makeTestGame(seed, { age: 30, countryId: o.country ?? 'us' })
  g.year = o.year ?? 1995
  g.flags['skill.acting'] = o.skill ?? 60
  g.character.money = 100_000
  if (o.gifted) g.character.talents = ['Acting']
  hire(g, { defId: 'actor', title: 'Actor', company: 'Silverline Studios', salary: 0, data: { project: null } })
  const s = actorStore.mut(g)
  adoptLegacy(g, s)
  return { g, s }
}

/** Answers the queued contract choice the way the player would, then drops everything else. */
function answer(g: GameState, choice = 'sign'): void {
  const m = g.queue.find((x): x is ChoiceModal => x.kind === 'choice' && x.scriptId === CONTRACT_SCRIPT)
  if (m) runScript(g, CONTRACT_SCRIPT, choice, m.data, m)
  g.queue = []
}

/** Lands a listing and answers its contract: the project is shooting. */
function land(g: GameState, l: Listing, choice = 'sign'): Proj {
  const p = landProject(ctxOf(g), l, l.role)
  if (!p) throw new Error('did not land')
  answer(g, choice)
  const now = actorStore.view(g).pipeline.find((x) => x.id === p.id)
  if (!now) throw new Error('lost the project')
  return now
}

const proj = (o: Partial<Proj> = {}): Proj => ({
  id: 'p9',
  title: 'The Last Echo',
  kind: 'film',
  genre: 'Drama',
  type: 'drama',
  role: 'Lead',
  studio: 'Silverline Studios',
  studioId: '',
  industry: 'hollywood',
  budget: 'studio',
  terms: { fee: 1_000_000, points: 0, exclusive: false },
  stage: 'post',
  developed: 0,
  buzz: 0,
  campaign: 0,
  season: 1,
  director: 65,
  costars: [],
  window: 'normal',
  quality: 70,
  since: 1994,
  lastYear: 1994,
  ...o,
})

const big = (n: number): string => 'x'.repeat(n)

/** Number of nodes (values, arrays and objects) in a value. */
function nodes(v: unknown): number {
  if (Array.isArray(v)) return 1 + v.reduce((n: number, x) => n + nodes(x), 0)
  if (v && typeof v === 'object') return 1 + Object.values(v).reduce((n: number, x) => n + nodes(x), 0)
  return 1
}

/** The state without the queue and the id counter: what a refusal must leave alone. */
const quiet = (g: GameState): string => JSON.stringify({ ...g, queue: [], nextId: 0 })

const hookBoth = (g: GameState): void => {
  yearlyActor(g)
  actorSim.yearly(g)
}

afterEach(() => setCareerAudit(null))

describe('actor pipeline: landing and contracts', () => {
  it('landing hires at once and queues one contract choice with four options [RF3]', () => {
    const g = makeTestGame(5, { age: 30 })
    g.year = 1995
    const p = landProject(ctxOf(g), listing(), 'Lead')
    expect(p?.stage).toBe('offer')
    expect(g.character.job?.defId).toBe('actor')
    const modals = g.queue.filter((x): x is ChoiceModal => x.kind === 'choice')
    expect(modals).toHaveLength(1)
    expect(modals[0].scriptId).toBe(CONTRACT_SCRIPT)
    expect(modals[0].choices.map((c) => c.id)).toEqual(['sign', 'points', 'exclusive', 'push'])
    for (const c of modals[0].choices) expect(c.label.split(' ').length).toBeLessThanOrEqual(5)

    runScript(g, CONTRACT_SCRIPT, 'sign', modals[0].data, modals[0])
    expect(actorStore.view(g).pipeline.map((x) => x.stage)).toEqual(['shoot'])
    const once = JSON.stringify(g)
    // the same modal again, a fresh copy of it, another owner and another year all change nothing
    runScript(g, CONTRACT_SCRIPT, 'points', modals[0].data, modals[0])
    runScript(g, CONTRACT_SCRIPT, 'points', modals[0].data, fake())
    runScript(g, CONTRACT_SCRIPT, 'points', { ...(modals[0].data as object), owner: 'someone-else' } as Json, fake())
    expect(JSON.stringify(g)).toBe(once)
    const later = makeTestGame(5, { age: 30 })
    later.year = 1995
    landProject(ctxOf(later), listing(), 'Lead')
    const stale = later.queue.find((x): x is ChoiceModal => x.kind === 'choice')!
    later.year = 1996
    const before = JSON.stringify(later)
    runScript(later, CONTRACT_SCRIPT, 'points', stale.data, fake())
    expect(JSON.stringify(later)).toBe(before)
  })

  it('shapes each contract option and rolls push on the odds it hints', () => {
    const fees: Record<string, number> = {}
    for (const choice of ['sign', 'points', 'exclusive']) {
      const { g } = newActor(11)
      const p = land(g, listing(), choice)
      fees[choice] = p.terms.fee
      if (choice === 'points') expect(p.terms.points).toBeGreaterThan(0)
      if (choice === 'points') expect(p.terms.points).toBeLessThanOrEqual(0.12)
      if (choice === 'exclusive') expect(p.terms.exclusive).toBe(true)
      if (choice === 'sign') expect(p.terms.exclusive).toBe(false)
    }
    expect(fees.points).toBe(Math.round(fees.sign * 0.8))
    expect(fees.exclusive).toBe(Math.round(fees.sign * 1.2))
    // push: over many seeds the fee is x1.3, as offered, or the offer lapses
    const seen = new Set<string>()
    for (let seed = 1; seed <= 60; seed++) {
      const { g } = newActor(seed)
      landProject(ctxOf(g), listing(), 'Lead')
      const base = actorStore.view(g).pipeline[0].terms.fee
      answer(g, 'push')
      const left = actorStore.view(g).pipeline[0]
      seen.add(!left ? 'lapsed' : left.terms.fee === Math.round(base * 1.3) ? 'raised' : left.terms.fee === base ? 'asis' : 'odd')
    }
    expect([...seen].sort()).toEqual(['asis', 'lapsed', 'raised'])
  })

  it('marks the best contract with a purple hint only for the gifted, and prints no promise', () => {
    for (const gifted of [true, false]) {
      const { g } = newActor(5, { gifted })
      landProject(ctxOf(g), listing(), 'Lead')
      const m = g.queue.find((x): x is ChoiceModal => x.kind === 'choice')!
      const hinted = m.choices.filter((c) => c.hint)
      expect(hinted).toHaveLength(gifted ? 1 : 0)
      for (const c of hinted) expect(c.hint).not.toMatch(/\bwill\b/)
    }
  })

  it('runs a film and a series together and blocks two films', () => {
    const { g } = newActor(6)
    land(g, listing({ title: 'Film One' }))
    const view = actorStore.view(g)
    expect(slotBlock(view, { kind: 'film', role: 'Lead' })).toMatch(/film/)
    expect(slotBlock(view, { kind: 'tv', role: 'Lead' })).toBeNull()
    expect(slotBlock(view, { kind: 'film', role: 'Extra' })).toBeNull()
    const series = land(g, listing({ title: 'Series One', kind: 'tv', genre: 'Sitcom', budget: 'network', pay: 60_000 }))
    expect(series.kind).toBe('tv')
    expect(actorStore.view(g).pipeline).toHaveLength(2)
    expect(slotBlock(actorStore.view(g), { kind: 'tv', role: 'Supporting' })).toMatch(/series/)
    // a third project of either kind is refused inside landProject, with nothing changed but the notice
    const before = quiet(g)
    expect(landProject(ctxOf(g), listing({ title: 'Film Two' }), 'Lead')).toBeNull()
    expect(quiet(g)).toBe(before)
  })

  it('counts four projects, post included, and lets extras walk on', () => {
    const { g, s } = newActor(6)
    s.pipeline = ['a', 'b', 'c'].map((id, i) => proj({ id: `p${i + 1}`, title: `T${id}`, stage: 'post', kind: i === 1 ? 'tv' : 'film' }))
    expect(slotBlock(s, { kind: 'film', role: 'Lead' })).toBeNull() // post does not occupy a film slot
    s.pipeline.push(proj({ id: 'p4', stage: 'post' }))
    expect(slotBlock(s, { kind: 'film', role: 'Lead' })).toMatch(/four/)
    expect(slotBlock(s, { kind: 'film', role: 'Extra' })).toMatch(/four/)
    expect(g.character.job).not.toBeNull()
  })

  it('blocks an exclusive deal inside pickRoleScript with the menu bypassed', () => {
    const { g, s } = newActor(7)
    s.pipeline = [proj({ id: 'p1', stage: 'shoot', terms: { fee: 100_000, points: 0, exclusive: true } })]
    expect(auditionBlock(g, s)).toMatch(/exclusive/)
    g.flags['special.list.actor.roles'] = { age: g.character.age, owner: ownerKey(g), items: [listing({ role: 'Extra', pay: 900 })] } as unknown as Json
    const before = quiet(g)
    runScript(g, 'special.actor.pick', '0', undefined, fake())
    expect(quiet(g)).toBe(before)
    expect(g.queue.map((m) => m.kind)).toEqual(['notice']) // the refusal says why, and no audition opened
    // lay-low blocks it too
    const { g: h, s: t } = newActor(7)
    t.layLow = h.year
    expect(auditionBlock(h, t)).toMatch(/laying low/)
    t.layLow = h.year - 1
    expect(auditionBlock(h, t)).toBeNull()
  })

  it('refuses a same-kind second shoot inside pickRoleScript before an audition is used', () => {
    const { g } = newActor(7)
    land(g, listing({ title: 'Film One' }))
    g.flags['special.list.actor.roles'] = { age: g.character.age, owner: ownerKey(g), items: [listing({ title: 'Film Two' })] } as unknown as Json
    const before = quiet(g)
    runScript(g, 'special.actor.pick', '0', undefined, fake())
    expect(quiet(g)).toBe(before)
    expect(g.yearActions['actor.audition']).toBeUndefined()
  })

  it('names the top rival on a lost audition and adds grudge 10', () => {
    const { g } = newActor(8, { skill: 0 })
    const type = 'drama'
    const top = activeField(g, ACTOR_SPEC, []).find((x) => x.rival.edge === type)!
    expect(top).toBeDefined()
    runScript(g, 'special.actor.audition', 'heartfelt', listing({ role: 'Lead' }) as unknown as Json, fake())
    const row = actorStore.view(g).memory.find((m) => m.id === top.rival.id)
    expect(row?.grudge).toBe(10)
    expect(row?.name).toBe(top.rival.name)
    const note = g.queue.find((m) => m.kind === 'notice')
    expect(note && note.kind === 'notice' && note.text).toContain(top.rival.name)
    expect(actorJob(g)?.defId).toBe('actor')
    expect(actorStore.view(g).pipeline).toHaveLength(0)
    expect(actorStore.view(g).rep).toBe(49)

    // the same audition on a life with no record is the legacy one: no record, no memory, reputation 49 in the old profile
    const plain = makeTestGame(8, { age: 30 })
    plain.year = 1995
    plain.flags['skill.acting'] = 0
    runScript(plain, 'special.actor.audition', 'heartfelt', listing({ role: 'Lead' }) as unknown as Json, fake())
    expect(actorStore.peek(plain)).toBeNull()
    expect(plain.flags[FLAG]).toBeUndefined()
    expect((plain.flags[LEGACY] as { reputation: number }).reputation).toBe(49)
  })

  it('resolves a legacy special.actor.pick modal queued before the first sim tick [RF4]', () => {
    const g = makeTestGame(9, { age: 30 })
    g.year = 1995
    g.flags['skill.acting'] = 95
    g.flags[LEGACY] = { owner: ownerKey(g), reputation: 62, credits: [], awards: [], nominations: 0, agent: null, dryYears: 0 } as unknown as Json
    g.flags['special.list.actor.roles'] = { age: g.character.age, owner: ownerKey(g), items: [listing({ role: 'Extra', pay: 900, studio: 'Big Sky Films', budget: 'indie', title: 'Ha Ha Heist', genre: 'Comedy' })] } as unknown as Json
    const legacy = JSON.stringify(g.flags[LEGACY])
    runScript(g, 'special.actor.pick', '0', undefined, fake())
    const audition = g.queue.find((x): x is ChoiceModal => x.kind === 'choice')!
    expect(audition.scriptId).toBe('special.actor.audition')
    runScript(g, 'special.actor.audition', 'comedic', audition.data, audition)
    expect(g.character.job?.defId).toBe('actor')
    expect(actorStore.view(g).pipeline.map((p) => p.title)).toEqual(['Ha Ha Heist'])
    expect(actorStore.view(g).pipeline[0].stage).toBe('shoot')
    expect(JSON.stringify(g.flags[LEGACY])).toBe(legacy)
    expect(g.character.job?.data.project ?? null).toBeNull()
  })

  it('offers no streaming role in 1960, no cable before 1980 and no blockbuster before 1975', () => {
    const budgets = (year: number, seeds = 30): Set<string> => {
      const out = new Set<string>()
      for (let seed = 1; seed <= seeds; seed++) {
        const g = makeTestGame(seed, { age: 30 })
        g.year = year
        for (const l of genListings(g)) out.add(l.budget)
      }
      return out
    }
    const y1960 = budgets(1960)
    for (const b of ['streaming', 'cable', 'blockbuster']) expect(y1960.has(b)).toBe(false)
    const y1979 = budgets(1979)
    expect(y1979.has('cable')).toBe(false)
    expect(y1979.has('blockbuster')).toBe(true)
    const y1990 = budgets(1990)
    expect(y1990.has('cable')).toBe(true)
    expect(y1990.has('streaming')).toBe(false)
    expect(budgets(2026).has('streaming')).toBe(true)
  })

  it('scales listing fees by industry and gives a signature genre 40% of an industry', () => {
    const avgPay = (country: string, year: number): number => {
      let sum = 0
      let n = 0
      for (let seed = 1; seed <= 25; seed++) {
        const g = makeTestGame(seed, { age: 30, countryId: country })
        g.year = year
        for (const l of genListings(g)) {
          sum += l.pay
          n++
        }
      }
      return sum / n
    }
    expect(avgPay('in', 2000)).toBeLessThan(avgPay('us', 2000) * 0.6)
    const genres = (country: string, year: number): string[] => {
      const out: string[] = []
      for (let seed = 1; seed <= 40; seed++) {
        const g = makeTestGame(seed, { age: 30, countryId: country })
        g.year = year
        out.push(...genListings(g).map((l) => l.genre))
      }
      return out
    }
    const share = (list: string[], genre: string): number => list.filter((x) => x === genre).length / list.length
    expect(share(genres('in', 2000), 'Bollywood')).toBeGreaterThan(0.25)
    expect(share(genres('in', 2000), 'Bollywood')).toBeLessThan(0.55)
    expect(share(genres('kr', 2005), 'K-Drama')).toBeGreaterThan(0.2)
    expect(share(genres('us', 2000), 'Bollywood')).toBe(0)
    expect(share(genres('ng', 2000), 'Nollywood Drama')).toBeGreaterThan(0.25)
    expect(share(genres('hk', 1990), 'Martial Arts')).toBeGreaterThan(0.25)
  })

  it('forces the terms in studio-system years', () => {
    const { g } = newActor(5, { year: 1950 })
    const p = landProject(ctxOf(g), listing(), 'Lead')!
    expect(p.stage).toBe('shoot')
    expect(p.terms.exclusive).toBe(true)
    expect(p.terms.points).toBe(0)
    expect(p.terms.fee).toBe(Math.round(400_000 * 0.7))
    expect(g.queue.some((m) => m.kind === 'choice')).toBe(false) // nothing to negotiate
    expect(actorStore.view(g).studioFrom).toBe(1950)
    // ...and not afterwards
    const { g: later } = newActor(5, { year: 1975 })
    expect(landProject(ctxOf(later), listing(), 'Lead')!.stage).toBe('offer')
  })

  it('applies the agent, scandal, typecast and fee modifiers once, at landing', () => {
    const { g, s } = newActor(5)
    const base = landProject(ctxOf(g), listing({ role: 'Supporting', pay: 100_000 }), 'Supporting')!.terms.fee
    expect(base).toBe(100_000)
    const { g: h, s: t } = newActor(5)
    t.team.agent = { ...agent({ quality: 80 }) }
    const withAgent = landProject(ctxOf(h, t), listing({ role: 'Supporting', pay: 100_000 }), 'Supporting')!.terms.fee
    expect(withAgent).toBe(Math.round(100_000 * (1 + 80 / 400)))
    expect(s.scandal).toBe(0)
    const x = actorStore.read({ v: 1, scandal: 50, type: { drama: 60 }, cool: { 'fee.up': 2000, 'fee.down': 1990, 'fee.film': 2000, 'franchise.drama': 2 } }, g)
    expect(feeMult(x, 2000, { kind: 'film', type: 'drama' })).toBeCloseTo((1 - 50 / 250) * 1.2 * 1.1 * 1.1 * 1.5, 6)
    expect(feeMult(x, 2000, { kind: 'tv', type: 'comedy' })).toBeCloseTo((1 - 50 / 250) * 1.1, 6)
    expect(feeMult(x, 2001, { kind: 'film', type: 'comedy' })).toBeCloseTo(1 - 50 / 250, 6)
  })

  it('clamps push odds and ranks contracts by expected value', () => {
    const { g, s } = newActor(5)
    for (const star of [0, 50, 100]) for (const q of [0, 90]) for (const others of [0, 3, 9]) {
      s.standing = star
      s.team.agent = { ...agent({ quality: q }) }
      s.team.manager = { ...agent({ quality: q }) }
      const p = pushOdds(s, listing(), others)
      expect(p).toBeGreaterThanOrEqual(0.1)
      expect(p).toBeLessThanOrEqual(0.85)
    }
    s.standing = 0
    s.team.agent = null
    s.team.manager = null
    expect(pushOdds(s, listing(), 0)).toBeCloseTo(0.3, 6)
    expect(pushOdds(s, listing(), 3)).toBeCloseTo(0.3 + 0.18, 6)
    const l = listing()
    const evs = (['sign', 'points', 'exclusive', 'push'] as const).map((o) => contractEV(g, s, l, o))
    for (const v of evs) expect(Number.isFinite(v)).toBe(true)
    expect(evs[2]).toBeLessThan(evs[0] * 1.2) // exclusive pays x1.2 but costs a quarter fee
  })
})

describe('actor pipeline: the year', () => {
  it('wraps a studio film into post, pays the fee less the cut, and releases it a year later', () => {
    const { g, s } = newActor(5)
    s.team.agent = agent({ quality: 40, cut: 0.1 })
    const p = land(g, listing())
    const fee = p.terms.fee
    expect(fee).toBe(Math.round(400_000 * 1.1))
    const m0 = g.character.money
    nextYear(g, actorSim.yearly)
    let v = actorStore.view(g)
    expect(g.character.money - m0).toBe(fee - Math.round(fee * 0.1))
    expect(v.pipeline.map((x) => x.stage)).toEqual(['post'])
    expect(v.credits).toHaveLength(0)
    const m1 = g.character.money
    nextYear(g, actorSim.yearly)
    v = actorStore.view(g)
    expect(v.pipeline).toHaveLength(0)
    expect(v.credits).toHaveLength(1)
    expect(v.credits[0].gross).toBeGreaterThan(0)
    expect(g.character.money).toBeGreaterThanOrEqual(m1) // nothing but residual or back-end money comes in
    expect(actorJob(g)?.salary).toBe(0)
  })

  it('releases an indie film and a series season in the wrap tick', () => {
    const { g } = newActor(5)
    land(g, listing({ title: 'Small Film', budget: 'indie', pay: 50_000 }))
    land(g, listing({ title: 'Series Run', kind: 'tv', genre: 'Sitcom', budget: 'network', pay: 80_000 }))
    nextYear(g, actorSim.yearly)
    const v = actorStore.view(g)
    expect(v.credits.map((c) => c.title).sort()).toEqual(['Series Run', 'Small Film'])
    expect(v.pipeline.some((p) => p.title === 'Small Film')).toBe(false)
    const tv = v.credits.find((c) => c.kind === 'tv')!
    expect(tv.seasons).toBe(1)
    expect(tv.gross).toBeGreaterThan(0)
    // a renewed series shoots again next year and earns a second season
    const renewed = v.pipeline.find((p) => p.title === 'Series Run')
    if (renewed) {
      expect(renewed.season).toBe(2)
      expect(renewed.stage).toBe('shoot')
      expect(renewed.terms.fee).toBeGreaterThan(80_000)
    }
  })

  it('keeps gross curve points through the wrap', () => {
    const g = makeTestGame(3, { age: 30 })
    g.year = 2000
    const type = TYPE_IDS.find((t) => !clashOf(g, 'hollywood', t, 2000))!
    const o = { luck: 1, year: 2000, leisure: 1, trend: 1 }
    const r = (q: number): number => {
      const p = proj({ type, quality: q })
      return grossOf(g, p, o) / breakEvenOf(p, 1)
    }
    expect(r(55)).toBeLessThan(0.85)
    expect(r(70)).toBeGreaterThanOrEqual(0.95)
    expect(r(70)).toBeLessThanOrEqual(1.15)
    expect(r(85)).toBeGreaterThanOrEqual(1.3)
    expect(r(85)).toBeLessThanOrEqual(1.5)
    // releaseFilm rolls the one luck draw and prices the release with the same formula
    for (const q of [55, 70, 85]) {
      const { g: h, s } = newActor(4, { year: 2000 })
      const p = proj({ id: 'p1', type, quality: q })
      s.pipeline = [p]
      h.rng = 1234 + q
      const luck = randFloat({ rng: h.rng } as GameState, 0.6, 1.5)
      releaseFilm(ctxOf(h, s), p)
      const credit = s.credits[s.credits.length - 1]
      const expected = Math.round(grossOf(h, p, { luck }))
      expect(Math.abs(credit.gross - expected)).toBeLessThanOrEqual(1)
      const be = breakEvenOf(p, scaleOf(h, 'hollywood'))
      expect(credit.popularity).toBe(Math.max(0, Math.min(100, Math.round(50 + 28 * Math.log(Math.max(1, credit.gross) / be)))))
      expect(s.pipeline).toHaveLength(0)
    }
  })

  it('pays back-end only above break-even', () => {
    const p = proj({ terms: { fee: 1_000_000, points: 0.02, exclusive: false } })
    const be = breakEvenOf(p, 1)
    expect(backEnd(p, be * 0.9, 1)).toBe(0)
    expect(backEnd(p, be * 2, 1)).toBeCloseTo(p.terms.points * be, -1)
    expect(backEnd(proj({ terms: { fee: 1, points: 0.12, exclusive: false } }), be * 1000, 1)).toBe(8_000_000)
    expect(backEnd(proj({ terms: { fee: 1, points: 0.12, exclusive: false } }), be * 1000, 0.25)).toBe(2_000_000)
  })

  it('splits every payment into gross, cut and net, with the cut capped at 30%', () => {
    const { g, s } = newActor(5)
    s.team.agent = agent({ cut: 0.14 })
    s.team.manager = agent({ cut: 0.17 })
    const c = ctxOf(g, s)
    const before = g.character.money
    const net = payActor(c, 100_000, 'Silverline Studios')
    expect(net).toBe(70_000)
    expect(g.character.money - before).toBe(70_000)
    expect(s.totals).toMatchObject({ gross: 100_000, cuts: 30_000, net: 70_000 })
    expect(payActor(c, 0, 'Nobody')).toBe(0)
    expect(s.totals.net).toBe(70_000)
  })

  it('settles once per (year, age) [RF3]', () => {
    const { g } = newActor(5)
    land(g, listing({ budget: 'indie' }))
    g.year += 1
    g.character.age += 1
    actorSim.yearly(g)
    const once = JSON.stringify(g)
    const rng = JSON.stringify(g.rng)
    actorSim.yearly(g)
    expect(JSON.stringify(g)).toBe(once)
    expect(JSON.stringify(g.rng)).toBe(rng)
  })

  it('conserves money [RF3]', () => {
    const { g, s } = newActor(5)
    s.team.agent = agent({ quality: 40, cut: 0.1 })
    s.credits = actorStore.read({ v: 1, credits: [{ id: 'c1', title: 'Old Film', kind: 'film', role: 'Lead', genre: 'Drama', type: 'drama', industry: 'hollywood', studio: '', year: 1990, age: 25, pay: 1000, quality: 70, popularity: 60, gross: 1, backend: 0, seasons: 1, verdict: 'released', residual: 40_000, trust: false }] }, g).credits
    land(g, listing({ title: 'Studio Picture', pay: 300_000 }))
    land(g, listing({ title: 'Network Show', kind: 'tv', genre: 'Sitcom', budget: 'network', pay: 90_000 }))
    const events: AuditEvent[] = []
    setCareerAudit((e) => events.push(e))
    const m0 = g.character.money
    for (let i = 0; i < 5; i++) nextYear(g, actorSim.yearly)
    const earned = events.filter((e) => e.t === 'earn').reduce((n, e) => n + (e.t === 'earn' ? e.amount : 0), 0)
    const paid = events.filter((e) => e.t === 'pay').reduce((n, e) => n + (e.t === 'pay' ? e.amount : 0), 0)
    const v = actorStore.view(g)
    expect(earned).toBeGreaterThan(0)
    expect(g.character.money - m0).toBe(earned - paid)
    expect(v.totals.net).toBe(earned)
    expect(v.totals.gross - v.totals.cuts).toBe(v.totals.net)
    expect(v.totals.cuts).toBeGreaterThan(0)
    expect(checkLedger(events, g).filter((x) => !x.startsWith('note-'))).toEqual([])
    expect(v.rows).toHaveLength(5)
    expect(v.rows.reduce((n, r) => n + r.income, 0)).toBe(earned)
  })

  it('pays residuals through the ledger, decays them, zeroes the small ones and skips a trust', () => {
    const { g, s } = newActor(5)
    const row = (id: string, residual: number, trust = false) => ({ id, title: id, kind: 'film', role: 'Lead', genre: 'Drama', type: 'drama', industry: 'hollywood', studio: '', year: 1990, age: 25, pay: 1000, quality: 70, popularity: 60, gross: 1, backend: 0, seasons: 1, verdict: 'released', residual, trust })
    s.credits = actorStore.read({ v: 1, credits: [row('c1', 1000), row('c2', 20), row('c3', 5000, true)] }, g).credits
    const m0 = g.character.money
    stepResiduals(ctxOf(g, s))
    expect(g.character.money - m0).toBe(1000)
    expect(s.credits[0].residual).toBeLessThan(1000)
    expect(s.credits[0].residual).toBeGreaterThanOrEqual(750)
    expect(s.credits[1].residual).toBe(0)
    expect(s.credits[2].residual).toBe(5000)
  })

  it('counts a dry year only for an actor who has worked, then costs fame and scandal falls', () => {
    const { g, s } = newActor(5)
    g.character.hidden.fame = 40
    for (let i = 0; i < 3; i++) nextYear(g, actorSim.yearly)
    expect(actorStore.view(g).dry).toBe(0) // a newcomer has not lost a run yet
    expect(g.character.hidden.fame).toBe(40)
    s.credits = actorStore.read({ v: 1, credits: [{ id: 'c1', title: 'Old', kind: 'film', role: 'Lead', genre: 'Drama', type: 'drama', industry: 'hollywood', studio: '', year: 1990, age: 25, pay: 1000, quality: 70, popularity: 60, gross: 1, backend: 0, seasons: 1, verdict: 'released', residual: 0, trust: false }], scandal: 60 }, g).credits
    const t = actorStore.mut(g)
    t.credits = s.credits
    t.scandal = 60
    nextYear(g, actorSim.yearly)
    nextYear(g, actorSim.yearly)
    const v = actorStore.view(g)
    expect(v.dry).toBe(2)
    expect(g.character.hidden.fame).toBeLessThan(40)
    expect(v.scandal).toBeLessThan(60)
    expect(v.scandal).toBeGreaterThanOrEqual(30)
  })

  it('pays a retainer in a dry studio-system year for seven years at most', () => {
    const retainers = (year: number): { fee: number; paid: number[] } => {
      const { g } = newActor(5, { year })
      const p = land(g, listing({ pay: 100_000 }))
      const events: AuditEvent[] = []
      setCareerAudit((e) => events.push(e))
      const paid: number[] = []
      for (let i = 0; i < 8; i++) {
        const mark = events.length
        nextYear(g, actorSim.yearly)
        paid.push(events.slice(mark).filter((e) => e.t === 'earn' && e.label === 'Studio retainer').reduce((n, e) => n + (e.t === 'earn' ? e.amount : 0), 0))
      }
      return { fee: p.terms.fee, paid }
    }
    // 1940: wrap to post, release, then dry studio-system years pay 40% of the last fee
    const early = retainers(1940)
    expect(early.paid[0]).toBe(0)
    expect(early.paid[1]).toBe(0)
    expect(early.paid[2]).toBe(Math.round(early.fee * 0.4))
    expect(early.paid.filter((x) => x > 0).length).toBeLessThanOrEqual(7)
    // 1955: the last studio year, so the retainer stops once the studio-system years are over
    const late = retainers(1955)
    expect(late.paid.every((x) => x === 0)).toBe(true)
  })

  it('awards nominate and name the rival beside you', () => {
    let nominated = 0
    let won = 0
    for (let seed = 1; seed <= 80; seed++) {
      const { g, s } = newActor(seed, { year: 2000 })
      const p = proj({ id: 'p1', quality: 92, buzz: 40, campaign: 20, stage: 'post' })
      s.pipeline = [p]
      s.rep = 80
      const c = ctxOf(g, s)
      releaseFilm(c, p)
      const before = s.noms
      stepAwards(c)
      if (s.noms > before) {
        nominated++
        const mem = s.memory.filter((m) => m.met >= 1)
        expect(mem.length).toBe(1)
        if (s.awards.length) {
          won++
          expect(mem[0].grudge).toBe(15)
          expect(s.awards[0]).toMatch(/Golden Reel/)
          expect(s.awards[0]).not.toContain('\u2014')
        } else expect(mem[0].lost).toBe(1)
      }
    }
    expect(nominated).toBeGreaterThan(20)
    expect(won).toBeGreaterThan(0)
    expect(won).toBeLessThan(nominated)
  })

  it('lets the sim own a migrated life: yearlyActor returns at once [RF4]', () => {
    const { g } = newActor(5)
    land(g, listing({ budget: 'indie' }))
    g.year += 1
    g.character.age += 1
    const before = JSON.stringify(g)
    const rng = g.rng
    yearlyActor(g)
    expect(JSON.stringify(g)).toBe(before)
    expect(g.rng).toBe(rng)
  })

  it('adopts a legacy life on the first sim tick and settles from the second [RF4]', () => {
    const g = makeTestGame(6, { age: 30 })
    g.year = 1995
    g.flags['skill.acting'] = 60
    g.flags[LEGACY] = { owner: ownerKey(g), reputation: 62, credits: [], awards: [], nominations: 0, agent: null, dryYears: 0 } as unknown as Json
    hire(g, { defId: 'actor', title: 'Lead Actor', company: 'Silverline Studios', salary: 400_000, data: { project: { title: 'The Last Echo', kind: 'film', genre: 'Drama', role: 'Lead', studio: 'Silverline Studios', pay: 400_000, budget: 'indie', developed: 0, buzz: 0, season: 1, costars: [] } } })
    const legacyBefore = JSON.stringify(g.flags[LEGACY])
    nextYear(g, hookBoth)
    let v = actorStore.view(g)
    expect(v.migrated).toBe(true)
    expect(v.rows).toHaveLength(1)
    expect(v.pipeline).toHaveLength(0) // the legacy hook settled the project this year
    expect(g.character.job?.data.project ?? null).toBeNull()
    const legacyAfter = JSON.parse(JSON.stringify(g.flags[LEGACY])) as { credits: unknown[]; reputation: number }
    expect(legacyAfter.credits).toHaveLength(1)
    expect(JSON.stringify(g.flags[LEGACY])).not.toBe(legacyBefore) // the legacy hook wrote it once, before adoption
    const frozen = JSON.stringify(g.flags[LEGACY])
    nextYear(g, hookBoth)
    v = actorStore.view(g)
    expect(v.rows).toHaveLength(2)
    expect(v.rows[1].y).toBe(1997)
    expect(JSON.stringify(g.flags[LEGACY])).toBe(frozen) // the legacy flag is never written again
  })

  it('still resolves a legacy pick modal queued before the sim took the life over [RF4]', () => {
    const g = makeTestGame(6, { age: 30 })
    g.year = 1995
    g.flags['skill.acting'] = 60
    g.flags[LEGACY] = { owner: ownerKey(g), reputation: 62, credits: [], awards: [], nominations: 0, agent: null, dryYears: 0 } as unknown as Json
    hire(g, { defId: 'actor', title: 'Actor', company: 'Silverline Studios', salary: 0, data: { project: null } })
    scriptChoice(g, 'special.actor.pick', 'Auditions', 'These roles are casting right now.', [{ id: '0', label: 'A role' }, { id: 'cancel', label: 'Not now' }])
    const queued = g.queue[0] as ChoiceModal
    nextYear(g, hookBoth) // the first sim tick adopts the life
    expect(actorStore.view(g).migrated).toBe(true)
    g.queue = []
    expect(() => runScript(g, 'special.actor.pick', '0', undefined, queued)).not.toThrow()
    const next = g.queue.find((x): x is ChoiceModal => x.kind === 'choice')
    expect(next?.scriptId).toBe('special.actor.audition')
  })

  it('drops unfinished shoots with the job and still opens a film that is in post', () => {
    const { g } = newActor(5)
    land(g, listing({ title: 'Unfinished', budget: 'indie' }))
    land(g, listing({ title: 'Series Not Shot', kind: 'tv', genre: 'Sitcom', budget: 'network', pay: 70_000 }))
    const t = actorStore.mut(g)
    t.pipeline = [...t.pipeline, proj({ id: 'p7', title: 'In Post', stage: 'post', lastYear: g.year - 1 })]
    g.character.job = null // quit, or another career took the job
    const m0 = g.character.money
    nextYear(g, actorSim.yearly)
    const v = actorStore.view(g)
    expect(v.pipeline).toHaveLength(0)
    expect(v.credits.map((c) => c.title)).toEqual(['In Post'])
    expect(g.character.money).toBeGreaterThanOrEqual(m0) // no fee for work never done
  })

  it('leaves a life with no actor job and no record byte-identical [RF4]', () => {
    const g = makeTestGame(8, { age: 30 })
    g.year = 1995
    const before = JSON.stringify(g)
    const rng = g.rng
    yearlyActor(g)
    actorSim.yearly(g)
    yearlyCareerSims(g)
    expect(JSON.stringify(g)).toBe(before)
    expect(g.rng).toBe(rng)
    expect(CAREER_SIMS.map((x) => x.id)).toContain('actor')
    // the whole special year (other careers book their own markers) leaves no actor trace on such a life
    const h = makeTestGame(8, { age: 30 })
    h.year = 1995
    yearlySpecial(h)
    expect(Object.keys(h.flags).filter((k) => k.includes('actor'))).toEqual([])
    expect(h.character.job).toBeNull()
  })

  it('keeps junk sim records harmless [RF1]', () => {
    const junk: unknown[] = [
      null,
      [],
      'x',
      { rows: 'bad', memory: [1, {}], standing: Number.NaN, cool: { a: 'x' }, done: [1], pipeline: [{ id: 'p1', stage: 'shoot', terms: 'bad', lastYear: 1, quality: Number.NaN, title: big(10_000) }, 5, null], credits: 'bad', team: 'x', type: { action: Number.NaN }, totals: { gross: 'x' } },
      { pipeline: Array.from({ length: 500 }, (_, i) => ({ id: `p${i}`, stage: 'post', lastYear: 1, kind: 'tv', terms: { fee: 1e300, points: 5, exclusive: true } })), credits: Array.from({ length: 500 }, (_, i) => ({ id: `c${i}`, residual: 1e300, popularity: Number.NaN })) },
    ]
    for (const [i, j] of junk.entries()) {
      const { g } = newActor(20 + i)
      g.flags[FLAG] = (j && typeof j === 'object' && !Array.isArray(j) ? { ...j, owner: ownerKey(g) } : j) as unknown as Json
      g.flags[LEGACY] = { owner: ownerKey(g), credits: 'bad', awards: 'bad', agent: 'bad', reputation: 'bad' } as unknown as Json
      expect(() => yearlySpecial(g), `junk ${i}`).not.toThrow()
      expect(() => nextYear(g, yearlySpecial), `junk ${i} again`).not.toThrow()
      expect(() => assertMenuPure(g, careerRoots('actor')), `menus ${i}`).not.toThrow()
      const raw = JSON.stringify(g.flags[FLAG])
      expect(raw).not.toMatch(/NaN|Infinity|e\+\d\d/)
    }
  })

  it('stays under 6,000 JSON nodes and 40 KB after 40 simulated years', () => {
    const { g } = newActor(31)
    g.character.money = 5_000_000
    const titles = ['Harbor', 'Echo', 'Summer', 'Detour', 'Promise', 'Frontier']
    for (let y = 0; y < 40; y++) {
      const kinds: Listing[] = [
        listing({ title: `${titles[y % 6]} ${y}`, budget: y % 3 === 0 ? 'indie' : 'studio' }),
        listing({ title: `Show ${y}`, kind: 'tv', genre: 'Sitcom', budget: 'network', role: 'Supporting', pay: 70_000 }),
      ]
      for (const l of kinds) if (y % 2 === 0 || l.kind === 'tv') landProject(ctxOf(g), l, l.role)
      g.queue = []
      nextYear(g, actorSim.yearly)
      g.queue = []
    }
    const raw = g.flags[FLAG]
    expect(nodes(raw)).toBeLessThan(6000)
    expect(JSON.stringify(raw).length).toBeLessThan(40_000)
    expect(JSON.stringify(g)).not.toMatch(/NaN|Infinity/)
  })
})

describe('actor pipeline: levers', () => {
  it('develops once a year per project and lifts it', () => {
    const { g } = newActor(5)
    const p = land(g, listing())
    developProject(ctxOf(g), p.id)
    const dev = actorStore.view(g).pipeline[0].developed
    expect(dev).toBeGreaterThanOrEqual(8)
    const before = quiet(g)
    developProject(ctxOf(g), p.id) // a second time in the year changes nothing
    expect(quiet(g)).toBe(before)
    developProject(ctxOf(g), 'nope') // an unknown project changes nothing
    expect(quiet(g)).toBe(before)
  })

  it('runs a press tour for 4% of the fee, twice a year, and refuses when short', () => {
    const { g } = newActor(5)
    const p = land(g, listing({ pay: 200_000 }))
    const events: AuditEvent[] = []
    setCareerAudit((e) => events.push(e))
    const m0 = g.character.money
    pressTour(ctxOf(g), p.id)
    pressTour(ctxOf(g), p.id)
    expect(m0 - g.character.money).toBe(2 * Math.round(p.terms.fee * 0.04))
    expect(actorStore.view(g).pipeline[0].buzz).toBe(12)
    const before = quiet(g)
    pressTour(ctxOf(g), p.id)
    expect(quiet(g)).toBe(before)
    const { g: poor } = newActor(5)
    const q = land(poor, listing({ pay: 200_000 }))
    poor.character.money = 10
    const b2 = quiet(poor)
    pressTour(ctxOf(poor), q.id)
    expect(quiet(poor)).toBe(b2)
    expect(events.filter((e) => e.t === 'pay')).toHaveLength(2)
  })

  it('sets the release window in post only, campaigns once, and walks away at a price', () => {
    const { g } = newActor(5)
    const p = land(g, listing())
    const shooting = quiet(g)
    setWindow(ctxOf(g), p.id, 'awards')
    expect(quiet(g)).toBe(shooting) // not in post yet
    const t = actorStore.mut(g)
    t.pipeline[0].stage = 'post'
    t.rows = [{ y: 1994, income: 500_000, spent: 0, rank: 0, of: 0, standing: 20, note: '' }]
    setWindow(ctxOf(g, t), p.id, 'awards')
    expect(t.pipeline[0].window).toBe('awards')
    const m0 = g.character.money
    awardsCampaign(ctxOf(g, t), p.id)
    expect(m0 - g.character.money).toBe(25_000)
    expect(t.pipeline[0].campaign).toBe(10)
    const again = quiet(g)
    awardsCampaign(ctxOf(g, t), p.id) // once per project
    expect(quiet(g)).toBe(again)
    const rep = t.rep
    walkAway(ctxOf(g, t), p.id)
    expect(t.pipeline).toHaveLength(0)
    expect(t.rep).toBe(Math.max(0, rep - 15))
  })

  it('hangs out with a co-star once a year', () => {
    const { g } = newActor(5)
    const p = land(g, listing())
    expect(p.costars.length).toBeGreaterThan(0)
    hireCostars(ctxOf(g), p.id)
    const after = quiet(g)
    hireCostars(ctxOf(g), p.id)
    expect(quiet(g)).toBe(after)
  })

  it('prices TV seasons, wraps and closes the year as the sim does', () => {
    const { g, s } = newActor(5)
    const p = proj({ id: 'p1', kind: 'tv', budget: 'network', genre: 'Sitcom', type: 'comedy', stage: 'shoot', lastYear: 1994, terms: { fee: 80_000, points: 0, exclusive: false } })
    s.pipeline = [p]
    const c = ctxOf(g, s)
    wrapShoot(c, p)
    expect(s.credits).toHaveLength(1)
    expect(s.credits[0].seasons).toBe(1)
    const q = proj({ id: 'p2', kind: 'tv', budget: 'streaming', genre: 'Crime Drama', type: 'drama', stage: 'shoot', lastYear: 1994, season: 9, terms: { fee: 90_000, points: 0, exclusive: false } })
    s.pipeline = [q]
    seasonTv(c, q)
    expect(s.pipeline).toHaveLength(0) // season nine is the last
    stepWrap(c)
    stepDry(c)
    stepAwards(c)
    expect(typeof closeYear(c)).toBe('string')
    expect(s.standing).toBeGreaterThanOrEqual(0)
    expect(s.standing).toBeLessThanOrEqual(100)
  })

  it('keeps menus pure on a frozen state with a project in every stage [RF5]', () => {
    const { g } = newActor(5)
    land(g, listing({ title: 'Film One' }))
    land(g, listing({ title: 'Series One', kind: 'tv', genre: 'Sitcom', budget: 'network', pay: 60_000 }))
    assertMenuPure(g, careerRoots('actor'))
    landProject(ctxOf(g), listing({ title: 'Extra One', role: 'Extra', pay: 900, kind: 'tv', genre: 'Crime Drama', budget: 'network' }), 'Extra')
    assertMenuPure(g, careerRoots('actor'))
  })
})
