// R1-N4: the search index (src/ui/nav/searchIndex.ts). A pure, time-sliced, bounded walk of the four menu roots into
// plain data: a node's id path, label, keywords and breadcrumbs, never a closure. Nothing here may write the game, draw
// from g.rng or Math.random, or read a field that can run a heavy builder (hint, subtitle, header, confirm).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetFlags, setFlags } from '../src/game/flags'
import { createPerson } from '../src/game/people'
import type { Asset, GameState, MenuAction, MenuGroup, MenuNode, Prison } from '../src/game/types'
import {
  INDEX_LIMITS,
  buildIndex,
  cachedIndex,
  clearIndexCache,
  createResolver,
  defaultRoots,
  entityOf,
  finishIndex,
  indexKey,
  startIndexJob,
  stepIndexJob,
  storeIndex,
  type IndexEntry,
  type IndexRoots,
  type SearchIndex,
} from '../src/ui/nav/searchIndex'
import { normalize } from '../src/ui/nav/searchRank'
import { buildIndexCached, frozen, navState, walkTreeCached, type NavStateName, type NavTab } from './nav-kit'

const NAMES: NavStateName[] = ['kid', 'adult', 'ceo', 'elder']
const TABS: NavTab[] = ['occupation', 'assets', 'relationships', 'activities']

/** The CEO tree (about 12,000 nodes) takes seconds to walk; the default timeouts are too tight on a loaded box. */
const HEAVY = 120_000

beforeEach(() => {
  resetFlags()
  clearIndexCache()
})

afterEach(() => {
  resetFlags()
  clearIndexCache()
  vi.restoreAllMocks()
})

function act(id: string, over: Partial<MenuAction> = {}): MenuAction {
  return { type: 'action', id, label: id, emoji: 'x', run: () => {}, ...over }
}

function grp(id: string, children: MenuNode[] | (() => MenuNode[]), over: Partial<MenuGroup> = {}): MenuGroup {
  return { type: 'menu', id, label: id, emoji: 'x', children: typeof children === 'function' ? children : () => children, ...over }
}

function head(id: string): MenuNode {
  return { type: 'heading', id, label: id }
}

function info(id: string): MenuNode {
  return { type: 'info', id, text: id }
}

/** Roots for a synthetic index: `group` on `tab`, an empty list on the other three tabs. */
function only(tab: NavTab, group: MenuGroup): IndexRoots {
  const roots: Record<string, MenuGroup> = {}
  for (const t of TABS) roots[t] = t === tab ? group : grp(t, [])
  return roots as IndexRoots
}

function ids(index: SearchIndex): string[] {
  return index.entries.map((e) => e.id)
}

function entryOf(index: SearchIndex, id: string): IndexEntry {
  const found = index.entries.find((e) => e.id === id)
  if (!found) throw new Error(`the index has no entry ${id}`)
  return found
}

/** Silence the menuModel wrappers' console.error while a hostile builder is on purpose in the tree. */
function quiet() {
  return vi.spyOn(console, 'error').mockImplementation(() => {})
}

// ---------------------------------------------------------------------------

describe('buildIndex on the canned states', () => {
  for (const name of NAMES) {
    it(
      `1. ${name}: a sample of 200 entries resolves to the live node`,
      () => {
        const index = buildIndexCached(name)
        expect(index.entries.length).toBeGreaterThan(20)
        expect(index.complete).toBe(true)
        expect(index.failures).toBe(0)
        const resolve = createResolver(frozen(name))
        const stride = Math.max(1, Math.floor(index.entries.length / 200))
        let checked = 0
        for (let i = 0; i < index.entries.length && checked < 200; i += stride) {
          const e = index.entries[i]
          const node = resolve(e)
          expect(node, `${e.tab}/${e.idPath.join('/')}`).not.toBeNull()
          expect(node?.id).toBe(e.id)
          expect(node?.type).toBe(e.type)
          checked++
        }
        expect(checked).toBeGreaterThanOrEqual(Math.min(200, index.entries.length))
      },
      HEAVY,
    )
  }

  it('1b. the resolver drops an entry whose node vanished, hid or sits behind a lock', () => {
    let shown = true
    let lock: string | null = null
    const root = grp('root', [
      act('plain'),
      act('flaky', { visible: () => shown }),
      grp('door', [act('inside')], { disabledReason: () => lock }),
    ])
    const roots = only('activities', root)
    const g = frozen('kid')
    const index = buildIndex(g, roots)
    expect(ids(index)).toEqual(['plain', 'flaky', 'door', 'inside'])
    const resolve = createResolver(g, roots)
    expect(index.entries.map((e) => resolve(e)?.id ?? null)).toEqual(['plain', 'flaky', 'door', 'inside'])
    shown = false
    lock = 'Locked now.'
    const later = createResolver(g, roots)
    expect(index.entries.map((e) => later(e)?.id ?? null)).toEqual(['plain', null, 'door', null])
    expect(later({ ...entryOf(index, 'plain'), idPath: ['missing', 'plain'] })).toBeNull()
  })

  it('1c. the resolver asks a group for its children once per path, however many entries sit in it', () => {
    let calls = 0
    const root = grp('root', [grp('many', () => {
      calls++
      return Array.from({ length: 30 }, (_, i) => act(`a${i}`))
    })])
    const roots = only('assets', root)
    const g = frozen('kid')
    const index = buildIndex(g, roots)
    calls = 0
    const resolve = createResolver(g, roots)
    for (const e of index.entries) expect(resolve(e)).not.toBeNull()
    expect(calls).toBe(1)
  })

  it('1d. the kit memo gives one object per name and flag state', () => {
    const a = buildIndexCached('kid')
    expect(buildIndexCached('kid')).toBe(a)
    setFlags({ navRegroup: true })
    expect(buildIndexCached('kid')).not.toBe(a)
    resetFlags()
    expect(buildIndexCached('kid')).toBe(a)
  })

  it('2. writes nothing: same state JSON, same rng, no Math.random, no complaint from a frozen state', () => {
    const g = navState('adult')
    const before = JSON.stringify(g)
    const rngBefore = g.rng
    const random = vi.spyOn(Math, 'random')
    const complaints = quiet()
    const index = buildIndex(g)
    expect(index.entries.length).toBeGreaterThan(50)
    expect(JSON.stringify(g)).toBe(before)
    expect(g.rng).toBe(rngBefore)
    expect(random).not.toHaveBeenCalled()
    // A builder that wrote to the state would throw on the frozen copy and be caught (and reported) by menuModel.
    buildIndex(frozen('adult'))
    expect(complaints).not.toHaveBeenCalled()
  })

  it('2b. the state-reading helpers are pure on a frozen state', () => {
    const g = frozen('ceo')
    expect(() => indexKey(g)).not.toThrow()
    const roots = defaultRoots()
    expect(Object.keys(roots).sort()).toEqual([...TABS].sort())
    for (const t of TABS) expect(roots[t].id).toBe(t)
  })
})

describe('what the walk reads', () => {
  it('3. never reads hint, subtitle, header, confirm, input callbacks or run', () => {
    const trap = <T extends object>(node: T, names: string[]): T => {
      for (const name of names) Object.defineProperty(node, name, { get: () => { throw new Error(`the index read ${name}`) }, enumerable: false })
      return node
    }
    const traps = ['hint', 'subtitle', 'confirm']
    const asked = act('ask', {
      input: trap({ kind: 'text' as const, label: 'How much?' }, ['defaultValue', 'preview']),
    })
    const root = trap(
      grp(
        'root',
        [
          trap(act('plain'), ['run', ...traps]),
          trap(asked, ['run', ...traps]),
          trap(grp('sub', [trap(act('deep'), ['run', ...traps])]), ['hint', 'subtitle', 'header']),
        ],
      ),
      ['hint', 'subtitle', 'header'],
    )
    const spy = quiet()
    const index = buildIndex(frozen('kid'), only('activities', root))
    expect(spy).not.toHaveBeenCalled()
    expect(index.failures).toBe(0)
    expect(ids(index)).toEqual(['plain', 'ask', 'sub', 'deep'])
    expect(entryOf(index, 'ask').input).toBe(true)
    expect(entryOf(index, 'plain').input).toBe(false)
  })

  it('3b. searchIndex.ts has no .hint, .subtitle, .header(, .confirm( or .run( outside comments', () => {
    const src = readFileSync(fileURLToPath(new URL('../src/ui/nav/searchIndex.ts', import.meta.url)), 'utf8')
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/.*$/gm, '')
    for (const banned of [/\.hint\b/, /\.subtitle\b/, /\.header\(/, /\.confirm\(/, /\.run\(/, /\.defaultValue\b/, /\.preview\b/, /\.rng\b/, /Math\.random/]) {
      expect(code, String(banned)).not.toMatch(banned)
    }
  })

  it('4. stepping with a budget of 0 and a fake clock gives the same entries as buildIndex', () => {
    const g = frozen('adult')
    let t = 0
    const now = (): number => (t += 1)
    const job = startIndexJob(g)
    expect(job.done).toBe(false)
    let steps = 0
    while (!stepIndexJob(job, 0, now)) steps++
    expect(steps).toBeGreaterThan(10)
    expect(job.done).toBe(true)
    const sliced = finishIndex(job)
    const whole = buildIndexCached('adult')
    expect(sliced.complete).toBe(true)
    expect(sliced.entries).toEqual(whole.entries)
    expect(sliced.key).toBe(whole.key)
    expect(sliced.nodes).toBe(whole.nodes)
  })

  it('4b. a step always handles at least one group, and stops once the budget is spent', () => {
    let calls = 0
    const counted = (id: string, kids: MenuNode[]): MenuGroup => grp(id, () => { calls++; return kids })
    const kid = (id: string): MenuGroup => counted(id, [act(`${id}.a`)])
    const roots: Record<string, MenuGroup> = {}
    for (const t of TABS) roots[t] = counted(t, t === 'activities' ? [kid('g1'), kid('g2'), kid('g3'), kid('g4')] : [])
    const g = frozen('kid')
    // Four roots and four groups: eight frames. Budget 0 handles exactly one frame per call.
    const slow = startIndexJob(g, roots as IndexRoots)
    let steps = 0
    while (!stepIndexJob(slow, 0)) {
      steps++
      expect(calls).toBe(steps)
    }
    expect(steps).toBe(7)
    expect(calls).toBe(8)
    // A fake clock that jumps 10 ms per read and a 25 ms budget: a few frames per call, never all of them in one go.
    let t = 0
    const jumpy = (): number => (t += 10)
    calls = 0
    const job = startIndexJob(g, roots as IndexRoots)
    expect(stepIndexJob(job, 25, jumpy)).toBe(false)
    expect(calls).toBeGreaterThanOrEqual(1)
    expect(calls).toBeLessThan(8)
    while (!stepIndexJob(job, 25, jumpy)) {
      /* keep stepping */
    }
    expect(calls).toBe(8)
    // A generous budget finishes in one call.
    const quick = startIndexJob(g, roots as IndexRoots)
    expect(stepIndexJob(quick, 1e9)).toBe(true)
    expect(finishIndex(quick).entries.length).toBe(8)
  })

  it('4c. finishIndex on an unfinished job reports complete: false', () => {
    const root = grp('root', [grp('g1', [act('a')]), grp('g2', [act('b')])])
    const job = startIndexJob(frozen('kid'), only('activities', root))
    stepIndexJob(job, 0)
    const partial = finishIndex(job)
    expect(partial.complete).toBe(false)
    expect(partial.entries.length).toBeLessThan(4)
  })
})

describe('indexKey', () => {
  const mutations: [string, (g: GameState) => void][] = [
    ['age', (g) => { g.character.age += 1 }],
    ['year', (g) => { g.year += 1 }],
    ['life', (g) => { g.lifeId = `${g.lifeId}-other` }],
    ['assets', (g) => { g.assets.push({ ...structuredClone(g.assets[0]), id: 'extra-asset' } as Asset) }],
    ['people', (g) => { createPerson(g, { relation: 'friend', age: 30 }) }],
    ['job', (g) => { if (g.character.job) g.character.job.defId = 'other-job' }],
    ['job level', (g) => { if (g.character.job) g.character.job.level += 1 }],
    ['office', (g) => { if (g.character.job) g.character.job.data.office = 'mayor' }],
    ['prison', (g) => { g.character.prison = { name: 'x', security: 'minimum', crime: 'x', sentenceYears: 1, yearsServed: 0, respect: 50, appealed: false, escapeAttempts: 0 } satisfies Prison }],
    ['retired', (g) => { g.character.retired = true }],
    ['death', (g) => { g.character.alive = false }],
    ['a money bucket', (g) => { g.character.money = 4_000_000 }],
    ['debt side of money', (g) => { g.character.money = -250_000 }],
  ]

  it('5. changes with age, year, life, assets, people, job, office, prison, retirement, death and a money bucket', () => {
    const base = indexKey(navState('adult'))
    const seen = new Set<string>([base])
    for (const [what, mutate] of mutations) {
      const g = navState('adult')
      mutate(g)
      const key = indexKey(g)
      expect(key, what).not.toBe(base)
      seen.add(key)
    }
    expect(seen.size).toBe(mutations.length + 1)
  })

  it('5b. does not change with happiness, a log line or small money moves', () => {
    const base = indexKey(navState('adult'))
    const g = navState('adult')
    g.character.stats.happiness = Math.max(0, g.character.stats.happiness - 17)
    g.log.push({ age: g.character.age, year: g.year, entries: [] })
    g.character.money += 100
    expect(indexKey(g)).toBe(base)
  })

  it('5c. survives a state with no job and a hostile office', () => {
    const g = navState('kid')
    expect(g.character.job).toBeNull()
    expect(() => indexKey(g)).not.toThrow()
    const odd = navState('adult')
    if (odd.character.job) odd.character.job.data.office = 7
    expect(indexKey(odd)).toBe(indexKey(navState('adult')))
    odd.character.money = Number.NaN
    expect(() => indexKey(odd)).not.toThrow()
  })
})

describe('dedupe and entities', () => {
  it(
    '6. a company reachable by several routes is one entry, on its shortest path; no key repeats',
    () => {
      const g = frozen('ceo')
      const index = buildIndexCached('ceo')
      const companies = g.assets.filter((a) => a.kind === 'business')
      expect(companies.length).toBeGreaterThanOrEqual(2)
      const walked = walkTreeCached('ceo')
      for (const c of companies) {
        const own = index.entries.filter((e) => e.entity?.kind === 'company' && e.entity.id === c.id && (e.id === `biz.company.${c.id}` || e.id === `asset-${c.id}`))
        expect(own, c.name).toHaveLength(1)
        expect(own[0].entity).toEqual({ kind: 'company', id: c.id, name: c.name })
        const routes = walked.filter((w) => w.type === 'menu' && (w.ids[w.ids.length - 1] === `biz.company.${c.id}` || w.ids[w.ids.length - 1] === `asset-${c.id}`))
        expect(routes.length, `routes to ${c.name}`).toBeGreaterThanOrEqual(3)
        const shortest = Math.min(...routes.map((w) => w.ids.filter((id) => !id.startsWith('hub.')).length))
        expect(own[0].idPath.length).toBe(shortest)
      }
      for (const name of NAMES) {
        const keys = buildIndexCached(name).entries.map((e) => e.key)
        expect(new Set(keys).size, `${name} keys`).toBe(keys.length)
      }
    },
    HEAVY,
  )

  it('6b. the same row under two parents is one entry, the shorter route', () => {
    const root = grp('root', [grp('a', [grp('b', [act('twin', { label: 'Twin' })])]), act('twin', { label: 'Twin' }), act('twin', { label: 'Other twin' })])
    const index = buildIndex(frozen('kid'), only('activities', root))
    const twins = index.entries.filter((e) => e.id === 'twin')
    expect(twins.map((e) => [e.label, e.idPath])).toEqual([['Twin', ['twin']], ['Other twin', ['twin']]])
  })

  it('7. a tree of 30,000 nodes stops at the caps: 6000 entries, 20000 nodes, depth 7', () => {
    const endless = (id: string): MenuGroup =>
      grp(id, () => [
        ...Array.from({ length: 5 }, (_, i) => endless(`${id}.g${i}`)),
        ...Array.from({ length: 20 }, (_, i) => act(`${id}.a${i}`)),
      ])
    const index = buildIndex(frozen('kid'), only('activities', endless('r')))
    expect(index.entries.length).toBe(INDEX_LIMITS.entries)
    expect(index.nodes).toBeLessThanOrEqual(INDEX_LIMITS.nodes)
    expect(index.truncated).toBe(true)
    expect(Math.max(...index.entries.map((e) => e.depth))).toBeLessThanOrEqual(INDEX_LIMITS.depth)
    for (const e of index.entries) expect(e.idPath.length).toBe(e.depth)
  })

  it('7b. the depth cap alone: nothing deeper than 7, and the cut is reported', () => {
    const chain = (n: number): MenuGroup => grp(`d${n}`, () => [act(`leaf${n}`), chain(n + 1)])
    const index = buildIndex(frozen('kid'), only('assets', chain(1)))
    const depths = index.entries.map((e) => e.depth)
    expect(Math.max(...depths)).toBe(7)
    expect(index.truncated).toBe(true)
    expect(index.complete).toBe(true)
  })

  it('7c. the node cap binds when a tree is mostly rows nobody sees', () => {
    const fat = (id: string, d: number): MenuGroup =>
      grp(id, () => [
        ...Array.from({ length: 150 }, (_, i) => info(`${id}.i${i}`)),
        ...(d < 7 ? [fat(`${id}.x`, d + 1), fat(`${id}.y`, d + 1), fat(`${id}.z`, d + 1)] : []),
      ])
    const index = buildIndex(frozen('kid'), only('occupation', fat('r', 1)))
    expect(index.nodes).toBeLessThanOrEqual(INDEX_LIMITS.nodes)
    expect(index.nodes).toBeGreaterThan(INDEX_LIMITS.nodes - 200)
    expect(index.truncated).toBe(true)
    expect(index.entries.length).toBeLessThan(INDEX_LIMITS.entries)
  })

  it('7d. a group with 500 children gives 120 entries; an entity group gives 40', () => {
    const big = grp('big', Array.from({ length: 500 }, (_, i) => act(`a${i}`)))
    const index = buildIndex(frozen('kid'), only('activities', grp('root', [big])))
    expect(index.entries.filter((e) => e.idPath[0] === 'big' && e.idPath.length === 2)).toHaveLength(INDEX_LIMITS.perGroup)
    expect(index.truncated).toBe(true)

    const person = grp('person.p1', Array.from({ length: 100 }, (_, i) => act(`do${i}`)), { label: 'Alex Stone' })
    const people = buildIndex(frozen('kid'), only('relationships', grp('relationships', [person])))
    const kids = people.entries.filter((e) => !e.id.startsWith('person.'))
    expect(kids).toHaveLength(INDEX_LIMITS.perEntity)
    expect(people.truncated).toBe(true)
  })

  it('8. hostile builders are skipped and counted, and their siblings are still indexed', () => {
    const spy = quiet()
    const bad = (extra: unknown): MenuNode => extra as MenuNode
    const root = grp('root', [
      grp('throws', () => { throw new Error('boom') }),
      grp('nothing', () => bad(null) as unknown as MenuNode[]),
      grp('object', () => bad({ length: 3 }) as unknown as MenuNode[]),
      grp('badRows', [act('ok1'), bad({ type: 'action', label: 'No id', emoji: 'x', run: () => {} }), bad({ ...act('seven'), id: 7 }), bad(null), bad('text'), act('ok2')]),
      grp('fine', [act('good')]),
    ])
    const index = buildIndex(frozen('kid'), only('activities', root))
    expect(spy).toHaveBeenCalled()
    expect(index.failures).toBe(7)
    expect(ids(index)).toEqual(['throws', 'nothing', 'object', 'badRows', 'fine', 'ok1', 'ok2', 'good'])
    expect(index.complete).toBe(true)
  })

  it('8b. a root whose children throw leaves the other tabs indexed', () => {
    const spy = quiet()
    const roots = only('activities', grp('root', () => { throw new Error('root boom') }))
    roots.assets = grp('assets', [act('buy')])
    const index = buildIndex(frozen('kid'), roots)
    expect(spy).toHaveBeenCalled()
    expect(index.failures).toBe(1)
    expect(ids(index)).toEqual(['buy'])
  })

  it('9. a locked group is indexed with its reason and not entered; hidden rows, headings and infos never appear', () => {
    const root = grp('root', [
      head('h1'),
      info('i1'),
      act('hidden', { visible: () => false }),
      grp('hiddenGroup', [act('inHidden')], { visible: () => false }),
      grp('locked', [act('inside')], { disabledReason: () => 'Not yet.' }),
      act('lockedAction', { disabledReason: () => 'You are too young to do that.' }),
      grp('open', [act('inside2'), head('h2'), info('i2')]),
    ])
    const index = buildIndex(frozen('kid'), only('activities', root))
    expect(ids(index).sort()).toEqual(['inside2', 'locked', 'lockedAction', 'open'])
    expect(entryOf(index, 'locked').locked).toBe('Not yet.')
    expect(entryOf(index, 'lockedAction').locked).toBe('You are too young to do that.')
    expect(entryOf(index, 'open').locked).toBeNull()
    expect(entryOf(index, 'locked').type).toBe('menu')
    expect(entryOf(index, 'lockedAction').type).toBe('action')
  })

  it('9b. an entry is plain data: id path, normalised text, crumbs, depth', () => {
    const root = grp('root', [grp('mind', [act('gym', { label: 'Join a Gym', emoji: 'G' })], { label: 'Mind & Body', emoji: 'M', keywords: ['Yoga'] })], { label: 'Activities' })
    const index = buildIndex(frozen('kid'), only('activities', root))
    const gym = entryOf(index, 'gym')
    expect(gym).toMatchObject({
      tab: 'activities',
      idPath: ['mind', 'gym'],
      type: 'action',
      label: 'Join a Gym',
      emoji: 'G',
      crumbs: ['Activities', 'Mind & Body'],
      labelN: 'join a gym',
      crumbN: 'activities mind and body',
      depth: 2,
      locked: null,
      input: false,
    })
    expect(entryOf(index, 'mind').kwN).toContain('yoga')
    expect(() => structuredClone(index)).not.toThrow()
    expect(JSON.parse(JSON.stringify(index))).toEqual(index)
  })

  it('10. people, companies, assets and stock offers are entities, and their children inherit them', () => {
    const g = navState('adult')
    const index = buildIndex(g)
    const friend = g.people.find((p) => p.relation === 'friend' && p.alive)
    expect(friend).toBeDefined()
    if (!friend) return
    const name = entryOf(index, `person.${friend.id}`).label
    expect(entryOf(index, `person.${friend.id}`).entity).toEqual({ kind: 'person', id: friend.id, name })
    const child = index.entries.find((e) => e.idPath[0] === `person.${friend.id}` && e.idPath.length === 2)
    expect(child?.entity).toEqual({ kind: 'person', id: friend.id, name })
    expect(child?.labelN).toContain(normalize(name))
    expect(child?.crumbs.at(-1)).toBe(name)
    expect(child?.crumbs[0]).toBe('Relationships')

    const house = g.assets.find((a) => a.kind === 'house')
    expect(house).toBeDefined()
    if (house) expect(entryOf(index, `asset-${house.id}`).entity).toEqual({ kind: 'asset', id: house.id, name: house.name })

    const offers = index.entries.filter((e) => e.entity?.kind === 'stock')
    expect(offers.length).toBeGreaterThan(0)
    const offer = offers.find((e) => e.id.startsWith('inv-offer-'))
    expect(offer?.entity?.id).toBe(offer?.id.slice('inv-offer-'.length))
  })

  it('10b. entityOf: prefixes, first match wins, anything else is no entity', () => {
    const g = navState('ceo')
    const company = g.assets.find((a) => a.kind === 'business')
    const house = g.assets.find((a) => a.kind === 'house')
    expect(company && house).toBeTruthy()
    if (!company || !house) return
    const menu = (id: string, label = 'Name'): MenuGroup => grp(id, [], { label })
    expect(entityOf(g, menu('person.p9', 'Sam Lee'))).toEqual({ kind: 'person', id: 'p9', name: 'Sam Lee' })
    expect(entityOf(g, menu('person.'))).toBeNull()
    expect(entityOf(g, menu('biz.company.zzz', 'Acme'))).toEqual({ kind: 'company', id: 'zzz', name: 'Acme' })
    expect(entityOf(g, menu(`asset-${company.id}`, company.name))).toEqual({ kind: 'company', id: company.id, name: company.name })
    expect(entityOf(g, menu(`asset-${house.id}`, house.name))).toEqual({ kind: 'asset', id: house.id, name: house.name })
    expect(entityOf(g, menu('asset-not-owned'))).toBeNull()
    expect(entityOf(g, menu('inv-offer-sec1', 'Acme (ACM)'))).toEqual({ kind: 'stock', id: 'sec1', name: 'Acme (ACM)' })
    expect(entityOf(g, menu('inv-stocks'))).toBeNull()
    expect(entityOf(g, act('person.p9'))).toBeNull()
    expect(entityOf(g, head('person.p9'))).toBeNull()
  })

  it('10c. children inherit the entity: "alex propose" can match, and a child that is an entity itself keeps its own', () => {
    const root = grp('relationships', [
      grp('person.p1', [act('propose'), grp('money', [act('lend')]), grp('inv-offer-s1', [act('buy')], { label: 'Acme (ACM)' })], { label: 'Alex Stone' }),
      grp('person.p2', [act('propose')], { label: 'Blake Reed' }),
    ])
    const index = buildIndex(frozen('kid'), only('relationships', root))
    const proposeAlex = index.entries.find((e) => e.id === 'propose' && e.idPath[0] === 'person.p1')
    const proposeBlake = index.entries.find((e) => e.id === 'propose' && e.idPath[0] === 'person.p2')
    expect(proposeAlex?.entity?.id).toBe('p1')
    expect(proposeBlake?.entity?.id).toBe('p2')
    expect(proposeAlex?.label).toBe('propose')
    expect(proposeAlex?.labelN).toBe('propose alex stone')
    expect(proposeBlake?.labelN).toBe('propose blake reed')
    expect(index.entries.find((e) => e.id === 'lend')?.entity?.id).toBe('p1')
    const nested = index.entries.find((e) => e.id === 'inv-offer-s1')
    expect(nested?.entity).toEqual({ kind: 'stock', id: 's1', name: 'Acme (ACM)' })
    expect(index.entries.find((e) => e.id === 'buy')?.entity?.kind).toBe('stock')
    expect(new Set(index.entries.map((e) => e.key)).size).toBe(index.entries.length)
  })
})

describe('the cache', () => {
  it('11. storeIndex then cachedIndex returns it; a key change or clearIndexCache empties it', () => {
    const g = navState('kid')
    expect(cachedIndex(g)).toBeNull()
    const index = buildIndex(g)
    expect(index.key).toBe(indexKey(g))
    storeIndex(index)
    expect(cachedIndex(g)).toBe(index)
    const older = navState('kid')
    older.character.age += 1
    expect(cachedIndex(older)).toBeNull()
    expect(cachedIndex(g)).toBe(index)
    clearIndexCache()
    expect(cachedIndex(g)).toBeNull()
  })
})

describe('coverage', () => {
  it(
    '12. the index holds at least 95% of the actions the walker reaches on the adult, depth up to 7',
    () => {
      const index = buildIndexCached('adult')
      const have = new Set(index.entries.map((e) => `${e.type}|${e.id}|${e.label}`))
      const ENTITY = /^(person\.|biz\.company\.|asset-|inv-offer-)/
      const walked = walkTreeCached('adult', { maxDepth: 7 })
      let wanted = 0
      let found = 0
      for (const w of walked) {
        if (w.type !== 'action') continue
        // The caps drop rows by design: skip rows of a list that is over a cap (40 inside an entity, 120 anywhere).
        const inEntity = w.ids.slice(0, -1).some((id) => ENTITY.test(id))
        if (w.rows > INDEX_LIMITS.perGroup || (inEntity && w.rows > INDEX_LIMITS.perEntity)) continue
        wanted++
        if (have.has(`action|${w.node.id}|${w.node.label}`)) found++
      }
      expect(wanted).toBeGreaterThan(300)
      expect(found / wanted).toBeGreaterThanOrEqual(0.95)
      // The shortest route of every entry is one the walker also knows, with the tab in front.
      const routes = new Set(walked.map((w) => [w.tab, ...w.ids.filter((id) => !id.startsWith('hub.'))].join('/')))
      let known = 0
      for (const e of index.entries) if (routes.has([e.tab, ...e.idPath].join('/'))) known++
      expect(known / index.entries.length).toBeGreaterThanOrEqual(0.95)
    },
    HEAVY,
  )
})
