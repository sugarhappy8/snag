import { describe, expect, it } from 'vitest'
import { jobRequirementProblem, occupationMenu, totalWorkExperience } from '../src/game/careers'
import { getJobDef } from '../src/game/data/jobs'
import { EARLY_FULLTIME_JOBS } from '../src/game/history/events-jobs'
import type { Job, MenuGroup } from '../src/game/types'
import { makeTestGame } from './helpers'

function heldPartTime(yearsAtCompany: number): Job {
  return {
    defId: 'pt_barista',
    title: 'Barista',
    company: 'Daily Grind',
    category: 'parttime',
    salary: 12_000,
    level: 0,
    performance: 60,
    yearsInRole: yearsAtCompany,
    yearsAtCompany,
    data: { hours: 15, hourly: 15 },
  }
}

describe('career foundation regressions', () => {
  it('counts current part-time tenure as work experience', () => {
    const g = makeTestGame(1, { age: 25 })
    g.character.careerHistory.push({ title: 'Clerk', company: 'Shop', startAge: 18, endAge: 21, reason: 'quit', salary: 20_000 })
    g.character.partTimeJob = heldPartTime(4)
    expect(totalWorkExperience(g)).toBe(7)
  })

  it('lets historical school leavers open listings while each job keeps its own age gate', () => {
    const g = makeTestGame(2, { age: 14 })
    g.year = 1930
    const jobs = occupationMenu.children(g).find((node): node is MenuGroup => node.type === 'menu' && node.id === 'occupation.jobs')
    expect(jobs).toBeDefined()
    expect(jobs?.disabledReason?.(g)).toBeNull()

    const historical = EARLY_FULLTIME_JOBS.find((def) => def.id === 'domestic_servant')!
    expect(jobRequirementProblem(g, historical)).toBeNull()
    expect(jobRequirementProblem(g, getJobDef('accountant')!)).toContain('18')
  })
})
