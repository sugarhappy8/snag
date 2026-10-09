import { describe, expect, it } from 'vitest'
import {
  addMoney,
  addHidden,
  addPersonStat,
  addRelationship,
  addStat,
  canAfford,
  count,
  counter,
  earnIncome,
  formatMoney,
  log,
  relationLabel,
  shortMoney,
  spend,
  useYearAction,
  yearActionsUsed,
  zodiacFor,
} from '../src/game/core'
import { createPerson } from '../src/game/people'
import { chance, randInt, rand } from '../src/game/rng'
import { defineScript, runScript } from '../src/game/scripts'
import type { ChoiceModal } from '../src/game/types'
import { makeTestGame } from './helpers'

describe('rng', () => {
  it('is deterministic for a seed', () => {
    const a = makeTestGame(42)
    const b = makeTestGame(42)
    expect([rand(a), rand(a), randInt(a, 1, 6)]).toEqual([rand(b), rand(b), randInt(b, 1, 6)])
  })
  it('chance(0) is never true and chance(1) always is', () => {
    const g = makeTestGame(7)
    for (let i = 0; i < 50; i++) {
      expect(chance(g, 0)).toBe(false)
      expect(chance(g, 1)).toBe(true)
    }
  })
})

describe('core helpers', () => {
  it('clamps stats to 0-100', () => {
    const g = makeTestGame()
    addStat(g, 'health', 500)
    expect(g.character.stats.health).toBe(100)
    addStat(g, 'health', -500)
    expect(g.character.stats.health).toBe(0)
  })
  it('limits per-year actions', () => {
    const g = makeTestGame()
    expect(useYearAction(g, 'gym', 2)).toBe(true)
    expect(useYearAction(g, 'gym', 2)).toBe(true)
    expect(useYearAction(g, 'gym', 2)).toBe(false)
  })
  it('formats money', () => {
    expect(formatMoney(1234567)).toBe('$1,234,567')
    expect(formatMoney(-50)).toBe('-$50')
    expect(shortMoney(2_500_000)).toBe('$2.5M')
  })
  it('tracks taxable income', () => {
    const g = makeTestGame()
    earnIncome(g, 1000)
    earnIncome(g, 500)
    expect(g.character.money).toBe(1500)
    expect(g.flags.taxableIncome).toBe(1500)
  })
  it('rejects non-finite money, counters and yearly limits without corrupting state', () => {
    const g = makeTestGame()
    g.character.money = 100
    addMoney(g, Number.NaN)
    addMoney(g, Number.POSITIVE_INFINITY)
    expect(spend(g, Number.NaN)).toBe(false)
    expect(spend(g, Number.POSITIVE_INFINITY)).toBe(false)
    expect(canAfford(g, Number.NaN)).toBe(false)
    expect(g.character.money).toBe(100)

    g.flags.taxableIncome = Number.NaN
    earnIncome(g, 25)
    expect(g.character.money).toBe(125)
    expect(g.flags.taxableIncome).toBe(25)

    g.counters.bad = Number.NaN
    count(g, 'bad', 2)
    count(g, 'bad', Number.POSITIVE_INFINITY)
    expect(counter(g, 'bad')).toBe(2)

    g.yearActions.bad = Number.NaN
    expect(useYearAction(g, 'bad', 2)).toBe(true)
    expect(yearActionsUsed(g, 'bad')).toBe(1)
    expect(useYearAction(g, 'bad', Number.NaN)).toBe(false)
    expect(yearActionsUsed(g, 'bad')).toBe(1)
  })
  it('resolves each scripted popup once and rejects a forged choice id', () => {
    const g = makeTestGame()
    const scriptId = defineScript('test.core.one-shot-modal', (draft) => count(draft, 'scriptRuns'))
    const modal: ChoiceModal = {
      kind: 'choice', id: 'one-shot', title: 'Choose', text: 'Choose once.', source: 'script', scriptId,
      choices: [{ id: 'valid', label: 'Valid' }],
    }
    runScript(g, scriptId, 'forged', undefined, modal)
    expect(counter(g, 'scriptRuns')).toBe(0)
    runScript(g, scriptId, 'valid', undefined, modal)
    runScript(g, scriptId, 'valid', undefined, modal)
    expect(counter(g, 'scriptRuns')).toBe(1)

    runScript(g, scriptId, 'valid', undefined, { ...modal, id: 'another-popup' })
    expect(counter(g, 'scriptRuns')).toBe(2)
  })
  it('rejects non-finite stat and relationship deltas instead of zeroing values', () => {
    const g = makeTestGame()
    const p = createPerson(g, { relation: 'friend', age: 20, relationship: 70 })
    const before = structuredClone({ stats: g.character.stats, hidden: g.character.hidden, person: p.stats, relationship: p.relationship })
    addStat(g, 'health', Number.NaN)
    addHidden(g, 'karma', Number.POSITIVE_INFINITY)
    addPersonStat(p, 'smarts', Number.NEGATIVE_INFINITY)
    addRelationship(p, Number.NaN)
    expect({ stats: g.character.stats, hidden: g.character.hidden, person: p.stats, relationship: p.relationship }).toEqual(before)
  })
  it('logs into the current age', () => {
    const g = makeTestGame()
    log(g, 'I was born.')
    expect(g.log[0].entries[0].text).toBe('I was born.')
  })
  it('computes zodiac signs', () => {
    expect(zodiacFor(3, 14)).toBe('Pisces')
    expect(zodiacFor(12, 25)).toBe('Capricorn')
    expect(zodiacFor(1, 25)).toBe('Aquarius')
  })
  it('labels relations by gender', () => {
    const g = makeTestGame()
    const mom = createPerson(g, { relation: 'parent', age: 30, gender: 'female' })
    expect(relationLabel(mom)).toBe('Mother')
    expect(g.people).toHaveLength(1)
  })
})
