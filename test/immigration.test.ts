import { describe, expect, it, vi } from 'vitest'
vi.mock('../src/game/crime', () => ({ arrestPlayer: vi.fn() }))
import { emigrateMenu } from '../src/game/activities/emigrate'
import { applyRoute, requestExitPermit, resolvePending, sneakIn } from '../src/game/activities/immigration-apply'
import { lockAssets } from '../src/game/activities/immigration-move'
import { expectedLockValue, findRoute, routesTo, type RouteEval } from '../src/game/activities/immigration-routes'
import { citizenshipsOf, heirCitizenships, immState, statusOf, updateImm } from '../src/game/activities/immigration-state'
import { counter } from '../src/game/core'
import { passportStrength } from '../src/game/data/immigration'
import { immigrationSummary, legalWorkProblem, yearlyImmigration } from '../src/game/immigration'
import { createPerson } from '../src/game/people'
import { runScript } from '../src/game/scripts'
import type { GameState, MenuGroup, ModalItem } from '../src/game/types'
import { makeTestGame } from './helpers'

// ---------------------------------------------------------------------------
// Helpers

interface AdultOpts {
  country: string
  year: number
  money?: number
  degree?: boolean
  experience?: number
  seed?: number
  age?: number
}

/** An adult citizen of `country` living there in `year` (a bachelor's in CS and some experience by default). */
function adult(o: AdultOpts): GameState {
  const g = makeTestGame(o.seed ?? 7, { age: o.age ?? 30, countryId: o.country, birthCountryId: o.country, citizenships: [o.country], money: o.money ?? 60_000 })
  g.year = o.year
  g.log = [{ age: o.age ?? 30, year: o.year, entries: [] }]
  if (o.degree !== false) {
    g.character.education.degrees = [
      { kind: 'highschool', name: 'High School Diploma', school: 'Central High' } as never,
      { kind: 'bachelor', name: 'Bachelor of Computer Science', school: 'State University', major: 'Computer Science' } as never,
    ]
  }
  const exp = o.experience ?? 7
  if (exp > 0) g.character.careerHistory = [{ title: 'Computer Programmer', company: 'Byteworks', startAge: 30 - exp, endAge: 29, reason: 'quit', salary: 70_000 }]
  return g
}

function route(g: GameState, dest: string, key: string): RouteEval {
  const r = routesTo(g, dest).find((x) => x.key === key)
  if (!r) throw new Error(`no route ${key} to ${dest}: ${routesTo(g, dest).map((x) => x.key).join(', ')}`)
  return r
}

function choose(g: GameState, pick: (m: Extract<ModalItem, { kind: 'choice' }>) => string = (m) => m.choices[0].id): void {
  for (let guard = 0; guard < 60 && g.queue.length; guard++) {
    const m = g.queue.shift()!
    if (m.kind === 'choice' && m.scriptId) runScript(g, m.scriptId, pick(m), m.data, m)
  }
}

/** Advance one calendar year of the immigration clock (the rest of ageUp isn't needed here). */
function nextYear(g: GameState, pick?: (m: Extract<ModalItem, { kind: 'choice' }>) => string): void {
  g.year += 1
  g.character.age += 1
  g.yearActions = {}
  yearlyImmigration(g)
  choose(g, pick)
}

/** Apply until approved (fresh year each try); returns true once the character lives in `dest`. */
function applyUntilMoved(g: GameState, dest: string, key: string, tries = 25): boolean {
  for (let i = 0; i < tries && g.character.countryId !== dest; i++) {
    g.yearActions = {}
    g.rng = (g.rng * 31 + i * 7919) | 0
    applyRoute(g, dest, key)
    choose(g, (m) => (m.choices.some((c) => c.id === 'stay') ? 'stay' : m.choices[0].id))
  }
  return g.character.countryId === dest
}

// ---------------------------------------------------------------------------

describe('passports and free movement', () => {
  it('lets an EU citizen move almost automatically after 1993, but not in 1980', () => {
    const g1995 = adult({ country: 'es', year: 1995 })
    const free = route(g1995, 'fr', 'free:eu')
    expect(free.ok).toBe(true)
    expect(free.odds).toBeGreaterThanOrEqual(0.95)
    expect(free.fee).toBe(0)

    // Spain only joined the EEC in 1986 (with workers' free movement from 1992).
    const g1980 = adult({ country: 'es', year: 1980 })
    expect(routesTo(g1980, 'fr').some((r) => r.id === 'free' && r.ok)).toBe(false)
    const best1980 = routesTo(g1980, 'fr').find((r) => r.ok)!
    expect(best1980.odds).toBeLessThan(0.9)
  })

  it('ends free movement between Britain and the EU after Brexit', () => {
    expect(route(adult({ country: 'gb', year: 2020 }), 'fr', 'free:eu').ok).toBe(true)
    expect(routesTo(adult({ country: 'gb', year: 2021 }), 'fr').some((r) => r.id === 'free')).toBe(false)
    // Ireland and the UK keep their own arrangement.
    expect(route(adult({ country: 'gb', year: 2021 }), 'ie', 'free:cta').ok).toBe(true)
  })

  it('applies transitional limits after EU enlargement', () => {
    const pl2006 = adult({ country: 'pl', year: 2006 })
    const de = route(pl2006, 'de', 'free:eu')
    expect(de.ok).toBe(false)
    expect(de.why).toMatch(/2011/)
    expect(route(pl2006, 'gb', 'free:eu').ok).toBe(true)
    expect(route(adult({ country: 'pl', year: 2012 }), 'de', 'free:eu').ok).toBe(true)
  })

  it('gives a weak passport lower odds and longer waits than a strong one', () => {
    expect(passportStrength('af', 2015)).toBeLessThan(30)
    expect(passportStrength('ch', 2015)).toBeGreaterThan(85)
    const weak = route(adult({ country: 'af', year: 2015 }), 'de', 'work')
    const strong = route(adult({ country: 'ch', year: 2015 }), 'au', 'work')
    const strongDe = route(adult({ country: 'us', year: 2015 }), 'de', 'work')
    expect(weak.ok && strong.ok && strongDe.ok).toBe(true)
    expect(weak.odds).toBeLessThan(strongDe.odds)
    expect(weak.wait).toBeGreaterThan(strongDe.wait)
  })

  it('treats Puerto Ricans as US citizens and Arubans as Dutch (EU) citizens', () => {
    expect(route(adult({ country: 'pr', year: 2010 }), 'us', 'citizen').odds).toBe(1)
    expect(route(adult({ country: 'aw', year: 2010 }), 'fr', 'free:eu').ok).toBe(true)
  })

  it('lets Soviet citizens move inside the USSR but not out of it', () => {
    const g = adult({ country: 'ru', year: 1980 })
    expect(route(g, 'ua', 'citizen').ok).toBe(true)
    const us = routesTo(g, 'us')
    expect(us.every((r) => !r.ok)).toBe(true)
    expect(us[0].why).toMatch(/exit visa/)
  })
})

describe('exit restrictions', () => {
  it('blocks legal emigration from the Eastern Bloc before 1989 and opens after', () => {
    const g = adult({ country: 'pl', year: 1980 })
    const routes = routesTo(g, 'de')
    expect(routes.length).toBeGreaterThan(0)
    expect(routes.every((r) => !r.ok)).toBe(true)
    expect(routes.find((r) => r.id === 'work')!.why).toMatch(/exit visa/)
    // The menu offers an exit visa and an escape instead of sneaking in.
    const kids = emigrateMenu.children(g)
    expect(kids.some((n) => n.id === 'imm.exit.permit')).toBe(true)
    const europe = kids.find((n) => n.id === 'emigrate.cont.Europe') as MenuGroup
    const germany = europe.children(g).find((n) => n.id === 'emigrate.de') as MenuGroup
    const escape = germany.children(g).find((n) => n.id === 'emigrate.de.escape')!
    expect(escape.type === 'action' && escape.visible!(g)).toBe(true)
    const sneak = germany.children(g).find((n) => n.id === 'emigrate.de.sneak')!
    expect(sneak.type === 'action' && sneak.visible!(g)).toBe(false)

    const g1995 = adult({ country: 'pl', year: 1995 })
    expect(route(g1995, 'de', 'work').ok).toBe(true)
  })

  it('opens the routes for the year once an exit visa is granted', () => {
    let granted: GameState | null = null
    for (let seed = 1; seed <= 300 && !granted; seed++) {
      const g = adult({ country: 'pl', year: 1985, seed })
      requestExitPermit(g)
      if (immState(g).exitPermit === 1985) granted = g
    }
    expect(granted).not.toBeNull()
    expect(route(granted!, 'de', 'work').ok).toBe(true)
  })
})

describe('work visas and points', () => {
  it('scores the work visa on the CV', () => {
    const strong = route(adult({ country: 'in', year: 2015 }), 'gb', 'work')
    const weak = route(adult({ country: 'in', year: 2015, experience: 0 }), 'gb', 'work')
    expect(strong.ok).toBe(true)
    expect(strong.sponsor!.fit).toBeGreaterThan(weak.sponsor?.fit ?? 0)
    expect(strong.odds).toBeGreaterThan(weak.odds)
    expect(strong.notes.join(' ')).toMatch(/CV fit/)
    const noDiploma = route(adult({ country: 'in', year: 2015, degree: false, experience: 0 }), 'gb', 'work')
    expect(noDiploma.ok).toBe(false)
  })

  it('runs points tests with a pass mark', () => {
    const young = route(adult({ country: 'in', year: 2015 }), 'ca', 'points')
    expect(young.ok).toBe(true)
    expect(young.result).toBe('permanent')
    expect(young.notes.join(' ')).toMatch(/Points: \d+\/67/)
    const old = route(adult({ country: 'in', year: 2015, age: 58, degree: false, experience: 0 }), 'ca', 'points')
    expect(old.ok).toBe(false)
    expect(old.why).toMatch(/pass mark/)
  })

  it('hires the player at the sponsoring employer on arrival', () => {
    const g = adult({ country: 'in', year: 2010 })
    expect(applyUntilMoved(g, 'de', 'work')).toBe(true)
    expect(statusOf(g)).toMatchObject({ status: 'visa', visa: 'work', expires: g.year + 3 })
    expect(g.character.job).not.toBeNull()
  })
})

describe('golden visas', () => {
  it('needs the net worth and locks the money', () => {
    const poor = route(adult({ country: 'cn', year: 2015 }), 'pt', 'investor:pt-golden')
    expect(poor.ok).toBe(false)
    expect(poor.why).toMatch(/net worth/)

    const g = adult({ country: 'cn', year: 2015, money: 3_000_000 })
    const r = route(g, 'pt', 'investor:pt-golden')
    expect(r.ok).toBe(true)
    expect(r.invest).toBeGreaterThan(500_000)
    expect(r.lockYears).toBe(5)
    expect(applyUntilMoved(g, 'pt', 'investor:pt-golden')).toBe(true)
    expect(g.character.money).toBeLessThan(3_000_000 - r.invest)
    const locks = lockAssets(g)
    expect(locks).toHaveLength(1)
    expect(locks[0].value).toBe(r.invest)
    expect(statusOf(g)).toMatchObject({ status: 'visa', visa: 'investor' })

    // The stake moves with the market while locked, then comes back.
    const start = g.year
    const moneyBefore = g.character.money
    for (let i = 0; i < 5; i++) nextYear(g, (m) => (m.choices.some((c) => c.id === 'later') ? 'later' : m.choices[0].id))
    expect(g.year).toBe(start + 5)
    expect(lockAssets(g)).toHaveLength(0)
    expect(g.character.money).toBeGreaterThan(moneyBefore)
    // Five years on the visa: permanent residency.
    expect(statusOf(g).status).toBe('permanent')
  })

  it('revokes the investor visa when the money is pulled out early', () => {
    const g = adult({ country: 'cn', year: 2016, money: 3_000_000 })
    expect(applyUntilMoved(g, 'gr', 'investor:gr-golden')).toBe(true)
    const lock = lockAssets(g)[0]
    g.assets = g.assets.filter((a) => a.id !== lock.id)
    g.character.money += lock.value
    // Renewal (term 5) fails without the investment.
    for (let i = 0; i < 5; i++) nextYear(g, (m) => (m.choices.some((c) => c.id === 'stay') ? 'stay' : m.choices[0].id))
    expect(statusOf(g).status).toBe('undocumented')
  })

  it('values interest-free loans honestly (inflation eats them)', () => {
    expect(expectedLockValue('loan', 1_000_000, 5, 2005)).toBeLessThan(1_000_000)
    expect(expectedLockValue('fee', 1_000_000, 5, 2005)).toBe(0)
    expect(expectedLockValue('fund', 1_000_000, 5, 2005)).toBeGreaterThan(1_000_000)
  })

  it('sells passports outright where citizenship by investment exists', () => {
    const g = adult({ country: 'ir', year: 2020, money: 2_000_000 })
    const r = route(g, 'tr', 'investor:tr-cbi')
    expect(r.result).toBe('citizen')
    expect(applyUntilMoved(g, 'tr', 'investor:tr-cbi')).toBe(true)
    expect(citizenshipsOf(g)).toContain('tr')
    expect(statusOf(g).status).toBe('citizen')
  })
})

describe('the status clock', () => {
  it('walks a work visa to permanent residency and then citizenship', () => {
    const g = adult({ country: 'in', year: 2010 })
    expect(applyUntilMoved(g, 'de', 'work')).toBe(true)
    const seen: string[] = []
    for (let i = 0; i < 16 && statusOf(g).status !== 'citizen'; i++) {
      nextYear(g, (m) => (m.choices.some((c) => c.id === 'study') ? 'study' : m.choices.some((c) => c.id === 'oath') ? 'oath' : m.choices[0].id))
      const s = statusOf(g).status
      if (seen[seen.length - 1] !== s) seen.push(s)
    }
    expect(seen).toEqual(['visa', 'permanent', 'citizen'].slice(seen[0] === 'visa' ? 0 : 1))
    expect(statusOf(g).status).toBe('citizen')
    expect(citizenshipsOf(g)).toContain('de')
    // India doesn't allow dual citizenship.
    expect(citizenshipsOf(g)).not.toContain('in')
    expect(counter(g, 'naturalizations')).toBe(1)
  })

  it('lets a visa lapse without a job', () => {
    const g = adult({ country: 'in', year: 2010 })
    expect(applyUntilMoved(g, 'de', 'work')).toBe(true)
    g.character.job = null
    let leftHome = false
    for (let i = 0; i < 4 && !leftHome; i++) {
      nextYear(g, (m) => (m.choices.some((c) => c.id === 'leave') ? 'leave' : m.choices[0].id))
      leftHome = g.character.countryId === 'in'
    }
    expect(leftHome).toBe(true)
    expect(statusOf(g).status).toBe('citizen')
  })

  it('deports undocumented residents after a serious conviction', () => {
    const g = adult({ country: 'mx', year: 2010 })
    let inside = false
    for (let seed = 1; seed <= 40 && !inside; seed++) {
      g.rng = seed * 101
      g.yearActions = {}
      sneakIn(g, 'us')
      choose(g)
      inside = g.character.countryId === 'us'
    }
    expect(inside).toBe(true)
    expect(statusOf(g).status).toBe('undocumented')
    expect(legalWorkProblem(g, { category: 'fulltime', edu: 'bachelor' })).toMatch(/papers/)
    expect(immigrationSummary(g)).toMatch(/without papers/)
    g.character.criminalRecord.push({ crime: 'Grand Theft Auto', age: g.character.age, caught: true, convicted: true, sentenceYears: 2 })
    nextYear(g)
    expect(g.character.countryId).toBe('mx')
    expect(counter(g, 'deportations')).toBe(1)
    expect(immState(g).bans.us).toBeGreaterThanOrEqual(g.year)
    expect(route(g, 'us', 'work').ok).toBe(false)
  })

  it('waits until release to deport a prisoner', () => {
    const g = adult({ country: 'mx', year: 2010 })
    g.character.countryId = 'us'
    g.character.immigration = { countryId: 'us', status: 'visa', visa: 'work', since: 2008, expires: 2014 }
    updateImm(g, (s) => (s.arrived = 2008))
    g.character.criminalRecord.push({ crime: 'Burglary', age: 30, caught: true, convicted: true, sentenceYears: 3 })
    g.character.prison = { name: 'County Jail', security: 'medium', crime: 'Burglary', sentenceYears: 3, yearsServed: 0, respect: 20, appealed: false, escapeAttempts: 0 } as never
    nextYear(g)
    expect(g.character.countryId).toBe('us')
    expect(immState(g).deportAfterRelease).toBe(true)
    g.character.prison = null
    nextYear(g)
    expect(g.character.countryId).toBe('mx')
  })

  it('decides asylum claims after the wait', () => {
    const g = adult({ country: 'sy', year: 2015 })
    const r = route(g, 'de', 'asylum')
    expect(r.ok).toBe(true)
    expect(r.notes.join(' ')).toMatch(/civil war/)
    applyRoute(g, 'de', 'asylum')
    choose(g)
    expect(g.character.countryId).toBe('de')
    expect(statusOf(g)).toMatchObject({ status: 'asylum', visa: 'pending' })
    for (let i = 0; i < 3; i++) nextYear(g, (m) => (m.choices.some((c) => c.id === 'stay') ? 'stay' : m.choices[0].id))
    expect(['asylum', 'undocumented', 'permanent']).toContain(statusOf(g).status)
    expect(statusOf(g).visa).not.toBe('pending')
  })

  it('resolves lottery entries the next year', () => {
    const g = adult({ country: 'ng', year: 2000 })
    const r = route(g, 'us', 'lottery:us-dv')
    expect(r.ok).toBe(true)
    applyRoute(g, 'us', 'lottery:us-dv')
    choose(g)
    expect(immState(g).apps).toHaveLength(1)
    expect(route(g, 'us', 'lottery:us-dv').ok).toBe(false)
    // Force the draw in our favor.
    updateImm(g, (s) => (s.apps[0].odds = 1))
    g.year += 1
    resolvePending(g, immState(g).apps[0])
    expect(g.queue.some((m) => m.kind === 'choice' && m.title === 'You Won!')).toBe(true)
    choose(g, () => 'move')
    expect(g.character.countryId).toBe('us')
    expect(statusOf(g).status).toBe('permanent')
  })

  it('makes a Russian-born resident of Ukraine Ukrainian when the USSR breaks up', () => {
    const g = adult({ country: 'ru', year: 1985 })
    expect(applyUntilMoved(g, 'ua', 'citizen')).toBe(true)
    expect(statusOf(g).status).toBe('citizen')
    for (let y = g.year; y < 1992; y++) nextYear(g)
    expect(citizenshipsOf(g)).toContain('ua')
    expect(statusOf(g).status).toBe('citizen')
  })
})

describe('family', () => {
  it('needs a citizen spouse for a spouse visa', () => {
    const g = adult({ country: 'ph', year: 2015 })
    expect(route(g, 'jp', 'spouse').ok).toBe(false)
    const p = createPerson(g, { relation: 'spouse', age: 31, relationship: 80 })
    p.data.citizenships = ['jp']
    p.yearsKnown = 4
    const r = route(g, 'jp', 'spouse')
    expect(r.ok).toBe(true)
    expect(r.notes.join(' ')).toMatch(p.firstName)
  })

  it('passes passports to children by descent and birthright', () => {
    const g = adult({ country: 'in', year: 2010 })
    g.character.countryId = 'us'
    g.character.immigration = { countryId: 'us', status: 'permanent', since: 2005 }
    const kid = createPerson(g, { relation: 'child', age: 0 })
    const list = heirCitizenships(g, kid)
    expect(list).toContain('in')
    expect(list).toContain('us')
  })
})

describe('old saves', () => {
  it('reads passports from the birth and home country when the field is missing', () => {
    const g = makeTestGame(3, { age: 40, countryId: 'fr', birthCountryId: 'us' })
    expect(g.character.citizenships).toBeUndefined()
    expect(citizenshipsOf(g)).toEqual(['us', 'fr'])
    expect(statusOf(g).status).toBe('citizen')
    yearlyImmigration(g)
    expect(g.character.citizenships).toEqual(['us', 'fr'])
  })

  it('treats an old sneak-in as undocumented', () => {
    const g = makeTestGame(3, { age: 40, countryId: 'fr', birthCountryId: 'us' })
    g.flags.illegalImmigrant = 'fr'
    expect(citizenshipsOf(g)).toEqual(['us'])
    expect(statusOf(g).status).toBe('undocumented')
    g.year += 1
    yearlyImmigration(g)
    expect(g.character.citizenships).toEqual(['us'])
    expect(g.character.immigration?.status === 'undocumented' || g.character.countryId === 'us').toBe(true)
  })

  it('leaves a plain citizen at home alone', () => {
    const g = makeTestGame(3, { age: 40 })
    const before = JSON.stringify(g.character)
    yearlyImmigration(g)
    expect(g.queue).toHaveLength(0)
    expect(immigrationSummary(g)).toBe('')
    expect(JSON.stringify({ ...g.character, citizenships: undefined })).toBe(JSON.stringify({ ...JSON.parse(before), citizenships: undefined }))
    expect(JSON.parse(JSON.stringify(g))).toEqual(g)
  })
})

describe('menus', () => {
  it('shows every route with odds, costs and reasons, and the Law of Return for Jewish characters', () => {
    const g = adult({ country: 'us', year: 2020 })
    g.character.religion = 'Judaism'
    const il = routesTo(g, 'il')
    expect(il[0].key).toBe('return')
    expect(il[0].result).toBe('citizen')
    const europe = emigrateMenu.children(g).find((n) => n.id === 'emigrate.cont.Europe') as MenuGroup
    const pt = europe.children(g).find((n) => n.id === 'emigrate.pt') as MenuGroup
    const rows = pt.children(g)
    for (const n of rows) {
      if (n.type !== 'action') continue
      expect(typeof (typeof n.subtitle === 'function' ? n.subtitle(g) : n.subtitle ?? '')).toBe('string')
      n.confirm?.(g)
    }
    expect(rows.some((n) => n.type === 'heading' && /Closed/.test(n.label))).toBe(true)
  })

  it('never offers routes that did not exist yet', () => {
    const g = adult({ country: 'in', year: 1950 })
    expect(routesTo(g, 'pt').some((r) => r.id === 'investor')).toBe(false)
    expect(routesTo(g, 'pt').some((r) => r.id === 'remote')).toBe(false)
    expect(findRoute(g, 'us', 'lottery:us-dv')).toBeNull()
  })
})
