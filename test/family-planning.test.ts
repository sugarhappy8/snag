import { describe, expect, it } from 'vitest'
import { makeTestGame } from './helpers'
import { createPerson } from '../src/game/people'
import { playerPregnancy, tryForBaby, yearlyFamilyPlanning } from '../src/game/love'
import { runScript } from '../src/game/scripts'
import type { ChoiceModal } from '../src/game/types'

function couple(seed = 8) {
  const g = makeTestGame(seed, { age: 28, gender: 'female', money: 50000 })
  const p = createPerson(g, { relation: 'spouse', age: 29, gender: 'male', relationship: 85 })
  return { g, p }
}
function invitation(g: ReturnType<typeof couple>['g']) {
  return g.queue.find(m => m.kind === 'choice' && m.scriptId === 'love.familyPlan') as ChoiceModal
}

describe('married family planning', () => {
  it('lets a spouse initiate a choice once per year without creating a pregnancy automatically', () => {
    const { g, p } = couple()
    yearlyFamilyPlanning(g)
    const modal = invitation(g)
    expect(modal).toBeDefined(); expect(playerPregnancy(g)).toBeNull()
    const saved = structuredClone(g); yearlyFamilyPlanning(g); expect(g).toEqual(saved)
    runScript(g, modal.scriptId!, 'try', modal.data, modal)
    expect(p.data.familyPlanWith).toBe(g.character.id)
    expect(g.yearActions['rel.tryBaby']).toBe(1)
    const settled = structuredClone(g)
    runScript(g, modal.scriptId!, 'try', modal.data, modal)
    expect(g).toEqual(settled)
  })
  it('respects postponement and declining, while allowing the player to reopen the plan', () => {
    for (const choice of ['later', 'no']) {
      const { g, p } = couple()
      yearlyFamilyPlanning(g); const modal = invitation(g)
      runScript(g, modal.scriptId!, choice, modal.data, modal)
      expect(playerPregnancy(g)).toBeNull()
      g.queue = []; g.year++; yearlyFamilyPlanning(g); expect(invitation(g)).toBeUndefined()
      p.data.familyPlanWith = g.character.id
      tryForBaby(g, p)
      expect(p.data.familyWaitUntil).toBeUndefined()
    }
  })
  it('remembers agreement across save/load and lets couples retry without repeated persuasion', () => {
    const { g, p } = couple()
    g.character.hidden.fertility = -150 // deterministic no-conception fixture
    p.data.familyPlanWith = g.character.id
    const restored = structuredClone(g)
    for (let n = 0; n < 12; n++) tryForBaby(restored, restored.people[0])
    expect(restored.queue.some(m => m.kind === 'notice' && m.text.includes('not ready'))).toBe(false)
    expect(restored.people[0].data.familyPlanWith).toBe(g.character.id)
    expect(playerPregnancy(restored)).toBeNull()
  })
  it('makes healthy married attempts easier while preserving fertility and pregnancy gates', () => {
    let conceived = 0, agreed = 0
    for (let seed = 1; seed <= 150; seed++) {
      const { g, p } = couple(seed)
      tryForBaby(g, p)
      if (playerPregnancy(g)) conceived++
      if (p.data.familyPlanWith) agreed++
    }
    expect(agreed).toBeGreaterThan(140)
    expect(conceived).toBeGreaterThan(75)
    const { g, p } = couple()
    g.flags.sterile = true
    yearlyFamilyPlanning(g); expect(invitation(g)).toBeUndefined()
    tryForBaby(g, p); expect(playerPregnancy(g)).toBeNull()
    expect(p.data.familyPlanWith).toBeUndefined()
  })
})
