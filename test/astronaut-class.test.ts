import { describe, expect, it } from 'vitest'
import { allBrands } from '../src/game/data/brands'
import { nameFitsYear } from '../src/game/history/events-people'
import { randInt } from '../src/game/rng'
import { BACKGROUNDS, ERA, type Background } from '../src/game/special/astronaut-data'
import { astronautStore, type AstroState } from '../src/game/special/astronaut-state'
import { boardNotice, classBias, classSeats, classYear, playerBackground, playerScore, runBoard, seededCandidates, type BoardResult } from '../src/game/special/astronaut-class'
import { fundingIndex } from '../src/game/special/astronaut-world'
import { ownerKey } from '../src/game/special/common'
import { policyOf, writePolicy } from '../src/game/nation/state'
import type { GameState, Json } from '../src/game/types'
import { deepFreeze } from './fuzz-kit'
import { makeTestGame } from './helpers'

const brandNames = new Set(allBrands().map((b) => b.name.toLowerCase()))

/** A graduate of the Academy with a bachelor's in Engineering, health 70 and athleticism 40, applying in `year`. */
function grad(smarts: number, seed: number, year = 1985, country = 'us'): GameState {
  const g = makeTestGame(seed, { age: 28, countryId: country })
  g.year = year
  g.lifeId = `class-${seed}`
  g.character.stats.smarts = smarts
  g.character.stats.health = 70
  g.character.hidden.athleticism = 40
  g.character.education.degrees.push({ kind: 'bachelor', name: "Bachelor's in Engineering", major: 'Engineering', school: 'State University', age: 22 })
  g.flags['special.astronaut'] = { owner: ownerKey(g), graduated: true } as unknown as Json
  return g
}

const store = (g: GameState, o: Record<string, unknown> = {}): AstroState => astronautStore.read({ v: 1, ...o }, g)

function setLine(g: GameState, line: number): void {
  const p = structuredClone(policyOf(g, g.character.countryId))
  p.national.budget.space = line
  writePolicy(g, p)
}

/** One board with the roll the game's own rng gives (the way an action draws it). */
function sit(smarts: number, seed: number, year = 1985): BoardResult {
  const g = grad(smarts, seed, year)
  return runBoard(g, store(g), 'oea', year, { roll: randInt(g, -6, 6) })
}

describe('astronaut class', () => {
  it('seededCandidates is identical across calls, prefix-stable and uses no g.rng', () => {
    const g = grad(65, 1)
    const rng = JSON.stringify(g.rng)
    const before = JSON.stringify(g)
    const a = seededCandidates(g, 'oea', 1985, 61)
    expect(a).toHaveLength(61)
    expect(seededCandidates(g, 'oea', 1985, 61)).toEqual(a)
    expect(seededCandidates(g, 'oea', 1985, 20)).toEqual(a.slice(0, 20))
    expect(JSON.stringify(g.rng)).toBe(rng)
    expect(JSON.stringify(g)).toBe(before)
    // another agency, year or family sees other people; an heir (same family seed) sees the same ones
    expect(seededCandidates(g, 'sfa', 1985, 20)).not.toEqual(a.slice(0, 20))
    expect(seededCandidates(g, 'oea', 1988, 20)).not.toEqual(a.slice(0, 20))
    const other = grad(65, 2)
    expect(seededCandidates(other, 'oea', 1985, 20).map((c) => c.name)).not.toEqual(a.slice(0, 20).map((c) => c.name))
    const heir = structuredClone(g)
    heir.lifeId = `${g.lifeId}-g2`
    heir.generation = 2
    expect(seededCandidates(heir, 'oea', 1985, 61)).toEqual(a)
    // a frozen state, junk counts
    expect(() => seededCandidates(deepFreeze(structuredClone(g)), 'oea', 1985, 61)).not.toThrow()
    expect(seededCandidates(g, 'oea', 1985, 0)).toEqual([])
    expect(seededCandidates(g, 'oea', 1985, -5)).toEqual([])
    expect(seededCandidates(g, 'oea', 1985, NaN)).toEqual([])
    expect(seededCandidates(g, 'oea', 1985, 1e9)).toHaveLength(400)
  })

  it('keeps candidates unique, fictional and era-fitting, with scores 34 to 103', () => {
    const g = grad(65, 3, 1965)
    const list = seededCandidates(g, 'oea', 1965, 200)
    expect(new Set(list.map((c) => c.name.toLowerCase())).size).toBe(200)
    for (const c of list) {
      expect(brandNames.has(c.name.toLowerCase())).toBe(false)
      expect(BACKGROUNDS).toContain(c.bg)
      expect(c.score).toBeGreaterThanOrEqual(34)
      expect(c.score).toBeLessThanOrEqual(34 + 24 + 22 + 3)
      expect(c.name.length).toBeLessThanOrEqual(40)
      expect(c.name.split(' ').length).toBeGreaterThanOrEqual(2)
    }
    const mean = list.reduce((n, c) => n + c.score, 0) / list.length
    expect(mean).toBeGreaterThan(54)
    expect(mean).toBeLessThan(61)
    const first = (c: { name: string }): string => c.name.split(' ')[0]
    for (const c of list) expect(nameFitsYear(first(c), 1965 - 40)).toBe(true) // the oldest a 1965 finalist can be
  })

  it('passes smarts 95 and fails smarts 45 over 30 seeds, and a smarts-65 graduate clears between 30% and 60%', () => {
    const rate = (smarts: number, n: number): number => {
      let passed = 0
      for (let seed = 1; seed <= n; seed++) if (sit(smarts, seed).passed) passed++
      return passed / n
    }
    expect(rate(95, 30)).toBeGreaterThanOrEqual(0.9) // measured about 97% over 400 seeds
    expect(rate(45, 30)).toBeLessThanOrEqual(0.1) // about 4%
    const mid = rate(65, 200)
    expect(mid).toBeGreaterThan(0.3) // about 41%
    expect(mid).toBeLessThan(0.6)
    expect(rate(90, 200)).toBeGreaterThan(0.85) // about 92%
  })

  it('keeps seats scaling with F and class years following the era table', () => {
    const g = grad(65, 4, 2005)
    const s = store(g)
    const seat = (year: number): number => classSeats(g, s, year)
    setLine(g, 0.5)
    const lean = seat(2005)
    setLine(g, 1)
    const normal = seat(2005)
    const normalF = fundingIndex(g, s, 2005)
    setLine(g, 2)
    const flush = seat(2005)
    expect(lean).toBeLessThan(normal)
    expect(normal).toBeLessThan(flush)
    expect(normal).toBe(Math.round((ERA.station.seats * normalF) / 50))
    expect(flush).toBeLessThanOrEqual(40)
    expect(classSeats(g, s, NaN)).toBe(0)
    // class years: every classEvery years counted from the era's first year, from 1959
    const years = (agency: 'own' | 'partner' | 'sfa' | 'rocketeer', from: number, to: number): number[] => {
      const out: number[] = []
      for (let y = from; y <= to; y++) if (classYear(agency, y)) out.push(y)
      return out
    }
    expect(years('own', 1950, 1958)).toEqual([])
    expect(years('own', 1959, 1975)).toEqual([1959, 1961, 1963, 1965, 1967, 1969, 1971, 1973, 1975])
    expect(years('own', 1976, 1980)).toEqual([1976])
    expect(years('own', 1981, 1999)).toEqual([1981, 1984, 1987, 1990, 1993, 1996, 1999])
    expect(years('own', 2000, 2019)).toEqual([2000, 2004, 2008, 2012, 2016])
    expect(years('own', 2020, 2030)).toEqual([2020, 2022, 2024, 2026, 2028, 2030])
    expect(years('partner', 1981, 1999)).toEqual(years('own', 1981, 1999))
    expect(years('sfa', 2000, 2019)).toEqual(years('own', 2000, 2019))
    // the private operator runs one every year from 2008
    expect(years('rocketeer', 2000, 2012)).toEqual([2008, 2009, 2010, 2011, 2012])
    expect(classYear('own', 1985.5)).toBe(false)
    expect(classYear('own', NaN)).toBe(false)
    // the private class is funded 40 + 2 x (year - 2008), at most 90, scaled by mood, not by the national line
    setLine(g, 0.5)
    const a = classSeats(g, s, 2020, 'rocketeer')
    setLine(g, 2)
    expect(classSeats(g, s, 2020, 'rocketeer')).toBe(a)
    expect(classSeats(g, s, 2007, 'rocketeer')).toBe(0)
    expect(classSeats(g, s, 2020, 'rocketeer')).toBe(Math.round((ERA.commercial.seats * Math.round((40 + 2 * 12) * (0.7 + 0.6 * (s.mood / 100)))) / 50))
    expect(classSeats(g, s, 2060, 'rocketeer')).toBe(Math.round((ERA.commercial.seats * Math.round(90 * (0.7 + 0.6 * (s.mood / 100)))) / 50))
    expect(classSeats(g, store(g, { mood: 100 }), 2020, 'rocketeer')).toBeGreaterThan(classSeats(g, store(g, { mood: 0 }), 2020, 'rocketeer'))
  })

  it('the board notice reads "You placed 9th of 62. The class took 14." for rank 9, 62 finalists, 14 seats', () => {
    const r = (rank: number, finalists = 62, seats = 14): BoardResult => ({ rank, finalists, seats, cut: 60, passed: rank <= seats, bias: 'engineer', you: 'engineer', mates: [] })
    expect(boardNotice(r(9))).toBe('You placed 9th of 62. The class took 14.')
    expect(boardNotice(r(1))).toBe('You placed 1st of 62. The class took 14.')
    expect(boardNotice(r(2))).toBe('You placed 2nd of 62. The class took 14.')
    expect(boardNotice(r(3))).toBe('You placed 3rd of 62. The class took 14.')
    expect([11, 12, 13, 14, 21, 22, 23, 101, 111, 112].map((n) => /placed (\S+) of/.exec(boardNotice(r(n, 200)))?.[1])).toEqual(['11th', '12th', '13th', '14th', '21st', '22nd', '23rd', '101st', '111th', '112th'])
    expect(boardNotice(r(9)).length).toBeLessThanOrEqual(120)
    expect(boardNotice(r(9))).not.toContain(String.fromCharCode(0x2014))
  })

  it('adds +3 to a matching background and BoardResult.bias equals classBias(g, agency, year)', () => {
    const g = grad(65, 5)
    const s = store(g)
    const bias = classBias(g, 'oea', 1985)
    expect(BACKGROUNDS).toContain(bias)
    expect(classBias(g, 'oea', 1985)).toBe(bias) // seeded: the same pick every call
    const board = runBoard(g, s, 'oea', 1985, { roll: 0 })
    expect(board.bias).toBe(bias)
    expect(board.you).toBe(playerBackground(g, s))
    // a bachelor's in Engineering reads as an engineer; the score gains 3 only when the class wants one
    expect(playerBackground(g, s)).toBe('engineer')
    const want = (b: Background): number => {
      for (let year = 1960; year < 2060; year++) if (classBias(g, 'oea', year) === b) return year
      throw new Error(`no ${b} class`)
    }
    const engineerYear = want('engineer')
    const otherYear = (() => {
      for (let year = 1960; year < 2060; year++) if (classBias(g, 'oea', year) !== 'engineer' && classYear('own', year) === classYear('own', engineerYear)) return year
      throw new Error('no other class')
    })()
    expect(playerScore(g, s, 'oea', engineerYear) - playerScore(g, s, 'oea', otherYear)).toBeCloseTo(3, 10)
    // candidates of the wanted background score 3 higher on average than the same draw without the bias
    const list = seededCandidates(g, 'oea', engineerYear, 300)
    const wanted = list.filter((c) => c.bg === 'engineer')
    expect(wanted.length).toBeGreaterThan(20)
    expect(Math.min(...wanted.map((c) => c.score))).toBeGreaterThanOrEqual(37)
    // classes lean by era: race wants pilots, the station years scientists
    const tally = (era: number): Record<string, number> => {
      const out: Record<string, number> = {}
      for (let i = 0; i < 400; i++) {
        const h = grad(65, 1000 + i, era)
        const b = classBias(h, 'oea', era)
        out[b] = (out[b] ?? 0) + 1
      }
      return out
    }
    expect(tally(1965).pilot).toBeGreaterThan(220)
    expect(tally(2005).scientist).toBeGreaterThan(110)
    expect(tally(2005).pilot ?? 0).toBeLessThan(90)
  })

  it('scores the player by the formula, with no roll', () => {
    const g = grad(60, 6)
    const s = store(g)
    // 8 + .30 smarts + .18 athleticism + .14 health + .22 readiness (60 for a graduate) + degree + camp - 5 per conviction + 3 on the bias
    const by = (h: GameState, degree: number, camp = 0, convicted = 0): number =>
      8 + 0.3 * h.character.stats.smarts + 0.18 * h.character.hidden.athleticism + 0.14 * h.character.stats.health + 0.22 * 60 + degree + camp - 5 * convicted + (playerBackground(h, s) === classBias(h, 'oea', 1985) ? 3 : 0)
    expect(playerScore(g, s, 'oea', 1985)).toBeCloseTo(by(g, 6), 10)
    g.counters.spaceCamp = 2
    expect(playerScore(g, s, 'oea', 1985)).toBeCloseTo(by(g, 6, 4), 10)
    g.counters.spaceCamp = 9
    expect(playerScore(g, s, 'oea', 1985)).toBeCloseTo(by(g, 6, 6), 10) // at most 6
    g.counters.spaceCamp = 0
    g.character.criminalRecord.push({ crime: 'Theft', year: 1990, convicted: true, sentenceYears: 1 } as unknown as (typeof g.character.criminalRecord)[number])
    expect(playerScore(g, s, 'oea', 1985)).toBeCloseTo(by(g, 6, 0, 1), 10)
    // degrees: MD and doctorate 8, a STEM major 6, any other college degree 3, none 0
    const h = grad(60, 6)
    h.character.education.degrees = [{ kind: 'bachelor', name: "Bachelor's in History", major: 'History', school: 'State University', age: 22 }]
    expect(playerScore(h, s, 'oea', 1985)).toBeCloseTo(by(h, 3), 10)
    h.character.education.degrees = [{ kind: 'md', name: 'Doctor of Medicine', school: 'State University', age: 26 }]
    expect(playerScore(h, s, 'oea', 1985)).toBeCloseTo(by(h, 8), 10)
    expect(playerBackground(h, s)).toBe('physician')
    h.character.education.degrees = [{ kind: 'doctorate', name: 'PhD in Physics', major: 'Physics', school: 'State University', age: 28 }]
    expect(playerScore(h, s, 'oea', 1985)).toBeCloseTo(by(h, 8), 10)
    expect(playerBackground(h, s)).toBe('scientist')
    h.character.education.degrees = []
    expect(playerScore(h, s, 'oea', 1985)).toBeCloseTo(by(h, 0), 10)
    // a pilot's skill makes a pilot of anyone
    expect(playerBackground(h, store(h, { skills: { eva: 0, pilot: 50, fit: 0, team: 0 } }))).toBe('pilot')
    expect(playerBackground(h, store(h, { skills: { eva: 0, pilot: 49, fit: 0, team: 0 } }))).toBe('engineer')
    // junk stats stay finite
    const j = grad(60, 6)
    j.character.stats.smarts = NaN
    j.character.hidden.athleticism = Infinity
    expect(Number.isFinite(playerScore(j, s, 'oea', 1985))).toBe(true)
  })

  it('runs the board: rank, finalists, cut and mates follow the formulas', () => {
    const g = grad(65, 7)
    const s = store(g)
    const seats = classSeats(g, s, 1985)
    const r = runBoard(g, s, 'oea', 1985, { roll: 0 })
    expect([r.seats, r.finalists]).toEqual([seats, seats * 4 + 6])
    const field = seededCandidates(g, 'oea', 1985, r.finalists - 1).sort((a, b) => b.score - a.score)
    const me = playerScore(g, s, 'oea', 1985)
    expect(r.rank).toBe(1 + field.filter((c) => c.score > me).length)
    expect(r.passed).toBe(r.rank <= seats)
    expect(r.cut).toBe(Math.round(field[seats - 1].score))
    expect(r.passed).toBe(me >= field[seats - 1].score)
    // the roll moves the score by at most 6; a bigger one is clamped
    const lo = runBoard(g, s, 'oea', 1985, { roll: -6 })
    const hi = runBoard(g, s, 'oea', 1985, { roll: 6 })
    expect(lo.rank).toBeGreaterThanOrEqual(r.rank)
    expect(hi.rank).toBeLessThanOrEqual(r.rank)
    expect(runBoard(g, s, 'oea', 1985, { roll: 600 })).toEqual(hi)
    expect(runBoard(g, s, 'oea', 1985, { roll: NaN })).toEqual(r)
    // the cut does not depend on the roll
    expect([lo.cut, hi.cut]).toEqual([r.cut, r.cut])
    // mates: up to 3 distinct admitted names, seeded
    expect(r.mates.length).toBe(Math.min(3, r.passed ? seats - 1 : seats))
    expect(new Set(r.mates).size).toBe(r.mates.length)
    expect(runBoard(g, s, 'oea', 1985, { roll: 0 }).mates).toEqual(r.mates)
    for (const m of r.mates) expect(field.map((c) => c.name)).toContain(m)
    // the Academy cohort: 0.6 of the seats, 3 finalists a seat
    const c = runBoard(g, s, 'oea', 1985, { roll: 0, cohort: true })
    expect([c.seats, c.finalists]).toEqual([Math.round(seats * 0.6), Math.round(seats * 0.6) * 3])
    // a class with no seats passes nobody and cuts at 100
    const zero = grad(65, 7, 1978)
    setLine(zero, 0.5)
    const z = runBoard(zero, store(zero, { mood: 0, lobby: -6 }), 'oea', 1978, { roll: 6 })
    expect([z.seats, z.passed, z.cut]).toEqual([0, false, 100])
    // the whole board is pure: a frozen state, no g.rng
    const f = deepFreeze(structuredClone(g))
    const before = JSON.stringify(f)
    expect(() => runBoard(f, astronautStore.view(f), 'oea', 1985, { roll: 0 })).not.toThrow()
    expect(JSON.stringify(f)).toBe(before)
  })

  it('reads the readiness from the cadet job, the astronaut job, the skills or the graduation', () => {
    const g = grad(60, 8)
    const none = makeTestGame(8, { age: 28 })
    none.year = 1985
    none.character.stats.smarts = 60
    none.character.stats.health = 70
    none.character.hidden.athleticism = 40
    none.character.education.degrees = g.character.education.degrees
    const s = store(g)
    // not graduated and no training: readiness 0 costs .22 x 60 against the graduate
    const gap = playerScore(g, s, 'oea', 1985) - playerScore(none, s, 'oea', 1985)
    expect(gap).toBeCloseTo(0.22 * 60, 10)
    // skills count when higher (the pilot skill stays under 50, so the background does not change)
    const skilled = store(g, { skills: { eva: 90, pilot: 40, fit: 90, team: 90 } })
    expect(playerScore(g, skilled, 'oea', 1985) - playerScore(g, s, 'oea', 1985)).toBeCloseTo(0.22 * (77.5 - 60), 10) // the mean of the four skills
  })
})
