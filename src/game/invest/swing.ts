// R3-G9 (H.8): how much a stock, a penny stock or a coin swings in a year is a number the player cannot see. In Realistic mode the
// screens that used to print "swings ~18% a year" read it through the estimate core (knowledge/contract.ts) and say it in words
// with a confidence chip; a range shows with the Investing talent or after an analyst has looked at it. In Exact mode, and for a
// security with nothing to swing, the text is today's, byte for byte.
//
//   swingRead(g, secId, vol)   the phrase a row prints: 'a choppy ride', 'swings 15% to 21% a year', or 'swings ~18% a year' (Exact)
//   analystNote(g, secId)      what a hired analyst said about the swing, or null (none hired, no longer fresh, Exact mode)
//   swingRow / swingLook       the stock screen's info row (with the chip) and its Look closer group
//   swingKey / swingTruth      the key `sec:<hash of secId>:vol` and the real swing behind it (a Look closer read finds its truth here)
//   stockVolOf / coinVolOf     the yearly swing the menus have always used, now in one place
//
// The key. A security id such as 'TSE:Nikkei 225#s3g0' has colons and spaces, which a knowledge key cannot carry, so the key holds
// a short hash of it. The kind `sec` is registered below with the truth of every security the player can trade today.
//
// Foresight. Everything here reads the market of g.year and earlier: the truth is the swing of the company as it is built this year,
// an analyst's note is a stored reading, and nothing asks the engine for a later year (the Investing gut, invest/instinct.ts, is the
// one place that does; test/foresight-scan.test.ts fences it). A read never draws: the estimate is a hashed draw (knowledge/normal.ts).
import { hashKey } from '../kernel/streams'
import { isExact, know, lookCloser, registerKeyKind, type Estimate } from '../knowledge/contract'
import { timelineFamily } from '../timeMachine'
import type { GameState, MenuGroup, MenuInfo } from '../types'
import { coinDef, companyDef, cryptoYear, eraIdentity, exchangeInfo, exchangeYear, pennyDef, type ExInfo, type SecurityDef } from './engine'

/** A piece of a menu row and the confidence behind it (both left out in Exact mode). */
export interface Fogged {
  text: string
  conf?: 0 | 1 | 2 | 3
  asOf?: number
}

const clamp = (n: number, lo: number, hi: number): number => (Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo)

/** The yearly swing of a listed company: its beta to the market's mood and its own ups and downs, added as squares. */
export function stockVolOf(info: ExInfo, def: SecurityDef): number {
  const v = clamp(info.ex.volatility, 0.05, 0.8)
  return Math.sqrt((def.beta * v * 0.85) ** 2 + def.idio ** 2)
}

/** The yearly swing of a coin (a stablecoin has none): beta to the crypto market and its own ups and downs, held to 200%. */
export function coinVolOf(def: { stable: boolean; beta: number; idio: number }): number {
  return def.stable ? 0 : Math.min(2, Math.sqrt((def.beta * 0.5) ** 2 + def.idio ** 2))
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Words

/** The words, mildest first. */
export const SWING_WORDS = ['steady', 'choppy', 'wild', 'extreme'] as const
export type SwingWord = (typeof SWING_WORDS)[number]

/** Where each word ends, as a yearly swing: under 18% is steady, under 32% choppy, under 55% wild, and the rest extreme. */
const SWING_CUTS = [0.18, 0.32, 0.55] as const

/** The word for a yearly swing (a fraction of 1: .2 is 20%). */
export function swingWord(vol: number): SwingWord {
  const v = Number.isFinite(vol) ? vol : 0
  const i = SWING_CUTS.findIndex((cut) => v < cut)
  return SWING_WORDS[i < 0 ? SWING_WORDS.length - 1 : i]!
}

/** A swing as a whole percent, the way the menus have always written it: '18%', '0%' for next to nothing. */
function wholePct(x: number): string {
  const s = (Number.isFinite(x) ? Math.abs(x) * 100 : 0).toFixed(0)
  return Number(s) === 0 ? '0%' : `${s}%`
}

/** The 80% band of a reading as words: '15% to 21%', or 'about 18%' when both ends round to the same percent. */
function bandText(e: Pick<Estimate, 'lo' | 'hi' | 'mid'>): string {
  const lo = wholePct(e.lo)
  const hi = wholePct(e.hi)
  return lo === hi ? `about ${lo}` : `${lo} to ${hi}`
}

/** The phrase an estimate reads as: a word while it is loose (conf 0 and 1), the band once it is sharper (conf 2 and 3). */
function phrase(e: Estimate): string {
  if (e.conf >= 2) return `swings ${bandText(e)} a year`
  const w = swingWord(e.mid)
  return `${w === 'extreme' ? 'an' : 'a'} ${w} ride`
}

const aged = (e: Estimate): Pick<Fogged, 'asOf'> => (e.asOf !== undefined ? { asOf: e.asOf } : {})

// ---------------------------------------------------------------------------------------------------------------------------------
// The key, the securities and their truths

/** The part of a key that names one security: a short hash of its id. */
export const secTag = (secId: string): string => (hashKey(secId) >>> 0).toString(36)

/** The key of one security's yearly swing. */
export const swingKey = (secId: string): string => `sec:${secTag(secId)}:vol`

interface Sec {
  secId: string
  key: string
  name: string
  vol: number
}

const family = (g: GameState): string => timelineFamily(g, (g.lifeId || 'life').replace(/-g\d+$/, ''))

/** The first year of the family's market history (the same as investments.ts and computer/money-common.ts). */
function anchorYear(g: GameState): number {
  const first = g.ancestors?.[0]?.bornYear
  const own = g.year - g.character.age
  const a = typeof first === 'number' && Number.isFinite(first) ? Math.min(first, own) : own
  return Number.isFinite(a) ? a : g.year
}

const entry = (secId: string, name: string, vol: number): Sec => ({ secId, key: swingKey(secId), name, vol })

/** Every company, penny stock and coin on the player's market this year, with the swing it really has. Pure: it asks the engine for g.year and no later year. */
function securities(g: GameState): Sec[] {
  const info = exchangeInfo(g.character.countryId)
  const f = family(g)
  const an = anchorYear(g)
  const y = g.year
  const ey = exchangeYear(f, an, info, y)
  const out: Sec[] = []
  for (const s of ey.stocks) {
    const def = companyDef(info, s.slot, s.gen)
    out.push(entry(def.id, eraIdentity(def, y).name, stockVolOf(info, def)))
  }
  for (const s of ey.pennies) {
    const def = pennyDef(info, s.slot, s.gen)
    out.push(entry(def.id, eraIdentity(def, y).name, stockVolOf(info, def)))
  }
  for (const c of cryptoYear(f, an, y).coins) {
    const def = coinDef(c.slot, c.gen)
    out.push(entry(def.id, def.name, coinVolOf(def)))
  }
  return out
}

/** The yearly swing a security really has this year, or null when it is not one the player can trade here. */
export function swingTruth(g: GameState, secId: string): number | null {
  const hit = securities(g).find((s) => s.secId === secId)
  return hit ? hit.vol : null
}

/** The security behind a key, or null when there is none today or two share the tag (a hash clash is a read nobody can buy). */
function secOfKey(g: GameState, key: string): Sec | null {
  const hits = securities(g).filter((s) => s.key === key)
  return hits.length === 1 ? hits[0]! : null
}

registerKeyKind({
  kind: 'sec',
  label: (g, key) => {
    const s = secOfKey(g, key)
    return s ? `${s.name} swings` : 'How much a stock swings'
  },
  truth: (g, key) => {
    const s = secOfKey(g, key)
    return s && s.vol > 0 ? s.vol : null
  },
})

// ---------------------------------------------------------------------------------------------------------------------------------
// What a screen prints

/**
 * How much a security swings in a year, as the row says it. `vol` is the real swing; in Exact mode the phrase is the old one
 * ('swings ~18% a year') and carries no confidence. Realistic: a word ('a wild ride') until the reading is sharp enough for a range.
 */
export function swingRead(g: GameState, secId: string, vol: number): Fogged {
  const e = know(g, swingKey(secId), vol)
  if (e.exact) return { text: `swings ~${wholePct(vol)} a year` }
  return { text: phrase(e), conf: e.conf, ...aged(e) }
}

/** The sources whose reading is an analyst's: one hired for the day, or the desk on retainer. */
const ANALYSTS: readonly string[] = ['analyst', 'desk']

/**
 * What an analyst you hired said about this security's swing, or null: nothing hired, the reading has aged past what the plain read
 * would say, the security is not on the market any more, or the game is in Exact mode. Present and past only: it is the stored
 * reading, never a look ahead.
 */
export function analystNote(g: GameState, secId: string): string | null {
  if (isExact()) return null
  const s = securities(g).find((x) => x.secId === secId)
  if (!s || !(s.vol > 0)) return null
  const e = know(g, s.key, s.vol)
  if (e.exact || !e.src.split('+').some((src) => ANALYSTS.includes(src))) return null
  return `An analyst puts the yearly swing of ${s.name} at ${bandText(e)}${e.asOf !== undefined ? `, as of ${e.asOf}` : ''}.`
}

const sentence = (text: string): string => (text.startsWith('swings') ? `${text[0]!.toUpperCase()}${text.slice(1)}.` : `Year to year, it's ${text}.`)

/**
 * The row on a stock's, penny stock's or coin's screen: how much it swings, with the chip. The analyst's note stands in for the plain
 * line once one was bought. Null in Exact mode (the screen is as it always was) and for a security with nothing to swing.
 */
export function swingRow(g: GameState, secId: string): MenuInfo | null {
  if (isExact()) return null
  const vol = swingTruth(g, secId)
  if (vol === null || !(vol > 0)) return null
  const read = swingRead(g, secId, vol)
  return {
    type: 'info',
    id: `inv-oswing-${secId}`,
    text: analystNote(g, secId) ?? sentence(read.text),
    ...(read.conf !== undefined ? { conf: read.conf } : {}),
    ...(read.asOf !== undefined ? { asOf: read.asOf } : {}),
  }
}

/** The Look closer group for one security's swing (an analyst, the trade press, your own homework), or null. */
export function swingLook(g: GameState, secId: string): MenuGroup | null {
  const vol = swingTruth(g, secId)
  if (vol === null || !(vol > 0)) return null
  return lookCloser(g, { id: `swing.${secTag(secId)}`, keys: [swingKey(secId)] })
}
