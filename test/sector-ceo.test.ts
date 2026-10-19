// The hired CEO's desk step: above skill 75 a hired CEO works the Operations Desk (at most two changes
// a year, inside the board's budget and reserve) and reports it in the yearly letter. Every test runs
// on a stub family (test/sector-kit.ts) whose levers are worth a known number of dollars a year.
import { beforeEach, describe, expect, it } from 'vitest'
import { unitFlags } from '../scripts/voice/rules.mjs'
import { hasColonJoin } from '../scripts/voice/rules.mjs'
import { MAX_PAYBACK, outlook, smartManagerTurn } from '../src/game/business/board-ceo'
import { boardOf } from '../src/game/business/board-state'
import { capexBudget, reserveDollars } from '../src/game/business/board-vote'
import { ceoLetter, letterWords } from '../src/game/business/career'
import { copyLines, registerFamily, sectorText, type CopyTable, type LeverDef } from '../src/game/business/sector-kit'
import { applyLever } from '../src/game/business/sector-menu'
import { CEO_COPY, SECTOR_MAX_CHANGES, sectorTurn, type SectorTurn } from '../src/game/business/sector-ceo'
import { blankRecord, readSector, saveSector, type FoodState, type SectorState } from '../src/game/business/sector-state'
import type { BizState, Manager } from '../src/game/business/state'
import type { Asset, GameState } from '../src/game/types'
import { deskGame, managedDesk } from './sector-kit'

const COPY: CopyTable = {
  'stub.lever.menu.0.label': 'Lean', 'stub.lever.menu.0.tip': 'Cheaper plates.',
  'stub.lever.menu.1.label': 'Balanced', 'stub.lever.menu.1.tip': 'Neither saves nor spends.',
  'stub.lever.menu.2.label': 'Signature', 'stub.lever.menu.2.tip': 'Dearer plates.',
  'stub.lever.channel.0.label': 'Off', 'stub.lever.channel.0.tip': 'No delivery.',
  'stub.lever.channel.1.label': 'Platform', 'stub.lever.channel.1.tip': 'An app delivers.',
  'stub.lever.channel.2.label': 'Own fleet', 'stub.lever.channel.2.tip': 'Your drivers deliver.',
  'stub.lever.hours.0.label': 'Standard', 'stub.lever.hours.0.tip': 'Normal hours.',
  'stub.lever.hours.1.label': 'Extended', 'stub.lever.hours.1.tip': 'Later closing.',
  'stub.lever.audit.1.label': 'Light audit', 'stub.lever.audit.1.tip': 'Raises hygiene.',
  'stub.lever.audit.2.label': 'Full audit', 'stub.lever.audit.2.tip': 'Raises hygiene a little more.',
  'stub.lever.refit.1.label': 'Refit', 'stub.lever.refit.1.tip': 'New kitchen line.',
  'stub.lever.long.1.label': 'Open on public holidays too', 'stub.lever.long.1.tip': 'Longer opening.',
}

const food = (st: SectorState): FoodState => {
  if (st.family !== 'food') throw new Error('food record expected')
  return st
}

/** A lever with options 0..n-1 over one numeric field of the record. */
function free(id: string, label: string, n: number, read: (s: FoodState) => number, write: (s: FoodState, v: number) => FoodState): LeverDef {
  return {
    id, label, paid: false,
    options: () => Array.from({ length: n }, (_, v) => ({ value: v, label: sectorText(COPY, `stub.lever.${id}.${v}.label`), tip: sectorText(COPY, `stub.lever.${id}.${v}.tip`) })),
    current: (st) => read(food(st)),
    apply: (st, v) => write(food(st), v),
    cost: () => 0,
  }
}

const MENU = free('menu', 'Menu style', 3, (s) => s.menu, (s, v) => ({ ...s, menu: v as 0 | 1 | 2 }))
const CHANNEL = free('channel', 'Delivery', 3, (s) => s.channel, (s, v) => ({ ...s, channel: v as 0 | 1 | 2 }))
const HOURS = free('hours', 'Hours', 2, (s) => s.hours, (s, v) => ({ ...s, hours: v as 0 | 1 }))
const LONG: LeverDef = {
  id: 'long', label: 'Quarterly public holiday opening rota', paid: false,
  options: () => [{ value: 1, label: sectorText(COPY, 'stub.lever.long.1.label'), tip: sectorText(COPY, 'stub.lever.long.1.tip') }],
  current: (st) => food(st).hours,
  apply: (st) => ({ ...food(st), hours: 1 }),
  cost: () => 0,
}

/** The audit: option 1 costs 1,000 and option 2 costs 3,000 for a little more hygiene (about 160 more over three years). */
const AUDIT: LeverDef = {
  id: 'audit', label: 'Kitchen audit', paid: true,
  options: () => [1, 2].map((v) => ({ value: v, label: sectorText(COPY, `stub.lever.audit.${v}.label`), tip: sectorText(COPY, `stub.lever.audit.${v}.tip`) })),
  current: (st, year) => (food(st).audit === year ? 1 : 0),
  apply: (st, v, year) => ({ ...food(st), audit: year, hygiene: food(st).hygiene + (v === 2 ? 10.4 : 10) }),
  cost: (_g, _b, _st, v) => (v === 2 ? 3000 : 1000),
}

/** A refit that pays back in 2.57 years: too slow for a cash mandate (2.5), fine for a profit one (3). */
const REFIT: LeverDef = {
  id: 'refit', label: 'Kitchen refit', paid: true,
  options: () => [{ value: 1, label: sectorText(COPY, 'stub.lever.refit.1.label'), tip: sectorText(COPY, 'stub.lever.refit.1.tip') }],
  current: (st) => (food(st).rating > 4 ? 1 : 0),
  apply: (st) => ({ ...food(st), rating: 4.4 }),
  cost: () => 20_000,
}

/** A family whose year pays a known number of dollars for each setting (the record never changes by itself). */
function useLevers(levers: readonly LeverDef[]): void {
  registerFamily({
    family: 'food', copy: COPY,
    seed: (_g, _a, _b, since) => blankRecord('food', since),
    effects: (_g, _a, _b, st) => {
      const s = food(st)
      const income = 5000 * (s.menu - 1) + 4000 * s.channel + 3000 * s.hours + 2000 * (s.hygiene - 71) + 7778 * (s.rating - 3.4)
      return { demand: 1, cost: 1, capLoss: 0, open: 1, income: Math.max(0, income), costs: 0, randIncome: 0, randCosts: 0, next: s, note: null }
    },
    header: () => [],
    levers,
    events: [],
  })
}

beforeEach(() => useLevers([MENU, CHANNEL, HOURS, AUDIT]))

function turnOf(g: GameState, a: Asset, b: BizState): SectorTurn {
  const m = b.manager as Manager | null
  if (!m) throw new Error('no manager')
  return { g, a, b, m, st: boardOf(b), judge: (v) => v, lines: [], moved: 0, reserved: 0 }
}

/** A managed company with a live record. */
function desk(skill: number): { g: GameState; a: Asset; b: BizState } {
  const x = managedDesk('restaurant', skill)
  saveSector(x.b, blankRecord('food', x.g.year - 1))
  return x
}

const LEVERS = () => [MENU, CHANNEL, HOURS, AUDIT, REFIT, LONG]
function settings(g: GameState, b: BizState): Record<string, number> {
  const st = readSector(b) as SectorState
  return Object.fromEntries(LEVERS().map((l) => [l.id, l.current(st, g.year)]))
}
const changed = (before: Record<string, number>, after: Record<string, number>) => Object.keys(after).filter((k) => after[k] !== before[k])

describe('the hired CEO', () => {
  it('stays modeled', () => {
    for (const trade of ['restaurant', 'clinic', 'energy'] as const) {
      const { g, a, b } = deskGame(trade)
      expect(outlook(g, a, b).modeled, trade).toBe(true)
    }
  })

  it('skill 75 changes no lever, skill 76 changes at most 2', () => {
    const weak = desk(75)
    const t75 = turnOf(weak.g, weak.a, weak.b)
    const before75 = JSON.stringify(weak.b)
    sectorTurn(t75, MAX_PAYBACK.balanced)
    expect(t75.lines).toEqual([])
    expect(JSON.stringify(weak.b)).toBe(before75)

    const strong = desk(76)
    const before = settings(strong.g, strong.b)
    const t76 = turnOf(strong.g, strong.a, strong.b)
    sectorTurn(t76, MAX_PAYBACK.balanced)
    const moved = changed(before, settings(strong.g, strong.b))
    expect(SECTOR_MAX_CHANGES).toBe(2)
    expect(moved).toHaveLength(2)
    // The two that pay most: the audit and the delivery channel, not the menu or the hours.
    expect(moved.sort()).toEqual(['audit', 'channel'])
    expect(t76.lines).toHaveLength(2)
  })

  it('needs a record and leaves a lever the owner already changed', () => {
    const bare = managedDesk('restaurant', 90)
    const t = turnOf(bare.g, bare.a, bare.b)
    sectorTurn(t, MAX_PAYBACK.balanced)
    expect(t.lines).toEqual([])
    expect(readSector(bare.b)).toBeNull()

    const { g, a, b } = desk(90)
    expect(applyLever(g, a, 'channel', 2, 'owner').ok).toBe(true)
    const before = settings(g, b)
    sectorTurn(turnOf(g, a, b), MAX_PAYBACK.balanced)
    const moved = changed(before, settings(g, b))
    expect(moved).not.toContain('channel')
    expect(moved.length).toBeLessThanOrEqual(2)
  })

  it('obeys the budget and the reserve', () => {
    const none = desk(80)
    boardOf(none.b).limits.capex = 0
    const cash = none.b.cash
    const before = settings(none.g, none.b)
    const t = turnOf(none.g, none.a, none.b)
    sectorTurn(t, MAX_PAYBACK.balanced)
    const moved = changed(before, settings(none.g, none.b))
    expect(moved).not.toContain('audit')
    expect(moved.length).toBeGreaterThan(0)
    expect(none.b.cash).toBe(cash)
    expect(t.st.spent).toBe(0)

    const poor = desk(80)
    const reserve = reserveDollars(poor.b, boardOf(poor.b))
    poor.b.cash = reserve + 500
    const t2 = turnOf(poor.g, poor.a, poor.b)
    sectorTurn(t2, MAX_PAYBACK.balanced)
    expect((readSector(poor.b) as FoodState).audit).toBe(0)
    expect(poor.b.cash).toBe(reserve + 500)

    const rich = desk(80)
    const st = boardOf(rich.b)
    const cashBefore = rich.b.cash
    const t3 = turnOf(rich.g, rich.a, rich.b)
    sectorTurn(t3, MAX_PAYBACK.balanced)
    expect((readSector(rich.b) as FoodState).audit).toBe(rich.g.year)
    expect(rich.b.cash).toBeGreaterThanOrEqual(reserveDollars(rich.b, st))
    expect(st.spent).toBeLessThanOrEqual(capexBudget(rich.b, st))
    expect(cashBefore - rich.b.cash).toBe(3000)
    expect(st.spent).toBe(3000)
    expect(t3.moved).toBe(3000)
  })

  it('a cash mandate picks the cheaper option when the two values are within 5%', () => {
    const balanced = desk(80)
    sectorTurn(turnOf(balanced.g, balanced.a, balanced.b), MAX_PAYBACK.balanced)
    expect((readSector(balanced.b) as FoodState).hygiene).toBeCloseTo(81.4, 6)

    const cash = desk(80)
    boardOf(cash.b).mandate = 'cash'
    const before = cash.b.cash
    sectorTurn(turnOf(cash.g, cash.a, cash.b), MAX_PAYBACK.cash)
    expect((readSector(cash.b) as FoodState).hygiene).toBeCloseTo(81, 6)
    expect(before - cash.b.cash).toBe(1000)
  })

  it('a paid lever must pay back within the mandate unless it is an audit', () => {
    useLevers([REFIT])
    const slow = desk(80)
    boardOf(slow.b).mandate = 'cash'
    const t = turnOf(slow.g, slow.a, slow.b)
    sectorTurn(t, MAX_PAYBACK.cash)
    expect(t.lines).toEqual([])
    expect((readSector(slow.b) as FoodState).rating).toBeCloseTo(3.4, 6)

    const fine = desk(80)
    boardOf(fine.b).mandate = 'profit'
    const t2 = turnOf(fine.g, fine.a, fine.b)
    sectorTurn(t2, MAX_PAYBACK.profit)
    expect((readSector(fine.b) as FoodState).rating).toBeCloseTo(4.4, 6)
    expect(t2.lines).toHaveLength(1)
    expect(t2.lines[0]).toContain('$20,000')
    expect(t2.lines[0]).toContain('$7,778')
  })
})

describe('letter lines', () => {
  const OK = (x: string) => {
    expect(letterWords(x), x).toBeLessThanOrEqual(12)
    expect(x, x).toMatch(/\d/)
    expect(x, x).not.toMatch(/^(?:Cut|Let|Closed|Retired|Opened|Built)\s/)
    expect(hasColonJoin(x), x).toBe(false)
  }

  it('each is short, carries a number and joins nothing with a colon', () => {
    const { g, a, b } = desk(90)
    const t = turnOf(g, a, b)
    sectorTurn(t, MAX_PAYBACK.balanced)
    expect(t.lines.length).toBeGreaterThan(0)
    for (const x of t.lines) OK(x)
    expect(t.lines.some((x) => x.startsWith('Spent '))).toBe(true)
    expect(t.lines.some((x) => x.startsWith('Set '))).toBe(true)
  })

  it('stay within 12 words for long names', () => {
    useLevers([LONG])
    const { g, a, b } = desk(90)
    const t = turnOf(g, a, b)
    sectorTurn(t, MAX_PAYBACK.balanced)
    expect(t.lines).toHaveLength(1)
    OK(t.lines[0])
  })

  it('one letter a year still holds', () => {
    const { g, a, b } = desk(85)
    const st = boardOf(b)
    smartManagerTurn(g, a, b)
    expect(st.letter).toBe(g.year)
    expect(st.memo.some((x) => /^(?:Set|Spent) /.test(x))).toBe(true)
    const letters = g.queue.filter((m) => m.kind === 'notice' && m.title === `${a.name}: Letter from the CEO`)
    expect(letters.length).toBeLessThanOrEqual(1)
    const memo = [...st.memo]
    ceoLetter(g, a, b, ['Set the menu to Lean, worth $1 a year.'], true)
    expect(st.memo).toEqual(memo)
    for (const x of st.memo) expect(letterWords(x), x).toBeLessThanOrEqual(12)
  })
})

describe('CEO_COPY', () => {
  it('has only valid keys that pass the voice rules', () => {
    const lines = copyLines(CEO_COPY)
    expect(lines.length).toBeGreaterThan(3)
    for (const l of lines) {
      expect(l.key.startsWith('ceo.'), l.key).toBe(true)
      expect(l.role, l.key).toBe('log')
      expect(unitFlags(l.text.replace(/\$\{\w+\}/g, '${...}'), l.role), `${l.key}: ${l.text}`).toEqual([])
      expect(l.text, l.key).not.toMatch(/^(?:Cut|Let|Closed|Retired|Opened|Built)\s/)
    }
  })
})
