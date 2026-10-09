import { describe, expect, it } from 'vitest'
import { addFame, bump, claimYearly, compact, fameOf, fameToward, hire, ownFlag, ownerKey, ownerMatches, peek, prof, setOwnFlag, setRole, syncTenure, vary, yearlyList } from '../src/game/special/common'
import { yearlyFame } from '../src/game/special/fame'
import { yearlyModel } from '../src/game/special/model'
import { totalFollowers, yearlySocial } from '../src/game/special/social'
import { fameMenu, militaryMenu, socialMediaMenu, specialCareersMenu, specialJobNodes, yearlySpecial } from '../src/game/special'
import type { GameState, MenuNode } from '../src/game/types'
import { makeTestGame } from './helpers'

function renderNodes(g: GameState, nodes: MenuNode[], depth = 0): void {
  if (depth > 5) return
  for (const node of nodes) {
    node.visible?.(g)
    if (node.type === 'info') {
      if (typeof node.text === 'function') node.text(g)
      continue
    }
    if (node.type === 'heading') continue
    if (typeof node.subtitle === 'function') node.subtitle(g)
    node.disabledReason?.(g)
    node.hint?.(g)
    if (node.type === 'action') {
      node.confirm?.(g)
      node.input?.defaultValue?.(g)
    } else {
      node.header?.(g)
      renderNodes(g, node.children(g), depth + 1)
    }
  }
}

describe('special career shared-state safety', () => {
  it('keeps profiles, cached lists, personal flags and yearly claims through name changes', () => {
    const g = makeTestGame(100, { age: 30 })
    const legacyOwner = `${g.character.id}:${g.character.firstName}:${g.character.lastName}:${g.year - g.character.age}`
    const stableOwner = ownerKey(g)
    g.flags['special.legacy'] = { owner: legacyOwner, score: 42 }
    g.flags['special.list.legacy'] = { owner: legacyOwner, age: g.character.age, items: ['kept'] }
    g.flags['special.yearly.legacy'] = { owner: legacyOwner, year: g.year, age: g.character.age }
    g.flags['special.own.legacy'] = { owner: legacyOwner, value: 'kept' }

    g.character.firstName = 'Renamed'
    g.character.lastName = 'After Marriage'
    expect(ownerKey(g)).toBe(stableOwner)
    expect(ownerMatches(g, legacyOwner)).toBe(true)
    expect(peek<{ score: number }>(g, 'legacy')?.score).toBe(42)
    expect(yearlyList(g, 'legacy', () => ['rerolled'])).toEqual(['kept'])
    expect(claimYearly(g, 'legacy')).toBe(false)
    expect(ownFlag(g, 'legacy')).toBe('kept')

    const mutable = prof(g, 'legacy', () => ({ score: 0 })) as { owner: string; score: number }
    expect(mutable).toMatchObject({ owner: stableOwner, score: 42 })
    setOwnFlag(g, 'new', 'stable')
    expect(g.flags['special.own.new']).toMatchObject({ owner: stableOwner, value: 'stable' })

    g.character.id = 'next-generation-character'
    expect(peek(g, 'legacy')).toBeNull()
    expect(ownFlag(g, 'legacy')).toBeUndefined()
  })

  it('does not pay a special-career salary twice after a same-year surname change', () => {
    const g = makeTestGame(1001, { age: 30, money: 0 })
    g.character.stats.looks = 100
    g.character.job = {
      defId: 'model', title: 'Model', company: 'Test Agency', category: 'special', salary: 10_000,
      level: 0, performance: 90, yearsInRole: 0, yearsAtCompany: 0,
      data: { tier: 0, gigsThisYear: 0, sabotaged: 0 },
    }
    yearlyModel(g)
    expect(g.character.money).toBe(10_000)
    const rng = g.rng
    g.character.lastName = 'Changed'
    yearlyModel(g)
    expect(g.character.money).toBe(10_000)
    expect(g.rng).toBe(rng)
  })

  it('normalizes malformed job numbers instead of persisting NaN or infinity', () => {
    const g = makeTestGame(101, { age: 30 })
    const { job } = hire(g, {
      defId: 'test.special', title: 'Tester', company: 'Test Co',
      salary: Number.NaN, level: Number.POSITIVE_INFINITY, performance: Number.NaN,
    })
    expect(job).toMatchObject({ salary: 0, level: 0, performance: 60 })

    job.data.startAge = Number.POSITIVE_INFINITY
    job.data.roleStartAge = Number.NaN
    job.yearsAtCompany = Number.NaN
    g.character.age = Number.NaN
    syncTenure(g, job)
    expect(job.yearsAtCompany).toBe(0)
    expect(job.yearsInRole).toBe(0)

    setRole(g, job, 'Lead Tester', Number.POSITIVE_INFINITY, Number.NaN)
    bump(job, Number.NaN)
    expect(job).toMatchObject({ salary: 0, level: 0, performance: 60 })
  })

  it('ignores invalid fame changes and keeps display helpers finite', () => {
    const g = makeTestGame(102)
    g.character.hidden.fame = 40
    addFame(g, Number.NaN)
    fameToward(g, Number.POSITIVE_INFINITY, 5)
    fameToward(g, 90, Number.NaN)
    expect(g.character.hidden.fame).toBe(40)
    expect(fameOf(g)).toBe(40)

    g.character.hidden.fame = Number.NaN
    expect(fameOf(g)).toBe(0)
    addFame(g, 5)
    expect(g.character.hidden.fame).toBe(5)
    expect(compact(Number.POSITIVE_INFINITY)).toBe('0')
    expect(Number.isFinite(vary(g, Number.POSITIVE_INFINITY, Number.NaN))).toBe(true)
  })

  it('repairs malformed fame royalty and podcast records before yearly settlement', () => {
    const g = makeTestGame(103, { age: 30 })
    g.flags['special.fame'] = {
      owner: ownerKey(g),
      books: [{ title: 3, age: Number.NaN, verdict: null, earned: Number.POSITIVE_INFINITY, royalty: 500 }, 'bad'],
      podcast: { name: 7, listeners: Number.POSITIVE_INFINITY, episodes: Number.NaN, startedAge: -50 },
      merchLines: Number.NaN,
      commercials: Number.POSITIVE_INFINITY,
    } as never

    expect(() => yearlyFame(g)).not.toThrow()
    const profile = g.flags['special.fame'] as unknown as {
      books: { title: string; royalty: number }[]
      podcast: { name: string; listeners: number; episodes: number; startedAge: number }
      merchLines: number
      commercials: number
    }
    expect(profile.books).toHaveLength(1)
    expect(profile.books[0]).toMatchObject({ title: 'Untitled', royalty: 250 })
    expect(profile.podcast).toMatchObject({ name: 'Untitled Show', episodes: 0, startedAge: 0 })
    expect(Number.isFinite(profile.podcast.listeners)).toBe(true)
    expect(profile.merchLines).toBe(0)
    expect(profile.commercials).toBe(0)
  })

  it('deduplicates and bounds malformed social accounts without crashing menus or settlement', () => {
    const g = makeTestGame(104, { age: 30 })
    g.flags['special.social'] = {
      owner: ownerKey(g),
      accounts: [
        { platform: 'Facebook', handle: 4, followers: 123, verified: 'yes', monetized: false, posts: Number.NaN, celebFollowers: 'bad' },
        { platform: 'friendbook', handle: 'duplicate', followers: 999 },
        null,
      ],
    } as never

    expect(totalFollowers(g)).toBe(123)
    expect(() => yearlySocial(g)).not.toThrow()
    const profile = g.flags['special.social'] as unknown as { accounts: { platform: string; followers: number; celebFollowers: string[] }[] }
    expect(profile.accounts).toHaveLength(1)
    expect(profile.accounts[0].platform).toBe('friendbook')
    expect(Number.isFinite(profile.accounts[0].followers)).toBe(true)
    expect(profile.accounts[0].celebFollowers).toEqual([])
  })

  it('does not crash yearly settlement on incomplete legacy career profiles', () => {
    for (const key of ['actor', 'astronaut', 'athlete', 'fame', 'gamedev', 'hustler', 'military', 'model', 'music', 'politics', 'social', 'sports', 'sports.esports', 'sports.fight', 'sports.ind', 'sports.sumo', 'sports.wrestle', 'sports.youth']) {
      const g = makeTestGame(200 + key.length, { age: 30 })
      g.flags[`special.${key}`] = {
        owner: ownerKey(g),
        credits: 'bad', discography: 'bad', careers: 'bad', halls: 'bad', medals: 'bad', sponsors: 'bad', games: 'bad',
        attrs: 'bad', titles: 'bad', mmr: 'bad', skills: 'bad', planets: 'bad', couture: 'bad', rejectedBy: 'bad', held: 'bad',
        books: 'bad', accounts: 'bad', awards: 'bad', cases: 'bad', sports: 'bad', pro: 'bad', amateurs: 'bad', rivals: 'bad',
      } as never
      expect(() => yearlySpecial(g), key).not.toThrow()
      expect(() => renderNodes(g, [specialCareersMenu, fameMenu, socialMediaMenu, militaryMenu]), `${key} menus`).not.toThrow()
    }
  })

  it('repairs malformed fighter job data before menus and yearly settlement', () => {
    const g = makeTestGame(240, { age: 30 })
    g.character.job = {
      defId: 'sports.fighter', title: 'Professional Fighter', company: 'Test Promotion', category: 'special',
      salary: 0, level: 0, performance: 60, yearsInRole: 0, yearsAtCompany: 0,
      data: { disc: 'not-a-sport', tier: 'major', rank: 0, belts: 'missing', defenses: Number.POSITIVE_INFINITY, champ: {}, earned: Number.NaN } as never,
    }

    expect(() => renderNodes(g, specialJobNodes(g))).not.toThrow()
    expect(() => yearlySpecial(g)).not.toThrow()
    expect(g.character.job.data).toMatchObject({
      disc: 'mma', tier: 'major', rank: 0, belts: [], defenses: 0, champ: null, earned: 0,
      regionalChamp: false, fightsLeft: 0, streak: 0, promoWins: 0, injured: 0,
    })
    expect(JSON.stringify(g)).not.toContain('NaN')
  })

  it('repairs malformed politician job data before menus, actions and yearly settlement', () => {
    const g = makeTestGame(241, { age: 40 })
    g.character.job = {
      defId: 'politician', title: 'Mayor', company: 'Test City', category: 'special',
      salary: 95_000, level: 1, performance: 65, yearsInRole: 0, yearsAtCompany: 0,
      data: { hot: 'missing', bills: 'missing', approval: Number.NaN, warChest: Number.POSITIVE_INFINITY } as never,
    }

    const nodes = specialJobNodes(g)
    expect(() => renderNodes(g, nodes)).not.toThrow()
    const newspaper = nodes.find((node) => node.id === 'pol.news')
    expect(newspaper?.type).toBe('action')
    expect(() => newspaper?.type === 'action' && newspaper.run(g)).not.toThrow()
    expect(() => yearlySpecial(g)).not.toThrow()
    expect(g.character.job.data).toMatchObject({
      office: 'school', party: 'independent', approval: expect.any(Number), hot: expect.any(Array), bills: expect.any(Array),
      warChest: 0, favors: 0, scandals: 0, termOver: false,
    })
    expect(Number.isFinite(g.character.job.data.approval)).toBe(true)
    expect(JSON.stringify(g)).not.toContain('NaN')
  })
})
