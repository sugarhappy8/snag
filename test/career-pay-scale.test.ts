// Career pay follows the era and the country. The military pay tables and the Street Hustler takes
// are US 2020s dollars, so they scale by payScale(g) = typicalIncome(g) / US_TYPICAL_INCOME: exactly 1
// for the US from 2026, 0.3 for the US in 1930, 0.2 for Nigeria today. Pay is fixed at hire and at
// each promotion, so a living job and an old save keep the salary they were saved with.
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { formatMoney } from '../src/game/core'
import { typicalIncome, US_TYPICAL_INCOME } from '../src/game/events/wealth-core'
import { migrateSave } from '../src/game/save-schema'
import { runScript } from '../src/game/scripts'
import { hire, payScale, prof } from '../src/game/special/common'
import { hustlerJobNodes } from '../src/game/special/hustler'
import { militaryJob, militaryMenu, payFor, yearlyMilitary } from '../src/game/special/military'
import type { ChoiceModal, GameState, MenuAction, MenuGroup, MenuNode } from '../src/game/types'
import { COUNTRIES } from '../src/game/world'
import { makeTestGame } from './helpers'

const ENLISTED = [21_000, 24_000, 27_000, 31_000, 36_000, 42_000, 50_000, 58_000, 66_000, 75_000]
const OFFICER = [44_000, 54_000, 66_000, 86_000, 101_000, 122_000, 139_000, 170_000, 204_000, 207_000]

function life(year: number, countryId: string, age = 25, seed = 5): GameState {
  const g = makeTestGame(seed, {
    countryId,
    age,
    money: 1_000,
    education: {
      current: null,
      degrees: [
        { kind: 'highschool', name: 'Diploma', school: 'School', age: 18 },
        { kind: 'bachelor', name: 'BA', school: 'University', age: 22 },
      ],
      completed: ['elementary', 'middle', 'high'],
      droppedOut: [],
      expelled: 0,
    },
  })
  g.year = year
  return g
}

function armyMenu(g: GameState): MenuGroup {
  const army = militaryMenu.children(g).find((n): n is MenuGroup => n.type === 'menu' && n.id === 'military.army')
  if (!army) throw new Error('no army menu')
  return army
}

function action(g: GameState, id: string): MenuAction {
  const n = armyMenu(g).children(g).find((x: MenuNode) => 'id' in x && x.id === id)
  if (!n || n.type !== 'action') throw new Error(`no action ${id}`)
  return n
}

function subtitle(g: GameState, id: string): string {
  const n = action(g, id)
  return typeof n.subtitle === 'function' ? n.subtitle(g) : (n.subtitle ?? '')
}

describe('payScale', () => {
  it('is exactly 1 for the US from 2026, and follows the era and the country before that', () => {
    expect(payScale(life(2026, 'us'))).toBe(1)
    expect(payScale(life(2040, 'us'))).toBe(1)
    expect(payScale(life(1930, 'us'))).toBeCloseTo(0.3, 10)
    expect(payScale(life(2026, 'ng'))).toBeCloseTo(0.2, 10)
    expect(payScale(life(1930, 'ng'))).toBeCloseTo(0.06, 10)
    const g = life(1960, 'gb')
    expect(payScale(g)).toBeCloseTo(typicalIncome(g) / US_TYPICAL_INCOME, 10)
  })

  it('has a real-world ceiling and floor in every country and year', () => {
    for (const country of COUNTRIES) {
      for (const year of [1800, 1900, 1930, 1960, 1990, 2010, 2026, 2100]) {
        const s = payScale(life(year, country.id))
        expect(Number.isFinite(s), `${country.id} ${year}`).toBe(true)
        expect(s, `${country.id} ${year}`).toBeLessThanOrEqual(1.6)
        expect(s, `${country.id} ${year}`).toBeGreaterThan(0.02)
      }
    }
  })
})

describe('military pay tables', () => {
  it('pays the tables exactly for the US in 2026, at every level', () => {
    const g = life(2026, 'us')
    for (let level = 0; level < 10; level++) {
      expect(payFor(g, 'enlisted', level)).toBe(ENLISTED[level])
      expect(payFor(g, 'officer', level)).toBe(OFFICER[level])
    }
    expect(payFor(g, 'enlisted', 40)).toBe(75_000)
    expect(payFor(g, 'officer', 40)).toBe(207_000)
  })

  it('pays at most 0.31 times the tables in the US in 1930, in round hundreds', () => {
    const g = life(1930, 'us')
    for (let level = 0; level < 10; level++) {
      for (const [track, table] of [['enlisted', ENLISTED], ['officer', OFFICER]] as const) {
        const pay = payFor(g, track, level)
        expect(pay, `${track} ${level}`).toBeLessThanOrEqual(table[level] * 0.31)
        expect(pay, `${track} ${level}`).toBeGreaterThan(0)
        expect(pay % 100, `${track} ${level}`).toBe(0)
      }
    }
    expect(payFor(g, 'officer', 9)).toBeLessThan(65_000)
  })

  it('pays at most 0.2 times the tables in Nigeria in 2026', () => {
    const g = life(2026, 'ng')
    for (let level = 0; level < 10; level++) {
      expect(payFor(g, 'enlisted', level), `enlisted ${level}`).toBeLessThanOrEqual(ENLISTED[level] * 0.2)
      expect(payFor(g, 'officer', level), `officer ${level}`).toBeLessThanOrEqual(OFFICER[level] * 0.2)
    }
  })
})

describe('what the recruiter shows and what the job pays', () => {
  it('shows the tables in the US in 2026 and hires at them', () => {
    const g = life(2026, 'us')
    expect(subtitle(g, 'military.army.enlist')).toContain(`${formatMoney(21_000)}/yr`)
    expect(subtitle(g, 'military.army.officer')).toContain(`${formatMoney(44_000)}/yr`)
    action(g, 'military.army.enlist').run(g)
    expect(g.character.job?.salary).toBe(21_000)
    const o = life(2026, 'us')
    action(o, 'military.army.officer').run(o)
    expect(o.character.job?.salary).toBe(44_000)
  })

  it('shows the scaled amount in the menu and hires at it, for a private in 1930', () => {
    const g = life(1930, 'us')
    expect(subtitle(g, 'military.army.enlist')).toContain(`${formatMoney(6_300)}/yr`)
    expect(subtitle(g, 'military.army.enlist')).not.toContain(formatMoney(21_000))
    expect(subtitle(g, 'military.army.officer')).toContain(`${formatMoney(13_200)}/yr`)
    action(g, 'military.army.enlist').run(g)
    expect(g.character.job?.salary).toBe(6_300)
    expect(g.character.job?.salary).toBeLessThanOrEqual(21_000 * 0.31)
    const o = life(1930, 'us')
    action(o, 'military.army.officer').run(o)
    expect(o.character.job?.salary).toBe(13_200)
  })

  it('shows the scaled amount in the menu and hires at it, in Nigeria today', () => {
    const g = life(2026, 'ng')
    expect(subtitle(g, 'military.army.enlist')).toContain(`${formatMoney(4_200)}/yr`)
    expect(subtitle(g, 'military.army.officer')).toContain(`${formatMoney(8_800)}/yr`)
    action(g, 'military.army.enlist').run(g)
    expect(g.character.job?.salary).toBe(4_200)
    expect(g.character.job?.salary).toBeLessThanOrEqual(21_000 * 0.2)
  })

  it('pays a conscript 60 percent of the scaled private pay', () => {
    const draftee = (countryId: string): GameState => {
      const g = life(2026, countryId, 18)
      yearlyMilitary(g)
      const notice = g.queue.find((m): m is ChoiceModal => m.kind === 'choice' && m.title === 'Draft Notice')
      if (!notice) throw new Error(`no draft notice in ${countryId}`)
      g.queue = []
      runScript(g, notice.scriptId!, 'serve', notice.data, notice)
      return g
    }
    // Denmark's wealth is 1, so a conscript there earns what the old table gave.
    expect(militaryJob(draftee('dk'))?.salary).toBe(12_600)
    // Egypt's is 0.25: a private earns 5,300 (rounded to 100) and a conscript 60 percent of it.
    expect(militaryJob(draftee('eg'))?.salary).toBe(3_180)
  })

  it('pays the scaled amount on a promotion', () => {
    for (const [year, countryId, level, expected] of [[1930, 'us', 3, 9_300], [2026, 'us', 3, 31_000], [2026, 'ng', 3, 6_200]] as const) {
      let promoted = false
      for (let seed = 1; seed <= 80 && !promoted; seed++) {
        const g = life(year, countryId, 30, seed)
        hire(g, { defId: 'military.army', title: 'Corporal', company: 'Army', category: 'military', salary: 1, level: 2, performance: 100, data: { branch: 'army', track: 'enlisted', conscript: false, serviceLeft: 0, deployments: 0 } })
        const job = g.character.job!
        job.data.startAge = 20
        job.data.roleStartAge = 24
        yearlyMilitary(g)
        if (militaryJob(g)?.level === level) {
          promoted = true
          expect(militaryJob(g)?.salary, `${countryId} ${year}`).toBe(expected)
        }
      }
      expect(promoted, `${countryId} ${year}`).toBe(true)
    }
  })
})

describe('a saved job', () => {
  it('keeps its saved salary through a load and a quiet year, whatever the era says now', () => {
    const fixture = JSON.parse(gunzipSync(readFileSync('test/fixtures/save-v1.json.gz')).toString()) as Record<string, unknown>
    const raw = structuredClone(fixture) as unknown as GameState
    const age = raw.character.age
    raw.character.job = {
      defId: 'military.army',
      title: 'Sergeant',
      company: 'U.S. Army',
      category: 'military',
      salary: 36_000,
      level: 4,
      performance: 50,
      yearsInRole: 0,
      yearsAtCompany: 3,
      data: { branch: 'army', track: 'enlisted', conscript: false, serviceLeft: 0, deployments: 0, startAge: age - 3, roleStartAge: age },
    }
    const result = migrateSave(JSON.parse(JSON.stringify(raw)))
    if (result.kind !== 'ready') throw new Error(`expected a ready save, got ${result.kind}`)
    const game = result.game
    expect(militaryJob(game)?.salary).toBe(36_000)
    game.year = 1930
    game.queue = []
    yearlyMilitary(game)
    expect(militaryJob(game)?.salary).toBe(36_000)
  })
})

describe('Street Hustler takes', () => {
  function street(seed: number, year: number): GameState {
    const g = makeTestGame(seed, { age: 30, countryId: 'us', money: 1_000 })
    g.year = year
    hire(g, { defId: 'hustler', title: 'Scam Artist', company: 'Broadway', salary: 0, performance: 40, data: { act: 'monte', prop: 'sign', instrument: 'Bucket Drums', street: 'Broadway', traffic: 3, police: 1, rivals: 2, earnedYear: 0, sessionsYear: 0 } })
    prof(g, 'hustler', () => ({ skills: { monte: 40 }, totalEarned: 0, sessions: 0, arrests: 0, bestDay: 0 }))
    return g
  }

  function take(g: GameState): number {
    const work = hustlerJobNodes(g).find((n): n is MenuAction => n.type === 'action' && n.id === 'hustle.work')
    if (!work) throw new Error('no work action')
    work.run(g)
    return g.character.job!.data.earnedYear as number
  }

  it('Three Card Monte in 1930 pays at most 0.31 times what the same seed and state pay in 2026', () => {
    let paid = 0
    let total2026 = 0
    let total1930 = 0
    for (let seed = 1; seed <= 200; seed++) {
      const now = street(seed, 2026)
      const then = structuredClone(now)
      then.year = 1930
      const a = take(now)
      const b = take(then)
      if (a > 0) paid++
      total2026 += a
      total1930 += b
      expect(b, `seed ${seed}`).toBeLessThanOrEqual(a * 0.31)
      expect(b, `seed ${seed}`).toBe(Math.round(a * 0.3))
    }
    expect(paid).toBeGreaterThan(120)
    expect(total1930).toBeLessThanOrEqual(total2026 * 0.31)
    expect(total1930).toBeGreaterThan(0)
  })

  it('pays the same in the US from 2026 as it always did (the seeded takes do not move)', () => {
    const baseline = [0, 219, 0, 183, 181, 0, 0, 228]
    baseline.forEach((expected, i) => {
      const now = street(i + 1, 2026)
      const later = structuredClone(now)
      later.year = 2040
      expect(take(now), `seed ${i + 1}`).toBe(expected)
      expect(take(later), `seed ${i + 1} in 2040`).toBe(expected)
    })
  })
})
