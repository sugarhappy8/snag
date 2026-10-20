// R1-N4: ranking and places. searchRank.ts turns a query into ordered hits over a built index (prefix, word start,
// substring, subsequence; locked rows last; pins and recents only reorder inside a tier). place.ts is the string and
// object form of "where a thing lives", shared by pins, recents and inbox links.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetFlags } from '../src/game/flags'
import { createPerson } from '../src/game/people'
import { parsePlaceKey, placeKey, placeOfEntry, recentFromSpot, samePlace, type PlaceRef } from '../src/ui/nav/place'
import { buildIndex, type IndexEntry, type IndexRoots, type SearchIndex } from '../src/ui/nav/searchIndex'
import { DO_ANYTHING_ID, normalize, search, tapsToReach, type RankContext } from '../src/ui/nav/searchRank'
import type { MenuAction, MenuGroup, MenuNode } from '../src/game/types'
import { buildIndexCached, frozen, navState, type NavTab } from './nav-kit'

/** The CEO tree takes seconds to index; the default timeouts are too tight on a loaded box. */
const HEAVY = 120_000

beforeEach(() => {
  resetFlags()
})

afterEach(() => {
  resetFlags()
})

const NONE: RankContext = { pins: [], recents: [] }

function entry(label: string, over: Partial<IndexEntry> = {}): IndexEntry {
  const id = over.id ?? label.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  const idPath = over.idPath ?? [id]
  return {
    key: `${over.type ?? 'action'}:${id}:${label}:${idPath.join('/')}`,
    tab: 'activities',
    idPath,
    type: 'action',
    id,
    label,
    emoji: '*',
    crumbs: ['Activities'],
    labelN: normalize(label),
    kwN: '',
    crumbN: 'activities',
    depth: idPath.length,
    locked: null,
    input: false,
    ...over,
  }
}

function indexOf(...entries: IndexEntry[]): SearchIndex {
  return { key: 'k', entries, complete: true, truncated: false, nodes: entries.length, failures: 0 }
}

function labels(hits: { entry: IndexEntry }[]): string[] {
  return hits.map((h) => h.entry.label)
}

function ids(hits: { entry: IndexEntry }[]): string[] {
  return hits.map((h) => h.entry.id)
}

// ---------------------------------------------------------------------------

describe('normalize', () => {
  it('13. folds case and diacritics, turns & into and, and collapses punctuation', () => {
    expect(normalize('Mind & Body')).toBe('mind and body')
    expect(normalize('  Café   Crème!! ')).toBe('cafe creme')
    expect(normalize('Renée’s ❤️ Fund')).toBe('renee s fund')
    expect(normalize('A.B/C-D_E')).toBe('a b c d e')
    expect(normalize('Fiancé(e)')).toBe('fiance e')
    expect(normalize('')).toBe('')
    expect(normalize('???')).toBe('')
    expect(normalize('\u{1F4B0} 401(k)')).toBe('401 k')
  })
})

describe('tiers', () => {
  const tierOf = (label: string, query: string): number | undefined => search(indexOf(entry(label)), query, NONE)[0]?.tier

  it('14. prefix is 0, word start 1, substring 2, subsequence 3', () => {
    expect(tierOf('Stocks', 'sto')).toBe(0)
    expect(tierOf('Penny Stocks', 'stock')).toBe(1)
    expect(tierOf('Stocks', 'tock')).toBe(2)
    expect(tierOf('Stocks', 'stcs')).toBe(3)
  })

  it('14b. a subsequence needs three characters, and a non-match is no hit', () => {
    expect(tierOf('Stocks', 'sc')).toBeUndefined()
    expect(tierOf('Stocks', 'zzz')).toBeUndefined()
    expect(tierOf('Stocks', 'stk')).toBe(3)
    expect(tierOf('Stocks', 'tsc')).toBeUndefined()
  })

  it('14c. prefix only counts for the first token; a later token that starts the label is a word start', () => {
    expect(tierOf('Penny Stocks', 'penny stocks')).toBe(1)
    expect(tierOf('Penny Stocks', 'pen')).toBe(0)
    expect(tierOf('Penny Stocks', 'stocks penny')).toBe(1)
  })

  it('14d. keywords and breadcrumbs match at word start or substring, never as a prefix of the label', () => {
    const e = entry('Crypto', { kwN: normalize('bitcoin coins crypto'), crumbN: normalize('Assets Investments') })
    expect(search(indexOf(e), 'bitcoin', NONE)[0]?.tier).toBe(1)
    expect(search(indexOf(e), 'coin', NONE)[0]?.tier).toBe(1)
    expect(search(indexOf(e), 'itco', NONE)[0]?.tier).toBe(2)
    expect(search(indexOf(e), 'invest', NONE)[0]?.tier).toBe(1)
    // A subsequence match is for the label only.
    expect(search(indexOf(e), 'btcn', NONE)).toEqual([])
  })

  it('14e. the entry tier is the worst token tier of its best field', () => {
    const e = entry('Stocks', { kwN: normalize('equities stock market'), crumbN: normalize('Assets Investments') })
    // stocks: label prefix (0). invest: crumbs word start (1). So the entry is a 1.
    expect(search(indexOf(e), 'stocks invest', NONE)[0]?.tier).toBe(1)
    expect(search(indexOf(e), 'stocks', NONE)[0]?.tier).toBe(0)
  })
})

describe('sorting', () => {
  it('15. inside a tier: pinned, then recents (newest first), then shallower, then non-entity, then label', () => {
    const person = { kind: 'person' as const, id: 'p1', name: 'Sam' }
    const pinned = entry('Tax pinned', { idPath: ['a', 'b', 'tax-pinned'] })
    const r0 = entry('Tax recent newest', { idPath: ['a', 'b', 'tax-r0'] })
    const r1 = entry('Tax recent older', { idPath: ['a', 'b', 'tax-r1'] })
    const shallowB = entry('Tax b', { idPath: ['tax-b'] })
    const shallowA = entry('Tax a', { idPath: ['tax-a'] })
    const shallowEntity = entry('Tax entity', { idPath: ['tax-e'], entity: person })
    const mid = entry('Tax mid', { idPath: ['x', 'tax-mid'] })
    const deep = entry('Tax deep', { idPath: ['x', 'y', 'tax-deep'] })
    const index = indexOf(deep, shallowEntity, shallowB, r1, mid, pinned, shallowA, r0)
    const ctx: RankContext = {
      pins: [placeOfEntry(pinned)],
      recents: [placeOfEntry(r0), placeOfEntry(r1)],
    }
    const hits = search(index, 'tax', ctx)
    expect(labels(hits)).toEqual(['Tax pinned', 'Tax recent newest', 'Tax recent older', 'Tax a', 'Tax b', 'Tax entity', 'Tax mid', 'Tax deep'])
    expect(hits.map((h) => h.pinned)).toEqual([true, false, false, false, false, false, false, false])
    expect(hits.map((h) => h.recent)).toEqual([-1, 0, 1, -1, -1, -1, -1, -1])
    // Without a context the pin and the recents are nothing special.
    expect(labels(search(index, 'tax', NONE))[0]).toBe('Tax a')
  })

  it('15b. a pinned or recent place is found by tab, path and id, not by label', () => {
    const a = entry('Same name', { id: 'one', idPath: ['one'] })
    const b = entry('Same name', { id: 'two', idPath: ['two'] })
    const hits = search(indexOf(a, b), 'same', { pins: [placeOfEntry(b)], recents: [] })
    expect(ids(hits)).toEqual(['two', 'one'])
  })

  it('16. locked rows come after every unlocked row, whatever the tier', () => {
    const lockedPrefix = entry('Casino', { locked: 'You are too young to do that.' })
    const unlockedSubstring = entry('Mini casino bar')
    const unlockedWord = entry('Hotel casino')
    const unlockedSubseq = entry('Cassino house')
    const hits = search(indexOf(lockedPrefix, unlockedSubseq, unlockedWord, unlockedSubstring), 'casino', NONE)
    expect(hits.map((h) => h.tier)).toEqual([1, 1, 3, 0])
    expect(labels(hits)).toEqual(['Hotel casino', 'Mini casino bar', 'Cassino house', 'Casino'])
    expect(hits.at(-1)?.locked).toBe('You are too young to do that.')
    expect(hits.slice(0, -1).every((h) => h.locked === null)).toBe(true)
  })

  it('17. a pinned subsequence match does not outrank an unpinned prefix match', () => {
    const subseq = entry('Sports stage tune', { idPath: ['sports-stage-tune'] })
    const prefix = entry('Stud farm', { idPath: ['a', 'b', 'c', 'stud-farm'] })
    const hits = search(indexOf(subseq, prefix), 'stu', { pins: [placeOfEntry(subseq)], recents: [placeOfEntry(subseq)] })
    expect(labels(hits)).toEqual(['Stud farm', 'Sports stage tune'])
    expect(hits.map((h) => h.tier)).toEqual([0, 3])
    expect(hits.map((h) => h.pinned)).toEqual([false, true])
  })

  it('15c. the limit is honoured and the default is 30', () => {
    const many = Array.from({ length: 80 }, (_, i) => entry(`Tax ${String(i).padStart(2, '0')}`, { id: `t${i}` }))
    expect(search(indexOf(...many), 'tax', NONE)).toHaveLength(30)
    expect(search(indexOf(...many), 'tax', NONE, 5)).toHaveLength(5)
    expect(search(indexOf(...many), 'tax', NONE, 500)).toHaveLength(80)
    expect(search(indexOf(...many), 'tax', NONE, 0)).toEqual([])
    expect(search(indexOf(...many), 'tax', NONE, -3)).toEqual([])
    expect(search(indexOf(...many), 'tax', NONE, Number.NaN)).toHaveLength(30)
    expect(labels(search(indexOf(...many), 'tax', NONE, 3))).toEqual(['Tax 00', 'Tax 01', 'Tax 02'])
  })
})

describe('matching on a built index', () => {
  /** Roots for a synthetic index, the other tabs empty. */
  function only(tab: NavTab, group: MenuGroup): IndexRoots {
    const roots: Record<string, MenuGroup> = {}
    for (const t of ['occupation', 'assets', 'relationships', 'activities']) roots[t] = t === tab ? group : { type: 'menu', id: t, label: t, emoji: 'x', children: () => [] }
    return roots as IndexRoots
  }
  const act = (id: string, label = id): MenuAction => ({ type: 'action', id, label, emoji: 'x', run: () => {} })
  const grp = (id: string, label: string, children: MenuNode[]): MenuGroup => ({ type: 'menu', id, label, emoji: 'x', children: () => children })

  it('18. "alex propose" finds propose under Alex and not under Blake', () => {
    const root = grp('relationships', 'Relationships', [
      grp('person.p1', 'Alex Stone', [act('propose', 'Propose'), act('chat', 'Chat')]),
      grp('person.p2', 'Blake Reed', [act('propose', 'Propose'), act('chat', 'Chat')]),
    ])
    const index = buildIndex(frozen('kid'), only('relationships', root))
    const hits = search(index, 'alex propose', NONE)
    expect(hits.map((h) => h.entry.idPath.join('/'))).toEqual(['person.p1/propose'])
    expect(search(index, 'blake propose', NONE).map((h) => h.entry.idPath.join('/'))).toEqual(['person.p2/propose'])
    // The person group itself is a plain "alex" hit, first.
    expect(search(index, 'alex', NONE)[0].entry.id).toBe('person.p1')
    // Order of the words does not matter.
    expect(search(index, 'propose alex', NONE).map((h) => h.entry.idPath.join('/'))).toEqual(['person.p1/propose'])
  })

  it('18b. "alexandra propose" finds only the partner\'s propose row on the real adult', () => {
    const g = navState('adult')
    const partner = g.people.find((p) => p.relation === 'partner')
    const friend = g.people.find((p) => p.relation === 'friend')
    expect(partner && friend).toBeTruthy()
    if (!partner || !friend) return
    partner.firstName = 'Alexandra'
    partner.lastName = 'Quill'
    friend.firstName = 'Blake'
    createPerson(g, { relation: 'friend', age: 30 })
    const index = buildIndex(g)
    // The same action id sits under every person; only the partner has this one, and the name picks the person.
    expect(index.entries.filter((e) => e.id === 'propose').length).toBeGreaterThan(0)
    expect(search(index, 'alexandra propose', NONE).map((h) => h.entry.idPath.join('/'))).toEqual([`person.${partner.id}/propose`])
    expect(search(index, 'blake propose', NONE)).toEqual([])
    expect(search(index, 'alexandra', NONE)[0].entry.id).toBe(`person.${partner.id}`)
  })

  it(
    '19. keywords find rows the label does not say',
    () => {
      const adult = buildIndexCached('adult')
      const first = (q: string, id: string): void => {
        const hits = search(adult, q, NONE, 5)
        expect(ids(hits), q).toContain(id)
      }
      first('marry', 'love')
      first('mortgage', 'banking')
      first('bitcoin', 'inv-crypto')
      first('gamble', 'casino')
    },
    HEAVY,
  )

  it('19b. breadcrumbs find a row by where it lives: "computer venture" finds Start a Venture', () => {
    // The adult owns no computer, so the Computer list is empty of ventures; give the clone a laptop (computer.ts isComputer).
    const g = navState('adult')
    g.assets.push({ ...structuredClone(g.assets[0]), id: 'laptop-test', kind: 'other', name: 'Laptop', condition: 80 })
    const index = buildIndex(g)
    const hits = search(index, 'computer venture', NONE, 10)
    const start = hits.find((h) => h.entry.id === 'computer.dev.startVenture')
    expect(start, labels(hits).join(' | ')).toBeDefined()
    // "computer" is in no label of the row, only in its crumbs; "venture" is in its label.
    expect(start?.entry.labelN).not.toContain('computer')
    expect(start?.entry.crumbN).toContain('computer')
    expect(start?.entry.crumbs).toEqual(['Activities', 'Computer'])
    expect(start?.tier).toBe(1)
    // The rows inside it have Computer and Venture in their crumbs, so they come back for the same words.
    expect(hits.some((h) => h.entry.idPath.join('/') === 'computer/computer.dev.startVenture/computer.dev.start.saas')).toBe(true)
  })
})

describe('acceptance', () => {
  it(
    '20. "stock" on the adult finds the Stocks group in the first 3 hits, within 4 taps',
    () => {
      const adult = buildIndexCached('adult')
      const hits = search(adult, 'stock', NONE)
      const at = hits.slice(0, 3).findIndex((h) => h.entry.id === 'inv-stocks')
      expect(at, labels(hits.slice(0, 5)).join(' | ')).toBeGreaterThanOrEqual(0)
      const stocks = hits[at].entry
      // The route is the canonical one: tab, then the ids from the root's children down.
      expect([stocks.tab, ...stocks.idPath]).toEqual(['assets', 'investments', 'inv-stocks'])
      expect(stocks.type).toBe('menu')
      expect(tapsToReach(stocks)).toBeLessThanOrEqual(4)
      expect(tapsToReach(stocks)).toBe(3)
    },
    HEAVY,
  )

  it('20b. tapsToReach: open the palette, type, tap; one more when the action asks for input', () => {
    expect(tapsToReach(entry('Plain'))).toBe(3)
    expect(tapsToReach(entry('Ask', { input: true }))).toBe(4)
    expect(tapsToReach(entry('Group', { type: 'menu', input: true }))).toBe(3)
  })

  /**
   * Query, the node id that must be among the first `within` hits (3 unless said), and the id on the CEO when it differs
   * (a CEO has no Jobs list). Two queries are weaker than the rest, on purpose kept honest here: the ranker puts a label
   * prefix (tier 0) before a keyword hit (tier 1), so "house" lists House Cleaner, Households & Work and Housekeeping
   * Robot before Real Estate (4th), and "economy" lists the eight vacation destinations that have an Economy row before
   * the Economy group (9th, its label is "The Economy Around You"). Both are inside the 30 hits the palette shows.
   */
  interface Case {
    q: string
    id: string
    ceo?: string
    within?: number
  }
  const TABLE: Case[] = [
    { q: 'doctor', id: 'doctor' },
    { q: 'gym', id: 'mb.gym' },
    { q: 'casino', id: 'casino' },
    { q: 'lottery', id: 'lottery' },
    { q: 'loan', id: 'banking' },
    { q: 'mortgage', id: 'banking' },
    { q: 'house', id: 'realEstate', within: 5 },
    { q: 'car', id: 'carDealers' },
    { q: 'vacation', id: 'vacation' },
    { q: 'adopt', id: 'adoption' },
    { q: 'pray', id: 'pray' },
    { q: 'will', id: 'will' },
    { q: 'emigrate', id: 'emigrate' },
    { q: 'licenses', id: 'licenses' },
    { q: 'job', id: 'occupation.jobs', ceo: 'occupation.freelance' },
    { q: 'resume', id: 'cv.menu' },
    { q: 'crypto', id: 'inv-crypto' },
    { q: 'bonds', id: 'inv-bonds' },
    { q: 'invest', id: 'investments' },
    { q: 'start a company', id: 'biz.start' },
    { q: 'shopping', id: 'shopping' },
    { q: 'economy', id: 'economy', within: 12 },
    { q: 'social media', id: 'socialMedia' },
    { q: 'pets', id: 'pets' },
    { q: 'crime', id: 'crime' },
  ]

  for (const name of ['adult', 'ceo'] as const) {
    it(
      `21. ${name}: 25 canned queries put the expected node among the first hits`,
      () => {
        expect(TABLE).toHaveLength(25)
        const index = buildIndexCached(name)
        const misses: string[] = []
        for (const c of TABLE) {
          const want = name === 'ceo' ? (c.ceo ?? c.id) : c.id
          const within = c.within ?? 3
          const hits = search(index, c.q, NONE, within)
          if (!ids(hits).includes(want)) misses.push(`${c.q} -> ${want} within ${within}, got ${labels(hits.slice(0, 3)).join(' | ')}`)
        }
        expect(misses).toEqual([])
      },
      HEAVY,
    )
  }
})

describe('edges', () => {
  it('22. empty and whitespace queries give nothing; a 300-character query is fine; the limit is honoured', () => {
    const index = indexOf(entry('Stocks'), entry('Bonds'))
    expect(search(index, '', NONE)).toEqual([])
    expect(search(index, '   \t\n ', NONE)).toEqual([])
    expect(search(index, '!!! ???', NONE)).toEqual([])
    expect(() => search(index, 'a'.repeat(300), NONE)).not.toThrow()
    expect(search(index, 'a'.repeat(300), NONE)).toEqual([])
    expect(() => search(index, 'stocks '.repeat(60), NONE)).not.toThrow()
    expect(search(index, 's', NONE).length).toBeGreaterThan(0)
    expect(search(indexOf(), 'stocks', NONE)).toEqual([])
    // Not a string at all (a stale caller): nothing, no throw.
    expect(search(index, undefined as unknown as string, NONE)).toEqual([])
  })

  it('22b. DO_ANYTHING_ID is the id of the Do Anything action', () => {
    expect(DO_ANYTHING_ID).toBe('doAnything')
    const adult = buildIndexCached('adult')
    expect(adult.entries.some((e) => e.id === DO_ANYTHING_ID)).toBe(true)
  })

  it('23. ranking 6000 synthetic entries takes well under 250 ms', () => {
    const entries: IndexEntry[] = []
    const words = ['stock', 'bond', 'house', 'loan', 'pet', 'gym', 'tax', 'mortgage', 'crypto', 'doctor', 'travel', 'shop']
    for (let i = 0; i < 6000; i++) {
      const a = words[i % words.length]
      const b = words[(i * 7 + 3) % words.length]
      const path = [`g${i % 17}`, `h${i % 5}`, `n${i}`]
      entries.push(entry(`${a} ${b} ${i}`, { id: `n${i}`, idPath: path, kwN: normalize(`${b} ${a} deal`), crumbN: normalize(`Assets Group ${i % 17} Sub ${i % 5}`), locked: i % 50 === 0 ? 'Not yet.' : null }))
    }
    const index = indexOf(...entries)
    const ctx: RankContext = { pins: entries.slice(10, 22).map(placeOfEntry), recents: entries.slice(100, 108).map(placeOfEntry) }
    search(index, 'sto', ctx)
    const t0 = performance.now()
    for (const q of ['s', 'stock', 'mortgage tax', 'stcs', 'a b']) search(index, q, ctx)
    const per = (performance.now() - t0) / 5
    expect(per).toBeLessThan(250)
  })
})

describe('places', () => {
  it('24. placeKey round-trips, including ids with /, #, % and non-ASCII text', () => {
    const refs: PlaceRef[] = [
      { tab: 'activities', path: [] },
      { tab: 'activities', path: ['computer', 'ventures'] },
      { tab: 'assets', path: ['a/b', 'c#d', '100%', 'naïve', '日本', 'x y', 'q?&=+'], id: 'id/with#odd%chars é' },
      { tab: 'relationships', path: ['person.p3', 'money'], id: 'lend' },
      { tab: 'occupation', path: [], id: 'resign' },
    ]
    for (const ref of refs) {
      const key = placeKey(ref)
      expect(parsePlaceKey(key), key).toEqual(ref)
      expect(key.split('#').length).toBeLessThanOrEqual(2)
      expect(key.split(/[/#]/)[0]).toBe(ref.tab)
    }
    expect(placeKey({ tab: 'activities', path: ['computer', 'ventures'] })).toBe('activities/computer/ventures')
    expect(placeKey({ tab: 'activities', path: ['computer'], id: 'v1' })).toBe('activities/computer#v1')
    expect(placeKey({ tab: 'assets', path: [] })).toBe('assets')
    // A lone surrogate is not a reason to throw.
    expect(() => placeKey({ tab: 'assets', path: ['\ud800x'], id: '\udc00' })).not.toThrow()
  })

  it('24b. parsePlaceKey rejects garbage, a bad tab, too many or too long segments', () => {
    expect(parsePlaceKey('')).toBeNull()
    expect(parsePlaceKey('   ')).toBeNull()
    expect(parsePlaceKey('nowhere/x')).toBeNull()
    expect(parsePlaceKey('Activities/x')).toBeNull()
    expect(parsePlaceKey('/activities')).toBeNull()
    expect(parsePlaceKey('activities//x')).toBeNull()
    expect(parsePlaceKey('activities/x/')).toBeNull()
    expect(parsePlaceKey('activities#')).toBeNull()
    expect(parsePlaceKey('activities/x#a#b')).toBeNull()
    expect(parsePlaceKey('activities/%E0%A4%A')).toBeNull()
    expect(parsePlaceKey(undefined as unknown as string)).toBeNull()
    expect(parsePlaceKey(7 as unknown as string)).toBeNull()
    expect(parsePlaceKey('x'.repeat(5000))).toBeNull()
    const seg = (n: number): string[] => Array.from({ length: n }, (_, i) => `s${i}`)
    expect(parsePlaceKey(['activities', ...seg(12)].join('/'))?.path).toHaveLength(12)
    expect(parsePlaceKey(['activities', ...seg(13)].join('/'))).toBeNull()
    expect(parsePlaceKey(`activities/${'a'.repeat(80)}`)?.path[0]).toHaveLength(80)
    expect(parsePlaceKey(`activities/${'a'.repeat(200)}`)).toBeNull()
    expect(parsePlaceKey(`activities/x#${'a'.repeat(200)}`)).toBeNull()
    expect(parsePlaceKey('activities')).toEqual({ tab: 'activities', path: [] })
    for (const tab of ['occupation', 'assets', 'relationships', 'activities']) expect(parsePlaceKey(tab)?.tab).toBe(tab)
  })

  it('24c. recentFromSpot keeps the person segment first on Relationships', () => {
    expect(recentFromSpot('relationships', { path: ['person.p3', 'money'] })).toEqual({ tab: 'relationships', path: ['person.p3', 'money'] })
    expect(recentFromSpot('relationships', { personId: 'p3', path: ['money'] })).toEqual({ tab: 'relationships', path: ['person.p3', 'money'] })
    expect(recentFromSpot('relationships', { personId: 'p3', path: ['person.p3', 'money'] })).toEqual({ tab: 'relationships', path: ['person.p3', 'money'] })
    expect(recentFromSpot('relationships', { personId: 'p3', path: [] })).toEqual({ tab: 'relationships', path: ['person.p3'] })
    expect(recentFromSpot('relationships', { path: [] })).toEqual({ tab: 'relationships', path: [] })
    expect(recentFromSpot('activities', { path: ['computer'] })).toEqual({ tab: 'activities', path: ['computer'] })
    // A person id means nothing outside Relationships.
    expect(recentFromSpot('assets', { personId: 'p3', path: ['home'] })).toEqual({ tab: 'assets', path: ['home'] })
    // Junk in the path is dropped, not trusted.
    expect(recentFromSpot('assets', { path: ['home', '', 7 as unknown as string, 'x'] })).toEqual({ tab: 'assets', path: ['home', 'x'] })
    expect(recentFromSpot('assets', { path: Array.from({ length: 30 }, (_, i) => `s${i}`) }).path).toHaveLength(12)
  })

  it('24d. samePlace compares tab, path and id; placeOfEntry splits an action from its groups', () => {
    const a: PlaceRef = { tab: 'assets', path: ['home'], id: 'sell' }
    expect(samePlace(a, { tab: 'assets', path: ['home'], id: 'sell' })).toBe(true)
    expect(samePlace(a, { tab: 'assets', path: ['home'] })).toBe(false)
    expect(samePlace(a, { tab: 'assets', path: ['home', 'x'], id: 'sell' })).toBe(false)
    expect(samePlace(a, { tab: 'activities', path: ['home'], id: 'sell' })).toBe(false)
    expect(samePlace({ tab: 'assets', path: [] }, { tab: 'assets', path: [] })).toBe(true)

    const action = entry('Sell', { tab: 'assets', id: 'sell', idPath: ['home', 'sell'] })
    const group = entry('Home', { tab: 'assets', type: 'menu', id: 'home', idPath: ['home'] })
    const person = entry('Lend', { tab: 'relationships', id: 'lend', idPath: ['person.p3', 'money', 'lend'] })
    expect(placeOfEntry(action)).toEqual({ tab: 'assets', path: ['home'], id: 'sell' })
    expect(placeOfEntry(group)).toEqual({ tab: 'assets', path: ['home'] })
    expect(placeOfEntry(person)).toEqual({ tab: 'relationships', path: ['person.p3', 'money'], id: 'lend' })
    expect(parsePlaceKey(placeKey(placeOfEntry(person)))).toEqual(placeOfEntry(person))
  })
})
