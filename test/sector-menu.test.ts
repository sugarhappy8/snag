// The Operations Desk menu and its one write path, applyLever: authorization comes first and every
// refusal leaves the game untouched, a paid lever books its cost once, hints read only expected draws.
// Every test runs on a stub family (test/sector-kit.ts), so the real family levers are not involved.
import { beforeEach, describe, expect, it } from 'vitest'
import { unitFlags } from '../scripts/voice/rules.mjs'
import { boardOf } from '../src/game/business/board-state'
import { bizWorth, simulateYear } from '../src/game/business/economy'
import { manageBlock } from '../src/game/business/gate'
import { businessView } from '../src/game/business/manage'
import { choiceValue } from '../src/game/business/sector-events'
import { copyLines, registerFamily, sectorCtx, sectorText, seasonIndex, type CopyTable, type LeverDef, type SectorEvent } from '../src/game/business/sector-kit'
import { applyLever, deskLines, leverValue, MENU_COPY, sectorMenu } from '../src/game/business/sector-menu'
import { blankRecord, readSector, saveSector, type FoodState, type SectorState } from '../src/game/business/sector-state'
import type { BizState } from '../src/game/business/state'
import { yearActionsUsed } from '../src/game/core'
import type { Asset, GameState, MenuAction, MenuGroup, MenuNode } from '../src/game/types'
import { deskGame, inert, jail, managedDesk, playYear } from './sector-kit'

const COPY: CopyTable = {
  'stub.lever.menu.0.label': 'Lean',
  'stub.lever.menu.0.tip': 'Cheaper plates, fewer guests.',
  'stub.lever.menu.1.label': 'Balanced',
  'stub.lever.menu.1.tip': 'Neither saves nor spends.',
  'stub.lever.menu.2.label': 'Signature',
  'stub.lever.menu.2.tip': 'Dearer plates, more guests.',
  'stub.lever.audit.1.label': 'Audit',
  'stub.lever.audit.1.tip': 'Raises hygiene this year.',
  'stub.ev.deal.head': 'A Rush Order',
  'stub.ev.deal.scene': 'A buyer wants a rush order by Friday. What will you do?',
  'stub.ev.deal.take.label': 'Take it',
  'stub.ev.deal.skip.label': 'Skip it',
  'stub.ev.deal.take.0.out': 'The order cost ${cost}.',
  'stub.ev.deal.skip.0.out': 'The buyer went elsewhere.',
}

const food = (st: SectorState): FoodState => {
  if (st.family !== 'food') throw new Error('food record expected')
  return st
}

const MENU: LeverDef = {
  id: 'menu', label: 'Menu style', paid: false,
  options: () => [0, 1, 2].map((v) => ({ value: v, label: sectorText(COPY, `stub.lever.menu.${v}.label`), tip: sectorText(COPY, `stub.lever.menu.${v}.tip`) })),
  current: (st) => food(st).menu,
  apply: (st, v) => ({ ...food(st), menu: v as 0 | 1 | 2 }),
  cost: () => 0,
}

const AUDIT_COST = 5000
const AUDIT: LeverDef = {
  id: 'audit', label: 'Kitchen audit', paid: true,
  options: () => [{ value: 1, label: sectorText(COPY, 'stub.lever.audit.1.label'), tip: sectorText(COPY, 'stub.lever.audit.1.tip') }],
  current: (st, year) => (food(st).audit === year ? 1 : 0),
  apply: (st, _v, year) => ({ ...food(st), audit: year }),
  cost: () => AUDIT_COST,
}

const DEAL: SectorEvent = {
  id: 'deal', family: 'food', title: 'A Rush Order', emoji: '\u{1F4E6}',
  weight: () => 1,
  scene: () => sectorText(COPY, 'stub.ev.deal.scene'),
  choices: () => [
    { id: 'take', label: 'Take it', branches: () => [{ p: 1, fx: { cash: -1000 }, sec: { add: { hygiene: 5 } }, text: 'stub.ev.deal.take.0.out', vals: { cost: '$1,000' } }] },
    { id: 'skip', label: 'Skip it', branches: () => [{ p: 1, fx: {}, text: 'stub.ev.deal.skip.0.out' }] },
  ],
}

/** A family whose year reads the menu and the hygiene, and counts how often it is asked for a real ('book') year. */
function valued(counter: { book: number } = { book: 0 }): void {
  registerFamily({
    family: 'food', copy: COPY,
    seed: (_g, _a, _b, since) => blankRecord('food', since),
    effects: (g, a, _b, st, fiscal, mode) => {
      const s = food(st)
      let income = 0
      if (mode === 'book') {
        counter.book++
        income = Math.round(1000 * (1 + seasonIndex(g, a, fiscal, 'x')))
      }
      return {
        demand: [.97, 1, 1.05][s.menu] * (1 + (s.hygiene - 71) / 1000), cost: [.93, 1, 1.07][s.menu], capLoss: 0, open: 1, income, costs: 0, randIncome: 0, randCosts: 0,
        next: { ...s, hygiene: s.hygiene + (s.audit === fiscal ? 5 : 0) }, note: null,
      }
    },
    header: () => ['stub'],
    levers: [MENU, AUDIT],
    events: [DEAL],
  })
}

beforeEach(() => valued())

function walk(g: GameState, nodes: MenuNode[]): MenuNode[] {
  return nodes.flatMap((n) => (n.type === 'menu' ? [n, ...walk(g, n.children(g))] : [n]))
}

/** Read every field of every node the way the screen does. */
function touch(g: GameState, nodes: MenuNode[]): number {
  let n = 0
  for (const node of walk(g, nodes)) {
    n++
    if (node.type === 'info') {
      if (typeof node.text === 'function') node.text(g)
      node.visible?.(g)
      continue
    }
    if (node.type === 'heading') {
      node.visible?.(g)
      continue
    }
    node.visible?.(g)
    node.disabledReason?.(g)
    node.hint?.(g)
    if (typeof node.subtitle === 'function') node.subtitle(g)
    if (node.type === 'action') node.confirm?.(g)
    else node.header?.(g)
  }
  return n
}

function live(g: GameState, b: BizState): FoodState {
  saveSector(b, blankRecord('food', g.year - 1))
  return food(readSector(b) as SectorState)
}

function refused(g: GameState, a: Asset, lever: string, option: number, by: 'owner' | 'ceo', name: string): void {
  const before = JSON.stringify(g)
  const r = applyLever(g, a, lever, option, by)
  expect(r.ok, name).toBe(false)
  if (!r.ok) expect(r.why.length, name).toBeGreaterThan(0)
  expect(JSON.stringify(g), name).toBe(before)
}

describe('menus are pure', () => {
  it('walking the desk and the whole company screen changes nothing', () => {
    for (const talent of [true, false]) {
      for (const record of [false, true]) {
        const { g, a, b } = deskGame('restaurant', { talent })
        if (record) live(g, b)
        const before = JSON.stringify(g)
        const rng = g.rng
        const nextId = g.nextId
        const desk = touch(g, [sectorMenu(a)])
        expect(desk, `desk ${talent} ${record}`).toBeGreaterThan(4)
        touch(g, businessView(g, a))
        expect(JSON.stringify(g), `talent ${talent} record ${record}`).toBe(before)
        expect(g.rng).toBe(rng)
        expect(g.nextId).toBe(nextId)
      }
    }
  }, 120_000)

  it('shows the desk only for a trade with a registered family', () => {
    const { g, a } = deskGame('restaurant')
    expect(sectorMenu(a).visible?.(g)).toBe(true)
    const bar = deskGame('bar')
    expect(sectorMenu(bar.a).visible?.(bar.g)).toBe(false)
    const cafe = deskGame('clinic')
    // The stub registers only the food family: a care trade has no model yet.
    expect(sectorMenu(cafe.a).visible?.(cafe.g)).toBe(false)
  })
})

describe('applyLever', () => {
  it('changes a free lever and creates the record live this year', () => {
    const { g, a, b } = deskGame('restaurant')
    expect(readSector(b)).toBeNull()
    const r = applyLever(g, a, 'menu', 2, 'owner')
    expect(r).toEqual({ ok: true, paid: 0 })
    const st = food(readSector(b) as SectorState)
    expect(st.menu).toBe(2)
    expect(st.since).toBe(g.year - 1)
    expect(st.lastYear).toBe(g.year - 1)
    expect(yearActionsUsed(g, `sector.menu.${a.id}`)).toBe(1)
    expect(st.diary.at(-1)).toBe(`${g.year}: Menu style now Signature.`)
    playYear(g)
    const after = food(readSector(b) as SectorState)
    expect(after.ledger).toHaveLength(1)
    expect(after.ledger[0].year).toBe(g.year - 1)
    expect(after.menu).toBe(2)
  })

  it('refuses direct and restored calls', () => {
    const sold = deskGame('restaurant')
    sold.g.assets = sold.g.assets.filter((x) => x.id !== sold.a.id)
    refused(sold.g, sold.a, 'menu', 2, 'owner', 'sold company')

    const cell = deskGame('restaurant')
    jail(cell.g)
    refused(cell.g, cell.a, 'menu', 2, 'owner', 'jail')

    const kid = deskGame('restaurant')
    kid.g.character.age = 17
    refused(kid.g, kid.a, 'menu', 2, 'owner', 'under age')

    const dead = deskGame('restaurant')
    dead.g.character.alive = false
    refused(dead.g, dead.a, 'menu', 2, 'owner', 'dead')

    const odd = deskGame('restaurant')
    refused(odd.g, odd.a, 'nope', 1, 'owner', 'unknown lever')
    refused(odd.g, odd.a, 'menu', .5, 'owner', 'a value between two options')
    refused(odd.g, odd.a, 'menu', 3, 'owner', 'an option not offered')
    refused(odd.g, odd.a, 'menu', Number.NaN, 'owner', 'not a number')
    refused(odd.g, odd.a, 'menu', 1, 'owner', 'the current setting')
    refused(odd.g, odd.a, 'menu', 2, 'ceo', 'ceo on an owner-run company')

    const low = managedDesk('restaurant', 75)
    refused(low.g, low.a, 'menu', 2, 'ceo', 'ceo at skill 75')

    const foreign = deskGame('restaurant')
    inert(foreign.b)
    refused(foreign.g, foreign.a, 'menu', 2, 'owner', 'foreign record')

    const twice = deskGame('restaurant')
    expect(applyLever(twice.g, twice.a, 'menu', 2, 'owner').ok).toBe(true)
    refused(twice.g, twice.a, 'menu', 0, 'owner', 'second change by the owner')

    const ownerFirst = managedDesk('restaurant', 80)
    expect(applyLever(ownerFirst.g, ownerFirst.a, 'menu', 2, 'owner').ok).toBe(true)
    refused(ownerFirst.g, ownerFirst.a, 'menu', 0, 'ceo', 'ceo after the owner')

    const ceoFirst = managedDesk('restaurant', 80)
    expect(applyLever(ceoFirst.g, ceoFirst.a, 'menu', 2, 'ceo').ok).toBe(true)
    refused(ceoFirst.g, ceoFirst.a, 'menu', 0, 'owner', 'owner after the ceo')

    // A new year clears the key.
    ceoFirst.g.yearActions = {}
    expect(applyLever(ceoFirst.g, ceoFirst.a, 'menu', 0, 'owner').ok).toBe(true)
  })

  it('refuses a paid lever the company cannot pay for', () => {
    const { g, a, b } = deskGame('restaurant', { cash: 1000 })
    refused(g, a, 'audit', 1, 'owner', 'not enough cash')
    expect(b.cash).toBe(1000)
  })

  it('a hired CEO works while the owner is in jail', () => {
    const { g, a, b } = managedDesk('restaurant', 80)
    jail(g)
    refused(g, a, 'menu', 0, 'owner', 'owner in jail')
    expect(manageBlock(g, a)).not.toBeNull()
    expect(applyLever(g, a, 'menu', 2, 'ceo').ok).toBe(true)
    expect(food(readSector(b) as SectorState).menu).toBe(2)
  })

  it('a board can refuse an owner’s paid lever', () => {
    for (const seed of [1, 2, 3, 4]) {
      const { g, a, b } = deskGame('restaurant', { seed })
      b.share = .6
      boardOf(b).limits = { capex: 0, reserve: 3, pay: 1.5 }
      const votes = boardOf(b).votes.length
      const cash = b.cash
      const costs = b.yearCosts
      const key = `sector.audit.${a.id}`
      const r = applyLever(g, a, 'audit', 1, 'owner')
      expect(boardOf(b).votes.length, `seed ${seed}`).toBe(votes + 1)
      if (r.ok) {
        expect(r.paid).toBe(AUDIT_COST)
        expect(b.cash).toBe(cash - AUDIT_COST)
        expect(b.yearCosts).toBe(costs + AUDIT_COST)
        expect(yearActionsUsed(g, key)).toBe(1)
      } else {
        expect(b.cash).toBe(cash)
        expect(b.yearCosts).toBe(costs)
        expect(yearActionsUsed(g, key)).toBe(0)
        expect(readSector(b)).toBeNull()
      }
    }
  })

  it('a paid lever books its cost once', () => {
    const run = (pay: boolean) => {
      const { g, a, b } = deskGame('restaurant')
      const cash = b.cash
      const costs = b.yearCosts
      let paid = 0
      if (pay) {
        const r = applyLever(g, a, 'audit', 1, 'owner')
        expect(r.ok).toBe(true)
        if (r.ok) paid = r.paid
        expect(b.cash).toBe(cash - AUDIT_COST)
        expect(b.yearCosts).toBe(costs + AUDIT_COST)
        expect(food(readSector(b) as SectorState).audit).toBe(g.year)
      }
      simulateYear(g, b, g.year, 0, 1)
      return { cash: b.cash, paid }
    }
    const A = run(true)
    const B = run(false)
    expect(A.paid).toBe(AUDIT_COST)
    // The tax relief returns part of the cost: a double booking would show more, a missing one nothing.
    expect(B.cash - A.cash).toBeGreaterThan(.4 * AUDIT_COST)
    expect(B.cash - A.cash).toBeLessThanOrEqual(AUDIT_COST)
  })
})

describe('the desk header', () => {
  it('says when the desk opens, what a weak CEO leaves alone, and the last two diary lines', () => {
    const { g, a, b } = deskGame('restaurant')
    expect(deskLines(g, a).join('\n')).toContain('The desk opens at the next year end.')
    expect(sectorMenu(a).header?.(g)).toContain('The desk opens at the next year end.')

    const st = live(g, b)
    st.diary = ['2022: one', '2023: two', '2024: three']
    saveSector(b, st)
    const lines = deskLines(g, a)
    expect(lines[0]).toBe('stub')
    expect(lines.join('\n')).not.toContain('The desk opens')
    expect(lines.slice(-2)).toEqual(['2023: two', '2024: three'])
    expect(sectorMenu(a).header?.(g)?.endsWith('2023: two\n2024: three')).toBe(true)
    expect(lines.join('\n')).not.toContain('Your CEO adjusts')

    const weak = managedDesk('restaurant', 75)
    live(weak.g, weak.b)
    expect(deskLines(weak.g, weak.a).join('\n')).toContain('Your CEO adjusts these levers at skill 76 or more.')
    const strong = managedDesk('restaurant', 76)
    live(strong.g, strong.b)
    expect(deskLines(strong.g, strong.a).join('\n')).not.toContain('Your CEO adjusts')
  })

  it('says so when the record belongs to a newer version', () => {
    const { g, a, b } = deskGame('restaurant')
    inert(b)
    const text = deskLines(g, a).join('\n')
    expect(text).not.toContain('The desk opens')
    expect(text.length).toBeGreaterThan(0)
    expect(b.sector).toEqual({ v: 2 })
  })
})

describe('hints', () => {
  it('never read next year’s draws', () => {
    const counter = { book: 0 }
    valued(counter)
    const { g, a, b } = deskGame('restaurant')
    const st = live(g, b)
    touch(g, [sectorMenu(a)])
    for (const o of [0, 1, 2]) leverValue(g, a, b, st, MENU, o)
    leverValue(g, a, b, st, AUDIT, 1)
    choiceValue(g, a, b, st, DEAL, 'take')
    expect(counter.book).toBe(0)

    const other = deskGame('restaurant')
    other.g.lifeId = `${g.lifeId}-other`
    const w = bizWorth(g, b)
    const cx = sectorCtx(g, b, g.year)
    const stB = live(other.g, other.b)
    expect(leverValue(other.g, other.a, other.b, stB, MENU, 2, w, cx)).toBe(leverValue(g, a, b, st, MENU, 2, w, cx))
    expect(leverValue(other.g, other.a, other.b, stB, AUDIT, 1, w, cx)).toBe(leverValue(g, a, b, st, AUDIT, 1, w, cx))
    expect(counter.book).toBe(0)
  })

  it('leverValue is 0 for the current setting and subtracts the price', () => {
    const { g, a, b } = deskGame('restaurant')
    const st = live(g, b)
    expect(leverValue(g, a, b, st, MENU, 1)).toBe(0)
    const free: LeverDef = { ...AUDIT, id: 'free', cost: () => 0 }
    expect(leverValue(g, a, b, st, AUDIT, 1) + AUDIT_COST).toBeCloseTo(leverValue(g, a, b, st, free, 1), 6)
    expect(Number.isFinite(leverValue(g, a, b, st, MENU, 2))).toBe(true)
  })

  it('mark the best option of a lever only, and only with the talent', () => {
    const { g, a, b } = deskGame('restaurant')
    const st = live(g, b)
    const rows = (gg: GameState, aa: Asset) => {
      const menu = sectorMenu(aa).children(gg)[0] as MenuGroup
      return menu.children(gg) as MenuAction[]
    }
    const hints = rows(g, a).map((r) => r.hint?.(g) ?? '')
    expect(hints.filter(Boolean)).toHaveLength(1)
    const values = [0, 1, 2].map((o) => leverValue(g, a, b, st, MENU, o))
    expect(hints[values.indexOf(Math.max(...values))]).not.toBe('')

    const plain = deskGame('restaurant', { talent: false })
    live(plain.g, plain.b)
    expect(rows(plain.g, plain.a).every((r) => !r.hint?.(plain.g))).toBe(true)

    const cell = deskGame('restaurant')
    live(cell.g, cell.b)
    jail(cell.g)
    expect(rows(cell.g, cell.a).every((r) => !r.hint?.(cell.g))).toBe(true)
  })
})

describe('menu shape', () => {
  it('has an id, a gate, one submenu per lever and one action per option', () => {
    const { g, a, b } = deskGame('restaurant')
    live(g, b)
    const menu = sectorMenu(a)
    expect(menu.id).toBe(`sector.desk.${a.id}`)
    expect(menu.disabledReason?.(g)).toBe(manageBlock(g, a))
    expect(menu.disabledReason?.(g)).toBeNull()
    const levers = menu.children(g)
    expect(levers.map((n) => n.type)).toEqual(['menu', 'menu'])
    expect(levers.map((n) => n.id)).toEqual([`sector.lever.menu.${a.id}`, `sector.lever.audit.${a.id}`])
    const menuRows = (levers[0] as MenuGroup).children(g) as MenuAction[]
    expect(menuRows.map((r) => r.type)).toEqual(['action', 'action', 'action'])
    expect(menuRows[1].label).toMatch(/^✓ Balanced/)
    expect(menuRows[0].label).not.toMatch(/✓/)
    expect(menuRows.every((r) => !r.confirm?.(g))).toBe(true)
    const auditRows = (levers[1] as MenuGroup).children(g) as MenuAction[]
    expect(auditRows).toHaveLength(1)
    expect(auditRows[0].confirm?.(g)).toContain('$5,000')
    const sub = typeof auditRows[0].subtitle === 'function' ? auditRows[0].subtitle(g) : auditRows[0].subtitle
    expect(sub).toContain('$5,000')
    expect(sub).toContain('Raises hygiene this year.')

    jail(g)
    expect(menu.disabledReason?.(g)).toBe(manageBlock(g, a))
    expect(menu.disabledReason?.(g)).not.toBeNull()
  })

  it('runs a row: success adds no popup, a refusal says why', () => {
    const { g, a, b } = deskGame('restaurant')
    live(g, b)
    const rows = ((sectorMenu(a).children(g)[0] as MenuGroup).children(g)) as MenuAction[]
    const queued = g.queue.length
    rows[2].run(g)
    expect(g.queue.length).toBe(queued)
    expect(food(readSector(b) as SectorState).menu).toBe(2)
    // The same key again: refused with a notice titled for the desk.
    rows[0].run(g)
    expect(food(readSector(b) as SectorState).menu).toBe(2)
    const last = g.queue.at(-1)
    expect(last?.kind === 'notice' && last.title).toBe('Operations Desk')
    const reason = rows[0].disabledReason?.(g)
    expect(typeof reason).toBe('string')
  })
})

describe('MENU_COPY', () => {
  it('has only valid keys that pass the voice rules', () => {
    const lines = copyLines(MENU_COPY)
    expect(lines.length).toBeGreaterThan(20)
    for (const l of lines) {
      expect(l.key.startsWith('menu.'), l.key).toBe(true)
      // The rules read a hole as ${...}; ours are named.
      expect(unitFlags(l.text.replace(/\$\{\w+\}/g, '${...}'), l.role), `${l.key}: ${l.text}`).toEqual([])
      if (l.role === 'label') expect(l.text.trim().split(/\s+/).length, l.key).toBeLessThanOrEqual(5)
      if (l.role === 'title') expect(l.text.length, l.key).toBeLessThanOrEqual(40)
    }
  })
})
