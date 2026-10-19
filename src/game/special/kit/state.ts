// Career kit, state: one versioned, owner-stamped, bounded record per career at
// g.flags['special.<key>'] (key 'actor.sim', 'astronaut.sim', 'model.sim', 'music.sim'). Every reader tolerates junk
// and never throws; every number it returns is finite and capped. A new life (an heir) never matches
// the owner stamp, so it starts from an empty record. The kit imports no career file.
import type { GameState, Job } from '../../types'
import { ownerKey, peek, prof } from '../common'

export type Raw = Record<string, unknown>

export const KIT_LIMITS = { rows: 12, memory: 16, cool: 24, done: 24, line: 90 } as const

/** One closed career year. rank 0 of 0 means no peers. */
export interface YearRow { y: number; income: number; spent: number; rank: number; of: number; standing: number; note: string }
/** A rival the career remembers. grudge is 0-100; the step size is the career's own. */
export interface MemoryRow { id: string; name: string; met: number; won: number; lost: number; grudge: number; last: number }
export interface Stamped { v: number; owner: string; settledYear: number; settledAge: number; seq: number }
export interface CareerBase extends Stamped {
  standing: number
  peak: number
  years: number
  appt: string
  rows: YearRow[]
  memory: MemoryRow[]
  cool: Record<string, number>
  done: string[]
}

export interface StateSpec<X extends object> {
  /** Flag `special.<key>`, e.g. 'actor.sim'. Never a legacy key: stale keys are pruned on mut. */
  key: string
  /** At least 1. */
  version: number
  /** migrate[i] lifts v_i to v_(i+1); a record with no v is v0. Each step gets a shallow copy and g; it may read a legacy profile and never writes one. */
  migrate: readonly ((raw: Raw, g: GameState) => Raw)[]
  /** Clamp and default every career field. Must return the whole career schema. */
  extra: (raw: Raw, g: GameState) => X
  /** Initial standing, default 20. */
  start?: number
}

export interface CareerStore<S extends CareerBase> {
  readonly key: string
  readonly version: number
  /** Pure: a record of this owner exists. */
  has(g: GameState): boolean
  /** Pure normalized copy; null for another owner or no record. */
  peek(g: GameState): S | null
  /** peek, else a fresh record built by the migration chain from nothing. Pure, never writes: menus, hints, subtitles. */
  view(g: GameState): S
  /** The live record, created, migrated and normalized in place, stale keys pruned. Actions, scripts and yearly hooks only. */
  mut(g: GameState): S
  /** Pure migrate and normalize of any value (for tests). */
  read(raw: unknown, g: GameState): S
}

// ---------------------------------------------------------------------------
// Junk-tolerant readers

const KEY_MAX = 60
const NAME_MAX = 40
const SCAN_MAX = 4096
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g

export function rec(v: unknown): Raw {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Raw) : {}
}

export function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}

/** Rounded, clamped integer; the (clamped) default on anything that is not a finite number. */
export function int(v: unknown, d: number, lo: number, hi: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : Number.isFinite(d) ? d : lo
  return Math.min(hi, Math.max(lo, n)) + 0
}

export function flt(v: unknown, d: number, lo: number, hi: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : Number.isFinite(d) ? d : lo
  return Math.min(hi, Math.max(lo, n)) + 0
}

/** Control characters stripped, trimmed, cut to max. */
export function txt(v: unknown, max: number, d = ''): string {
  if (!(max > 0)) return ''
  let s = typeof v === 'string' ? v : d
  if (s.length > SCAN_MAX) s = s.slice(0, SCAN_MAX)
  s = s.replace(CONTROL, '').trim().slice(0, Math.floor(max))
  const last = s.charCodeAt(s.length - 1)
  return last >= 0xd800 && last <= 0xdbff ? s.slice(0, -1) : s
}

/** The newest `max` entries. */
export function cap<T>(list: readonly T[], max: number): T[] {
  const n = Number.isFinite(max) ? Math.max(0, Math.floor(max)) : 0
  if (n === 0) return []
  return list.length > n ? list.slice(list.length - n) : list.slice()
}

export function readRows(v: unknown): YearRow[] {
  const out: YearRow[] = []
  for (const x of cap(arr(v), KIT_LIMITS.rows * 4)) {
    const r = rec(x)
    if (typeof r.y !== 'number' || !Number.isFinite(r.y)) continue
    out.push({
      y: int(r.y, 0, 0, 9999),
      income: int(r.income, 0, 0, 1e13),
      spent: int(r.spent, 0, 0, 1e13),
      rank: int(r.rank, 0, 0, 1000),
      of: int(r.of, 0, 0, 1000),
      standing: int(r.standing, 0, 0, 100),
      note: txt(r.note, KIT_LIMITS.line),
    })
  }
  return cap(out, KIT_LIMITS.rows)
}

export function readMemory(v: unknown): MemoryRow[] {
  const byId = new Map<string, MemoryRow>()
  for (const x of cap(arr(v), KIT_LIMITS.memory * 4)) {
    const r = rec(x)
    const id = txt(r.id, KEY_MAX)
    if (!id) continue
    byId.set(id, {
      id,
      name: txt(r.name, NAME_MAX),
      met: int(r.met, 0, 0, 1e6),
      won: int(r.won, 0, 0, 1e6),
      lost: int(r.lost, 0, 0, 1e6),
      grudge: int(r.grudge, 0, 0, 100),
      last: int(r.last, 0, 0, 9999),
    })
  }
  return cap([...byId.values()], KIT_LIMITS.memory)
}

function readCool(v: unknown): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [k0, x] of cap(Object.entries(rec(v)), KIT_LIMITS.cool * 4)) {
    if (typeof x !== 'number' || !Number.isFinite(x)) continue
    const k = txt(k0, KEY_MAX)
    if (k && k !== '__proto__') out[k] = int(x, 0, 0, 9999)
  }
  return Object.fromEntries(cap(Object.entries(out), KIT_LIMITS.cool))
}

function readDone(v: unknown): string[] {
  const seen = new Set<string>()
  for (const x of cap(arr(v), KIT_LIMITS.done * 4)) {
    const id = typeof x === 'string' ? txt(x, KEY_MAX) : ''
    if (id) seen.add(id)
  }
  return cap([...seen], KIT_LIMITS.done)
}

// ---------------------------------------------------------------------------
// Settle marker and small helpers

/** False when this (year, age) is already settled; otherwise writes the marker first, then true. */
export function claimSettle(s: Stamped, g: GameState): boolean {
  const year = g.year
  const age = g.character.age
  if (s.settledYear === year && s.settledAge === age) return false
  s.settledYear = year
  s.settledAge = age
  return true
}

/** `${prefix}${++seq}`, seq capped at 1e9. */
export function nextId(s: Stamped, prefix: string): string {
  const now = Number.isFinite(s.seq) ? Math.max(0, Math.floor(s.seq)) : 0
  s.seq = Math.min(1e9, now + 1)
  return `${prefix}${s.seq}`
}

/** job.data.appointmentId, or '' (no job, no data, or not a string). */
export function appointmentId(job: Job | null): string {
  const id = rec(job?.data).appointmentId
  return typeof id === 'string' ? txt(id, KEY_MAX) : ''
}

// ---------------------------------------------------------------------------
// Store

function readBase(r: Raw, version: number, start: number): CareerBase {
  const standing = int(r.standing, start, 0, 100)
  return {
    v: version,
    owner: txt(r.owner, KIT_LIMITS.line),
    settledYear: int(r.settledYear, -1, -1, 9999),
    settledAge: int(r.settledAge, -1, -1, 300),
    seq: int(r.seq, 0, 0, 1e9),
    standing,
    peak: Math.max(standing, int(r.peak, standing, 0, 100)),
    years: int(r.years, 0, 0, 9999),
    appt: txt(r.appt, KEY_MAX),
    rows: readRows(r.rows),
    memory: readMemory(r.memory),
    cool: readCool(r.cool),
    done: readDone(r.done),
  }
}

export function defineCareerState<X extends object>(spec: StateSpec<X>): CareerStore<CareerBase & X> {
  type S = CareerBase & X
  const version = Math.max(1, Math.floor(spec.version))
  const start = int(spec.start, 20, 0, 100)

  const read = (raw: unknown, g: GameState): S => {
    let r: Raw = rec(raw)
    for (let i = int(r.v, 0, 0, 1e6); i < version; i++) {
      const step = spec.migrate[i]
      if (!step) continue
      try {
        r = rec(step({ ...r }, g))
      } catch {
        // a broken step leaves the record as it was; the normalizers below still bound it
      }
    }
    let x: X
    try {
      x = spec.extra(r, g)
    } catch {
      x = spec.extra({}, g)
    }
    // base fields come last, so a career can never shadow them; keys keep base-first order
    const b = readBase(r, version, start)
    return { ...b, ...x, ...b } as S
  }

  const flag = (g: GameState): Raw | null => peek<Raw>(g, spec.key)

  return {
    key: spec.key,
    version,
    read,
    has: (g) => flag(g) !== null,
    peek(g) {
      const f = flag(g)
      return f ? read(f, g) : null
    },
    view(g) {
      const f = flag(g)
      return read(f ?? {}, g)
    },
    mut(g) {
      const live = prof<Raw>(g, spec.key, (h) => read({}, h) as unknown as Raw)
      const norm = read(live, g) as unknown as Raw
      norm.owner = ownerKey(g)
      for (const k of Object.keys(live)) if (!(k in norm)) delete live[k]
      Object.assign(live, norm)
      return live as unknown as S
    },
  }
}
