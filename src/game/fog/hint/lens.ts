// R3-G11 (H.11): the hint lens. A purple hint is a talent's gut, so it is honest and it is fallible. Two helpers do all of it, and the
// 207 hint sites do not change:
//
//   talentHint  (talents.ts) runs the text of a hint through the port talents.hintLens, which this file binds. In Realistic mode a
//               number that follows "about", "roughly", "around" or "~" (a money amount in the money the player reads, a percent,
//               or "N years"; and a percent that says it is a chance in words: "12% chance of ...", "40% to fund", "70% they say yes")
//               is replaced by what the talent reads for it: a hashed draw around the true figure, through
//               know() with a hint: key. The talent narrows the draw (Knowledge's rule table: x.6 with the talent, and Main
//               Character has every talent), so a hint is closer than a guess and never exact.
//   markBest    (business/util.ts) ranks its options by rankNoise, the same draw on each option's value, so a close call can flip.
//
//   exact   Exact mode returns the text as it came (and the value as it came): the suite runs there
//   honest  the figure shown holds the truth in the 80% band the Estimate states (test/fog-hint-lens.test.ts, 10,000 lives)
//   stable  the draw is a hash of (life, key, year): the key is the hint's owner talent, the hash of its WORDS (every digit run
//           masked) and the place of the figure in the text, so the same text in the same year reads the same, a value that
//           drifts inside the year moves the reading with it instead of re-rolling it, and a new year reads a new number
//   shape   the same currency shape and unit letter (K, M, B), at most three significant digits, a whole percent of 10 or more to
//           the nearest 5, a percent below 10 or with decimals in its own shape, "a" or "an" and "year" or "years" kept right;
//           a figure the talent cannot be fuzzy about is left alone (a limit written without "about", a year, a horizon, a quoted
//           "(62% odds" from the research quote, "quality ~4", a count of things)
//   pure    nothing is written and g.rng is never read; this file has no way to draw but know()
//
// Not here: a number a screen already read through know() (its text is words or a range) must not go through a hint as well, it
// would be fogged twice. The Investing gut (invest/instinct.ts) keeps its own noise.
import { showMoney } from '../../core'
import { hashKey } from '../../kernel/streams'
import { isExact, know } from '../../knowledge/contract'
import type { Unit } from '../../knowledge/contract'
import { HINT_EMOJI, hintLens } from '../../talents'
import type { GameState } from '../../types'

/** At most this many significant digits are shown: a gut with a 12% sd does not know the fourth digit. */
const MAX_SIG = 3
/** A figure beyond these is not a hint figure (and is never rewritten into an exponent). */
const BIG_PERCENT = 1e6
const BIG_YEARS = 1e4
const BIG_MONEY = 1e36

const SIGN = '[-+\\u2212]'
const NUM = '\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?'
const UNIT = 'K|M|B|T| quadrillion| quintillion| sextillion| septillion| octillion| nonillion'

/** The unit letters of core.ts compactMoney, largest first. */
const UNITS: ReadonlyArray<readonly [number, string]> = [
  [1e30, ' nonillion'],
  [1e27, ' octillion'],
  [1e24, ' septillion'],
  [1e21, ' sextillion'],
  [1e18, ' quintillion'],
  [1e15, ' quadrillion'],
  [1e12, 'T'],
  [1e9, 'B'],
  [1e6, 'M'],
  [1e3, 'K'],
]
const SCALE: Readonly<Record<string, number>> = Object.freeze({ '': 1, ...Object.fromEntries(UNITS.map(([v, s]): [string, number] => [s, v])) })

/** What can lead a figure: "about ", "roughly ", "around " (any case) or "~". */
const LEAD = /(?<![A-Za-z0-9_$])(?:about|roughly|around)\s+|~\s?/gi
/**
 * A percent that names a chance without a lead word: what follows it says so ("12% chance of an offer", "40% to fund", "70% they say
 * yes", "20% delivery trouble", "10% of getting some money back"). "odds" is not here: "(62% odds" is the research quote, which reads
 * through the reveal policy (effort/why.ts), and a rate or a share ("15% of the market", "30% margin") is a figure, not a chance.
 */
const CHANCE_FIG = /(?<![A-Za-z0-9_.$])\d+(?:\.\d+)?%/g
const CHANCE_TAIL = /^\s*(?:chance\b|to\s+(?:fund|win|beat|calm|work|pass|land|succeed)\b|they\s+say\b|delivery\s+trouble\b|of\s+getting\b)/i
const PCT = new RegExp(`(an?\\s+)?(${SIGN}?)(\\d+(?:\\.\\d+)?)%`, 'y')
const YEARS = /(\d+(?:\.\d+)?)(\s+)(years?)(?![A-Za-z0-9-])/y
const DIGITS = /\d[\d,]*(?:\.\d+)?/g

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const hash36 = (s: string): string => (hashKey(s) >>> 0).toString(36)
/** The text with every figure masked: the words a hint is made of, whatever its numbers are today. */
export const maskFigures = (s: string): string => s.replace(DIGITS, '#')

/** A part of a key: letters, digits and . _ ~ - only, short. */
const part = (s: string): string => s.replace(/[^A-Za-z0-9._~-]/g, '_').slice(0, 20) || '_'

/** The two shapes a money text can take in the money the player reads now, as sticky patterns. */
interface MoneyRes {
  prefix: RegExp | null
  suffix: RegExp | null
}
const moneyCache = new Map<string, MoneyRes>()

function moneyRes(): MoneyRes {
  const m = showMoney(1_000_000)
  const sym = typeof m.symbol === 'string' ? m.symbol : '$'
  const key = `${m.suffix ? 1 : 0}${m.space ? 1 : 0}|${sym}`
  const hit = moneyCache.get(key)
  if (hit) return hit
  const s = escape(sym)
  const res: MoneyRes = m.suffix
    ? { prefix: null, suffix: new RegExp(`(${SIGN}?)(${NUM})(${UNIT})?( ${s})(?![A-Za-z0-9])`, 'y') }
    : { prefix: new RegExp(`(${SIGN}?${s}${m.space ? ' ?' : ''})(${NUM})(${UNIT})?(?![A-Za-z0-9])`, 'y'), suffix: null }
  if (moneyCache.size > 64) moneyCache.clear()
  moneyCache.set(key, res)
  return res
}

/** One figure found after a lead: what it is worth, in which unit, and how to write a new reading in its shape. */
interface Hit {
  /** The index after the figure. */
  end: number
  unit: Unit
  /** > 0, in the unit's own terms (a percent as a fraction). */
  truth: number
  /** The replacement for text.slice(from, end), or null to leave the figure alone. */
  render(mid: number): string | null
}

const decimalsOf = (s: string): number => (s.includes('.') ? s.length - s.indexOf('.') - 1 : 0)
const sigOf = (s: string): number => Math.min(MAX_SIG, Math.max(1, s.replace(/[^0-9]/g, '').replace(/^0+/, '').length))
const roundSig = (v: number, sig: number): number => Number(v.toPrecision(sig))
const intDigits = (v: number): number => String(Math.floor(Math.abs(v))).length
/** "an" in front of 8, 11, 18, 80 to 89 (the rule of business/util.ts aPct). */
const isAn = (p: string): boolean => /^8/.test(p) || /^1[18]%/.test(p)

function readPercent(text: string, at: number): Hit | null {
  PCT.lastIndex = at
  const m = PCT.exec(text)
  if (!m) return null
  const value = Number(m[3])
  if (!(value > 0) || value > BIG_PERCENT) return null
  const article = m[1]
  const sign = m[2] ?? ''
  const dec = decimalsOf(m[3]!)
  return {
    end: at + m[0].length,
    unit: 'pct',
    truth: value / 100,
    render(mid) {
      const p = mid * 100
      if (!Number.isFinite(p) || p <= 0) return null
      let body: string
      if (dec > 0) body = p.toFixed(dec)
      else if (value >= 10) {
        let n = Math.max(5, Math.round(p / 5) * 5)
        // a percent below 100 never reads as a certainty
        if (value < 100 && n >= 100) n = 95
        body = String(n)
      } else body = String(Math.max(1, Math.round(p)))
      const art = article ? (isAn(`${body}%`) ? 'an ' : 'a ') : ''
      return `${art}${sign}${body}%`
    },
  }
}

function readYears(text: string, at: number): Hit | null {
  YEARS.lastIndex = at
  const m = YEARS.exec(text)
  if (!m) return null
  const value = Number(m[1])
  if (!(value > 0) || value > BIG_YEARS) return null
  const dec = decimalsOf(m[1]!)
  return {
    end: at + m[0].length,
    unit: 'count',
    truth: value,
    render(mid) {
      if (!Number.isFinite(mid) || mid <= 0) return null
      const body = dec > 0 ? mid.toFixed(dec) : String(Math.max(1, Math.round(mid)))
      return `${body}${m[2]}${Number(body) === 1 ? 'year' : 'years'}`
    },
  }
}

function readMoney(text: string, at: number, res: MoneyRes): Hit | null {
  let m: RegExpExecArray | null = null
  let pre = ''
  let post = ''
  let numText = ''
  let unitText = ''
  if (res.prefix) {
    res.prefix.lastIndex = at
    m = res.prefix.exec(text)
    if (m) {
      pre = m[1] ?? ''
      numText = m[2] ?? ''
      unitText = m[3] ?? ''
    }
  } else if (res.suffix) {
    res.suffix.lastIndex = at
    m = res.suffix.exec(text)
    if (m) {
      pre = m[1] ?? ''
      numText = m[2] ?? ''
      unitText = m[3] ?? ''
      post = m[4] ?? ''
    }
  }
  if (!m) return null
  const scale = SCALE[unitText]
  const truth = Number(numText.replace(/,/g, '')) * (scale ?? 0)
  if (scale === undefined || !(truth > 0) || !Number.isFinite(truth) || truth > BIG_MONEY) return null
  const sig = sigOf(numText)
  const dec0 = decimalsOf(numText)
  const compact = unitText !== ''
  return {
    end: at + m[0].length,
    unit: 'money',
    truth,
    render(mid) {
      if (!Number.isFinite(mid) || mid <= 0) return null
      const r = roundSig(mid, sig)
      let body: string
      const big = compact && r >= 1e4 ? UNITS.find(([v]) => r >= v) : undefined
      if (big) {
        const mant = r / big[0]
        body = `${mant.toFixed(Math.max(0, sig - intDigits(mant)))}${big[1]}`
      } else {
        // the digits after the point that keep `sig` significant digits ($0.41 keeps its cents), never more than the text had
        const dec = Math.min(dec0, Math.max(0, sig - 1 - Math.floor(Math.log10(r))))
        body = r.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })
      }
      return `${pre}${body}${post}`
    },
  }
}

/** The figure after a lead, in whichever of the three shapes it is written, or null. The money patterns are built only when the first two fail. */
function readAt(text: string, at: number): Hit | null {
  return readPercent(text, at) ?? readYears(text, at) ?? readMoney(text, at, moneyRes())
}

/** Where a figure to read starts: after each lead word, and at each percent that names a chance in words (the same place counts once). */
function starts(text: string): number[] {
  const out = new Set<number>()
  for (const lead of text.matchAll(LEAD)) out.add((lead.index ?? 0) + lead[0].length)
  for (const m of text.matchAll(CHANCE_FIG)) {
    const at = m.index ?? 0
    if (CHANCE_TAIL.test(text.slice(at + m[0].length))) out.add(at)
  }
  return [...out].sort((a, b) => a - b)
}

function rewrite(g: GameState, id: string, text: string): string {
  const froms = starts(text)
  if (froms.length === 0) return text
  const key = `hint:${part(id)}:${hash36(maskFigures(text))}`
  let out = ''
  let cursor = 0
  let n = 0
  for (const from of froms) {
    if (from < cursor) continue
    const hit = readAt(text, from)
    if (!hit) continue
    const est = know(g, `${key}:${n++}`, hit.truth, { unit: hit.unit, talent: id })
    if (est.exact) continue
    const shown = hit.render(est.mid)
    if (shown === null) continue
    out += text.slice(cursor, from) + shown
    cursor = hit.end
  }
  return cursor === 0 ? text : out + text.slice(cursor)
}

/**
 * The text of a purple hint as the talent reads it: in Exact mode the text itself; in Realistic every figure after "about",
 * "roughly", "around" or "~" replaced by a reading of it (see the header). A text that already carries the purple emoji is a hint
 * that has been through here, and is left alone. Never throws.
 */
export function lensHint(g: GameState, id: string, text: string): string {
  if (isExact() || typeof text !== 'string' || text.length === 0 || text.startsWith(HINT_EMOJI)) return text
  try {
    return rewrite(g, id, text)
  } catch {
    return text
  }
}

/**
 * "about " in Realistic and nothing in Exact: the lead a hint site writes before a figure its words cannot mark (an emoji list, "62%
 * odds"), so the lens reads it and the Exact text is the text it always was.
 */
export function hintLead(): string {
  return isExact() ? '' : 'about '
}

/** A chance, 0 to 1, as a hint site writes it: "12%" in Exact, "about 12%" in Realistic (read once by the lens). */
export function hintPct(p: number): string {
  const v = Number.isFinite(p) ? Math.min(1, Math.max(0, p)) : 0
  return `${hintLead()}${Math.round(v * 100)}%`
}

/**
 * The value markBest ranks an option by: the true value in Exact mode; in Realistic the talent's reading of it, a draw around the
 * value (additive, the size of the value itself), so two close options can swap places. `key` names the option within its menu
 * (the same menu in the same year reads the same); a zero, a figure that is not finite and any failure return the value.
 */
export function rankNoise(g: GameState, key: string, v: number): number {
  if (isExact() || !Number.isFinite(v) || v === 0) return v
  try {
    const est = know(g, `hint:rk${hash36(key)}:rank`, v, { unit: 'delta', talent: 'Business', scale: Math.abs(v) })
    return !est.exact && Number.isFinite(est.mid) ? est.mid : v
  } catch {
    return v
  }
}

// The lens is the owner of the port; talents.ts (L0) only calls it. Bound when this file loads (modules/index.ts imports it for the
// effect, and so does every file that reaches it through fog/hint/contract.ts).
hintLens.use(lensHint)
