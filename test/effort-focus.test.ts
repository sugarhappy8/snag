// ci: fast
// R3-E6 (C.2, the person): the pool of 12 focus weeks that replaces the yearly action counters at four sites (Study Harder, club
// practice, lessons, tutorials), the yearly settle (posture takes effect, overtime clears, idle know-how fades, burnout), the posture
// rows in Life Priorities and the Ambition row on the Profile from 18.
//
// The pool is derived: it is the sum of the yearActions counters of FOCUS_KEYS, which aging.ts already resets every age-up, so no field
// is added. Within today's caps every number is what it was (the digests below were taken on the code before the pool existed); past
// them the action runs at half value instead of being refused, past 12 weeks it costs fatigue, and the 25th week is refused.
//
// No pinned seed: every life is makeTestGame's own, with a tuple of arguments.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { mindBodyMenu } from '../src/game/activities/mindBody'
import { ageUp } from '../src/game/aging'
import { learnInternals } from '../src/game/computer/dev-learn'
import { codingSkill } from '../src/game/computer/skills'
import { educationMenuNodes, yearlyEducation } from '../src/game/education'
import {
  FOCUS_KEYS, FOCUS_FULL_TEXT, FOCUS_WEEKS, focusLeft, focusPreview, focusUsed, isFocusKey, spendFocus,
} from '../src/game/effort/focus'
import { AGE_REVEAL, BURNOUT_F, FOCUS_OVERTIME_MAX, OVERTIME_STRAIN, POSTURE_STRAIN, SHIFT_MAX } from '../src/game/effort/limits'
import { effortModule, yearlyEffort } from '../src/game/effort/module'
import { postureNodes } from '../src/game/effort/menu'
import {
  POSTURE_LABELS, YOU_KEY, ambitionReveal, effortStrain, postureOf, readYou, setPosture, writeYou,
} from '../src/game/effort/persona'
import { householdView, lifePrioritiesMenu, yearlyHousehold } from '../src/game/household'
import { getModule, withYearly, yearlyEntries } from '../src/game/kernel/registry'
import { MODULES } from '../src/game/modules'
import type { GameState, Json, MenuAction, MenuNode } from '../src/game/types'
import { canonicalJson, fnv } from './golden-kit'
import { makeTestGame } from './helpers'
import { layerOf } from './layer-kit'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)
const source = (path: string): string => readFileSync(join(ROOT, path), 'utf8')

const ownerOf = (g: GameState): string => `${g.generation}:${g.character.id}`

function findNode(nodes: readonly MenuNode[], id: string, g: GameState): MenuNode | undefined {
  for (const n of nodes) {
    if (n.id === id) return n
    if (n.type === 'menu') {
      const hit = findNode(n.children(g), id, g)
      if (hit) return hit
    }
  }
  return undefined
}

function action(nodes: readonly MenuNode[], id: string, g: GameState): MenuAction {
  const n = findNode(nodes, id, g)
  if (!n || n.type !== 'action') throw new Error(`no action ${id}`)
  return n
}

/** A school child grows up the way education.test.ts does it: the age, the year's counters, the yearly education step. */
function ageTo(g: GameState, age: number): void {
  while (g.character.age < age) {
    g.character.age += 1
    g.yearActions = {}
    yearlyEducation(g)
  }
}

/** A state whose rng cannot be read or written: any draw in a read throws. */
function noRng(g: GameState): GameState {
  Object.defineProperty(g, 'rng', {
    get() {
      throw new Error('a read touched g.rng')
    },
    set() {
      throw new Error('a read wrote g.rng')
    },
    configurable: true,
  })
  return g
}

const adult = (age = 30): GameState => makeTestGame(7, { age })

/** Everything a site can touch, as one digest (floats cut to nine digits, as the golden kit does). */
const view = (g: GameState): string =>
  fnv(canonicalJson({ rng: g.rng, character: g.character, counters: g.counters, yearActions: g.yearActions, flags: g.flags, queue: g.queue, log: g.log }))

/** Sets the weeks already used this year on the study counter, the quickest way to fill the pool. */
function fill(g: GameState, weeks: number, key = 'study'): void {
  g.yearActions[key] = weeks
}

// --------------------------------------------------------------------------------------------------------------------------------
describe('the pool', () => {
  it('is 12 weeks, with 12 more that cost fatigue, and the keys are the four counters plus the Workshop two', () => {
    expect(FOCUS_WEEKS).toBe(12)
    expect(FOCUS_OVERTIME_MAX).toBe(12)
    expect([...FOCUS_KEYS]).toEqual(['study', 'practice:', 'act.lesson.', 'computer.dev.tutorial', 'workshop.build', 'workshop.brainstorm'])
    for (const k of ['study', 'practice:chess', 'act.lesson.acting', 'computer.dev.tutorial', 'workshop.build', 'workshop.brainstorm']) expect(isFocusKey(k), k).toBe(true)
    for (const k of ['gym', 'act.gym', 'studyHard', 'practice', 'act.lesson', 'computer.dev.course', 'workshop.launch', '', 'constructor', 7, null]) expect(isFocusKey(k), String(k)).toBe(false)
  })

  it('is the sum of the counters of the focus keys and nothing else', () => {
    const g = adult()
    expect(focusUsed(g)).toBe(0)
    expect(focusLeft(g)).toBe(12)
    g.yearActions = { study: 2, 'practice:chess': 1, 'practice:art': 2, 'act.lesson.acting': 3, 'computer.dev.tutorial': 1, applyUniversity: 3, 'act.gym': 3, 'computer.dev.course': 2 }
    expect(focusUsed(g)).toBe(9)
    expect(focusLeft(g)).toBe(3)
    g.yearActions.study = 20
    expect(focusLeft(g)).toBe(0)
    expect(focusUsed(g)).toBe(27)
  })

  it('reads a hostile counter as zero and a fraction as its whole part', () => {
    const g = adult()
    g.yearActions = { study: NaN, 'practice:a': -3, 'practice:b': Infinity, 'act.lesson.x': 2.9, 'computer.dev.tutorial': '5' } as unknown as Record<string, number>
    expect(focusUsed(g)).toBe(2)
    g.yearActions = null as unknown as Record<string, number>
    expect(focusUsed(g)).toBe(0)
    expect(focusLeft(g)).toBe(12)
  })

  it('books the first three study weeks at full value, as the counter always did', () => {
    const g = adult()
    const seen = [1, 2, 3].map(() => spendFocus(g, 'study', 3))
    expect(seen.map((u) => [u.ok, u.mult, u.left, u.overtime])).toEqual([[true, 1, 11, 0], [true, 1, 10, 0], [true, 1, 9, 0]])
    expect(g.yearActions.study).toBe(3)
    expect(YOU_KEY in g.flags).toBe(false)
  })

  it('runs the fourth at half value instead of refusing it, and still creates no record', () => {
    const g = adult()
    for (let i = 0; i < 3; i++) spendFocus(g, 'study', 3)
    const fourth = spendFocus(g, 'study', 3)
    expect(fourth).toEqual({ ok: true, mult: 0.5, left: 8, overtime: 0 })
    expect(g.yearActions.study).toBe(4)
    expect(YOU_KEY in g.flags).toBe(false)
  })

  it('previews what a spend will do and changes nothing', () => {
    const g = adult()
    for (let i = 0; i < 5; i++) spendFocus(g, 'practice:chess', 2)
    const before = JSON.stringify(g)
    const seen = focusPreview(g, 'practice:chess', 2)
    expect(JSON.stringify(g)).toBe(before)
    expect(seen).toEqual({ ok: true, mult: 0.5, left: 6, overtime: 0 })
    expect(spendFocus(g, 'practice:chess', 2)).toEqual(seen)
    expect(focusPreview(noRng(adult()), 'study', 3).ok).toBe(true)
  })

  it('counts the weeks of every focus key in one pool: the 13th week is the first one that costs fatigue', () => {
    const g = adult()
    for (let i = 0; i < 3; i++) spendFocus(g, 'study', 3)
    for (let i = 0; i < 3; i++) spendFocus(g, 'computer.dev.tutorial', 3)
    for (let i = 0; i < 3; i++) spendFocus(g, 'act.lesson.acting', 3)
    for (let i = 0; i < 2; i++) spendFocus(g, 'practice:chess', 2)
    expect(focusUsed(g)).toBe(11)
    expect(spendFocus(g, 'practice:art', 2)).toEqual({ ok: true, mult: 1, left: 0, overtime: 0 })
    expect(YOU_KEY in g.flags).toBe(false)
    const over = spendFocus(g, 'practice:art', 2)
    expect(over).toEqual({ ok: true, mult: 1, left: 0, overtime: 1 })
    expect(readYou(g).over).toBe(1)
    expect(spendFocus(g, 'practice:art', 2).overtime).toBe(1)
    expect(readYou(g).over).toBe(2)
  })

  it('lets 24 weeks through and refuses the 25th without recording anything', () => {
    const g = adult()
    for (let i = 0; i < 24; i++) expect(spendFocus(g, 'study', 3).ok, `week ${i + 1}`).toBe(true)
    expect(readYou(g).over).toBe(12)
    const before = JSON.stringify(g)
    const refused = spendFocus(g, 'study', 3)
    expect(refused).toEqual({ ok: false, mult: 0, left: 0, overtime: 0 })
    expect(JSON.stringify(g)).toBe(before)
    expect(focusPreview(g, 'act.lesson.acting', 3).ok).toBe(false)
  })

  it('spends several weeks at once all or nothing, and weighs the half value by the weeks past the key\'s own full', () => {
    const g = adult()
    fill(g, 21)
    expect(spendFocus(g, 'workshop.build', 5, 3)).toEqual({ ok: true, mult: 1, left: 0, overtime: 3 })
    const h = adult()
    fill(h, 22)
    const before = JSON.stringify(h)
    expect(spendFocus(h, 'workshop.build', 5, 3).ok).toBe(false)
    expect(JSON.stringify(h)).toBe(before)
    const k = adult()
    k.yearActions['workshop.build'] = 4
    expect(spendFocus(k, 'workshop.build', 5, 3).mult).toBe(0.67)
    const m = adult()
    expect(spendFocus(m, 'workshop.build', 9, 3).mult).toBe(1)
    expect(m.yearActions['workshop.build']).toBe(3)
  })

  it('refuses a key that is not a focus key and records nothing', () => {
    const g = adult()
    const before = JSON.stringify(g)
    expect(spendFocus(g, 'act.gym', 3)).toEqual({ ok: false, mult: 0, left: 12, overtime: 0 })
    expect(JSON.stringify(g)).toBe(before)
  })

  it('takes a nonsense count or cap as the nearest sane one', () => {
    const g = adult()
    expect(spendFocus(g, 'study', NaN, NaN)).toEqual({ ok: true, mult: 0.5, left: 11, overtime: 0 })
    expect(g.yearActions.study).toBe(1)
    expect(spendFocus(g, 'study', 3, -4).ok).toBe(true)
    expect(g.yearActions.study).toBe(2)
    expect(spendFocus(g, 'study', 3, 1e9).ok).toBe(false)
    expect(g.yearActions.study).toBe(2)
  })

  it('draws no random number', () => {
    const g = noRng(adult())
    expect(() => {
      focusLeft(g)
      focusPreview(g, 'study', 3)
      spendFocus(g, 'study', 3)
    }).not.toThrow()
  })
})

// --------------------------------------------------------------------------------------------------------------------------------
describe('the four sites', () => {
  // These digests were taken on the code before the pool existed (v5.0.0 plus the engine seed, E1 to E5), under Node 22.23.3.
  const STUDY = 'd48f8ac9990a516a'
  // PRACTICE moved with the merge of the quiet track (moved-tests.md): the queue of the club kid's school years holds three Report Card
  // notices, which now say "Your third-year report card" (R3-Q13, the repetition fix at the source) and carry a weight w of 1 (R3-Q2). The rng, character,
  // counters, yearActions, flags and log digests of the state are the ones of the release before the merge (checked part by part).
  const PRACTICE = '84226745e49da7c2' // was 'e269a12abd4a5afd'
  const LESSON = '77f9c90a534a91d5'
  const TUTORIAL = '535109dcee2611c9'

  function schoolChild(): GameState {
    const g = makeTestGame(13, { age: 4 })
    ageTo(g, 7)
    g.character.education.current!.grades = 50
    return g
  }

  function clubKid(): { g: GameState; practice: MenuAction } {
    const g = makeTestGame(21, { age: 4 })
    ageTo(g, 12)
    action(educationMenuNodes(g), 'clubs.join.chess', g).run(g)
    g.yearActions = {}
    return { g, practice: action(educationMenuNodes(g), 'clubs.chess.practice', g) }
  }

  function actress(): GameState {
    const g = makeTestGame(7, { age: 20 })
    g.character.money = 10_000
    return g
  }

  function coder(): GameState {
    const g = makeTestGame(4, { age: 12 })
    g.assets.push({ id: 'laptop1', kind: 'other', name: 'Laptop', emoji: 'x', purchasePrice: 1300, value: 900, condition: 100, purchasedAge: 12, upkeep: 0, details: { category: 'electronics' } })
    g.character.education.current = { level: 'middle', school: 'Test Middle', year: 1, totalYears: 3, grades: 75, data: {} }
    return g
  }

  it('Study Harder: three studies are what they were, byte for byte, and keep the same counters', () => {
    const g = schoolChild()
    const study = action(educationMenuNodes(g), 'school.study', g)
    for (let i = 0; i < 3; i++) study.run(g)
    expect(g.yearActions.study).toBe(3)
    expect(g.counters.studied).toBe(3)
    expect(YOU_KEY in g.flags).toBe(false)
    expect(view(g)).toBe(STUDY)
  })

  it('Study Harder: the fourth runs at half value, and the 25th week of the year is refused', () => {
    const g = schoolChild()
    const study = action(educationMenuNodes(g), 'school.study', g)
    for (let i = 0; i < 3; i++) study.run(g)
    // The same draws, once at full value (the clone's counter is back at zero) and once as the fourth.
    const twin = structuredClone(g)
    twin.yearActions = {}
    const gradesBefore = g.character.education.current!.grades
    const queued = g.queue.length
    study.run(g)
    action(educationMenuNodes(twin), 'school.study', twin).run(twin)
    const half = g.character.education.current!.grades - gradesBefore
    const full = twin.character.education.current!.grades - gradesBefore
    expect(full).toBeGreaterThanOrEqual(3)
    expect(half).toBe(Math.round(full * 0.5))
    expect(g.counters.studied).toBe(4)
    expect(g.yearActions.study).toBe(4)
    expect(g.queue.length).toBe(queued + 1)
    for (let i = 4; i < 24; i++) study.run(g)
    expect(g.yearActions.study).toBe(24)
    expect(g.counters.studied).toBe(24)
    const grades = g.character.education.current!.grades
    const queuedBefore = g.queue.length
    study.run(g)
    expect(g.counters.studied).toBe(24)
    expect(g.yearActions.study).toBe(24)
    expect(g.character.education.current!.grades).toBe(grades)
    expect(g.queue.length).toBe(queuedBefore + 1)
    const last = g.queue[g.queue.length - 1]!
    expect(last.kind === 'notice' && last.text).toBe(FOCUS_FULL_TEXT)
  })

  it('Study Harder: the row is greyed out once the year has no week left', () => {
    const g = schoolChild()
    const study = action(educationMenuNodes(g), 'school.study', g)
    expect(study.disabledReason?.(g)).toBeNull()
    fill(g, 24)
    expect(study.disabledReason?.(g)).toBe(FOCUS_FULL_TEXT)
  })

  it('club practice: two sessions are what they were, the third runs at half value', () => {
    const { g, practice } = clubKid()
    for (let i = 0; i < 2; i++) practice.run(g)
    expect(g.yearActions['practice:chess']).toBe(2)
    expect(YOU_KEY in g.flags).toBe(false)
    expect(view(g)).toBe(PRACTICE)
    const perf = (): number => (g.character.education.current!.data.clubs as { perf: number }[])[0]!.perf
    const before = perf()
    practice.run(g)
    expect(g.yearActions['practice:chess']).toBe(3)
    expect(perf()).toBeGreaterThanOrEqual(before)
  })

  it('club practice: the 25th week of the year is refused and changes nothing', () => {
    const { g, practice } = clubKid()
    fill(g, 24)
    // A popup takes the next id (nextId), so what must stay put is everything the practice would have touched.
    const touched = (): string => JSON.stringify([g.yearActions, g.flags, g.character, g.counters, g.rng])
    const before = touched()
    const queued = g.queue.length
    practice.run(g)
    expect(touched()).toBe(before)
    expect(g.queue.length).toBe(queued + 1)
    const last = g.queue[g.queue.length - 1]!
    expect(last.kind === 'notice' && last.text).toBe(FOCUS_FULL_TEXT)
  })

  it('lessons: three are what they were, the fourth is taught at half value and paid for', () => {
    const g = actress()
    const lesson = action(mindBodyMenu.children(g), 'mb.lesson.acting', g)
    for (let i = 0; i < 3; i++) lesson.run(g)
    expect(g.yearActions['act.lesson.acting']).toBe(3)
    expect(YOU_KEY in g.flags).toBe(false)
    expect(view(g)).toBe(LESSON)
    const money = g.character.money
    lesson.run(g)
    expect(g.yearActions['act.lesson.acting']).toBe(4)
    expect(g.character.money).toBeLessThan(money)
    expect(g.counters.actingLessons).toBe(4)
  })

  it('lessons: with no week left the coach is not paid and the row is greyed out', () => {
    const g = actress()
    fill(g, 24)
    const lesson = action(mindBodyMenu.children(g), 'mb.lesson.acting', g)
    expect(lesson.disabledReason?.(g)).toBe(FOCUS_FULL_TEXT)
    const money = g.character.money
    const skill = g.flags['skill.acting']
    lesson.run(g)
    expect(g.character.money).toBe(money)
    expect(g.flags['skill.acting']).toBe(skill)
    expect(g.yearActions['act.lesson.acting']).toBeUndefined()
    const last = g.queue[g.queue.length - 1]!
    expect(last.kind === 'notice' && last.text).toBe(FOCUS_FULL_TEXT)
  })

  it('tutorials: three are what they were, the fourth teaches at half value', () => {
    const g = coder()
    for (let i = 0; i < 3; i++) learnInternals.studyTutorial(g, 'python')
    expect(g.yearActions['computer.dev.tutorial']).toBe(3)
    expect(YOU_KEY in g.flags).toBe(false)
    expect(view(g)).toBe(TUTORIAL)
    const skill = codingSkill(g)
    learnInternals.studyTutorial(g, 'python')
    expect(g.yearActions['computer.dev.tutorial']).toBe(4)
    expect(codingSkill(g)).toBeGreaterThanOrEqual(skill)
    expect(g.counters.codingSessions).toBe(4)
  })

  it('tutorials: with no week left nothing is learned and the refusal says why', () => {
    const g = coder()
    fill(g, 24)
    const skill = codingSkill(g)
    const sessions = g.counters.codingSessions
    learnInternals.studyTutorial(g, 'python')
    expect(codingSkill(g)).toBe(skill)
    expect(g.counters.codingSessions).toBe(sessions)
    expect(g.yearActions['computer.dev.tutorial']).toBeUndefined()
    const last = g.queue[g.queue.length - 1]!
    expect(last.kind === 'notice' && last.text).toBe(FOCUS_FULL_TEXT)
  })

  it('overtime on a site costs fatigue: past 12 weeks the year\'s overtime is booked on the record', () => {
    const g = schoolChild()
    const study = action(educationMenuNodes(g), 'school.study', g)
    for (let i = 0; i < 15; i++) study.run(g)
    expect(readYou(g).over).toBe(3)
  })

  it('no site calls the old counter any more', () => {
    expect(source('src/game/education.ts')).not.toMatch(/useYearAction\(g, 'study'/)
    expect(source('src/game/education.ts')).not.toMatch(/useYearAction\(g, `practice:/)
    expect(source('src/game/activities/mindBody.ts')).not.toMatch(/useYearAction\(g, `act\.lesson/)
    expect(source('src/game/activities/mindBody.ts')).not.toMatch(/yearActions\[`act\.lesson/)
    expect(source('src/game/computer/dev-learn.ts')).not.toMatch(/useYearAction\(g, 'computer\.dev\.tutorial'/)
    expect(source('src/game/education.ts')).toMatch(/spendFocus\(g, 'study', 3\)/)
    expect(source('src/game/education.ts')).toMatch(/spendFocus\(g, `practice:\$\{id\}`, 2\)/)
    expect(source('src/game/activities/mindBody.ts')).toMatch(/const key = `act\.lesson\.\$\{l\.id\}`[\s\S]*focusPreview\(g, key, 3\)[\s\S]*spendFocus\(g, key, 3\)/)
    expect(source('src/game/computer/dev-learn.ts')).toMatch(/spendFocus\(g, 'computer\.dev\.tutorial', 3\)/)
  })
})

// --------------------------------------------------------------------------------------------------------------------------------
describe('the yearly settle', () => {
  /** A life with a record, as one gets after picking a posture. */
  function chosen(posture: 'lean' | 'steady' | 'push', extra: Record<string, unknown> = {}): GameState {
    const g = adult()
    g.year = 2030
    const y = readYou(g)
    Object.assign(y, { posture, ...extra })
    writeYou(g, y)
    return g
  }

  const household = (g: GameState, fatigue: number): void => {
    g.flags.household = { owner: ownerOf(g), priority: 'balanced', fatigue, training: 0, lastYear: g.year - 1, effective: 'balanced', spent: 0 }
  }

  it('does nothing when there is no record', () => {
    const g = adult()
    household(g, 95)
    const before = JSON.stringify(g)
    yearlyEffort(g)
    expect(JSON.stringify(g)).toBe(before)
    expect(YOU_KEY in g.flags).toBe(false)
  })

  it('does nothing for another life\'s record', () => {
    const g = adult()
    g.flags[YOU_KEY] = { owner: '0:somebody-else', v: 1, posture: 'push', effective: 'lean', over: 9 } as unknown as Json
    household(g, 95)
    const before = JSON.stringify(g)
    yearlyEffort(g)
    expect(JSON.stringify(g)).toBe(before)
  })

  it('rolls the chosen posture into force and clears the overtime', () => {
    const g = chosen('push', { over: 7 })
    expect(postureOf(g)).toBe('steady')
    yearlyEffort(g)
    expect(readYou(g)).toMatchObject({ posture: 'push', effective: 'push', over: 0, last: 2030 })
    expect(postureOf(g)).toBe('push')
  })

  it('keeps a person under 18 steady whatever the record says', () => {
    const g = makeTestGame(7, { age: AGE_REVEAL - 1 })
    g.year = 2030
    g.flags[YOU_KEY] = { owner: ownerOf(g), v: 1, posture: 'push', effective: 'push', over: 2 } as unknown as Json
    yearlyEffort(g)
    expect(readYou(g).effective).toBe('steady')
    expect(postureOf(g)).toBe('steady')
  })

  it('twice in one year is once', () => {
    const g = chosen('push', { over: 5, fieldK: { 'rd.a': 40 }, at: { 'rd.a': 2020 } })
    yearlyEffort(g)
    const once = JSON.stringify(g)
    yearlyEffort(g)
    expect(JSON.stringify(g)).toBe(once)
    const burn = chosen('push')
    household(burn, 92)
    yearlyEffort(burn)
    const burned = JSON.stringify(burn)
    const queued = burn.queue.length
    yearlyEffort(burn)
    expect(JSON.stringify(burn)).toBe(burned)
    expect(burn.queue.length).toBe(queued)
  })

  it('fades the know-how of a field nobody worked on last year and keeps the one that was worked on', () => {
    const g = chosen('push', { fieldK: { 'rd.idle': 40, 'rd.busy': 40, 'rd.never': 40 }, at: { 'rd.idle': 2027, 'rd.busy': 2029 } })
    yearlyEffort(g)
    const y = readYou(g)
    expect(y.fieldK['rd.busy']).toBe(40)
    expect(y.fieldK['rd.idle']).toBe(38)
    expect(y.fieldK['rd.never']).toBe(38)
  })

  it('forgets a field that has faded to nothing, and the year stamp that went with it', () => {
    const g = chosen('push', { fieldK: { 'rd.tiny': 0.51 }, at: { 'rd.tiny': 2020, 'rd.gone': 2020, 'rd.fresh': 2029 } })
    yearlyEffort(g)
    const y = readYou(g)
    expect(y.fieldK).toEqual({})
    expect(y.at).toEqual({ 'rd.fresh': 2029 })
  })

  it('drops the record when it carries nothing but its own stamp', () => {
    const g = chosen('push')
    yearlyEffort(g)
    expect(YOU_KEY in g.flags).toBe(true)
    const back = readYou(g)
    back.posture = 'steady'
    writeYou(g, back)
    g.year = 2031
    yearlyEffort(g)
    expect(YOU_KEY in g.flags).toBe(false)
    expect(postureOf(g)).toBe('steady')
  })

  it('records a burnout at fatigue 85: ambition drops, the year is lean, one plain notice', () => {
    const g = chosen('push')
    household(g, BURNOUT_F)
    yearlyEffort(g)
    const y = readYou(g)
    expect(y).toMatchObject({ posture: 'push', effective: 'lean', burnouts: 1, burnAt: 2030, shift: -1 })
    expect(postureOf(g)).toBe('lean')
    const notes = g.queue.filter((m) => m.kind === 'notice')
    expect(notes).toHaveLength(1)
    expect(notes[0]!.kind === 'notice' && notes[0]!.text).toBe("You pushed past your limit. You're easing off this year.")
  })

  it('does not burn out at 84 and does not make a record just for a tired person', () => {
    const g = chosen('push')
    household(g, BURNOUT_F - 1)
    yearlyEffort(g)
    expect(readYou(g).burnouts).toBe(0)
    expect(g.queue).toHaveLength(0)
    const none = adult()
    household(none, 100)
    yearlyEffort(none)
    expect(YOU_KEY in none.flags).toBe(false)
  })

  it('tells the player of a burnout only when the last one is three years back, and still counts every one', () => {
    const g = chosen('push')
    const notices: number[] = []
    for (const year of [2030, 2031, 2032, 2035, 2036]) {
      g.year = year
      household(g, 95)
      const before = g.queue.length
      yearlyEffort(g)
      notices.push(g.queue.length - before)
    }
    expect(notices).toEqual([1, 0, 0, 1, 0])
    expect(readYou(g).burnouts).toBe(5)
    expect(readYou(g).shift).toBe(-5)
  })

  it('never lets ambition drift past its bound however many burnouts', () => {
    const g = chosen('push')
    for (let year = 2030; year < 2060; year++) {
      g.year = year
      household(g, 99)
      yearlyEffort(g)
    }
    expect(readYou(g).shift).toBe(-SHIFT_MAX)
  })

  it('draws no random number', () => {
    const g = noRng(chosen('push', { over: 3 }))
    household(g, 95)
    expect(() => yearlyEffort(g)).not.toThrow()
  })
})

// --------------------------------------------------------------------------------------------------------------------------------
describe('the module', () => {
  it('is the first of MODULES, layer 2, with one yearly entry in the life phase after the household', () => {
    expect(MODULES[0]).toBe(effortModule)
    expect(effortModule.id).toBe('effort.you')
    expect(effortModule.layer).toBe(2)
    expect(effortModule.yearly).toEqual([{ seam: 'aging', phase: 'life', order: 35, run: expect.any(Function) }])
    expect(getModule('effort.you')).toBeDefined()
    const ids = yearlyEntries('aging').map((e) => e.id)
    expect(ids.indexOf('effort.you')).toBe(ids.indexOf('yearly.household') + 1)
    // R4-L4 put life.kin (life phase, order 37) between the effort step and the relationships hook; any other entry there is new.
    expect(ids.slice(ids.indexOf('effort.you') + 1, ids.indexOf('yearly.relationships'))).toEqual(['life.kin'])
  })

  it('leaves a life that never touches it identical, 20 years through the real age-up', () => {
    const run = (without: boolean): string => {
      const g = makeTestGame(7, { age: 25, money: 50_000 })
      const entries = yearlyEntries('aging').filter((e) => !(without && e.id === 'effort.you'))
      withYearly('aging', entries, () => {
        for (let i = 0; i < 20 && g.character.alive; i++) {
          g.queue = []
          ageUp(g)
        }
      })
      expect(YOU_KEY in g.flags).toBe(false)
      return canonicalJson(g)
    }
    expect(run(false)).toBe(run(true))
  })

  it('is layer 2 and imports nothing from the domains above it', () => {
    for (const f of ['focus', 'menu', 'module']) {
      expect(layerOf(`src/game/effort/${f}.ts`), f).toBe(2)
      const text = source(`src/game/effort/${f}.ts`)
      expect(text, f).not.toMatch(/from '\.\.\/household'/)
      expect(text, f).not.toMatch(/from '\.\.\/business/)
      expect(text, f).not.toMatch(/from '\.\.\/education'/)
    }
  })
})

// --------------------------------------------------------------------------------------------------------------------------------
describe('fatigue in the household', () => {
  const settle = (g: GameState): number => {
    yearlyHousehold(g)
    return householdView(g).fatigue
  }

  function pair(effective: 'lean' | 'steady' | 'push', over = 0): number {
    const g = adult()
    g.character.job = null
    g.flags.household = { owner: ownerOf(g), priority: 'balanced', fatigue: 20, training: 0, lastYear: 2020, effective: 'balanced', spent: 0 }
    const y = readYou(g)
    Object.assign(y, { posture: effective, effective, over })
    writeYou(g, y)
    return settle(g)
  }

  it('is 10 higher after a push year, 4 lower after a lean one, and 1.5 a week of overtime', () => {
    const steady = pair('steady')
    expect(pair('push') - steady).toBeCloseTo(POSTURE_STRAIN.push, 9)
    expect(pair('lean') - steady).toBeCloseTo(POSTURE_STRAIN.lean, 9)
    expect(pair('steady', 8) - steady).toBeCloseTo(8 * OVERTIME_STRAIN, 9)
  })

  it('carries the cost of a year of overtime through the real age-up, and clears the overtime after', () => {
    const start = (): GameState => {
      const g = makeTestGame(7, { age: 30, money: 50_000 })
      g.character.job = null
      g.flags.household = { owner: ownerOf(g), priority: 'balanced', fatigue: 20, training: 0, lastYear: 2020, effective: 'balanced', spent: 0 }
      return g
    }
    const worked = start()
    for (let i = 0; i < 15; i++) spendFocus(worked, 'study', 3)
    expect(readYou(worked).over).toBe(3)
    const rested = start()
    for (const g of [worked, rested]) {
      g.queue = []
      ageUp(g)
    }
    expect(householdView(worked).fatigue - householdView(rested).fatigue).toBeCloseTo(3 * OVERTIME_STRAIN, 9)
    // The week count is back to zero with the new year, and the overtime was paid once: the record carries nothing more.
    expect(focusUsed(worked)).toBe(0)
    expect(YOU_KEY in worked.flags).toBe(false)
    expect(effortStrain(worked)).toBe(0)
  })

  it('is what it was for a life that never touched the record', () => {
    const g = adult()
    g.character.job = null
    g.flags.household = { owner: ownerOf(g), priority: 'balanced', fatigue: 20, training: 0, lastYear: 2020, effective: 'balanced', spent: 0 }
    expect(effortStrain(g)).toBe(0)
    expect(settle(g)).toBe(Math.max(0, 20 * 0.78))
    expect(YOU_KEY in g.flags).toBe(false)
  })
})

// --------------------------------------------------------------------------------------------------------------------------------
describe('the posture rows', () => {
  const ids = ['effort.posture.lean', 'effort.posture.steady', 'effort.posture.push']

  it('are an info row and three actions from 18, and nothing before', () => {
    expect(postureNodes(adult(AGE_REVEAL - 1))).toEqual([])
    const nodes = postureNodes(adult(AGE_REVEAL))
    expect(nodes.map((n) => n.id)).toEqual(['effort.posture.info', ...ids])
    expect(nodes.map((n) => n.type)).toEqual(['info', 'action', 'action', 'action'])
  })

  it('end the Life Priorities menu, which shows them only to an adult', () => {
    const g = adult()
    const list = lifePrioritiesMenu.children(g)
    expect(list.slice(-4).map((n) => n.id)).toEqual(['effort.posture.info', ...ids])
    expect(list.slice(0, 6).map((n) => n.id)).toEqual(['priority.context', 'priority.balanced', 'priority.ambition', 'priority.learning', 'priority.family', 'priority.recovery'])
    const teen = adult(17)
    expect(lifePrioritiesMenu.children(teen).map((n) => n.id).filter((id) => id.startsWith('effort.'))).toEqual([])
  })

  it('say the ambition in a word, the pace and the weeks left', () => {
    const g = adult()
    const info = postureNodes(g)[0]!
    const text = info.type === 'info' && typeof info.text === 'string' ? info.text : ''
    expect(text).toContain(`Ambition: ${ambitionReveal(g).word}.`)
    expect(text).toContain('Pace: steady')
    expect(text).toContain('12 of 12')
    for (let i = 0; i < 5; i++) spendFocus(g, 'study', 3)
    const later = postureNodes(g)[0]!
    expect(later.type === 'info' && later.text).toContain('7 of 12')
  })

  it('pick a posture that takes effect at the next age-up, like the priorities', () => {
    const g = adult()
    const push = action(postureNodes(g), 'effort.posture.push', g)
    expect(push.disabledReason?.(g)).toBeNull()
    push.run(g)
    expect(readYou(g).posture).toBe('push')
    expect(postureOf(g)).toBe('steady')
    expect(g.queue.some((m) => m.kind === 'notice' && m.title === 'Work Pace Set')).toBe(true)
    const again = action(postureNodes(g), 'effort.posture.push', g)
    expect(again.disabledReason?.(g)).toBe('Your current pace.')
    expect(action(postureNodes(g), 'effort.posture.steady', g).disabledReason?.(g)).toBeNull()
    const info = postureNodes(g)[0]!
    expect(info.type === 'info' && info.text).toContain('Pace: steady (pushing from next year)')
  })

  it('label the current choice and use the labels the record uses', () => {
    const g = adult()
    expect(setPosture(g, 'lean')).toBe(true)
    const nodes = postureNodes(g)
    const labels = nodes.filter((n): n is MenuAction => n.type === 'action').map((n) => n.label)
    expect(labels).toEqual([`${POSTURE_LABELS.lean} (current)`, POSTURE_LABELS.steady, POSTURE_LABELS.push])
  })

  it('are pure to read: walking the whole menu changes nothing and draws nothing', () => {
    const g = adult()
    const before = JSON.stringify(g)
    const walk = (nodes: MenuNode[]): void => {
      for (const n of nodes) {
        if ('subtitle' in n && typeof n.subtitle === 'function') n.subtitle(g)
        if ('disabledReason' in n) n.disabledReason?.(g)
        if ('header' in n) n.header?.(g)
        if ('confirm' in n) n.confirm?.(g)
        if (n.type === 'info' && typeof n.text === 'function') n.text(g)
        if (n.type === 'menu') walk(n.children(g))
      }
    }
    walk([lifePrioritiesMenu])
    expect(JSON.stringify(g)).toBe(before)
    walk([lifePrioritiesMenu])
    const quiet = noRng(adult())
    expect(() => walk([lifePrioritiesMenu])).not.toThrow()
    expect(() => postureNodes(quiet)).not.toThrow()
  })
})

// --------------------------------------------------------------------------------------------------------------------------------
describe('the Profile row', () => {
  it('shows the ambition as a word at 18 and nothing at 17', async () => {
    const store = await import('../src/ui/store')
    const { ProfileSheet, ambitionRows } = await import('../src/ui/components/ProfileSheet')
    // The store life is a shell that the game under test replaces at once: a tuple, not a pinned seed (test/seed-pins.test.ts).
    const SHELL = [3, 2026] as const
    const render = (g: GameState): string => {
      store.startNewLife({ seed: SHELL[0], year: SHELL[1] })
      store.act((draft) => Object.assign(draft, structuredClone(g)))
      return renderToStaticMarkup(createElement(ProfileSheet, { onClose: () => {} }))
    }
    const young = makeTestGame(1, { age: 17 })
    expect(ambitionRows(young)).toEqual([])
    expect(render(young)).not.toContain('Ambition')
    const grown = makeTestGame(1, { age: 18 })
    expect(ambitionRows(grown)).toEqual([['Ambition', ambitionReveal(grown).word]])
    const html = render(grown)
    expect(html).toContain('Ambition')
    expect(html).toContain(ambitionReveal(grown).word)
    const keen = makeTestGame(1, { age: 18 })
    keen.character.hidden.willpower = 100
    keen.character.hidden.discipline = 100
    expect(ambitionRows(keen)).toEqual([['Ambition', 'Relentless']])
    const calm = makeTestGame(1, { age: 18 })
    calm.character.hidden.willpower = 0
    calm.character.hidden.discipline = 0
    expect(ambitionRows(calm)).toEqual([['Ambition', 'Easygoing']])
  })
})

// --------------------------------------------------------------------------------------------------------------------------------
describe('the new files', () => {
  it('say no dash, draw nothing and book nothing', () => {
    for (const f of ['focus', 'menu', 'module']) {
      const text = source(`src/game/effort/${f}.ts`)
      expect(DASH.test(text), f).toBe(false)
      expect(text, f).not.toMatch(/\brand\w*\(|\bchance\(|\bg\.rng\b|\bspend\(|\baddMoney\(|\bledger\b/)
    }
  })

  it('keep every line of copy within the voice caps', () => {
    for (const f of ['focus', 'menu', 'module']) {
      for (const m of source(`src/game/effort/${f}.ts`).matchAll(/(?:text|subtitle|label): ['"`]([^'"`\n]+)['"`]/g)) expect(m[1]!.length, `${f}: ${m[1]}`).toBeLessThanOrEqual(110)
    }
    expect(FOCUS_FULL_TEXT.length).toBeLessThanOrEqual(90)
  })
})
