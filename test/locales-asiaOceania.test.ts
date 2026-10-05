import { describe, expect, it } from 'vitest'
import { ASIA_OCEANIA_LOCALES } from '../src/game/data/locales/asiaOceania'
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
import { COUNTRIES, getCountry } from '../src/game/world'
import { makeTestGame } from './helpers'

const IDS = [
  'af', 'bd', 'cn', 'hk', 'in', 'id', 'jp', 'kz', 'my', 'mn', 'np',
  'pk', 'ph', 'sg', 'kr', 'tw', 'th', 'vn', 'au', 'nz', 'pg', 'ws',
]
const LEVELS: SchoolLevel[] = ['primary', 'middle', 'high']
const CLIMATES = ['tropical', 'arid', 'mediterranean', 'temperate', 'continental', 'cold']
/** Placeholders a school/university/street pattern may use. */
const NAME_TOKENS = new Set(['place', 'honoree', 'city', 'n'])
const WORD_LISTS = [
  'placeWords', 'honorees', 'getaways', 'holidays', 'foods', 'drinks', 'sports',
  'transport', 'landmarks', 'hangouts', 'dateSpots',
] as const satisfies readonly (keyof LocaleProfile)[]

const tokensOf = (pattern: string) => [...pattern.matchAll(/\{(\w+)\}/g)].map((m) => m[1])
const clean = (s: string) => !s.includes('{') && !s.includes('}') && !/\b(undefined|NaN|null)\b/.test(s)

describe('Asia & Oceania locale data', () => {
  it('covers exactly the 22 Asian and Oceanian countries in world.ts', () => {
    const worldIds = COUNTRIES.filter((c) => c.continent === 'Asia' || c.continent === 'Oceania').map((c) => c.id)
    expect(Object.keys(ASIA_OCEANIA_LOCALES).sort()).toEqual([...IDS].sort())
    for (const id of IDS) {
      expect(worldIds, id).toContain(id)
      expect(hasLocaleData(id), id).toBe(true)
      expect(localeOf(id), id).toBe(ASIA_OCEANIA_LOCALES[id])
    }
  })

  for (const id of IDS) {
    describe(id, () => {
      const p = ASIA_OCEANIA_LOCALES[id]

      it('has every list filled with tidy, distinct, token-free words', () => {
        expect(p.countryId).toBe(id)
        for (const key of WORD_LISTS) {
          const list = p[key]
          expect(list.length, `${id}.${key}`).toBeGreaterThan(0)
          expect(new Set(list).size, `${id}.${key} has duplicates`).toBe(list.length)
          for (const word of list) {
            expect(word.trim(), `${id}.${key}`).toBe(word)
            expect(word.length, `${id}.${key}`).toBeGreaterThan(1)
            expect(clean(word), `${id}.${key}: ${word}`).toBe(true)
          }
        }
        expect(p.placeWords.length).toBeGreaterThanOrEqual(10)
        expect(p.honorees.length).toBeGreaterThanOrEqual(6)
        expect(p.foods.length).toBeGreaterThanOrEqual(8)
        expect(p.getaways.length).toBeGreaterThanOrEqual(4)
        expect(p.holidays.length).toBeGreaterThanOrEqual(4)
        expect(CLIMATES).toContain(p.climate)
        expect(typeof p.snow).toBe('boolean')
      })

      it('uses only known placeholders in name patterns', () => {
        const patterns = [...LEVELS.flatMap((l) => p.schoolNames[l]), ...(p.schoolNames.preschool ?? []), ...p.universityNames, ...p.streetNames]
        for (const l of LEVELS) expect(p.schoolNames[l].length, `${id}.schoolNames.${l}`).toBeGreaterThan(0)
        expect(p.schoolNames.preschool?.length ?? 0, `${id}.schoolNames.preschool`).toBeGreaterThan(0)
        expect(p.universityNames.length).toBeGreaterThan(0)
        expect(p.streetNames.length).toBeGreaterThan(0)
        for (const pattern of patterns) {
          expect(pattern.trim()).toBe(pattern)
          for (const t of tokensOf(pattern)) expect(NAME_TOKENS.has(t), `${id}: ${pattern} uses {${t}}`).toBe(true)
          // Braces only ever appear as whole tokens.
          expect(pattern.replace(/\{(\w+)\}/g, '').match(/[{}]/), pattern).toBeNull()
        }
      })

      it('has every term filled in and a real emergency number', () => {
        for (const [k, v] of Object.entries(p.terms)) {
          expect(v.trim().length, `${id}.terms.${k}`).toBeGreaterThan(1)
          expect(clean(v), `${id}.terms.${k}`).toBe(true)
        }
        expect(p.terms.emergencyNumber).toMatch(/^\d{3,4}$/)
      })

      it('fills school, university and street names completely', () => {
        const country = getCountry(id)
        for (let seed = 1; seed <= 40; seed++) {
          const g = makeTestGame(seed, { countryId: id, birthCountryId: id, city: country.cities[seed % country.cities.length] })
          const names = [
            ...LEVELS.map((l) => localSchoolName(g, l)),
            localPreschoolName(g),
            localUniversityName(g),
            localStreetName(g),
            fillLocal(g, 'A trip to {getaway} for {holiday}, {food} and {drink} at {hangout}, then {sport}, {transport}, {landmark} and {dateSpot}.'),
          ]
          for (const name of names) {
            expect(clean(name), `${id}: ${name}`).toBe(true)
            expect(name.length).toBeGreaterThan(3)
          }
        }
      })
    })
  }
})
