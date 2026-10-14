// The Yearly Dividend menu (auto-dividends task 4): where it sits in Money, the rows it shows, what each
// action writes, how it behaves when the player can't manage the company, and the preview line. Fixtures
// come from own-listing-kit; the menu is read from businessView the way the company screen reads it.
import { describe, expect, it } from 'vitest'
import '../src/game/business'
import { boardOf } from '../src/game/business/board-state'
import { dividendMenu, ruleNote } from '../src/game/business/dividend-menu'
import { autoDividendYear, dividendFloor, dividendQuote } from '../src/game/business/dividend-year'
import type { DividendPolicy } from '../src/game/business/dividend-policy'
import { refreshValue, valuationOf } from '../src/game/business/economy'
import { manageBlock } from '../src/game/business/gate'
import { businessView } from '../src/game/business/manage'
import { bizOf, readBiz, type BizState, type Statement } from '../src/game/business/state'
import { money, pct } from '../src/game/business/util'
import type { Asset, GameState, MenuAction, MenuGroup, MenuNode } from '../src/game/types'
import { deepFreeze, FailureLog, probeActions } from './fuzz-kit'
import { founder, listed, listedGroup, privateCompany } from './own-listing-kit'

const OFF_LINE = 'Off. Pay yourself by hand, or set a yearly rule.'

/** A booked year of zeros with a fiscal year and a net profit. */
function stmt(year: number, net: number): Statement {
  return {
    year, demand: 0, sold: 0, produced: 0, spoiled: 0, price: 0, revenue: 0, salesTax: 0, netRevenue: 0, cogs: 0, wages: 0, keyStaff: 0,
    rent: 0, marketing: 0, interest: 0, upkeep: 0, other: 0, otherIncome: 0, ownerPay: 0, pbt: 0, corpTax: 0, net, cashErosion: 0, cycle: 1,
    openFraction: 1, employees: 0,
  }
}

/** Last year's books: a year of costs of 12e6, so three months is 3e6. */
function books(g: GameState, b: BizState, net: number): Statement {
  b.last = { ...stmt(g.year - 1, net), netRevenue: 12e6, pbt: 0 }
  return b.last
}

/** A wholly owned private company with 10e6 cash, no debt and a booked 4e6 profit. */
function rich(g: GameState, rule?: DividendPolicy): { a: Asset; b: BizState } {
  const { a, b } = privateCompany(g)
  b.share = 1
  b.cash = 10e6
  b.debt = 0
  books(g, b, 4e6)
  b.valuation = valuationOf(b)
  refreshValue(a, b)
  if (rule) b.dividend = rule
  return { a, b }
}

function menuOf(g: GameState, a: Asset): MenuGroup {
  const n = businessView(g, a).find((x) => x.id === `biz.divpolicy.${a.id}`)
  if (!n || n.type !== 'menu') throw new Error('no Yearly Dividend menu')
  return n
}

type Key = 'profit' | 'cash' | 'keep' | 'off'

function action(g: GameState, a: Asset, key: Key): MenuAction {
  const n = menuOf(g, a).children(g).find((x) => x.id === `biz.divpolicy.${key}.${a.id}`)
  if (!n || n.type !== 'action') throw new Error(`no ${key} action`)
  return n
}

function subtitleOf(g: GameState, n: { subtitle?: string | ((g: GameState) => string) }): string {
  return typeof n.subtitle === 'function' ? n.subtitle(g) : n.subtitle ?? ''
}

function infoTexts(g: GameState, nodes: MenuNode[]): string[] {
  return nodes.flatMap((n) => (n.type === 'info' ? [typeof n.text === 'function' ? n.text(g) : n.text] : []))
}

function titled(g: GameState, title: string): string[] {
  return g.queue.flatMap((m) => (m.kind === 'notice' && m.title === title ? [m.text] : []))
}

const BAD = /NaN|undefined|Infinity/

/** Every string the menu can show for this company, read once (rows, hints, defaults and previews). */
function everyString(g: GameState, a: Asset): string[] {
  const out: string[] = []
  const menu = menuOf(g, a)
  out.push(subtitleOf(g, menu), menu.header?.(g) ?? '')
  for (const n of menu.children(g)) {
    if (n.type === 'info') out.push(typeof n.text === 'function' ? n.text(g) : n.text)
    if (n.type === 'action') {
      out.push(subtitleOf(g, n), n.hint?.(g) ?? '', n.disabledReason?.(g) ?? '', n.confirm?.(g) ?? '')
      const input = n.input
      if (input) {
        out.push(input.label, input.defaultValue?.(g) ?? '')
        for (let v = input.min ?? 0; v <= (input.max ?? 0); v += (input.step ?? 1) * 3) out.push(input.preview?.(g, v) ?? '')
      }
    }
  }
  return out
}

function hired(b: BizState): void {
  b.ceo = 'manager'
  b.manager = { firstName: 'Pat', lastName: 'Lee', gender: 'female', skill: 90, salary: 200_000, since: 2024, style: 'steady', integrity: 100 }
}

describe('the Yearly Dividend menu', () => {
  it('sits in Money after the manual dividend', () => {
    const g = founder()
    const { a } = rich(g)
    const ids = businessView(g, a).map((n) => n.id)
    const manual = ids.indexOf(`biz.dividend.${a.id}`)
    const rule = ids.indexOf(`biz.divpolicy.${a.id}`)
    const rescue = ids.indexOf(`biz.rescue.${a.id}`)
    expect(manual).toBeGreaterThanOrEqual(0)
    expect(rule).toBeGreaterThan(manual)
    expect(rescue).toBeGreaterThan(rule)
    const menu = menuOf(g, a)
    expect(menu.label).toBe('Yearly Dividend')
    expect(menu.visible?.(g) ?? true).toBe(true)
  })

  it('is absent for a division', () => {
    const g = founder()
    const { members } = listedGroup(g, 'us', 0.7)
    for (const m of members) {
      const node = menuOf(g, m)
      expect(node.visible?.(g)).toBe(false)
    }
    const alone = founder()
    const { a } = rich(alone)
    expect(menuOf(alone, a).visible?.(alone)).toBe(true)
  })

  it('is hidden when the company is gone', () => {
    const g = founder()
    const { a } = rich(g)
    const node = menuOf(g, a)
    g.assets = g.assets.filter((x) => x.id !== a.id)
    expect(node.visible?.(g)).toBe(false)
    expect(node.children(g)).toEqual([])
  })

  it('renders from a frozen state', () => {
    const cases: { name: string; make: () => { g: GameState; a: Asset } }[] = [
      { name: 'owner-run, no rule', make: () => { const g = founder(); const { a } = rich(g); return { g, a } } },
      { name: 'owner-run, with a rule and a last payment', make: () => { const g = founder(); const { a } = rich(g, { mode: 'profit', pct: 0.4, keep: 6, last: { year: 2025, paid: 2e6, mine: 2e6, perShare: 0 } }); return { g, a } } },
      { name: 'a board and a rule', make: () => { const g = founder(); const { a, b } = rich(g, { mode: 'cash', pct: 0.5, keep: 1 }); b.share = 0.6; boardOf(b).limits.reserve = 6; refreshValue(a, b); return { g, a } } },
      { name: 'a hired CEO and a rule', make: () => { const g = founder(); const { a, b } = rich(g, { mode: 'cash', pct: 0.5, keep: 3 }); hired(b); return { g, a } } },
      { name: 'a listed company', make: () => { const g = founder(); const { a, b } = listed(g, { marketCap: 5e9, sharesOut: 1e8, share: 0.6 }); b.cash = 200e6; books(g, b, 50e6); b.dividend = { mode: 'cash', pct: 0.5, keep: 3, last: { year: 2025, paid: 5e6, mine: 3e6, perShare: 0.05 } }; return { g, a } } },
      { name: 'a loss year', make: () => { const g = founder(); const { a, b } = rich(g, { mode: 'profit', pct: 0.5, keep: 3 }); books(g, b, -2e6); return { g, a } } },
    ]
    for (const c of cases) {
      const { g, a } = c.make()
      deepFreeze(g)
      const seen = everyString(g, a)
      expect(seen.length, c.name).toBeGreaterThan(5)
      for (const s of seen) expect(s, `${c.name}: ${s}`).not.toMatch(BAD)
    }
  })

  it('subtitles', () => {
    const g = founder()
    const { a, b } = rich(g)
    expect(subtitleOf(g, menuOf(g, a))).toBe(OFF_LINE)
    b.dividend = { mode: 'profit', pct: 0.3, keep: 3 }
    expect(subtitleOf(g, menuOf(g, a))).toBe("30% of each year's profit, keeping 3 months of costs.")
    b.dividend = { mode: 'cash', pct: 0.5, keep: 1 }
    expect(subtitleOf(g, menuOf(g, a))).toBe('50% of spare cash each year, keeping 1 month of costs.')
    expect(menuOf(g, a).header?.(g)).toBe(`${a.name} pays its shareholders at each year end by this rule. Your share is taxed as income. Loans and the cash floor come first.`)
  })

  it('the rows come in order and the actions have their labels', () => {
    const g = founder()
    const { a } = rich(g, { mode: 'profit', pct: 0.3, keep: 3, last: { year: 2025, paid: 2e6, mine: 2e6, perShare: 0 } })
    const kids = menuOf(g, a).children(g)
    expect(kids.map((n) => n.id)).toEqual([
      `biz.divpolicy.last.${a.id}`,
      `biz.divpolicy.profit.${a.id}`,
      `biz.divpolicy.cash.${a.id}`,
      `biz.divpolicy.keep.${a.id}`,
      `biz.divpolicy.off.${a.id}`,
    ])
    expect(action(g, a, 'profit').label).toBe('Share of Profit')
    expect(subtitleOf(g, action(g, a, 'profit'))).toBe("Pay a share of each year's profit")
    expect(action(g, a, 'cash').label).toBe('Share of Spare Cash')
    expect(subtitleOf(g, action(g, a, 'cash'))).toBe("Spare cash is what's left above loans and the floor")
    expect(action(g, a, 'keep').label).toBe('Cash to Keep')
    expect(action(g, a, 'off').label).toBe('Turn Off')
    expect(subtitleOf(g, action(g, a, 'off'))).toBe('Back to paying yourself by hand')
  })

  it('the sliders have the right bounds', () => {
    const g = founder()
    const { a } = rich(g)
    for (const key of ['profit', 'cash'] as const) {
      const input = action(g, a, key).input
      expect(input?.kind).toBe('slider')
      expect(input?.min).toBe(5)
      expect(input?.max).toBe(100)
      expect(input?.step).toBe(5)
      expect(input?.unit).toBe('%')
      expect(input?.money).toBeUndefined()
    }
    expect(action(g, a, 'profit').input?.label).toBe("Share of the year's profit")
    expect(action(g, a, 'cash').input?.label).toBe('Share of spare cash')
    const keep = action(g, a, 'keep').input
    expect(keep?.kind).toBe('slider')
    expect(keep?.min).toBe(0)
    expect(keep?.max).toBe(24)
    expect(keep?.step).toBe(1)
    expect(keep?.unit).toBe(' months')
    expect(keep?.money).toBeUndefined()
    expect(keep?.label).toBe('Months of costs to keep in the company')
  })

  it('the sliders open on the rule', () => {
    const g = founder()
    const { a, b } = rich(g)
    expect(action(g, a, 'profit').input?.defaultValue?.(g)).toBe('30')
    expect(action(g, a, 'cash').input?.defaultValue?.(g)).toBe('30')
    expect(action(g, a, 'keep').input?.defaultValue?.(g)).toBe('3')
    b.dividend = { mode: 'cash', pct: 0.55, keep: 8 }
    expect(action(g, a, 'profit').input?.defaultValue?.(g)).toBe('30')
    expect(action(g, a, 'cash').input?.defaultValue?.(g)).toBe('55')
    expect(action(g, a, 'keep').input?.defaultValue?.(g)).toBe('8')
    b.dividend = { mode: 'profit', pct: 0.2, keep: 0 }
    expect(action(g, a, 'profit').input?.defaultValue?.(g)).toBe('20')
    expect(action(g, a, 'keep').input?.defaultValue?.(g)).toBe('0')
  })

  it('runs write the rule', () => {
    const g = founder()
    const { a } = rich(g)
    action(g, a, 'profit').run(g, '30')
    expect(bizOf(g, a).dividend).toEqual({ mode: 'profit', pct: 0.3, keep: 3 })
    expect(titled(g, 'Yearly Dividend Set')).toEqual(["Quiet Co will pay 30% of each year's profit at year end, keeping 3 months of costs."])
    g.queue = []
    action(g, a, 'cash').run(g, '50')
    expect(bizOf(g, a).dividend).toEqual({ mode: 'cash', pct: 0.5, keep: 3 })
    expect(titled(g, 'Yearly Dividend Set')).toEqual(['Quiet Co will pay 50% of its spare cash at year end, keeping 3 months of costs.'])
    g.queue = []
    action(g, a, 'keep').run(g, '6')
    expect(bizOf(g, a).dividend).toEqual({ mode: 'cash', pct: 0.5, keep: 6 })
    expect(titled(g, 'Cash to Keep Set')).toEqual([`Quiet Co keeps at least ${money(dividendFloor(g, a, bizOf(g, a), 6))} in the company before it pays a dividend.`])
    g.queue = []
    action(g, a, 'off').run(g)
    expect('dividend' in bizOf(g, a)).toBe(false)
    expect(titled(g, 'Yearly Dividend Off')).toEqual(["Quiet Co won't pay a yearly dividend. You can still pay one by hand."])
    expect(g.queue.every((m) => m.kind !== 'notice' || m.tone === undefined || m.tone === 'neutral')).toBe(true)
  })

  it('a rule change keeps the last payment and the other settings', () => {
    const g = founder()
    const last = { year: 2025, paid: 2e6, mine: 2e6, perShare: 0 }
    const { a } = rich(g, { mode: 'profit', pct: 0.4, keep: 9, last })
    action(g, a, 'cash').run(g, '25')
    expect(bizOf(g, a).dividend).toEqual({ mode: 'cash', pct: 0.25, keep: 9, last })
    action(g, a, 'keep').run(g, '2')
    expect(bizOf(g, a).dividend).toEqual({ mode: 'cash', pct: 0.25, keep: 2, last })
  })

  it('ignores garbage and clamps', () => {
    const g = founder()
    const { a } = rich(g)
    const before = JSON.stringify(g)
    for (const bad of ['abc', '', '1e999', '  ', 'NaN', undefined]) {
      action(g, a, 'profit').run(g, bad)
      action(g, a, 'cash').run(g, bad)
    }
    expect(JSON.stringify(g)).toBe(before)
    action(g, a, 'profit').run(g, '250')
    expect(bizOf(g, a).dividend?.pct).toBe(1)
    action(g, a, 'profit').run(g, '-5')
    expect(bizOf(g, a).dividend?.pct).toBe(0.05)
    action(g, a, 'keep').run(g, '99')
    expect(bizOf(g, a).dividend?.keep).toBe(24)
    const after = JSON.stringify(g)
    for (const bad of ['abc', '', '1e999', '-1e999', 'NaN']) action(g, a, 'keep').run(g, bad)
    expect(JSON.stringify(g)).toBe(after)
  })

  it("is blocked when you can't manage", () => {
    const made = (): { g: GameState; a: Asset } => { const g = founder(); const { a } = rich(g, { mode: 'profit', pct: 0.3, keep: 3 }); return { g, a } }
    const cases: { name: string; make: () => { g: GameState; a: Asset } }[] = [
      { name: 'prison', make: () => { const x = made(); x.g.character.prison = { name: 'State Pen', security: 'medium', crime: 'Theft', sentenceYears: 2, yearsServed: 0, respect: 20, appealed: false, escapeAttempts: 0 }; return x } },
      { name: 'age 17', make: () => { const x = made(); x.g.character.age = 17; return x } },
    ]
    for (const c of cases) {
      const { g, a } = c.make()
      const why = manageBlock(g, a)
      expect(why, c.name).toBeTruthy()
      const before = JSON.stringify(g)
      for (const key of ['profit', 'cash', 'keep', 'off'] as const) {
        const n = action(g, a, key)
        expect(n.disabledReason?.(g), `${c.name} ${key}`).toBe(why)
        n.run(g, '70')
      }
      expect(JSON.stringify(g), c.name).toBe(before)
    }
  })

  it('without a rule, Cash to Keep waits and Turn Off hides', () => {
    const g = founder()
    const { a } = rich(g)
    const keep = action(g, a, 'keep')
    expect(keep.disabledReason?.(g)).toBe('Set a share first.')
    expect(subtitleOf(g, keep)).toBe('Set a share first.')
    expect(action(g, a, 'off').visible?.(g)).toBe(false)
    const before = JSON.stringify(g)
    keep.run(g, '6')
    expect(JSON.stringify(g)).toBe(before)
    expect(action(g, a, 'profit').disabledReason?.(g)).toBeNull()
    expect(action(g, a, 'cash').disabledReason?.(g)).toBeNull()
    action(g, a, 'profit').run(g, '30')
    expect(action(g, a, 'keep').disabledReason?.(g)).toBeNull()
    expect(subtitleOf(g, action(g, a, 'keep'))).toBe(`3 months of costs: ${money(3e6)}`)
    expect(action(g, a, 'off').visible?.(g)).toBe(true)
  })

  it('Turn Off with no rule left does nothing (a stale row)', () => {
    const g = founder()
    const { a } = rich(g, { mode: 'cash', pct: 0.5, keep: 3 })
    const off = action(g, a, 'off')
    off.run(g)
    expect(titled(g, 'Yearly Dividend Off')).toHaveLength(1)
    g.queue = []
    off.run(g)
    expect(g.queue).toEqual([])
    expect('dividend' in bizOf(g, a)).toBe(false)
  })

  it('a division ignores every run', () => {
    const g = founder()
    const { members } = listedGroup(g, 'us', 0.7)
    const m = members[0]
    const before = JSON.stringify(g)
    for (const key of ['profit', 'cash', 'keep', 'off'] as const) action(g, m, key).run(g, '40')
    expect(JSON.stringify(g)).toBe(before)
    expect('dividend' in readBiz(g, m)).toBe(false)
  })

  it('a run after the company is gone does nothing', () => {
    const g = founder()
    const { a } = rich(g)
    const n = action(g, a, 'profit')
    g.assets = g.assets.filter((x) => x.id !== a.id)
    const before = JSON.stringify(g)
    expect(() => n.run(g, '30')).not.toThrow()
    expect(JSON.stringify(g)).toBe(before)
  })

  it('previews are pure and finite', () => {
    const g = founder()
    const { a, b } = rich(g, { mode: 'profit', pct: 0.3, keep: 3 })
    const before = JSON.stringify(g)
    const rng = JSON.stringify(g.rng)
    for (const key of ['profit', 'cash', 'keep'] as const) {
      const input = action(g, a, key).input
      const hi = input?.max ?? 0
      for (let v = input?.min ?? 0; v <= hi; v += input?.step ?? 1) {
        const text = input?.preview?.(g, v) ?? ''
        expect(text.length).toBeGreaterThan(0)
        expect(text).not.toMatch(BAD)
      }
      for (const odd of [Number.NaN, Infinity, -Infinity, -7, 1e30]) expect(input?.preview?.(g, odd) ?? '').not.toMatch(BAD)
    }
    expect(JSON.stringify(g)).toBe(before)
    expect(JSON.stringify(g.rng)).toBe(rng)
    // A good year says what it pays, and a loss year says nothing would be.
    expect(action(g, a, 'profit').input?.preview?.(g, 30)).toMatch(/taxed as income/)
    expect(action(g, a, 'cash').input?.preview?.(g, 30)).toMatch(/stays in the company/)
    books(g, b, -1e6)
    expect(action(g, a, 'profit').input?.preview?.(g, 30)).toMatch(/^Nothing would be paid now\. It made no profit\.$/)
    expect(action(g, a, 'cash').input?.preview?.(g, 30)).toMatch(/taxed as income/)
  })

  it('the preview is the same quote the year step uses', () => {
    const g = founder()
    const { a, b } = rich(g)
    const p: DividendPolicy = { mode: 'profit', pct: 0.5, keep: 3 }
    const q = dividendQuote(g, a, b, p, 4e6)
    expect(q.pay).toBe(2e6)
    expect(ruleNote(g, a, b, p)).toBe(`On last year's ${money(4e6)} profit: ${money(2e6)} paid. You get ${money(2e6)}, taxed as income. ${money(8e6)} stays in the company.`)
    expect(action(g, a, 'profit').input?.preview?.(g, 50)).toBe(ruleNote(g, a, b, p))
    const c: DividendPolicy = { mode: 'cash', pct: 0.5, keep: 3 }
    expect(ruleNote(g, a, b, c)).toBe(`On ${money(7e6)} of spare cash: ${money(3.5e6)} paid. You get ${money(3.5e6)}, taxed as income. ${money(6.5e6)} stays in the company.`)
    b.share = 0.6
    expect(ruleNote(g, a, b, p)).toBe(`On last year's ${money(4e6)} profit: ${money(2e6)} paid. Your ${pct(0.6)} is ${money(1.2e6)}, taxed as income. ${money(8e6)} stays in the company.`)
    // The year step pays exactly what the note said.
    b.dividend = p
    const paid = autoDividendYear(g, a, b, b.last as Statement)
    expect(paid?.kind === 'paid' ? paid.paid.paid : -1).toBe(q.pay)
  })

  it('the preview says nothing is paid when the year step would skip', () => {
    const g = founder()
    const { a, b } = rich(g)
    b.debt = 10e6
    expect(ruleNote(g, a, b, { mode: 'cash', pct: 0.5, keep: 3 })).toBe('Nothing would be paid now. Its loans come first.')
    b.debt = 0
    b.cash = 0
    expect(ruleNote(g, a, b, { mode: 'cash', pct: 0.5, keep: 3 })).toBe('Nothing would be paid now. It has no spare cash.')
    b.cash = 10e6
    b.share = 0.00012
    b.valuation = valuationOf(b)
    expect(ruleNote(g, a, b, { mode: 'profit', pct: 0.001, keep: 3 })).toBe('Nothing would be paid now. It has no spare cash.')
  })

  it('Cash to Keep previews its floor and names a higher board reserve', () => {
    const g = founder()
    const { a, b } = rich(g, { mode: 'cash', pct: 0.5, keep: 3 })
    const keep = action(g, a, 'keep')
    expect(keep.input?.preview?.(g, 6)).toBe(`Keeps at least ${money(6e6)} in the company.`)
    expect(keep.input?.preview?.(g, 0)).toBe(`Keeps at least ${money(0)} in the company.`)
    b.share = 0.6
    boardOf(b).limits.reserve = 6
    expect(action(g, a, 'keep').input?.preview?.(g, 3)).toBe(`Keeps at least ${money(6e6)} in the company. The board's reserve is higher.`)
    expect(action(g, a, 'keep').input?.preview?.(g, 6)).toBe(`Keeps at least ${money(6e6)} in the company.`)
    expect(action(g, a, 'keep').input?.preview?.(g, 12)).toBe(`Keeps at least ${money(12e6)} in the company.`)
  })

  it('the info rows say what applies', () => {
    const g = founder()
    const { a, b } = rich(g)
    expect(infoTexts(g, menuOf(g, a).children(g))).toEqual([])
    // A board: its reserve in months.
    b.share = 0.6
    boardOf(b).limits.reserve = 4
    const board = infoTexts(g, menuOf(g, a).children(g))
    expect(board).toEqual(["The board's reserve is 4 months of costs. The rule never pays below it, and it never needs a vote."])
    boardOf(b).limits.reserve = 1
    expect(infoTexts(g, menuOf(g, a).children(g))[0]).toBe("The board's reserve is 1 month of costs. The rule never pays below it, and it never needs a vote.")
    // A hired CEO: named once a rule is set.
    b.share = 1
    hired(b)
    expect(infoTexts(g, menuOf(g, a).children(g))).toEqual([])
    b.dividend = { mode: 'cash', pct: 0.5, keep: 3 }
    expect(infoTexts(g, menuOf(g, a).children(g))).toEqual(["Pat Lee runs this company. Your rule replaces the dividends their mandate would pay."])
    // A last payment comes first.
    b.dividend = { mode: 'cash', pct: 0.5, keep: 3, last: { year: 2025, paid: 2_000_000, mine: 1_200_000, perShare: 0 } }
    const rows = infoTexts(g, menuOf(g, a).children(g))
    expect(rows[0]).toBe(`Last paid: ${money(2e6)} for 2025. Your part was ${money(1.2e6)}.`)
    expect(rows).toHaveLength(2)
    const ids = menuOf(g, a).children(g).filter((n) => n.type === 'info').map((n) => n.id)
    expect(ids).toEqual([`biz.divpolicy.last.${a.id}`, `biz.divpolicy.ceo.${a.id}`])
  })

  it('a hostile rule shows as off', () => {
    const g = founder()
    const { a, b } = rich(g)
    b.dividend = 'x' as never
    expect(subtitleOf(g, menuOf(g, a))).toBe(OFF_LINE)
    expect(() => everyString(g, a)).not.toThrow()
    b.dividend = { mode: 'weird' } as never
    expect(subtitleOf(g, menuOf(g, a))).toBe(OFF_LINE)
    expect(action(g, a, 'off').visible?.(g)).toBe(false)
    expect(action(g, a, 'keep').disabledReason?.(g)).toBe('Set a share first.')
    // Setting a share over it starts clean.
    action(g, a, 'cash').run(g, '40')
    expect(bizOf(g, a).dividend).toEqual({ mode: 'cash', pct: 0.4, keep: 3 })
  })

  it('survives the fuzz kit: every action run with odd inputs, on a frozen copy', () => {
    const cases: { name: string; actions: number; make: () => { g: GameState; a: Asset } }[] = [
      { name: 'no rule', actions: 2, make: () => { const g = founder(); const { a } = rich(g); return { g, a } } },
      { name: 'a rule and a board', actions: 4, make: () => { const g = founder(); const { a, b } = rich(g, { mode: 'profit', pct: 0.4, keep: 6, last: { year: 2025, paid: 2e6, mine: 1e6, perShare: 0 } }); b.share = 0.6; refreshValue(a, b); return { g, a } } },
    ]
    for (const c of cases) {
      const { g, a } = c.make()
      const log = new FailureLog()
      const ran = probeActions(g, log, 3, { depth: 1, max: 50, roots: (s) => menuOf(s, a).children(s) })
      expect(ran, c.name).toBe(c.actions)
      expect(log.list().map((f) => f.first.message), c.name).toEqual([])
    }
  }, 60_000)

  it('exports a menu builder that needs only the asset', () => {
    const g = founder()
    const { a } = rich(g)
    const direct = dividendMenu(a)
    expect(direct.id).toBe(`biz.divpolicy.${a.id}`)
    expect(direct.emoji).toBe('\u{1F4E4}')
    expect(subtitleOf(g, direct)).toBe(OFF_LINE)
  })
})
