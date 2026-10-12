// Venture capital: funds raised from limited partners (client money, never the firm's cash),
// procedurally generated startup pitches, a power-law portfolio and carried interest.
// Pitches are a pure function of (firm, year): opening the menu never rerolls or stores them.
// Hidden quality decides outcomes; due diligence and talents read it with honest noise.
import { seeded } from '../assets'
import { hasTalent } from '../talents'
import { outcomeTag, timelineTag } from '../timeMachine'
import type { GameState } from '../types'
import { getCountry, namePoolOf } from '../world'
import { firmKey, fundRng, fundSkill, normal, techAt } from './fund-model'
import type { FundState, RaiseOffer, Startup, VcFund } from './fund-state'
import type { BizState } from './state'
import { clampN } from './util'
import type { TechId } from '../history/timeline'

export const VC_INVESTABLE = .8
export const VC_FEE = .02
export const VC_FEE_YEARS = 10
export const VC_INVEST_YEARS = 5
export const VC_LIFE = 12
export const VC_CARRY = .2
export const UNICORN = 1e9
export const STAGES = ['Seed', 'Series A', 'Series B', 'Series C', 'Growth round', 'Pre-IPO round'] as const

type SRng = ReturnType<typeof seeded>
type Firm = Pick<BizState, 'countryId' | 'city' | 'founded' | 'founderName'>

// ---------------------------------------------------------------------------
// Pitch content: era-correct sectors, products, twists and founders

interface Sector { id: string; label: string; emoji: string; from: number; to?: number; tech?: TechId; products: readonly string[] }

const SECTORS: readonly Sector[] = [
  { id: 'electronics', label: 'Electronics', emoji: '📻', from: 1946, to: 1985, products: ['an electric can opener', 'a home intercom system', 'a hi-fi record player', 'an electric typewriter', 'a garage-door opener', 'a doorbell that plays a whole symphony'] },
  { id: 'appliances', label: 'Home appliances', emoji: '🧺', from: 1946, to: 1975, products: ['a dishwasher that hums show tunes', 'a self-defrosting refrigerator', 'an electric carving knife', 'a washing machine with a window'] },
  { id: 'television', label: 'Television', emoji: '📺', from: 1948, to: 1975, tech: 'tv', products: ['a rooftop TV antenna that turns itself', 'a TV set disguised as a bookshelf', 'TV dinners in fancy trays'] },
  { id: 'frozen', label: 'Convenience food', emoji: '🥶', from: 1946, to: 1972, products: ['frozen fish sticks', 'instant cake mix', 'canned spaghetti for busy families', 'powdered orange drink'] },
  { id: 'atomic', label: 'Atomic age', emoji: '⚛️', from: 1946, to: 1966, products: ['a uranium prospecting kit', 'a radiation detector for curious families', 'an "atomic" hair tonic (it is just water)'] },
  { id: 'plastics', label: 'Plastics', emoji: '🧪', from: 1950, to: 1975, products: ['unbreakable dinnerware', 'a hula hoop that glows in the dark', 'snap-shut food containers'] },
  { id: 'chips', label: 'Semiconductors', emoji: '🔌', from: 1958, products: ['a faster memory chip', 'a microchip for car engines', 'integrated circuits for hearing aids', 'a chip that runs cooler than the rest'] },
  { id: 'mini', label: 'Business machines', emoji: '🗄️', from: 1962, to: 1986, products: ['a minicomputer the size of a fridge', 'a time-sharing service for banks', 'punch cards that never jam', 'a payroll machine for factories'] },
  { id: 'calculators', label: 'Calculators', emoji: '🧮', from: 1970, to: 1988, products: ['a pocket calculator', 'a calculator wristwatch', 'a solar calculator for students'] },
  { id: 'games', label: 'Video games', emoji: '🕹️', from: 1972, tech: 'videoGameConsole', products: ['an arcade cabinet about ping-pong', 'a video game console shaped like a toaster', 'a racing game with real steering wheels'] },
  { id: 'biotech', label: 'Biotech', emoji: '🧬', from: 1976, products: ['gene-spliced insulin', 'a tomato that never squishes', 'a hangover cure (works in mice)', 'a test that finds allergies in minutes'] },
  { id: 'cable', label: 'Cable channels', emoji: '📡', from: 1976, to: 1998, products: ['a 24-hour weather channel', 'a cable channel only about bowling', 'a shopping channel for garden gnomes'] },
  { id: 'pc', label: 'Personal computers', emoji: '💾', from: 1977, tech: 'homeComputer', products: ['a beige personal computer', 'a word processor for lawyers', 'a floppy-disk organizer', 'a computer mouse with three buttons'] },
  { id: 'software', label: 'Software', emoji: '💿', from: 1980, tech: 'homeComputer', products: ['spreadsheet software for farmers', 'a typing tutor starring a cartoon cat', 'accounting software for dentists', 'a flight simulator for pigeons'] },
  { id: 'mobile', label: 'Mobile phones', emoji: '📟', from: 1985, tech: 'mobilePhone', products: ['a car phone with a briefcase battery', 'a mobile phone that survives being dropped', 'ringtones for every mood'] },
  { id: 'dotcom', label: 'Internet', emoji: '🌐', from: 1995, tech: 'internet', products: ['pet food sold over the internet', 'an internet portal just for socks', 'a website where you can name a star', 'free email with extra-large fonts'] },
  { id: 'ecommerce', label: 'E-commerce', emoji: '🛒', from: 1997, tech: 'onlineShopping', products: ['online grocery delivery in 20 minutes', 'an online store that only sells left shoes', 'a website auctioning celebrity hair'] },
  { id: 'social', label: 'Social', emoji: '👥', from: 2004, tech: 'socialMedia', products: ['a social network for dogs', 'a photo site that only allows pictures of soup', 'a social network for people who hate social networks'] },
  { id: 'apps', label: 'Mobile apps', emoji: '📱', from: 2008, tech: 'smartphone', products: ['an app that tells you when your toast is ready', 'an app that rates your handshake', 'a dating app for chess players', 'an app that reminds you to drink water'] },
  { id: 'cleantech', label: 'Clean energy', emoji: '🌱', from: 2005, products: ['solar panels for backpacks', 'a wind turbine for balconies', 'batteries made from sea salt'] },
  { id: 'saas', label: 'Business software', emoji: '☁️', from: 2009, tech: 'internet', products: ['cloud software for wedding planners', 'HR software that also waters the office plants', 'invoicing software that sends polite threats', 'a dashboard for other dashboards'] },
  { id: 'gig', label: 'Gig economy', emoji: '🛵', from: 2011, tech: 'rideHailing', products: ['ride-hailing for horses', 'on-demand dog walkers', 'instant furniture assembly by students'] },
  { id: 'ai', label: 'Artificial intelligence', emoji: '🤖', from: 2014, tech: 'deepLearning', products: ['an AI that writes wedding speeches', 'machine learning that picks ripe avocados', 'an AI that names other startups', 'self-sorting recycling bins'] },
  { id: 'crypto', label: 'Crypto', emoji: '🪙', from: 2013, tech: 'crypto', products: ['a blockchain for lost socks', 'a crypto token for sandwich shops', 'a crypto wallet shaped like a pet rock'] },
  { id: 'fintech', label: 'Fintech', emoji: '💳', from: 2010, tech: 'smartphone', products: ['a budgeting app that roasts your spending', 'a banking app for teenagers', 'split-the-bill payments for picky friends'] },
  { id: 'climate', label: 'Climate', emoji: '🌍', from: 2018, products: ['billboards that suck carbon out of the air', 'leather grown from mushrooms', 'cow burp filters', 'heat pumps that fit in a closet'] },
  { id: 'space', label: 'Space', emoji: '🛰️', from: 2012, tech: 'privateSpace', products: ['tiny satellites for weather nerds', 'space burials for goldfish', 'a rocket made of recycled cans'] },
  { id: 'genai', label: 'AI agents', emoji: '🧠', from: 2023, tech: 'aiAssistants', products: ['an AI assistant for grandmas', 'an AI lawyer for parking tickets', 'an AI that attends your meetings for you'] },
]

const TWISTS: readonly string[] = ['for cats', 'for left-handed people', 'with a lifetime guarantee', 'run entirely by retirees', 'in six bright colors', 'that also tells jokes', 'for very busy dentists', 'aimed at grandparents', 'with a loyalty club', 'for people who hate mornings', 'built to last a hundred years', 'that fits in a lunchbox']

interface Trait { text: string; bias: number }
const TRAITS: readonly Trait[] = [
  { text: 'sold their last company for a fortune', bias: 2 }, { text: 'already has paying customers', bias: 2 },
  { text: 'was a chief engineer at a big firm', bias: 1.5 }, { text: 'built the prototype in one weekend', bias: 1 },
  { text: 'has been obsessed with this for ten years', bias: 1 }, { text: 'topped their engineering class', bias: 1 },
  { text: 'wears the same sweater every single day', bias: 0 }, { text: 'brought 90 pages of charts', bias: 0 },
  { text: 'is 19 and extremely confident', bias: 0 }, { text: 'is a former professional poker player', bias: 0 },
  { text: 'insists on being called "Captain"', bias: 0 }, { text: 'brought their mom to the pitch', bias: 0 },
  { text: 'has a dog as unofficial co-founder', bias: 0 }, { text: 'speaks almost entirely in acronyms', bias: -.5 },
  { text: 'has never actually met a customer', bias: -1.5 }, { text: 'spelled the company name wrong on page one', bias: -1 },
  { text: 'plans to spend half the money on a launch party', bias: -2 }, { text: 'answered every question with "synergy"', bias: -1 },
  { text: 'is on their third big change of plan this month', bias: -1.5 },
]

const DEATHS: readonly string[] = ['ran out of money', 'the founders fought over the logo', 'a bigger company copied it', 'customers never came', 'the prototype caught fire on stage', 'changed direction one time too many', 'spent everything on a launch party', 'the founder moved to a commune']

// Made-up syllables by era. Combinations that spell a famous real company are skipped (DENY).
const STARTS: readonly (readonly [number, readonly string[], readonly string[]])[] = [
  [1946, ['Electro', 'Dyna', 'Vista', 'Aero', 'Super', 'Ampli', 'Volt', 'Sono', 'Chrono', 'Atomi', 'Glo', 'Kenno'], ['tronics', 'matic', 'lux', 'sonic', 'craft', 'dyne', 'tron', 'wave', 'master', 'ray']],
  [1966, ['Micro', 'Data', 'Silico', 'Synth', 'Mega', 'Quad', 'Bit', 'Vecto', 'Kilo', 'Hexa'], ['logic', 'byte', 'ware', 'tronix', 'dyne', 'core', 'labs', 'works', 'matic', 'plex']],
  [1990, ['Click', 'Zap', 'Boo', 'Netto', 'Pets', 'Hyper', 'Mega', 'Star', 'Go', 'Whiz'], ['.com', 'zone', 'hub', 'topia', 'ster', 'spot', 'link', 'direct', 'mart', 'land']],
  [2004, ['Snap', 'Buzz', 'Pix', 'Yum', 'Zoo', 'Hap', 'Glim', 'Wobb', 'Kloo', 'Jib'], ['ly', 'ify', 'io', 'sy', 'oo', 'ster', 'hub', 'eo', 'zy', 'bit']],
  [2015, ['Quant', 'Neur', 'Mood', 'Bloom', 'Nova', 'Zen', 'Flux', 'Carbon', 'Orbit', 'Lumi', 'Vanta', 'Kairo'], ['ai', 'ify', 'io', 'labs', 'ly', 'base', 'stack', 'verse', 'x', 'grid']],
]
const DENY = new Set(['electrolux', 'dynatron', 'microdyne', 'datacore', 'microlabs', 'datalogic', 'megabyte', 'starhub', 'golink', 'go.com', 'pets.com', 'boo.com', 'snapify', 'buzzhub', 'zenly', 'novax', 'superlux', 'carbonx', 'fluxlabs', 'clickhub'])

export function sectorsFor(countryId: string, year: number): Sector[] {
  return SECTORS.filter(s => year >= s.from && (s.to === undefined || year <= s.to) && (!s.tech || techAt(countryId, s.tech, year)))
}

/** A made-up startup name the firm isn't already using (`taken`: lower-case names). */
function startupName(r: SRng, year: number, taken: ReadonlySet<string>): string {
  let set = STARTS[0]
  for (const row of STARTS) if (year >= row[0]) set = row
  const starts = set[1], ends = set[2]
  const a0 = Math.floor(r.next() * starts.length), k0 = Math.floor(r.next() * ends.length)
  // Walk on from the drawn syllables (same stream use, and the same name whenever it is free),
  // skipping famous real names and names already in this year's pitches or the portfolio.
  for (let j = 0; j < starts.length; j++) {
    for (let i = 0; i < ends.length; i++) {
      const name = `${starts[(a0 + j) % starts.length]}${ends[(k0 + i) % ends.length]}`
      if (!DENY.has(name.toLowerCase()) && !taken.has(name.toLowerCase())) return name
    }
  }
  return uniqueName(`${starts[a0]}${ends[k0]}`, taken)
}

/** `base`, or `base 2`, `base 3`... whichever the firm isn't using yet (`taken`: lower-case names). */
export function uniqueName(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base.toLowerCase())) return base
  for (let n = 2; ; n++) if (!taken.has(`${base} ${n}`.toLowerCase())) return `${base} ${n}`
}

/** Lower-case names of the firm's startups from before `year` (fixed all year, so pitches stay put). */
export function usedNames(f: Pick<FundState, 'cos'>, year: number): Set<string> {
  return new Set(f.cos.filter(c => c.born < year).map(c => c.name.toLowerCase()))
}

// ---------------------------------------------------------------------------
// Funds

/** The fund currently writing new checks (vintage within the investment period, money left). */
export function investingFund(f: FundState, year: number): VcFund | null {
  const open = f.funds.filter(x => !x.done && year - x.vintage < VC_INVEST_YEARS && x.dry > x.size * .03)
  return open.length ? open[open.length - 1] : null
}

export function fundNav(f: FundState, n: number): number {
  return f.cos.filter(c => c.fund === n && c.status === 'live').reduce((t, c) => t + c.own * c.val, 0)
}

/** Total value to paid-in: gross exits plus live stakes at their last round, per dollar LPs paid in. */
export function fundTvpi(f: FundState, x: VcFund): number {
  const paid = x.invested + x.fees
  return paid > 0 ? (x.dist + fundNav(f, x.n)) / paid : 1
}

/** The firm-wide track record LPs look at (funds older than two years, size-weighted). */
export function trackRecord(f: FundState, year: number): number | null {
  const seasoned = f.funds.filter(x => year - x.vintage >= 2)
  if (!seasoned.length) return null
  const size = seasoned.reduce((t, x) => t + x.size, 0)
  return seasoned.reduce((t, x) => t + fundTvpi(f, x) * x.size, 0) / Math.max(1, size)
}

function eraVc(year: number): number {
  return year < 1960 ? .7 : year < 1970 ? .75 : year < 1980 ? .85 : year < 1990 ? .95 : year < 2001 ? 1.2 : year < 2010 ? 1 : year < 2022 ? 1.3 : 1.15
}

/** Fund I: what LPs give a first-time manager here and now. */
export function firstFundSize(g: GameState, b: Firm & Pick<BizState, 'ceo' | 'manager'>, year: number): number {
  const w = clampN(getCountry(b.countryId).wealth ?? 1, .15, 2)
  const c = g.character
  const owner = b.ceo !== 'manager' && c.alive
  const pull = owner ? .7 + c.stats.smarts / 200 + (hasTalent(g, 'Business') ? .25 : 0) + (hasTalent(g, 'Investing') ? .15 : 0) + Math.min(.3, c.hidden.fame / 300)
    : .8 + (b.manager?.skill ?? 50) / 250
  return Math.round(25_000_000 * w * eraVc(year) * pull / 100_000) * 100_000
}

/** Share of a fund's investable money that went into startups (0-1). */
export function vcDeployed(x: Pick<VcFund, 'invested' | 'size'>): number {
  return clampN(x.invested / Math.max(1, x.size * VC_INVESTABLE), 0, 1)
}

export interface RaiseQuote { n: number; size: number; tvpi: number | null; odds: number; block: string | null }

/** What LPs would commit to the next fund now (pure; the Business hint shows the same odds). */
export function raiseQuote(g: GameState, b: BizState, f: FundState, year: number): RaiseQuote {
  const latest = f.funds.length ? f.funds[f.funds.length - 1] : null
  const tvpi = trackRecord(f, year)
  const n = (latest?.n ?? 0) + 1
  const first = firstFundSize(g, b, year)
  if (!latest) return { n, size: first, tvpi, odds: .5, block: null }
  const age = year - latest.vintage
  // What actually went into startups (unused money goes back to LPs after the fee years, so the
  // dry powder left says nothing then).
  const deployed = vcDeployed(latest)
  if (age < 3) return { n, size: 0, tvpi, odds: 0, block: `Fund ${roman(latest.n)} is too new. LPs want three years of results first.` }
  if (deployed < .7 && age < 5) return { n, size: 0, tvpi, odds: 0, block: `Invest more of Fund ${roman(latest.n)} first (${Math.round(deployed * 100)}% deployed).` }
  // LPs size the next fund by what you put to work: a manager who never invested gets nothing.
  const used = clampN(deployed / .7, 0, 1)
  if (used < .15) return { n, size: 0, tvpi, odds: 0, block: `LPs won’t back a new fund: Fund ${roman(latest.n)} barely invested (${Math.round(deployed * 100)}%).` }
  const record = tvpi ?? 1
  const mult = record < .6 && age >= 5 ? .5 : clampN(Math.pow(Math.max(.1, record), .8), .6, 2)
  const skill = fundSkill(g, b)
  const size = Math.max(first * .5, latest.size * mult * (.9 + skill / 500)) * used
  const odds = clampN(.3 + .25 * (record - 1) + skill / 400, .1, .85)
  return { n, size: Math.round(size / 100_000) * 100_000, tvpi, odds, block: null }
}

export function roman(n: number): string {
  const table: [number, string][] = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]
  let out = '', k = Math.max(1, Math.min(39, Math.round(n)))
  for (const [v, s] of table) while (k >= v) { out += s; k -= v }
  return out
}

export function newVcFund(n: number, size: number, year: number): VcFund {
  return { n, size, vintage: year, dry: size * VC_INVESTABLE, reserve: size * (1 - VC_INVESTABLE), invested: 0, dist: 0, carry: 0, fees: 0, done: false }
}

// ---------------------------------------------------------------------------
// Pitches

export interface Pitch {
  id: string
  name: string
  emoji: string
  sector: string
  line: string
  founder: string
  trait: string
  stage: number
  ask: number
  pre: number
  /** Hidden quality (outcomes only). */
  q: number
  /** Due-diligence band (shown only after paying for it). */
  lo: number
  hi: number
  fund: number
}

/** This year's pitches: 3-5 while a fund is investing, none otherwise (pure). */
export function pitchesFor(g: GameState, b: Firm, f: FundState, year: number): Pitch[] {
  const fund = investingFund(f, year)
  if (!fund) return []
  const sectors = sectorsFor(b.countryId, year)
  if (!sectors.length) return []
  const look = seeded(`${g.lifeId}${timelineTag(g, year)}|vcpitch|${firmKey(b)}|${year}`)
  const fate = seeded(`${g.lifeId}${outcomeTag(g, year)}|vcq|${firmKey(b)}|${year}`)
  const count = 3 + Math.floor(look.next() * 3)
  const pool = namePoolOf(b.countryId)
  const out: Pitch[] = []
  const taken = usedNames(f, year)
  for (let i = 0; i < count; i++) {
    const sector = look.pick(sectors)
    const name = startupName(look, year, taken)
    taken.add(name.toLowerCase())
    const product = look.pick(sector.products as string[])
    const twist = look.next() < .45 ? ` ${look.pick(TWISTS as string[])}` : ''
    const q = Math.round(100 * Math.pow(fate.next(), 1.7))
    // Founders' habits are a weak, honest signal: good ones turn up more with good companies.
    const lean = (q - 40) / 25 + normal(fate) * 1.2
    const traits = TRAITS.filter(t => lean > 1 ? t.bias >= 0 : lean < -1 ? t.bias <= .5 : true)
    const trait = look.pick(traits.length ? traits as Trait[] : TRAITS as Trait[])
    const gender = look.next() < .5 ? 'male' : 'female'
    const founder = `${look.pick(gender === 'male' ? pool.male : pool.female)} ${look.pick(pool.last)}`
    const stage = fund.size > 150e6 && look.next() < .5 ? 1 : 0
    const check = fund.size * .045 * (.6 + look.next() * .9) * (stage ? 1.6 : 1)
    const ask = Math.max(10_000, Math.round(Math.min(fund.dry, check) / 10_000) * 10_000)
    const pre = Math.round(ask * (4.5 + look.next() * 4.5) * (.85 + clampN(q / 100 + normal(fate) * .2, 0, 1) * .3) / 10_000) * 10_000
    const lo = clampN(Math.round(q - fate.next() * 30), 0, 70)
    out.push({ id: `${year}.${i}`, name, emoji: sector.emoji, sector: sector.label, line: `${product}${twist}`, founder, trait: trait.text, stage, ask, pre, q, lo, hi: lo + 30, fund: fund.n })
  }
  return out
}

/** The pitches still on the table (not invested in or turned down this year). */
export function openPitches(g: GameState, b: Firm, f: FundState, year: number): Pitch[] {
  const acted = f.actYear === year ? f.acted : []
  return pitchesFor(g, b, f, year).filter(p => !acted.includes(p.id))
}

export function ddDone(f: FundState, year: number, id: string): boolean {
  return f.actYear === year && f.dd.includes(id)
}

/** What due diligence costs for this check (firm cash, never fund money). */
export function ddCost(b: Pick<BizState, 'countryId'>, ask: number): number {
  return Math.round(Math.max(8_000 * clampN(getCountry(b.countryId).wealth ?? 1, .3, 1.5), ask * .02) / 1000) * 1000
}

/** The talent's honest gut read of a startup (same hidden quality the year uses, with noise). */
export function gutRead(g: GameState, id: string, q: number): number {
  return q + 16 * normal(seeded(`${g.lifeId}|${g.character.id}|vcgut|${id}`))
}

export function readLabel(score: number): string {
  return score >= 62 ? 'this one has real potential' : score >= 38 ? 'decent, nothing special' : 'probably a dud'
}

/** A hired CEO's read: sharper with skill, never perfect. */
export function managerRead(skill: number, key: string, q: number): number {
  return q + (36 - clampN(skill, 0, 100) * .2) * normal(seeded(`vcmgr|${key}`))
}

// ---------------------------------------------------------------------------
// Portfolio companies

export function newStartup(p: Pitch, year: number): Startup {
  const post = p.pre + p.ask
  return { id: p.id, name: p.name, emoji: p.emoji, sector: p.sector, fund: p.fund, q: p.q, stage: p.stage, val: post, own: p.ask / Math.max(1, post), cost: p.ask, born: year, status: 'live', end: 0, got: 0, how: '', round: null, unicorn: false }
}

export function stageLabel(stage: number): string {
  return STAGES[Math.max(0, Math.min(STAGES.length - 1, stage))]
}

/** The pro-rata check that keeps the fund's stake in a round. */
export function proRata(c: Startup, round: RaiseOffer): number {
  return Math.round(c.own * round.size)
}

/** What happened in the venture book this year (startup ids; text is written at display time). */
export interface VcYear { fees: number; carry: number; unicorns: string[]; exits: string[]; deaths: string[]; bigExits: string[] }

function payCarry(fund: VcFund, gross: number): number {
  const before = VC_CARRY * Math.max(0, fund.dist - fund.size)
  fund.dist += gross
  const owed = VC_CARRY * Math.max(0, fund.dist - fund.size)
  const carry = Math.max(0, owed - before)
  fund.carry += carry
  return carry
}

/** One fiscal year of the venture book: fees, rounds, deaths, exits and carry. Mutates f only. */
export function advanceVc(g: GameState, b: Firm, f: FundState, fiscal: number, marketDown: boolean, autoFollow: boolean, open = 1): VcYear {
  const out: VcYear = { fees: 0, carry: 0, unicorns: [], exits: [], deaths: [], bigExits: [] }
  const fundOf = (n: number) => f.funds.find(x => x.n === n)
  for (const fund of f.funds) {
    if (fund.done || fund.vintage > fiscal) continue
    const age = fiscal - fund.vintage
    if (age < VC_FEE_YEARS) {
      const fee = Math.min(fund.reserve, fund.size * VC_FEE * clampN(open, 0, 1))
      fund.reserve -= fee; fund.fees += fee; out.fees += fee
    } else fund.reserve = 0
    // After the fee years, unused commitments go back to the LPs (never to the firm).
    if (age >= VC_FEE_YEARS) fund.dry = 0
  }
  for (const c of f.cos) {
    if (c.status !== 'live' || c.born >= fiscal) continue
    const fund = fundOf(c.fund)
    const r = fundRng(g, b, fiscal, `vc|${c.id}`)
    // A round announced last year closes now: invest pro-rata or take the dilution.
    if (c.round && c.round.year <= fiscal) {
      const round = c.round, want = proRata(c, round)
      const take = round.take === 1 || (round.take === -1 && autoFollow)
      if (take && fund && fund.dry >= want && want > 0) {
        fund.dry -= want; fund.invested += want; c.cost += want
      } else c.own = c.own * round.pre / (round.pre + round.size)
      c.val = round.pre + round.size
      c.stage = Math.min(STAGES.length - 1, round.stage)
      c.round = null
      if (!c.unicorn && c.val >= UNICORN) { c.unicorn = true; out.unicorns.push(c.id) }
      continue
    }
    const age = fiscal - c.born
    const q = c.q / 100
    const die = .04 + .22 * Math.pow(1 - q, 1.3) * (c.stage <= 1 ? 1.2 : .8) + (marketDown ? .04 : 0)
    const roll = r.next()
    const exitValue = (lo: number, hi: number) => c.val * (lo + r.next() * (hi - lo))
    if (age >= VC_LIFE || (fund?.done ?? false)) {
      sell(c, exitValue(.2, .6), 'secondary', fiscal)
    } else if (roll < die) {
      c.status = 'dead'; c.end = fiscal; c.how = DEATHS[Math.floor(r.next() * DEATHS.length)]; c.got = 0
      out.deaths.push(c.id)
      continue
    } else if (c.stage >= 2 && roll < die + .07 + q * .08) {
      sell(c, exitValue(.6, 1.6) * (.7 + q * .5), 'acquired', fiscal)
    } else if (c.stage >= 3 && c.val >= 3e8 && !marketDown && roll < die + .07 + q * .08 + .2 + q * .25) {
      sell(c, exitValue(1, 2.1), 'ipo', fiscal)
    } else if (c.stage < STAGES.length - 1 && r.next() < .15 + .35 * q) {
      const step = 1.3 + 1.7 * Math.pow(q, 1.5) * (.4 + .8 * r.next())
      const pre = Math.round(c.val * step)
      c.round = { stage: c.stage + 1, pre, size: Math.round(pre * (.18 + r.next() * .12)), year: fiscal + 1, take: -1 }
      continue
    } else {
      // A quiet year: maybe a flat or down mark, never cash.
      c.val = Math.max(1, c.val * (r.next() < .12 ? .6 : 1 + .08 * normal(r)))
      continue
    }
    // An exit: gross proceeds go to the fund, carry to the firm above the LPs' money back.
    if ((c.status as Startup['status']) === 'exit' && fund) {
      out.exits.push(c.id)
      out.carry += payCarry(fund, c.got)
      if (c.got / Math.max(1, c.cost) >= 10) out.bigExits.push(c.id)
      if (!c.unicorn && c.own > 0 && c.got / c.own >= UNICORN) { c.unicorn = true; out.unicorns.push(c.id) }
    }
  }
  // Funds past their life sell what's left and close.
  for (const fund of f.funds) {
    if (fund.done || fiscal - fund.vintage < VC_LIFE) continue
    if (f.cos.some(c => c.fund === fund.n && c.status === 'live')) continue
    fund.done = true; fund.dry = 0; fund.reserve = 0
  }
  return out
}

function sell(c: Startup, value: number, how: string, year: number): void {
  c.status = 'exit'; c.end = year; c.how = how
  c.got = Math.round(Math.max(0, value) * c.own)
  c.round = null
}
