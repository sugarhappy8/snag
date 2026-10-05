// Special career: Politician. Run for office (party, platform, campaign budget, a three-stop
// campaign trail, election night), then govern: read the newspaper to learn what voters care
// about, broadcast speeches, stage rallies, pass or veto bills, dodge (or pocket) political
// favors, survive scandals and impeachment, and run for re-election or higher office.
// School Board Director → Mayor → Governor → President / Prime Minister.
import { addHidden, addMoney, addStat, count, earnIncome, log, remember, scriptChoice, spend, useYearAction } from '../core'
import { arrestPlayer } from '../crime'
import { killCharacter } from '../death'
import { chance, pick, rand, randInt, shuffle } from '../rng'
import { defineScript } from '../scripts'
import type { GameState, Job, Json, MenuAction, MenuGroup, MenuNode } from '../types'
import { getCountry, randomFirstName, randomLastName } from '../world'
import {
  CELEBS,
  addFame,
  blocked,
  clamp100,
  convictions,
  fameOf,
  fameToward,
  hasCollegeDegree,
  hasHighSchool,
  hire,
  leave,
  money,
  myJob,
  num,
  setOwnFlag,
  peek,
  prof,
  quitNote,
  say,
  setRole,
  str,
  syncTenure,
  tell,
  view,
} from './common'

// ---------------------------------------------------------------------------
// Offices

type OfficeId = 'school' | 'mayor' | 'governor' | 'leader'

interface OfficeDef {
  id: OfficeId
  rank: number
  emoji: string
  minAge: number
  salary: number
  term: number
  /** 0 = no limit. */
  termLimit: number
  fame: number
  /** Campaign budget tiers (0 = grassroots). */
  budgets: number[]
  /** Base strength of the typical opponent. */
  opponent: number
}

const OFFICES: OfficeDef[] = [
  { id: 'school', rank: 0, emoji: '\u{1F3EB}', minAge: 18, salary: 22_000, term: 4, termLimit: 0, fame: 4, budgets: [0, 2_000, 10_000, 30_000], opponent: 44 },
  { id: 'mayor', rank: 1, emoji: '\u{1F3D9}\u{FE0F}', minAge: 21, salary: 95_000, term: 4, termLimit: 0, fame: 18, budgets: [0, 25_000, 150_000, 600_000], opponent: 48 },
  { id: 'governor', rank: 2, emoji: '\u{1F3DB}\u{FE0F}', minAge: 30, salary: 150_000, term: 4, termLimit: 2, fame: 40, budgets: [0, 250_000, 1_500_000, 6_000_000], opponent: 51 },
  { id: 'leader', rank: 3, emoji: '\u{1F3DB}\u{FE0F}', minAge: 35, salary: 400_000, term: 4, termLimit: 2, fame: 85, budgets: [0, 2_000_000, 15_000_000, 60_000_000], opponent: 54 },
]

function officeOf(id: string): OfficeDef {
  return OFFICES.find((o) => o.id === id) ?? OFFICES[0]
}

const PM_COUNTRIES = ['gb', 'jp', 'in', 'ca', 'au', 'nz', 'de', 'it', 'es', 'nl', 'se', 'no', 'dk', 'be', 'ie', 'il', 'gr', 'pt', 'pl']

function leaderTitle(g: GameState): string {
  const id = g.character.countryId
  if (PM_COUNTRIES.includes(id)) return 'Prime Minister'
  return getCountry(id).monarchy ? 'Prime Minister' : 'President'
}

function leaderMinAge(g: GameState): number {
  return ['us', 'mx', 'br', 'ph'].includes(g.character.countryId) ? 35 : 25
}

function officeTitle(g: GameState, id: OfficeId): string {
  if (id === 'school') return 'School Board Director'
  if (id === 'mayor') return 'Mayor'
  if (id === 'governor') return 'Governor'
  return leaderTitle(g)
}

function minAgeFor(g: GameState, o: OfficeDef): number {
  return o.id === 'leader' ? leaderMinAge(g) : o.minAge
}

const US_STATES: Record<string, string> = {
  'New York': 'New York',
  'Los Angeles': 'California',
  'San Diego': 'California',
  Chicago: 'Illinois',
  Houston: 'Texas',
  'San Antonio': 'Texas',
  Dallas: 'Texas',
  Austin: 'Texas',
  Phoenix: 'Arizona',
  Philadelphia: 'Pennsylvania',
  Seattle: 'Washington',
  Denver: 'Colorado',
  Boston: 'Massachusetts',
  Miami: 'Florida',
  Atlanta: 'Georgia',
  Nashville: 'Tennessee',
  Portland: 'Oregon',
  'Las Vegas': 'Nevada',
  Detroit: 'Michigan',
  Minneapolis: 'Minnesota',
}

const REGIONS: Record<string, Record<string, string>> = {
  gb: { London: 'Greater London', Manchester: 'Greater Manchester', Birmingham: 'the West Midlands', Liverpool: 'Merseyside', Leeds: 'West Yorkshire', Glasgow: 'Scotland', Edinburgh: 'Scotland', Bristol: 'the West of England', Cardiff: 'Wales', Belfast: 'Northern Ireland', Newcastle: 'Tyne and Wear', Brighton: 'East Sussex' },
  fr: { Paris: 'Île-de-France', Marseille: "Provence-Alpes-Côte d'Azur", Nice: "Provence-Alpes-Côte d'Azur", Lyon: 'Auvergne-Rhône-Alpes', Toulouse: 'Occitanie', Montpellier: 'Occitanie', Nantes: 'Pays de la Loire', Strasbourg: 'Grand Est', Bordeaux: 'Nouvelle-Aquitaine', Lille: 'Hauts-de-France' },
  jp: { Tokyo: 'Tokyo Prefecture', Osaka: 'Osaka Prefecture', Yokohama: 'Kanagawa Prefecture', Nagoya: 'Aichi Prefecture', Sapporo: 'Hokkaido', Kobe: 'Hyogo Prefecture', Kyoto: 'Kyoto Prefecture', Fukuoka: 'Fukuoka Prefecture', Hiroshima: 'Hiroshima Prefecture', Sendai: 'Miyagi Prefecture' },
  mx: { 'Mexico City': 'Mexico City', Guadalajara: 'Jalisco', Monterrey: 'Nuevo León', Puebla: 'Puebla', Tijuana: 'Baja California', 'Cancún': 'Quintana Roo', 'Mérida': 'Yucatán', 'León': 'Guanajuato', Oaxaca: 'Oaxaca' },
  in: { Mumbai: 'Maharashtra', Pune: 'Maharashtra', Delhi: 'Delhi', Bangalore: 'Karnataka', Hyderabad: 'Telangana', Chennai: 'Tamil Nadu', Kolkata: 'West Bengal', Jaipur: 'Rajasthan', Ahmedabad: 'Gujarat', Lucknow: 'Uttar Pradesh' },
}

function regionName(g: GameState): string {
  const c = g.character
  if (c.countryId === 'us') return US_STATES[c.city] ?? 'the State'
  return REGIONS[c.countryId]?.[c.city] ?? `the ${c.city} Region`
}

function jurisdiction(g: GameState, id: OfficeId): string {
  const c = g.character
  if (id === 'school') return `${c.city} School District`
  if (id === 'mayor') return `City of ${c.city}`
  if (id === 'governor') return `${c.countryId === 'us' ? 'State of ' : ''}${regionName(g).replace(/^the /, '')}`
  return getCountry(c.countryId).name
}

/** "Mayor of Chicago", "Governor of Texas", "President of France". */
function styled(g: GameState, id: OfficeId): string {
  const c = g.character
  if (id === 'school') return `School Board Director for ${c.city}`
  if (id === 'mayor') return `Mayor of ${c.city}`
  if (id === 'governor') return `Governor of ${regionName(g)}`
  return `${leaderTitle(g)} of ${getCountry(c.countryId).name}`
}

function salaryFor(g: GameState, o: OfficeDef): number {
  const w = getCountry(g.character.countryId).wealth || 1
  return Math.round((o.salary * Math.max(0.3, w)) / 100) * 100
}

// ---------------------------------------------------------------------------
// Parties, issues, bills

interface Party {
  id: string
  name: string
  emoji: string
  /** Bonus to the starting poll. */
  edge: number
  /** Share of the campaign that donors chip in. */
  donors: number
}

const PARTIES: Party[] = [
  { id: 'progressive', name: 'Progressive Party', emoji: '\u{1F54A}\u{FE0F}', edge: 2, donors: 1 },
  { id: 'conservative', name: 'Conservative Party', emoji: '\u{1F985}', edge: 2, donors: 1.1 },
  { id: 'centrist', name: 'Centrist Alliance', emoji: '\u{2696}\u{FE0F}', edge: 1, donors: 0.9 },
  { id: 'green', name: 'Green Party', emoji: '\u{1F33F}', edge: -3, donors: 0.5 },
  { id: 'libertarian', name: 'Liberty Party', emoji: '\u{1F5FD}', edge: -3, donors: 0.6 },
  { id: 'independent', name: 'Independent', emoji: '\u{1F9ED}', edge: -5, donors: 0.25 },
]

function partyOf(id: string): Party {
  return PARTIES.find((p) => p.id === id) ?? PARTIES[PARTIES.length - 1]
}

const ISSUES: { id: string; label: string; emoji: string }[] = [
  { id: 'economy', label: 'The Economy', emoji: '\u{1F4C8}' },
  { id: 'education', label: 'Education', emoji: '\u{1F393}' },
  { id: 'healthcare', label: 'Healthcare', emoji: '\u{1FA7A}' },
  { id: 'crime', label: 'Crime', emoji: '\u{1F6A8}' },
  { id: 'environment', label: 'The Environment', emoji: '\u{1F30E}' },
  { id: 'taxes', label: 'Taxes', emoji: '\u{1F4B8}' },
  { id: 'jobs', label: 'Jobs', emoji: '\u{1F477}' },
  { id: 'housing', label: 'Housing', emoji: '\u{1F3E0}' },
  { id: 'infrastructure', label: 'Roads & Bridges', emoji: '\u{1F6A7}' },
  { id: 'immigration', label: 'Immigration', emoji: '\u{1F6C2}' },
  { id: 'civil', label: 'Civil Rights', emoji: '\u{270A}' },
  { id: 'transit', label: 'Public Transit', emoji: '\u{1F687}' },
]

function issueOf(id: string) {
  return ISSUES.find((i) => i.id === id) ?? ISSUES[0]
}

interface BillDef {
  name: string
  emoji: string
  issue: string
  /** Special side effect when passed. */
  effect?: 'payRaise' | 'holiday' | 'space'
}

const BILLS: Record<OfficeId, BillDef[]> = {
  school: [
    { name: 'Push school start times back an hour', emoji: '\u{23F0}', issue: 'education' },
    { name: 'Ban phones in classrooms', emoji: '\u{1F4F5}', issue: 'education' },
    { name: 'Healthier cafeteria lunches', emoji: '\u{1F966}', issue: 'healthcare' },
    { name: 'A four-day school week', emoji: '\u{1F4C5}', issue: 'education' },
    { name: 'Mandatory school uniforms', emoji: '\u{1F454}', issue: 'education' },
    { name: 'More funding for art and music', emoji: '\u{1F3A8}', issue: 'education' },
    { name: 'Replace the football field with solar panels', emoji: '\u{2600}\u{FE0F}', issue: 'environment' },
    { name: 'Raise teacher salaries', emoji: '\u{1F34E}', issue: 'jobs' },
    { name: 'Remove cursive from the curriculum', emoji: '\u{270D}\u{FE0F}', issue: 'education' },
    { name: 'Raise the board members’ stipend', emoji: '\u{1F4B0}', issue: 'taxes', effect: 'payRaise' },
  ],
  mayor: [
    { name: 'Build protected bike lanes downtown', emoji: '\u{1F6B2}', issue: 'transit' },
    { name: 'An emergency pothole repair fund', emoji: '\u{1F6A7}', issue: 'infrastructure' },
    { name: 'A citywide teen curfew', emoji: '\u{1F319}', issue: 'crime' },
    { name: 'Double downtown parking fees', emoji: '\u{1F17F}\u{FE0F}', issue: 'taxes' },
    { name: 'Publicly fund a new sports stadium', emoji: '\u{1F3DF}\u{FE0F}', issue: 'economy' },
    { name: 'Rent control for apartments', emoji: '\u{1F3E2}', issue: 'housing' },
    { name: 'Open three new dog parks', emoji: '\u{1F415}', issue: 'environment' },
    { name: 'Hire more police officers', emoji: '\u{1F46E}', issue: 'crime' },
    { name: 'Free public Wi-Fi in every park', emoji: '\u{1F4F6}', issue: 'infrastructure' },
    { name: 'Ban leaf blowers before 9 AM', emoji: '\u{1F343}', issue: 'environment' },
    { name: 'Give the mayor a raise', emoji: '\u{1F4B0}', issue: 'taxes', effect: 'payRaise' },
  ],
  governor: [
    { name: 'Raise the minimum wage', emoji: '\u{1F4B5}', issue: 'jobs' },
    { name: 'Legalize sports betting', emoji: '\u{1F3B2}', issue: 'economy' },
    { name: 'Raise the gas tax to fix highways', emoji: '\u{26FD}', issue: 'infrastructure' },
    { name: 'Free community college', emoji: '\u{1F393}', issue: 'education' },
    { name: 'Tougher sentencing for repeat offenders', emoji: '\u{2696}\u{FE0F}', issue: 'crime' },
    { name: 'Ban single-use plastic bags', emoji: '\u{1F6CD}\u{FE0F}', issue: 'environment' },
    { name: 'Build high-speed rail between cities', emoji: '\u{1F684}', issue: 'transit' },
    { name: 'Cut the state income tax', emoji: '\u{2702}\u{FE0F}', issue: 'taxes' },
    { name: 'Expand public hospitals', emoji: '\u{1F3E5}', issue: 'healthcare' },
    { name: 'Name an official state snack', emoji: '\u{1F968}', issue: 'economy' },
    { name: 'A pay raise for state officials', emoji: '\u{1F4B0}', issue: 'taxes', effect: 'payRaise' },
  ],
  leader: [
    { name: 'Universal healthcare', emoji: '\u{1FA7A}', issue: 'healthcare' },
    { name: 'A sweeping tax cut', emoji: '\u{2702}\u{FE0F}', issue: 'taxes' },
    { name: 'Increase the defense budget', emoji: '\u{1FA96}', issue: 'economy' },
    { name: 'Abolish daylight saving time', emoji: '\u{1F570}\u{FE0F}', issue: 'economy' },
    { name: 'Student loan forgiveness', emoji: '\u{1F393}', issue: 'education' },
    { name: 'A trillion-dollar infrastructure plan', emoji: '\u{1F309}', issue: 'infrastructure' },
    { name: 'Overhaul the immigration system', emoji: '\u{1F6C2}', issue: 'immigration' },
    { name: 'A national carbon tax', emoji: '\u{1F3ED}', issue: 'environment' },
    { name: 'Expand voting rights', emoji: '\u{1F5F3}\u{FE0F}', issue: 'civil' },
    { name: 'Fund a crewed mission to Mars', emoji: '\u{1F680}', issue: 'jobs', effect: 'space' },
    { name: 'Create a new national holiday', emoji: '\u{1F389}', issue: 'jobs', effect: 'holiday' },
    { name: 'Raise the salary of the head of government', emoji: '\u{1F4B0}', issue: 'taxes', effect: 'payRaise' },
  ],
}

interface Bill {
  name: string
  emoji: string
  issue: string
  support: number
  effect: string
}

// ---------------------------------------------------------------------------
// State

interface PolData {
  office: OfficeId
  party: string
  approval: number
  termLeft: number
  terms: number
  /** Hot topics this year (index into ISSUES ids). */
  hot: string[]
  /** Age at which the newspaper was last read. */
  newsAge: number
  bills: Bill[]
  warChest: number
  favors: number
  scandals: number
  /** Set while a re-election / higher-office decision is pending. */
  termOver: boolean
}

interface HeldOffice {
  office: OfficeId
  title: string
  place: string
  startAge: number
  endAge: number | null
}

interface PolProfile {
  held: HeldOffice[]
  wins: number
  losses: number
  party: string
  billsPassed: number
  vetoes: number
  impeached: number
  formerLeader: boolean
  formerLeaderTitle: string
}

const initPol = (): PolProfile => ({ held: [], wins: 0, losses: 0, party: '', billsPassed: 0, vetoes: 0, impeached: 0, formerLeader: false, formerLeaderTitle: '' })

function polProfile(g: GameState): PolProfile {
  return prof(g, 'politics', initPol)
}

function viewPol(g: GameState): PolProfile {
  return peek<PolProfile>(g, 'politics') ?? initPol()
}

export function politicianJob(g: GameState): Job | null {
  return myJob(g, 'politician')
}

function pdata(job: Job): PolData {
  return view<PolData>(job.data)
}

function heldBefore(g: GameState, id: OfficeId): boolean {
  return viewPol(g).held.some((h) => h.office === id)
}

function termsServed(g: GameState, id: OfficeId): number {
  const job = politicianJob(g)
  const current = job && pdata(job).office === id ? pdata(job).terms : 0
  return viewPol(g).held.filter((h) => h.office === id && h.endAge !== null).length + current
}

function closeHeld(g: GameState): void {
  const p = polProfile(g)
  for (const h of p.held) if (h.endAge === null) h.endAge = g.character.age
}

function setApproval(job: Job, value: number): void {
  const d = pdata(job)
  d.approval = clamp100(value)
  job.performance = d.approval
}

function addApproval(job: Job, delta: number): void {
  setApproval(job, pdata(job).approval + delta)
}

// ---------------------------------------------------------------------------
// Eligibility

function prereqText(o: OfficeDef): string {
  if (o.id === 'school') return 'High school diploma'
  if (o.id === 'mayor') return 'University degree or school board experience'
  if (o.id === 'governor') return 'Must have served as Mayor'
  return 'Must have served as Governor'
}

/** Why you can't run for this office (null = eligible). */
function runReason(g: GameState, o: OfficeDef, fromOffice = false): string | null {
  const c = g.character
  const b = blocked(g, 0)
  if (b) return b
  if (!fromOffice && politicianJob(g)) return 'You can only run for another office when your current term ends.'
  const min = minAgeFor(g, o)
  if (c.age < min) return `You must be at least ${min} years old to run for ${officeTitle(g, o.id)}.`
  if (c.criminalRecord.some((r) => r.convicted && (r.sentenceYears ?? 0) >= 2)) return 'Voters will not elect someone with a felony conviction on their record.'
  if (o.id === 'school' && !hasHighSchool(g)) return 'You need at least a high school diploma to run for the school board.'
  if (o.id === 'mayor' && !hasCollegeDegree(g) && !heldBefore(g, 'school')) return 'You need a university degree or experience on the school board to run for Mayor.'
  if (o.id === 'governor' && !heldBefore(g, 'mayor') && !(fromOffice && politicianJob(g) && pdata(politicianJob(g)!).office === 'mayor')) return 'You need to serve as Mayor before running for Governor.'
  if (o.id === 'leader' && !heldBefore(g, 'governor') && !(fromOffice && politicianJob(g) && pdata(politicianJob(g)!).office === 'governor')) {
    return `You need to serve as Governor before running for ${leaderTitle(g)}.`
  }
  if (o.termLimit > 0 && termsServed(g, o.id) >= o.termLimit) return `You've already served the maximum ${o.termLimit} terms as ${officeTitle(g, o.id)}.`
  if (c.age > 85) return 'Your party chairman gently suggested you enjoy retirement instead.'
  return null
}

// ---------------------------------------------------------------------------
// Campaigns

interface Campaign {
  office: OfficeId
  party: string
  issue: string
  budget: number
  poll: number
  round: number
  opponent: string
  oppParty: string
  /** Running from an office whose term just ended. */
  incumbentRun: boolean
}

const PARTY_SCRIPT = 'special.pol.party'
const PLATFORM_SCRIPT = 'special.pol.platform'
const BUDGET_SCRIPT = 'special.pol.budget'
const TRAIL_SCRIPT = 'special.pol.trail'

function opponentName(g: GameState): string {
  const c = g.character
  const gender = chance(g, 0.5) ? 'male' : 'female'
  return `${randomFirstName(g, c.countryId, gender)} ${randomLastName(g, c.countryId)}`
}

function startCampaign(g: GameState, office: OfficeId, incumbentRun: boolean): void {
  const o = officeOf(office)
  const prevParty = viewPol(g).party
  const text = `You're running for ${officeTitle(g, office)} of ${jurisdiction(g, office).replace(/^City of |^State of /, '')}. Which party will you run with?`
  scriptChoice(
    g,
    PARTY_SCRIPT,
    'Pick a Party',
    text,
    PARTIES.map((p) => ({ id: p.id, label: p.id === prevParty ? `${p.name} (your party)` : p.name, emoji: p.emoji })),
    { emoji: o.emoji, data: { office, incumbentRun } },
  )
}

defineScript(PARTY_SCRIPT, (g, choice, data) => {
  const d = (data ?? {}) as { office?: string; incumbentRun?: boolean }
  const office = officeOf(str(d.office as Json, 'school')).id
  const party = partyOf(choice)
  const issues = shuffle(g, ISSUES).slice(0, 5)
  scriptChoice(
    g,
    PLATFORM_SCRIPT,
    'Your Platform',
    `As the ${party.name} candidate, what will be the centerpiece of your campaign?`,
    issues.map((i) => ({ id: i.id, label: i.label, emoji: i.emoji })),
    { emoji: party.emoji, data: { office, party: party.id, incumbentRun: !!d.incumbentRun } },
  )
})

defineScript(PLATFORM_SCRIPT, (g, choice, data) => {
  const d = (data ?? {}) as { office?: string; party?: string; incumbentRun?: boolean }
  const o = officeOf(str(d.office as Json, 'school'))
  const issue = issueOf(choice)
  const choices = o.budgets.map((b, i) => ({
    id: String(i),
    label: b === 0 ? 'Grassroots (no money)' : `${money(b)} of my own money`,
    emoji: b === 0 ? '\u{1F33E}' : '\u{1F4B0}',
  }))
  scriptChoice(
    g,
    BUDGET_SCRIPT,
    'Campaign Budget',
    `Your platform is ${issue.label.toLowerCase()}. How much of your own money will you pour into the campaign? You have ${money(g.character.money)}.`,
    choices,
    { emoji: '\u{1F4B0}', data: { office: o.id, party: str(d.party as Json, 'independent'), issue: issue.id, incumbentRun: !!d.incumbentRun } },
  )
})

defineScript(BUDGET_SCRIPT, (g, choice, data) => {
  const d = (data ?? {}) as { office?: string; party?: string; issue?: string; incumbentRun?: boolean }
  const o = officeOf(str(d.office as Json, 'school'))
  const party = partyOf(str(d.party as Json, 'independent'))
  let tier = Math.max(0, Math.min(o.budgets.length - 1, Number(choice) || 0))
  let note = ''
  // Can't spend what you don't have: fall back to the biggest tier you can afford.
  while (tier > 0 && g.character.money < o.budgets[tier]) tier--
  if (String(tier) !== choice && Number(choice) > 0) note = ` You couldn't afford that much, so you scaled back to ${tier === 0 ? 'a grassroots campaign' : money(o.budgets[tier])}.`
  const own = o.budgets[tier]
  spend(g, own)
  const fame = fameOf(g)
  const donations = Math.round((o.budgets[1] * party.donors * (0.3 + rand(g) * 0.7) * (1 + fame / 50)) / 100) * 100
  const job = politicianJob(g)
  const chest = job ? pdata(job).warChest : 0
  if (job) pdata(job).warChest = 0
  const total = own + donations + chest
  const c = g.character
  const experience = viewPol(g).held.length * 3
  const budgetBoost = Math.min(14, (total / Math.max(1, o.budgets[2])) * 8)
  const poll =
    44 +
    party.edge +
    (c.stats.smarts - 50) * 0.1 +
    (c.stats.looks - 50) * 0.08 +
    Math.min(12, fame * 0.15) +
    budgetBoost +
    experience -
    convictions(g) * 5 -
    (o.opponent - 50) * 0.6 +
    randInt(g, -6, 6)
  const opp = opponentName(g)
  const oppParty = pick(
    g,
    PARTIES.filter((p) => p.id !== party.id && p.id !== 'independent'),
  )
  const camp: Campaign = {
    office: o.id,
    party: party.id,
    issue: str(d.issue as Json, 'economy'),
    budget: total,
    poll: Math.round(Math.max(12, Math.min(80, poll))),
    round: 1,
    opponent: opp,
    oppParty: oppParty.id,
    incumbentRun: !!d.incumbentRun,
  }
  polProfile(g).party = party.id
  count(g, 'campaigns')
  log(g, `I launched my campaign for ${officeTitle(g, o.id)} as the ${party.name} candidate.`, 'event')
  const intro = `You raised ${money(donations)} from donors${own > 0 ? ` and put in ${money(own)} of your own` : ''}${chest > 0 ? `, plus ${money(chest)} from your war chest` : ''}.${note} Your opponent is ${opp} of the ${oppParty.name}.`
  trailChoice(g, camp, intro)
})

const TRAIL: { id: string; label: string; emoji: string }[] = [
  { id: 'debate', label: 'Debate your opponent', emoji: '\u{1F399}\u{FE0F}' },
  { id: 'rally', label: 'Hold a rally', emoji: '\u{1F4E3}' },
  { id: 'babies', label: 'Kiss babies', emoji: '\u{1F476}' },
  { id: 'attack', label: 'Run attack ads', emoji: '\u{1F5E1}\u{FE0F}' },
  { id: 'doors', label: 'Go door-to-door', emoji: '\u{1F6AA}' },
  { id: 'tv', label: 'Do a TV interview', emoji: '\u{1F4FA}' },
  { id: 'social', label: 'Campaign on social media', emoji: '\u{1F4F1}' },
  { id: 'fair', label: 'Eat a corn dog at the fair', emoji: '\u{1F32D}' },
  { id: 'townhall', label: 'Hold a town hall', emoji: '\u{1F3DB}\u{FE0F}' },
  { id: 'endorse', label: 'Seek a celebrity endorsement', emoji: '\u{2B50}' },
  { id: 'diner', label: 'Shake hands at a diner', emoji: '\u{1F95E}' },
]

function pollLine(c: Campaign): string {
  return `Polls: You ${c.poll}% · ${c.opponent} ${100 - c.poll}%`
}

function trailChoice(g: GameState, camp: Campaign, prefix: string): void {
  const opts = shuffle(g, TRAIL).slice(0, 4)
  scriptChoice(
    g,
    TRAIL_SCRIPT,
    `Campaign Trail (${camp.round}/3)`,
    `${prefix}\n\n${pollLine(camp)}\n\nWhat's your next campaign stop?`,
    opts.map((x) => ({ id: x.id, label: x.label, emoji: x.emoji })),
    { emoji: '\u{1F5F3}\u{FE0F}', data: camp as unknown as Json },
  )
}

function trailOutcome(g: GameState, camp: Campaign, action: string): { delta: number; text: string } {
  const c = g.character
  const opp = camp.opponent
  switch (action) {
    case 'debate': {
      const d = Math.round((c.stats.smarts - 50) / 6 + randInt(g, -6, 6))
      return {
        delta: d,
        text:
          d >= 3
            ? pick(g, [`You dismantled ${opp} on live TV. Fact-checkers had nothing to say.`, `You delivered a zinger so good it became a campaign T-shirt by morning.`, `${opp} froze when you asked a simple follow-up question.`])
            : d <= -3
              ? pick(g, [`You confused two countries during the debate. ${opp} pounced.`, 'Your microphone was on while you muttered something rude about the moderator.', `${opp} made you look completely unprepared.`])
              : pick(g, ['The debate was a snoozer. Both of you said "my plan" forty times.', 'Pundits called the debate a draw. Nobody watched the whole thing.']),
      }
    }
    case 'rally': {
      const d = randInt(g, -2, 6)
      return { delta: d, text: d >= 3 ? pick(g, ['The rally was packed. Someone crowd-surfed. It may have been you.', 'Your supporters chanted your name until the fire marshal shut it down.']) : pick(g, ['Turnout at the rally was... intimate. Eleven people and a confused pigeon.', 'It rained on your rally. Your hair did not survive.']) }
    }
    case 'babies': {
      const d = randInt(g, -3, 5)
      return { delta: d, text: d >= 1 ? pick(g, ['You kissed a baby and it giggled on camera. Polls love a giggling baby.', 'You held a baby like a pro. Parents swooned.']) : pick(g, ['The baby screamed the moment you picked it up. The photo went viral for all the wrong reasons.', 'A baby sneezed directly into your mouth. You smiled through it.']) }
    }
    case 'attack': {
      addHidden(g, 'karma', -2)
      const d = randInt(g, -6, 8)
      return { delta: d, text: d >= 2 ? pick(g, [`Your ad dug up ${opp}'s college band. Voters were horrified by the lyrics.`, `Your ads painted ${opp} as a person who reclines their seat on airplanes. It worked.`]) : pick(g, ['Your attack ads backfired. Voters thought they were mean-spirited.', `${opp} turned your attack ad into a fundraising bonanza.`]) }
    }
    case 'doors': {
      const d = randInt(g, 0, 4)
      return { delta: d, text: pick(g, ['You knocked on hundreds of doors. Most people pretended not to be home, but some listened.', 'You went door-to-door and only got chased by one dog. A good day.', 'You learned a lot about your neighbors by knocking on their doors. Some of it you wish you could forget.']) }
    }
    case 'tv': {
      const d = Math.round((c.stats.looks - 50) / 8 + randInt(g, -5, 5))
      return { delta: d, text: d >= 2 ? pick(g, ['You looked confident and camera-ready. The anchor practically endorsed you.', 'Your TV interview was charming. Your approval among grandmas skyrocketed.']) : pick(g, ['You had spinach in your teeth for the entire interview.', 'The interviewer asked about your platform and you blanked on what it was.']) }
    }
    case 'social': {
      const followers = c.social?.followers ?? 0
      const d = randInt(g, -3, 4) + (followers > 100_000 ? 3 : followers > 5_000 ? 1 : 0)
      return { delta: d, text: d >= 2 ? pick(g, ['Your campaign video went viral. Even teenagers shared it, ironically.', 'Your meme game was strong. The youth vote noticed.']) : pick(g, ['You posted an old meme and got roasted in the replies.', 'An intern tweeted from your account by mistake. "lol who even votes"']) }
    }
    case 'fair': {
      const d = randInt(g, -4, 6)
      return { delta: d, text: d >= 1 ? pick(g, ['You ate a corn dog like a true local. A photo of it ran on every front page.', 'You judged the pie contest and gave everyone first place. Brilliant.']) : pick(g, ['You ate the corn dog with a knife and fork. Voters were disgusted.', 'You got mustard on your shirt and then stepped in something at the livestock barn.']) }
    }
    case 'townhall': {
      const d = Math.round((c.stats.smarts - 50) / 10 + randInt(g, -4, 5))
      return { delta: d, text: d >= 2 ? pick(g, ['You answered every question at the town hall with genuine empathy.', 'You won over a hostile crowd at your town hall.']) : pick(g, ['A retired teacher grilled you at the town hall and you had no answers.', 'The town hall turned into a twenty-minute argument about parking.']) }
    }
    case 'endorse': {
      const celeb = pick(g, CELEBS)
      const d = randInt(g, -2, 8)
      return { delta: d, text: d >= 3 ? `${celeb} endorsed you in a heartfelt video. Fans flocked to your campaign.` : d >= 0 ? `${celeb} endorsed you, but their fans were mostly too young to vote.` : `${celeb} endorsed you, then said something awful the next day. Guilt by association.` }
    }
    default: {
      const d = randInt(g, -1, 4)
      return { delta: d, text: pick(g, ['You shook hands with everyone in the diner and paid for their coffee.', 'You charmed the diner regulars, then accidentally ate someone else’s pancakes.', 'The diner staff loved you. The cook asked for a selfie.']) }
    }
  }
}

defineScript(TRAIL_SCRIPT, (g, choice, data) => {
  const raw = (data ?? {}) as Partial<Campaign>
  const camp: Campaign = {
    office: officeOf(String(raw.office ?? 'school')).id,
    party: String(raw.party ?? 'independent'),
    issue: String(raw.issue ?? 'economy'),
    budget: num(raw.budget as Json),
    poll: num(raw.poll as Json, 45),
    round: num(raw.round as Json, 1),
    opponent: String(raw.opponent ?? 'your opponent'),
    oppParty: String(raw.oppParty ?? 'centrist'),
    incumbentRun: !!raw.incumbentRun,
  }
  if (!g.character.alive || g.character.prison) return
  const { delta, text } = trailOutcome(g, camp, choice)
  camp.poll = Math.round(Math.max(5, Math.min(92, camp.poll + delta)))
  if (camp.round < 3) {
    camp.round += 1
    trailChoice(g, camp, `${text} (${delta >= 0 ? '+' : ''}${delta} in the polls)`)
    return
  }
  election(g, camp, text)
})

function election(g: GameState, camp: Campaign, lastText: string): void {
  const c = g.character
  const o = officeOf(camp.office)
  const title = officeTitle(g, o.id)
  const share = Math.max(3, Math.min(97, camp.poll + randInt(g, -5, 5)))
  const finalShare = share === 50 ? (chance(g, 0.5) ? 51 : 49) : share
  const p = polProfile(g)
  const current = politicianJob(g)
  if (finalShare > 50) {
    p.wins += 1
    count(g, 'electionsWon')
    const place = jurisdiction(g, o.id)
    const salary = salaryFor(g, o)
    const fresh: PolData = {
      office: o.id,
      party: camp.party,
      approval: Math.round(48 + (finalShare - 50) / 2 + randInt(g, 0, 8)),
      termLeft: o.term,
      terms: 1,
      hot: [],
      newsAge: -1,
      bills: [],
      warChest: 0,
      favors: 0,
      scandals: 0,
      termOver: false,
    }
    let quitText = ''
    if (current) {
      closeHeld(g)
      setRole(g, current, officeTitle(g, o.id), salary, o.rank)
      current.company = place
      current.data = { ...(fresh as unknown as Record<string, Json>), startAge: c.age, roleStartAge: c.age }
      current.yearsAtCompany = 0
      current.performance = fresh.approval
      count(g, 'promotions')
    } else {
      const { quit } = hire(g, { defId: 'politician', title: officeTitle(g, o.id), company: place, salary, level: o.rank, performance: fresh.approval, data: fresh as unknown as Record<string, Json> })
      quitText = quitNote(quit)
    }
    p.held.push({ office: o.id, title, place, startAge: c.age, endAge: null })
    addFame(g, 2 + o.rank * 4)
    addStat(g, 'happiness', 15)
    log(g, `I was elected ${title} with ${finalShare}% of the vote.`, 'good')
    remember(g, `Elected ${styled(g, o.id)}.`)
    say(
      g,
      'Election Night',
      `${lastText}\n\nThe votes are in: you won with ${finalShare}% of the vote! ${pick(g, [`${camp.opponent} called to concede, sounding like they'd been crying.`, `Confetti fell. Someone popped champagne. ${camp.opponent} left through the back door.`, 'Your victory speech ran long, but nobody cared.'])} You are the new ${styled(g, o.id)}. The job pays ${money(salary)} a year.${quitText}`,
      '\u{1F389}',
      'good',
    )
    return
  }
  p.losses += 1
  count(g, 'electionsLost')
  addStat(g, 'happiness', -10)
  log(g, `I lost the election for ${title}.`, 'bad')
  const loseText = `${lastText}\n\nThe votes are in: you lost to ${camp.opponent} with ${finalShare}% of the vote. ${pick(g, ['Your concession speech was gracious. Mostly.', 'You blamed the weather, the media and your campaign manager, in that order.', 'Your supporters cried. Your campaign manager updated their résumé.'])}`
  if (current) {
    const d = pdata(current)
    const was = current.title
    closeHeld(g)
    if (d.office === camp.office || camp.incumbentRun) {
      leave(g, 'other')
      say(g, 'Election Night', `${loseText} Your time as ${was} is over.`, '\u{1F5F3}\u{FE0F}', 'bad')
      return
    }
  }
  say(g, 'Election Night', loseText, '\u{1F5F3}\u{FE0F}', 'bad')
}

// ---------------------------------------------------------------------------
// Run for office (Special Careers > Politician)

function runAction(o: OfficeDef): MenuAction {
  return {
    type: 'action',
    id: `pol.run.${o.id}`,
    label: `Run for ${o.id === 'leader' ? 'National Leader' : o.id === 'school' ? 'School Board Director' : o.id === 'mayor' ? 'Mayor' : 'Governor'}`,
    emoji: o.emoji,
    subtitle: (g) => `${officeTitle(g, o.id)} · ${money(salaryFor(g, o))}/yr · ${o.term}-year term · ${prereqText(o)}, age ${minAgeFor(g, o)}+`,
    disabledReason: (g) => runReason(g, o),
    confirm: (g) => (g.character.job ? `If you win, you'll quit your job as ${g.character.job.title}. Start a campaign?` : null),
    run: (g) => {
      const why = runReason(g, o)
      if (why) return tell(g, 'Not Eligible', why, '\u{1F6AB}')
      if (!useYearAction(g, 'pol.campaign', 1)) return tell(g, 'Campaign', 'You already ran a campaign this year. Election season is over.', '\u{1F5F3}\u{FE0F}')
      startCampaign(g, o.id, false)
    },
  }
}

function careerInfo(): MenuGroup {
  return {
    type: 'menu',
    id: 'pol.record',
    label: 'Political Record',
    emoji: '\u{1F4DC}',
    subtitle: (g) => {
      const p = viewPol(g)
      return `${p.wins} win${p.wins === 1 ? '' : 's'} · ${p.losses} loss${p.losses === 1 ? '' : 'es'}`
    },
    children: (g): MenuNode[] => {
      const p = viewPol(g)
      if (!p.held.length) return [{ type: 'info', id: 'pol.rec.none', text: "You haven't held any public office yet.", emoji: '\u{1F4DC}' }]
      const nodes: MenuNode[] = p.held.map((h, i) => ({
        type: 'info' as const,
        id: `pol.rec.${i}`,
        emoji: officeOf(h.office).emoji,
        text: `${h.title}, ${h.place} (age ${h.startAge}${h.endAge === null ? '-present' : `-${h.endAge}`})`,
      }))
      nodes.push({ type: 'info', id: 'pol.rec.laws', emoji: '\u{1F4DD}', text: `Bills signed: ${p.billsPassed} · Vetoes: ${p.vetoes}${p.impeached ? ` · Impeached: ${p.impeached}` : ''}` })
      return nodes
    },
  }
}

export const politicsCareerMenu: MenuGroup = {
  type: 'menu',
  id: 'special.politics',
  label: 'Politician',
  emoji: '\u{1F5F3}\u{FE0F}',
  subtitle: 'Run for office',
  header: (g) =>
    `Work your way up from School Board Director to ${leaderTitle(g)}. Smarts help in debates, looks help on TV, and fame and money win elections. Elections can only be contested once a year.`,
  children: (g): MenuNode[] => {
    const job = politicianJob(g)
    if (job) return [{ type: 'info', id: 'pol.already', text: `You are the ${job.title} (${job.company}). Govern from your job.`, emoji: '\u{1F3DB}\u{FE0F}' }, careerInfo()]
    return [...OFFICES.map(runAction), careerInfo()]
  },
}

// ---------------------------------------------------------------------------
// Governing

function hotIssues(g: GameState): string[] {
  return shuffle(g, ISSUES)
    .slice(0, 3)
    .map((i) => i.id)
}

function newBills(g: GameState, office: OfficeId): Bill[] {
  return shuffle(g, BILLS[office])
    .slice(0, randInt(g, 2, 3))
    .map((b) => ({ name: b.name, emoji: b.emoji, issue: b.issue, support: b.effect === 'payRaise' ? randInt(g, 5, 30) : randInt(g, 15, 88), effect: b.effect ?? '' }))
}

function informed(g: GameState, job: Job): boolean {
  return pdata(job).newsAge === g.character.age
}

const newspaperAction: MenuAction = {
  type: 'action',
  id: 'pol.news',
  label: 'Read the Newspaper',
  emoji: '\u{1F4F0}',
  subtitle: 'Find out what voters care about',
  disabledReason: (g) => blocked(g, 0),
  run: (g) => {
    const job = politicianJob(g)
    if (!job) return
    const d = pdata(job)
    if (!d.hot.length) d.hot = hotIssues(g)
    d.newsAge = g.character.age
    const topics = d.hot.map((h) => issueOf(h).label.toLowerCase())
    const a = d.approval
    const headline =
      a >= 75
        ? pick(g, [`"${job.title} Can Do No Wrong," Says Everyone`, `Approval Soars for ${g.character.lastName}`])
        : a >= 50
          ? pick(g, [`${job.title} ${g.character.lastName} Holds Steady`, `Local Voters Mostly Shrug at ${g.character.lastName}`])
          : a >= 30
            ? pick(g, [`Frustration Grows with ${g.character.lastName}`, `Is ${g.character.lastName} Asleep at the Wheel?`])
            : pick(g, [`Calls Mount for ${g.character.lastName} to Resign`, `${g.character.lastName}: Worst ${job.title} Ever?`])
    say(
      g,
      'The Newspaper',
      `Today's headline: ${headline}.\n\nThe public is most concerned about ${topics[0]}, ${topics[1]} and ${topics[2]}. Your approval rating is ${a}%.`,
      '\u{1F4F0}',
    )
  },
}

const SPEECH_SCRIPT = 'special.pol.speech'

defineScript(SPEECH_SCRIPT, (g, choice) => {
  const job = politicianJob(g)
  if (!job || choice === 'cancel') return
  if (!useYearAction(g, 'pol.speech', 3)) return tell(g, 'Speech', "You've given enough speeches this year. Your throat is hoarse and people are changing the channel.", '\u{1F399}\u{FE0F}')
  const d = pdata(job)
  if (!d.hot.length) d.hot = hotIssues(g)
  const issue = issueOf(choice)
  const hot = d.hot.includes(issue.id)
  const delta = hot ? randInt(g, 3, 8) + (g.character.stats.smarts >= 70 ? 1 : 0) : randInt(g, -3, 2)
  addApproval(job, delta)
  addFame(g, 1)
  log(g, `I gave a televised speech about ${issue.label.toLowerCase()}.`)
  say(
    g,
    'Broadcast Speech',
    hot
      ? `${pick(g, [`Your speech on ${issue.label.toLowerCase()} struck a nerve. People are talking about it everywhere.`, `You spoke passionately about ${issue.label.toLowerCase()} and the public ate it up.`, `Your address on ${issue.label.toLowerCase()} was quoted on every news channel.`])} Approval: ${d.approval}% (+${delta}).`
      : `${pick(g, [`Nobody seems to care about ${issue.label.toLowerCase()} right now. Viewers switched to a cooking show.`, `Your speech on ${issue.label.toLowerCase()} fell flat. Maybe read the newspaper first?`, `Pundits called your speech on ${issue.label.toLowerCase()} "tone-deaf".`])} Approval: ${d.approval}% (${delta >= 0 ? '+' : ''}${delta}).`,
    '\u{1F399}\u{FE0F}',
    hot ? 'good' : 'neutral',
  )
})

const speechAction: MenuAction = {
  type: 'action',
  id: 'pol.speech',
  label: 'Broadcast a Speech',
  emoji: '\u{1F399}\u{FE0F}',
  subtitle: 'Address the public on an issue',
  disabledReason: (g) => blocked(g, 0),
  run: (g) => {
    const job = politicianJob(g)
    if (!job) return
    const d = pdata(job)
    if (!d.hot.length) d.hot = hotIssues(g)
    const know = informed(g, job)
    scriptChoice(
      g,
      SPEECH_SCRIPT,
      'Broadcast a Speech',
      know ? 'You read the newspaper, so you know what people care about. What will you talk about?' : "What will your speech be about? (Read the newspaper to learn what's on voters' minds.)",
      [
        ...ISSUES.map((i) => ({ id: i.id, label: know && d.hot.includes(i.id) ? `${i.label} \u{1F525}` : i.label, emoji: i.emoji })),
        { id: 'cancel', label: 'Never mind', emoji: '\u{274C}' },
      ],
      { emoji: '\u{1F399}\u{FE0F}' },
    )
  },
}

function rallyCost(job: Job): number {
  return Math.round((officeOf(pdata(job).office).budgets[1] * 0.1) / 100) * 100
}

const rallyAction: MenuAction = {
  type: 'action',
  id: 'pol.rally',
  label: 'Stage a Rally',
  emoji: '\u{1F4E3}',
  subtitle: (g) => {
    const job = politicianJob(g)
    return job ? `Costs ${money(rallyCost(job))}` : ''
  },
  disabledReason: (g) => blocked(g, 0),
  run: (g) => {
    const job = politicianJob(g)
    if (!job) return
    if (!useYearAction(g, 'pol.rally', 2)) return tell(g, 'Rally', "You've already held two rallies this year. The venue stopped returning your calls.", '\u{1F4E3}')
    const cost = rallyCost(job)
    if (!spend(g, cost)) {
      g.yearActions['pol.rally'] = Math.max(0, (g.yearActions['pol.rally'] ?? 1) - 1)
      return tell(g, 'Rally', `You can't afford the ${money(cost)} it costs to stage a rally.`, '\u{1F4B8}')
    }
    const roll = rand(g)
    if (roll < 0.15) {
      addApproval(job, -3)
      log(g, 'Protesters crashed my rally.', 'bad')
      return say(g, 'Rally', `${pick(g, ['Protesters drowned out your speech with kazoos.', 'Someone threw a tomato at you. They had good aim.', 'Your teleprompter died and you rambled for forty minutes.'])} Approval: ${pdata(job).approval}% (-3).`, '\u{1F345}', 'bad')
    }
    const delta = randInt(g, 2, 7)
    addApproval(job, delta)
    addFame(g, 1)
    addStat(g, 'happiness', 4)
    log(g, 'I held a political rally.', 'good')
    say(g, 'Rally', `${pick(g, ['Thousands of supporters chanted your name.', 'Your rally was electric. A marching band showed up uninvited and it worked.', 'You fired up the crowd and signed a cast for a kid with a broken arm.'])} Approval: ${pdata(job).approval}% (+${delta}).`, '\u{1F4E3}', 'good')
  },
}

const BILL_SCRIPT = 'special.pol.bill'

defineScript(BILL_SCRIPT, (g, choice, data) => {
  const job = politicianJob(g)
  if (!job || choice === 'later') return
  const d = pdata(job)
  const name = String((data as { name?: string } | undefined)?.name ?? '')
  const idx = d.bills.findIndex((b) => b.name === name)
  if (idx < 0) return
  const bill = d.bills[idx]
  d.bills.splice(idx, 1)
  const p = polProfile(g)
  const s = bill.support
  if (choice === 'pass') {
    p.billsPassed += 1
    count(g, 'billsPassed')
    let delta = Math.round((s - 50) / 6 + randInt(g, -2, 2))
    let extra = ''
    if (bill.effect === 'payRaise') {
      job.salary = Math.round((job.salary * 1.15) / 100) * 100
      extra = ` Your salary is now ${money(job.salary)}. Voters noticed.`
      delta -= 4
    } else if (bill.effect === 'holiday') {
      delta += 4
      extra = ' Everyone loves a day off. Even your enemies took it.'
    } else if (bill.effect === 'space') {
      setOwnFlag(g, 'marsFunding', true)
      extra = ' The space agencies are hiring.'
    }
    addApproval(job, delta)
    log(g, `I signed "${bill.name}" into law.`, delta >= 0 ? 'good' : 'bad')
    return say(
      g,
      'Bill Signed',
      `You signed "${bill.name}" into law. ${s >= 60 ? pick(g, ['The public cheered.', 'It was wildly popular.']) : s >= 40 ? 'Reactions were mixed.' : pick(g, ['People were furious.', 'Angry letters piled up on your desk.'])}${extra} Approval: ${d.approval}% (${delta >= 0 ? '+' : ''}${delta}).`,
      bill.emoji,
      delta >= 0 ? 'good' : 'bad',
    )
  }
  p.vetoes += 1
  count(g, 'vetoes')
  const delta = Math.round((50 - s) / 8 + randInt(g, -2, 2))
  addApproval(job, delta)
  log(g, `I vetoed "${bill.name}".`)
  say(
    g,
    'Vetoed',
    `You vetoed "${bill.name}". ${s >= 60 ? pick(g, ['Supporters of the bill marched outside your office.', 'The bill was popular, and now you are slightly less so.']) : pick(g, ['Most people were relieved.', 'Nobody wanted that bill anyway. Good call.'])} Approval: ${d.approval}% (${delta >= 0 ? '+' : ''}${delta}).`,
    '\u{1F6AB}',
    delta >= 0 ? 'good' : 'bad',
  )
})

function billsMenu(): MenuGroup {
  return {
    type: 'menu',
    id: 'pol.bills',
    label: 'Legislation',
    emoji: '\u{1F4DD}',
    subtitle: (g) => {
      const job = politicianJob(g)
      const n = job ? pdata(job).bills.length : 0
      return n ? `${n} bill${n === 1 ? '' : 's'} on your desk` : 'No bills on your desk'
    },
    children: (g): MenuNode[] => {
      const job = politicianJob(g)
      if (!job) return []
      const d = pdata(job)
      if (!d.bills.length) return [{ type: 'info', id: 'pol.bills.none', text: 'No bills are waiting for your signature. New ones arrive every year.', emoji: '\u{1F4DD}' }]
      return d.bills.map((b, i) => ({
        type: 'action' as const,
        id: `pol.bill.${i}`,
        label: b.name,
        emoji: b.emoji,
        subtitle: `Public support: ${b.support}%`,
        disabledReason: (gg: GameState) => blocked(gg, 0),
        run: (gg: GameState) =>
          scriptChoice(
            gg,
            BILL_SCRIPT,
            'Legislation',
            `A bill to "${b.name}" is on your desk. Public support is ${b.support}%. Will you sign it or veto it?`,
            [
              { id: 'pass', label: 'Sign it into law', emoji: '\u{270D}\u{FE0F}' },
              { id: 'veto', label: 'Veto it', emoji: '\u{1F6AB}' },
              { id: 'later', label: 'Decide later', emoji: '\u{23F3}' },
            ],
            { emoji: b.emoji, data: { name: b.name } },
          ),
      }))
    },
  }
}

const fundraiseAction: MenuAction = {
  type: 'action',
  id: 'pol.fundraise',
  label: 'Host a Fundraiser',
  emoji: '\u{1F942}',
  subtitle: (g) => {
    const job = politicianJob(g)
    return job ? `War chest: ${money(pdata(job).warChest)}` : ''
  },
  disabledReason: (g) => blocked(g, 0),
  run: (g) => {
    const job = politicianJob(g)
    if (!job) return
    if (!useYearAction(g, 'pol.fundraise', 1)) return tell(g, 'Fundraiser', 'You already held a fundraiser this year. Donors are dodging your calls.', '\u{1F942}')
    const d = pdata(job)
    const o = officeOf(d.office)
    const raised = Math.round((o.budgets[1] * (0.2 + rand(g) * 0.6) * (0.5 + d.approval / 100) * partyOf(d.party).donors) / 100) * 100
    d.warChest += raised
    log(g, `I raised ${money(raised)} at a fundraiser.`, 'good')
    say(
      g,
      'Fundraiser',
      `${pick(g, ['You hosted a $500-a-plate dinner. The food was cold but the checks cleared.', 'You held a gala fundraiser and laughed at a lot of donor jokes.', 'You spent the evening shaking hands with very rich people who want very specific things.'])} You raised ${money(raised)} for your next campaign. War chest: ${money(d.warChest)}.`,
      '\u{1F942}',
      'good',
    )
  },
}

const HOLIDAY_SCRIPT = 'special.pol.order'

const ORDERS: { id: string; label: string; emoji: string }[] = [
  { id: 'parks', label: 'Declare a "National Nap Day"', emoji: '\u{1F634}' },
  { id: 'pets', label: 'Adopt an official pet for the residence', emoji: '\u{1F415}' },
  { id: 'pardon', label: 'Pardon a turkey', emoji: '\u{1F983}' },
  { id: 'tax', label: 'Order a tax audit of your rivals', emoji: '\u{1F575}\u{FE0F}' },
  { id: 'cancel', label: 'Never mind', emoji: '\u{274C}' },
]

defineScript(HOLIDAY_SCRIPT, (g, choice) => {
  const job = politicianJob(g)
  if (!job || choice === 'cancel') return
  if (!useYearAction(g, 'pol.order', 1)) return tell(g, 'Executive Order', "You've already signed an executive order this year. The pen is tired.", '\u{1F58A}\u{FE0F}')
  let delta = 0
  let text = ''
  if (choice === 'parks') {
    delta = randInt(g, 1, 5)
    text = 'You declared National Nap Day. Productivity plummeted. Happiness soared.'
  } else if (choice === 'pets') {
    delta = randInt(g, 2, 4)
    text = `You adopted a scruffy rescue dog named ${pick(g, ['Senator Biscuit', 'Filibuster', 'Veto', 'Sir Barksalot'])}. It has a higher approval rating than you.`
  } else if (choice === 'pardon') {
    delta = randInt(g, 1, 3)
    text = 'You pardoned a turkey in a televised ceremony. It bit you. Ratings were huge.'
  } else {
    addHidden(g, 'karma', -6)
    if (chance(g, 0.35)) {
      delta = -randInt(g, 8, 14)
      text = 'The press found out you ordered audits of your political enemies. Outrage everywhere.'
      pdata(job).scandals += 1
    } else {
      delta = 0
      text = 'Your rivals are suddenly very busy with their accountants. Nobody connected it to you.'
    }
  }
  addApproval(job, delta)
  log(g, 'I signed an executive order.')
  say(g, 'Executive Order', `${text} Approval: ${pdata(job).approval}% (${delta >= 0 ? '+' : ''}${delta}).`, '\u{1F58A}\u{FE0F}', delta >= 0 ? 'good' : 'bad')
})

const orderAction: MenuAction = {
  type: 'action',
  id: 'pol.order',
  label: 'Executive Order',
  emoji: '\u{1F58A}\u{FE0F}',
  subtitle: 'Use the powers of your office',
  visible: (g) => {
    const job = politicianJob(g)
    return !!job && officeOf(pdata(job).office).rank >= 2
  },
  disabledReason: (g) => blocked(g, 0),
  run: (g) => scriptChoice(g, HOLIDAY_SCRIPT, 'Executive Order', 'What will your executive order be?', ORDERS, { emoji: '\u{1F58A}\u{FE0F}' }),
}

const resignAction: MenuAction = {
  type: 'action',
  id: 'pol.resign',
  label: 'Resign',
  emoji: '\u{1F6AA}',
  subtitle: 'Step down from office',
  confirm: (g) => `Resign as ${politicianJob(g)?.title ?? 'politician'}?`,
  run: (g) => {
    const job = politicianJob(g)
    if (!job) return
    const title = job.title
    closeHeld(g)
    leave(g, 'quit')
    addFame(g, -3)
    log(g, `I resigned as ${title}.`)
    say(g, 'Resignation', `${pick(g, ['You resigned "to spend more time with family". Your family was not consulted.', 'You held a tearful press conference and resigned.', 'You resigned and immediately signed a book deal.'])} You are no longer ${title}.`, '\u{1F6AA}')
  },
}

export function politicsJobNodes(g: GameState): MenuNode[] {
  const job = politicianJob(g)
  if (!job) return []
  const d = pdata(job)
  const o = officeOf(d.office)
  return [
    {
      type: 'info',
      id: 'pol.status',
      emoji: o.emoji,
      text: `${styled(g, d.office)} · ${partyOf(d.party).name} · Approval ${d.approval}% · ${d.termOver ? 'Term over' : `${d.termLeft} year${d.termLeft === 1 ? '' : 's'} left in term ${d.terms}`}`,
    },
    newspaperAction,
    speechAction,
    rallyAction,
    billsMenu(),
    orderAction,
    fundraiseAction,
    careerInfo(),
    resignAction,
  ]
}

// ---------------------------------------------------------------------------
// Yearly scenarios

const FAVOR_SCRIPT = 'special.pol.favor'
const SCANDAL_SCRIPT = 'special.pol.scandal'
const IMPEACH_SCRIPT = 'special.pol.impeach'
const TERM_SCRIPT = 'special.pol.term'

defineScript(FAVOR_SCRIPT, (g, choice, data) => {
  const job = politicianJob(g)
  if (!job) return
  const amount = num((data as { amount?: number } | undefined)?.amount as Json, 10_000)
  const who = String((data as { who?: string } | undefined)?.who ?? 'A lobbyist')
  const d = pdata(job)
  if (choice === 'accept') {
    d.favors += 1
    addHidden(g, 'karma', -8)
    addMoney(g, amount)
    count(g, 'bribesTaken')
    log(g, `I accepted a political favor from ${who.toLowerCase()}.`, 'bad')
    say(g, 'Political Favor', `You quietly accepted ${money(amount)} from ${who.toLowerCase()}. ${pick(g, ['They promised nobody would ever know.', 'The envelope was surprisingly heavy.', 'They winked. You winked back. It was weird.'])}`, '\u{1F4B0}')
    return
  }
  if (choice === 'report') {
    addHidden(g, 'karma', 6)
    const delta = randInt(g, 3, 8)
    addApproval(job, delta)
    log(g, `I reported a bribery attempt by ${who.toLowerCase()}.`, 'good')
    say(g, 'Political Favor', `You reported the bribe to the authorities. The press called you "the last honest politician". Approval: ${d.approval}% (+${delta}).`, '\u{1F607}', 'good')
    return
  }
  addHidden(g, 'karma', 2)
  say(g, 'Political Favor', `You turned down the money. ${who} said you'd "regret this" and stormed out.`, '\u{1F645}')
})

defineScript(SCANDAL_SCRIPT, (g, choice, data) => {
  const job = politicianJob(g)
  if (!job) return
  const what = String((data as { what?: string } | undefined)?.what ?? 'a scandal')
  const d = pdata(job)
  d.scandals += 1
  let delta: number
  let text: string
  if (choice === 'apologize') {
    delta = -randInt(g, 1, 6)
    text = pick(g, ['Your heartfelt apology was surprisingly well received.', 'You apologized on live TV. A few people even believed you.'])
  } else if (choice === 'deny') {
    if (chance(g, 0.5)) {
      delta = randInt(g, -1, 2)
      text = 'You denied everything. The story died after a news cycle.'
    } else {
      delta = -randInt(g, 8, 15)
      text = 'You denied everything, then a reporter found the receipts. Literally.'
    }
  } else {
    addHidden(g, 'karma', -4)
    if (chance(g, 0.6)) {
      delta = -randInt(g, 0, 4)
      text = 'You blamed an intern. The intern was fired. You were not.'
    } else {
      delta = -randInt(g, 6, 12)
      text = 'You blamed your staff, and your staff leaked everything to the press.'
    }
  }
  addApproval(job, delta)
  log(g, `I was caught up in a scandal over ${what}.`, 'bad')
  say(g, 'Scandal', `${text} Approval: ${d.approval}% (${delta >= 0 ? '+' : ''}${delta}).`, '\u{1F4F8}', delta >= 0 ? 'neutral' : 'bad')
})

defineScript(IMPEACH_SCRIPT, (g, choice) => {
  const job = politicianJob(g)
  if (!job) return
  const title = job.title
  const p = polProfile(g)
  if (choice === 'resign') {
    closeHeld(g)
    leave(g, 'quit')
    addFame(g, -5)
    log(g, `I resigned as ${title} before I could be removed.`, 'bad')
    return say(g, 'Resigned', `You resigned in disgrace before the vote. ${pick(g, ['Your farewell speech was mostly excuses.', 'Reporters chased you to your car.'])}`, '\u{1F6AA}', 'bad')
  }
  const d = pdata(job)
  const survive = Math.min(0.85, 0.2 + d.approval / 40 + (g.character.stats.smarts - 50) / 200)
  if (chance(g, survive)) {
    addApproval(job, randInt(g, 3, 8))
    log(g, `I survived an impeachment vote as ${title}.`, 'good')
    return say(g, 'Impeachment', `You fought the charges and survived the vote by a hair. ${pick(g, ['Your allies held the line.', 'Two lawmakers missed the vote because of a flat tire. Lucky you.'])} Approval: ${d.approval}%.`, '\u{1F605}', 'good')
  }
  p.impeached += 1
  count(g, 'impeached')
  closeHeld(g)
  leave(g, 'fired')
  addFame(g, -8)
  addStat(g, 'happiness', -20)
  log(g, `I was impeached and removed as ${title}.`, 'bad')
  remember(g, `Impeached and removed as ${title}.`)
  say(g, 'Removed from Office', `The vote was overwhelming. You were impeached and removed from office as ${title}. History will not be kind.`, '\u{1F528}', 'bad')
})

defineScript(TERM_SCRIPT, (g, choice) => {
  const job = politicianJob(g)
  if (!job) return
  const d = pdata(job)
  const o = officeOf(d.office)
  const title = job.title
  if (choice === 'reelect') {
    reelection(g, job)
    return
  }
  if (choice === 'higher') {
    const next = OFFICES[o.rank + 1]
    if (!next || runReason(g, next, true)) {
      reelection(g, job)
      return
    }
    startCampaign(g, next.id, true)
    return
  }
  closeHeld(g)
  if (o.id === 'leader') {
    const p = polProfile(g)
    p.formerLeader = true
    p.formerLeaderTitle = title
  }
  leave(g, 'retired')
  log(g, `I retired from politics after serving as ${title}.`, 'good')
  remember(g, `Retired from politics as ${title}.`)
  say(g, 'Retired', `You left office as ${title} with a ${d.approval}% approval rating. ${pick(g, ['Your portrait now hangs in a hallway nobody walks down.', 'You celebrated by sleeping in for the first time in years.', 'Publishers are already calling about your memoir.'])}`, '\u{1F3D6}\u{FE0F}', 'good')
})

function reelection(g: GameState, job: Job): void {
  const d = pdata(job)
  const o = officeOf(d.office)
  const c = g.character
  const opp = opponentName(g)
  const chest = d.warChest
  d.warChest = 0
  const poll = 30 + d.approval * 0.45 + Math.min(8, (chest / Math.max(1, o.budgets[2])) * 8) + (c.stats.smarts - 50) * 0.05 + Math.min(6, fameOf(g) * 0.08) - d.scandals * 2
  const share = Math.round(Math.max(5, Math.min(95, poll + randInt(g, -6, 6))))
  const title = job.title
  if (share > 50) {
    d.termLeft = o.term
    d.terms += 1
    d.termOver = false
    d.scandals = 0
    polProfile(g).wins += 1
    count(g, 'electionsWon')
    addStat(g, 'happiness', 10)
    addFame(g, 2)
    log(g, `I was re-elected ${title} with ${share}% of the vote.`, 'good')
    remember(g, `Re-elected ${title}.`)
    say(g, 'Re-elected!', `You beat ${opp} with ${share}% of the vote and won a ${ordinalWord(d.terms)} term as ${title}!${chest > 0 ? ` Your ${money(chest)} war chest helped.` : ''}`, '\u{1F389}', 'good')
    return
  }
  polProfile(g).losses += 1
  count(g, 'electionsLost')
  closeHeld(g)
  if (o.id === 'leader') {
    const p = polProfile(g)
    p.formerLeader = true
    p.formerLeaderTitle = title
  }
  leave(g, 'other')
  addStat(g, 'happiness', -12)
  log(g, `I lost my re-election bid for ${title}.`, 'bad')
  say(g, 'Defeated', `Voters threw you out. ${opp} won with ${100 - share}% of the vote. ${pick(g, ['You moved out of your office with a single sad box.', 'You gave a concession speech and then ate an entire cake.'])}`, '\u{1F5F3}\u{FE0F}', 'bad')
}

function ordinalWord(n: number): string {
  return ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'][n - 1] ?? `${n}th`
}

const FAVOR_GIVERS = ['A real estate developer', 'An oil company lobbyist', 'A tech billionaire', 'A casino owner', 'A pharmaceutical executive', 'A shady construction contractor', 'A mysterious man in sunglasses']
const SCANDALS = [
  'a leaked group chat',
  'an expensive taxpayer-funded vacation',
  'an old photo in a questionable costume',
  'a hot mic moment',
  'your nephew getting a cushy government contract',
  'a very expensive office chair',
  'skipping a disaster briefing to play golf',
  'an awkward dance video',
]

export function yearlyPolitics(g: GameState): void {
  const c = g.character
  if (!c.alive) return
  const p0 = peek<PolProfile>(g, 'politics')
  const job = politicianJob(g)
  // Former heads of government collect a pension.
  if (p0?.formerLeader && !job && !c.prison) {
    const pension = Math.round((200_000 * Math.max(0.3, getCountry(c.countryId).wealth || 1)) / 100) * 100
    earnIncome(g, pension)
    if (chance(g, 0.15)) addFame(g, 1)
  }
  if (!job || c.prison) return
  syncTenure(g, job)
  const d = pdata(job)
  const o = officeOf(d.office)
  earnIncome(g, job.salary)
  d.hot = hotIssues(g)
  d.bills = newBills(g, o.id)
  // Approval drifts toward 50 with noise.
  setApproval(job, d.approval + (50 - d.approval) * 0.12 + randInt(g, -6, 5))
  fameToward(g, o.fame, 3 + o.rank)
  addStat(g, 'happiness', d.approval >= 60 ? 2 : d.approval < 30 ? -4 : 0)

  // Accepted favors may come back to haunt you.
  if (d.favors > 0 && chance(g, Math.min(0.5, 0.08 * d.favors))) {
    const title = job.title
    closeHeld(g)
    leave(g, 'fired')
    addFame(g, -10)
    log(g, `I was arrested for corruption while serving as ${title}.`, 'bad')
    say(g, 'Corruption Probe', `Investigators traced the money from your "political favors". You were removed as ${title} and arrested for corruption.`, '\u{1F6A8}', 'bad')
    arrestPlayer(g, 'Corruption', 4, { evidence: 0.8 })
    return
  }

  // Head-of-government danger.
  if (o.id === 'leader' && chance(g, 0.02)) {
    if (chance(g, 0.08)) {
      killCharacter(g, 'Assassination')
      return
    }
    addStat(g, 'happiness', -10)
    addApproval(job, 6)
    log(g, 'I survived an assassination attempt.', 'bad')
    say(g, 'Assassination Attempt', 'Shots rang out at a public event, but your security team tackled you to safety. A wave of sympathy lifted your approval rating.', '\u{1F6E1}\u{FE0F}', 'bad')
  }

  d.termLeft = Math.max(0, d.termLeft - 1)
  if (d.termLeft === 0) {
    d.termOver = true
    const limitHit = o.termLimit > 0 && d.terms >= o.termLimit
    const next = OFFICES[o.rank + 1]
    const nextOk = !!next && !runReason(g, next, true)
    const choices = []
    if (!limitHit && c.age <= 85) choices.push({ id: 'reelect', label: 'Run for re-election', emoji: '\u{1F5F3}\u{FE0F}' })
    if (nextOk && next) choices.push({ id: 'higher', label: `Run for ${officeTitle(g, next.id)}`, emoji: next.emoji })
    choices.push({ id: 'retire', label: 'Retire from politics', emoji: '\u{1F3D6}\u{FE0F}' })
    scriptChoice(
      g,
      TERM_SCRIPT,
      'End of Term',
      `Your ${ordinalWord(d.terms)} term as ${job.title} is over${limitHit ? ' and you have reached the term limit' : ''}. Your approval rating is ${d.approval}%. What's next?`,
      choices,
      { emoji: o.emoji },
    )
    return
  }

  if (d.approval < 20 && o.rank >= 1 && chance(g, 0.75)) {
    scriptChoice(
      g,
      IMPEACH_SCRIPT,
      o.rank >= 2 ? 'Impeachment' : 'Recall Election',
      `With an approval rating of just ${d.approval}%, lawmakers have begun proceedings to remove you as ${job.title}. What will you do?`,
      [
        { id: 'fight', label: 'Fight the charges', emoji: '\u{1F4AA}' },
        { id: 'resign', label: 'Resign', emoji: '\u{1F6AA}' },
      ],
      { emoji: '\u{1F528}' },
    )
    return
  }

  let modal = false
  if (chance(g, 0.12)) {
    modal = true
    const what = pick(g, SCANDALS)
    scriptChoice(
      g,
      SCANDAL_SCRIPT,
      'Scandal!',
      `The press has a story about ${what}. How will you respond?`,
      [
        { id: 'apologize', label: 'Apologize', emoji: '\u{1F64F}' },
        { id: 'deny', label: 'Deny everything', emoji: '\u{1F645}' },
        { id: 'blame', label: 'Blame your staff', emoji: '\u{1F449}' },
      ],
      { emoji: '\u{1F4F8}', data: { what } },
    )
  }

  if (!modal && chance(g, 0.22)) {
    const who = pick(g, FAVOR_GIVERS)
    const amount = Math.round((salaryFor(g, o) * (0.3 + rand(g) * 1.2)) / 1000) * 1000
    scriptChoice(
      g,
      FAVOR_SCRIPT,
      'Political Favor',
      `${who} offers you ${money(amount)} in cash if you push through a favorable decision for them. Nobody has to know...`,
      [
        { id: 'accept', label: 'Take the money', emoji: '\u{1F4B0}' },
        { id: 'decline', label: 'Decline', emoji: '\u{1F645}' },
        { id: 'report', label: 'Report the bribe', emoji: '\u{1F46E}' },
      ],
      { emoji: '\u{1F91D}', data: { who, amount } },
    )
  }
}
