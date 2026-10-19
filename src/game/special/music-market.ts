// Music 2.0 market: the format mix by year and country, the one waterfall that both a new release and the
// back catalogue settle through (so a statement can never disagree with a payment), the rival chart and
// the two settlement paths, `bookRelease` and `stepCatalogue`. Everything here is exact arithmetic except
// the single chart-noise draw in `bookRelease`; reads (`formatMix`, `waterfall`, `planEffect`, `nextNet`,
// the chart helpers) are pure and never draw g.rng. Money moves only through `c.earn` and `c.pay`.
// This file imports the music data, job and state modules, never music.ts.
import { US_TYPICAL_INCOME, typicalIncome } from '../events/wealth-core'
import { techAdoption } from '../history/timeline'
import type { GameState, Job } from '../types'
import { getCountry } from '../world'
import { remember as rememberRivals, rollScore, standingOf, type RivalSpec } from './kit/rivals'
import { cap, nextId, txt } from './kit/state'
import type { CareerCtx } from './kit/year'
import { FORMATS, GENRE_FROM, GENRE_NAMES, RELEASE_TYPES, type FormatId, type SampleMode } from './music-data'
import { mdView, musicJob } from './music-job'
import { adoptMusic, dealOf, modMult, type LabelDeal, type LedgerRow, type MusicState } from './music-state'

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))

// ---------------------------------------------------------------------------
// Format mix

export type Mix = Record<FormatId, number>

const PHYSICAL: readonly FormatId[] = ['shellac', 'vinyl', 'tape', 'cd', 'download']
const FORMAT_ORDER: readonly FormatId[] = [...PHYSICAL, 'stream']

/** Piecewise-linear read of (year, share) anchors, flat outside; no anchors reads 0. */
function anchored(anchors: readonly (readonly [number, number])[], year: number): number {
  if (anchors.length === 0) return 0
  if (year <= anchors[0][0]) return anchors[0][1]
  for (let i = 1; i < anchors.length; i++) {
    const [y1, v1] = anchors[i]
    if (year <= y1) {
      const [y0, v0] = anchors[i - 1]
      return v0 + ((v1 - v0) * (year - y0)) / (y1 - y0)
    }
  }
  return anchors[anchors.length - 1][1]
}

/**
 * The share of each format a year's sales come in, summing to 1. Physical anchors are read at a year that
 * lags in poorer countries, downloads follow internet adoption and streaming follows its own adoption;
 * the physical formats fill what streaming leaves. Pure.
 */
export function formatMix(country: string, year: number): Mix {
  const yr = Number.isFinite(year) ? year : 0
  const wealth = clamp(getCountry(country).wealth, 0.05, 1)
  const anchorYear = yr - (1 - wealth) * 12
  const phys: Record<string, number> = {}
  for (const f of PHYSICAL) phys[f] = anchored(FORMATS[f].anchors, anchorYear)
  phys.download *= Math.min(1, techAdoption(country, 'internet', yr) / 0.5)
  const stream = clamp(techAdoption(country, 'streaming', yr), 0, 1)
  const rest = 1 - stream
  const sum = PHYSICAL.reduce((n, f) => n + phys[f], 0)
  const mix: Mix = { shellac: 0, vinyl: 0, tape: 0, cd: 0, download: 0, stream }
  if (sum > 0) for (const f of PHYSICAL) mix[f] = (phys[f] * rest) / sum
  else mix[anchorYear < 1948 ? 'shellac' : 'vinyl'] = rest
  return mix
}

/** The format with the biggest share (the first of a tie, oldest first). It names the release. */
export function dominantFormat(mix: Mix): FormatId {
  let best: FormatId = 'cd'
  let share = -1
  for (const f of FORMAT_ORDER) {
    if (mix[f] > share) {
      best = f
      share = mix[f]
    }
  }
  return best
}

/** Dollars of retail a unit: the share-weighted gross. */
export function unitGross(mix: Mix): number {
  return FORMAT_ORDER.reduce((n, f) => n + mix[f] * FORMATS[f].gross, 0)
}

/** The cost share of gross, weighted by each format's gross. */
export function costRate(mix: Mix): number {
  const gross = unitGross(mix)
  if (!(gross > 0)) return 0
  return FORMAT_ORDER.reduce((n, f) => n + mix[f] * FORMATS[f].gross * FORMATS[f].cost, 0) / gross
}

/** The yearly tail: units a year later as a share of this year's, share-weighted, 0.2 to 0.7. */
export function tailK(mix: Mix): number {
  return clamp(FORMAT_ORDER.reduce((n, f) => n + mix[f] * FORMATS[f].k, 0), 0.2, 0.7)
}

/** The artist's take of one unit at a royalty (default the tier 1 share). */
export function takePerUnit(mix: Mix, royalty = 0.16): number {
  return unitGross(mix) * (1 - costRate(mix)) * royalty
}

// ---------------------------------------------------------------------------
// Waterfall

export interface Split {
  gross: number
  costs: number
  net: number
  pool: number
  kept: number
  recoup: number
  group: number
  paid: number
  bandCut: number
}

/**
 * One statement. gross = costs + kept + recoup + bandCut + paid, every part a whole non-negative number
 * of dollars, so cash moves by exactly `paid`. The label recoups 80% of the artist pool, never more than
 * the deal still owes, and only on a row that belongs to that deal. Pure.
 */
export function waterfall(
  row: Pick<LedgerRow, 'pay' | 'rate' | 'members' | 'dealId'>,
  units: number,
  mix: Mix,
  deal: Pick<LabelDeal, 'id' | 'unrecouped'> | null,
): Split {
  const u = Number.isFinite(units) && units > 0 ? units : 0
  const pay = Number.isFinite(row.pay) && row.pay > 0 ? row.pay : 0
  const rate = Number.isFinite(row.rate) ? clamp(row.rate, 0, 1) : 0
  const members = Number.isFinite(row.members) ? Math.max(1, Math.floor(row.members)) : 1
  const gross = Math.round(u * unitGross(mix) * pay)
  const costs = Math.round(gross * costRate(mix))
  const net = gross - costs
  const pool = Math.round(net * rate)
  const kept = net - pool
  const owed = deal && row.dealId === deal.id && Number.isFinite(deal.unrecouped) ? Math.floor(Math.max(0, deal.unrecouped)) : 0
  const recoup = Math.min(owed, Math.round(pool * 0.8))
  const group = pool - recoup
  const paid = Math.round(group / members)
  const bandCut = group - paid
  return { gross, costs, net, pool, kept, recoup, group, paid, bandCut }
}

// ---------------------------------------------------------------------------
// The rival chart

/** (year, acts) anchors for the size of the field in a rich country, flat after 2015. */
const FIELD_BASE: readonly (readonly [number, number])[] = [[1900, 10], [1930, 16], [1955, 24], [1975, 32], [1995, 38], [2015, 40]]

export const MUSIC_SPEC: RivalSpec = {
  career: 'music',
  edges: GENRE_NAMES,
  debutAge: [17, 28],
  length: [6, 22],
  peak: [40, 96],
  foreignShare: 0.2,
  field(year, country) {
    if (!(year >= 1900)) return 0
    return clamp(Math.round(anchored(FIELD_BASE, year) * (0.4 + 0.6 * getCountry(country).wealth)), 0, 40)
  },
}

/** The genre a rival shows on a chart: Pop while its own genre does not exist yet. */
export function genreAt(edge: string, year: number): string {
  return (GENRE_FROM[edge] ?? 0) > year ? 'Pop' : edge
}

/** How many places on the chart count: half the field, from 5 to 20. */
export function chartLen(field: number): number {
  return Number.isFinite(field) ? Math.min(20, Math.max(5, Math.round(field / 2))) : 5
}

/** The sales lift of a chart place: up to +25% at #1, none off the chart (peak 0). */
export function chartBonus(peak: number, len: number): number {
  return peak >= 1 ? 1 + Math.max(0, len + 1 - peak) / (4 * Math.max(1, len)) : 1
}

const TIER_BONUS: readonly number[] = [1, 2, 4, 5]

/** The score a release carries into the chart before its one noise draw: 0.5 q + 0.4 popularity, a trend and a label tier. Pure. */
export function chartBase(o: { quality: number; popularity: number; onTrend: boolean; tier: number | null }): number {
  return 0.5 * o.quality + 0.4 * o.popularity + (o.onTrend ? 6 : 0) + (o.tier === null ? 0 : (TIER_BONUS[o.tier] ?? 0))
}

// ---------------------------------------------------------------------------
// Release plan

/** What the chosen sample policy costs and does. `cleared` falls back to `original` in `bookRelease` when cash is short. Pure. */
export function planEffect(g: GameState, s: MusicState): { mode: SampleMode; cost: number; quality: number; sold: number } {
  const mode = s.policy.samples
  if (mode === 'cleared') {
    const job = musicJob(g)
    const pop = job ? mdView(job).popularity : 0
    return { mode, cost: Math.round(3000 * (1 + pop / 25) * (typicalIncome(g) / US_TYPICAL_INCOME)), quality: 3, sold: 1.04 }
  }
  if (mode === 'risky') return { mode, cost: 0, quality: 5, sold: 1.06 }
  return { mode: 'original', cost: 0, quality: 0, sold: 1 }
}

// ---------------------------------------------------------------------------
// Booking a release

/** The legacy quality and sold, already drawn by the caller (music.ts has its own local ReleaseDraft). */
export interface BookDraft {
  typeId: string
  title: string
  subgenre: string
  quality: number
  sold: number
  onTrend: boolean
}

export interface Booked {
  sold: number
  quality: number
  paid: number
  royalty: number
  peak: number
  legacy: boolean
  row: LedgerRow
}

const ROW_TYPES: readonly LedgerRow['type'][] = ['studio', 'single', 'live', 'compilation']
/** The artist's share of net with no label deal (the menus read it too). */
export const UNSIGNED_RATE = 0.21
const UNSIGNED_REACH = 0.85
/** The legacy tail the discography keeps: 15% of the share, halving yearly (music.ts). */
const LEGACY_TAIL = 0.15

/**
 * Books one release into the ledger and pays it. The caller has already drawn the legacy quality and
 * `sold`; this draws once more (the chart noise), after them. On grandfathered terms `sold` and the legacy
 * share stay as they were and the row never settles again; otherwise the release is priced through the
 * waterfall at the year's format mix and the label recoups first. Actions and settle bodies only.
 */
export function bookRelease(c: CareerCtx<MusicState>, job: Job, draft: BookDraft): Booked {
  const { g, s, year } = c
  adoptMusic(g, s)
  const deal = dealOf(g, s)
  const d = mdView(job)
  const members = d.mode === 'band' ? d.members : 1
  const type = RELEASE_TYPES.find((t) => t.id === draft.typeId) ?? RELEASE_TYPES[0]
  const plan = planEffect(g, s)
  const paidFor = plan.mode !== 'cleared' || plan.cost <= 0 || (g.character.money >= plan.cost && c.pay('Clearance vendors', plan.cost))
  const mode: SampleMode = paidFor ? plan.mode : 'original'
  const effect = mode === 'original' ? { quality: 0, sold: 1 } : plan
  const quality = clamp(Math.round(draft.quality + effect.quality), 0, 100)

  const mix = formatMix(g.character.countryId, year)
  const score = rollScore(g, chartBase({ quality, popularity: d.popularity, onTrend: draft.onTrend, tier: deal ? deal.tier : null }))
  const st = standingOf(g, MUSIC_SPEC, score, s.memory)
  const field = st.of - 1
  const len = chartLen(field)
  const peak = field > 0 && st.rank <= len ? st.rank : 0
  s.memory = rememberRivals(s.memory, st, year)

  const legacy = !!deal && deal.legacy
  const drawn = Number.isFinite(draft.sold) ? Math.max(0, Math.round(draft.sold)) : 0
  const row: LedgerRow = {
    id: nextId(s, 'r'),
    title: txt(draft.title, 60) || 'Untitled',
    type: ROW_TYPES.find((t) => t === type.id) ?? 'studio',
    year,
    fmt: dominantFormat(mix),
    units0: drawn,
    k: tailK(mix),
    pay: type.pay,
    quality,
    peak,
    dealId: deal ? deal.id : '',
    label: deal ? deal.label : '',
    rate: legacy ? 0.6 : clamp(deal ? deal.royalty : UNSIGNED_RATE, 0.05, 0.6),
    members,
    samples: mode,
    gross: 0,
    paid: 0,
    lastLabel: 0,
    lastYear: year,
    adopted: false,
    legacy,
  }

  let sold = drawn
  let paid: number
  let royalty = 0
  if (legacy) {
    // Grandfathered: the legacy sold and share, byte for byte. The row keeps the chart peak and never settles.
    row.gross = Math.round(drawn * type.pay)
    paid = c.earn('Royalties', Math.round(row.gross / members))
    row.paid = paid
    royalty = Math.round(paid * LEGACY_TAIL)
  } else {
    sold = Math.max(0, Math.round(drawn * (deal ? 1 : UNSIGNED_REACH) * chartBonus(peak, len) * effect.sold * modMult(s, 'units', year)))
    row.units0 = sold
    const w = waterfall(row, sold, mix, deal)
    paid = c.earn('Royalties', w.paid)
    if (deal && w.recoup > 0) deal.unrecouped = Math.max(0, deal.unrecouped - w.recoup)
    row.gross = w.gross
    row.paid = paid
    row.lastLabel = w.kept + w.recoup
  }
  s.ledger = cap([...s.ledger, row], 40)
  return { sold, quality, paid, royalty, peak, legacy, row }
}

// ---------------------------------------------------------------------------
// The catalogue

export interface Totals {
  paid: number
  kept: number
  recoup: number
  rows: number
}

/**
 * Pays the back catalogue once for the year: each ledger row that is not adopted, not legacy and not yet
 * settled this year sells `units0 x k^age` units (under 50 stop paying) at this year's mix. Rows keep
 * paying with no deal and with no job; the label recoups only while the row's own deal is the held one.
 * Exact arithmetic, no luck. Settle bodies only.
 */
export function stepCatalogue(c: CareerCtx<MusicState>): Totals {
  const { g, s, year } = c
  const mix = formatMix(g.character.countryId, year)
  const deal = dealOf(g, s)
  const t: Totals = { paid: 0, kept: 0, recoup: 0, rows: 0 }
  for (const row of s.ledger) {
    if (row.adopted || row.legacy || row.lastYear >= year || row.year >= year) continue
    const units = Math.round(row.units0 * row.k ** (year - row.year))
    if (!(units >= 50)) continue
    const w = waterfall(row, units, mix, deal)
    const got = c.earn('Royalties', w.paid)
    if (deal && w.recoup > 0) deal.unrecouped = Math.max(0, deal.unrecouped - w.recoup)
    row.lastYear = year
    row.lastLabel = w.kept + w.recoup
    row.gross = Math.min(1e13, row.gross + w.gross)
    row.paid = Math.min(1e13, row.paid + got)
    t.paid += got
    t.kept += w.kept
    t.recoup += w.recoup
    t.rows += 1
  }
  return t
}

/** The net of a row's next-year units, priced at this year's mix. Pure. */
export function nextNet(g: GameState, row: LedgerRow): number {
  const units = Math.round(row.units0 * row.k ** Math.max(0, g.year + 1 - row.year))
  return waterfall(row, units, formatMix(g.character.countryId, g.year), null).net
}
