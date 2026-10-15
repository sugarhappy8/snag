// Share classes, task 2: control follows the votes. Board seats come from ownerVotes through
// seatPlan, and the three places that write the owner's stake keep the founders' class in step.
import { describe, expect, it } from 'vitest'
import { ownerControls } from '../src/game/business/board'
import { boardExists, boardOf, boardView, controlsBoard, controlsFor, groupOf, ownerSeats, seatPlan, syncSeats, type SeatPlan } from '../src/game/business/board-state'
import { passOdds } from '../src/game/business/board-vote'
import { sellShares } from '../src/game/business/exit'
import { buyOwnShares, buyQuote, controlsWith } from '../src/game/business/own-trade'
import { equityQuote, transactEquity } from '../src/game/business/rescue'
import { ownerVotes } from '../src/game/business/share-classes'
import { clampN, money } from '../src/game/business/util'
import { bizOf, readBiz, type BizState } from '../src/game/business/state'
import type { GameState } from '../src/game/types'
import { deepFreeze } from './fuzz-kit'
import { founder, listed, listedGroup } from './own-listing-kit'

/** seatPlan as it stood before share classes (git show 90d7f4: board-state.ts), read from the stake alone. */
function oldSeatPlan(g: GameState, b: BizState): SeatPlan {
  if (!boardExists(g, b)) return { size: 0, owner: 0, investor: 0, independent: 0, group: 0 }
  const outside = clampN(1 - b.share, 0, 1)
  const inGroup = groupOf(g, b) !== null
  let size = b.public ? 7 + Math.round(4 * outside) : 3 + Math.round(4 * outside)
  if (inGroup && !b.public) size = Math.max(size, 5)
  if (size % 2 === 0) size += 1
  let owner = Math.round(b.share * size)
  if (b.share >= 0.05) owner = Math.max(1, owner)
  let independent = 0
  if (b.public) {
    owner = Math.min(owner, size - 2)
    independent = Math.max(2, Math.ceil((size - owner) * 0.6))
  } else if (outside > 0.001) owner = Math.min(owner, size - 1)
  else independent = inGroup ? 1 : 0
  owner = Math.max(0, Math.min(owner, size - independent))
  const group = inGroup ? owner : 0
  if (inGroup) owner = 0
  const investor = Math.max(0, size - owner - group - independent)
  return { size, owner, investor, independent, group }
}

/** The notices queued under one title, oldest first. */
function noticesTitled(g: GameState, title: string): string[] {
  const out: string[] = []
  for (const m of g.queue) if (m.kind === 'notice' && m.title === title) out.push(m.text)
  return out
}

describe('control follows the votes', () => {
  it('one class: the seat plan is what it was', () => {
    const g = founder()
    const { b } = listed(g, { share: 0.5 })
    const SHARES = [0, 0.01, 0.04, 0.05, 0.2, 0.49, 0.5, 0.51, 0.75, 0.999, 1]
    // None of these is a live record: no field and damaged ones. (A record with a kind and a damaged hi is
    // a live one with hi 0; with relatives holding the founders' class it is not one class. The next tests cover it.)
    const records: unknown[] = [undefined, 7, 'ab', null, [], { kind: 'zz', hi: 0.5 }, { hi: 0.5 }]
    let seen = 0
    for (const isPublic of [true, false]) {
      for (const family of [undefined, [{ id: 'p1', share: 0.1 }]]) {
        for (const share of SHARES) {
          for (const record of records) {
            b.public = isPublic
            b.share = share
            if (family) b.familyShares = family.map((f) => ({ ...f }))
            else delete b.familyShares
            if (record === undefined) delete b.classes
            else b.classes = record as never
            expect(seatPlan(g, b), `public ${isPublic} share ${share} family ${Boolean(family)} record ${JSON.stringify(record)}`).toEqual(oldSeatPlan(g, b))
            seen++
          }
        }
      }
    }
    expect(seen).toBe(2 * 2 * SHARES.length * records.length)
  })

  it('a division in a group is seated as before, whatever record it carries', () => {
    const g = founder()
    const { members } = listedGroup(g, 'us', 0.6)
    for (const member of members) {
      const b = bizOf(g, member)
      const before = oldSeatPlan(g, b)
      expect(before.group).toBeGreaterThan(0)
      for (const record of [{ kind: 'ab', hi: 1 }, { kind: 'nv', hi: 1 }]) {
        b.classes = record as never
        b.public = true
        expect(seatPlan(g, b)).toEqual(oldSeatPlan(g, b))
        b.public = false
        expect(seatPlan(g, b)).toEqual(before)
      }
    }
  })

  it('a founder class controls the board with 15% of the shares', () => {
    const g = founder()
    const { a, b } = listed(g, { share: 0.15 })
    b.classes = { kind: 'ab', hi: 0.15 }
    const plan = seatPlan(g, b)
    expect(plan.size).toBe(11)
    expect(plan.owner).toBe(7)
    expect(ownerControls(g, a)).toBe(true)
    delete b.classes
    expect(seatPlan(g, b).owner).toBe(2)
    expect(ownerControls(g, a)).toBe(false)
  })

  it('a non-voting float', () => {
    const g = founder()
    const { b } = listed(g, { share: 0.15 })
    b.classes = { kind: 'nv', hi: 0.15 }
    const plan = seatPlan(g, b)
    expect(plan.owner).toBe(9)
    expect(plan.size).toBe(11)
    expect(plan.independent).toBe(2)
    expect(controlsFor(g, b)).toBe(true)
  })

  it('under half the votes is no control', () => {
    const g = founder()
    const { b } = listed(g, { share: 0.02 })
    b.classes = { kind: 'ab', hi: 0.02 }
    const plan = seatPlan(g, b)
    expect(plan.owner).toBe(2)
    expect(plan.size).toBe(11)
    expect(controlsFor(g, b)).toBe(false)
  })

  it('the board size still follows the shares, not the votes', () => {
    const g = founder()
    const { b } = listed(g, { share: 0.15 })
    const one = seatPlan(g, b).size
    b.classes = { kind: 'nv', hi: 0.15 }
    expect(seatPlan(g, b).size).toBe(one)
  })

  it('a damaged record seats the board as one class does', () => {
    const g = founder()
    const { b } = listed(g, { share: 0.15 })
    const one = seatPlan(g, b)
    for (const bad of [7, 'ab', null, [], { kind: 'zz', hi: 0.15 }, { kind: 'ab', hi: Number.NaN }, { kind: 'ab' }]) {
      b.classes = bad as never
      expect(() => seatPlan(g, b)).not.toThrow()
      expect(seatPlan(g, b)).toEqual(one)
    }
  })

  it('the board is seated by the votes', () => {
    const g = founder()
    const { a, b } = listed(g, { share: 0.15 })
    b.classes = { kind: 'ab', hi: 0.15 }
    syncSeats(g, a, b, boardOf(b))
    expect(ownerSeats(boardOf(b))).toBe(7)
    expect(controlsBoard(boardView(g, a, b))).toBe(true)
  })

  it('controlsWith agrees with the board', () => {
    const g = founder()
    const { a, b } = listed(g, { share: 0.15 })
    for (const [kind, share] of [['ab', 0.15], ['ab', 0.3], ['ab', 0.6], ['nv', 0.15]] as const) {
      b.share = share
      b.classes = { kind, hi: share }
      expect(controlsWith(g, b, b.share), `${kind} ${share}`).toBe(ownerControls(g, a))
      expect(controlsFor(g, b)).toBe(ownerControls(g, a))
    }
    // A hypothetical stake is judged with the same founders' class: the new shares are ordinary.
    b.share = 0.15
    b.classes = { kind: 'ab', hi: 0.15 }
    expect(controlsWith(g, b, 0.3)).toBe(controlsFor(g, { ...b, share: 0.3 }))
    expect(b.share).toBe(0.15)
  })

  it('a Stocks buy adds ordinary shares', () => {
    const g = founder()
    const { a, b } = listed(g, { share: 0.3, marketCap: 10e9 })
    b.classes = { kind: 'ab', hi: 0.3 }
    const before = ownerVotes(b)
    const q = buyQuote(g, a, b, 1e12)
    expect(q.maxDollars).toBeGreaterThan(0)
    expect(buyOwnShares(g, a, b, q.maxDollars)).toBe(true)
    expect(b.classes?.hi).toBe(0.3)
    expect(b.share).toBeGreaterThan(0.3)
    const after = ownerVotes(b)
    expect(after).toBeGreaterThan(before)
    expect(after).toBeLessThan(ownerVotes({ ...b, classes: { kind: 'ab', hi: b.share } }))
    expect(q.controls).toBe(ownerControls(g, a))
    expect(q.controlsBefore).toBe(true)
  })

  it('a buy quote judges control by the votes the new shares give', () => {
    const g = founder()
    const { a, b } = listed(g, { share: 0.02, marketCap: 10e9 })
    b.classes = { kind: 'ab', hi: 0.02 }
    const q = buyQuote(g, a, b, 1e12)
    expect(q.controlsBefore).toBe(false)
    expect(q.controls).toBe(controlsFor(g, { ...b, share: q.newShare }))
    // The same buy on a one-class company is decided on the shares alone.
    const one = listed(g, { share: 0.02, marketCap: 10e9, name: 'One Co' })
    expect(buyQuote(g, one.a, one.b, 1e12).controls).toBe(controlsWith(g, one.b, 0.17))
  })

  it('selling clamps the founders class and buying back does not revive it', () => {
    const g = founder()
    const { a, b } = listed(g, { share: 0.5, marketCap: 10e9 })
    b.classes = { kind: 'ab', hi: 0.5 }
    sellShares(g, a, b, 0.4)
    expect(b.share).toBeCloseTo(0.3, 12)
    expect(b.classes?.hi).toBeCloseTo(0.3, 12)
    const q = buyQuote(g, a, b, 1e12)
    expect(q.fraction).toBeCloseTo(0.15, 12)
    expect(buyOwnShares(g, a, b, q.maxDollars)).toBe(true)
    expect(b.classes?.hi).toBeCloseTo(0.3, 12)
    // The buy is a whole number of dollars, so the fraction lands a hair under the 15% cap.
    expect(b.share).toBeCloseTo(0.45, 6)
  })

  it('a sale that only takes ordinary shares leaves the founders class alone', () => {
    const g = founder()
    const { a, b } = listed(g, { share: 0.5, marketCap: 10e9 })
    b.classes = { kind: 'ab', hi: 0.3 }
    sellShares(g, a, b, 0.2)
    expect(b.share).toBeCloseTo(0.4, 12)
    expect(b.classes).toEqual({ kind: 'ab', hi: 0.3 })
  })

  it('a sale leaves one class and damaged records as they were', () => {
    const g = founder()
    const one = listed(g, { share: 0.5, marketCap: 10e9 })
    sellShares(g, one.a, one.b, 0.4)
    expect('classes' in one.b).toBe(false)
    for (const bad of [7, 'ab', null, { kind: 'zz', hi: 0.9 }]) {
      const { a, b } = listed(g, { share: 0.5, marketCap: 10e9, name: `Bad ${String(bad)}` })
      b.classes = bad as never
      expect(() => sellShares(g, a, b, 0.4)).not.toThrow()
      expect(b.classes).toEqual(bad)
    }
  })

  it('selling every share leaves the company without a crash', () => {
    const g = founder()
    const { a, b } = listed(g, { share: 0.5, marketCap: 10e9 })
    b.classes = { kind: 'ab', hi: 0.5 }
    expect(() => sellShares(g, a, b, 1)).not.toThrow()
  })

  it('Buy Out Investors needs the votes, not the shares', () => {
    const g = founder()
    const { a, b } = listed(g, { share: 0.15 })
    b.classes = { kind: 'ab', hi: 0.15 }
    syncSeats(g, a, b, boardOf(b))
    expect(ownerSeats(boardOf(b))).toBe(7)
    transactEquity(g, a.id, 'secondary', 1000)
    expect(noticesTitled(g, 'Ownership')).not.toContain('You need control of the board for this.')

    const g2 = founder()
    const two = listed(g2, { share: 0.15 })
    expect(transactEquity(g2, two.a.id, 'secondary', 1000)).toBe(false)
    expect(noticesTitled(g2, 'Ownership')).toContain('You need control of the board for this.')
  })

  it('Buy Out Investors adds ordinary shares', () => {
    const g = founder()
    const { a, b } = listed(g, { share: 0.15 })
    b.classes = { kind: 'ab', hi: 0.15 }
    let done = false
    for (let i = 0; i < 20 && !done; i++) {
      g.yearActions = {}
      done = transactEquity(g, a.id, 'secondary', 1_000_000)
    }
    expect(done).toBe(true)
    expect(b.share).toBeGreaterThan(0.15)
    expect(b.classes).toEqual({ kind: 'ab', hi: 0.15 })
  })

  it('the buyback keeps the founders class in step', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const g = founder(seed)
      const { a, b } = listed(g, { share: 0.9 })
      b.classes = { kind: 'ab', hi: 0.9 }
      b.cash = 2e9
      const amount = 250_000_000
      const q = equityQuote(g, a, b, 'buyback', amount)
      expect(q.units, `seed ${seed}`).toBeGreaterThan(0.01)
      const proposal = { kind: 'dividend' as const, by: 'owner' as const, amount, merit: 0, label: `buyback: ${money(amount)}` }
      expect(passOdds(g, a, b, proposal), `seed ${seed}`).toBeGreaterThan(0.99)
      expect(transactEquity(g, a.id, 'buyback', amount), `seed ${seed}`).toBe(true)
      const factor = 1 / (1 - q.units)
      expect(b.share).toBeCloseTo(Math.min(1, 0.9 * factor), 9)
      expect(b.classes?.hi).toBeCloseTo(Math.min(1, 0.9 * factor), 9)
      expect(b.classes?.kind).toBe('ab')
    }
  })

  it('a buyback scales only the founders class and never past the whole company', () => {
    const g = founder()
    const { a, b } = listed(g, { share: 0.6 })
    b.classes = { kind: 'ab', hi: 0.3 }
    b.cash = 2e9
    const q = equityQuote(g, a, b, 'buyback', 250_000_000)
    for (let i = 0; i < 20 && b.share === 0.6; i++) {
      g.yearActions = {}
      transactEquity(g, a.id, 'buyback', 250_000_000)
    }
    expect(b.share).toBeGreaterThan(0.6)
    expect(b.classes?.hi).toBeCloseTo(Math.min(1, 0.3 / (1 - q.units)), 9)
    expect(b.classes?.hi).toBeLessThanOrEqual(b.share + 1e-12)
  })

  it('reads the votes from a frozen state', () => {
    const g = founder()
    const { a, b } = listed(g, { share: 0.15 })
    b.classes = { kind: 'ab', hi: 0.15 }
    const frozen = deepFreeze(JSON.parse(JSON.stringify(g)) as GameState)
    const fa = frozen.assets.find((x) => x.id === a.id)
    expect(fa).toBeDefined()
    if (!fa) return
    const fb = readBiz(frozen, fa)
    const snapshot = JSON.stringify(frozen)
    expect(seatPlan(frozen, fb).owner).toBe(7)
    expect(controlsFor(frozen, fb)).toBe(true)
    expect(controlsWith(frozen, fb, 0.3)).toBe(true)
    expect(JSON.stringify(frozen)).toBe(snapshot)
  })
})
