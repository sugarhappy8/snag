import { describe, expect, it } from 'vitest'
import {
  CONTINENTS,
  COUNTRIES,
  NAME_POOLS,
  countriesIn,
  countryLabel,
  flagEmoji,
  getCountry,
  randomCity,
  randomCountry,
  randomFirstName,
  randomLastName,
  randomSkinTone,
  type NameRegion,
} from '../src/game/world'
import { makeTestGame } from './helpers'

const REGIONS = Object.keys(NAME_POOLS) as NameRegion[]

describe('countries', () => {
  it('has at least 45 nations across every continent, US first', () => {
    expect(COUNTRIES.length).toBeGreaterThanOrEqual(45)
    expect(COUNTRIES[0].id).toBe('us')
    for (const continent of CONTINENTS) expect(countriesIn(continent).length).toBeGreaterThan(0)
  })

  it('includes the classic launch nations', () => {
    const launch = ['ar', 'au', 'br', 'ca', 'cl', 'cn', 'co', 'cu', 'eg', 'et', 'fr', 'de', 'gr', 'in', 'ir', 'ie', 'il', 'it', 'jm', 'jp', 'mx', 'nl', 'nz', 'ng', 'pa', 'pe', 'ph', 'ru', 'sa', 'rs', 'za', 'kr', 'es', 'se', 'tr', 'gb', 'us', 've']
    for (const id of launch) expect(getCountry(id).id).toBe(id)
  })

  it('has unique ids and names', () => {
    expect(new Set(COUNTRIES.map((c) => c.id)).size).toBe(COUNTRIES.length)
    expect(new Set(COUNTRIES.map((c) => c.name)).size).toBe(COUNTRIES.length)
  })

  it('every country is complete and sane', () => {
    for (const c of COUNTRIES) {
      expect(c.id, c.name).toMatch(/^[a-z]{2}$/)
      expect(c.name.trim()).toBe(c.name)
      expect(c.name, c.id).not.toMatch(/[&<>"']/)
      expect(c.demonym.length, c.id).toBeGreaterThan(2)
      expect(c.flag, c.id).toBe(flagEmoji(c.id))
      expect([...c.flag].length, c.id).toBe(2)
      expect(CONTINENTS, c.id).toContain(c.continent)
      expect(['$', '€', '£'], c.id).toContain(c.currency)
      expect(REGIONS, c.id).toContain(c.names)
      expect(c.cities.length, c.id).toBeGreaterThanOrEqual(8)
      expect(c.cities.length, c.id).toBeLessThanOrEqual(15)
      expect(new Set(c.cities).size, `${c.id} duplicate city`).toBe(c.cities.length)
      for (const city of c.cities) {
        expect(city.trim(), c.id).toBe(city)
        expect(city.length, c.id).toBeGreaterThan(1)
      }
      expect(c.wealth, c.id).toBeGreaterThan(0.1)
      expect(c.wealth, c.id).toBeLessThanOrEqual(1.5)
      expect(c.drivingAge, c.id).toBeGreaterThanOrEqual(15)
      expect(c.drivingAge, c.id).toBeLessThanOrEqual(18)
      expect(c.drinkingAge, c.id).toBeGreaterThanOrEqual(16)
      expect(c.drinkingAge, c.id).toBeLessThanOrEqual(21)
      expect(c.skinTones.length, c.id).toBeGreaterThan(0)
      for (const t of c.skinTones) expect([1, 2, 3, 4, 5], c.id).toContain(t)
      expect(c.birthWeightKg, c.id).toBeGreaterThanOrEqual(2.5)
      expect(c.birthWeightKg, c.id).toBeLessThanOrEqual(3.8)
      expect(c.weight, c.id).toBeGreaterThan(0)
      expect(c.religions.length, c.id).toBeGreaterThan(0)
      for (const r of c.religions) expect(r.length, c.id).toBeGreaterThan(1)
      for (const k of ['freeUniversity', 'universalHealthcare', 'deathPenalty', 'monarchy', 'conscription'] as const) {
        expect(typeof c[k], `${c.id}.${k}`).toBe('boolean')
      }
    }
  })

  it('is plain JSON data', () => {
    expect(JSON.parse(JSON.stringify(COUNTRIES))).toEqual(COUNTRIES)
  })

  it('mirrors real-world laws for well-known nations', () => {
    expect(getCountry('us')).toMatchObject({ drivingAge: 16, drinkingAge: 21, deathPenalty: true, universalHealthcare: false, freeUniversity: false })
    expect(getCountry('gb')).toMatchObject({ monarchy: true, universalHealthcare: true, currency: '£', drivingAge: 17 })
    expect(getCountry('jp')).toMatchObject({ drinkingAge: 20, monarchy: true, deathPenalty: true })
    expect(getCountry('de')).toMatchObject({ freeUniversity: true, drinkingAge: 16, currency: '€' })
    expect(getCountry('kr').conscription).toBe(true)
    expect(getCountry('il').conscription).toBe(true)
    expect(getCountry('fr').monarchy).toBe(false)
    expect(getCountry('sa')).toMatchObject({ monarchy: true, deathPenalty: true })
    expect(getCountry('ca').drinkingAge).toBe(19)
  })

  it('royal families exist exactly where royalty can be found', () => {
    const royals = COUNTRIES.filter((c) => c.monarchy).map((c) => c.id).sort()
    expect(royals).toEqual(['ae', 'be', 'dk', 'es', 'gb', 'jo', 'jp', 'kw', 'ma', 'my', 'nl', 'no', 'qa', 'sa', 'se', 'th'])
  })

  it('keeps the cities other systems rely on', () => {
    expect(getCountry('us').cities).toEqual(expect.arrayContaining(['Chicago', 'Tucson', 'Miami', 'New York']))
    expect(getCountry('ca').cities).toContain('Winnipeg')
    expect(getCountry('fr').cities).toContain('Lyon')
    expect(getCountry('jp').cities).toContain('Kyoto')
  })

  it('religions are weighted by repetition and include non-religious options', () => {
    const us = getCountry('us').religions
    const christian = us.filter((r) => r === 'Christianity').length
    expect(christian).toBeGreaterThan(us.filter((r) => r === 'None').length)
    expect(us).toContain('None')
    expect(getCountry('in').religions.filter((r) => r === 'Hinduism').length).toBeGreaterThan(getCountry('in').religions.length / 2)
    expect(getCountry('af').religions).toEqual(['Islam'])
  })

  it('falls back to the United States for unknown ids', () => {
    expect(getCountry('zz').id).toBe('us')
    expect(getCountry('').id).toBe('us')
  })

  it('labels countries with articles where English needs one', () => {
    expect(countryLabel(getCountry('us'))).toBe('the United States')
    expect(countryLabel(getCountry('nl'))).toBe('the Netherlands')
    expect(countryLabel(getCountry('ph'))).toBe('the Philippines')
    expect(countryLabel(getCountry('fr'))).toBe('France')
    expect(countryLabel(getCountry('ug'))).toBe('Uganda')
  })

  it('builds flags from ISO codes', () => {
    expect(flagEmoji('us')).toBe('\u{1F1FA}\u{1F1F8}')
    expect(flagEmoji('gb')).toBe('\u{1F1EC}\u{1F1E7}')
    expect(flagEmoji('jp')).toBe('\u{1F1EF}\u{1F1F5}')
    expect(flagEmoji('???')).toBe('\u{1F3F3}\u{FE0F}')
  })
})

describe('name pools', () => {
  it('every region has at least 25 unique male, female and last names', () => {
    for (const region of REGIONS) {
      const pool = NAME_POOLS[region]
      for (const kind of ['male', 'female', 'last'] as const) {
        const list = pool[kind]
        expect(list.length, `${region}.${kind}`).toBeGreaterThanOrEqual(25)
        expect(new Set(list).size, `${region}.${kind} has duplicates`).toBe(list.length)
        for (const n of list) {
          expect(n.trim(), `${region}.${kind}`).toBe(n)
          expect(n.length, `${region}.${kind}`).toBeGreaterThan(1)
          expect(n, `${region}.${kind}`).not.toMatch(/[<>&"]/)
        }
      }
    }
  })

  it('every region is used by at least one country (except the legacy alias)', () => {
    const used = new Set(COUNTRIES.map((c) => c.names))
    for (const region of REGIONS) {
      if (region === 'southeast_asian') continue
      expect(used.has(region), region).toBe(true)
    }
  })

  it('first names do not leak across genders within a pool', () => {
    for (const region of REGIONS) {
      const male = new Set(NAME_POOLS[region].male)
      const shared = NAME_POOLS[region].female.filter((n) => male.has(n))
      expect(shared, region).toEqual([])
    }
  })
})

describe('random helpers', () => {
  it('rolls names from the country pool deterministically', () => {
    const a = makeTestGame(42)
    const b = makeTestGame(42)
    for (let i = 0; i < 30; i++) {
      const fa = randomFirstName(a, 'jp', i % 2 ? 'male' : 'female')
      expect(randomFirstName(b, 'jp', i % 2 ? 'male' : 'female')).toBe(fa)
      expect(i % 2 ? NAME_POOLS.japanese.male : NAME_POOLS.japanese.female).toContain(fa)
      const la = randomLastName(a, 'pl')
      expect(randomLastName(b, 'pl')).toBe(la)
      expect(NAME_POOLS.polish.last).toContain(la)
    }
  })

  it('unknown countries fall back to the US pool', () => {
    const g = makeTestGame(3)
    expect(NAME_POOLS.anglo.male).toContain(randomFirstName(g, 'zz', 'male'))
    expect(NAME_POOLS.anglo.last).toContain(randomLastName(g, 'zz'))
  })

  it('random country, city and skin tone come from the data', () => {
    const g = makeTestGame(7)
    const seen = new Set<string>()
    for (let i = 0; i < 400; i++) {
      const c = randomCountry(g)
      seen.add(c.id)
      expect(c.cities).toContain(randomCity(g, c))
      expect(c.skinTones).toContain(randomSkinTone(g, c))
    }
    // Weighted, but a few hundred rolls should visit plenty of the world.
    expect(seen.size).toBeGreaterThan(40)
    expect(seen.has('us')).toBe(true)
  })

  it('the US is the single most likely birthplace', () => {
    const top = [...COUNTRIES].sort((a, b) => b.weight - a.weight)[0]
    expect(top.id).toBe('us')
  })
})
