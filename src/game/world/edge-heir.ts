// The heir copy of the edges (R4-E8, D.9, X28, X33, C10): what the people who knew the late player carry over to the heir. Pure: a map in,
// a map out, nothing stored, nothing drawn. Life's carryEdges (R4-L9) calls it over the edges that end at the old ego, merges the answer
// as it is returned and does not re-key it a second time.
//
//   EGO_COPY         the share of each field that crosses: trust, affection and respect half, resentment 0.6, obligation whole
//   HEIR_KEEP_KINDS  the link kinds whose feud (q) and link (k) cross: only `kin`. A rival, a company, a staff and a pair link name the
//                    late player's own position, so they end at the hand-over (X28). R6 may append a kind with a reason.
//   heirEdges(map, fromEgo, toEgo, year)
//
// What heirEdges does to every edge `X > fromEgo` of the map, and to nothing else (a key that starts at the late player, a secret, a key
// that is no edge, an edge of the heir to themself and an edge of the late player to themself are left behind):
//   - the edge is returned as `X > toEgo`: the same first end, the heir as second end;
//   - t, f and r are halved, s is scaled by 0.6 and o by 1, each cut to its range first and rounded to hundredths, and a field is never
//     raised. A direct kin's affection f is then set by Life to the blended Person.relationship (X33), so it is not half of the old number;
//   - every memory keeps one point less of weight and a memory at weight 1 goes. The pinned five are not exempt: standing and memory do
//     not pass (D4);
//   - the dialogue store (n, d), the favor call-in stamp (c) and the debt (dv) are dropped. The legacy record carries what the late player
//     was owed (L6), and a debt the late player owed was paid or lapsed in step 1 of the hand-over, so no dv survives (C10);
//   - the feud rung (q) and the link kind (k) are kept only when k is in HEIR_KEEP_KINDS;
//   - the start year y is kept (never after the hand-over) and the last touch l is the hand-over year, so a kept edge is not an orphan.
// The answer is read back through the edge normalizer, so a hostile map copies to a valid one and 100 times any cap of EDGE_CAPS comes out
// inside it (the lowest-salience edges go first, an edge that is bound last). Nothing the input holds is shared with the answer.
//
// Layer 2: it imports the ref grammar, the memory text, the edge model and the world rows. It draws no number and reads no game.
import { parseRef, type EntityRef } from '../kernel/ids'
import { formatMemory, parseMemory } from './edge-memory'
import { LINK_KINDS, edgeKey, isSecretKey, normalizeEdges, type EdgeMap } from './edges'
import { SEEN_MAX, SEEN_MIN, isPlain } from './rows'

/** What crosses to the heir, by field: trust, affection and respect half, resentment 0.6 of itself, obligation whole. */
export const EGO_COPY = Object.freeze({ t: 0.5, f: 0.5, r: 0.5, s: 0.6, o: 1 })

/** The link kinds whose feud and link survive the switch. Only `kin` in R4 (X28). */
export const HEIR_KEEP_KINDS: ReadonlySet<string> = new Set(['kin'])

/** Memories read from the end of a list at most: the edge normalizer reads the last 64 of a list and no more. */
const SCAN_MAX = 64

type Rec = Record<string, unknown>

const hasOwn = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k)
const own = (o: Rec, k: string): unknown => (hasOwn(o, k) ? o[k] : undefined)
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
const isYear = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x) && x >= SEEN_MIN && x <= SEEN_MAX
/** isSecretKey as a plain test: its own signature is a type guard, which would narrow the key to never on the other side. */
const isSecret = (k: string): boolean => isSecretKey(k)
const isKind = (x: unknown): boolean => typeof x === 'string' && (LINK_KINDS as readonly string[]).includes(x)

/** A field cut to its range and scaled; for a factor under 1 the answer is never above the cut value. Null when the field is not a finite number. */
function crossed(v: unknown, lo: number, hi: number, factor: number): number | null {
  if (!isNum(v)) return null
  const c = Math.min(hi, Math.max(lo, v))
  const x = Math.round(c * factor * 100) / 100
  return factor < 1 ? Math.min(c, x) : x
}

/** The memories of a raw list that cross: each parsed, one point lighter, those that are left in the order they came in. Undefined when none is left. */
function lighter(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out: string[] = []
  for (let i = Math.max(0, raw.length - SCAN_MAX); i < raw.length; i++) {
    const m = parseMemory(raw[i])
    if (m !== null && m.w >= 2) out.push(formatMemory({ ...m, w: m.w - 1 }))
  }
  return out.length > 0 ? out : undefined
}

/** One edge as it crosses, or null when it cannot (a required number that is not a number). */
function copyOf(e: unknown, year: number): Rec | null {
  if (!isPlain(e)) return null
  const t = crossed(own(e, 't'), 0, 100, EGO_COPY.t)
  const f = crossed(own(e, 'f'), 0, 100, EGO_COPY.f)
  const r = crossed(own(e, 'r'), 0, 100, EGO_COPY.r)
  const s = crossed(own(e, 's'), 0, 100, EGO_COPY.s)
  const o = crossed(own(e, 'o'), -100, 100, EGO_COPY.o)
  const y = own(e, 'y')
  const l = own(e, 'l')
  if (t === null || f === null || r === null || s === null || o === null || !isNum(y) || !isNum(l)) return null
  const touched = isYear(year) ? year : Math.round(Math.min(SEEN_MAX, Math.max(SEEN_MIN, l)))
  const out: Rec = { t, f, r, s, o, y: Math.min(touched, Math.round(Math.min(SEEN_MAX, Math.max(SEEN_MIN, y)))), l: touched }
  const m = lighter(own(e, 'm'))
  if (m !== undefined) out.m = m
  const k = own(e, 'k')
  if (isKind(k) && HEIR_KEEP_KINDS.has(k as string)) {
    out.k = k
    const q = own(e, 'q')
    if (Array.isArray(q) && q.length === 3) out.q = [q[0], q[1], q[2]]
  }
  return out
}

/**
 * The edges that end at `fromEgo`, as the edges that end at `toEgo`, with the numbers, memories and fields the heir carries (see the header).
 * Pure and total: any value in, a valid edge map out, never a throw, the input untouched. Keys come back ascending and final.
 */
export function heirEdges(map: EdgeMap, fromEgo: EntityRef, toEgo: EntityRef, year: number): EdgeMap {
  try {
    if (!isPlain(map) || parseRef(fromEgo) === null || parseRef(toEgo) === null || fromEgo === toEgo) return {}
    const out: Rec = {}
    for (const key of Object.keys(map)) {
      try {
        if (isSecret(key)) continue
        const at = key.indexOf('>')
        if (at < 1 || key.slice(at + 1) !== fromEgo) continue
        const first = key.slice(0, at) as EntityRef
        if (first === fromEgo || first === toEgo || first === 'pool:other' || edgeKey(first, fromEgo) !== key) continue
        const to = edgeKey(first, toEgo)
        if (to === null) continue
        const e = copyOf(map[key], year)
        if (e !== null) out[to] = e
      } catch {
        // an entry that cannot be read is left behind
      }
    }
    return normalizeEdges(out)
  } catch {
    return {}
  }
}
