// Roles for relatives at the company: six ranks from intern to CEO, how hard each one is, what it
// pays in this country, what it is called in this year, and who is old enough. Pure helpers: no
// randomness, nothing here changes the game.
import { seeded } from '../assets'
import { gateHolds } from '../events/era'
import type { GameState, Person } from '../types'
import { ceoPayNorm } from './career'
import { localPay, niceAmount } from './economy'
import { industryDef, type StaffFocus } from './industries'
import { MAX_RANK, seedKey } from './nepo-job'
import { totalOutlets, type BizState } from './state'
import { clampN } from './util'

export interface RankDef {
  rank: number
  /** How demanding the job is, 0-100: the skill that does it well (a CEO of a real company needs ~85). */
  difficulty: number
  /** Pay as a multiple of the going rate for a solid key hire in this industry. */
  payMult: number
  /** How much one person at this rank moves the company's numbers at full fit (share of demand). */
  weight: number
  /** Youngest age the job is offered at. */
  minAge: number
  /** Executive jobs go to the board when there is one. */
  executive: boolean
}

export const RANKS: readonly RankDef[] = [
  { rank: 0, difficulty: 15, payMult: 0.45, weight: 0.004, minAge: 14, executive: false },
  { rank: 1, difficulty: 35, payMult: 0.8, weight: 0.008, minAge: 18, executive: false },
  { rank: 2, difficulty: 55, payMult: 1.35, weight: 0.016, minAge: 19, executive: false },
  { rank: 3, difficulty: 68, payMult: 2.1, weight: 0.028, minAge: 20, executive: false },
  { rank: 4, difficulty: 78, payMult: 3.4, weight: 0.045, minAge: 21, executive: true },
  { rank: 5, difficulty: 85, payMult: 1, weight: 0, minAge: 21, executive: true },
]

export function rankDef(rank: number): RankDef {
  return RANKS[Math.round(clampN(rank, 0, MAX_RANK))]
}

/** Most a rank earns, as a share of the going CEO pay (so the ladder always ends at the CEO). */
const CEO_SHARE: readonly number[] = [0.25, 0.35, 0.5, 0.65, 0.82]

/** Pay above this multiple of the going rate is "above market" (the board and the tax office notice). */
export const ABOVE_MARKET = 1.5

/** The most a relative can be paid, as a multiple of the going rate (the pay slider's top). */
export const MAX_PAY_MULT = 4

/** Pay for a part-time summer job (a minor) as a share of the full rate. */
export const PART_TIME_SHARE = 0.3

function departmentWord(g: GameState, focus: StaffFocus): string {
  switch (focus) {
    case 'sales':
      return g.year >= 1960 ? 'Sales & Marketing' : 'Sales'
    case 'quality':
      return 'Quality'
    case 'finance':
      return 'Finance'
    default:
      return 'Operations'
  }
}

function shortDepartment(g: GameState, focus: StaffFocus): string {
  return focus === 'sales' ? 'Sales' : departmentWord(g, focus)
}

/** The entry-level word: apprentice before 1950, trainee until 1980, intern since (no interns in the 1930s). */
export function internWord(g: GameState): string {
  return g.year < 1950 ? 'Apprentice' : g.year < 1980 ? 'Trainee' : 'Intern'
}

/** The rank's title in this year ('Sales Intern', 'Finance Clerk', 'VP of Operations', 'CEO'). */
export function rankTitle(g: GameState, rank: number, focus: StaffFocus): string {
  const dept = shortDepartment(g, focus)
  switch (Math.round(rank)) {
    case 0:
      return `${dept} ${internWord(g)}`
    case 1:
      return `${dept} ${g.year < 1960 ? 'Clerk' : 'Associate'}`
    case 2:
      return g.year < 1960 ? `Head of ${dept}` : `${dept} Manager`
    case 3:
      return g.year < 1960 ? `Senior ${dept} Manager` : `${dept} Director`
    case 4:
      return `${g.year < 1960 ? 'Vice President' : 'VP'} of ${dept}`
    default:
      return 'CEO'
  }
}

const CUSHY_OLD = ['Special Assistant to the Chairman', 'Liaison Officer', 'Consultant to the Board', 'Director of Special Duties']
const CUSHY_MID = ['Director of Special Projects', 'Consultant for Strategic Planning', 'Head of Corporate Relations', 'Vice President of Miscellaneous Affairs']
const CUSHY_NEW = ['Head of Strategic Initiatives', 'Director of Special Projects', 'Chief Innovation Advisor', 'Brand Ambassador', 'VP of Synergy']
const CUSHY_SOCIAL = ['Head of Culture and Vibes', 'Chief Brand Storyteller', 'Director of Creator Partnerships']

/** A made-up job title that fits the year (stable for a person: no randomness). */
export function cushyTitle(g: GameState, p: Person): string {
  const s = seeded(`cushy|${seedKey(p)}`)
  const pool = g.year < 1970 ? CUSHY_OLD : g.year < 2000 ? CUSHY_MID : gateHolds(g, 'socialMedia') ? [...CUSHY_NEW, ...CUSHY_SOCIAL] : CUSHY_NEW
  return s.pick(pool)
}

/** The title a person has now (a cushy job keeps its made-up title). */
export function titleFor(g: GameState, p: Person, rank: number, focus: StaffFocus, kind: 'real' | 'cushy'): string {
  return kind === 'cushy' ? cushyTitle(g, p) : rankTitle(g, rank, focus)
}

/** US pay of a solid key hire in this industry (the average of its leadership roles). */
function industryBase(b: BizState): number {
  const roles = industryDef(b.industry).roles
  if (!roles.length) return 45_000
  return roles.reduce((s, r) => s + r.pay, 0) / roles.length
}

/**
 * What this rank earns at this company on the open market (engine dollars a year): the industry's
 * pay for a solid hire in this country, times the rank, a little more at a big company. The CEO
 * rank is the going CEO pay.
 */
export function marketPay(b: BizState, rank: number): number {
  const r = rankDef(rank)
  if (r.rank >= 5) return Math.max(1, ceoPayNorm(b))
  const size = 1 + 0.2 * Math.log10(1 + totalOutlets(b))
  const v = localPay(b.countryId, industryBase(b) * r.payMult) * size
  // Nobody below the CEO out-earns the CEO: each rank is held under a share of the going CEO pay.
  const ceiling = ceoPayNorm(b) * CEO_SHARE[Math.min(CEO_SHARE.length - 1, r.rank)]
  return Math.max(1, niceAmount(Math.min(v, ceiling)))
}

/** What the job pays a relative who starts at the going rate (a summer job pays a fraction). */
export function startingPay(b: BizState, rank: number, part: boolean): number {
  const full = marketPay(b, rank)
  return part ? Math.max(1, niceAmount(full * PART_TIME_SHARE)) : full
}

/** The pay a company would offer for this job at x times the going rate. */
export function payAt(b: BizState, rank: number, mult: number): number {
  return Math.max(1, niceAmount(marketPay(b, rank) * clampN(mult, 0.5, MAX_PAY_MULT)))
}

/** The department that suits a person (their temperament; stable, no randomness). */
export function defaultFocus(p: Person): StaffFocus {
  const t = (x: string) => p.traits.includes(x)
  if (t('outgoing') || t('funny') || t('flirty') || t('manipulative')) return 'sales'
  if (t('artistic') || t('perfectionist') || t('romantic')) return 'quality'
  if (t('serious') || t('stingy') || t('nerdy') || t('honest')) return 'finance'
  if (t('sporty') || t('ambitious') || t('calm')) return 'ops'
  return seeded(`focus|${seedKey(p)}`).pick(['ops', 'sales', 'quality', 'finance'] as const)
}

/** Why a person is too young for this rank (null: old enough). */
export function ageBlock(p: Person, rank: number): string | null {
  const need = rankDef(rank).minAge
  return p.age < need ? `${p.firstName} is too young for that job (${need} and up).` : null
}
