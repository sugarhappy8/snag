// Tech waves (docs/superpowers/specs/2026-10-19-tech-waves-design.md, plan decisions D1-D22). When
// something breakthrough-class happens, the company markets that real life would move do move,
// together: demand, costs, valuation, deep-tech VC heat and rivals.
//
// A wave is a record in game flags (`techWaves`, at most 64, replaced and never edited in place) plus
// the static history rows in history/tech-waves.ts. One pure formula (waveFactors) turns both into
// demand, cost and value factors per trade, market and year. Writers call announceWave; the yearly
// step (advanceTechWaves) moves hype toward delivery, so a premium unwinds only when the breakthrough
// did not deliver, never because a year arrived. Nothing here draws on g.rng: draws come from seeded
// streams keyed by the family id, so heirs share them and a Time Machine fork rerolls only the
// unfinished year. Reads never write. The readers validate everything they take from flags.
//
// Import direction: the readers, the record types and the reaction formula are in tech-wave-factors.ts, a
// leaf that nationalMarket and advanceRivals can import without pulling in Heavy R&D and the company
// economy; this module re-exports them, so every caller can keep importing from here. This module does
// no top-level work that calls into the economy cycle (heavy-rd, economy, product-market); every use of
// those modules is inside a function.
import { seeded } from '../assets'
import { recordEconomicActivity } from '../economy'
import { HISTORY_WAVES, historyKindActive } from '../history/tech-waves'
import { PRESENT_YEAR } from '../history/timeline'
import { outcomeTag } from '../timeMachine'
import type { GameState, Json } from '../types'
import { marketKey, marketStateOf } from './competition-core'
import { familyId } from './competition-roster'
import { isDeepTech } from './deeptech-state'
import { heavyLevel, readHeavy } from './heavy-rd'
import { hashOf } from './product-market'
import { businessAssets, readBiz, type BizState } from './state'
import { isWaveKind, WAVE_KINDS, type WaveKind } from './tech-wave-data'
import {
  BASE_KEY, cleanWave, effectsOf, MAX_ID, MAX_WAVES, noBase, readTechBase, readTechWaves, roleOf, storedBase, storedWave, waveFactorsFor, WAVES_KEY,
  type TechBase, type TechWave, type WaveSource,
} from './tech-wave-factors'
import { clampN } from './util'

export { BASE_KEY, historyFactors, MAX_WAVES, readTechBase, readTechWaves, roleOf, waveFactors, waveFactorsFor, WAVES_KEY } from './tech-wave-factors'
export type { TechBase, TechWave, WaveSource } from './tech-wave-factors'

/** At most this many waves from the player's side (anything but a rival) are announced in a year. */
const MAX_PER_YEAR = 2

export interface WaveInput {
  kind: WaveKind
  source: WaveSource
  /** A stable string for the milestone (see TechWave.origin): it names the wave, so a repeat is the same wave. */
  origin: string
  name: string
  size: number
  market: string
  /** The announcement year when it is not g.year (a heavy launch passes the record's launch year). */
  year?: number
  home?: string
}

/** Always a NEW array of NEW objects: the read cache below is keyed on the array, so nothing is edited in place. */
function writeWaves(g: GameState, list: readonly TechWave[]): void {
  g.flags[WAVES_KEY] = list.slice(-MAX_WAVES).map(storedWave)
}

/** Always a new object (the read cache is keyed on the stored object). */
function writeBase(g: GameState, base: Readonly<Record<string, TechBase>>): void {
  g.flags[BASE_KEY] = storedBase(base)
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4

/**
 * Write the valuation mood onto a classic company as its year is booked: the total value factor of
 * the waves and the history rows for its trade and market, with the fiscal year it was booked for
 * (`valuationOf` takes it only when the last record is that year). A neutral factor deletes the stamp
 * (a world with no wave stores nothing). Never on a deep-tech company (it reads waves through
 * `industryCycle`, so a stamp would count twice) or a listed one (stocks stay wave-free until release 1b).
 */
export function stampWave(g: GameState, b: BizState, fiscal: number): void {
  if (isDeepTech(b) || b.public) { delete b.wave; return }
  const v = waveFactorsFor(g, b.industry, marketKey(b), fiscal).value
  if (Math.abs(v - 1) < 0.005) delete b.wave
  else b.wave = { v: round4(v), y: fiscal }
}

/** Delivery levels at which one fast follower enters a wave's core market. */
const ENTRANT_STEPS: readonly number[] = [0.25, 0.5, 0.75]

/**
 * The fast followers a market is owed: for each live wave of the player's side (never a heavy one:
 * Heavy R&D already has rivals follow on `heavyArrival`) whose kind this trade is core of, one entrant
 * per delivery level crossed, with a stable id so one is never founded twice. Pure.
 */
export function entrantsDue(g: Pick<GameState, 'flags'>, trade: string, market: string): { id: string; wave: TechWave }[] {
  const out: { id: string; wave: TechWave }[] = []
  for (const w of readTechWaves(g)) {
    if (w.source === 'heavy' || roleOf(w.kind, trade) !== 'core') continue
    if (w.market !== 'world' && w.market !== market) continue
    ENTRANT_STEPS.forEach((step, k) => { if (w.delivery >= step) out.push({ id: `xw-${hashOf(w.id).toString(36)}-${k}`, wave: w }) })
  }
  return out
}

// ---------------------------------------------------------------------------
// Writing a wave

/**
 * Announce a wave. Idempotent: the id comes from the source, kind, year and a hash of the stable
 * origin string, so a second call for the same milestone returns the stored wave and writes nothing
 * (a news id is no guard: the news list keeps only 20). Refuses (null) an unknown kind, a 65th wave,
 * a third non-rival wave in one year, and a heavy, workshop or race wave of a kind a history row
 * already covers that year. Hype starts at 0.3 + 0.7 size, delivery at 0. Draws nothing.
 */
export function announceWave(g: GameState, a: WaveInput): TechWave | null {
  if (!isWaveKind(a.kind)) return null
  const year = Math.round(a.year ?? g.year)
  if (!Number.isFinite(year)) return null
  const id = `${a.source}:${a.kind}:${year}:${hashOf(a.origin).toString(36)}`.slice(0, MAX_ID)
  const list = readTechWaves(g)
  const prior = list.find((w) => w.id === id)
  if (prior) return prior
  if (list.length >= MAX_WAVES) return null
  if (a.source !== 'rival') {
    if (list.filter((w) => w.source !== 'rival' && w.year === year).length >= MAX_PER_YEAR) return null
    if (a.source !== 'deeptech' && historyKindActive(a.kind, year)) return null
  }
  const size = clampN(a.size, 0.05, 1)
  const now = Number.isFinite(g.year) ? Math.round(g.year) : year
  const w = cleanWave({
    id, kind: a.kind, name: a.name, source: a.source, year, market: a.market, size, hype: 0.3 + 0.7 * size, delivery: 0, last: Math.max(year, now),
    origin: a.origin,
    home: a.home ?? (a.market !== 'world' ? a.market : g.character.countryId),
    ...(a.source === 'heavy' ? { skip: a.origin.slice(6, a.origin.indexOf('|')) } : {}),
  })
  if (!w) return null
  writeWaves(g, [...list, w])
  return readTechWaves(g).find((x) => x.id === w.id) ?? null
}

/** Lowercases a leading capital unless the next letter is a capital too, so a wave name reads inside a sentence ('Frontier AI' gives 'frontier AI', 'AI agents' stays). */
export function lowerLead(name: string): string {
  return name.replace(/^[A-Z](?![A-Z])/, (c) => c.toLowerCase())
}

// ---------------------------------------------------------------------------
// Draws (never g.rng)

/**
 * A wave's draws for a year, from the family stream (heirs share it, other families do not) with the
 * Time Machine tag (a fork rerolls only the unfinished year). Always both draws, in this order: `u`,
 * then the stall draw (a 25% chance of a year that adds no delivery and cools hype).
 */
export function waveDraw(g: GameState, id: string, year: number): { u: number; stall: boolean } {
  const s = seeded(`${familyId(g.lifeId)}${outcomeTag(g, year)}|wave|${id}|${year}`)
  return { u: s.next(), stall: s.next() < 0.25 }
}

/** The future-facing kinds each trade is core of (the twelve deep-tech trades): a kind no history row uses. */
const RIVAL_KINDS: ReadonlyMap<string, readonly WaveKind[]> = (() => {
  const used = new Set<string>(HISTORY_WAVES.map((w) => w.kind))
  const out = new Map<string, WaveKind[]>()
  for (const kind of Object.keys(WAVE_KINDS) as WaveKind[]) {
    if (used.has(kind)) continue
    for (const trade of WAVE_KINDS[kind].core as readonly string[]) out.set(trade, [...(out.get(trade) ?? []), kind])
  }
  return out
})()

/**
 * Whether a rival of a family lands a breakthrough in a trade this year: about one year in nine, only
 * for the core trades of future-facing kinds. Draws in a fixed order: landing, kind (taken even for a
 * single kind), size. Pure, no g.rng.
 */
export function rivalWave(fam: string, trade: string, year: number): { kind: WaveKind; size: number } | null {
  const kinds = RIVAL_KINDS.get(trade)
  if (!kinds || !kinds.length) return null
  const s = seeded(`${fam}|tw-rival|${trade}|${year}`)
  if (s.next() >= 1 / 9) return null
  const kind = kinds[Math.floor(s.next() * kinds.length)]
  return { kind, size: 0.2 + 0.4 * s.next() }
}

// ---------------------------------------------------------------------------
// The yearly step

/**
 * One year of a wave: hype closes on the new delivery (at 0.30 when delivery leads, 0.45 when it
 * lags; a stall year cools it a further 15%). `mature` counts years with delivery at least 0.9 and
 * within 0.05 of hype: five settle the wave into the permanent factors; a wave still below 0.1
 * delivery after six years is dropped. Pure.
 */
export function nextState(w: TechWave, delivery: number, stall: boolean, year: number): { hype: number; delivery: number; mature: number; fate: 'live' | 'settle' | 'drop' } {
  const d = clampN(delivery, 0, 1)
  let hype = w.hype + (d - w.hype) * (d > w.hype ? 0.30 : 0.45)
  if (stall) hype *= 0.85
  hype = clampN(hype, 0, 1)
  const mature = d >= 0.9 && Math.abs(d - hype) <= 0.05 ? (w.mature ?? 0) + 1 : 0
  const fate = mature >= 5 ? 'settle' : year - w.year >= 6 && d < 0.1 ? 'drop' : 'live'
  return { hype, delivery: d, mature, fate }
}

/** The part of an origin before its first '#'. */
const originHead = (o: string): string => (o.indexOf('#') < 0 ? o : o.slice(0, o.indexOf('#')))

/**
 * Where the wave's delivery is heading this year, from what really sold, or null when there is nothing
 * to read (the company or the heavy record is gone, or the source has none): then the seeded path runs.
 * Heavy: the record's adoption curve. Deep tech: the originating lab's market share against a quarter.
 */
function deliveryTarget(g: GameState, w: TechWave, year: number): number | null {
  if (!w.origin) return null
  if (w.source === 'heavy') {
    const hash = w.origin.indexOf('#')
    const key = hash < 0 ? '' : w.origin.slice(0, hash)
    const bar = key.indexOf('|')
    if (!key.startsWith('heavy.') || bar < 7) return null
    const family = w.origin.slice(hash + 1)
    const rec = readHeavy(g, key.slice(6, bar), key.slice(bar + 1)).find((r) => r.family === family)
    return rec ? heavyLevel(rec, year).adoption : null
  }
  if (w.source === 'deeptech') {
    const id = originHead(w.origin)
    const a = businessAssets(g).find((x) => x.id === id)
    return a ? clampN((marketStateOf(readBiz(g, a))?.share ?? 0) / 0.25, 0, 1) : null
  }
  return null
}

/**
 * Step every wave once a year, behind the `last` marker (a second call in a year, or a wave that
 * starts later than this year, writes nothing; a gap steps once). Delivery: a company-written wave
 * moves toward what its record or lab has sold, at most 0.25 a year; every other case (workshop, race,
 * rival, or a missing company or record) gains 0.08 + 0.22 u from the seeded draw, or nothing on a
 * stall. A mature wave settles into techBase at its own market with its own factors (never the
 * history rows live that year) and is removed; a dead one is dropped. Writes once, only on a change.
 */
export function advanceTechWaves(g: GameState): void {
  const year = Math.round(g.year)
  const list = readTechWaves(g)
  if (!list.length || !Number.isFinite(year)) return
  const next: TechWave[] = []
  let base: Record<string, TechBase> | null = null
  let changed = false
  for (const w of list) {
    if (w.last === year || year < w.year) { next.push(w); continue }
    changed = true
    const target = deliveryTarget(g, w, year)
    let delivery: number, stall = false
    if (target !== null) delivery = w.delivery + clampN(target - w.delivery, -0.25, 0.25)
    else {
      const d = waveDraw(g, w.id, year)
      stall = d.stall
      delivery = w.delivery + (stall ? 0 : 0.08 + 0.22 * d.u)
    }
    const s = nextState(w, delivery, stall, year)
    if (s.fate === 'drop') continue
    feedEconomy(g, w, s.delivery - w.delivery, year)
    const stepped: TechWave = { ...w, hype: s.hype, delivery: s.delivery, last: year }
    if (s.mature > 0) stepped.mature = s.mature
    else delete stepped.mature
    if (s.fate === 'live') { next.push(stepped); continue }
    // Settled: the wave's own demand and cost factors become permanent at its own market.
    base ??= { ...readTechBase(g) }
    for (const kind of ['core', 'supply', 'disrupted'] as const) {
      for (const trade of WAVE_KINDS[stepped.kind][kind] as readonly string[]) {
        const e = effectsOf(trade, stepped.market, year, [stepped], false)[0]
        if (!e || (e.demand === 1 && e.costs === 1)) continue
        const k = `${trade}|${stepped.market}`
        const old = Object.hasOwn(base, k) ? base[k] : undefined
        base[k] = { demand: clampN((old?.demand ?? 1) * e.demand, 0.8, 1.5), costs: clampN((old?.costs ?? 1) * e.costs, 0.8, 1.0) }
      }
    }
  }
  if (!changed) return
  writeWaves(g, next)
  if (base) writeBase(g, base)
}

/**
 * The national economy hears about a breakthrough as it is delivered (D17): a small `innovation` amount
 * for the wave's core trade in its home country, scaled by size and the year's delivery gain. Never
 * 'world' (not a country, so the call would drop it), never for workshop or race waves (the Workshop
 * already feeds innovation), at most 0.3 a call; one receipt per wave and year makes a second call a no-op.
 */
function feedEconomy(g: GameState, w: TechWave, gain: number, year: number): void {
  if (w.source === 'workshop' || w.source === 'race' || !(gain > 0)) return
  const country = w.home ?? (w.market !== 'world' ? w.market : undefined)
  if (!country) return
  recordEconomicActivity(g, `wave:${w.id}:${year}`, country, WAVE_KINDS[w.kind].core[0], { innovation: Math.min(0.3, 0.1 * w.size * gain) })
}

/** Distinct (trade, market) pairs of the player's companies looked at for a rival landing in one year. */
const MAX_LANDING_PAIRS = 24
/** A trade a live wave already cores is left alone for this many years. */
const LANDING_GAP = 3

/**
 * The yearly hook: for each trade and market the player has a company in, a rival may land a
 * breakthrough this year (`rivalWave`, a seeded draw keyed by the family id and the Time Machine tag).
 * Only for years after the present one, so the real history is never invented over; none within three
 * years of a wave that already cores the trade; a life with no company writes nothing. The wave is
 * announced through `announceWave`, so a repeat in the same year is the stored wave.
 */
export function landRivalWaves(g: GameState): void {
  const year = Math.round(g.year)
  if (!Number.isFinite(year) || year <= PRESENT_YEAR) return
  const assets = businessAssets(g)
  if (!assets.length) return
  const fam = `${familyId(g.lifeId)}${outcomeTag(g, year)}`
  const seen = new Set<string>()
  for (const a of assets) {
    if (seen.size >= MAX_LANDING_PAIRS) break
    const b = readBiz(g, a)
    const market = marketKey(b)
    const pair = `${b.industry}|${market}`
    if (seen.has(pair)) continue
    seen.add(pair)
    if (readTechWaves(g).some((w) => w.year >= year - LANDING_GAP && (WAVE_KINDS[w.kind].core as readonly string[]).includes(b.industry))) continue
    const landed = rivalWave(fam, b.industry, year)
    if (!landed) continue
    announceWave(g, { kind: landed.kind, source: 'rival', origin: pair, name: WAVE_KINDS[landed.kind].label, size: landed.size, market, home: b.countryId, year })
  }
}

/**
 * The tech-wave state of the world that a new generation keeps: the live waves and the settled
 * factors, each through its validating reader and in its stored shape. An empty part is omitted.
 * Never 'market.news': the Heavy R&D carry already hands that over. Pure.
 */
export function waveWorldFlags(g: Pick<GameState, 'flags'>): Record<string, Json> {
  const out: Record<string, Json> = {}
  const waves = readTechWaves(g)
  if (waves.length) out[WAVES_KEY] = waves.map(storedWave)
  const base = readTechBase(g)
  if (!noBase(base)) out[BASE_KEY] = storedBase(base)
  return out
}
