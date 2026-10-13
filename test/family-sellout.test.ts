// Selling out of a listed family company (v2.4.0): the company leaves your list, and each
// relative's shares stay theirs as part of their own wealth (NPCs hold no Asset records).
import { describe, expect, it } from 'vitest'
import { makeTestGame } from './helpers'
import { createPerson } from '../src/game/people'
import { formGroup, sellGroupShares } from '../src/game/business/conglomerate-actions'
import { groupById, groupsOf, liveGroup, saveGroup, sharePriceOf, syncMembers } from '../src/game/business/conglomerate-state'
import { sellShares } from '../src/game/business/exit'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { bizOf, businessAssets } from '../src/game/business/state'
import { yearlyBusinessImpl } from '../src/game/business/yearly'

function family() {
  const g = makeTestGame(311, { age: 50, money: 1_000_000 })
  const sib = createPerson(g, { relation: 'sibling', age: 45, firstName: 'Mina', money: 10_000, occupation: 'Clerk', relationship: 80 })
  return { g, sib }
}

function listedCompany(g: ReturnType<typeof makeTestGame>, name = 'Park Foods') {
  const a = createBusinessAsset(g, name, newBiz(g, 'grocery', 'kr', 'Seoul', { cash: 5_000_000 }), 1e6)
  g.assets.push(a)
  const b = bizOf(g, a)
  b.public = true
  b.exchange = 'KRX'
  b.ipoYear = g.year - 3
  b.sharesOut = 1_000_000
  b.sharePrice = 40
  b.valuation = 40_000_000
  return { a, b }
}

describe('selling out of a listed family company', () => {
  it('removes the company and keeps the relative’s shares as their own wealth', () => {
    const { g, sib } = family()
    const { a, b } = listedCompany(g)
    b.share = 0.5
    b.familyShares = [{ id: sib.id, share: 0.5 }]
    const before = sib.money, cash = g.character.money
    sellShares(g, a, b, 1)
    expect(g.assets.some((x) => x.id === a.id)).toBe(false)
    expect(g.character.money).toBeGreaterThan(cash)
    // Their half, at the market price after your sale, joins their wealth (not income).
    const after = sib.money - before
    expect(after).toBeGreaterThan(0.5 * 1_000_000 * 40 * 0.6)
    expect(after).toBeLessThanOrEqual(0.5 * 1_000_000 * 40)
    const sold = g.queue.find((q) => q.kind === 'notice' && q.title === 'Sold Out')
    expect(sold && sold.kind === 'notice' ? sold.text : '').toContain('Mina')
  })

  it('removes a listed family group, every division, and pays the relatives’ part', () => {
    const { g, sib } = family()
    const one = listedCompany(g, 'Park Foods'), two = listedCompany(g, 'Park Logistics')
    for (const x of [one.b, two.b]) { x.public = false; x.sharesOut = 0; x.sharePrice = 0; x.exchange = ''; x.ipoYear = 0 }
    expect(formGroup(g, [one.a.id, two.a.id], 'Park Holdings')).toBe(true)
    const id = groupsOf(g)[0].core.id
    const grp = liveGroup(g, id)!
    grp.core.listing = { exchange: 'KRX', ipoYear: g.year - 2, sharesOut: 2_000_000, sharePrice: 30 }
    grp.core.share = 0.6
    grp.core.familyShares = [{ id: sib.id, share: 0.4 }]
    syncMembers(grp)
    saveGroup(g, grp)
    const marketCap = sharePriceOf(groupById(g, id)!) * 2_000_000
    const before = sib.money
    expect(sellGroupShares(g, id, 1)).toBe(true)
    expect(groupById(g, id)).toBeNull()
    expect(businessAssets(g)).toHaveLength(0)
    const paid = sib.money - before
    expect(paid).toBeGreaterThan(0.4 * marketCap * 0.6)
    expect(paid).toBeLessThanOrEqual(0.4 * marketCap + 1)
  })

  it('cleans up a listed company you already sold out of, at the next year-end', () => {
    const { g, sib } = family()
    const { a, b } = listedCompany(g)
    // An old save: sold out before this fix, left at 0% with the relative's shares.
    b.share = 0
    b.familyShares = [{ id: sib.id, share: 0.3 }]
    const before = sib.money
    yearlyBusinessImpl(g)
    expect(g.assets.some((x) => x.id === a.id)).toBe(false)
    expect(sib.money - before).toBeCloseTo(0.3 * 1_000_000 * 40, -2)
  })

  it('keeps selling part of a family company as before', () => {
    const { g, sib } = family()
    const { a, b } = listedCompany(g)
    b.share = 0.5
    b.familyShares = [{ id: sib.id, share: 0.5 }]
    const before = sib.money
    sellShares(g, a, b, 0.5)
    expect(g.assets.some((x) => x.id === a.id)).toBe(true)
    expect(b.share).toBeCloseTo(0.25)
    expect(sib.money).toBe(before)
  })
})
