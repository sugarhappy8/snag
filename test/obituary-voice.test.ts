// The dry obituary (events/obituary.ts): at most four lines of at most three fragments each. Line 1 is
// always name, age, cause and place; then the counters, the main talent and the job; then the
// survivors, the will and the estate; then one closer from the dry pool. No eulogy stock.
import { describe, expect, it } from 'vitest'
import { fullName } from '../src/game/core'
import { killCharacter } from '../src/game/death'
import { obituaryLines, writeObituary } from '../src/game/events/obituary'
import { changeWill } from '../src/game/events/will-act'
import { updateWl } from '../src/game/events/will-core'
import { createPerson } from '../src/game/people'
import type { GameState, Job, Prison } from '../src/game/types'
import { getCountry } from '../src/game/world'
import { BANNED_ANYWHERE, hasUncontractedNegative } from '../scripts/voice/rules.mjs'
import { makeTestGame } from './helpers'

// ---------------------------------------------------------------------------
// Helpers

/** Sentence ends: a full stop before white space or the end, except after a short title ("St. Petersburg"). */
const FRAGMENT_END = /(?<!\b(?:St|Mt|Ft|Mr|Mrs|Ms|Dr|Jr|Sr|Asst))\.(?=\s|$)/g
const fragments = (line: string): number => line.match(FRAGMENT_END)?.length ?? 0

const FLOWERS = ['call your mother', 'donate to a local animal shelter', 'never speak of the incident at the barbecue', 'plant a tree', 'finally return their casserole dish']
const NO_FAMILY = 'No family members could be reached for comment.'

/** The closers line 4 may use for this life. */
function isDryCloser(line: string, city: string): boolean {
  return (
    line === NO_FAMILY ||
    line === 'Rest in peace.' ||
    line === `A memorial service will be held in ${city}.` ||
    FLOWERS.some((f) => line === `In lieu of flowers, the family asks that you ${f}.`)
  )
}

/** A small deterministic stream that shapes each test life (separate from the game's own RNG). */
function stream(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

function job(title: string): Job {
  return { defId: 'test', title, company: 'Acme Corp', category: 'fulltime', salary: 50_000, level: 1, performance: 70, yearsInRole: 2, yearsAtCompany: 4, data: {} }
}

function prison(name: string): Prison {
  return { name, security: 'medium', crime: 'Burglary', sentenceYears: 8, yearsServed: 3, respect: 40, appealed: false, escapeAttempts: 0 }
}

const AGES = [0, 0, 2, 9, 15, 17, 19, 24, 29, 30, 34, 40, 47, 55, 62, 68, 74, 81, 88, 93, 101, 108]
const CAUSES = ['Old Age', 'Heart Attack', 'Drowning', 'Car Accident', 'Shanking', 'Execution', 'Surrender', 'Complications From HIV', 'Hepatitis B', 'Whacked by the Mob', 'Lost in Space', 'Illness', 'Plane Crash', 'Novel Coronavirus']
const PLACES: readonly [string, string][] = [['us', 'Chicago'], ['ru', 'St. Petersburg'], ['gb', 'Leeds'], ['br', 'São Paulo']]
const TITLES = ['Accountant', 'Sr. Accountant', 'Bus Driver', 'Chief Financial Officer', 'VP of Engineering', 'Resident DJ', 'Mayor']
const TALENTS: readonly string[][] = [[], [], ['Music'], ['Business', 'Art'], ['MainCharacter']]
const MONEY = [-50_000, -500, 0, 500, 3_200, 80_000, 2_500_000, 40_000_000]
const PRISONS = ['Blackrock Penitentiary', 'St. Quentin State Prison']

/** One of 200 varied lives, dead: any age, cause, place, family, will, counters, job and talent. */
function life(seed: number): GameState {
  const r = stream(seed)
  const one = <T>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]
  const age = one(AGES)
  const [countryId, city] = one(PLACES)
  const g = makeTestGame(seed, { age, countryId, city, gender: r() < 0.5 ? 'male' : 'female', talents: one(TALENTS), money: one(MONEY) })
  const c = g.character
  if (r() < 0.2) c.talent = 'Chess'
  // Family.
  if (age < 85 && r() < 0.7) {
    createPerson(g, { relation: 'parent', age: age + 28, gender: 'female' })
    if (r() < 0.6) createPerson(g, { relation: 'parent', age: age + 31, gender: 'male' })
  }
  if (age >= 18 && r() < 0.6) createPerson(g, { relation: 'spouse', age })
  const kids = age >= 20 ? Array.from({ length: Math.floor(r() * 4) }, () => createPerson(g, { relation: 'child', age: Math.max(1, age - 25) })) : []
  if (age >= 45 && kids.length) for (let i = Math.floor(r() * 4); i > 0; i--) createPerson(g, { relation: 'grandchild', age: 5 })
  if (r() < 0.3) createPerson(g, { relation: 'pet', age: 4, species: 'Cat' })
  // The will: an estranged child, an angry one, a gift to charity.
  if (kids.length && r() < 0.3) {
    updateWl(g, kids[0], (w) => {
      w.estr = true
      w.estrY = 2010
    })
  } else if (kids.length && r() < 0.3) {
    updateWl(g, kids[0], (w) => {
      w.cut = true
      w.known = true
      w.anger = 70
    })
  }
  const share = one([0, 0, 10, 20, 30, 50])
  if (age >= 18 && share > 0) changeWill(g, (_gg, w) => void (w.charity = share))
  // Counters, prison, work and school.
  g.counters = { marriages: one([0, 0, 1, 2, 4]), escapes: one([0, 0, 0, 1, 2]), lotteryWins: one([0, 0, 1, 3]), murders: one([0, 0, 0, 2]), prisonYears: one([0, 0, 0, 1, 12]) }
  if (age >= 16 && r() < 0.15) c.prison = prison(one(PRISONS))
  else if (age >= 18) {
    const work = r()
    if (work < 0.35) c.job = job(one(TITLES))
    else if (work < 0.6) {
      c.retired = true
      c.careerHistory.push({ title: one(TITLES), company: 'Acme Corp', startAge: 25, endAge: Math.min(age, 65), reason: 'retired', salary: 50_000 })
    }
  }
  if (age >= 22 && r() < 0.4) c.education.degrees.push({ kind: 'bachelor', name: "Bachelor's in History", school: 'Lakeside University', age: 22 })
  if (age >= 5 && age <= 21 && !c.prison && r() < 0.6) c.education.current = { level: age < 11 ? 'elementary' : age < 18 ? 'high' : 'university', school: 'Maple School', year: 1, totalYears: 4, grades: 60, data: {} }
  // Death.
  const cause = one(CAUSES)
  if (cause === 'Surrender') g.flags.surrendered = true
  killCharacter(g, cause)
  if (r() < 0.05) delete c.causeOfDeath
  g.queue = []
  return g
}

const LIVES = Array.from({ length: 200 }, (_, i) => i + 1)

// ---------------------------------------------------------------------------

describe('the obituary', () => {
  it('every obituary is at most four lines of at most three fragments', () => {
    let fullLine2 = 0
    let fullLine3 = 0
    let fourLines = 0
    for (const seed of LIVES) {
      const g = life(seed)
      const copy = structuredClone(g)
      const lines = obituaryLines(g)
      const why = `seed ${seed}: ${lines.join(' | ')}`
      expect(lines.length, why).toBeGreaterThanOrEqual(2)
      expect(lines.length, why).toBeLessThanOrEqual(4)
      for (const line of lines) {
        expect(line, why).toMatch(/\.$/)
        expect(fragments(line), why).toBeGreaterThanOrEqual(1)
        expect(fragments(line), why).toBeLessThanOrEqual(3)
        expect(line, why).not.toMatch(/undefined|NaN|null|\s\s|\s\./)
      }
      expect(isDryCloser(lines[lines.length - 1], g.character.city), why).toBe(true)
      // writeObituary is the same lines joined with a space (same RNG state, same picks).
      expect(writeObituary(copy)).toBe(lines.join(' '))
      if (lines.length === 4) {
        fourLines++
        if (fragments(lines[1]) === 3) fullLine2++
        if (fragments(lines[2]) === 3) fullLine3++
      }
    }
    // The lives are varied enough to reach the cap on both middle lines.
    expect(fourLines).toBeGreaterThan(20)
    expect(fullLine2).toBeGreaterThan(0)
    expect(fullLine3).toBeGreaterThan(0)
  })

  it('line 1 is name, age, cause and place', () => {
    for (const seed of LIVES) {
      const g = life(seed)
      const c = g.character
      const [first] = obituaryLines(g)
      const why = `seed ${seed}: ${first}`
      expect(first, why).toMatch(/^.+, \d+\. .+, .+\.$/)
      expect(first.startsWith(`${fullName(c)}, ${c.age}. `), why).toBe(true)
      expect(fragments(first), why).toBe(2)
      if (g.flags.surrendered === true) expect(first, why).toContain('. Surrendered, ')
      if (c.prison) expect(first.endsWith(`, ${c.prison.name}.`), why).toBe(true)
      else expect(first.endsWith(`, ${c.city}, ${getCountry(c.countryId).name}.`), why).toBe(true)
    }
    const dead = (age: number, cause: string, set?: (g: GameState) => void): string => {
      const g = makeTestGame(1, { age })
      set?.(g)
      killCharacter(g, cause)
      return obituaryLines(g)[0]
    }
    expect(dead(78, 'Heart Attack')).toBe('Test Player, 78. Heart attack, Chicago, United States.')
    expect(dead(0, 'Illness')).toBe('Test Player, 0. Illness, Chicago, United States.')
    expect(dead(33, 'Complications From HIV')).toBe('Test Player, 33. Complications from HIV, Chicago, United States.')
    expect(dead(52, 'Hepatitis B')).toBe('Test Player, 52. Hepatitis B, Chicago, United States.')
    expect(dead(40, 'Surrender', (g) => void (g.flags.surrendered = true))).toBe('Test Player, 40. Surrendered, Chicago, United States.')
    expect(dead(45, 'Shanking', (g) => void (g.character.prison = prison('Blackrock Penitentiary')))).toBe('Test Player, 45. Shanking, Blackrock Penitentiary.')
  })

  it('contains none of the eulogy stock', () => {
    const eulogy = BANNED_ANYWHERE.slice(BANNED_ANYWHERE.indexOf('remarkable years'))
    expect(eulogy).toEqual(['remarkable years', 'taken far too soon', 'well-earned retirement', 'ripe old age', 'dearly missed', 'lived it his own way', 'lived it her own way', 'lived it their own way'])
    // Also gone: the happy-life closer and the pet joke.
    const gone = [...eulogy, 'a happy life', 'as well as can be expected']
    for (const seed of LIVES) {
      const text = writeObituary(life(seed))
      for (const phrase of gone) expect(text, `seed ${seed}: ${text}`).not.toContain(phrase)
    }
  })

  it('counters become fragments', () => {
    // Counters come first and fill the line: the talent and the job wait.
    const g = makeTestGame(3, { age: 70, talents: ['Music'] })
    g.character.job = job('Bus Driver')
    g.counters = { marriages: 4, escapes: 2, lotteryWins: 1 }
    killCharacter(g, 'Old Age')
    expect(obituaryLines(g)[1]).toBe('Four marriages. Two prison escapes. One lottery win.')
    // Two counters leave room for the talent.
    const h = makeTestGame(4, { age: 50, talents: ['Music'] })
    h.counters = { murders: 2, prisonYears: 12 }
    killCharacter(h, 'Bar Fight')
    expect(obituaryLines(h)[1]).toBe('A person of interest in 2 cases. Twelve years behind bars. Gifted at music.')
    // Singular forms; one marriage is not worth a line.
    const k = makeTestGame(5, { age: 50 })
    k.counters = { marriages: 1, escapes: 1, lotteryWins: 2 }
    killCharacter(k, 'Plane Crash')
    expect(obituaryLines(k)[1]).toBe('One prison escape. Two lottery wins.')
    // With nothing to count, the talent and the job make the line.
    const r = makeTestGame(6, { age: 70, talents: ['Business'] })
    r.character.retired = true
    r.character.careerHistory.push({ title: 'Sr. Bus Driver', company: 'City Transit', startAge: 30, endAge: 65, reason: 'retired', salary: 40_000 })
    killCharacter(r, 'Old Age')
    expect(obituaryLines(r)[1]).toBe('Gifted at business. Retired senior bus driver.')
  })

  it('a will rift, a charity share and the talent label still appear when present', () => {
    const g = makeTestGame(6, { age: 80, gender: 'female', talents: ['MainCharacter'] })
    createPerson(g, { relation: 'spouse', age: 79, gender: 'male', firstName: 'Tom' })
    const max = createPerson(g, { relation: 'child', age: 50, gender: 'male', firstName: 'Max' })
    updateWl(g, max, (w) => {
      w.estr = true
      w.estrY = 2010
    })
    changeWill(g, (_gg, w) => void (w.charity = 30))
    g.queue = []
    killCharacter(g, 'Old Age')
    const lines = obituaryLines(g)
    expect(lines[1]).toBe('Gifted at main character syndrome.')
    expect(lines[2]).toBe("Survived by Tom and her son, Max. Hadn't spoken to Max since a fight over the will. Left 30% of the estate to charity.")
    // A child the survivors line did not name is named in the rift. (No talent or job: line 2 is left out.)
    const h = makeTestGame(7, { age: 70, gender: 'male', money: 3_200 })
    const kids = ['Ana', 'Ben'].map((firstName, i) => createPerson(h, { relation: 'child', age: 40 + i, gender: i ? 'male' : 'female', firstName }))
    updateWl(h, kids[0], (w) => void (w.estr = true))
    killCharacter(h, 'Stroke')
    expect(obituaryLines(h)[1]).toBe("Survived by two children. Hadn't spoken to his daughter, Ana, since a fight over the will. Left $3,200.")
    // Below 20% the share is not news, and the estate is the whole line.
    const s = makeTestGame(8, { age: 70, money: -5_000 })
    changeWill(s, (_gg, w) => void (w.charity = 10))
    s.queue = []
    killCharacter(s, 'Stroke')
    expect(obituaryLines(s)[1]).toBe('Died $5,000 in debt.')
    for (const t of [g, h, s]) expect(hasUncontractedNegative(writeObituary(t))).toBe(false)
  })

  it('a life with no family and age 30 or over can close with No family members could be reached for comment.', () => {
    const closers = (age: number, family: boolean): Set<string> => {
      const seen = new Set<string>()
      for (let seed = 1; seed <= 60; seed++) {
        const g = makeTestGame(seed, { age })
        if (family) createPerson(g, { relation: 'spouse', age, firstName: 'Maria' })
        createPerson(g, { relation: 'pet', age: 3, species: 'Dog', firstName: 'Rex' })
        killCharacter(g, 'Heart Attack')
        const lines = obituaryLines(g)
        seen.add(lines[lines.length - 1])
      }
      return seen
    }
    expect(closers(40, false)).toContain(NO_FAMILY)
    // Not when someone survives (a pet does not count), and not before 30.
    expect(closers(40, true)).not.toContain(NO_FAMILY)
    expect(closers(25, false)).not.toContain(NO_FAMILY)
  })
})
