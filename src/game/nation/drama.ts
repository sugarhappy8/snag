// The drama of office: one yearly crisis (recessions, strikes, wars from history, pandemics,
// disasters, bank crises) with two or three choices, rivals with their own goals, lobbyists, the
// player's own companies asking for favours (conflicts of interest) and relatives wanting posts.
// At most one popup a year comes from here.
import { addHidden, addRelationship, count, formatMoney, log, notice, scriptChoice } from '../core'
import { economyOf } from '../economy'
import { typicalIncome } from '../events/wealth-core'
import { warsAt, homeFrontAt } from '../history/events-wars'
import { PRESENT_YEAR } from '../history/timeline'
import { chance, pick, randInt } from '../rng'
import { pickLine } from '../text/pick'
import { defineScript } from '../scripts'
import { businessAssets, readBiz, bizOf } from '../business/state'
import type { GameState, Json, Person } from '../types'
import { randomFirstName, randomLastName } from '../world'
import { INPUT_LABEL, PARTY_IDS, TARGET_INDUSTRIES, industryAvailable, type TradeInput } from './data'
import { applyMeasure, gdpOf, measureBlock, propose, type Measure } from './govern'
import { adjustApproval, politicianJobOf, type OfficeView } from './office'
import { inputOfIndustry } from './trade-policy'
import { addCase, editMe, editPolicy, meView, policyOf, writeMe, writePolicy, bumpStat, type Me, type Rival, type Shock } from './state'

const CRISIS_SCRIPT = 'nation.crisis'
const RIVAL_SCRIPT = 'nation.rival'
const LOBBY_SCRIPT = 'nation.lobby'
const COMPANY_SCRIPT = 'nation.company'
const FAMILY_SCRIPT = 'nation.family'

type CrisisId = 'recession' | 'strike' | 'war' | 'pandemic' | 'disaster' | 'banks'

const PANDEMIC_YEARS: Record<number, string> = { 1918: 'the great influenza', 1919: 'the great influenza', 1957: 'a new flu', 1968: 'a new flu', 2020: 'a new coronavirus', 2021: 'a new coronavirus' }
const DISASTER: Record<string, string> = { jp: 'an earthquake', tr: 'an earthquake', cl: 'an earthquake', mx: 'an earthquake', id: 'an earthquake', it: 'an earthquake', ir: 'an earthquake', np: 'an earthquake', nz: 'an earthquake', bd: 'a flood', in: 'a flood', pk: 'a flood', nl: 'a flood', cn: 'a flood', de: 'a flood', us: 'a hurricane', ph: 'a typhoon', cu: 'a hurricane', au: 'wildfires', gr: 'wildfires', pt: 'wildfires', ca: 'wildfires' }

function shock(p: ReturnType<typeof editPolicy>, s: Omit<Shock, 'until'> & { until?: number }, year: number): void {
  p.shocks = p.shocks.filter(x => x.id !== s.id)
  p.shocks.push({ until: year + 1, ...s })
}

/** The crisis this year, if any (rolled once; history decides wars and the big pandemics). */
function pickCrisis(g: GameState, v: OfficeView): { id: CrisisId; text: string; data: Record<string, Json> } | null {
  const c = g.character.countryId, year = g.year
  const me = meView(g)
  const e = economyOf(g)
  const war = warsAt(c, year).find(w => !me.cool[`war.${w.id}`])
  if (war && v.leader) return { id: 'war', text: `${war.name[0].toUpperCase()}${war.name.slice(1)} has reached ${homeFrontAt(war, c) ? 'our own soil' : 'our country'}. The nation looks to you.`, data: { war: war.id, name: war.name, home: homeFrontAt(war, c) } }
  const pandemic = PANDEMIC_YEARS[year] ?? (year > PRESENT_YEAR && chance(g, .012) ? 'a new virus' : '')
  if (pandemic && v.leader && !me.cool[`pandemic.${Math.floor(year / 5)}`]) return { id: 'pandemic', text: `${pandemic[0].toUpperCase()}${pandemic.slice(1)} is spreading fast. Hospitals are filling up.`, data: { what: pandemic } }
  if (e.bankStress > .12 && v.leader && !me.cool.banks) return { id: 'banks', text: 'Two big banks are on the brink. If they fall, savers and businesses go down with them.', data: {} }
  if (e.growth < -.01 && (v.leader || v.portfolio === 'finance') && (me.cool.recession ?? -99) < year - 2) return { id: 'recession', text: `The economy shrank ${Math.abs(e.growth * 100).toFixed(1)}% and unemployment is ${(e.unemployment * 100).toFixed(1)}%. Everyone wants you to do something.`, data: {} }
  const p = policyOf(g, c)
  const strikeOdds = (p.labor < 1 ? .06 : .02) + (p.national.minWage < 10 ? .03 : 0) + Math.max(0, e.unemployment - .08) * .5 + Math.max(0, e.inflation - .05)
  if ((v.leader || v.portfolio === 'interior') && chance(g, strikeOdds)) return { id: 'strike', text: `${pickLine(g, ['Dockworkers', 'Train drivers', 'Nurses', 'Miners', 'Teachers', 'Factory workers'])} have walked out nationwide, demanding better pay and conditions.`, data: {} }
  if ((v.leader || v.regionalHead) && chance(g, .06)) {
    const what = DISASTER[c] ?? pickLine(g, ['a flood', 'a storm', 'wildfires'])
    return { id: 'disaster', text: `${what[0].toUpperCase()}${what.slice(1)} ${what === 'wildfires' ? 'have' : 'has'} devastated part of the ${v.regionalHead ? 'region' : 'country'}.`, data: { regional: v.regionalHead } }
  }
  return null
}

defineScript(CRISIS_SCRIPT, (g, choice, data) => {
  const d = (data ?? {}) as Record<string, Json>
  const id = String(d.id) as CrisisId
  const v = politicianJobOf(g)
  if (!v) return
  const p = editPolicy(g, g.character.countryId)
  const me = editMe(g)
  const year = g.year
  const gdp = gdpOf(g)
  let text = ''
  let delta = 0
  switch (id) {
    case 'recession':
      if (choice === 'stimulus') { shock(p, { id: 'stimulus', label: 'your stimulus package', growth: .012, inflation: .004, unemployment: -.008, confidence: .03, sector: 'consumer', demand: .03, spend: .02 }, year); delta = 3; text = `You announced a ${formatMoney(gdp * .02)} stimulus. Spending now, debt later.` }
      else if (choice === 'austerity') { shock(p, { id: 'tightening', label: 'belt-tightening', growth: -.006, inflation: -.003, unemployment: .006, confidence: .03, sector: '', demand: 0 }, year); delta = -3; text = 'You tightened the budget. Lenders applauded; the unemployed did not.' }
      else { delta = -2; text = 'You let the recession run its course and promised better days.' }
      me.cool.recession = year
      break
    case 'strike':
      if (choice === 'concede') { const m: Measure = { k: 'minWage', scope: 'national', value: Math.min(100, p.national.minWage + 10) }; applyMeasure(g, p, m, null); delta = 2; text = 'You agreed to a 10% higher minimum wage. The strikers went back to work cheering.' }
      else if (choice === 'crackdown') { me.fear = Math.min(100, me.fear + 10); me.legitimacy = Math.max(0, me.legitimacy - 8); addHidden(g, 'karma', -5); shock(p, { id: 'strike', label: 'the broken strike', growth: -.003, inflation: 0, unemployment: 0, confidence: -.01, sector: '', demand: 0 }, year); delta = -2; text = 'Police broke up the picket lines. The strike ended; the bitterness did not.' }
      else if (me.capital >= 10 && chance(g, .6)) { me.capital -= 10; delta = 1; text = 'Your mediators found a compromise after a long night.' }
      else { me.capital = Math.max(0, me.capital - 10); shock(p, { id: 'strike', label: 'a long strike', growth: -.006, inflation: .002, unemployment: 0, confidence: -.02, sector: 'logistics', demand: -.05 }, year); delta = -3; text = 'Talks failed and the strike dragged on for weeks.' }
      break
    case 'war': {
      me.cool[`war.${String(d.war)}`] = year
      if (choice === 'mobilize') {
        p.national.budget.military = Math.min(2, Math.round(((p.national.budget.military ?? 1) + .5) * 100) / 100); p.since['national.budget.military'] = year
        shock(p, { id: 'war', label: `the war effort (${String(d.name)})`, growth: .004, inflation: .01, unemployment: -.006, confidence: -.01, sector: 'industry', demand: .06 }, year)
        delta = 6; text = 'You put the country on a war footing. Factories hum; the debt climbs.'
      } else if (choice === 'talks') { delta = d.home ? -4 : 2; me.legitimacy = Math.min(100, me.legitimacy + 3); text = 'You pushed for talks and kept a cool head. Hawks called you weak.' }
      else { delta = d.home ? -8 : -1; text = 'You kept a low profile. The war went on without your leadership.' }
      break
    }
    case 'pandemic':
      me.cool[`pandemic.${Math.floor(year / 5)}`] = year
      if (choice === 'lockdown') { shock(p, { id: 'pandemic', label: 'the lockdown', growth: -.03, inflation: 0, unemployment: .02, confidence: -.03, sector: 'leisure', demand: -.2 }, year); delta = 2; text = 'You closed shops, schools and borders. Fewer people died; the economy froze.' }
      else if (choice === 'targeted') { shock(p, { id: 'pandemic', label: 'targeted health measures', growth: -.018, inflation: 0, unemployment: .01, confidence: -.02, sector: 'care', demand: .08, spend: .01 }, year); delta = 1; text = 'You poured money into hospitals and protected the vulnerable.' }
      else { shock(p, { id: 'pandemic', label: 'an uncontrolled outbreak', growth: -.012, inflation: 0, unemployment: .008, confidence: -.04, sector: 'care', demand: .05 }, year); delta = -7; text = 'You kept everything open. The hospitals overflowed and voters blamed you.' }
      break
    case 'disaster': {
      const regional = d.regional === true
      const reach = regional ? .15 : 1
      if (choice === 'aid') { shock(p, { id: 'disaster', label: 'disaster relief', growth: 0, inflation: 0, unemployment: 0, confidence: .01, sector: 'housing', demand: .03 * reach, spend: .006 * reach }, year); delta = 4; text = 'You flew in, rolled up your sleeves and opened the treasury. Survivors noticed.' }
      else if (choice === 'modest') { shock(p, { id: 'disaster', label: 'modest relief', growth: -.001, inflation: 0, unemployment: 0, confidence: 0, sector: '', demand: 0, spend: .002 * reach }, year); delta = -1; text = 'You sent help, carefully budgeted. Some called it too little.' }
      else { me.legitimacy = Math.max(0, me.legitimacy - 3); addHidden(g, 'karma', -4); delta = -4; text = 'You blamed the previous government. The cameras caught you not visiting.' }
      break
    }
    case 'banks':
      me.cool.banks = year
      if (choice === 'bailout') { shock(p, { id: 'banks', label: 'the bank bailout', growth: .002, inflation: 0, unemployment: -.004, confidence: .05, sector: 'finance', demand: .05, spend: .02 }, year); delta = -3; text = 'You rescued the banks with public money. Savers are safe; taxpayers are furious.' }
      else if (choice === 'nationalize') { applyMeasure(g, p, { k: 'nationalize', sector: 'finance', on: true }, null); delta = 0; text = 'You took the failing banks into public ownership.' }
      else { shock(p, { id: 'banks', label: 'the bank collapses', growth: -.015, inflation: 0, unemployment: .015, confidence: -.06, sector: 'finance', demand: -.15 }, year); delta = 1; text = 'You let the banks fail. Their shareholders lost everything, and the economy took the hit.' }
      break
  }
  bumpStat(me, 'crises')
  writePolicy(g, p)
  writeMe(g, me)
  const moved = adjustApproval(g, delta)
  log(g, `I handled a national crisis (${id}).`, moved >= 0 ? 'good' : 'bad')
  notice(g, 'Crisis', `${text} Approval ${moved >= 0 ? '+' : ''}${moved}.`, { emoji: '🚨', tone: moved >= 0 ? 'good' : 'bad' })
})

function crisisChoices(id: CrisisId, home: boolean): { id: string; label: string; emoji: string }[] {
  switch (id) {
    case 'recession': return [{ id: 'stimulus', label: 'Stimulus: spend 2% of GDP', emoji: '💸' }, { id: 'austerity', label: 'Tighten the budget', emoji: '✂️' }, { id: 'wait', label: 'Ride it out', emoji: '⏳' }]
    case 'strike': return [{ id: 'concede', label: 'Give them a higher minimum wage', emoji: '🤝' }, { id: 'mediate', label: 'Mediate (10 capital, 60%)', emoji: '⚖️' }, { id: 'crackdown', label: 'Break the strike', emoji: '🛡️' }]
    case 'war': return [{ id: 'mobilize', label: 'Mobilize: military budget +50%', emoji: '🪖' }, { id: 'talks', label: 'Push for peace talks', emoji: '🕊️' }, { id: 'quiet', label: home ? 'Stay out of the spotlight' : 'Keep our distance', emoji: '🤐' }]
    case 'pandemic': return [{ id: 'lockdown', label: 'Lock everything down', emoji: '🔒' }, { id: 'targeted', label: 'Fund hospitals, protect the vulnerable', emoji: '🏥' }, { id: 'open', label: 'Keep the economy open', emoji: '🛍️' }]
    case 'disaster': return [{ id: 'aid', label: 'Emergency aid, whatever it costs', emoji: '🚁' }, { id: 'modest', label: 'Measured relief', emoji: '📦' }, { id: 'blame', label: 'Blame your predecessors', emoji: '👉' }]
    case 'banks': return [{ id: 'bailout', label: 'Bail them out (2% of GDP)', emoji: '🏦' }, { id: 'nationalize', label: 'Nationalize them', emoji: '🏛️' }, { id: 'fail', label: 'Let them fail', emoji: '💥' }]
  }
}

// ---------------------------------------------------------------------------
// Rivals

function ensureRivals(g: GameState, v: OfficeView, me: Me): void {
  if (v.rank < 2) return
  const have = new Set(me.rivals.filter(r => r.status === 'active').map(r => r.role))
  const c = g.character.countryId
  const mk = (role: Rival['role'], party: string, goal: string): Rival => {
    const gender = chance(g, .5) ? 'male' : 'female'
    return { id: `r${g.year}${role}${randInt(g, 100, 999)}`, name: `${randomFirstName(g, c, gender)} ${randomLastName(g, c)}`, role, party, strength: randInt(g, 35, 70), goal, mood: -30, status: 'active', since: g.year }
  }
  const opp = PARTY_IDS.find(id => id !== v.party && (id === 'progressive' || id === 'conservative')) ?? 'centrist'
  if (!have.has('opposition')) me.rivals.push(mk('opposition', opp, 'wants your job and will use any scandal to get it'))
  if (!have.has('party') && v.rank >= 2) me.rivals.push(mk('party', v.party, 'wants to lead your own party'))
  if (!have.has('lobbyist')) me.rivals.push(mk('lobbyist', 'independent', `pushes for the ${pick(g, TARGET_INDUSTRIES.filter(i => industryAvailable(i, g.year)))} industry`))
  me.rivals = me.rivals.filter(r => r.status === 'active' || g.year - r.since < 12).slice(-8)
}

defineScript(RIVAL_SCRIPT, (g, choice, data) => {
  const id = String((data as { id?: string } | undefined)?.id ?? '')
  const me = editMe(g)
  const r = me.rivals.find(x => x.id === id && x.status === 'active')
  if (!r) return
  if (choice === 'coopt') {
    if (me.capital < 20) { notice(g, 'No Leverage', 'You have nothing to offer them.', { emoji: '📉' }); return }
    me.capital -= 20; r.status = 'coopted'; r.mood = 40
    writeMe(g, me)
    notice(g, 'Co-opted', `${r.name} accepted a seat at your table. Keep your friends close.`, { emoji: '🤝', tone: 'good' })
    return
  }
  if (choice === 'smear') {
    addHidden(g, 'karma', -6)
    me.heat = Math.min(100, me.heat + 8)
    if (chance(g, .65)) { r.strength = Math.max(0, r.strength - 25); writeMe(g, me); notice(g, 'Smear', `Stories about ${r.name}'s past started appearing everywhere. Their numbers sank.`, { emoji: '🗞️' }); return }
    writeMe(g, me); adjustApproval(g, -5)
    notice(g, 'Backfire', `The smear campaign against ${r.name} was traced back to your office.`, { emoji: '🗞️', tone: 'bad' })
    return
  }
  writeMe(g, me)
  const hit = adjustApproval(g, -Math.round(r.strength / 20))
  notice(g, 'Ignored', `${r.name} kept attacking you on every channel. Approval ${hit}.`, { emoji: '🗣️', tone: 'bad' })
})

function rivalMove(g: GameState, _v: OfficeView, me: Me): boolean {
  const r = me.rivals.filter(x => x.status === 'active' && x.role !== 'lobbyist').sort((a, b) => b.strength - a.strength)[0]
  if (!r || !chance(g, .25 + r.strength / 400)) return false
  writeMe(g, me)
  const what = r.role === 'party' ? `${r.name}, from your own party, ${r.goal}, and is counting votes to replace you.` : `${r.name}, the opposition's star, ${r.goal}. They are on every channel attacking your record.`
  scriptChoice(g, RIVAL_SCRIPT, 'A Rival Moves', what, [
    { id: 'coopt', label: 'Offer them a top job (20 capital)', emoji: '🤝' },
    { id: 'smear', label: 'Dig up dirt on them', emoji: '🗞️' },
    { id: 'ignore', label: 'Rise above it', emoji: '🧘' },
  ], { emoji: '🥊', data: { id: r.id } })
  return true
}

// ---------------------------------------------------------------------------
// Lobbyists, your own companies and your relatives

/** A favour someone wants: only one this office could actually propose. */
function askFor(g: GameState, v: OfficeView, industry: string): Measure | null {
  const roll = randInt(g, 0, 2)
  const input: TradeInput = inputOfIndustry(industry)
  const m: Measure | null = roll === 0 ? { k: 'break', industry, level: 1 } : roll === 1 && input ? { k: 'tariff', input, partner: 'all', add: 15 } : null
  return m && !measureBlock(g, m, v) ? m : null
}

defineScript(LOBBY_SCRIPT, (g, choice, data) => {
  const d = (data ?? {}) as { m?: Json; legal?: number; envelope?: number; industry?: string }
  const me = editMe(g)
  const job = politicianJobOf(g)
  if (!job) return
  if (choice === 'donation') {
    const chest = typeof job.data.warChest === 'number' ? job.data.warChest : 0
    job.data.warChest = chest + Math.max(0, Math.round(Number(d.legal) || 0))
    writeMe(g, me)
    if (d.m) propose(g, d.m as unknown as Measure)
    return
  }
  if (choice === 'envelope') {
    const amount = Math.max(0, Math.round(Number(d.envelope) || 0))
    me.dirty += amount; me.taken += amount; me.heat = Math.min(100, me.heat + 6)
    addCase(g, me, { kind: 'bribe', label: `Took cash from the ${d.industry ?? ''} lobby`, evidence: .3, amount })
    addHidden(g, 'karma', -8)
    count(g, 'bribesTaken')
    writeMe(g, me)
    if (d.m) propose(g, d.m as unknown as Measure)
    return
  }
  if (choice === 'report') {
    me.legitimacy = Math.min(100, me.legitimacy + 3)
    addHidden(g, 'karma', 5)
    writeMe(g, me)
    adjustApproval(g, 2)
    notice(g, 'Reported', 'You handed the lobbyist\'s offer to the anti-corruption office. A rare good headline.', { emoji: '😇', tone: 'good' })
    return
  }
  writeMe(g, me)
})

function lobbyist(g: GameState, v: OfficeView, me: Me): boolean {
  if (v.rank < 2 || !chance(g, .3)) return false
  const industry = pick(g, TARGET_INDUSTRIES.filter(i => industryAvailable(i, g.year)))
  const m = askFor(g, v, industry)
  if (!m) return false
  const legal = Math.round(typicalIncome(g) * (v.leader ? 40 : 10) / 1000) * 1000
  const envelope = Math.round(typicalIncome(g) * (v.leader ? 25 : 6) / 1000) * 1000
  writeMe(g, me)
  const ask = m.k === 'break' ? `a tax break for ${industry}` : m.k === 'tariff' ? `a 15% tariff on imported ${INPUT_LABEL[m.input]}` : 'a favour'
  scriptChoice(g, LOBBY_SCRIPT, 'A Lobbyist Calls', `A lobbyist for the ${industry} industry wants ${ask}. They mention a ${formatMoney(legal)} donation to your campaign, and, quietly, an envelope with ${formatMoney(envelope)} in it.`, [
    { id: 'donation', label: 'Take the donation and propose it', emoji: '🥂' },
    { id: 'envelope', label: 'Take the envelope and propose it', emoji: '✉️' },
    { id: 'listen', label: 'Listen politely, promise nothing', emoji: '🙂' },
    { id: 'report', label: 'Report the envelope', emoji: '😇' },
  ], { emoji: '🕴️', data: { m: m as unknown as Json, legal, envelope, industry } })
  return true
}

defineScript(COMPANY_SCRIPT, (g, choice, data) => {
  const d = (data ?? {}) as { m?: Json; asset?: string; bailout?: number; name?: string }
  const me = editMe(g)
  if (choice === 'trust') {
    me.blindTrust = true
    me.legitimacy = Math.min(100, me.legitimacy + 4)
    writeMe(g, me)
    adjustApproval(g, 2)
    notice(g, 'Blind Trust', 'Your companies now answer to independent trustees while you hold office. No more awkward requests.', { emoji: '🙈', tone: 'good' })
    return
  }
  if (choice !== 'grant') { writeMe(g, me); return }
  me.heat = Math.min(100, me.heat + 6)
  if (d.bailout && d.asset) {
    const a = g.assets.find(x => x.id === d.asset && x.kind === 'business')
    if (a) {
      const b = bizOf(g, a)
      const loan = Math.max(0, Math.round(Number(d.bailout) || 0))
      // A rescue loan: cash now, debt the company must repay. Never income.
      b.cash += loan
      b.debt += loan
      addCase(g, me, { kind: 'conflict', label: `Steered a public rescue loan to your own ${d.name ?? 'company'}`, evidence: .35, amount: loan })
      writeMe(g, me)
      notice(g, 'Rescue Loan', `${a.name} received a ${formatMoney(loan)} rescue loan from the state. It must be repaid. Reporters are asking who approved it.`, { emoji: '🏦' })
    }
    return
  }
  addCase(g, me, { kind: 'conflict', label: `Changed the law for your own ${d.name ?? 'company'}`, evidence: .2, amount: 0 })
  writeMe(g, me)
  if (d.m) propose(g, d.m as unknown as Measure)
})

function ownCompany(g: GameState, v: OfficeView, me: Me): boolean {
  if (me.blindTrust || v.rank < 2 || !chance(g, .3)) return false
  const firms = businessAssets(g).filter(a => readBiz(g, a).share > .5 && readBiz(g, a).countryId === g.character.countryId)
  if (!firms.length) return false
  const a = pick(g, firms)
  const b = readBiz(g, a)
  const struggling = (b.last?.net ?? 0) < 0 && b.cash < Math.abs(b.last?.net ?? 0)
  writeMe(g, me)
  if (struggling && (v.leader || v.portfolio === 'finance')) {
    const loan = Math.round(Math.min(Math.abs(b.last?.net ?? 0) * 2, gdpOf(g) * .0005) / 1000) * 1000
    if (loan <= 0) return false
    scriptChoice(g, COMPANY_SCRIPT, 'Your Company Calls', `${a.name}, which you own, is losing money. Its managers ask for a ${formatMoney(loan)} state rescue loan.`, [
      { id: 'grant', label: 'Approve the rescue loan', emoji: '🏦' },
      { id: 'refuse', label: 'Refuse: no special treatment', emoji: '🙅' },
      { id: 'trust', label: 'Put your companies in a blind trust', emoji: '🙈' },
    ], { emoji: '🏢', data: { asset: a.id, bailout: loan, name: a.name } })
    return true
  }
  const m = askFor(g, v, b.industry)
  if (!m) return false
  scriptChoice(g, COMPANY_SCRIPT, 'Your Company Calls', `${a.name}, which you own, would love ${m.k === 'break' ? `a tax break for ${b.industry}` : 'a tariff on foreign competitors'}. Your managers say it is "good for the country".`, [
    { id: 'grant', label: 'Propose it (a conflict of interest)', emoji: '📝' },
    { id: 'refuse', label: 'Refuse', emoji: '🙅' },
    { id: 'trust', label: 'Put your companies in a blind trust', emoji: '🙈' },
  ], { emoji: '🏢', data: { m: m as unknown as Json, name: a.name } })
  return true
}

const POSTS = ['Special Envoy', 'Deputy Minister of Culture', 'Chair of the State Lottery', 'Ambassador to a small country', 'Director of the National Tourism Board', 'Head of Protocol']

defineScript(FAMILY_SCRIPT, (g, choice, data) => {
  const id = String((data as { person?: string } | undefined)?.person ?? '')
  const person = g.people.find(p => p.id === id && p.alive)
  if (!person) return
  const me = editMe(g)
  if (choice === 'appoint') {
    const title = pick(g, POSTS)
    const salary = Math.round(typicalIncome(g) * 2.5 / 1000) * 1000
    person.occupation = title
    person.data.influenceJob = { by: g.character.id, target: 'politician', title, salary, hiredYear: g.year, lastPaid: g.year - 1 }
    addRelationship(person, 10)
    addCase(g, me, { kind: 'nepotism', label: `Gave ${person.firstName} a government post`, evidence: .2, amount: salary * 4 })
    me.heat = Math.min(100, me.heat + 6)
    count(g, 'nepotismPosts')
    writeMe(g, me)
    log(g, `I made ${person.firstName} ${title}.`, 'neutral')
    notice(g, 'Family Business', `${person.firstName} is now ${title}, at ${formatMoney(salary)} a year of public money. They are thrilled. The press is curious.`, { emoji: '👪' })
    return
  }
  addRelationship(person, -8)
  writeMe(g, me)
  notice(g, 'Family', `${person.firstName} took it badly. "After everything I did for your campaign?"`, { emoji: '😤' })
})

function familyAsk(g: GameState, v: OfficeView, me: Me): boolean {
  if (v.rank < 2 || !chance(g, .22)) return false
  const kin: Person[] = g.people.filter(p => p.alive && p.age >= 21 && ['child', 'sibling', 'spouse', 'parent', 'grandchild', 'stepchild', 'halfSibling'].includes(p.relation) && p.data.disowned !== true && !p.data.influenceJob && !p.data.nepo)
  if (!kin.length) return false
  const person = pick(g, kin)
  writeMe(g, me)
  scriptChoice(g, FAMILY_SCRIPT, 'Family Favour', `Your ${person.relation === 'spouse' ? 'spouse' : person.relation} ${person.firstName} would like "a little job in the government". They are not qualified.`, [
    { id: 'appoint', label: 'Give them a post', emoji: '👔' },
    { id: 'refuse', label: 'Say no', emoji: '🙅' },
  ], { emoji: '👪', data: { person: person.id } })
  return true
}

/** Once a year: a crisis, or else one rival, lobbyist, company or family moment. */
export function yearlyDrama(g: GameState, v: OfficeView): boolean {
  const me = editMe(g)
  ensureRivals(g, v, me)
  if (v.rank >= 2) {
    const crisis = pickCrisis(g, v)
    if (crisis) {
      writeMe(g, me)
      scriptChoice(g, CRISIS_SCRIPT, 'Crisis', crisis.text, crisisChoices(crisis.id, crisis.data.home === true), { emoji: '🚨', data: { id: crisis.id, ...crisis.data } })
      return true
    }
  }
  for (const f of [ownCompany, familyAsk, lobbyist, rivalMove]) if (f(g, v, me)) return true
  writeMe(g, me)
  return false
}

