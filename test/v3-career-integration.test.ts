import { describe, expect, it } from 'vitest'
import { hireForJob, occupationMenu, yearlyCareer } from '../src/game/careers'
import { getJobDef } from '../src/game/data/jobs'
import { isLoadableGame, migrateSave, SAVE_SCHEMA } from '../src/game/save-schema'
import type { GameState, MenuGroup } from '../src/game/types'
import { chooseWorkApproach } from '../src/game/workplace/actions'
import { choosePartTimeShiftFocus, partTimeShiftState } from '../src/game/workplace/parttime'
import { careerExperienceSummary } from '../src/game/workplace/progression'
import { workplaceState } from '../src/game/workplace/state'
import { makeTestGame } from './helpers'

function employee(mainId = 'accountant'): GameState {
  const g = makeTestGame(72, { age: 28, money: 100_000 })
  g.schemaVersion = SAVE_SCHEMA
  g.character.stats = { smarts: 100, happiness: 100, health: 100, looks: 60 }
  g.character.hidden.discipline = 100
  for (const id of [mainId, 'pt_barista']) {
    const def = getJobDef(id)!
    hireForJob(g, { defId: id, title: def.ladder[0].title, company: `${id} Employer`, category: def.category, salary: def.ladder[0].salary })
  }
  g.character.job!.performance = 100
  g.character.partTimeJob!.performance = 100
  g.character.partTimeJob!.data.hours = 20
  g.queue = []
  return g
}

function birthday(g: GameState): void {
  g.year += 1
  g.character.age += 1
  g.yearActions = {}
  g.queue = []
  yearlyCareer(g)
}

function experience(g: GameState) {
  return g.flags.careerExperience as unknown as { tracks: Record<string, { fulltimeYears: number; partTimeEquivalentYears: number }> }
}

describe('v3 career integration', () => {
  it('annual careers record both fields and settle the full-time plan and chosen part-time focus', () => {
    const g = employee()
    const main = g.character.job!
    const partTime = g.character.partTimeJob!
    expect(chooseWorkApproach(g, 'quality')).toBe(true)
    expect(choosePartTimeShiftFocus(g, 'learning')).toBe(true)
    const expectedMoney = g.character.money + main.salary + partTime.salary
    birthday(g)
    expect(g.character.job).toBe(main)
    expect(g.character.partTimeJob).toBe(partTime)
    expect(main.yearsAtCompany).toBe(1)
    expect(partTime.yearsAtCompany).toBe(1)
    expect(experience(g).tracks.office).toMatchObject({ fulltimeYears: 1, partTimeEquivalentYears: 0 })
    expect(experience(g).tracks.service).toMatchObject({ fulltimeYears: 0, partTimeEquivalentYears: 0.5 })
    expect(workplaceState(g, main).lastReview).not.toBeNull()
    expect(partTimeShiftState(g, partTime).reviews).toHaveLength(1)
    expect(partTimeShiftState(g, partTime).reviews[0].focus).toBe('learning')
    expect(g.character.money).toBe(expectedMoney)
  })

  it('annual careers cap overlapping full-time and part-time work in the same family', () => {
    const g = employee('chef')
    birthday(g)
    expect(experience(g).tracks.service).toMatchObject({ fulltimeYears: 1, partTimeEquivalentYears: 0 })
    expect(careerExperienceSummary(g, g.character.partTimeJob!)).toContain('1 full-time + 0 part-time equivalent years')
  })

  it('the actual Occupation job menu exposes Shift Focus and field experience without mutating the save', () => {
    const g = employee()
    birthday(g)
    const before = structuredClone(g)
    const jobMenu = occupationMenu.children(g).find((node): node is MenuGroup => node.type === 'menu' && node.id === 'job.partTimeJob')
    expect(jobMenu).toBeDefined()
    const children = jobMenu!.children(g)
    const shift = children.find((node): node is MenuGroup => node.type === 'menu' && node.id === 'parttime.shifts')
    expect(shift).toBeDefined()
    expect(shift!.visible?.(g)).toBe(true)
    expect(shift!.children(g).some((node) => node.id === 'parttime.shifts.learning')).toBe(true)
    const experienceInfo = children.find((node) => node.id === 'partTimeJob.experience')
    expect(experienceInfo?.type).toBe('info')
    if (experienceInfo?.type === 'info') expect(experienceInfo.text).toContain('0.5 part-time equivalent years')
    expect(g).toEqual(before)
  })

  it('save loading preserves both career layers and reproduces the next annual settlement', () => {
    const g = employee()
    chooseWorkApproach(g, 'people')
    choosePartTimeShiftFocus(g, 'customers')
    birthday(g)
    const result = migrateSave(JSON.parse(JSON.stringify(g)))
    expect(result.kind).toBe('ready')
    if (result.kind !== 'ready') throw new Error('The career save did not load')
    expect(isLoadableGame(result.game)).toBe(true)
    expect(result.game.flags.careerExperience).toEqual(g.flags.careerExperience)
    expect(result.game.character.partTimeJob!.data.shiftFocus).toEqual(g.character.partTimeJob!.data.shiftFocus)
    expect(result.game.character.job!.data.workplace).toEqual(g.character.job!.data.workplace)
    birthday(g)
    birthday(result.game)
    expect(result.game).toEqual(g)
    expect(experience(result.game).tracks.office.fulltimeYears).toBe(2)
    expect(experience(result.game).tracks.service.partTimeEquivalentYears).toBe(1)
  })
})
