// The yearly pass of Politics 2.0 (aging.ts 'nation' hook, after the careers): laws' upkeep
// (shocks and retaliation expire, graft decays, credit ratings), personal taxes the player pays
// under the laws where they live (wealth tax, property tax changes), the meters of whoever holds
// office, the State of the Nation report, debt crises and, through the other modules, crises,
// lobbyists, protests, coups and trials. At most one decision popup a year comes from here, plus
// the report.
import { formatMoney, log, minigame, netWorth, notice, scriptChoice } from '../core'
import { economyOf, economyState } from '../economy'
import { typicalIncome } from '../events/wealth-core'
import { defineScript } from '../scripts'
import type { GameState, Json } from '../types'
import { getCountry } from '../world'
import { BUDGET_LINES, GROUP_IDS, GROUPS, groupWeights, institutionStrength, type GroupId } from './data'
import { nationOverlay, personalTax, RATING_SPREAD, wealthTaxRate } from './effects'
import { accountability } from './govern'
import { midterm } from './legislature'
import { adjustApproval, officeView, type OfficeView } from './office'
import { editMe, editPolicy, hasMe, hasPolicy, meView, policyOf, writeMe, writePolicy, type CountryPolicy } from './state'
import { stampCompanyBarriers } from './company'
import { yearlyDrama } from './drama'
import { yearlyConsequences } from './consequences'

export const RATINGS = ['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC', 'D'] as const

/** A credit rating from the country's books (pure). Defaults stay rated D for three years. */
export function ratingFor(g: GameState, country: string, p: CountryPolicy = policyOf(g, country)): string {
  const e = economyOf(g, country)
  const defaulted = p.since.default
  if (defaulted && g.year - defaulted < 3) return 'D'
  const deficit = e.budget?.deficit ?? 0
  let score = 100 - e.governmentDebt * 22 - Math.max(0, deficit) * 350 - Math.max(0, e.inflation - .05) * 150 + (e.growth - .02) * 250
    - (100 - institutionStrength(country, g.year)) * .25 - (p.institutions.regime === 'authoritarian' ? 10 : p.institutions.regime === 'hybrid' ? 4 : 0)
    - (p.institutions.emergencyUntil >= g.year ? 5 : 0)
  if (defaulted && g.year - defaulted < 8) score -= 15
  score = Math.max(0, Math.min(100, score))
  return score >= 85 ? 'AAA' : score >= 75 ? 'AA' : score >= 65 ? 'A' : score >= 55 ? 'BBB' : score >= 45 ? 'BB' : score >= 35 ? 'B' : 'CCC'
}

// ---------------------------------------------------------------------------
// Approval

/** How the economy feels to each group (points): growth, joblessness, prices. */
function economyFeel(g: GameState): Record<GroupId, number> {
  const e = economyOf(g)
  const growth = Math.max(-12, Math.min(8, (e.growth - .02) * 300))
  const jobs = -Math.max(-4, Math.min(12, (e.unemployment - .055) * 200))
  const prices = -Math.max(0, Math.min(12, (e.inflation - .04) * 150))
  const services = Math.max(-6, Math.min(4, (e.services - 1) * 20))
  return {
    workers: growth * .6 + jobs * 1.5 + prices + services,
    middle: growth * .8 + jobs + prices * 1.2 + services,
    business: growth * 1.5 + jobs * .5 + prices * .6,
    retirees: growth * .4 + jobs * .4 + prices * 1.5 + services * 1.3,
    young: growth * .7 + jobs * 1.3 + prices * .8 + services * .6,
    rural: growth * .7 + jobs * .8 + prices + services * .7,
  }
}

/** Where approval is heading and how each voter group sees you (pure; politics.ts drifts toward it). */
export function approvalTarget(g: GameState, v: OfficeView): { target: number; groups: Record<GroupId, number>; speed: number } {
  const econWeight = v.leader ? 1 : v.portfolio ? .6 : v.regionalHead ? .45 : v.legislator ? .3 : 0
  const policyWeight = v.leader ? 1 : v.portfolio ? .6 : v.regionalHead ? .6 : v.legislator ? .3 : v.office === 'mayor' ? .5 : 0
  const country = g.character.countryId
  const o = nationOverlay(g, country, g.year)
  const feel = economyState(g) && econWeight > 0 ? economyFeel(g) : null
  const w = groupWeights(country, g.year)
  const me = hasMe(g) ? meView(g) : null
  const legit = me && v.rank >= 1 ? (me.legitimacy - 70) / 8 : 0
  const groups = {} as Record<GroupId, number>
  let shift = 0
  for (const id of GROUP_IDS) {
    const d = (feel ? feel[id] * econWeight : 0) + (o ? o.groups[id] * policyWeight : 0)
    groups[id] = d
    shift += w[id] * d
  }
  const target = Math.max(5, Math.min(95, 50 + shift + legit))
  for (const id of GROUP_IDS) groups[id] = Math.max(0, Math.min(100, Math.round(v.approval + (groups[id] - shift) * .8)))
  return { target, groups, speed: .12 + .18 * accountability(v) }
}

// ---------------------------------------------------------------------------
// The State of the Nation

const REPORT_SCRIPT = 'nation.report'
defineScript(REPORT_SCRIPT, () => {})

export interface ReportData {
  year: number
  country: string
  office: string
  approval: number
  metrics: { label: string; value: string; delta: string; tone: 'good' | 'bad' | 'neutral' }[]
  groups: { label: string; emoji: string; value: number }[]
  causes: string[]
  rating: string
  ratingNote: string
}

const sign = (n: number, digits = 1) => `${n >= 0 ? '+' : '−'}${Math.abs(n * 100).toFixed(digits)}`

export function buildReport(g: GameState, v: OfficeView): ReportData {
  const country = g.character.countryId
  const e = economyOf(g, country)
  const prev = economyState(g)?.previous[country]
  const p = policyOf(g, country)
  const o = nationOverlay(g, country, g.year, false)
  const tone = (good: boolean, bad: boolean) => (good ? 'good' : bad ? 'bad' : 'neutral') as 'good' | 'bad' | 'neutral'
  const deficit = e.budget?.deficit ?? 0
  const metrics: ReportData['metrics'] = [
    { label: 'Growth', value: `${sign(e.growth)}%`, delta: prev ? `${sign(e.growth - prev.growth)} pts` : '', tone: tone(e.growth > .025, e.growth < 0) },
    { label: 'Unemployment', value: `${(e.unemployment * 100).toFixed(1)}%`, delta: prev ? `${sign(e.unemployment - prev.unemployment)} pts` : '', tone: tone(e.unemployment < .05, e.unemployment > .09) },
    { label: 'Inflation', value: `${(e.inflation * 100).toFixed(1)}%`, delta: prev ? `${sign(e.inflation - prev.inflation)} pts` : '', tone: tone(e.inflation >= 0 && e.inflation < .035, e.inflation > .07) },
    { label: 'Budget', value: deficit > 0 ? `${(deficit * 100).toFixed(1)}% deficit` : `${(-deficit * 100).toFixed(1)}% surplus`, delta: 'of GDP', tone: tone(deficit <= .01, deficit > .05) },
    { label: 'Public debt', value: `${Math.round(e.governmentDebt * 100)}% of GDP`, delta: prev ? `${sign(e.governmentDebt - prev.governmentDebt, 0)} pts` : '', tone: tone(e.governmentDebt < .6, e.governmentDebt > 1.2) },
    { label: 'Inequality', value: `${Math.round(e.inequality * 100)}/100`, delta: prev ? `${sign(e.inequality - prev.inequality, 0)}` : '', tone: tone(e.inequality < .35, e.inequality > .5) },
  ]
  const target = approvalTarget(g, v)
  const groups = GROUP_IDS.map(id => ({ label: GROUPS[id].label, emoji: GROUPS[id].emoji, value: target.groups[id] }))
  const causes: string[] = []
  for (const part of o?.parts ?? []) {
    const bits: string[] = []
    if (Math.abs(part.growth) >= .0005) bits.push(`growth ${sign(part.growth)} pts`)
    if (Math.abs(part.revenue) >= .0005) bits.push(`revenue ${sign(part.revenue)}% of GDP`)
    if (Math.abs(part.spending) >= .0005) bits.push(`spending ${sign(part.spending)}% of GDP`)
    if (Math.abs(part.unemployment) >= .0005) bits.push(`jobless ${sign(part.unemployment)} pts`)
    if (Math.abs(part.inflation) >= .0005) bits.push(`prices ${sign(part.inflation)} pts`)
    if (bits.length) causes.push(`${part.label[0].toUpperCase()}${part.label.slice(1)}: ${bits.join(', ')}`)
    if (causes.length >= 6) break
  }
  for (const c of e.causes) if (causes.length < 8 && !c.startsWith('Government policy')) causes.push(c)
  const rating = p.rating || ratingFor(g, country, p)
  const spread = RATING_SPREAD[rating] ?? 0
  return {
    year: g.year, country: getCountry(country).name, office: v.title, approval: v.approval, metrics, groups, causes, rating,
    ratingNote: spread > 0 ? `Lenders charge about ${(spread * 100).toFixed(1)} points extra on new debt.` : 'Lenders trust the government.',
  }
}

function showReport(g: GameState, v: OfficeView): void {
  const data = buildReport(g, v)
  minigame(g, 'nationReport', `State of the Nation ${g.year}`, REPORT_SCRIPT, data as unknown as Json)
}

/** Re-open the last report from the dashboard. */
export function openReport(g: GameState): void {
  const v = officeView(g)
  if (v && v.rank >= 2) showReport(g, v)
}

// ---------------------------------------------------------------------------
// Debt crises

const DEBT_SCRIPT = 'nation.debtCrisis'

defineScript(DEBT_SCRIPT, (g, choice) => {
  const v = officeView(g)
  if (!v || !(v.leader || v.portfolio === 'finance')) return
  const p = editPolicy(g, g.character.countryId)
  const e = economyOf(g)
  if (choice === 'austerity') {
    for (const id of BUDGET_LINES) p.national.budget[id] = Math.max(.5, Math.round((p.national.budget[id] ?? 1) * .85 * 100) / 100)
    for (const id of BUDGET_LINES) p.since[`national.budget.${id}`] = g.year
    p.shocks.push({ id: `austerity${g.year}`, label: 'austerity cuts', until: g.year + 1, growth: -.012, inflation: -.005, unemployment: .01, confidence: .04, sector: '', demand: 0 })
    adjustApproval(g, -6)
    log(g, 'I cut every budget line to calm the bond markets.', 'bad')
    notice(g, 'Austerity', 'You cut every budget line by 15%. Lenders calmed down; voters did not. Expect a weaker year.', { emoji: '✂️', tone: 'bad' })
  } else if (choice === 'bailout') {
    p.national.taxes.income = Math.min(20, (p.national.taxes.income ?? 0) + 3)
    p.since['national.tax.income'] = g.year
    for (const id of BUDGET_LINES) p.national.budget[id] = Math.max(.5, Math.round((p.national.budget[id] ?? 1) * .9 * 100) / 100)
    p.shocks.push({ id: `bailout${g.year}`, label: 'an international bailout', until: g.year + 1, growth: -.006, inflation: 0, unemployment: .005, confidence: .06, sector: '', demand: 0 })
    p.rating = 'B'
    const me = editMe(g)
    me.legitimacy = Math.max(0, me.legitimacy - 6)
    writeMe(g, me)
    adjustApproval(g, -4)
    log(g, 'I accepted an international bailout with strings attached.', 'neutral')
    notice(g, 'Bailout', 'International lenders agreed to a rescue loan. In return: income tax +3 points and 10% off every budget line. Critics call it a loss of sovereignty.', { emoji: '🏦' })
  } else {
    p.writeDown = Math.min(1.5, Math.round(e.governmentDebt * .35 * 1000) / 1000)
    p.since.default = g.year
    p.rating = 'D'
    p.shocks.push({ id: `default${g.year}`, label: 'the government default', until: g.year + 1, growth: -.04, inflation: .03, unemployment: .03, confidence: -.15, sector: 'finance', demand: -.15 })
    adjustApproval(g, -10)
    log(g, 'My government defaulted on its debt.', 'bad')
    notice(g, 'Default', `The government stopped paying its lenders. About ${Math.round(e.governmentDebt * 35)}% of GDP of debt will be written off; banks, savers and the currency take the hit. Nobody will lend to you for years.`, { emoji: '💥', tone: 'bad' })
  }
  writePolicy(g, p)
})

function debtCrisis(g: GameState, v: OfficeView): boolean {
  if (!(v.leader || v.portfolio === 'finance')) return false
  const e = economyOf(g)
  const p = policyOf(g, g.character.countryId)
  const rating = p.rating || ratingFor(g, g.character.countryId, p)
  if (!(rating === 'CCC' || e.governmentDebt >= 2.1 && (e.budget?.deficit ?? 0) > .03)) return false
  const me = meView(g)
  if ((me.cool.debtCrisis ?? -99) > g.year - 3) return false
  const m = editMe(g)
  m.cool.debtCrisis = g.year
  writeMe(g, m)
  scriptChoice(g, DEBT_SCRIPT, 'Debt Crisis', `Lenders are refusing to roll over ${getCountry(g.character.countryId).name}'s debt (${Math.round(e.governmentDebt * 100)}% of GDP, rated ${rating}). What now?`, [
    { id: 'austerity', label: 'Austerity: cut every budget line 15%', emoji: '✂️' },
    { id: 'bailout', label: 'Accept an international bailout (with conditions)', emoji: '🏦' },
    { id: 'default', label: 'Default on the debt', emoji: '💥' },
  ], { emoji: '📉' })
  return true
}

// ---------------------------------------------------------------------------
// Personal taxes under the laws where the player lives

function personalTaxes(g: GameState): void {
  const c = g.character
  if (!hasPolicy(g, c.countryId) || c.prison) return
  const rate = wealthTaxRate(g)
  if (rate > 0) {
    const threshold = typicalIncome(g) * 60
    const base = netWorth(g) - threshold
    if (base > 0) {
      const due = Math.round(base * rate)
      const paid = Math.max(0, Math.min(due, Math.round(c.money)))
      if (paid > 0) {
        c.money -= paid
        log(g, `I paid ${formatMoney(paid)} in wealth tax.`, 'bad')
      }
    }
  }
  const prop = personalTax(g, 'property') / 100
  if (prop !== 0) {
    const value = g.assets.filter(a => a.kind === 'house' && (typeof a.details.countryId !== 'string' || a.details.countryId === c.countryId)).reduce((s, a) => s + Math.max(0, a.value), 0)
    if (value > 0) {
      // A cut can refund at most the tax that was already in the upkeep (about 0.6% of value).
      const amount = Math.round(value * Math.max(-.006, prop))
      if (amount > 0) {
        const paid = Math.min(amount, Math.max(0, Math.round(c.money)))
        if (paid > 0) { c.money -= paid; log(g, `The new property tax cost me ${formatMoney(paid)}.`, 'bad') }
      } else if (amount < 0) {
        c.money += -amount
        log(g, `The property tax cut saved me ${formatMoney(-amount)}.`, 'good')
      }
    }
  }
}

// ---------------------------------------------------------------------------
// The yearly pass

function upkeep(g: GameState): void {
  for (const country of Object.keys((g.flags['nation.policy'] as { countries?: Record<string, unknown> } | undefined)?.countries ?? {})) {
    if (!hasPolicy(g, country)) continue
    const before = policyOf(g, country)
    const p = editPolicy(g, country)
    p.shocks = p.shocks.filter(s => s.until >= g.year)
    p.retaliation = p.retaliation.filter(r => r.until >= g.year)
    p.graft = Math.round(p.graft * .5 * 1e6) / 1e6
    if (p.institutions.emergencyUntil && p.institutions.emergencyUntil < g.year) p.institutions.emergencyUntil = 0
    const rating = ratingFor(g, country, p)
    if (rating !== p.rating) {
      const was = p.rating
      p.rating = rating
      p.ratingYear = g.year
      if (country === g.character.countryId && was && officeView(g)?.rank === 3) {
        const down = RATINGS.indexOf(rating as typeof RATINGS[number]) > RATINGS.indexOf(was as typeof RATINGS[number])
        log(g, `${down ? 'Downgrade' : 'Upgrade'}: the country's credit rating went from ${was} to ${rating}.`, down ? 'bad' : 'good')
      }
    }
    if (JSON.stringify(before) !== JSON.stringify(p)) writePolicy(g, p)
  }
}

export function yearlyNation(g: GameState): void {
  const c = g.character
  if (!c.alive) return
  upkeep(g)
  personalTaxes(g)
  stampCompanyBarriers(g)
  const v = officeView(g)
  if (v && v.rank >= 1 && !c.prison) {
    const me = editMe(g)
    // Meters drift: legitimacy heals in a working democracy, fear fades without repression.
    const regime = policyOf(g, c.countryId).institutions.regime
    me.legitimacy = Math.max(0, Math.min(100, me.legitimacy + (regime === 'authoritarian' ? (30 - me.legitimacy) * .1 : (72 - me.legitimacy) * .08)))
    me.fear = Math.max(regime === 'authoritarian' ? 25 : 0, me.fear - 5)
    me.loyalty = Math.max(0, Math.min(100, me.loyalty + (55 - me.loyalty) * .08))
    me.heat = Math.max(0, me.heat * .6 - 3)
    me.capital = Math.max(0, Math.min(100, me.capital + 6 + (v.approval - 50) / 6))
    const t = approvalTarget(g, v)
    me.groups = Object.fromEntries(GROUP_IDS.map(id => [id, t.groups[id]]))
    writeMe(g, me)
    // Presidential midterms: two years in, the president's side loses some seats.
    if (v.leader && v.presidential && v.termLeft === 2) {
      const p = editPolicy(g, c.countryId)
      if (Object.keys(p.legislature.seats).length) {
        p.legislature = midterm(p.legislature, .06 + Math.max(0, 50 - v.approval) / 250)
        writePolicy(g, p)
      }
    }
    if (v.rank >= 2) {
      const e = economyOf(g)
      const p = editPolicy(g, c.countryId)
      p.reports = [...p.reports.filter(r => r.year !== g.year), { year: g.year, growth: e.growth, unemployment: e.unemployment, inflation: e.inflation, debt: e.governmentDebt, deficit: e.budget?.deficit ?? 0, approval: v.approval, rating: p.rating }].slice(-12)
      writePolicy(g, p)
      if (v.leader || v.portfolio) showReport(g, v)
    }
    const popup = debtCrisis(g, v) || yearlyConsequences(g, v)
    // One political moment a year: skip the drama when the career already asked something.
    const busy = g.queue.some(m => m.kind === 'choice' && typeof m.scriptId === 'string' && m.scriptId.startsWith('special.pol.'))
    if (!popup && !busy && politicianStillIn(g)) yearlyDrama(g, v)
  } else if (hasMe(g)) {
    yearlyConsequences(g, null)
  }
}

function politicianStillIn(g: GameState): boolean {
  return !!officeView(g)
}
