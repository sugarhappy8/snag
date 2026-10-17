import { describe, expect, it } from 'vitest'
import { hireForJob, occupationMenu, yearlyCareer } from '../src/game/careers'
import { ERA_FULLTIME_JOBS, FULLTIME_JOBS, getJobDef } from '../src/game/data/jobs'
import { EARLY_FULLTIME_JOBS } from '../src/game/history/events-jobs'
import type { GameState, Json, MenuGroup, MenuNode } from '../src/game/types'
import { chooseWorkApproach, prepareWorkPlan, specializeCareer } from '../src/game/workplace/actions'
import {
  PROFESSIONAL_JOB_IDS,
  WORK_FAMILIES,
  isProfessionalJob,
  workFamilyForDef,
  workFamilyForJobId,
  type WorkFamily,
} from '../src/game/workplace/catalog'
import { workplaceContext } from '../src/game/workplace/model'
import { workplaceMenu } from '../src/game/workplace/menu'
import { careerTrack, saveCareerTrack, workplaceState } from '../src/game/workplace/state'
import { yearlyWorkplace } from '../src/game/workplace/year'
import { makeTestGame } from './helpers'

const ALL_FULLTIME = [...FULLTIME_JOBS, ...ERA_FULLTIME_JOBS, ...EARLY_FULLTIME_JOBS]

function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function worker(jobId: string, seed = 1, company = 'Test Employer'): GameState {
  const def = getJobDef(jobId) ?? EARLY_FULLTIME_JOBS.find((candidate) => candidate.id === jobId)
  if (!def) throw new Error(`Unknown test job: ${jobId}`)
  const g = makeTestGame(seed, { age: 30, money: 100_000 })
  hireForJob(g, {
    defId: def.id,
    title: def.ladder[0].title,
    company,
    salary: def.ladder[0].salary,
    category: 'fulltime',
  })
  g.queue = []
  return g
}

function exerciseMenu(nodes: MenuNode[], g: GameState): void {
  for (const node of nodes) {
    if (node.type === 'menu') exerciseMenu(node.children(g), g)
    if (node.type === 'action') {
      node.disabledReason?.(g)
      node.confirm?.(g)
      node.hint?.(g)
      if (typeof node.subtitle === 'function') node.subtitle(g)
    }
  }
}

describe('ordinary workplace catalog', () => {
  it('classifies every one of the 179 full-time definitions once', () => {
    expect(ALL_FULLTIME).toHaveLength(179)
    expect(new Set(ALL_FULLTIME.map((def) => def.id)).size).toBe(179)
    expect(PROFESSIONAL_JOB_IDS.size).toBe(14)

    const families = new Set(Object.keys(WORK_FAMILIES) as WorkFamily[])
    for (const def of ALL_FULLTIME) {
      const family = workFamilyForJobId(def.id)
      if (isProfessionalJob(def)) {
        expect(PROFESSIONAL_JOB_IDS.has(def.id), def.id).toBe(true)
      } else {
        expect(family, def.id).toBeDefined()
        expect(families.has(family!), def.id).toBe(true)
        expect(workFamilyForDef(def), def.id).toBe(family)
      }
    }
  })

  it.each([...PROFESSIONAL_JOB_IDS])('%s remains exclusively in Professional Practice', (jobId) => {
    const g = worker(jobId)
    expect(isProfessionalJob(jobId)).toBe(true)
    expect(workplaceContext(g)).toBeNull()
    expect(workplaceMenu.visible?.(g)).toBe(false)
    expect(chooseWorkApproach(g, 'quality')).toBe(false)
    expect(prepareWorkPlan(g)).toBe(false)
  })
})

const REPRESENTATIVE_JOBS: ReadonlyArray<readonly [WorkFamily, string]> = [
  ['office', 'accountant'],
  ['technical', 'computer_programmer'],
  ['care', 'pharmacist'],
  ['civic', 'police'],
  ['education', 'teacher'],
  ['creative', 'reporter'],
  ['service', 'chef'],
  ['field', 'janitor'],
  ['transport', 'pilot'],
]

describe('ordinary workplace loop', () => {
  it.each(REPRESENTATIVE_JOBS)('%s work is playable, deterministic, and salary-neutral (%s)', (family, jobId) => {
    const g = worker(jobId, 17)
    const salary = g.character.job!.salary
    expect(workplaceContext(g)?.family).toBe(family)
    expect(chooseWorkApproach(g, 'people')).toBe(true)
    expect(chooseWorkApproach(g, 'quality')).toBe(false)
    expect(prepareWorkPlan(g)).toBe(true)
    expect(prepareWorkPlan(g)).toBe(false)

    const sameYear = copy(g)
    const money = g.character.money
    const taxableIncome = g.flags.taxableIncome
    yearlyWorkplace(g)
    expect(g).toEqual(sameYear)
    expect(g.character.money).toBe(money)
    expect(g.flags.taxableIncome).toBe(taxableIncome)

    const replay = copy(g)
    for (const state of [g, replay]) {
      state.year += 1
      state.character.age += 1
      yearlyWorkplace(state)
    }

    expect(g).toEqual(replay)
    expect(g.character.job!.salary).toBe(salary)
    expect(workplaceState(g, g.character.job!).lastReview).not.toBeNull()
    expect(careerTrack(g, family).mastery).toBeGreaterThan(25)

    const settled = copy(g)
    yearlyWorkplace(g)
    expect(g).toEqual(settled)
  })

  it('builds and reads the complete menu without consuming RNG or mutating state', () => {
    const g = worker('accountant', 23)
    yearlyWorkplace(g)
    const before = copy(g)
    const rng = g.rng

    workplaceMenu.visible?.(g)
    if (typeof workplaceMenu.subtitle === 'function') workplaceMenu.subtitle(g)
    workplaceMenu.header?.(g)
    exerciseMenu(workplaceMenu.children(g), g)

    expect(g.rng).toBe(rng)
    expect(g).toEqual(before)
  })

  it('normalizes malformed employer and career records without mutating them', () => {
    const g = worker('accountant')
    const job = g.character.job!
    const appointmentId = String(job.data.appointmentId)
    job.data.workplace = {
      v: 999,
      appointmentId,
      trust: 900,
      warnings: -20,
      lastSettledPlanYear: Number.POSITIVE_INFINITY,
      plan: { year: g.year, title: 42, templateId: [], approach: 'reckless', difficulty: 99, preparation: -8 },
      lastReview: { year: 'bad', title: 12, rating: 'perfect', summary: null },
      reviews: [
        null,
        ...Array.from({ length: 9 }, (_, index) => ({ year: index, title: `Review ${index}`, rating: 'meets', summary: 'Fine.' })),
        { year: 8, title: 'Review 8', rating: 'meets', summary: 'Duplicate.' },
      ],
    } as unknown as Json
    g.flags.careerProfile = {
      v: 99,
      owner: `${g.lifeId}:${g.generation}:${g.character.id}`,
      tracks: {
        office: { mastery: 500, reputation: -40, completed: -3, setbacks: 50_000, specialty: 'x'.repeat(200) },
      },
    }
    const beforeWorkplace = structuredClone(job.data.workplace)
    const beforeProfile = structuredClone(g.flags.careerProfile)

    const local = workplaceState(g, job)
    const track = careerTrack(g, 'office')
    expect(local.trust).toBe(100)
    expect(local.warnings).toBe(0)
    expect(local.lastSettledPlanYear).toBe(-1)
    expect(local.plan).toBeNull()
    expect(local.lastReview).toBeNull()
    expect(local.reviews).toHaveLength(6)
    expect(new Set(local.reviews.map((review) => `${review.year}:${review.title}`))).toHaveProperty('size', 6)
    expect(track).toMatchObject({ mastery: 100, reputation: 0, completed: 0, setbacks: 10_000 })
    expect(track.specialty).toBe('')
    expect(() => workplaceMenu.children(g)).not.toThrow()
    expect(job.data.workplace).toEqual(beforeWorkplace)
    expect(g.flags.careerProfile).toEqual(beforeProfile)
  })

  it('recovers from impossible future and already-settled saved plans', () => {
    const g = worker('accountant')
    const job = g.character.job!
    const appointmentId = String(job.data.appointmentId)
    const validPlan = {
      year: g.year + 1,
      templateId: 'accountant.close',
      title: 'Difficult ledger close',
      difficulty: 2,
      approach: 'quality',
      preparation: 0,
    }
    job.data.workplace = {
      v: 1,
      appointmentId,
      trust: 50,
      warnings: 0,
      lastSettledPlanYear: -1,
      plan: validPlan,
      lastReview: null,
      reviews: [],
    }

    expect(workplaceState(g, job).plan).toBeNull()
    expect(chooseWorkApproach(g, 'quality')).toBe(true)

    const state = workplaceState(g, job)
    state.plan!.year = g.year - 1
    state.lastSettledPlanYear = g.year - 1
    job.data.workplace = state as unknown as Json
    expect(workplaceState(g, job).plan).toBeNull()
  })

  it('replaces an inconsistent current settlement marker and resolves the recovered plan', () => {
    const g = worker('accountant', 13)
    const job = g.character.job!
    job.data.workplace = {
      v: 1,
      appointmentId: String(job.data.appointmentId),
      trust: 50,
      warnings: 0,
      lastSettledPlanYear: g.year,
      plan: {
        year: g.year,
        templateId: 'accountant.close',
        title: 'Difficult ledger close',
        difficulty: 2,
        approach: 'quality',
        preparation: 0,
      },
      lastReview: null,
      reviews: [],
    }

    expect(workplaceState(g, job).plan).toBeNull()
    yearlyWorkplace(g)
    expect(workplaceState(g, job).plan?.year).toBe(g.year)
    expect(workplaceState(g, job).lastSettledPlanYear).toBeLessThan(g.year)

    g.rng = 7
    g.year += 1
    g.character.age += 1
    yearlyWorkplace(g)
    expect(workplaceState(g, job).lastReview).not.toBeNull()
  })

  it('keeps annual approach and preparation limits when changing employers', () => {
    const g = worker('accountant')
    expect(chooseWorkApproach(g, 'quality')).toBe(true)
    expect(prepareWorkPlan(g)).toBe(true)
    const mastery = careerTrack(g, 'office').mastery

    const nextDef = getJobDef('financial_analyst')!
    hireForJob(g, {
      defId: nextDef.id,
      title: nextDef.ladder[0].title,
      company: 'Second Office',
      salary: nextDef.ladder[0].salary,
      category: 'fulltime',
    })
    yearlyWorkplace(g)

    expect(chooseWorkApproach(g, 'people')).toBe(false)
    expect(prepareWorkPlan(g)).toBe(false)
    expect(careerTrack(g, 'office').mastery).toBe(mastery)
  })

  it('earns one transferable specialization credential without duplicates', () => {
    const g = worker('accountant')
    const track = careerTrack(g, 'office')
    track.completed = 3
    saveCareerTrack(g, 'office', track)

    expect(specializeCareer(g, 'Analysis & planning')).toBe(true)
    expect(specializeCareer(g, 'Client relationships')).toBe(false)
    expect(careerTrack(g, 'office').specialty).toBe('Analysis & planning')
    expect(g.character.cv?.filter((entry) => entry.source === 'workplace' && entry.kind === 'certification')).toHaveLength(1)

    const nextDef = getJobDef('financial_analyst')!
    hireForJob(g, {
      defId: nextDef.id,
      title: nextDef.ladder[0].title,
      company: 'Second Office',
      salary: nextDef.ladder[0].salary,
      category: 'fulltime',
    })
    expect(careerTrack(g, 'office').specialty).toBe('Analysis & planning')
  })

  it('does not carry a career profile into another life owner', () => {
    const g = worker('accountant')
    const track = careerTrack(g, 'office')
    track.completed = 7
    track.mastery = 70
    saveCareerTrack(g, 'office', track)

    g.lifeId = `${g.lifeId}.next`
    expect(careerTrack(g, 'office')).toMatchObject({ completed: 0, mastery: 25, reputation: 35 })
  })

  it('does not resolve a former employer plan after changing jobs', () => {
    const g = worker('accountant', 31, 'Old Employer')
    expect(chooseWorkApproach(g, 'quality')).toBe(true)
    const formerJob = g.character.job!
    const formerState = copy(workplaceState(g, formerJob))
    const formerTrack = copy(careerTrack(g, 'office'))

    hireForJob(g, {
      defId: 'chef',
      title: getJobDef('chef')!.ladder[0].title,
      company: 'New Employer',
      salary: getJobDef('chef')!.ladder[0].salary,
      category: 'fulltime',
    })
    g.year += 1
    g.character.age += 1
    yearlyWorkplace(g, formerJob)

    expect(workplaceState(g, formerJob)).toEqual(formerState)
    expect(careerTrack(g, 'office')).toEqual(formerTrack)
    expect(workplaceState(g, g.character.job!).lastReview).toBeNull()
  })

  it('keeps family progress across employers but resets employer trust', () => {
    const g = worker('accountant', 41, 'First Office')
    expect(chooseWorkApproach(g, 'quality')).toBe(true)
    expect(prepareWorkPlan(g)).toBe(true)
    g.year += 1
    g.character.age += 1
    yearlyWorkplace(g)
    const previousTrack = copy(careerTrack(g, 'office'))
    expect(workplaceState(g, g.character.job!).trust).not.toBe(50)

    const nextDef = getJobDef('financial_analyst')!
    hireForJob(g, {
      defId: nextDef.id,
      title: nextDef.ladder[0].title,
      company: 'Second Office',
      salary: nextDef.ladder[0].salary,
      category: 'fulltime',
    })

    expect(workplaceContext(g)?.family).toBe('office')
    expect(careerTrack(g, 'office')).toEqual(previousTrack)
    expect(workplaceState(g, g.character.job!).trust).toBe(50)
    expect(workplaceState(g, g.character.job!).reviews).toEqual([])
    expect(workplaceState(g, g.character.job!).lastReview).toBeNull()
  })

  it('bounds review history and maintains one capped CV portfolio per family', () => {
    const g = worker('accountant', 51)
    const job = g.character.job!
    job.performance = 100
    yearlyWorkplace(g)

    for (let index = 0; index < 10; index++) {
      g.rng = 1
      g.year += 1
      g.character.age += 1
      yearlyWorkplace(g)
    }

    const local = workplaceState(g, job)
    const portfolio = g.character.cv?.filter((entry) => entry.source === 'workplace' && entry.kind === 'project') ?? []
    expect(local.reviews).toHaveLength(6)
    expect(new Set(local.reviews.map((review) => `${review.year}:${review.title}`)).size).toBe(6)
    expect(portfolio).toHaveLength(1)
    expect(portfolio[0].title).toBe('Office & Commercial portfolio')
    expect(portfolio[0].strength).toBeLessThanOrEqual(8)
    expect(portfolio[0].detail.length).toBeLessThanOrEqual(240)
  })

  it('deduplicates a portfolio and attributes later work to the current employer', () => {
    const g = worker('accountant', 57, 'First Office')
    g.character.job!.performance = 100
    yearlyWorkplace(g)
    g.rng = 1
    g.year += 1
    g.character.age += 1
    yearlyWorkplace(g)
    const first = g.character.cv?.find((entry) => entry.source === 'workplace' && entry.kind === 'project')
    expect(first).toBeDefined()
    g.character.cv!.push(copy(first!))

    const nextDef = getJobDef('financial_analyst')!
    hireForJob(g, {
      defId: nextDef.id,
      title: nextDef.ladder[0].title,
      company: 'Second Office',
      salary: nextDef.ladder[0].salary,
      category: 'fulltime',
    })
    yearlyWorkplace(g)
    g.character.job!.performance = 100
    g.rng = 7
    g.year += 1
    g.character.age += 1
    yearlyWorkplace(g)

    const portfolio = g.character.cv?.filter((entry) => entry.source === 'workplace' && entry.kind === 'project') ?? []
    expect(portfolio).toHaveLength(1)
    expect(portfolio[0].org).toBe('Second Office')
  })

  it('is wired into the Occupation menu and the yearly career hook', () => {
    const g = worker('accountant', 63)
    const jobMenu = occupationMenu.children(g).find((node): node is MenuGroup => node.type === 'menu' && node.id === 'job.job')
    expect(jobMenu?.children(g).some((node) => node.type === 'menu' && node.id === 'workplace.plan')).toBe(true)

    expect(chooseWorkApproach(g, 'quality')).toBe(true)
    g.character.job!.performance = 100
    g.year += 1
    g.character.age += 1
    yearlyCareer(g)

    expect(g.character.job).not.toBeNull()
    expect(workplaceState(g, g.character.job!).lastReview).not.toBeNull()
  })
})
