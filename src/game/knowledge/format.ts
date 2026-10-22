// R3-H2 (H.1): what a menu prints for an estimate. One formatter for every unit, by the sd the reading was built from:
//
//   conf 3 (sd <= .06)  '$4.2M'         three significant digits
//   conf 2 (sd <= .15)  'about $4M'     one digit (two when the mantissa is under 2: 'about $1.4M')
//   conf 1 (sd <= .30)  '$3M to $5M'    one digit at each end, never the same twice (a second digit is added until they differ)
//   conf 0              a word          the caller's ladder, else a default for the unit ('in the millions', 'average', 'likely')
//
// Odds are the exception: below conf 2 they are words, 'about 65%' (the nearest 5) at conf 2 and '65%' at conf 3, so a percent
// only shows after a talent or a read. A delta (a signed amount) carries its sign and says 'roughly' before a range. Money goes
// through shortMoney, so the player's currency setting applies; every line is plain text without a dash character.
import { shortMoney, showMoney } from '../core'
import type { Ladder, Unit } from './types'

interface Band {
  mid: number
  lo: number
  hi: number
  conf: 0 | 1 | 2 | 3
}

const finite = (v: number): number => (Number.isFinite(v) ? v : 0)

/** v rounded to d significant digits. */
const sig = (v: number, d: number): number => (Number.isFinite(v) && v !== 0 ? Number(v.toPrecision(d)) : 0)

/** A plain number: thousands separators, no exponent, no float dust. */
function plain(v: number): string {
  const s = finite(v).toLocaleString('en-US', { maximumFractionDigits: 10 })
  return s === '-0' ? '0' : s
}

/** '$4.0M' to '$4M': a zero decimal that rounding left behind. */
const trimZero = (s: string): string => s.replace(/\.0(?![0-9])/, '')

/** The number a value starts with when written in scientific form: 4237000 is 4.237. */
function mantissa(v: number): number {
  const a = Math.abs(v)
  return a > 0 && Number.isFinite(a) ? a / 10 ** Math.floor(Math.log10(a)) : 0
}

/** One digit for 'about', two when the first digit would be 1 ('about $1.4M', not 'about $1M'). */
const aboutDigits = (v: number): number => (mantissa(v) < 2 ? 2 : 1)

/** [from, divisor, suffix]: thousands start at ten thousand, because 8,350 reads better than 8.4K. */
const COUNT_UNITS: ReadonlyArray<readonly [number, number, string]> = [
  [1e12, 1e12, 'T'],
  [1e9, 1e9, 'B'],
  [1e6, 1e6, 'M'],
  [1e4, 1e3, 'K'],
]

/**
 * A count the short way: 8,350 below ten thousand, then 46K, 4.2M, 3.1B. `ref` is the biggest number written next to this one
 * (the other end of a range), so both ends of '9K to 20K' use the same units.
 */
function shortCount(v: number, ref: number = v): string {
  const a = Math.abs(finite(v))
  const sign = v < 0 ? '-' : ''
  const big = Math.max(a, Math.abs(finite(ref)))
  for (const [from, div, s] of COUNT_UNITS) {
    if (big >= from && a >= div) {
      const x = a / div
      return sign + trimZero(x.toFixed(x >= 10 ? 0 : 1)) + s
    }
  }
  return sign + plain(a)
}

const moneyText = (v: number, d: number): string => trimZero(shortMoney(sig(v, d)))

function signedMoney(v: number, d: number): string {
  const t = moneyText(v, d)
  return v >= 0 ? `+${t}` : t
}

interface Kind {
  /** v written with d significant digits (score and odds: d 1 is the nearest 5, anything else whole numbers). `ref` is the other end of a range. */
  text(v: number, d: number, ref?: number): string
  /** How many digits an 'about' line carries. */
  about(v: number): number
}

const KINDS: Record<Unit, Kind> = {
  money: { text: moneyText, about: aboutDigits },
  count: { text: (v, d, ref) => shortCount(sig(v, d), ref === undefined ? undefined : sig(ref, d)), about: aboutDigits },
  pct: { text: (v, d) => `${plain(sig(v * 100, d))}%`, about: (v) => aboutDigits(v * 100) },
  score: { text: (v, d) => String(d === 1 ? Math.round(v / 5) * 5 : Math.round(v)), about: () => 1 },
  odds: { text: (v, d) => `${d === 1 ? Math.round(v * 20) * 5 : Math.round(v * 100)}%`, about: () => 1 },
  delta: { text: signedMoney, about: aboutDigits },
}

/** The two ends of a range, written with as few digits as keep them apart (1 to 4). */
function rangeText(k: Kind, lo: number, hi: number): [string, string] {
  for (let d = 1; d <= 4; d++) {
    const ref = Math.max(Math.abs(lo), Math.abs(hi))
    const a = k.text(lo, d, ref)
    const b = k.text(hi, d, ref)
    if (a !== b) return [a, b]
  }
  const ref = Math.max(Math.abs(lo), Math.abs(hi))
  return [k.text(lo, 4, ref), k.text(hi, 4, ref)]
}

// Defaults for the words (conf 0), by unit. A ladder entry is [upper bound, word]; the last word catches the rest.
const MONEY_LADDER: Ladder = [
  [1e3, 'under a thousand'],
  [1e4, 'in the thousands'],
  [1e5, 'in the tens of thousands'],
  [1e6, 'in the hundreds of thousands'],
  [1e7, 'in the millions'],
  [1e8, 'in the tens of millions'],
  [1e9, 'in the hundreds of millions'],
  [1e10, 'in the billions'],
  [1e11, 'in the tens of billions'],
  [1e12, 'in the hundreds of billions'],
  [Infinity, 'in the trillions'],
]
const COUNT_LADDER: Ladder = [
  [10, 'a handful'],
  [100, 'dozens'],
  [1e3, 'hundreds'],
  [1e4, 'thousands'],
  [1e5, 'tens of thousands'],
  [1e6, 'hundreds of thousands'],
  [1e7, 'millions'],
  [1e8, 'tens of millions'],
  [1e9, 'hundreds of millions'],
  [Infinity, 'billions'],
]
const PCT_LADDER: Ladder = [
  [0.03, 'a sliver'],
  [0.1, 'a small slice'],
  [0.25, 'a fair slice'],
  [0.5, 'a big slice'],
  [Infinity, 'most of it'],
]
const SCORE_LADDER: Ladder = [
  [20, 'poor'],
  [40, 'below par'],
  [60, 'average'],
  [80, 'strong'],
  [Infinity, 'outstanding'],
]
const ODDS_LADDER: Ladder = [
  [0.1, 'a long shot'],
  [0.3, 'unlikely'],
  [0.47, 'less likely than not'],
  [0.58, 'even money'],
  [0.8, 'likely'],
  [0.93, 'very likely'],
  [Infinity, 'close to certain'],
]

function ladderWord(ladder: Ladder, v: number): string {
  for (const [cut, word] of ladder) if (v < cut) return word
  return ladder[ladder.length - 1]![1]
}

/** The size of a money amount as the player sees it (so the word follows the currency, not the dollars). */
const shownAmount = (v: number): number => finite(Math.abs(showMoney(v).amount))

function defaultWord(unit: Unit, mid: number): string {
  switch (unit) {
    case 'money':
      return ladderWord(MONEY_LADDER, shownAmount(mid))
    case 'count':
      return ladderWord(COUNT_LADDER, Math.abs(finite(mid)))
    case 'pct':
      return ladderWord(PCT_LADDER, finite(mid))
    case 'score':
      return ladderWord(SCORE_LADDER, finite(mid))
    case 'odds':
      return ladderWord(ODDS_LADDER, finite(mid))
    case 'delta': {
      const size = shownAmount(mid)
      if (size < 1e3) return 'about breakeven'
      return `${mid >= 0 ? 'a gain' : 'a loss'} ${ladderWord(MONEY_LADDER, size)}`
    }
  }
}

/** The line a menu prints for a reading of this unit and confidence. `ladder` is the caller's own words for conf 0. */
export function wordsFor(unit: Unit, e: Band, ladder?: Ladder): string {
  const k = KINDS[unit]
  const words = (): string => (ladder && ladder.length > 0 ? ladderWord(ladder, finite(e.mid)) : defaultWord(unit, e.mid))
  if (unit === 'odds' && e.conf <= 1) return words()
  switch (e.conf) {
    case 3:
      return k.text(e.mid, 3)
    case 2:
      return `about ${k.text(e.mid, k.about(e.mid))}`
    case 1: {
      const [a, b] = rangeText(k, e.lo, e.hi)
      return `${unit === 'delta' ? 'roughly ' : ''}${a} to ${b}`
    }
    default:
      return words()
  }
}

/** What an exact estimate carries in `words`: the truth, written the compact way. Callers keep their own text for an exact value. */
export function exactWords(unit: Unit, v: number): string {
  const x = finite(v)
  switch (unit) {
    case 'money':
      return trimZero(shortMoney(x))
    case 'count':
      return shortCount(x)
    case 'pct':
      return `${plain(sig(x * 100, 3))}%`
    case 'score':
      return String(Math.round(x))
    case 'odds':
      return `${Math.round(x * 100)}%`
    case 'delta':
      return `${x >= 0 ? '+' : ''}${trimZero(shortMoney(x))}`
  }
}
