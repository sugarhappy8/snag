// Plain-JSON state of a game studio business (industry 'gameStudio'): its pipeline of games
// in development and its back catalog live in Asset.details.studio, next to the normal
// BizState, so the studio is saved, inherited, sold and listed like any other company.
// Light on imports on purpose: economy.ts reads studioValue() for the valuation.
import { genreDef, isGenre, isPlatform, isScope, NET_PER_PRICE, scopeDef, type GenreId, type PlatformId, type ScopeId } from '../special/gamedev-data'
import type { Json } from '../types'
import { engineIpValue, isStudioEngineId, normalizeEngines, type StudioEngine, type StudioEngineId } from './gamestudio-engine-state'

export type StudioPolicy = 'relaxed' | 'normal' | 'crunch'

export interface StudioGame {
  id: string
  title: string
  genre: GenreId
  platform: PlatformId
  scope: ScopeId
  engine: StudioEngineId
  /** dev → (ea) → live. */
  stage: 'dev' | 'ea' | 'live'
  progress: number
  quality: number
  /** Developers assigned. */
  team: number
  bugs: number
  hype: number
  started: number
  /** Calendar year it launched (0 while in development). */
  released: number
  critic: number
  players: number
  copies: number
  /** Copies expected next year. */
  tail: number
  /** US price per copy. */
  price: number
  /** Lifetime receipts. */
  gross: number
  dlcs: number
  lastDlc: number
  franchise: string
  sequelOf: string
  publisher: string
  /** Advance the publisher still has to earn back. */
  recoup: number
  /** Advance promised by the publisher (paid in milestones as the game gets built). */
  advance: number
  /** Advance received so far (clawed back if the game is cancelled). */
  advanceGot: number
  /** Exclusivity fee received (clawed back if the game is cancelled). */
  exclusiveFee: number
  /** The studio's share after recoup (1 when self-published). */
  devShare: number
  /** Platform holder that paid for exclusivity ('' = multiplatform as planned). */
  exclusive: string
  backers: number
  raised: number
  eaCopies: number
  eaTail: number
  /** Years spent crunching on it. */
  crunch: number
  /** Money spent developing it (salaries share, production costs). */
  spent: number
  awards: string[]
}

export interface StudioReport {
  year: number
  releases: string[]
  copies: number
  revenue: number
  idle: boolean
}

export interface StudioState {
  v: number
  games: StudioGame[]
  engines: StudioEngine[]
  engineSeq: number
  policy: StudioPolicy
  seq: number
  hits: number
  flops: number
  /** Years spent with crunch as the policy. */
  crunchYears: number
  /** Acquisition offers turned down. */
  declined: number
  report: StudioReport | null
}

export const STUDIO_VERSION = 2
const MAX_GAMES = 24
export const MAX_STUDIO_SEQUENCE = 999_999_999

function obj(v: Json | undefined): Record<string, Json> {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {}
}

function num(v: Json | undefined, d = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : d
}

function str(v: Json | undefined, d = ''): string {
  return typeof v === 'string' ? v : d
}

function clampN(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo
  return Math.max(lo, Math.min(hi, n))
}

function whole(n: number): number {
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0
}

export function readStudioGame(v: Json, i: number): StudioGame | null {
  const o = obj(v)
  const title = str(o.title).trim()
  if (!title) return null
  const stage = o.stage === 'live' || o.stage === 'ea' ? o.stage : 'dev'
  return {
    id: str(o.id).trim().slice(0, 80) || `sg${i}`,
    title: title.slice(0, 60),
    genre: isGenre(o.genre) ? o.genre : 'platformer',
    platform: isPlatform(o.platform) ? o.platform : 'pc',
    scope: isScope(o.scope) ? o.scope : 'small',
    engine: isStudioEngineId(o.engine) ? o.engine : 'cobalt',
    stage,
    progress: clampN(num(o.progress, stage === 'live' ? 100 : 0), 0, 100),
    quality: clampN(num(o.quality, 50), 0, 100),
    team: whole(clampN(num(o.team), 0, 100_000)),
    bugs: clampN(num(o.bugs), 0, 100),
    hype: clampN(num(o.hype), 0, 100),
    started: whole(num(o.started)),
    released: whole(num(o.released)),
    critic: Math.round(clampN(num(o.critic), 0, 100)),
    players: Math.round(clampN(num(o.players), 0, 100)),
    copies: whole(num(o.copies)),
    tail: whole(num(o.tail)),
    price: clampN(num(o.price, scopeDef(str(o.scope)).price), 0, 200),
    gross: whole(num(o.gross)),
    dlcs: whole(clampN(num(o.dlcs), 0, 20)),
    lastDlc: whole(num(o.lastDlc)),
    franchise: str(o.franchise).slice(0, 60),
    sequelOf: str(o.sequelOf),
    publisher: str(o.publisher).slice(0, 60),
    recoup: whole(num(o.recoup)),
    advance: whole(num(o.advance)),
    advanceGot: whole(num(o.advanceGot)),
    exclusiveFee: whole(num(o.exclusiveFee)),
    devShare: clampN(num(o.devShare, 1), 0, 1),
    exclusive: str(o.exclusive).slice(0, 60),
    backers: whole(num(o.backers)),
    raised: whole(num(o.raised)),
    eaCopies: whole(num(o.eaCopies)),
    eaTail: whole(num(o.eaTail)),
    crunch: whole(num(o.crunch)),
    spent: whole(num(o.spent)),
    awards: Array.isArray(o.awards) ? o.awards.filter((x): x is string => typeof x === 'string').slice(-6) : [],
  }
}

function readReport(v: Json | undefined): StudioReport | null {
  const o = obj(v)
  if (typeof o.year !== 'number' || !Number.isFinite(o.year)) return null
  return {
    year: Math.round(o.year),
    releases: Array.isArray(o.releases) ? o.releases.filter((x): x is string => typeof x === 'string').slice(0, 8) : [],
    copies: whole(num(o.copies)),
    revenue: whole(num(o.revenue)),
    idle: o.idle === true,
  }
}

/** A complete studio state from whatever is stored (old saves have none). */
export function normalizeStudio(raw: Json | undefined): StudioState {
  const o = obj(raw)
  const policy = o.policy === 'relaxed' || o.policy === 'crunch' ? o.policy : 'normal'
  const engines = normalizeEngines(o.engines)
  const ids = new Set<string>()
  const games = trimStudioGames(
    (Array.isArray(o.games) ? o.games : [])
      .map(readStudioGame)
      .filter((x): x is StudioGame => !!x && !ids.has(x.id) && !!ids.add(x.id)),
  )
  const savedSeqRaw = whole(num(o.seq))
  const savedSeq = Number.isSafeInteger(savedSeqRaw) && savedSeqRaw <= MAX_STUDIO_SEQUENCE ? savedSeqRaw : 0
  const idSeq = games.reduce((max, x) => {
    const match = /^sg(\d+)$/.exec(x.id)
    if (!match) return max
    const value = Number(match[1])
    return Number.isSafeInteger(value) && value <= MAX_STUDIO_SEQUENCE ? Math.max(max, value) : max
  }, 0)
  return {
    v: STUDIO_VERSION,
    games,
    engines,
    engineSeq: Math.max(whole(clampN(num(o.engineSeq), 0, 999_999_999)), ...engines.map((x) => Number(x.id.slice(6)))),
    policy,
    seq: Math.max(savedSeq, idSeq),
    hits: whole(num(o.hits)),
    flops: whole(num(o.flops)),
    crunchYears: whole(num(o.crunchYears)),
    declined: whole(num(o.declined)),
    report: readReport(o.report),
  }
}

/** Keep the catalog bounded: games that stopped selling go first (the pipeline always stays). */
export function trimStudioGames(games: StudioGame[]): StudioGame[] {
  const out = [...games]
  while (out.length > MAX_GAMES) {
    let worst = -1
    let score = Infinity
    out.forEach((x, i) => {
      if (x.stage !== 'live' || x.tail > 0) return
      // Nothing writes `awards` yet (the real awards ledger is F.10), so a stored list counts for
      // at most two: 60 points, never enough to pin a game against a critic score of up to 100.
      const s = x.critic + Math.log10(1 + x.copies) * 5 + Math.min(2, x.awards.length) * 30
      if (s < score) {
        score = s
        worst = i
      }
    })
    if (worst < 0) break
    out.splice(worst, 1)
  }
  return out
}

/** Read-only copy of a studio's state from its asset details. */
export function readStudio(details: Record<string, Json> | undefined): StudioState {
  return normalizeStudio(details?.studio)
}

export function devGames(st: StudioState): StudioGame[] {
  return st.games.filter((x) => x.stage !== 'live')
}

export function liveGames(st: StudioState): StudioGame[] {
  return st.games.filter((x) => x.stage !== 'dev')
}

/** Developers assigned to games AND engines share the same payroll and offices. */
export function assignedDevs(st: StudioState): number {
  return devGames(st).reduce((s, x) => s + x.team, 0) + st.engines.filter((x) => x.stage === 'dev').reduce((s, x) => s + x.team, 0)
}

/**
 * What the studio's games are worth beyond last year's profits: the remaining sales of the
 * back catalog and the work sunk into the pipeline. Used by economy.valuationOf.
 */
export function studioValue(raw: Json | undefined): number {
  const st = normalizeStudio(raw)
  let v = st.engines.reduce((sum, x) => sum + engineIpValue(x), 0)
  for (const x of st.games) {
    if (x.stage !== 'dev' && x.tail > 0) {
      const keep = clampN(0.2 + 0.4 * Math.pow(x.players / 100, 1.5), 0.12, 0.6)
      const share = x.publisher ? x.devShare * 0.6 : 1
      v += x.tail * x.price * NET_PER_PRICE * share * (1 / (1 - keep)) * 0.6
    }
    if (x.stage !== 'live') v += x.spent * (0.25 + 0.45 * (x.progress / 100)) * clampN(x.quality / 70, 0.5, 1.4) + x.hype * 0.002 * x.spent
    // Franchises with fans are worth something on their own.
    if (x.stage === 'live' && x.critic >= 80 && x.copies >= scopeDef(x.scope).potential * 0.3) v += x.copies * x.price * 0.05
  }
  return Math.max(0, Math.round(Number.isFinite(v) ? v : 0))
}

/** "3 in development · 5 released". */
export function studioLine(st: StudioState): string {
  const dev = devGames(st)
  const live = st.games.filter((x) => x.stage === 'live')
  const best = live.reduce((m, x) => Math.max(m, x.critic), 0)
  const parts = [`${dev.length} in development`, `${live.length} released`]
  const owned = st.engines.filter((x) => x.stage === 'ready').length
  const building = st.engines.filter((x) => x.stage === 'dev').length
  if (owned || building) parts.push(`${owned} engines owned${building ? `, ${building} being built` : ''}`)
  if (best > 0) parts.push(`best critic score ${best}`)
  return parts.join(' · ')
}

export function genreLabel(id: GenreId): string {
  return genreDef(id).label
}
