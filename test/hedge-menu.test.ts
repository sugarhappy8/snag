// The Hedge Funds menus: the Investments row, the Personal and Family fund screens, the relatives'
// screen and the company cash-at-work screen. The file imports the business module because that is how
// the app registers the provider with Investments. Menus are pure reads: every test that renders also
// renders from a deep-frozen copy and checks that nothing in the state or the random stream moved.
import { describe, expect, it } from 'vitest'
import '../src/game/business'
import { becomeCeo, installManager, managerCandidate } from '../src/game/business/career'
import { hedgeBlock, quantBlock, STRATEGIES } from '../src/game/business/fund-model'
import { callHint } from '../src/game/business/fund-events'
import { signed } from '../src/game/business/fund-text'
import { manageBlock } from '../src/game/business/gate'
import { companyBlock, companyQuote, eligibleCompanies, setCompanyFund } from '../src/game/business/hedge-company'
import { candidates, fundOf, fundsOf, invite, putIn, startBlock, startFund, takeQuote } from '../src/game/business/hedge-fund'
import { companyFundNode, fundSubtitle, fundView, hedgeRow } from '../src/game/business/hedge-menu'
import { macroBlock, personBlock, seedMin } from '../src/game/business/hedge-model'
import { readCompanyHedge, readHedge, RUNNING_COST, unitsValue } from '../src/game/business/hedge-record'
import { bizOf, findBusiness, readBiz } from '../src/game/business/state'
import { money, pct } from '../src/game/business/util'
import { formatMoney, netWorth, relationLabel, shortMoney } from '../src/game/core'
import { investmentAssetSubtitle, investmentAssetView, investmentHoldings, investmentListing, investmentsMenu, minTrade, registerHedgeFunds } from '../src/game/investments'
import { assetsMenu } from '../src/game/menus'
import type { Asset, GameState, MenuAction, MenuGroup, MenuInfo, MenuNode } from '../src/game/types'
import { company, kin, rich } from './hedge-kit'
import { newLeader } from './politics-kit'

function deepFreeze<T>(v: T): T {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v)
    for (const x of Object.values(v as object)) deepFreeze(x)
  }
  return v
}

const NOTE = "While you don't run it, its strategy is picked for you."
const BAD_TEXT = /\bNaN\b|\bundefined\b|\bnull\b|\[object Object\]|-?Infinity/

function textOf(g: GameState, n: MenuInfo): string {
  return typeof n.text === 'string' ? n.text : n.text(g)
}

function subtitleOf(g: GameState, n: MenuNode): string {
  if (n.type !== 'menu' && n.type !== 'action') return ''
  return typeof n.subtitle === 'function' ? n.subtitle(g) : (n.subtitle ?? '')
}

function ids(nodes: MenuNode[]): string[] {
  return nodes.map((n) => n.id)
}

function infos(g: GameState, nodes: MenuNode[]): string[] {
  return nodes.filter((n): n is MenuInfo => n.type === 'info').map((n) => textOf(g, n))
}

function find(nodes: MenuNode[], id: string): MenuNode {
  const n = nodes.find((x) => x.id === id)
  if (!n) throw new Error(`no node ${id} in ${ids(nodes).join(', ')}`)
  return n
}

function action(nodes: MenuNode[], id: string): MenuAction {
  const n = find(nodes, id)
  if (n.type !== 'action') throw new Error(`${id} is not an action`)
  return n
}

function menu(nodes: MenuNode[], id: string): MenuGroup {
  const n = find(nodes, id)
  if (n.type !== 'menu') throw new Error(`${id} is not a menu`)
  return n
}

function rowOf(g: GameState): MenuGroup {
  return menu(investmentsMenu.children(g), 'inv-hedge')
}

function yours(g: GameState): MenuNode[] {
  return rowOf(g).children(g)
}

/** The screen of a fund, read the way the app reads it from Investments. */
function screenOf(g: GameState, a: Asset): MenuNode[] {
  return menu(yours(g), `inv-hedge-${a.id}`).children(g)
}

function coScreen(g: GameState, a: Asset): MenuNode[] {
  return menu(yours(g), `inv-hedge-co-${a.id}`).children(g)
}

/** Every string a node tree shows, and every input's preview at its low end, middle and high end. Never runs an action. */
function walk(g: GameState, nodes: MenuNode[], depth = 0): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const n of nodes) {
    expect(seen.has(n.id), `duplicate id ${n.id}`).toBe(false)
    seen.add(n.id)
    if (n.type === 'info') out.push(textOf(g, n))
    else if (n.type === 'heading') out.push(n.label)
    else {
      out.push(n.label, subtitleOf(g, n))
      n.visible?.(g)
      const why = n.disabledReason?.(g)
      if (why) out.push(why)
      const hint = n.hint?.(g)
      if (hint) out.push(hint)
      if (n.type === 'menu') {
        const header = n.header?.(g)
        if (header) out.push(header)
        if (depth < 6) out.push(...walk(g, n.children(g), depth + 1))
      } else {
        const confirm = n.confirm?.(g)
        if (confirm) out.push(confirm)
        const input = n.input
        if (input) {
          out.push(input.label)
          const def = input.defaultValue?.(g)
          if (def !== undefined) out.push(def)
          const lo = input.min ?? 0
          const hi = input.max ?? lo
          for (const v of [lo, Math.round((lo + hi) / 2), hi]) {
            const p = input.preview?.(g, v)
            if (p) out.push(p)
          }
        }
      }
    }
  }
  return out
}

/** A player with a Personal fund, a Family fund holding a sister, and a company with cash at work. */
function world(seed = 71): { g: GameState; person: Asset; family: Asset; sister: ReturnType<typeof kin>; co: Asset } {
  const g = rich(seed, 'us', 8_000_000)
  const sister = kin(g, 'sibling', 3_000_000)
  expect(startFund(g, 'person', 1_000_000)).toBe(true)
  expect(startFund(g, 'family', 1_000_000)).toBe(true)
  const family = fundOf(g, 'family')!
  expect(invite(g, family.a.id, sister.id)).toBe(true)
  const c = company(g, { cash: 20_000_000 })
  c.b.founded = g.year - 8
  expect(setCompanyFund(g, c.a.id, { target: 2_000_000 })).toBe(true)
  return { g, person: fundOf(g, 'person')!.a, family: fundOf(g, 'family')!.a, sister, co: c.a }
}

describe('rendering', () => {
  it('renders from a frozen state without touching it', () => {
    const { g } = world()
    g.character.talent = 'Investing'
    const json = JSON.stringify(g)
    const rng = g.rng
    const nextId = g.nextId
    deepFreeze(g)
    const text = walk(g, [rowOf(g)])
    expect(text.length).toBeGreaterThan(60)
    expect(text.filter((t) => BAD_TEXT.test(t))).toEqual([])
    expect(JSON.stringify(g)).toBe(json)
    expect(g.rng).toBe(rng)
    expect(g.nextId).toBe(nextId)
  })

  it('renders funds in gain and in loss from a frozen state, taxes included', () => {
    for (const factor of [1.6, 0.4]) {
      const { g, person, family } = world()
      for (const a of [person, family]) {
        const f = readHedge(a.details.hf)!
        f.nav *= factor
        f.last = { year: 2026, gross: factor - 1, net: factor - 1, market: 0.05 }
        ;(a.details as Record<string, unknown>).hf = JSON.parse(JSON.stringify(f))
        a.value = Math.round(unitsValue(f, f.mine))
      }
      g.flags.investLossCarry = 50_000
      g.flags.taxableIncome = 120_000
      const taxed = takeQuote(g, readHedge(person.details.hf)!, 0.5).tax
      expect(factor > 1 ? taxed > 0 : taxed === 0).toBe(true)
      const json = JSON.stringify(g)
      deepFreeze(g)
      const text = walk(g, [rowOf(g)])
      expect(text.filter((t) => BAD_TEXT.test(t))).toEqual([])
      expect(text.some((t) => /before .+ tax\./.test(t))).toBe(true)
      expect(JSON.stringify(g)).toBe(json)
    }
  })

  it('renders the same for a game with no fund and no company', () => {
    const g = rich(72)
    deepFreeze(g)
    const text = walk(g, [rowOf(g)])
    expect(text.filter((t) => BAD_TEXT.test(t))).toEqual([])
  })

  it('shows no NaN or undefined for hostile records', () => {
    const { g, person, family, co } = world()
    const hostile: unknown[] = [null, 7, 'x', [], {}, { v: 2 }, { v: 1, owner: 'company' }]
    for (const raw of hostile) {
      ;(person.details as Record<string, unknown>).hf = raw
      ;(family.details as Record<string, unknown>).hf = raw
      ;(co.details as Record<string, unknown>).hedge = raw
      const copy = deepFreeze(structuredClone(g))
      const text = walk(copy, [rowOf(copy)])
      expect(text.filter((t) => BAD_TEXT.test(t)), JSON.stringify(raw)).toEqual([])
      expect(() => fundView(copy, person)).not.toThrow()
      expect(() => fundSubtitle(copy, person)).not.toThrow()
    }
  })

  it('shows no NaN or undefined for damaged numbers in a good record', () => {
    const { g, person, family, co } = world()
    const bad = (a: Asset, key: string, v: unknown) => {
      const hf = a.details.hf as Record<string, unknown>
      hf[key] = v
    }
    for (const key of ['nav', 'units', 'mine', 'cost']) for (const v of [-5, 1e30]) {
      bad(person, key, v)
      bad(family, key, v)
    }
    ;(co.details as Record<string, unknown>).hedge = { v: 1, target: 1e30, strategy: 'moon', call: 7, lev: 9, total: -1e30, last: { year: 2025, work: -4, gross: 1e9, net: 'x', market: 0, pnl: 0 } }
    const copy = deepFreeze(structuredClone(g))
    const text = walk(copy, [rowOf(copy)])
    expect(text.filter((t) => BAD_TEXT.test(t))).toEqual([])
  })
})

describe('the row', () => {
  it('is absent for a 17-year-old and for the dead', () => {
    const young = rich(73)
    young.character.age = 17
    expect(hedgeRow(young)).toBeNull()
    expect(ids(investmentsMenu.children(young))).not.toContain('inv-hedge')
    const dead = rich(74)
    dead.character.alive = false
    expect(hedgeRow(dead)).toBeNull()
  })

  it('is there for an adult and disabled before 1949 with the invention text', () => {
    const g = rich(75)
    const row = rowOf(g)
    expect(row).toMatchObject({ id: 'inv-hedge', label: 'Hedge Funds', emoji: '🦈' })
    expect(row.disabledReason?.(g) ?? null).toBeNull()
    const early = rich(75, 'us', 5_000_000, 1948)
    expect(rowOf(early).disabledReason?.(early)).toBe(hedgeBlock(1948))
  })

  it('is disabled from prison and while dead-broke of a market', () => {
    const g = rich(76)
    g.character.prison = { name: 'State Pen', security: 'medium', crime: 'Theft', sentenceYears: 2, yearsServed: 0, respect: 20, appealed: false, escapeAttempts: 0 }
    expect(rowOf(g).disabledReason?.(g)).toBe(personBlock(g))
    expect(personBlock(g)).toBe("You can't run a fund from prison.")
  })

  it('sits right after Crypto, and adds nothing else to Investments', () => {
    const g = rich(77)
    const withRow = ids(investmentsMenu.children(g))
    const i = withRow.indexOf('inv-crypto')
    expect(i).toBeGreaterThan(0)
    expect(withRow[i + 1]).toBe('inv-hedge')
    registerHedgeFunds({ row: () => null, view: fundView, subtitle: fundSubtitle })
    try {
      const without = ids(investmentsMenu.children(g))
      expect(without).not.toContain('inv-hedge')
      expect(withRow).toEqual([...without.slice(0, i + 1), 'inv-hedge', ...without.slice(i + 1)])
    } finally {
      registerHedgeFunds({ row: hedgeRow, view: fundView, subtitle: fundSubtitle })
    }
  })

  it('says what it is, and counts funds and cash at work', () => {
    const g = rich(78)
    const row = rowOf(g)
    expect(subtitleOf(g, row)).toBe('Personal, family and company funds')
    expect(row.header?.(g)).toBe(`Funds you run pay no fee, only ${pct(RUNNING_COST, 1)} a year to run. A Macro call lasts one year.`)
    const { g: h, person, family } = world()
    const sub = subtitleOf(h, rowOf(h))
    expect(sub).toBe(`3 funds · ${shortMoney(person.value + family.value)}`)
    const only = rich(79)
    const c = company(only, { cash: 20_000_000 })
    c.b.founded = only.year - 8
    expect(setCompanyFund(only, c.a.id, { target: 1_000_000 })).toBe(true)
    expect(subtitleOf(only, rowOf(only))).toBe('1 fund')
    expect(startFund(only, 'person', 1_000_000)).toBe(true)
    expect(subtitleOf(only, rowOf(only))).toBe(`2 funds · ${shortMoney(fundOf(only, 'person')!.a.value)}`)
  })

  it('lists Your Funds then Company Funds, with an info row when no company can run one', () => {
    const g = rich(80)
    const nodes = yours(g)
    expect(ids(nodes)).toEqual(['hf-h-yours', 'hf-start-person', 'hf-start-family', 'hf-h-co', expect.any(String)])
    expect(find(nodes, 'hf-h-yours')).toMatchObject({ type: 'heading', label: 'Your Funds' })
    expect(find(nodes, 'hf-h-co')).toMatchObject({ type: 'heading', label: 'Company Funds' })
    expect(infos(g, nodes)).toEqual(['None of your companies can run a fund yet.'])
  })
})

describe('start actions', () => {
  it('have finite bounds, a quarter default and a preview that says what you own', () => {
    for (const owner of ['person', 'family'] as const) {
      const g = rich(81)
      const a = action(yours(g), `hf-start-${owner}`)
      expect(a).toMatchObject({ label: owner === 'person' ? 'Start a Personal Fund' : 'Start a Family Fund', emoji: '🦈', stayOpen: true })
      expect(subtitleOf(g, a)).toBe(`From ${money(seedMin(g))} · you run it`)
      const input = a.input!
      expect(input).toMatchObject({ kind: 'slider', money: true, roundDefault: true })
      expect(input.label).toBe(`How much goes in? You have ${formatMoney(g.character.money)}.`)
      expect(input.min).toBe(seedMin(g))
      expect(input.max).toBe(Math.floor(g.character.money))
      expect(Number.isFinite(input.min!) && Number.isFinite(input.max!) && input.min! <= input.max!).toBe(true)
      const def = Number(input.defaultValue!(g))
      expect(def).toBeGreaterThanOrEqual(input.min!)
      expect(def).toBeLessThanOrEqual(input.max!)
      expect(def).toBeCloseTo(input.min! + (input.max! - input.min!) / 4, -1)
      const preview = input.preview!(g, 1_000_000)
      expect(preview).toBe(owner === 'person' ? `${money(1_000_000)} goes in. You own all of it.` : `${money(1_000_000)} goes in. Relatives can join later.`)
      if (owner === 'person') expect(preview).toContain('You own all of it.')
    }
  })

  it('run opens the fund, and the node then shows the fund instead of the action', () => {
    const g = rich(82)
    const cash = g.character.money
    const a = action(yours(g), 'hf-start-person')
    expect(a.disabledReason?.(g) ?? null).toBeNull()
    a.run(g, '1000000')
    const row = fundOf(g, 'person')!
    expect(row.a.value).toBe(1_000_000)
    expect(g.character.money).toBe(cash - 1_000_000)
    const after = yours(g)
    expect(ids(after)).not.toContain('hf-start-person')
    expect(ids(after)).toContain(`inv-hedge-${row.a.id}`)
    expect(ids(after)).toContain('hf-start-family')
    const node = menu(after, `inv-hedge-${row.a.id}`)
    expect(node).toMatchObject({ label: row.a.name, emoji: '🦈' })
    expect(subtitleOf(g, node)).toBe(fundSubtitle(g, row.a))
  })

  it('are disabled with the start reason, or for a lack of cash', () => {
    const g = rich(83)
    expect(startFund(g, 'person', 500_000)).toBe(true)
    // The node is the fund now, so there is no second personal start.
    expect(ids(yours(g))).not.toContain('hf-start-person')
    expect(startBlock(g, 'person')).toBe('You already have a personal fund.')
    const broke = rich(83, 'us', 1_000)
    for (const owner of ['person', 'family'] as const) {
      const a = action(yours(broke), `hf-start-${owner}`)
      expect(a.disabledReason?.(broke)).toBe(`You need ${money(seedMin(broke))} in the bank.`)
      expect(a.input!.max).toBeGreaterThanOrEqual(a.input!.min!)
    }
    const early = rich(83, 'us', 5_000_000, 1948)
    expect(action(yours(early), 'hf-start-person').disabledReason?.(early)).toBe(startBlock(early, 'person'))
    const prisoner = rich(84)
    prisoner.character.prison = { name: 'State Pen', security: 'medium', crime: 'Theft', sentenceYears: 2, yearsServed: 0, respect: 20, appealed: false, escapeAttempts: 0 }
    expect(action(yours(prisoner), 'hf-start-family').disabledReason?.(prisoner)).toBe("You can't run a fund from prison.")
  })

  it('a hostile slider value starts nothing', () => {
    const g = rich(85)
    const cash = g.character.money
    const a = action(yours(g), 'hf-start-person')
    for (const input of ['NaN', 'abc', '', '-5', '1', 'Infinity', undefined]) a.run(g, input)
    expect(g.assets).toHaveLength(0)
    expect(g.character.money).toBe(cash)
  })
})

describe('the fund screen', () => {
  it('has the three info rows', () => {
    const { g, person, family } = world()
    const p = infos(g, screenOf(g, person))
    expect(p[0]).toBe(`Your share: ${money(1_000_000)}`)
    expect(p[1]).toBe('Strategy: Long/Short')
    expect(p[2]).toBe('No year booked yet.')
    const f = readHedge(family.details.hf)!
    const q = infos(g, screenOf(g, family))
    expect(q[0]).toBe(`Your share: ${money(1_000_000)} of ${money(f.nav)} (${pct(f.mine / f.units, 1)})`)
    expect(ids(screenOf(g, person)).slice(0, 3)).toEqual([`hf-${person.id}-i0`, `hf-${person.id}-i1`, `hf-${person.id}-i2`])
  })

  it('shows the last booked year against the market', () => {
    const { g, person } = world()
    const f = readHedge(person.details.hf)!
    f.last = { year: 2026, gross: 0.07, net: 0.0645, market: 0.12 }
    ;(person.details as Record<string, unknown>).hf = JSON.parse(JSON.stringify(f))
    expect(infos(g, screenOf(g, person))[2]).toBe(`2026: fund ${signed(0.0645)}, market ${signed(0.12)}.`)
    f.last = { year: 2026, gross: -0.1, net: -0.1, market: -0.2 }
    ;(person.details as Record<string, unknown>).hf = JSON.parse(JSON.stringify(f))
    expect(infos(g, screenOf(g, person))[2]).toBe(`2026: fund ${signed(-0.1)}, market ${signed(-0.2)}.`)
  })

  it('has every action with its id, and Macro adds its row', () => {
    const { g, person, family } = world()
    const p = screenOf(g, person)
    for (const id of [`hf-put-${person.id}`, `hf-take-${person.id}`, `hf-strategy-${person.id}`, `hf-call-${person.id}`, `hf-close-${person.id}`]) expect(ids(p)).toContain(id)
    expect(ids(p)).not.toContain(`hf-family-${person.id}`)
    expect(ids(p)).not.toContain(`hf-lev-${person.id}`)
    const q = screenOf(g, family)
    expect(ids(q)).toContain(`hf-family-${family.id}`)
    expect(action(p, `hf-put-${person.id}`)).toMatchObject({ label: 'Put In More', emoji: '💵', stayOpen: true })
    expect(action(p, `hf-take-${person.id}`)).toMatchObject({ label: 'Take Out', emoji: '💸', stayOpen: true })
    expect(action(p, `hf-close-${person.id}`)).toMatchObject({ label: 'Close Fund', emoji: '🔒' })
  })

  it('Put In More has finite bounds and says what you would own', () => {
    const { g, person, family } = world()
    const put = action(screenOf(g, person), `hf-put-${person.id}`)
    expect(put.input).toMatchObject({ kind: 'slider', money: true })
    expect(put.input!.min).toBe(minTrade(g))
    expect(put.input!.max).toBe(Math.floor(g.character.money))
    expect(Number.isFinite(put.input!.min!) && Number.isFinite(put.input!.max!) && put.input!.min! <= put.input!.max!).toBe(true)
    expect(put.input!.preview!(g, 500_000)).toBe(`You'd own ${pct(1, 1)} of a ${money(1_500_000)} fund.`)
    const f = readHedge(family.details.hf)!
    const fput = action(screenOf(g, family), `hf-put-${family.id}`)
    const share = (f.mine + 500_000 / (f.nav / f.units)) / (f.units + 500_000 / (f.nav / f.units))
    expect(fput.input!.preview!(g, 500_000)).toBe(`You'd own ${pct(share, 1)} of a ${money(f.nav + 500_000)} fund.`)
    const cash = g.character.money
    put.run(g, '500000')
    expect(fundOf(g, 'person')!.a.value).toBe(1_500_000)
    expect(g.character.money).toBe(cash - 500_000)
  })

  it('Put In More is disabled without the cash and from prison', () => {
    const { g, person } = world()
    g.character.money = 1
    const put = action(screenOf(g, person), `hf-put-${person.id}`)
    expect(put.disabledReason?.(g)).toBeTruthy()
    expect(put.input!.max).toBeGreaterThanOrEqual(put.input!.min!)
    const { g: h, person: pa } = world(72)
    h.character.prison = { name: 'State Pen', security: 'medium', crime: 'Theft', sentenceYears: 2, yearsServed: 0, respect: 20, appealed: false, escapeAttempts: 0 }
    expect(action(screenOf(h, pa), `hf-take-${pa.id}`).disabledReason?.(h)).toBe("You can't run a fund from prison.")
    expect(action(screenOf(h, pa), `hf-close-${pa.id}`).disabledReason?.(h)).toBe("You can't run a fund from prison.")
  })

  it('Take Out previews the money before tax, and says when it closes the fund', () => {
    const { g, person, family } = world()
    const take = action(screenOf(g, person), `hf-take-${person.id}`)
    expect(take.input).toMatchObject({ kind: 'slider', min: 1, max: 100, unit: '%' })
    expect(take.input!.label).toBe('Percent of your share')
    expect(take.input!.defaultValue!(g)).toBe('10')
    expect(subtitleOf(g, take)).toBe('Gains are taxed when you take them out')
    const f = readHedge(person.details.hf)!
    const q = takeQuote(g, f, 0.1)
    const preview = take.input!.preview!(g, 10)
    expect(preview).toBe(`About ${money(q.gross)} before ${money(q.tax)} tax.`)
    expect(preview).not.toContain('closes')
    const all = take.input!.preview!(g, 100)
    expect(all).toContain('That closes the fund.')
    expect(all).not.toContain('Relatives get')
    const ftake = action(screenOf(g, family), `hf-take-${family.id}`)
    const ff = readHedge(family.details.hf)!
    const relatives = takeQuote(g, ff, 1).relatives
    expect(relatives).toBeGreaterThan(0)
    expect(ftake.input!.preview!(g, 100)).toBe(`About ${money(takeQuote(g, ff, 1).gross)} before ${money(takeQuote(g, ff, 1).tax)} tax. That closes the fund. Relatives get ${money(relatives)}.`)
    expect(ftake.input!.preview!(g, 10)).not.toContain('Relatives get')
  })

  it('Take Out shows the tax on a gain', () => {
    const { g, person } = world()
    const f = readHedge(person.details.hf)!
    f.nav *= 1.5
    f.last = { year: 2026, gross: 0.5, net: 0.5, market: 0.1 }
    ;(person.details as Record<string, unknown>).hf = JSON.parse(JSON.stringify(f))
    person.value = Math.round(unitsValue(f, f.mine))
    const take = action(screenOf(g, person), `hf-take-${person.id}`)
    const q = takeQuote(g, f, 0.5)
    expect(q.tax).toBeGreaterThan(0)
    expect(take.input!.preview!(g, 50)).toBe(`About ${money(q.gross)} before ${money(q.tax)} tax.`)
    const cash = g.character.money
    take.run(g, '50')
    expect(g.character.money).toBeGreaterThan(cash)
    expect(fundOf(g, 'person')).not.toBeNull()
    take.run(g, '100')
    expect(fundOf(g, 'person')).toBeNull()
  })

  it('Close Fund asks first, with what you and the relatives get', () => {
    const { g, person, family } = world()
    const close = action(screenOf(g, person), `hf-close-${person.id}`)
    const f = readHedge(person.details.hf)!
    expect(close.confirm!(g)).toBe(`Close ${person.name}? You get about ${money(takeQuote(g, f, 1).gross)} before tax.`)
    const fclose = action(screenOf(g, family), `hf-close-${family.id}`)
    const ff = readHedge(family.details.hf)!
    expect(fclose.confirm!(g)).toBe(`Close ${family.name}? You get about ${money(takeQuote(g, ff, 1).gross)} before tax. Relatives get ${money(takeQuote(g, ff, 1).relatives)}.`)
    close.run(g)
    expect(fundOf(g, 'person')).toBeNull()
  })

  it('subtitle names the value, strategy and kind', () => {
    const { g, person, family } = world()
    expect(fundSubtitle(g, person)).toBe(`${shortMoney(person.value)} · Long/Short · personal fund`)
    expect(fundSubtitle(g, family)).toBe(`${shortMoney(family.value)} · Long/Short · family fund`)
    const f = readHedge(family.details.hf)!
    f.strategy = 'event'
    ;(family.details as Record<string, unknown>).hf = JSON.parse(JSON.stringify(f))
    expect(fundSubtitle(g, family)).toBe(`${shortMoney(family.value)} · Event-driven · family fund`)
  })
})

describe('strategy and call', () => {
  it('Strategy lists the four with their blurbs, a tick and the reasons', () => {
    const { g, person } = world()
    const strategy = menu(screenOf(g, person), `hf-strategy-${person.id}`)
    expect(strategy.header?.(g)).toBe('Your strategy for next year.')
    const kids = strategy.children(g)
    expect(kids).toHaveLength(4)
    for (const s of Object.keys(STRATEGIES) as (keyof typeof STRATEGIES)[]) {
      const a = action(kids, `hf-strategy-${person.id}-${s}`)
      expect(subtitleOf(g, a)).toBe(STRATEGIES[s].blurb)
      expect(a.label).toBe(`${STRATEGIES[s].label}${s === 'longShort' ? ' ✓' : ''}`)
      expect(a.stayOpen).toBe(true)
    }
    expect(action(kids, `hf-strategy-${person.id}-longShort`).disabledReason?.(g)).toBe('Already your strategy.')
    expect(action(kids, `hf-strategy-${person.id}-event`).disabledReason?.(g) ?? null).toBeNull()
    action(kids, `hf-strategy-${person.id}-event`).run(g)
    expect(fundOf(g, 'person')!.f.strategy).toBe('event')
    const after = menu(screenOf(g, person), `hf-strategy-${person.id}`).children(g)
    expect(action(after, `hf-strategy-${person.id}-event`).label).toBe('Event-driven ✓')
    expect(action(after, `hf-strategy-${person.id}-event`).disabledReason?.(g)).toBe('Already your strategy.')
    expect(action(after, `hf-strategy-${person.id}-longShort`).label).toBe('Long/Short')
  })

  it('Quant is disabled where the firm refuses it', () => {
    const g = rich(86, 'us', 5_000_000, 1960)
    expect(startFund(g, 'person', 500_000)).toBe(true)
    const a = fundOf(g, 'person')!.a
    const kids = menu(screenOf(g, a), `hf-strategy-${a.id}`).children(g)
    expect(quantBlock('us', 1960)).toBeTruthy()
    expect(action(kids, `hf-strategy-${a.id}-quant`).disabledReason?.(g)).toBe(quantBlock('us', 1960))
    const modern = world().g
    const b = fundOf(modern, 'person')!.a
    expect(action(menu(screenOf(modern, b), `hf-strategy-${b.id}`).children(modern), `hf-strategy-${b.id}-quant`).disabledReason?.(modern) ?? null).toBeNull()
  })

  it('an official cannot pick Macro or make a call', () => {
    const g = newLeader(5)
    g.year = 2026
    g.character.money = 5_000_000
    g.character.age = 45
    expect(startFund(g, 'family', 1_000_000)).toBe(true)
    const a = fundOf(g, 'family')!.a
    const screen = screenOf(g, a)
    const macro = action(menu(screen, `hf-strategy-${a.id}`).children(g), `hf-strategy-${a.id}-macro`)
    expect(macro.disabledReason?.(g)).toBe(macroBlock(g))
    expect(macroBlock(g)).toBe("Officials can't make market calls.")
    const call = menu(screen, `hf-call-${a.id}`)
    expect(call.disabledReason?.(g)).toBe(macroBlock(g))
    for (const c of ['bull', 'bear', 'flat']) expect(action(call.children(g), `hf-call-${a.id}-${c}`).disabledReason?.(g)).toBe(macroBlock(g))
    // The other strategies are open to them.
    expect(action(menu(screen, `hf-strategy-${a.id}`).children(g), `hf-strategy-${a.id}-event`).disabledReason?.(g) ?? null).toBeNull()
  })

  it('Market Call sets Macro, labels it, and Leverage appears only while Macro', () => {
    const { g, person } = world()
    const before = menu(screenOf(g, person), `hf-call-${person.id}`)
    expect(before.label).toBe('Market Call')
    expect(subtitleOf(g, before)).toBe('One view on next year, then back to Long/Short')
    expect(ids(screenOf(g, person))).not.toContain(`hf-lev-${person.id}`)
    const bull = action(before.children(g), `hf-call-${person.id}-bull`)
    expect(bull.stayOpen).toBe(true)
    bull.run(g)
    expect(fundOf(g, 'person')!.f).toMatchObject({ strategy: 'macro', call: 'bull', lev: 1 })
    const screen = screenOf(g, person)
    const call = menu(screen, `hf-call-${person.id}`)
    expect(call.label).toBe('Market Call: 📈 Bull')
    expect(infos(g, screen)[1]).toBe('Strategy: Global Macro · Bull at 1x')
    expect(action(call.children(g), `hf-call-${person.id}-bull`).label).toBe('Bull ✓')
    expect(action(call.children(g), `hf-call-${person.id}-bear`).label).toBe('Bear')
    const lev = action(screen, `hf-lev-${person.id}`)
    expect(lev.input).toMatchObject({ kind: 'slider', min: 1, max: 3, step: 0.5, unit: 'x' })
    expect(lev.input!.defaultValue!(g)).toBe('1')
    lev.run(g, '2.5')
    expect(fundOf(g, 'person')!.f).toMatchObject({ strategy: 'macro', call: 'bull', lev: 2.5 })
    expect(infos(g, screenOf(g, person))[1]).toBe('Strategy: Global Macro · Bull at 2.5x')
    // Back to another strategy: the call and the leverage go.
    action(menu(screenOf(g, person), `hf-strategy-${person.id}`).children(g), `hf-strategy-${person.id}-event`).run(g)
    expect(ids(screenOf(g, person))).not.toContain(`hf-lev-${person.id}`)
    expect(fundOf(g, 'person')!.f).toMatchObject({ strategy: 'event', call: 'flat', lev: 1 })
  })

  it('the Investing talent gives its gut read on one call, and nobody else does', () => {
    const { g, person } = world()
    const hints = () => (['bull', 'bear', 'flat'] as const).map((c) => action(menu(screenOf(g, person), `hf-call-${person.id}`).children(g), `hf-call-${person.id}-${c}`).hint?.(g) ?? null)
    expect(hints().filter(Boolean)).toEqual([])
    g.character.talent = 'Investing'
    const got = hints()
    expect(got.filter(Boolean)).toHaveLength(1)
    const expected = (['bull', 'bear', 'flat'] as const).map((c) => callHint(g, { countryId: 'us' }, c) || null)
    expect(got).toEqual(expected)
    expect(got.find(Boolean)).toMatch(/gut/i)
  })
})

describe('family', () => {
  it('lists holders and candidates, and blocks the ones who cannot join', () => {
    const g = rich(87, 'us', 8_000_000)
    const sister = kin(g, 'sibling', 3_000_000, { relationship: 80 })
    const poor = kin(g, 'sibling', 10_000, { relationship: 80 })
    const young = kin(g, 'child', 5_000_000, { age: 17 })
    const cold = kin(g, 'parent', 3_000_000, { relationship: 20, age: 70 })
    const friend = createFriend(g)
    expect(startFund(g, 'family', 1_000_000)).toBe(true)
    const a = fundOf(g, 'family')!.a
    const f = readHedge(a.details.hf)!
    const family = menu(screenOf(g, a), `hf-family-${a.id}`)
    const kids = family.children(g)
    expect(find(kids, `hf-family-${a.id}-h-in`)).toMatchObject({ type: 'heading', label: 'In the fund' })
    expect(find(kids, `hf-family-${a.id}-h-invite`)).toMatchObject({ type: 'heading', label: 'Invite' })
    const cands = candidates(g, f)
    expect(cands.map((c) => c.person.id)).not.toContain(friend.id)
    for (const c of cands) {
      const act = action(kids, `hf-invite-${a.id}-${c.person.id}`)
      expect(act.label).toBe(`Invite ${c.person.firstName}`)
      expect(subtitleOf(g, act)).toBe(c.why ?? `Puts in ${money(c.amount)}`)
      expect(act.disabledReason?.(g) ?? null).toBe(c.why)
    }
    expect(action(kids, `hf-invite-${a.id}-${young.id}`).disabledReason?.(g)).toBe('Too young.')
    expect(action(kids, `hf-invite-${a.id}-${poor.id}`).disabledReason?.(g)).toBe("They don't have the savings.")
    expect(action(kids, `hf-invite-${a.id}-${cold.id}`).disabledReason?.(g)).toBe("They don't trust you with money yet.")
    expect(action(kids, `hf-invite-${a.id}-${sister.id}`).disabledReason?.(g) ?? null).toBeNull()
  })

  it('Invite and Pay Out run and change the record', () => {
    const g = rich(88, 'us', 8_000_000)
    const sister = kin(g, 'sibling', 3_000_000, { relationship: 80 })
    expect(startFund(g, 'family', 1_000_000)).toBe(true)
    const a = fundOf(g, 'family')!.a
    expect(infos(g, menu(screenOf(g, a), `hf-family-${a.id}`).children(g))).toContain('No relatives in the fund yet.')
    const savings = sister.money
    action(menu(screenOf(g, a), `hf-family-${a.id}`).children(g), `hf-invite-${a.id}-${sister.id}`).run(g)
    const f = readHedge(fundOf(g, 'family')!.a.details.hf)!
    expect(f.holders).toHaveLength(1)
    expect(sister.money).toBe(savings - Math.floor(0.2 * savings))
    const kids = menu(screenOf(g, a), `hf-family-${a.id}`).children(g)
    const text = infos(g, kids)
    const value = unitsValue(f, f.holders[0].units)
    expect(text).toContain(`${sister.firstName} ${sister.lastName} (${relationLabel(sister)}): ${money(value)}, ${pct(f.holders[0].units / f.units, 1)}`)
    expect(ids(kids)).not.toContain(`hf-invite-${a.id}-${sister.id}`)
    const out = action(kids, `hf-payout-${a.id}-${sister.id}`)
    expect(out.label).toBe(`Pay Out ${sister.firstName}`)
    expect(subtitleOf(g, out)).toBe(`They get ${money(value)}`)
    expect(out.stayOpen).toBe(true)
    out.run(g)
    expect(readHedge(fundOf(g, 'family')!.a.details.hf)!.holders).toHaveLength(0)
    expect(sister.money).toBeGreaterThan(savings - 1)
  })

  it('shows a holder who is no longer a contact without an action', () => {
    const { g, family } = world()
    const f = readHedge(family.details.hf)!
    f.holders.push({ id: 'ghost', units: 1000 })
    f.units += 1000
    ;(family.details as Record<string, unknown>).hf = JSON.parse(JSON.stringify(f))
    const kids = menu(screenOf(g, family), `hf-family-${family.id}`).children(g)
    expect(ids(kids)).not.toContain(`hf-payout-${family.id}-ghost`)
    expect(infos(g, kids).some((t) => /\$/.test(t) && t.includes('%'))).toBe(true)
    const copy = deepFreeze(structuredClone(g))
    expect(walk(copy, [rowOf(copy)]).filter((t) => BAD_TEXT.test(t))).toEqual([])
  })

  it('a person fund has no Family screen, and a full fund blocks every invite', () => {
    const { g, person } = world()
    expect(ids(screenOf(g, person))).not.toContain(`hf-family-${person.id}`)
    const h = rich(89, 'us', 20_000_000)
    for (let i = 0; i < 9; i++) kin(h, 'sibling', 3_000_000, { relationship: 80 })
    expect(startFund(h, 'family', 5_000_000)).toBe(true)
    const a = fundOf(h, 'family')!.a
    let n = 0
    for (const c of candidates(h, readHedge(a.details.hf)!)) {
      if (n >= 8) break
      if (!c.why && invite(h, a.id, c.person.id)) n++
    }
    expect(n).toBe(8)
    const kids = menu(screenOf(h, a), `hf-family-${a.id}`).children(h)
    const invites = kids.filter((k): k is MenuAction => k.type === 'action' && k.id.startsWith('hf-invite-'))
    for (const k of invites) expect(k.disabledReason?.(h)).toBe('The fund is full.')
    expect(readHedge(a.details.hf)!.holders).toHaveLength(8)
  })

  it('a holder who died cannot be paid out from the menu', () => {
    const { g, family, sister } = world()
    sister.alive = false
    const kids = menu(screenOf(g, family), `hf-family-${family.id}`).children(g)
    expect(action(kids, `hf-payout-${family.id}-${sister.id}`).disabledReason?.(g)).toBeTruthy()
  })
})

describe('company funds', () => {
  it('lists only the companies that can hold one, largest first', () => {
    const { g, co } = world()
    const other = company(g, { name: 'Bigger Co', cash: 10_000_000, profit: 90e6 })
    other.b.founded = g.year - 8
    const none = company(g, { name: 'Nothing Co', cash: 10_000_000 })
    none.b.familyShares = [{ id: 'kin1', share: 1 }]
    none.b.share = 0
    expect(companyBlock(g, none.a, readBiz(g, none.a))).toBe('You own none of it.')
    const listed = yours(g).filter((n) => n.id.startsWith('inv-hedge-co-')).map((n) => n.id)
    expect(listed).toEqual(eligibleCompanies(g).map((e) => `inv-hedge-co-${e.a.id}`))
    expect(listed).not.toContain(`inv-hedge-co-${none.a.id}`)
    expect(listed).toContain(`inv-hedge-co-${co.id}`)
    expect(infos(g, yours(g))).not.toContain('None of your companies can run a fund yet.')
  })

  it('the company node says what is at work and what the company keeps', () => {
    const { g, co } = world()
    const b = readBiz(g, co)
    const h = readCompanyHedge(b.hedge)!
    const q = companyQuote(g, co, b, h.target)
    expect(q.work).toBeGreaterThan(0)
    const node = menu(yours(g), `inv-hedge-co-${co.id}`)
    expect(node.label).toBe(co.name)
    expect(subtitleOf(g, node)).toBe(`${money(q.work)} at work · ${pct(b.share)} yours`)
    const rows = infos(g, node.children(g))
    expect(rows[0]).toBe(`Cash at work: ${money(q.work)} of ${money(q.spare)} spare.`)
    expect(rows[1]).toBe(`The company keeps ${money(q.floor)}.`)
    expect(rows[2]).toContain('Strategy: ')
    expect(rows[3]).toBe('No year booked yet.')
    expect(rows[rows.length - 1]).toBe("The cash stays on the company's books.")
    expect(ids(node.children(g)).slice(0, 5)).toEqual([`hf-co-${co.id}-i0`, `hf-co-${co.id}-i1`, `hf-co-${co.id}-i2`, `hf-co-${co.id}-i3`, `hf-co-${co.id}-i4`])
  })

  it('shows the last year, or why nothing went to work', () => {
    const { g, co } = world()
    const b = readBiz(g, co)
    const hedge = { ...readCompanyHedge(b.hedge)!, last: { year: 2025, work: 2_000_000, gross: 0.07, net: 0.065, market: 0.1, pnl: 130_000 } }
    ;(co.details as Record<string, unknown>).hedge = hedge
    expect(infos(g, coScreen(g, co))[3]).toBe(`2025: fund ${signed(0.065)} on ${money(2_000_000)}, +${money(130_000)}.`)
    ;(co.details as Record<string, unknown>).hedge = { ...hedge, last: { year: 2025, work: 2_000_000, gross: -0.2, net: -0.2, market: -0.3, pnl: -400_000 } }
    expect(infos(g, coScreen(g, co))[3]).toBe(`2025: fund ${signed(-0.2)} on ${money(2_000_000)}, -${money(400_000)}.`)
    ;(co.details as Record<string, unknown>).hedge = { ...hedge, last: { year: 2025, work: 0, gross: 0, net: 0, market: 0, pnl: 0, why: 'Its cash is at the floor.' } }
    expect(infos(g, coScreen(g, co))[3]).toBe('Its cash is at the floor.')
  })

  it('Cash at Work has a slider up to the spare cash, and running it sets the target', () => {
    const { g, co } = world()
    const b = readBiz(g, co)
    const q = companyQuote(g, co, b, 0)
    const act = action(coScreen(g, co), `hf-co-target-${co.id}`)
    expect(act.label).toBe('Cash at Work')
    expect(act.stayOpen).toBe(true)
    expect(act.input).toMatchObject({ kind: 'slider', money: true, min: 0 })
    expect(act.input!.max).toBe(Math.max(1, q.spare))
    expect(q.spare).toBeGreaterThan(1)
    expect(act.input!.defaultValue!(g)).toBe('2000000')
    const text = act.input!.preview!(g, 1_000_000)
    expect(text).toMatch(/^In an average year about .+\. A bad year could lose .+\.$/)
    act.run(g, '1500000')
    expect(readCompanyHedge(readBiz(g, co).hedge)!.target).toBe(1_500_000)
    expect(act.input!.defaultValue!(g)).toBe('1500000')
  })

  it('Cash at Work is never offered more than the company can spare, and a poor company still has a slider', () => {
    const g = rich(90)
    const c = company(g, { cash: 0 })
    c.b.founded = g.year - 8
    const act = action(coScreen(g, c.a), `hf-co-target-${c.a.id}`)
    expect(act.input!.min).toBe(0)
    expect(act.input!.max).toBeGreaterThanOrEqual(1)
    expect(Number(act.input!.defaultValue!(g))).toBeGreaterThanOrEqual(0)
    expect(Number(act.input!.defaultValue!(g))).toBeLessThanOrEqual(act.input!.max!)
    const copy = deepFreeze(structuredClone(g))
    expect(walk(copy, [rowOf(copy)]).filter((t) => BAD_TEXT.test(t))).toEqual([])
  })

  it('Stop is disabled at target 0 and sets it to 0', () => {
    const { g, co } = world()
    const stop = action(coScreen(g, co), `hf-co-stop-${co.id}`)
    expect(stop.label).toBe('Stop')
    expect(stop.disabledReason?.(g) ?? null).toBeNull()
    stop.run(g)
    expect(readCompanyHedge(readBiz(g, co).hedge)!.target).toBe(0)
    const again = action(coScreen(g, co), `hf-co-stop-${co.id}`)
    expect(again.disabledReason?.(g)).toBeTruthy()
    const fresh = rich(91)
    const c = company(fresh, { cash: 20_000_000 })
    expect(action(coScreen(fresh, c.a), `hf-co-stop-${c.a.id}`).disabledReason?.(fresh)).toBeTruthy()
    expect(subtitleOf(fresh, menu(yours(fresh), `inv-hedge-co-${c.a.id}`))).toBe(`Not in use · ${pct(readBiz(fresh, c.a).share)} yours`)
  })

  it('Strategy, Market Call and Leverage go through the company record', () => {
    const { g, co } = world()
    becomeCeo(g, co, bizOf(g, co))
    const strategy = menu(coScreen(g, co), `hf-co-strategy-${co.id}`)
    expect(strategy.header?.(g)).toBe('Your strategy for next year.')
    expect(action(strategy.children(g), `hf-co-strategy-${co.id}-longShort`).disabledReason?.(g)).toBe('Already your strategy.')
    action(strategy.children(g), `hf-co-strategy-${co.id}-event`).run(g)
    expect(readCompanyHedge(readBiz(g, co).hedge)).toMatchObject({ strategy: 'event', call: 'flat', lev: 1 })
    expect(ids(coScreen(g, co))).not.toContain(`hf-co-lev-${co.id}`)
    const call = menu(coScreen(g, co), `hf-co-call-${co.id}`)
    expect(call.label).toBe('Market Call')
    action(call.children(g), `hf-co-call-${co.id}-bear`).run(g)
    expect(readCompanyHedge(readBiz(g, co).hedge)).toMatchObject({ strategy: 'macro', call: 'bear', lev: 1 })
    expect(menu(coScreen(g, co), `hf-co-call-${co.id}`).label).toBe('Market Call: 📉 Bear')
    const lev = action(coScreen(g, co), `hf-co-lev-${co.id}`)
    expect(lev.input).toMatchObject({ kind: 'slider', min: 1, max: 3, step: 0.5, unit: 'x' })
    lev.run(g, '2')
    expect(readCompanyHedge(readBiz(g, co).hedge)).toMatchObject({ strategy: 'macro', call: 'bear', lev: 2 })
    expect(infos(g, coScreen(g, co))[2]).toBe('Strategy: Global Macro · Bear at 2x')
  })

  it('an official cannot pick Macro for a company', () => {
    const g = newLeader(5)
    g.year = 2026
    g.character.money = 5_000_000
    g.character.age = 45
    const c = company(g, { cash: 20_000_000 })
    c.b.founded = g.year - 8
    const strategy = menu(coScreen(g, c.a), `hf-co-strategy-${c.a.id}`)
    expect(action(strategy.children(g), `hf-co-strategy-${c.a.id}-macro`).disabledReason?.(g)).toBe(macroBlock(g))
    expect(menu(coScreen(g, c.a), `hf-co-call-${c.a.id}`).disabledReason?.(g)).toBe(macroBlock(g))
  })

  it('says so when nobody at the wheel is you', () => {
    const { g, co } = world()
    // The player is not its chief executive: the strategy is picked for them.
    expect(infos(g, coScreen(g, co))).toContain(NOTE)
    becomeCeo(g, co, bizOf(g, co))
    const owner = infos(g, coScreen(g, co))
    expect(owner).not.toContain(NOTE)
    installManager(g, bizOf(g, co), managerCandidate(g, bizOf(g, co), 80))
    const hired = infos(g, coScreen(g, co))
    expect(hired).toContain(NOTE)
    expect(hired.length).toBe(owner.length + 1)
    expect(hired[hired.length - 1]).toBe("The cash stays on the company's books.")
  })

  it('actions are disabled when the company can no longer hold a fund', () => {
    const { g, co } = world()
    const mine = bizOf(g, co)
    mine.familyShares = [{ id: 'kin1', share: 1 }]
    mine.share = 0
    expect(companyBlock(g, co, readBiz(g, co))).toBe('You own none of it.')
    // A node held from before still reads the live company, and its actions say why they can't run.
    const held = companyFundNode(co).children(g)
    for (const id of [`hf-co-target-${co.id}`, `hf-co-stop-${co.id}`]) expect(action(held, id).disabledReason?.(g)).toBe(manageBlock(g, co))
    expect(manageBlock(g, co)).toBe('You have no ownership stake in this family business.')
    expect(menu(held, `hf-co-call-${co.id}`).disabledReason?.(g)).toBe(manageBlock(g, co))
    const before = JSON.stringify(readCompanyHedge(readBiz(g, co).hedge))
    action(held, `hf-co-target-${co.id}`).run(g, '5000')
    expect(JSON.stringify(readCompanyHedge(readBiz(g, co).hedge))).toBe(before)
    // It is also off the list.
    expect(ids(yours(g))).not.toContain(`inv-hedge-co-${co.id}`)
  })

  it('a stale company node reads from the live company', () => {
    const { g, co } = world()
    const node = companyFundNode(co)
    expect(node.id).toBe(`inv-hedge-co-${co.id}`)
    g.assets = g.assets.filter((a) => a.id !== co.id)
    expect(infos(g, node.children(g))).toEqual(['You no longer own this.'])
    expect(findBusiness(g, co.id)).toBeUndefined()
    expect(subtitleOf(g, node)).toBe('')
  })
})

describe('stale and damaged screens', () => {
  it('a closed fund shows one line when the old node is rendered', () => {
    const { g, person } = world()
    const node = menu(yours(g), `inv-hedge-${person.id}`)
    const take = action(node.children(g), `hf-take-${person.id}`)
    take.run(g, '100')
    expect(fundOf(g, 'person')).toBeNull()
    const kids = node.children(g)
    expect(infos(g, kids)).toEqual(['You no longer own this.'])
    expect(kids).toHaveLength(1)
    // Its old actions do nothing and do not throw.
    const cash = g.character.money
    expect(() => take.run(g, '50')).not.toThrow()
    expect(g.character.money).toBe(cash)
    expect(fundSubtitle(g, person)).toBeTruthy()
  })

  it('a damaged record shows one row and no actions, and still counts in net worth', () => {
    const { g, person } = world()
    const worth = netWorth(g)
    ;(person.details as Record<string, unknown>).hf = 'junk'
    expect(netWorth(g)).toBe(worth)
    const copy = deepFreeze(structuredClone(g))
    const a = copy.assets.find((x) => x.id === person.id)!
    const kids = fundView(copy, a)
    expect(kids).toHaveLength(1)
    expect(infos(copy, kids)).toEqual(['The books for this fund are damaged.'])
    expect(fundSubtitle(copy, a)).toBeTruthy()
    expect(BAD_TEXT.test(fundSubtitle(copy, a))).toBe(false)
    expect(investmentAssetView(copy, a)).toHaveLength(1)
    // It is still listed under Your Funds, so its books can be seen.
    const listed = yours(copy)
    expect(ids(listed)).toContain(`inv-hedge-${person.id}`)
    expect(infos(copy, menu(listed, `inv-hedge-${person.id}`).children(copy))).toEqual(['The books for this fund are damaged.'])
  })

  it('an asset that is not a fund reads as gone', () => {
    const { g, co } = world()
    expect(infos(g, fundView(g, co))).toEqual(['You no longer own this.'])
    expect(infos(g, fundView(g, { ...co, id: 'nope' }))).toEqual(['You no longer own this.'])
  })
})

describe('Assets and Investments', () => {
  it('Assets shows the fund with its subtitle and the same screen', () => {
    const { g, person, family } = world()
    const nodes = assetsMenu.children(g)
    for (const a of [person, family]) {
      const n = menu(nodes, `asset-${a.id}`)
      expect(subtitleOf(g, n)).toBe(fundSubtitle(g, a))
      expect(ids(n.children(g))).toEqual(ids(fundView(g, a)))
      expect(ids(n.children(g))).toContain(`hf-take-${a.id}`)
      expect(investmentAssetSubtitle(g, a)).toBe(fundSubtitle(g, a))
      expect(ids(investmentAssetView(g, a))).toEqual(ids(fundView(g, a)))
    }
  })

  it('a fund is not a market security', () => {
    const { g, person, family } = world()
    expect(investmentHoldings(g)).toEqual([])
    const listing = JSON.stringify(investmentListing(g))
    expect(listing).not.toContain(person.id)
    expect(listing).not.toContain(family.id)
    const stocks = menu(investmentsMenu.children(g), 'inv-stocks').children(g)
    const plain = rich(71)
    expect(ids(menu(investmentsMenu.children(plain), 'inv-stocks').children(plain))).toEqual(ids(stocks))
    expect(fundsOf(g)).toHaveLength(2)
  })

  it('building every menu moves no money, adds no asset and leaves net worth alone', () => {
    const { g } = world()
    const json = JSON.stringify(g)
    const worth = netWorth(g)
    walk(g, [rowOf(g)])
    walk(g, assetsMenu.children(g))
    expect(JSON.stringify(g)).toBe(json)
    expect(netWorth(g)).toBe(worth)
  })

  it('putting in and starting keep net worth', () => {
    const g = rich(92)
    const worth = netWorth(g)
    action(yours(g), 'hf-start-person').run(g, '1000000')
    expect(netWorth(g)).toBe(worth)
    const a = fundOf(g, 'person')!.a
    action(screenOf(g, a), `hf-put-${a.id}`).run(g, '300000')
    expect(netWorth(g)).toBe(worth)
    expect(putIn(g, a.id, 100_000)).toBe(true)
    expect(netWorth(g)).toBe(worth)
  })
})

/** A friend: a contact with a will role of friend, who can never join a fund. */
function createFriend(g: GameState) {
  return kin(g, 'friend', 5_000_000, { relationship: 90 })
}
