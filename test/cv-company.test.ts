// A company shows once on the CV. Founding, stepping down to a hired CEO and taking over again
// all write CEO rows to the job history; those rows used to list the company a second time next
// to the business you still own. A company you still own is one row; a sold or closed one is one
// historic row; two different companies with the same name stay two.
import { describe, expect, it } from 'vitest'
import { becomeCeo, stepDown } from '../src/game/business/career'
import { sellBusiness } from '../src/game/business/exit'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { bizOf } from '../src/game/business/state'
import { cvEntries } from '../src/game/cv'
import { createNewLife } from '../src/game/life'
import type { Asset, GameState } from '../src/game/types'
import { getCountry } from '../src/game/world'

function life(): GameState {
  const g = createNewLife({ seed: 5, year: 1990, countryId: 'in' })
  g.queue = []
  g.year = 2026
  g.character.age = 19
  g.character.money = 5_000_000
  return g
}

/** Found a company at the player's current age and make them its CEO. */
function found(g: GameState, name: string): Asset {
  const city = getCountry('in').cities[0]
  const b = newBiz(g, 'restaurant', 'in', city, { cash: 1_500_000, founded: 2020, outlets: [{ countryId: 'in', city, count: 2, opened: 2020 }] })
  const a = createBusinessAsset(g, name, b, 100_000)
  g.assets.push(a)
  becomeCeo(g, a, b)
  return a
}

/** Run the company for `years`, then hand it to a hired CEO. */
function stepDownAfter(g: GameState, a: Asset, years: number): void {
  g.character.age += years
  g.character.job!.yearsAtCompany = years
  stepDown(g, a, bizOf(g, a))
}

function rows(g: GameState, company: string) {
  return cvEntries(g).filter((e) => e.kind === 'experience' && e.org === company)
}

describe('CV lists a company once', () => {
  it('shows the company you still run as one row', () => {
    const g = life()
    found(g, 'Surya Interactive')
    expect(rows(g, 'Surya Interactive')).toHaveLength(1)
  })

  it('folds a stint you ended into the company you still own', () => {
    const g = life()
    const a = found(g, 'Surya Interactive')
    stepDownAfter(g, a, 8)
    const list = rows(g, 'Surya Interactive')
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ title: 'Founder & CEO', startAge: 19 })
    expect(list[0].endAge).toBeUndefined()
    expect(list[0].detail).toContain('8 years')
  })

  it('stays one row after stepping down, taking over again and stepping down once more', () => {
    const g = life()
    const a = found(g, 'Surya Interactive')
    stepDownAfter(g, a, 4)
    g.character.age += 2
    becomeCeo(g, a, bizOf(g, a))
    stepDownAfter(g, a, 3)
    g.character.age += 1
    becomeCeo(g, a, bizOf(g, a))
    g.character.job!.yearsAtCompany = 1
    const list = rows(g, 'Surya Interactive')
    expect(list).toHaveLength(1)
    expect(list[0].detail).toContain('8 years')
  })

  it('keeps one historic row once the company is sold', () => {
    const g = life()
    const a = found(g, 'Surya Interactive')
    g.character.age += 6
    g.character.job!.yearsAtCompany = 6
    sellBusiness(g, a, bizOf(g, a), 2_000_000, 'Nimbus Holdings')
    const list = rows(g, 'Surya Interactive')
    expect(list).toHaveLength(1)
    expect(list[0].endAge).toBe(25)
  })

  it('keeps two different companies with the same name', () => {
    const g = life()
    const first = found(g, 'Surya Interactive')
    g.character.age += 5
    g.character.job!.yearsAtCompany = 5
    sellBusiness(g, first, bizOf(g, first), 2_000_000, 'Nimbus Holdings')
    g.character.age += 2
    found(g, 'Surya Interactive')
    const list = rows(g, 'Surya Interactive')
    expect(list).toHaveLength(2)
    expect(list.filter((e) => e.endAge === undefined)).toHaveLength(1)
    expect(list.filter((e) => e.endAge === 24)).toHaveLength(1)
  })

  it('reads rows from saves that did not record the company', () => {
    const g = life()
    const first = found(g, 'Surya Interactive')
    g.character.age += 5
    g.character.job!.yearsAtCompany = 5
    sellBusiness(g, first, bizOf(g, first), 2_000_000, 'Nimbus Holdings')
    g.character.age += 2
    const second = found(g, 'Surya Interactive')
    stepDownAfter(g, second, 4)
    for (const r of g.character.careerHistory) delete r.assetId
    const list = rows(g, 'Surya Interactive')
    expect(list).toHaveLength(2)
    expect(list.filter((e) => e.endAge === undefined)).toHaveLength(1)
    expect(list.filter((e) => e.endAge === 24)).toHaveLength(1)
  })
})
