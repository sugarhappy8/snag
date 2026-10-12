// Investment firms 2.0: short display lines (formatted at render time, never stored).
import { inflationRate, isHistoryYear } from '../invest/engine'
import { brokerEra, CALLS, indexLabel, marketYearOf, STRATEGIES, STYLES, TYPE_INFO } from './fund-model'
import type { FundState } from './fund-state'
import { fundTvpi, roman, stageLabel, VC_INVEST_YEARS } from './fund-vc'
import type { BizState } from './state'
import { money, pct, units } from './util'

export function signed(x: number, digits = 1): string {
  const v = Number.isFinite(x) ? x : 0
  return `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(digits)}%`
}

export function rankText(rank: number): string {
  if (rank < 0) return ''
  const medal = rank >= .9 ? ' 🥇' : rank >= .75 ? ' 🏆' : rank < .25 ? ' 😬' : ''
  return `beat ${pct(rank)} of peers${medal}`
}

/** What the firm is, in one short line. */
export function typeLine(f: FundState): string {
  const t = TYPE_INFO[f.type]
  if (f.type === 'asset') return `${t.emoji} ${t.label} · ${STYLES[f.style].emoji} ${STYLES[f.style].label} · AUM ${money(f.aum)} · fee ${pct(f.fee, 2)}`
  if (f.type === 'hedge') {
    const s = STRATEGIES[f.strategy]
    const call = f.strategy === 'macro' ? ` ${CALLS[f.call].emoji} ${f.lev.toFixed(1)}×` : ''
    return `${t.emoji} ${t.label} · ${s.emoji} ${s.label}${call} · AUM ${money(f.aum)} · ${pct(f.mgmt, 1)} + ${pct(f.perf)}`
  }
  if (f.type === 'broker') return `${t.emoji} ${t.label} · ${units(f.accounts)} accounts · ${money(f.aum)} held · commission ${pct(f.commission, 2)}`
  const live = f.funds.filter(x => !x.done)
  const committed = live.reduce((s, x) => s + x.size, 0)
  return `${t.emoji} ${t.label} · ${live.length ? `${live.length} active fund${live.length > 1 ? 's' : ''} · ${money(committed)} committed` : 'no active fund'} · ${f.cos.filter(c => c.status === 'live').length} startups`
}

/** Last booked year in one short line. */
export function lastLine(b: BizState, f: FundState): string {
  if (f.lastYear < 0) return 'First year: results arrive at your next birthday.'
  const L = f.last
  if (f.type === 'broker') return `${f.lastYear}: ${units(L.trades)} trades · ${L.flow >= 0 ? '+' : '−'}${units(Math.abs(L.flow))} accounts · revenue ${money(L.fees)}`
  if (f.type === 'vc') return `${f.lastYear}: fees and carry ${money(L.fees)}${L.carry > 0 ? ` (carry ${money(L.carry)})` : ''}${L.rank >= 0 ? ` · funds ${L.ret.toFixed(1)}× · ${rankText(L.rank)}` : ''}`
  return `${f.lastYear}: clients ${signed(L.ret)} vs ${indexLabel(b.countryId, marketYearOf(f.lastYear))} ${signed(L.market)}${L.rank >= 0 ? ` · ${rankText(L.rank)}` : ''}`
}

/** "Returns are after inflation" when inflation was high enough to matter. */
export function inflationNote(b: BizState, fiscal: number): string {
  const y = marketYearOf(fiscal)
  if (!isHistoryYear(y)) return ''
  const infl = inflationRate(b.countryId, y)
  return infl >= .03 ? `Returns are after ${pct(Math.min(infl, 9.99))} inflation.` : ''
}

export function fundLine(f: FundState, n: number, year: number): string {
  const x = f.funds.find(v => v.n === n)
  if (!x) return ''
  const cos = f.cos.filter(c => c.fund === n)
  const live = cos.filter(c => c.status === 'live').length
  // A fund that hasn't backed anyone has no multiple yet (0.0× would read as "lost everything").
  const book = x.invested > 0 ? `${cos.length} startups (${live} alive) · ${fundTvpi(f, x).toFixed(1)}×` : 'no startups yet'
  const state = x.done ? 'closed' : year - x.vintage < VC_INVEST_YEARS && x.dry > x.size * .03 ? `${money(x.dry)} to invest` : live ? 'harvesting' : 'done investing'
  return `Fund ${roman(n)} (${x.vintage}) · ${money(x.size)} · ${book} · ${state}`
}

/** The "what now" sentence of the founding popup, for each firm type. */
export function foundingNote(f: FundState): string {
  if (f.type === 'asset') return ' Pick a fund style and fee in Financial Operations. Clients’ money stays theirs: you earn the fee.'
  if (f.type === 'hedge') return ` Pick a strategy in Financial Operations. You earn ${pct(f.mgmt)} a year plus ${pct(f.perf)} of gains above the high-water mark.`
  if (f.type === 'broker') return ' Set your commission in Financial Operations. Clients’ accounts stay theirs: you earn on their trades.'
  const fund = f.funds[f.funds.length - 1]
  return ` LPs committed ${money(fund?.size ?? 0)} to Fund I (their money, not yours). Back founders from This Year’s Pitches: you earn 2% a year and 20% of profits.`
}

/** A stored news code turned into a line (startup news, algorithm results). */
export function newsLine(f: FundState, code: string): string {
  if (code === 'algo:ok') return '🧠 Your trading algorithm works: a real edge, for now.'
  if (code === 'algo:dud') return '🧠 Your trading algorithm turned out to be noise. Back to the drawing board.'
  const [k, id] = [code.slice(0, 1), code.slice(2)]
  const c = f.cos.find(s => s.id === id)
  if (!c) return ''
  if (k === 'u') return c.status === 'exit' ? `🦄 ${c.name} exited as a unicorn: ${money(c.got)} to the fund (${(c.got / Math.max(1, c.cost)).toFixed(1)}×)!` : `🦄 ${c.name} raised at ${money(c.val)}: a unicorn!`
  if (k === 'd') return `💀 ${c.name} shut down: ${c.how}.`
  if (k === 'x') {
    const verb = c.how === 'ipo' ? 'went public' : c.how === 'acquired' ? 'was bought by a bigger rival' : 'was sold off'
    return `${c.how === 'ipo' ? '🔔' : c.how === 'acquired' ? '🤝' : '📦'} ${c.name} ${verb}: ${money(c.got)} to the fund (${(c.got / Math.max(1, c.cost)).toFixed(1)}×).`
  }
  return ''
}

export function eraLine(b: BizState, year: number): string {
  return brokerEra(b.countryId, year).label
}

export { stageLabel }
