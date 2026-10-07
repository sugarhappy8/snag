// Every legal way into a country for this character, this year: free movement, points tests,
// sponsored work, guest-worker schemes, study, working holidays, marriage, family, investor and
// golden visas, retirement and remote-worker visas, asylum, lotteries and the odd historical
// door (open-door settlement, the US quota years, the Law of Return, BN(O)...). Each route says
// whether you qualify (and why not), the odds, what it costs, how long the decision takes and
// how long until permanent residency and citizenship. Pure: no RNG, no state changes (safe in
// menus); immigration-apply.ts acts on the result.
import { jobRequirementProblem } from '../careers'
import { currentPartner, formatMoney, netWorth } from '../core'
import { cvScore, fitContext, jobFit, jobMarket } from '../cv'
import {
  ENGLISH_WORKPLACES,
  EXCLUSIONS,
  GUEST_PROGRAMS,
  INVESTOR_PROGRAMS,
  LOTTERIES,
  REMOTE_PROGRAMS,
  RETIRE_PROGRAMS,
  SETTLER_PROGRAMS,
  BACKLOGS,
  US_QUOTA_ODDS,
  WORKING_HOLIDAYS,
  asylumGenerosity,
  exitTaxRule,
  languageOf,
  lawOf,
  naturalizeYears,
  pointsSystem,
  real,
  strictness,
  type InvestKind,
  type InvestorProgram,
} from '../data/immigration'
import { FULLTIME_JOBS, getJobDef, type JobDef } from '../data/jobs'
import { localTerm } from '../data/locales'
import { priceLevel } from '../history/timeline'
import { hasTalent, talentHint } from '../talents'
import { countryLabel, getCountry } from '../world'
import type { GameState, ImmigrationStatus, Person } from '../types'
import {
  an,
  bestPassport,
  blocAccess,
  blocName,
  citizenshipsOf,
  continentOf,
  crisisIn,
  exitRegime,
  exitWindow,
  expandCitizenships,
  hasExitPermit,
  immState,
  isBanned,
  isCitizenOf,
  languageLevel,
  personCitizenships,
  unionBetween,
  unionName,
} from './immigration-state'

export type RouteId =
  | 'citizen'
  | 'free'
  | 'former'
  | 'return'
  | 'bno'
  | 'settler'
  | 'quota'
  | 'points'
  | 'work'
  | 'guest'
  | 'student'
  | 'whv'
  | 'spouse'
  | 'family'
  | 'investor'
  | 'retire'
  | 'remote'
  | 'asylum'
  | 'lottery'

export interface SponsorJob {
  defId: string
  title: string
  industry: string
  /** First-year salary in the destination (engine dollars). */
  salary: number
  /** 0-100 (cv.ts jobFit with the destination's job market). */
  fit: number
}

export interface RouteEval {
  /** Unique within a destination: 'work', 'investor:pt-golden'... */
  key: string
  id: RouteId
  dest: string
  label: string
  /** The route as it reads mid-sentence ("skilled work visa", "Golden Visa"). */
  noun: string
  emoji: string
  ok: boolean
  /** Why it's closed ('' when open). */
  why: string
  /** 0-1 chance the application is approved. */
  odds: number
  /** Fees (engine dollars), non-refundable. */
  fee: number
  /** Money moved into a locked investment (or paid as a one-off price, for 'fee' programs). */
  invest: number
  investKind?: InvestKind
  lockYears: number
  /** Cash you must show and keep (student funds, retirement deposits are in `invest`). */
  proof: number
  /** Years until the decision (0 = this year). */
  wait: number
  result: ImmigrationStatus['status']
  visa?: string
  /** Years a visa lasts before renewal (none = no expiry). */
  term?: number
  /** Last year a capped visa can run to (guest workers, nomads, working holidays). */
  maxYears?: number | null
  /** Years from arrival to permanent residency (0 on arrival, null never). */
  toPr: number | null
  /** Years from arrival to citizenship (null never). */
  toCitizen: number | null
  program?: string
  notes: string[]
  sponsor?: SponsorJob
  /** Keep the current (remote) job when moving. */
  keepJob?: boolean
  /** Approval moves you (false: decided in place, e.g. a lottery win you still have to act on). */
  moves: boolean
}

// ---------------------------------------------------------------------------
// Helpers

const pct = (p: number) => `${Math.round(Math.max(0, Math.min(1, p)) * 100)}%`

export function destWealth(id: string): number {
  const w = getCountry(id).wealth
  return Math.max(0.3, Math.min(1.6, typeof w === 'number' && Number.isFinite(w) ? w : 1))
}

function niceFee(n: number): number {
  const a = Math.abs(n)
  const step = a < 1_000 ? 10 : a < 10_000 ? 50 : a < 100_000 ? 500 : 1_000
  return Math.max(0, Math.round(n / step) * step)
}

/** A program's money rule (nominal dollars of the year it was set) in today's money this year, rounded. */
export function programMoney(nominal: number, year: number): number {
  return niceFee(real(nominal, year))
}

/** A country's name as it reads mid-sentence ("the Netherlands", "France"). */
export function countryName(id: string): string {
  return countryLabel(getCountry(id))
}

function convictions(g: GameState): { count: number; serious: boolean } {
  const list = g.character.criminalRecord.filter((r) => r.convicted)
  return { count: list.length, serious: list.some((r) => (r.sentenceYears ?? 0) >= 2) || list.length >= 3 }
}

const DEGREE_RANK: Record<string, number> = { ged: 1, highschool: 1, associate: 2, bachelor: 3, master: 4, doctorate: 4, nursing: 3, mba: 5, jd: 5, md: 5, dds: 5, pharmd: 5, dvm: 5 }

export function eduRank(g: GameState): number {
  return g.character.education.degrees.reduce((m, d) => Math.max(m, DEGREE_RANK[d.kind] ?? 0), 0)
}

function workYears(g: GameState): number {
  const c = g.character
  return c.careerHistory.reduce((s, r) => s + Math.max(0, r.endAge - r.startAge), 0) + (c.job?.yearsAtCompany ?? 0)
}

/** Does an exclusion law bar people from this birth country? */
export function exclusionFor(dest: string, birth: string, year: number): string | null {
  for (const e of EXCLUSIONS) {
    if (e.dest !== dest || year < e.from || year > e.to) continue
    if (e.origins.includes(birth) || e.origins.includes(continentOf(birth))) return `${e.label} (${e.from}-${e.to + 1}) barred immigrants from ${countryName(birth)}.`
  }
  return null
}

export function backlogYears(dest: string, origin: string, year: number): number {
  let y = 0
  for (const [d, o, from, to, extra] of BACKLOGS) if (d === dest && o === origin && year >= from && year <= to) y = Math.max(y, extra)
  return y
}

/** Era-wide conditions: world wars, the Depression, Europe's recruitment stop, pandemic bans. */
export function eraFactor(dest: string, year: number, id: RouteId): { f: number; note?: string } {
  if (id === 'citizen' || id === 'free' || id === 'return' || id === 'former') return { f: 1 }
  if (year >= 1939 && year <= 1945) return id === 'asylum' ? { f: 0.5, note: 'Most countries kept their doors shut to refugees during the war.' } : { f: 0.12, note: 'The Second World War has shut almost every border.' }
  if (year >= 1914 && year <= 1918) return { f: 0.35, note: 'The First World War has made crossing borders hard.' }
  if (year >= 1930 && year <= 1938 && ['us', 'pr', 'ca', 'au', 'nz', 'ar', 'br', 'uy', 'cl'].includes(dest) && ['settler', 'work', 'quota', 'points', 'guest'].includes(id)) return { f: 0.4, note: 'The Great Depression has slashed immigration.' }
  if (year >= 1974 && year <= 1985 && ['de', 'fr', 'nl', 'be', 'at', 'ch', 'se', 'dk', 'gb'].includes(dest) && (id === 'work' || id === 'guest')) return { f: 0.6, note: 'Since the 1973 oil shock, Western Europe has stopped recruiting foreign workers.' }
  if (year >= 2020 && year <= 2021 && id !== 'asylum' && id !== 'spouse') return { f: 0.55, note: 'Pandemic travel bans are slowing every visa office.' }
  return { f: 1 }
}

// ---------------------------------------------------------------------------
// The sponsoring employer: the best skilled job your CV fits, scored on the destination market

const REMOTE_INDUSTRIES = ['tech', 'corporate', 'finance', 'design', 'publisher', 'newspaper', 'science', 'bank']

interface Cands {
  sig: string
  defs: JobDef[]
}
const candMemo = new WeakMap<GameState, Cands>()

function candSig(g: GameState): string {
  const c = g.character
  return `${g.year}|${c.age}|${c.education.degrees.length}|${c.careerHistory.length}|${c.job?.defId ?? ''}|${c.cv?.length ?? 0}|${c.criminalRecord.length}`
}

/** The few skilled jobs the CV fits best (memoized per state object; pure). */
function sponsorCandidates(g: GameState): JobDef[] {
  const sig = candSig(g)
  const hit = candMemo.get(g)
  if (hit && hit.sig === sig) return hit.defs
  const ctx = fitContext(g)
  const scored: { def: JobDef; fit: number }[] = []
  for (const def of FULLTIME_JOBS) {
    if (def.edu === 'none' || jobRequirementProblem(g, def)) continue
    scored.push({ def, fit: jobFit(g, def, ctx).fit })
  }
  scored.sort((a, b) => b.fit - a.fit || b.def.ladder[0].salary - a.def.ladder[0].salary)
  const defs = scored.slice(0, 4).map((x) => x.def)
  candMemo.set(g, { sig, defs })
  return defs
}

export function sponsorFor(g: GameState, dest: string): SponsorJob | null {
  const defs = sponsorCandidates(g)
  if (!defs.length) return null
  const ctx = fitContext(g)
  let best: SponsorJob | null = null
  for (const def of defs) {
    const fit = jobFit(g, def, ctx, jobMarket(g, def.industry, dest)).fit
    if (!best || fit > best.fit) {
      best = { defId: def.id, title: def.ladder[0].title, industry: def.industry, salary: Math.max(100, Math.round((def.ladder[0].salary * Math.max(0.25, getCountry(dest).wealth)) / 100) * 100), fit }
    }
  }
  return best
}

// ---------------------------------------------------------------------------
// Points tests (one grid for every points system, out of 100)

export interface PointsResult {
  total: number
  pass: number
  lines: string[]
}

export function pointsTest(g: GameState, dest: string, pass: number, fit: number): PointsResult {
  const c = g.character
  const a = c.age
  const age = a < 18 ? 0 : a <= 24 ? 25 : a <= 32 ? 30 : a <= 39 ? 25 : a <= 44 ? 15 : a <= 49 ? 5 : 0
  const er = eduRank(g)
  const edu = [0, 5, 10, 18, 22, 25][Math.min(5, er)]
  const yrs = workYears(g)
  const exp = yrs >= 6 ? 15 : yrs >= 4 ? 13 : yrs >= 2 ? 10 : yrs >= 1 ? 5 : 0
  const lang = languageOf(dest)
  let level = languageLevel(g, lang)
  if (ENGLISH_WORKPLACES.includes(dest)) level = Math.max(level, languageLevel(g, 'English'))
  const langPts = [0, 3, 8, 15][level]
  const cv = Math.round(Math.max(0, Math.min(10, fit / 10)))
  const smarts = c.stats.smarts >= 75 ? 3 : 0
  const funds = c.money >= 15_000 ? 2 : 0
  const total = age + edu + exp + langPts + cv + smarts + funds
  const lines = [`Age ${age}`, `Education ${edu}`, `Experience ${exp}`, `Language ${langPts}`, `CV ${cv}`]
  if (smarts) lines.push(`Smarts ${smarts}`)
  if (funds) lines.push(`Savings ${funds}`)
  return { total, pass, lines }
}

// ---------------------------------------------------------------------------
// Locked investments: what to expect back (the yearly clock uses the same numbers)

/** Yearly drift of a locked stake, in thousandths (bell(lo, hi)), plus a yearly collapse risk. */
export const LOCK_DRIFT: Record<InvestKind, { lo: number; hi: number; fail?: number; inflation?: number }> = {
  property: { lo: -60, hi: 80 },
  fund: { lo: -150, hi: 210 },
  bonds: { lo: -20, hi: 20 },
  business: { lo: -80, hi: 80, fail: 0.03 },
  loan: { lo: 0, hi: 0, inflation: 1 },
  deposit: { lo: 0, hi: 0, inflation: 0.5 },
  fee: { lo: 0, hi: 0 },
}

/** Years a retirement visa's bank deposit stays locked. */
export const RETIRE_DEPOSIT_YEARS = 5

/** Share of a business stake kept when the project collapses. */
export const COLLAPSE_KEEP = 0.4

/** Expected real value of `amount` locked for `years` from `start` (honest: same model as the clock). */
export function expectedLockValue(kind: InvestKind, amount: number, years: number, start: number): number {
  if (kind === 'fee') return 0
  const d = LOCK_DRIFT[kind]
  const mean = (d.lo + d.hi) / 2000
  let v = amount * Math.pow(1 + mean, years)
  if (d.fail) v *= Math.pow(1 - d.fail * (1 - COLLAPSE_KEEP), years)
  if (d.inflation) {
    const erosion = priceLevel(start) / priceLevel(start + years)
    v *= Math.pow(erosion, d.inflation)
  }
  return Math.round(v)
}

const KIND_WORDS: Record<InvestKind, string> = {
  property: 'property',
  fund: 'an investment fund',
  bonds: 'government bonds',
  business: 'a business project',
  loan: 'an interest-free government loan',
  deposit: 'a bank deposit',
  fee: 'a one-off fee',
}

export function investKindWord(kind: InvestKind): string {
  return KIND_WORDS[kind]
}

// ---------------------------------------------------------------------------
// Exit taxes

/** Exit tax for leaving the country you live in (0 when none applies). */
export function exitTaxDue(g: GameState, on: 'leave' | 'renounce' = 'leave', countryId = g.character.countryId): { due: number; name: string } {
  const rule = exitTaxRule(countryId, g.year, on)
  if (!rule) return { due: 0, name: '' }
  const base = Math.max(0, netWorth(g) - real(rule.threshold, g.year))
  return { due: Math.round(base * 0.5 * rule.rate), name: rule.name }
}

// ---------------------------------------------------------------------------
// Evaluation

interface Ctx {
  g: GameState
  year: number
  dest: string
  destName: string
  held: string[]
  passports: string[]
  birth: string
  pass: number
  strict: number
  worth: number
  cash: number
  w: number
  crime: { count: number; serious: boolean }
  excluded: string | null
  transitional: boolean
  sponsor?: SponsorJob | null
}

function makeCtx(g: GameState, dest: string): Ctx {
  const c = g.character
  const held = citizenshipsOf(g)
  const birth = c.birthCountryId || held[0]
  return {
    g,
    year: g.year,
    dest,
    destName: countryName(dest),
    held,
    passports: expandCitizenships(held, g.year),
    birth,
    pass: bestPassport(g).strength,
    strict: strictness(dest, g.year),
    worth: netWorth(g),
    cash: Math.max(0, c.money),
    w: destWealth(dest),
    crime: convictions(g),
    excluded: exclusionFor(dest, birth, g.year),
    transitional: false,
  }
}

function sponsorOf(x: Ctx): SponsorJob | null {
  if (x.sponsor === undefined) x.sponsor = sponsorFor(x.g, x.dest)
  return x.sponsor
}

function base(x: Ctx, id: RouteId, key: string, label: string, emoji: string, proper = false): RouteEval {
  return { key, id, dest: x.dest, label, noun: proper ? label : label.toLowerCase(), emoji, ok: true, why: '', odds: 0, fee: 0, invest: 0, lockYears: 0, proof: 0, wait: 0, result: 'visa', toPr: null, toCitizen: null, notes: [], moves: true }
}

function closed(r: RouteEval, why: string): RouteEval {
  r.ok = false
  r.why = why
  r.odds = 0
  return r
}

function passFactor(x: Ctx, weight: number): number {
  return 1 - weight + weight * (x.pass / 100)
}

function weakPassWait(x: Ctx): number {
  return x.pass < 30 ? 1 : 0
}

function anyOrigin(x: Ctx, list: readonly string[]): string | undefined {
  return [x.birth, ...x.passports].find((id) => list.includes(id))
}

// --- citizens and free movement --------------------------------------------

function citizenRoute(x: Ctx): RouteEval {
  const home = x.g.character.countryId
  const u = unionBetween(home, x.dest, x.year)
  const ownPassport = x.held.includes(x.dest)
  const label = u && !ownPassport ? `Move within ${unionName(u, x.year)}` : ownPassport ? (x.birth === x.dest ? 'Move back home' : `Move as ${an(getCountry(x.dest).demonym)} citizen`) : `Move as a citizen (${unionName(u ?? { id: '', names: [[1900, x.destName]], members: [] }, x.year)})`
  const r = base(x, 'citizen', 'citizen', label, '\u{1F3E0}')
  r.odds = 1
  r.result = 'citizen'
  r.toPr = 0
  r.toCitizen = 0
  r.notes.push(u && !ownPassport ? 'Same country, same passport: no visa needed.' : 'You hold this passport: no visa needed.')
  return r
}

function freeRoutes(x: Ctx, out: RouteEval[]): void {
  const g = x.g
  for (const acc of blocAccess(x.passports, x.dest, x.year)) {
    const b = acc.bloc
    const name = blocName(b, x.year)
    const r = base(x, 'free', `free:${b.id}`, b.kind === 'residence' ? `Residence permit (${name})` : `Free movement (${name})`, b.emoji)
    r.noun = b.kind === 'residence' ? 'residence permit' : 'free-movement residence'
    r.notes.push(b.note)
    if (acc.limitedUntil) {
      x.transitional = true
      out.push(closed(r, `${capital(x.destName)} keeps transitional limits on workers from ${countryName(acc.via)} until ${acc.limitedUntil}. A work visa is easier for you meanwhile.`))
      continue
    }
    r.odds = b.odds
    if (b.id === 'eec' && eduRank(g) < 1 && x.cash < 10_000) {
      r.odds = 0.6
      r.notes.push('Without a diploma or savings, you need to find a job there first.')
    }
    if (b.kind === 'residence') {
      r.visa = 'bloc'
      r.term = 2
      r.toPr = 2
    } else if (['nordic', 'cta', 'commonwealth', 'algeria'].includes(b.id)) {
      r.result = 'permanent'
      r.toPr = 0
    } else if (b.id === 'tasman' && x.dest === 'au') {
      if (x.year < 2001) {
        r.result = 'permanent'
        r.toPr = 0
      } else {
        r.visa = 'tasman'
        r.toPr = x.year >= 2023 ? 4 : null
        if (x.year < 2023) r.notes.push('Since 2001, New Zealanders in Australia live on a special visa with no easy path to citizenship.')
      }
    } else if (b.id === 'tasman') {
      r.result = 'permanent'
      r.toPr = 0
    } else {
      r.visa = 'free'
      r.toPr = b.id === 'gcc' ? null : 5
    }
    out.push(r)
    return
  }
}

function formerRoute(x: Ctx, out: RouteEval[]): void {
  if (x.dest !== x.birth) return
  const oci = x.dest === 'in' && x.year >= 2005
  const r = base(x, 'former', 'former', oci ? 'Overseas Citizen of India card' : 'Return to your birth country', '\u{1F3E1}', oci)
  if (!oci) r.noun = 'returning-resident visa'
  r.odds = 0.9
  r.fee = niceFee(300 * x.w)
  r.result = 'permanent'
  r.toPr = 0
  r.notes.push(oci ? 'A lifelong visa for people of Indian origin who gave up the passport.' : 'Former citizens are let back in to live, and can apply to get the passport back.')
  out.push(r)
}

function specialRoutes(x: Ctx, out: RouteEval[]): void {
  const c = x.g.character
  if ((x.dest === 'us' || x.dest === 'pr') && x.passports.includes('cu') && x.year >= 1966 && x.year <= 2016) {
    const r = base(x, 'asylum', 'cuban', 'Cuban Adjustment Act', '\u{1F6A4}', true)
    r.result = 'asylum'
    r.visa = 'pending'
    r.toPr = 1
    r.odds = x.year >= 1995 ? 0.65 : 0.9
    r.notes.push(x.year >= 1995 ? 'Under "wet foot, dry foot," Cubans who touch US soil can stay and get a green card after a year; those caught at sea are sent back.' : 'Cubans who reach the US can get a green card after a year.')
    out.push(r)
  }
  if (x.dest === 'il' && x.year >= 1950 && c.religion === 'Judaism') {
    const r = base(x, 'return', 'return', 'Law of Return (aliyah)', '\u{2721}\u{FE0F}', true)
    r.odds = 0.98
    r.result = 'citizen'
    r.toPr = 0
    r.toCitizen = 0
    r.notes.push('Israel grants citizenship to Jewish immigrants on arrival.')
    out.push(r)
  }
  if (x.dest === 'gb' && x.year >= 2021 && (x.held.includes('hk') || x.birth === 'hk') && x.year - c.age <= 1997) {
    const r = base(x, 'bno', 'bno', 'British National (Overseas) visa', '\u{1F1EC}\u{1F1E7}', true)
    r.odds = 0.97
    r.fee = niceFee(4_000)
    r.visa = 'bno'
    r.term = 5
    r.toPr = 5
    r.notes.push('Hong Kongers born before the 1997 handover can settle in the UK.')
    out.push(r)
  }
}

// --- historical doors --------------------------------------------------------

function settlerRoutes(x: Ctx, out: RouteEval[]): void {
  for (const p of SETTLER_PROGRAMS) {
    if (p.dest !== x.dest) continue
    if (p.origins && !anyOrigin(x, p.origins)) continue
    const ended = x.year > p.to
    if (x.year < p.from || x.year > p.to + 10) continue
    const r = base(x, 'settler', `settler:${p.id}`, p.name, '\u{1F6A2}', true)
    r.program = p.id
    r.notes.push(p.note)
    if (ended) {
      out.push(closed(r, `This door closed in ${p.to + 1}.`))
      continue
    }
    if (x.excluded) {
      out.push(closed(r, x.excluded))
      continue
    }
    r.odds = 0.9 * passFactor(x, 0.15)
    r.fee = niceFee(real(p.cost, p.from))
    r.result = 'permanent'
    r.toPr = 0
    out.push(r)
  }
  // Before the First World War most countries didn't ask for papers at all.
  if (x.year < 1914 && !out.some((r) => r.id === 'settler' && r.ok)) {
    const r = base(x, 'settler', 'open', 'Just move there (no visa needed yet)', '\u{1F9F3}')
    r.notes.push('Before the First World War, most borders barely checked papers.')
    if (x.excluded) {
      out.push(closed(r, x.excluded))
      return
    }
    r.odds = 0.95
    r.fee = niceFee(real(40, 1905))
    r.result = 'permanent'
    r.toPr = 0
    out.push(r)
  }
}

function quotaRoute(x: Ctx, out: RouteEval[]): void {
  if ((x.dest !== 'us' && x.dest !== 'pr') || x.year < 1924 || x.year > 1965) return
  const cont = continentOf(x.birth)
  const western = cont === 'North America' || cont === 'South America'
  const r = base(x, 'quota', 'quota', western ? 'Immigrant visa (Western Hemisphere)' : 'Immigrant visa (national-origins quota)', '\u{1F5FD}')
  r.result = 'permanent'
  r.toPr = 0
  r.fee = niceFee(300 * x.w)
  if (x.excluded) {
    out.push(closed(r, x.excluded))
    return
  }
  if (western) {
    r.odds = 0.85
    r.notes.push('The Western Hemisphere was exempt from the quotas.')
  } else {
    const def = cont === 'Europe' ? 0.2 : cont === 'Asia' ? 0.02 : cont === 'Oceania' ? 0.3 : 0.05
    r.odds = US_QUOTA_ODDS[x.birth] ?? def
    r.wait = r.odds < 0.1 ? 6 : r.odds < 0.3 ? 3 : 0
    r.notes.push(r.odds < 0.3 ? `The 1924 quotas favored northern and western Europe; ${countryName(x.birth)}'s quota is tiny and oversubscribed.` : 'The 1924 quotas favored northern and western Europe, and your country has plenty of numbers.')
  }
  out.push(r)
}

// --- skilled and unskilled work ---------------------------------------------

function pointsRoute(x: Ctx, out: RouteEval[]): void {
  const sys = pointsSystem(x.dest, x.year)
  if (!sys) return
  const r = base(x, 'points', 'points', sys.name, '\u{1F4CA}', true)
  r.fee = niceFee(2_500 * x.w)
  if (sys.result === 'permanent') {
    r.result = 'permanent'
    r.toPr = 0
  } else {
    r.visa = x.dest === 'de' || x.dest === 'dk' ? 'jobseeker' : 'skilled'
    r.term = r.visa === 'jobseeker' ? 1 : 3
    r.toPr = lawOf(x.dest).pr
  }
  if (x.excluded) {
    out.push(closed(r, x.excluded))
    return
  }
  if (x.g.character.age < 18) {
    out.push(closed(r, 'You must be an adult to apply.'))
    return
  }
  const pts = pointsTest(x.g, x.dest, sys.pass, sponsorOf(x)?.fit ?? 0)
  r.notes.push(`Points: ${pts.total}/${pts.pass} (${pts.lines.join(', ')})`)
  if (r.visa === 'jobseeker') r.notes.push('A one-year visa to find a job; get hired and it turns into a work visa.')
  if (pts.total < pts.pass) {
    out.push(closed(r, `You scored ${pts.total} points; the pass mark is ${pts.pass}. Younger, more educated, more experienced or speaking the language scores higher.`))
    return
  }
  r.odds = 0.9 * passFactor(x, 0.1)
  out.push(r)
}

/** Formal work permits: most countries brought them in around the First World War; US work visas date from 1952. */
const WORK_VISAS_FROM: Record<string, number> = { us: 1952, pr: 1952 }

function workRoute(x: Ctx, out: RouteEval[]): void {
  const g = x.g
  if (x.year < (WORK_VISAS_FROM[x.dest] ?? 1914)) return
  const gulf = ['ae', 'sa', 'qa', 'kw'].includes(x.dest)
  const r = base(x, 'work', 'work', gulf ? 'Sponsored work visa' : 'Skilled work visa', '\u{1F4BC}')
  r.fee = niceFee(3_500 * x.w)
  r.term = 3
  r.visa = 'work'
  const pr = lawOf(x.dest).pr
  r.toPr = pr === null ? null : pr + backlogYears(x.dest, x.birth, x.year)
  if (x.excluded) {
    out.push(closed(r, x.excluded))
    return
  }
  if (g.character.age > 62) {
    out.push(closed(r, 'Employers rarely sponsor work visas for people past 62.'))
    return
  }
  const sponsor = sponsorOf(x)
  if (!sponsor) {
    out.push(closed(r, `No employer would sponsor you: you need at least a ${localTerm(g, 'high')} diploma and a CV that fits a skilled job.`))
    return
  }
  r.sponsor = sponsor
  r.noun = r.label.toLowerCase()
  r.label = `${r.label}: ${sponsor.title}`
  const bar = 32 + x.strict * 45
  let p = 0.04 + 0.9 / (1 + Math.exp(-(sponsor.fit - bar) / 7))
  p *= passFactor(x, 0.35)
  const lang = languageOf(x.dest)
  const speaks = languageLevel(g, lang) >= 2 || (ENGLISH_WORKPLACES.includes(x.dest) && languageLevel(g, 'English') >= 2)
  if (speaks) p *= 1.08
  else r.notes.push(`Learning ${lang} would help.`)
  if ((x.dest === 'us' || x.dest === 'pr') && x.year >= 2008) {
    p *= 0.45
    r.notes.push('H-1B visas are capped and handed out by lottery.')
  }
  if (x.transitional) {
    p = Math.max(p, 0.65)
    r.notes.push('As an EU citizen under transitional rules, you only need a work permit.')
  }
  r.odds = p
  r.wait = weakPassWait(x)
  r.notes.unshift(`Sponsor: ${sponsor.title}, ${formatMoney(sponsor.salary)}/yr (CV fit ${sponsor.fit}%).`)
  if (pr === null) r.notes.push('Renew while employed; no path to permanent residency.')
  out.push(r)
}

function guestRoutes(x: Ctx, out: RouteEval[]): void {
  const c = x.g.character
  for (const p of GUEST_PROGRAMS) {
    if (p.dest !== x.dest) continue
    const end = p.to ?? 9999
    if (x.year < p.from || x.year > end + 8) continue
    const r = base(x, 'guest', `guest:${p.id}`, p.name, '\u{1F3ED}', true)
    r.program = p.id
    r.notes.push(p.note)
    let origin: string | undefined
    if (p.origins === 'poorer') origin = x.passports.find((id) => id !== x.dest && destWealth(id) <= destWealth(x.dest) * 0.6)
    else origin = x.passports.find((id) => (p.origins as [string, number][]).some(([o, y]) => o === id && x.year >= y))
    if (!origin) {
      if (p.origins !== 'poorer' && x.year <= end) out.push(closed(r, `Recruits from ${(p.origins as [string, number][]).map(([o]) => countryName(o)).slice(0, 5).join(', ')} only.`))
      continue
    }
    if (x.year > end) {
      out.push(closed(r, `Recruitment ended in ${end + 1}.`))
      continue
    }
    if (c.age > 45) {
      out.push(closed(r, 'Recruiters only take workers aged 18 to 45.'))
      continue
    }
    if (x.excluded) {
      out.push(closed(r, x.excluded))
      continue
    }
    const def = getJobDef(p.job)
    r.odds = 0.8 * passFactor(x, 0.15)
    r.fee = niceFee(real(p.fee, Math.max(p.from, 1950)))
    r.visa = 'guest'
    r.term = 2
    r.maxYears = p.maxYears
    r.toPr = p.prYears
    if (def) r.sponsor = { defId: def.id, title: def.ladder[0].title, industry: def.industry, salary: Math.max(100, Math.round((def.ladder[0].salary * Math.max(0.25, getCountry(x.dest).wealth)) / 100) * 100), fit: 50 }
    if (p.maxYears) r.notes.push(`At most ${p.maxYears} years.`)
    out.push(r)
  }
}

// --- study, working holidays --------------------------------------------------

function studentRoute(x: Ctx, out: RouteEval[]): void {
  const g = x.g
  const c = g.character
  // Before passports and visas were the norm (the 1920s), students simply went.
  if (c.age > 45 || x.year < 1920) return
  const r = base(x, 'student', 'student', 'Student visa', '\u{1F393}')
  r.visa = 'student'
  r.term = 1
  r.fee = niceFee(600 * x.w)
  r.proof = niceFee((getCountry(x.dest).freeUniversity ? 10_000 : 28_000) * x.w)
  r.notes.push('Enroll at a university there within a year. Part-time work only; a degree there opens a graduate work visa.')
  if (!g.character.education.degrees.some((d) => d.kind === 'highschool' || d.kind === 'ged')) {
    out.push(closed(r, `Universities abroad want a ${localTerm(g, 'high')} diploma first.`))
    return
  }
  if (c.age > 40) {
    out.push(closed(r, 'Student visas are for people under 40.'))
    return
  }
  const uni = cvScore(g, { kind: 'university' }).score
  r.odds = (0.35 + (0.35 * uni) / 100 + (0.25 * c.stats.smarts) / 100) * (1 - 0.35 * x.strict) * passFactor(x, 0.3)
  r.wait = weakPassWait(x)
  out.push(r)
}

function whvRoute(x: Ctx, out: RouteEval[]): void {
  const c = x.g.character
  const p = WORKING_HOLIDAYS.find((w) => w.dest === x.dest && x.year >= w.from)
  if (!p || c.age > 40) return
  const r = base(x, 'whv', 'whv', 'Working holiday visa', '\u{1F392}')
  r.visa = 'whv'
  r.term = p.years
  r.maxYears = p.years
  r.fee = 400
  r.notes.push(`Work and travel for ${p.years === 1 ? 'a year' : `${p.years} years`}; an employer who keeps you can switch you to a work visa.`)
  const rich = x.passports.some((id) => id !== x.dest && destWealth(id) >= 0.6) && x.pass >= 80
  if (!rich) {
    out.push(closed(r, 'Only for passports from partner countries (mostly rich ones).'))
    return
  }
  if (c.age > p.maxAge) {
    out.push(closed(r, `Only for people aged 18 to ${p.maxAge}.`))
    return
  }
  if (immState(x.g).whvUsed.includes(x.dest)) {
    out.push(closed(r, 'You already used your working holiday here.'))
    return
  }
  r.odds = x.dest === 'gb' && x.passports.some((id) => ['jp', 'kr', 'tw', 'hk'].includes(id)) ? 0.35 : 0.92
  out.push(r)
}

// --- family ------------------------------------------------------------------

function citizenOfDest(x: Ctx, p: Person): boolean {
  return expandCitizenships(personCitizenships(x.g, p), x.year).includes(x.dest)
}

function spouseRoute(x: Ctx, out: RouteEval[]): void {
  const g = x.g
  const partner = currentPartner(g)
  const fiance = ['us', 'pr', 'gb', 'au', 'nz', 'ie', 'ca'].includes(x.dest)
  const r = base(x, 'spouse', 'spouse', 'Spouse visa', '\u{1F48D}')
  r.fee = niceFee(2_500 * x.w)
  r.wait = (['us', 'pr', 'gb', 'ca', 'au', 'nz', 'ie'].includes(x.dest) ? 1 : 0) + weakPassWait(x)
  if (!partner || !citizenOfDest(x, partner)) {
    out.push(closed(r, partner ? `${partner.firstName} isn't a citizen of ${x.destName}.` : `Marry a citizen of ${x.destName} and they can sponsor you.`))
    return
  }
  if (partner.relation === 'partner' || (partner.relation === 'fiance' && !fiance)) {
    out.push(closed(r, `Only a husband or wife${fiance ? ' (or fiancé)' : ''} can sponsor you. Put a ring on it.`))
    return
  }
  if (partner.relation === 'fiance') {
    r.label = 'Fiancé(e) visa'
    r.noun = 'fiancé(e) visa'
    r.visa = 'fiance'
    r.term = 1
    r.toPr = 2
    r.notes.push('Marry within a year of arriving and it becomes a spouse visa.')
  } else if (['us', 'pr', 'ca', 'nz'].includes(x.dest)) {
    r.result = 'permanent'
    r.toPr = 0
  } else {
    r.visa = 'spouse'
    r.term = 2
    const pr = lawOf(x.dest).pr
    r.toPr = pr === null ? (x.dest === 'il' ? 4 : null) : Math.min(pr, 3)
  }
  r.notes.unshift(`Sponsor: your ${partner.relation === 'fiance' ? 'fiancé(e)' : 'spouse'} ${partner.firstName}.`)
  let p = 0.9
  if (partner.yearsKnown < 2 && partner.relationship < 50) {
    p = 0.55
    r.notes.push('Officials will grill you about whether this marriage is real.')
  }
  r.odds = p * passFactor(x, 0.15)
  out.push(r)
}

function familyRoute(x: Ctx, out: RouteEval[]): void {
  const g = x.g
  const lives = (p: Person) => p.alive && p.data.countryId === x.dest && citizenOfDest(x, p)
  const us = x.dest === 'us' || x.dest === 'pr'
  const kid = g.people.find((p) => (p.relation === 'child' || p.relation === 'stepchild') && p.age >= (us ? 21 : 18) && lives(p))
  const parent = g.people.find((p) => (p.relation === 'parent' || p.relation === 'stepparent') && lives(p))
  const sib = us ? g.people.find((p) => (p.relation === 'sibling' || p.relation === 'halfSibling') && lives(p)) : undefined
  const who = kid ?? parent ?? sib
  if (!who) return
  const r = base(x, 'family', 'family', kid ? 'Parent of a citizen' : parent ? 'Family reunification' : 'Sibling of a citizen', '\u{1F46A}')
  r.noun = kid ? 'parent visa' : parent ? 'family reunification visa' : 'sibling visa'
  r.fee = niceFee(2_000 * x.w)
  r.notes.push(`Sponsor: your ${kid ? (kid.gender === 'male' ? 'son' : 'daughter') : parent ? (parent.gender === 'male' ? 'father' : 'mother') : 'sibling'} ${who.firstName}.`)
  const backlog = backlogYears(x.dest, x.birth, x.year)
  if (kid) {
    if (us) {
      r.odds = 0.9
      r.wait = 1
      r.result = 'permanent'
      r.toPr = 0
    } else if (x.dest === 'ca') {
      r.odds = x.year >= 2017 ? 0.35 : 0.8
      r.wait = x.year >= 2017 ? 2 : 3
      r.result = 'permanent'
      r.toPr = 0
      if (x.year >= 2017) r.notes.push('Canada picks parent sponsorships by lottery.')
    } else if (x.dest === 'au') {
      r.odds = 0.9
      r.wait = 3
      r.fee = niceFee(40_000)
      r.result = 'permanent'
      r.toPr = 0
      r.notes.push('The contributory parent visa costs a fortune but skips the decades-long queue.')
    } else {
      r.odds = 0.5
      r.wait = 2
      r.visa = 'family'
      r.term = 2
      r.toPr = lawOf(x.dest).pr
    }
  } else if (parent) {
    r.odds = us ? 0.85 : 0.35
    r.wait = us ? 7 + backlog : 2
    r.result = us ? 'permanent' : 'visa'
    r.visa = us ? undefined : 'family'
    r.term = us ? undefined : 2
    r.toPr = us ? 0 : lawOf(x.dest).pr
  } else {
    r.odds = 0.85
    r.wait = 12 + backlog
    r.result = 'permanent'
    r.toPr = 0
    r.notes.push('The sibling category has one of the longest queues in the world.')
  }
  r.wait += weakPassWait(x)
  r.odds *= passFactor(x, 0.15)
  out.push(r)
}

// --- money: investors, retirees, remote workers -------------------------------

export function investorTier(p: InvestorProgram, year: number): number {
  let amt = p.tiers[0].invest
  for (const t of p.tiers) if (year >= t.from) amt = t.invest
  return amt
}

function investorRoutes(x: Ctx, out: RouteEval[]): void {
  for (const p of INVESTOR_PROGRAMS) {
    if (p.dest !== x.dest || x.year < p.from) continue
    const end = p.to ?? 9999
    if (x.year > end + 12) continue
    const r = base(x, 'investor', `investor:${p.id}`, p.name, p.emoji, true)
    r.program = p.id
    r.notes.push(p.note)
    if (x.year > end) {
      out.push(closed(r, `The program closed in ${end + 1}.`))
      continue
    }
    const amount = programMoney(investorTier(p, x.year), x.year)
    r.invest = amount
    r.investKind = p.kind
    r.lockYears = p.lock
    // Fees track inflation (they're written in today's dollars).
    r.fee = niceFee(p.fee)
    r.result = p.result
    r.toPr = p.result === 'visa' ? (p.prYears === undefined ? lawOf(x.dest).pr : p.prYears) : 0
    if (p.result === 'citizen') r.toCitizen = 0
    if (p.result === 'visa') {
      r.visa = 'investor'
      r.term = 5
    }
    r.wait = (p.wait ?? 0) + Math.max(0, ...(p.backlog ?? []).filter(([o, y]) => o === x.birth && x.year >= y).map(([, , n]) => n))
    const need = niceFee(amount * p.worth)
    if (x.worth < need) {
      out.push(closed(r, `Needs a net worth of at least ${formatMoney(need)} (yours: ${formatMoney(Math.max(0, x.worth))}).`))
      continue
    }
    if (x.cash < amount + r.fee) {
      out.push(closed(r, `Needs ${formatMoney(amount + r.fee)} in cash for the investment and fees.`))
      continue
    }
    if (p.result === 'citizen' && x.crime.count > 0) {
      out.push(closed(r, 'Passport-for-money programs reject anyone with a criminal record.'))
      continue
    }
    r.odds = 0.95 * passFactor(x, 0.1)
    out.push(r)
  }
}

function retireRoutes(x: Ctx, out: RouteEval[]): void {
  const c = x.g.character
  for (const p of RETIRE_PROGRAMS) {
    if (p.dest !== x.dest || x.year < p.from) continue
    const end = p.to ?? 9999
    if (x.year > end + 10) continue
    if (c.age < Math.min(p.minAge, 40) && !c.retired) continue
    const r = base(x, 'retire', `retire:${p.id}`, p.name, '\u{1F3D6}\u{FE0F}', true)
    r.program = p.id
    r.notes.push(p.note, 'No local job allowed.')
    if (x.year > end) {
      out.push(closed(r, `The program closed in ${end + 1}.`))
      continue
    }
    const income = programMoney(p.income, x.year)
    r.fee = niceFee(1_500 * x.w)
    r.result = p.result
    r.visa = p.result === 'visa' ? 'retire' : undefined
    r.term = p.result === 'visa' ? 1 : undefined
    r.toPr = p.result === 'permanent' ? 0 : (p.prYears ?? null)
    if (p.deposit) {
      r.invest = programMoney(p.deposit, x.year)
      r.investKind = 'deposit'
      r.lockYears = RETIRE_DEPOSIT_YEARS
    }
    if (c.age < p.minAge) {
      out.push(closed(r, `Only for people ${p.minAge} and older.`))
      continue
    }
    if (c.pension < income && x.worth < income * 15) {
      if (c.age >= 45 || c.retired) out.push(closed(r, `Needs a pension of ${formatMoney(income)}/yr, or savings of ${formatMoney(income * 15)} to live on.`))
      continue
    }
    if (x.cash < r.invest + r.fee) {
      out.push(closed(r, `Needs ${formatMoney(r.invest + r.fee)} in cash for the deposit and fees.`))
      continue
    }
    r.odds = 0.9 * passFactor(x, 0.1)
    out.push(r)
  }
}

export function remoteJobIncome(g: GameState): number {
  const j = g.character.job
  if (!j || j.category !== 'fulltime') return 0
  const ind = typeof j.data.industry === 'string' ? j.data.industry : getJobDef(j.defId)?.industry ?? ''
  return REMOTE_INDUSTRIES.includes(ind) ? j.salary : 0
}

function remoteRoutes(x: Ctx, out: RouteEval[]): void {
  for (const p of REMOTE_PROGRAMS) {
    if (p.dest !== x.dest || x.year < p.from) continue
    const r = base(x, 'remote', `remote:${p.id}`, p.name, '\u{1F4BB}', true)
    r.program = p.id
    r.visa = 'remote'
    r.term = p.term
    r.maxYears = p.maxYears
    r.toPr = p.prYears ?? null
    r.keepJob = true
    r.fee = niceFee(800 * x.w)
    r.notes.push('Keep your remote job and live there.', p.maxYears ? `At most ${p.maxYears === 1 ? 'one year' : `${p.maxYears} years`}.` : 'Renewable.')
    const need = programMoney(p.income, x.year)
    const have = remoteJobIncome(x.g)
    if (have < need) {
      out.push(closed(r, have > 0 ? `Your remote job pays ${formatMoney(have)}; it needs ${formatMoney(need)}/yr.` : `Needs a remote-friendly job (tech, office, finance, design...) paying ${formatMoney(need)}/yr.`))
      continue
    }
    r.odds = 0.9 * passFactor(x, 0.1)
    out.push(r)
  }
}

// --- refuge and luck -----------------------------------------------------------

function asylumRoute(x: Ctx, out: RouteEval[]): void {
  const g = x.g
  const home = g.character.countryId
  const fleeing = [home, ...x.held].map((id) => ({ id, crisis: crisisIn(id, x.year) })).find((f) => f.crisis && f.id !== x.dest)
  if (!fleeing || !fleeing.crisis) return
  const r = base(x, 'asylum', 'asylum', 'Claim asylum', '\u{1F54A}\u{FE0F}')
  r.noun = 'asylum claim'
  r.result = 'asylum'
  r.visa = 'pending'
  r.notes.push(`You'd be fleeing ${fleeing.crisis.label} in ${countryName(fleeing.id)}.`)
  const gen = asylumGenerosity(x.dest, x.year)
  if (gen === null) {
    out.push(closed(r, `${capital(x.destName)} doesn't take in refugees.`))
    return
  }
  const euProtection = fleeing.id === 'ua' && x.year >= 2022 && blocAccess(['de'], x.dest, x.year).some((a) => a.bloc.id === 'eu')
  if (euProtection) {
    r.label = 'Temporary protection'
    r.noun = 'temporary protection'
    r.odds = 0.98
    r.visa = 'protection'
    r.toPr = 5
    r.notes.push('The EU grants Ukrainians protection on arrival.')
  } else {
    // Claims from the worst wars almost always succeed where there's a working asylum system.
    const sev = fleeing.crisis.severity === 3 ? 1.6 : fleeing.crisis.severity === 2 ? 0.9 : 0.4
    r.odds = Math.max(0.02, Math.min(0.95, gen * sev))
    r.wait = 0
    r.toPr = Math.min(lawOf(x.dest).pr ?? 5, 5)
    r.notes.push('You move now and wait in the country for the decision (a year or two).')
  }
  out.push(r)
}

function lotteryRoutes(x: Ctx, out: RouteEval[]): void {
  const c = x.g.character
  for (const p of LOTTERIES) {
    if (p.dest !== x.dest || x.year < p.from || (p.to !== undefined && x.year > p.to)) continue
    const r = base(x, 'lottery', `lottery:${p.id}`, p.name, '\u{1F3B0}', true)
    r.program = p.id
    r.result = 'permanent'
    r.toPr = 0
    r.wait = 1
    r.moves = false
    r.notes.push(p.note, 'The draw is next year; winners get permanent residence.')
    if (p.origins && !anyOrigin(x, p.origins)) continue
    const banned = (p.excluded ?? []).find(([o, from, to]) => o === x.birth && x.year >= from && x.year <= to)
    if (banned) {
      out.push(closed(r, `People born in ${countryName(x.birth)} can't enter: too many came recently.`))
      continue
    }
    if (p.diploma && eduRank(x.g) < 1) {
      out.push(closed(r, `Entrants need a ${localTerm(x.g, 'high')} diploma.`))
      continue
    }
    if ((p.minAge && c.age < p.minAge) || (p.maxAge && c.age > p.maxAge)) {
      out.push(closed(r, `Only for people aged ${p.minAge ?? 18} to ${p.maxAge ?? 99}.`))
      continue
    }
    if (immState(x.g).apps.some((a) => a.key === r.key && a.dest === x.dest)) {
      out.push(closed(r, "You're already in the draw."))
      continue
    }
    r.odds = p.odds
    out.push(r)
  }
}

// ---------------------------------------------------------------------------
// Putting it together

const DISCRETIONARY: RouteId[] = ['settler', 'quota', 'points', 'work', 'guest', 'student', 'whv', 'family', 'investor', 'retire', 'remote', 'lottery', 'bno']

function finalize(x: Ctx, routes: RouteEval[]): RouteEval[] {
  const g = x.g
  const home = g.character.countryId
  const regime = exitRegime(home, x.year)
  const permit = hasExitPermit(g)
  const window = regime ? exitWindow(regime, x.year) : null
  const banned = isBanned(g, x.dest)
  const soldier = g.character.job?.category === 'military'
  for (const r of routes) {
    if (!r.ok) continue
    if (soldier) {
      closed(r, "You're serving in the military. Leave the service first: desertion isn't a great look on an application.")
      continue
    }
    if (r.id !== 'citizen') {
      if (regime && !permit && !unionBetween(home, x.dest, x.year)) {
        closed(r, `${capital(regime.name)} won't let you leave without an exit visa.${window && window.note ? ` ${window.note}` : ''}`)
        continue
      }
      if (banned) {
        closed(r, `You're banned from ${x.destName} until ${banned + 1}.`)
        continue
      }
    }
    const era = eraFactor(x.dest, x.year, r.id)
    if (era.f < 1) {
      r.odds *= era.f
      if (era.note) r.notes.push(era.note)
    }
    if (x.crime.serious && DISCRETIONARY.includes(r.id)) {
      closed(r, 'Your criminal record rules this out.')
      continue
    }
    if (x.crime.count > 0) {
      if (DISCRETIONARY.includes(r.id)) r.odds *= 0.6
      else if (r.id === 'spouse') r.odds *= x.crime.serious ? 0.4 : 0.75
      else if (r.id === 'asylum') r.odds *= x.crime.serious ? 0.5 : 0.85
    }
    r.odds = r.id === 'citizen' ? 1 : Math.max(0.01, Math.min(0.99, r.odds))
  }
  for (const r of routes) r.toCitizen = r.toCitizen ?? citizenYears(x, r)
  return routes.sort((a, b) => Number(b.ok) - Number(a.ok) || b.odds - a.odds || a.wait - b.wait || a.fee + a.invest - (b.fee + b.invest))
}

function capital(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

/** Naturalization years for this person in `dest` (spouses of citizens and Ibero-Americans in Spain go faster). */
export function natzYearsFor(g: GameState, dest: string, year = g.year): number | null {
  const base0 = naturalizeYears(dest, year)
  if (base0 === null) return null
  let n = base0
  const partner = currentPartner(g)
  if (partner && partner.relation === 'spouse' && expandCitizenships(personCitizenships(g, partner), year).includes(dest)) n = dest === 'us' || dest === 'pr' ? Math.min(n, 3) : Math.max(2, n - 2)
  const held = citizenshipsOf(g)
  if (dest === 'es' && held.some((id) => ['ar', 'bo', 'br', 'cl', 'co', 'cr', 'cu', 'do', 'ec', 'sv', 'gt', 'mx', 'ni', 'pa', 'py', 'pe', 'pr', 'uy', 've', 'ph', 'ad', 'pt'].includes(id))) n = Math.min(n, 2)
  if (dest === 'br' && held.some((id) => ['pt', 'ao'].includes(id))) n = Math.min(n, 1)
  if (dest === 'pt' && held.some((id) => ['br', 'ao'].includes(id))) n = Math.min(n, 3)
  return n
}

function citizenYears(x: Ctx, r: RouteEval): number | null {
  if (r.result === 'citizen') return 0
  if (r.toPr === null) return null
  const n = natzYearsFor(x.g, x.dest)
  if (n === null) return null
  return lawOf(x.dest).natzFrom === 'pr' ? r.toPr + n : Math.max(n, r.toPr)
}

const BUILDERS: [string[], (x: Ctx, out: RouteEval[]) => void][] = [
  [['free'], freeRoutes],
  [['former'], formerRoute],
  [['return', 'bno', 'cuban'], specialRoutes],
  [['settler', 'open'], settlerRoutes],
  [['quota'], quotaRoute],
  [['points'], pointsRoute],
  [['work'], workRoute],
  [['guest'], guestRoutes],
  [['student'], studentRoute],
  [['whv'], whvRoute],
  [['spouse'], spouseRoute],
  [['family'], familyRoute],
  [['investor'], investorRoutes],
  [['retire'], retireRoutes],
  [['remote'], remoteRoutes],
  [['asylum'], asylumRoute],
  [['lottery'], lotteryRoutes],
]

/**
 * Every route into `dest` for this character this year, open ones first (best odds first).
 * `onlyKey` evaluates just the family that route key belongs to (cheaper for one lookup).
 */
export function routesTo(g: GameState, dest: string, onlyKey?: string): RouteEval[] {
  if (dest === g.character.countryId) return []
  const x = makeCtx(g, dest)
  if (isCitizenOf(g, dest)) return finalize(x, [citizenRoute(x)])
  const head = onlyKey ? onlyKey.split(':')[0] : ''
  const out: RouteEval[] = []
  for (const [ids, build] of BUILDERS) {
    // The work route reads the free-movement transitional rules.
    if (head && !ids.includes(head) && !(head === 'work' && ids.includes('free'))) continue
    build(x, out)
  }
  return finalize(x, out)
}

export function bestRoute(routes: RouteEval[]): RouteEval | null {
  return routes.find((r) => r.ok) ?? null
}

export function findRoute(g: GameState, dest: string, key: string): RouteEval | null {
  return routesTo(g, dest, key).find((r) => r.key === key) ?? null
}

// ---------------------------------------------------------------------------
// Purple hints (honest: the same numbers the resolvers use)

function prPhrase(r: RouteEval): string {
  if (r.result === 'citizen') return 'a passport on arrival'
  if (r.toPr === 0) return 'permanent residency on arrival'
  if (r.toPr === null) return 'no path to permanent residency'
  return `permanent residency in about ${r.toPr} year${r.toPr === 1 ? '' : 's'}`
}

/** Business talent: which open route into this country is the smartest bet. */
export function bestRouteHint(g: GameState, routes: RouteEval[]): string {
  if (!hasTalent(g, 'Business')) return ''
  const open = routes.filter((r) => r.ok)
  if (!open.length) return ''
  const score = (r: RouteEval) => r.odds * 100 - r.wait * 6 - (r.toPr === null ? 15 : r.toPr) * 2 - (r.fee + r.invest) / 50_000
  const best = [...open].sort((a, b) => score(b) - score(a))[0]
  return talentHint(g, 'Business', `Smartest route: ${best.label} (${pct(best.odds)} odds, ${prPhrase(best)}).`)
}

/** Investing talent: what a locked golden-visa stake is likely to be worth when it unlocks. */
export function investHint(g: GameState, r: RouteEval): string {
  if (!r.investKind || r.invest <= 0) return ''
  return lockHint(g, r.investKind, r.invest, r.lockYears)
}

/** Investing talent: what `amount` locked in `kind` for `years` is likely to be worth (same model as the clock). */
export function lockHint(g: GameState, kind: InvestKind, amount: number, years: number): string {
  if (amount <= 0 || !hasTalent(g, 'Investing')) return ''
  if (kind === 'fee') return talentHint(g, 'Investing', `That ${formatMoney(amount)} is a price, not an investment: you never see it again.`)
  const back = expectedLockValue(kind, amount, years, g.year)
  const change = back / amount - 1
  const why =
    kind === 'loan' || kind === 'deposit'
      ? 'the same sum comes back, minus what inflation eats'
      : kind === 'bonds'
        ? 'bonds roughly keep pace with inflation'
        : kind === 'business'
          ? 'with a real chance the project goes bust'
          : kind === 'fund'
            ? 'with big swings either way'
            : 'property tends to hold its value'
  return talentHint(g, 'Investing', `Expect about ${formatMoney(back)} back after ${years} year${years === 1 ? '' : 's'} (${change >= 0 ? '+' : ''}${Math.round(change * 100)}% in today's money): ${why}.`)
}

export function oddsText(r: RouteEval): string {
  return pct(r.odds)
}
