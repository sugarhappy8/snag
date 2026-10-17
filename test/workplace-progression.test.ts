import { describe, expect, it } from 'vitest'
import { createPerson } from '../src/game/people'
import { getJobDef } from '../src/game/data/jobs'
import type { GameState, Job, Json } from '../src/game/types'
import { careerExperienceSummary, careerProgressionBonus, recordWorkExperience } from '../src/game/workplace/progression'
import { saveCareerTrack } from '../src/game/workplace/state'
import type { WorkFamily } from '../src/game/workplace/catalog'
import { makeTestGame } from './helpers'

function held(g: GameState, id = 'accountant', appointment = 'first'): Job {
  const def = getJobDef(id)!
  const job: Job = {
    defId: id, title: def.ladder[0].title, company: `Employer ${appointment}`, category: def.category,
    salary: 40_000, performance: 70, level: 0, yearsAtCompany: 1, yearsInRole: 1,
    data: { appointmentId: appointment, ...(def.hours === undefined ? {} : { hours: def.hours }) },
  }
  if (job.category === 'parttime') g.character.partTimeJob = job
  else g.character.job = job
  return job
}

function owner(g: GameState): string { return `${g.lifeId}:${g.generation}:${g.character.id}` }

function stored(g: GameState, family: WorkFamily = 'office') {
  const profile = g.flags.careerExperience as unknown as { tracks: Partial<Record<WorkFamily, { fulltimeYears: number; partTimeEquivalentYears: number; annualFulltime: number; annualPartTime: number }>> }
  return profile?.tracks[family]
}

function advance(g: GameState, job: Job): void {
  g.year += 1
  g.character.age += 1
  job.yearsAtCompany += 1
  recordWorkExperience(g, job)
}

describe('portable field experience', () => {
  it('reads old saves without guessing fields, migrating, spending money, or consuming RNG', () => {
    const g = makeTestGame(37, { age: 60, money: 40_000 })
    const job = held(g)
    job.yearsAtCompany = 40
    g.character.careerHistory = [{ title: 'Manager', company: 'Unknown', startAge: 18, endAge: 20, salary: 10_000, reason: 'quit' }]
    const before = structuredClone(g)
    expect(careerProgressionBonus(g, job)).toBe(0)
    expect(careerExperienceSummary(g, job)).toContain('no recorded field experience')
    expect(careerExperienceSummary(g, job)).toContain('Existing job requirements')
    expect(g).toEqual(before)
  })

  it('records just one new working year and is idempotent for an appointment/year', () => {
    const g = makeTestGame(2, { age: 40 })
    const job = held(g)
    job.yearsAtCompany = 20
    const before = structuredClone(g)
    recordWorkExperience(g, job)
    expect(stored(g)).toMatchObject({ fulltimeYears: 1, partTimeEquivalentYears: 0 })
    const settled = structuredClone(g)
    recordWorkExperience(g, job)
    expect(g).toEqual(settled)
    expect(g.rng).toBe(before.rng)
    expect(g.character.money).toBe(before.character.money)
    expect(job.salary).toBe(40_000)
    advance(g, job)
    expect(stored(g)?.fulltimeYears).toBe(2)
  })

  it('does not record a new hire before a working year has passed', () => {
    const g = makeTestGame(1, { age: 20 })
    const job = held(g)
    job.yearsAtCompany = 0
    const before = structuredClone(g)
    recordWorkExperience(g, job)
    expect(g).toEqual(before)
  })

  it('weights part-time hours separately and caps excessive hours', () => {
    const g = makeTestGame(1, { age: 22 })
    const job = held(g, 'pt_barista')
    job.data.hours = 20
    recordWorkExperience(g, job)
    expect(stored(g, 'service')).toMatchObject({ fulltimeYears: 0, partTimeEquivalentYears: 0.5 })
    job.data.hours = 9999
    advance(g, job)
    expect(stored(g, 'service')?.partTimeEquivalentYears).toBe(1.25)
    job.data.hours = -100
    advance(g, job)
    expect(stored(g, 'service')?.partTimeEquivalentYears).toBe(1.25)
    expect(careerExperienceSummary(g, job)).toContain('1.25 part-time equivalent years')
  })

  it('uses the catalog schedule for non-finite saved hours', () => {
    const g = makeTestGame(1, { age: 22 })
    const job = held(g, 'pt_barista')
    job.data.hours = Number.POSITIVE_INFINITY
    recordWorkExperience(g, job)
    expect(stored(g, 'service')?.partTimeEquivalentYears).toBe(getJobDef('pt_barista')!.hours! / 40)
  })

  it('caps same-field yearly credit despite employer hopping or changed hours', () => {
    const g = makeTestGame(1, { age: 22 })
    const first = held(g, 'pt_barista')
    first.data.hours = 10
    recordWorkExperience(g, first)
    first.data.hours = 30
    recordWorkExperience(g, first)
    expect(stored(g, 'service')?.partTimeEquivalentYears).toBe(0.25)
    for (let n = 0; n < 40; n++) {
      const next = held(g, 'pt_barista', `job-${n}`)
      next.data.hours = 20
      recordWorkExperience(g, next)
    }
    expect(stored(g, 'service')?.partTimeEquivalentYears).toBe(0.5)
  })

  it('gives full-time priority over same-field part-time work regardless of settlement order', () => {
    for (const fulltimeFirst of [true, false]) {
      const g = makeTestGame(1, { age: 25 })
      const main = held(g, 'chef')
      const partTime = held(g, 'pt_barista')
      partTime.data.hours = 20
      for (const job of fulltimeFirst ? [main, partTime] : [partTime, main]) recordWorkExperience(g, job)
      expect(stored(g, 'service')).toMatchObject({ fulltimeYears: 1, partTimeEquivalentYears: 0, annualFulltime: 1, annualPartTime: 0 })
    }
  })

  it('preserves earned experience across employers but never transfers it to an unrelated field', () => {
    const g = makeTestGame(1, { age: 25 })
    const previous = held(g)
    recordWorkExperience(g, previous)
    const next = held(g, 'accountant', 'second')
    expect(careerProgressionBonus(g, next)).toBeGreaterThan(0)
    const technical = held(g, 'computer_programmer', 'third')
    expect(careerProgressionBonus(g, technical)).toBe(0)
    recordWorkExperience(g, technical)
    expect(stored(g)?.fulltimeYears).toBe(1)
    expect(stored(g, 'technical')?.fulltimeYears).toBe(1)
    const before = structuredClone(g)
    recordWorkExperience(g, previous)
    expect(careerProgressionBonus(g, previous)).toBe(0)
    expect(g).toEqual(before)
  })

  it('records Professional Practice careers without adding a second work plan', () => {
    const g = makeTestGame(1, { age: 25 })
    const nurse = held(g, 'nurse')
    recordWorkExperience(g, nurse)
    expect(stored(g, 'care')?.fulltimeYears).toBe(1)
    expect(nurse.data.workplace).toBeUndefined()
  })

  it('bounds a long life and produces deterministic saved data', () => {
    const g = makeTestGame(1, { age: 25 })
    const job = held(g)
    const replay = structuredClone(g)
    for (const game of [g, replay]) {
      for (let n = 0; n < 200; n++) advance(game, game.character.job!)
    }
    expect(g).toEqual(replay)
    expect(stored(g)?.fulltimeYears).toBe(120)
    expect(job.salary).toBe(40_000)
    expect(g.rng).toBe(1)
  })

  it.each(['life', 'generation', 'character'] as const)('does not inherit experience after a %s change', (kind) => {
    const g = makeTestGame(1, { age: 25 })
    const job = held(g)
    recordWorkExperience(g, job)
    if (kind === 'life') g.lifeId = 'next-life'
    if (kind === 'generation') g.generation += 1
    if (kind === 'character') g.character.id = 'next-character'
    const before = structuredClone(g)
    expect(careerProgressionBonus(g, job)).toBe(0)
    expect(g).toEqual(before)
    recordWorkExperience(g, job)
    expect(stored(g)?.fulltimeYears).toBe(1)
    expect((g.flags.careerExperience as { owner: string }).owner).toBe(owner(g))
  })

  it('normalizes malformed records in pure reads and safely replaces them when recording', () => {
    const g = makeTestGame(1, { age: 25 })
    const job = held(g)
    g.flags.careerExperience = { v: 1, owner: owner(g), tracks: {
      office: { fulltimeYears: Number.POSITIVE_INFINITY, partTimeEquivalentYears: -40, year: g.year + 100, annualFulltime: 1, annualPartTime: 500 },
      technical: { fulltimeYears: 9000, partTimeEquivalentYears: 8000 },
      alien: { fulltimeYears: 500 },
    } } as unknown as Json
    const before = structuredClone(g)
    expect(careerProgressionBonus(g, job)).toBe(0)
    expect(careerExperienceSummary(g, job)).toContain('no recorded field experience')
    expect(g).toEqual(before)
    recordWorkExperience(g, job)
    expect(stored(g)?.fulltimeYears).toBe(1)
    expect(stored(g, 'technical')).toMatchObject({ fulltimeYears: 120, partTimeEquivalentYears: 0 })
    expect((g.flags.careerExperience as { tracks: Record<string, unknown> }).tracks.alien).toBeUndefined()
  })

  it('keeps the odds edge small, earned, and read-only', () => {
    const g = makeTestGame(1, { age: 25 })
    const job = held(g)
    saveCareerTrack(g, 'office', { mastery: 100, reputation: 100, completed: 100, setbacks: 0, specialty: '' })
    const boss = createPerson(g, { age: 40, relation: 'boss', contextId: job.company, relationship: 100 })
    job.bossId = boss.id
    expect(careerProgressionBonus(g, job)).toBe(0)
    for (let n = 0; n < 10; n++) advance(g, job)
    const before = structuredClone(g)
    expect(careerProgressionBonus(g, job)).toBe(0.045)
    expect(careerProgressionBonus(g, job)).toBeLessThanOrEqual(0.05)
    expect(careerExperienceSummary(g, job)).toContain('+4.5 percentage points')
    expect(g).toEqual(before)
  })

  it('only counts support from the current living boss at the current employer', () => {
    const g = makeTestGame(1, { age: 25 })
    const job = held(g)
    for (let n = 0; n < 3; n++) advance(g, job)
    const base = careerProgressionBonus(g, job)
    const boss = createPerson(g, { age: 40, relation: 'boss', contextId: job.company, relationship: 100 })
    job.bossId = boss.id
    expect(careerProgressionBonus(g, job)).toBeCloseTo(base + 0.005)
    boss.alive = false
    expect(careerProgressionBonus(g, job)).toBe(base)
    boss.alive = true
    boss.contextId = 'Previous Employer'
    expect(careerProgressionBonus(g, job)).toBe(base)
    boss.contextId = job.company
    boss.relation = 'friend'
    expect(careerProgressionBonus(g, job)).toBe(base)
  })

  it('counts only a valid owner-stamped same-field reference and caps the combined edge at five points', () => {
    const g = makeTestGame(1, { age: 25 })
    const job = held(g)
    for (let n = 0; n < 10; n++) advance(g, job)
    saveCareerTrack(g, 'office', { mastery: 100, reputation: 100, completed: 100, setbacks: 0, specialty: '' })
    job.bossId = createPerson(g, { age: 40, relation: 'boss', contextId: job.company, relationship: 100 }).id
    const valid = { v: 1, owner: owner(g), referenceFamily: 'office', referenceYear: g.year }
    for (const reference of [
      { ...valid, owner: 'someone else' },
      { ...valid, referenceFamily: 'care' },
      { ...valid, referenceYear: g.year + 1 },
      { ...valid, referenceYear: Number.NaN },
      { ...valid, referenceYear: g.year - 0.5 },
      { ...valid, v: 999 },
    ]) {
      g.flags.partTimeShifts = reference
      expect(careerProgressionBonus(g, job)).toBe(0.045)
    }
    g.flags.partTimeShifts = valid
    expect(careerProgressionBonus(g, job)).toBe(0.05)
  })

  it('ignores special, military, freelance, unknown, dead, imprisoned, and detached work', () => {
    for (const scenario of ['special', 'military', 'freelance', 'unknown', 'dead', 'prison', 'detached'] as const) {
      const g = makeTestGame(1, { age: 25 })
      const job = held(g)
      if (scenario === 'special' || scenario === 'military' || scenario === 'freelance') job.category = scenario
      if (scenario === 'unknown') job.defId = 'unknown'
      if (scenario === 'dead') g.character.alive = false
      if (scenario === 'prison') g.character.prison = { name: 'Jail', security: 'minimum', crime: 'Theft', sentenceYears: 1, yearsServed: 0, respect: 0, appealed: false, escapeAttempts: 0 }
      if (scenario === 'detached') g.character.job = structuredClone(job)
      const before = structuredClone(g)
      recordWorkExperience(g, job)
      expect(careerProgressionBonus(g, job), scenario).toBe(0)
      expect(careerExperienceSummary(g, job), scenario).toBe('')
      expect(g, scenario).toEqual(before)
    }
  })
})
