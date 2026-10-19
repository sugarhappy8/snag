// Music 2.0 state: one optional, owner-stamped, versioned record at special.music.sim (version 1, start
// standing 20), built on the career kit. Every reader tolerates junk and returns capped, finite values.
// `migrate[0]` lifts the legacy label deal out of the job in memory (pure: a view of a legacy life is
// byte-identical) and never writes the legacy profile or Job.data, so a rollback still reads them.
// `adoptMusic` is the one place the sim takes over from the legacy hook. This file imports music-job and
// music-data among the music files, never music.ts.
import type { GameState } from '../types'
import { fameOf } from './common'
import { arr, cap, defineCareerState, flt, int, rec, txt, appointmentId, type CareerBase, type CareerStore, type Raw } from './kit/state'
import { LABEL_ROSTER, ROYALTY_BASE, labelId, type FormatId, type SampleMode } from './music-data'
import { mdView, musicJob, viewMusic, type MusicJob } from './music-job'

export type { FormatId, SampleMode } from './music-data'

export interface LabelDeal {
  id: string
  appt: string // appointmentId(job); a mismatch means the deal is over
  labelId: string
  label: string
  tier: 0 | 1 | 2 | 3
  since: number
  term: number // years at signing
  years: number // years left
  royalty: number // artist share of net, 0.05 to 0.40; exactly 1 while legacy
  advance: number // total, paid yearly
  perYear: number
  unrecouped: number
  trust: number // 0 to 100, 55 at signing
  legacy: boolean // grandfathered terms until the years reach 0
  renewals: number
}

export interface LedgerRow {
  id: string
  title: string
  type: 'studio' | 'single' | 'live' | 'compilation'
  year: number
  fmt: FormatId
  units0: number
  k: number // the yearly tail, 0.2 to 0.7
  pay: number // RELEASE_TYPES pay
  quality: number
  peak: number // 0 is no chart, else 1 to 20
  dealId: string
  label: string
  rate: number // the artist's share of net, 0.05 to 0.60
  members: number
  samples: SampleMode
  gross: number
  paid: number
  lastLabel: number // the label's take in the last settled year (kept plus recouped)
  lastYear: number
  adopted: boolean
  legacy: boolean // legacy rows keep the chart peak and never settle
}

export interface MusicExtra {
  migrated: boolean
  deal: LabelDeal | null
  history: { label: string; from: number; to: number; ended: 'expired' | 'dropped' | 'walked' | 'quit'; forgiven: number }[]
  ledger: LedgerRow[]
  tours: { year: number; tier: string; shows: number; gate: number; costs: number; net: number }[]
  mods: { id: string; kind: 'units' | 'fill'; mult: number; until: number }[]
  policy: { samples: SampleMode }
  awards: string[]
}

export type MusicState = CareerBase & MusicExtra

/** Caps: history 8, ledger 40, tours 8, mods 6, awards 24. */
const CAPS = { history: 8, ledger: 40, tours: 8, mods: 6, awards: 24 } as const
const MONEY_MAX = 1e13
const ADVANCE_MAX = 1_500_000
const UNRECOUPED_MAX = 1e9
const UNITS_MAX = 1e10
const ID_MAX = 24
const TITLE_MAX = 60
const LABEL_MAX = 60
const AWARD_MAX = 90
const TIER_MAX = 12
/** A legacy deal never lasts longer than this many years, whatever the job record says. */
const LEGACY_YEARS_MAX = 8

const FORMAT_IDS: readonly FormatId[] = ['shellac', 'vinyl', 'tape', 'cd', 'download', 'stream']
const SAMPLE_MODES: readonly SampleMode[] = ['original', 'cleared', 'risky']
const RELEASE_TYPE_IDS: readonly LedgerRow['type'][] = ['studio', 'single', 'live', 'compilation']
const ENDED: readonly MusicExtra['history'][number]['ended'][] = ['expired', 'dropped', 'walked', 'quit']
const MOD_KINDS: readonly MusicExtra['mods'][number]['kind'][] = ['units', 'fill']

function oneOf<T extends string>(v: unknown, list: readonly T[], d: T): T {
  return typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : d
}

function strings(v: unknown, max: number, len: number): string[] {
  const out: string[] = []
  for (const x of cap(arr(v), max * 4)) {
    const s = typeof x === 'string' ? txt(x, len) : ''
    if (s) out.push(s)
  }
  return cap(out, max)
}

function readDeal(v: unknown, g: GameState): LabelDeal | null {
  const r = rec(v)
  const id = txt(r.id, ID_MAX)
  if (!id) return null
  const legacy = r.legacy === true
  const label = txt(r.label, LABEL_MAX) || 'Independent'
  const tier = int(r.tier, 1, 0, 3) as LabelDeal['tier']
  const years = int(r.years, 0, 0, 8)
  return {
    id,
    appt: txt(r.appt, 60),
    labelId: txt(r.labelId, 40) || labelId(label),
    label,
    tier,
    since: int(r.since, g.year, 0, 9999),
    term: int(r.term, Math.max(1, years), 1, 8),
    years,
    royalty: legacy ? 1 : flt(r.royalty, ROYALTY_BASE[tier], 0.05, 0.4),
    advance: int(r.advance, 0, 0, ADVANCE_MAX),
    perYear: int(r.perYear, 0, 0, ADVANCE_MAX),
    unrecouped: int(r.unrecouped, 0, 0, UNRECOUPED_MAX),
    trust: int(r.trust, 55, 0, 100),
    legacy,
    renewals: int(r.renewals, 0, 0, 9),
  }
}

function readRow(v: unknown): LedgerRow | null {
  const r = rec(v)
  const id = txt(r.id, ID_MAX)
  if (!id) return null
  const year = int(r.year, 0, 0, 9999)
  return {
    id,
    title: txt(r.title, TITLE_MAX) || 'Untitled',
    type: oneOf(r.type, RELEASE_TYPE_IDS, 'studio'),
    year,
    fmt: oneOf(r.fmt, FORMAT_IDS, 'cd'),
    units0: int(r.units0, 0, 0, UNITS_MAX),
    k: flt(r.k, 0.4, 0.2, 0.7),
    pay: flt(r.pay, 1, 0, 2),
    quality: int(r.quality, 0, 0, 100),
    peak: int(r.peak, 0, 0, 20),
    dealId: txt(r.dealId, ID_MAX),
    label: txt(r.label, LABEL_MAX),
    rate: flt(r.rate, 0.21, 0.05, 0.6),
    members: int(r.members, 1, 1, 100),
    samples: oneOf(r.samples, SAMPLE_MODES, 'original'),
    gross: int(r.gross, 0, 0, MONEY_MAX),
    paid: int(r.paid, 0, 0, MONEY_MAX),
    lastLabel: int(r.lastLabel, 0, 0, MONEY_MAX),
    lastYear: int(r.lastYear, year, 0, 9999),
    adopted: r.adopted === true,
    legacy: r.legacy === true,
  }
}

function readLedger(v: unknown): LedgerRow[] {
  // the first row of an id wins, then the newest 40
  const seen = new Set<string>()
  const out: LedgerRow[] = []
  for (const x of cap(arr(v), CAPS.ledger * 2)) {
    const row = readRow(x)
    if (!row || seen.has(row.id)) continue
    seen.add(row.id)
    out.push(row)
  }
  return cap(out, CAPS.ledger)
}

function readHistory(v: unknown): MusicExtra['history'] {
  const out: MusicExtra['history'] = []
  for (const x of cap(arr(v), CAPS.history * 4)) {
    const r = rec(x)
    const label = txt(r.label, LABEL_MAX)
    if (!label) continue
    out.push({ label, from: int(r.from, 0, 0, 9999), to: int(r.to, 0, 0, 9999), ended: oneOf(r.ended, ENDED, 'expired'), forgiven: int(r.forgiven, 0, 0, MONEY_MAX) })
  }
  return cap(out, CAPS.history)
}

function readTours(v: unknown): MusicExtra['tours'] {
  const out: MusicExtra['tours'] = []
  for (const x of cap(arr(v), CAPS.tours * 4)) {
    const r = rec(x)
    if (typeof r.year !== 'number' || !Number.isFinite(r.year)) continue
    out.push({ year: int(r.year, 0, 0, 9999), tier: txt(r.tier, TIER_MAX), shows: int(r.shows, 0, 0, 30), gate: int(r.gate, 0, 0, MONEY_MAX), costs: int(r.costs, 0, 0, MONEY_MAX), net: int(r.net, 0, -MONEY_MAX, MONEY_MAX) })
  }
  return cap(out, CAPS.tours)
}

function readMods(v: unknown): MusicExtra['mods'] {
  const byId = new Map<string, MusicExtra['mods'][number]>()
  for (const x of cap(arr(v), CAPS.mods * 4)) {
    const r = rec(x)
    const id = txt(r.id, ID_MAX)
    const kind = oneOf(r.kind, MOD_KINDS, 'units')
    if (!id || r.kind !== kind) continue
    byId.delete(id)
    byId.set(id, { id, kind, mult: flt(r.mult, 1, 0.5, 1.5), until: int(r.until, 0, 0, 9999) })
  }
  return cap([...byId.values()], CAPS.mods)
}

/** Clamps and defaults every career field of a record; never throws. */
export function normalizeExtra(raw: Raw, g: GameState): MusicExtra {
  return {
    migrated: raw.migrated === true,
    deal: readDeal(raw.deal, g),
    history: readHistory(raw.history),
    ledger: readLedger(raw.ledger),
    tours: readTours(raw.tours),
    mods: readMods(raw.mods),
    policy: { samples: oneOf(rec(raw.policy).samples, SAMPLE_MODES, 'original') },
    awards: strings(raw.awards, CAPS.awards, AWARD_MAX),
  }
}

/** The musician's job record when it is a musician job whose data is an object; null otherwise. Pure. */
function jobData(g: GameState): MusicJob | null {
  const job = musicJob(g)
  if (!job || !job.data || typeof job.data !== 'object' || Array.isArray(job.data)) return null
  return mdView(job)
}

/**
 * The label deal of a legacy job, in memory: a solo job with a label, years left and an advance a year.
 * Its terms are the grandfathered ones (royalty exactly 1, nothing to recoup, trust 55) for the rest of
 * the current term, at most 8 years. Pure: it reads the job and writes nothing.
 */
export function legacyDeal(g: GameState): LabelDeal | null {
  const job = musicJob(g)
  const d = jobData(g)
  if (!job || !d || d.mode !== 'solo' || !d.label || d.contractYears <= 0 || d.advancePerYear <= 0) return null
  const label = txt(d.label, LABEL_MAX)
  if (!label) return null
  const years = Math.min(LEGACY_YEARS_MAX, d.contractYears)
  const perYear = Math.min(ADVANCE_MAX, d.advancePerYear)
  const known = LABEL_ROSTER.find((l) => l.name === label)
  return {
    id: 'legacy',
    appt: appointmentId(job),
    labelId: labelId(label),
    label,
    tier: known ? known.tier : 1,
    since: int(g.year, 0, 0, 9999),
    term: years,
    years,
    royalty: 1,
    advance: Math.min(ADVANCE_MAX, perYear * years),
    perYear,
    unrecouped: 0,
    trust: 55,
    legacy: true,
    renewals: 0,
  }
}

/** v0 to v1: the legacy label deal, lifted from the job. Reads only; never writes the legacy profile or the job. */
function migrateLegacy(raw: Raw, g: GameState): Raw {
  return { ...raw, deal: legacyDeal(g), migrated: false }
}

export const musicStore: CareerStore<MusicState> = defineCareerState<MusicExtra>({
  key: 'music.sim',
  version: 1,
  start: 20,
  migrate: [migrateLegacy],
  extra: normalizeExtra,
})

/** The deal while a musician job is held and the deal belongs to this appointment; null once the job changed or ended. Pure. */
export function dealOf(g: GameState, s: MusicState): LabelDeal | null {
  const job = musicJob(g)
  if (!job || !s.deal) return null
  return s.deal.appt === appointmentId(job) ? s.deal : null
}

/**
 * The standing: round(0.5 q + 0.4 popularity + 0.1 fame), 0 to 100. q is the last release's quality, times
 * 0.6 unless it came out last year or this one. Reads the legacy discography, which every release writes,
 * so legacy-tail and ledger releases both count. Pure.
 */
export function musicScore(g: GameState, _s: MusicState): number {
  const d = jobData(g)
  const last = viewMusic(g).discography.at(-1)
  const q = last ? (last.age >= g.character.age - 1 ? last.quality : last.quality * 0.6) : 0
  const score = Math.round(0.5 * q + 0.4 * (d ? d.popularity : 0) + 0.1 * fameOf(g))
  return Number.isFinite(score) ? Math.min(100, Math.max(0, score)) : 0
}

/**
 * The sim takes over from the legacy hook: first call only. Sets `migrated`, re-reads a legacy deal
 * from the job (the legacy hook may have moved or finished the term since the record was made, and a
 * term must never be settled twice), stamps a sim-made deal with the job's appointment and sets the
 * standing. Actions and hooks only.
 */
export function adoptMusic(g: GameState, s: MusicState): void {
  if (s.migrated) return
  s.migrated = true
  if (!s.deal || s.deal.legacy) s.deal = legacyDeal(g)
  else {
    const job = musicJob(g)
    if (job) s.deal.appt = appointmentId(job)
  }
  s.standing = musicScore(g, s)
  s.peak = Math.max(s.peak, s.standing)
}

/** The product of the live mods of a kind (until >= year), clamped 0.5 to 1.5. Pure. */
export function modMult(s: MusicState, kind: 'units' | 'fill', year: number): number {
  let m = 1
  for (const x of s.mods) if (x.kind === kind && x.until >= year) m *= x.mult
  return Math.min(1.5, Math.max(0.5, m))
}

/** How many ledger rows charted from 1 to `top` within the last `years` years (year - row.year < years). Pure. */
export function topPeaks(s: MusicState, year: number, top: number, years: number): number {
  let n = 0
  for (const r of s.ledger) if (r.peak >= 1 && r.peak <= top && year - r.year < years) n++
  return n
}
