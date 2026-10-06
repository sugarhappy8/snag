import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { counter, currentLogYear } from '../src/game/core'
import {
  EVENT_HISTORY_FLAG,
  EVENT_LIBRARY,
  eventEligible,
  fallbackChoiceOutcome,
  fallbackCustomAction,
  fallbackObituary,
  queueFallbackYearEvents,
} from '../src/game/events'
import { CUSTOM_RULE_IDS } from '../src/game/events/custom'
import { eraStrip } from '../src/game/events/era'
import { FLAVOR_POOLS } from '../src/game/events/flavor'
import { EVENT_SCRIPT, present } from '../src/game/events/helpers'
import { createPerson } from '../src/game/people'
import { prisonLife } from '../src/game/prison'
import { runScript } from '../src/game/scripts'
import type { ChoiceModal, GameState, Json, NoticeModal, SchoolLevel } from '../src/game/types'
import { makeTestGame } from './helpers'

// ---------------------------------------------------------------------------
// Fixtures

interface Opts {
  age: number
  seed?: number
  prison?: boolean
  family?: boolean
  money?: number
  retired?: boolean
  gender?: 'male' | 'female'
  /** Alternate situation: single with an ex, no pets, licensed driver, a teenage kid, a younger sibling... */
  alt?: boolean
}

function schoolFor(age: number): { level: SchoolLevel; school: string } | null {
  if (age >= 5 && age <= 10) return { level: 'elementary', school: 'Maple Elementary' }
  if (age >= 11 && age <= 13) return { level: 'middle', school: 'Oak Middle School' }
  if (age >= 14 && age <= 17) return { level: 'high', school: 'Central High' }
  if (age >= 18 && age <= 21) return { level: 'university', school: 'State University' }
  return null
}

/** A lived-in life: family of every kind, school or job by age, car and house. */
function richGame(o: Opts): GameState {
  const g = makeTestGame(o.seed ?? 7, { age: o.age, money: o.money ?? 25_000, gender: o.gender ?? 'male' })
  const c = g.character
  const age = o.age
  const fam = o.family !== false
  if (fam) {
    if (age < 75) {
      createPerson(g, { relation: 'parent', age: age + 28, gender: 'female', firstName: 'Linda', livesWithPlayer: age < 18 })
      createPerson(g, { relation: 'parent', age: age + 30, gender: 'male', firstName: 'Brian', livesWithPlayer: age < 18 })
    }
    if (age < 30) createPerson(g, { relation: 'grandparent', age: age + 60, gender: 'female', firstName: 'Edna' })
    createPerson(g, { relation: 'sibling', age: Math.max(1, age + 2), gender: 'female', firstName: 'Sophie', livesWithPlayer: age < 18 })
    createPerson(g, { relation: 'friend', age: Math.max(4, age), firstName: 'Marcus' })
    createPerson(g, { relation: 'bestFriend', age: Math.max(4, age), firstName: 'Priya' })
    createPerson(g, { relation: 'enemy', age: Math.max(4, age), firstName: 'Chad' })
    createPerson(g, { relation: 'pet', age: 3, species: 'Dog', firstName: 'Rex', livesWithPlayer: true })
    if (age >= 16) createPerson(g, { relation: age >= 25 ? 'spouse' : 'partner', age, gender: 'female', firstName: 'Maria', livesWithPlayer: age >= 25, relationship: 70 })
    if (age >= 22) createPerson(g, { relation: 'child', age: Math.min(age - 20, 8), firstName: 'Tommy', gender: 'male', livesWithPlayer: true })
    if (age >= 38) createPerson(g, { relation: 'child', age: age - 22, firstName: 'Emma', gender: 'female' })
    if (age >= 45) createPerson(g, { relation: 'grandchild', age: Math.min(age - 44, 20), firstName: 'Lily', gender: 'female' })
    if (age >= 60) createPerson(g, { relation: 'grandchild', age: 17, firstName: 'Noah', gender: 'male' })
  }
  const school = schoolFor(age)
  if (school && !o.prison) c.education.current = { ...school, year: 1, totalYears: 4, grades: 60, data: {} }
  if (age >= 22) c.education.degrees.push({ kind: 'highschool', name: 'High School Diploma', school: 'Central High', age: 18 })
  if (age >= 18 && age < 65 && !school && !o.prison) {
    c.job = { defId: 'accountant', title: 'Accountant', company: 'Acme Corp', category: 'fulltime', salary: 55_000, level: 1, performance: 75, yearsInRole: 2, yearsAtCompany: 3, data: {} }
    const boss = createPerson(g, { relation: 'boss', age: 50, firstName: 'Gloria', contextId: 'Acme Corp' })
    c.job.bossId = boss.id
    createPerson(g, { relation: 'coworker', age: 33, firstName: 'Dwight', contextId: 'Acme Corp' })
  }
  if (age >= 14 && age < 18 && !o.prison) {
    c.partTimeJob = { defId: 'cashier', title: 'Cashier', company: 'Burger Barn', category: 'parttime', salary: 9_000, level: 0, performance: 60, yearsInRole: 1, yearsAtCompany: 1, data: {} }
  }
  if (o.retired || (age >= 65 && !o.prison)) {
    c.retired = true
    c.pension = 20_000
  }
  if (age >= 18) {
    g.assets.push({ id: 'car1', kind: 'car', name: '2015 Honda Civic', emoji: '🚗', purchasePrice: 15_000, value: 9_000, condition: 70, purchasedAge: age - 2, upkeep: 800, details: {} })
  }
  if (age >= 30) {
    g.assets.push({ id: 'house1', kind: 'house', name: '12 Elm Street', emoji: '🏠', purchasePrice: 250_000, value: 300_000, condition: 80, purchasedAge: age - 5, upkeep: 4_000, details: {} })
    c.residence = { status: 'owned', assetId: 'house1' }
  } else if (age >= 18 && age < 30) {
    c.residence = { status: 'renting', rent: 12_000 }
  }
  if (o.prison) {
    c.prison = { name: 'Blackrock Penitentiary', security: 'medium', crime: 'Burglary', sentenceYears: 8, yearsServed: 1, respect: 40, appealed: false, escapeAttempts: 0 }
    c.residence = { status: 'prison', description: 'Blackrock Penitentiary' }
    c.job = null
    c.partTimeJob = null
    prisonLife(g)
    createPerson(g, { relation: 'cellmate', age: Math.max(14, age + 3), gender: c.gender, firstName: 'Knuckles', contextId: 'Blackrock Penitentiary' })
  }
  if (o.alt) {
    c.gender = 'female'
    g.people = g.people.filter((p) => p.relation !== 'pet' && p.relation !== 'partner' && p.relation !== 'spouse')
    createPerson(g, { relation: 'ex', age: Math.max(14, age), gender: 'male', firstName: 'Kevin', relationship: 30 })
    if (age >= 16) c.licenses.push('driver')
    if (age >= 19) c.education.completed.push('elementary', 'middle', 'high')
    if (age >= 7) createPerson(g, { relation: 'sibling', age: Math.max(5, age - 3), gender: 'male', firstName: 'Leo', livesWithPlayer: age < 18 })
    if (age >= 28) createPerson(g, { relation: 'child', age: 15, gender: 'male', firstName: 'Jake', livesWithPlayer: true })
    if (age >= 40) createPerson(g, { relation: 'partner', age, gender: 'male', firstName: 'Sam', relationship: 65 })
    c.partTimeJob = null
    const marcus = g.people.find((p) => p.firstName === 'Marcus')
    if (marcus) marcus.relationship = 25
    if (age < 20) {
      c.residence = { status: 'parents' }
      g.assets = []
    }
  }
  currentLogYear(g)
  return g
}

/** Resolve every event popup in the queue (follow-ups included), picking choices with `pickChoice`. */
function drainEvents(g: GameState, pickChoice: (m: ChoiceModal) => string, seen: string[] = []): string[] {
  for (let guard = 0; g.queue.length > 0; guard++) {
    if (guard > 50) throw new Error(`queue never drains: ${JSON.stringify(g.queue[0]).slice(0, 200)}`)
    const m = g.queue.shift()!
    if (m.kind !== 'choice' || m.scriptId !== EVENT_SCRIPT) continue
    expect(m.choices.length, `${m.title} has choices`).toBeGreaterThanOrEqual(1)
    const id = pickChoice(m)
    seen.push(`${(m.data as { eventId?: string } | undefined)?.eventId}:${id}`)
    const before = g.queue.length
    runScript(g, EVENT_SCRIPT, id, m.data, m)
    // Follow-ups queued by the handler are shown next (the store moves them to the front).
    const added = g.queue.splice(before)
    g.queue.unshift(...added)
  }
  return seen
}

function notices(g: GameState): NoticeModal[] {
  return g.queue.filter((m): m is NoticeModal => m.kind === 'notice')
}

function allLogText(g: GameState): string[] {
  return g.log.flatMap((y) => y.entries.map((e) => e.text))
}

let errorSpy: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  errorSpy.mockRestore()
})

// ---------------------------------------------------------------------------

describe('event library', () => {
  it('has a big library with unique, namespaced ids', () => {
    expect(EVENT_LIBRARY.length).toBeGreaterThanOrEqual(120)
    const ids = EVENT_LIBRARY.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const ev of EVENT_LIBRARY) {
      expect(ev.id).toMatch(/^[a-z]+\.[A-Za-z0-9]+$/)
      expect(ev.minAge).toBeLessThanOrEqual(ev.maxAge)
      expect(Object.keys(ev.resolve).length).toBeGreaterThanOrEqual(2)
    }
  })

  it('covers every stage of life and prison', () => {
    const fits = (age: number, prison = false) => EVENT_LIBRARY.filter((e) => e.minAge <= age && e.maxAge >= age && (e.where ?? 'free') === (prison ? 'prison' : 'free')).length
    expect(fits(1)).toBeGreaterThanOrEqual(8)
    expect(fits(4)).toBeGreaterThanOrEqual(12)
    expect(fits(9)).toBeGreaterThanOrEqual(25)
    expect(fits(15)).toBeGreaterThanOrEqual(30)
    expect(fits(35)).toBeGreaterThanOrEqual(50)
    expect(fits(75)).toBeGreaterThanOrEqual(30)
    expect(fits(30, true)).toBeGreaterThanOrEqual(15)
    expect(fits(15, true)).toBeGreaterThanOrEqual(10)
  })

  it('every event can be presented and every choice resolves without throwing', () => {
    const uncovered: string[] = []
    for (const ev of EVENT_LIBRARY) {
      const ages = [...new Set([Math.min(ev.maxAge, Math.max(ev.minAge, 30)), ev.minAge, Math.min(ev.maxAge, ev.minAge + 3), Math.min(ev.maxAge, 70), ev.maxAge])].filter((a) => a <= 110)
      let presented = false
      for (const age of ages) {
        for (const [seed, alt] of [[3, false], [11, true], [29, false], [41, true]] as const) {
          const base = richGame({ age, seed, alt, prison: ev.where === 'prison' })
          if (!eventEligible(base, ev)) continue
          const setup = ev.setup(base)
          if (!setup) continue
          expect(setup.choices.length, ev.id).toBeGreaterThanOrEqual(2)
          expect(setup.choices.length, ev.id).toBeLessThanOrEqual(5)
          expect(setup.text, ev.id).not.toMatch(/undefined|NaN|\[object/)
          present(base, ev, setup)
          const modal = base.queue[base.queue.length - 1] as ChoiceModal
          for (const choice of modal.choices) {
            expect(ev.resolve[choice.id], `${ev.id} handles ${choice.id}`).toBeTypeOf('function')
            const g = structuredClone(base)
            g.queue = []
            runScript(g, EVENT_SCRIPT, choice.id, modal.data, modal)
            // Pick each follow-up option in turn across choices.
            let k = 0
            drainEvents(g, (m) => m.choices[k++ % m.choices.length].id)
            const texts = [...notices(g).map((n) => n.text), ...allLogText(g)]
            for (const t of texts) expect(t, `${ev.id}/${choice.id}`).not.toMatch(/undefined|NaN|\[object|\{\w+\}/)
            expect(Number.isFinite(g.character.money), ev.id).toBe(true)
            expect(() => JSON.stringify(g)).not.toThrow()
          }
          presented = true
          break
        }
        if (presented) break
      }
      if (!presented) uncovered.push(ev.id)
    }
    expect(errorSpy).not.toHaveBeenCalled()
    expect(uncovered).toEqual([])
  })
})

describe('queueFallbackYearEvents', () => {
  const situations: [string, Opts][] = [
    ['baby', { age: 1 }],
    ['toddler', { age: 3 }],
    ['kid', { age: 8 }],
    ['teen', { age: 15 }],
    ['student', { age: 19 }],
    ['worker', { age: 35 }],
    ['orphan adult', { age: 40, family: false, money: 0 }],
    ['retiree', { age: 70 }],
    ['very old', { age: 98 }],
    ['prisoner', { age: 30, prison: true }],
    ['juvie', { age: 15, prison: true }],
  ]
  for (const [name, o] of situations) {
    it(`queues valid, resolvable events for a ${name}`, () => {
      let events = 0
      for (let seed = 1; seed <= 40; seed++) {
        const g = richGame({ ...o, seed })
        const logBefore = allLogText(g).length
        queueFallbackYearEvents(g)
        expect(allLogText(g).length).toBeGreaterThan(logBefore)
        expect(g.queue.length).toBeLessThanOrEqual(1)
        for (const m of g.queue) {
          expect(m.kind).toBe('choice')
          const cm = m as ChoiceModal
          expect(cm.scriptId).toBe(EVENT_SCRIPT)
          expect(cm.choices.length).toBeGreaterThanOrEqual(2)
          expect(cm.choices.length).toBeLessThanOrEqual(5)
          const ev = EVENT_LIBRARY.find((e) => e.id === (cm.data as { eventId: string }).eventId)!
          expect(ev).toBeTruthy()
          if (o.prison) expect(ev.where).toBe('prison')
          else expect(ev.where ?? 'free').not.toBe('prison')
          expect(g.character.age).toBeGreaterThanOrEqual(ev.minAge)
          expect(g.character.age).toBeLessThanOrEqual(ev.maxAge)
          events++
        }
        drainEvents(g, (m) => m.choices[seed % m.choices.length].id)
        for (const t of allLogText(g)) expect(t).not.toMatch(/undefined|NaN|\{\w+\}/)
      }
      // 60-75% of years bring an event.
      expect(events).toBeGreaterThanOrEqual(15)
      expect(events).toBeLessThanOrEqual(38)
      expect(errorSpy).not.toHaveBeenCalled()
    })
  }

  it('never repeats an event within its cooldown over a whole life', () => {
    for (const seed of [5, 17, 99]) {
      const g = richGame({ age: 1, seed })
      const fired: Record<string, number[]> = {}
      for (let age = 1; age <= 90 && g.character.alive; age++) {
        g.character.age = age
        currentLogYear(g)
        queueFallbackYearEvents(g)
        const head = g.queue.find((m) => m.kind === 'choice') as ChoiceModal | undefined
        if (head) {
          const id = (head.data as { eventId: string }).eventId
          ;(fired[id] ??= []).push(age)
        }
        // The last option is usually the cautious one, so the life lasts long enough to test.
        drainEvents(g, (m) => m.choices[m.choices.length - 1].id)
        g.queue = []
        g.character.stats.health = 90
      }
      for (const [id, ages] of Object.entries(fired)) {
        const ev = EVENT_LIBRARY.find((e) => e.id === id)!
        if (ev.once) expect(ages.length, id).toBe(1)
        for (let i = 1; i < ages.length; i++) expect(ages[i] - ages[i - 1], id).toBeGreaterThanOrEqual(ev.cooldown ?? 10)
      }
      expect(Object.keys(fired).length).toBeGreaterThan(25)
      const hist = g.flags[EVENT_HISTORY_FLAG] as Record<string, Json>
      expect(Object.keys(hist).length).toBe(Object.keys(fired).length)
    }
  })

  it('logs toddler milestones like a first word', () => {
    const g = richGame({ age: 1, seed: 4 })
    for (let age = 1; age <= 4; age++) {
      g.character.age = age
      currentLogYear(g)
      queueFallbackYearEvents(g)
      g.queue = []
    }
    const text = allLogText(g).join('\n')
    expect(text).toMatch(/I said my first word: '.+'\./)
    expect(text).toMatch(/I took my first steps\./)
  })

  it('does nothing for the dead', () => {
    const g = richGame({ age: 40 })
    g.character.alive = false
    queueFallbackYearEvents(g)
    expect(g.queue).toEqual([])
  })

  it('flavor pools are large and use only known tokens', () => {
    const known = new Set(['mom', 'dad', 'sib', 'sibRel', 'friend', 'partner', 'pet', 'petSpecies', 'kid', 'kidRel', 'adultKid', 'adultKidRel', 'grandkid', 'cellmate', 'school', 'company', 'city', 'country', 'food', 'show', 'hobby', 'radioShow', 'kidPrize', 'movieKind'])
    let total = 0
    for (const [key, lines] of Object.entries(FLAVOR_POOLS)) {
      expect(lines.length, key).toBeGreaterThanOrEqual(4)
      total += lines.length
      for (const tagged of lines) {
        // Era tags ("@tv ...") pick the years a line fits; the text after the tag is what shows.
        const line = eraStrip(tagged)
        expect(line).toMatch(/^[A-Z{]/)
        for (const m of line.matchAll(/\{(\w+)\}/g)) expect(known.has(m[1]), `${key}: ${m[1]}`).toBe(true)
      }
    }
    expect(total).toBeGreaterThanOrEqual(250)
  })
})

describe('fallbackChoiceOutcome', () => {
  function aiModal(g: GameState, labels: string[], personId?: string): ChoiceModal {
    return {
      kind: 'choice',
      id: 'ai1',
      title: 'Neighborhood Drama',
      emoji: '🏘️',
      text: 'Something happened.',
      choices: labels.map((label, i) => ({ id: `c${i}`, label })),
      source: 'ai',
      data: { age: g.character.age },
      personId,
    }
  }

  it('resolves kind, aggressive, avoidant, quoted and odd labels with a notice and a log line', () => {
    const labels = ['Help them carry the groceries', 'Punch him in the nose', 'Walk away', 'Yes!', "I'll pass", 'Steal the cash register', 'Ask her out', 'Study all night', 'Buy everyone pizza', 'Dare them to jump', 'Celebrate', 'Hmm', '']
    for (const [i, label] of labels.entries()) {
      const g = richGame({ age: 30, seed: 100 + i })
      const friend = g.people.find((p) => p.firstName === 'Marcus')!
      const logBefore = allLogText(g).length
      fallbackChoiceOutcome(g, aiModal(g, labels, friend.id), `c${i}`)
      const n = notices(g)
      expect(n.length, label).toBeGreaterThanOrEqual(1)
      expect(n[0].text, label).not.toMatch(/undefined|NaN/)
      expect(n[0].title.length).toBeGreaterThan(0)
      expect(allLogText(g).length, label).toBe(logBefore + 1)
    }
  })

  it('kind choices improve the relationship with the involved person', () => {
    let up = 0
    for (let seed = 1; seed <= 10; seed++) {
      const g = richGame({ age: 30, seed })
      const friend = g.people.find((p) => p.firstName === 'Marcus')!
      const before = friend.relationship
      fallbackChoiceOutcome(g, aiModal(g, ['Comfort them'], friend.id), 'c0')
      if (friend.relationship > before) up++
    }
    expect(up).toBeGreaterThanOrEqual(6)
  })

  it('handles a missing choice id and dead characters', () => {
    const g = richGame({ age: 30 })
    fallbackChoiceOutcome(g, aiModal(g, ['Go along with it']), 'nope')
    expect(notices(g).length).toBe(1)
    const dead = richGame({ age: 30 })
    dead.character.alive = false
    fallbackChoiceOutcome(dead, aiModal(dead, ['Go']), 'c0')
    expect(dead.queue).toEqual([])
  })
})

describe('fallbackCustomAction', () => {
  it('counts customActions and always reports something', () => {
    const g = richGame({ age: 30 })
    fallbackCustomAction(g, 'juggle flaming torches on a unicycle')
    expect(counter(g, 'customActions')).toBe(1)
    expect(notices(g).length).toBe(1)
    expect(notices(g)[0].text).toMatch(/juggle flaming torches/)
  })

  it('exercise improves health', () => {
    const g = richGame({ age: 30 })
    g.character.stats.health = 50
    fallbackCustomAction(g, 'Go for a long run')
    expect(g.character.stats.health).toBeGreaterThanOrEqual(46)
    expect(notices(g)[0].text.toLowerCase()).toMatch(/run|muscle/)
  })

  it('studying raises smarts and the studied counter', () => {
    const g = richGame({ age: 16 })
    const before = g.character.stats.smarts
    fallbackCustomAction(g, 'study for my chemistry exam')
    expect(g.character.stats.smarts).toBeGreaterThan(before)
    expect(counter(g, 'studied')).toBe(1)
  })

  it('stealing is a crime', () => {
    const g = richGame({ age: 25 })
    fallbackCustomAction(g, 'steal a candy bar')
    expect(counter(g, 'crimes')).toBe(1)
  })

  it('travel costs money for adults and is a vacation', () => {
    const g = richGame({ age: 30, money: 50_000 })
    fallbackCustomAction(g, 'travel to Paris')
    expect(g.character.money).toBeLessThan(50_000)
    expect(counter(g, 'vacations')).toBe(1)
  })

  it('travel never spends money you do not have', () => {
    const g = richGame({ age: 30, money: 10 })
    fallbackCustomAction(g, 'take a vacation')
    expect(g.character.money).toBe(10)
  })

  it('quitting ends the job', () => {
    const g = richGame({ age: 30 })
    expect(g.character.job).not.toBeNull()
    fallbackCustomAction(g, 'quit my job')
    expect(g.character.job).toBeNull()
    expect(g.character.careerHistory.at(-1)?.reason).toBe('quit')
  })

  it('proposing to a partner either gets engaged or hurts the relationship', () => {
    const g = richGame({ age: 22 })
    const p = g.people.find((x) => x.relation === 'partner')!
    const before = p.relationship
    fallbackCustomAction(g, 'propose to my girlfriend')
    expect(p.relation === 'fiance' || p.relationship < before).toBe(true)
  })

  it('babies cannot do grown-up things', () => {
    const g = richGame({ age: 1 })
    fallbackCustomAction(g, 'buy a sports car')
    expect(notices(g)[0].text).toMatch(/baby/)
    expect(g.character.money).toBe(25_000)
  })

  it('prisoners cannot go shopping but can work out', () => {
    const g = richGame({ age: 30, prison: true })
    fallbackCustomAction(g, 'go shopping at the mall')
    expect(notices(g)[0].text).toMatch(/prison/)
    g.queue = []
    fallbackCustomAction(g, 'do push-ups')
    expect(notices(g)[0].title).not.toBe('Behind bars')
  })

  it('handles sensitive and ambiguous text sensibly', () => {
    const g = richGame({ age: 30 })
    fallbackCustomAction(g, 'kill myself')
    expect(notices(g)[0].text).toMatch(/crisis line|someone you trust/)
    g.queue = []
    fallbackCustomAction(g, 'kill time at the mall')
    expect(notices(g)[0].text).not.toMatch(/omelet|plotted|menacing/)
    g.queue = []
    fallbackCustomAction(g, 'drink a glass of water')
    expect(notices(g)[0].text).not.toMatch(/hangover|drinks/i)
  })

  it('a named family member is affected', () => {
    const g = richGame({ age: 30 })
    const mom = g.people.find((p) => p.firstName === 'Linda')!
    const before = mom.relationship
    fallbackCustomAction(g, 'call my mom')
    expect(mom.relationship).toBeGreaterThan(before)
  })

  it('handles many keywords without crashing', () => {
    const texts = ['party all night', 'get drunk', 'smoke weed', 'fight a stranger', 'go to the casino', 'donate to charity', 'adopt a puppy', 'walk my dog', 'go on a date', 'cook dinner', 'sing karaoke', 'paint a portrait', 'get a haircut', 'eat a whole pizza', 'eat a salad', 'take a nap', 'play video games', 'post a selfie', 'clean my room', 'meditate', 'pray at church', 'ask my boss for a raise', 'work overtime', 'skip school', 'lie to my parents', 'run away', 'prank my sister', 'break up with my girlfriend', 'rob a bank', 'escape', 'murder my enemy', '', '!!!']
    for (const [i, t] of texts.entries()) {
      for (const age of [6, 15, 30, 70]) {
        const g = richGame({ age, seed: i + age })
        fallbackCustomAction(g, t)
        const n = notices(g)
        expect(n.length, `${t} @${age}`).toBeGreaterThanOrEqual(1)
        for (const m of n) expect(m.text, `${t} @${age}`).not.toMatch(/undefined|NaN/)
        expect(g.character.money, t).toBeGreaterThanOrEqual(0)
      }
    }
    expect(CUSTOM_RULE_IDS.length).toBeGreaterThanOrEqual(30)
  })
})

describe('fallbackObituary', () => {
  it('mentions the name, age and cause', () => {
    const g = richGame({ age: 78 })
    g.character.alive = false
    g.character.causeOfDeath = 'Heart Attack'
    g.flags.finalOccupation = 'Retired'
    const text = fallbackObituary(g)
    expect(text).toContain('Test Player')
    expect(text).toContain('78')
    expect(text).toContain('heart attack')
    expect(text).not.toMatch(/undefined|NaN/)
    expect(text.split('. ').length).toBeGreaterThanOrEqual(3)
  })

  it('varies with the life lived', () => {
    const kid = richGame({ age: 9, family: true })
    kid.character.causeOfDeath = 'Drowning'
    const crook = richGame({ age: 45, prison: true, family: false })
    crook.character.causeOfDeath = 'Shanking'
    crook.counters = { prisonYears: 12, crimes: 9, convictions: 2 }
    crook.flags.finalOccupation = 'Prisoner'
    const rich = richGame({ age: 60, money: 5_000_000 })
    rich.character.causeOfDeath = 'Cancer'
    rich.flags.finalOccupation = 'Accountant'
    const a = fallbackObituary(kid)
    const b = fallbackObituary(crook)
    const c = fallbackObituary(rich)
    expect(a).toMatch(/too soon|whole life/)
    expect(b).toMatch(/behind bars|serving time|Inmate/)
    expect(c).toMatch(/\$5\.\dM|fortune|estate/)
    expect(c).toMatch(/Maria/)
    for (const t of [a, b, c]) expect(t).not.toMatch(/undefined|NaN/)
  })
})

describe('content rules', () => {
  it('never uses the original brand names', () => {
    const dir = join(__dirname, '../src/game/events')
    const files = [join(__dirname, '../src/game/events.ts'), ...readdirSync(dir).map((f) => join(dir, f))]
    for (const f of files) {
      const src = readFileSync(f, 'utf8')
      expect(src, f).not.toMatch(/bitlife|candywriter|bitizen|god mode/i)
    }
  })
})
