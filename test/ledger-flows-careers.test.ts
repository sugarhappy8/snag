// R2-L10 (A.K1 e): migration 5, the special careers. Every scenario plays one real flow of the batch through its public function and
// then asserts the three things the batch owes: the player's cash and the player's account never part (driftSince), the reason rows
// and the class of the counterparty are the ones the plan names (flowTotal), and the books balance (expectConserved). Not in the fast
// tier. test/money-ratchet.test.ts holds the rest: no counted site is left in any of the 25 files.
import { describe, expect, it } from 'vitest'
import { authorPublisherOffer, licenseAuthorAdaptation, publishAuthorWork, startAuthorCareer } from '../src/game/special/author-career'
import { authorMut, authorView, saveAuthor, type AuthorWork } from '../src/game/special/author-state'
import { flowsOf } from '../src/game/kernel/ledger'
import { runScript } from '../src/game/scripts'
import { yearlySpecial } from '../src/game/special'
import { yearlyMusic } from '../src/game/special/music'
import { musicProfile } from '../src/game/special/music-job'
import { attemptInfluence, influenceJob, yearlyCorruption } from '../src/game/special/corruption'
import { hire, ownerKey, prof } from '../src/game/special/common'
import { fameMenu, yearlyFame } from '../src/game/special/fame'
import { attendConvention } from '../src/game/special/gamedev-career'
import { hustlerJobNodes } from '../src/game/special/hustler'
import { yearlyMilitary } from '../src/game/special/military'
import { PHOTOGRAPHERS, yearlyModel } from '../src/game/special/model'
import { yearlyPolitics } from '../src/game/special/politics'
import { yearlySocial, type Account } from '../src/game/special/social'
import { payFee } from '../src/game/special/sports-core'
import { yearlyEsports } from '../src/game/special/sports-esports'
import { yearlyAstronaut } from '../src/game/special/astronaut'
import { landProject } from '../src/game/special/actor-pipeline'
import { actorStore, adoptLegacy, type ActorState } from '../src/game/special/actor-state'
import { ACTION_BUDGET, careerCtx } from '../src/game/special/kit/year'
import { createPerson } from '../src/game/people'
import type { GameState, Json, MenuAction, ModalItem, Person } from '../src/game/types'
import { acctOf, booksOf, driftSince, expectConserved, flowTotal } from './ledger-kit'
import { makeTestGame } from './helpers'
import { findSeed } from './seed-kit'

const rows = (g: GameState, reason: string): number => flowsOf(g).filter((r) => r.reason === reason).length
const gov = (g: GameState): `gov:${string}` => `gov:${g.character.countryId}`

/** Nothing the scenario did went through the default reason, and the books balance. */
function clean(g: GameState): void {
  expect(rows(g, 'unreasoned')).toBe(0)
  expectConserved(g)
}

/** A notice-kind modal: runScript keeps no replay token for it, so a script's own guards are what is tested. */
let serial = 0
const fake = (): ModalItem => ({ kind: 'notice', id: `l10-${++serial}`, title: '', text: '' })
const play = (g: GameState, script: string, choice: string, data?: Json): void => runScript(g, script, choice, data, fake())

function adult(money: number, seed = 7, age = 30, country = 'us'): GameState {
  const g = makeTestGame(seed, { age, money, countryId: country, birthCountryId: country })
  g.log = [{ age, year: g.year, entries: [] }]
  return g
}

describe('R2-L10: salaries book as wage', () => {
  it('1. a year of military service pays the salary as wage, from the employers', () => {
    const g = adult(1_000, 5, 30)
    hire(g, { defId: 'military.army', title: 'Corporal', company: 'Army', category: 'military', salary: 36_000, level: 2, performance: 100, data: { branch: 'army', track: 'enlisted', conscript: false, serviceLeft: 0, deployments: 0 } })
    const job = g.character.job!
    job.data.startAge = 22
    job.data.roleStartAge = 26
    const pay = job.salary
    const before = booksOf(g)
    yearlyMilitary(g)
    expect(flowTotal(g, 'wage', 'person')).toBe(pay)
    expect(flowTotal(g, 'wage', 'pool')).toBe(-pay)
    expect(acctOf(g, 'pool:employers')).toBe(-pay)
    expect(driftSince(g, before)).toBe(0)
    clean(g)
  })

  it('2. a year as an astronaut pays the salary as wage', () => {
    const g = adult(500_000, 5, 36)
    hire(g, { defId: 'astronaut', title: 'Mission Specialist', company: 'Orbital Exploration Agency', salary: 100_000, level: 2, performance: 70, data: { agency: 'oea', lastMissionAge: -1 } })
    const before = booksOf(g)
    yearlyAstronaut(g)
    expect(flowTotal(g, 'wage', 'person')).toBe(100_000)
    expect(driftSince(g, before)).toBe(0)
    clean(g)
  })

  it('3. an esports season books the salary as wage and the winnings as prize', () => {
    const g = adult(10_000, 22, 22)
    hire(g, { defId: 'sports.esports', title: 'Esports Pro (Arcane Siege)', company: 'Team Nebula', salary: 200_000, data: { game: 'siege', team: 'Team Nebula', teamStrength: 90, tier: 1, contractYears: 3, played: [], results: [], earned: 0 } })
    g.flags['special.sports.esports'] = { game: 'siege', mmr: { siege: 3500 }, attrs: { Mechanics: 99, 'Game Sense': 99, Teamwork: 99, Mental: 99 }, titles: [], earnings: 0, startAge: 18, retiredAge: null, cups: 0, owner: ownerKey(g) } as unknown as Json
    const before = booksOf(g)
    yearlyEsports(g)
    g.queue = []
    expect(flowTotal(g, 'wage', 'person')).toBe(200_000)
    const prize = flowTotal(g, 'prize', 'person')
    expect(prize).toBeGreaterThan(0)
    expect(flowTotal(g, 'prize', 'pool')).toBe(-prize)
    expect(driftSince(g, before)).toBe(0)
    clean(g)
  })

  it('4. a legacy model year pays the salary as wage; a headshot session is a purchase', () => {
    const g = adult(50_000, 1001, 30)
    g.year = 1995
    g.character.stats.looks = 90
    g.character.job = { defId: 'model', title: 'Model', company: 'Test Agency', category: 'special', salary: 10_000, level: 0, performance: 90, yearsInRole: 0, yearsAtCompany: 0, data: { tier: 0, gigsThisYear: 0, sabotaged: 0 } }
    const before = booksOf(g)
    yearlyModel(g)
    expect(flowTotal(g, 'wage', 'person')).toBe(10_000)
    const shot = PHOTOGRAPHERS[0]!
    play(g, 'special.model.headshot', shot.id)
    expect(flowTotal(g, 'purchase', 'person')).toBe(-shot.cost)
    expect(flowTotal(g, 'purchase', 'pool')).toBe(shot.cost)
    expect(driftSince(g, before)).toBe(0)
    clean(g)
  })
})

describe('R2-L10: royalties, rights and prizes', () => {
  it('5. a publisher advance books as royalty, a self-published book as a purchase', () => {
    const g = adult(1_000_000, 53, 30)
    g.flags['skill.writing'] = 100
    g.flags['skill.art'] = 100
    startAuthorCareer(g)
    g.queue = []
    const p = authorMut(g)
    p.seq = 1
    p.reputation = 100
    const work = (id: string, over: Partial<AuthorWork>): AuthorWork => ({ id, title: `Book ${id}`, format: 'novel', genre: 'mystery', promise: 'mystery', stage: 'ready', countryId: 'us', started: 2025, released: 0, progress: 100, quality: 100, chapters: 0, readers: 0, trust: 70, hooks: 0, arcs: 0, volumes: 1, copies: 0, tail: 0, gross: 0, earned: 0, publisher: '', share: 1, recoup: 0, spent: 0, focus: 'characters', pace: 'steady', hiatus: false, hiatuses: 0, lastYear: -1, adaptedUntil: 0, adaptationBase: 0, adaptationEarned: 0, ...over })
    p.works = [work('aw1', {}), work('aw2', {})]
    saveAuthor(g, p)
    let offer = authorPublisherOffer(g, authorView(g).works[0]!)
    for (let guard = 0; !offer.available && guard < 50; guard++) {
      g.year += 1
      g.character.age += 1
      g.yearActions = {}
      offer = authorPublisherOffer(g, authorView(g).works[0]!)
    }
    expect(offer.available).toBe(true)
    const before = booksOf(g)
    publishAuthorWork(g, 'aw1', 'publisher')
    expect(offer.advance).toBeGreaterThan(0)
    expect(flowTotal(g, 'royalty', 'person')).toBe(offer.advance)
    expect(flowTotal(g, 'royalty', 'pool')).toBe(-offer.advance)
    expect(driftSince(g, before)).toBe(0)
    g.queue = []
    publishAuthorWork(g, 'aw2', 'self')
    const spent = authorView(g).works.find((w) => w.id === 'aw2')!.spent
    expect(spent).toBeGreaterThan(0)
    expect(flowTotal(g, 'purchase', 'person')).toBe(-spent)
    expect(driftSince(g, before)).toBe(0)
    clean(g)
  })

  it('5b. an adaptation licence fee books as royalty', () => {
    const g = adult(1_000_000, 53, 30)
    g.flags['skill.writing'] = 100
    startAuthorCareer(g)
    g.queue = []
    const p = authorMut(g)
    p.seq = 1
    p.reputation = 100
    p.works = [{ id: 'aw1', title: 'The Glass Harbor', format: 'novel', genre: 'mystery', promise: 'mystery', stage: 'published', countryId: 'us', started: 2025, released: 2026, progress: 100, quality: 95, chapters: 0, readers: 20_000, trust: 70, hooks: 0, arcs: 0, volumes: 1, copies: 200_000, tail: 5_000, gross: 100_000, earned: 100_000, publisher: '', share: 1, recoup: 0, spent: 0, focus: 'characters', pace: 'steady', hiatus: false, hiatuses: 0, lastYear: 2026, adaptedUntil: 0, adaptationBase: 0, adaptationEarned: 0 }]
    saveAuthor(g, p)
    const before = booksOf(g)
    licenseAuthorAdaptation(g, 'aw1')
    const fee = authorView(g).works[0]!.adaptationEarned
    expect(fee).toBeGreaterThan(0)
    expect(flowTotal(g, 'royalty', 'person')).toBe(fee)
    expect(driftSince(g, before)).toBe(0)
    clean(g)
  })

  it('6. a famous author: the book costs a purchase and sells as royalty', () => {
    const g = adult(100_000, 3, 30)
    g.character.hidden.fame = 100
    const node = fameMenu.children(g).find((n): n is MenuAction => n.type === 'action' && n.id === 'fame.book')!
    const before = booksOf(g)
    node.run(g, 'Unfiltered')
    g.queue = []
    const cost = -flowTotal(g, 'purchase', 'person')
    expect(cost).toBeGreaterThan(0)
    const sold = flowTotal(g, 'royalty', 'person')
    expect(sold).toBeGreaterThan(0)
    expect(g.character.money).toBe(100_000 - cost + sold)
    expect(driftSince(g, before)).toBe(0)
    clean(g)
  })

  it('6b. a fame year pays the book royalties as royalty', () => {
    const g = adult(0, 3, 30)
    g.character.hidden.fame = 100
    g.flags['special.fame'] = { books: [{ title: 'Unfiltered', royalty: 5_000, age: 30 }], podcast: null, owner: ownerKey(g) } as unknown as Json
    const before = booksOf(g)
    yearlyFame(g)
    g.queue = []
    expect(flowTotal(g, 'royalty', 'person')).toBeGreaterThanOrEqual(5_000)
    expect(driftSince(g, before)).toBe(0)
    clean(g)
  })

  it('7. buying followers is a purchase; a sponsored post and a monetized year are royalty', () => {
    const g = adult(500_000, 11, 30)
    prof<{ accounts: Account[] }>(g, 'social', () => ({ accounts: [] })).accounts.push({ platform: 'viewtube', handle: 'testplayer', followers: 200_000, verified: false, monetized: true, posts: 10, postsAtLastYear: 6, lastPostAge: 29, suspended: null, spam: 0, trolls: 0, celebFollowers: [], createdAge: 30 } as Account)
    const before = booksOf(g)
    play(g, 'special.social.buy', '1000', { platform: 'viewtube' } as unknown as Json)
    expect(flowTotal(g, 'purchase', 'person')).toBe(-100)
    play(g, 'special.social.promo', 'accept', { platform: 'viewtube', sponsor: 'Glint', product: 'a gadget', shady: false, pay: 7_000 } as unknown as Json)
    expect(flowTotal(g, 'royalty', 'person')).toBe(7_000)
    yearlySocial(g)
    expect(flowTotal(g, 'royalty', 'person')).toBeGreaterThan(7_000)
    expect(driftSince(g, before)).toBe(0)
    g.queue = []
    clean(g)
  })
})

describe('R2-L10: the street, the law and the favors', () => {
  function street(seed: number): GameState {
    const g = makeTestGame(seed, { age: 30, countryId: 'us', money: 1_000 })
    hire(g, { defId: 'hustler', title: 'Scam Artist', company: 'Broadway', salary: 0, performance: 40, data: { act: 'monte', prop: 'sign', instrument: 'Bucket Drums', street: 'Broadway', traffic: 3, police: 1, rivals: 2, earnedYear: 0, sessionsYear: 0 } })
    prof(g, 'hustler', () => ({ skills: { monte: 40 }, totalEarned: 0, sessions: 0, arrests: 0, bestDay: 0 }))
    return g
  }

  it('8. a hustle takes crime.take from the crime pool; a street fine is a fine; protection money is crime.take paid out', () => {
    const seed = findSeed((s) => {
      const g = street(s)
      const work = hustlerJobNodes(g).find((n): n is MenuAction => n.type === 'action' && n.id === 'hustle.work')!
      work.run(g)
      return (g.character.job?.data.earnedYear as number) > 0 && g.character.money > 1_000
    }, { label: 'a hustle that pays' })
    const g = street(seed)
    const before = booksOf(g)
    const work = hustlerJobNodes(g).find((n): n is MenuAction => n.type === 'action' && n.id === 'hustle.work')!
    work.run(g)
    const take = flowTotal(g, 'crime.take', 'person')
    expect(take).toBe(g.character.money - 1_000)
    expect(take).toBeGreaterThan(0)
    expect(driftSince(g, before)).toBe(0)
    g.character.money = 5_000
    g.character.job!.data.earnedYear = 600
    const after = booksOf(g)
    play(g, 'special.hustle.encounter', 'gang.pay')
    expect(flowTotal(g, 'crime.take', 'person')).toBe(take - 180)
    play(g, 'special.hustle.encounter', 'cop.pay')
    const fine = 5_000 - 180 - g.character.money
    expect(fine).toBeGreaterThan(0)
    expect(flowTotal(g, 'fine', 'person')).toBe(-fine)
    expect(acctOf(g, gov(g))).toBe(fine)
    expect(driftSince(g, after)).toBe(0)
    clean(g)
  })

  it('9. a bribe to an intermediary is a bribe to the crime pool; the relative it places is paid as wage', () => {
    const seed = findSeed((s) => {
      const g = adult(20_000_000, s, 45)
      const child = createPerson(g, { relation: 'child', age: 24, relationship: 80, occupation: 'Unemployed', money: 0 })
      attemptInfluence(g, 'ceo', child.id)
      g.queue = []
      return influenceJob(g, child) !== null
    }, { label: 'a favor that works' })
    const g = adult(20_000_000, seed, 45)
    const child = createPerson(g, { relation: 'child', age: 24, relationship: 80, occupation: 'Unemployed', money: 0 })
    const before = booksOf(g)
    attemptInfluence(g, 'ceo', child.id)
    g.queue = []
    const price = -flowTotal(g, 'bribe', 'person')
    expect(price).toBeGreaterThan(0)
    expect(flowTotal(g, 'bribe', 'pool')).toBe(price)
    expect(acctOf(g, 'pool:crime')).toBe(price)
    expect(g.character.money).toBe(20_000_000 - price)
    expect(driftSince(g, before)).toBe(0)
    // The installed relative's savings rise through the books, from the employers, not out of thin air.
    const account = `person:${child.id}` as const
    expect(child.money).toBeGreaterThan(0)
    expect(acctOf(g, account)).toBe(Math.round(child.money))
    expect(flowTotal(g, 'wage', 'person')).toBe(Math.round(child.money))
    const job = influenceJob(g, child)!
    g.year += 1
    const had = child.money
    yearlyCorruption(g)
    const pay = Math.max(0, Math.min(500_000, Math.round(job.salary)))
    expect(child.money - had).toBe(pay)
    expect(acctOf(g, account)).toBe(Math.round(child.money))
    clean(g)
  })

  it('10. a former head of government collects a pension, and a campaign budget is a purchase', () => {
    const g = adult(10_000, 21, 70)
    g.flags['special.politics'] = { held: [], wins: 1, losses: 0, party: 'centrist', billsPassed: 0, vetoes: 0, impeached: 0, formerLeader: true, formerLeaderTitle: 'President', owner: ownerKey(g) } as unknown as Json
    const before = booksOf(g)
    yearlyPolitics(g)
    g.queue = []
    const pension = flowTotal(g, 'pension', 'person')
    expect(pension).toBeGreaterThan(0)
    expect(flowTotal(g, 'pension', 'gov')).toBe(-pension)
    expect(g.character.money).toBe(10_000 + pension)
    expect(driftSince(g, before)).toBe(0)
    play(g, 'special.pol.budget', '1', { office: 'school', party: 'independent', issue: 'economy', incumbentRun: false })
    g.queue = []
    expect(flowTotal(g, 'purchase', 'person')).toBe(-2_000)
    expect(g.character.money).toBe(10_000 + pension - 2_000)
    expect(driftSince(g, before)).toBe(0)
    clean(g)
  })

  it('11. a youth sports fee is a purchase: the parent pays through personCash, the player through the wrapper', () => {
    const g = adult(5_000, 31, 15)
    const parent: Person = createPerson(g, { relation: 'parent', age: 45, relationship: 80, occupation: 'Clerk', money: 10_000 })
    const before = booksOf(g)
    expect(payFee(g, 1_200)).toBe('parent')
    expect(parent.money).toBe(8_800)
    expect(acctOf(g, `person:${parent.id}`)).toBe(-1_200)
    expect(flowTotal(g, 'purchase', 'person')).toBe(-1_200)
    expect(flowTotal(g, 'purchase', 'pool')).toBe(1_200)
    expect(g.character.money).toBe(5_000)
    parent.money = 100
    expect(payFee(g, 900)).toBe('self')
    expect(g.character.money).toBe(4_100)
    expect(driftSince(g, before)).toBe(0)
    expect(flowTotal(g, 'purchase', 'pool')).toBe(2_100)
    clean(g)
  })

  it('12. a game-dev convention pass is a purchase', () => {
    const g = adult(30_000, 41, 24)
    const before = booksOf(g)
    attendConvention(g)
    g.queue = []
    const cost = 30_000 - g.character.money
    expect(cost).toBeGreaterThan(0)
    expect(flowTotal(g, 'purchase', 'person')).toBe(-cost)
    expect(driftSince(g, before)).toBe(0)
    clean(g)
  })

  it('13. a role in a film seeds the co-stars savings through the books, as a luck row', () => {
    const g = makeTestGame(5, { age: 30, countryId: 'us' })
    g.year = 1995
    g.flags['skill.acting'] = 60
    g.character.money = 100_000
    hire(g, { defId: 'actor', title: 'Actor', company: 'Silverline Studios', salary: 0, data: { project: null } })
    const s: ActorState = actorStore.mut(g)
    adoptLegacy(g, s)
    landProject(careerCtx(g, 'actor', s, { ...ACTION_BUDGET }), { title: 'The Silent Harbor', kind: 'film', genre: 'Drama', role: 'Lead', studio: 'Silverline Studios', pay: 400_000, budget: 'studio' }, 'Lead')
    g.queue = []
    const costars = g.people.filter((p) => p.data.costarOf === 'The Silent Harbor')
    expect(costars.length).toBeGreaterThan(0)
    for (const c of costars) expect(c.money).toBeGreaterThanOrEqual(50_000)
    // Each co-star's account holds exactly the change of savings the roll made, and the pool of luck is the other side of all of them.
    const held = costars.reduce((sum, c) => sum + acctOf(g, `person:${c.id}`), 0)
    expect(held).not.toBe(0)
    expect(flowTotal(g, 'luck', 'person')).toBe(held)
    expect(acctOf(g, 'pool:other')).toBe(-held)
    clean(g)
  })
})

describe('R2-L10: single scripts of the careers', () => {
  it('14. a record year pays the discography as royalty', () => {
    const g = adult(0, 9, 30)
    const p = musicProfile(g)
    p.discography.push({ title: 'First Light', type: 'Studio Album', genre: 'Rock', subgenre: 'Indie', age: 29, sold: 5_000, earned: 0, cert: null, quality: 70, royalty: 6_000 })
    const before = booksOf(g)
    yearlyMusic(g)
    g.queue = []
    expect(flowTotal(g, 'royalty', 'person')).toBe(6_000)
    expect(g.character.money).toBe(6_000)
    expect(driftSince(g, before)).toBe(0)
    clean(g)
  })

  it('15. a fixer takes a bribe to throw a game: bribe from the crime pool; a pawned medal is an asset.sell; a commercial is royalty', () => {
    const g = adult(1_000, 17, 28)
    const before = booksOf(g)
    play(g, 'special.athlete.bribe', 'accept', { amount: 25_000 })
    expect(flowTotal(g, 'bribe', 'person')).toBe(25_000)
    expect(flowTotal(g, 'bribe', 'pool')).toBe(-25_000)
    expect(acctOf(g, 'pool:crime')).toBe(-25_000)
    play(g, 'special.mil.medal', 'pawn', { medal: 'Medal of Honor' })
    expect(flowTotal(g, 'asset.sell', 'person')).toBeGreaterThan(0)
    play(g, 'special.fame.commercial', 'accept', { brand: 'Glint', pay: 40_000 })
    expect(flowTotal(g, 'royalty', 'person')).toBe(40_000)
    g.queue = []
    expect(driftSince(g, before)).toBe(0)
    clean(g)
  })

  it('16. paying a hacker is crime.take paid out of the player', () => {
    const g = adult(50_000, 11, 30)
    prof<{ accounts: Account[] }>(g, 'social', () => ({ accounts: [] })).accounts.push({ platform: 'viewtube', handle: 'testplayer', followers: 2_000, verified: false, monetized: false, posts: 3, postsAtLastYear: 1, lastPostAge: 29, suspended: null, spam: 0, trolls: 0, celebFollowers: [], createdAge: 30 } as Account)
    const before = booksOf(g)
    play(g, 'special.social.hack', 'pay', { platform: 'viewtube', ransom: 3_000 } as unknown as Json)
    g.queue = []
    expect(flowTotal(g, 'crime.take', 'person')).toBe(-3_000)
    expect(acctOf(g, 'pool:crime')).toBe(3_000)
    expect(driftSince(g, before)).toBe(0)
    clean(g)
  })
})

describe('R2-L10: the year hook as a whole', () => {
  it('17. a year of special careers books every dollar under a reason', () => {
    const g = adult(1_000, 5, 30)
    hire(g, { defId: 'astronaut', title: 'Mission Specialist', company: 'Orbital Exploration Agency', salary: 80_000, level: 2, performance: 70, data: { agency: 'oea', lastMissionAge: -1 } })
    const before = booksOf(g)
    yearlySpecial(g)
    g.queue = []
    expect(driftSince(g, before)).toBe(0)
    clean(g)
  })
})
