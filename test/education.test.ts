import { describe, expect, it } from 'vitest'
import {
  applyToGraduateSchool,
  applyToUniversity,
  educationInternals,
  educationMenuNodes,
  gradeLetter,
  gradeLevelLabel,
  hasDegree,
  highestEducationLabel,
  meetsEducation,
  schoolWarning,
  yearlyEducation,
} from '../src/game/education'
import { runScript } from '../src/game/scripts'
import type { ChoiceModal, GameState, MenuAction, MenuGroup, MenuNode } from '../src/game/types'
import { makeTestGame } from './helpers'

function ageTo(g: GameState, age: number): void {
  while (g.character.age < age) {
    g.character.age += 1
    g.yearActions = {}
    yearlyEducation(g)
  }
}

function lastChoice(g: GameState, scriptId: string): ChoiceModal {
  const m = [...g.queue].reverse().find((x) => x.kind === 'choice' && x.scriptId === scriptId)
  if (!m || m.kind !== 'choice') throw new Error(`no ${scriptId} choice in queue`)
  return m
}

function resolve(g: GameState, scriptId: string, choiceId: string): void {
  const m = lastChoice(g, scriptId)
  g.queue = g.queue.filter((x) => x.id !== m.id)
  runScript(g, scriptId, choiceId, m.data, m)
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

function graduate(g: GameState, major = 'Biology'): void {
  g.character.education.degrees.push({ kind: 'highschool', name: 'High School Diploma', school: 'Test High', age: 18 })
  g.character.education.completed.push('elementary', 'middle', 'high')
  g.character.education.degrees.push({ kind: 'bachelor', name: `Bachelor's in ${major}`, major, school: 'Test University', age: 22 })
}

describe('school progression', () => {
  it('takes a child from age 5 to a high school diploma at 18', () => {
    const g = makeTestGame(3, { age: 4 })
    ageTo(g, 5)
    const ed = g.character.education
    expect(ed.current?.level).toBe('elementary')
    expect(gradeLevelLabel(g)).toBe('Kindergarten')
    ageTo(g, 11)
    expect(ed.current?.level).toBe('middle')
    ageTo(g, 14)
    expect(ed.current?.level).toBe('high')
    expect(gradeLevelLabel(g)).toBe('Freshman')
    ageTo(g, 18)
    expect(ed.current).toBeNull()
    expect(hasDegree(g, 'highschool')).toBe(true)
    expect(ed.completed).toEqual(expect.arrayContaining(['elementary', 'middle', 'high']))
    expect(g.counters.degrees).toBe(1)
    expect(highestEducationLabel(g)).toBe('High School Diploma')
    // The "what's next" popup is offered after graduating.
    expect(lastChoice(g, 'school.afterHighSchool').choices.map((c) => c.id)).toEqual(expect.arrayContaining(['university', 'community', 'work', 'gap']))
  })

  it('uses the local school system (UK: primary then secondary)', () => {
    const g = makeTestGame(5, { age: 4, countryId: 'gb' })
    ageTo(g, 5)
    expect(g.character.education.current?.school).toMatch(/Primary School$/)
    ageTo(g, 11)
    expect(g.character.education.current?.level).toBe('high')
    ageTo(g, 18)
    expect(hasDegree(g, 'highschool')).toBe(true)
  })

  it('creates classmates and teachers, and removes them when leaving (but keeps friends)', () => {
    const g = makeTestGame(7, { age: 4 })
    ageTo(g, 5)
    const cur = g.character.education.current!
    const sid = cur.data.schoolId
    const classmates = g.people.filter((p) => p.relation === 'classmate' && p.contextId === sid)
    const teachers = g.people.filter((p) => p.relation === 'teacher' && p.contextId === sid)
    expect(classmates.length).toBeGreaterThanOrEqual(3)
    expect(teachers.length).toBeGreaterThanOrEqual(1)
    classmates[0].relation = 'friend'
    ageTo(g, 11)
    expect(g.people.some((p) => p.contextId === sid && (p.relation === 'classmate' || p.relation === 'teacher'))).toBe(false)
    expect(g.people.some((p) => p.id === classmates[0].id)).toBe(true)
    const newSid = g.character.education.current!.data.schoolId
    expect(g.people.some((p) => p.relation === 'classmate' && p.contextId === newSid)).toBe(true)
  })

  it('enrolls a school-age child who is not in school (catch-up)', () => {
    const g = makeTestGame(9, { age: 9 })
    ageTo(g, 10)
    expect(g.character.education.current?.level).toBe('elementary')
    expect(g.character.education.current?.year).toBe(6)
  })

  it('pulls students out of school in prison and re-enrolls minors after release', () => {
    const g = makeTestGame(11, { age: 4 })
    ageTo(g, 8)
    g.character.prison = { name: 'Juvie', security: 'minimum', crime: 'Shoplifting', sentenceYears: 1, yearsServed: 0, respect: 20, appealed: false, escapeAttempts: 0 }
    ageTo(g, 9)
    expect(g.character.education.current).toBeNull()
    g.character.prison = null
    ageTo(g, 10)
    expect(g.character.education.current?.level).toBe('elementary')
  })
})

describe('school actions', () => {
  it('limits Study Harder per year and raises grades', () => {
    const g = makeTestGame(13, { age: 4 })
    ageTo(g, 7)
    const cur = g.character.education.current!
    cur.grades = 50
    const study = findNode(educationMenuNodes(g), 'school.study', g) as MenuAction
    study.run(g)
    study.run(g)
    study.run(g)
    expect(cur.grades).toBeGreaterThan(50)
    const before = g.queue.length
    study.run(g)
    expect(g.queue.length).toBe(before + 1)
    expect(g.counters.studied).toBe(3)
  })

  it('only allows dropping out at the legal age', () => {
    const g = makeTestGame(17, { age: 4 })
    ageTo(g, 15)
    let drop = findNode(educationMenuNodes(g), 'school.dropout', g) as MenuAction
    expect(drop.disabledReason?.(g)).toMatch(/16/)
    ageTo(g, 16)
    drop = findNode(educationMenuNodes(g), 'school.dropout', g) as MenuAction
    expect(drop.disabledReason?.(g)).toBeNull()
  })

  it('expels after three warnings (transfer when too young, out of school when older)', () => {
    const young = makeTestGame(19, { age: 4 })
    ageTo(young, 9)
    const oldSchool = young.character.education.current!.school
    schoolWarning(young, 'a food fight')
    schoolWarning(young, 'a food fight')
    schoolWarning(young, 'a food fight')
    expect(young.character.education.expelled).toBe(1)
    expect(young.character.education.current).not.toBeNull()
    expect(young.character.education.current!.school).not.toBe(oldSchool)

    const teen = makeTestGame(21, { age: 4 })
    ageTo(teen, 17)
    for (let i = 0; i < 3; i++) schoolWarning(teen, 'pulling the fire alarm')
    expect(teen.character.education.current).toBeNull()
    expect(teen.character.education.droppedOut).toContain('high')
    // ...and they can get a GED later.
    teen.character.money = 5000
    teen.character.stats.smarts = 100
    ageTo(teen, 18)
    const ged = findNode(educationMenuNodes(teen), 'edu.ged', teen) as MenuAction
    expect(ged).toBeDefined()
    ged.run(teen)
    expect(teen.character.money).toBeLessThan(5000)
  })

  it('lets you join clubs (up to three)', () => {
    const g = makeTestGame(23, { age: 4 })
    ageTo(g, 14)
    for (const id of ['clubs.join.chess', 'clubs.join.art', 'clubs.join.book']) {
      const a = findNode(educationMenuNodes(g), id, g) as MenuAction
      a.run(g)
    }
    const clubs = g.character.education.current!.data.clubs as unknown[]
    expect(clubs.length).toBe(3)
    const fourth = findNode(educationMenuNodes(g), 'clubs.join.math', g) as MenuAction
    expect(fourth.disabledReason?.(g)).toMatch(/3 activities/)
  })
})

describe('university and graduate school', () => {
  function adult(seed: number, overrides = {}): GameState {
    const g = makeTestGame(seed, { age: 18, money: 0, ...overrides })
    g.character.stats.smarts = 95
    g.flags.lastGrades = 95
    g.character.education.degrees.push({ kind: 'highschool', name: 'High School Diploma', school: 'Test High', age: 18 })
    g.character.education.completed.push('elementary', 'middle', 'high')
    return g
  }

  it('creates a student loan when paying with loans, and finishes with a bachelor degree', () => {
    let g = adult(1)
    for (let seed = 1; seed < 40; seed++) {
      g = adult(seed)
      applyToUniversity(g, 'Biology')
      if (g.queue.some((m) => m.kind === 'choice' && m.scriptId === 'school.tuition')) break
    }
    resolve(g, 'school.tuition', 'loans')
    const c = g.character
    expect(c.education.current?.level).toBe('university')
    expect(c.education.current?.major).toBe('Biology')
    expect(c.education.current?.funding).toBe('loans')
    expect(c.loans).toHaveLength(1)
    expect(c.loans[0].kind).toBe('student')
    expect(c.loans[0].balance).toBe(26000)
    expect(c.loans[0].yearlyPayment).toBe(0)
    ageTo(g, 22)
    expect(c.education.current).toBeNull()
    expect(hasDegree(g, 'bachelor', 'Biology')).toBe(true)
    expect(c.loans[0].balance).toBe(26000 * 4)
    expect(c.loans[0].yearlyPayment).toBeGreaterThan(0)
    expect(meetsEducation(g, 'bachelor', ['Biology', 'Chemistry'])).toBe(true)
    expect(meetsEducation(g, 'bachelor', ['Accounting'])).toBe(false)
    // Graduate school options are offered afterwards.
    expect(lastChoice(g, 'school.afterUniversity').choices.map((x) => x.id)).toContain('medical')
  })

  it('blocks enrollment while serving in the military', () => {
    const g = adult(7)
    g.character.job = { defId: 'army', title: 'Private', company: 'Army', category: 'military', salary: 30000, level: 0, performance: 60, yearsInRole: 0, yearsAtCompany: 0, data: {} }
    applyToUniversity(g, 'Biology')
    expect(g.character.education.current).toBeNull()
    const last = g.queue[g.queue.length - 1]
    expect(last.kind === 'notice' && last.text).toMatch(/military/)
  })

  it('is tuition-free in countries with free university', () => {
    for (let seed = 1; seed < 40; seed++) {
      const g = adult(seed, { countryId: 'fr' })
      applyToUniversity(g, 'History')
      if (g.character.education.current) {
        expect(g.character.education.current.funding).toBe('free')
        expect(g.character.loans).toHaveLength(0)
        return
      }
    }
    throw new Error('never accepted')
  })

  it('re-asks for payment when parents or scholarships fall through', () => {
    for (let seed = 1; seed < 60; seed++) {
      const g = adult(seed)
      applyToUniversity(g, 'Music')
      if (!g.queue.some((m) => m.kind === 'choice' && m.scriptId === 'school.tuition')) continue
      // Accepted, but not scholarship material.
      g.character.stats.smarts = 10
      g.flags.lastGrades = 10
      resolve(g, 'school.tuition', 'scholarship')
      if (g.character.education.current) continue
      const again = lastChoice(g, 'school.tuition')
      expect(again.choices.map((c) => c.id)).not.toContain('scholarship')
      expect(again.choices.map((c) => c.id)).toContain('loans')
      return
    }
    throw new Error('no rejected scholarship found')
  })

  it('runs medical school after an eligible bachelor and grants an MD', () => {
    for (let seed = 1; seed < 40; seed++) {
      const g = adult(seed, { age: 22, money: 1_000_000 })
      graduate(g, 'Biology')
      applyToGraduateSchool(g, 'medical')
      if (!g.queue.some((m) => m.kind === 'choice' && m.scriptId === 'school.tuition')) continue
      resolve(g, 'school.tuition', 'cash')
      const cur = g.character.education.current!
      expect(cur.level).toBe('graduate')
      expect(cur.totalYears).toBe(4)
      expect(g.character.money).toBeLessThan(1_000_000)
      ageTo(g, 26)
      expect(hasDegree(g, 'md')).toBe(true)
      expect(g.character.licenses).toContain('medical')
      expect(meetsEducation(g, 'medical')).toBe(true)
      return
    }
    throw new Error('never admitted')
  })

  it('rejects graduate programs that do not fit your major', () => {
    const g = adult(2, { age: 22 })
    graduate(g, 'Dance')
    applyToGraduateSchool(g, 'law')
    expect(g.character.education.current).toBeNull()
    expect(g.queue.some((m) => m.kind === 'notice' && m.title === 'Rejected')).toBe(true)
  })

  it('community college is free and grants an associate degree', () => {
    const g = adult(4)
    const nodes = educationMenuNodes(g)
    const cc = findNode(nodes, 'edu.community', g) as MenuAction
    cc.run(g)
    expect(g.character.education.current?.level).toBe('community')
    ageTo(g, 20)
    expect(hasDegree(g, 'associate')).toBe(true)
    expect(meetsEducation(g, 'community')).toBe(true)
  })
})

describe('helpers', () => {
  it('formats letter grades', () => {
    expect(gradeLetter(98)).toBe('A+')
    expect(gradeLetter(84)).toBe('B')
    expect(gradeLetter(10)).toBe('F')
  })

  it('reports the highest education', () => {
    const g = makeTestGame(1, { age: 30 })
    expect(highestEducationLabel(g)).toBe('None')
    graduate(g, 'Physics')
    expect(highestEducationLabel(g)).toBe("Bachelor's in Physics")
    expect(hasDegree(g, 'bachelor')).toBe(true)
    expect(hasDegree(g, 'bachelor', 'Physics')).toBe(true)
    expect(hasDegree(g, 'bachelor', 'Music')).toBe(false)
  })

  it('builds education menus for every stage without throwing', () => {
    const g = makeTestGame(31, { age: 0 })
    for (let age = 1; age <= 24; age++) {
      ageTo(g, age)
      const walk = (nodes: MenuNode[]) => {
        for (const n of nodes) {
          if (n.type === 'menu') walk((n as MenuGroup).children(g))
          if (n.type === 'action') n.disabledReason?.(g)
        }
      }
      walk(educationMenuNodes(g))
      g.queue = []
    }
    expect(JSON.parse(JSON.stringify(g))).toEqual(g)
    expect(educationInternals.levelForAge).toBeTypeOf('function')
  })
})
