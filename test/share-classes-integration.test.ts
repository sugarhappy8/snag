// Share classes, integration checks: places where a listed company's structure meets code that was written
// without it. Each case is a thing a player can do in a normal game.
import { describe, expect, it } from 'vitest'
import { ownerControls } from '../src/game/business/board'
import { installManager, managerCandidate } from '../src/game/business/career'
import { refreshValue, valuationOf } from '../src/game/business/economy'
import { goPublic, ipoPreview, ipoRetain } from '../src/game/business/exit'
import { grantCeoEquity } from '../src/game/business/executive'
import { buyOwnShares, buyPreview, buyQuote } from '../src/game/business/own-trade'
import { equityQuote, transactEquity } from '../src/game/business/rescue'
import { classFactor, ownerVotes, votesAfterIpo } from '../src/game/business/share-classes'
import { readClasses, type ClassKind } from '../src/game/business/state'
import { founder, listed, privateCompany } from './own-listing-kit'

/** A listed company whose price sits exactly where the market would put it for its structure. */
function parked(kind: ClassKind | null) {
  const g = founder(41)
  const { a, b } = listed(g, { share: 0.6, marketCap: 5e9, profit: 500e6 })
  b.cash = 5e9
  if (kind) b.classes = { kind, hi: b.share }
  b.valuation = Math.round(valuationOf(b) * classFactor(b))
  b.sharePrice = Math.round((b.valuation / b.sharesOut) * 100) / 100
  refreshValue(a, b)
  return { g, a, b }
}

describe('share classes meet Capital & Ownership', () => {
  for (const kind of [null, 'ab', 'nv'] as const) {
    for (const move of ['subscribe', 'buyback', 'secondary'] as const) {
      it(`${move} keeps the price the ${kind ?? 'single'} structure carries`, () => {
        const { g, a, b } = parked(kind)
        const before = b.sharePrice
        expect(transactEquity(g, a.id, move, 1000)).toBe(true)
        // Putting in or paying out a thousand dollars does not re-rate the shares, and it must not give
        // back the 4% or 7% the market takes off for fewer votes.
        expect(Math.abs(b.sharePrice / before - 1)).toBeLessThan(0.005)
      })
    }
  }

  it('what it costs to buy out investors follows the structure too', () => {
    const one = parked(null)
    const founders = parked('ab')
    const a = equityQuote(one.g, one.a, one.b, 'secondary', 0)
    const b = equityQuote(founders.g, founders.a, founders.b, 'secondary', 0)
    expect(b.price / a.price).toBeCloseTo(0.96, 2)
  })
})

describe('share classes meet a stake that shrank without a sale', () => {
  /** A listed company with founder shares whose hired CEO has been granted equity: the stake is 3% smaller. */
  function granted(kind: ClassKind) {
    const g = founder(41)
    const { a, b } = listed(g, { share: 0.5, marketCap: 5e9, profit: 0 })
    b.classes = { kind, hi: b.share }
    installManager(g, b, managerCandidate(g, b, 95))
    g.queue = []
    expect(grantCeoEquity(g, a.id)).toBe(true)
    expect(b.share).toBeCloseTo(0.47, 6)
    return { g, a, b }
  }

  for (const kind of ['ab', 'nv'] as const) {
    it(`shares bought afterwards are ordinary, not the ${kind} founders' class`, () => {
      const { g, a, b } = granted(kind)
      const held = b.share
      const preview = buyPreview(g, a, b, 400e6)
      expect(buyOwnShares(g, a, b, 400e6)).toBe(true)
      expect(b.share).toBeGreaterThan(held + 0.03)
      // The founders' class is what the owner held when the buy began. The new shares are the public's.
      expect(readClasses(b.classes)?.hi).toBeLessThanOrEqual(held + 1e-9)
      const honest = ownerVotes({ ...b, classes: { kind, hi: held } })
      expect(ownerVotes(b)).toBeCloseTo(honest, 9)
      // The preview named the votes the buy then gave.
      const said = /hold (\d+)% of the votes/.exec(preview)
      expect(said && Number(said[1])).toBe(Math.round(honest * 100))
    })
  }

  it('a quote says the same about control as the buy then does', () => {
    const { g, a, b } = granted('ab')
    const q = buyQuote(g, a, b, 400e6)
    expect(buyOwnShares(g, a, b, 400e6)).toBe(true)
    const after = ownerVotes(b)
    // controlsBefore and controls come from the same rule the seat plan uses.
    expect(q.newShare).toBeCloseTo(b.share, 9)
    expect(q.controls).toBe(after >= 0.5)
  })
})

describe('share classes: the IPO preview is the listing', () => {
  // A guard rather than a repair: it passed when it was written. Over owners with relatives and executives, and
  // floats from small to large, the votes and the control the preview names are the ones the listing then gives.
  it('names the votes and the control the listing then gives', () => {
    let seen = 0
    for (const kind of ['ab', 'nv'] as const) {
      for (const share of [1, 0.75, 0.5, 0.3]) {
        for (const family of [0, 0.1]) {
          for (const exec of [0, 0.05]) {
            for (const float of [10, 25, 50]) {
              const g = founder(41)
              const { a, b } = privateCompany(g)
              b.share = share
              if (family) b.familyShares = [{ id: 'p1', share: Math.min(family, 1 - share) }]
              if (exec) b.executiveEquity = Math.min(exec, Math.max(0, 1 - share - (b.familyShares?.[0]?.share ?? 0)))
              b.classes = { kind, hi: 1 }
              const label = `${kind} share ${share} family ${family} exec ${exec} float ${float}`
              const preview = ipoPreview(g, b, float)
              const predicted = votesAfterIpo(b, ipoRetain(g, b, float, kind), kind)
              goPublic(g, a, b, float)
              const actual = ownerVotes(b)
              expect(actual, label).toBeCloseTo(predicted, 9)
              const said = /hold (\d+)% of the votes/.exec(preview)
              expect(said && Number(said[1]), label).toBe(Math.round(actual * 100))
              const claims = /would control the board|keep control of the board/.test(preview)
              expect(claims, label).toBe(actual >= 0.5)
              if (claims) expect(ownerControls(g, a), label).toBe(true)
              seen++
            }
          }
        }
      }
    }
    expect(seen).toBe(2 * 4 * 2 * 2 * 3)
  })
})
