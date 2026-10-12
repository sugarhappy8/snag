// Workshop deals: minors (a parent signs, smaller lump sums, no adult-only routes) and patents
// that run out.
import { describe, expect, it } from 'vitest'
import { runScript } from '../src/game/scripts'
import { createPerson } from '../src/game/people'
import type { ChoiceModal, GameState, MenuGroup } from '../src/game/types'
import {
  MINOR_DEAL, benchFor, crowdBlock, filePatent, license, patentBlock, pitch, rightsBasis, routeQuotes, shopRights, subjectOf,
} from '../src/game/workshop/launch'
import { licenseValue } from '../src/game/workshop/market'
import { findInvention, readWorkshop } from '../src/game/workshop/notebook'
import { give, idea, ideaMenu, inventor, nextYear } from './workshop-fixtures'
import { yearlyWorkshop } from '../src/game/workshop/yearly'

describe('minors', () => {
  function kid(age: number, seed = 5): GameState {
    const g = inventor({ genius: true, age, money: 0, year: 1985, seed })
    createPerson(g, { relation: 'parent', age: 40, gender: 'female' })
    return g
  }

  it('get smaller lump sums with honest hints, a parent who signs, and no adult-only routes', () => {
    const g = kid(11)
    give(g, 'runaway-alarm', 70)
    const adult = inventor({ genius: true, age: 30, money: 0, year: 1985, seed: 5 })
    give(adult, 'runaway-alarm', 70)
    const b = benchFor(g, readWorkshop(g), idea('runaway-alarm'))!
    const ba = benchFor(adult, readWorkshop(adult), idea('runaway-alarm'))!
    expect(rightsBasis(g, readWorkshop(g), b)).toBeCloseTo(rightsBasis(adult, readWorkshop(adult), ba) * MINOR_DEAL)
    const sell = routeQuotes(g, readWorkshop(g), b).find((q) => q.route === 'sell')!
    expect(sell.value).toBeCloseTo(routeQuotes(adult, readWorkshop(adult), ba).find((q) => q.route === 'sell')!.value * MINOR_DEAL)
    // Royalty rates are the same for everyone.
    expect(routeQuotes(g, readWorkshop(g), b).find((q) => q.route === 'license')!.value).toBeCloseTo(routeQuotes(adult, readWorkshop(adult), ba).find((q) => q.route === 'license')!.value)
    expect(shopRights(g, idea('runaway-alarm'))).toBe(true)
    const m = g.queue.at(-1) as ChoiceModal
    expect(m.text).toMatch(/Since you're 11, your mom would sign/)
    const top = Math.round((rightsBasis(g, readWorkshop(g), b) * 1.05) / 10) * 10
    for (const o of (m.data as { offers: { amount: number }[] }).offers) expect(o.amount).toBeLessThanOrEqual(top)
    runScript(g, m.scriptId!, 'o0', m.data, m)
    expect(g.queue.some((x) => x.kind === 'notice' && /Since you're 11, your mom signed the contract/.test(x.text))).toBe(true)
    // Crowdfunding is for adults (and not even shown to kids).
    const h = kid(11)
    give(h, 'runaway-alarm', 70)
    h.year = 2015
    expect(crowdBlock(h, idea('runaway-alarm'))).toMatch(/18/)
    const launch = ideaMenu(h, 'runaway-alarm').children(h).find((n) => n.id.startsWith('ws.launch.')) as MenuGroup
    expect(launch.children(h).find((n) => n.id.startsWith('ws.crowd.'))!.visible?.(h)).toBe(false)
  })

  it('pitch: the investor offer mentions the parent, and the deal pays the scaled cash once', () => {
    for (let s = 1; s < 80; s++) {
      const g = kid(12, s)
      give(g, 'runaway-alarm', 75)
      pitch(g, idea('runaway-alarm'))
      const m = g.queue.at(-1)!
      if (m.kind !== 'choice') {
        // A kid's "no deal" is gentle.
        expect(m.kind === 'notice' ? m.text : '').not.toMatch(/laughed so hard/)
        continue
      }
      expect(m.text).toMatch(/Since you're 12, your mom would have to sign/)
      const cash = (m.data as { cash: number }).cash
      const money = g.character.money
      runScript(g, m.scriptId!, 'deal', m.data, m)
      expect(g.character.money - money).toBe(cash)
      expect(g.flags.taxableIncome).toBe(cash)
      expect(g.queue.some((x) => x.kind === 'notice' && /your mom signed the contract/.test(x.text))).toBe(true)
      runScript(g, m.scriptId!, 'deal', m.data, m) // a replayed popup pays nothing
      expect(g.character.money - money).toBe(cash)
      return
    }
    throw new Error('no offer in 80 seeds')
  })

  it('royalties keep flowing to a kid once a year', () => {
    const g = kid(13)
    give(g, 'runaway-alarm', 80)
    license(g, idea('runaway-alarm'))
    expect(g.queue.some((x) => x.kind === 'notice' && /your mom signed the contract/.test(x.text))).toBe(true)
    nextYear(g)
    const money = g.character.money
    yearlyWorkshop(g)
    expect(g.character.money - money).toBeGreaterThan(0)
    expect(g.flags.taxableIncome).toBe(g.character.money - money)
  })
})

describe('patents that run out', () => {
  it('give no worldwide reach and cannot be extended or filed again', () => {
    const g = inventor({ year: 2000 })
    give(g, 'robot-mower', 70)
    const a = filePatent(g, idea('robot-mower'), 'home')!
    const t = { kind: 'asset' as const, id: a.id }
    expect(patentBlock(g, t, 'world')).toBeNull()
    const ws = readWorkshop(g)
    const live = benchFor(g, ws, t)!
    expect(licenseValue(g, subjectOf(g, live), live.def.a, ws.rep)).toBeGreaterThan(licenseValue(g, { ...subjectOf(g, live), patent: null }, live.def.a, ws.rep))
    g.year = 2025
    expect(patentBlock(g, t, 'world')).toMatch(/expired/)
    expect(patentBlock(g, t, 'home')).toMatch(/expired/)
    const b = benchFor(g, ws, t)!
    // Worth what an unpatented idea is worth: the old patent adds nothing.
    expect(licenseValue(g, subjectOf(g, b), b.def.a, ws.rep)).toBeCloseTo(licenseValue(g, { ...subjectOf(g, b), patent: null }, b.def.a, ws.rep), 0)
    expect(findInvention(g, a.id)!.inv.patent!.expires).toBeLessThanOrEqual(2025)
  })
})
