import { describe, expect, it } from 'vitest'
import { ensureEconomy } from '../src/game/economy'
import { economyState, storeEconomy } from '../src/game/economy/model'
import { policyOf, writePolicy } from '../src/game/nation/state'
import { SPACE_AGENCIES } from '../src/game/special/astronaut'
import { AGENCY_FROM, ERA, MISSIONS, NATIONAL_PROGRAM, SPACE_SHOCKS, eraKey } from '../src/game/special/astronaut-data'
import { astronautStore, type AstroState } from '../src/game/special/astronaut-state'
import { ASTRO_SPEC, FATAL_SHARE, access, agencyName, fundingIndex, launchRisk, missionsOpen, moodTarget, projectBody, shock, tourDays } from '../src/game/special/astronaut-world'
import { setOwnFlag } from '../src/game/special/common'
import { activeField, rosterAt, standingOf } from '../src/game/special/kit/rivals'
import type { GameState } from '../src/game/types'
import { deepFreeze } from './fuzz-kit'
import { makeTestGame } from './helpers'

/** A deterministic life in `country` in `year`. */
function at(country: string, year: number, seed = 4): GameState {
  const g = makeTestGame(seed, { age: 35, countryId: country })
  g.year = year
  return g
}

const OPEN = (g: GameState, agency: 'own' | 'partner' | 'sfa' | 'rocketeer', year = g.year): string[] => missionsOpen(g, agency, year)
const kinds = (g: GameState): string[] => access(g).map((a) => a.agency)

function setLine(g: GameState, line: number): void {
  const p = structuredClone(policyOf(g, g.character.countryId))
  p.national.budget.space = line
  writePolicy(g, p)
}

/** The economy of the life's country pinned to a growth rate and a deficit share. */
function withEconomy(g: GameState, growth: number, deficit: number): void {
  ensureEconomy(g)
  const state = economyState(g)!
  const country = g.character.countryId
  const e = state.countries[country]
  storeEconomy(g, { ...state, countries: { ...state.countries, [country]: { ...e, growth, budget: { ...e.budget, deficit } } } })
}

const rec = (g: GameState, o: Record<string, unknown> = {}): AstroState => astronautStore.read({ v: 1, ...o }, g)

describe('astronaut world', () => {
  it('maps years to the five eras', () => {
    expect([1957, 1975, 1976, 1980, 1981, 1999, 2000, 2019, 2020, 2040].map(eraKey)).toEqual(['race', 'race', 'lull', 'lull', 'shuttle', 'shuttle', 'station', 'station', 'commercial', 'commercial'])
    expect(eraKey(1900)).toBe('race')
    expect(eraKey(NaN)).toBe('commercial')
    expect([moodTarget(1965), moodTarget(1978), moodTarget(1990), moodTarget(2010), moodTarget(2025)]).toEqual([70, 40, 52, 50, 55])
  })

  it('follows the era and access table', () => {
    // 1950: the Academy is not open and nothing flies
    for (const c of ['us', 'ru', 'fr']) {
      const g = at(c, 1950)
      expect(access(g)).toEqual([])
      for (const a of ['own', 'partner', 'sfa', 'rocketeer'] as const) expect(OPEN(g, a)).toEqual([])
    }
    // 1962: hop and orbit, and only for the two launching countries
    expect(OPEN(at('us', 1962), 'own')).toEqual(['hop', 'orbit'])
    expect(OPEN(at('ru', 1962), 'own')).toEqual(['hop', 'orbit'])
    for (const c of ['fr', 'jp', 'in', 'cn', 'gb']) {
      expect(access(at(c, 1962))).toEqual([])
      expect(OPEN(at(c, 1962), 'own')).toEqual([])
    }
    // 1970: the Moon is open to the United States only
    expect(OPEN(at('us', 1970), 'own')).toContain('moon')
    expect(OPEN(at('ru', 1970), 'own')).not.toContain('moon')
    // 1978: a country with no launchers has nothing; a launching one has orbit and outpost tours, no Moon or orbiter
    for (const c of ['jp', 'fr', 'gb']) {
      expect(access(at(c, 1978))).toEqual([])
      for (const a of ['own', 'partner', 'sfa', 'rocketeer'] as const) expect(OPEN(at(c, 1978), a)).toEqual([])
    }
    expect(OPEN(at('us', 1978), 'own')).toEqual(['orbit', 'station'])
    // 1985: orbiters; partners and the consortium arrive in 1983 and get no hop
    expect(OPEN(at('us', 1985), 'own')).toEqual(['orbit', 'orbiter', 'satellite', 'station'])
    expect(kinds(at('jp', 1985))).toEqual(['partner', 'sfa'])
    expect(OPEN(at('jp', 1985), 'partner')).toEqual(['orbit', 'orbiter', 'satellite', 'station'])
    expect(OPEN(at('jp', 1985), 'sfa')).toEqual(['orbit', 'orbiter', 'satellite', 'station'])
    expect(OPEN(at('jp', 1985), 'own')).toEqual([])
    expect(kinds(at('jp', 1982))).toEqual([])
    expect(kinds(at('jp', 1983))).toEqual(['partner', 'sfa'])
    // a country with no agency of its own still reaches the consortium from 1983
    expect(kinds(at('bo', 1990))).toEqual(['sfa'])
    // 2005: station expeditions; China launches its own crews from 2003
    expect(OPEN(at('us', 2005), 'own')).toContain('station')
    expect(kinds(at('cn', 2002))).toEqual(['partner', 'sfa'])
    expect(kinds(at('cn', 2003))).toEqual(['own', 'sfa'])
    // 2024: private seats and the commercial flight
    const g24 = at('us', 2024)
    expect(OPEN(g24, 'rocketeer')).toEqual(expect.arrayContaining(['hop', 'own']))
    expect(OPEN(g24, 'own')).toEqual(expect.arrayContaining(['hop', 'own']))
    expect(OPEN(g24, 'own')).not.toContain('moon')
    expect(kinds(at('us', 2012))).toContain('rocketeer')
    expect(OPEN(at('us', 2012), 'rocketeer')).toEqual([]) // crews fly from 2020
    expect(kinds(at('us', 2005))).not.toContain('rocketeer')
    // 2035: the return to the Moon; Mars not yet
    expect(OPEN(at('us', 2035), 'own')).toContain('moon')
    expect(OPEN(at('us', 2035), 'own')).toContain('deep')
    expect(OPEN(at('us', 2035), 'own')).not.toContain('mars')
    // 2045: Mars needs funding 60 or marsFunding
    const lean = at('us', 2045)
    setLine(lean, 0.5)
    expect(fundingIndex(lean, astronautStore.view(lean))).toBeLessThan(60)
    expect(OPEN(lean, 'own')).not.toContain('mars')
    setOwnFlag(lean, 'marsFunding', true)
    expect(OPEN(lean, 'own')).toContain('mars')
    const rich = at('us', 2045)
    setLine(rich, 2)
    expect(fundingIndex(rich, astronautStore.view(rich))).toBeGreaterThanOrEqual(60)
    expect(OPEN(rich, 'own')).toContain('mars')
    // an explicit year wins over g.year, and a junk year or country throws nothing
    expect(OPEN(at('us', 2026), 'own', 1970)).toContain('moon')
    expect(missionsOpen(at('us', 2026), 'own', NaN)).toEqual([])
    const odd = at('__proto__', 1990)
    expect(() => access(odd)).not.toThrow()
    expect(kinds(odd)).toEqual(['sfa'])
  })

  it('names the access rows by agency and year', () => {
    expect(access(at('us', 1970))).toEqual([{ agency: 'own', id: 'oea', name: 'NASA' }])
    expect(access(at('fr', 1990))).toEqual([
      { agency: 'partner', id: 'oea', name: 'CNES' },
      { agency: 'sfa', id: 'sfa', name: 'Stellar Frontier Alliance' },
    ])
    expect(access(at('us', 2024)).map((a) => a.id)).toEqual(['oea', 'sfa', 'rocketeer'])
    expect(access(at('us', 2024)).map((a) => a.name)).toEqual(['NASA', 'Stellar Frontier Alliance', 'Rocketeer Aerospace'])
  })

  it('never names an agency before AGENCY_FROM', () => {
    expect(agencyName('us', 1957)).toBe(NATIONAL_PROGRAM)
    expect(agencyName('us', 1958)).toBe('NASA')
    expect(agencyName('ru', 1991)).toBe(NATIONAL_PROGRAM)
    expect(agencyName('ru', 1992)).toBe('Roscosmos')
    expect(agencyName('be', 1974)).toBe(NATIONAL_PROGRAM)
    expect(agencyName('be', 1975)).toBe('European Space Agency')
    expect(agencyName('kr', 2023)).toBe(NATIONAL_PROGRAM)
    expect(agencyName('kr', 2024)).toBe('Korea AeroSpace Administration')
    // listed in the legacy table but not here: left out when unsure
    expect(agencyName('de', 2000)).toBe(NATIONAL_PROGRAM)
    expect(agencyName('bo', 2000)).toBe(NATIONAL_PROGRAM)
    expect(agencyName('__proto__', 2000)).toBe(NATIONAL_PROGRAM)
    for (const [c, name] of Object.entries(SPACE_AGENCIES)) {
      const key = name === 'European Space Agency' ? 'esa' : c
      for (let y = 1900; y <= 2030; y++) {
        const got = agencyName(c, y)
        if (!(key in AGENCY_FROM) || y < AGENCY_FROM[key]) expect(got).toBe(NATIONAL_PROGRAM)
        else expect(got).toBe(name)
      }
    }
  })

  it('computes F by hand at line 0.5, 1 and 2 on a fixed economy fixture, rising with the line', () => {
    const g = at('us', 2005) // the station era: base 46
    withEconomy(g, 0.02, 0.01)
    const s = rec(g, { mood: 50, lobby: 0 })
    const by = (line: number, growth: number, deficit: number, mood: number, lobby = 0): number =>
      Math.min(100, Math.max(5, Math.round(ERA.station.fundBase * line ** 0.85 * (1 + 2 * growth - (deficit > 0.05 ? 0.06 : 0)) * (0.7 + 0.6 * (mood / 100)) + lobby)))
    const got = [0.5, 1, 2].map((line) => {
      setLine(g, line)
      return fundingIndex(g, s)
    })
    expect(got).toEqual([by(0.5, 0.02, 0.01, 50), by(1, 0.02, 0.01, 50), by(2, 0.02, 0.01, 50)])
    expect(got).toEqual([27, 48, 86])
    expect(got[0]).toBeLessThan(got[1])
    expect(got[1]).toBeLessThan(got[2])
    setLine(g, 1)
    // mood and lobby feed it; a deficit over 5% costs .06 of the economy factor
    expect(fundingIndex(g, rec(g, { mood: 100 }))).toBe(by(1, 0.02, 0.01, 100))
    expect(fundingIndex(g, rec(g, { mood: 0 }))).toBe(by(1, 0.02, 0.01, 0))
    expect(fundingIndex(g, rec(g, { mood: 50, lobby: 12 }))).toBe(by(1, 0.02, 0.01, 50, 12))
    expect(fundingIndex(g, rec(g, { mood: 50, lobby: -6 }))).toBe(by(1, 0.02, 0.01, 50, -6))
    withEconomy(g, 0.02, 0.06)
    expect(fundingIndex(g, s)).toBe(by(1, 0.02, 0.06, 50))
    expect(by(1, 0.02, 0.06, 50)).toBeLessThan(by(1, 0.02, 0.01, 50))
    // growth moves it; the floor and the ceiling hold
    withEconomy(g, -0.1, 0.01)
    expect(fundingIndex(g, s)).toBe(by(1, -0.1, 0.01, 50))
    setLine(g, 2)
    withEconomy(g, 0.16, 0.01)
    expect(fundingIndex(g, rec(g, { mood: 100, lobby: 20 }))).toBe(100)
    setLine(g, 0.5)
    withEconomy(g, -0.2, 0.01)
    expect(fundingIndex(g, rec(g, { mood: 0, lobby: -6 }))).toBe(5)
    // marsFunding adds 8
    const m = at('us', 2005)
    withEconomy(m, 0.02, 0.01)
    const base = fundingIndex(m, s)
    setOwnFlag(m, 'marsFunding', true)
    expect(fundingIndex(m, s)).toBe(base + 8)
    // every era reads its own base
    for (const [year, era] of [[1965, 'race'], [1978, 'lull'], [1990, 'shuttle'], [2005, 'station'], [2025, 'commercial']] as const) {
      const h = at('us', year)
      withEconomy(h, 0, 0)
      expect(fundingIndex(h, rec(h, { mood: 50 }))).toBe(Math.round(ERA[era].fundBase))
    }
  })

  it('reads without touching nation.policy or g.rng, also on a frozen state [RF5]', () => {
    const g = at('us', 2005)
    setLine(g, 1.5)
    astronautStore.mut(g)
    const f = deepFreeze(structuredClone(g))
    const before = JSON.stringify(f)
    const rng = JSON.stringify(f.rng)
    const s = astronautStore.view(f)
    expect(() => {
      fundingIndex(f, s)
      access(f)
      for (const a of ['own', 'partner', 'sfa', 'rocketeer'] as const) missionsOpen(f, a)
      launchRisk(f, s, 'station', 180, { prep: 1, squeeze: false, rocketeer: false })
      projectBody(s, 180, 'standard', 70)
      rosterAt(f, ASTRO_SPEC)
      activeField(f, ASTRO_SPEC, s.memory)
      standingOf(f, ASTRO_SPEC, 50, s.memory)
    }).not.toThrow()
    expect(JSON.stringify(f)).toBe(before)
    expect(JSON.stringify(f.rng)).toBe(rng)
    expect(JSON.stringify(g.flags['nation.policy'])).toBe(JSON.stringify(f.flags['nation.policy']))
  })

  it('projects 180 days standard at fit 70 as bone -4.9, muscle -7.6, dose +21.6, strain +8.4', () => {
    const s = rec(at('us', 2005))
    const b = projectBody(s, 180, 'standard', 70)
    expect([b.bone, b.muscle, b.dose, b.strain].map((x) => +x.toFixed(1))).toEqual([4.9, 7.6, 21.6, 8.4])
    expect(b.injury).toBe(0)
    // light loses most, intense least; only intense risks an injury, max(1%, 8% - fit/15)
    const light = projectBody(s, 180, 'light', 70)
    const intense = projectBody(s, 180, 'intense', 70)
    expect(light.bone).toBeGreaterThan(b.bone)
    expect(b.bone).toBeGreaterThan(intense.bone)
    expect(+(light.bone / b.bone).toFixed(3)).toBeCloseTo(1 / 0.7, 2)
    expect(intense.injury).toBeCloseTo(0.08 - 70 / 1500, 10)
    expect(projectBody(s, 180, 'intense', 100).injury).toBeCloseTo(0.08 - 100 / 1500, 10)
    expect(projectBody(s, 180, 'intense', 0).injury).toBeCloseTo(0.08, 10)
    // a fitter body loses less; a short hop loses almost nothing
    expect(projectBody(s, 180, 'standard', 100).bone).toBeLessThan(b.bone)
    expect(projectBody(s, 1, 'standard', 70).bone).toBeLessThan(0.2)
    // junk in, finite out
    expect(projectBody(s, NaN, 'standard', NaN)).toEqual({ bone: 0, muscle: 0, dose: 0, strain: 0, injury: 0 })
  })

  it('keeps launchRisk x FATAL_SHARE for a station tour inside 0.2% to 1.0%', () => {
    const g = at('us', 2005)
    const s = rec(g, { safety: 60 })
    for (const days of [90, 180, 365]) {
      const p = launchRisk(g, s, 'station', days, { prep: 1, squeeze: false, rocketeer: false }) * FATAL_SHARE
      expect(p).toBeGreaterThanOrEqual(0.002)
      expect(p).toBeLessThanOrEqual(0.01)
    }
    // an unprepared crew in the same year stays under 1% too, and the shuttle era's outposts as well
    expect(launchRisk(g, s, 'station', 365, { prep: 1.2, squeeze: false, rocketeer: false }) * FATAL_SHARE).toBeLessThanOrEqual(0.01)
    const sh = at('us', 1990)
    for (const days of tourDays('station', 1990)) expect(launchRisk(sh, s, 'station', days, { prep: 1, squeeze: false, rocketeer: false }) * FATAL_SHARE).toBeLessThanOrEqual(0.01)
    // each factor does what the design says
    const base = launchRisk(g, s, 'station', 180, { prep: 1, squeeze: false, rocketeer: false })
    expect(base).toBeCloseTo(0.008 * (1 + 180 / 720) * ERA.station.riskMult, 10)
    expect(launchRisk(g, s, 'station', 180, { prep: 1.2, squeeze: false, rocketeer: false })).toBeCloseTo(base * 1.2, 10)
    expect(launchRisk(g, s, 'station', 180, { prep: 1, squeeze: true, rocketeer: false })).toBeCloseTo(base * 1.3, 10)
    expect(launchRisk(g, s, 'station', 180, { prep: 1, squeeze: false, rocketeer: true })).toBeCloseTo(base * 2.2, 10)
    expect(launchRisk(g, rec(g, { safety: 90 }), 'station', 180, { prep: 1, squeeze: false, rocketeer: false })).toBeLessThan(base)
    expect(launchRisk(g, rec(g, { safety: 20 }), 'station', 180, { prep: 1, squeeze: false, rocketeer: false })).toBeGreaterThan(base)
    // other types use their own base; the era multiplier reads the game's year
    expect(launchRisk(g, s, 'mars', 420, { prep: 1, squeeze: false, rocketeer: false })).toBeCloseTo(MISSIONS.mars.risk * ERA.station.riskMult, 10)
    expect(launchRisk(at('us', 1965), s, 'orbit', 3, { prep: 1, squeeze: false, rocketeer: false })).toBeCloseTo(MISSIONS.orbit.risk * ERA.race.riskMult, 10)
    for (const id of Object.keys(MISSIONS) as (keyof typeof MISSIONS)[]) {
      const p = launchRisk(g, s, id, MISSIONS[id].days[0], { prep: 1.2, squeeze: true, rocketeer: true })
      expect(p).toBeGreaterThan(0)
      expect(p).toBeLessThanOrEqual(0.5)
    }
  })

  it('shocks the public mood by year and country', () => {
    expect(shock(1957, 'us')).toBe(8)
    expect(shock(1967, 'us')).toBe(-12)
    expect(shock(1967, 'fr')).toBe(0)
    expect(shock(1986, 'us')).toBe(-20) // the us row and the world row
    expect(shock(1986, 'fr')).toBe(-4)
    expect(shock(2003, 'cn')).toBe(8)
    expect(shock(2003, 'us')).toBe(-10)
    expect(shock(2003, 'jp')).toBe(0)
    expect(shock(1950, 'us')).toBe(0)
    expect(SPACE_SHOCKS).toHaveLength(13)
  })

  it('tours: station outposts run 28, 56 or 84 days and the expeditions 90, 180 or 365', () => {
    expect(tourDays('station', 1985)).toEqual([28, 56, 84])
    expect(tourDays('station', 1973)).toEqual([28, 56, 84])
    expect(tourDays('station', 1999)).toEqual([28, 56, 84])
    expect(tourDays('station', 2000)).toEqual([90, 180, 365])
    expect(tourDays('station', 1972)).toEqual([90, 180, 365])
    expect(tourDays('moon', 1970)).toEqual([8])
    expect(tourDays('mars', 2045)).toEqual([420])
    tourDays('station', 2005).push(1) // a copy, never the table
    expect(MISSIONS.station.days).toEqual([90, 180, 365])
  })

  it('derives the rival field from access and funding', () => {
    // no field before the Academy opens or where nothing flies
    expect(rosterAt(at('us', 1950), ASTRO_SPEC)).toEqual([])
    expect(rosterAt(at('us', 1958), ASTRO_SPEC)).toEqual([])
    expect(rosterAt(at('fr', 1975), ASTRO_SPEC)).toEqual([])
    expect(rosterAt(at('jp', 1982), ASTRO_SPEC)).toEqual([])
    // a launching country has peers from 1961, anyone from 1983
    expect(rosterAt(at('us', 1970), ASTRO_SPEC).length).toBeGreaterThan(0)
    expect(rosterAt(at('fr', 1995), ASTRO_SPEC).length).toBeGreaterThan(0)
    for (const r of rosterAt(at('us', 1990), ASTRO_SPEC)) expect(['pilot', 'engineer', 'scientist', 'physician']).toContain(r.edge)
    // an empty field ranks 1 of 1; funding deepens a real one
    expect(standingOf(at('us', 1950), ASTRO_SPEC, 40).rank).toBe(1)
    const lean = at('us', 2005)
    const flush = at('us', 2005)
    setLine(lean, 0.5)
    setLine(flush, 2)
    const top = (g: GameState): number => activeField(g, ASTRO_SPEC)[0].score
    expect(top(flush)).toBeGreaterThanOrEqual(top(lean))
    const sum = (g: GameState): number => activeField(g, ASTRO_SPEC).reduce((n, x) => n + x.score, 0)
    expect(sum(flush)).toBeGreaterThan(sum(lean))
  })
})
