// Shared plumbing for every sports career (team, individual, combat, esports, entertainment):
// the sports profile (medals, sponsors, head trauma, anti-doping bans, retired careers, trophy
// cabinet), local popularity, fees parents pay for kids, the Olympic calendar, endorsements and
// the long-term brain-injury risk of contact sports.
import { anachronistic } from '../events/era'
import { personCash } from '../cash'
import { typicalIncome } from '../events/wealth-core'
import { allBrands, type Brand } from '../data/brands'
import { brandPool, pickBrand } from '../shops/everyday-brands'
import { addHidden, addStat, count, earnIncome, log, remember, scriptChoice, spend, useYearAction } from '../core'
import { addCvEntry } from '../cv'
import { localeOf } from '../data/locales'
import { chance, pick, rand, randInt, uid } from '../rng'
import { pickLine } from '../text/pick'
import { stateLine } from '../text/state'
import { logStateLine } from '../text/state-log'
import { defineScript } from '../scripts'
import type { Condition, CvEntry, GameState, Gender, Job, Json, MenuGroup, MenuNode } from '../types'
import { COUNTRIES, flagEmoji, getCountry, randomFirstName, randomLastName } from '../world'
import { addFame, blocked, clamp100, money, peek, prof, say, short, tell } from './common'

// ---------------------------------------------------------------------------
// The sports profile (persists across careers; survives quitting)

export type SportKind = 'team' | 'individual' | 'combat' | 'esports' | 'entertainment'
export type MedalKind = 'gold' | 'silver' | 'bronze'

export interface MedalRec {
  year: number
  games: string
  sport: string
  medal: MedalKind
}

export interface SponsorDeal {
  brand: string
  product: string
  yearly: number
  yearsLeft: number
  sinceAge: number
}

export interface CareerLine {
  sport: string
  kind: SportKind
  from: number
  to: number
  best: string
  legacy: number
}

export interface SportsProfile {
  medals: MedalRec[]
  games: number[]
  sponsors: SponsorDeal[]
  headTrauma: number
  concussions: number
  brainWarned: number
  cte: boolean
  bannedUntil: number
  banReason: string
  careers: CareerLine[]
  legacy: number
  halls: string[]
  honors: string[]
  /** Recent success (0-40) that makes brands call; fades every year. */
  buzz: number
  lastActiveAge: number
}

const initSports = (): SportsProfile => ({
  medals: [],
  games: [],
  sponsors: [],
  headTrauma: 0,
  concussions: 0,
  brainWarned: 0,
  cte: false,
  bannedUntil: -1,
  banReason: '',
  careers: [],
  legacy: 0,
  halls: [],
  honors: [],
  buzz: 0,
  lastActiveAge: -1,
})

function sportsNumber(value: unknown, fallback = 0, lo = 0, hi = 1e12): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(lo, Math.min(hi, Math.round(value))) : fallback
}

function sportsDecimal(value: unknown, fallback = 0, lo = 0, hi = 1e12): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(lo, Math.min(hi, value)) : fallback
}

function sportsText(value: unknown, fallback = '', max = 120): string {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, max) || fallback : fallback
}

function normalizedSports(value: unknown): SportsProfile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return initSports()
  const raw = value as Partial<SportsProfile>
  const medals: MedalRec[] = []
  if (Array.isArray(raw.medals)) for (const value of raw.medals.slice(-256)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue
    const medal = value as Partial<MedalRec>
    if (medal.medal !== 'gold' && medal.medal !== 'silver' && medal.medal !== 'bronze') continue
    medals.push({ year: sportsNumber(medal.year, 0, -10_000, 100_000), games: sportsText(medal.games, 'Games'), sport: sportsText(medal.sport, 'Sport'), medal: medal.medal })
  }
  const sponsors: SponsorDeal[] = []
  if (Array.isArray(raw.sponsors)) for (const value of raw.sponsors.slice(-128)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue
    const deal = value as Partial<SponsorDeal>
    sponsors.push({
      brand: sportsText(deal.brand, 'Sponsor', 80),
      product: sportsText(deal.product, 'endorsement', 80),
      yearly: sportsNumber(deal.yearly),
      yearsLeft: sportsNumber(deal.yearsLeft, 0, 0, 100),
      sinceAge: sportsNumber(deal.sinceAge, 0, 0, 10_000),
    })
  }
  const careers: CareerLine[] = []
  if (Array.isArray(raw.careers)) for (const value of raw.careers.slice(-64)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue
    const career = value as Partial<CareerLine>
    const kind: SportKind = career.kind === 'individual' || career.kind === 'combat' || career.kind === 'esports' || career.kind === 'entertainment' ? career.kind : 'team'
    const from = sportsNumber(career.from, 0, 0, 10_000)
    careers.push({ sport: sportsText(career.sport, 'Sport'), kind, from, to: sportsNumber(career.to, from, from, 10_000), best: sportsText(career.best, ''), legacy: sportsNumber(career.legacy, 0, 0, 100) })
  }
  const strings = (input: unknown): string[] => Array.isArray(input)
    ? [...new Set(input.filter((x): x is string => typeof x === 'string').map((x) => sportsText(x)).filter(Boolean))].slice(-256)
    : []
  return {
    medals,
    games: Array.isArray(raw.games) ? [...new Set(raw.games.filter((x): x is number => typeof x === 'number' && Number.isFinite(x)).map((x) => sportsNumber(x, 0, -10_000, 100_000)))].slice(-256) : [],
    sponsors,
    headTrauma: Math.round(sportsDecimal(raw.headTrauma, 0, 0, 1e6) * 10) / 10,
    concussions: sportsNumber(raw.concussions, 0, 0, 1e6),
    brainWarned: sportsNumber(raw.brainWarned, 0, 0, 1e6),
    cte: raw.cte === true,
    bannedUntil: sportsNumber(raw.bannedUntil, -1, -1, 10_000),
    banReason: sportsText(raw.banReason),
    careers,
    legacy: sportsNumber(raw.legacy, 0, 0, 100),
    halls: strings(raw.halls),
    honors: strings(raw.honors),
    buzz: sportsNumber(raw.buzz, 0, 0, 40),
    lastActiveAge: sportsNumber(raw.lastActiveAge, -1, -1, 10_000),
  }
}

/** Mutable sports profile (actions and hooks only). */
export function sportsProfile(g: GameState): SportsProfile {
  const p = prof(g, 'sports', initSports)
  Object.assign(p, normalizedSports(p))
  return p
}

/** Read-only view (menus). */
export function viewSports(g: GameState): SportsProfile {
  return normalizedSports(peek<SportsProfile>(g, 'sports'))
}

// ---------------------------------------------------------------------------
// Jobs

/** True for any sports job (team athlete, individual, fighter, sumo, wrestler, esports, coach...). */
export function isSportsJob(job: Job | null | undefined): boolean {
  return !!job && job.category === 'special' && (job.defId === 'athlete' || job.defId.startsWith('sports.'))
}

/** The player's current playing career (not coaching or commentary). */
export function playingJob(g: GameState): Job | null {
  const j = g.character.job
  return isSportsJob(j) && j!.defId !== 'sports.coach' && j!.defId !== 'sports.pundit' ? j : null
}

/** Reason a new sports career can't start (dead, prison, age, anti-doping ban), or null. */
export function sportsGate(g: GameState, minAge: number): string | null {
  return blocked(g, minAge) ?? banReason(g)
}

// ---------------------------------------------------------------------------
// Where you live: popularity, money, climate, coastline

export function countryName(g: GameState): string {
  return getCountry(g.character.countryId).name
}

/** "Team Brazil". */
export function nationalTeam(g: GameState): string {
  return `Team ${countryName(g)}`
}

/** Cost of living / pay scale relative to the US, clamped for sports money. */
export function wealth(g: GameState): number {
  const w = getCountry(g.character.countryId).wealth
  return Math.max(0.25, Math.min(1.5, typeof w === 'number' && Number.isFinite(w) ? w : 1))
}

function niceRound(n: number): number {
  const a = Math.abs(n)
  const step = a < 100 ? 5 : a < 1_000 ? 10 : a < 10_000 ? 50 : a < 100_000 ? 500 : a < 1_000_000 ? 1_000 : 10_000
  return Math.max(step, Math.round(n / step) * step)
}

/** A US-dollar fee adjusted to local prices (lessons, gym memberships, academies). */
export function localFee(g: GameState, usd: number): number {
  return niceRound(usd * Math.max(0.35, Math.min(1.6, wealth(g))))
}

/** Round prize money and purses to tidy amounts. */
export function tidy(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0
  return n < 1_000 ? Math.round(n / 10) * 10 : n < 100_000 ? Math.round(n / 100) * 100 : Math.round(n / 1_000) * 1_000
}

/** Index of a sport in the local "most popular" list (0 = the national obsession), or -1. */
export function popularity(g: GameState, re: RegExp, countryId = g.character.countryId): number {
  return localeOf(countryId).sports.findIndex((s) => re.test(s))
}

export function isPopular(g: GameState, re: RegExp): boolean {
  return popularity(g, re) >= 0
}

/** Subtitle fragment for sports that are big where you live. */
export function popularTag(g: GameState, re: RegExp): string {
  const i = popularity(g, re)
  if (i < 0) return ''
  return i === 0 ? `The national obsession in ${countryName(g)}` : `Popular in ${countryName(g)}`
}

/** Local favourite sports, as written ('football', 'cricket'...). */
export function localSportNames(g: GameState): string[] {
  return localeOf(g.character.countryId).sports
}

export function hasSnowHere(g: GameState): boolean {
  return localeOf(g.character.countryId).snow
}

const LANDLOCKED = new Set(['bo', 'py', 'ad', 'at', 'cz', 'hu', 'rs', 'sk', 'ch', 'et', 'ug', 'zw', 'af', 'kz', 'mn', 'np'])

export function hasCoast(g: GameState): boolean {
  return !LANDLOCKED.has(g.character.countryId)
}

/** Proper ice rinks: snowy countries, rich countries and big cold-weather cities. */
export function hasRink(g: GameState): boolean {
  return hasSnowHere(g) || wealth(g) >= 0.85
}

// ---------------------------------------------------------------------------
// Fees (parents pay for kids)

export type Payer = 'self' | 'parent' | 'free'

/** Pay a fee. Minors' parents cover it when they can. Returns null (nothing spent) if nobody can. */
export function payFee(g: GameState, cost: number): Payer | null {
  if (cost <= 0) return 'free'
  if (g.character.age < 18) {
    const parent = g.people
      .filter((p) => p.alive && (p.relation === 'parent' || p.relation === 'stepparent') && p.money >= cost)
      .sort((a, b) => b.relationship - a.relationship)[0]
    if (parent) {
      // The parent's cash keeps the rounding and the floor this line always had; the books follow what it lost.
      personCash(g, parent, Math.max(0, Math.round(parent.money - cost)) - parent.money, 'purchase', 0)
      return 'parent'
    }
  }
  return spend(g, cost, 'purchase') ? 'self' : null
}

export function payerNote(p: Payer | null): string {
  return p === 'parent' ? ' Your parents paid.' : ''
}

// ---------------------------------------------------------------------------
// Olympic calendar

export type GamesSeason = 'summer' | 'winter'

/** Summer Games in years divisible by 4, Winter Games two years later. */
export function gamesSeason(year: number): GamesSeason | null {
  if (year % 4 === 0) return 'summer'
  if (year % 4 === 2) return 'winter'
  return null
}

export function nextGamesYear(year: number, season: GamesSeason): number {
  for (let y = year; y < year + 5; y++) if (gamesSeason(y) === season) return y
  return year + 4
}

const SUMMER_HOSTS = ['Lisbon', 'Osaka', 'Cape Town', 'Melbourne', 'Buenos Aires', 'Istanbul', 'Toronto', 'Mumbai', 'Copenhagen', 'Seoul', 'Mexico City', 'Doha', 'Rotterdam', 'Jakarta', 'Nairobi']
const WINTER_HOSTS = ['Innsbruck', 'Sapporo', 'Lillehammer', 'Calgary', 'Chamonix', 'Almaty', 'Salt Lake City', 'Cortina', 'Pyeongchang', 'Oslo', 'Vancouver', 'Zakopane']

export function gamesHost(year: number): string {
  const s = gamesSeason(year)
  const list = s === 'winter' ? WINTER_HOSTS : SUMMER_HOSTS
  return list[Math.abs(Math.floor(year / 4)) % list.length]
}

export function gamesName(year: number): string {
  return `${gamesHost(year)} ${year} ${gamesSeason(year) === 'winter' ? 'Winter' : 'Summer'} Olympics`
}

// ---------------------------------------------------------------------------
// Trophy cabinet & CV

/**
 * Record an achievement: trophy cabinet line, a memory, and (when `cvTitle` is given)
 * an Awards entry on the CV. Repeat wins of the same honor update one CV line instead of
 * adding a new one each year.
 */
export function honor(g: GameState, line: string, cvTitle?: string, org = '', strength = 6): void {
  const p = sportsProfile(g)
  p.honors.push(`${line} (age ${g.character.age})`)
  if (p.honors.length > 40) p.honors.splice(0, p.honors.length - 40)
  remember(g, line)
  if (!cvTitle) return
  const cv = g.character.cv
  const existing = Array.isArray(cv) ? cv.find((e: CvEntry) => e.source === 'sports' && e.title === cvTitle) : undefined
  if (existing) {
    const times = (Number(/^(\d+)x/.exec(existing.detail)?.[1]) || 1) + 1
    existing.detail = `${times}x • latest at age ${g.character.age}`
    existing.strength = Math.min(10, existing.strength + 1)
    existing.endAge = g.character.age
    return
  }
  addCvEntry(g, { kind: 'award', title: cvTitle, org, startAge: g.character.age, detail: `at age ${g.character.age}`, strength, tags: ['sports'], source: 'sports' })
}

/** Remember a finished career for coaching, punditry, comebacks and the Hall of Fame. */
export function recordCareer(g: GameState, line: Omit<CareerLine, 'to'>): void {
  const p = sportsProfile(g)
  const full: CareerLine = { ...line, to: g.character.age, legacy: clamp100(line.legacy) }
  const prev = p.careers.find((c) => c.sport === full.sport && c.to >= full.from - 1)
  if (prev) Object.assign(prev, full, { from: Math.min(prev.from, full.from), legacy: Math.max(prev.legacy, full.legacy) })
  else p.careers.push(full)
  if (p.careers.length > 12) p.careers.splice(0, p.careers.length - 12)
  p.legacy = Math.max(p.legacy, full.legacy)
  p.lastActiveAge = g.character.age
}

export function addBuzz(g: GameState, n: number): void {
  const p = sportsProfile(g)
  p.buzz = Math.max(0, Math.min(40, p.buzz + n))
  p.lastActiveAge = g.character.age
}

// ---------------------------------------------------------------------------
// Anti-doping bans (apply to every sport)

/** Why you can't compete (banned), or null. Includes bans from the team-sports leagues. */
export function banReason(g: GameState): string | null {
  const age = g.character.age
  const p = peek<SportsProfile>(g, 'sports')
  const team = peek<{ bannedUntil?: number }>(g, 'athlete')
  const until = Math.max(p?.bannedUntil ?? -1, typeof team?.bannedUntil === 'number' ? team.bannedUntil : -1)
  if (until <= age) return null
  return until >= 999 ? 'You are banned from professional sports for life.' : `You are banned from competition until age ${until}${p?.banReason ? ` (${p.banReason})` : ''}.`
}

/** Ban the player from competition (the caller ends the job). Sponsors run for the exits. */
export function sportsBan(g: GameState, years: number, reason: string): void {
  const p = sportsProfile(g)
  p.bannedUntil = years >= 99 ? 999 : Math.max(p.bannedUntil, g.character.age + years)
  p.banReason = reason
  p.buzz = 0
  addFame(g, -5)
  addHidden(g, 'notoriety', 6)
  count(g, 'doping')
  dropSponsors(g, reason, 0.85)
  remember(g, `Banned from competition for ${reason}.`)
}

// ---------------------------------------------------------------------------
// Injuries & head trauma

export function injure(g: GameState, name: string, severity: number): void {
  const c = g.character
  const existing = c.conditions.find((x) => x.name === name)
  if (existing) existing.severity = Math.min(60, existing.severity + Math.round(severity / 2))
  else {
    const cond: Condition = { id: uid(g, 'c'), name, kind: 'injury', severity: Math.max(5, Math.min(45, Math.round(severity))), yearsHad: 0, curable: true, diagnosed: true, age: c.age }
    c.conditions.push(cond)
  }
  addStat(g, 'health', -Math.round(severity / 3))
}

export function healInjury(g: GameState, name: string): void {
  g.character.conditions = g.character.conditions.filter((x) => x.name !== name)
}

/** Blows to the head add up over a career (concussions, knockouts, heavy sparring). */
export function addHeadTrauma(g: GameState, amount: number, concussion = false): void {
  if (amount <= 0) return
  const p = sportsProfile(g)
  p.headTrauma = Math.round((p.headTrauma + amount) * 10) / 10
  if (concussion) p.concussions += 1
}

/** Yearly: neurologist warnings and the slow onset of CTE in heavily concussed ex-athletes. */
export function yearlyBrain(g: GameState): void {
  const p = peek<SportsProfile>(g, 'sports')
  const c = g.character
  if (!p || !c.alive || p.headTrauma < 25) return
  const prof = sportsProfile(g)
  if (prof.headTrauma >= 60 && prof.brainWarned < 60) {
    prof.brainWarned = 60
    say(g, 'Neurologist', "Your neurologist looked at your brain scans for a long time, then asked if you'd ever considered a career in accounting. Years of hits to the head are adding up.", '\u{1F9E0}', 'bad')
  } else if (prof.headTrauma >= 30 && prof.brainWarned < 30) {
    prof.brainWarned = 30
    log(g, 'A doctor warned me that all the hits to my head are adding up.', 'bad')
  }
  if (prof.cte || prof.headTrauma < 45 || c.age < 33) return
  // Heavy careers (trauma ~90) end up with roughly even odds over a lifetime; moderate ones rarely.
  const active = !!playingJob(g)
  const p0 = (prof.headTrauma - 45) / (active ? 2600 : 2000)
  if (!chance(g, Math.min(0.06, p0))) return
  prof.cte = true
  if (!c.conditions.some((x) => x.name === 'Dementia')) {
    c.conditions.push({ id: uid(g, 'c'), name: 'Dementia', kind: 'disease', severity: randInt(g, 9, 14), yearsHad: 0, curable: false, diagnosed: true, age: c.age })
  }
  addStat(g, 'smarts', -randInt(g, 3, 7))
  addStat(g, 'happiness', -10)
  addHidden(g, 'craziness', 5)
  log(g, 'Doctors diagnosed me with brain damage from my years in sports (CTE).', 'bad')
  remember(g, 'Diagnosed with CTE-related dementia after years of head trauma in sports.')
  say(g, 'CTE', `Memory lapses, mood swings, headaches. Doctors believe ${prof.concussions > 0 ? `${prof.concussions} concussion${prof.concussions === 1 ? '' : 's'} and ` : ''}years of blows to the head caused chronic traumatic encephalopathy. It's early-onset dementia, and it only gets worse.`, '\u{1F9E0}', 'bad')
}

// ---------------------------------------------------------------------------
// Endorsements

/** What a brand would pay an athlete to front: [product line in the offer, registry category, segment]. */
const ENDORSE_KINDS: { product: string; category: string; segment?: string }[] = [
  { product: 'running shoes', category: 'sneakers' },
  { product: 'sportswear', category: 'sportswear' },
  { product: 'energy drinks', category: 'energy-drink' },
  { product: 'bottled water', category: 'water' },
  { product: 'luxury watches', category: 'watch' },
  { product: 'razors', category: 'razor' },
  { product: 'soda', category: 'soft-drink' },
  { product: 'car insurance', category: 'insurer' },
  { product: 'headphones', category: 'electronics', segment: 'audio' },
  { product: 'breakfast cereal', category: 'cereal' },
  { product: 'sports drinks', category: 'energy-drink', segment: 'sports' },
  { product: 'fast food', category: 'fast-food' },
  { product: 'smartphones', category: 'phone' },
  { product: 'protein powder', category: 'protein' },
  { product: 'cars', category: 'car' },
  { product: 'banking app', category: 'bank' },
  { product: 'deodorant', category: 'deodorant' },
  { product: 'gaming chairs', category: 'furniture', segment: 'chair' },
]

interface SponsorOffer {
  brand: string
  product: string
  yearly: number
  years: number
  sport: string
}

/** The most one brand pays a year: 40 typical local incomes for each point of its fame (1 to 10), in the year's dollars. */
export function dealCeiling(g: GameState, brand: { fame?: number } | undefined): number {
  return typicalIncome(g) * 40 * (brand?.fame ?? 5)
}

/**
 * The registry record behind a signed deal: the brand of that name in the category its product line
 * draws from (several records can share a name, a rival firm or a regional branch; the best known
 * one counts), so the ceiling never differs from the one the offer was cut under.
 */
function dealBrand(name: string, product: string): Brand | undefined {
  const kind = ENDORSE_KINDS.find((k) => k.product === product)
  if (!kind) return undefined
  let best: Brand | undefined
  for (const b of allBrands()) {
    if (b.name !== name || b.category !== kind.category || (kind.segment && b.segment !== kind.segment)) continue
    if (!best || (b.fame ?? 5) > (best.fame ?? 5)) best = b
  }
  return best
}

function offerFor(g: GameState, sport: string, appeal: number): SponsorOffer | null {
  const p = sportsProfile(g)
  const takenIds = p.sponsors.map((s) => s.brand)
  // Only real brands that trade where you live this year, and never two deals with the same one.
  const free = ENDORSE_KINDS.filter((k) => !anachronistic(g, k.product) && brandPool(g, k.category, { ...(k.segment ? { segment: k.segment } : {}), exclude: takenIds.map((n) => allBrands().find((b) => b.name === n)?.id ?? '') }).length > 0)
  if (!free.length) return null
  const kind = pick(g, free)
  const real = pickBrand(g, kind.category, { ...(kind.segment ? { segment: kind.segment } : {}), exclude: takenIds.map((n) => allBrands().find((b) => b.name === n)?.id ?? '') })
  if (!real) return null
  const brand = real.name
  const product = kind.product
  const fame = g.character.hidden.fame
  // Superstars get millions per brand; everyone else gets far less (fame matters cubed).
  const base = 4_000 + (fame / 100) ** 3 * 6_000_000 + p.buzz * 3_000
  const yearly = Math.min(dealCeiling(g, real), tidy(base * Math.max(0.2, Math.min(1.2, appeal)) * (0.7 + rand(g) * 0.6) * (0.6 + wealth(g) * 0.4)))
  return { brand, product, yearly: Math.max(2_000, yearly), years: randInt(g, 1, 4), sport }
}

const sponsorScript = defineScript('sports.sponsor.offer', (g, choice, data) => {
  const o = data as unknown as SponsorOffer
  if (!o || typeof o.yearly !== 'number') return
  const p = sportsProfile(g)
  if (choice === 'decline') {
    log(g, `I turned down an endorsement deal from ${o.brand}.`)
    return
  }
  let yearly = o.yearly
  if (choice === 'haggle') {
    if (!chance(g, 0.55)) {
      log(g, `${o.brand} walked away when my agent asked for more money.`, 'bad')
      return say(g, o.brand, `Your agent asked ${o.brand} for more. They thanked you for your time and signed someone else for the ${o.product} ads.`, '\u{1F91D}', 'bad')
    }
    yearly = tidy(yearly * (1.2 + rand(g) * 0.3))
  }
  yearly = Math.min(yearly, dealCeiling(g, dealBrand(o.brand, o.product)))
  if (p.sponsors.length >= maxDeals(g.character.hidden.fame)) return tell(g, o.brand, 'Your agent says another endorsement deal would "dilute the brand". You are the brand.', '\u{1F91D}')
  p.sponsors.push({ brand: o.brand, product: o.product, yearly, yearsLeft: o.years, sinceAge: g.character.age })
  addFame(g, 1)
  count(g, 'endorsements')
  log(g, `I signed an endorsement deal with ${o.brand}.`, 'good')
  say(g, 'Endorsement Deal', `You signed a ${o.years}-year deal to be the face of ${o.brand} ${o.product}, worth ${money(yearly)} a year. Your first ad shoot involved a lot of slow-motion hair flipping.`, '\u{1F91D}', 'good')
})

/** How many brands want you at once: one for a local hero, three for a global star. */
export function maxDeals(fame: number): number {
  return fame >= 70 ? 3 : fame >= 40 ? 2 : 1
}

/** Maybe have a brand call with an offer (`force` skips the chance roll, not the rules). */
export function sponsorCall(g: GameState, sport: string, appeal: number, force = false): boolean {
  const c = g.character
  const p = sportsProfile(g)
  if (!c.alive || c.prison || p.sponsors.length >= maxDeals(c.hidden.fame) || banReason(g)) return false
  if (c.hidden.fame < 8 && p.buzz < 15) return false
  if (!force && !chance(g, Math.min(0.75, 0.12 + c.hidden.fame / 140 + p.buzz / 80))) return false
  const o = offerFor(g, sport, appeal)
  if (!o) return false
  scriptChoice(
    g,
    sponsorScript,
    o.brand,
    `${o.brand} wants you to be the face of their ${o.product}: ${money(o.yearly)} a year for ${o.years} year${o.years === 1 ? '' : 's'}.`,
    [
      { id: 'accept', label: 'Sign the deal', emoji: '\u{270D}\u{FE0F}' },
      { id: 'haggle', label: 'Ask for more money', emoji: '\u{1F4B0}' },
      { id: 'decline', label: 'Decline', emoji: '\u{274C}' },
    ],
    { emoji: '\u{1F91D}', data: o as unknown as Json },
  )
  return true
}

/** Lose deals after a scandal (each one walks with probability `p`). */
export function dropSponsors(g: GameState, reason: string, p: number): void {
  const prof = peek<SportsProfile>(g, 'sports')
  if (!prof || !prof.sponsors.length) return
  const s = sportsProfile(g)
  const lost = s.sponsors.filter(() => chance(g, p))
  if (!lost.length) return
  s.sponsors = s.sponsors.filter((d) => !lost.includes(d))
  const names = lost.map((d) => d.brand)
  log(g, `${names.join(' and ')} dropped me after ${reason}.`, 'bad')
}

/** Yearly: pay endorsement money, expire deals, and maybe get a new offer. */
export function yearlySponsors(g: GameState, sport: string | null, appeal: number): void {
  const c = g.character
  const prof = peek<SportsProfile>(g, 'sports')
  if (!c.alive || !prof) {
    if (sport && c.alive && !c.prison) sponsorCall(g, sport, appeal)
    return
  }
  const p = sportsProfile(g)
  if (c.prison) {
    if (p.sponsors.length) {
      log(g, 'My sponsors dropped me when I went to prison.', 'bad')
      p.sponsors = []
    }
    return
  }
  // Deals pay as signed; faded stars find out when a deal comes up for renewal.
  let total = 0
  for (const d of p.sponsors) {
    total += d.yearly
    d.yearsLeft -= 1
  }
  if (total > 0) earnIncome(g, total, 'royalty')
  const ended = p.sponsors.filter((d) => d.yearsLeft <= 0)
  p.sponsors = p.sponsors.filter((d) => d.yearsLeft > 0)
  for (const d of ended) {
    if (sport && c.hidden.fame >= 15 && p.sponsors.length < maxDeals(c.hidden.fame) && chance(g, 0.5)) {
      p.sponsors.push({ ...d, yearsLeft: randInt(g, 1, 3), yearly: Math.min(dealCeiling(g, dealBrand(d.brand, d.product)), tidy(d.yearly * (0.6 + (c.hidden.fame / 100) * 0.6) * (0.85 + rand(g) * 0.3))) })
      log(g, `${d.brand} renewed my endorsement deal.`, 'good')
    } else log(g, `My endorsement deal with ${d.brand} ended.`)
  }
  // What the deals paid, said through its row (text/state-table.ts): in the first year, when the sum moves up a step, or after 5
  // quiet years. A quiet year still takes the log id the line took, so no later id moves.
  if (total > 0) logStateLine(g, stateLine(g, 'endorse.income', total, { slots: { money: short(total) } }), 'good')
  const recentlyActive = sport !== null || (p.lastActiveAge >= 0 && c.age - p.lastActiveAge <= 3)
  if (recentlyActive) sponsorCall(g, sport ?? 'sports', appeal)
  p.buzz = Math.max(0, Math.round(p.buzz * 0.5))
}

export function endorsementsMenu(): MenuGroup {
  return {
    type: 'menu',
    id: 'sports.endorsements',
    label: 'Endorsements',
    emoji: '\u{1F91D}',
    subtitle: (g) => {
      const s = viewSports(g).sponsors
      return s.length ? `${s.length} deal${s.length === 1 ? '' : 's'} · ${short(s.reduce((a, d) => a + d.yearly, 0))}/yr` : 'Brands pay famous athletes to hold their products'
    },
    visible: (g) => g.character.age >= 10,
    children: (g): MenuNode[] => {
      const p = viewSports(g)
      const nodes: MenuNode[] = p.sponsors.map((d, i) => ({ type: 'info' as const, id: `sports.end.${i}`, emoji: '\u{1F4B5}', text: `${d.brand} (${d.product}) · ${money(d.yearly)}/yr · ${d.yearsLeft} year${d.yearsLeft === 1 ? '' : 's'} left` }))
      if (!nodes.length) nodes.push({ type: 'info', id: 'sports.end.none', emoji: '\u{1F4ED}', text: 'No endorsement deals yet. Win things, get famous, and the brands will call.' })
      nodes.push({
        type: 'action',
        id: 'sports.end.pitch',
        label: 'Pitch Yourself to Brands',
        emoji: '\u{1F4DE}',
        subtitle: 'Have your agent work the phones (once a year)',
        disabledReason: (gg) => {
          const b = blocked(gg, 14)
          if (b) return b
          if (!playingJob(gg) && !(viewSports(gg).lastActiveAge >= 0 && gg.character.age - viewSports(gg).lastActiveAge <= 3)) return 'Brands only sponsor active (or recently retired) athletes.'
          if (viewSports(gg).sponsors.length >= maxDeals(gg.character.hidden.fame)) return 'You have all the deals your fame can carry. Get more famous.'
          return null
        },
        run: (gg) => {
          if (!useYearAction(gg, 'sports.pitch', 1)) return tell(gg, 'Endorsements', 'Your agent already called every brand in the phone book this year.', '\u{1F4DE}')
          const job = playingJob(gg)
          const ok = sponsorCall(gg, job?.title ?? 'sports', 0.7, gg.character.hidden.fame >= 12 || viewSports(gg).buzz >= 10)
          if (!ok) tell(gg, 'Endorsements', pickLine(gg, ["Your agent made forty calls. The best offer was a coupon for a free smoothie.", 'Brands want winners, or at least someone famous. Keep working.']), '\u{1F4DE}')
        },
      })
      return nodes
    },
  }
}

// ---------------------------------------------------------------------------
// Rivals, opponents and numbers

const NICKS = [
  'The Hammer', 'The Butcher', 'Bulldozer', 'The Professor', 'Mad Dog', 'The Surgeon', 'Lights Out', 'The Phantom', 'Baby Face', 'The Viking',
  'Thunder', 'The Gentleman', 'Iron Lung', 'The Accountant', 'Cyclone', 'Smokin', 'The Natural', 'Bonecrusher', 'Silk', 'The Machine', 'Hurricane',
  'The Spider', 'Cobra', 'Grizzly', 'The Dentist', 'No Mercy', 'Scarecrow', 'The Undertaker of Uptown', 'Mr. Wonderful', 'The Locksmith',
]

export function nickname(g: GameState): string {
  return pick(g, NICKS)
}

export interface Person0 {
  name: string
  flag: string
  countryId: string
}

/** A rival/opponent from somewhere in the world (sometimes from home). */
export function worldAthlete(g: GameState, gender: Gender, homeShare = 0.35): Person0 {
  const home = chance(g, homeShare)
  const country = home ? getCountry(g.character.countryId) : pick(g, COUNTRIES)
  const name = `${randomFirstName(g, country.id, gender)} ${randomLastName(g, country.id)}`
  return { name, flag: flagEmoji(country.id), countryId: country.id }
}

export function logistic(x: number): number {
  return 1 / (1 + Math.exp(-x))
}

/**
 * World ranking from ranking points: 9,000 = No. 1, 600 = No. 100, ~100 = No. 300, a handful
 * of points = the bottom of a ~2,000-player ranking, nothing = unranked.
 */
export function rankFromPoints(points: number): number | null {
  if (!Number.isFinite(points) || points < 5) return null
  if (points >= 600) {
    const b = 2 / Math.log10(9000 / 600)
    return Math.max(1, Math.round(10 ** (b * Math.log10(9000) - b * Math.log10(points))))
  }
  return Math.min(2000, Math.round(100 * (600 / points) ** 0.625))
}

export function rankLabel(rank: number | null): string {
  return rank === null ? 'Unranked' : `World No. ${rank.toLocaleString('en-US')}`
}

export function plural(n: number, word: string): string {
  if (n === 1) return `${n} ${word}`
  return `${n} ${/(?:s|x|z|ch|sh)$/.test(word) ? `${word}es` : `${word}s`}`
}

/** "the Kimberley Classic" for an event called "The Kimberley Classic" or "Kimberley Classic". */
export function theName(name: string): string {
  return /^the\s/i.test(name) ? `the ${name.slice(4)}` : `the ${name}`
}

/** Train an attribute with diminishing returns; returns the gain. */
export function trainGain(g: GameState, current: number, lo: number, hi: number, mult = 1): number {
  const room = Math.max(0.15, 1 - current / 115)
  return Math.max(1, Math.round(randInt(g, lo, hi) * room * mult))
}

/** Age factor for skill growth/decline: kids learn fast, veterans fade. */
export function ageDecline(age: number, peakEnd: number): number {
  return age > peakEnd ? Math.round((age - peakEnd) * 0.9 + 1) : 0
}

/** Generic chance for a bad scandal to drop a deal; used by career modules. */
export function scandal(g: GameState, what: string): void {
  addHidden(g, 'notoriety', 3)
  dropSponsors(g, what, 0.4)
}
