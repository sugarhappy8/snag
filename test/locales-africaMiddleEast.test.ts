import { describe, expect, it } from 'vitest'
import {
  fillLocal,
  hasLocaleData,
  localeOf,
  localPreschoolName,
  localSchoolName,
  localStreetName,
  localUniversityName,
  type LocaleProfile,
  type SchoolLevel,
} from '../src/game/data/locales'
import { AFRICA_MIDDLE_EAST_LOCALES } from '../src/game/data/locales/africaMiddleEast'
import { getCountry } from '../src/game/world'
import { makeTestGame } from './helpers'

const IDS = [
  'dz', 'ao', 'dj', 'cd', 'eg', 'et', 'ke', 'ma', 'ng', 'za', 'tn', 'ug', 'zw',
  'ge', 'ir', 'iq', 'il', 'jo', 'kw', 'lb', 'qa', 'sa', 'sy', 'tr', 'ae',
]
const LEVELS: SchoolLevel[] = ['primary', 'middle', 'high']
const CLIMATES = ['tropical', 'arid', 'mediterranean', 'temperate', 'continental', 'cold']

/** Placeholders each kind of pattern may use (see the LocaleProfile docs). */
const SCHOOL_TOKENS = new Set(['place', 'honoree', 'city', 'n'])
const UNIVERSITY_TOKENS = new Set(['place', 'honoree', 'city'])
const STREET_TOKENS = new Set(['place', 'honoree', 'n'])

/** Word lists, with the minimum length each must have. */
const LISTS: [keyof LocaleProfile, number][] = [
  ['placeWords', 10],
  ['honorees', 6],
  ['universityNames', 1],
  ['streetNames', 2],
  ['getaways', 4],
  ['holidays', 4],
  ['foods', 8],
  ['drinks', 2],
  ['sports', 3],
  ['transport', 3],
  ['landmarks', 5],
  ['hangouts', 4],
  ['dateSpots', 4],
]

function profile(id: string): LocaleProfile {
  return AFRICA_MIDDLE_EAST_LOCALES[id]
}

function tokensOf(pattern: string): string[] {
  return [...pattern.matchAll(/\{(\w+)\}/g)].map((m) => m[1])
}

function gameIn(id: string, seed: number) {
  const country = getCountry(id)
  return makeTestGame(seed, { countryId: id, birthCountryId: id, city: country.cities[seed % country.cities.length] })
}

describe('Africa and Middle East locale data', () => {
  it('covers exactly the 25 regional countries and is what localeOf returns', () => {
    expect(Object.keys(AFRICA_MIDDLE_EAST_LOCALES).sort()).toEqual([...IDS].sort())
    for (const id of IDS) {
      expect(hasLocaleData(id), id).toBe(true)
      expect(getCountry(id).id, id).toBe(id)
      expect(profile(id).countryId, id).toBe(id)
      expect(localeOf(id), id).toBe(profile(id))
    }
  })

  it('has full, clean word lists with no duplicates or stray placeholders', () => {
    for (const id of IDS) {
      const p = profile(id)
      for (const [field, min] of LISTS) {
        const list = p[field] as string[]
        expect(list.length, `${id}.${field}`).toBeGreaterThanOrEqual(min)
        expect(new Set(list).size, `${id}.${field} duplicates`).toBe(list.length)
        for (const word of list) {
          expect(word.trim(), `${id}.${field}`).toBe(word)
          expect(word.length, `${id}.${field}`).toBeGreaterThan(1)
          if (field !== 'universityNames' && field !== 'streetNames') expect(word, `${id}.${field}`).not.toMatch(/[{}]/)
        }
      }
      expect(CLIMATES, id).toContain(p.climate)
      expect(typeof p.snow, id).toBe('boolean')
    }
  })

  it('writes words that read naturally inside sentences', () => {
    for (const id of IDS) {
      const p = profile(id)
      // Place words and honorees go inside names ('{place} Primary School'), so no articles.
      for (const w of [...p.placeWords, ...p.honorees]) expect(w, `${id}: ${w}`).not.toMatch(/^(the|a|an) /i)
      // Foods follow 'a spoonful of' / 'choking on', so no leading article either.
      for (const f of p.foods) expect(f, `${id}: ${f}`).not.toMatch(/^(the|a|an) /i)
      // Transport follows 'a ride on' / 'took', so it must say which one.
      for (const t of p.transport) expect(t, `${id}: ${t}`).toMatch(/^(the|a|an) |^[A-Z]/)
    }
  })

  it('only uses known placeholders in name patterns', () => {
    for (const id of IDS) {
      const p = profile(id)
      for (const level of LEVELS) {
        const patterns = p.schoolNames[level]
        expect(patterns.length, `${id} ${level}`).toBeGreaterThanOrEqual(2)
        for (const pattern of patterns) {
          for (const t of tokensOf(pattern)) expect(SCHOOL_TOKENS.has(t), `${id} ${level}: ${pattern}`).toBe(true)
        }
      }
      expect(p.schoolNames.preschool?.length ?? 0, `${id} preschool`).toBeGreaterThanOrEqual(2)
      for (const pattern of p.schoolNames.preschool ?? []) {
        for (const t of tokensOf(pattern)) expect(SCHOOL_TOKENS.has(t), `${id} preschool: ${pattern}`).toBe(true)
      }
      for (const pattern of p.universityNames) {
        for (const t of tokensOf(pattern)) expect(UNIVERSITY_TOKENS.has(t), `${id}: ${pattern}`).toBe(true)
      }
      for (const pattern of p.streetNames) {
        for (const t of tokensOf(pattern)) expect(STREET_TOKENS.has(t), `${id}: ${pattern}`).toBe(true)
      }
    }
  })

  it('fills school, university and street names completely in every city', () => {
    for (const id of IDS) {
      const cities = getCountry(id).cities
      for (let seed = 1; seed <= cities.length * 3; seed++) {
        const g = gameIn(id, seed)
        const names = [
          ...LEVELS.map((level) => localSchoolName(g, level)),
          localPreschoolName(g),
          localUniversityName(g),
          localStreetName(g),
        ]
        for (const name of names) {
          expect(name, `${id} (${g.character.city})`).not.toMatch(/[{}]|undefined|NaN/)
          expect(name.trim().length, id).toBeGreaterThan(3)
        }
      }
    }
  })

  it('names schools after local places, never the old American defaults', () => {
    for (const id of IDS) {
      for (let seed = 1; seed <= 20; seed++) {
        const g = gameIn(id, seed)
        const name = localSchoolName(g, LEVELS[seed % 3])
        expect(name, id).not.toMatch(/Northgate|Meadowbrook|Las Vegas/)
      }
      const p = profile(id)
      expect(p.getaways, id).not.toContain('Las Vegas')
      expect(p.terms.finalExam, id).not.toMatch(/\bSATs?\b/)
      expect(p.terms.licenseOffice, id).not.toBe('the DMV')
      expect(p.terms.emergencyNumber === '911' && !['jo', 'sa'].includes(id), `${id} uses 911`).toBe(false)
    }
  })

  it('fills local sentence templates with no leftover tokens', () => {
    const template =
      'A trip to {getaway}, {holiday} dinner, {food} with {drink}, the {sport} team, a ride on {transport}, ' +
      'a field trip to {landmark}, hanging out at {hangout}, a first date at {dateSpot}, in {city}, {country}.'
    for (const id of IDS) {
      for (let seed = 1; seed <= 10; seed++) {
        const text = fillLocal(gameIn(id, seed), template)
        expect(text, id).not.toMatch(/[{}]|undefined|NaN/)
      }
    }
  })

  it('has every term filled in and a real-looking emergency number', () => {
    for (const id of IDS) {
      const { terms } = profile(id)
      for (const [key, value] of Object.entries(terms)) {
        expect(value.trim().length, `${id}.terms.${key}`).toBeGreaterThan(0)
        expect(value, `${id}.terms.${key}`).not.toMatch(/[{}]/)
      }
      // School stages are used bare ('{high} drama', 'started primary school'), so no article.
      for (const key of ['primary', 'middle', 'high', 'university'] as const) {
        expect(terms[key], `${id}.terms.${key}`).not.toMatch(/^(the|a|an) /i)
      }
      expect(terms.emergencyNumber, id).toMatch(/^\d{2,5}$/)
    }
  })
})
