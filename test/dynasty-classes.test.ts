// An estate splits a listed company that has share classes. The deceased's founder shares are not
// multiplied by the split: the relatives' shares hold the founders' class by rule (share-classes.ts), so
// the owner's part of that class is what is left of the whole once the relatives' shares are counted.
// No money, price or ownership changes; only the record of the owner's founder shares.
import { describe, expect, it } from 'vitest'
import { inheritConglomerates } from '../src/game/business/dynasty-ownership'
import { successionEstateUnits } from '../src/game/business/nepo-inheritance'
import { ownerVotes } from '../src/game/business/share-classes'
import type { BizState } from '../src/game/business/state'
import { continueAsChild } from '../src/game/life'
import { createPerson } from '../src/game/people'
import type { GameState, Person } from '../src/game/types'
import { founder, listed, privateCompany } from './own-listing-kit'

/** The founders' class as a whole: the owner's founder shares (never more than the stake) and every relative's shares. */
function foundersClass(b: BizState): number {
  const fam = (b.familyShares ?? []).reduce((sum, f) => sum + f.share, 0)
  return Math.min(b.classes?.hi ?? 0, b.share) + fam
}

/** A listed company: the player on 70% with `kind` shares (60% of the company in the founders' class), a sister on 5%, and `kids` adult children. */
function estate(kind: 'ab' | 'nv', kids: number): { g: GameState; heirs: Person[]; sister: Person; id: string } {
  const g = founder(41)
  const sister = createPerson(g, { relation: 'sibling', age: 40, money: 1_000, relationship: 80 })
  const heirs: Person[] = []
  for (let i = 0; i < kids; i++) heirs.push(createPerson(g, { relation: 'child', age: 28 - 4 * i, firstName: i === 0 ? 'Ada' : 'Ben', money: 10_000, relationship: 90 }))
  const { a, b } = listed(g, { share: 0.7, family: [{ id: sister.id, share: 0.05 }] })
  b.classes = { kind, hi: 0.6 }
  g.queue = []
  return { g, heirs, sister, id: a.id }
}

describe('an estate splits a company with share classes', () => {
  it.each(['ab', 'nv'] as const)('two heirs: the founders class stays what it was, and no money moves (%s)', (kind) => {
    const { g, heirs, sister, id } = estate(kind, 2)
    const a = g.assets.find((x) => x.id === id)!
    const b = a.details as unknown as BizState
    const before = { cash: g.character.money, kin: g.people.map((p) => p.money), price: b.sharePrice, valuation: b.valuation, bizCash: b.cash }
    expect(foundersClass(b)).toBeCloseTo(0.65, 12)

    inheritConglomerates(g, heirs[0].id, successionEstateUnits(g))

    // Each heir has 35% (the first as the owner, the second as a relative); the sister keeps her 5%.
    expect(b.share).toBeCloseTo(0.35, 12)
    expect(b.familyShares?.map((f) => [f.id, f.share])).toEqual([[sister.id, 0.05], [heirs[1].id, 0.35]])
    // The founders' class is the 0.60 and the sister's 0.05 it was, not 0.10 more.
    expect(foundersClass(b)).toBeCloseTo(0.65, 12)
    expect(b.classes?.kind).toBe(kind)
    expect(b.classes!.hi).toBeCloseTo(0.25, 12)
    // Nothing is bought or sold: money, the price and the company's cash are as they were.
    expect(g.character.money).toBe(before.cash)
    expect(g.people.map((p) => p.money)).toEqual(before.kin)
    expect(b.sharePrice).toBe(before.price)
    expect(b.valuation).toBe(before.valuation)
    expect(b.cash).toBe(before.bizCash)
    expect(ownerVotes(b)).toBeLessThan(0.5)
  })

  it('a sole heir keeps the record exactly', () => {
    const { g, heirs, id } = estate('ab', 1)
    const b = g.assets.find((x) => x.id === id)!.details as unknown as BizState
    const record = JSON.stringify(b.classes)
    const votes = ownerVotes(b)
    inheritConglomerates(g, heirs[0].id, successionEstateUnits(g))
    expect(b.share).toBeCloseTo(0.7, 12)
    expect(JSON.stringify(b.classes)).toBe(record)
    expect(ownerVotes(b)).toBe(votes)
  })

  it('relatives who take more than the founders class leave the heir none, never a negative record', () => {
    const { g, heirs, id } = estate('ab', 2)
    const b = g.assets.find((x) => x.id === id)!.details as unknown as BizState
    b.classes = { kind: 'ab', hi: 0.2 }
    inheritConglomerates(g, heirs[0].id, successionEstateUnits(g))
    expect(b.classes).toEqual({ kind: 'ab', hi: 0 })
  })

  it('a private company keeps its plan for the IPO, and a company with one class has no record to change', () => {
    const g = founder(41)
    const sister = createPerson(g, { relation: 'sibling', age: 40, money: 1_000, relationship: 80 })
    const kids = [createPerson(g, { relation: 'child', age: 28, money: 10_000, relationship: 90 }), createPerson(g, { relation: 'child', age: 24, money: 10_000, relationship: 90 })]
    const priv = privateCompany(g)
    priv.b.share = 0.7
    priv.b.familyShares = [{ id: sister.id, share: 0.05 }]
    priv.b.classes = { kind: 'ab', hi: 1 }
    const one = listed(g, { share: 0.7, family: [{ id: sister.id, share: 0.05 }] })
    inheritConglomerates(g, kids[0].id, successionEstateUnits(g))
    expect(priv.b.classes).toEqual({ kind: 'ab', hi: 1 })
    expect('classes' in one.b).toBe(false)
  })

  it('the heir who continues the line holds the same part of the founders class as the others', () => {
    for (const pick of [0, 1]) {
      const { g, heirs } = estate('ab', 2)
      g.character.alive = false
      g.character.causeOfDeath = 'Old Age'
      const next = continueAsChild(g, heirs[pick].id)
      const company = next.assets.find((x) => x.kind === 'business')!
      const b = company.details as unknown as BizState
      expect(b.share).toBeCloseTo(0.35, 12)
      expect(foundersClass(b), `heir ${pick}`).toBeCloseTo(0.65, 12)
    }
  })
})
