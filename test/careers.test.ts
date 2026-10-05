import { describe, expect, it } from 'vitest'
import {
  careerInternals,
  fallbackInterviewQuestion,
  fullTimeListings,
  hireForJob,
  jobRequirementProblem,
  occupationMenu,
  partTimeListings,
  presentInterview,
  yearlyCareer,
} from '../src/game/careers'
import { FULLTIME_JOBS, GIGS, PARTTIME_JOBS, getJobDef } from '../src/game/data/jobs'
import { runScript } from '../src/game/scripts'
import type { ChoiceModal, GameState, InterviewJob, MenuAction, MenuGroup, MenuNode } from '../src/game/types'
import { makeTestGame } from './helpers'

const ACCOUNTANT: InterviewJob = { defId: 'accountant', title: 'Jr. Accountant', company: 'Apex Holdings', salary: 52000, category: 'fulltime' }

function adult(seed = 1, age = 25): GameState {
  const g = makeTestGame(seed, { age })
  g.character.education.degrees.push({ kind: 'highschool', name: 'High School Diploma', school: 'Test High', age: 18 })
  g.character.education.degrees.push({ kind: 'bachelor', name: "Bachelor's in Accounting", major: 'Accounting', school: 'Test U', age: 22 })
  return g
}

function findNode(nodes: MenuNode[], id: string, g: GameState): MenuNode | undefined {
  for (const n of nodes) {
    if (n.id === id) return n
    if (n.type === 'menu') {
      const hit = findNode(n.children(g), id, g)
      if (hit) return hit
    }
  }
  return undefined
}

function lastChoice(g: GameState, scriptId: string): ChoiceModal | undefined {
  const m = [...g.queue].reverse().find((x) => x.kind === 'choice' && x.scriptId === scriptId)
  return m && m.kind === 'choice' ? m : undefined
}

describe('job catalog', () => {
  it('has a large catalog with valid ladders', () => {
    expect(FULLTIME_JOBS.length).toBeGreaterThanOrEqual(80)
    expect(PARTTIME_JOBS.length).toBeGreaterThanOrEqual(15)
    expect(GIGS.length).toBeGreaterThanOrEqual(7)
    const ids = new Set<string>()
    for (const d of [...FULLTIME_JOBS, ...PARTTIME_JOBS]) {
      expect(ids.has(d.id)).toBe(false)
      ids.add(d.id)
      expect(d.ladder.length).toBeGreaterThan(0)
      for (const r of d.ladder) expect(r.salary).toBeGreaterThan(0)
    }
    expect(getJobDef('accountant')?.ladder.map((r) => r.title)).toEqual(['Jr. Accountant', 'Accountant', 'Sr. Accountant', 'Accounting Manager', 'Chief Financial Officer'])
  })

  it('checks requirements', () => {
    const kid = makeTestGame(1, { age: 16 })
    const acct = getJobDef('accountant')!
    expect(jobRequirementProblem(kid, acct)).toMatch(/18/)
    const dropout = makeTestGame(1, { age: 25 })
    expect(jobRequirementProblem(dropout, acct)).toMatch(/University/)
    expect(jobRequirementProblem(adult(), acct)).toBeNull()
    expect(jobRequirementProblem(dropout, getJobDef('janitor')!)).toBeNull()
    expect(jobRequirementProblem(kid, getJobDef('pt_barista')!)).toBeNull()
    expect(jobRequirementProblem(dropout, getJobDef('bus_driver')!)).toMatch(/license/)
  })
})

describe('listings', () => {
  it('are stable within a year and refresh on age-up', () => {
    const g = adult(5)
    const a = fullTimeListings(g).map((l) => l.key)
    const b = fullTimeListings(g).map((l) => l.key)
    expect(a).toEqual(b)
    expect(a.length).toBeGreaterThanOrEqual(20)
    expect(fullTimeListings(g).filter((l) => !jobRequirementProblem(g, l.def)).length).toBeGreaterThanOrEqual(6)
    const rng = g.rng
    fullTimeListings(g)
    expect(g.rng).toBe(rng)
    g.character.age += 1
    yearlyCareer(g)
    expect(fullTimeListings(g).map((l) => l.key)).not.toEqual(a)
    expect(partTimeListings(g).length).toBeGreaterThanOrEqual(10)
  })
})

describe('interviews and hiring', () => {
  it('builds offline questions with scored answers', () => {
    const g = adult(3)
    for (let i = 0; i < 30; i++) {
      const q = fallbackInterviewQuestion(g, ACCOUNTANT)
      expect(q.question.length).toBeGreaterThan(5)
      expect(q.answers).toHaveLength(4)
      for (const a of q.answers) {
        expect(a.score).toBeGreaterThanOrEqual(0)
        expect(a.score).toBeLessThanOrEqual(100)
      }
    }
  })

  it('hiring sets the job and staffs it with a boss and coworkers', () => {
    const g = adult(2)
    const job = hireForJob(g, ACCOUNTANT)
    const c = g.character
    expect(c.job).toBe(job)
    expect(job.title).toBe('Jr. Accountant')
    expect(job.category).toBe('fulltime')
    expect(job.level).toBe(0)
    expect(g.counters.jobs).toBe(1)
    const boss = g.people.find((p) => p.id === job.bossId)
    expect(boss?.relation).toBe('boss')
    expect(boss?.contextId).toBe('Apex Holdings')
    const coworkers = g.people.filter((p) => p.relation === 'coworker' && p.contextId === 'Apex Holdings')
    expect(coworkers.length).toBeGreaterThanOrEqual(2)
  })

  it('presents an interview and hires on a great answer', () => {
    let hired = false
    for (let seed = 1; seed < 20 && !hired; seed++) {
      const g = adult(seed)
      presentInterview(g, ACCOUNTANT, { question: 'Why should we hire you?', answers: [{ label: 'I have the skills', score: 100 }, { label: 'I need the money', score: 10 }] })
      const m = lastChoice(g, 'career.interview')!
      expect(m.choices).toHaveLength(2)
      runScript(g, 'career.interview', '0', m.data, m)
      hired = g.character.job?.title === 'Jr. Accountant'
    }
    expect(hired).toBe(true)
  })

  it('falls back to an offline question when the AI sends garbage', () => {
    const g = adult(4)
    presentInterview(g, ACCOUNTANT, { question: '', answers: [] })
    expect(lastChoice(g, 'career.interview')!.choices.length).toBe(4)
  })

  it('queues an interview when applying from the listings', () => {
    const g = adult(6)
    const jobs = occupationMenu.children(g).find((n) => n.id === 'occupation.jobs') as MenuGroup
    const listing = jobs
      .children(g)
      .find((n): n is MenuAction => n.type === 'action' && n.id.startsWith('listing.') && !(n.subtitle as (g: GameState) => string)(g).includes('Not qualified'))
    expect(listing).toBeDefined()
    expect(listing!.confirm?.(g)).toMatch(/Apply for this job\?/)
    listing!.run(g)
    const last = g.queue[g.queue.length - 1]
    expect(last.kind === 'aiTask' || (last.kind === 'notice' && last.title === 'Hired!')).toBe(true)
  })
})

describe('yearly career', () => {
  it('pays salary into taxable income', () => {
    const g = adult(8)
    hireForJob(g, ACCOUNTANT)
    g.character.job!.performance = 70
    g.flags.taxableIncome = 0
    const before = g.character.money
    g.character.age += 1
    yearlyCareer(g)
    expect(g.flags.taxableIncome).toBeGreaterThanOrEqual(52000)
    expect(g.character.money - before).toBeGreaterThanOrEqual(52000)
    expect(g.character.job?.yearsAtCompany ?? 1).toBe(1)
  })

  it('pays part-time wages and pensions', () => {
    const g = makeTestGame(9, { age: 16 })
    const def = getJobDef('pt_barista')!
    hireForJob(g, { defId: def.id, title: def.ladder[0].title, company: 'Daily Grind Coffee', salary: def.ladder[0].salary, category: 'parttime' })
    expect(g.character.partTimeJob?.data.hourly).toBe(12)
    g.flags.taxableIncome = 0
    yearlyCareer(g)
    expect(g.flags.taxableIncome).toBe(def.ladder[0].salary)

    const old = makeTestGame(10, { age: 70, retired: true, pension: 20000 })
    old.flags.taxableIncome = 0
    yearlyCareer(old)
    expect(old.flags.taxableIncome).toBe(20000)
  })

  it('promotes strong performers up the ladder', () => {
    const g = adult(11)
    hireForJob(g, ACCOUNTANT)
    g.character.stats.smarts = 100
    g.character.stats.happiness = 100
    for (let i = 0; i < 12 && g.character.job; i++) {
      g.character.age += 1
      g.yearActions = {}
      g.character.job.performance = 95
      yearlyCareer(g)
    }
    expect(g.counters.promotions ?? 0).toBeGreaterThanOrEqual(1)
  })

  it('fires poor performers and blocks re-hiring for that job', () => {
    const g = adult(12)
    hireForJob(g, ACCOUNTANT)
    g.character.stats.smarts = 0
    g.character.stats.happiness = 0
    for (let i = 0; i < 15 && g.character.job; i++) {
      g.character.age += 1
      g.character.job.performance = 5
      yearlyCareer(g)
    }
    expect(g.character.job).toBeNull()
    expect(g.counters.fired).toBe(1)
    expect(g.character.careerHistory.at(-1)?.reason).toBe('fired')
    expect(g.people.some((p) => p.relation === 'coworker' || p.relation === 'boss')).toBe(false)
    expect(g.flags.firedJobs).toContain('accountant')
  })

  it('loses regular jobs in prison', () => {
    const g = adult(13)
    hireForJob(g, ACCOUNTANT)
    g.character.prison = { name: 'State Pen', security: 'medium', crime: 'Fraud', sentenceYears: 3, yearsServed: 0, respect: 20, appealed: false, escapeAttempts: 0 }
    yearlyCareer(g)
    expect(g.character.job).toBeNull()
    expect(g.character.careerHistory.at(-1)?.reason).toBe('prison')
  })

  it('retires with a pension', () => {
    const g = adult(14, 62)
    hireForJob(g, ACCOUNTANT)
    g.character.job!.yearsAtCompany = 25
    careerInternals.retire(g)
    expect(g.character.retired).toBe(true)
    expect(g.character.pension).toBeGreaterThan(0)
    expect(g.character.job).toBeNull()
  })
})

describe('occupation menu', () => {
  it('shows age- and prison-appropriate content', () => {
    const baby = makeTestGame(1, { age: 2 })
    const babyNodes = occupationMenu.children(baby)
    expect(babyNodes).toHaveLength(1)
    expect(babyNodes[0].type).toBe('info')

    const con = adult(1)
    con.character.prison = { name: 'State Pen', security: 'medium', crime: 'Fraud', sentenceYears: 3, yearsServed: 0, respect: 20, appealed: false, escapeAttempts: 0 }
    const conNodes = occupationMenu.children(con)
    expect(conNodes).toHaveLength(1)
    expect(conNodes[0].type).toBe('info')

    const g = adult(1)
    hireForJob(g, ACCOUNTANT)
    const ids = occupationMenu.children(g).map((n) => n.id)
    expect(ids).toEqual(expect.arrayContaining(['edu.menu', 'job.job', 'occupation.jobs', 'occupation.parttime', 'occupation.freelance']))
    const harder = findNode(occupationMenu.children(g), 'job.harder', g) as MenuAction
    harder.run(g)
    expect(g.character.job!.data.workedHarder).toBe(1)
  })

  it('walks every menu node without throwing', () => {
    const g = adult(15)
    hireForJob(g, ACCOUNTANT)
    let count = 0
    const walk = (nodes: MenuNode[], depth: number) => {
      for (const n of nodes) {
        count++
        if (n.type === 'menu' && depth < 4) walk(n.children(g), depth + 1)
        if (n.type === 'action') {
          n.disabledReason?.(g)
          n.confirm?.(g)
          if (typeof n.subtitle === 'function') n.subtitle(g)
        }
      }
    }
    walk(occupationMenu.children(g), 0)
    expect(count).toBeGreaterThan(50)
  })

  it('pays for freelance gigs (and caps them per year)', () => {
    const g = makeTestGame(16, { age: 14 })
    const gig = findNode(occupationMenu.children(g), 'gig.babysitter', g) as MenuAction
    expect(gig).toBeDefined()
    for (let i = 0; i < 40; i++) gig.run(g, '1')
    expect(g.yearActions.gigs).toBe(10)
    expect(g.counters.gigs).toBe(10)
    expect(g.character.money).toBeGreaterThan(0)
    const tooYoung = findNode(occupationMenu.children(g), 'gig.handyman', g) as MenuAction
    expect(tooYoung.disabledReason?.(g)).toMatch(/18/)
  })
})
