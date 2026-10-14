// The Yearly Dividend menu: Company > Money > Yearly Dividend. It sets, changes and clears the company's
// standing dividend rule (BizState.dividend, business/dividend-policy.ts) and previews what the rule
// would pay with the same quote the year step uses (dividend-year.ts). Everything it shows is a pure
// function of state; the only writes are the four actions, and each re-reads the company first.
import { notice } from '../core'
import type { Asset, GameState, MenuAction, MenuGroup, MenuInput, MenuNode } from '../types'
import { boardExists, boardView } from './board-state'
import { reserveDollars, runningCosts } from './board-vote'
import { managerName } from './career'
import { inGroup } from './conglomerate-state'
import { DIVIDEND_KEEP, DIVIDEND_PCT, readDividend, withPolicy, type DividendMode, type DividendPolicy } from './dividend-policy'
import { dividendFloor, dividendQuote } from './dividend-year'
import { manageBlock } from './gate'
import { bizOf, findBusiness, readBiz, type BizState } from './state'
import { clampN, money, pct } from './util'

const EMOJI = '\u{1F4E4}'
const OFF_LINE = 'Off. Pay yourself by hand, or set a yearly rule.'
const NO_RULE = 'Set a share first.'

/** The slider's own numbers: whole percents. */
const PCT_SLIDER = { min: Math.round(DIVIDEND_PCT.min * 100), max: Math.round(DIVIDEND_PCT.max * 100), step: Math.round(DIVIDEND_PCT.step * 100) }

function months(n: number): string {
  return `${n} ${n === 1 ? 'month' : 'months'}`
}

/** The rule stored on this company now, checked; null when none is set or the record is damaged. */
function ruleOf(g: GameState, id: string): DividendPolicy | null {
  const cur = findBusiness(g, id)
  return cur ? readDividend(cur.details.dividend) : null
}

/**
 * The preview line for a rule: what it would pay now on last year's books, the player's part, and what
 * stays in the company; or the one reason it would pay nothing. Pure. It uses the year step's own
 * quote, and says nothing would be paid where the year step would skip.
 */
export function ruleNote(g: GameState, a: Asset, b: BizState, p: DividendPolicy): string {
  const net = b.last && Number.isFinite(b.last.net) ? b.last.net : 0
  const q = dividendQuote(g, a, b, p, net)
  const mine = Math.round(q.pay * b.share)
  if (q.pay < 1 || mine < 1) return `Nothing would be paid now. ${q.why ?? 'It has no spare cash.'}`
  const basis = p.mode === 'profit' ? `last year's ${money(Math.max(0, net))} profit` : `${money(q.spare)} of spare cash`
  const yours = b.share < 0.999 ? `Your ${pct(b.share)} is ${money(mine)}` : `You get ${money(mine)}`
  return `On ${basis}: ${money(q.pay)} paid. ${yours}, taxed as income. ${money(Math.max(0, b.cash - q.pay))} stays in the company.`
}

/** The preview for a share slider at `v` percent in `mode`, on the company as it is now. */
function shareNote(g: GameState, a: Asset, mode: DividendMode, v: number): string {
  const cur = findBusiness(g, a.id)
  if (!cur) return ''
  const b = readBiz(g, cur)
  return ruleNote(g, cur, b, withPolicy(readDividend(b.dividend), { mode, pct: v / 100 }))
}

function keepNote(g: GameState, a: Asset, v: number): string {
  const cur = findBusiness(g, a.id)
  if (!cur) return ''
  const b = readBiz(g, cur)
  const own = Math.round((clampN(v, DIVIDEND_KEEP.min, DIVIDEND_KEEP.max) / 12) * runningCosts(b))
  const higher = boardExists(g, b) && reserveDollars(b, boardView(g, cur, b)) > own
  return `Keeps at least ${money(dividendFloor(g, cur, b, v))} in the company.${higher ? " The board's reserve is higher." : ''}`
}

/** The company this row may change right now: found, manageable and not a division of a group. */
function target(g: GameState, a: Asset): { cur: Asset; b: BizState } | null {
  const cur = findBusiness(g, a.id)
  if (!cur || manageBlock(g, cur)) return null
  const b = bizOf(g, cur)
  return inGroup(g, b) ? null : { cur, b }
}

/** A slider value as a number: null for nothing, text or a value past what a number can hold. */
function numberIn(input: string | undefined): number | null {
  const raw = String(input ?? '').trim()
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

function row(
  a: Asset,
  key: string,
  label: string,
  emoji: string,
  o: {
    subtitle: string | ((g: GameState) => string)
    visible?: (g: GameState) => boolean
    waits?: (g: GameState) => string | null
    input?: MenuInput
    run: (g: GameState, cur: Asset, b: BizState, n: number) => void
  },
): MenuAction {
  return {
    type: 'action',
    id: `biz.divpolicy.${key}.${a.id}`,
    label,
    emoji,
    subtitle: o.subtitle,
    ...(o.visible ? { visible: o.visible } : {}),
    disabledReason: (g) => manageBlock(g, a) ?? o.waits?.(g) ?? null,
    ...(o.input ? { input: o.input } : {}),
    run: (g, input) => {
      const t = target(g, a)
      if (!t || o.waits?.(g)) return
      const n = o.input ? numberIn(input) : 0
      if (n === null) return
      o.run(g, t.cur, t.b, n)
    },
  }
}

function shareRow(a: Asset, mode: DividendMode): MenuAction {
  const profit = mode === 'profit'
  return row(a, mode, profit ? 'Share of Profit' : 'Share of Spare Cash', profit ? '\u{1F4C8}' : '\u{1F4B5}', {
    subtitle: profit ? "Pay a share of each year's profit" : "Spare cash is what's left above loans and the floor",
    input: {
      kind: 'slider',
      label: profit ? "Share of the year's profit" : 'Share of spare cash',
      ...PCT_SLIDER,
      unit: '%',
      defaultValue: (g) => {
        const p = ruleOf(g, a.id)
        return String(Math.round((p && p.mode === mode ? p.pct : DIVIDEND_PCT.start) * 100))
      },
      preview: (g, v) => shareNote(g, a, mode, v),
    },
    run: (g, cur, b, n) => {
      const p = withPolicy(readDividend(b.dividend), { mode, pct: n / 100 })
      b.dividend = p
      notice(g, 'Yearly Dividend Set', `${cur.name} will pay ${pct(p.pct)} of ${profit ? "each year's profit" : 'its spare cash'} at year end, keeping ${months(p.keep)} of costs.`, { emoji: EMOJI, tone: 'neutral' })
    },
  })
}

function keepRow(a: Asset): MenuAction {
  return row(a, 'keep', 'Cash to Keep', '\u{1F3E6}', {
    subtitle: (g) => {
      const cur = findBusiness(g, a.id)
      const p = cur ? readDividend(cur.details.dividend) : null
      return cur && p ? `${months(p.keep)} of costs: ${money(dividendFloor(g, cur, readBiz(g, cur), p.keep))}` : NO_RULE
    },
    waits: (g) => (ruleOf(g, a.id) ? null : NO_RULE),
    input: {
      kind: 'slider',
      label: 'Months of costs to keep in the company',
      min: DIVIDEND_KEEP.min,
      max: DIVIDEND_KEEP.max,
      step: 1,
      unit: ' months',
      defaultValue: (g) => String(ruleOf(g, a.id)?.keep ?? DIVIDEND_KEEP.start),
      preview: (g, v) => keepNote(g, a, v),
    },
    run: (g, cur, b, n) => {
      const p = withPolicy(readDividend(b.dividend), { keep: n })
      b.dividend = p
      notice(g, 'Cash to Keep Set', `${cur.name} keeps at least ${money(dividendFloor(g, cur, b, p.keep))} in the company before it pays a dividend.`, { emoji: EMOJI, tone: 'neutral' })
    },
  })
}

function offRow(a: Asset): MenuAction {
  return row(a, 'off', 'Turn Off', '\u{26D4}', {
    subtitle: 'Back to paying yourself by hand',
    visible: (g) => ruleOf(g, a.id) !== null,
    run: (g, cur, b) => {
      if (!readDividend(b.dividend)) return
      delete b.dividend
      notice(g, 'Yearly Dividend Off', `${cur.name} won't pay a yearly dividend. You can still pay one by hand.`, { emoji: EMOJI, tone: 'neutral' })
    },
  })
}

/** The Money submenu for a company's standing dividend rule. Hidden for a division of a group. */
export function dividendMenu(a: Asset): MenuGroup {
  return {
    type: 'menu',
    id: `biz.divpolicy.${a.id}`,
    label: 'Yearly Dividend',
    emoji: EMOJI,
    visible: (g) => {
      const cur = findBusiness(g, a.id)
      return !!cur && !inGroup(g, readBiz(g, cur))
    },
    subtitle: (g) => {
      const p = ruleOf(g, a.id)
      return p ? `${pct(p.pct)} of ${p.mode === 'profit' ? "each year's profit" : 'spare cash each year'}, keeping ${months(p.keep)} of costs.` : OFF_LINE
    },
    header: (g) => `${findBusiness(g, a.id)?.name ?? a.name} pays its shareholders at each year end by this rule. Your share is taxed as income. Loans and the cash floor come first.`,
    children: (g) => {
      const cur = findBusiness(g, a.id)
      if (!cur) return []
      const b = readBiz(g, cur)
      const p = readDividend(b.dividend)
      const nodes: MenuNode[] = []
      if (p?.last) nodes.push({ type: 'info', id: `biz.divpolicy.last.${a.id}`, emoji: '\u{1F4C5}', text: `Last paid: ${money(p.last.paid)} for ${p.last.year}. Your part was ${money(p.last.mine)}.` })
      if (boardExists(g, b)) {
        const reserve = boardView(g, cur, b).limits.reserve
        nodes.push({ type: 'info', id: `biz.divpolicy.board.${a.id}`, emoji: '\u{1F3DB}\u{FE0F}', text: `The board's reserve is ${months(reserve)} of costs. The rule never pays below it, and it never needs a vote.` })
      }
      if (p && b.ceo === 'manager' && b.manager) nodes.push({ type: 'info', id: `biz.divpolicy.ceo.${a.id}`, emoji: '\u{1F454}', text: `${managerName(b.manager)} runs this company. Your rule replaces the dividends their mandate would pay.` })
      nodes.push(shareRow(a, 'profit'), shareRow(a, 'cash'), keepRow(a), offRow(a))
      return nodes
    },
  }
}
