import { describe, expect, it } from 'vitest'
import {
  fillLocal,
  hasLocaleData,
  localeOf,
  localSchoolName,
  localStreetName,
  localUniversityName,
  type LocaleProfile,
} from '../src/game/data/locales'
import { AMERICAS_LOCALES } from '../src/game/data/locales/americas'
import { countriesIn, getCountry } from '../src/game/world'
import { makeTestGame } from './helpers'

const IDS = ['us', 'aw', 'bs', 'bz', 'ca', 'cr', 'cu', 'do', 'sv', 'gt', 'ht', 'jm', 'mx', 'ni', 'pa', 'pr', 'ar', 'bo', 'br', 'cl', 'co', 'ec', 'gy', 'py', 'pe', 'uy', 've']

/** Placeholders a school / university / street pattern may use. */
const PATTERN_TOKENS = new Set(['place', 'honoree', 'city', 'n'])

/** Word lists that get dropped into sentences. */
const WORD_LISTS = ['placeWords', 'honorees', 'getaways', 'holidays', 'foods', 'drinks', 'sports', 'transport', 'landmarks', 'hangouts', 'dateSpots'] as const

const CLIMATES = ['tropical', 'arid', 'mediterranean', 'temperate', 'continental', 'cold']

function patternsOf(p: LocaleProfile): string[] {
  return [...p.schoolNames.primary, ...p.schoolNames.middle, ...p.schoolNames.high, ...p.universityNames, ...p.streetNames]
}

/** A game whose player lives in the first city of the country. */
function gameIn(id: string, seed: number) {
  return makeTestGame(seed, { countryId: id, birthCountryId: id, city: getCountry(id).cities[0] })
}

describe('Americas locale data', () => {
  it('covers exactly the listed countries, and every one exists in world.ts', () => {
    expect(Object.keys(AMERICAS_LOCALES).sort()).toEqual([...IDS].sort())
    for (const id of IDS) {
      expect(getCountry(id).id, id).toBe(id)
      expect(hasLocaleData(id), id).toBe(true)
      expect(AMERICAS_LOCALES[id].countryId, id).toBe(id)
      expect(localeOf(id), id).toBe(AMERICAS_LOCALES[id])
    }
  })

  it('covers every North and South American country in world.ts', () => {
    const world = [...countriesIn('North America'), ...countriesIn('South America')].map((c) => c.id)
    for (const id of world) expect(IDS, id).toContain(id)
  })

  it('has full, non-empty word lists with no blanks or duplicates', () => {
    for (const id of IDS) {
      const p = AMERICAS_LOCALES[id]
      for (const key of WORD_LISTS) {
        const list = p[key]
        expect(list.length, `${id}.${key}`).toBeGreaterThan(0)
        expect(new Set(list).size, `${id}.${key} has duplicates`).toBe(list.length)
        for (const word of list) {
          expect(word, `${id}.${key}`).toBe(word.trim())
          expect(word.length, `${id}.${key}`).toBeGreaterThan(1)
          expect(word, `${id}.${key}: ${word}`).not.toMatch(/[{}]|undefined|NaN|TODO/)
        }
      }
      expect(p.placeWords.length, `${id}.placeWords`).toBeGreaterThanOrEqual(10)
      expect(p.honorees.length, `${id}.honorees`).toBeGreaterThanOrEqual(6)
      expect(p.getaways.length, `${id}.getaways`).toBeGreaterThanOrEqual(4)
      expect(p.holidays.length, `${id}.holidays`).toBeGreaterThanOrEqual(4)
      expect(p.foods.length, `${id}.foods`).toBeGreaterThanOrEqual(8)
      expect(p.drinks.length, `${id}.drinks`).toBeGreaterThanOrEqual(2)
      expect(p.sports.length, `${id}.sports`).toBeGreaterThanOrEqual(3)
      expect(p.transport.length, `${id}.transport`).toBeGreaterThanOrEqual(3)
      expect(p.landmarks.length, `${id}.landmarks`).toBeGreaterThanOrEqual(5)
      expect(p.hangouts.length, `${id}.hangouts`).toBeGreaterThanOrEqual(4)
      expect(p.dateSpots.length, `${id}.dateSpots`).toBeGreaterThanOrEqual(4)
      expect(CLIMATES, id).toContain(p.climate)
      expect(typeof p.snow, id).toBe('boolean')
    }
  })

  it('writes words that sit mid-sentence: lowercase articles, articles on transport', () => {
    for (const id of IDS) {
      const p = AMERICAS_LOCALES[id]
      for (const key of ['getaways', 'holidays', 'foods', 'drinks', 'sports', 'transport', 'landmarks', 'hangouts', 'dateSpots'] as const) {
        for (const word of p[key]) expect(word, `${id}.${key}: ${word}`).not.toMatch(/^(The|A|An) /)
      }
      // "took {transport}" needs an article or possessive.
      for (const t of p.transport) expect(t, `${id}.transport: ${t}`).toMatch(/^(the|a|an) /)
      // ...and "took {transport} to school" breaks if the entry already has a destination.
      for (const t of p.transport) expect(t, `${id}.transport: ${t}`).not.toMatch(/ (to|across|along|up) /)
      // "ate {food}" / "drank {drink}": plural or mass nouns, no article.
      for (const f of [...p.foods, ...p.drinks]) expect(f, `${id}: ${f}`).not.toMatch(/^(a|an) /)
    }
  })

  it('has 2-4 name patterns per school level, university and street, using only known placeholders', () => {
    for (const id of IDS) {
      const p = AMERICAS_LOCALES[id]
      for (const level of ['primary', 'middle', 'high'] as const) {
        expect(p.schoolNames[level].length, `${id}.${level}`).toBeGreaterThanOrEqual(2)
        expect(p.schoolNames[level].length, `${id}.${level}`).toBeLessThanOrEqual(4)
      }
      expect(p.universityNames.length, `${id}.universityNames`).toBeGreaterThanOrEqual(2)
      expect(p.universityNames.length, `${id}.universityNames`).toBeLessThanOrEqual(5)
      expect(p.streetNames.length, `${id}.streetNames`).toBeGreaterThanOrEqual(2)
      expect(p.streetNames.length, `${id}.streetNames`).toBeLessThanOrEqual(4)
      for (const pattern of patternsOf(p)) {
        const tokens = [...pattern.matchAll(/\{(\w*)\}/g)].map((m) => m[1])
        for (const t of tokens) expect(PATTERN_TOKENS.has(t), `${id}: ${pattern} uses {${t}}`).toBe(true)
        // Braces only ever appear as whole placeholders.
        expect(pattern.replace(/\{\w+\}/g, ''), `${id}: ${pattern}`).not.toMatch(/[{}]/)
        expect(pattern, `${id}: ${pattern}`).toBe(pattern.trim())
      }
    }
  })

  it('fills school, university and street names completely', () => {
    for (const id of IDS) {
      for (let seed = 1; seed <= 40; seed++) {
        const g = gameIn(id, seed)
        const names = [
          localSchoolName(g, 'primary'),
          localSchoolName(g, 'middle'),
          localSchoolName(g, 'high'),
          localUniversityName(g),
          localStreetName(g),
        ]
        for (const name of names) {
          expect(name, `${id} seed ${seed}`).not.toMatch(/[{}]|undefined|NaN/)
          expect(name.trim().length, `${id} seed ${seed}`).toBeGreaterThan(2)
          expect(name, `${id} seed ${seed}: "${name}"`).not.toMatch(/\s{2,}/)
        }
      }
    }
  })

  it('fills every sentence token for every country', () => {
    const template = 'Eloped to {getaway} on {holiday}, ate {food}, drank {drink}, watched {sport}, took {transport} to {landmark}, hung out at {hangout}, first date at {dateSpot} in {place}, {city}, {country}; statue of {honoree}, school No. {n}.'
    for (const id of IDS) {
      for (let seed = 1; seed <= 10; seed++) {
        const text = fillLocal(gameIn(id, seed), template)
        expect(text, `${id}: ${text}`).not.toMatch(/[{}]|undefined|NaN/)
      }
    }
  })

  it('has every term filled and a real-looking emergency number', () => {
    for (const id of IDS) {
      const t = AMERICAS_LOCALES[id].terms
      for (const [key, value] of Object.entries(t)) {
        expect(typeof value, `${id}.terms.${key}`).toBe('string')
        expect(value.trim().length, `${id}.terms.${key}`).toBeGreaterThan(1)
        expect(value, `${id}.terms.${key}`).toBe(value.trim())
      }
      expect(t.emergencyNumber, id).toMatch(/^\d{3}$/)
      // The three school stages need distinct names so "finished X, started Y" reads right.
      expect(new Set([t.primary, t.middle, t.high]).size, id).toBe(3)
    }
  })

  it('keeps the classic American words in the US profile', () => {
    const us = AMERICAS_LOCALES.us
    expect(us.getaways).toContain('Las Vegas')
    expect(us.terms).toMatchObject({ primary: 'elementary school', middle: 'middle school', high: 'high school', university: 'college' })
    expect(us.terms).toMatchObject({ finalExam: 'the SATs', schoolDance: 'prom', licenseOffice: 'the DMV', emergencyNumber: '911' })
    for (const h of ['Thanksgiving', 'Halloween', 'the Fourth of July', 'Christmas']) expect(us.holidays).toContain(h)
    expect(us.hangouts).toContain('the mall')
    expect(us.sports[0]).toBe('football')
    expect(us.foods).toContain('mac and cheese')
    expect(us.snow).toBe(true)
  })

  it('does not leak American defaults into Latin America and the Caribbean', () => {
    for (const id of IDS.filter((x) => x !== 'us' && x !== 'ca')) {
      const p = AMERICAS_LOCALES[id]
      expect(p.getaways, id).not.toContain('Las Vegas')
      expect(p.terms.finalExam, id).not.toBe('the SATs')
      expect(p.terms.licenseOffice, id).not.toBe('the DMV')
      expect(p.holidays, id).not.toContain('the Fourth of July')
      expect(p.snow, id).toBe(false)
    }
  })
})
