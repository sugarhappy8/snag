// Lining your pockets (fictional and abstract: no real methods, people or places). Schemes pay into
// a slush fund of dirty money that is not bank money: it must be laundered through a company you
// control, moved offshore and brought home as "consulting fees", or spent on bribes, and it can be
// seized. Every scheme shows its take and its odds of being caught this year (the resolver rolls
// exactly that), and leaves evidence in a case file that can surface for years. Sizes are capped by
// the economy, the office and how corrupt the country is.
import { firmCash } from '../cash'
import { addHidden, count, earnIncome, formatMoney, log, notice, useYearAction, yearActionsUsed } from '../core'
import { marketOf } from '../data/markets'
import { typicalIncome } from '../events/wealth-core'
import { ref } from '../kernel/ids'
import { chance } from '../rng'
import { bizOf, businessAssets, readBiz } from '../business/state'
import { refreshValue, valuationOf } from '../business/economy'
import { isFinanceFirm } from '../business/finance-firm-state'
import type { Asset, GameState } from '../types'
import { gdpOf } from './govern'
import { scrutiny } from './consequences'
import { officeView, type OfficeView } from './office'
import { addCase, editMe, editPolicy, meView, note, policyOf, writeMe, writePolicy, bumpStat } from './state'

export type SchemeId = 'kickbacks' | 'embezzle' | 'permits' | 'pardons' | 'posts' | 'passports' | 'stateCut' | 'cronies'

export interface SchemeDef {
  id: SchemeId
  label: string
  emoji: string
  blurb: string
  /** Share of the office's cap this scheme can reach. */
  mult: number
  /** How conspicuous it is. */
  risk: number
  from: number
  allowed: (v: OfficeView, g: GameState) => string | null
}

const nationalOnly = (v: OfficeView) => (v.leader || v.portfolio ? null : 'Only a head of government or a minister can do that.')
export const SCHEMES: SchemeDef[] = [
  { id: 'kickbacks', label: 'Kickbacks on public contracts', emoji: '🧾', blurb: 'Contractors pay you a slice of every project they win.', mult: 1, risk: 1, from: 1900, allowed: () => null },
  { id: 'embezzle', label: 'Embezzle from public funds', emoji: '🕳️', blurb: 'Ghost employees and consultancy fees nobody reads.', mult: .8, risk: 1.4, from: 1900, allowed: () => null },
  { id: 'permits', label: 'Sell permits and licences', emoji: '📋', blurb: 'Developers and bar owners pay to skip the queue.', mult: .35, risk: .7, from: 1900, allowed: (v) => (v.office === 'mayor' || v.regionalHead || v.leader || v.portfolio === 'interior' ? null : 'Your office issues no permits.') },
  { id: 'pardons', label: 'Sell pardons', emoji: '🗝️', blurb: 'Rich convicts pay handsomely for a clean slate.', mult: .35, risk: 1.1, from: 1900, allowed: (v) => (v.leader || v.regionalHead ? null : 'Only a head of government or a regional head pardons.') },
  { id: 'posts', label: 'Sell appointments', emoji: '🎩', blurb: 'Ambassadorships and board seats for the highest bidder.', mult: .3, risk: .9, from: 1900, allowed: (v) => (v.rank >= 2 ? null : 'You have no posts to hand out.') },
  { id: 'passports', label: 'Sell passports', emoji: '🛂', blurb: '"Investor citizenship", minus the investment.', mult: .5, risk: 1, from: 1980, allowed: (v) => (v.leader ? null : 'Only the head of government can sell citizenship.') },
  { id: 'stateCut', label: 'Take a cut from state enterprises', emoji: '🏭', blurb: 'State companies quietly pay you a dividend nobody voted for.', mult: .6, risk: .9, from: 1900,
    allowed: (v, g) => nationalOnly(v) ?? (stateEnterprises(g) > 0 ? null : 'There are no state enterprises: nationalize something first.') },
  { id: 'cronies', label: 'Hand state assets to cronies', emoji: '🤝', blurb: 'A friendly tycoon buys a state asset cheap and shares the gain.', mult: .9, risk: 1.2, from: 1900, allowed: (v) => (v.leader ? null : 'Only the head of government can sell off state assets.') },
]

export function schemeOf(id: string): SchemeDef | undefined {
  return SCHEMES.find(s => s.id === id)
}

/** State enterprises to skim: nationalized sectors, plus the state giants of corrupt countries. */
export function stateEnterprises(g: GameState): number {
  const p = policyOf(g, g.character.countryId)
  return Object.keys(p.nationalized).length + (marketOf(g.character.countryId).corruption >= 50 ? 1 : 0)
}

/** The office's yearly cap on what one scheme can take (constant 2026 dollars). */
export function officeCap(g: GameState, v: OfficeView): number {
  const share = v.leader ? 3e-6 : v.portfolio ? 1.5e-6 : v.regionalHead ? 8e-7 : v.legislator ? 4e-7 : v.office === 'mayor' ? 1e-7 : 0
  const corruption = Math.max(10, marketOf(g.character.countryId).corruption)
  return gdpOf(g) * share * Math.pow(corruption / 50, 1.5)
}

export interface SchemeQuote { take: number; caught: number; evidence: number; heat: number; cap: number }

/** What a scheme at `size` (0.1-1 of its cap) takes, and the odds of being caught this year (pure). */
export function schemeQuote(g: GameState, v: OfficeView, def: SchemeDef, size: number): SchemeQuote {
  const s = Math.max(.1, Math.min(1, size))
  const me = meView(g)
  const mult = def.id === 'stateCut' ? def.mult * (1 + .3 * Math.max(0, stateEnterprises(g) - 1)) : def.mult
  const cap = Math.round(officeCap(g, v) * mult)
  const evidenceOnFile = me.cases.filter(c => c.status === 'open').reduce((t, c) => t + c.evidence, 0)
  const caught = Math.max(.01, Math.min(.9, scrutiny(g) * (.03 + .6 * Math.pow(s, 1.6)) * def.risk + me.heat / 800 + evidenceOnFile * .01))
  return { take: Math.floor(cap * s / 100) * 100, caught, evidence: .1 + .35 * s, heat: 4 + 20 * s * s, cap }
}

export function schemeBlock(g: GameState, def: SchemeDef, v: OfficeView | null = officeView(g)): string | null {
  if (!v || v.rank < 1) return 'You need to hold office.'
  if (g.character.prison) return 'Not from prison.'
  if (g.year < def.from) return `Nobody sells ${def.label.toLowerCase().replace(/^sell /, '')} in ${g.year}.`
  const why = def.allowed(v, g)
  if (why) return why
  if (yearActionsUsed(g, `graft.${def.id}`) >= 1) return 'Once a year. Greed gets noticed.'
  if (yearActionsUsed(g, 'graft') >= 3) return 'Three schemes a year is already pushing it.'
  if (officeCap(g, v) < 1000) return 'There is nothing worth taking.'
  return null
}

/** Run a scheme (an action). Returns the dirty money taken (0 when caught). */
export function runScheme(g: GameState, id: string, size: number): number {
  const def = schemeOf(id)
  const v = officeView(g)
  if (!def || !v) return 0
  const why = schemeBlock(g, def, v)
  if (why) { notice(g, 'Not Possible', why, { emoji: '🚫' }); return 0 }
  const q = schemeQuote(g, v, def, size)
  useYearAction(g, `graft.${def.id}`, 1)
  useYearAction(g, 'graft', 3)
  const me = editMe(g)
  addHidden(g, 'karma', -6)
  bumpStat(me, 'schemes')
  count(g, 'schemes')
  me.heat = Math.min(100, me.heat + q.heat)
  if (chance(g, q.caught)) {
    addCase(g, me, { pending: true, kind: def.id, label: def.label, evidence: .7, amount: q.take })
    me.heat = Math.min(100, me.heat + 15)
    bumpStat(me, 'caught')
    note(me, `${g.year}: an auditor flagged ${def.label.toLowerCase()}.`)
    writeMe(g, me)
    log(g, `An auditor flagged my ${def.label.toLowerCase()}.`, 'bad')
    notice(g, 'Flagged', `An auditor flagged the money before it reached you. Nothing was paid out, and there is now a strong file on you (${def.label.toLowerCase()}).`, { emoji: '🚨', tone: 'bad' })
    return 0
  }
  me.dirty += q.take
  me.taken += q.take
  addCase(g, me, { kind: def.id, label: def.label, evidence: q.evidence, amount: q.take })
  if (def.id === 'cronies') {
    const p = editPolicy(g, g.character.countryId)
    p.institutions.mediaControl = Math.min(.9, p.institutions.mediaControl + .05)
    writePolicy(g, p)
  }
  // Stolen public money is wasted public money: services and growth suffer a little.
  const p = editPolicy(g, g.character.countryId)
  p.graft = Math.min(.1, p.graft + q.take / gdpOf(g) * 3)
  writePolicy(g, p)
  note(me, `${g.year}: ${def.label.toLowerCase()}, ${formatMoney(q.take)}.`)
  writeMe(g, me)
  log(g, `I quietly took ${formatMoney(q.take)} (${def.label.toLowerCase()}).`, 'bad')
  notice(g, def.label, `${formatMoney(q.take)} landed in your slush fund. It is dirty money: launder it, move it offshore or spend it carefully. It can be seized.`, { emoji: def.emoji })
  return q.take
}

// ---------------------------------------------------------------------------
// Steering contracts to your own (or your family's) company

/** Companies the player controls in industries the state buys from. */
export function steerTargets(g: GameState): Asset[] {
  const buys = /construction|manufactur|logistics|software|energy|clinic|education|cybersecurity|telecom|aiLab|robotics|spaceTech|dataCenter|recycling|water|solar|farm/
  return businessAssets(g).filter(a => { const b = readBiz(g, a); return b.share > .5 && buys.test(b.industry) && (b.last?.revenue ?? 0) > 0 && b.countryId === g.character.countryId })
}

export function steerQuote(g: GameState, v: OfficeView, a: Asset): { value: number; markup: number; caught: number } {
  const b = readBiz(g, a)
  const value = Math.round(Math.min(officeCap(g, v) * 3, (b.last?.revenue ?? 0) * .4) / 1000) * 1000
  const me = meView(g)
  const caught = Math.max(.02, Math.min(.85, scrutiny(g) * .35 + me.heat / 500))
  return { value, markup: Math.round(value * .3), caught }
}

export function steerBlock(g: GameState, v: OfficeView | null = officeView(g)): string | null {
  if (!v || v.rank < 1) return 'You need to hold office.'
  if (meView(g).blindTrust) return 'Your companies are in a blind trust.'
  if (!steerTargets(g).length) return 'You control no company the state buys from.'
  if (yearActionsUsed(g, 'graft.steer') >= 1) return 'One contract a year.'
  return null
}

/** Award a public contract to your own company: real work at a fat markup, booked as company income. */
export function steerContract(g: GameState, assetId: string): boolean {
  const v = officeView(g)
  const why = steerBlock(g, v)
  const a = steerTargets(g).find(x => x.id === assetId)
  if (why || !v || !a) { notice(g, 'Not Possible', why ?? 'That company cannot take the contract.', { emoji: '🚫' }); return false }
  useYearAction(g, 'graft.steer', 1)
  const q = steerQuote(g, v, a)
  const me = editMe(g)
  me.heat = Math.min(100, me.heat + 10)
  addHidden(g, 'karma', -5)
  if (chance(g, q.caught)) {
    addCase(g, me, { pending: true, kind: 'conflict', label: `Steered a contract to ${a.name}`, evidence: .65, amount: q.markup })
    writeMe(g, me)
    notice(g, 'Conflict of Interest', `Reporters noticed ${a.name} won the tender before it was announced. The contract was cancelled and an inquiry opened.`, { emoji: '📰', tone: 'bad' })
    return false
  }
  const b = bizOf(g, a)
  // The state pays the steered contract.
  firmCash(g, b, q.markup, { reason: 'sales', with: ref('gov', g.character.countryId) }, a.id)
  b.yearIncome += q.markup
  b.valuation = valuationOf(b)
  refreshValue(a, b)
  addCase(g, me, { kind: 'conflict', label: `Steered a contract to ${a.name}`, evidence: .3, amount: q.markup })
  note(me, `${g.year}: a contract for ${a.name}.`)
  writeMe(g, me)
  log(g, `${a.name} won a public contract I arranged.`, 'neutral')
  notice(g, 'Contract Awarded', `${a.name} won a ${formatMoney(q.value)} public contract. The markup, ${formatMoney(q.markup)}, is company income (taxed as usual).`, { emoji: '📜' })
  return true
}

// ---------------------------------------------------------------------------
// Laundering

export function launderFronts(g: GameState): Asset[] {
  return businessAssets(g).filter(a => { const b = readBiz(g, a); return b.share > .5 && b.last?.year === g.year - 1 && b.last.revenue > 0 && !isFinanceFirm(b) })
}

export const LAUNDER_KEEP = .65
export function launderQuote(g: GameState, a: Asset): { amount: number; kept: number; caught: number } {
  const b = readBiz(g, a), me = meView(g)
  const amount = Math.floor(Math.min(me.dirty, (b.last?.revenue ?? 0) * .1))
  return { amount, kept: Math.floor(amount * LAUNDER_KEEP), caught: Math.max(.03, Math.min(.8, .05 + me.heat / 300 + scrutiny(g) * .06)) }
}

/** Run dirty money through a company's books: 65% arrives as taxable company income. */
export function launder(g: GameState, assetId: string): boolean {
  const a = launderFronts(g).find(x => x.id === assetId)
  if (!a || yearActionsUsed(g, 'graft.launder') >= 2) return false
  const q = launderQuote(g, a)
  if (q.amount < 100) return false
  useYearAction(g, 'graft.launder', 2)
  const me = editMe(g)
  me.dirty -= q.amount
  me.heat = Math.min(100, me.heat + 4)
  if (chance(g, q.caught)) {
    me.seized += q.amount
    addCase(g, me, { pending: true, kind: 'laundering', label: `Laundered money through ${a.name}`, evidence: .6, amount: q.amount })
    writeMe(g, me)
    notice(g, 'Seized', `Bank compliance flagged the payments into ${a.name}. ${formatMoney(q.amount)} was frozen and investigators opened a file.`, { emoji: '🚨', tone: 'bad' })
    return false
  }
  const b = bizOf(g, a)
  firmCash(g, b, q.kept, 'crime.take', a.id)
  b.yearIncome += q.kept
  b.valuation = valuationOf(b)
  refreshValue(a, b)
  me.laundered += q.kept
  writeMe(g, me)
  notice(g, 'Laundered', `${formatMoney(q.kept)} reached ${a.name}'s books as "consulting revenue". The other ${formatMoney(q.amount - q.kept)} went to the people who made it look clean.`, { emoji: '🧺' })
  return true
}

export const OFFSHORE_FEE = .12
export function offshoreCaught(g: GameState): number {
  return Math.max(.02, Math.min(.5, .02 + meView(g).heat / 600))
}

/** Move dirty money abroad (a fee; safe from seizure at home, not from leaks and sanctions). */
export function moveOffshore(g: GameState, amount: number): boolean {
  const me = editMe(g)
  const sum = Math.floor(Math.min(me.dirty, Number.isFinite(amount) ? amount : 0))
  if (sum < 100 || yearActionsUsed(g, 'graft.offshore') >= 1) return false
  useYearAction(g, 'graft.offshore', 1)
  me.dirty -= sum
  if (chance(g, offshoreCaught(g))) {
    me.seized += sum
    addCase(g, me, { pending: true, kind: 'offshore', label: 'Wired public money abroad', evidence: .5, amount: sum })
    writeMe(g, me)
    notice(g, 'Transfer Frozen', `The wire was stopped and ${formatMoney(sum)} frozen.`, { emoji: '🚨', tone: 'bad' })
    return false
  }
  const net = Math.floor(sum * (1 - OFFSHORE_FEE))
  me.offshore += net
  writeMe(g, me)
  notice(g, 'Offshore', `${formatMoney(net)} now sits in an account abroad, after ${formatMoney(sum - net)} in "fees".`, { emoji: '🏝️' })
  return true
}

/** Bring offshore money home as consulting fees: a 20% cut, then income tax. Capped yearly. */
export function homeCap(g: GameState): number {
  const exile = meView(g).exile && g.character.countryId !== meView(g).exile
  return Math.round(typicalIncome(g) * (exile ? 200 : 40))
}
export function bringHome(g: GameState, amount: number): boolean {
  const me = editMe(g)
  const sum = Math.floor(Math.min(me.offshore, homeCap(g), Number.isFinite(amount) ? amount : 0))
  if (sum < 100 || yearActionsUsed(g, 'graft.home') >= 1) return false
  useYearAction(g, 'graft.home', 1)
  me.offshore -= sum
  const exile = me.exile && g.character.countryId !== me.exile
  const cut = exile ? .1 : .2
  const net = Math.floor(sum * (1 - cut))
  if (!exile && chance(g, .02 + me.heat / 800)) {
    me.seized += sum
    addCase(g, me, { pending: true, kind: 'offshore', label: 'Brought hidden money home as fake fees', evidence: .5, amount: sum })
    writeMe(g, me)
    notice(g, 'Caught at Customs', `The tax office asked who paid you ${formatMoney(sum)} for "strategy advice". The money was frozen.`, { emoji: '🚨', tone: 'bad' })
    return false
  }
  me.laundered += net
  writeMe(g, me)
  earnIncome(g, net, { reason: 'crime.take', with: 'abroad' })
  notice(g, 'Consulting Fees', `${formatMoney(net)} arrived as consulting fees and counts as taxable income.`, { emoji: '💼' })
  return true
}
