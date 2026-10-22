// Market signals and the one hedged analyst read of them (R3-H8, H.13).
//
// The Financial News already says what moved. This adds a single line in the analysts' voice that points at the one
// present signal worth a second look, with a confidence hedge and no direction: it never says buy, sell or which way the
// market goes next. Direction stays with the free tip (seededTip, a coin flip about the year to come) and with the
// Investing talent's gut (invest/instinct.ts, the one reader allowed to look ahead). This file reads this year and last,
// never a year after g.year: the foresight scan (test/foresight-scan.test.ts) holds it to that.
//
// Three kinds of signal, each measured from state the news already shows:
//   wave   the sector move that `waveNews` reports, graded by its size (3%, 6% and 10% give strength 1, 2 and 3)
//   shock  a market shock announced this year, 15% or more (30% and 50% give strength 2 and 3); the player's own order
//          flow is not news and never counts
//   tilt   breadth: the share of this year's listed stocks that rose, 30% or less or 70% or more (20% and 80% give 2)
// Everything here is pure. It draws nothing (the wording is picked by a hash of life, year and kind), writes nothing and
// names a wave or a cause, never a company.
import { hunit } from '../text/hash'
import type { GameState } from '../types'
import { marketAnchor, marketFamily } from './clock'
import { exchangeStatus, exchangeYear, type ExInfo } from './engine'
import { cryptoSince } from './era'
import { shocksThisYear, type ShockCause } from './shocks'
import { waveNews } from './wave-stocks'

export type SignalKind = 'wave' | 'shock' | 'tilt'

export interface MarketSignal {
  kind: SignalKind
  strength: 1 | 2 | 3
  /** What the line names: "Frontier AI wave", "a government ban", "market breadth". Never a company. */
  label: string
  /** The year of the reading, never after g.year. */
  year: number
}

type Strength = MarketSignal['strength']

/** The longest line the Financial News takes from this file, emoji included. */
export const READ_MAX = 110

const EMOJI = '🧭'

/** "Frontier AI wave moved Semiconductors stocks up 9%." (wave-stocks.ts waveNews): the wave and the size of the sector move. */
const WAVE_NEWS = /^(.+?) wave moved .+ stocks (?:up|down) (\d+)%\.$/

/** The cause of a shock in an analyst's words. Order flow ('liquidity') has none on purpose: it is the player's own orders. */
const CAUSE_WORDS: Readonly<Partial<Record<ShockCause, string>>> = {
  ban: 'a government ban',
  probe: 'a government probe',
  nationalize: 'nationalization talk',
  contract: 'a state contract',
  deregulate: 'deregulation',
  endorse: 'a state endorsement',
  policy: 'a new law',
}

const KIND_ORDER: Readonly<Record<SignalKind, number>> = { wave: 0, shock: 1, tilt: 2 }

/** The strength a size earns: 1 at the first cut, 2 at the second, 3 at the third. */
function graded(size: number, cuts: readonly [number, number, number]): Strength | null {
  return size >= cuts[2] ? 3 : size >= cuts[1] ? 2 : size >= cuts[0] ? 1 : null
}

function waveSignal(g: GameState, info: ExInfo): MarketSignal | null {
  const text = waveNews(g, info.key, g.year)
  const m = text === null ? null : WAVE_NEWS.exec(text)
  if (!m) return null
  const strength = graded(Number(m[2]) / 100, [0.03, 0.06, 0.1])
  return strength === null ? null : { kind: 'wave', strength, label: `${m[1]} wave`, year: g.year }
}

function shockSignal(g: GameState, info: ExInfo): MarketSignal | null {
  let best: { label: string; strength: Strength; move: number } | null = null
  for (const s of shocksThisYear(g)) {
    const label = CAUSE_WORDS[s.cause]
    if (!label) continue
    // A stock shock belongs to its own exchange; a coin shock to the crypto market, once coins trade where the player lives.
    if (s.asset === 'stock' ? s.exKey !== info.key : g.year < cryptoSince(g.character.countryId)) continue
    const move = Math.abs(s.mult - 1)
    const strength = Number.isFinite(move) ? graded(move, [0.15, 0.3, 0.5]) : null
    if (strength !== null && (!best || move > best.move)) best = { label, strength, move }
  }
  return best ? { kind: 'shock', strength: best.strength, label: best.label, year: g.year } : null
}

/** The fewest listed stocks a breadth reading needs before it means anything. */
const TILT_MIN_STOCKS = 6

/** The share of stocks moving the same way that earns strength 1 and strength 2 (70% and 80%, so 30% or less and 20% or less rose). */
const TILT_CUTS: readonly [number, number] = [0.7, 0.8]

function tiltSignal(g: GameState, info: ExInfo): MarketSignal | null {
  const now = exchangeYear(marketFamily(g), marketAnchor(g), info, g.year)
  // The same stocks the free tip rates: a company new to the exchange this year has no past year to count.
  const listed = now.stocks.filter((s) => s.event !== 'ipo' && !s.ended)
  if (listed.length < TILT_MIN_STOCKS || !listed.some((s) => s.ret !== 0)) return null
  const rose = listed.filter((s) => s.ret > 0).length
  // 7 of 10 is 70% exactly: the epsilon keeps a share that lands on a cut from slipping under it.
  const lopsided = Math.max(rose, listed.length - rose) / listed.length + 1e-9
  const strength: Strength | null = lopsided >= TILT_CUTS[1] ? 2 : lopsided >= TILT_CUTS[0] ? 1 : null
  return strength === null ? null : { kind: 'tilt', strength, label: 'market breadth', year: g.year }
}

/**
 * The signals this year's markets are giving, strongest first (a tie keeps the order wave, shock, tilt). Empty when the
 * exchange is shut or does not exist yet in a year of history. Pure: no draw, no write, nothing after g.year.
 */
export function marketSignals(g: GameState, info: ExInfo): MarketSignal[] {
  if (exchangeStatus(info, g.year) !== 'open') return []
  const out: MarketSignal[] = []
  for (const s of [waveSignal(g, info), shockSignal(g, info), tiltSignal(g, info)]) if (s) out.push(s)
  return out.sort((a, b) => b.strength - a.strength || KIND_ORDER[a.kind] - KIND_ORDER[b.kind])
}

// ---------------------------------------------------------------------------
// The line

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

/** Three wordings of each kind. None says which way a price goes, and none is longer than the line can hold. */
const BODIES: Readonly<Record<SignalKind, readonly ((label: string) => string)[]>> = {
  wave: [
    (l) => `Analysts keep coming back to the ${l} this year.`,
    (l) => `Desks are watching the ${l} closely.`,
    (l) => `The ${l} is what analysts are talking about.`,
  ],
  shock: [
    (l) => `${cap(l)} moved one name sharply this year.`,
    (l) => `Analysts weighed ${l} for one name.`,
    (l) => `One name felt ${l} this year, analysts say.`,
  ],
  tilt: [
    () => 'Most listed stocks moved the same way this year.',
    () => 'Analysts see the market moving as a pack this year.',
    () => 'Few stocks went against the crowd this year.',
  ],
}

/** How sure the desk is, by strength. Never more than fairly: the line only points. */
const CONFIDENCE: readonly [string, string, string] = ['Low confidence.', 'Some confidence.', 'Fairly confident.']

const HEDGE = 'Worth watching, nothing more.'

/** One signal as a line, or null when none of its wordings fits (a very long wave name). */
function lineOf(g: GameState, s: MarketSignal): string | null {
  const bodies = BODIES[s.kind]
  const first = Math.floor(hunit(g.lifeId || 'life', g.year, `read.${s.kind}`) * bodies.length) % bodies.length
  const hedge = `${CONFIDENCE[s.strength - 1]} ${HEDGE}`
  for (let i = 0; i < bodies.length; i++) {
    const line = `${EMOJI} ${bodies[(first + i) % bodies.length](s.label)} ${hedge}`
    if (line.length <= READ_MAX) return line
  }
  return null
}

/**
 * The analyst read for the Financial News: the strongest present signal in one hedged line of at most 110 characters, or
 * null when the year gives none. It names a wave or a cause, carries a confidence and "Worth watching, nothing more.", and
 * holds no buy, sell or direction. Pure and the same every time it is opened.
 */
export function marketRead(g: GameState, info: ExInfo): string | null {
  for (const s of marketSignals(g, info)) {
    const line = lineOf(g, s)
    if (line) return line
  }
  return null
}
