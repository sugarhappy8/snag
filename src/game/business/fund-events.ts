// Investment firms 2.0: the yearly report popup, story events with choices, and the regulators.
// Popups resolve in script handlers that re-check the live company; arrests and closures happen
// only when the player answers, never in the middle of the yearly business loop.
import { addHidden, addStat, count, log, notice, remember, scriptChoice, spend } from '../core'
import { arrestPlayer } from '../crime'
import { marketInstinct } from '../invest/instinct'
import { chance, pick, randFloat, weightedPick } from '../rng'
import { defineScript } from '../scripts'
import { hasTalent, talentHint } from '../talents'
import type { Asset, ChoiceOption, GameState, Json } from '../types'
import { getCountry } from '../world'
import { declareBankruptcy } from './exit'
import { followOnPopup, liveFund, raisePopup, setCall, setStrategy, setStyle } from './fund-actions'
import { brokerEra, CALLS, exchangeOf, fundSkill, indexLabel, marketYearOf, quantBlock, STRATEGIES, STYLES, styleBlock } from './fund-model'
import { strategyOutlook, styleOutlook } from './fund-outlook'
import { readFund, saveFund, type FundState, type FundStyle, type HedgeStrategy, type MacroCall } from './fund-state'
import { fundLine, inflationNote, newsLine, rankText, signed } from './fund-text'
import { gutRead, openPitches, pitchesFor, readLabel, raiseQuote, roman, uniqueName } from './fund-vc'
import { leadershipPower } from './leadership'
import { bizOf, findBusiness, type BizState } from './state'
import { clampN, money, pct, rec, str, units } from './util'

const REPORT_TITLE = (a: Asset) => `${a.name}: Financial Institution Report`

// ---------------------------------------------------------------------------
// The yearly report (owner-CEO)

export const STYLE_PICK = defineScript('fund.report.style', (g, choice, data) => {
  const id = str(rec(data)?.assetId)
  if (choice !== 'keep' && choice in STYLES) setStyle(g, id, choice as FundStyle)
})

export const STRATEGY_PICK = defineScript('fund.report.strategy', (g, choice, data) => {
  const id = str(rec(data)?.assetId)
  const x = liveFund(g, id)
  if (!x || x.f.type !== 'hedge') return
  const next = choice === 'keep' ? x.f.strategy : choice as HedgeStrategy
  if (!(next in STRATEGIES)) return
  if (next !== x.f.strategy && !setStrategy(g, id, next)) return
  if (next === 'macro') callPopup(g, x.a)
})

export const CALL_PICK = defineScript('fund.report.call', (g, choice, data) => {
  if (choice in CALLS) setCall(g, str(rec(data)?.assetId), choice as MacroCall)
})

/** The Investing talent's gut read on the firm's own market (honest; null without the talent). */
export function gutCall(g: GameState, b: Pick<BizState, 'countryId'>): MacroCall | 'unsure' | null {
  const inst = marketInstinct(g)
  if (!inst || inst.exKey !== exchangeOf(b.countryId).key) return null
  return inst.market === 'up' ? 'bull' : inst.market === 'down' ? 'bear' : 'unsure'
}

export function callHint(g: GameState, b: Pick<BizState, 'countryId'>, call: MacroCall): string {
  const gut = gutCall(g, b)
  if (!gut) return ''
  const index = indexLabel(b.countryId, g.year + 1)
  if (gut === call) return talentHint(g, 'Investing', call === 'bull' ? `Your gut says the ${index} should climb next year` : `Your gut says the ${index} looks shaky next year`)
  if (gut === 'unsure' && call === 'flat') return talentHint(g, 'Investing', `Your gut can’t read the ${index} next year`)
  return ''
}

function callPopup(g: GameState, a: Asset): void {
  const b = bizOf(g, a), f = readFund(b)
  const choices: ChoiceOption[] = (Object.keys(CALLS) as MacroCall[]).map(c => {
    const hint = callHint(g, b, c)
    return { id: c, label: `${CALLS[c].emoji} ${CALLS[c].label}: ${CALLS[c].blurb.toLowerCase()}`, ...(hint ? { hint } : {}) }
  })
  scriptChoice(g, CALL_PICK, 'Your Market Call', `Macro bets the whole fund on one view of the ${indexLabel(b.countryId, g.year + 1)} next year, at ${f.lev.toFixed(1)}× leverage (change it on the dashboard). Wrong calls hurt.`,
    choices, { emoji: '🎯', data: { assetId: a.id } as Json })
}

function styleChoices(g: GameState, b: BizState, f: FundState): ChoiceOption[] {
  const out: ChoiceOption[] = []
  for (const s of [f.style, ...(Object.keys(STYLES) as FundStyle[]).filter(x => x !== f.style)]) {
    if (s !== f.style && styleBlock(s, b.countryId, g.year)) continue
    const o = styleOutlook(g, b, f, s)
    const hint = talentHint(g, 'Business', `Expect to beat ~${pct(o.rank)} of peers; clients ${signed(o.flow, 0)} a year`)
    out.push({ id: s === f.style ? 'keep' : s, label: `${s === f.style ? 'Keep' : 'Switch to'} ${STYLES[s].emoji} ${STYLES[s].label}${s === f.style ? '' : `: ${STYLES[s].blurb}`}`, ...(hint ? { hint } : {}) })
  }
  return out
}

function strategyChoices(g: GameState, b: BizState, f: FundState): ChoiceOption[] {
  const out: ChoiceOption[] = []
  for (const s of [f.strategy, ...(Object.keys(STRATEGIES) as HedgeStrategy[]).filter(x => x !== f.strategy)]) {
    if (s !== f.strategy && s === 'quant' && quantBlock(b.countryId, g.year)) continue
    const o = strategyOutlook(g, b, f, s)
    const hint = s === 'macro' ? talentHint(g, 'Business', 'Macro is a market call: your edge is the call itself') : talentHint(g, 'Business', `About ${signed(o.expected, 0)} a year before fees, swings ±${pct(o.swing)}`)
    out.push({ id: s === f.strategy ? 'keep' : s, label: `${s === f.strategy ? 'Keep' : 'Switch to'} ${STRATEGIES[s].emoji} ${STRATEGIES[s].label}${s === f.strategy ? '' : `: ${STRATEGIES[s].blurb}`}`, ...(hint ? { hint } : {}) })
  }
  return out
}

/** The owner-CEO's short yearly report (one popup with next year's decision). */
export function fundReport(g: GameState, a: Asset, b: BizState): void {
  const f = readFund(b), s = b.last
  if (!s) return
  const profit = `Fees ${money(f.last.fees)} · profit ${money(s.net)} · cash ${money(b.cash)}`
  const news = f.last.news.map(c => newsLine(f, c)).filter(Boolean)
  const lines: string[] = []
  if (f.type === 'asset' || f.type === 'hedge') {
    const head = f.type === 'asset' ? `${STYLES[f.style].emoji} ${STYLES[f.style].label} fund · ${s.year}` : `${STRATEGIES[f.strategy].emoji} ${STRATEGIES[f.strategy].label} · ${s.year}`
    lines.push(head, `Clients ${signed(f.last.ret)} after fees · ${indexLabel(b.countryId, marketYearOf(s.year))} ${signed(f.last.market)}`)
    if (f.last.rank >= 0) lines.push(`Your fund ${rankText(f.last.rank)}.`)
    lines.push(`AUM ${money(f.aum)} (${f.last.flow >= 0 ? 'new money' : 'withdrawals'} ${money(Math.abs(f.last.flow))})`, profit)
    if (f.type === 'hedge' && f.last.own) lines.push(`Your firm’s own capital ${f.last.own >= 0 ? 'made' : 'lost'} ${money(Math.abs(f.last.own))}.`)
    const note = inflationNote(b, s.year)
    if (note) lines.push(note)
  } else if (f.type === 'broker') {
    lines.push(`🧾 ${s.year} · ${units(f.accounts)} accounts (${f.last.flow >= 0 ? '+' : '−'}${units(Math.abs(f.last.flow))}) · ${units(f.last.trades)} trades`, `Revenue ${money(f.last.fees)} · profit ${money(s.net)} · cash ${money(b.cash)}`)
    const norm = brokerEra(b.countryId, g.year).normCommission
    if (f.commission > norm * 1.5 + .0005) lines.push(`💡 Rivals now charge about ${pct(norm, 2)} a trade. Your ${pct(f.commission, 2)} is driving clients away.`)
  } else {
    lines.push(`🦄 ${s.year} · fees ${money(f.last.fees - f.last.carry)} · carry ${money(f.last.carry)} · profit ${money(s.net)}`)
    lines.push(...f.funds.filter(x => !x.done).slice(-3).map(x => fundLine(f, x.n, g.year)))
    const waiting = openPitches(g, b, f, g.year).length
    if (waiting) lines.push(`🎤 ${waiting} founders are waiting to pitch you (see the dashboard).`)
  }
  if (f.last.opLoss > 0) lines.push(`⚠️ An operational slip cost ${money(f.last.opLoss)}.`)
  lines.push(...news.slice(0, 5))
  const text = lines.join('\n')
  const tone = s.net >= 0 ? 'good' : 'bad'
  if (f.type === 'asset') scriptChoice(g, STYLE_PICK, REPORT_TITLE(a), `${text}\nPick next year’s style:`, styleChoices(g, b, f), { emoji: a.emoji, data: { assetId: a.id } as Json })
  else if (f.type === 'hedge') scriptChoice(g, STRATEGY_PICK, REPORT_TITLE(a), `${text}\nNext year’s strategy:`, strategyChoices(g, b, f), { emoji: a.emoji, data: { assetId: a.id } as Json })
  else notice(g, REPORT_TITLE(a), text, { emoji: a.emoji, tone })
  if (f.type === 'vc') vcPopups(g, a, b, f)
  fundYearlyChecks(g, b, a)
  maybeFundEvent(g, a, b)
}

function vcPopups(g: GameState, a: Asset, b: BizState, f: FundState): void {
  let shown = 0
  for (const code of f.last.news) {
    if (shown >= 2 || !code.startsWith('u:')) continue
    const c = f.cos.find(s => s.id === code.slice(2))
    if (!c) continue
    shown++
    addStat(g, 'happiness', 4)
    count(g, 'unicorns')
    notice(g, `${c.emoji} Unicorn!`, `${c.name} is now valued at ${money(c.status === 'exit' ? c.got / Math.max(1e-9, c.own) : c.val)}. Fund ${roman(c.fund)} put in ${money(c.cost)}${c.status === 'exit' ? ` and got back ${money(c.got)}` : ` and owns ${(c.own * 100).toFixed(1)}%`}. Your 20% carry starts once LPs have their money back.`, { emoji: '🦄', tone: 'good' })
  }
  const rounds = f.cos.filter(c => c.status === 'live' && c.round && c.round.take === -1).sort((x, y) => y.own * y.val - x.own * x.val).slice(0, 2)
  for (const c of rounds) {
    const read = gutRead(g, `${c.id}|follow`, c.q)
    const hint = talentHint(g, hasTalent(g, 'Business') ? 'Business' : 'Investing', `Your read: ${readLabel(read)}`)
    followOnPopup(g, a, f, c.id, hint)
  }
  if (!f.funds.some(x => !x.done && g.year - x.vintage < 5 && x.dry > x.size * .03)) {
    const q = raiseQuote(g, b, f, g.year)
    if (!q.block && q.size > 0) {
      const hint = talentHint(g, 'Business', `The big push lands about ${pct(q.odds)} of the time`)
      raisePopup(g, a, b, f, hint)
    }
  }
}

// ---------------------------------------------------------------------------
// Regulators and schemes (once a year, after the books close)

function assetOf(g: GameState, b: BizState): Asset | undefined {
  return g.assets.find(z => z.details === (b as unknown))
}

export function fundYearlyChecks(g: GameState, b: BizState, a = assetOf(g, b)): void {
  if (!a || !g.character.alive || !findBusiness(g, a.id)) return
  const f = readFund(b)
  if (f.checkYear >= g.year || f.lastYear < g.year - 1) return
  f.checkYear = g.year
  // A case against a previous owner (now dead or gone) doesn't follow the heir.
  if (f.probe && f.probe.by && f.probe.by !== g.character.id) f.probe = null
  saveFund(b, f)
  if (f.probe && g.year > f.probe.year) {
    if (chance(g, f.probe.odds)) scriptChoice(g, PROBE, '📋 Regulators Are Calling', `Investigators want every record about ${a.name}’s trading. They suspect ${f.probe.crime.toLowerCase()}.`,
      [{ id: 'cooperate', label: 'Cooperate fully (a lighter charge)', emoji: '🤝' }, { id: 'lawyer', label: `Fight with top lawyers (${money(lawyerFee(b))} of company cash)`, emoji: '⚖️', ...hintOf(g, 'Business', 'Lawyers make a conviction less likely, not impossible, and the charge is heavier') }],
      { emoji: '📋', data: { assetId: a.id } as Json })
    else if (g.year - f.probe.year >= 3) { f.probe = null; saveFund(b, f); log(g, `The regulators quietly closed their file on ${a.name}.`, 'good') }
  }
  if (f.ponzi && g.year > f.ponzi.since) {
    const gap = clampN(f.ponzi.hole / Math.max(1, f.aum), 0, 1)
    const odds = clampN(.12 + gap * .6 + (f.last.market < -.15 ? .3 : 0) + (b.ceo === 'manager' ? .4 : 0), 0, .95)
    if (chance(g, odds)) scriptChoice(g, PONZI_END, '🔥 The Scheme Is Unraveling', `Withdrawals at ${a.name} can’t be paid: ${money(f.ponzi.hole)} of client money doesn’t exist. Auditors are on the way.`,
      [{ id: 'cover', label: `Plug the hole with your own money (${money(f.ponzi.hole)})`, emoji: '💸' }, { id: 'face', label: 'Face the music', emoji: '⚖️' }],
      { emoji: '🔥', data: { assetId: a.id } as Json })
  }
}

function lawyerFee(b: BizState): number {
  return Math.round(150_000 * clampN(getCountry(b.countryId).wealth ?? 1, .3, 1.5) / 1000) * 1000
}

function hintOf(g: GameState, talent: string, text: string): { hint?: string } {
  const hint = talentHint(g, talent, text)
  return hint ? { hint } : {}
}

export const PROBE = defineScript('fund.probe', (g, choice, data) => {
  const id = str(rec(data)?.assetId)
  const a = findBusiness(g, id)
  if (!a || !g.character.alive) return
  const b = bizOf(g, a), f = readFund(b)
  if (!f.probe) return
  const probe = f.probe
  f.probe = null
  // Cooperating means a lighter charge; top lawyers make a conviction less likely.
  let evidence = .75, severity = 2
  if (choice === 'lawyer') {
    const fee = lawyerFee(b)
    severity = 3
    if (b.cash >= fee) { b.cash -= fee; b.yearCosts += fee; evidence = .45 }
  }
  saveFund(b, f)
  arrestPlayer(g, probe.crime, severity, { evidence, noResist: true, context: `Regulators traced suspicious trades at ${a.name}.` })
})

export const PONZI_END = defineScript('fund.ponzi.end', (g, choice, data) => {
  const id = str(rec(data)?.assetId)
  const a = findBusiness(g, id)
  if (!a || !g.character.alive) return
  const b = bizOf(g, a), f = readFund(b)
  if (!f.ponzi) return
  const hole = Math.round(f.ponzi.hole)
  if (choice === 'cover' && spend(g, hole)) {
    f.ponzi = null
    f.rep = Math.max(0, f.rep - .1)
    saveFund(b, f)
    addHidden(g, 'karma', -5)
    log(g, `I quietly plugged a ${money(hole)} hole at ${a.name} with my own money.`, 'bad')
    notice(g, 'Close Call', `You paid ${money(hole)} of your own money into ${a.name}. The books balance again and nobody will ever know. Probably.`, { emoji: '😮‍💨' })
    return
  }
  ponziCollapse(g, a, b, f, 5)
})

/** The scheme ends: the firm goes under, clients get back what is left, its author goes to trial. */
function ponziCollapse(g: GameState, a: Asset, b: BizState, f: FundState, severity: number): void {
  // An heir who inherited someone else's scheme loses the firm but isn't the one charged.
  const culprit = !f.ponzi?.by || f.ponzi.by === g.character.id
  const taken = f.ponzi?.fees ?? 0
  const clawback = culprit ? Math.min(Math.max(0, g.character.money), Math.round(taken * .5)) : 0
  if (clawback > 0) spend(g, clawback)
  if (culprit) { count(g, 'ponziSchemes'); addHidden(g, 'karma', -20) }
  remember(g, `My investment firm ${a.name} collapsed as a Ponzi scheme.`)
  declareBankruptcy(g, a, b, `${culprit ? 'Your' : 'The inherited'} Ponzi scheme collapsed.${clawback > 0 ? ` Courts clawed back ${money(clawback)} of your personal money for the victims.` : ''}`)
  if (culprit) arrestPlayer(g, 'Securities Fraud', severity, { evidence: severity >= 5 ? .9 : .6, noResist: true, context: `${a.name}'s investors lost everything they thought they had.` })
}

export function comeClean(g: GameState, assetId: string): boolean {
  const x = liveFund(g, assetId)
  if (!x || !x.f.ponzi) return false
  ponziCollapse(g, x.a, x.b, x.f, 3)
  return true
}

// ---------------------------------------------------------------------------
// Story events (owner-run firms, at most one a year)

interface FundEvent {
  id: string
  weight: (g: GameState, b: BizState, f: FundState) => number
  present: (g: GameState, a: Asset, b: BizState, f: FundState) => void
  resolve: (g: GameState, x: { a: Asset; b: BizState; f: FundState }, choice: string, data: Record<string, Json>) => void
}

const COMPANIES = ['Pemberton Mills', 'Northgate Chemicals', 'Halvorsen Shipping', 'Brightwater Foods', 'Copperline Mining', 'Ashford Motors', 'Redwood Paper', 'Silverlake Steel', 'Meridian Glass', 'Larkspur Textiles', 'Oakhaven Rail', 'Bluefin Canning']
const TIPSTERS = ['an old classmate', 'your golf partner', 'a cousin', 'your dentist', 'a chatty neighbor', 'an ex']

function choice(id: string, label: string, emoji: string, hint = ''): ChoiceOption {
  return { id, label, emoji, ...(hint ? { hint } : {}) }
}

function ask(g: GameState, a: Asset, kind: string, title: string, text: string, choices: ChoiceOption[], extra: Record<string, Json> = {}, emoji = '📈'): void {
  scriptChoice(g, EVENT_SCRIPT, title, text, choices, { emoji, data: { assetId: a.id, kind, ...extra } as Json })
}

const poachOdds = (g: GameState) => clampN(.5 + (hasTalent(g, 'Leadership') ? .15 : 0) + g.character.stats.looks / 1000, 0, .9)
const calmOdds = (g: GameState, f: FundState) => clampN(.3 + g.character.stats.smarts / 250 + g.character.stats.looks / 500 + Math.min(.15, g.character.hidden.fame / 400) + f.rep * .2, .05, .9)
const pitchOdds = (g: GameState, b: BizState, f: FundState, cheap: boolean) => clampN(.15 + f.rep * .45 + (fundSkill(g, b) - 50) / 200 + (cheap ? .2 : 0), .05, .9)
const fightOdds = (b: BizState, f: FundState) => clampN(.35 + f.compliance / 200 + leadershipPower(b, 'ops') * .08, .1, .9)
const activistOdds = (g: GameState, b: BizState) => clampN(.4 + fundSkill(g, b) / 300, .1, .85)

function activistCost(b: BizState, f: FundState): number {
  return Math.round(100_000 * clampN(getCountry(b.countryId).wealth ?? 1, .3, 1.5) * Math.sqrt(1 + f.aum / 1e9) / 1000) * 1000
}

const EVENTS: FundEvent[] = [
  {
    id: 'poach',
    weight: (_g, b) => b.staff.some(s => s.skill >= 72) ? 1 : 0,
    present: (g, a, b) => {
      const star = [...b.staff].sort((x, y) => y.skill - x.skill)[0]
      ask(g, a, 'poach', '🎣 Your Star Is Being Poached', `A rival offered ${star.firstName} ${star.lastName}, your ${star.role.toLowerCase()} (skill ${star.skill}), double pay to jump ship.`,
        [choice('match', `Match it: raise to ${money(star.salary * 1.6)}`, '💰'), choice('promote', `Offer a title and ${money(star.salary * 1.25)}`, '🎖️', talentHint(g, 'Business', `About ${pct(poachOdds(g))} chance they stay`)), choice('let', 'Wish them luck', '👋')],
        { staffId: star.id }, '🎣')
    },
    resolve: (g, x, pickId, d) => {
      const star = x.b.staff.find(s => s.id === str(d.staffId))
      if (!star) return
      if (pickId === 'match') { star.salary = Math.round(star.salary * 1.6); star.morale = Math.min(100, star.morale + 15); notice(g, 'They Stayed', `${star.firstName} stays, happily richer.`, { emoji: '🤝' }); return }
      if (pickId === 'promote' && chance(g, poachOdds(g))) { star.salary = Math.round(star.salary * 1.25); star.morale = Math.min(100, star.morale + 8); notice(g, 'They Stayed', `${star.firstName} loved the new title. Crisis averted.`, { emoji: '🎖️' }); return }
      x.b.staff = x.b.staff.filter(s => s.id !== star.id)
      x.f.rep = Math.max(0, x.f.rep - .03)
      notice(g, 'Gone', `${star.firstName} ${star.lastName} left for the rival. Some clients followed.`, { emoji: '👋', tone: 'bad' })
    },
  },
  {
    id: 'tip',
    weight: (_g, _b, f) => f.type === 'vc' || f.probe ? 0 : .7,
    present: (g, a) => {
      const co = pick(g, COMPANIES), who = pick(g, TIPSTERS)
      ask(g, a, 'tip', '🤫 A Hot Tip', `${who[0].toUpperCase()}${who.slice(1)} who works at ${co} whispers that ${co} is about to be bought at a big premium. Nobody else knows yet.`,
        [choice('trade', 'Load the fund up on it', '💹', talentHint(g, 'Business', 'Easy money, and a real chance regulators notice')), choice('report', 'Report the tip to compliance', '📞'), choice('ignore', 'Pretend you never heard it', '🙉')],
        { company: co }, '🤫')
    },
    resolve: (g, x, pickId, d) => {
      if (pickId === 'trade') {
        x.f.bonus = clampN(x.f.bonus + randFloat(g, .02, .05), -.5, .2)
        x.f.probe = { year: g.year, crime: 'Insider Trading', odds: clampN(.4 - x.f.compliance / 400, .15, .4), by: g.character.id }
        addHidden(g, 'karma', -6)
        log(g, `I traded on a tip about ${str(d.company)}. What could go wrong?`, 'neutral')
      } else if (pickId === 'report') { x.f.compliance = Math.min(100, x.f.compliance + 5); addHidden(g, 'karma', 4) }
    },
  },
  {
    id: 'rogue',
    weight: (_g, _b, f) => (f.type === 'hedge' || f.type === 'broker') && f.compliance < 75 && f.aum > 1e6 ? .7 : 0,
    present: (g, a, b, f) => {
      const loss = Math.round(Math.max(50_000, f.aum * randFloat(g, .005, .02)) / 1000) * 1000
      ask(g, a, 'rogue', '🕵️ A Rogue Trader', `A junior trader hid ${money(loss)} of losses in a drawer marked "later". Clients don’t know yet.`,
        [choice('cover', `Cover it from company cash (${money(Math.min(loss, Math.max(0, b.cash)))})`, '🧯'), choice('hide', 'Quietly pass it on to clients', '🙈', talentHint(g, 'Business', 'That is fraud: regulators may come looking')), choice('report', 'Tell the regulator and pay a fine', '📞')],
        { loss }, '🕵️')
    },
    resolve: (g, x, pickId, d) => {
      const loss = Math.max(0, Number(d.loss) || 0)
      if (pickId === 'hide') {
        x.f.aum = Math.max(0, x.f.aum - loss); x.f.hwm = Math.max(0, x.f.hwm - loss)
        x.f.probe = { year: g.year, crime: 'Securities Fraud', odds: .3, by: g.character.id }
        addHidden(g, 'karma', -8)
        return
      }
      const fine = pickId === 'report' ? Math.round(loss * .1) : 0
      const paid = Math.min(Math.max(0, x.b.cash), loss + fine)
      x.b.cash -= paid; x.b.yearCosts += paid
      // Whatever the firm can't cover is a disclosed loss to clients (not a crime).
      if (paid < loss + fine) x.f.aum = Math.max(0, x.f.aum - (loss + fine - paid))
      x.f.compliance = Math.min(100, x.f.compliance + (pickId === 'report' ? 20 : 10))
      if (pickId === 'report') x.f.rep = Math.max(0, x.f.rep - .03)
    },
  },
  {
    id: 'redemption',
    weight: (_g, _b, f) => (f.type === 'asset' || f.type === 'hedge') && f.last.market <= -.2 && f.aum > 1e6 ? 4 : 0,
    present: (g, a, _b, f) => {
      const amount = Math.round(f.aum * randFloat(g, .15, .3))
      const opts = [choice('let', `Pay them out (${money(amount)})`, '🚪'), choice('calm', 'Call every client personally', '☕', talentHint(g, 'Business', `About ${pct(calmOdds(g, f))} chance most of them stay`))]
      if (f.type === 'hedge') opts.push(choice('gate', 'Gate the fund: nobody leaves this year', '🚧', talentHint(g, 'Business', 'Keeps the money, wrecks your reputation')))
      ask(g, a, 'redemption', '😱 Clients Want Out', `The market crash has clients panicking. ${money(amount)} of withdrawal requests landed on your desk.`, opts, { amount: amount }, '😱')
    },
    resolve: (g, x, pickId, d) => {
      const amount = Math.min(x.f.aum, Math.max(0, Number(d.amount) || 0))
      const out = pickId === 'gate' && x.f.type === 'hedge' ? 0 : pickId === 'calm' && chance(g, calmOdds(g, x.f)) ? amount * .3 : amount
      if (pickId === 'gate') { x.f.rep = Math.max(0, x.f.rep - .15); x.f.compliance = Math.max(0, x.f.compliance - 10) }
      if (pickId === 'calm' && out >= amount) x.f.rep = Math.max(0, x.f.rep - .05)
      const keep = 1 - out / Math.max(1, x.f.aum)
      x.f.aum = Math.max(0, x.f.aum - out)
      x.f.hwm *= keep
      notice(g, out < amount ? 'They Stayed' : 'Money Out the Door', out < amount ? `Only ${money(out)} left. Your calm voice saved the day.` : `${money(out)} walked out. It happens in crashes.`, { emoji: out < amount ? '☕' : '🚪', tone: out < amount ? 'good' : 'bad' })
    },
  },
  {
    id: 'pension',
    weight: (_g, _b, f) => (f.type === 'asset' || f.type === 'hedge') && f.aum >= 2e7 && f.rep >= .45 ? .8 : 0,
    present: (g, a, b, f) => {
      const mandate = Math.round(Math.max(1e7, f.aum * randFloat(g, .3, 1)) / 1e5) * 1e5
      ask(g, a, 'pension', '🏛️ A Pension Fund Calls', `A big pension fund is choosing a manager for ${money(mandate)} of teachers’ savings. You’re on the shortlist.`,
        [choice('pitch', 'Pitch your track record', '📊', talentHint(g, 'Business', `About ${pct(pitchOdds(g, b, f, false))} to win`)),
          choice('cheap', 'Undercut everyone on fees', '🏷️', talentHint(g, 'Business', `About ${pct(pitchOdds(g, b, f, true))} to win, at lower fees`)), choice('decline', 'Too much paperwork', '🙅')],
        { mandate }, '🏛️')
    },
    resolve: (g, x, pickId, d) => {
      if (pickId === 'decline') return
      const mandate = Math.max(0, Number(d.mandate) || 0)
      const cheap = pickId === 'cheap'
      if (!chance(g, pitchOdds(g, x.b, x.f, cheap))) { notice(g, 'Not This Time', 'The pension fund went with a bigger name.', { emoji: '🏛️' }); return }
      const share = mandate / Math.max(1, x.f.aum + mandate)
      if (cheap) { if (x.f.type === 'asset') x.f.fee = clampN(x.f.fee * (1 - .25 * share), .0005, .02); else x.f.mgmt = clampN(x.f.mgmt * (1 - .25 * share), 0, .03) }
      x.f.aum += mandate; x.f.hwm += mandate
      count(g, 'pensionMandates')
      notice(g, 'Mandate Won!', `You now manage ${money(mandate)} for the pension fund. Thousands of teachers are counting on you.`, { emoji: '🏛️', tone: 'good' })
    },
  },
  {
    id: 'ponzi',
    weight: (g, b, f) => (f.type === 'asset' || f.type === 'hedge') && !f.ponzi && f.last.ret < -.05 && b.ceo === 'owner' && g.character.age >= 18 ? .6 : 0,
    present: (g, a, _b, f) => {
      ask(g, a, 'ponzi', '😈 A Tempting Idea', `Clients lost ${signed(f.last.ret)} with you. A smooth consultant suggests reporting +12% instead and paying anyone who leaves with new clients’ money.`,
        [choice('honest', 'Report the real numbers', '🧾'), choice('fake', 'Fake the returns', '😈', talentHint(g, 'Business', 'Every scheme like this collapses; the odds rise each year'))], {}, '😈')
    },
    resolve: (g, x, pickId) => {
      if (pickId !== 'fake') { addHidden(g, 'karma', 2); return }
      x.f.ponzi = { since: g.year, hole: Math.max(0, -x.f.last.ret) * x.f.aum, fees: 0, by: g.character.id }
      addHidden(g, 'karma', -15)
      log(g, `I started faking ${x.a.name}'s returns.`, 'bad')
    },
  },
  {
    id: 'activist',
    weight: (_g, _b, f) => (f.type === 'asset' || f.type === 'hedge') && f.aum >= 5e7 ? .6 : 0,
    present: (g, a, b, f) => {
      const co = pick(g, COMPANIES), cost = activistCost(b, f)
      ask(g, a, 'activist', '📣 Go Activist?', `Your fund owns a big stake in ${co}, whose bosses waste money on gold-plated limousines for their dogs. You could launch a public campaign to fix it.`,
        [choice('launch', `Launch a campaign (${money(cost)})`, '📣', talentHint(g, 'Business', `About ${pct(activistOdds(g, b))} to win board seats`)), choice('quiet', 'Stay a quiet shareholder', '🤐')],
        { company: co, cost }, '📣')
    },
    resolve: (g, x, pickId, d) => {
      if (pickId !== 'launch') return
      const cost = Math.max(0, Number(d.cost) || 0)
      if (x.b.cash < cost) { notice(g, 'No Budget', 'The company can’t afford a campaign right now.', { emoji: '📣' }); return }
      x.b.cash -= cost; x.b.yearCosts += cost
      if (chance(g, activistOdds(g, x.b))) {
        x.f.bonus = clampN(x.f.bonus + randFloat(g, .01, .03), -.5, .2)
        addHidden(g, 'fame', 2)
        notice(g, 'Campaign Won', `${str(d.company)} gave you board seats and sold the dog limousines. The stock jumped.`, { emoji: '📣', tone: 'good' })
      } else notice(g, 'Campaign Lost', `${str(d.company)}’s shareholders sided with management. Expensive lesson.`, { emoji: '📣', tone: 'bad' })
    },
  },
  {
    id: 'lawsuit',
    weight: (_g, _b, f) => f.type !== 'vc' && (f.last.ret < -.12 || f.last.opLoss > 0) && f.aum > 1e6 ? 1 : 0,
    present: (g, a, b, f) => {
      const claim = Math.round(Math.max(50_000, f.aum * randFloat(g, .002, .006)) / 1000) * 1000
      ask(g, a, 'lawsuit', '⚖️ A Client Sues', `An angry client says your brochures promised "safe, steady growth" and wants ${money(claim)}.`,
        [choice('settle', `Settle for ${money(claim)}`, '🤝'), choice('fight', 'Fight it in court', '⚖️', talentHint(g, 'Business', `About ${pct(fightOdds(b, f))} to win`))], { claim }, '⚖️')
    },
    resolve: (g, x, pickId, d) => {
      const claim = Math.max(0, Number(d.claim) || 0)
      const win = pickId === 'fight' && chance(g, fightOdds(x.b, x.f))
      const cost = pickId === 'settle' ? claim : win ? claim * .15 : claim * 2
      const paid = Math.min(Math.max(0, x.b.cash), cost)
      x.b.cash -= paid; x.b.yearCosts += paid
      if (pickId === 'fight' && !win) x.f.rep = Math.max(0, x.f.rep - .05)
      if (pickId === 'fight') notice(g, win ? 'Case Dismissed' : 'Case Lost', win ? `The judge tossed it. Legal bills: ${money(paid)}.` : `The jury sided with the client. It cost ${money(paid)}.`, { emoji: '⚖️', tone: win ? 'good' : 'bad' })
    },
  },
  {
    id: 'drama',
    weight: (_g, _b, f) => f.type === 'vc' && f.cos.some(c => c.status === 'live' && c.born < f.lastYear) ? 1.2 : 0,
    present: (g, a, _b, f) => {
      const c = pick(g, f.cos.filter(s => s.status === 'live' && s.born < f.lastYear))
      const read = gutRead(g, `${c.id}|drama`, c.q)
      const hint = talentHint(g, hasTalent(g, 'Business') ? 'Business' : 'Investing', read >= 50 ? 'The founder seems to know what they’re doing' : 'The co-founder has the better plan')
      ask(g, a, 'drama', `${c.emoji} Founder Drama at ${c.name}`, `${c.name}’s two founders stopped speaking after a fight about the office aquarium. The board vote is yours.`,
        [choice('founder', 'Back the CEO founder', '👑', read >= 50 ? hint : ''), choice('cofounder', 'Back the co-founder', '🔧', read < 50 ? hint : ''), choice('out', 'Stay out of it', '🍿')], { startupId: c.id }, c.emoji)
    },
    resolve: (_g, x, pickId, d) => {
      const c = x.f.cos.find(s => s.id === str(d.startupId) && s.status === 'live')
      if (!c) return
      const good = c.q >= 50
      if (pickId === 'out') c.q = clampN(c.q - 3, 0, 100)
      else c.q = clampN(c.q + ((pickId === 'founder') === good ? 8 : -8), 0, 100)
    },
  },
  {
    id: 'fomo',
    weight: (g, _b, f) => f.type === 'vc' && f.funds.some(x => !x.done && g.year - x.vintage < 5 && x.dry > x.size * .1) ? .8 : 0,
    present: (g, a, b, f) => {
      const fund = [...f.funds].reverse().find(x => !x.done && g.year - x.vintage < 5 && x.dry > x.size * .1)!
      const amount = Math.round(Math.min(fund.dry, fund.size * .06) / 10_000) * 10_000
      const q = Math.round(100 * Math.pow(Math.max(0, Math.min(1, randFloat(g, 0, 1))), 1.3))
      // Never the name of a startup the firm already backed or is hearing this year.
      const taken = new Set([...f.cos.map(c => c.name.toLowerCase()), ...pitchesFor(g, b, f, g.year).map(p => p.name.toLowerCase())])
      const name = uniqueName(`${pick(g, ['Hype', 'Rocket', 'Moon', 'Turbo', 'Mega'])}${pick(g, ['ly', 'ify', 'Labs', 'Works', 'Hub'])}`, taken)
      const read = gutRead(g, `fomo|${g.year}|${name}`, q)
      ask(g, a, 'fomo', '🔥 Everyone Wants In', `${name} is the hottest startup in town. The founder gives you 24 hours to invest ${money(amount)} at a crazy valuation, or a rival fund gets it.`,
        [choice('invest', `Invest ${money(amount)} from Fund ${roman(fund.n)}`, '💸', talentHint(g, hasTalent(g, 'Business') ? 'Business' : 'Investing', `Your read: ${readLabel(read)}`)), choice('pass', 'Pass on the hype', '🧊')],
        { amount: amount, q, name, fund: fund.n }, '🔥')
    },
    resolve: (g, x, pickId, d) => {
      if (pickId !== 'invest') return
      const fund = x.f.funds.find(v => v.n === Number(d.fund) && !v.done)
      const amount = Math.max(0, Number(d.amount) || 0)
      if (!fund || fund.dry < amount || !(amount > 0)) return
      fund.dry -= amount; fund.invested += amount
      const post = amount * 12
      x.f.cos.push({ id: `${g.year}.f${x.f.cos.length}`, name: str(d.name, 'Hypely'), emoji: '🔥', sector: 'Hype', fund: fund.n, q: clampN(Number(d.q) || 0, 0, 100), stage: 1, val: post, own: amount / post, cost: amount, born: g.year, status: 'live', end: 0, got: 0, how: '', round: null, unicorn: false })
    },
  },
]

export const EVENT_SCRIPT = defineScript('fund.event', (g, pickId, data) => {
  const d = rec(data)
  if (!d) return
  const ev = EVENTS.find(e => e.id === str(d.kind))
  const x = liveFund(g, str(d.assetId))
  if (!ev || !x) return
  ev.resolve(g, x, pickId, d)
  saveFund(x.b, x.f)
})

/** At most one fund story a year for an owner-run firm. */
export function maybeFundEvent(g: GameState, a: Asset, b: BizState): boolean {
  const f = readFund(b)
  if (f.eventYear >= g.year || g.character.prison || !g.character.alive || !chance(g, .35)) return false
  const options = EVENTS.filter(e => e.weight(g, b, f) > 0)
  if (!options.length) return false
  const ev = weightedPick(g, options, e => e.weight(g, b, f))
  f.eventYear = g.year
  saveFund(b, f)
  b.lastEvent = Math.max(b.lastEvent, g.year - 1)
  ev.present(g, a, b, f)
  return true
}

export function eventIds(): string[] {
  return EVENTS.map(e => e.id)
}

/** Force one event (tests and debugging). */
export function presentFundEvent(g: GameState, a: Asset, id: string): boolean {
  const ev = EVENTS.find(e => e.id === id)
  if (!ev) return false
  const b = bizOf(g, a), f = readFund(b)
  if (ev.weight(g, b, f) <= 0) return false
  ev.present(g, a, b, f)
  return true
}
