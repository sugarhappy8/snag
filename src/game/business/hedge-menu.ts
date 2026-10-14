// Investments > Hedge Funds: the row, the screen of your Personal and Family funds, the relatives' screen
// and the cash-at-work screen of a company. It lays out what hedge-fund.ts and hedge-company.ts do and
// registers with investments.ts through registerHedgeFunds, so the engine file imports nothing from
// business/. The fund is also an Asset, so the same screen shows under Assets (ASSET_KIND_VIEWS).
//
// Every row, screen and preview here is a pure read of the game state: it never writes to it and never
// touches g.rng, so the menus can be rebuilt as often as the app likes and render from a frozen state.
// Menus held across an action show stale nodes (the actions keep the screen open), so every closure
// finds its asset again by id and reads its record through readHedge or readCompanyHedge.
import { formatMoney, fullName, relationLabel, shortMoney } from '../core'
import { minTrade, registerHedgeFunds } from '../investments'
import type { Asset, GameState, MenuAction, MenuGroup, MenuInfo, MenuNode } from '../types'
import { companyBlock, companyQuote, companyTerms, eligibleCompanies, setCompanyFund, type CompanyQuote } from './hedge-company'
import { callHint } from './fund-events'
import { CALLS, leaderSkill, STRATEGIES } from './fund-model'
import type { HedgeStrategy, MacroCall } from './fund-state'
import { signed } from './fund-text'
import { manageBlock } from './gate'
import { candidates, closeFund, fundsOf, invite, payOutHolder, putBlock, putIn, setFundCall, setFundStrategy, startBlock, startFund, takeOut, takeQuote } from './hedge-fund'
import { macroBlock, marketBlock, personBlock, seedMin, skillOf, strategyBlock, vehicleOutlook } from './hedge-model'
import { HEDGE_STRATEGY_IDS, MACRO_CALL_IDS, readCompanyHedge, readHedge, RUNNING_COST, unitPrice, unitsValue, type CompanyHedge, type HedgeFund } from './hedge-record'
import { businessAssets, findBusiness, readBiz, type BizState } from './state'
import { clampN, money, pct } from './util'

const EMOJI = '🦈'
const GONE = 'You no longer own this.'
const DAMAGED = 'The books for this fund are damaged.'
const CHOOSE_NOTE = 'Your strategy for next year.'
const CALL_NOTE = 'One view on next year, then back to Long/Short'
const AUTO_NOTE = "While you don't run it, its strategy is picked for you."
const NO_COMPANY = 'None of your companies can run a fund yet.'

/** What a company with no record yet is set to. */
const NO_RECORD: CompanyHedge = { v: 1, target: 0, strategy: 'longShort', call: 'flat', lev: 1, total: 0 }

function fin(x: number): number {
  return Number.isFinite(x) ? x : 0
}

function info(id: string, text: string, emoji?: string): MenuInfo {
  return { type: 'info', id, text, ...(emoji ? { emoji } : {}) }
}

function goneRow(id: string): MenuInfo {
  return info(`hf-${id}-gone`, GONE)
}

// ---------------------------------------------------------------------------
// Reading a fund

/** Every Asset that is a hedge fund, readable or not, in asset order. */
function hedgeAssets(g: GameState): Asset[] {
  return g.assets.filter((a) => a.kind === 'investment' && a.details.type === 'hedge')
}

/**
 * The record as the actions see it: a holder entry that is the player (a relative who inherited the
 * fund) is the player's own units, with the cost stepped up to their value. Returns `f` itself when
 * there is none. Pure.
 */
function mergedFor(g: GameState, f: HedgeFund): HedgeFund {
  const own = f.holders.filter((h) => h.id === g.character.id)
  if (!own.length) return f
  const units = own.reduce((sum, h) => sum + h.units, 0)
  return { ...f, holders: f.holders.filter((h) => h.id !== g.character.id), mine: f.mine + units, cost: f.cost + unitsValue(f, units) }
}

interface Live {
  a: Asset
  /** Null when the books are damaged. */
  f: HedgeFund | null
}

/** The fund asset now in the game with this id, and its record. Null when it is gone or is not a fund. */
function liveFund(g: GameState, id: string): Live | null {
  const a = g.assets.find((x) => x.id === id && x.kind === 'investment' && x.details.type === 'hedge')
  if (!a) return null
  const f = readHedge(a.details.hf)
  return { a, f: f ? mergedFor(g, f) : null }
}

/** What your units are worth. */
function valueOf(f: HedgeFund): number {
  return Math.round(fin(unitsValue(f, f.mine)))
}

/** Why an action on a fund can't be taken now (`ok` says what to check on a fund that reads fine), or null. */
function fundBlock(g: GameState, id: string, ok: (f: HedgeFund) => string | null): string | null {
  const l = liveFund(g, id)
  if (!l) return GONE
  return l.f ? ok(l.f) : DAMAGED
}

// ---------------------------------------------------------------------------
// Your Personal and Family funds

/** The one-line summary of a fund, for its row and for Assets. */
export function fundSubtitle(g: GameState, a: Asset): string {
  const live = liveFund(g, a.id)
  const cur = live ? live.a : a
  const f = live ? live.f : readHedge(a.details.hf)
  if (!f) return `${shortMoney(fin(cur.value))} · books damaged`
  return `${shortMoney(valueOf(f))} · ${STRATEGIES[f.strategy].label} · ${f.owner === 'family' ? 'family' : 'personal'} fund`
}

function strategyText(strategy: HedgeStrategy, call: MacroCall, lev: number): string {
  return `Strategy: ${STRATEGIES[strategy].label}${strategy === 'macro' ? ` · ${CALLS[call].label} at ${lev}x` : ''}`
}

function putAction(g: GameState, id: string): MenuAction {
  const min = Math.max(1, minTrade(g))
  const max = Math.max(min, Math.floor(fin(g.character.money)))
  return {
    type: 'action',
    id: `hf-put-${id}`,
    label: 'Put In More',
    emoji: '💵',
    disabledReason: (gg) => fundBlock(gg, id, (f) => putBlock(gg, f) ?? (fin(gg.character.money) < minTrade(gg) ? `You need ${money(minTrade(gg))} in the bank.` : null)),
    input: {
      kind: 'slider',
      money: true,
      label: `How much goes in? You have ${formatMoney(fin(g.character.money))}.`,
      min,
      max,
      defaultValue: () => String(Math.round(min + (max - min) / 4)),
      roundDefault: true,
      preview: (gg, dollars) => {
        const f = liveFund(gg, id)?.f
        const price = f ? unitPrice(f) : 0
        if (!f || !(price > 0)) return ''
        const d = Math.max(0, fin(dollars))
        const bought = d / price
        const share = (f.mine + bought) / (f.units + bought)
        return Number.isFinite(share) ? `You'd own ${pct(share, 1)} of a ${money(f.nav + d)} fund.` : ''
      },
    },
    run: (gg, input) => {
      putIn(gg, id, Number(input))
    },
    stayOpen: true,
  }
}

function takeAction(id: string): MenuAction {
  return {
    type: 'action',
    id: `hf-take-${id}`,
    label: 'Take Out',
    emoji: '💸',
    subtitle: 'Gains are taxed when you take them out',
    disabledReason: (gg) => fundBlock(gg, id, (f) => putBlock(gg, f)),
    input: {
      kind: 'slider',
      label: 'Percent of your share',
      min: 1,
      max: 100,
      step: 1,
      unit: '%',
      defaultValue: () => '10',
      preview: (gg, percent) => {
        const f = liveFund(gg, id)?.f
        if (!f) return ''
        const q = takeQuote(gg, f, clampN(fin(percent) / 100, 0, 1))
        const closes = q.closes ? ` That closes the fund.${q.relatives > 0 ? ` Relatives get ${money(q.relatives)}.` : ''}` : ''
        return `About ${money(q.gross)} before ${money(q.tax)} tax.${closes}`
      },
    },
    run: (gg, input) => {
      takeOut(gg, id, Number(input) / 100)
    },
    stayOpen: true,
  }
}

function strategyMenu(id: string): MenuGroup {
  return {
    type: 'menu',
    id: `hf-strategy-${id}`,
    label: 'Strategy',
    emoji: '♟️',
    subtitle: (gg) => {
      const f = liveFund(gg, id)?.f
      return f ? STRATEGIES[f.strategy].label : ''
    },
    header: () => CHOOSE_NOTE,
    children: (gg) => {
      const f = liveFund(gg, id)?.f
      if (!f) return [liveFund(gg, id) ? info(`hf-${id}-damaged`, DAMAGED) : goneRow(id)]
      return HEDGE_STRATEGY_IDS.map((s): MenuAction => ({
        type: 'action',
        id: `hf-strategy-${id}-${s}`,
        label: `${STRATEGIES[s].label}${f.strategy === s ? ' ✓' : ''}`,
        emoji: STRATEGIES[s].emoji,
        subtitle: STRATEGIES[s].blurb,
        disabledReason: (g2) => fundBlock(g2, id, (cur) => strategyBlock(g2, cur.countryId, s) ?? (cur.strategy === s ? 'Already your strategy.' : null)),
        run: (g2) => {
          setFundStrategy(g2, id, s)
        },
        stayOpen: true,
      }))
    },
  }
}

function callMenu(id: string, f: HedgeFund): MenuGroup {
  const macro = f.strategy === 'macro'
  return {
    type: 'menu',
    id: `hf-call-${id}`,
    label: macro ? `Market Call: ${CALLS[f.call].emoji} ${CALLS[f.call].label}` : 'Market Call',
    emoji: '🎯',
    subtitle: CALL_NOTE,
    disabledReason: (gg) => fundBlock(gg, id, () => macroBlock(gg)),
    children: (gg) => {
      const cur = liveFund(gg, id)?.f
      if (!cur) return [liveFund(gg, id) ? info(`hf-${id}-damaged`, DAMAGED) : goneRow(id)]
      return MACRO_CALL_IDS.map((c): MenuAction => ({
        type: 'action',
        id: `hf-call-${id}-${c}`,
        label: `${CALLS[c].label}${cur.strategy === 'macro' && cur.call === c ? ' ✓' : ''}`,
        emoji: CALLS[c].emoji,
        subtitle: CALLS[c].blurb,
        disabledReason: (g2) => fundBlock(g2, id, () => macroBlock(g2)),
        hint: (g2) => {
          const live = liveFund(g2, id)?.f
          return live ? callHint(g2, { countryId: live.countryId }, c) || null : null
        },
        run: (g2) => {
          setFundCall(g2, id, c)
        },
        stayOpen: true,
      }))
    },
  }
}

function leverageAction(id: string, f: HedgeFund): MenuAction {
  return {
    type: 'action',
    id: `hf-lev-${id}`,
    label: 'Leverage',
    emoji: '🏋️',
    subtitle: 'Borrow to bet bigger on your call',
    visible: (gg) => liveFund(gg, id)?.f?.strategy === 'macro',
    disabledReason: (gg) => fundBlock(gg, id, () => macroBlock(gg)),
    input: {
      kind: 'slider',
      label: 'Leverage',
      min: 1,
      max: 3,
      step: 0.5,
      unit: 'x',
      defaultValue: (gg) => String(liveFund(gg, id)?.f?.lev ?? f.lev),
      preview: (_gg, x) => `A 10% market move becomes about ${Math.round(fin(x) * 10)}% for the fund, before borrowing costs.`,
    },
    run: (gg, input) => {
      const cur = liveFund(gg, id)?.f
      // A stale slider must not turn Macro on.
      if (cur && cur.strategy === 'macro') setFundCall(gg, id, cur.call, Number(input))
    },
    stayOpen: true,
  }
}

function familyMenu(id: string): MenuGroup {
  return {
    type: 'menu',
    id: `hf-family-${id}`,
    label: 'Family',
    emoji: '👪',
    subtitle: (gg) => {
      const n = liveFund(gg, id)?.f?.holders.length ?? 0
      return n ? `${n} ${n === 1 ? 'relative' : 'relatives'} in the fund` : 'Relatives can put money in'
    },
    children: (gg) => familyNodes(gg, id),
  }
}

function familyNodes(g: GameState, id: string): MenuNode[] {
  const live = liveFund(g, id)
  if (!live) return [goneRow(id)]
  if (!live.f) return [info(`hf-${id}-damaged`, DAMAGED)]
  const f = live.f
  const nodes: MenuNode[] = [{ type: 'heading', id: `hf-family-${id}-h-in`, label: 'In the fund' }]
  if (!f.holders.length) nodes.push(info(`hf-family-${id}-none`, 'No relatives in the fund yet.'))
  for (const h of f.holders) {
    const p = g.people.find((x) => x.id === h.id)
    const value = Math.round(fin(unitsValue(f, h.units)))
    const share = f.units > 0 ? h.units / f.units : 0
    nodes.push(info(`hf-family-${id}-r-${h.id}`, `${p ? `${fullName(p)} (${relationLabel(p)})` : 'A former contact'}: ${money(value)}, ${pct(fin(share), 1)}`))
    if (!p) continue
    nodes.push({
      type: 'action',
      id: `hf-payout-${id}-${p.id}`,
      label: `Pay Out ${p.firstName}`,
      emoji: '💸',
      subtitle: `They get ${money(value)}`,
      disabledReason: (gg) => {
        const cur = gg.people.find((x) => x.id === p.id)
        return fundBlock(gg, id, () => (cur && cur.alive ? null : "They've died. Their part passes on at your next birthday."))
      },
      run: (gg) => {
        payOutHolder(gg, id, p.id)
      },
      stayOpen: true,
    })
  }
  nodes.push({ type: 'heading', id: `hf-family-${id}-h-invite`, label: 'Invite' })
  const list = candidates(g, f)
  if (!list.length) nodes.push(info(`hf-family-${id}-no-invite`, 'No relatives to invite.'))
  for (const c of list) {
    const pid = c.person.id
    nodes.push({
      type: 'action',
      id: `hf-invite-${id}-${pid}`,
      label: `Invite ${c.person.firstName}`,
      emoji: '🤝',
      subtitle: c.why ?? `Puts in ${money(c.amount)}`,
      disabledReason: (gg) =>
        fundBlock(gg, id, (cur) => {
          const blocked = putBlock(gg, cur)
          if (blocked) return blocked
          const now = candidates(gg, cur).find((x) => x.person.id === pid)
          return now ? now.why : "They can't join now."
        }),
      run: (gg) => {
        invite(gg, id, pid)
      },
      stayOpen: true,
    })
  }
  return nodes
}

function closeAction(id: string): MenuAction {
  return {
    type: 'action',
    id: `hf-close-${id}`,
    label: 'Close Fund',
    emoji: '🔒',
    disabledReason: (gg) => fundBlock(gg, id, (f) => putBlock(gg, f)),
    confirm: (gg) => {
      const l = liveFund(gg, id)
      if (!l?.f) return null
      const q = takeQuote(gg, l.f, 1)
      return `Close ${l.a.name}? You get about ${money(q.gross)} before tax.${q.relatives > 0 ? ` Relatives get ${money(q.relatives)}.` : ''}`
    },
    run: (gg) => {
      closeFund(gg, id)
    },
    stayOpen: true,
  }
}

/** The screen of one fund: your share, the strategy, last year, and what you can do. */
export function fundView(g: GameState, a: Asset): MenuNode[] {
  const live = liveFund(g, a.id)
  if (!live) return [goneRow(a.id)]
  const { f } = live
  const id = live.a.id
  if (!f) return [info(`hf-${id}-damaged`, DAMAGED)]
  const share = f.units > 0 ? f.mine / f.units : 1
  const texts = [
    `Your share: ${money(valueOf(f))}${f.holders.length ? ` of ${money(f.nav)} (${pct(fin(share), 1)})` : ''}`,
    strategyText(f.strategy, f.call, f.lev),
    f.last ? `${f.last.year}: fund ${signed(f.last.net)}, market ${signed(f.last.market)}.` : 'No year booked yet.',
  ]
  const nodes: MenuNode[] = texts.map((text, n) => info(`hf-${id}-i${n}`, text))
  nodes.push(putAction(g, id), takeAction(id), strategyMenu(id), callMenu(id, f))
  if (f.strategy === 'macro') nodes.push(leverageAction(id, f))
  if (f.owner === 'family') nodes.push(familyMenu(id))
  nodes.push(closeAction(id))
  return nodes
}

function fundNode(a: Asset): MenuGroup {
  return {
    type: 'menu',
    id: `inv-hedge-${a.id}`,
    label: a.name,
    emoji: EMOJI,
    subtitle: (gg) => fundSubtitle(gg, a),
    children: (gg) => fundView(gg, a),
  }
}

function startAction(g: GameState, owner: 'person' | 'family'): MenuAction {
  const min = seedMin(g)
  const max = Math.max(min, Math.floor(fin(g.character.money)))
  return {
    type: 'action',
    id: `hf-start-${owner}`,
    label: owner === 'person' ? 'Start a Personal Fund' : 'Start a Family Fund',
    emoji: EMOJI,
    subtitle: `From ${money(min)} · you run it`,
    disabledReason: (gg) => startBlock(gg, owner) ?? (fin(gg.character.money) < seedMin(gg) ? `You need ${money(seedMin(gg))} in the bank.` : null),
    input: {
      kind: 'slider',
      money: true,
      label: `How much goes in? You have ${formatMoney(fin(g.character.money))}.`,
      min,
      max,
      defaultValue: () => String(Math.round(min + (max - min) / 4)),
      roundDefault: true,
      preview: (_gg, dollars) => `${money(fin(dollars))} goes in. ${owner === 'person' ? 'You own all of it.' : 'Relatives can join later.'}`,
    },
    run: (gg, input) => {
      startFund(gg, owner, Number(input))
    },
    stayOpen: true,
  }
}

// ---------------------------------------------------------------------------
// Company funds

interface CoView {
  a: Asset
  b: BizState
  /** Null when the company has no record, or a damaged one. */
  h: CompanyHedge | null
}

function coView(g: GameState, id: string): CoView | null {
  const a = findBusiness(g, id)
  if (!a) return null
  const b = readBiz(g, a)
  return { a, b, h: readCompanyHedge(b.hedge) }
}

/** Why the company's fund can't be changed now, or null. */
function coBlock(g: GameState, id: string): string | null {
  const v = coView(g, id)
  return v ? (manageBlock(g, v.a) ?? companyBlock(g, v.a, v.b)) : GONE
}

function coLastText(h: CompanyHedge | null): string {
  const l = h?.last
  if (!l) return 'No year booked yet.'
  if (l.work > 0) return `${l.year}: fund ${signed(l.net)} on ${money(l.work)}, ${l.pnl >= 0 ? '+' : '-'}${money(Math.abs(l.pnl))}.`
  return l.why ?? `${l.year}: no cash went to work.`
}

function coTargetAction(id: string, v: CoView, q: CompanyQuote): MenuAction {
  const max = Math.max(1, fin(q.spare))
  const target = v.h?.target ?? 0
  return {
    type: 'action',
    id: `hf-co-target-${id}`,
    label: 'Cash at Work',
    emoji: '💵',
    subtitle: target > 0 ? `Target ${money(target)} at year end` : 'Set an amount to put to work',
    disabledReason: (gg) => coBlock(gg, id),
    input: {
      kind: 'slider',
      money: true,
      label: 'How much goes to work at year end?',
      min: 0,
      max,
      defaultValue: (gg) => {
        const cur = coView(gg, id)
        if (!cur) return '0'
        const room = Math.max(1, fin(companyQuote(gg, cur.a, cur.b, 0).spare))
        return String(Math.round(clampN(cur.h?.target ?? 0, 0, room)))
      },
      preview: (gg, dollars) => {
        const cur = coView(gg, id)
        if (!cur) return ''
        const work = Math.max(0, fin(dollars))
        const t = companyTerms(gg, cur.a, cur.b, cur.h ?? NO_RECORD, work)
        const o = vehicleOutlook(t.strategy, { countryId: cur.b.countryId, skill: skillOf(leaderSkill(gg, cur.b)), nav: work, lev: t.lev })
        return `In an average year about ${money(work * o.expected)}. A bad year could lose ${money(work * Math.min(0.95, o.swing * 2.5))}.`
      },
    },
    run: (gg, input) => {
      setCompanyFund(gg, id, { target: Number(input) })
    },
    stayOpen: true,
  }
}

function coStrategyMenu(id: string, cur: HedgeStrategy): MenuGroup {
  return {
    type: 'menu',
    id: `hf-co-strategy-${id}`,
    label: 'Strategy',
    emoji: '♟️',
    subtitle: STRATEGIES[cur].label,
    header: () => CHOOSE_NOTE,
    children: (gg) => {
      const v = coView(gg, id)
      if (!v) return [goneRow(id)]
      const now = (v.h ?? NO_RECORD).strategy
      return HEDGE_STRATEGY_IDS.map((s): MenuAction => ({
        type: 'action',
        id: `hf-co-strategy-${id}-${s}`,
        label: `${STRATEGIES[s].label}${now === s ? ' ✓' : ''}`,
        emoji: STRATEGIES[s].emoji,
        subtitle: STRATEGIES[s].blurb,
        disabledReason: (g2) => {
          const w = coView(g2, id)
          return coBlock(g2, id) ?? (w ? (strategyBlock(g2, w.b.countryId, s) ?? ((w.h ?? NO_RECORD).strategy === s ? 'Already your strategy.' : null)) : GONE)
        },
        run: (g2) => {
          setCompanyFund(g2, id, { strategy: s })
        },
        stayOpen: true,
      }))
    },
  }
}

function coCallMenu(id: string, cur: CompanyHedge): MenuGroup {
  const macro = cur.strategy === 'macro'
  return {
    type: 'menu',
    id: `hf-co-call-${id}`,
    label: macro ? `Market Call: ${CALLS[cur.call].emoji} ${CALLS[cur.call].label}` : 'Market Call',
    emoji: '🎯',
    subtitle: CALL_NOTE,
    disabledReason: (gg) => coBlock(gg, id) ?? macroBlock(gg),
    children: (gg) => {
      const v = coView(gg, id)
      if (!v) return [goneRow(id)]
      const now = v.h ?? NO_RECORD
      return MACRO_CALL_IDS.map((c): MenuAction => ({
        type: 'action',
        id: `hf-co-call-${id}-${c}`,
        label: `${CALLS[c].label}${now.strategy === 'macro' && now.call === c ? ' ✓' : ''}`,
        emoji: CALLS[c].emoji,
        subtitle: CALLS[c].blurb,
        disabledReason: (g2) => coBlock(g2, id) ?? macroBlock(g2),
        hint: (g2) => {
          const w = coView(g2, id)
          return w ? callHint(g2, { countryId: w.b.countryId }, c) || null : null
        },
        run: (g2) => {
          setCompanyFund(g2, id, { call: c })
        },
        stayOpen: true,
      }))
    },
  }
}

function coLeverageAction(id: string, cur: CompanyHedge): MenuAction {
  return {
    type: 'action',
    id: `hf-co-lev-${id}`,
    label: 'Leverage',
    emoji: '🏋️',
    subtitle: 'Borrow to bet bigger on your call',
    visible: (gg) => coView(gg, id)?.h?.strategy === 'macro',
    disabledReason: (gg) => coBlock(gg, id) ?? macroBlock(gg),
    input: {
      kind: 'slider',
      label: 'Leverage',
      min: 1,
      max: 3,
      step: 0.5,
      unit: 'x',
      defaultValue: (gg) => String(coView(gg, id)?.h?.lev ?? cur.lev),
      preview: (_gg, x) => `A 10% market move becomes about ${Math.round(fin(x) * 10)}% for the fund, before borrowing costs.`,
    },
    run: (gg, input) => {
      // A stale slider must not turn Macro on.
      if (coView(gg, id)?.h?.strategy === 'macro') setCompanyFund(gg, id, { lev: Number(input) })
    },
    stayOpen: true,
  }
}

function coStopAction(id: string): MenuAction {
  return {
    type: 'action',
    id: `hf-co-stop-${id}`,
    label: 'Stop',
    emoji: '🛑',
    subtitle: 'Nothing goes to work at year end',
    disabledReason: (gg) => coBlock(gg, id) ?? ((coView(gg, id)?.h?.target ?? 0) > 0 ? null : 'Nothing is set to work.'),
    run: (gg) => {
      setCompanyFund(gg, id, { target: 0 })
    },
    stayOpen: true,
  }
}

function companyScreen(g: GameState, id: string): MenuNode[] {
  const v = coView(g, id)
  if (!v) return [goneRow(id)]
  const cur = v.h ?? NO_RECORD
  const q = companyQuote(g, v.a, v.b, cur.target)
  const texts = [
    `Cash at work: ${money(q.work)} of ${money(q.spare)} spare.`,
    `The company keeps ${money(q.floor)}.`,
    strategyText(cur.strategy, cur.call, cur.lev),
    coLastText(v.h),
  ]
  if (companyTerms(g, v.a, v.b, cur, q.work).auto) texts.push(AUTO_NOTE)
  texts.push("The cash stays on the company's books.")
  const nodes: MenuNode[] = texts.map((text, n) => info(`hf-co-${id}-i${n}`, text))
  nodes.push(coTargetAction(id, v, q), coStrategyMenu(id, cur.strategy), coCallMenu(id, cur))
  if (cur.strategy === 'macro') nodes.push(coLeverageAction(id, cur))
  nodes.push(coStopAction(id))
  return nodes
}

/** The row for one company, and the screen behind it. */
export function companyFundNode(a: Asset): MenuGroup {
  const id = a.id
  return {
    type: 'menu',
    id: `inv-hedge-co-${id}`,
    label: a.name,
    emoji: a.emoji || EMOJI,
    subtitle: (gg) => {
      const v = coView(gg, id)
      if (!v) return ''
      const work = companyQuote(gg, v.a, v.b, v.h?.target ?? 0).work
      return `${work > 0 ? `${money(work)} at work` : 'Not in use'} · ${pct(fin(v.b.share))} yours`
    },
    children: (gg) => companyScreen(gg, id),
  }
}

// ---------------------------------------------------------------------------
// The row

function rowSubtitle(g: GameState): string {
  let count = 0
  let sum = 0
  for (const a of hedgeAssets(g)) {
    count++
    const f = readHedge(a.details.hf)
    sum += f ? valueOf(mergedFor(g, f)) : fin(a.value)
  }
  for (const a of businessAssets(g)) if ((readCompanyHedge(a.details.hedge)?.target ?? 0) > 0) count++
  if (!count) return 'Personal, family and company funds'
  return `${count} ${count === 1 ? 'fund' : 'funds'}${sum > 0 ? ` · ${shortMoney(sum)}` : ''}`
}

function rowChildren(g: GameState): MenuNode[] {
  const nodes: MenuNode[] = [{ type: 'heading', id: 'hf-h-yours', label: 'Your Funds' }]
  const rows = fundsOf(g)
  for (const owner of ['person', 'family'] as const) {
    const have = rows.filter((r) => r.f.owner === owner)
    if (have.length) for (const r of have) nodes.push(fundNode(r.a))
    else nodes.push(startAction(g, owner))
  }
  // A fund whose books are damaged is still yours: show it, so its screen can say so.
  for (const a of hedgeAssets(g)) if (!readHedge(a.details.hf)) nodes.push(fundNode(a))
  nodes.push({ type: 'heading', id: 'hf-h-co', label: 'Company Funds' })
  const cos = eligibleCompanies(g)
  if (cos.length) for (const { a } of cos) nodes.push(companyFundNode(a))
  else nodes.push(info('hf-co-none', NO_COMPANY))
  return nodes
}

/** Investments > Hedge Funds. Absent for a minor and for the dead. */
export function hedgeRow(g: GameState): MenuGroup | null {
  const c = g.character
  if (!c.alive || !(c.age >= 18)) return null
  return {
    type: 'menu',
    id: 'inv-hedge',
    label: 'Hedge Funds',
    emoji: EMOJI,
    subtitle: rowSubtitle,
    disabledReason: (gg) => marketBlock(gg, gg.character.countryId) ?? personBlock(gg),
    header: () => `Funds you run pay no fee, only ${pct(RUNNING_COST, 1)} a year to run. A Macro call lasts one year.`,
    children: rowChildren,
  }
}

registerHedgeFunds({ row: hedgeRow, view: fundView, subtitle: fundSubtitle })
