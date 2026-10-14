// Governing: one vocabulary of measures (a tax change, a budget line, a law, a tariff...), what each
// would do (previews from the same overlay the world uses), and the proposal flow: honest pass odds,
// sweeteners (lean on the party, a deal, bribes), vetoes, the courts, retaliation from abroad and
// insider bets on your own policy. Menus build measures; the 'nation.bill' script enacts them.
import { addHidden, count, formatMoney, log, notice, scriptChoice, useYearAction, yearActionsUsed } from '../core'
import { marketOf } from '../data/markets'
import type { Sector } from '../economy/model'
import { initialTrade } from '../economy/trade'
import { typicalIncome } from '../events/wealth-core'
import { chance } from '../rng'
import { defineScript } from '../scripts'
import type { ChoiceOption, GameState, Json } from '../types'
import { COUNTRIES, getCountry } from '../world'
import {
  BUDGET, BUDGET_MAX, BUDGET_MIN, GROUPS, GROUP_IDS, INPUT_LABEL, LAWS, LEGAL, NEW_TAXES, SECTOR_LABEL, STATE_SECTORS, TARIFF_MAX, TAXES, TRADE_INPUT_IDS,
  BREAK_IMPACT, DEAL_IMPACT, EXPORT_BAN_IMPACT, SANCTION_IMPACT, TARIFF_IMPACT, TARGET_INDUSTRIES,
  budgetAvailable, environmentAvailable, groupWeights, industryAvailable, legalAvailable, newTaxAvailable, partyName, salesTaxLabel, taxAvailable,
  type BudgetLine, type GroupId, type Lean, type LegalId, type NewTaxId, type Scope, type TariffInput, type TaxId, type TradeInput,
} from './data'
import { overlayFor, partnerSize } from './effects'
import { coalition, legislatureOf, strikeChance, vetoChance, voteOdds, type Sweetener, type VoteOdds } from './legislature'
import { adjustApproval, officeHooks, officeView, powerFor, type Area, type OfficeView, type Power } from './office'
import { addCase, editMe, meView, note, writeMe, bumpStat } from './state'
import { editPolicy, policyOf, writePolicy, type CountryPolicy, type Layer } from './state'
import { stampCompanyBarriers } from './company'
import { legalBase } from './laws'

export type Measure =
  | { k: 'tax'; scope: Scope; id: TaxId; value: number }
  | { k: 'newTax'; id: NewTaxId; level: number; industry: string }
  | { k: 'break'; industry: string; level: number }
  | { k: 'budget'; scope: Scope; id: BudgetLine; level: number }
  | { k: 'minWage'; scope: Scope; value: number }
  | { k: 'labor'; value: number }
  | { k: 'environment'; value: number }
  | { k: 'dereg'; sector: Sector; on: boolean }
  | { k: 'nationalize'; sector: Sector; on: boolean }
  | { k: 'legal'; id: LegalId; value: number }
  | { k: 'tariff'; input: TariffInput; partner: string; add: number }
  | { k: 'deal'; partner: string; on: boolean }
  | { k: 'sanction'; partner: string; on: boolean }
  | { k: 'exportBan'; input: TradeInput; on: boolean }

export const BILL_SCRIPT = 'nation.bill'
const validCountry = new Set(COUNTRIES.map(c => c.id))
const pct = (n: number, digits = 1) => `${n >= 0 ? '+' : ''}${(n * 100).toFixed(digits)}%`

export function areaOf(m: Measure): Area {
  if (m.k === 'tax' || m.k === 'newTax' || m.k === 'break') return 'tax'
  if (m.k === 'budget') return 'budget'
  if (m.k === 'tariff' || m.k === 'deal' || m.k === 'sanction' || m.k === 'exportBan') return 'trade'
  return 'law'
}

function layerOf(p: CountryPolicy, scope: Scope): Layer {
  return scope === 'regional' ? p.regional : scope === 'city' ? p.city : p.national
}

/** The value a measure would change, as the law stands now. */
export function currentOf(p: CountryPolicy, m: Measure): number {
  switch (m.k) {
    case 'tax': return layerOf(p, m.scope).taxes[m.id] ?? 0
    case 'newTax': return p.newTaxes[m.id]?.level ?? 0
    case 'break': return p.breaks[m.industry] ?? 0
    case 'budget': return layerOf(p, m.scope).budget[m.id] ?? 1
    case 'minWage': return layerOf(p, m.scope).minWage
    case 'labor': return p.labor
    case 'environment': return p.environment
    case 'dereg': return p.dereg[m.sector] ? 1 : 0
    case 'nationalize': return p.nationalized[m.sector] ? 1 : 0
    case 'legal': return p.legal[m.id] ?? 0
    case 'tariff': return p.tariffs.find(t => t.input === m.input && t.partner === m.partner)?.add ?? 0
    case 'deal': return p.deals[m.partner] ? 1 : 0
    case 'sanction': return p.sanctions[m.partner] ? 1 : 0
    case 'exportBan': return p.exportBans[m.input] ? 1 : 0
  }
}

function targetOf(m: Measure): number {
  switch (m.k) {
    case 'tax': case 'minWage': case 'labor': case 'environment': case 'legal': return m.value
    case 'newTax': case 'break': return m.level
    case 'budget': return m.level
    case 'tariff': return m.add
    default: return m.on ? 1 : 0
  }
}

/** Party-stance direction of the change (for votes): the catalog lean, signed and scaled by size. */
export function leanOf(p: CountryPolicy, m: Measure): Lean {
  const d = targetOf(m) - currentOf(p, m)
  const scaled = (lean: Lean | undefined, size: number): Lean => {
    const f = Math.sign(d) * Math.max(.4, Math.min(1.5, size))
    const out: Lean = {}
    for (const [k, v] of Object.entries(lean ?? {}) as [keyof Lean, number][]) out[k] = v * f
    return out
  }
  switch (m.k) {
    case 'tax': return scaled(TAXES[m.id].impact.lean, Math.abs(d) / Math.max(1, TAXES[m.id].soft / 2))
    case 'newTax': return scaled(NEW_TAXES[m.id].impact.lean, Math.abs(d) / 1.5)
    case 'break': return scaled(BREAK_IMPACT.lean, Math.abs(d) / 1.5)
    case 'budget': return scaled(BUDGET[m.id].impact.lean, Math.abs(d) / .4)
    case 'minWage': return scaled(LAWS.minWage.lean, Math.abs(d) / 20)
    case 'labor': return scaled(LAWS.labor.lean, Math.abs(d))
    case 'environment': return scaled(LAWS.environment.lean, Math.abs(d))
    case 'dereg': return scaled(LAWS.dereg.lean, 1)
    case 'nationalize': return scaled(LAWS.nationalize.lean, 1)
    case 'legal': {
      // Legalizing leans liberty; banning leans order. Prohibition's own lean is "allow alcohol".
      const towardLegal = d > 0
      const l = LEGAL[m.id].lean
      return towardLegal ? l : Object.fromEntries(Object.entries(l).map(([k, v]) => [k, -v])) as Lean
    }
    case 'tariff': return scaled(TARIFF_IMPACT.lean, Math.abs(d) / 15)
    case 'deal': return scaled(DEAL_IMPACT.lean, 1)
    case 'sanction': return scaled(SANCTION_IMPACT.lean, 1)
    case 'exportBan': return scaled(EXPORT_BAN_IMPACT.lean, 1)
  }
}

function partnerName(id: string): string {
  return id === 'all' ? 'everyone' : getCountry(id).name
}

/** Plain-language name of the change. */
export function measureLabel(g: GameState, m: Measure): string {
  const p = policyOf(g, g.character.countryId), cur = currentOf(p, m)
  const where = (scope: Scope) => (scope === 'regional' ? 'regional ' : scope === 'city' ? 'city ' : '')
  switch (m.k) {
    case 'tax': {
      const def = TAXES[m.id], name = m.id === 'sales' ? salesTaxLabel(g.character.countryId, g.year) : def.label
      const unit = def.unit === '%' ? '% of value a year' : ' points'
      if (m.value === 0) return `Reset the ${where(m.scope)}${name.toLowerCase()} to its old rate`
      return `${m.value > cur ? 'Raise' : 'Cut'} the ${where(m.scope)}${name.toLowerCase()} to ${m.value > 0 ? '+' : ''}${m.value}${unit} vs today's law`
    }
    case 'newTax': return m.level ? `${cur ? 'Set' : 'Create'} a ${NEW_TAXES[m.id].label.toLowerCase()}${m.industry ? ` on ${m.industry}` : ''} at level ${m.level}` : `Abolish the ${NEW_TAXES[m.id].label.toLowerCase()}`
    case 'break': return m.level ? `A level-${m.level} tax break for ${m.industry}` : `End the tax break for ${m.industry}`
    case 'budget': return `${m.level >= cur ? 'Fund' : 'Cut'} the ${where(m.scope)}${BUDGET[m.id].label.toLowerCase()} budget to ${Math.round(m.level * 100)}% of normal`
    case 'minWage': return m.value === 0 ? `Return the ${where(m.scope)}minimum wage to normal` : `${m.value > cur ? 'Raise' : 'Lower'} the ${where(m.scope)}minimum wage to ${m.value > 0 ? '+' : ''}${m.value}%`
    case 'labor': return m.value > 0 ? 'Stronger labor rules (unions, hours, firing)' : m.value < 0 ? 'Weaker labor rules (easy hiring and firing)' : 'Return labor rules to normal'
    case 'environment': return m.value > 0 ? 'Stricter environmental rules' : m.value < 0 ? 'Looser environmental rules' : 'Return environmental rules to normal'
    case 'dereg': return m.on ? `Deregulate ${SECTOR_LABEL[m.sector]}` : `Re-regulate ${SECTOR_LABEL[m.sector]}`
    case 'nationalize': return m.on ? `Nationalize ${SECTOR_LABEL[m.sector]}` : `Privatize ${SECTOR_LABEL[m.sector]}`
    case 'legal': {
      const def = LEGAL[m.id]
      if (m.value === 0) return `Return ${def.label.toLowerCase()} to the old law`
      return m.value > 0 ? def.legalize : def.ban
    }
    case 'tariff': return m.add ? `A ${m.add}% tariff on ${INPUT_LABEL[m.input]}${m.partner === 'all' ? '' : ` from ${partnerName(m.partner)}`}` : `Scrap the tariff on ${INPUT_LABEL[m.input]}${m.partner === 'all' ? '' : ` from ${partnerName(m.partner)}`}`
    case 'deal': return m.on ? `A free-trade deal with ${partnerName(m.partner)}` : `Leave the trade deal with ${partnerName(m.partner)}`
    case 'sanction': return m.on ? `Sanctions on ${partnerName(m.partner)}` : `Lift sanctions on ${partnerName(m.partner)}`
    case 'exportBan': return m.on ? `Ban exports of ${INPUT_LABEL[m.input]}` : `Allow exports of ${INPUT_LABEL[m.input]} again`
  }
}

/** Why this measure can't be proposed right now (null: it can). Menus AND the resolver use it. */
export function measureBlock(g: GameState, m: Measure, v: OfficeView | null = officeView(g)): string | null {
  if (!v) return 'You need to hold office.'
  if (g.character.prison) return 'Not from prison.'
  const power = powerFor(v, areaOf(m), decreeRule(g))
  if (!power) return `A ${v.title} can't do that.`
  const year = g.year
  const scopeOk = (scope: Scope) => scope === power.scope
  switch (m.k) {
    case 'tax': {
      const def = TAXES[m.id]
      if (!taxAvailable(m.id, year)) return `There is no ${def.label.toLowerCase()} yet in ${year}.`
      if (!scopeOk(m.scope) || !def.scopes.includes(m.scope)) return `A ${v.title} can't set that tax.`
      if (!(m.value >= def.min && m.value <= def.max)) return 'That rate is out of range.'
      break
    }
    case 'newTax': {
      const def = NEW_TAXES[m.id]
      if (power.scope !== 'national') return 'Only national government can create new taxes.'
      if (!newTaxAvailable(m.id, year)) return `Nobody has heard of a ${def.label.toLowerCase()} in ${year}.`
      if (!(m.level >= 0 && m.level <= 3)) return 'That level is out of range.'
      if (def.targeted && m.level > 0 && !(TARGET_INDUSTRIES as readonly string[]).includes(m.industry)) return 'Pick an industry to tax.'
      if (def.targeted && m.level > 0 && !industryAvailable(m.industry as never, year)) return `There is no ${m.industry} industry yet.`
      break
    }
    case 'break':
      if (power.scope !== 'national') return 'Only national government gives tax breaks.'
      if (!(TARGET_INDUSTRIES as readonly string[]).includes(m.industry) || !industryAvailable(m.industry as never, year)) return 'Pick an industry that exists.'
      if (!(m.level >= 0 && m.level <= 3)) return 'That level is out of range.'
      break
    case 'budget': {
      const def = BUDGET[m.id]
      if (!budgetAvailable(m.id, year)) return `There is no ${def.label.toLowerCase()} in ${year}.`
      if (!scopeOk(m.scope) || !def.scopes.includes(m.scope)) return `A ${v.title} doesn't fund that.`
      if (!(m.level >= BUDGET_MIN && m.level <= BUDGET_MAX)) return 'That level is out of range.'
      break
    }
    case 'minWage':
      if (power.scope === 'city' || !scopeOk(m.scope)) return `A ${v.title} can't set the minimum wage.`
      if (!(m.value >= -100 && m.value <= 100)) return 'That level is out of range.'
      break
    case 'labor': case 'environment': case 'dereg': case 'nationalize': case 'legal':
      if (power.scope !== 'national') return 'That is a national law.'
      if (m.k === 'environment' && !environmentAvailable(year)) return 'Environmental law barely exists before the 1960s.'
      if (m.k === 'legal' && !legalAvailable(m.id, year)) return `Nobody is debating ${LEGAL[m.id].label.toLowerCase()} in ${year}.`
      if ((m.k === 'dereg' || m.k === 'nationalize') && !(STATE_SECTORS as readonly string[]).includes(m.sector)) return 'Pick a sector.'
      if ((m.k === 'labor' || m.k === 'environment') && ![-1, 0, 1].includes(m.value)) return 'Pick weaker, normal or stronger.'
      if (m.k === 'legal' && ![-1, 0, 1].includes(m.value)) return 'Pick legal, banned or the old law.'
      if (m.k === 'legal' && m.value !== 0 && (m.value > 0) === legalBase(g, g.character.countryId, m.id)) return m.value > 0 ? 'It is already legal here.' : 'It is already banned here.'
      break
    case 'tariff':
      if (!(TRADE_INPUT_IDS as readonly string[]).includes(m.input) && m.input !== 'all') return 'Pick what to tax.'
      if (m.partner !== 'all' && (!validCountry.has(m.partner) || m.partner === g.character.countryId)) return 'Pick a trading partner.'
      if (!(m.add >= 0 && m.add <= TARIFF_MAX)) return 'That tariff is out of range.'
      if (m.input === 'technology' && year < 1955) return 'There is no electronics trade to tax yet.'
      break
    case 'deal': case 'sanction':
      if (!validCountry.has(m.partner) || m.partner === g.character.countryId) return 'Pick a country.'
      if (m.k === 'deal' && m.on && policyOf(g, g.character.countryId).sanctions[m.partner]) return 'Lift the sanctions first.'
      if (m.k === 'sanction' && m.on && policyOf(g, g.character.countryId).deals[m.partner]) return 'Leave the trade deal first.'
      break
    case 'exportBan':
      if (!(TRADE_INPUT_IDS as readonly string[]).includes(m.input)) return 'Pick a good.'
      if (m.input === 'technology' && year < 1955) return 'There is no electronics trade yet.'
      break
  }
  if (targetOf(m) === currentOf(policyOf(g, g.character.countryId), m)) return 'That is already the law.'
  const limit = billLimit(v)
  if (yearActionsUsed(g, 'nation.bills') >= limit) return `You have used all ${limit} of this year's bills. The chamber has other business.`
  return null
}

/** Rule by decree: emergency powers or an authoritarian regime turn votes into orders. */
export function decreeRule(g: GameState): boolean {
  const inst = policyOf(g, g.character.countryId).institutions
  return inst.regime === 'authoritarian' || inst.emergencyUntil >= g.year
}

export function billLimit(v: OfficeView): number {
  return v.leader ? 6 : v.portfolio ? 4 : v.legislator ? 2 : v.office === 'governor' ? 4 : v.office === 'mayor' ? 3 : 0
}

/** Write a measure into a (copied) country record. */
export function applyMeasure(g: GameState, p: CountryPolicy, m: Measure, v: OfficeView | null): void {
  const year = g.year
  const stamp = (key: string) => { p.since[key] = year }
  const setLayer = (scope: Scope, edit: (l: Layer) => void, key: string) => {
    const l = layerOf(p, scope)
    edit(l)
    if (scope === 'regional') l.place = v?.place || l.place || g.character.city
    if (scope === 'city') l.place = g.character.city
    stamp(`${scope}.${key}`)
  }
  switch (m.k) {
    case 'tax': setLayer(m.scope, l => { const value = Math.round(m.value * 100) / 100; if (value) l.taxes[m.id] = value; else delete l.taxes[m.id] }, `tax.${m.id}`); break
    case 'budget': setLayer(m.scope, l => { if (m.level !== 1) l.budget[m.id] = Math.round(m.level * 100) / 100; else delete l.budget[m.id] }, `budget.${m.id}`); break
    case 'minWage': setLayer(m.scope, l => { l.minWage = Math.round(m.value) }, 'minWage'); break
    case 'newTax': if (m.level) p.newTaxes[m.id] = { level: m.level, industry: NEW_TAXES[m.id].targeted ? m.industry : '' }; else delete p.newTaxes[m.id]; stamp(`newTax.${m.id}`); break
    case 'break': if (m.level) p.breaks[m.industry] = m.level; else delete p.breaks[m.industry]; stamp(`break.${m.industry}`); break
    case 'labor': p.labor = m.value; stamp('labor'); break
    case 'environment': p.environment = m.value; stamp('environment'); break
    case 'dereg': if (m.on) p.dereg[m.sector] = year; else delete p.dereg[m.sector]; stamp(`dereg.${m.sector}`); break
    case 'nationalize':
      if (m.on) {
        p.nationalized[m.sector] = year
        // Owners are compensated: a one-off cost next year.
        p.shocks = [...p.shocks.filter(s => s.id !== `nationalize.${m.sector}`), { id: `nationalize.${m.sector}`, label: `compensation for nationalizing ${SECTOR_LABEL[m.sector]}`, until: year + 1, growth: 0, inflation: 0, unemployment: 0, confidence: -.01, sector: '', demand: 0, spend: .008 }]
      } else {
        delete p.nationalized[m.sector]
        // Sale proceeds pay down public debt.
        p.writeDown = Math.min(1.5, Math.round((p.writeDown + .006) * 1e4) / 1e4)
      }
      stamp(`nationalize.${m.sector}`)
      break
    case 'legal': if (m.value) p.legal[m.id] = m.value; else delete p.legal[m.id]; stamp(`legal.${m.id}`); break
    case 'tariff': {
      p.tariffs = p.tariffs.filter(t => !(t.input === m.input && t.partner === m.partner))
      if (m.add > 0) p.tariffs.push({ input: m.input, partner: m.partner, add: Math.round(m.add) })
      stamp(`tariff.${m.input}.${m.partner}`)
      break
    }
    case 'deal': if (m.on) p.deals[m.partner] = year; else delete p.deals[m.partner]; stamp(`deal.${m.partner}`); break
    case 'sanction': if (m.on) p.sanctions[m.partner] = year; else delete p.sanctions[m.partner]; stamp(`sanction.${m.partner}`); break
    case 'exportBan': if (m.on) p.exportBans[m.input] = year; else delete p.exportBans[m.input]; stamp(`exportBan.${m.input}`); break
  }
}

// ---------------------------------------------------------------------------
// Previews

/** The country's economy in money: about 1.6 typical incomes per person (constant 2026 dollars). */
export function gdpOf(g: GameState, country = g.character.countryId): number {
  return Math.max(1e8, marketOf(country).populationM * 1e6 * typicalIncome(g, country) * 1.6)
}

export interface Preview {
  revenue: number
  growth: number
  unemployment: number
  inflation: number
  groups: Partial<Record<GroupId, number>>
  /** Weighted approval effect in its first year (before the office's accountability). */
  approval: number
  lines: string[]
}

/** What the measure would do next year: overlay with it minus overlay without it (the real math). */
export function previewOf(g: GameState, m: Measure): Preview {
  const country = g.character.countryId
  const before = policyOf(g, country)
  const after = editPolicy(g, country)
  applyMeasure(g, after, m, officeView(g))
  const y = g.year + 1
  const a = overlayFor(before, y, false), b = overlayFor(after, y, false)
  const reachScale = 1
  const revenue = (b.revenue - a.revenue) * reachScale
  const spending = Object.keys(b.spend).reduce((s, k) => s + b.spend[k as keyof typeof b.spend] - a.spend[k as keyof typeof a.spend], 0)
  const growth = b.growth - a.growth, unemployment = b.unemployment - a.unemployment, inflation = b.inflation - a.inflation
  const groups: Partial<Record<GroupId, number>> = {}
  const w = groupWeights(country, g.year)
  let approval = 0
  for (const id of GROUP_IDS) {
    const d = b.groups[id] - a.groups[id]
    if (Math.abs(d) >= .05) groups[id] = d
    approval += w[id] * d
  }
  const gdp = gdpOf(g)
  const lines: string[] = []
  const net = revenue - spending
  if (Math.abs(revenue) > 1e-5) lines.push(`Revenue ${revenue >= 0 ? '+' : '−'}${formatMoney(Math.abs(revenue * gdp))} a year (${pct(revenue, 2)} of GDP).`)
  if (Math.abs(spending) > 1e-5) lines.push(`Spending ${spending >= 0 ? '+' : '−'}${formatMoney(Math.abs(spending * gdp))} a year (${pct(spending, 2)} of GDP).`)
  if (Math.abs(net) > 1e-5 && Math.abs(revenue) > 1e-5 && Math.abs(spending) > 1e-5) lines.push(`Net for the budget: ${net >= 0 ? 'better' : 'worse'} by ${formatMoney(Math.abs(net * gdp))}.`)
  const macro: string[] = []
  if (Math.abs(growth) >= .0005) macro.push(`growth ${pct(growth, 1)}`)
  if (Math.abs(unemployment) >= .0005) macro.push(`unemployment ${pct(unemployment, 1)}`)
  if (Math.abs(inflation) >= .0005) macro.push(`inflation ${pct(inflation, 1)}`)
  if (macro.length) lines.push(`First year: ${macro.join(', ')} (fades over three years).`)
  const sectors = Object.entries(b.sectors).map(([s, row]) => [s, (row?.demand ?? 0) - (a.sectors[s as Sector]?.demand ?? 0), (row?.costs ?? 0) - (a.sectors[s as Sector]?.costs ?? 0)] as const)
    .filter(([, d, c]) => Math.abs(d) >= .005 || Math.abs(c) >= .005)
  for (const [s, d, c] of sectors.slice(0, 2)) lines.push(`${SECTOR_LABEL[s as Sector][0].toUpperCase()}${SECTOR_LABEL[s as Sector].slice(1)}: demand ${pct(d, 0)}${Math.abs(c) >= .005 ? `, costs ${pct(c, 0)}` : ''}.`)
  const likes = GROUP_IDS.filter(id => (groups[id] ?? 0) >= .5).map(id => GROUPS[id].label.toLowerCase())
  const hates = GROUP_IDS.filter(id => (groups[id] ?? 0) <= -.5).map(id => GROUPS[id].label.toLowerCase())
  if (likes.length || hates.length) lines.push(`${likes.length ? `Pleases ${likes.join(', ')}` : ''}${likes.length && hates.length ? '; ' : ''}${hates.length ? `angers ${hates.join(', ')}` : ''}.`)
  return { revenue, growth, unemployment, inflation, groups, approval, lines }
}

/** How strongly approval answers to the national results and to policy, by office. */
export function accountability(v: OfficeView): number {
  return v.leader ? 1 : v.portfolio ? .6 : v.office === 'governor' ? (v.legislator ? .3 : .45) : v.office === 'mayor' ? .2 : 0
}

// ---------------------------------------------------------------------------
// Proposing and voting

function bribeCost(g: GameState): number {
  return Math.round(typicalIncome(g) * 30 / 1000) * 1000
}
const WHIP_CAPITAL = 15

function oddsFor(g: GameState, v: OfficeView, power: Power, m: Measure, sweet: Sweetener): VoteOdds {
  const p = policyOf(g, g.character.countryId)
  return voteOdds(g, v, power, leanOf(p, m), { sweetener: sweet })
}

/** Odds a trade deal partner agrees to talks at all (before the vote). */
export function dealAcceptance(g: GameState, partner: string): number {
  const mine = partnerSize(g.character.countryId), theirs = partnerSize(partner)
  const v = officeView(g)
  return Math.max(.15, Math.min(.9, .45 + (mine - theirs) * .4 + ((v?.approval ?? 50) - 50) / 250))
}

const pctText = (n: number) => `${Math.round(n * 100)}%`

/** Put a measure on the table: a popup with the preview and honest odds for each way to win the vote. */
export function propose(g: GameState, m: Measure): void {
  const v = officeView(g)
  const why = measureBlock(g, m, v)
  if (why || !v) { notice(g, 'Not Possible', why ?? 'You need to hold office.', { emoji: '🚫' }); return }
  const power = powerFor(v, areaOf(m), decreeRule(g))!
  const prev = previewOf(g, m)
  const label = measureLabel(g, m)
  const deal = m.k === 'deal' && m.on ? dealAcceptance(g, m.partner) : 1
  const head = `${label}.\n\n${prev.lines.join('\n') || 'Little measurable effect on the economy.'}`
  const choices: ChoiceOption[] = []
  let text: string
  if (power.route === 'decree') {
    text = `${head}\n\n${deal < 1 ? `${getCountry((m as { partner: string }).partner).name} accepts talks ${pctText(deal)} of the time. ` : ''}You can sign this as an executive order. No vote needed.`
    choices.push({ id: 'none', label: deal < 1 ? `Sign it (${pctText(deal)} they agree)` : 'Sign the order', emoji: '🖊️' })
  } else {
    const base = oddsFor(g, v, power, m, 'none')
    const me = meView(g)
    const body = power.body === 'council' ? (power.scope === 'city' ? 'the city council' : 'the regional assembly') : 'the legislature'
    text = `${head}\n\n${body[0].toUpperCase()}${body.slice(1)} must vote${power.body === 'legislature' ? ` (expected yes ${pctText(Math.min(1, base.yes))}, needs ${pctText(base.need)})` : ''}.${deal < 1 ? ` First ${getCountry((m as { partner: string }).partner).name} must accept talks (${pctText(deal)}).` : ''}`
    choices.push({ id: 'none', label: `Put it to a vote (${pctText(base.pass * deal)})`, emoji: '🗳️' })
    if (me.capital >= WHIP_CAPITAL) choices.push({ id: 'whip', label: `Lean on your party (${WHIP_CAPITAL} capital, ${pctText(oddsFor(g, v, power, m, 'whip').pass * deal)})`, emoji: '📣' })
    const dealOdds = oddsFor(g, v, power, m, 'deal')
    if (power.body === 'legislature' && dealOdds.dealParty) choices.push({ id: 'deal', label: `Cut a deal with the ${partyLabel(dealOdds.dealParty)} (pork, ${pctText(dealOdds.pass * deal)})`, emoji: '🤝' })
    else if (power.body === 'council') choices.push({ id: 'deal', label: `Promise projects to waverers (${pctText(dealOdds.pass * deal)})`, emoji: '🤝' })
    choices.push({ id: 'bribe', label: `Pay off waverers (${formatMoney(bribeCost(g))}, ${pctText(oddsFor(g, v, power, m, 'bribe').pass * deal)}, illegal)`, emoji: '💼' })
  }
  choices.push({ id: 'cancel', label: 'Withdraw it', emoji: '✖️' })
  const warning = insiderWarning(g, m, label)
  if (warning) text += `\n\n${warning}`
  scriptChoice(g, BILL_SCRIPT, power.route === 'decree' ? 'Executive Order' : 'New Bill', text, choices, { emoji: '🏛️', data: { m: m as unknown as Json } })
}

function partyLabel(id: string): string {
  return partyName(id)
}

function parseMeasure(raw: unknown): Measure | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const m = raw as Record<string, unknown>
  const ks = ['tax', 'newTax', 'break', 'budget', 'minWage', 'labor', 'environment', 'dereg', 'nationalize', 'legal', 'tariff', 'deal', 'sanction', 'exportBan']
  if (!ks.includes(String(m.k))) return null
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN)
  const str = (v: unknown) => (typeof v === 'string' ? v.slice(0, 40) : '')
  const scope = (v: unknown): Scope => (v === 'regional' || v === 'city' ? v : 'national')
  switch (m.k) {
    case 'tax': return TAXES[m.id as TaxId] ? { k: 'tax', scope: scope(m.scope), id: m.id as TaxId, value: num(m.value) } : null
    case 'newTax': return NEW_TAXES[m.id as NewTaxId] ? { k: 'newTax', id: m.id as NewTaxId, level: num(m.level), industry: str(m.industry) } : null
    case 'break': return { k: 'break', industry: str(m.industry), level: num(m.level) }
    case 'budget': return BUDGET[m.id as BudgetLine] ? { k: 'budget', scope: scope(m.scope), id: m.id as BudgetLine, level: num(m.level) } : null
    case 'minWage': return { k: 'minWage', scope: scope(m.scope), value: num(m.value) }
    case 'labor': return { k: 'labor', value: num(m.value) }
    case 'environment': return { k: 'environment', value: num(m.value) }
    case 'dereg': return { k: 'dereg', sector: str(m.sector) as Sector, on: m.on === true }
    case 'nationalize': return { k: 'nationalize', sector: str(m.sector) as Sector, on: m.on === true }
    case 'legal': return LEGAL[m.id as LegalId] ? { k: 'legal', id: m.id as LegalId, value: num(m.value) } : null
    case 'tariff': return { k: 'tariff', input: str(m.input) as TariffInput, partner: str(m.partner), add: num(m.add) }
    case 'deal': return { k: 'deal', partner: str(m.partner), on: m.on === true }
    case 'sanction': return { k: 'sanction', partner: str(m.partner), on: m.on === true }
    case 'exportBan': return { k: 'exportBan', input: str(m.input) as TradeInput, on: m.on === true }
  }
  return null
}

defineScript(BILL_SCRIPT, (g, choice, data) => {
  if (choice === 'cancel') return
  const m = parseMeasure((data as { m?: unknown } | undefined)?.m)
  if (!m) return
  resolveBill(g, m, (['none', 'whip', 'deal', 'bribe'].includes(choice) ? choice : 'none') as Sweetener)
})

/** Resolve a proposal: pay for the sweetener, roll the (shown) odds, veto, courts, then enact. */
export function resolveBill(g: GameState, m: Measure, sweet: Sweetener): boolean {
  const v = officeView(g)
  const why = measureBlock(g, m, v)
  if (why || !v) { notice(g, 'Not Possible', why ?? 'You need to hold office.', { emoji: '🚫' }); return false }
  const power = powerFor(v, areaOf(m), decreeRule(g))!
  const label = measureLabel(g, m)
  const me = editMe(g)
  if (power.route === 'decree') sweet = 'none'
  if (sweet === 'whip') {
    if (me.capital < WHIP_CAPITAL) { notice(g, 'No Leverage', 'You do not have the political capital to lean on anyone.', { emoji: '📉' }); return false }
    me.capital -= WHIP_CAPITAL
  }
  let bribeLine = ''
  if (sweet === 'bribe') {
    const cost = bribeCost(g)
    const fromDirty = Math.min(me.dirty, cost)
    if (fromDirty + Math.max(0, g.character.money) < cost) { notice(g, 'No Money', `Waverers want ${formatMoney(cost)} in cash. You don't have it.`, { emoji: '💸' }); return false }
    me.dirty -= fromDirty
    g.character.money -= cost - fromDirty
    addHidden(g, 'karma', -8)
    me.heat = Math.min(100, me.heat + 8)
    addCase(g, me, { kind: 'votes', label: `Paid lawmakers to pass "${label}"`, evidence: .3, amount: cost })
    bribeLine = ` ${formatMoney(cost)} changed hands in a car park.`
    count(g, 'votesBought')
  }
  useYearAction(g, 'nation.bills', billLimit(v))
  bumpStat(me, 'proposals')
  // Trade deals need a partner first.
  if (m.k === 'deal' && m.on && !chance(g, dealAcceptance(g, m.partner))) {
    writeMe(g, me)
    notice(g, 'Talks Collapsed', `${getCountry(m.partner).name} walked away from the table. No deal.`, { emoji: '🤝', tone: 'bad' })
    return false
  }
  const odds = power.route === 'decree' ? { pass: 1, yes: 1, need: 0, dealParty: '', body: 'none' as const } : oddsFor(g, v, power, m, sweet)
  if (!chance(g, odds.pass)) {
    me.capital = Math.max(0, me.capital - 5)
    bumpStat(me, 'failed')
    note(me, `${g.year}: "${label}" failed.`)
    writeMe(g, me)
    adjustApproval(g, -1)
    log(g, `My bill failed: ${label}.`, 'bad')
    const tally = power.body === 'legislature' ? ` It got ${pctText(Math.min(odds.need - .005, odds.yes))} of the votes; it needed ${pctText(odds.need)}.` : ''
    notice(g, 'Bill Defeated', `"${label}" was voted down.${tally}${bribeLine}`, { emoji: '🗳️', tone: 'bad' })
    return false
  }
  const p = editPolicy(g, g.character.countryId)
  // Presidential systems: a president of the other side may veto what the legislature passed.
  if (power.route === 'vote' && power.body === 'legislature' && chance(g, vetoChance(g, v, leanOf(p, m)))) {
    bumpStat(me, 'vetoed')
    writeMe(g, me)
    log(g, `The President vetoed my bill: ${label}.`, 'bad')
    notice(g, 'Vetoed', `"${label}" passed, then the President vetoed it.${bribeLine}`, { emoji: '🚫', tone: 'bad' })
    return false
  }
  // Courts review laws that push against property rights or liberties.
  const risk = courtRisk(m)
  if (risk > 0 && chance(g, strikeChance(g, risk))) {
    bumpStat(me, 'struck')
    writeMe(g, me)
    log(g, `The courts struck down my law: ${label}.`, 'bad')
    notice(g, 'Struck Down', `"${label}" passed, but the courts struck it down as unconstitutional.${bribeLine}`, { emoji: '⚖️', tone: 'bad' })
    return false
  }
  if (sweet === 'deal') {
    // Pork: the swing party's favourite programme gets 10% more (a real cost to the budget).
    const line = porkLine(odds.dealParty)
    const l = layerOf(p, power.scope)
    if (BUDGET[line].scopes.includes(power.scope) && budgetAvailable(line, g.year)) {
      l.budget[line] = Math.min(BUDGET_MAX, Math.round(((l.budget[line] ?? 1) + .1) * 100) / 100)
      p.since[`${power.scope}.budget.${line}`] = g.year
    }
  }
  const before = previewOf(g, m)
  applyMeasure(g, p, m, v)
  writePolicy(g, p)
  bumpStat(me, 'passed')
  me.capital = Math.min(100, me.capital + 2)
  note(me, `${g.year}: ${label}.`)
  writeMe(g, me)
  count(g, 'lawsPassed')
  // Voters react at once to part of the change; the rest follows in the yearly results.
  const react = Math.round(before.approval * accountability(v) * .5)
  if (react) adjustApproval(g, react)
  const extras: string[] = []
  const retaliation = afterTrade(g, m)
  if (retaliation) extras.push(retaliation)
  const insider = insiderLine(g, m, label)
  if (insider) extras.push(insider)
  if (areaOf(m) === 'trade') stampCompanyBarriers(g)
  log(g, `${power.route === 'decree' ? 'I signed an order' : 'I passed a law'}: ${label}.`, 'good')
  const tally = power.body === 'legislature' && power.route === 'vote' ? ` (${pctText(Math.max(odds.need + .005, odds.yes))} voted yes)` : ''
  notice(g, power.route === 'decree' ? 'Order Signed' : 'Bill Passed', `${label}${tally}.${bribeLine}${react ? ` Approval ${react > 0 ? '+' : ''}${react}.` : ''}${extras.length ? `\n\n${extras.join('\n\n')}` : ''}`, { emoji: '🏛️', tone: 'good' })
  return true
}

/** How likely courts are to object to a measure (0 = never). Pure; shown via strikeChance. */
export function courtRisk(m: Measure): number {
  if (m.k === 'nationalize' && m.on) return .3
  if (m.k === 'tax' && m.id === 'wealth' && m.value > 2) return .25
  if (m.k === 'legal' && m.value < 0) return .2
  if (m.k === 'tax' && m.id === 'inheritance' && m.value > 25) return .15
  return 0
}

function porkLine(party: string): BudgetLine {
  return ({ progressive: 'welfare', conservative: 'military', centrist: 'infrastructure', green: 'research', libertarian: 'police', independent: 'infrastructure' } as Record<string, BudgetLine>)[party] ?? 'infrastructure'
}

/** Trading partners worth listing: the country's suppliers and the biggest economies. */
export function partnersOf(g: GameState, input: TariffInput = 'all'): string[] {
  const c = g.character.countryId
  const ids = new Set<string>()
  const t = initialTrade(c, g.year)
  for (const i of TRADE_INPUT_IDS) if (input === 'all' || input === i) for (const r of t.inputs[i].routes) ids.add(r.partner)
  for (const big of ['us', 'cn', 'de', 'jp', 'gb', 'fr', 'in', 'ru', 'br', 'ca']) ids.add(big)
  ids.delete(c)
  return [...ids].filter(id => validCountry.has(id)).sort((a, b) => partnerSize(b) - partnerSize(a)).slice(0, 10)
}

/** Partners hit back at new tariffs, sanctions and export bans; cuts and deals calm them. */
function afterTrade(g: GameState, m: Measure): string {
  if (areaOf(m) !== 'trade') return ''
  const country = g.character.countryId
  const p = editPolicy(g, country)
  const lines: string[] = []
  const hitBack = (from: string, input: TariffInput, add: number) => {
    p.retaliation = p.retaliation.filter(r => !(r.from === from && r.input === input))
    p.retaliation.push({ from, input, add: Math.min(TARIFF_MAX, Math.max(5, Math.round(add / 5) * 5)), until: g.year + 4 })
    lines.push(`${getCountry(from).name} hit back with a ${Math.max(5, Math.round(add / 5) * 5)}% tariff on our ${input === 'all' ? 'exports' : INPUT_LABEL[input]}.`)
  }
  if (m.k === 'tariff') {
    const before = policyOf(g, country).tariffs.find(t => t.input === m.input && t.partner === m.partner)
    if (m.add === 0 || (before && m.add < before.add)) {
      const targets = m.partner === 'all' ? new Set(p.retaliation.map(r => r.from)) : new Set([m.partner])
      const kept = p.retaliation.filter(r => !targets.has(r.from) || r.until <= g.year)
      if (kept.length < p.retaliation.length) lines.push('Partners started rolling back their own tariffs.')
      p.retaliation = p.retaliation.map(r => (targets.has(r.from) && r.until > g.year ? { ...r, until: g.year } : r))
    } else {
      const partners = m.partner === 'all' ? partnersOf(g, m.input).slice(0, 5) : [m.partner]
      for (const from of partners) {
        const size = partnerSize(from), friendly = p.deals[from] ? .5 : 1
        if (chance(g, Math.max(.1, Math.min(.85, (.2 + .5 * size * Math.min(1, m.add / 25)) * friendly)))) hitBack(from, m.input, m.add * (.5 + .5 * size))
      }
      if (!lines.length) lines.push('Nobody retaliated. This time.')
    }
  } else if (m.k === 'sanction') {
    if (m.on && chance(g, .7)) {
      p.retaliation = p.retaliation.filter(r => r.from !== m.partner)
      p.retaliation.push({ from: m.partner, input: 'all', add: 25, until: g.year + 6 })
      lines.push(`${getCountry(m.partner).name} answered with counter-sanctions and a 25% tariff on everything we sell them.`)
    } else if (!m.on) p.retaliation = p.retaliation.map(r => (r.from === m.partner && r.until > g.year ? { ...r, until: g.year } : r))
  } else if (m.k === 'exportBan' && m.on) {
    for (const from of partnersOf(g, m.input).slice(0, 4)) if (chance(g, .35 * partnerSize(from) + .1)) hitBack(from, 'all', 10)
  } else if (m.k === 'deal' && m.on) {
    p.retaliation = p.retaliation.map(r => (r.from === m.partner && r.until > g.year ? { ...r, until: g.year } : r))
    lines.push(`Tariffs between us and ${getCountry(m.partner).name} fall to zero next year.`)
  }
  writePolicy(g, p)
  return lines.join(' ')
}

/** The industry a measure moves the listed shares of, and whether it helps them (null: it moves no shares). */
export function policyMoveOf(m: Measure): { sector: string; bullish: boolean } | null {
  switch (m.k) {
    case 'tariff': return m.add > 0 && m.input !== 'all' ? { sector: m.input, bullish: true } : null
    case 'newTax': return m.level > 0 && m.industry ? { sector: m.industry, bullish: false } : null
    case 'break': return m.level > 0 ? { sector: m.industry, bullish: true } : null
    case 'dereg': return m.on ? { sector: m.sector, bullish: true } : null
    case 'nationalize': return m.on ? { sector: m.sector, bullish: false } : null
    default: return null
  }
}

/** Policies that move an industry's listed shares: the career module checks for insider bets. */
function insiderLine(g: GameState, m: Measure, label: string): string {
  const move = policyMoveOf(m)
  return move ? officeHooks().policyMove(g, move.sector, move.bullish, label) : ''
}

/** Said before the vote: a law that would count against positions the player recently took ('' when none). */
function insiderWarning(g: GameState, m: Measure, label: string): string {
  const move = policyMoveOf(m)
  return move ? officeHooks().policyWarning(g, move.sector, move.bullish, label) : ''
}

// ---------------------------------------------------------------------------
// Bills the legislature sends to the player's desk (special/politics.ts): named bills that map to
// a measure enact it when signed (or voted for), instead of the old generic economic policy.

export function deskMeasure(g: GameState, name: string): Measure | null {
  const v = officeView(g)
  if (!v || v.rank < 1) return null
  const p = policyOf(g, g.character.countryId)
  const scope: Scope = v.rank >= 3 || v.legislator || v.portfolio ? 'national' : v.office === 'governor' ? 'regional' : 'city'
  const budget = (id: BudgetLine, by: number): Measure | null => {
    if (!budgetAvailable(id, g.year) || !BUDGET[id].scopes.includes(scope)) return null
    const cur = layerOf(p, scope).budget[id] ?? 1
    return { k: 'budget', scope, id, level: Math.min(BUDGET_MAX, Math.round((cur + by) * 100) / 100) }
  }
  const n = name.toLowerCase()
  if (scope !== 'city') {
    if (n.includes('minimum wage')) return { k: 'minWage', scope, value: Math.min(100, layerOf(p, scope).minWage + 15) }
    if (/cut the .*income tax|sweeping tax cut/.test(n)) return taxAvailable('income', g.year) && TAXES.income.scopes.includes(scope) ? { k: 'tax', scope, id: 'income', value: Math.max(TAXES.income.min, (layerOf(p, scope).taxes.income ?? 0) - (n.includes('sweeping') ? 4 : 2)) } : null
    if (n.includes('hospital') || n.includes('universal healthcare') || n.includes('waiting lists')) return budget('healthcare', n.includes('universal') ? .5 : .25)
    if (n.includes('college') || n.includes('school lunches') || n.includes('student loan')) return n.includes('student loan') ? budget('welfare', .15) : budget('education', .25)
    if (n.includes('high-speed rail') || n.includes('gas tax') || n.includes('infrastructure plan')) return budget('infrastructure', n.includes('infrastructure plan') ? .6 : .3)
    if (n.includes('defense budget')) return budget('military', .3)
    if (n.includes('mission to mars')) return budget('space', 1)
    if (n.includes('carbon tax') && scope === 'national' && newTaxAvailable('carbon', g.year)) return { k: 'newTax', id: 'carbon', level: Math.min(3, (p.newTaxes.carbon?.level ?? 0) + 1), industry: '' }
    if (n.includes('plastic bags') && scope === 'national' && environmentAvailable(g.year)) return p.environment < 1 ? { k: 'environment', value: 1 } : null
    if (n.includes('sports betting') && scope === 'national') return legalBase(g, g.character.countryId, 'casinos') ? null : { k: 'legal', id: 'casinos', value: 1 }
    if (n.includes('tougher sentencing')) return budget('police', .2)
  } else {
    if (n.includes('police')) return budget('police', .25)
    if (n.includes('pothole') || n.includes('stadium') || n.includes('wi-fi') || n.includes('bike lanes')) return budget('infrastructure', .15)
  }
  return null
}

/** Enact a bill the player signed from their desk (it already passed the chamber). */
export function enactDeskBill(g: GameState, m: Measure): string {
  const v = officeView(g)
  const p = editPolicy(g, g.character.countryId)
  if (!v) return ''
  // Preview against the law as it stands, before the bill changes it.
  const prev = previewOf(g, m)
  applyMeasure(g, p, m, v)
  writePolicy(g, p)
  const text = prev.lines.slice(0, 2).join(' ')
  return text ? ` ${text}` : ''
}

/** Seats and the coalition, refreshed when the player takes the top job. */
export function onTopJob(g: GameState, party: string, share: number): void {
  const p = editPolicy(g, g.character.countryId)
  const leg = legislatureOf(g, g.character.countryId, p)
  const pm = leg.gov.length > 1 || !officeView(g)?.presidential
  const seats = { ...leg.seats }
  const target = Math.max(.15, Math.min(.65, .22 + (share - 50) / 100 * 1.4 + p.institutions.gerrymander))
  const others = Object.keys(seats).filter(id => id !== party).reduce((s, id) => s + seats[id], 0)
  for (const id of Object.keys(seats)) if (id !== party) seats[id] = others > 0 ? seats[id] / others * (1 - target) : 0
  seats[party] = target
  p.legislature = { seats, gov: coalition(seats, party, pm), year: g.year, leaderParty: party, mine: true }
  p.institutions.gerrymander = 0
  writePolicy(g, p)
}

