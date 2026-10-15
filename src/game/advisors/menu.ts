// Assets, Business & Investments, Money Team: where an adult hires a financial advisor (who reviews the money and
// never forecasts) and a financial manager (who keeps the stated mix of stock funds, bonds and savings every
// year for a fee), reads the advisor's findings and sets the manager's three dials.
//
// Like every menu it is a pure function of state: nothing here reads or advances g.rng, and it renders from a
// deep-frozen game. The rows are rebuilt on every render, but each action reads the state it runs on, not the
// state it was built from: a hire goes through `hire`, which rebuilds the offer, and a dial reads the record
// again and writes it back through `writeTeam`. No row sets `hint` (the purple line belongs to talents).
import { formatMoney, inPrison, shortMoney } from '../core'
import { typicalIncome } from '../events/wealth-core'
import { managedBook } from '../investments'
import type { GameState, MenuAction, MenuGroup, MenuNode } from '../types'
import { defaultMandate, planYear, readMandate, type Mandate } from './mandate'
import { shownFindings } from './review'
import { advisorFee, hire, hireBlock, managerFee, managerRate, offersFor, ratingLabel, readTeam, release, vet, writeTeam, type ManagerHire, type Offer, type Role, type Statement, type Team } from './team'

const money = formatMoney

/** The same ceiling `readMandate` puts on a reserve. */
const CEILING = 1e15
/** The stocks share moves in fives from 0 to 100. */
const STOCKS = { min: 0, max: 100, step: 5 } as const
/** The yearly limit moves in fives from 10 to 100. */
const LIMIT = { min: 10, max: 100, step: 5 } as const

/** A percent with up to two decimals and no trailing zeros: 0.0085 gives '0.85%', 0.01 gives '1%'. */
function pct(x: number): string {
  const v = Number.isFinite(x) ? Math.min(Math.abs(x), 1e7) * 100 : 0
  return `${Number(v.toFixed(2))}%`
}

/** A whole percent for a slider value, kept in the slider's own range. */
function whole(v: number, lo: number, hi: number): number {
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : lo
}

// ---------------------------------------------------------------------------
// The manager's record, read fresh

interface Running {
  manager: ManagerHire
  mandate: Mandate
}

/** The hired manager and the mandate they work to, or null when there is none (an heir, a damaged record, nobody hired). */
function running(g: GameState): Running | null {
  const team = readTeam(g)
  if (!team?.manager) return null
  return { manager: team.manager, mandate: team.mandate ?? defaultMandate(managedBook(g), typicalIncome(g)) }
}

/** The most the cash-to-keep slider offers: whichever is more, the reserve already set or the cash in the bank. */
function reserveMax(g: GameState, reserve: number): number {
  const cash = Number.isFinite(g.character.money) ? g.character.money : 0
  return Math.min(CEILING, Math.max(1, Math.floor(Math.max(reserve, cash))))
}

/** The number a slider handed over, or null for anything that is not one (blank text, words, NaN). */
function parse(raw: string | undefined): number | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null
  const n = Number(raw)
  return Number.isNaN(n) ? null : n
}

/**
 * Write one dial of the mandate from a slider's text: snapped and clamped to the slider's range, ignored when it is
 * not a number or when nobody is hired. Goes through `readMandate` (stocks and limit in fives) and `writeTeam`.
 */
function setDial(g: GameState, key: keyof Mandate, raw: string | undefined): void {
  const n = parse(raw)
  if (n === null) return
  const team = readTeam(g)
  if (!team?.manager) return
  const now = team.mandate ?? defaultMandate(managedBook(g), typicalIncome(g))
  const next = readMandate({ ...now, [key]: n })
  if (!next) return
  next.reserve = Math.min(next.reserve, reserveMax(g, now.reserve))
  team.mandate = next
  writeTeam(g, team)
}

// ---------------------------------------------------------------------------
// Hiring and letting go

/** The person in `slot` of this year's offers, as the state has them now. */
function offerAt(g: GameState, role: Role, slot: number): Offer | undefined {
  return offersFor(g, role)[slot]
}

function advisorRow(offer: Offer): MenuAction {
  const { slot } = offer
  const fee = (g: GameState, o: Offer): string => money(advisorFee(g, o.skill))
  return {
    type: 'action',
    id: `team-hire-advisor-${slot}`,
    label: `Hire ${offer.name}`,
    emoji: '💼',
    subtitle: (g) => {
      const o = offerAt(g, 'advisor', slot)
      return o ? `${ratingLabel(o.skill)} · about ${fee(g, o)} a year` : ''
    },
    disabledReason: (g) => hireBlock(g, 'advisor'),
    confirm: (g) => {
      const o = offerAt(g, 'advisor', slot)
      return o ? `Hire ${o.name} for about ${fee(g, o)} a year? The fee comes out at year-end.` : null
    },
    run: (g) => {
      hire(g, 'advisor', slot)
    },
    stayOpen: true,
  }
}

function managerRow(offer: Offer): MenuAction {
  const { slot } = offer
  return {
    type: 'action',
    id: `team-hire-manager-${slot}`,
    label: `Hire ${offer.name}`,
    emoji: '💼',
    subtitle: (g) => {
      const o = offerAt(g, 'manager', slot)
      return o ? `${ratingLabel(o.claimed)} · ${pct(managerRate(o.claimed))} a year` : ''
    },
    disabledReason: (g) => hireBlock(g, 'manager'),
    confirm: (g) => {
      const o = offerAt(g, 'manager', slot)
      if (!o) return null
      return `Hire ${o.name}? They run your stock funds and safe money for ${pct(managerRate(o.claimed))} a year, at least ${money(managerFee(g, 0, 0))}.`
    },
    run: (g) => {
      hire(g, 'manager', slot)
    },
    stayOpen: true,
  }
}

/** What the player's advisor says about one manager offer: the real rating and a red flag, or that they couldn't check. */
function vetLine(g: GameState, o: Offer): string {
  const v = vet(g, o)
  if (!v) return `Your advisor couldn't check ${o.name}.`
  return `Your advisor checked ${o.name} and rates them ${ratingLabel(v.skill)}. ${v.flagged ? 'Red flag: padded bills at a past firm.' : 'No red flags.'}`
}

const meetAdvisors: MenuGroup = {
  type: 'menu',
  id: 'team-meet-advisor',
  label: 'Meet Advisors',
  emoji: '🤝',
  subtitle: 'Three want your account',
  children: (g) => offersFor(g, 'advisor').map(advisorRow),
}

const meetManagers: MenuGroup = {
  type: 'menu',
  id: 'team-meet-manager',
  label: 'Meet Managers',
  emoji: '🤝',
  subtitle: 'Three want your account',
  children: (g) => {
    const vetted = readTeam(g)?.advisor !== undefined
    const rows: MenuNode[] = []
    for (const o of offersFor(g, 'manager')) {
      rows.push(managerRow(o))
      if (vetted) rows.push({ type: 'info', id: `team-vet-${o.slot}`, emoji: '🔍', text: vetLine(g, o) })
    }
    return rows
  },
}

function letGo(role: Role): MenuAction {
  return {
    type: 'action',
    id: `team-fire-${role}`,
    label: 'Let Go',
    emoji: '🚪',
    confirm: (g) => {
      const who = readTeam(g)?.[role]
      if (!who) return null
      return `Let ${who.name} go? ${role === 'advisor' ? 'You owe nothing.' : 'Your holdings stay as they are.'}`
    },
    run: (g) => release(g, role),
    stayOpen: true,
  }
}

// ---------------------------------------------------------------------------
// The two blocks

function advisorNodes(g: GameState, team: Team | null): MenuNode[] {
  const nodes: MenuNode[] = [{ type: 'heading', id: 'team-h-advisor', label: 'Financial Advisor' }]
  if (team?.advisor) {
    const advisor = team.advisor
    const { shown, total } = shownFindings(g, advisor.skill, team.manager !== undefined)
    nodes.push(
      { type: 'info', id: 'team-advisor', emoji: '💼', text: `${advisor.name}, ${ratingLabel(advisor.skill)}. About ${money(advisorFee(g, advisor.skill))} a year.` },
      { type: 'info', id: 'team-sees', emoji: '🔎', text: total === 0 ? 'Nothing to flag right now.' : `Sees ${shown.length} of ${total} ${total === 1 ? 'issue' : 'issues'}.` },
    )
    for (const f of shown) nodes.push({ type: 'info', id: `team-f-${f.id}`, emoji: '💼', text: f.text })
    nodes.push(letGo('advisor'))
    return nodes
  }
  const block = hireBlock(g, 'advisor')
  nodes.push(block ? { type: 'info', id: 'team-advisor-block', emoji: '🔒', text: block } : meetAdvisors)
  return nodes
}

/** The statement line: what was billed on what, what moved and where the mix ended. */
function statementLine(last: Statement | undefined): string {
  if (!last) return 'No statement yet. The first comes at year-end.'
  const share = last.pool > 0 ? last.billed / last.pool : 0
  return `Last year: billed ${money(last.billed)} on ${money(last.pool)} (${pct(share)}). Moved ${money(last.moved)}. ${last.stocks}% in stocks.`
}

function stocksDial(): MenuAction {
  return {
    type: 'action',
    id: 'team-stocks',
    label: 'Stocks Share',
    emoji: '📈',
    subtitle: (g) => `${running(g)?.mandate.stocks ?? 0}% stocks, the rest in bonds or savings`,
    input: {
      kind: 'slider',
      label: 'Share in stocks',
      ...STOCKS,
      unit: '%',
      defaultValue: (g) => String(running(g)?.mandate.stocks ?? 0),
      preview: (g, v) => {
        const r = running(g)
        if (!r || managedBook(g).idle) return ''
        const stocks = whole(v, STOCKS.min, STOCKS.max)
        const plan = planYear(managedBook(g), { ...r.mandate, stocks }, r.manager.skill)
        return `${stocks}% stocks. About ${shortMoney(plan.moved)} moves this year.${plan.held > 0 ? ` The limit holds back ${shortMoney(plan.held)}.` : ''}`
      },
    },
    run: (g, input) => setDial(g, 'stocks', input),
    stayOpen: true,
  }
}

function reserveDial(g: GameState, reserve: number): MenuAction {
  return {
    type: 'action',
    id: 'team-reserve',
    label: 'Cash to Keep',
    emoji: '🏦',
    subtitle: (gg) => `${money(running(gg)?.mandate.reserve ?? 0)} stays in the bank`,
    input: {
      kind: 'slider',
      label: 'How much stays in the bank?',
      min: 0,
      max: reserveMax(g, reserve),
      money: true,
      defaultValue: (gg) => String(running(gg)?.mandate.reserve ?? 0),
      preview: (gg, v) => {
        const r = running(gg)
        if (!r || managedBook(gg).idle) return ''
        const kept = Number.isFinite(v) ? Math.max(0, v) : 0
        const plan = planYear(managedBook(gg), { ...r.mandate, reserve: kept }, r.manager.skill)
        return `${shortMoney(kept)} stays. ${shortMoney(plan.spare)} is free to invest.`
      },
    },
    run: (gg, input) => setDial(gg, 'reserve', input),
    stayOpen: true,
  }
}

function limitDial(): MenuAction {
  return {
    type: 'action',
    id: 'team-limit',
    label: 'Yearly Limit',
    emoji: '🚦',
    subtitle: (g) => `${running(g)?.mandate.limit ?? LIMIT.min}% of the pool may move a year`,
    input: {
      kind: 'slider',
      label: 'Most they may move in a year',
      ...LIMIT,
      unit: '%',
      defaultValue: (g) => String(running(g)?.mandate.limit ?? LIMIT.min),
      preview: (g, v) => {
        const r = running(g)
        if (!r || managedBook(g).idle) return ''
        const limit = whole(v, LIMIT.min, LIMIT.max)
        const plan = planYear(managedBook(g), { ...r.mandate, limit }, r.manager.skill)
        return `Up to ${shortMoney((limit * plan.pool) / 100)} changes hands. A wider limit also gives a crook more room.`
      },
    },
    run: (g, input) => setDial(g, 'limit', input),
    stayOpen: true,
  }
}

function managerNodes(g: GameState, team: Team | null): MenuNode[] {
  const nodes: MenuNode[] = [
    { type: 'heading', id: 'team-h-manager', label: 'Financial Manager' },
    { type: 'info', id: 'team-rules', emoji: '📋', text: 'Runs your stock funds, plus safe money in bonds or savings. Never your own picks or companies.' },
  ]
  if (team?.manager) {
    const manager = team.manager
    const book = managedBook(g)
    const idle = book.idle
    const mandate = team.mandate ?? defaultMandate(book, typicalIncome(g))
    nodes.push(
      { type: 'info', id: 'team-manager', emoji: '💼', text: `${manager.name}, ${ratingLabel(manager.claimed)}. Agreed fee ${pct(manager.rate)} a year of the money they run.` },
      idle
        ? { type: 'info', id: 'team-idle', emoji: '🔒', text: idle }
        : { type: 'info', id: 'team-last', emoji: '🧾', text: statementLine(team.last) },
      stocksDial(),
      reserveDial(g, mandate.reserve),
      limitDial(),
      letGo('manager'),
    )
    return nodes
  }
  const block = hireBlock(g, 'manager')
  nodes.push(block ? { type: 'info', id: 'team-manager-block', emoji: '🔒', text: block } : meetManagers)
  return nodes
}

// ---------------------------------------------------------------------------
// The menu

export const moneyTeamMenu: MenuGroup = {
  type: 'menu',
  id: 'money-team',
  label: 'Money Team',
  emoji: '💼',
  subtitle: (g) => {
    const team = readTeam(g)
    const hired = [team?.advisor ? `Advisor: ${team.advisor.name}` : '', team?.manager ? `Manager: ${team.manager.name}` : ''].filter(Boolean)
    return hired.length ? hired.join(' · ') : 'Hire an advisor or a manager'
  },
  visible: (g) => g.character.alive && g.character.age >= 18 && !inPrison(g),
  header: () => 'An advisor reviews your money. A manager keeps your mix. Neither picks winners.',
  children: (g) => {
    const team = readTeam(g)
    return [...advisorNodes(g, team), ...managerNodes(g, team)]
  },
}
