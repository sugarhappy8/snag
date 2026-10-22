// The fact: the one plain record a world step hands to the bus (R2, design 14.4).
//
// A fact is a discrete event that other modules may want to hear about: a bankruptcy, a layoff round, a border closing. It is
// not money (money moves through the ledger, never through a fact) and it is not a story (text is made later, from the fact).
// So it is small and plain JSON: a kind, a year, up to two parties, a magnitude and a severity. normalizeFact is the only door a
// fact comes in by, from a handler, from a save or from a test, and it bounds everything: a hostile or broken fact never gets
// past it. This file imports nothing (L0).

/** Fields of a fact. `k` kind (dotted lower case), `y` year, `c` subject (an entity ref `kind:key` or a country id), `a` the other party, `v` magnitude, `s` severity. */
export interface Fact {
  k: string
  y: number
  c?: string
  a?: string
  v?: number
  s?: number
}

/** What a fact may hold. `cascade` is the most deliveries one top-level emit may cause (the bus counts them). */
export const FACT_LIMITS = { kind: 40, ref: 40, magnitude: 1e15, severity: 100, cascade: 64 } as const

/** A kind: a lower case word, then dotted lower case words or digits. */
const KIND = /^[a-z][a-z0-9]*(\.[a-z0-9]+)*$/

/** True for a fact kind: dotted lower case, at most 40 characters. */
export function isFactKind(v: unknown): v is string {
  return typeof v === 'string' && v.length <= FACT_LIMITS.kind && KIND.test(v)
}

/** A ref field: trimmed, cut to 40 characters (never in the middle of a surrogate pair), dropped when nothing is left. */
function cutRef(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const whole = v.trim()
  let s = whole.slice(0, FACT_LIMITS.ref)
  const last = s.charCodeAt(s.length - 1)
  if (s.length < whole.length && last >= 0xd800 && last <= 0xdbff) s = s.slice(0, -1)
  s = s.trimEnd()
  return s === '' ? undefined : s
}

/**
 * A fact from anything: null for a non-object, a bad kind, or a year that is not a finite integer. Otherwise a fresh plain
 * object with the keys k, y, c, a, v, s in that order (the optional ones only when valid): refs trimmed and cut, a magnitude
 * that is not finite dropped and one that is clamped to +-1e15 and rounded to 3 decimals, a severity rounded and clamped to 0
 * to 100. Unknown keys are not copied. The result is its own fixed point.
 */
export function normalizeFact(raw: unknown): Fact | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  const k = r.k
  const y = r.y
  if (!isFactKind(k)) return null
  if (typeof y !== 'number' || !Number.isInteger(y)) return null
  const out: Fact = { k, y }
  const c = cutRef(r.c)
  if (c !== undefined) out.c = c
  const a = cutRef(r.a)
  if (a !== undefined) out.a = a
  const v = r.v
  if (typeof v === 'number' && Number.isFinite(v)) {
    const clamped = Math.max(-FACT_LIMITS.magnitude, Math.min(FACT_LIMITS.magnitude, v))
    // `+ 0` turns a negative zero (a tiny negative value rounded) into 0.
    out.v = Math.round(clamped * 1000) / 1000 + 0
  }
  const s = r.s
  if (typeof s === 'number' && Number.isFinite(s)) out.s = Math.max(0, Math.min(FACT_LIMITS.severity, Math.round(s))) + 0
  return out
}
