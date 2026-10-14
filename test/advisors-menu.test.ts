// The Money Team menu (advisors/menu.ts): where an adult hires an advisor and a manager, reads the advisor's
// findings and sets the manager's three dials. Menus are pure functions of state: they render from a deep-frozen
// game without touching it or g.rng, and every action re-reads the state it runs on.
import { afterEach, describe, expect, it } from 'vitest'
import { moneyTeamMenu } from '../src/game/advisors/menu'
import { planYear } from '../src/game/advisors/mandate'
import { advisorFee, hireBlock, managerFee, managerRate, offersFor, ratingLabel, readTeam, vet, type Hire, type ManagerHire, type Statement } from '../src/game/advisors/team'
import { yearlyAdvisors } from '../src/game/advisors/year'
import { bindMoneyContext, formatMoney, shortMoney } from '../src/game/core'
import { investingBlocked } from '../src/game/history/markets'
import { managedBook } from '../src/game/investments'
import { assetsMenu } from '../src/game/menus'
import type { GameState, MenuAction, MenuGroup, MenuNode } from '../src/game/types'
import { client, own, withTeam } from './advisors-kit'
import { FailureLog, deepFreeze, formatFailures, probeActions, renderAll } from './fuzz-kit'

afterEach(() => bindMoneyContext(null))

// ---------------------------------------------------------------------------
// Fixtures

const ADVISOR: Hire = { name: 'Ada Finch', skill: 70, since: 2025 }
const MANAGER: ManagerHire = { name: 'Dana Reyes', skill: 80, since: 2025, claimed: 80, honest: true, rate: managerRate(80), skimmed: 0 }
const LAST: Statement = { year: 2025, pool: 1_800_000, billed: 14_400, moved: 900_000, costs: 450, stocks: 60 }

/** A rich adult with a manager hired (60% stocks, 500,000 kept, a limit of 50) and nothing invested yet. */
function managed(seed = 11, money = 2_000_000, over: Partial<ManagerHire> = {}): GameState {
  const g = client(seed, { money })
  withTeam(g, { manager: { ...MANAGER, since: g.year - 1, ...over }, mandate: { stocks: 60, reserve: 500_000, limit: 50 } })
  return g
}

/** A rich adult with an advisor and a manager. */
function team(seed = 11): GameState {
  const g = managed(seed)
  withTeam(g, { advisor: { ...ADVISOR, since: g.year - 1 } })
  return g
}

// ---------------------------------------------------------------------------
// Walking the menu

function flat(g: GameState, nodes: MenuNode[] = moneyTeamMenu.children(g)): MenuNode[] {
  return nodes.flatMap((n) => (n.type === 'menu' ? [n, ...flat(g, n.children(g))] : [n]))
}

const ids = (g: GameState): string[] => flat(g).map((n) => n.id)
const node = (g: GameState, id: string): MenuNode | undefined => flat(g).find((n) => n.id === id)

function act(g: GameState, id: string): MenuAction {
  const n = node(g, id)
  if (!n || n.type !== 'action') throw new Error(`no action ${id} in ${ids(g).join(', ')}`)
  return n
}

function group(g: GameState, id: string): MenuGroup {
  const n = node(g, id)
  if (!n || n.type !== 'menu') throw new Error(`no group ${id}`)
  return n
}

function info(g: GameState, id: string): string {
  const n = node(g, id)
  if (!n || n.type !== 'info') throw new Error(`no info ${id} in ${ids(g).join(', ')}`)
  return typeof n.text === 'function' ? n.text(g) : n.text
}

function subtitle(g: GameState, id: string): string {
  const n = node(g, id)
  if (!n || n.type === 'info' || n.type === 'heading') throw new Error(`no row ${id}`)
  return typeof n.subtitle === 'function' ? n.subtitle(g) : (n.subtitle ?? '')
}

function preview(g: GameState, id: string, value: number): string {
  const input = act(g, id).input
  if (!input?.preview) throw new Error(`no preview on ${id}`)
  return input.preview(g, value)
}

interface Said {
  id: string
  kind: string
  text: string
}

/** Everything the player can read in the menu, with every function called the way the screen calls it. */
function exercise(g: GameState, root: MenuGroup = moneyTeamMenu): Said[] {
  const out: Said[] = []
  const add = (id: string, kind: string, text: string | null | undefined): void => {
    if (typeof text === 'string' && text !== '') out.push({ id, kind, text })
  }
  const visit = (n: MenuNode): void => {
    if (n.type === 'heading') return add(n.id, 'heading', n.label)
    if (n.type === 'info') return add(n.id, 'info', typeof n.text === 'function' ? n.text(g) : n.text)
    n.visible?.(g)
    n.hint?.(g)
    add(n.id, 'label', n.label)
    add(n.id, 'subtitle', typeof n.subtitle === 'function' ? n.subtitle(g) : n.subtitle)
    add(n.id, 'disabled', n.disabledReason?.(g))
    if (n.type === 'menu') {
      add(n.id, 'header', n.header?.(g))
      for (const c of n.children(g)) visit(c)
      return
    }
    add(n.id, 'confirm', n.confirm?.(g))
    const input = n.input
    if (!input) return
    add(n.id, 'input', input.label)
    add(n.id, 'default', input.defaultValue?.(g))
    if (input.preview && input.min !== undefined && input.max !== undefined) {
      for (const v of [input.min, Math.round((input.min + input.max) / 2), input.max]) add(n.id, `preview@${v}`, input.preview(g, v))
    }
  }
  visit(root)
  return out
}

const JUNK = /NaN|undefined|Infinity|\[object/

/** The first seed whose game makes `ok` true. */
function seedWhere(ok: (g: GameState, seed: number) => boolean, make: (seed: number) => GameState, max = 300): { g: GameState; seed: number } {
  for (let seed = 1; seed <= max; seed++) {
    const g = make(seed)
    if (ok(g, seed)) return { g, seed }
  }
  throw new Error(`no seed in 1 to ${max} fits`)
}

/** A rich adult with the given advisor (and nothing else), for offers and their vetting. */
function advised(seed: number, skill: number): GameState {
  const g = client(seed, { money: 5_000_000 })
  withTeam(g, { advisor: { ...ADVISOR, skill, since: g.year - 1 } })
  return g
}

// ---------------------------------------------------------------------------

describe('where the menu sits', () => {
  it('is right after Investments in Business & Investments', () => {
    const g = client(11)
    const all = assetsMenu.children(g).map((n) => n.id)
    const at = all.indexOf('investments')
    expect(at).toBeGreaterThan(-1)
    expect(all[at + 1]).toBe('money-team')
  })

  it('is hidden for minors, the dead and prisoners', () => {
    expect(moneyTeamMenu.visible?.(client(11))).toBe(true)
    const kid = client(11, { age: 17 })
    expect(moneyTeamMenu.visible?.(kid)).toBe(false)
    expect(moneyTeamMenu.visible?.(client(11, { age: 18 }))).toBe(true)
    const dead = client(11)
    dead.character.alive = false
    expect(moneyTeamMenu.visible?.(dead)).toBe(false)
    const con = client(11)
    con.character.prison = { crime: 'Fraud', yearsTotal: 3, yearsServed: 0, security: 'minimum', respect: 50 } as unknown as GameState['character']['prison']
    expect(moneyTeamMenu.visible?.(con)).toBe(false)
  })

  it('is named, and says what the two roles do', () => {
    expect(moneyTeamMenu.id).toBe('money-team')
    expect(moneyTeamMenu.label).toBe('Money Team')
    expect(moneyTeamMenu.emoji).toBe('💼')
    expect(moneyTeamMenu.header?.(client(11))).toBe('An advisor reviews your money. A manager keeps your mix. Neither picks winners.')
  })

  it('has a subtitle that names who is hired', () => {
    const g = client(11)
    expect(typeof moneyTeamMenu.subtitle === 'function' ? moneyTeamMenu.subtitle(g) : moneyTeamMenu.subtitle).toBe('Hire an advisor or a manager')
    const both = team()
    const text = typeof moneyTeamMenu.subtitle === 'function' ? moneyTeamMenu.subtitle(both) : (moneyTeamMenu.subtitle ?? '')
    expect(text).toBe(`Advisor: ${ADVISOR.name} · Manager: ${MANAGER.name}`)
    const one = advised(3, 60)
    expect(typeof moneyTeamMenu.subtitle === 'function' ? moneyTeamMenu.subtitle(one) : moneyTeamMenu.subtitle).toBe(`Advisor: ${ADVISOR.name}`)
    const mgr = managed()
    expect(typeof moneyTeamMenu.subtitle === 'function' ? moneyTeamMenu.subtitle(mgr) : moneyTeamMenu.subtitle).toBe(`Manager: ${MANAGER.name}`)
  })

  it('lists the two blocks in order with the rules line first in the manager block', () => {
    for (const g of [client(11), team(), client(7, { money: 1_000 })]) {
      const all = ids(g)
      expect(all[0]).toBe('team-h-advisor')
      const m = all.indexOf('team-h-manager')
      expect(m).toBeGreaterThan(0)
      expect(all[m + 1]).toBe('team-rules')
      expect(info(g, 'team-rules')).toBe('Runs your stock funds, plus safe money in bonds or savings. Never your own picks or companies.')
    }
  })
})

describe('purity', () => {
  it('renders from a frozen state without touching it', () => {
    const hired = team()
    own(hired, 'index', 400_000)
    own(hired, 'bond', 200_000)
    withTeam(hired, { last: LAST })

    // Another game with offers on both sides: one vetted offer and one the advisor couldn't check.
    const mixed = seedWhere(
      (g) => {
        const v = offersFor(g, 'manager').map((o) => vet(g, o) !== null)
        return v.includes(true) && v.includes(false)
      },
      (seed) => advised(seed, 50),
    ).g
    const fresh = client(12)
    const poor = client(7, { money: 1_000 })
    for (const g of [hired, mixed, fresh, poor]) {
      deepFreeze(g)
      const json = JSON.stringify(g)
      const rng = g.rng
      const said = exercise(g)
      expect(said.length).toBeGreaterThanOrEqual(6)
      expect(JSON.stringify(g)).toBe(json)
      expect(g.rng).toBe(rng)
      for (const s of said) expect(s.text, `${s.id} ${s.kind}`).not.toMatch(JUNK)
    }
  })

  it('shows each of the manager hire rows on a frozen state with and without vetting', () => {
    const g = advised(5, 99)
    deepFreeze(g)
    const all = ids(g)
    for (const slot of [0, 1, 2]) {
      expect(all).toContain(`team-hire-manager-${slot}`)
      expect(all).toContain(`team-vet-${slot}`)
    }
  })
})

describe('the advisor block', () => {
  it('shows the gate to a player who is too poor and no offers', () => {
    const g = client(7, { money: 1_000 })
    const all = ids(g)
    expect(all).toContain('team-advisor-block')
    expect(all.filter((id) => id.startsWith('team-hire-advisor'))).toEqual([])
    expect(all).not.toContain('team-meet-advisor')
    expect(info(g, 'team-advisor-block')).toBe(hireBlock(g, 'advisor'))
    expect(info(g, 'team-advisor-block')).toMatch(/^Advisors take clients worth at least \$/)
  })

  it('offers three advisors to a rich one and hires the one picked', () => {
    const g = client(11)
    expect(ids(g)).not.toContain('team-advisor-block')
    const meet = group(g, 'team-meet-advisor')
    expect(meet.label).toBe('Meet Advisors')
    expect(meet.emoji).toBe('🤝')
    expect(meet.subtitle).toBe('Three want your account')
    expect(meet.children(g).map((n) => n.id)).toEqual(['team-hire-advisor-0', 'team-hire-advisor-1', 'team-hire-advisor-2'])

    const offers = offersFor(g, 'advisor')
    const row = act(g, 'team-hire-advisor-1')
    expect(row.label).toBe(`Hire ${offers[1].name}`)
    expect(row.emoji).toBe('💼')
    expect(row.stayOpen).toBe(true)
    const fee = formatMoney(advisorFee(g, offers[1].skill))
    expect(typeof row.subtitle === 'function' ? row.subtitle(g) : row.subtitle).toBe(`${ratingLabel(offers[1].skill)} · about ${fee} a year`)
    expect(row.confirm?.(g)).toBe(`Hire ${offers[1].name} for about ${fee} a year? The fee comes out at year-end.`)

    const money = g.character.money
    row.run(g)
    expect(readTeam(g)?.advisor?.name).toBe(offers[1].name)
    expect(g.character.money).toBe(money)

    const after = ids(g)
    expect(after).toContain('team-advisor')
    expect(after).toContain('team-sees')
    expect(after.some((id) => id.startsWith('team-f-'))).toBe(true)
    expect(after).not.toContain('team-meet-advisor')
    const hired = readTeam(g)!.advisor!
    expect(info(g, 'team-advisor')).toBe(`${hired.name}, ${ratingLabel(hired.skill)}. About ${formatMoney(advisorFee(g, hired.skill))} a year.`)
  })

  it('lists the findings the advisor sees, and how many there are', () => {
    const g = client(11)
    withTeam(g, { advisor: { ...ADVISOR, since: g.year - 1 } })
    g.flags.investLossCarry = 40_000_000
    const rows = ids(g).filter((id) => id.startsWith('team-f-'))
    expect(rows).toEqual(['team-f-idle-cash', 'team-f-losses'])
    for (const id of rows) {
      const n = node(g, id)
      expect(n?.type === 'info' && n.emoji).toBe('💼')
    }
    expect(info(g, 'team-sees')).toBe('Sees 2 of 2 issues.')
  })

  it('says "issue" when there is only one', () => {
    const g = client(11)
    withTeam(g, { advisor: { ...ADVISOR, since: g.year - 1 } })
    expect(ids(g).filter((id) => id.startsWith('team-f-'))).toEqual(['team-f-idle-cash'])
    expect(info(g, 'team-sees')).toBe('Sees 1 of 1 issue.')
  })

  it('says when there is nothing to flag', () => {
    const g = client(11)
    withTeam(g, { advisor: { ...ADVISOR, since: g.year - 1 } })
    g.character.money = 100_000
    expect(ids(g).some((id) => id.startsWith('team-f-'))).toBe(false)
    expect(info(g, 'team-sees')).toBe('Nothing to flag right now.')
  })

  it('counts what it cannot show', () => {
    const g = client(11)
    withTeam(g, { advisor: { ...ADVISOR, skill: 20, since: g.year - 1 } })
    g.flags.investLossCarry = 40_000_000
    g.character.loans.push({ id: 'l1', kind: 'personal', lender: 'First Bank', balance: 900_000, yearlyPayment: 90_000, rate: 0.12 })
    const shown = ids(g).filter((id) => id.startsWith('team-f-')).length
    expect(shown).toBe(2)
    expect(info(g, 'team-sees')).toBe('Sees 2 of 3 issues.')
  })

  it('lets the advisor go after a confirm, owing nothing', () => {
    const g = client(11)
    act(g, 'team-hire-advisor-0').run(g)
    const name = readTeam(g)!.advisor!.name
    const row = act(g, 'team-fire-advisor')
    expect(row.label).toBe('Let Go')
    expect(row.emoji).toBe('🚪')
    expect(row.stayOpen).toBe(true)
    expect(row.confirm?.(g)).toBe(`Let ${name} go? You owe nothing.`)
    const money = g.character.money
    row.run(g)
    expect(readTeam(g)?.advisor).toBeUndefined()
    expect(g.character.money).toBe(money)
    expect(ids(g)).toContain('team-meet-advisor')
    expect(offersFor(g, 'advisor').map((o) => o.name)).not.toContain(name)
  })

  it('does nothing when a stale row runs after the gate closes', () => {
    const g = client(11)
    const row = act(g, 'team-hire-advisor-0')
    g.character.money = 0
    row.run(g)
    expect(g.flags['fin.team']).toBeUndefined()
  })
})

describe('the manager block', () => {
  it('shows the gate to a player whose account is too small', () => {
    const g = client(7, { money: 1_000 })
    expect(ids(g)).toContain('team-manager-block')
    expect(info(g, 'team-manager-block')).toBe(hireBlock(g, 'manager'))
    expect(info(g, 'team-manager-block')).toMatch(/^Managers take accounts of at least \$/)
    expect(ids(g).filter((id) => id.startsWith('team-hire-manager'))).toEqual([])
  })

  it('says why a closed market cannot be managed', () => {
    let hit: { countryId: string; year: number } | null = null
    for (const countryId of ['cn', 'cu', 'ru', 'ir']) {
      for (let year = 1950; year <= 1990 && !hit; year++) if (investingBlocked(countryId, year)) hit = { countryId, year }
      if (hit) break
    }
    expect(hit).not.toBeNull()
    const g = client(43, { ...hit!, money: 3_000_000 })
    expect(info(g, 'team-manager-block')).toBe(managedBook(g).idle)
    expect(info(g, 'team-manager-block')).toBeTruthy()
  })

  it('offers three managers with the rating they claim and the rate they ask', () => {
    const g = client(11)
    const meet = group(g, 'team-meet-manager')
    expect(meet.label).toBe('Meet Managers')
    expect(meet.emoji).toBe('🤝')
    expect(meet.subtitle).toBe('Three want your account')
    expect(meet.children(g).map((n) => n.id)).toEqual(['team-hire-manager-0', 'team-hire-manager-1', 'team-hire-manager-2'])
    const floor = formatMoney(managerFee(g, 0, 0))
    for (const o of offersFor(g, 'manager')) {
      const row = act(g, `team-hire-manager-${o.slot}`)
      const rate = managerRate(o.claimed)
      const pct = `${Number((rate * 100).toFixed(2))}%`
      expect(row.label).toBe(`Hire ${o.name}`)
      expect(row.stayOpen).toBe(true)
      expect(typeof row.subtitle === 'function' ? row.subtitle(g) : row.subtitle).toBe(`${ratingLabel(o.claimed)} · ${pct} a year`)
      expect(row.confirm?.(g)).toBe(`Hire ${o.name}? They run your stock funds and safe money for ${pct} a year, at least ${floor}.`)
    }
  })

  it('hires the manager in the slot picked and sets the default mandate', () => {
    const g = client(11)
    const o = offersFor(g, 'manager')[2]
    const money = g.character.money
    act(g, 'team-hire-manager-2').run(g)
    const t = readTeam(g)!
    expect(t.manager?.name).toBe(o.name)
    expect(t.manager?.claimed).toBe(o.claimed)
    expect(t.mandate?.stocks).toBe(60)
    expect(g.character.money).toBe(money)
    const all = ids(g)
    for (const id of ['team-manager', 'team-last', 'team-stocks', 'team-reserve', 'team-limit', 'team-fire-manager']) expect(all).toContain(id)
    expect(all).not.toContain('team-meet-manager')
    expect(info(g, 'team-manager')).toBe(`${o.name}, ${ratingLabel(o.claimed)}. Agreed fee ${Number((managerRate(o.claimed) * 100).toFixed(2))}% a year of the money they run.`)
    expect(info(g, 'team-last')).toBe('No statement yet. The first comes at year-end.')
  })

  it('hires whoever is in the slot today, never a person it remembered', () => {
    const g = client(11)
    const row = act(g, 'team-hire-manager-0')
    const old = offersFor(g, 'manager')[0].name
    g.year += 1
    g.character.age += 1
    const now = offersFor(g, 'manager')[0].name
    expect(now).not.toBe(old)
    row.run(g)
    expect(readTeam(g)?.manager?.name).toBe(now)
  })

  it('lets the manager go and keeps the holdings', () => {
    const g = team()
    own(g, 'index', 300_000)
    const held = g.assets.length
    const row = act(g, 'team-fire-manager')
    expect(row.label).toBe('Let Go')
    expect(row.stayOpen).toBe(true)
    expect(row.confirm?.(g)).toBe(`Let ${MANAGER.name} go? Your holdings stay as they are.`)
    row.run(g)
    const t = readTeam(g)!
    expect(t.manager).toBeUndefined()
    expect(t.mandate).toBeUndefined()
    expect(t.managerEpoch).toBe(1)
    expect(g.assets.length).toBe(held)
    expect(ids(g)).toContain('team-meet-manager')
  })

  it('shows the last statement with the billed amount and its share of the pool', () => {
    const g = managed(11, 2_000_000)
    own(g, 'index', 300_000)
    yearlyAdvisors(g)
    const last = readTeam(g)!.last!
    expect(last).toBeDefined()
    const text = info(g, 'team-last')
    expect(text).toContain(formatMoney(last.billed))
    expect(text).toContain(formatMoney(last.pool))
    expect(text).toContain(formatMoney(last.moved))
    expect(text).toMatch(/\(\d+(\.\d+)?%\)/)
    expect(text).toContain(`${last.stocks}% in stocks.`)
    expect(text.startsWith('Last year: billed ')).toBe(true)
  })

  it('writes a statement of an empty pool without dividing by it', () => {
    const g = managed()
    withTeam(g, { last: { year: 2025, pool: 0, billed: 5_000, moved: 0, costs: 0, stocks: 0 } })
    const text = info(g, 'team-last')
    expect(text).not.toMatch(JUNK)
    expect(text).toContain('(0%)')
  })
})

describe('offers show a rating, not a number', () => {
  const noNumbers = (text: string): string => text.replace(/\$[\d,.]+[A-Za-z]*/g, '').replace(/[\d.]+%/g, '')

  it('has no bare skill number on any hire row', () => {
    for (const [g, count] of [[client(11), 6], [client(12), 6], [advised(13, 80), 3]] as const) {
      const rows = flat(g).filter((n): n is MenuAction => n.type === 'action' && n.id.startsWith('team-hire-'))
      expect(rows.length).toBe(count)
      for (const row of rows) {
        const parts = [row.label, typeof row.subtitle === 'function' ? row.subtitle(g) : row.subtitle, row.confirm?.(g)]
        for (const p of parts) expect(noNumbers(p ?? ''), `${row.id}: ${p}`).not.toMatch(/\d/)
      }
    }
  })

  it("shows a crook's inflated rating, not the real one", () => {
    const { g } = seedWhere(
      (gg) => offersFor(gg, 'manager').some((o) => !o.honest && ratingLabel(o.claimed) !== ratingLabel(o.skill)),
      (seed) => client(seed),
      600,
    )
    const crook = offersFor(g, 'manager').find((o) => !o.honest && ratingLabel(o.claimed) !== ratingLabel(o.skill))!
    const row = act(g, `team-hire-manager-${crook.slot}`)
    const sub = typeof row.subtitle === 'function' ? row.subtitle(g) : row.subtitle
    expect(sub?.startsWith(`${ratingLabel(crook.claimed)} · `)).toBe(true)
    expect(sub).not.toContain(ratingLabel(crook.skill))
    const rate = Number((managerRate(crook.claimed) * 100).toFixed(2))
    expect(sub).toContain(`${rate}% a year`)
  })
})

describe('vet rows', () => {
  const ROW = /^Your advisor checked .+ and rates them (Junior|Experienced|Senior|Top-tier)\. (Red flag: padded bills at a past firm\.|No red flags\.)$|^Your advisor couldn't check .+\.$/

  it('adds one under each manager offer when there is an advisor, in one of the three wordings', () => {
    const { g } = seedWhere(
      (gg) => {
        const v = offersFor(gg, 'manager').map((o) => vet(gg, o) !== null)
        return v.includes(true) && v.includes(false)
      },
      (seed) => advised(seed, 50),
    )
    const meet = group(g, 'team-meet-manager').children(g).map((n) => n.id)
    expect(meet).toHaveLength(6)
    for (const o of offersFor(g, 'manager')) {
      const at = meet.indexOf(`team-hire-manager-${o.slot}`)
      expect(meet[at + 1]).toBe(`team-vet-${o.slot}`)
      const text = info(g, `team-vet-${o.slot}`)
      expect(text).toMatch(ROW)
      const v = vet(g, o)
      if (!v) expect(text).toBe(`Your advisor couldn't check ${o.name}.`)
      else {
        expect(text).toContain(`rates them ${ratingLabel(v.skill)}.`)
        expect(text.endsWith(v.flagged ? 'Red flag: padded bills at a past firm.' : 'No red flags.')).toBe(true)
      }
    }
  })

  it('flags a vetted crook and rates them by their real skill', () => {
    const { g } = seedWhere(
      (gg) => offersFor(gg, 'manager').some((o) => vet(gg, o)?.flagged === true && ratingLabel(o.skill) !== ratingLabel(o.claimed)),
      (seed) => advised(seed, 99),
      600,
    )
    const crook = offersFor(g, 'manager').find((o) => vet(g, o)?.flagged === true && ratingLabel(o.skill) !== ratingLabel(o.claimed))!
    const text = info(g, `team-vet-${crook.slot}`)
    expect(text).toBe(`Your advisor checked ${crook.name} and rates them ${ratingLabel(crook.skill)}. Red flag: padded bills at a past firm.`)
  })

  it('says no red flags for an honest, vetted manager', () => {
    const { g } = seedWhere(
      (gg) => offersFor(gg, 'manager').some((o) => o.honest && vet(gg, o) !== null),
      (seed) => advised(seed, 99),
    )
    const o = offersFor(g, 'manager').find((x) => x.honest && vet(g, x) !== null)!
    expect(info(g, `team-vet-${o.slot}`)).toBe(`Your advisor checked ${o.name} and rates them ${ratingLabel(o.skill)}. No red flags.`)
  })

  it('has none without an advisor', () => {
    const g = client(11)
    expect(ids(g).filter((id) => id.startsWith('team-vet-'))).toEqual([])
    expect(group(g, 'team-meet-manager').children(g)).toHaveLength(3)
  })
})

describe('the three dials', () => {
  const mandateOf = (g: GameState) => readTeam(g)!.mandate!

  it('are sliders with the stated ranges, labels and starting points', () => {
    const g = managed()
    const stocks = act(g, 'team-stocks')
    expect(stocks.label).toBe('Stocks Share')
    expect(stocks.emoji).toBe('📈')
    expect(stocks.stayOpen).toBe(true)
    expect(stocks.input).toMatchObject({ kind: 'slider', label: 'Share in stocks', min: 0, max: 100, step: 5, unit: '%' })
    expect(stocks.input?.defaultValue?.(g)).toBe('60')
    expect(subtitle(g, 'team-stocks')).toBe('60% stocks, the rest in bonds or savings')

    const limit = act(g, 'team-limit')
    expect(limit.label).toBe('Yearly Limit')
    expect(limit.emoji).toBe('🚦')
    expect(limit.stayOpen).toBe(true)
    expect(limit.input).toMatchObject({ kind: 'slider', label: 'Most they may move in a year', min: 10, max: 100, step: 5, unit: '%' })
    expect(limit.input?.defaultValue?.(g)).toBe('50')
    expect(subtitle(g, 'team-limit')).toBe('50% of the pool may move a year')

    const reserve = act(g, 'team-reserve')
    expect(reserve.label).toBe('Cash to Keep')
    expect(reserve.emoji).toBe('🏦')
    expect(reserve.stayOpen).toBe(true)
    expect(reserve.input).toMatchObject({ kind: 'slider', label: 'How much stays in the bank?', min: 0, money: true })
    expect(reserve.input?.max).toBe(Math.floor(g.character.money))
    expect(reserve.input?.defaultValue?.(g)).toBe('500000')
    expect(subtitle(g, 'team-reserve')).toBe(`${formatMoney(500_000)} stays in the bank`)
  })

  it('write the stocks share, snapped to fives and kept in range', () => {
    const g = managed()
    const row = act(g, 'team-stocks')
    row.run(g, '40')
    expect(mandateOf(g).stocks).toBe(40)
    row.run(g, '1000')
    expect(mandateOf(g).stocks).toBe(100)
    row.run(g, '47')
    expect(mandateOf(g).stocks).toBe(45)
    row.run(g, '-30')
    expect(mandateOf(g).stocks).toBe(0)
    row.run(g, ' 55 ')
    expect(mandateOf(g).stocks).toBe(55)
    for (const junk of ['abc', '', '   ', 'NaN']) {
      row.run(g, junk)
      expect(mandateOf(g).stocks).toBe(55)
    }
    row.run(g, undefined)
    expect(mandateOf(g).stocks).toBe(55)
    // The other dials were not touched.
    expect(mandateOf(g)).toMatchObject({ reserve: 500_000, limit: 50 })
  })

  it('write the yearly limit, snapped to fives from 10 to 100', () => {
    const g = managed()
    const row = act(g, 'team-limit')
    row.run(g, '30')
    expect(mandateOf(g).limit).toBe(30)
    row.run(g, '3')
    expect(mandateOf(g).limit).toBe(10)
    row.run(g, '1000')
    expect(mandateOf(g).limit).toBe(100)
    row.run(g, '47')
    expect(mandateOf(g).limit).toBe(45)
    for (const junk of ['abc', '', ' ']) {
      row.run(g, junk)
      expect(mandateOf(g).limit).toBe(45)
    }
    expect(mandateOf(g)).toMatchObject({ stocks: 60, reserve: 500_000 })
  })

  it('write the cash to keep, in whole dollars, never above what the slider offers', () => {
    const g = managed()
    const row = act(g, 'team-reserve')
    const max = row.input!.max!
    row.run(g, '123456')
    expect(mandateOf(g).reserve).toBe(123_456)
    row.run(g, '98765.6')
    expect(mandateOf(g).reserve).toBe(98_766)
    row.run(g, '-9')
    expect(mandateOf(g).reserve).toBe(0)
    row.run(g, String(max * 10))
    expect(mandateOf(g).reserve).toBe(max)
    row.run(g, '1e99')
    expect(mandateOf(g).reserve).toBe(max)
    for (const junk of ['abc', '', ' ']) {
      row.run(g, junk)
      expect(mandateOf(g).reserve).toBe(max)
    }
    expect(mandateOf(g)).toMatchObject({ stocks: 60, limit: 50 })
  })

  it('keep a reserve that is already above the cash in range', () => {
    const g = managed(11, 2_000_000)
    g.character.money = 100_000
    const row = act(g, 'team-reserve')
    expect(row.input?.max).toBe(500_000)
    expect(row.input?.defaultValue?.(g)).toBe('500000')
    row.run(g, '9999999')
    expect(mandateOf(g).reserve).toBe(500_000)
  })

  it('stay in plain JSON and change nothing when there is no manager', () => {
    const g = managed()
    act(g, 'team-stocks').run(g, '35')
    expect(JSON.parse(JSON.stringify(g))).toEqual(g)

    const none = client(11)
    const rows = [act(managed(), 'team-stocks'), act(managed(), 'team-limit'), act(managed(), 'team-reserve')]
    for (const row of rows) row.run(none, '40')
    expect(none.flags['fin.team']).toBeUndefined()

    const heir = managed()
    heir.character.id = 'someone-else'
    for (const row of rows) row.run(heir, '40')
    expect(heir.character.id).toBe('someone-else')
    expect(readTeam(heir)).toBeNull()
  })

  it('have finite bounds and finite previews at the bottom, middle and top', () => {
    for (const g of [managed(), team(), managed(11, 0), managed(11, 5_000_000_000_000)]) {
      for (const id of ['team-stocks', 'team-reserve', 'team-limit']) {
        const input = act(g, id).input!
        expect(Number.isFinite(input.min)).toBe(true)
        expect(Number.isFinite(input.max)).toBe(true)
        expect(input.min!).toBeLessThanOrEqual(input.max!)
        const def = Number(input.defaultValue?.(g))
        expect(def).toBeGreaterThanOrEqual(input.min!)
        expect(def).toBeLessThanOrEqual(input.max!)
        for (const v of [input.min!, Math.round((input.min! + input.max!) / 2), input.max!]) {
          const text = input.preview!(g, v)
          expect(text.length, `${id}@${v}`).toBeGreaterThan(0)
          expect(text, `${id}@${v}`).not.toMatch(JUNK)
        }
      }
    }
  })

  it('preview the stocks share with the plan the year would run', () => {
    const g = managed(11, 2_000_000)
    withTeam(g, { mandate: { stocks: 60, reserve: 500_000, limit: 100 } })
    const plan = planYear(managedBook(g), { stocks: 80, reserve: 500_000, limit: 100 }, MANAGER.skill)
    expect(plan.moved).toBeGreaterThan(0)
    expect(plan.held).toBe(0)
    expect(preview(g, 'team-stocks', 80)).toBe(`80% stocks. About ${shortMoney(plan.moved)} moves this year.`)

    withTeam(g, { mandate: { stocks: 60, reserve: 500_000, limit: 10 } })
    const held = planYear(managedBook(g), { stocks: 80, reserve: 500_000, limit: 10 }, MANAGER.skill)
    expect(held.held).toBeGreaterThan(0)
    expect(preview(g, 'team-stocks', 80)).toBe(`80% stocks. About ${shortMoney(held.moved)} moves this year. The limit holds back ${shortMoney(held.held)}.`)
  })

  it('preview the cash to keep with the cash that is free to invest', () => {
    const g = managed(11, 2_000_000)
    expect(preview(g, 'team-reserve', 500_000)).toBe(`${shortMoney(500_000)} stays. ${shortMoney(1_500_000)} is free to invest.`)
    expect(preview(g, 'team-reserve', 2_000_000)).toBe(`${shortMoney(2_000_000)} stays. ${shortMoney(0)} is free to invest.`)
  })

  it('preview the limit with the most that may change hands', () => {
    const g = managed(11, 2_000_000)
    const pool = planYear(managedBook(g), { stocks: 60, reserve: 500_000, limit: 100 }, MANAGER.skill).pool
    expect(pool).toBe(1_500_000)
    expect(preview(g, 'team-limit', 40)).toBe(`Up to ${shortMoney(0.4 * pool)} changes hands. A wider limit also gives a crook more room.`)
  })
})

describe('the dials steer the year', () => {
  it('keeps the mix, the reserve and the limit the player set', () => {
    const g = managed(11, 2_000_000)
    act(g, 'team-stocks').run(g, '0')
    act(g, 'team-reserve').run(g, '1000000')
    act(g, 'team-limit').run(g, '100')
    expect(readTeam(g)!.mandate).toEqual({ stocks: 0, reserve: 1_000_000, limit: 100 })
    yearlyAdvisors(g)
    const t = readTeam(g)!
    expect(t.last?.stocks).toBe(0)
    expect(g.assets.some((a) => a.details.type === 'index')).toBe(false)
    expect(g.assets.length).toBeGreaterThan(0)
    expect(g.character.money).toBeGreaterThanOrEqual(1_000_000 - t.last!.costs - 1)
  })

  it('puts a full share into the fund and none in safe money', () => {
    const g = managed(11, 2_000_000)
    act(g, 'team-stocks').run(g, '100')
    act(g, 'team-limit').run(g, '100')
    yearlyAdvisors(g)
    expect(readTeam(g)!.last?.stocks).toBe(100)
    expect([...new Set(g.assets.map((a) => a.details.type))]).toEqual(['index'])
  })

  it('shows the statement the year just wrote on the next look', () => {
    const g = managed(11, 2_000_000)
    expect(info(g, 'team-last')).toBe('No statement yet. The first comes at year-end.')
    yearlyAdvisors(g)
    expect(info(g, 'team-last')).toMatch(/^Last year: billed /)
  })
})

describe('hostile input', () => {
  const INPUTS = ['', ' ', 'abc', 'NaN', '-1', '0', '7.5', '45', '100', '1e999', '-1e999', '99999999999999999999', '__proto__', '0x10']

  it('leaves plain JSON and a legal record, whatever a row is handed', () => {
    for (const make of [team, () => client(11), () => advised(5, 99)]) {
      const base = make()
      for (const n of flat(base)) {
        if (n.type !== 'action' || n.disabledReason?.(base)) continue
        const values = n.input ? [...INPUTS, String(n.input.min), String(n.input.max)] : [undefined]
        for (const v of values) {
          const g = structuredClone(base)
          const row = flat(g).find((x) => x.id === n.id)
          if (!row || row.type !== 'action') throw new Error(n.id)
          row.run(g, v)
          expect(JSON.parse(JSON.stringify(g)), `${n.id} ${v}`).toEqual(g)
          expect(Number.isFinite(g.character.money), `${n.id} ${v}`).toBe(true)
          const t = readTeam(g)
          if (t?.mandate) {
            expect(t.mandate.stocks % 5, `${n.id} ${v}`).toBe(0)
            expect(t.mandate.stocks).toBeGreaterThanOrEqual(0)
            expect(t.mandate.stocks).toBeLessThanOrEqual(100)
            expect(t.mandate.limit).toBeGreaterThanOrEqual(10)
            expect(t.mandate.limit).toBeLessThanOrEqual(100)
            expect(Number.isFinite(t.mandate.reserve)).toBe(true)
            expect(t.mandate.reserve).toBeGreaterThanOrEqual(0)
          }
          // Whatever happened, the menu still draws.
          for (const s of exercise(g)) expect(s.text, `${n.id} ${v} -> ${s.id}`).not.toMatch(JUNK)
        }
      }
    }
  })
})

describe('the engine fuzzer', () => {
  it('renders the whole Assets tab with a team hired and runs every Money Team row two steps deep without a failure', () => {
    const log = new FailureLog()
    const hired = team()
    own(hired, 'index', 400_000)
    own(hired, 'bond', 200_000)
    withTeam(hired, { last: LAST })
    const rows = [hired, client(12), client(7, { money: 1_000 }), advised(5, 99)].map((g) => probeActions(g, log, 3, { depth: 2, roots: (s) => moneyTeamMenu.children(s) }))
    // A hired team has rows to run; so does a rich player with offers. A poor one has only notes.
    expect(rows[0], 'hired team').toBeGreaterThanOrEqual(4)
    expect(rows[1], 'offers').toBeGreaterThanOrEqual(6)
    expect(rows[2], 'poor').toBe(0)
    expect(rows[3], 'advisor only').toBeGreaterThanOrEqual(4)
    expect(renderAll(hired, log)).toBeGreaterThan(0)
    const failures = log.list().filter((x) => !x.first.kind.startsWith('note-'))
    expect(failures.map((x) => `[${x.first.kind}] ${x.first.message.slice(0, 200)}`), formatFailures(log)).toEqual([])
  })
})

describe('the words', () => {
  function crowded(): GameState[] {
    const long = 'Z'.repeat(40)
    const rich = client(11, { money: 900_000_000_000_000 })
    withTeam(rich, { advisor: { name: long, skill: 99, since: rich.year - 1 }, manager: { name: long, skill: 90, since: rich.year - 1, claimed: 99, honest: true, rate: managerRate(99), skimmed: 0 }, mandate: { stocks: 100, reserve: 900_000_000_000_000, limit: 100 }, last: { year: rich.year - 1, pool: 900_000_000_000_000, billed: 40_000_000_000_000, moved: 900_000_000_000_000, costs: 1, stocks: 100 } })
    const poor = client(7, { money: 1_000 })
    return [team(), rich, poor, client(11), advised(5, 99), client(11, { countryId: 'jp' })]
  }

  it('is short, plain and free of em-dashes and junk', () => {
    for (const g of crowded()) {
      for (const s of exercise(g)) {
        expect(s.text, `${s.id} ${s.kind}`).not.toMatch(JUNK)
        expect(s.text, `${s.id} ${s.kind}`).not.toContain('—')
        expect(s.text, `${s.id} ${s.kind}`).not.toContain('–')
        const limit = s.kind === 'subtitle' ? 120 : s.kind.startsWith('preview') ? 240 : 140
        expect(s.text.length, `${s.id} ${s.kind}: ${s.text}`).toBeLessThanOrEqual(limit)
      }
    }
  })

  it('never uses the purple talent hint', () => {
    for (const g of crowded()) {
      for (const n of [moneyTeamMenu as MenuNode, ...flat(g)]) expect('hint' in n, n.id).toBe(false)
    }
  })

  it('has unique ids and an emoji on every row', () => {
    for (const g of crowded()) {
      const all = ids(g)
      expect(new Set(all).size).toBe(all.length)
      for (const n of flat(g)) if (n.type === 'action' || n.type === 'menu') expect(n.emoji, n.id).toBeTruthy()
    }
  })

  it('keeps every action open and every confirm a question', () => {
    for (const g of crowded()) {
      for (const n of flat(g)) {
        if (n.type !== 'action') continue
        expect(n.stayOpen, n.id).toBe(true)
        const c = n.confirm?.(g)
        if (c) expect(c.endsWith('.') || c.endsWith('?') || c.includes('?'), n.id).toBe(true)
      }
    }
  })
})

describe('old saves and damaged records', () => {
  it('shows the menu of a game with no record, and of one with junk in the record', () => {
    const plain = client(11)
    const junk = client(11)
    junk.flags['fin.team'] = 'x'
    const array = client(11)
    array.flags['fin.team'] = [1, 2]
    const foreign = client(11)
    foreign.flags['fin.team'] = { owner: 'someone:1900', advisor: { name: 'Eve', skill: 90, since: 2020 } }
    const want = ids(plain)
    for (const g of [junk, array, foreign]) {
      expect(ids(g)).toEqual(want)
      expect(exercise(g).some((s) => s.id === 'team-advisor')).toBe(false)
    }
  })

  it('shows nothing of a parent’s team to an heir', () => {
    const g = team()
    g.character.id = 'the-heir'
    expect(ids(g)).not.toContain('team-advisor')
    expect(ids(g)).not.toContain('team-manager')
    expect(ids(g)).toContain('team-meet-advisor')
  })

  it('reads a record with out-of-range fields as the nearest legal one', () => {
    const g = team()
    const t = g.flags['fin.team'] as Record<string, unknown>
    t.mandate = { stocks: 47, limit: 3, reserve: -9 }
    const said = exercise(g)
    expect(said.length).toBeGreaterThan(8)
    for (const s of said) expect(s.text, `${s.id} ${s.kind}`).not.toMatch(JUNK)
    expect(subtitle(g, 'team-stocks')).toBe('45% stocks, the rest in bonds or savings')
    expect(subtitle(g, 'team-limit')).toBe('10% of the pool may move a year')
  })
})
