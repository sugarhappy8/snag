// Share classes, task 1: the record on a company, and the votes it gives the owner.
import { describe, expect, it } from 'vitest'
import {
  CLASS_DISCOUNT,
  CLASS_MERIT,
  CLASS_PHRASE,
  CLASS_VOTES,
  activeClasses,
  afterIpo,
  classFactor,
  clampFounders,
  ownerVotes,
  planFactor,
  scaleFounders,
  votesAfterIpo,
} from '../src/game/business/share-classes'
import { bizOf, diluteBusinessEquity, normalizeBiz, readBiz, readClasses, type BizState } from '../src/game/business/state'
import { deepFreeze } from './fuzz-kit'
import { founder, listed, privateCompany } from './own-listing-kit'

/** A small seeded generator, so the sweep draws the same records on every run. */
function seeded(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('the class record and the votes', () => {
  it('reads a record and drops anything else', () => {
    expect(readClasses({ kind: 'ab', hi: 0.4 })).toEqual({ kind: 'ab', hi: 0.4 })
    expect(readClasses({ kind: 'nv', hi: 2 })).toEqual({ kind: 'nv', hi: 1 })
    expect(readClasses({ kind: 'ab', hi: -1 })).toEqual({ kind: 'ab', hi: 0 })
    expect(readClasses({ kind: 'ab', hi: 'x' })).toEqual({ kind: 'ab', hi: 0 })
    expect(readClasses({ kind: 'ab' })).toEqual({ kind: 'ab', hi: 0 })
    expect(readClasses({ kind: 'ab', hi: Number.NaN })).toEqual({ kind: 'ab', hi: 0 })
    expect(readClasses({ kind: 'ab', hi: Number.POSITIVE_INFINITY })).toEqual({ kind: 'ab', hi: 0 })
    for (const bad of [{ kind: 'zz', hi: 0.5 }, { kind: 'AB', hi: 0.5 }, { hi: 0.5 }, 'ab', 7, null, [], [{ kind: 'ab', hi: 0.5 }], undefined, true]) {
      expect(readClasses(bad)).toBeNull()
    }
    const frozen = Object.freeze({ kind: 'ab', hi: 0.4 })
    let read: ReturnType<typeof readClasses> = null
    expect(() => { read = readClasses(frozen) }).not.toThrow()
    expect(read).toEqual({ kind: 'ab', hi: 0.4 })
    expect(read).not.toBe(frozen)
  })

  it('is whitelisted and saved', () => {
    const g = founder()
    const { a } = listed(g)
    expect(normalizeBiz({ ...a.details, classes: { kind: 'ab', hi: 0.3, extra: 1 } }, 2026).classes).toEqual({ kind: 'ab', hi: 0.3 })
    expect(normalizeBiz({ ...a.details, classes: 7 }, 2026).classes).toBeUndefined()
    expect(normalizeBiz({ ...a.details, classes: { kind: 'zz' } }, 2026).classes).toBeUndefined()
    expect('classes' in normalizeBiz({ ...a.details, classes: null }, 2026)).toBe(false)
    expect('classes' in normalizeBiz({ ...a.details }, 2026)).toBe(false)
    bizOf(g, a).classes = { kind: 'ab', hi: 0.3 }
    a.details = JSON.parse(JSON.stringify(a.details))
    expect(readBiz(g, a).classes).toEqual({ kind: 'ab', hi: 0.3 })
  })

  it('one class: votes are the shares', () => {
    const g = founder()
    const { b } = listed(g)
    for (const share of [0, 0.3, 0.5, 1]) {
      b.share = share
      expect(ownerVotes(b)).toBe(share)
    }
    // A plan that does not apply yet (private), cannot apply (a division) or has nothing to apply to (no shares).
    b.share = 0.3
    b.classes = { kind: 'ab', hi: 0.3 }
    b.public = false
    expect(ownerVotes(b)).toBe(0.3)
    b.public = true
    b.group = { id: 'grp-1' }
    expect(ownerVotes(b)).toBe(0.3)
    delete b.group
    b.sharesOut = 0
    expect(ownerVotes(b)).toBe(0.3)
    b.sharesOut = 1e8
    expect(ownerVotes(b)).toBeGreaterThan(0.3)
    delete b.classes
    b.share = Number.NaN
    expect(ownerVotes(b)).toBe(0)
    b.share = 2
    expect(ownerVotes(b)).toBe(1)
    b.share = -0.5
    expect(ownerVotes(b)).toBe(0)
  })

  it('founder class', () => {
    const g = founder()
    const one = listed(g, { share: 0.75 }).b
    one.classes = { kind: 'ab', hi: 0.75 }
    expect(ownerVotes(one)).toBeCloseTo(0.9677, 4)
    const small = listed(g, { share: 0.15 }).b
    small.classes = { kind: 'ab', hi: 0.15 }
    expect(ownerVotes(small)).toBeCloseTo(0.6383, 4)
    const kin = listed(g, { share: 0.3, family: [{ id: 'p1', share: 0.1 }], executive: 0.05 }).b
    kin.classes = { kind: 'ab', hi: 0.3 }
    expect(ownerVotes(kin)).toBeCloseTo(0.6522, 4)
  })

  it('non-voting float', () => {
    const g = founder()
    const { b } = listed(g, { share: 0.15 })
    b.classes = { kind: 'nv', hi: 0.15 }
    expect(ownerVotes(b)).toBe(1)
    const withKin = listed(g, { share: 0.15, family: [{ id: 'p1', share: 0.05 }] }).b
    withKin.classes = { kind: 'nv', hi: 0.15 }
    expect(ownerVotes(withKin)).toBeCloseTo(0.75, 6)
    // Only 0.05 of the whole company is in the voting class: the other 0.10 is ordinary, so no vote.
    const part = listed(g, { share: 0.15 }).b
    part.classes = { kind: 'nv', hi: 0.05 }
    expect(ownerVotes(part)).toBe(1)
    // No voting shares at all falls back on the economics, never NaN.
    const none = listed(g, { share: 0.15 }).b
    none.classes = { kind: 'nv', hi: 0 }
    expect(ownerVotes(none)).toBe(0.15)
  })

  it('shares bought from the market never carry the founders votes', () => {
    const g = founder()
    const { b } = listed(g, { share: 0.4 })
    b.classes = { kind: 'ab', hi: 0.4 }
    const v1 = ownerVotes(b)
    b.share = 0.5
    const v2 = ownerVotes(b)
    b.classes = { kind: 'ab', hi: 0.5 }
    const naive = ownerVotes(b)
    expect(v1).toBeLessThan(v2)
    expect(v2).toBeLessThan(naive)
  })

  it('hi is clamped to the stake when read', () => {
    const g = founder()
    const big = listed(g, { share: 0.2 }).b
    big.classes = { kind: 'ab', hi: 0.5 }
    const exact = listed(g, { share: 0.2 }).b
    exact.classes = { kind: 'ab', hi: 0.2 }
    expect(ownerVotes(big)).toBe(ownerVotes(exact))
  })

  it('is always a finite number from 0 to 1', () => {
    const g = founder()
    const { b: base } = listed(g)
    const draw = [-1, 0, 0.01, 0.2, 0.5, 0.99, 1, 2, Number.NaN, Number.POSITIVE_INFINITY]
    const rand = seeded(20261014)
    const pick = () => draw[Math.floor(rand() * draw.length)]
    const inRange = (x: number) => Number.isFinite(x) && x >= 0 && x <= 1
    // Buying from the float: the votes never fall, and never rise past what the same purchase would
    // give if the new shares were founders' shares.
    const checkBuy = (b: BizState, label: string): boolean => {
      const plan = activeClasses(b)
      const fam = b.familyShares?.[0]?.share ?? 0
      const real = [b.share, fam, b.executiveEquity ?? 0].every(inRange) && !!plan && plan.hi >= 0 && plan.hi <= 1
      if (!real || !plan) return false
      const d = Math.min(0.05, 1 - b.share - fam - (b.executiveEquity ?? 0))
      if (!(d > 0)) return false
      const v = ownerVotes(b)
      const fromFloat = ownerVotes({ ...b, share: b.share + d })
      const asFounders = ownerVotes({ ...b, share: b.share + d, classes: { kind: plan.kind, hi: plan.hi + d } })
      expect(fromFloat, `${label} lowered by a buy`).toBeGreaterThanOrEqual(v - 1e-9)
      expect(fromFloat, `${label} rose past a founders-class buy`).toBeLessThanOrEqual(asFounders + 1e-9)
      return true
    }
    // 1. Hostile numbers: always a real number from 0 to 1.
    for (let i = 0; i < 2000; i++) {
      const b: BizState = { ...base }
      b.share = pick()
      b.familyShares = [{ id: 'p1', share: pick() }]
      b.executiveEquity = pick()
      b.sharesOut = pick()
      b.public = rand() < 0.85
      b.classes = { kind: rand() < 0.5 ? 'ab' : 'nv', hi: pick() }
      const v = ownerVotes(b)
      expect(Number.isFinite(v) && v >= 0 && v <= 1, `record ${i}: ${JSON.stringify(b.classes)} share ${b.share} gave ${v}`).toBe(true)
      checkBuy(b, `record ${i}`)
    }
    // 2. Ordinary numbers: the buy property over a continuous range, so it is not left to the odd grid cell.
    let buys = 0
    for (let i = 0; i < 2000; i++) {
      const b: BizState = { ...base }
      b.share = rand() * 0.7
      b.familyShares = [{ id: 'p1', share: rand() < 0.5 ? 0 : rand() * 0.2 }]
      b.executiveEquity = rand() < 0.5 ? 0 : rand() * 0.1
      b.classes = { kind: rand() < 0.5 ? 'ab' : 'nv', hi: rand() < 0.2 ? rand() : b.share * rand() }
      if (checkBuy(b, `ordinary record ${i}`)) buys++
    }
    expect(buys).toBeGreaterThan(1500)
  })

  it('dilution scales hi', () => {
    const g = founder()
    const { b } = listed(g, { share: 0.5 })
    b.classes = { kind: 'ab', hi: 0.5 }
    diluteBusinessEquity(b, 0.8)
    expect(b.classes?.kind).toBe('ab')
    expect(b.classes?.hi).toBeCloseTo(0.4, 12)

    const plain = listed(g, { share: 0.5 }).b
    diluteBusinessEquity(plain, 0.8)
    expect(plain.classes).toBeUndefined()
    expect('classes' in plain).toBe(false)

    // A damaged record is left as it is: no repair, no throw.
    const hostile = listed(g, { share: 0.5 }).b
    hostile.classes = { kind: 'zz', hi: 0.5 } as never
    diluteBusinessEquity(hostile, 0.8)
    expect(hostile.classes).toEqual({ kind: 'zz', hi: 0.5 })
    hostile.classes = 7 as never
    diluteBusinessEquity(hostile, 0.8)
    expect(hostile.classes).toBe(7)
  })

  it('buyback and sale bookkeeping', () => {
    const g = founder()
    const { b } = listed(g, { share: 0.95 })
    b.classes = { kind: 'ab', hi: 0.95 }
    scaleFounders(b, 1 / 0.9)
    expect(b.classes).toEqual({ kind: 'ab', hi: 1 })
    b.classes = { kind: 'nv', hi: 0.4 }
    scaleFounders(b, 0.5)
    expect(b.classes.hi).toBeCloseTo(0.2, 12)
    // Not a real factor: left alone.
    for (const bad of [0, -2, Number.NaN, Number.POSITIVE_INFINITY]) {
      scaleFounders(b, bad)
      expect(b.classes.hi).toBeCloseTo(0.2, 12)
    }

    const sold = listed(g, { share: 0.3 }).b
    sold.classes = { kind: 'ab', hi: 0.5 }
    clampFounders(sold)
    expect(sold.classes).toEqual({ kind: 'ab', hi: 0.3 })
    clampFounders(sold)
    expect(sold.classes).toEqual({ kind: 'ab', hi: 0.3 })

    const none = listed(g, { share: 0.3 }).b
    scaleFounders(none, 2)
    clampFounders(none)
    expect('classes' in none).toBe(false)
    const hostile = listed(g, { share: 0.3 }).b
    hostile.classes = { kind: 'zz', hi: 0.9 } as never
    scaleFounders(hostile, 2)
    clampFounders(hostile)
    expect(hostile.classes).toEqual({ kind: 'zz', hi: 0.9 })
  })

  it('the price factor', () => {
    expect(planFactor(null)).toBe(1)
    expect(planFactor('ab')).toBeCloseTo(0.96, 12)
    expect(planFactor('nv')).toBeCloseTo(0.93, 12)
    const g = founder()
    const priv = privateCompany(g).b
    priv.classes = { kind: 'ab', hi: 1 }
    expect(classFactor(priv)).toBe(1)
    const { b } = listed(g)
    expect(classFactor(b)).toBe(1)
    b.classes = { kind: 'ab', hi: 0.6 }
    expect(classFactor(b)).toBeCloseTo(0.96, 12)
    b.classes = { kind: 'nv', hi: 0.6 }
    expect(classFactor(b)).toBeCloseTo(0.93, 12)
    b.classes = { kind: 'zz' } as never
    expect(classFactor(b)).toBe(1)
  })

  it('keeps the numbers in one place', () => {
    expect(CLASS_VOTES).toEqual({ ab: { hi: 10, lo: 1 }, nv: { hi: 1, lo: 0 } })
    expect(CLASS_DISCOUNT).toEqual({ ab: 0.04, nv: 0.07 })
    expect(CLASS_MERIT).toEqual({ single: 0.3, ab: -1, nv: -1.3 })
    expect(CLASS_PHRASE).toEqual({ single: 'one class of shares', ab: 'founder shares', nv: 'a non-voting float' })
    expect(Object.isFrozen(CLASS_VOTES) && Object.isFrozen(CLASS_DISCOUNT) && Object.isFrozen(CLASS_MERIT) && Object.isFrozen(CLASS_PHRASE)).toBe(true)
  })

  it('votes just after an IPO', () => {
    const g = founder()
    const { b } = privateCompany(g)
    expect(b.share).toBe(1)
    const before = JSON.stringify(b)
    expect(votesAfterIpo(b, 0.75, 'ab')).toBeCloseTo(0.9677, 4)
    expect(votesAfterIpo(b, 0.75, 'nv')).toBe(1)
    expect(votesAfterIpo(b, 0.75, null)).toBeCloseTo(0.75, 12)
    expect(JSON.stringify(b)).toBe(before)
  })

  it('the company after an IPO is a copy that stands the way listing leaves it', () => {
    const g = founder()
    const { b } = privateCompany(g)
    b.share = 0.8
    b.familyShares = [{ id: 'p1', share: 0.1 }]
    b.executiveEquity = 0.05
    b.classes = { kind: 'nv', hi: 1 }
    b.group = { id: 'grp-1' }
    const before = JSON.stringify(b)
    const after = afterIpo(b, 0.75, 'ab')
    expect(JSON.stringify(b)).toBe(before)
    expect(after).not.toBe(b)
    expect(after.public).toBe(true)
    expect(after.sharesOut).toBeGreaterThanOrEqual(1)
    expect(after.group).toBeUndefined()
    expect(after.share).toBeCloseTo(0.6, 12)
    expect(after.familyShares?.[0].share).toBeCloseTo(0.075, 12)
    expect(after.executiveEquity).toBeCloseTo(0.0375, 12)
    expect(after.classes).toEqual({ kind: 'ab', hi: after.share })
    expect(afterIpo(b, 0.75, null).classes).toBeUndefined()
    expect('classes' in afterIpo(b, 0.75, null)).toBe(false)
    // The relatives and the manager are copied, not shared.
    expect(b.familyShares?.[0].share).toBe(0.1)
    expect(after.familyShares).not.toBe(b.familyShares)
  })

  it('a manager with a stake is thinned like the rest, without touching the company', () => {
    const g = founder()
    const { b } = privateCompany(g)
    b.share = 0.7
    const mgr: NonNullable<BizState['manager']> = { firstName: 'Ana', lastName: 'Ruiz', gender: 'female', skill: 60, salary: 200_000, since: 2020, equity: 0.1, equityAsked: 2025 }
    b.manager = mgr
    const after = afterIpo(b, 0.5, null)
    expect(after.manager?.equity).toBeCloseTo(0.05, 12)
    expect(after.manager?.equityAsked).toBeUndefined()
    expect(after.executiveEquity).toBeCloseTo(0.05, 12)
    expect(after.manager).not.toBe(mgr)
    expect(mgr.equity).toBe(0.1)
    expect(mgr.equityAsked).toBe(2025)
    expect(b.manager).toBe(mgr)
  })

  it('every function reads a frozen company', () => {
    const g = founder()
    const { b } = listed(g, { share: 0.3, family: [{ id: 'p1', share: 0.1 }], executive: 0.05 })
    b.classes = { kind: 'ab', hi: 0.3 }
    const frozen = deepFreeze(structuredClone(b))
    const plan = { kind: 'ab', hi: 0.3 }
    expect(() => {
      expect(ownerVotes(frozen)).toBeCloseTo(0.6522, 4)
      expect(classFactor(frozen)).toBeCloseTo(0.96, 12)
      expect(activeClasses(frozen)).toEqual(plan)
      expect(afterIpo(frozen, 0.75, 'nv').classes?.kind).toBe('nv')
      expect(votesAfterIpo(frozen, 0.75, 'ab')).toBeGreaterThan(0)
    }).not.toThrow()
  })
})
