// R2-K12 (K.3 h): the company view is five registered sections (business.view.top, .run, .money, .lead, .exit).
//
// test/kernel-parity.test.ts holds what the conversion must not change: the ids and the order of businessView for every industry and
// the five special companies. This file holds what parity cannot see: that a track extends a section with one registered module and
// lands where its order says, that the built-in sections register themselves when manage.ts alone is imported (every test that opens a
// company screen imports nothing else), that the sections keep their pinned orders, and that the view stays a pure read with unique ids.
//
// Not in the fast tier: it builds a company for every industry. No pinned seed: the companies come from test/parity-kit.ts.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { businessView } from '../src/game/business/manage'
import type { ModuleDef } from '../src/game/kernel/registry'
import type { Asset, GameState, MenuNode } from '../src/game/types'
import { deepFreeze } from './fuzz-kit'
import { industryCompany, VIEW_KEYS, VIEW_VARIANTS } from './parity-kit'

const TIMEOUT = 120_000
const SLOTS = ['top', 'run', 'money', 'lead', 'exit'] as const

const ids = (nodes: readonly MenuNode[]): string[] => nodes.map((n) => n.id)

/** The ids of `list` with `add` put in front of the first id `before`. */
function insertedBefore(list: readonly string[], before: string, add: readonly string[]): string[] {
  const at = list.indexOf(before)
  expect(at, `${before} is in the view`).toBeGreaterThan(-1)
  return [...list.slice(0, at), ...add, ...list.slice(at)]
}

// The extension tests run in a fresh module epoch: a second copy of the registry and of manage.ts, so a module registered here is
// seen by this copy's businessView and by nobody else's. The companies are plain data, built once with the kit's own copy.
type Registry = typeof import('../src/game/kernel/registry')
let registry: Registry
let viewOf: (g: GameState, a: Asset) => MenuNode[]

/** Extension modules register once and say nothing until a test arms them, so each test sees only its own rows. */
const armed = new Set<string>()
const info = (id: string): MenuNode => ({ type: 'info', id, text: id })
const extension = (id: string, path: string, order: number, nodeId: string): ModuleDef => ({
  id,
  layer: 3,
  menus: [{ path, order, build: () => (armed.has(id) ? [info(nodeId)] : []) }],
})

beforeAll(async () => {
  vi.resetModules()
  registry = await import('../src/game/kernel/registry')
  viewOf = (await import('../src/game/business/manage')).businessView
  registry.registerModule(extension('ext.runFirst', 'business.view.run', 5, 'x.first'))
  registry.registerModule(extension('ext.runLast', 'business.view.run', 35, 'x.last'))
  registry.registerModule(extension('ext.topMid', 'business.view.top', 55, 'x.mid'))
}, TIMEOUT)

afterEach(() => armed.clear())

describe('the built-in sections register when manage.ts is imported', () => {
  it('one module, business.manage, with the pinned entries of the five slots', () => {
    const def = registry.getModule('business.manage')
    expect(def, 'module business.manage').toBeDefined()
    expect(def!.layer).toBe(3)
    const orders = (slot: string): number[] =>
      registry
        .menuEntries(`business.view.${slot}`)
        .filter((e) => e.id.startsWith('business.manage'))
        .map((e) => e.order)
    expect(Object.fromEntries(SLOTS.map((s) => [s, orders(s)]))).toEqual({
      top: [10, 20, 30, 40, 50, 60],
      run: [10, 20, 30],
      money: [10, 20, 30, 40, 50],
      lead: [10, 20, 30],
      exit: [10, 20],
    })
  })

  it('an unarmed extension changes nothing, and the same view comes from the first copy of manage.ts', () => {
    const { g, a } = industryCompany('software')
    expect(viewOf(g, a).map((n) => n.id)).toEqual(ids(businessView(g, a)))
  })
})

describe('a track extends a section with one registered module', () => {
  it('on business.view.run: order 5 comes before the run heading, order 35 after the last run block', () => {
    const { g, a } = industryCompany('software')
    const plain = ids(viewOf(g, a))
    const heading = `biz.runH.${a.id}`
    const money = `biz.moneyH.${a.id}`

    armed.add('ext.runFirst')
    const first = ids(viewOf(g, a))
    expect(first).toEqual(insertedBefore(plain, heading, ['x.first']))
    expect(first.indexOf('x.first')).toBe(first.indexOf(heading) - 1)

    armed.clear()
    armed.add('ext.runLast')
    const last = ids(viewOf(g, a))
    expect(last).toEqual(insertedBefore(plain, money, ['x.last']))
    // after the whole product block: the plan action and the rows of the market, the staff and the rest are all behind the heading
    const block = last.slice(last.indexOf(heading) + 1, last.indexOf('x.last'))
    expect(block).toContain(`biz.plan.${a.id}`)
    expect(block.length).toBeGreaterThan(5)
    expect(last.indexOf('x.last')).toBe(last.indexOf(money) - 1)
  })

  it('on business.view.top: order 55 lands between the details row and the sector row', () => {
    const { g, a } = industryCompany('restaurant')
    const plain = ids(viewOf(g, a))
    const details = `biz.details.${a.id}`
    const sector = `sector.desk.${a.id}`
    expect(plain.indexOf(sector), 'a restaurant has a sector row').toBe(plain.indexOf(details) + 1)

    armed.add('ext.topMid')
    const got = ids(viewOf(g, a))
    expect(got).toEqual(insertedBefore(plain, sector, ['x.mid']))
    expect(got.indexOf('x.mid')).toBe(got.indexOf(details) + 1)
    expect(got.indexOf(sector)).toBe(got.indexOf('x.mid') + 1)
  })

  it('every slot keeps working with all three extensions armed at once, each in its own place', () => {
    const { g, a } = industryCompany('software')
    const plain = ids(viewOf(g, a))
    armed.add('ext.runFirst').add('ext.runLast').add('ext.topMid')
    const got = ids(viewOf(g, a))
    // a software company has no venue and no sector row, so the top extension is the last row of the top section
    const heading = `biz.runH.${a.id}`
    const money = `biz.moneyH.${a.id}`
    expect(got).toEqual(insertedBefore(insertedBefore(plain, heading, ['x.mid', 'x.first']), money, ['x.last']))
    expect(got.filter((id) => id.startsWith('x.'))).toEqual(['x.mid', 'x.first', 'x.last'])
  })
})

describe('the run section is one of three blocks', () => {
  it('a finance firm has no run heading and starts its run section with the finance heading', () => {
    const { g, a } = industryCompany('bank')
    const got = ids(businessView(g, a))
    expect(got).not.toContain(`biz.runH.${a.id}`)
    expect(got).not.toContain(`biz.plan.${a.id}`)
    expect(got[got.indexOf(`biz.details.${a.id}`) + 1]).toBe(`biz.financeH.${a.id}`)
  })

  it('a product company and a game studio have the run heading and no finance heading; only the product company has the plan action', () => {
    const product = industryCompany('software')
    const studio = industryCompany('gameStudio')
    const p = ids(businessView(product.g, product.a))
    const s = ids(businessView(studio.g, studio.a))
    for (const [got, a] of [[p, product.a], [s, studio.a]] as const) {
      expect(got).toContain(`biz.runH.${a.id}`)
      expect(got).not.toContain(`biz.financeH.${a.id}`)
    }
    expect(p).toContain(`biz.plan.${product.a.id}`)
    expect(s).not.toContain(`biz.plan.${studio.a.id}`)
  })

  it('the sections come in the order top, run, money, lead, exit', () => {
    const { g, a } = industryCompany('software')
    const got = ids(businessView(g, a))
    const heads = [`biz.runH.${a.id}`, `biz.moneyH.${a.id}`, `biz.leadH.${a.id}`, `biz.exitH.${a.id}`].map((h) => got.indexOf(h))
    expect(heads.every((i) => i > 0)).toBe(true)
    expect([...heads].sort((x, y) => x - y)).toEqual(heads)
  })
})

describe('the view is a clean read', () => {
  it(
    'no two siblings share an id (headings and info rows apart) in any company of the parity set, at the top and one level down',
    () => {
      const dups: string[] = []
      const check = (where: string, nodes: readonly MenuNode[]): void => {
        const seen = new Set<string>()
        for (const n of nodes) {
          if (n.type !== 'info' && n.type !== 'heading' && seen.has(n.id)) dups.push(`${where}: ${n.id}`)
          seen.add(n.id)
        }
      }
      for (const key of VIEW_KEYS) {
        const make = VIEW_VARIANTS[key]
        const { g, a } = make ? make() : industryCompany(key)
        const view = businessView(g, a)
        check(key, view)
        for (const n of view) if (n.type === 'menu') check(`${key} > ${n.id}`, n.children(g))
      }
      expect(dups).toEqual([])
    },
    TIMEOUT,
  )

  it('building the view twice on a deep-frozen state does not throw, and gives the same ids both times', () => {
    for (const key of ['software', 'bank', 'gameStudio', 'hiredCeoBoard']) {
      const make = VIEW_VARIANTS[key]
      const { g, a } = make ? make() : industryCompany(key)
      deepFreeze(g)
      const first = ids(businessView(g, a))
      const second = ids(businessView(g, a))
      expect(first.length, key).toBeGreaterThan(5)
      expect(second, key).toEqual(first)
    }
  })
})
