// Companies that leave the player's hands outside the business screens (debt seizure, repossession,
// divorce) reach the conglomerate code through assetHooks.businessGone, so a group that loses a
// member to them winds up at once instead of at the next yearly step.
import { describe, expect, it } from 'vitest'
import { businessGone } from '../src/game/assetHooks'
import { installManager, managerCandidate } from '../src/game/business/career'
import { formGroup } from '../src/game/business/conglomerate-actions'
import { groupsOf, readMembership } from '../src/game/business/conglomerate-state'
import { bestPlan } from '../src/game/business/economy'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { bizOf, readBiz } from '../src/game/business/state'
import { createNewLife } from '../src/game/life'
import type { Asset, GameState } from '../src/game/types'
import { getCountry } from '../src/game/world'

function life(seed: number): GameState {
  const g = createNewLife({ seed, year: 1985, countryId: 'us' })
  g.queue = []
  g.year = 2024
  g.character.age = 39
  g.character.money = 5_000_000
  g.character.talent = null
  g.character.talents = []
  return g
}

function addCompany(g: GameState, name: string, city: number): Asset {
  const where = getCountry('us').cities[city]
  const b0 = newBiz(g, 'restaurant', 'us', where, { cash: 3_000_000, founded: 2018, outlets: [{ countryId: 'us', city: where, count: 6, opened: 2018 }] })
  const a = createBusinessAsset(g, name, b0, 200_000)
  g.assets.push(a)
  const b = bizOf(g, a)
  installManager(g, b, managerCandidate(g, b, 70))
  const p = bestPlan(g, b)
  b.price = p.price
  b.production = p.production
  return a
}

describe('assetHooks.businessGone', () => {
  it('winds up a two-company group when one member is seized', () => {
    const g = life(7)
    const a1 = addCompany(g, 'First Co', 0)
    const a2 = addCompany(g, 'Second Co', 1)
    expect(formGroup(g, [a1.id, a2.id], 'Hook Holdings')).toBe(true)
    g.queue = []
    expect(groupsOf(g)).toHaveLength(1)
    // What finance.ts seizeAssetsForDebt does: take the asset, then notify.
    g.assets = g.assets.filter((x) => x.id !== a1.id)
    businessGone(g, a1)
    expect(groupsOf(g)).toHaveLength(0)
    expect(readMembership(readBiz(g, a2).group)).toBeNull()
  })

  it('ignores assets that are not companies', () => {
    const g = life(8)
    const before = JSON.stringify(g)
    businessGone(g, { id: 'x', kind: 'car', name: 'Car', emoji: '🚗', purchasePrice: 1, value: 1, condition: 100, purchasedAge: 30, upkeep: 0, details: {} })
    expect(JSON.stringify(g)).toBe(before)
  })
})
