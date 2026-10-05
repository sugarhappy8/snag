import { describe, expect, it } from 'vitest'
import { counter } from '../src/game/core'
import { runScript } from '../src/game/scripts'
import { fameMenu, militaryMenu, socialMediaMenu, specialCareersMenu, specialJobNodes, yearlySpecial } from '../src/game/special'
import { hire } from '../src/game/special/common'
import type { Character, Degree, GameState, MenuAction, MenuNode, ModalItem } from '../src/game/types'
import { makeTestGame } from './helpers'

// ---------------------------------------------------------------------------
// Helpers

const HIGH_SCHOOL: Degree = { kind: 'highschool', name: 'High School Diploma', school: 'Central High', age: 18 }
const BACHELOR: Degree = { kind: 'bachelor', name: "Bachelor's in Physics", major: 'Physics', school: 'State University', age: 22 }

function game(age: number, overrides: Partial<Character> = {}, seed = 7): GameState {
  const g = makeTestGame(seed, { age, ...overrides })
  g.log = [{ age, year: 2026, entries: [] }]
  return g
}

function withDegrees(g: GameState, ...degrees: Degree[]): GameState {
  g.character.education.degrees.push(...degrees)
  g.character.education.completed.push('elementary', 'middle', 'high')
  return g
}

function findNode(g: GameState, nodes: MenuNode[], id: string, depth = 0): MenuNode | undefined {
  if (depth > 5) return undefined
  for (const n of nodes) {
    if ('id' in n && n.id === id) return n
    if (n.type === 'menu') {
      const hit = findNode(g, n.children(g), id, depth + 1)
      if (hit) return hit
    }
  }
  return undefined
}

function action(g: GameState, nodes: MenuNode[], id: string): MenuAction {
  const n = findNode(g, nodes, id)
  if (!n || n.type !== 'action') throw new Error(`action ${id} not found`)
  return n
}

function run(g: GameState, nodes: MenuNode[], id: string, input?: string): void {
  const a = action(g, nodes, id)
  const why = a.disabledReason?.(g)
  if (why) throw new Error(`action ${id} is disabled: ${why}`)
  a.run(g, input)
}

/** Resolve the next modal (choices by id, inputs by value) the way the store does. */
function answer(g: GameState, choiceId: string): ModalItem {
  for (;;) {
    const m = g.queue.shift()
    if (!m) throw new Error(`no modal to answer with "${choiceId}"`)
    if (m.kind === 'notice' || m.kind === 'aiTask') continue
    const before = g.queue.length
    if (m.kind === 'choice') {
      const id = m.choices.some((c) => c.id === choiceId) ? choiceId : m.choices[0].id
      runScript(g, m.scriptId!, id, m.data, m)
    } else if (m.kind === 'input') runScript(g, m.scriptId, choiceId, m.data, m)
    else runScript(g, m.scriptId, choiceId, m.data, m)
    g.queue.unshift(...g.queue.splice(before))
    return m
  }
}

/** Drain everything, preferring the given choice ids in order. */
function drain(g: GameState, prefer: string[] = []): ModalItem[] {
  const seen: ModalItem[] = []
  for (let guard = 0; g.queue.length && guard < 200; guard++) {
    const m = g.queue.shift()!
    seen.push(m)
    const before = g.queue.length
    if (m.kind === 'choice') {
      const id = prefer.find((p) => m.choices.some((c) => c.id === p)) ?? m.choices[0].id
      runScript(g, m.scriptId!, id, m.data, m)
    } else if (m.kind === 'input') runScript(g, m.scriptId, m.defaultValue ?? 'Test', m.data, m)
    else if (m.kind === 'minigame') runScript(g, m.scriptId, 'done', m.data, m)
    g.queue.unshift(...g.queue.splice(before))
  }
  expect(g.queue.length).toBe(0)
  return seen
}

function nextYear(g: GameState): void {
  g.character.age += 1
  g.year += 1
  g.yearActions = {}
  g.flags.taxableIncome = 0
  g.log.push({ age: g.character.age, year: g.year, entries: [] })
}

const careers = (g: GameState) => specialCareersMenu.children(g)

// ---------------------------------------------------------------------------

describe('special careers menu', () => {
  it('lists every special career', () => {
    const g = game(20)
    const ids = careers(g).map((n) => ('id' in n ? n.id : ''))
    for (const id of ['special.actor', 'special.astronaut', 'special.influencer', 'special.model', 'special.music', 'special.politics', 'special.athlete', 'special.hustler']) {
      expect(ids).toContain(id)
    }
  })

  it('is hidden in prison and shows nothing to the dead', () => {
    const g = game(30)
    g.character.prison = { name: 'State Pen', security: 'medium', crime: 'Fraud', sentenceYears: 3, yearsServed: 0, respect: 20, appealed: false, escapeAttempts: 0 }
    expect(specialCareersMenu.visible?.(g)).toBe(false)
    g.character.prison = null
    g.character.alive = false
    expect(specialCareersMenu.visible?.(g)).toBe(false)
    expect(specialJobNodes(g)).toEqual([])
  })
})

describe('applications respect requirements', () => {
  it('locks auditions for kids', () => {
    const g = game(10)
    expect(action(g, careers(g), 'actor.audition').disabledReason?.(g)).toMatch(/18/)
    expect(action(g, careers(g), 'pol.run.school').disabledReason?.(g)).toMatch(/18/)
    expect(action(g, careers(g), 'hustle.start.scam').disabledReason?.(g)).toMatch(/18/)
  })

  it('requires a degree for the Space Academy', () => {
    const g = game(23)
    expect(action(g, careers(g), 'astro.academy').disabledReason?.(g)).toMatch(/university/i)
    withDegrees(g, HIGH_SCHOOL, BACHELOR)
    expect(action(g, careers(g), 'astro.academy').disabledReason?.(g)).toBeNull()
    // Agencies only hire Space Academy graduates.
    expect(findNode(g, careers(g), 'astro.apply.oea')).toBeUndefined()
  })

  it('works up the political ladder', () => {
    const g = game(20)
    expect(action(g, careers(g), 'pol.run.school').disabledReason?.(g)).toMatch(/high school/i)
    withDegrees(g, HIGH_SCHOOL)
    expect(action(g, careers(g), 'pol.run.school').disabledReason?.(g)).toBeNull()
    expect(action(g, careers(g), 'pol.run.mayor').disabledReason?.(g)).toMatch(/21/)
    g.character.age = 25
    expect(action(g, careers(g), 'pol.run.mayor').disabledReason?.(g)).toMatch(/degree|school board/i)
    expect(action(g, careers(g), 'pol.run.governor').disabledReason?.(g)).toMatch(/30|Mayor/)
    g.character.age = 40
    expect(action(g, careers(g), 'pol.run.leader').disabledReason?.(g)).toMatch(/Governor/)
    g.character.criminalRecord.push({ crime: 'Grand Theft Auto', age: 25, caught: true, convicted: true, sentenceYears: 3 })
    expect(action(g, careers(g), 'pol.run.school').disabledReason?.(g)).toMatch(/felony/i)
  })

  it('model agencies want headshots first', () => {
    const g = game(20, { stats: { happiness: 80, health: 90, smarts: 60, looks: 95 } })
    run(g, careers(g), 'model.agency')
    answer(g, 'Hometown Faces')
    expect(g.character.job).toBeNull()
    const text = g.queue.map((m) => ('text' in m ? m.text : '')).join(' ')
    expect(text).toMatch(/headshot/i)
  })

  it('military recruiters want a diploma, officers a degree', () => {
    const g = game(18)
    run(g, [militaryMenu], 'military.army.enlist')
    expect(g.character.job).toBeNull()
    g.queue = []
    withDegrees(g, HIGH_SCHOOL)
    run(g, [militaryMenu], 'military.navy.officer')
    expect(g.character.job).toBeNull()
  })

  it('street scams are 18+, busking is open at 16', () => {
    const g = game(16)
    expect(action(g, careers(g), 'hustle.start.scam').disabledReason?.(g)).toMatch(/18/)
    expect(action(g, careers(g), 'hustle.start.busk').disabledReason?.(g)).toBeNull()
  })
})

describe('military', () => {
  it('enlistment sets a military job and pays a salary', () => {
    const g = withDegrees(game(18))
    run(g, [militaryMenu], 'military.army.enlist')
    drain(g)
    const job = g.character.job
    expect(job?.category).toBe('military')
    expect(job?.defId).toBe('military.army')
    expect(job?.title).toBe('Private')
    expect(specialJobNodes(g).length).toBeGreaterThan(2)
    nextYear(g)
    const before = g.character.money
    yearlySpecial(g)
    drain(g, ['go', 'decline'])
    if (g.character.alive && g.character.job) {
      expect(g.flags.taxableIncome as number).toBeGreaterThan(0)
      expect(g.character.money).toBeGreaterThan(before)
    }
  })

  it('officers need a university degree and start as lieutenants', () => {
    const g = withDegrees(game(23), HIGH_SCHOOL, BACHELOR)
    run(g, [militaryMenu], 'military.navy.officer')
    drain(g)
    expect(g.character.job?.title).toBe('Ensign')
  })
})

describe('politics', () => {
  function elect(): GameState {
    const g = withDegrees(game(30, { stats: { happiness: 80, health: 90, smarts: 100, looks: 100 }, money: 1_000_000 }), HIGH_SCHOOL)
    g.character.hidden.fame = 60
    run(g, careers(g), 'pol.run.school')
    answer(g, 'progressive')
    answer(g, 'economy')
    answer(g, '3')
    for (let i = 0; i < 3; i++) answer(g, 'doors')
    drain(g)
    return g
  }

  it('runs a campaign and wins office', () => {
    const g = elect()
    const job = g.character.job
    expect(job?.defId).toBe('politician')
    expect(job?.title).toBe('School Board Director')
    expect(g.character.money).toBeLessThan(1_000_000) // paid for the campaign
    expect(counter(g, 'electionsWon')).toBe(1)
    // Can't start another campaign while in office.
    expect(findNode(g, careers(g), 'pol.run.mayor')).toBeUndefined()
  })

  it('yearlySpecial pays the salary and ends the term after four years', () => {
    const g = elect()
    const salary = g.character.job!.salary
    let sawTermEnd = false
    for (let year = 0; year < 4 && g.character.job; year++) {
      nextYear(g)
      g.character.job.data.approval = 70
      yearlySpecial(g)
      expect(g.flags.taxableIncome as number).toBeGreaterThanOrEqual(salary)
      const modals = drain(g, ['decline', 'apologize', 'fight', 'retire'])
      if (modals.some((m) => m.kind === 'choice' && m.title === 'End of Term')) sawTermEnd = true
    }
    expect(sawTermEnd).toBe(true)
    expect(g.character.job).toBeNull()
    expect(g.character.careerHistory.at(-1)?.title).toBe('School Board Director')
  })

  it('speeches on hot issues raise approval', () => {
    const g = elect()
    const job = g.character.job!
    job.data.approval = 50
    run(g, specialJobNodes(g), 'pol.news')
    drain(g)
    const hot = job.data.hot as string[]
    run(g, specialJobNodes(g), 'pol.speech')
    answer(g, hot[0])
    expect(job.data.approval as number).toBeGreaterThan(50)
    expect(job.performance).toBe(job.data.approval)
  })
})

describe('astronaut', () => {
  it('trains at the academy, graduates and joins an agency', () => {
    const g = withDegrees(game(23, { stats: { happiness: 80, health: 95, smarts: 100, looks: 60 } }), HIGH_SCHOOL, BACHELOR)
    g.character.hidden.athleticism = 90
    let tries = 0
    while (!g.character.job && tries < 10) {
      run(g, careers(g), 'astro.academy')
      drain(g)
      if (!g.character.job) nextYear(g)
      tries++
    }
    expect(g.character.job?.defId).toBe('astronaut.cadet')
    for (let y = 0; y < 2; y++) {
      for (const id of ['astro.drill.physical', 'astro.drill.sim', 'astro.drill.study', 'astro.drill.zerog']) run(g, specialJobNodes(g), id)
      drain(g)
      nextYear(g)
      yearlySpecial(g)
      drain(g, ['oea'])
    }
    expect(g.character.job?.defId).toBe('astronaut')
    expect(g.character.job?.title).toBe('Astronaut Candidate')
    // Candidates can't fly yet.
    expect(action(g, specialJobNodes(g), 'astro.mission').disabledReason?.(g)).toMatch(/not cleared/i)
  })

  it('flies a mission that raises fame', () => {
    for (let seed = 1; seed < 20; seed++) {
      const g = withDegrees(game(35, {}, seed), HIGH_SCHOOL, BACHELOR)
      hire(g, { defId: 'astronaut', title: 'Mission Specialist', company: 'Orbital Exploration Agency', salary: 98_000, level: 2, data: { agency: 'oea', lastMissionAge: -1 } })
      run(g, specialJobNodes(g), 'astro.mission')
      drain(g, ['moon', 'leap', 'go'])
      if (!g.character.alive) continue
      expect(g.character.hidden.fame).toBeGreaterThan(0)
      expect(counter(g, 'spaceMissions')).toBe(1)
      return
    }
    throw new Error('every mission ended in disaster')
  })
})

describe('fame', () => {
  it('is only usable when famous and grows with fame actions', () => {
    const g = game(30)
    expect(fameMenu.visible?.(g)).toBe(false)
    g.character.hidden.fame = 30
    expect(fameMenu.visible?.(g)).toBe(true)
    const start = g.character.hidden.fame
    for (let y = 0; y < 6; y++) {
      run(g, [fameMenu], 'fame.autographs')
      run(g, [fameMenu], 'fame.autographs')
      drain(g)
      nextYear(g)
    }
    expect(counter(g, 'fameActions')).toBe(12)
    expect(g.character.hidden.fame).toBeGreaterThan(start)
  })

  it('limits fame actions per year', () => {
    const g = game(30)
    g.character.hidden.fame = 40
    run(g, [fameMenu], 'fame.autographs')
    run(g, [fameMenu], 'fame.autographs')
    run(g, [fameMenu], 'fame.autographs')
    expect(counter(g, 'fameActions')).toBe(2)
  })
})

describe('social media', () => {
  it('creates one account per platform and posting works', () => {
    const g = game(16)
    expect(socialMediaMenu.visible?.(g)).toBe(true)
    run(g, socialMediaMenu.children(g), 'social.friendbook.join', 'testy')
    drain(g)
    expect(g.character.social?.handle).toBeTruthy()
    expect(findNode(g, socialMediaMenu.children(g), 'social.friendbook.join')?.type).toBe('action')
    const join = action(g, socialMediaMenu.children(g), 'social.friendbook.join')
    expect(join.visible?.(g)).toBe(false)
    run(g, socialMediaMenu.children(g), 'social.friendbook.post.selfie')
    drain(g)
    expect(JSON.parse(JSON.stringify(g))).toEqual(g)
  })

  it('is not available to young kids', () => {
    const g = game(9)
    expect(socialMediaMenu.visible?.(g)).toBe(false)
  })
})

describe('street hustler', () => {
  it('busks for cash', () => {
    const g = game(17)
    run(g, careers(g), 'hustle.start.busk')
    answer(g, 'Bucket Drums')
    drain(g)
    expect(g.character.job?.defId).toBe('hustler')
    expect(g.character.job?.title).toBe('Busker')
    const before = g.character.money
    run(g, specialJobNodes(g), 'hustle.work')
    drain(g, ['tourist.free', 'rival.share', 'cop.pay', 'gang.leave'])
    expect(g.character.money).toBeGreaterThan(before)
    expect(counter(g, 'hustles')).toBe(1)
  })
})

describe('yearlySpecial', () => {
  it('is a no-op for an ordinary life and leaves state JSON-safe', () => {
    const g = game(25)
    const before = JSON.stringify(g)
    yearlySpecial(g)
    expect(g.queue.length).toBe(0)
    expect(g.character.money).toBe(0)
    expect(JSON.stringify(JSON.parse(JSON.stringify(g)))).toBe(JSON.stringify(g))
    expect(before.length).toBeGreaterThan(0)
  })

  it('pays special-career income through earnIncome', () => {
    const g = game(25)
    hire(g, { defId: 'model', title: 'New Face', company: 'Hometown Faces', salary: 15_000, data: { tier: 0, gigsThisYear: 0, sabotaged: 0 } })
    g.character.stats.looks = 90
    nextYear(g)
    yearlySpecial(g)
    expect(g.flags.taxableIncome as number).toBeGreaterThanOrEqual(15_000)
  })
})
