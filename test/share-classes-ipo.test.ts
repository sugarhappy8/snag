// Share classes, task 3: the IPO with a share structure. The offer is priced for the votes the public gets,
// the preview and the listing share one plan, and a company that has no record lists as it always did.
import { describe, expect, it } from 'vitest'
import { moneyWith } from '../src/game/core'
import { detach } from '../src/game/business/conglomerate-state'
import { exchangeMove, updateSharePrice, valuationOf } from '../src/game/business/economy'
import { goPublic, ipoPreview, ipoRetain } from '../src/game/business/exit'
import { buyQuote } from '../src/game/business/own-trade'
import { ownerVotes, votesAfterIpo } from '../src/game/business/share-classes'
import { FLOAT_DEFAULT, ipoPlan, retailVerdict, shareCountOf, shareCountText } from '../src/game/business/share-structure'
import { readBiz, type BizState, type ClassKind } from '../src/game/business/state'
import { money, pct } from '../src/game/business/util'
import { listingMood } from '../src/game/history/market-events'
import { bell } from '../src/game/rng'
import type { Asset, GameState } from '../src/game/types'
import { deepFreeze } from './fuzz-kit'
import { founder, listed, privateCompany } from './own-listing-kit'

/** A fresh game with one private company, an optional record set by hand, and the owner's share. */
function candidate(record?: unknown, share = 1): { g: GameState; a: Asset; b: BizState } {
  const g = founder()
  const { a, b } = privateCompany(g)
  b.share = share
  if (record !== undefined) b.classes = record as never
  return { g, a, b }
}

function noticeText(g: GameState, title: string): string {
  for (const m of g.queue) if (m.kind === 'notice' && m.title === title) return m.text
  return ''
}

/** ipoPreview as it stood before share classes: the text a company with no record must still get. */
function oldIpoPreview(g: GameState, b: BizState, floatPct: number): string {
  const plan = ipoPlan(Math.max(1, valuationOf(b)), shareCountOf(b), floatPct, listingMood(b.industry, b.countryId, g.year))
  const price = (x: number) => moneyWith(x, (v) => v.toFixed(2))
  const keep = b.share * plan.retain
  const fill = plan.coverage >= 1 ? `orders should cover it about ${plan.coverage.toFixed(1)} times` : `only about ${pct(Math.min(1, plan.coverage))} of it would sell`
  return `${shareCountText(plan.offered)} new shares at about ${price(plan.price)} (${retailVerdict(plan.basePrice)}): ${fill}, raising about ${money(plan.raise - plan.fees)} for the company after fees. You'd keep ${pct(keep, 1)}.${keep < 0.5 && b.share >= 0.5 ? ' Under half: outside shareholders would control the board.' : ''}`
}

describe('the IPO with a share structure', () => {
  it("one class: the preview is today's", () => {
    const { g, b } = candidate(undefined, 0.6)
    const text = ipoPreview(g, b, 60)
    expect(text).toContain('Under half: outside shareholders would control the board.')
    expect(text).not.toContain('of the votes')
  })

  it("no record or a damaged one: the preview is exactly what it was, over a grid", () => {
    const records: unknown[] = [undefined, 7, 'ab', null, [], { kind: 'zz', hi: 0.5 }, { hi: 0.5 }]
    let seen = 0
    for (const share of [0.1, 0.4, 0.5, 0.6, 1]) {
      for (const float of [5, 25, 40, 60]) {
        for (const record of records) {
          const { g, b } = candidate(record, share)
          expect(ipoPreview(g, b, float), `share ${share} float ${float} record ${JSON.stringify(record)}`).toBe(oldIpoPreview(g, b, float))
          seen++
        }
      }
    }
    expect(seen).toBe(5 * 4 * records.length)
  })

  it('a plan names the votes and the control', () => {
    const small = candidate({ kind: 'ab', hi: 1 }, 0.3)
    const text = ipoPreview(small.g, small.b, 25)
    expect(text).toContain('of the votes')
    expect(text).toContain("You'd control the board.")
    expect(text).toContain('of the shares.')

    const big = candidate({ kind: 'ab', hi: 1 }, 0.6)
    expect(ipoPreview(big.g, big.b, 25)).toContain('You keep control of the board.')

    const nv = candidate({ kind: 'nv', hi: 1 }, 0.3)
    expect(ipoPreview(nv.g, nv.b, 25)).toContain('of the votes')
  })

  it('the preview states the votes the listing will leave', () => {
    const { g, b } = candidate({ kind: 'ab', hi: 1 }, 0.3)
    const after = votesAfterIpo(b, ipoRetain(g, b, 25, 'ab'), 'ab')
    expect(ipoPreview(g, b, 25)).toContain(`You'd hold ${pct(after, 0)} of the votes.`)
  })

  it('under half of the votes says who would control the board', () => {
    // Half of the shares, with relatives holding the other half in the founders' class: listing thins the owner
    // and gives the relatives the lead, though the owner controls the board today.
    const { g, b } = candidate({ kind: 'ab', hi: 1 }, 0.5)
    b.familyShares = [{ id: 'p1', share: 0.5 }]
    const text = ipoPreview(g, b, 25)
    expect(text).toContain("That's under half of the votes. Outside shareholders would control the board.")
    expect(text).not.toContain('You keep control of the board.')
    expect(text).not.toContain("You'd control the board.")
  })

  it('a plan that does not reach half the votes and does not control today says nothing about control', () => {
    const { g, b } = candidate({ kind: 'ab', hi: 1 }, 0.2)
    b.familyShares = [{ id: 'p1', share: 0.7 }]
    const text = ipoPreview(g, b, 25)
    expect(text).toContain('of the votes')
    expect(text).not.toContain('control the board')
    expect(text).not.toContain('control of the board')
  })

  it('the offer prices the lower-vote class at a discount', () => {
    const price = (record?: unknown) => {
      const { g, a, b } = candidate(record)
      goPublic(g, a, b, 25)
      return b.sharePrice
    }
    const one = price()
    const ab = price({ kind: 'ab', hi: 1 })
    const nv = price({ kind: 'nv', hi: 1 })
    expect(ab / one).toBeGreaterThan(0.9)
    expect(ab / one).toBeLessThan(0.985)
    expect(nv).toBeLessThan(ab)
  })

  it('the preview and the listing share one plan', () => {
    const { g, a, b } = candidate({ kind: 'ab', hi: 1 }, 0.8)
    const before = structuredClone(b)
    const retain = ipoRetain(g, before, 25, 'ab')
    goPublic(g, a, b, 25)
    expect(b.share / 0.8).toBeCloseTo(retain, 9)
  })

  it('the preview prices the offer the way the listing does', () => {
    for (const kind of ['ab', 'nv'] as ClassKind[]) {
      const { g, a, b } = candidate({ kind, hi: 1 })
      const text = ipoPreview(g, b, 25)
      const at = /new shares at about \$([\d,.]+)/.exec(text)
      expect(at, text).not.toBeNull()
      const quoted = Number((at as RegExpExecArray)[1].replace(/,/g, ''))
      goPublic(g, a, b, 25)
      // The offer price is quoted; the day-one move is on top of it, within the 0.8-1.45 band.
      expect(b.sharePrice / quoted).toBeGreaterThan(0.78)
      expect(b.sharePrice / quoted).toBeLessThan(1.47)
      expect(b.ipoPrice).toBeCloseTo(quoted, 2)
    }
  })

  it("listing converts the owner's whole stake", () => {
    const ab = candidate({ kind: 'ab', hi: 1 })
    goPublic(ab.g, ab.a, ab.b, 25)
    const s = ab.b.share
    expect(ab.b.classes).toEqual({ kind: 'ab', hi: s })
    expect(ownerVotes(ab.b)).toBeCloseTo((10 * s) / (10 * s + (1 - s)), 4)
    expect(noticeText(ab.g, 'IPO Day!')).toContain('of the votes')

    const nv = candidate({ kind: 'nv', hi: 1 })
    goPublic(nv.g, nv.a, nv.b, 25)
    expect(nv.b.classes).toEqual({ kind: 'nv', hi: nv.b.share })
    expect(ownerVotes(nv.b)).toBe(1)

    const one = candidate()
    goPublic(one.g, one.a, one.b, 25)
    expect(one.b.classes).toBeUndefined()
    expect('classes' in one.b).toBe(false)
    expect(noticeText(one.g, 'IPO Day!')).not.toContain('of the votes')
  })

  it('a plan on a company with relatives and executives thins them with the owner', () => {
    const { g, a, b } = candidate({ kind: 'ab', hi: 1 }, 0.6)
    b.familyShares = [{ id: 'p1', share: 0.1 }]
    b.executiveEquity = 0.05
    goPublic(g, a, b, 25)
    expect(b.classes).toEqual({ kind: 'ab', hi: b.share })
    expect(b.classes?.hi).toBeLessThanOrEqual(b.share + 1e-12)
    const votes = ownerVotes(b)
    expect(votes).toBeGreaterThan(0)
    expect(votes).toBeLessThanOrEqual(1)
  })

  it('a hostile record lists as one class', () => {
    const plain = candidate()
    goPublic(plain.g, plain.a, plain.b, 25)
    const bad = candidate({ kind: 'zz' })
    goPublic(bad.g, bad.a, bad.b, 25)
    expect(bad.b.classes).toBeUndefined()
    expect('classes' in bad.b).toBe(false)
    expect(bad.b.sharePrice).toBe(plain.b.sharePrice)
    expect(bad.b.share).toBe(plain.b.share)
    expect(noticeText(bad.g, 'IPO Day!')).toBe(noticeText(plain.g, 'IPO Day!'))
  })

  it('the yearly price step carries the factor', () => {
    const run = (record?: unknown) => {
      const g = founder()
      const { b } = listed(g, { share: 0.6, marketCap: 5e9, profit: 400e6 })
      b.sharePrice = valuationOf(b) / b.sharesOut
      if (record !== undefined) b.classes = record as never
      const start = b.sharePrice
      updateSharePrice(g, b, g.year)
      return { g, b, start }
    }
    const plain = run()
    const ab = run({ kind: 'ab', hi: 0.6 })
    expect(ab.b.sharePrice / plain.b.sharePrice).toBeGreaterThan(0.95)
    expect(ab.b.sharePrice / plain.b.sharePrice).toBeLessThan(0.995)

    // No record: the step is the one it always was, written out here.
    const g = founder()
    const { b } = listed(g, { share: 0.6, marketCap: 5e9, profit: 400e6 })
    b.sharePrice = valuationOf(b) / b.sharesOut
    const price = b.sharePrice
    const fundamental = valuationOf(b) / b.sharesOut
    const probe = structuredClone(g)
    const market = exchangeMove(probe, b.countryId, g.year)
    const own = bell(probe, -120, 120) / 1000
    const expected = Math.round(Math.max(0.05, Math.min(1e7, 0.5 * price * (1 + market + own) + 0.5 * fundamental * (1 + market * 0.5))) * 100) / 100
    updateSharePrice(g, b, g.year)
    expect(b.sharePrice).toBeCloseTo(expected, 9)
    // A damaged record is no record.
    const hostile = run({ kind: 'zz', hi: 0.6 })
    expect(hostile.b.sharePrice).toBe(plain.b.sharePrice)
  })

  it('the buy floor follows it', () => {
    const quote = (record?: unknown) => {
      const g = founder()
      const { a, b } = listed(g, { marketCap: 10e9, profit: 5e9 })
      if (record !== undefined) b.classes = record as never
      return buyQuote(g, a, b, 1).basePrice
    }
    const plain = quote()
    expect(quote({ kind: 'ab', hi: 0.6 })).toBeCloseTo(0.96 * plain, 6)
    expect(quote({ kind: 'nv', hi: 0.6 })).toBeCloseTo(0.93 * plain, 6)
    expect(quote({ kind: 'zz', hi: 0.6 })).toBe(plain)
  })

  it('a company leaving a group lists as one class', () => {
    const { g, a, b } = candidate({ kind: 'ab', hi: 1 })
    detach(g, a, b, { exchange: 'NYSE', ipoYear: 2015, sharesOut: 1e6, sharePrice: 10 })
    expect(b.public).toBe(true)
    expect(b.classes).toBeUndefined()
    expect('classes' in b).toBe(false)
  })

  it('previews are pure', () => {
    const { g, a, b } = candidate({ kind: 'ab', hi: 1 }, 0.5)
    const json = JSON.stringify(g)
    const rng = g.rng
    for (const float of [5, 25, 60]) {
      ipoPreview(g, b, float)
      ipoRetain(g, b, float, 'ab')
      ipoRetain(g, b, float, null)
    }
    expect(JSON.stringify(g)).toBe(json)
    expect(g.rng).toBe(rng)

    const frozen = deepFreeze(JSON.parse(JSON.stringify(g)) as GameState)
    const fa = frozen.assets.find((x) => x.id === a.id)
    expect(fa).toBeDefined()
    if (!fa) return
    const fb = readBiz(frozen, fa)
    const snapshot = JSON.stringify(frozen)
    const frng = frozen.rng
    for (const float of [5, 25, 60]) {
      expect(() => ipoPreview(frozen, fb, float)).not.toThrow()
      expect(() => ipoRetain(frozen, fb, float, 'nv')).not.toThrow()
    }
    expect(JSON.stringify(frozen)).toBe(snapshot)
    expect(frozen.rng).toBe(frng)
  })

  it('the default float is the one the options quote', () => {
    expect(FLOAT_DEFAULT).toBe(25)
    const { g, b } = candidate({ kind: 'ab', hi: 1 })
    expect(ipoRetain(g, b, FLOAT_DEFAULT, 'ab')).toBeGreaterThan(0.5)
    expect(ipoRetain(g, b, FLOAT_DEFAULT, 'ab')).toBeLessThan(1)
  })
})
