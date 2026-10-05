import { describe, expect, it } from 'vitest'
import { EUROPE_LOCALES } from '../src/game/data/locales/europe'
import {
  fillLocal,
  hasLocaleData,
  localeOf,
  localSchoolName,
  localStreetName,
  localUniversityName,
  type LocaleProfile,
  type SchoolLevel,
} from '../src/game/data/locales'
import { countriesIn, getCountry } from '../src/game/world'
import { makeTestGame } from './helpers'

const EUROPE_IDS = [
  'ad', 'at', 'be', 'hr', 'cz', 'dk', 'ee', 'fi', 'fr', 'de', 'gr', 'hu', 'ie', 'it', 'mc', 'nl', 'no', 'pl', 'pt', 'ro',
  'ru', 'rs', 'sk', 'es', 'se', 'ch', 'ua', 'gb',
]
const LEVELS: SchoolLevel[] = ['primary', 'middle', 'high']
/** Placeholders allowed in school, university and street patterns. */
const NAME_TOKENS = new Set(['place', 'honoree', 'city', 'n'])
const WORD_LISTS = [
  'placeWords', 'honorees', 'getaways', 'holidays', 'foods', 'drinks', 'sports', 'transport', 'landmarks', 'hangouts', 'dateSpots',
] as const satisfies readonly (keyof LocaleProfile)[]
/** Sizes the brief asks for, so a half-filled profile fails loudly. */
const MIN_SIZE: Record<(typeof WORD_LISTS)[number], number> = {
  placeWords: 10, honorees: 6, getaways: 4, holidays: 4, foods: 8, drinks: 2, sports: 3, transport: 3, landmarks: 5, hangouts: 4, dateSpots: 4,
}
/** Words that would mean an American default leaked into a European country. */
const AMERICANISMS = ['Las Vegas', 'DMV', 'Thanksgiving', 'Fourth of July', 'SATs', 'mac and cheese', 'Northgate', 'Meadowbrook']

function tokensOf(pattern: string): string[] {
  return [...pattern.matchAll(/\{(\w+)\}/g)].map((m) => m[1])
}

function patternsOf(p: LocaleProfile): string[] {
  return [...LEVELS.flatMap((l) => p.schoolNames[l]), ...p.universityNames, ...p.streetNames]
}

describe('European locale data', () => {
  it('covers every listed country, and every European country in world.ts', () => {
    for (const id of EUROPE_IDS) {
      expect(hasLocaleData(id), id).toBe(true)
      expect(EUROPE_LOCALES[id], id).toBeDefined()
    }
    for (const c of countriesIn('Europe')) expect(EUROPE_IDS, c.id).toContain(c.id)
    expect(Object.keys(EUROPE_LOCALES).sort()).toEqual([...EUROPE_IDS].sort())
  })

  it('keys each profile by its own countryId and serves it through localeOf', () => {
    for (const [id, p] of Object.entries(EUROPE_LOCALES)) {
      expect(p.countryId).toBe(id)
      expect(localeOf(id)).toBe(p)
      expect(() => getCountry(id)).not.toThrow()
    }
  })

  it('fills every word list with clean, distinct entries', () => {
    for (const [id, p] of Object.entries(EUROPE_LOCALES)) {
      for (const field of WORD_LISTS) {
        const list = p[field]
        expect(list.length, `${id}.${field}`).toBeGreaterThanOrEqual(MIN_SIZE[field])
        expect(new Set(list).size, `${id}.${field} has duplicates`).toBe(list.length)
        for (const word of list) {
          expect(word.trim(), `${id}.${field}`).toBe(word)
          expect(word.length, `${id}.${field}`).toBeGreaterThan(1)
          expect(word, `${id}.${field}`).not.toMatch(/[{}]|undefined|NaN|TODO/)
        }
      }
      expect(['tropical', 'arid', 'mediterranean', 'temperate', 'continental', 'cold'], id).toContain(p.climate)
      expect(typeof p.snow, id).toBe('boolean')
    }
  })

  it('has 2-4 name patterns per kind, using only known placeholders', () => {
    for (const [id, p] of Object.entries(EUROPE_LOCALES)) {
      for (const level of LEVELS) {
        expect(p.schoolNames[level].length, `${id} ${level}`).toBeGreaterThanOrEqual(2)
        expect(p.schoolNames[level].length, `${id} ${level}`).toBeLessThanOrEqual(4)
      }
      for (const list of [p.universityNames, p.streetNames]) {
        expect(list.length, id).toBeGreaterThanOrEqual(2)
        expect(list.length, id).toBeLessThanOrEqual(4)
      }
      for (const pattern of patternsOf(p)) {
        expect(pattern.trim(), `${id}: ${pattern}`).toBe(pattern)
        for (const token of tokensOf(pattern)) expect(NAME_TOKENS.has(token), `${id}: ${pattern}`).toBe(true)
        // A brace that is not part of a {token} would reach the player as-is.
        expect(pattern.replace(/\{\w+\}/g, ''), `${id}: ${pattern}`).not.toMatch(/[{}]/)
      }
    }
  })

  it('gives every term a value and a real emergency number', () => {
    for (const [id, p] of Object.entries(EUROPE_LOCALES)) {
      for (const [term, value] of Object.entries(p.terms)) {
        expect(value.trim().length, `${id}.terms.${term}`).toBeGreaterThan(0)
        expect(value, `${id}.terms.${term}`).not.toMatch(/[{}]/)
      }
      expect(p.terms.emergencyNumber, id).toMatch(/^\d{3}$/)
    }
    expect(localeOf('gb').terms.emergencyNumber).toBe('999')
    expect(localeOf('gb').terms.finalExam).toBe('A-levels')
    expect(localeOf('de').terms.finalExam).toBe('the Abitur')
    expect(localeOf('fr').terms.finalExam).toBe('the bac')
  })

  it('keeps American defaults out of European countries', () => {
    for (const [id, p] of Object.entries(EUROPE_LOCALES)) {
      const text = JSON.stringify(p)
      for (const word of AMERICANISMS) expect(text, `${id} mentions ${word}`).not.toContain(word)
      expect(p.terms.emergencyNumber, id).not.toBe('911')
    }
  })

  it('fills school, university and street names completely in every city', () => {
    for (const id of EUROPE_IDS) {
      const country = getCountry(id)
      for (const [i, city] of country.cities.entries()) {
        const g = makeTestGame(1000 + i, { countryId: id, city, birthCountryId: id })
        for (let k = 0; k < 6; k++) {
          const names = [
            ...LEVELS.map((level) => localSchoolName(g, level)),
            localUniversityName(g),
            localStreetName(g),
          ]
          for (const name of names) {
            expect(name, `${id}/${city}: ${name}`).not.toMatch(/[{}]|undefined|NaN/)
            expect(name.trim().length, `${id}/${city}`).toBeGreaterThan(2)
          }
        }
      }
    }
  })

  it('fills every pattern with every word without leaving tokens behind', () => {
    // Walk each pattern with each place word and honoree, so no combination is left untested.
    for (const [id, p] of Object.entries(EUROPE_LOCALES)) {
      const city = getCountry(id).cities[0]
      for (const pattern of patternsOf(p)) {
        for (const place of p.placeWords) {
          for (const honoree of p.honorees) {
            const name = pattern.replace(/\{place\}/g, place).replace(/\{honoree\}/g, honoree).replace(/\{city\}/g, city).replace(/\{n\}/g, '7')
            expect(name, `${id}: ${pattern}`).not.toMatch(/[{}]/)
          }
        }
      }
    }
  })

  it('drops local words into sentences through fillLocal', () => {
    const g = makeTestGame(7, { countryId: 'pl', city: 'Kraków', birthCountryId: 'pl' })
    const line = fillLocal(g, 'I was conceived on a trip to {getaway} after a first date at {dateSpot} in {city}.')
    expect(line).not.toMatch(/[{}]/)
    expect(line).toContain('Kraków')
    expect(EUROPE_LOCALES.pl.getaways.some((w) => line.includes(w))).toBe(true)
    expect(EUROPE_LOCALES.pl.dateSpots.some((w) => line.includes(w))).toBe(true)
  })
})
