import { describe, expect, it } from 'vitest'
import { cvEntries } from '../src/game/cv'
import { typicalIncome } from '../src/game/events/wealth-core'
import { runScript } from '../src/game/scripts'
import { peek, prof } from '../src/game/special/common'
import { socialMediaMenu, totalFollowers, yearlySocial, type Account } from '../src/game/special/social'
import type { GameState, MenuAction, MenuNode } from '../src/game/types'
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
      yearlySocial(g)
      expect(g.character.money).toBe(0)
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
    expect(g.character.money).toBeGreaterThan(0)
    expect(g.character.money).toBeLessThanOrEqual(1500 * typicalIncome(g))
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
})
