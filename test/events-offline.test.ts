// The event library stays local and doesn't repeat itself:
// - related events (EVENT_KINDS) share a cooldown, and the same person doesn't star in the same
//   kind of event again within five years;
// - scenes that only make sense in the US (prom, the SATs, a lemonade stand, Thanksgiving, a snow
//   day in the tropics) are kept out of other countries unless the country's locale says they fit.
import { describe, expect, it } from 'vitest'
import { ageUp } from '../src/game/aging'
import { currentLogYear } from '../src/game/core'
import { localeOf } from '../src/game/data/locales'
import { EVENT_LIBRARY, eventKind, foreignToLocale, queueFallbackYearEvents, queueRandomEvent } from '../src/game/events'
import { EVENT_SCRIPT } from '../src/game/events/helpers'
import { createNewLife } from '../src/game/life'
import { applyFallback } from '../src/game/offline'
import { createPerson } from '../src/game/people'
import { runScript } from '../src/game/scripts'
import type { ChoiceModal, GameState, ModalItem, Person } from '../src/game/types'

const COUNTRIES = ['us', 'id', 'et', 'jp', 'br', 'in', 'ng', 'de', 'sa', 'mx'] as const
/** Things only an American life should ever see. */
const AMERICANISMS = [/Las Vegas/, /Northgate/, /Meadowbrook/, /\bSATs?\b/, /\bDMV\b/, /(?<![\d$.,])\b911\b(?![\d,])/, /Thanksgiving/, /Fourth of July/, /Super Bowl/, /lemonade stand/]

/** The Americanisms a country must never see (Mexico dials 911, Canada has Thanksgiving...). */
function americanismsFor(id: string): RegExp[] {
  if (id === 'us') return []
  const loc = localeOf(id)
  const all = [loc.terms.finalExam, loc.terms.licenseOffice, loc.terms.emergencyNumber, ...loc.holidays, ...loc.getaways, ...loc.sports].join(' | ')
  return AMERICANISMS.filter((re) => !re.test(all))
}

function life(countryId: string, seed = 11): GameState {
  return createNewLife({ seed, year: 2026, countryId })
}

/** A life of the given age with the popups answered offline. */
function grown(countryId: string, age: number, seed = 11): GameState {
  const g = life(countryId, seed)
  drainOffline(g)
  while (g.character.alive && g.character.age < age) {
    ageUp(g)
    drainOffline(g)
  }
  return g
}

function minigameResult(m: Extract<ModalItem, { kind: 'minigame' }>): string {
  if (m.game === 'annualReport') return 'skip'
  if (m.game === 'burglary') return JSON.stringify({ loot: 0, caught: false })
  if (m.game === 'prisonEscape') return 'caught'
  if (m.game === 'pickpocket') return 'fail'
  if (m.game === 'blackjack') return 'push'
  return 'done'
}

/** Resolve one popup the way the store does (offline). */
function resolveOne(g: GameState, m: ModalItem): void {
  if (m.kind === 'choice') {
    const choice = m.choices[m.choices.length - 1]
    if (m.source === 'script') runScript(g, m.scriptId!, choice.id, m.data, m)
    else applyFallback(g, { type: 'resolveChoice', event: m, choiceId: choice.id })
  } else if (m.kind === 'input') runScript(g, m.scriptId, m.defaultValue || '1', m.data, m)
  else if (m.kind === 'minigame') runScript(g, m.scriptId, minigameResult(m), m.data, m)
  else if (m.kind === 'aiTask') applyFallback(g, m.task)
}

function drainOffline(g: GameState): void {
  for (let guard = 0; g.queue.length && guard < 300; guard++) {
    const m = g.queue.shift()!
    const before = g.queue.length
    resolveOne(g, m)
    g.queue.unshift(...g.queue.splice(before))
  }
}

/** One year of the library: flavor lines plus, every year (not just most), a random event. */
function libraryYear(g: GameState): void {
  queueFallbackYearEvents(g)
  if (!g.queue.some((m) => m.kind === 'choice' && m.scriptId === EVENT_SCRIPT)) queueRandomEvent(g)
}

function addBrother(g: GameState, name = 'Hendra'): Person {
  return createPerson(g, { relation: 'sibling', age: g.character.age + 2, gender: 'male', firstName: name, lastName: g.character.lastName, relationship: 60, livesWithPlayer: true })
}

describe('offline events: cooldowns by kind and person', () => {
  it('never shows the same kind of event about the same person within five years, or one kind twice in three', () => {
    for (const seed of [3, 21]) {
      const g = grown('ng', 6, seed)
      addBrother(g, 'Chidi')
      const fired: { id: string; age: number; person: string }[] = []
      for (let age = 6; age <= 70 && g.character.alive; age++) {
        g.character.age = age
        currentLogYear(g)
        libraryYear(g)
        const m = g.queue.find((x) => x.kind === 'choice' && x.scriptId === EVENT_SCRIPT) as ChoiceModal | undefined
        const data = m?.data as { eventId?: string; personId?: string } | undefined
        if (data?.eventId) fired.push({ id: data.eventId, age, person: data.personId ?? '' })
        drainOffline(g)
        g.queue = []
        g.character.stats.health = 90
      }
      expect(fired.length).toBeGreaterThan(30)
      for (let i = 0; i < fired.length; i++) {
        for (let j = i + 1; j < fired.length; j++) {
          const a = fired[i]
          const b = fired[j]
          const gap = b.age - a.age
          if (a.id !== b.id && eventKind(a.id) === eventKind(b.id) && eventKind(a.id) !== a.id) expect(gap, `${a.id} → ${b.id}`).toBeGreaterThanOrEqual(3)
          if (a.person && a.person === b.person && eventKind(a.id) === eventKind(b.id)) expect(gap, `${a.id} → ${b.id} (same person)`).toBeGreaterThanOrEqual(5)
        }
      }
    }
  })

  it('groups only events that exist', () => {
    const ids = new Set(EVENT_LIBRARY.map((e) => e.id))
    const grouped = EVENT_LIBRARY.filter((e) => eventKind(e.id) !== e.id)
    expect(grouped.length).toBeGreaterThan(20)
    for (const e of grouped) expect(ids.has(e.id)).toBe(true)
  })
})

describe('locale guard', () => {
  it('keeps American scenes for Americans and out of other countries unless they fit', () => {
    for (const id of COUNTRIES) {
      const g = life(id)
      const loc = localeOf(id)
      const us = id === 'us'
      expect(foreignToLocale(g, 'I ran a lemonade stand and made $13.'), id).toBe(!us)
      expect(foreignToLocale(g, 'We spent Thanksgiving at Grandma’s.'), id).toBe(!us && !loc.holidays.some((h) => /Thanksgiving/i.test(h)))
      expect(foreignToLocale(g, 'Prom is coming up! What will you do?'), id).toBe(!us && !/\bprom\b|homecoming/i.test(loc.terms.schoolDance))
      expect(foreignToLocale(g, 'Someone called 911.'), id).toBe(!us && !loc.terms.emergencyNumber.includes('911'))
      expect(foreignToLocale(g, 'School closed for a snow day!'), id).toBe(!us && !loc.snow)
      expect(foreignToLocale(g, 'I inherited $12,911.'), id).toBe(false)
      expect(foreignToLocale(g, 'I learned to ride a bike.'), id).toBe(false)
      expect(foreignToLocale(g, 'Homecoming: the cat wandered back after two days.'), id).toBe(false)
    }
  })

  it('offline years outside the US skip American events and flavor lines', () => {
    for (const id of COUNTRIES.filter((c) => c !== 'us')) {
      let lives = 0
      for (let seed = 1; seed <= 12 && lives < 2; seed++) {
        const g = grown(id, 4, seed)
        const seen: string[] = []
        for (let age = 5; age <= 45 && g.character.alive; age++) {
          g.character.age = age
          const year = currentLogYear(g)
          const before = year.entries.length
          libraryYear(g)
          seen.push(...year.entries.slice(before).map((e) => e.text))
          for (const m of g.queue) if (m.kind === 'choice' && m.scriptId === EVENT_SCRIPT) seen.push(m.title, m.text, ...m.choices.map((c) => c.label))
          drainOffline(g)
          g.queue = []
          g.character.stats.health = 90
        }
        for (const t of seen) for (const re of americanismsFor(id)) expect(t, `${id}/${seed}`).not.toMatch(re)
        for (const t of seen) expect(foreignToLocale(g, t), `${id}/${seed}: ${t}`).toBe(false)
        // A freak early death (tornado, accident...) says nothing about the event library.
        if (!g.character.alive && g.character.age < 30) continue
        lives++
        expect(seen.length, `${id}/${seed}`).toBeGreaterThan(40)
      }
      expect(lives, id).toBe(2)
    }
  })
})
