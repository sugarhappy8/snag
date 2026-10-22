// The company dashboard: the few lines at the top of a company's screen. Who and where it is, its
// cash, value and the owner's stake, last year's sales and profit against the year before, where it
// stands in its market, and a health label with one plain piece of advice. Pure: menus re-render
// often, so nothing here writes state or rolls dice. Finance firms show identity, money and profit
// only; their own section (finance-firm.ts financeNodes) owns the rest.
import { moneyWith } from '../core'
import { marketOf } from '../data/markets'
import type { Asset, GameState, MenuInfo, MenuNode } from '../types'
import { getCountry } from '../world'
import { managerName } from './career'
import { marketViewOf, marketOwner, shareText } from './competition'
import { inGroup } from './conglomerate-state'
import { techView, runwayYears } from './deeptech-core'
import { isDeepTech } from './deeptech-state'
import { startupCost } from './economy'
import { canIpo } from './exit'
import { isFinanceFirm } from './finance-firm'
import { franchiseBlock, franchiseUnits, isFranchiseIndustry, maxSellable } from './franchise'
import { isStudio } from './gamestudio'
import { industryDef } from './industries'
import { milestoneLabel, nextMilestones } from './milestones'
import { readBiz, runsIt, totalOutlets, type BizState } from './state'
import { money, pct, plural } from './util'
import { stakeText, valueChip, valueLook, valueText } from './valuation-fog'

export type HealthId = 'new' | 'thriving' | 'steady' | 'struggling' | 'danger'

export interface HealthRead {
  id: HealthId
  label: string
  emoji: string
  advice: string
}

/** Morale below this gets the "staff are miserable" advice (and rules out "Thriving"). */
const MISERABLE = 35

const LABELS: Record<HealthId, { label: string; emoji: string }> = {
  new: { label: 'Just opened', emoji: '\u{1F331}' },
  thriving: { label: 'Thriving', emoji: '\u{1F49A}' },
  steady: { label: 'Steady', emoji: '\u{1F44D}' },
  struggling: { label: 'Struggling', emoji: '\u{26A0}\u{FE0F}' },
  danger: { label: 'In danger', emoji: '\u{1F6A8}' },
}

/** '▲12%', '▼30%', '▲ back in profit' ('' when there is nothing to compare with). */
export function trend(now: number, before: number | null | undefined, kind: 'sales' | 'profit' = 'sales'): string {
  if (before === null || before === undefined || !Number.isFinite(before) || !Number.isFinite(now)) return ''
  if (kind === 'profit') {
    if (before <= 0 && now > 0) return '\u{25B2} back in profit'
    if (before >= 0 && now < 0) return '\u{25BC} into a loss'
    if (before < 0 && now < 0) return now > before ? '\u{25B2} smaller loss' : now < before ? '\u{25BC} bigger loss' : ''
  }
  if (!(Math.abs(before) > 0)) return ''
  const ch = now / before - 1
  if (!Number.isFinite(ch) || Math.abs(ch) < 0.005) return '\u{25AA} flat'
  // From +900% on, the multiple reads better: 1,000 after 100 is '11x' (ten times more than before, plus the 100).
  const p = ch >= 9 ? `${Math.round(now / before)}x` : `${Math.round(Math.abs(ch) * 100)}%`
  return `${ch > 0 ? '\u{25B2}' : '\u{25BC}'}${p}`
}

/** Years the company's cash lasts at last year's loss (Infinity when it made money). */
export function runway(g: GameState, a: Asset, b: BizState): number {
  if (isDeepTech(b)) return runwayYears(g, a, b, techView(b))
  const loss = b.last && b.last.net < 0 ? -b.last.net : 0
  return loss > 0 ? Math.max(0, b.cash) / loss : Infinity
}

/**
 * How the company is doing and the one thing worth doing about it. Pure, and the same for every
 * kind of company (studios and deep tech judged on runway rather than a single year's loss).
 */
export function companyHealth(g: GameState, a: Asset, b: BizState): HealthRead {
  const s = b.last
  const read = (id: HealthId, advice: string): HealthRead => ({ id, ...LABELS[id], advice })
  const studio = isStudio(b)
  const tech = isDeepTech(b)
  const finance = isFinanceFirm(b)
  if (!s) {
    return read('new', studio ? 'Greenlight your first game and keep the team small until it ships.' : tech ? 'Fund R&D and keep an eye on the runway.' : finance ? 'Set up your financial operations below.' : 'Set your launch price and production in the planning report.')
  }
  const prev = b.history.length >= 2 ? b.history[b.history.length - 2] : null
  const salesChange = prev && prev.revenue > 0 ? s.revenue / prev.revenue - 1 : 0
  const margin = s.revenue > 0 ? s.net / s.revenue : s.net >= 0 ? 0 : -1
  const years = runway(g, a, b)
  const loss = s.net < 0
  // Studios between releases and labs before launch lose money on purpose: judge the runway.
  const planned = (studio || tech) && years >= 2
  let id: HealthId
  if (b.cash < 0 || (loss && years < 1)) id = 'danger'
  // Falling sales only count when profit fell too (a franchisor's royalties can outgrow its own shops).
  else if ((loss && !planned) || margin < 0.02 || (salesChange < -0.15 && prev !== null && s.net < prev.profit) || b.morale < 30) id = loss && planned ? 'steady' : 'struggling'
  // Not "Thriving" while the advice has to warn about a miserable team.
  else if (s.net > 0 && salesChange >= -0.05 && b.morale >= MISERABLE && (margin >= 0.12 || (prev !== null && prev.profit > 0 && s.net >= prev.profit * 1.1))) id = 'thriving'
  else id = 'steady'
  return read(id, advice(g, b, id, { loss, years, salesChange: prev !== null && s.net < prev.profit ? salesChange : 0, studio, tech, finance }))
}

function advice(g: GameState, b: BizState, id: HealthId, x: { loss: boolean; years: number; salesChange: number; studio: boolean; tech: boolean; finance: boolean }): string {
  const classic = !x.studio && !x.tech && !x.finance
  if (b.cash < 0) return 'Cash is negative: put money in or borrow (Money) before payroll is due.'
  if (x.loss && x.years < 1) return `Losses will empty the till within ${plural(Math.max(1, Math.round(x.years * 12)), 'month')}: cut costs, fix prices or add cash.`
  if (x.loss) {
    if (x.tech) {
      const left = x.years >= 99 ? 'plenty of runway left' : `about ${yearsLeft(x.years)} of runway left`
      return x.years >= 2 ? `R&D burns cash as planned: ${left}.` : `R&D is eating the runway: ${left}. Raise a round or slow a program.`
    }
    if (x.studio) return x.years >= 2 ? 'Between hits: ship the next game before the cash runs thin.' : 'Losing money: ship a game soon, or trim the team.'
    if (x.finance) return 'Losing money: review the financial operations below.'
    return 'Losing money: open the planning report and check price and production.'
  }
  if (b.morale < MISERABLE) return 'Staff are miserable: raise pay or treat the team (Employees) before they strike.'
  if (classic && b.quality < 35) return 'Quality is slipping: better suppliers or a quality lead (Quality).'
  const s = b.last!
  if (b.debt > b.cash && b.debt > Math.max(1, s.net) * 3) return 'Debt is heavy: repay some before expanding.'
  if (x.salesChange < -0.15) return x.studio ? 'Sales fell: a new game or a marketing push brings players back.' : 'Sales fell: a campaign or a fresh product line could win customers back.'
  if (classic && b.brand < 25) return 'Few people know you yet: a marketing campaign builds the brand.'
  if (!x.finance && !b.public && !inGroup(g, b) && canIpo(b) === null) return 'Exchanges would list you now: go public under Exit, if the board agrees.'
  if (classic && isFranchiseIndustry(b.industry) && franchiseUnits(b) === 0 && franchiseBlock(b) === null && maxSellable(g, b) > 0) return 'Your brand is strong enough to sell franchises (Franchising).'
  if (classic && id === 'thriving' && b.cash > startupCost(b.industry, b.countryId, b.city).capital * 2) return 'Cash is piling up: open another location, or take some profit out.'
  const next = nextMilestones(g, b, 1)[0]
  if (next?.pending) return `Milestone reached: ${lowerFirst(milestoneLabel(next.m))}. It gets celebrated when the year closes.`
  if (next && next.progress >= 0.6) return `Next milestone: ${lowerFirst(milestoneLabel(next.m))} (${Math.floor(next.progress * 100)}% there).`
  return x.finance ? 'Keep it steady and keep capital strong.' : 'Keep it steady: fine-tune next year in the planning report.'
}

function lowerFirst(t: string): string {
  return `${t.charAt(0).toLowerCase()}${t.slice(1)}`
}

/** '1.5 years', '1 year', '12 years'. */
function yearsLeft(years: number): string {
  const y = Math.round(years * 10) / 10
  return `${y.toLocaleString('en-US')} ${y === 1 ? 'year' : 'years'}`
}

/** The identity line: what, where, since when, who runs it. */
function identity(g: GameState, a: Asset, b: BizState): string {
  const def = industryDef(b.industry)
  const who = runsIt(g, a) ? 'you are CEO' : b.ceo === 'manager' && b.manager ? `CEO ${managerName(b.manager)} (${b.manager.skill}/100)` : 'no CEO'
  const units = franchiseUnits(b)
  const sites = `${plural(totalOutlets(b), def.site, def.sitePlural)}${units > 0 ? ` + ${units} franchised` : ''}`
  return `${def.label} · ${b.city}, ${getCountry(b.countryId).name} · since ${b.founded} · ${sites} · ${who}`
}

/** Cash, value and the owner's part of it. A private company's value and the stake in it are an appraisal range in Realistic mode (valuation-fog.ts). */
function moneyLine(g: GameState, a: Asset, b: BizState): string {
  const parts = [`Cash ${money(b.cash)}`]
  // Deep tech: investors' money sits in the R&D account, not in cash (deeptech-state.ts).
  if (isDeepTech(b)) parts.push(`R&D account ${money(techView(b).venture)}`)
  if (b.debt > 0) parts.push(`debt ${money(b.debt)}`)
  parts.push(valueText(g, a, b, b.public ? 'market cap' : 'value'))
  const group = inGroup(g, b)
  if (b.public) parts.push(`${moneyWith(b.sharePrice, (x) => x.toFixed(2))}/share on the ${b.exchange}`)
  if (group) parts.push(`your look-through ${pct(b.share, 1)}: ${stakeText(g, a, b)}`)
  else if (b.share < 0.999) parts.push(`your ${pct(b.share, b.share < 0.1 ? 1 : 0)}: ${stakeText(g, a, b)}`)
  else parts.push('all yours')
  return parts.join(' · ')
}

/** Last year's sales and profit with the change from the year before. */
function resultsLine(b: BizState, profitOnly: boolean): string {
  const s = b.last
  if (!s) return b.openFraction < 1 ? 'Opening soon: registration took a while, so the first year is short.' : 'First year of trading: results come with the Annual Report.'
  const prev = b.history.length >= 2 ? b.history[b.history.length - 2] : null
  const sales = `sales ${money(s.revenue)}${prev ? ` ${trend(s.revenue, prev.revenue)}` : ''}`.trim()
  const pr = `${s.net >= 0 ? 'profit' : 'loss'} ${money(Math.abs(s.net))}${prev ? ` ${trend(s.net, prev.profit, 'profit')}` : ''}`.trim()
  return `${s.year}: ${profitOnly ? pr : `${sales} · ${pr}`}`
}

/** Rank and share in the company's market, in a few words. */
function marketLine(g: GameState, b: BizState): string {
  const v = marketViewOf(g, b)
  const where = `${marketOwner(v.place)} ${v.noun} market`
  if (!v.booked) return `New to ${where}`
  if (!(v.share > 0)) return `No sales yet in ${where}`
  if (v.scope === 'national' && v.share < 0.005) return `${shareText(v.share)} of ${where} · one of thousands`
  return `#${v.rank} in ${where} · ${shareText(v.share)} share`
}

/**
 * The dashboard rows (info nodes) for any company: identity, money, results, market and health, then in Realistic mode the Look closer
 * group for a private company's valuation. Finance firms get identity, money and profit only.
 */
export function dashboardRows(g: GameState, a: Asset): MenuNode[] {
  const b = readBiz(g, a)
  const def = industryDef(b.industry)
  const finance = isFinanceFirm(b)
  const row = (key: string, emoji: string, text: string, chip: Pick<MenuInfo, 'conf' | 'asOf'> = {}): MenuNode => ({ type: 'info', id: `biz.dash.${key}.${a.id}`, emoji, text, ...chip })
  const rows: MenuNode[] = [
    row('who', def.emoji, identity(g, a, b)),
    row('money', '\u{1F4B0}', moneyLine(g, a, b), valueChip(g, a, b)),
    row('results', '\u{1F4CA}', resultsLine(b, finance)),
  ]
  // Look closer at a private company's valuation, straight under the card that prints it (R3-G10; nothing in Exact mode or for a listed company).
  const look = valueLook(g, a, b)
  if (finance) return look ? [...rows, look] : rows
  rows.push(row('market', '\u{1F3C6}', marketLine(g, b)))
  const h = companyHealth(g, a, b)
  rows.push(row('health', h.emoji, `${h.label}: ${h.advice}`))
  if (look) rows.push(look)
  return rows
}

/** For the details list: the country's business climate in one short line. */
export function climateLine(b: BizState, wage: number): string {
  const m = marketOf(b.countryId)
  return `${getCountry(b.countryId).name}: corporate tax ${Math.round(m.corporateTax * 100)}% · ${m.salesTaxName} ${Math.round(m.salesTax * 100)}% · typical wage ${money(wage)} · inflation ${Math.round(m.inflation * 100)}%`
}
