// ci: fast
// R2-K1 (K.3 a): the module registry and the fact type. The registry holds the sorted yearly lists, the menu slots and the bus
// handlers of the registered modules, and nothing else: it draws no random number, reads no clock and keeps no game state, so a
// test gives it a fresh copy (vi.resetModules, then a dynamic import) and registers what the case needs.
//
// What this file pins: the sort is a pure function of the registered set (registration order never matters), a bad definition
// throws before it changes anything, the lists are frozen and cached until the next registration, withYearly swaps and restores,
// the menu slots merge in (phase, order, id) order, handlers come exact kind first and then '*', and normalizeFact bounds a fact.
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import type { Asset, GameState, MenuNode } from '../src/game/types'
import type { HandlerEntry, MenuEntry, ModuleDef, YearlyEntry } from '../src/game/kernel/registry'
import { FACT_LIMITS, normalizeFact } from '../src/game/kernel/fact'
import { isSelfRegistered } from './kernel-kit'

type Reg = typeof import('../src/game/kernel/registry')

/** A registry nobody has registered into yet. */
async function fresh(): Promise<Reg> {
  vi.resetModules()
  return import('../src/game/kernel/registry')
}

const noop = (): void => undefined
const g = {} as GameState

const mod = (id: string, rest: Partial<ModuleDef> = {}): ModuleDef => ({ id, layer: 3, ...rest })
const yearly = (phase: string, order: number, seam: YearlyEntry['seam'] = 'aging', run: YearlyEntry['run'] = noop): YearlyEntry => ({ seam, phase, order, run })
const info = (id: string): MenuNode => ({ type: 'info', id, text: id })
const menu = (path: string, order: number, nodes: string[] = [path], phase?: string): MenuEntry => ({
  path,
  order,
  ...(phase === undefined ? {} : { phase }),
  build: () => nodes.map(info),
})
const handler = (kind: string, slice = 'flags.textMem'): HandlerEntry => ({ kind, slice, run: noop })

/** Six modules across the aging phases, with ties on purpose. */
function six(): ModuleDef[] {
  return [
    mod('life.b', { yearly: [yearly('life', 20)] }),
    mod('life.a', { yearly: [yearly('life', 20)] }),
    mod('money.a', { yearly: [yearly('money', 10)] }),
    mod('careers.a', { yearly: [yearly('careers', 10)] }),
    mod('close.a', { yearly: [yearly('close', 10)] }),
    mod('life.first', { yearly: [yearly('life', 5)] }),
  ]
}

const idsOf = (reg: Reg, seam: YearlyEntry['seam'] = 'aging'): string[] => reg.yearlyEntries(seam).map((e) => e.id)

describe('registry: the sort is a pure function of the registered set', () => {
  it('gives the same yearly ids for the same six modules registered in three orders', async () => {
    const orders = [
      [0, 1, 2, 3, 4, 5],
      [5, 4, 3, 2, 1, 0],
      [3, 0, 5, 1, 4, 2],
    ]
    const seen: string[][] = []
    for (const order of orders) {
      const reg = await fresh()
      const defs = six()
      for (const i of order) reg.registerModule(defs[i]!)
      seen.push(idsOf(reg))
    }
    expect(seen[0]).toEqual(['life.first', 'life.a', 'life.b', 'careers.a', 'money.a', 'close.a'])
    expect(seen[1]).toEqual(seen[0])
    expect(seen[2]).toEqual(seen[0])
  })

  it('sorts a later phase after an earlier one whatever the order numbers say', async () => {
    const reg = await fresh()
    reg.registerModule(mod('late', { yearly: [yearly('money', 5)] }))
    reg.registerModule(mod('early', { yearly: [yearly('life', 900)] }))
    expect(idsOf(reg)).toEqual(['early', 'late'])
  })

  it('sorts equal phase and order by module id, and a module id by code unit', async () => {
    const reg = await fresh()
    reg.registerModule(mod('b.x', { yearly: [yearly('life', 10)] }))
    reg.registerModule(mod('a.x', { yearly: [yearly('life', 10)] }))
    reg.registerModule(mod('a', { yearly: [yearly('life', 10)] }))
    reg.registerModule(mod('a10', { yearly: [yearly('life', 10)] }))
    reg.registerModule(mod('a2', { yearly: [yearly('life', 10)] }))
    expect(idsOf(reg)).toEqual(['a', 'a.x', 'a10', 'a2', 'b.x'])
  })

  it('keeps the two seams apart and sorts the special seam by its own phases', async () => {
    const reg = await fresh()
    reg.registerModule(mod('pub', { yearly: [yearly('public', 10, 'special'), yearly('life', 10, 'aging')] }))
    reg.registerModule(mod('svc', { yearly: [yearly('service', 10, 'special')] }))
    reg.registerModule(mod('car', { yearly: [yearly('careers', 10, 'special')] }))
    expect(idsOf(reg, 'special')).toEqual(['svc', 'car', 'pub'])
    expect(idsOf(reg, 'aging')).toEqual(['pub'])
  })

  it('lists the phases of the pinned yearly order, in order', async () => {
    const reg = await fresh()
    expect(reg.YEARLY_PHASES.aging).toEqual([
      'geopolitics',
      'world',
      'frontier',
      'society',
      'life',
      'careers',
      'government',
      'firms',
      'money',
      'assets',
      'advisors',
      'close',
      'settle',
      'news',
    ])
    expect(reg.YEARLY_PHASES.special).toEqual(['service', 'careers', 'public'])
    expect(reg.MENU_PHASES).toEqual(['head', 'main', 'tail'])
  })
})

describe('registry: a bad definition throws and changes nothing', () => {
  const bad = (reg: Reg, def: unknown): void => reg.registerModule(def as ModuleDef)

  it('throws on a duplicate module id and a duplicate slice', async () => {
    const reg = await fresh()
    reg.registerModule(mod('dup', { slices: ['world.facts'] }))
    expect(() => reg.registerModule(mod('dup'))).toThrow(/already registered/)
    expect(() => reg.registerModule(mod('other', { slices: ['world.facts'] }))).toThrow(/world\.facts.*dup/)
    expect(() => reg.registerModule(mod('twice', { slices: ['x', 'x'] }))).toThrow(/twice/)
    expect(reg.moduleIds()).toEqual(['dup'])
    expect(reg.registeredSlices()).toEqual(['world.facts'])
  })

  it('throws on a bad id', async () => {
    const reg = await fresh()
    for (const id of ['', 'A', '1a', 'a b', 'a..b', 'a.', '.a', 'a-b', 'a#1']) expect(() => reg.registerModule(mod(id)), JSON.stringify(id)).toThrow(/bad id/)
    expect(() => bad(reg, mod(5 as unknown as string))).toThrow(/bad id/)
    expect(() => bad(reg, null)).toThrow(/not an object/)
    expect(() => bad(reg, 'x')).toThrow(/not an object/)
    expect(reg.moduleIds()).toEqual([])
  })

  it('accepts a dotted camel case id', async () => {
    const reg = await fresh()
    reg.registerModule(mod('yearly.techWaves'))
    reg.registerModule(mod('a'))
    expect(reg.moduleIds()).toEqual(['a', 'yearly.techWaves'])
  })

  it('throws on a bad layer', async () => {
    const reg = await fresh()
    for (const layer of [7, -1, 1.5, 5, NaN, '2']) expect(() => bad(reg, { id: 'x', layer }), String(layer)).toThrow(/layer/)
    for (const layer of [0, 1, 2, 3, 4]) reg.registerModule({ id: `ok${layer}`, layer: layer as ModuleDef['layer'] })
    expect(reg.moduleIds()).toHaveLength(5)
  })

  it('throws on a phase the seam does not have, and on an unknown seam', async () => {
    const reg = await fresh()
    expect(() => reg.registerModule(mod('x', { yearly: [yearly('service', 10, 'aging')] }))).toThrow(/phase/)
    expect(() => reg.registerModule(mod('x', { yearly: [yearly('life', 10, 'special')] }))).toThrow(/phase/)
    expect(() => reg.registerModule(mod('x', { yearly: [yearly('nowhere', 10)] }))).toThrow(/phase/)
    expect(() => bad(reg, mod('x', { yearly: [{ seam: 'weekly', phase: 'life', order: 1, run: noop }] as unknown as YearlyEntry[] }))).toThrow(/seam/)
    expect(reg.moduleIds()).toEqual([])
  })

  it('throws on an order that is not an integer from 0 to 9999', async () => {
    const reg = await fresh()
    for (const order of [1.5, -1, 10000, NaN, Infinity, '5']) {
      expect(() => bad(reg, mod('x', { yearly: [{ ...yearly('life', 1), order }] as YearlyEntry[] })), `yearly ${String(order)}`).toThrow(/order/)
      expect(() => bad(reg, mod('x', { menus: [{ ...menu('a.b', 1), order }] as MenuEntry[] })), `menu ${String(order)}`).toThrow(/order/)
    }
    reg.registerModule(mod('lo', { yearly: [yearly('life', 0)] }))
    reg.registerModule(mod('hi', { yearly: [yearly('life', 9999)] }))
    expect(idsOf(reg)).toEqual(['lo', 'hi'])
  })

  it('throws on a handler with an empty or malformed kind, an empty slice, or no function', async () => {
    const reg = await fresh()
    for (const kind of ['', 'Bad', 'a..b', 'a.', '1x', `a${'b'.repeat(FACT_LIMITS.kind)}`]) {
      expect(() => reg.registerModule(mod('x', { handles: [handler(kind)] })), JSON.stringify(kind)).toThrow(/handler kind/)
    }
    expect(() => reg.registerModule(mod('x', { handles: [handler('a.b', '')] }))).toThrow(/slice/)
    expect(() => bad(reg, mod('x', { handles: [{ kind: 'a.b', slice: 'flags.x', run: 5 }] as unknown as HandlerEntry[] }))).toThrow(/run/)
    expect(() => bad(reg, mod('x', { yearly: [{ ...yearly('life', 1), run: 5 }] as unknown as YearlyEntry[] }))).toThrow(/run/)
    expect(() => bad(reg, mod('x', { menus: [{ ...menu('a.b', 1), build: 5 }] as unknown as MenuEntry[] }))).toThrow(/build/)
    reg.registerModule(mod('star', { handles: [handler('*')] }))
    expect(reg.moduleIds()).toEqual(['star'])
  })

  it('throws on a bad menu slot, a bad menu phase and a bad fact kind', async () => {
    const reg = await fresh()
    for (const path of ['', 'Assets', 'assets.', '.assets', 'a..b', 'a b', 'a_b']) {
      expect(() => reg.registerModule(mod('x', { menus: [menu(path, 1)] })), JSON.stringify(path)).toThrow(/slot/)
    }
    expect(() => reg.registerModule(mod('x', { menus: [menu('a.b', 1, ['n'], 'middle')] }))).toThrow(/phase/)
    expect(() => reg.registerModule(mod('x', { facts: ['Bad.Kind'] }))).toThrow(/fact kind/)
    expect(() => reg.registerModule(mod('x', { slices: [''] }))).toThrow(/slice/)
    expect(() => reg.registerModule(mod('x', { slices: ['a b'] }))).toThrow(/slice/)
    expect(reg.moduleIds()).toEqual([])
  })

  it('leaves the registry exactly as it was after a throw, even when the first half of the module was fine', async () => {
    const reg = await fresh()
    reg.registerModule(mod('keep', { slices: ['kept'], facts: ['kept.fact'], yearly: [yearly('life', 10)], menus: [menu('a.b', 10)], handles: [handler('kept.fact')] }))
    const yearlyBefore = reg.yearlyEntries('aging')
    const bad2 = mod('half', {
      slices: ['half.slice'],
      facts: ['half.fact'],
      yearly: [yearly('life', 5)],
      handles: [handler('half.fact')],
      menus: [menu('a.b', 5), menu('Not A Slot', 1)],
    })
    expect(() => reg.registerModule(bad2)).toThrow(/slot/)
    expect(reg.moduleIds()).toEqual(['keep'])
    expect(reg.registeredSlices()).toEqual(['kept'])
    expect([...reg.registeredFacts()]).toEqual(['kept.fact'])
    expect(reg.yearlyEntries('aging')).toBe(yearlyBefore)
    expect(reg.menuEntries('a.b').map((e) => e.id)).toEqual(['keep'])
    expect(reg.handlersFor('half.fact')).toEqual([])
    expect(reg.getModule('half')).toBeUndefined()
    // The slice the failed module named is free again.
    reg.registerModule(mod('later', { slices: ['half.slice'] }))
    expect(reg.registeredSlices()).toEqual(['half.slice', 'kept'])
  })

  it('registerModules sorts by id, and a bad module in the batch registers none of it', async () => {
    const reg = await fresh()
    reg.registerModules([mod('c', { yearly: [yearly('life', 10)] }), mod('a', { yearly: [yearly('life', 10)] }), mod('b', { yearly: [yearly('life', 10)] })])
    expect(reg.moduleIds()).toEqual(['a', 'b', 'c'])
    expect(() => reg.registerModules([mod('d'), mod('e', { slices: ['s'] }), mod('f', { slices: ['s'] })])).toThrow(/slice/)
    expect(() => reg.registerModules([mod('g'), mod('c')])).toThrow(/already registered/)
    expect(() => reg.registerModules([mod('h'), mod('h')])).toThrow(/already registered/)
    expect(reg.moduleIds()).toEqual(['a', 'b', 'c'])
  })

  it('keeps a snapshot: changing a definition after it was registered changes nothing', async () => {
    const reg = await fresh()
    const entries = [yearly('life', 10)]
    const def = mod('snap', { yearly: entries, slices: ['s'] })
    reg.registerModule(def)
    entries.push(yearly('money', 1))
    ;(def.slices as string[]).push('t')
    ;(def as { id: string }).id = 'renamed'
    expect(reg.moduleIds()).toEqual(['snap'])
    expect(reg.registeredSlices()).toEqual(['s'])
    expect(idsOf(reg)).toEqual(['snap'])
    const got = reg.getModule('snap')!
    expect(got.id).toBe('snap')
    expect(Object.isFrozen(got)).toBe(true)
    expect(Object.isFrozen(got.yearly)).toBe(true)
    expect(got.layer).toBe(3)
  })
})

describe('registry: entry ids', () => {
  it('gives a module with one yearly entry per seam its own id, and two entries in one seam id#0 and id#1', async () => {
    const reg = await fresh()
    reg.registerModule(mod('one', { yearly: [yearly('life', 10, 'aging'), yearly('service', 10, 'special')] }))
    reg.registerModule(mod('two', { yearly: [yearly('life', 20, 'aging'), yearly('life', 30, 'aging')] }))
    expect(idsOf(reg, 'aging')).toEqual(['one', 'two#0', 'two#1'])
    expect(idsOf(reg, 'special')).toEqual(['one'])
  })

  it('numbers the entries of a module in one seam in the order it declared them, not the order they sort in', async () => {
    const reg = await fresh()
    reg.registerModule(mod('m', { yearly: [yearly('money', 10), yearly('life', 10)] }))
    const got = reg.yearlyEntries('aging')
    expect(got.map((e) => [e.id, e.phase])).toEqual([
      ['m#1', 'life'],
      ['m#0', 'money'],
    ])
  })

  it('does the same for menu entries in one slot', async () => {
    const reg = await fresh()
    reg.registerModule(mod('a', { menus: [menu('assets.money', 10), menu('shopping.stores', 10)] }))
    reg.registerModule(mod('b', { menus: [menu('assets.money', 20), menu('assets.money', 30)] }))
    expect(reg.menuEntries('assets.money').map((e) => e.id)).toEqual(['a', 'b#0', 'b#1'])
    expect(reg.menuEntries('shopping.stores').map((e) => e.id)).toEqual(['a'])
  })
})

describe('registry: the caches', () => {
  it('returns the same frozen array until a registration, and never changes an array it handed out', async () => {
    const reg = await fresh()
    reg.registerModule(mod('a', { yearly: [yearly('life', 10)] }))
    const first = reg.yearlyEntries('aging')
    expect(reg.yearlyEntries('aging')).toBe(first)
    expect(Object.isFrozen(first)).toBe(true)
    expect(Object.isFrozen(first[0])).toBe(true)
    reg.registerModule(mod('b', { yearly: [yearly('life', 5)] }))
    const second = reg.yearlyEntries('aging')
    expect(second).not.toBe(first)
    expect(first.map((e) => e.id)).toEqual(['a'])
    expect(second.map((e) => e.id)).toEqual(['b', 'a'])
    expect(() => (first as unknown as YearlyEntry[]).push(yearly('life', 1))).toThrow(TypeError)
  })

  it('invalidates the menu, handler and name caches on a registration too', async () => {
    const reg = await fresh()
    reg.registerModule(mod('a', { menus: [menu('a.b', 10)], handles: [handler('x.y')], facts: ['x.y'], slices: ['s1'] }))
    const menus = reg.menuEntries('a.b')
    const handlers = reg.handlersFor('x.y')
    expect(reg.menuEntries('a.b')).toBe(menus)
    expect(reg.handlersFor('x.y')).toBe(handlers)
    reg.registerModule(mod('b', { menus: [menu('a.b', 5)], handles: [handler('x.y')], facts: ['z'], slices: ['s0'] }))
    expect(reg.menuEntries('a.b').map((e) => e.id)).toEqual(['b', 'a'])
    expect(reg.handlersFor('x.y').map((h) => h.moduleId)).toEqual(['a', 'b'])
    expect(menus.map((e) => e.id)).toEqual(['a'])
    expect(handlers.map((h) => h.moduleId)).toEqual(['a'])
    expect(reg.moduleIds()).toEqual(['a', 'b'])
    expect(reg.registeredSlices()).toEqual(['s0', 's1'])
    expect([...reg.registeredFacts()]).toEqual(['x.y', 'z'])
  })

  it('does not grow a cache for a slot or a kind nobody registered', async () => {
    const reg = await fresh()
    reg.registerModule(mod('a', { handles: [handler('*')] }))
    expect(reg.menuEntries('never.seen')).toBe(reg.menuEntries('also.never'))
    expect(reg.handlersFor('never.seen.a')).toBe(reg.handlersFor('never.seen.b'))
  })
})

describe('registry: withYearly', () => {
  it('replaces the list for the call, in the given order, and restores it', async () => {
    const reg = await fresh()
    reg.registerModule(mod('a', { yearly: [yearly('life', 10)] }))
    reg.registerModule(mod('b', { yearly: [yearly('money', 10)] }))
    const before = reg.yearlyEntries('aging')
    const seen: string[][] = []
    const out = reg.withYearly('aging', [yearly('news', 1), yearly('life', 1)], () => {
      seen.push(idsOf(reg))
      seen.push(reg.yearlyEntries('aging').map((e) => e.phase))
      return 'value'
    })
    expect(out).toBe('value')
    expect(seen).toEqual([['override#0', 'override#1'], ['news', 'life']])
    expect(reg.yearlyEntries('aging')).toBe(before)
  })

  it('keeps the ids of entries that already have one, so a filtered copy of the list keeps its names', async () => {
    const reg = await fresh()
    reg.registerModule(mod('a', { yearly: [yearly('life', 10)] }))
    reg.registerModule(mod('b', { yearly: [yearly('money', 10)] }))
    const names = reg.withYearly('aging', reg.yearlyEntries('aging').filter((e) => e.id !== 'a'), () => idsOf(reg))
    expect(names).toEqual(['b'])
  })

  it('leaves the other seam alone and runs the replacements', async () => {
    const reg = await fresh()
    reg.registerModule(mod('s', { yearly: [yearly('service', 10, 'special')] }))
    const ran: string[] = []
    reg.withYearly('aging', [yearly('life', 1, 'aging', () => ran.push('x'))], () => {
      expect(idsOf(reg, 'special')).toEqual(['s'])
      for (const e of reg.yearlyEntries('aging')) e.run(g)
    })
    expect(ran).toEqual(['x'])
  })

  it('restores after a throw, and the throw goes on', async () => {
    const reg = await fresh()
    reg.registerModule(mod('a', { yearly: [yearly('life', 10)] }))
    expect(() =>
      reg.withYearly('aging', [], () => {
        throw new Error('boom')
      }),
    ).toThrow('boom')
    expect(idsOf(reg)).toEqual(['a'])
  })

  it('nests: the inner list wins inside, the outer one comes back after it', async () => {
    const reg = await fresh()
    reg.registerModule(mod('a', { yearly: [yearly('life', 10)] }))
    const trace: string[][] = []
    reg.withYearly('aging', [yearly('life', 1)], () => {
      trace.push(idsOf(reg))
      reg.withYearly('aging', [], () => trace.push(idsOf(reg)))
      trace.push(idsOf(reg))
    })
    trace.push(idsOf(reg))
    expect(trace).toEqual([['override#0'], [], ['override#0'], ['a']])
  })

  it('refuses a bad entry before it runs anything, and a registration inside the call still shows after it', async () => {
    const reg = await fresh()
    let ran = false
    expect(() =>
      reg.withYearly('aging', [yearly('service', 1)], () => {
        ran = true
      }),
    ).toThrow(/phase/)
    expect(() => reg.withYearly('aging', [yearly('life', 1, 'special')], () => undefined)).toThrow(/seam/)
    expect(ran).toBe(false)
    reg.withYearly('aging', [], () => reg.registerModule(mod('late', { yearly: [yearly('life', 10)] })))
    expect(idsOf(reg)).toEqual(['late'])
  })

  it('hands out a frozen list inside the call', async () => {
    const reg = await fresh()
    reg.withYearly('aging', [yearly('life', 1)], () => {
      expect(Object.isFrozen(reg.yearlyEntries('aging'))).toBe(true)
      expect(reg.yearlyEntries('aging')).toBe(reg.yearlyEntries('aging'))
    })
  })
})

describe('registry: menus', () => {
  it('passes (g, a, ctx) to every builder and merges the nodes in (phase, order, id) order, main by default', async () => {
    const reg = await fresh()
    const calls: unknown[][] = []
    const spy = (nodes: string[]) => (...args: unknown[]): MenuNode[] => {
      calls.push(args)
      return nodes.map(info)
    }
    reg.registerModule(mod('z.tail', { menus: [{ path: 'assets.money', phase: 'tail', order: 1, build: spy(['tail']) }] }))
    reg.registerModule(mod('y.head', { menus: [{ path: 'assets.money', phase: 'head', order: 900, build: spy(['head1', 'head2']) }] }))
    reg.registerModule(mod('x.main10', { menus: [{ path: 'assets.money', order: 10, build: spy(['m10']) }] }))
    reg.registerModule(mod('w.main5', { menus: [{ path: 'assets.money', phase: 'main', order: 5, build: spy(['m5']) }] }))
    reg.registerModule(mod('v.main10', { menus: [{ path: 'assets.money', order: 10, build: spy(['m10b']) }] }))
    reg.registerModule(mod('u.elsewhere', { menus: [{ path: 'assets.tail', order: 1, build: spy(['elsewhere']) }] }))
    const a = { id: 'asset-1' } as unknown as Asset
    const ctx = { why: 'test' }
    const nodes = reg.collectMenu('assets.money', g, a, ctx)
    expect(nodes.map((n) => n.id)).toEqual(['head1', 'head2', 'm5', 'm10b', 'm10', 'tail'])
    expect(calls).toHaveLength(5)
    for (const c of calls) {
      expect(c[0]).toBe(g)
      expect(c[1]).toBe(a)
      expect(c[2]).toBe(ctx)
    }
    expect(reg.collectMenu('assets.tail', g).map((n) => n.id)).toEqual(['elsewhere'])
  })

  it('returns a new array of nodes on every call, and an empty one for a slot nobody uses', async () => {
    const reg = await fresh()
    reg.registerModule(mod('a', { menus: [menu('a.b', 1, ['n'])] }))
    const one = reg.collectMenu('a.b', g)
    const two = reg.collectMenu('a.b', g)
    expect(one).not.toBe(two)
    expect(one).toEqual(two)
    one.push(info('extra'))
    expect(reg.collectMenu('a.b', g)).toHaveLength(1)
    expect(reg.collectMenu('no.such.slot', g)).toEqual([])
  })

  it('throws on a bad slot name, in menuEntries and in collectMenu', async () => {
    const reg = await fresh()
    for (const path of ['', 'Assets.money', 'assets.', 'a..b', 'a b']) {
      expect(() => reg.menuEntries(path), JSON.stringify(path)).toThrow(/slot/)
      expect(() => reg.collectMenu(path, g), JSON.stringify(path)).toThrow(/slot/)
    }
  })

  it('accepts a slot a module introduces itself, with digits after the first segment', async () => {
    const reg = await fresh()
    reg.registerModule(mod('a', { menus: [menu('business.view.top', 1), menu('x9.y2', 1)] }))
    expect(reg.menuEntries('business.view.top')).toHaveLength(1)
    expect(reg.menuEntries('x9.y2')).toHaveLength(1)
  })
})

describe('registry: handlers', () => {
  it('lists the exact kind first and then the star handlers, each sorted by module id', async () => {
    const reg = await fresh()
    reg.registerModule(mod('b.all', { handles: [handler('*')] }))
    reg.registerModule(mod('b.x', { handles: [handler('company.failed')] }))
    reg.registerModule(mod('a.other', { handles: [handler('company.sold')] }))
    reg.registerModule(mod('a.x', { handles: [handler('company.failed')] }))
    reg.registerModule(mod('a.all', { handles: [handler('*')] }))
    const got = reg.handlersFor('company.failed')
    expect(got.map((h) => h.moduleId)).toEqual(['a.x', 'b.x', 'a.all', 'b.all'])
    expect(got.map((h) => h.entry.kind)).toEqual(['company.failed', 'company.failed', '*', '*'])
    expect(Object.isFrozen(got)).toBe(true)
    expect(reg.handlersFor('company.sold').map((h) => h.moduleId)).toEqual(['a.other', 'a.all', 'b.all'])
  })

  it('gives only the star handlers for a kind nobody handles, and for the kind *, without repeating them', async () => {
    const reg = await fresh()
    reg.registerModule(mod('s', { handles: [handler('*')] }))
    reg.registerModule(mod('e', { handles: [handler('x.y')] }))
    expect(reg.handlersFor('nobody.handles').map((h) => h.moduleId)).toEqual(['s'])
    expect(reg.handlersFor('*').map((h) => h.moduleId)).toEqual(['s'])
    expect(reg.handlersFor('x.y').map((h) => h.moduleId)).toEqual(['e', 's'])
  })

  it('keeps the declared order when one module handles one kind twice', async () => {
    const reg = await fresh()
    const first = { ...handler('x.y', 'flags.a'), run: noop }
    const second = { ...handler('x.y', 'flags.b'), run: noop }
    reg.registerModule(mod('m', { handles: [first, second] }))
    expect(reg.handlersFor('x.y').map((h) => h.entry.slice)).toEqual(['flags.a', 'flags.b'])
  })

  it('is empty when nothing is registered', async () => {
    const reg = await fresh()
    expect(reg.handlersFor('x.y')).toEqual([])
    expect(reg.yearlyEntries('aging')).toEqual([])
    expect(reg.yearlyEntries('special')).toEqual([])
  })
})

describe('registry: the name lists', () => {
  it('sorts registeredFacts, registeredSlices and moduleIds, whatever the registration order', async () => {
    const defs = [
      mod('m.c', { slices: ['c.slice', 'a.slice'], facts: ['zeta.done', 'alpha.done'] }),
      mod('m.a', { slices: ['b.slice'], facts: ['alpha.done', 'mid.done'] }),
      mod('m.b', { slices: [], facts: [] }),
    ]
    const results: string[][] = []
    for (const order of [[0, 1, 2], [2, 1, 0], [1, 2, 0]]) {
      const reg = await fresh()
      for (const i of order) reg.registerModule(defs[i]!)
      results.push([...reg.moduleIds(), '|', ...reg.registeredSlices(), '|', ...reg.registeredFacts()])
    }
    expect(results[0]).toEqual(['m.a', 'm.b', 'm.c', '|', 'a.slice', 'b.slice', 'c.slice', '|', 'alpha.done', 'mid.done', 'zeta.done'])
    expect(results[1]).toEqual(results[0])
    expect(results[2]).toEqual(results[0])
  })

  it('returns a read-only set of facts and finds a module by id', async () => {
    const reg = await fresh()
    reg.registerModule(mod('a', { facts: ['x.y'] }))
    expect(reg.registeredFacts().has('x.y')).toBe(true)
    expect(reg.registeredFacts().has('x.z')).toBe(false)
    expect(reg.getModule('a')?.facts).toEqual(['x.y'])
    expect(reg.getModule('nope')).toBeUndefined()
    expect(reg.getModule('__proto__')).toBeUndefined()
    expect(reg.getModule('constructor')).toBeUndefined()
  })

  it('keeps the reserved lod and budget records on the definition', async () => {
    const reg = await fresh()
    reg.registerModule(mod('a', { lod: { tiers: 3 }, budget: { yearMs: 20, stateNodes: 1000 } }))
    expect(reg.getModule('a')?.lod).toEqual({ tiers: 3 })
    expect(reg.getModule('a')?.budget).toEqual({ yearMs: 20, stateNodes: 1000 })
  })
})

describe('modules/index.ts', () => {
  it('lists its modules sorted by id, one per module, and registers all of them', async () => {
    vi.resetModules()
    const index = await import('../src/game/modules')
    const reg = await import('../src/game/kernel/registry')
    const ids = index.MODULES.map((m) => m.id)
    for (let i = 1; i < ids.length; i++) expect(ids[i - 1]! < ids[i]!, `${ids[i - 1]} before ${ids[i]}`).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)
    // R2-K10: a built-in registers itself when its file loads, so the registry also holds those modules; the rest is exactly MODULES
    expect(reg.moduleIds().filter((id) => !isSelfRegistered(id))).toEqual([...ids].sort())
    expect(reg.moduleIds().some(isSelfRegistered)).toBe(true)
  })
})

describe('the kernel files stay leaves', () => {
  it('imports only ../types, ../rng and files next to it', () => {
    for (const file of ['registry', 'fact', 'ports']) {
      const text = readFileSync(new URL(`../src/game/kernel/${file}.ts`, import.meta.url), 'utf8')
      const specs = [...text.matchAll(/(?:from|import)\s+'([^']+)'/g)].map((m) => m[1]!)
      for (const s of specs) expect(s === '../types' || s === '../rng' || s.startsWith('./'), `${file}.ts imports ${s}`).toBe(true)
    }
  })
})

describe('normalizeFact', () => {
  const keys = (f: unknown): string[] => Object.keys(f as object)

  it('keeps a valid fact, rounds the magnitude to 3 decimals and writes the keys in a fixed order', () => {
    const f = normalizeFact({ s: 40, v: 1234.5678, a: 'person:3', c: 'company:12', y: 2031, k: 'company.failed' })
    expect(f).toEqual({ k: 'company.failed', y: 2031, c: 'company:12', a: 'person:3', v: 1234.568, s: 40 })
    expect(keys(f)).toEqual(['k', 'y', 'c', 'a', 'v', 's'])
  })

  it('keeps only k and y when nothing else is valid', () => {
    expect(keys(normalizeFact({ k: 'a', y: 1900 }))).toEqual(['k', 'y'])
    expect(keys(normalizeFact({ k: 'a', y: 1900, c: '', a: 5, v: NaN, s: 'x', extra: 1 }))).toEqual(['k', 'y'])
  })

  it('returns null for a bad year', () => {
    for (const y of ['2020', 1.5, NaN, Infinity, -Infinity, null, undefined, {}, true]) expect(normalizeFact({ k: 'a.b', y }), String(y)).toBeNull()
    expect(normalizeFact({ k: 'a.b' })).toBeNull()
    expect(normalizeFact({ k: 'a.b', y: -400 })).toEqual({ k: 'a.b', y: -400 })
    expect(normalizeFact({ k: 'a.b', y: 0 })).toEqual({ k: 'a.b', y: 0 })
  })

  it('returns null for a bad kind and accepts the longest one', () => {
    for (const k of ['Company', '1a', 'a..b', 'a.', '.a', '', ' a', 'a b', 'a_b', 'a-b', 5, null, undefined]) expect(normalizeFact({ k, y: 1 }), String(k)).toBeNull()
    expect(normalizeFact({ k: 'a'.repeat(41), y: 1 })).toBeNull()
    expect(normalizeFact({ k: 'a'.repeat(40), y: 1 })).toEqual({ k: 'a'.repeat(40), y: 1 })
    expect(normalizeFact({ k: 'a.b2.c3', y: 1 })).toEqual({ k: 'a.b2.c3', y: 1 })
  })

  it('cuts a ref to 40 characters, trims it, and drops an empty or non-string one', () => {
    expect(normalizeFact({ k: 'a', y: 1, c: 'x'.repeat(41) })?.c).toBe('x'.repeat(40))
    expect(normalizeFact({ k: 'a', y: 1, a: 'y'.repeat(100) })?.a).toBe('y'.repeat(40))
    expect(normalizeFact({ k: 'a', y: 1, c: '  company:9  ' })?.c).toBe('company:9')
    expect(normalizeFact({ k: 'a', y: 1, c: '   ' })).toEqual({ k: 'a', y: 1 })
    expect(normalizeFact({ k: 'a', y: 1, c: 9, a: ['x'] })).toEqual({ k: 'a', y: 1 })
  })

  it('does not leave a trailing space after the cut, and does not cut a surrogate pair in two', () => {
    expect(normalizeFact({ k: 'a', y: 1, c: `${'x'.repeat(39)} ${'y'.repeat(5)}` })?.c).toBe('x'.repeat(39))
    const pair = '\u{1F600}'
    const cut = normalizeFact({ k: 'a', y: 1, c: `${'x'.repeat(39)}${pair}` })?.c
    expect(cut).toBe('x'.repeat(39))
    expect(normalizeFact({ k: 'a', y: 1, c: `${'x'.repeat(38)}${pair}` })?.c).toBe(`${'x'.repeat(38)}${pair}`)
  })

  it('drops a magnitude that is not finite and clamps one that is too large', () => {
    for (const v of [NaN, Infinity, -Infinity, '5', null, {}]) expect(normalizeFact({ k: 'a', y: 1, v }), String(v)).toEqual({ k: 'a', y: 1 })
    expect(normalizeFact({ k: 'a', y: 1, v: 1e30 })?.v).toBe(1e15)
    expect(normalizeFact({ k: 'a', y: 1, v: -1e30 })?.v).toBe(-1e15)
    expect(normalizeFact({ k: 'a', y: 1, v: 0.0004 })?.v).toBe(0)
    expect(Object.is(normalizeFact({ k: 'a', y: 1, v: -0.0001 })?.v, 0)).toBe(true)
    expect(normalizeFact({ k: 'a', y: 1, v: -2.5 })?.v).toBe(-2.5)
  })

  it('rounds a severity and clamps it to 0 to 100, and drops one that is not finite', () => {
    expect(normalizeFact({ k: 'a', y: 1, s: 250 })?.s).toBe(100)
    expect(normalizeFact({ k: 'a', y: 1, s: -5 })?.s).toBe(0)
    expect(normalizeFact({ k: 'a', y: 1, s: 40.6 })?.s).toBe(41)
    expect(normalizeFact({ k: 'a', y: 1, s: 0 })?.s).toBe(0)
    for (const s of [NaN, Infinity, '5', null]) expect(normalizeFact({ k: 'a', y: 1, s }), String(s)).toEqual({ k: 'a', y: 1 })
  })

  it('returns null for what is not an object', () => {
    for (const raw of [null, undefined, 5, 'x', true, [], [1, 2], () => 1]) expect(normalizeFact(raw), String(raw)).toBeNull()
  })

  it('copies nothing it does not know, including a hostile __proto__ key', () => {
    const raw = JSON.parse('{"k":"a.b","y":1,"__proto__":{"polluted":1},"constructor":{"x":1},"z":9}') as unknown
    const f = normalizeFact(raw)
    expect(f).toEqual({ k: 'a.b', y: 1 })
    expect(Object.getPrototypeOf(f)).toBe(Object.prototype)
    expect((f as unknown as { polluted?: number }).polluted).toBeUndefined()
    expect(({} as { polluted?: number }).polluted).toBeUndefined()
  })

  it('is idempotent and does not touch its input', () => {
    const raw = { k: 'a.b', y: 7, c: ' c '.padEnd(60, 'x'), a: `${'w'.repeat(39)} z`, v: 1e20, s: 300 }
    const copy = JSON.stringify(raw)
    const once = normalizeFact(raw)
    expect(JSON.stringify(raw)).toBe(copy)
    expect(normalizeFact(once)).toEqual(once)
  })

  it('states its limits', () => {
    expect(FACT_LIMITS).toEqual({ kind: 40, ref: 40, magnitude: 1e15, severity: 100, cascade: 64 })
  })
})
