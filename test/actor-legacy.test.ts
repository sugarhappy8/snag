import { afterEach, describe, expect, it } from 'vitest'
import { economyOf } from '../src/game/economy/model'
import { continueAsChild } from '../src/game/life'
import { createPerson } from '../src/game/people'
import { actorLikenessNodes, createTrust, likenessAtCreation, likenessOf, licenseFive, promoteEstate, sellRights, trustValue, yearlyLikeness, type Likeness } from '../src/game/special/actor-legacy'
import { stepResiduals } from '../src/game/special/actor-pipeline'
import { actorSim } from '../src/game/special/actor-sim'
import { actorStore, adoptLegacy, type ActorState } from '../src/game/special/actor-state'
import { ACTOR_SPEC, scaleOf } from '../src/game/special/actor-world'
import { hire, leave } from '../src/game/special/common'
import { rosterAt } from '../src/game/special/kit/rivals'
import { ACTION_BUDGET, careerCtx, setCareerAudit, type AuditEvent, type CareerCtx } from '../src/game/special/kit/year'
import type { Asset, GameState, Json } from '../src/game/types'
import { assertMenuPure, finiteJson, nextYear } from './career-kit'
import { makeTestGame } from './helpers'

const ctxOf = (g: GameState, s: ActorState = actorStore.mut(g)): CareerCtx<ActorState> => careerCtx(g, 'actor', s, { ...ACTION_BUDGET })

/** The state without the queue, the log and the id counter: what a refusal must leave alone. */
const quiet = (g: GameState): string => JSON.stringify({ ...g, queue: [], nextId: 0, log: [] })

function creditRow(id: string, year: number, o: Record<string, unknown> = {}): Record<string, unknown> {
  return { id, title: id, kind: 'film', role: 'Lead', genre: 'Drama', type: 'drama', industry: 'hollywood', studio: '', year, age: 25, pay: 1000, quality: 70, popularity: 60, gross: 1, backend: 0, seasons: 1, verdict: 'released', residual: 0, trust: false, ...o }
}

const creditsOf = (g: GameState, rows: Record<string, unknown>[]): ActorState['credits'] => actorStore.read({ v: 1, credits: rows }, g).credits

/** A 1995 life, age 62, with an actor job, an adopted record, two credits that pay 40,000 and 20,000 in residuals. */
function newActor(seed = 7, o: { age?: number; year?: number; country?: string } = {}): { g: GameState; s: ActorState } {
  const g = makeTestGame(seed, { age: o.age ?? 62, countryId: o.country ?? 'us' })
  g.year = o.year ?? 1995
  g.flags['skill.acting'] = 60
  g.character.money = 500_000
  hire(g, { defId: 'actor', title: 'Actor', company: 'Silverline Studios', salary: 0, data: { project: null } })
  const s = actorStore.mut(g)
  adoptLegacy(g, s)
  s.credits = creditsOf(g, [creditRow('c1', 1990, { residual: 40_000, quality: 90, popularity: 70 }), creditRow('c2', 1992, { residual: 20_000, quality: 60 })])
  return { g, s }
}

const trustAsset = (g: GameState): Asset => g.assets.find((x) => likenessOf(x))!

/** Rewrites fields of a trust through a plain JSON patch, the way a save would carry them. */
function patch(a: Asset, p: Partial<Likeness>): void {
  a.details.actorLikeness = { ...likenessOf(a)!, ...p } as unknown as Json
}

/** What the licensing formula says, written out from the spec: likeness x 150 x scale x leisure demand (clamped 0.7 to 1.3), likeness 20 or more. */
function licensing(g: GameState, m: Likeness): number {
  if (m.likeness < 20) return 0
  const demand = Math.min(1.3, Math.max(0.7, economyOf(g, m.country).sectors.leisure.demand))
  return Math.round(m.likeness * 150 * scaleOf(g, m.industry) * demand)
}

/** A year turns for the likeness only. */
const turn = (g: GameState): void => {
  g.year += 1
  g.character.age += 1
  g.yearActions = {}
}

function withTrust(likeness = 14, seed = 7): { g: GameState; s: ActorState; a: Asset } {
  const { g, s } = newActor(seed)
  const a = createTrust(ctxOf(g, s))!
  expect(a).toBeTruthy()
  if (likeness !== likenessOf(a)!.likeness) patch(a, { likeness })
  return { g, s, a }
}

afterEach(() => setCareerAudit(null))

describe('actor likeness trust: creation', () => {
  it('prices the likeness at creation from the peak star, awards, classics and credits', () => {
    const { g, s } = newActor()
    s.peak = 80
    s.awards = ['Best Actor at the Golden Reel, "c2" (age 30)', 'Best Supporting Actor at the Golden Reel, "other" (age 31)']
    // c1 is a classic by quality (90), c2 by its award: two classics
    expect(likenessAtCreation(s)).toBeCloseTo(Math.min(100, 0.45 * 80 + 3 * 2 + 4 * 2 + 0.5 * 2), 10)
    s.peak = 100
    s.awards = Array.from({ length: 40 }, (_, i) => `Award ${i}`)
    expect(likenessAtCreation(s)).toBe(100)
    expect(likenessAtCreation({ ...s, credits: [], awards: [], peak: 0 })).toBe(0)
    expect(g).toBeTruthy()
  })

  it('values the trust at streams x 6 plus likeness x 400 x scale', () => {
    const m = { streams: 50_000, likeness: 40 } as Likeness
    expect(trustValue(m, 1)).toBe(50_000 * 6 + 40 * 400)
    expect(trustValue(m, 0.25)).toBe(50_000 * 6 + 40 * 400 * 0.25)
    expect(trustValue({ streams: 0, likeness: 0 } as Likeness, 1)).toBe(0)
  })

  it('folds residuals into the trust with no double pay', () => {
    const { g, s } = newActor()
    // before: the credits pay their residuals to you
    const personal = structuredClone(g)
    const before = personal.character.money
    stepResiduals(ctxOf(personal, actorStore.mut(personal)))
    expect(personal.character.money - before).toBe(60_000)

    // createTrust: the fee, the credits move in, the stream is the sum of their residuals
    const cash = g.character.money
    const a = createTrust(ctxOf(g, s))!
    expect(a.kind).toBe('other')
    expect(cash - g.character.money).toBe(Math.round(25_000 * scaleOf(g, 'hollywood')))
    expect(s.credits.every((c) => c.trust)).toBe(true)
    expect(s.migrated).toBe(true)
    const m = likenessOf(a)!
    expect(m.streams).toBe(60_000)
    expect(m.likeness).toBe(Math.round(likenessAtCreation(s)))
    expect(m.lastYear).toBe(g.year)
    expect(a.value).toBe(trustValue(m, scaleOf(g, m.industry)))

    // next year: stepResiduals pays nothing, yearlyLikeness pays the stream and only the stream (likeness is under 20)
    turn(g)
    const cash2 = g.character.money
    stepResiduals(ctxOf(g, s))
    expect(g.character.money).toBe(cash2)
    expect(m.likeness).toBeLessThan(20)
    yearlyLikeness(g)
    expect(g.character.money - cash2).toBe(60_000)
    expect(likenessOf(a)!.streams).toBe(Math.round(60_000 * (0.88 + 0.015 * 1)))
  })

  it('charges the fee scaled by industry, waives it once after Retire, and refuses a second trust', () => {
    const { g, s } = newActor()
    const cash = g.character.money
    const a = createTrust(ctxOf(g, s))!
    expect(cash - g.character.money).toBe(25_000)
    const again = quiet(g)
    expect(createTrust(ctxOf(g, s))).toBeNull() // one trust a life
    expect(quiet(g)).toBe(again)
    expect(g.assets.filter((x) => likenessOf(x))).toHaveLength(1)
    expect(a.id).toBeTruthy()

    // a small industry pays a small fee
    const { g: ng, s: ns } = newActor(7, { country: 'ng', year: 2005 })
    const c2 = ng.character.money
    createTrust(ctxOf(ng, ns))
    expect(c2 - ng.character.money).toBe(Math.round(25_000 * scaleOf(ng, 'nollywood')))

    // retired: no fee
    const { g: rg, s: rs } = newActor()
    rs.done = ['retired']
    leave(rg, 'retired')
    const c3 = rg.character.money
    expect(createTrust(ctxOf(rg, rs))).not.toBeNull()
    expect(rg.character.money).toBe(c3)
  })

  it('refuses a minor, an empty filmography and a short purse by direct run', () => {
    const { g, s } = newActor()
    s.credits = []
    const before = quiet(g)
    expect(createTrust(ctxOf(g, s))).toBeNull()
    expect(quiet(g)).toBe(before)
    s.credits = creditsOf(g, [creditRow('c1', 1990, { residual: 100 })])
    g.character.money = 10
    const poor = quiet(g)
    expect(createTrust(ctxOf(g, s))).toBeNull()
    expect(quiet(g)).toBe(poor)
    expect(s.credits[0].trust).toBe(false)
    const kid = newActor(7, { age: 16 })
    const k = quiet(kid.g)
    expect(createTrust(ctxOf(kid.g, kid.s))).toBeNull()
    expect(quiet(kid.g)).toBe(k)
  })
})

describe('actor likeness trust: the yearly cheque', () => {
  it('pays one likeness cheque a year per asset [RF3]', () => {
    const { g } = withTrust()
    turn(g)
    yearlyLikeness(g)
    const once = JSON.stringify(g)
    const rng = g.rng
    yearlyLikeness(g)
    expect(JSON.stringify(g)).toBe(once)
    expect(g.rng).toBe(rng)

    // through the whole sim hook, twice in one (year, age): the money moves once
    const { g: h } = withTrust(14, 8)
    nextYear(h, actorSim.yearly)
    const after = JSON.stringify(h)
    const stream = h.character.money
    actorSim.yearly(h)
    expect(JSON.stringify(h)).toBe(after)
    expect(h.character.money).toBe(stream)
  })

  it('draws no random number and books every cheque through the ledger', () => {
    const { g } = withTrust(60)
    const events: AuditEvent[] = []
    setCareerAudit((e) => events.push(e))
    turn(g)
    const rng = g.rng
    const cash = g.character.money
    yearlyLikeness(g)
    expect(g.rng).toBe(rng)
    const earned = events.filter((e) => e.t === 'earn')
    expect(earned).toHaveLength(1)
    expect(earned[0].t === 'earn' && earned[0].amount).toBe(g.character.money - cash)
    const books = events.filter((e) => e.t === 'books')
    expect(books).toHaveLength(1)
    expect(books[0].t === 'books' && books[0].delta === books[0].booked).toBe(true)
  })

  it('pays licensing of likeness x 150 x scale x leisure demand from likeness 20, with the stream', () => {
    const { g, a } = withTrust(60)
    patch(a, { streams: 30_000 })
    const m = likenessOf(a)!
    const lic = licensing(g, { ...m, likeness: 60 })
    expect(lic).toBeGreaterThan(0)
    turn(g)
    const cash = g.character.money
    yearlyLikeness(g)
    const paid = g.character.money - cash
    const demand = Math.min(1.3, Math.max(0.7, economyOf(g, 'us').sectors.leisure.demand))
    expect(paid).toBe(30_000 + Math.round(60 * 150 * 1 * demand))
    expect(likenessOf(a)!.lastPaid).toBe(paid)
    expect(likenessOf(a)!.receipts).toBe(paid)
    // under 20 there is no licensing at all
    const { g: h, a: b } = withTrust(19, 9)
    patch(b, { streams: 0 })
    turn(h)
    const c2 = h.character.money
    yearlyLikeness(h)
    expect(h.character.money).toBe(c2)
  })

  it('decays the stream by 0.88 plus 0.015 per classic up to four, and zeroes it under 25', () => {
    const { g, a } = withTrust(14)
    patch(a, { streams: 10_000, classics: 6 })
    turn(g)
    yearlyLikeness(g)
    expect(likenessOf(a)!.streams).toBe(Math.round(10_000 * (0.88 + 0.015 * 4)))
    patch(a, { streams: 26, classics: 0 })
    turn(g)
    yearlyLikeness(g)
    expect(likenessOf(a)!.streams).toBe(0) // 26 x 0.88 = 23, under 25
  })

  it('pays a retired actor through the sim hook, once', () => {
    const { g } = withTrust(60)
    leave(g, 'retired')
    expect(g.character.job).toBeNull()
    const cash = g.character.money
    nextYear(g, actorSim.yearly)
    const paid = g.character.money - cash
    expect(paid).toBeGreaterThan(0)
    expect(likenessOf(trustAsset(g))!.lastPaid).toBe(paid)
    const once = JSON.stringify(g)
    actorSim.yearly(g)
    expect(JSON.stringify(g)).toBe(once)
  })

  it('does not run while the character is dead and does nothing without an asset', () => {
    const { g } = withTrust(60)
    turn(g)
    g.character.alive = false
    const before = JSON.stringify(g)
    yearlyLikeness(g)
    expect(JSON.stringify(g)).toBe(before)
    const plain = makeTestGame(3, { age: 40 })
    const json = JSON.stringify(plain)
    yearlyLikeness(plain)
    expect(JSON.stringify(plain)).toBe(json)
  })
})

describe('actor likeness trust: license, promote, sell', () => {
  it('recoups a five-year licence at 35% of licensing until unrecouped is 0, then expires without debt', () => {
    const { g, s, a } = withTrust(80)
    patch(a, { streams: 0 })
    const start = g.character.money
    licenseFive(ctxOf(g, s), a.id)
    const m = likenessOf(a)!
    expect(m.advance).toBe(3 * licensing(g, m))
    expect(g.character.money - start).toBe(m.advance)
    expect(m.unrecouped).toBe(m.advance)
    expect(m.licenseUntil).toBe(g.year + 5)
    // a second licence while one runs changes nothing
    const running = quiet(g)
    licenseFive(ctxOf(g, s), a.id)
    expect(quiet(g)).toBe(running)

    let left = m.advance
    let cash = g.character.money
    for (let y = 0; y < 5; y++) {
      turn(g)
      const share = Math.round(licensing(g, likenessOf(a)!) * 0.35)
      const recoup = Math.min(left, share)
      yearlyLikeness(g)
      left -= recoup
      const now = likenessOf(a)!
      if (y < 4) expect(now.unrecouped).toBe(left)
      // the share goes to the advance first: nothing is paid out while any is unrecouped
      expect(g.character.money - cash).toBe(share - recoup)
      cash = g.character.money
    }
    const end = likenessOf(a)!
    expect(end.licenseUntil).toBe(0)
    expect(end.unrecouped).toBe(0) // the rest expires
    expect(g.character.money).toBeGreaterThanOrEqual(start + m.advance) // no debt, ever
    // the following year pays full licensing again
    turn(g)
    const c = g.character.money
    yearlyLikeness(g)
    expect(g.character.money - c).toBe(licensing(g, end))
  })

  it('pays the surplus once the advance is recouped', () => {
    const { g, s, a } = withTrust(80)
    patch(a, { streams: 0 })
    licenseFive(ctxOf(g, s), a.id)
    patch(a, { unrecouped: 1_000 })
    turn(g)
    const share = Math.round(licensing(g, likenessOf(a)!) * 0.35)
    expect(share).toBeGreaterThan(1_000)
    const cash = g.character.money
    yearlyLikeness(g)
    expect(likenessOf(a)!.unrecouped).toBe(0)
    expect(g.character.money - cash).toBe(share - 1_000)
  })

  it('refuses a licence with a faint likeness', () => {
    const { g, s, a } = withTrust(19)
    const before = quiet(g)
    licenseFive(ctxOf(g, s), a.id)
    expect(quiet(g)).toBe(before)
    expect(likenessOf(a)!.licenseUntil).toBe(0)
  })

  it('promotes once a year for 5% of the value, +8 likeness, capped at 100', () => {
    const { g, s, a } = withTrust(40)
    patch(a, { streams: 20_000 })
    const m = likenessOf(a)!
    const price = Math.round(0.05 * trustValue(m, scaleOf(g, m.industry)))
    const cash = g.character.money
    promoteEstate(ctxOf(g, s), a.id)
    expect(cash - g.character.money).toBe(price)
    expect(likenessOf(a)!.likeness).toBe(48)
    const once = quiet(g)
    promoteEstate(ctxOf(g, s), a.id) // once a year
    expect(quiet(g)).toBe(once)
    turn(g)
    patch(a, { likeness: 96 })
    promoteEstate(ctxOf(g, s), a.id)
    expect(likenessOf(a)!.likeness).toBe(100)
    g.yearActions = {}
    const full = quiet(g)
    promoteEstate(ctxOf(g, s), a.id) // nothing left to promote
    expect(quiet(g)).toBe(full)
    // a short purse changes nothing
    const { g: poor, s: ps, a: pa } = withTrust(40, 9)
    poor.character.money = 0
    const b = quiet(poor)
    promoteEstate(ctxOf(poor, ps), pa.id)
    expect(quiet(poor)).toBe(b)
  })

  it('sells for exactly 70% of value, booked as income, and removes the asset', () => {
    const { g, s, a } = withTrust(60)
    patch(a, { streams: 30_000 })
    const m = likenessOf(a)!
    const scale = scaleOf(g, m.industry)
    const events: AuditEvent[] = []
    setCareerAudit((e) => events.push(e))
    const taxable = Number(g.flags.taxableIncome ?? 0)
    const before = g.character.money
    sellRights(ctxOf(g, s), a.id)
    expect(g.character.money - before).toBe(Math.round(0.7 * trustValue(m, scale)))
    expect(Number(g.flags.taxableIncome ?? 0) - taxable).toBe(g.character.money - before)
    expect(g.assets.some((x) => x.id === a.id)).toBe(false)
    expect(events.filter((e) => e.t === 'earn')).toHaveLength(1)
    const sold = quiet(g)
    sellRights(ctxOf(g, s), a.id) // already gone
    expect(quiet(g)).toBe(sold)
  })

  it('discounts a sale by the advance still unrecouped, so a licence is no loophole', () => {
    const { g, s, a } = withTrust(80)
    patch(a, { streams: 0 })
    licenseFive(ctxOf(g, s), a.id)
    const m = likenessOf(a)!
    const cash = g.character.money
    sellRights(ctxOf(g, s), a.id)
    expect(g.character.money - cash).toBe(Math.round(0.7 * Math.max(0, trustValue(m, scaleOf(g, m.industry)) - m.unrecouped)))
  })

  it('refuses minors and wrong owners on direct run, and renders pure on a frozen state [RF5]', () => {
    const { g, s, a } = withTrust(60)
    const hold = quiet(g)
    const grown = g.character.age
    g.character.age = 16
    for (const run of [() => licenseFive(ctxOf(g, s), a.id), () => promoteEstate(ctxOf(g, s), a.id), () => sellRights(ctxOf(g, s), a.id)]) {
      const before = quiet(g)
      run()
      expect(quiet(g)).toBe(before)
    }
    expect(g.assets.some((x) => x.id === a.id)).toBe(true)
    g.character.age = grown
    expect(quiet(g)).toBe(hold) // refusals changed nothing
    // an id that is not held, and an asset that is not a trust
    g.assets.push({ id: 'car1', kind: 'car', name: 'Car', emoji: 'x', purchasePrice: 1, value: 1, condition: 100, purchasedAge: 30, upkeep: 0, details: {} })
    const other = quiet(g)
    for (const id of ['nope', 'car1', '']) {
      sellRights(ctxOf(g, s), id)
      licenseFive(ctxOf(g, s), id)
      promoteEstate(ctxOf(g, s), id)
    }
    expect(quiet(g)).toBe(other)
    assertMenuPure(g, (gg) => {
      const live = gg.assets.find((x) => likenessOf(x))
      return live ? (actorLikenessNodes(gg, live) ?? []) : []
    })
  })

  it('offers license, promote and sell rows that carry the gates and the prices', () => {
    const { g, a } = withTrust(60)
    const nodes = actorLikenessNodes(g, a)!
    const ids = nodes.map((n) => n.id)
    expect(ids).toEqual(expect.arrayContaining([`likeness.license.${a.id}`, `likeness.promote.${a.id}`, `likeness.sell.${a.id}`]))
    const sell = nodes.find((n) => n.id === `likeness.sell.${a.id}`)
    expect(sell?.type).toBe('action')
    if (sell?.type !== 'action') return
    expect(typeof sell.confirm?.(g)).toBe('string')
    g.character.age = 16
    expect(sell.disabledReason?.(g)).toBeTruthy()
    // running a row works through the real action path and books the cash
    g.character.age = 62
    const before = g.character.money
    const m = likenessOf(a)!
    sell.run(g)
    expect(g.character.money - before).toBe(Math.round(0.7 * trustValue(m, scaleOf(g, m.industry))))
  })
})

describe('actor likeness trust: heirs', () => {
  it('lets an heir keep and collect, with an empty record [RF2]', () => {
    const { g, a } = withTrust(60)
    patch(a, { streams: 25_000 })
    const parent = rosterAt(g, ACTOR_SPEC, 1995, 'us').map((r) => r.name)
    expect(parent.length).toBeGreaterThan(0)
    const p = createPerson(g, { relation: 'child', age: 25, firstName: 'Heir', livesWithPlayer: true })
    p.relationship = 90
    g.character.willBeneficiaries = [p.id]
    g.character.alive = false
    const n = continueAsChild(g, p.id)
    expect(n).not.toBe(g)
    const asset = n.assets.find((x) => likenessOf(x))
    expect(asset).toBeTruthy()
    expect(actorStore.peek(n)).toBeNull()
    expect(rosterAt(n, ACTOR_SPEC, 1995, 'us').map((r) => r.name)).toEqual(parent)

    // the heir collects, loses 5 likeness a year, and never grows a career record
    n.queue = []
    turn(n)
    const m = likenessOf(asset!)!
    const expected = m.streams + licensing(n, m)
    const cash = n.character.money
    actorSim.yearly(n)
    expect(n.character.money - cash).toBe(expected)
    expect(likenessOf(asset!)!.likeness).toBe(55)
    expect(actorStore.peek(n)).toBeNull()
    expect(actorStore.has(n)).toBe(false)
    // and not twice
    const json = JSON.stringify(n)
    actorSim.yearly(n)
    expect(JSON.stringify(n)).toBe(json)

    // the heir's own actions on the asset make no career record either
    n.year += 1
    n.yearActions = {}
    const price = likenessOf(asset!)!
    const before = n.character.money
    promoteEstate(careerCtx(n, 'actor', actorStore.view(n), { ...ACTION_BUDGET }), asset!.id)
    expect(before - n.character.money).toBe(Math.max(1, Math.round(0.05 * trustValue(price, scaleOf(n, price.industry)))))
    expect(actorStore.peek(n)).toBeNull()
  })

  it('floors the heir likeness at 0', () => {
    const { g, a } = withTrust(3)
    g.character.id = 'someone-else'
    turn(g)
    yearlyLikeness(g)
    expect(likenessOf(a)!.likeness).toBe(0)
  })
})

describe('actor likeness trust: junk', () => {
  const asset = (id: string, raw: unknown): Asset => ({ id, kind: 'other', name: id, emoji: 'x', purchasePrice: 1, value: 1, condition: 100, purchasedAge: 30, upkeep: 0, details: { actorLikeness: raw as Json } })

  it('returns null and no nodes for junk likeness details without throwing [RF1]', () => {
    const g = makeTestGame(3, { age: 40 })
    const junk = [null, 7, 'bad', [], {}, { author: 5 }, { author: '' }, { v: 1 }, { author: ['x'] }]
    for (const raw of junk) {
      const a = asset('x', raw)
      expect(likenessOf(a)).toBeNull()
      expect(actorLikenessNodes(g, a)).toBeNull()
    }
    expect(likenessOf({ ...asset('y', null), details: null as never })).toBeNull()
    expect(likenessOf(null as never)).toBeNull()
    g.assets = junk.map((raw, i) => asset(`j${i}`, raw))
    nextYear(g, actorSim.yearly)
    expect(finiteJson(g)).toEqual([])
  })

  it('reads a hostile record as finite, capped values and survives a year of them [RF1]', () => {
    const g = makeTestGame(3, { age: 40 })
    g.year = 1995
    const hostile = asset('h', { author: 'a'.repeat(10_000), actor: 'b'.repeat(10_000), country: {}, industry: 'zzz', streams: 1e300, likeness: -50, classics: NaN, licenseUntil: 'x', advance: Infinity, unrecouped: -1, receipts: 1e300, lastPaid: 'x', lastYear: 'x' })
    const m = likenessOf(hostile)!
    expect(m.author.length).toBeLessThanOrEqual(60)
    expect(m.actor.length).toBeLessThanOrEqual(60)
    expect(m.streams).toBeLessThanOrEqual(1e12)
    expect(m.likeness).toBe(0)
    expect(m.industry).toBe('domestic')
    for (const v of [m.streams, m.likeness, m.classics, m.licenseUntil, m.advance, m.unrecouped, m.receipts, m.lastPaid, m.lastYear]) expect(Number.isFinite(v)).toBe(true)
    g.assets = [hostile, asset('big', { author: 'x', streams: 1e300, likeness: 1e300, receipts: 1e300 })]
    for (let y = 0; y < 3; y++) nextYear(g, actorSim.yearly)
    expect(Number.isFinite(g.character.money)).toBe(true)
    expect(finiteJson(g)).toEqual([])
    expect(g.assets.every((a) => likenessOf(a)!.streams <= 1e12)).toBe(true)
    expect(Number.isFinite(g.character.money)).toBe(true)
  })

  it('renders the nodes of a hostile record without throwing', () => {
    const g = makeTestGame(3, { age: 40 })
    const hostile = asset('h', { author: 'x', streams: 1e300, likeness: 1e300, industry: 'zzz', actor: 'y'.repeat(10_000) })
    const nodes = actorLikenessNodes(g, hostile)
    expect(nodes).not.toBeNull()
    g.assets = [hostile]
    assertMenuPure(g, (gg) => actorLikenessNodes(gg, gg.assets[0]) ?? [])
  })
})
