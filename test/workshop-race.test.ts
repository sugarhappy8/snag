// The Workshop's races: the future race for modern lives (fictional breakthroughs, a rival's
// deadline rolled per family) and firsts that are world state, so an heir can't beat history twice.
import { describe, expect, it } from 'vitest'
import { continueAsChild } from '../src/game/life'
import { killCharacter } from '../src/game/death'
import { createPerson } from '../src/game/people'
import { license } from '../src/game/workshop/launch'
import { candidates, findInvention, inventions, mutWorkshop, readWorkshop, worldFirsts } from '../src/game/workshop/notebook'
import { yearlyWorkshop } from '../src/game/workshop/yearly'
import { give, idea, inventor, nextYear } from './workshop-fixtures'

describe('heirs', () => {
  it('inherit invention assets and their royalties, not the notebook, and cannot beat history twice', () => {
    const g = inventor({ genius: true, year: 1968, age: 40, seed: 7 })
    give(g, 'hist-pocket-telephone', 85)
    give(g, 'pizza-scissors', 10)
    license(g, idea('hist-pocket-telephone'))
    expect(worldFirsts(g).has('hist-pocket-telephone')).toBe(true)
    nextYear(g)
    yearlyWorkshop(g)
    g.queue = []
    const inv = inventions(g)[0]
    expect(inv.inv.last).toBe(1968)
    const heir = createPerson(g, { relation: 'child', age: 20, money: 0 })
    killCharacter(g, 'Old Age')
    const n = continueAsChild(g, heir.id)
    expect(n.assets.some((a) => a.id === inv.a.id)).toBe(true)
    expect(readWorkshop(n).ideas).toHaveLength(0)
    expect(worldFirsts(n).has('hist-pocket-telephone')).toBe(true)
    // The next fiscal year is paid to the heir, once, as taxable income.
    nextYear(n)
    const money = n.character.money
    yearlyWorkshop(n)
    const after = findInvention(n, inv.a.id)!
    expect(after.inv.last).toBe(1969)
    expect(after.inv.lastIncome).toBeGreaterThan(0)
    expect(n.character.money - money).toBe(after.inv.lastIncome)
    expect(n.flags.taxableIncome).toBe(after.inv.lastIncome)
    yearlyWorkshop(n)
    expect(n.character.money - money).toBe(after.inv.lastIncome)
    // Review: an heir (a genius, still inside the race window) could invent the telephone "first" again.
    n.character.talents = ['Inventor']
    mutWorkshop(n).skill = 90
    expect(candidates(n, readWorkshop(n)).some((d) => d.id === 'hist-pocket-telephone')).toBe(false)
    expect(candidates(n, readWorkshop(n)).some((d) => d.real)).toBe(true)
  })

  it('old saves add their own firsts to the world record on the next age-up', () => {
    const g = inventor({ genius: true, year: 1970 })
    give(g, 'hist-color-cube', 80)
    license(g, idea('hist-color-cube'))
    delete g.flags['workshop.firsts']
    nextYear(g)
    yearlyWorkshop(g)
    expect(worldFirsts(g).has('hist-color-cube')).toBe(true)
  })
})
