// The money team record (advisors/team.ts): the owner-stamped record and its reader, the yearly offers,
// fees, gates, vetting, hiring and letting go. Everything read here is pure; only hire, release and
// writeTeam write.
import { describe, expect, it } from 'vitest'
import { defaultMandate, poolOf, type Mandate } from '../src/game/advisors/mandate'
import {
  advisorFee,
  hire,
  hireBlock,
  managerFee,
  managerRate,
  offersFor,
  ratingLabel,
  readTeam,
  release,
  teamOf,
  TERMS,
  vet,
  writeTeam,
  type Hire,
  type ManagerHire,
  type Offer,
  type Role,
  type Statement,
  type Team,
} from '../src/game/advisors/team'
import { formatMoney, netWorth } from '../src/game/core'
import { typicalIncome } from '../src/game/events/wealth-core'
import { investingBlocked } from '../src/game/history/markets'
import { managedBook } from '../src/game/investments'
import { COUNTRIES, NAME_POOLS, getCountry } from '../src/game/world'
import type { GameState, Json } from '../src/game/types'
import { deepFreeze } from './fuzz-kit'
import { client, own, withTeam } from './advisors-kit'

const ADV: Hire = { name: 'Ada Stone', skill: 70, since: 2020 }
const MGR: ManagerHire = { name: 'Ben Reed', skill: 60, since: 2021, claimed: 60, honest: true, rate: 0.01, skimmed: 0 }
const MANDATE: Mandate = { stocks: 60, reserve: 250_000, limit: 50 }
const LAST: Statement = { year: 2025, pool: 1_000_000, billed: 9_000, moved: 400_000, costs: 1_200, stocks: 58 }

/** The owner stamp the record must carry, spelled out here and not taken from the code under test. */
function ownerOf(g: GameState): string {
  return `${g.character.id}:${g.year - g.character.age}`
}

function full(g: GameState): Team {
  return { owner: ownerOf(g), advisorEpoch: 2, managerEpoch: 1, done: 2025, advisor: { ...ADV }, manager: { ...MGR }, mandate: { ...MANDATE }, last: { ...LAST } }
}

/** A record as raw JSON in the flags, with junk allowed anywhere. */
function raw(g: GameState): Record<string, Json> {
  return { ...(full(g) as unknown as Record<string, Json>), stray: 7 }
}

function put(g: GameState, v: unknown): void {
  g.flags['fin.team'] = v as Json
}

function isInt(n: unknown, lo: number, hi: number): boolean {
  return typeof n === 'number' && Number.isInteger(n) && n >= lo && n <= hi
}

function isNum(n: unknown, lo: number, hi: number): boolean {
  return typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi
}

/** Every field of a record read from junk is legal, and nothing unknown survives. */
function expectLegal(g: GameState, t: Team | null): void {
  expect(t).not.toBeNull()
  const team = t!
  expect(Object.keys(team).every((k) => ['owner', 'advisorEpoch', 'managerEpoch', 'done', 'advisor', 'manager', 'mandate', 'last'].includes(k))).toBe(true)
  expect(team.owner).toBe(ownerOf(g))
  for (const e of [team.advisorEpoch, team.managerEpoch, team.done]) if (e !== undefined) expect(isInt(e, 0, 1e6)).toBe(true)
  for (const h of [team.advisor, team.manager]) {
    if (!h) continue
    expect(typeof h.name === 'string' && h.name.length >= 1 && h.name.length <= 40).toBe(true)
    // eslint-disable-next-line no-control-regex
    expect(/[\u0000-\u001f\u007f-\u009f]/.test(h.name)).toBe(false)
    expect(isNum(h.skill, 20, 99)).toBe(true)
    expect(isInt(h.since, 1800, 2300)).toBe(true)
  }
  if (team.advisor) expect(Object.keys(team.advisor).sort()).toEqual(['name', 'since', 'skill'])
  if (team.manager) {
    const m = team.manager
    expect(Object.keys(m).sort()).toEqual(['claimed', 'honest', 'name', 'rate', 'since', 'skill', 'skimmed'])
    expect(isNum(m.claimed, 20, 99)).toBe(true)
    expect(isNum(m.rate, 0.002, 0.03)).toBe(true)
    expect(isNum(m.skimmed, 0, 1e15)).toBe(true)
    expect(typeof m.honest).toBe('boolean')
    const d = team.mandate
    expect(d).toBeDefined()
    expect(Object.keys(d!).sort()).toEqual(['limit', 'reserve', 'stocks'])
    expect(isInt(d!.stocks, 0, 100) && d!.stocks % 5 === 0).toBe(true)
    expect(isInt(d!.limit, 10, 100) && d!.limit % 5 === 0).toBe(true)
    expect(isInt(d!.reserve, 0, 1e15)).toBe(true)
  } else {
    expect(team.mandate).toBeUndefined()
    expect(team.last).toBeUndefined()
  }
  if (team.last) {
    const l = team.last
    expect(Object.keys(l).sort()).toEqual(['billed', 'costs', 'moved', 'pool', 'stocks', 'year'])
    expect(isInt(l.year, 1800, 2300)).toBe(true)
    for (const k of ['pool', 'billed', 'moved', 'costs'] as const) expect(isNum(l[k], 0, 1e15)).toBe(true)
    expect(isInt(l.stocks, 0, 100)).toBe(true)
  }
}

/** A life of its own: same character, but a different life id, so offers and markets differ. */
function life(i: number, over: { countryId?: string; money?: number; year?: number } = {}): GameState {
  const g = client(11, over)
  g.lifeId = `team-life-${i}`
  return g
}

function offerNames(g: GameState, role: Role): string[] {
  return offersFor(g, role).map((o) => o.name)
}

describe('the record', () => {
  it("reads nothing from nothing, and from other people's records", () => {
    const g = client()
    expect(readTeam(g)).toBeNull()
    withTeam(g, { advisor: { ...ADV } })
    expect(readTeam(g)).not.toBeNull()

    const other = structuredClone(g)
    other.flags['fin.team'] = { ...(other.flags['fin.team'] as Record<string, Json>), owner: 'someone-else:1980' }
    expect(readTeam(other)).toBeNull()

    const heir = structuredClone(g)
    heir.character.id = 'heir'
    expect(readTeam(heir)).toBeNull()
    // The birth year is part of the stamp, so a character who is "the same id" born in another year is no match.
    const reborn = structuredClone(g)
    reborn.character.age += 1
    expect(readTeam(reborn)).toBeNull()

    for (const v of [5, 'x', null, true, [], [1, 2], {}, { owner: 7 }, { advisor: ADV }]) {
      const junk = client()
      put(junk, v)
      expect(readTeam(junk)).toBeNull()
    }
  })

  it('round trips through JSON', () => {
    const g = client()
    withTeam(g, full(g))
    const back: GameState = JSON.parse(JSON.stringify(g))
    expect(readTeam(back)).toEqual(readTeam(g))
    expect(readTeam(back)).toEqual(full(g))
  })

  it('stamps the owner as the character id and birth year', () => {
    const g = client()
    withTeam(g, { advisor: { ...ADV } })
    expect((g.flags['fin.team'] as Record<string, Json>).owner).toBe(ownerOf(g))
  })

  it('reads hostile fields as the nearest legal value', () => {
    const paths: string[][] = [
      ['advisorEpoch'], ['managerEpoch'], ['done'],
      ['advisor', 'name'], ['advisor', 'skill'], ['advisor', 'since'],
      ['manager', 'name'], ['manager', 'skill'], ['manager', 'since'], ['manager', 'claimed'], ['manager', 'honest'], ['manager', 'rate'], ['manager', 'skimmed'],
      ['mandate', 'stocks'], ['mandate', 'reserve'], ['mandate', 'limit'],
      ['last', 'year'], ['last', 'pool'], ['last', 'billed'], ['last', 'moved'], ['last', 'costs'], ['last', 'stocks'],
    ]
    const junk: Json[] = ['x', null, -1, 1e300, NaN, Infinity, -Infinity, [], { a: 1 }, true, 0, 7.6, '', '12']
    for (const path of paths) {
      for (const bad of junk) {
        const g = client()
        const r = raw(g)
        const holder = path.length === 1 ? r : (r[path[0]] as Record<string, Json>)
        holder[path[path.length - 1]] = bad
        put(g, r)
        const before = structuredClone(g.flags['fin.team'])
        expectLegal(g, readTeam(g))
        expect(g.flags['fin.team'], `${path.join('.')} = ${String(bad)} was changed`).toEqual(before)
      }
    }
  })

  it('drops a part that is not an object, and a hire with no name', () => {
    for (const bad of ['x', null, 5, [], [ADV], true] as Json[]) {
      const g = client()
      const r = raw(g)
      r.advisor = bad
      r.manager = bad
      r.last = bad
      r.mandate = bad
      put(g, r)
      const t = readTeam(g)!
      expect(t.advisor).toBeUndefined()
      expect(t.manager).toBeUndefined()
      expect(t.mandate).toBeUndefined()
      expect(t.last).toBeUndefined()
      expectLegal(g, t)
    }
    for (const name of [42, null, '', '   ', '\n\t', [], {}] as Json[]) {
      const g = client()
      const r = raw(g)
      ;(r.advisor as Record<string, Json>).name = name
      ;(r.manager as Record<string, Json>).name = name
      put(g, r)
      const t = readTeam(g)!
      expect(t.advisor).toBeUndefined()
      expect(t.manager).toBeUndefined()
      expect(t.mandate, 'a mandate without a manager is dropped').toBeUndefined()
      expect(t.last, 'a statement without a manager is dropped').toBeUndefined()
      expectLegal(g, t)
    }
  })

  it('cuts long names, removes control characters and drops unknown keys', () => {
    const g = client()
    const r = raw(g)
    ;(r.advisor as Record<string, Json>).name = 'a'.repeat(100)
    ;(r.advisor as Record<string, Json>).extra = { deep: 1 }
    ;(r.manager as Record<string, Json>).name = 'Ben\u0000 \u001fReed\n\u007f'
    ;(r.mandate as Record<string, Json>).extra = 1
    ;(r.last as Record<string, Json>).extra = 1
    // An own "__proto__" key, as JSON.parse makes one, is just another unknown key.
    const text = JSON.stringify(r).replace('"stray":7', '"__proto__":{"polluted":true},"stray":7')
    put(g, JSON.parse(text))
    const t = readTeam(g)!
    expect(t.advisor!.name).toBe('a'.repeat(40))
    expect(t.manager!.name).toBe('Ben Reed')
    expect(Object.keys(t)).not.toContain('stray')
    expect(Object.keys(t)).not.toContain('__proto__')
    expect((t as unknown as { polluted?: boolean }).polluted).toBeUndefined()
    expectLegal(g, t)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('reads numbers to the nearest legal value and honest to true unless exactly false', () => {
    const g = client()
    const r = raw(g)
    const adv = r.advisor as Record<string, Json>
    const mgr = r.manager as Record<string, Json>
    adv.skill = -1
    adv.since = 1e300
    mgr.skill = 1e300
    mgr.claimed = 3
    mgr.rate = 1e300
    mgr.skimmed = -50
    mgr.honest = 'no'
    ;(r.mandate as Record<string, Json>).stocks = 47
    ;(r.mandate as Record<string, Json>).limit = 3
    ;(r.mandate as Record<string, Json>).reserve = -9
    ;(r.last as Record<string, Json>).stocks = 58.4
    put(g, r)
    const t = readTeam(g)!
    expect(t.advisor).toMatchObject({ skill: 20, since: 2300 })
    expect(t.manager).toMatchObject({ skill: 99, claimed: 20, rate: 0.03, skimmed: 0, honest: true })
    expect(t.mandate).toEqual({ stocks: 45, limit: 10, reserve: 0 })
    expect(t.last!.stocks).toBe(58)

    mgr.honest = false
    put(g, r)
    expect(readTeam(g)!.manager!.honest).toBe(false)
    mgr.honest = null
    put(g, r)
    expect(readTeam(g)!.manager!.honest).toBe(true)
  })

  it('drops a statement that holds a bad number, and gives a manager without a mandate the default', () => {
    const g = client(11, { money: 3_000_000 })
    const r = raw(g)
    ;(r.last as Record<string, Json>).pool = 'lots'
    delete r.mandate
    put(g, r)
    const t = readTeam(g)!
    expect(t.last).toBeUndefined()
    expect(t.mandate).toEqual(defaultMandate(managedBook(g), typicalIncome(g)))
  })

  it('returns a copy: changing the result never changes the game', () => {
    const g = client()
    withTeam(g, full(g))
    const before = structuredClone(g.flags['fin.team'])
    const t = readTeam(g)!
    t.manager!.skill = 99
    t.advisor!.name = 'Changed'
    t.mandate!.stocks = 0
    t.last!.pool = 1
    const e = teamOf(g)
    e.advisorEpoch = 9
    expect(g.flags['fin.team']).toEqual(before)
  })

  it('teamOf is the stored record or an empty one for this character, and is never stored', () => {
    const g = client()
    expect(teamOf(g)).toEqual({ owner: ownerOf(g) })
    expect(g.flags['fin.team']).toBeUndefined()
    withTeam(g, { advisor: { ...ADV } })
    expect(teamOf(g)).toEqual(readTeam(g))
    const heir = structuredClone(g)
    heir.character.id = 'heir'
    expect(teamOf(heir)).toEqual({ owner: ownerOf(heir) })
  })

  it('writeTeam stores read-shaped data and removes the key when nothing is left', () => {
    const g = client()
    writeTeam(g, { owner: 'someone-else:1', advisor: { ...ADV, name: ` ${'z'.repeat(60)} ` } })
    expect((g.flags['fin.team'] as Record<string, Json>).owner).toBe(ownerOf(g))
    expect(readTeam(g)!.advisor!.name).toBe('z'.repeat(40))
    expect(JSON.parse(JSON.stringify(g.flags['fin.team']))).toEqual(g.flags['fin.team'])

    // Epochs keep the key (they pick the next offers); with none, and no hires, the key goes.
    writeTeam(g, { owner: ownerOf(g), advisorEpoch: 1 })
    expect(readTeam(g)).toEqual({ owner: ownerOf(g), advisorEpoch: 1 })
    writeTeam(g, { owner: ownerOf(g), advisorEpoch: 0, managerEpoch: 0, done: 2026 })
    expect('fin.team' in g.flags).toBe(false)
    writeTeam(g, { owner: ownerOf(g) })
    expect('fin.team' in g.flags).toBe(false)
  })

  it('writeTeam never stores what the reader would refuse', () => {
    const g = client()
    const bad = { owner: ownerOf(g), manager: { name: 'Ben', skill: NaN, since: 'x', claimed: 1e9, honest: 'maybe', rate: -3, skimmed: Infinity }, mandate: { stocks: 'x', reserve: NaN, limit: 1e9 }, last: { year: 2025 } } as unknown as Team
    writeTeam(g, bad)
    expectLegal(g, readTeam(g))
    const stored = JSON.stringify(g.flags['fin.team'])
    expect(stored).not.toMatch(/null|NaN|Infinity/)
  })
})

describe('offers', () => {
  it('are three per role, stable, different next year and after a release', () => {
    const g = client(11, { money: 20_000_000 })
    for (const role of ['advisor', 'manager'] as const) {
      const list = offersFor(g, role)
      expect(list).toHaveLength(TERMS.offers)
      expect(list.map((o) => o.slot)).toEqual([0, 1, 2])
      expect(list.every((o) => o.role === role)).toBe(true)
      for (const o of list) {
        expect(o.name.length).toBeGreaterThanOrEqual(1)
        expect(o.name.length).toBeLessThanOrEqual(40)
        expect(o.skill).toBeGreaterThanOrEqual(30)
        expect(o.skill).toBeLessThanOrEqual(92)
        expect(Number.isInteger(o.skill)).toBe(true)
      }
      expect(new Set(list.map((o) => o.name)).size).toBe(3)
      expect(offersFor(g, role)).toEqual(list)
      expect(offersFor(JSON.parse(JSON.stringify(g)) as GameState, role)).toEqual(list)

      const later = client(11, { money: 20_000_000 })
      later.year += 1
      later.character.age += 1
      expect(offersFor(later, role)).not.toEqual(list)
    }

    // A release bumps that role's epoch, and the list changes for that role only.
    withTeam(g, { advisor: { ...ADV }, manager: { ...MGR } })
    const advBefore = offersFor(g, 'advisor')
    const mgrBefore = offersFor(g, 'manager')
    release(g, 'advisor')
    expect(offersFor(g, 'advisor')).not.toEqual(advBefore)
    expect(offersFor(g, 'manager')).toEqual(mgrBefore)
  })

  it('differ between lives and between roles', () => {
    expect(offerNames(life(1), 'manager')).not.toEqual(offerNames(life(2), 'manager'))
    const g = life(3)
    expect(offerNames(g, 'advisor')).not.toEqual(offerNames(g, 'manager'))
  })

  it('draw names from the country, and stay distinct and short in every country', () => {
    for (const c of COUNTRIES) {
      const g = client(11, { countryId: c.id })
      const pool = NAME_POOLS[getCountry(c.id).names]
      for (const role of ['advisor', 'manager'] as const) {
        const list = offersFor(g, role)
        expect(new Set(list.map((o) => o.name)).size, c.id).toBe(3)
        for (const o of list) {
          // First and last names can both have several words, so try every split.
          const parts = o.name.split(' ')
          const firsts = [...pool.male, ...pool.female]
          const fits = parts.some((_, i) => i > 0 && firsts.includes(parts.slice(0, i).join(' ')) && pool.last.includes(parts.slice(i).join(' ')))
          expect(fits, `${c.id}: ${o.name}`).toBe(true)
          expect(o.name.length).toBeGreaterThan(0)
          expect(o.name.length).toBeLessThanOrEqual(40)
        }
      }
    }
  })

  it('give a crook a claim above the skill, and an honest hire the true rating', () => {
    let crooks = 0
    let all = 0
    for (let i = 0; i < 600; i++) {
      const g = life(i)
      for (const o of offersFor(g, 'manager')) {
        all++
        if (!o.honest) {
          crooks++
          expect(o.claimed).toBeGreaterThan(o.skill)
          expect(o.claimed).toBeLessThanOrEqual(97)
          // 12 to 25 above, except where the cap of 97 stops it.
          expect(o.claimed === 97 || (o.claimed - o.skill >= 12 && o.claimed - o.skill <= 25)).toBe(true)
          if (o.skill <= 85) expect(o.claimed - o.skill).toBeGreaterThanOrEqual(12)
        } else {
          expect(o.claimed).toBe(o.skill)
        }
      }
      for (const o of offersFor(g, 'advisor')) {
        expect(o.honest).toBe(true)
        expect(o.claimed).toBe(o.skill)
      }
    }
    expect(all).toBe(1800)
    // About one in eight.
    expect(crooks / all).toBeGreaterThan(0.08)
    expect(crooks / all).toBeLessThan(0.16)
  })

  it('spread skill over the range with a middle that is common', () => {
    const skills: number[] = []
    for (let i = 0; i < 400; i++) for (const o of offersFor(life(i), 'advisor')) skills.push(o.skill)
    const mean = skills.reduce((s, x) => s + x, 0) / skills.length
    expect(mean).toBeGreaterThan(55)
    expect(mean).toBeLessThan(67)
    expect(Math.min(...skills)).toBeLessThan(45)
    expect(Math.max(...skills)).toBeGreaterThan(80)
  })
})

describe('fees', () => {
  it('follow wealth and skill, and have a floor', () => {
    const g = client(11, { money: 100_000_000 })
    const T = typicalIncome(g)
    const floor = Math.round(0.1 * T)
    expect(advisorFee(g, 90)).toBeGreaterThan(advisorFee(g, 40))
    expect(advisorFee(g, 40)).toBeGreaterThan(floor)

    const poor = client(11, { money: 0 })
    expect(advisorFee(poor, 99)).toBe(Math.round(0.1 * typicalIncome(poor)))
    const debtor = client(11, { money: -5_000_000 })
    expect(netWorth(debtor)).toBeLessThan(0)
    expect(advisorFee(debtor, 99)).toBe(Math.round(0.1 * typicalIncome(debtor)))

    const richer = client(11, { money: 1_000_000_000 })
    expect(advisorFee(richer, 60)).toBeGreaterThan(advisorFee(g, 60))

    const trillion = client(11, { money: 1e12 })
    for (const skill of [20, 60, 99]) {
      const f = advisorFee(trillion, skill) / netWorth(trillion)
      expect(f).toBeGreaterThanOrEqual(0.0015)
      expect(f).toBeLessThanOrEqual(0.004 + 1e-9)
    }
    expect(advisorFee(trillion, 99)).toBeGreaterThan(advisorFee(trillion, 20))
  })

  it('give the manager a rate that follows the claim, and a bill that follows the pool', () => {
    expect(managerRate(40)).toBeLessThan(managerRate(90))
    for (const c of [20, 40, 90, 99]) {
      expect(managerRate(c)).toBeGreaterThanOrEqual(0.004)
      expect(managerRate(c)).toBeLessThanOrEqual(0.014)
    }
    expect(managerRate(50)).toBe(0.009)
    // Rounded to a hundredth of a percent: 0.004 + 0.010 x 73 / 100 = 0.0113.
    expect(managerRate(73)).toBe(0.0113)
    expect(managerRate(33)).toBe(0.0073)

    const g = client(11, { money: 50_000_000 })
    const T = typicalIncome(g)
    expect(managerFee(g, 0.01, 0)).toBe(Math.round(0.1 * T))
    expect(managerFee(g, 0.01, 10_000_000)).toBe(100_000)
    expect(managerFee(g, 0.012, 10_000_000)).toBeGreaterThan(managerFee(g, 0.008, 10_000_000))
    expect(managerFee(g, 0.01, 20_000_000)).toBeGreaterThan(managerFee(g, 0.01, 10_000_000))
  })

  it('stay finite on bad input', () => {
    const g = client()
    for (const bad of [NaN, Infinity, -Infinity, -5]) {
      expect(Number.isFinite(advisorFee(g, bad))).toBe(true)
      expect(Number.isFinite(managerFee(g, bad, bad))).toBe(true)
      expect(Number.isFinite(managerRate(bad))).toBe(true)
    }
  })
})

describe('ratings', () => {
  it('are Junior under 45, Experienced under 65, Senior under 82, else Top-tier', () => {
    expect(ratingLabel(30)).toBe('Junior')
    expect(ratingLabel(44.9)).toBe('Junior')
    expect(ratingLabel(45)).toBe('Experienced')
    expect(ratingLabel(64)).toBe('Experienced')
    expect(ratingLabel(65)).toBe('Senior')
    expect(ratingLabel(81)).toBe('Senior')
    expect(ratingLabel(82)).toBe('Top-tier')
    expect(ratingLabel(99)).toBe('Top-tier')
    expect(ratingLabel(NaN)).toBe('Junior')
  })
})

describe('gates', () => {
  it('say who is not alive, a minor, or in prison, first', () => {
    const dead = client(11, { money: 50_000_000 })
    dead.character.alive = false
    for (const role of ['advisor', 'manager'] as const) expect(hireBlock(dead, role)).toBe("You're no longer alive.")

    const kid = client(11, { age: 17, money: 50_000_000 })
    for (const role of ['advisor', 'manager'] as const) expect(hireBlock(kid, role)).toBe('You must be 18 or older.')

    const con = client(11, { money: 50_000_000 })
    con.character.prison = { crime: 'Fraud', yearsTotal: 3, yearsServed: 0, security: 'minimum', respect: 50 } as unknown as GameState['character']['prison']
    for (const role of ['advisor', 'manager'] as const) expect(hireBlock(con, role)).toBe("Your money team can't work while you're in prison.")

    // Dead beats a minor beats a prisoner.
    const all = client(11, { age: 17, money: 50_000_000 })
    all.character.alive = false
    all.character.prison = con.character.prison
    expect(hireBlock(all, 'advisor')).toBe("You're no longer alive.")
    all.character.alive = true
    expect(hireBlock(all, 'advisor')).toBe('You must be 18 or older.')
  })

  it('refuse a second hire of the same role, and no other', () => {
    const g = client(11, { money: 50_000_000 })
    expect(hireBlock(g, 'advisor')).toBeNull()
    expect(hireBlock(g, 'manager')).toBeNull()
    withTeam(g, { advisor: { ...ADV } })
    expect(hireBlock(g, 'advisor')).toBe('You already have an advisor.')
    expect(hireBlock(g, 'manager')).toBeNull()
    withTeam(g, { manager: { ...MGR } })
    expect(hireBlock(g, 'manager')).toBe('You already have a manager.')
  })

  it('want a net worth of 25 years of typical income for an advisor', () => {
    const g = client(11, { money: 0 })
    const T = typicalIncome(g)
    g.character.money = 25 * T - 1
    expect(hireBlock(g, 'advisor')).toBe(`Advisors take clients worth at least ${formatMoney(25 * T)}.`)
    g.character.money = 25 * T
    expect(netWorth(g)).toBe(25 * T)
    expect(hireBlock(g, 'advisor')).toBeNull()
  })

  it('want a managed pool of 10 years of typical income for a manager, counted at the default reserve', () => {
    const g = client(11, { money: 0 })
    const T = typicalIncome(g)
    const reserve = defaultMandate(managedBook(g), T).reserve
    // Below 20 T the default reserve is two years of income, rounded up to two digits.
    g.character.money = 10 * T + reserve
    expect(defaultMandate(managedBook(g), T).reserve).toBe(reserve)
    expect(poolOf(managedBook(g), reserve)).toBe(10 * T)
    expect(hireBlock(g, 'manager')).toBeNull()

    g.character.money -= 1
    const pool = poolOf(managedBook(g), defaultMandate(managedBook(g), T).reserve)
    expect(pool).toBe(10 * T - 1)
    expect(hireBlock(g, 'manager')).toBe(`Managers take accounts of at least ${formatMoney(10 * T)}. Yours is ${formatMoney(pool)}.`)

    // Holdings count toward the pool, and cash under the reserve does not.
    const h = client(11, { money: 0 })
    h.character.money = 30 * T
    own(h, 'index', 12 * T)
    expect(hireBlock(h, 'manager')).toBeNull()
    const thin = client(11, { money: 0 })
    thin.character.money = 1.5 * T
    expect(hireBlock(thin, 'manager')).toMatch(/^Managers take accounts of at least .* Yours is /)
    expect(poolOf(managedBook(thin), defaultMandate(managedBook(thin), T).reserve)).toBe(0)
  })

  it('give the manager the idle reason when nothing can be traded', () => {
    let hit: { countryId: string; year: number } | null = null
    for (const countryId of ['cn', 'cu', 'ru', 'ir']) {
      for (let year = 1950; year <= 1990 && !hit; year++) if (investingBlocked(countryId, year)) hit = { countryId, year }
      if (hit) break
    }
    expect(hit).not.toBeNull()
    const g = client(4, { ...hit!, money: 50_000_000 })
    expect(managedBook(g).idle).toBeTruthy()
    expect(hireBlock(g, 'manager')).toBe(managedBook(g).idle)
    // The advisor reads facts, so a shut market does not stop one.
    expect(hireBlock(g, 'advisor')).toBeNull()
  })
})

describe('vetting', () => {
  it('is null without an advisor', () => {
    const g = client(11, { money: 50_000_000 })
    for (const o of offersFor(g, 'manager')) expect(vet(g, o)).toBeNull()
  })

  function sample(skill: number, lives: number): { offers: number; vetted: number; flagged: number; wrongFlag: number; crooks: number } {
    let vetted = 0
    let flagged = 0
    let wrongFlag = 0
    let crooks = 0
    let offers = 0
    for (let i = 0; i < lives; i++) {
      const g = life(i)
      withTeam(g, { advisor: { name: 'Ada Stone', skill, since: 2020 } })
      for (const o of offersFor(g, 'manager')) {
        offers++
        if (!o.honest) crooks++
        const v = vet(g, o)
        if (!v) continue
        vetted++
        expect(v.skill).toBe(o.skill)
        if (v.flagged) flagged++
        if (v.flagged !== !o.honest) wrongFlag++
      }
    }
    return { offers, vetted, flagged, wrongFlag, crooks }
  }

  it('is stable, honest and partial', () => {
    const strong = sample(99, 300)
    expect(strong.vetted / strong.offers).toBeGreaterThanOrEqual(0.95)
    expect(strong.wrongFlag).toBe(0)
    expect(strong.flagged).toBeGreaterThan(0)

    const weak = sample(20, 300)
    expect(weak.vetted / weak.offers).toBeLessThan(0.4)
    expect(weak.vetted).toBeGreaterThan(0)
    expect(weak.wrongFlag).toBe(0)

    // The same game answers the same on every call and after a save.
    const g = life(5)
    withTeam(g, { advisor: { ...ADV } })
    const once = offersFor(g, 'manager').map((o) => vet(g, o))
    const twice = offersFor(g, 'manager').map((o) => vet(g, o))
    const saved = JSON.parse(JSON.stringify(g)) as GameState
    expect(twice).toEqual(once)
    expect(offersFor(saved, 'manager').map((o) => vet(saved, o))).toEqual(once)
  })

  it('never flags an honest offer, whatever the advisor', () => {
    for (let i = 0; i < 100; i++) {
      const g = life(i)
      withTeam(g, { advisor: { name: `Pat ${i}`, skill: 20 + (i % 80), since: 2020 } })
      for (const o of [...offersFor(g, 'manager'), ...offersFor(g, 'advisor')]) if (o.honest) expect(vet(g, o)?.flagged ?? false).toBe(false)
    }
  })

  it('depends on who the advisor is', () => {
    const g = life(7)
    withTeam(g, { advisor: { name: 'Ada Stone', skill: 50, since: 2020 } })
    const a = offersFor(g, 'manager').map((o) => vet(g, o) !== null)
    const results = new Set<string>()
    for (let i = 0; i < 40; i++) {
      withTeam(g, { advisor: { name: `Advisor ${i}`, skill: 50, since: 2020 } })
      results.add(offersFor(g, 'manager').map((o) => vet(g, o) !== null).join())
    }
    expect(results.size).toBeGreaterThan(1)
    expect(a).toHaveLength(3)
  })
})

describe('hire', () => {
  it('writes the record and moves no money', () => {
    const g = client(11, { money: 20_000_000 })
    const money = g.character.money
    const advisor = offersFor(g, 'advisor')[1]
    expect(hire(g, 'advisor', 1)).toBe(true)
    expect(readTeam(g)!.advisor).toEqual({ name: advisor.name, skill: advisor.skill, since: g.year })
    expect(g.character.money).toBe(money)
    expect(g.log.flatMap((y) => y.entries).map((e) => e.text)).toContain(`I hired ${advisor.name} as my financial advisor.`)

    const offer = offersFor(g, 'manager')[2]
    expect(hire(g, 'manager', 2)).toBe(true)
    const t = readTeam(g)!
    expect(t.manager).toEqual({ name: offer.name, skill: offer.skill, claimed: offer.claimed, honest: offer.honest, rate: managerRate(offer.claimed), skimmed: 0, since: g.year })
    expect(t.mandate).toEqual(defaultMandate(managedBook(g), typicalIncome(g)))
    expect(g.character.money).toBe(money)
    expect(g.log.flatMap((y) => y.entries).map((e) => e.text)).toContain(`I hired ${offer.name} as my financial manager.`)
    expect(g.queue).toHaveLength(0)
  })

  it('does not change what was hired when the offers are read again', () => {
    const g = client(11, { money: 20_000_000 })
    const before: Offer[] = offersFor(g, 'manager')
    hire(g, 'manager', 0)
    expect(readTeam(g)!.manager!.name).toBe(before[0].name)
  })

  it('refuses a second hire of the same role and changes nothing', () => {
    const g = client(11, { money: 20_000_000 })
    expect(hire(g, 'advisor', 0)).toBe(true)
    const snap = JSON.stringify(g)
    expect(hire(g, 'advisor', 1)).toBe(false)
    expect(hire(g, 'advisor', 0)).toBe(false)
    expect(JSON.stringify(g)).toBe(snap)
  })

  it('refuses a gate failure and writes nothing', () => {
    const g = client(11, { money: 1_000 })
    const snap = JSON.stringify(g)
    expect(hire(g, 'advisor', 0)).toBe(false)
    expect(hire(g, 'manager', 0)).toBe(false)
    expect(JSON.stringify(g)).toBe(snap)
    expect(g.flags['fin.team']).toBeUndefined()
  })

  it('refuses a bad slot or role', () => {
    const g = client(11, { money: 20_000_000 })
    const snap = JSON.stringify(g)
    for (const slot of [7, 3, -1, 1.5, NaN, Infinity]) expect(hire(g, 'advisor', slot)).toBe(false)
    expect(hire(g, 'banker' as Role, 0)).toBe(false)
    expect(JSON.stringify(g)).toBe(snap)
  })

  it('lets two roles be hired one after the other', () => {
    const g = client(11, { money: 20_000_000 })
    expect(hire(g, 'manager', 0)).toBe(true)
    expect(hire(g, 'advisor', 0)).toBe(true)
    const t = readTeam(g)!
    expect(t.advisor).toBeDefined()
    expect(t.manager).toBeDefined()
    expect(t.mandate).toBeDefined()
  })

  it('draws nothing from g.rng', () => {
    const g = client(11, { money: 20_000_000 })
    const rng = g.rng
    hire(g, 'advisor', 0)
    hire(g, 'manager', 1)
    release(g, 'manager')
    expect(g.rng).toBe(rng)
  })
})

describe('release', () => {
  it('removes the hire, bumps the epoch and changes the offers, at no cost', () => {
    const g = client(11, { money: 20_000_000 })
    hire(g, 'advisor', 0)
    hire(g, 'manager', 0)
    const mgrName = readTeam(g)!.manager!.name
    const advName = readTeam(g)!.advisor!.name
    withTeam(g, { last: { ...LAST } })
    const money = g.character.money
    const offers = offersFor(g, 'manager')

    release(g, 'manager')
    const t = readTeam(g)!
    expect(t.manager).toBeUndefined()
    expect(t.mandate).toBeUndefined()
    expect(t.last).toBeUndefined()
    expect(t.managerEpoch).toBe(1)
    expect(t.advisor!.name).toBe(advName)
    expect(t.advisorEpoch).toBeUndefined()
    expect(g.character.money).toBe(money)
    expect(offersFor(g, 'manager')).not.toEqual(offers)
    expect(g.log.flatMap((y) => y.entries).map((e) => e.text)).toContain(`I let ${mgrName} go.`)

    release(g, 'advisor')
    expect(readTeam(g)!.advisor).toBeUndefined()
    expect(readTeam(g)!.advisorEpoch).toBe(1)
    expect(g.log.flatMap((y) => y.entries).map((e) => e.text)).toContain(`I let ${advName} go.`)
    expect(g.character.money).toBe(money)
  })

  it('does nothing when there is nobody to let go', () => {
    const g = client(11, { money: 20_000_000 })
    const snap = JSON.stringify(g)
    release(g, 'manager')
    release(g, 'advisor')
    expect(JSON.stringify(g)).toBe(snap)
    hire(g, 'advisor', 0)
    const mid = JSON.stringify(g)
    release(g, 'manager')
    expect(JSON.stringify(g)).toBe(mid)
  })

  it('lets a new manager start from the default mandate', () => {
    const g = client(11, { money: 20_000_000 })
    hire(g, 'manager', 0)
    withTeam(g, { mandate: { stocks: 15, reserve: 7_000_000, limit: 25 } })
    release(g, 'manager')
    hire(g, 'manager', 1)
    expect(readTeam(g)!.mandate).toEqual(defaultMandate(managedBook(g), typicalIncome(g)))
  })

  it('keeps the epoch through a save, so an old offer does not come back', () => {
    const g = client(11, { money: 20_000_000 })
    const first = offersFor(g, 'advisor')
    hire(g, 'advisor', 0)
    release(g, 'advisor')
    const saved = JSON.parse(JSON.stringify(g)) as GameState
    expect(offersFor(saved, 'advisor')).toEqual(offersFor(g, 'advisor'))
    expect(offersFor(saved, 'advisor')).not.toEqual(first)
  })
})

describe('purity', () => {
  it('reads and offers neither write nor draw', () => {
    const g = client(11, { money: 20_000_000 })
    withTeam(g, full(g))
    const lonely = client(12, { money: 20_000_000 })
    withTeam(lonely, { manager: { ...MGR } })
    delete (lonely.flags['fin.team'] as Record<string, Json>).mandate
    for (const game of [g, lonely, client(13)]) {
      const frozen = deepFreeze(game)
      const json = JSON.stringify(frozen)
      const rng = frozen.rng
      readTeam(frozen)
      teamOf(frozen)
      for (const role of ['advisor', 'manager'] as const) {
        const list = offersFor(frozen, role)
        hireBlock(frozen, role)
        for (const o of list) vet(frozen, o)
      }
      advisorFee(frozen, 80)
      managerFee(frozen, 0.01, 1_000_000)
      expect(JSON.stringify(frozen)).toBe(json)
      expect(frozen.rng).toBe(rng)
    }
  })
})
