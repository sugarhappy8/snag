// The company screen's Board rows (Leadership › Board of Directors): who sits on the board and how
// they lean, the mandate and limits the CEO works under, the last votes, and proposals to the
// board (mandate, budget, cash reserve, pay policy, CEO salary, dividend) with sliders for the
// amounts. Without a board, a company with a hired CEO gets the same controls as the owner's brief
// (no vote: the owner decides). Business talent hints: which proposals pass, and the best mandate.
import { firmCash } from '../cash'
import { earnIncome, formatMoney, log, notice } from '../core'
import { payFamilyBusinessProceeds } from './dynasty-ownership'
import { oddsLean, oddsShown } from '../fog/odds/contract'
import { hasTalent, talentHint } from '../talents'
import type { Asset, GameState, MenuAction, MenuNode } from '../types'
import {
  boardExists,
  boardOf,
  boardView,
  clampLimits,
  controlsBoard,
  directorName,
  groupOf,
  LIMIT_BOUNDS,
  mandateDef,
  MANDATES,
  ownerSeats,
  seatLabel,
  stanceLabel,
  syncSeats,
  type BoardState,
  type Limits,
  type Mandate,
} from './board-state'
import { boardAllows, boardOddsKey, capexBudget, capexLeft, needsVote, oddsText, passOdds, payableCash, payCap, payoutCash, refusedThisYear, reserveDollars, sustainablePayout, vote, type Proposal } from './board-vote'
import { bestMandate, limitsMerit, mandateMerit, outlook } from './board-ceo'
import { ceoPayNorm, managerName, STYLE_INFO, styleOf } from './career'
import { refreshValue, valuationOf } from './economy'
import { manageBlock } from './gate'
import { classFactor } from './share-classes'
import { bizOf, findBusiness, readBiz, type BizState } from './state'
import { clampN, money, pct, round2 } from './util'

type Run = (g: GameState, a: Asset, b: BizState, input?: string) => void

function act(a: Asset, key: string, label: string, emoji: string, opts: { subtitle?: string | ((g: GameState) => string); hint?: (g: GameState) => string | null; disabled?: (g: GameState, b: BizState) => string | null; confirm?: (g: GameState) => string | null; input?: MenuAction['input']; run: Run }): MenuAction {
  return {
    type: 'action',
    id: `biz.board.${key}.${a.id}`,
    label,
    emoji,
    subtitle: opts.subtitle,
    ...(opts.hint ? { hint: opts.hint } : {}),
    disabledReason: (g) => {
      const block = manageBlock(g, a)
      if (block) return block
      const cur = findBusiness(g, a.id)
      return cur && opts.disabled ? opts.disabled(g, readBiz(g, cur)) : null
    },
    confirm: opts.confirm,
    input: opts.input,
    run: (g, input) => {
      const cur = findBusiness(g, a.id)
      if (!cur || manageBlock(g, cur)) return
      opts.run(g, cur, bizOf(g, cur), input)
    },
  }
}

/** The live company behind a menu row (menus are built from a snapshot). */
function live(g: GameState, a: Asset): { a: Asset; b: BizState } | null {
  const cur = findBusiness(g, a.id)
  return cur ? { a: cur, b: readBiz(g, cur) } : null
}

function hinting(g: GameState, a: Asset): boolean {
  return hasTalent(g, 'Business') && !manageBlock(g, a)
}

/** The Business talent's read on a proposal: will it pass, and how likely. */
export function passHint(g: GameState, a: Asset, b: BizState, p: Proposal): string | null {
  if (!hinting(g, a) || !needsVote(g, a, b, p)) return null
  if (p.by === 'owner' && refusedThisYear(g, b, p.kind)) return talentHint(g, 'Business', 'The board already said no to this once this year: it will wait until next year')
  const odds = passOdds(g, a, b, p)
  const key = boardOddsKey(a, p.kind)
  const text = oddsText(odds, g, key)
  return talentHint(g, 'Business', oddsLean(g, key, odds) ? `The board will likely say yes (${text})` : `The board will likely say no (${text} to pass)`)
}

/** ' · 🔮 about 70% to pass' for a slider caption (with the Business talent, or after a read of that vote; the odds helper decides). */
function oddsCaption(g: GameState, a: Asset, b: BizState, p: Proposal): string {
  if (!needsVote(g, a, b, p)) return ''
  if (p.by === 'owner' && refusedThisYear(g, b, p.kind)) return ' \u{00B7} the board already said no this year'
  const shown = oddsShown(g, boardOddsKey(a, p.kind), () => passOdds(g, a, b, p))
  return shown ? ` \u{00B7} ${shown} to pass` : ''
}

/**
 * For spending sliders elsewhere (new sites, capacity lines, R&D): ' · needs the board' when the
 * amount is past what is left of the CEO's yearly budget, with the pass odds for the Business
 * talent. '' when no vote is needed. Pure (menus and previews).
 */
export function capexCaption(g: GameState, a: Asset, b: BizState, amount: number, gain: number): string {
  const p: Proposal = { kind: 'capex', by: 'owner', amount: Math.max(0, amount), gain: Number.isFinite(gain) ? Math.max(0, gain) : 0, label: '' }
  if (!needsVote(g, a, b, p)) return ''
  if (refusedThisYear(g, b, 'capex')) return " \u{00B7} past this year's budget, and the board already said no to more this year"
  const shown = oddsShown(g, boardOddsKey(a, p.kind), () => passOdds(g, a, b, p))
  return ` \u{00B7} past this year's budget: needs the board${shown ? ` (${shown} to pass)` : ''}`
}

// ---------------------------------------------------------------------------
// Shared money moves (manage.ts Money rows use them too)

/**
 * The money move of a dividend of `n`, already checked against payoutCash and the board (the
 * manual dividend and the yearly rule both end here): cash leaves the company, the player's share
 * is taxed as income, relatives are paid, a listed company's price falls by the payout per share at its
 * structure's factor (the price already carries it, share-classes.ts) and the value is marked again.
 * Says nothing to the player. Returns the player's part.
 */
export function payOut(g: GameState, a: Asset, b: BizState, n: number): number {
  firmCash(g, b, -n, 'dividend', a.id)
  const mine = Math.round(n * b.share)
  earnIncome(g, mine, 'dividend')
  payFamilyBusinessProceeds(g, b, n, true)
  if (b.public && b.sharesOut > 0) {
    b.sharePrice = round2(Math.max(0.05, b.sharePrice - (n / b.sharesOut) * classFactor(b)))
    b.valuation = Math.round(b.sharePrice * b.sharesOut)
  } else b.valuation = valuationOf(b)
  refreshValue(a, b)
  return mine
}

/**
 * Pay a dividend of `amount` from company cash (at most what can leave the company): above the
 * cash the reserve can spare, the board votes first. The owner's share is taxed as income; a
 * listed company's share price drops by the payout. Returns true when it was paid.
 */
export function payDividend(g: GameState, a: Asset, b: BizState, amount: number): boolean {
  const n = Math.round(clampN(amount, 0, payoutCash(a, b)))
  if (n <= 0) return false
  if (!boardAllows(g, a, b, { kind: 'dividend', by: 'owner', amount: n, label: `Pay a ${money(n)} dividend` })) return false
  const mine = payOut(g, a, b, n)
  log(g, `I paid myself ${money(mine)} from ${a.name}.`, 'good')
  notice(g, 'Payday', `${a.name} paid out ${formatMoney(n)}${b.share < 1 ? `; your ${pct(b.share)} share is ${formatMoney(mine)}` : ''}. It will be taxed as income at the end of the year.`, { emoji: '\u{1F4E4}', tone: 'good' })
  return true
}

// ---------------------------------------------------------------------------
// Proposals

function mandateAction(a: Asset, m: Mandate, viaBoard: boolean): MenuAction {
  const def = mandateDef(m)
  const proposal = (g: GameState, aa: Asset, b: BizState, st: BoardState): Proposal => ({ kind: 'mandate', by: 'owner', mandate: m, label: `Change the mandate to ${def.label}`, merit: mandateMerit(g, aa, b, st.mandate, m) })
  return act(a, `mandate.${m}`, `${def.label}`, def.emoji, {
    subtitle: (g) => {
      const x = live(g, a)
      const cur = x ? boardView(g, x.a, x.b).mandate : 'balanced'
      return `${cur === m ? 'Current mandate: ' : ''}${def.brief}`
    },
    hint: (g) => {
      const x = live(g, a)
      if (!x || !hinting(g, x.a)) return null
      const st = boardView(g, x.a, x.b)
      const best = bestMandate(g, x.a, x.b) === m
      const odds = viaBoard && st.mandate !== m ? passOdds(g, x.a, x.b, proposal(g, x.a, x.b, st)) : null
      if (!best && odds === null) return null
      const key = boardOddsKey(x.a, 'mandate')
      const parts = [best ? (st.mandate === m ? 'Best mandate for this company now: keep it' : 'Best mandate for this company now') : '', odds !== null ? `${best ? 'the board' : 'The board'} ${oddsLean(g, key, odds) ? 'would likely approve' : 'would likely refuse'} (${oddsText(odds, g, key)})` : '']
      return talentHint(g, 'Business', parts.filter(Boolean).join('; '))
    },
    disabled: (g, b) => (boardView(g, a, b).mandate === m ? 'This is already the mandate.' : viaBoard && refusedThisYear(g, b, 'mandate') ? 'The board already turned down a new mandate this year. Try again next year.' : null),
    run: (g, aa, b) => {
      const st = boardOf(b)
      syncSeats(g, aa, b, st)
      if (st.mandate === m) return
      if (viaBoard && !vote(g, aa, b, proposal(g, aa, b, st)).passed) return
      st.mandate = m
      st.limits = clampLimits({}, def.limits)
      if (!viaBoard) notice(g, 'New Mandate', `You told ${aa.name}'s CEO to ${def.brief}. The budget, reserve and pay policy were reset to match.`, { emoji: def.emoji })
    },
  })
}

function limitAction(a: Asset, key: keyof Limits, viaBoard: boolean): MenuAction {
  const meta: Record<keyof Limits, { label: string; ask: string; short: string; emoji: string; unit: (v: number) => string; scale: number; step: number }> = {
    capex: { label: "Set the CEO's Budget", ask: "Yearly budget (% of the company's value)", short: 'Spending budget', emoji: '\u{1F3D7}\u{FE0F}', unit: (v) => `${Math.round(v)}% of the company's value a year`, scale: 100, step: 1 },
    reserve: { label: 'Set the Cash Reserve', ask: 'Months of running costs to keep in cash', short: 'Cash reserve', emoji: '\u{1F3E6}', unit: (v) => `${v} month${v === 1 ? '' : 's'} of running costs`, scale: 1, step: 1 },
    pay: { label: 'Set the CEO Pay Policy', ask: 'Most a CEO may earn (% of the going rate)', short: 'CEO pay policy', emoji: '\u{1F4B5}', unit: (v) => `up to ${Math.round(v)}% of the going rate for a CEO`, scale: 100, step: 25 },
  }
  const x = meta[key]
  const next = (st: BoardState, v: number): Limits => clampLimits({ ...st.limits, [key]: v / x.scale }, st.limits)
  const proposal = (g: GameState, aa: Asset, b: BizState, st: BoardState, v: number): Proposal => {
    const l = next(st, v)
    return { kind: 'limits', by: 'owner', limits: l, label: `${x.short}: ${x.unit(v)}`, merit: limitsMerit(g, aa, b, st, l) }
  }
  const caption = (g: GameState, v: number): string => {
    const y = live(g, a)
    if (!y) return ''
    const st = boardView(g, y.a, y.b)
    const l = next(st, v)
    const money0 = key === 'capex' ? `about ${money(capexBudget(y.b, { ...st, limits: l }))} a year` : key === 'reserve' ? `keep at least ${money(reserveDollars(y.b, { ...st, limits: l }))}` : `${money(payCap(y.b, { ...st, limits: l }))} a year`
    return `${x.unit(v)} \u{00B7} ${money0}${viaBoard ? oddsCaption(g, y.a, y.b, proposal(g, y.a, y.b, st, v)) : ''}`
  }
  return act(a, `limit.${key}`, x.label, x.emoji, {
    disabled: (g, b) => (viaBoard && refusedThisYear(g, b, 'limits') ? 'The board already turned down new limits this year. Try again next year.' : null),
    subtitle: (g) => {
      const y = live(g, a)
      if (!y) return ''
      const st = boardView(g, y.a, y.b)
      return key === 'capex' ? `${money(capexBudget(y.b, st))} a year (${money(capexLeft(g, y.b, st))} left this year)` : key === 'reserve' ? `${st.limits.reserve} months: keep ${money(reserveDollars(y.b, st))}` : `CEO pay up to ${money(payCap(y.b, st))} a year (${Math.round(st.limits.pay * 100)}% of the norm)`
    },
    hint: (g) => {
      const y = live(g, a)
      // The planner's investment search only covers price-and-production companies.
      if (!y || !hinting(g, y.a) || key !== 'capex' || !outlook(g, y.a, y.b).modeled) return null
      const st = boardView(g, y.a, y.b)
      // The smallest budget that funds what pays back (the CEO's own investment search), and
      // whether it passes; when the current one already does, say so.
      const cur = Math.round(st.limits.capex * 100)
      const top = limitsMerit(g, y.a, y.b, st, st.limits)
      let best = cur
      let bestM = top
      for (let v = 0; v <= 100; v += 5) {
        const m = limitsMerit(g, y.a, y.b, st, next(st, v))
        if (m > bestM + 0.05) {
          bestM = m
          best = v
        }
      }
      if (best === cur) return talentHint(g, 'Business', 'The budget already covers everything worth building right now')
      const odds = viaBoard ? passOdds(g, y.a, y.b, proposal(g, y.a, y.b, st, best)) : 1
      return talentHint(g, 'Business', `Best budget: about ${best}% of the company's value a year${viaBoard ? ` (the board: ${oddsText(odds, g, boardOddsKey(y.a, 'limits'))} to pass)` : ''}`)
    },
    input: {
      kind: 'slider',
      label: x.ask,
      unit: x.scale === 100 ? '%' : '',
      min: Math.round(LIMIT_BOUNDS[key].min * x.scale),
      max: Math.round(LIMIT_BOUNDS[key].max * x.scale),
      step: x.step,
      defaultValue: (g) => {
        const y = live(g, a)
        return String(Math.round((y ? boardView(g, y.a, y.b).limits[key] : 0) * x.scale))
      },
      preview: (g, v) => caption(g, v),
    },
    run: (g, aa, b, input) => {
      const v = Number(input)
      if (!Number.isFinite(v)) return
      const st = boardOf(b)
      syncSeats(g, aa, b, st)
      const l = next(st, v)
      if (l[key] === st.limits[key]) return
      if (viaBoard && !vote(g, aa, b, proposal(g, aa, b, st, v)).passed) return
      st.limits = l
      if (!viaBoard) notice(g, 'Brief Updated', `${aa.name}'s CEO now works with ${x.unit(v)}.`, { emoji: x.emoji })
    },
  })
}

/** Raise the hired CEO's salary (a vote above the pay policy when there is a board). */
function ceoSalaryAction(a: Asset, b0: BizState): MenuAction {
  return act(a, 'ceoSalary', "Raise the CEO's Salary", '\u{1F4B0}', {
    subtitle: (g) => {
      const y = live(g, a)
      const m = y?.b.manager
      return m ? `${managerName(m)} earns ${money(m.salary)} a year${m.bonus ? ` (+${money(m.bonus)} bonus last year)` : ''}` : ''
    },
    disabled: (_g, b) => (b.ceo !== 'manager' || !b.manager ? 'There is no hired CEO.' : null),
    input: {
      kind: 'slider',
      money: true,
      label: 'New yearly salary',
      min: Math.max(1, Math.round(b0.manager?.salary ?? 1)),
      max: Math.max(2, Math.round(b0.manager?.salary ?? 1) + 1, Math.round(ceoPayNorm(b0) * 5)),
      step: Math.max(1, Math.round(ceoPayNorm(b0) / 100)),
      defaultValue: (g) => {
        const y = live(g, a)
        return String(Math.round((y?.b.manager?.salary ?? 1) * 1.1))
      },
      preview: (g, v) => {
        const y = live(g, a)
        if (!y || !y.b.manager) return ''
        const st = boardView(g, y.a, y.b)
        const norm = ceoPayNorm(y.b)
        const p: Proposal = { kind: 'ceoPay', by: 'owner', amount: v, skill: y.b.manager.skill, label: '' }
        return `${pct(v / Math.max(1, norm))} of the going rate \u{00B7} ${v > payCap(y.b, st) && boardExists(g, y.b) ? 'needs the board' : 'within the pay policy'}${oddsCaption(g, y.a, y.b, p)}`
      },
    },
    run: (g, aa, b, input) => {
      const m = b.manager
      if (!m || b.ceo !== 'manager') return
      const n = Math.round(clampN(Number(input), m.salary, Math.max(m.salary, ceoPayNorm(b) * 5)))
      if (!(n > m.salary)) return
      if (!boardAllows(g, aa, b, { kind: 'ceoPay', by: 'owner', amount: n, skill: m.skill, label: `Raise ${managerName(m)}'s pay to ${money(n)} a year` })) return
      m.salary = n
      b.morale = clampN(b.morale + 1, 0, 100)
      notice(g, 'CEO Raise', `${managerName(m)} now earns ${formatMoney(n)} a year running ${aa.name}. Rivals will find it harder to lure ${m.gender === 'female' ? 'her' : 'him'} away.`, { emoji: '\u{1F4B0}', tone: 'good' })
    },
  })
}

function dividendAction(a: Asset, b0: BizState): MenuAction {
  return act(a, 'dividend', 'Propose a Dividend', '\u{1F4E4}', {
    subtitle: (g) => {
      const y = live(g, a)
      if (!y) return ''
      const st = boardView(g, y.a, y.b)
      return `${money(sustainablePayout(y.a, y.b, st))} can go without a vote \u{00B7} you get ${pct(y.b.share)} of any payout`
    },
    disabled: (_g, b) => (payoutCash(a, b) <= 0 ? (payableCash(a, b) > 0 ? `The investors' ${money(b.pref ?? 0)} comes back to them first: the company must be worth more than that before cash goes to the shareholders.` : b.debt > 0 ? `The company owes ${money(b.debt)}: its lenders come first.` : 'The company has no spare cash.') : null),
    input: {
      kind: 'slider',
      money: true,
      label: 'Total payout',
      min: 1,
      max: Math.max(2, payoutCash(a, b0)),
      defaultValue: (g) => {
        const y = live(g, a)
        if (!y) return '1'
        return String(Math.max(1, sustainablePayout(y.a, y.b, boardView(g, y.a, y.b))))
      },
      preview: (g, v) => {
        const y = live(g, a)
        if (!y) return ''
        const st = boardView(g, y.a, y.b)
        const p: Proposal = { kind: 'dividend', by: 'owner', amount: v, label: '' }
        return `your ${pct(y.b.share)}: ${money(v * y.b.share)} (taxed as income) \u{00B7} ${v > sustainablePayout(y.a, y.b, st) ? 'dips into the reserve: needs the board' : 'within the spare cash'}${oddsCaption(g, y.a, y.b, p)}`
      },
    },
    run: (g, aa, b, input) => {
      payDividend(g, aa, b, Number(input) || 0)
    },
  })
}

// ---------------------------------------------------------------------------
// Rows

function proposalNodes(a: Asset, b0: BizState, viaBoard: boolean, managed: boolean): MenuNode[] {
  const nodes: MenuNode[] = [
    {
      type: 'menu',
      id: `biz.board.mandates.${a.id}`,
      label: viaBoard ? 'Propose a New Mandate' : 'Set the Mandate',
      emoji: '\u{1F9ED}',
      subtitle: (g) => {
        const y = live(g, a)
        return y ? `Now: ${mandateDef(boardView(g, y.a, y.b).mandate).label}` : ''
      },
      disabledReason: (g) => manageBlock(g, a),
      hint: (g) => {
        const y = live(g, a)
        if (!y || !hinting(g, y.a)) return null
        const best = bestMandate(g, y.a, y.b)
        if (!best) return null
        const cur = boardView(g, y.a, y.b).mandate
        return talentHint(g, 'Business', best === cur ? `${mandateDef(cur).label} is the best mandate for this company now` : `Best mandate now: ${mandateDef(best).label}`)
      },
      header: (g) => {
        const y = live(g, a)
        if (!y) return ''
        return viaBoard ? 'The mandate tells the CEO what the shareholders want. Changing it takes a board vote.' : 'Tell your CEO what you want from the company. The budget, reserve and pay policy reset to suit it; adjust them after.'
      },
      children: () => MANDATES.map((m) => mandateAction(a, m.id, viaBoard)),
    },
    limitAction(a, 'capex', viaBoard),
    limitAction(a, 'reserve', viaBoard),
    limitAction(a, 'pay', viaBoard),
  ]
  if (managed) nodes.push(ceoSalaryAction(a, b0))
  if (viaBoard) nodes.push(dividendAction(a, b0))
  return nodes
}

function seatEmoji(seat: string): string {
  return seat === 'owner' ? '\u{1F464}' : seat === 'group' ? '\u{1F3E2}' : seat === 'investor' ? '\u{1F4BC}' : '\u{2696}\u{FE0F}'
}

/** Leadership › Board of Directors (members, mandate, votes, proposals). [] without a board. */
export function boardMenuNodes(g: GameState, a: Asset): MenuNode[] {
  const cur = findBusiness(g, a.id)
  if (!cur) return []
  const b = readBiz(g, cur)
  if (!boardExists(g, b)) return []
  const managed = b.ceo === 'manager' && !!b.manager
  return [
    {
      type: 'menu',
      id: `biz.board.${a.id}`,
      label: 'Board of Directors',
      emoji: '\u{1F3DB}\u{FE0F}',
      subtitle: (gg) => {
        const y = live(gg, a)
        if (!y) return ''
        const st = boardView(gg, y.a, y.b)
        return `${st.members.length} seats \u{00B7} ${ownerSeats(st)} yours \u{00B7} mandate: ${mandateDef(st.mandate).label}`
      },
      disabledReason: (gg) => (findBusiness(gg, a.id) ? null : 'You no longer own this business.'),
      hint: (gg) => {
        const y = live(gg, a)
        if (!y || !hinting(gg, y.a)) return null
        const best = bestMandate(gg, y.a, y.b)
        const st = boardView(gg, y.a, y.b)
        return best && best !== st.mandate ? talentHint(gg, 'Business', `This company would do better under a ${mandateDef(best).label} mandate`) : null
      },
      header: (gg) => {
        const y = live(gg, a)
        if (!y) return ''
        const st = boardView(gg, y.a, y.b)
        const control = controlsBoard(st)
        const group = groupOf(gg, y.b)
        const why = y.b.public
          ? `${y.a.name} is listed: the exchange requires independent directors, and they answer to every shareholder.`
          : y.b.share < 0.999
            ? `Outside investors own ${pct(1 - y.b.share)} of ${y.a.name}.`
            : `${y.a.name} belongs to ${group?.name ?? 'your group'}: the group's people fill your seats on its board.`
        return `${why} ${control ? `Your people hold ${ownerSeats(st)} of ${st.members.length} seats, so you usually get your way, but not always.` : `You hold ${ownerSeats(st)} of ${st.members.length} seats: the others can outvote you, and even fire you as CEO.`}\n${mandateLineFor(y.a, y.b, st)}`
      },
      children: (gg) => {
        const y = live(gg, a)
        if (!y) return []
        const st = boardView(gg, y.a, y.b)
        const nodes: MenuNode[] = [{ type: 'heading', id: `biz.board.membersH.${a.id}`, label: 'Members' }]
        st.members.forEach((d) =>
          nodes.push({ type: 'info', id: `biz.board.m.${a.id}.${d.key}`, emoji: seatEmoji(d.seat), text: `${directorName(d)} \u{00B7} ${seatLabel(d.seat)} \u{00B7} ${stanceLabel(d.stance)}${d.seat === 'owner' || d.seat === 'group' ? '' : ` \u{00B7} goodwill ${d.loyalty}%`}` }),
        )
        nodes.push({ type: 'heading', id: `biz.board.propH.${a.id}`, label: 'Propose to the Board' })
        nodes.push(...proposalNodes(y.a, y.b, true, managed))
        nodes.push({
          type: 'info',
          id: `biz.board.exitNote.${a.id}`,
          emoji: '\u{1F91D}',
          text: `${y.b.public ? 'Mergers' : 'Selling the company, going public and mergers'} go to the board too (from Exit), and so does pay or spending past the limits above.`,
        })
        nodes.push({ type: 'heading', id: `biz.board.votesH.${a.id}`, label: 'Recent Votes' })
        if (!st.votes.length) nodes.push({ type: 'info', id: `biz.board.novotes.${a.id}`, emoji: '\u{1F5F3}\u{FE0F}', text: 'No votes yet.' })
        ;[...st.votes].reverse().forEach((v, i) =>
          nodes.push({ type: 'info', id: `biz.board.v.${a.id}.${i}`, emoji: v.passed ? '\u{2705}' : '\u{274C}', text: `${v.year}: ${v.what} \u{2014} ${v.passed ? 'passed' : 'rejected'} ${v.yes}\u{2013}${v.no}${v.note ? ` (${v.note})` : ''}` }),
        )
        return nodes
      },
    },
  ]
}

function mandateLineFor(a: Asset, b: BizState, st: BoardState): string {
  const def = mandateDef(st.mandate)
  const spare = sustainablePayout(a, b, st)
  return `${def.emoji} Mandate: ${def.label} (${def.brief}). The CEO may spend ${money(capexBudget(b, st))} a year on new sites, capacity and R&D, must keep ${money(reserveDollars(b, st))} in cash and may earn up to ${money(payCap(b, st))} a year.${spare > 0 ? ` ${money(spare)} could be paid out now.` : ''}`
}

/**
 * The owner's brief for a hired CEO when there is no board: the same mandate and limits, set
 * directly. [] when the company has a board (the Board rows cover it) or nobody is hired.
 */
export function briefNodes(g: GameState, a: Asset): MenuNode[] {
  const cur = findBusiness(g, a.id)
  if (!cur) return []
  const b = readBiz(g, cur)
  if (boardExists(g, b) || b.ceo !== 'manager' || !b.manager) return []
  return [
    {
      type: 'menu',
      id: `biz.brief.${a.id}`,
      label: "The CEO's Brief",
      emoji: '\u{1F4CB}',
      subtitle: (gg) => {
        const y = live(gg, a)
        if (!y) return ''
        const st = boardView(gg, y.a, y.b)
        return `Mandate: ${mandateDef(st.mandate).label} \u{00B7} budget ${money(capexBudget(y.b, st))} a year`
      },
      disabledReason: (gg) => manageBlock(gg, a),
      hint: (gg) => {
        const y = live(gg, a)
        if (!y || !hinting(gg, y.a)) return null
        const best = bestMandate(gg, y.a, y.b)
        return best && best !== boardView(gg, y.a, y.b).mandate ? talentHint(gg, 'Business', `Your CEO would do better with a ${mandateDef(best).label} mandate`) : null
      },
      header: (gg) => {
        const y = live(gg, a)
        if (!y || !y.b.manager) return ''
        const m = y.b.manager
        const st = boardView(gg, y.a, y.b)
        return `You own all of ${y.a.name}, so ${managerName(m)} (${STYLE_INFO[styleOf(m)].label.toLowerCase()}) answers to you alone. ${mandateLineFor(y.a, y.b, st)}${st.memo.length ? `\nLast letter: ${st.memo.slice(0, 3).join(' ')}` : ''}`
      },
      children: (gg) => {
        const y = live(gg, a)
        return y ? proposalNodes(y.a, y.b, false, true) : []
      },
    },
  ]
}
