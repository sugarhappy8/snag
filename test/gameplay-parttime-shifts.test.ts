import { describe, expect, it } from 'vitest'
import { hireForJob } from '../src/game/careers'
import { ERA_PARTTIME_JOBS, PARTTIME_JOBS, type JobDef } from '../src/game/data/jobs'
import { EARLY_PARTTIME_JOBS } from '../src/game/history/events-jobs'
import type { GameState, Json, MenuAction, MenuNode } from '../src/game/types'
import { choosePartTimeShiftFocus, partTimeShiftMenu, partTimeShiftProfile, partTimeShiftState, yearlyPartTimeShift } from '../src/game/workplace/parttime'
import { WORK_FAMILIES } from '../src/game/workplace/catalog'
import { makeTestGame } from './helpers'

const ALL_PARTTIME = [...PARTTIME_JOBS, ...ERA_PARTTIME_JOBS, ...EARLY_PARTTIME_JOBS]
function copy<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T }
function hire(g: GameState, def: JobDef = ALL_PARTTIME[0], company = 'Shift Employer'): void {
  hireForJob(g, { defId: def.id, title: def.ladder[0].title, company, salary: def.ladder[0].salary, category: 'parttime' })
  g.character.partTimeJob!.performance = 100
  g.queue = []
}
function worker(seed = 1): GameState {
  const g = makeTestGame(seed, { age: 20, money: 10000 })
  g.character.hidden.discipline = 100
  hire(g)
  return g
}
function nextYear(g: GameState): void {
  g.year++
  g.character.age++
  g.character.partTimeJob!.yearsAtCompany++
  g.yearActions = {}
  yearlyPartTimeShift(g)
}
function readMenu(nodes: MenuNode[], g: GameState): void {
  for (const node of nodes) {
    if (node.type === 'menu') readMenu(node.children(g), g)
    if (node.type === 'action') {
      node.disabledReason?.(g)
      if (typeof node.subtitle === 'function') node.subtitle(g)
    }
  }
}

describe('part-time Shift Focus', () => {
  it('supports every one of the 70 modern, historical and student part-time jobs', () => {
    expect(ALL_PARTTIME).toHaveLength(70)
    expect(new Set(ALL_PARTTIME.map((def) => def.id)).size).toBe(70)
    for (const def of ALL_PARTTIME) {
      const g = worker()
      hire(g, def)
      expect(partTimeShiftMenu.visible?.(g), def.id).toBe(true)
      expect(choosePartTimeShiftFocus(g, 'reliability'), def.id).toBe(true)
      nextYear(g)
      expect(partTimeShiftState(g, g.character.partTimeJob!).reviews, def.id).toHaveLength(1)
    }
  })

  it.each(['reliability', 'learning', 'customers'] as const)('%s settles next birthday, once, without a second wage', (focus) => {
    const g = worker(17)
    expect(choosePartTimeShiftFocus(g, focus)).toBe(true)
    expect(choosePartTimeShiftFocus(g, focus)).toBe(false)
    const salary = g.character.partTimeJob!.salary
    const money = g.character.money
    const taxableIncome = g.flags.taxableIncome
    const sameYear = copy(g)
    yearlyPartTimeShift(g)
    expect(g).toEqual(sameYear)
    const replay = copy(g)
    nextYear(g)
    nextYear(replay)
    expect(g).toEqual(replay)
    expect(g.character.money).toBe(money)
    expect(g.character.partTimeJob!.salary).toBe(salary)
    expect(g.flags.taxableIncome).toBe(taxableIncome)
    expect(partTimeShiftState(g, g.character.partTimeJob!).reviews[0].focus).toBe(focus)
    const after = copy(g)
    yearlyPartTimeShift(g)
    expect(g).toEqual(after)
  })

  it('keeps all menu reads pure and leaves the global RNG alone during ordinary review', () => {
    const g = worker()
    const before = copy(g)
    partTimeShiftMenu.visible?.(g)
    partTimeShiftMenu.header?.(g)
    readMenu(partTimeShiftMenu.children(g), g)
    expect(g).toEqual(before)
    choosePartTimeShiftFocus(g, 'learning')
    const rng = g.rng
    nextYear(g)
    expect(g.rng).toBe(rng)
    const reviewed = copy(g)
    readMenu(partTimeShiftMenu.children(g), g)
    expect(g).toEqual(reviewed)
  })

  it('makes learning, reliability and people choices meaningfully different', () => {
    const states = ['reliability', 'learning', 'customers'].map((focus) => {
      const g = worker(7)
      choosePartTimeShiftFocus(g, focus as 'reliability' | 'learning' | 'customers')
      nextYear(g)
      return g
    })
    expect(partTimeShiftProfile(states[1]).skill).toBe(24)
    expect(partTimeShiftProfile(states[0]).skill).toBe(21)
    expect(partTimeShiftState(states[0], states[0].character.partTimeJob!).trust).toBeGreaterThanOrEqual(57)
    const bossRelationship = (g: GameState) => g.people.find((person) => person.id === g.character.partTimeJob!.bossId)!.relationship
    expect(bossRelationship(states[2])).toBeGreaterThan(bossRelationship(states[0]))
  })

  it('does not reset the yearly choice by changing employer or clearing action counters', () => {
    const g = worker()
    choosePartTimeShiftFocus(g, 'learning')
    hire(g, ALL_PARTTIME[1], 'Other Employer')
    g.yearActions = {}
    const before = copy(g)
    expect(choosePartTimeShiftFocus(g, 'customers')).toBe(false)
    expect(g).toEqual(before)
    expect(partTimeShiftState(g, g.character.partTimeJob!).trust).toBe(50)
    expect(partTimeShiftProfile(g).skill).toBe(20)
  })

  it('ignores detached jobs and stale menu actions after a replacement hire', () => {
    const g = worker()
    choosePartTimeShiftFocus(g, 'learning')
    const oldJob = g.character.partTimeJob!
    const action = partTimeShiftMenu.children(g).find((node) => node.id === 'parttime.shifts.customers') as MenuAction
    hire(g, ALL_PARTTIME[1], 'Other Employer')
    g.year++
    g.character.age++
    g.yearActions = {}
    const before = copy(g)
    yearlyPartTimeShift(g, oldJob)
    action.run(g)
    expect(g).toEqual(before)
    expect(action.disabledReason?.(g)).toContain('no longer the same job')
  })

  it('cannot settle two employers in the same calendar year', () => {
    const g = worker()
    choosePartTimeShiftFocus(g, 'reliability')
    nextYear(g)
    const completed = partTimeShiftProfile(g).completed
    hire(g, ALL_PARTTIME[1], 'Other Employer')
    yearlyPartTimeShift(g)
    const job = g.character.partTimeJob!
    const state = partTimeShiftState(g, job)
    state.plan = { year: g.year - 1, focus: 'reliability' }
    job.data.shiftFocus = state as unknown as Json
    yearlyPartTimeShift(g)
    expect(partTimeShiftProfile(g).completed).toBe(completed)
    expect(partTimeShiftState(g, job).reviews).toHaveLength(0)
  })

  it('earns one portable CV reference after sustained work and bounds review history', () => {
    const g = worker()
    choosePartTimeShiftFocus(g, 'reliability')
    nextYear(g)
    nextYear(g)
    expect(g.character.cv?.filter((entry) => entry.source === 'parttime-shifts') ?? []).toHaveLength(0)
    nextYear(g)
    const earnedYear = g.year
    for (let year = 0; year < 6; year++) nextYear(g)
    const references = g.character.cv!.filter((entry) => entry.source === 'parttime-shifts')
    expect(references).toHaveLength(1)
    expect(references[0].strength).toBeLessThanOrEqual(6)
    expect(partTimeShiftState(g, g.character.partTimeJob!).reviews).toHaveLength(4)
    expect(partTimeShiftProfile(g).referenceFamily).toBeDefined()
    expect(partTimeShiftProfile(g).referenceYear).toBe(earnedYear)
    const skill = partTimeShiftProfile(g).skill
    hire(g, ALL_PARTTIME[1], 'Next Employer')
    expect(partTimeShiftState(g, g.character.partTimeJob!).completed).toBe(0)
    expect(partTimeShiftProfile(g).skill).toBe(skill)
    expect(g.character.cv!.filter((entry) => entry.source === 'parttime-shifts')).toHaveLength(1)
  })

  it('does not inherit another life’s progress, pending work or reference eligibility', () => {
    const g = worker()
    choosePartTimeShiftFocus(g, 'learning')
    nextYear(g)
    g.generation++
    expect(partTimeShiftProfile(g).completed).toBe(0)
    expect(partTimeShiftProfile(g).referenceFamily).toBeUndefined()
    expect(partTimeShiftState(g, g.character.partTimeJob!).plan).toBeNull()
    expect(partTimeShiftState(g, g.character.partTimeJob!).trust).toBe(50)
  })

  it('reads old or malformed records safely without mutation', () => {
    const g = worker()
    const job = g.character.partTimeJob!
    const base = partTimeShiftState(g, job)
    job.data.shiftFocus = { ...base, trust: Infinity, completed: -100, lastSettledYear: NaN, plan: { year: g.year + 1, focus: 'overtime' }, reviews: [null, { year: g.year, focus: 'learning', rating: 'excellent', summary: 'Good.' }, { year: g.year, focus: 'learning', rating: 'excellent', summary: 'Latest.' }] } as unknown as Json
    g.flags.partTimeShifts = { ...partTimeShiftProfile(g), skill: -100, completed: Infinity, referenceFamily: 'unknown', referenceYear: g.year + 1 } as unknown as Json
    const serialized = JSON.stringify(g)
    const state = partTimeShiftState(g, job)
    expect(state.trust).toBe(50)
    expect(state.completed).toBe(0)
    expect(state.plan).toBeNull()
    expect(state.reviews).toHaveLength(1)
    expect(state.reviews[0].summary).toBe('Latest.')
    expect(partTimeShiftProfile(g).skill).toBe(0)
    expect(partTimeShiftProfile(g).completed).toBe(0)
    expect(partTimeShiftProfile(g).referenceFamily).toBeUndefined()
    readMenu(partTimeShiftMenu.children(g), g)
    expect(JSON.stringify(g)).toBe(serialized)
    yearlyPartTimeShift(g)
    expect(partTimeShiftState(g, job).plan?.focus).toBe('reliability')
  })

  it.each(['chosen', 'default'] as const)('recovers a current-year settlement marker before creating a %s plan', (method) => {
    const g = worker()
    const job = g.character.partTimeJob!
    job.data.shiftFocus = { ...partTimeShiftState(g, job), lastSettledYear: g.year } as unknown as Json
    if (method === 'chosen') expect(choosePartTimeShiftFocus(g, 'learning')).toBe(true)
    else yearlyPartTimeShift(g)
    const state = partTimeShiftState(g, job)
    expect(state.plan?.year).toBe(g.year)
    expect(state.lastSettledYear).toBe(g.year - 1)
    yearlyPartTimeShift(g)
    expect(partTimeShiftState(g, job).plan?.focus).toBe(method === 'chosen' ? 'learning' : 'reliability')
    nextYear(g)
    expect(partTimeShiftState(g, job).reviews).toHaveLength(1)
    expect(partTimeShiftProfile(g).completed).toBe(1)
  })

  it('treats unknown or absent saved record versions as fresh without mutating reads', () => {
    const g = worker()
    const job = g.character.partTimeJob!
    choosePartTimeShiftFocus(g, 'learning')
    nextYear(g)
    const state = partTimeShiftState(g, job)
    const profile = partTimeShiftProfile(g)
    for (const version of [2, null, '1']) {
      job.data.shiftFocus = { ...state, v: version } as unknown as Json
      g.flags.partTimeShifts = { ...profile, v: version } as unknown as Json
      const before = copy(g)
      expect(partTimeShiftState(g, job).plan).toBeNull()
      expect(partTimeShiftState(g, job).completed).toBe(0)
      expect(partTimeShiftProfile(g).skill).toBe(20)
      expect(partTimeShiftProfile(g).completed).toBe(0)
      expect(g).toEqual(before)
    }
  })

  it('bounds reference text and rejects malformed or unrelated old tags', () => {
    const g = worker()
    choosePartTimeShiftFocus(g, 'reliability')
    for (let year = 0; year < 3; year++) nextYear(g)
    const reference = g.character.cv!.find((entry) => entry.source === 'parttime-shifts')!
    reference.tags = [...Array.from({ length: 500 }, (_, index) => `unrelated-${index}`), 'service', 'service']
    g.character.partTimeJob!.company = 'Long employer name '.repeat(100)
    nextYear(g)
    const validTags = new Set(Object.values(WORK_FAMILIES).flatMap((family) => family.tags))
    expect(reference.detail!.length).toBeLessThanOrEqual(240)
    expect(reference.tags!.length).toBeLessThanOrEqual(validTags.size)
    expect(reference.tags!.every((tag) => validTags.has(tag))).toBe(true)
    expect(reference.tags).toContain('service')
    reference.tags = 'not an array' as unknown as string[]
    nextYear(g)
    expect(Array.isArray(reference.tags)).toBe(true)
    expect(reference.tags!.every((tag) => validTags.has(tag))).toBe(true)
  })

  it('excludes full-time and special main jobs and rejects unavailable actions', () => {
    const g = worker()
    const job = g.character.partTimeJob!
    g.character.job = { ...job, category: 'special' }
    g.character.partTimeJob = null
    expect(partTimeShiftMenu.visible?.(g)).toBe(false)
    expect(choosePartTimeShiftFocus(g, 'learning')).toBe(false)
    yearlyPartTimeShift(g, g.character.job)
    expect(g.character.job.data.shiftFocus).toBeUndefined()
    g.character.partTimeJob = job
    g.character.alive = false
    const before = copy(g)
    expect(choosePartTimeShiftFocus(g, 'learning')).toBe(false)
    yearlyPartTimeShift(g)
    expect(g).toEqual(before)
  })

  it('records poor shifts without granting a reference or another wage', () => {
    const g = worker()
    g.character.partTimeJob!.performance = 0
    g.character.hidden.discipline = 0
    choosePartTimeShiftFocus(g, 'customers')
    nextYear(g)
    const state = partTimeShiftState(g, g.character.partTimeJob!)
    expect(state.reviews[0].rating).toBe('setback')
    expect(state.trust).toBe(45)
    expect(state.completed).toBe(0)
    expect(g.character.cv?.filter((entry) => entry.source === 'parttime-shifts') ?? []).toHaveLength(0)
  })
})
