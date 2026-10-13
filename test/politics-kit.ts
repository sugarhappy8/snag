// Politics 2.0 balance kit: plays seeded lives of a head of government with a fixed strategy
// (honest, careful corrupt, reckless) through the real yearly loop, resolving every popup the way
// that kind of politician would, and reports what they gained and how it ended. Used by the
// balance tests (a few seeds) and the opt-in deep fuzzer (many seeds).
import { ageUp } from '../src/game/aging'
import { applyFallback } from '../src/game/offline'
import { createNewLife } from '../src/game/life'
import { hasScript, runScript } from '../src/game/scripts'
import { economyOf } from '../src/game/economy'
import { bringHome, homeCap, moveOffshore, runScheme, schemeBlock, SCHEMES } from '../src/game/nation/graft'
import { measureBlock, resolveBill, type Measure } from '../src/game/nation/govern'
import { officeView } from '../src/game/nation/office'
import { regimeBlock, takeStep, REGIME_IDS, persecute, persecuteBlock, rivalTargets } from '../src/game/nation/regime'
import { meView, policyOf } from '../src/game/nation/state'
import type { GameState, ModalItem } from '../src/game/types'
import { netWorth } from '../src/game/core'

export type Strategy = 'honest' | 'corrupt' | 'reckless'

export interface PolStats {
  seed: number
  strategy: Strategy
  country: string
  yearsInOffice: number
  outcome: 'in office' | 'retired' | 'lost' | 'removed' | 'exile' | 'prison' | 'dead'
  taken: number
  laundered: number
  seized: number
  offshore: number
  /** Clean money the schemes produced (laundered + brought home), in years of the leader's salary. */
  cleanYears: number
  salary: number
  approvalEnd: number
  debtStart: number
  debtEnd: number
  avgGrowth: number
  ruined: boolean
  netWorthDelta: number
  text: string[]
}

const POLITICAL_CRIMES = /corruption|bribery|insider|laundering|coup|abuse|fraud|manipulation/i
const BAD_TEXT = /\bNaN\b|\bundefined\b|\[object Object\]|-?Infinity/

/** Choice preferences by strategy: the first id that exists wins, else the first option. */
const PREFS: Record<Strategy, string[]> = {
  honest: ['reelect', 'decline', 'apologize', 'concede', 'stimulus', 'aid', 'targeted', 'mediate', 'talks', 'bailout', 'fight', 'listen', 'trust', 'refuse', 'ignore', 'austerity', 'none', 'deny', 'resign', 'wait'],
  corrupt: ['reelect', 'accept', 'envelope', 'grant', 'appoint', 'coopt', 'blame', 'concede', 'stimulus', 'aid', 'targeted', 'mediate', 'talks', 'bailout', 'fight', 'whip', 'none', 'deny', 'wait'],
  reckless: ['reelect', 'accept', 'envelope', 'grant', 'appoint', 'smear', 'lean', 'crackdown', 'open', 'blame', 'mobilize', 'default', 'fight', 'bribe', 'whip', 'none', 'deny'],
}

const SAFE = ['no', 'ignore', 'decline', 'refuse', 'pay', 'owner', 'leave', 'candles', 'sleep', 'accept', 'hobby', 'dispute', 'escape', 'party', 'cash', 'free', 'drop', 'apologize', 'reelect']
const TEMPTATIONS = ['accept', 'envelope', 'grant', 'appoint']

function choose(g: GameState, strategy: Strategy, m: Extract<ModalItem, { kind: 'choice' }>): string {
  const political = !!m.scriptId && (m.scriptId.startsWith('nation.') || m.scriptId.startsWith('special.pol.'))
  // Ordinary life events: every strategy behaves like a law-abiding adult (crime is not under test).
  if (!political) {
    for (const id of SAFE) if (m.choices.some(c => c.id === id)) return id
    return m.choices[m.choices.length - 1].id
  }
  // A careful crook stops taking envelopes while the heat is on.
  const cautious = strategy === 'corrupt' && meView(g).heat >= 25
  for (const id of PREFS[strategy]) if (m.choices.some(c => c.id === id) && !(cautious && TEMPTATIONS.includes(id))) return id
  return m.choices[0].id
}

function drain(g: GameState, strategy: Strategy, text: string[]): void {
  for (let guard = 0; g.queue.length && guard < 300; guard++) {
    const m = g.queue.shift()!
    const before = g.queue.length
    if (m.kind === 'notice') { if (BAD_TEXT.test(m.text) || BAD_TEXT.test(m.title)) text.push(`notice "${m.title}": ${m.text}`) }
    else if (m.kind === 'choice') {
      if (BAD_TEXT.test(m.text)) text.push(`choice "${m.title}": ${m.text}`)
      for (const c of m.choices) if (BAD_TEXT.test(c.label)) text.push(`option ${m.scriptId}: ${c.label}`)
      if (m.source === 'script' && m.scriptId && hasScript(m.scriptId)) runScript(g, m.scriptId, choose(g, strategy, m), m.data, m)
    } else if (m.kind === 'input') {
      if (hasScript(m.scriptId)) runScript(g, m.scriptId, m.defaultValue ?? String(m.min ?? 0), m.data, m)
    } else if (m.kind === 'minigame') {
      if (m.game === 'nationReport' && BAD_TEXT.test(JSON.stringify(m.data))) text.push(`report: ${JSON.stringify(m.data).slice(0, 200)}`)
      runScript(g, m.scriptId, m.game === 'annualReport' ? 'skip' : m.game === 'blackjack' ? 'lose' : m.game === 'pickpocket' ? 'fail' : m.game === 'prisonEscape' ? 'caught' : m.game === 'burglary' ? JSON.stringify({ loot: 0, caught: false, rooms: [] }) : 'ok', m.data, m)
    } else if (m.kind === 'aiTask') applyFallback(g, m.task)
    const added = g.queue.splice(before)
    g.queue.unshift(...added)
  }
  g.queue = []
}

/** A fresh head of government at 45, with an ordinary personal fortune. */
export function newLeader(seed: number, country = 'us', year = 1990): GameState {
  const g = createNewLife({ countryId: country, year: year - 45, seed })
  g.character.age = 45
  g.year = year
  g.character.money = 2_000_000
  g.character.prison = null
  g.queue = []
  g.character.job = {
    defId: 'politician', title: 'Head of Government', company: country, category: 'special', salary: 400_000, level: 3, performance: 58, yearsInRole: 0, yearsAtCompany: 0,
    data: { office: 'leader', party: seed % 2 ? 'progressive' : 'conservative', approval: 58, termLeft: 4, terms: 1, hot: [], newsAge: -1, bills: [], warChest: 0, favors: 0, scandals: 0, termOver: false, startAge: 45, roleStartAge: 45 },
  }
  return g
}

function bill(g: GameState, m: Measure, sweet: 'none' | 'whip' | 'bribe'): void {
  if (measureBlock(g, m)) return
  resolveBill(g, m, sweet)
}

function govern(g: GameState, strategy: Strategy, yearIndex: number): void {
  const v = officeView(g)
  if (!v || g.character.prison) return
  const e = economyOf(g)
  const p = policyOf(g, g.character.countryId)
  const capital = meView(g).capital
  const sweet = strategy === 'reckless' && meView(g).dirty + g.character.money > 3_000_000 ? 'bribe' : capital >= 15 ? 'whip' : 'none'
  if (strategy === 'reckless') {
    // Populism: slash taxes, spend big, then grab everything that isn't nailed down.
    const p = policyOf(g, g.character.countryId)
    if ((p.national.taxes.income ?? 0) > -12) bill(g, { k: 'tax', scope: 'national', id: 'income', value: -12 }, sweet)
    if ((p.national.budget.welfare ?? 1) < 2) bill(g, { k: 'budget', scope: 'national', id: 'welfare', level: 2 }, sweet)
    if ((p.national.budget.military ?? 1) < 2) bill(g, { k: 'budget', scope: 'national', id: 'military', level: 2 }, sweet)
    if (!p.tariffs.length) bill(g, { k: 'tariff', input: 'all', partner: 'all', add: 40 }, sweet)
    for (const s of SCHEMES) if (!schemeBlock(g, s)) runScheme(g, s.id, 1)
    for (const id of REGIME_IDS) if (!regimeBlock(g, id)) takeStep(g, id)
    const r = rivalTargets(g)[0]
    if (r && !persecuteBlock(g, false)) persecute(g, r.id, false)
    return
  }
  // Honest and careful corrupt govern the same way: moderate, budget-minded.
  const deficit = e.budget?.deficit ?? 0
  if (deficit > .04 && (p.national.taxes.income ?? 0) < 6) bill(g, { k: 'tax', scope: 'national', id: 'income', value: (p.national.taxes.income ?? 0) + 2 }, sweet)
  else if (yearIndex === 0) bill(g, { k: 'budget', scope: 'national', id: 'education', level: 1.2 }, sweet)
  else if (yearIndex === 1 && deficit < .03) bill(g, { k: 'budget', scope: 'national', id: 'infrastructure', level: 1.2 }, sweet)
  if (strategy === 'corrupt') {
    // A little, every year, and never twice the same way.
    const pick = SCHEMES.filter(s => !schemeBlock(g, s))
    if (pick.length) runScheme(g, pick[yearIndex % pick.length].id, .2)
    if (!regimeBlock(g, 'buyMedia') && yearIndex === 1) takeStep(g, 'buyMedia')
  }
}

function launderAll(g: GameState): void {
  const me = meView(g)
  if (me.dirty >= 100) moveOffshore(g, me.dirty)
  const after = meView(g)
  if (after.offshore >= 100) bringHome(g, Math.min(after.offshore, homeCap(g)))
}

/** Play one life for `years` years from taking office (staying on afterwards to face trials). */
export function playPolitician(strategy: Strategy, seed: number, country = 'us', year = 1990, years = 16): PolStats {
  const g = newLeader(seed, country, year)
  const text: string[] = []
  const salary = g.character.job!.salary
  const worth0 = netWorth(g)
  const debtStart = economyOf(g).governmentDebt
  let yearsInOffice = 0, growth = 0, counted = 0, outcome: PolStats['outcome'] = 'in office'
  let wasIn = true
  for (let i = 0; i < years && g.character.alive; i++) {
    if (officeView(g)) { govern(g, strategy, i); drain(g, strategy, text) }
    if (strategy !== 'honest') { launderAll(g); drain(g, strategy, text) }
    g.yearActions = {}
    ageUp(g)
    drain(g, strategy, text)
    growth += economyOf(g).growth; counted++
    const inOffice = !!officeView(g)
    if (inOffice) yearsInOffice++
    if (wasIn && !inOffice) {
      const me = meView(g)
      outcome = !g.character.alive ? 'dead' : g.character.prison ? 'prison' : me.exile ? 'exile' : (g.counters.impeached ?? 0) > 0 ? 'removed' : (g.counters.electionsLost ?? 0) > 0 ? 'lost' : 'retired'
    }
    wasIn = inOffice
    if (g.character.prison) { outcome = 'prison' }
  }
  if (!g.character.alive) outcome = 'dead'
  else if (g.character.prison) outcome = 'prison'
  else if (meView(g).exile) outcome = 'exile'
  const me = meView(g)
  const clean = me.laundered
  if (process.env.KIT_DEBUG) text.push(`meters: legit ${Math.round(meView(g).legitimacy)} fear ${Math.round(meView(g).fear)} loyalty ${Math.round(meView(g).loyalty)} regime ${policyOf(g, country).institutions.regime} stats ${JSON.stringify(meView(g).stats)}`)
  if (!g.character.alive) text.push(`died: ${g.character.causeOfDeath}`)
  if (g.character.criminalRecord.length) text.push(`record: ${g.character.criminalRecord.map(r => `${r.crime}${r.convicted ? ' (convicted)' : ''}`).join(', ')}`)
  return {
    seed, strategy, country, yearsInOffice, outcome, taken: me.taken, laundered: me.laundered, seized: me.seized, offshore: me.offshore,
    cleanYears: clean / salary, salary, approvalEnd: Number((g.character.job?.data as { approval?: number } | undefined)?.approval ?? 0),
    debtStart, debtEnd: economyOf(g).governmentDebt, avgGrowth: counted ? growth / counted : 0,
    ruined: outcome === 'exile' || (outcome === 'dead' && /coup|assassination/i.test(g.character.causeOfDeath ?? '')) || g.character.criminalRecord.some(r => r.convicted && POLITICAL_CRIMES.test(r.crime)),
    netWorthDelta: netWorth(g) - worth0, text,
  }
}

export function summarize(rows: PolStats[]): string {
  const by = (s: Strategy) => rows.filter(r => r.strategy === s)
  return (['honest', 'corrupt', 'reckless'] as Strategy[]).map(s => {
    const r = by(s)
    if (!r.length) return ''
    const ruin = r.filter(x => x.ruined).length / r.length
    const avg = (f: (x: PolStats) => number) => r.reduce((t, x) => t + f(x), 0) / r.length
    const outcomes = Object.entries(r.reduce((m, x) => ({ ...m, [x.outcome]: (m[x.outcome] ?? 0) + 1 }), {} as Record<string, number>)).map(([k, n]) => `${k} ${n}`).join(', ')
    return `${s}: n=${r.length} ruin=${(ruin * 100).toFixed(0)}% office=${avg(x => x.yearsInOffice).toFixed(1)}y clean=${avg(x => x.cleanYears).toFixed(1)}×salary taken=${(avg(x => x.taken) / 1e6).toFixed(1)}M seized=${(avg(x => x.seized) / 1e6).toFixed(1)}M growth=${(avg(x => x.avgGrowth) * 100).toFixed(2)}% debt ${avg(x => x.debtStart).toFixed(2)}→${avg(x => x.debtEnd).toFixed(2)} [${outcomes}]`
  }).filter(Boolean).join('\n')
}
