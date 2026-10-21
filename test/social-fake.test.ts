import { describe, expect, it } from 'vitest'
import '../src/game/activities/creative'
import '../src/game/special/politics'
import { cvEntries } from '../src/game/cv'
import { computeRibbon } from '../src/game/ribbons'
import { typicalIncome } from '../src/game/events/wealth-core'
import { runScript } from '../src/game/scripts'
import { FAMOUS, fameOf, peek, prof } from '../src/game/special/common'
import { socialMediaMenu, totalFollowers, yearlySocial, type Account } from '../src/game/special/social'
import type { GameState, Json, MenuAction, MenuNode } from '../src/game/types'
import { makeTestGame } from './helpers'

interface Profile {
  accounts: Account[]
}

function findAction(g: GameState, nodes: MenuNode[], id: string): MenuAction | undefined {
  for (const node of nodes) {
    if (node.type === 'action' && node.id === id) return node
    if (node.type === 'menu') {
      const found = findAction(g, node.children(g), id)
      if (found) return found
    }
  }
}

/** A grown-up with one viewtube account in the social profile (the saved shape of v4.0.2 plus any extras). */
function withAccount(seed: number, extra: Record<string, unknown>): GameState {
  const g = makeTestGame(seed, { age: 30 })
  prof<Profile>(g, 'social', () => ({ accounts: [] })).accounts.push({
    platform: 'viewtube',
    handle: 'testplayer',
    followers: 0,
    verified: false,
    monetized: false,
    posts: 0,
    postsAtLastYear: 0,
    lastPostAge: -1,
    suspended: null,
    spam: 0,
    trolls: 0,
    celebFollowers: [],
    createdAge: 30,
    ...extra,
  } as Account)
  return g
}

function account(g: GameState): Account {
  return peek<Profile>(g, 'social')!.accounts[0]
}

/** Ten posts so far, six of them before last year: four recent posts, so the full yearly pay rate. */
const BUSY = { posts: 10, postsAtLastYear: 6, monetized: true }

describe('bought followers do not pay', () => {
  it('pays nothing on a fully bought audience, and the platform purges 30% of it', () => {
    for (const seed of [1, 2, 3]) {
      const g = withAccount(seed, { ...BUSY, followers: 1_000_000, fake: 1_000_000 })
      const before = g.character.money
      yearlySocial(g)
      expect(g.character.money).toBe(before)
      expect(account(g).followers).toBe(700_000)
      expect(account(g).fake).toBe(700_000)
      expect(g.log.flatMap((y) => y.entries).some((e) => /removed .* fake followers\.$/.test(e.text))).toBe(true)
    }
  })

  it('still pays an organic audience (control)', () => {
    for (const seed of [1, 2, 3]) {
      const g = withAccount(seed, { ...BUSY, followers: 1_000_000, fake: 0 })
      yearlySocial(g)
      expect(g.character.money).toBeGreaterThanOrEqual(1_000_000)
      expect(g.character.money).toBeLessThanOrEqual(5_000_000)
      expect(account(g).fake).toBeUndefined()
    }
  })

  it('pays only on the organic part of a mixed audience', () => {
    const g = withAccount(1, { ...BUSY, followers: 1_000_000, fake: 900_000 })
    yearlySocial(g)
    // 100,000 organic (plus under 4% growth) at 1 to 5 dollars each: a tenth of the full audience, not all of it.
    expect(g.character.money).toBeGreaterThan(0)
    expect(g.character.money).toBeLessThan(600_000)
  })

  it('refuses monetizing on 1,000 bought followers and verifying on 100,000 bought ones', () => {
    const g = withAccount(1, { followers: 1_000, fake: 1_000, posts: 1 })
    findAction(g, socialMediaMenu.children(g), 'social.viewtube.monetize')!.run(g)
    expect(account(g).monetized).toBe(false)

    const h = withAccount(1, { followers: 100_000, fake: 100_000, posts: 1 })
    expect(fameOf(h)).toBeLessThan(40)
    findAction(h, socialMediaMenu.children(h), 'social.viewtube.verify')!.run(h)
    expect(account(h).verified).toBe(false)
  })

  it('still monetizes and verifies on organic followers (control)', () => {
    const g = withAccount(1, { followers: 1_000, fake: 0, posts: 1 })
    findAction(g, socialMediaMenu.children(g), 'social.viewtube.monetize')!.run(g)
    expect(account(g).monetized).toBe(true)

    const h = withAccount(1, { followers: 100_000, fake: 0, posts: 1 })
    findAction(h, socialMediaMenu.children(h), 'social.viewtube.verify')!.run(h)
    expect(account(h).verified).toBe(true)
  })

  it('caps a year of creator pay at 1500 typical incomes', () => {
    const g = withAccount(1, { ...BUSY, followers: 500_000_000, fake: 0 })
    yearlySocial(g)
    // Income is booked untaxed, so the capped year is exactly the cap.
    expect(g.character.money).toBe(1500 * typicalIncome(g))
  })

  it('does not let bought followers seed post growth (same dice as an empty account)', () => {
    for (let seed = 1; seed <= 10; seed += 1) {
      const bought = withAccount(seed, { followers: 1_000_000, fake: 1_000_000 })
      const empty = withAccount(seed, { followers: 0 })
      findAction(bought, socialMediaMenu.children(bought), 'social.viewtube.post.vlog')!.run(bought)
      findAction(empty, socialMediaMenu.children(empty), 'social.viewtube.post.vlog')!.run(empty)
      expect(account(bought).followers - 1_000_000).toBe(account(empty).followers)
      expect(account(bought).fake).toBe(1_000_000)
    }
  })

  it('does not let bought followers fill a livestream', () => {
    for (const seed of [1, 2, 3]) {
      const g = withAccount(seed, { platform: 'glitch', followers: 1_000_000, fake: 1_000_000, monetized: true, posts: 5 })
      runScript(g, 'special.social.streamLength', 'medium', { category: 'chat' }, { kind: 'notice', id: `stream-${seed}`, title: '', text: '' })
      // At most 4 viewers (nobody real is watching): five hours at under 25 cents a viewer-hour.
      expect(g.character.money).toBeLessThan(10)
    }
  })

  it('purges once a year, not once per call', () => {
    const g = withAccount(1, { followers: 1_000_000, fake: 1_000_000 })
    yearlySocial(g)
    yearlySocial(g)
    expect(account(g).fake).toBe(700_000)
    const lines = g.log.flatMap((y) => y.entries).filter((e) => e.text.includes('fake followers'))
    expect(lines).toHaveLength(1)
    expect(lines[0].text.length).toBeLessThanOrEqual(90)
    expect(lines[0].text).not.toMatch(/[\u2013\u2014]/)
  })

  it('records a purchase as fake followers and leaves the organic count alone', () => {
    const g = withAccount(1, { followers: 5_000, posts: 3 })
    g.character.money = 50_000
    runScript(g, 'special.social.buy', '100000', { platform: 'viewtube' }, { kind: 'notice', id: 'buy-1', title: '', text: '' })
    expect(account(g).followers).toBe(105_000)
    expect(account(g).fake).toBe(100_000)
    expect(g.character.money).toBe(42_000)
    expect(totalFollowers(g)).toBe(5_000)
    expect(g.character.social?.followers).toBe(105_000)
    expect(g.character.social?.fake).toBe(100_000)
  })

  it('loads a v4.0.2 account without fake as all organic, byte for byte as before', () => {
    // Numbers measured on v4.0.2 before this change: a life that never bought followers must not move.
    const golden = [
      { seed: 1, money: 127_511, followers: 41_003 },
      { seed: 2, money: 88_163, followers: 41_175 },
      { seed: 3, money: 116_245, followers: 41_152 },
    ]
    for (const want of golden) {
      const g = withAccount(want.seed, { ...BUSY, followers: 40_000 })
      expect(totalFollowers(g)).toBe(40_000)
      yearlySocial(g)
      expect(JSON.stringify(peek<Profile>(g, 'social')!.accounts)).not.toContain('fake')
      expect(JSON.stringify(g.character.social)).not.toContain('fake')
      expect({ seed: want.seed, money: g.character.money, followers: account(g).followers }).toEqual(want)
    }
  })

  it('clamps a hostile fake count to the followers on the account', () => {
    const cases: [unknown, number][] = [[-5, 1_000], [1e15, 0], [Number.NaN, 1_000], ['9', 1_000], [2.6, 997]]
    for (const [bad, organic] of cases) {
      const g = withAccount(1, { followers: 1_000, fake: bad })
      expect(totalFollowers(g)).toBe(organic)
    }
  })

  it('keeps bought followers out of the CV', () => {
    const g = makeTestGame(1, { age: 30 })
    g.character.social = { platform: 'viewtube', handle: 'testplayer', followers: 20_000, verified: false, monetized: false, fake: 20_000 }
    expect(cvEntries(g).some((e) => e.id === 'd:social')).toBe(false)
    g.character.social = { platform: 'viewtube', handle: 'testplayer', followers: 20_000, verified: false, monetized: false, fake: 0 }
    expect(cvEntries(g).some((e) => e.id === 'd:social')).toBe(true)
  })

  it('keeps bought followers out of the CV when the mirror carries a hostile fake count', () => {
    const social = (fake: unknown) => ({ platform: 'viewtube', handle: 'testplayer', followers: 20_000, verified: false, monetized: false, fake }) as never
    const cases: [unknown, number, boolean][] = [[Number.NaN, 20_000, true], ['9', 20_000, true], [-5, 20_000, true], [1e15, 0, false], [20_000, 0, false], [2.6, 19_997, true]]
    for (const [bad, organic, onCv] of cases) {
      const g = makeTestGame(1, { age: 30 })
      g.character.social = social(bad)
      expect(totalFollowers(g)).toBe(organic)
      expect(cvEntries(g).some((e) => e.id === 'd:social')).toBe(onCv)
    }
  })
})

const NOTICE = { kind: 'notice', id: 'n', title: '', text: '' } as const

/** The first queued script choice for a script id (its data is what the script was handed). */
function queued(g: GameState, scriptId: string): { data: Json } | undefined {
  for (const e of g.queue) if (e.kind === 'choice' && e.scriptId === scriptId) return e as unknown as { data: Json }
}

describe('sponsored posts do not pay for bought followers', () => {
  const promo = (g: GameState) => findAction(g, socialMediaMenu.children(g), 'social.friendbook.promo')!
  const offerPay = (g: GameState): number => (queued(g, 'special.social.promo')!.data as { pay: number }).pay

  it('offers the minimum on a fully bought audience', () => {
    for (const seed of [1, 2, 3]) {
      const g = withAccount(seed, { platform: 'friendbook', followers: 1_000_000, fake: 1_000_000, posts: 1 })
      expect(fameOf(g)).toBeLessThan(FAMOUS)
      promo(g).run(g)
      expect(offerPay(g)).toBeLessThanOrEqual(50)
    }
  })

  it('still pays an organic audience (control)', () => {
    for (const seed of [1, 2, 3]) {
      const g = withAccount(seed, { platform: 'friendbook', followers: 1_000_000, fake: 0, posts: 1 })
      promo(g).run(g)
      expect(offerPay(g)).toBeGreaterThanOrEqual(10_000)
      expect(offerPay(g)).toBeLessThanOrEqual(50_000)
    }
  })

  it('pays only on the organic part of a mixed audience', () => {
    const g = withAccount(1, { platform: 'friendbook', followers: 1_000_000, fake: 900_000, posts: 1 })
    promo(g).run(g)
    // 100,000 organic at 1 to 5 percent.
    expect(offerPay(g)).toBeLessThanOrEqual(5_000)
  })

  it('wants 1,000 real followers before a sponsor calls', () => {
    const bought = withAccount(1, { platform: 'friendbook', followers: 5_000, fake: 4_500, posts: 1 })
    expect(promo(bought).disabledReason?.(bought)).toEqual(expect.stringMatching(/at least 1,000/))
    const real = withAccount(1, { platform: 'friendbook', followers: 5_000, fake: 0, posts: 1 })
    expect(promo(real).disabledReason?.(real) ?? null).toBeNull()
  })

  it('quotes the real audience to the sponsor', () => {
    const g = withAccount(1, { platform: 'friendbook', followers: 1_000_000, fake: 900_000, posts: 1 })
    promo(g).run(g)
    const offer = g.queue.find((e) => e.kind === 'choice' && e.scriptId === 'special.social.promo')
    expect(offer?.kind === 'choice' ? offer.text : '').toContain('to your 100K ')
  })

  it('does not take a shady promo loss out of the real audience twice', () => {
    const outcomes: string[] = []
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const g = withAccount(seed, { platform: 'friendbook', followers: 1_000_000, fake: 1_000_000 })
      runScript(g, 'special.social.promo', 'accept', { platform: 'friendbook', sponsor: 'S', product: 'P', shady: true, pay: 100 }, NOTICE)
      // No real follower is on the account, so none can unfollow.
      expect(account(g).followers).toBe(1_000_000)
      for (const e of g.queue) if (e.kind === 'notice') outcomes.push(e.text)
    }
    expect(outcomes.some((t) => t.includes(' The followers were bought, so none left.'))).toBe(true)
    expect(outcomes.some((t) => t.includes('unfollowed you'))).toBe(false)
  })
})

describe('other growth terms ignore bought followers', () => {
  /** Run a script on a bought account and on an empty one with the same dice: they must grow by the same amount. Returns how often it grew. */
  function sameDice(scriptId: string, choice: string, data: Json, platform: string): number {
    let grew = 0
    for (let seed = 1; seed <= 25; seed += 1) {
      const bought = withAccount(seed, { platform, followers: 1_000_000, fake: 1_000_000, posts: 3 })
      const empty = withAccount(seed, { platform, followers: 0, posts: 3 })
      runScript(bought, scriptId, choice, data, NOTICE)
      runScript(empty, scriptId, choice, data, NOTICE)
      expect(account(bought).followers - 1_000_000).toBe(account(empty).followers)
      if (account(empty).followers > 0) grew += 1
    }
    return grew
  }

  it('a clap-back', () => {
    expect(sameDice('special.social.hate', 'clap', { platform: 'friendbook' }, 'friendbook')).toBeGreaterThan(0)
  })

  it('a celebrity compliment', () => {
    expect(sameDice('special.social.celebAct', 'compliment', { platform: 'friendbook', celeb: 'Somebody Famous' }, 'friendbook')).toBeGreaterThan(0)
  })

  it('a celebrity insult', () => {
    expect(sameDice('special.social.celebAct', 'insult', { platform: 'friendbook', celeb: 'Somebody Famous' }, 'friendbook')).toBeGreaterThan(0)
  })

  it('a troll', () => {
    expect(sameDice('special.social.troll', 'devs', { platform: 'friendbook' }, 'friendbook')).toBeGreaterThan(0)
  })
})

describe('cuts and purges leave no stray bought followers', () => {
  it('a hacker takes the same share of bought and real followers', () => {
    const g = withAccount(1, { followers: 1_000_000, fake: 500_000 })
    g.character.money = 0
    runScript(g, 'special.social.hack', 'pay', { platform: 'viewtube', ransom: 500 }, NOTICE)
    expect(account(g).followers).toBe(700_000)
    expect(account(g).fake).toBe(350_000)
    // A never-bought account is cut exactly as before.
    const h = withAccount(1, { followers: 1_001 })
    runScript(h, 'special.social.hack', 'pay', { platform: 'viewtube', ransom: 500 }, NOTICE)
    expect(account(h).followers).toBe(701)
    expect(account(h).fake).toBeUndefined()
  })

  it('sweeps a small remainder in one go, so no field is left behind', () => {
    for (const left of [1, 2, 60, 99]) {
      const g = withAccount(1, { followers: 5_000, fake: left })
      yearlySocial(g)
      expect(account(g).fake).toBeUndefined()
    }
    const g = withAccount(1, { followers: 5_000, fake: 100 })
    yearlySocial(g)
    expect(account(g).fake).toBe(70)
  })

  it('ends in no more than 40 purge lines for the biggest pack', () => {
    const g = withAccount(1, { followers: 1_000_000, fake: 1_000_000 })
    let years = 0
    while (account(g).fake !== undefined && years < 100) {
      g.character.age += 1
      g.year += 1
      yearlySocial(g)
      years += 1
    }
    expect(account(g).fake).toBeUndefined()
    expect(years).toBeLessThanOrEqual(40)
    const lines = g.log.flatMap((y) => y.entries).filter((e) => /removed .* fake followers\.$/.test(e.text))
    expect(lines.length).toBeLessThanOrEqual(40)
    expect(lines.every((e) => !/removed [0-9] fake/.test(e.text))).toBe(true)
  })
})

describe('the account view tells bought from real', () => {
  it('the account header names the bought share', () => {
    const g = withAccount(1, { followers: 1_000_000, fake: 400_000 })
    const menu = socialMediaMenu.children(g).find((n) => n.type === 'menu' && n.id === 'social.viewtube')
    expect(menu?.type === 'menu' ? menu.header?.(g) : '').toContain('1,000,000 subscribers (400,000 bought)')
    const h = withAccount(1, { followers: 1_000_000 })
    const menuH = socialMediaMenu.children(h).find((n) => n.type === 'menu' && n.id === 'social.viewtube')
    expect(menuH?.type === 'menu' ? menuH.header?.(h) : '').not.toContain('bought')
  })

  it('the CV mirror follows the account with the biggest real audience', () => {
    const g = withAccount(1, { followers: 1_000_000, fake: 1_000_000, posts: 4 })
    prof<Profile>(g, 'social', () => ({ accounts: [] })).accounts.push({ ...account(g), platform: 'friendbook', handle: 'real', followers: 50_000, fake: undefined, posts: 4 } as Account)
    yearlySocial(g)
    expect(g.character.social?.platform).toBe('friendbook')
  })
})

describe('other readers of the main account ignore bought followers', () => {
  const influencer = (fake?: unknown): string | null => {
    const g = makeTestGame(1, { age: 60 })
    g.character.social = { platform: 'viewtube', handle: 'testplayer', followers: 1_000_000, verified: true, monetized: true, ...(fake === undefined ? {} : { fake }) } as never
    return computeRibbon(g)
  }

  it('the influencer ribbon needs real followers', () => {
    expect(influencer()).toBe('influencer')
    expect(influencer(1_000_000)).not.toBe('influencer')
    expect(influencer(Number.NaN)).toBe('influencer')
  })

  it('online art sells on the real audience only', () => {
    const sold = (seed: number, social: { followers: number; fake: number }): boolean => {
      const g = makeTestGame(seed, { age: 30 })
      g.character.social = { platform: 'viewtube', handle: 'testplayer', verified: false, monetized: false, ...social }
      g.flags['creative.pieces'] = [{ title: 'Sunset', q: 30, medium: 'paint', age: 30 }]
      runScript(g, 'act.creative.sellVenue', 'online', { index: 0 }, NOTICE)
      return (g.flags['creative.pieces'] as unknown[]).length === 0
    }
    let differs = 0
    for (let seed = 1; seed <= 60; seed += 1) {
      const nobody = sold(seed, { followers: 0, fake: 0 })
      expect(sold(seed, { followers: 1_000_000, fake: 1_000_000 })).toBe(nobody)
      if (sold(seed, { followers: 1_000_000, fake: 0 }) !== nobody) differs += 1
    }
    // The control: a real audience of a million does lift the odds for some dice.
    expect(differs).toBeGreaterThan(0)
  })

  it('a social campaign stop counts the real audience only', () => {
    const swing = (followers: number, fake: number): number => {
      const g = makeTestGame(3, { age: 40 })
      g.year = 2020
      g.character.social = { platform: 'viewtube', handle: 'testplayer', followers, verified: false, monetized: false, ...(fake > 0 ? { fake } : {}) }
      runScript(g, 'special.pol.trail', 'social', { office: 'school', party: 'independent', issue: 'economy', budget: 0, poll: 45, round: 1, opponent: 'Rival', oppParty: 'centrist', incumbentRun: false }, NOTICE)
      return (queued(g, 'special.pol.trail')!.data as { poll: number }).poll
    }
    const nobody = swing(0, 0)
    expect(swing(1_000_000, 1_000_000)).toBe(nobody)
    expect(swing(1_000_000, 0)).toBe(nobody + 3)
  })
})

