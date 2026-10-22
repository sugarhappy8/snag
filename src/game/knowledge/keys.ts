// R3-H2 (H.1): keys and the rule table.
//
// A key names one hidden number: `<kind>:<id>[:<id>]:<field>`, at most 64 characters, for example `mkt:cafe:us:size` or
// `riv:r12:quality`. An owner whose natural id is longer hashes it (hashKey(...).toString(36)). The rule table has one row per
// `kind.field`, with `kind.*` for the rest of a kind; later tracks add rows, they never edit these. A key whose kind has no row
// is not fogged (estimate.ts returns the exact estimate), and test/knowledge-estimate.test.ts pins the table.
//
//   sd0      the passive relative sd: what the player reads with no research
//   drift    how fast the truth moves each year: a stored reading ages as sqrt(sd^2 + drift^2 years)
//   talents  sharpen the passive read (x .6) and a source's read (x .8); Main Character sharpens every kind
//
// `own:` keys are the player's own books and are always exact; they need no row.
import type { Rule, Unit } from './types'

export const KEY_MAX = 64

export interface ParsedKey {
  kind: string
  /** One or two ids. */
  ids: string[]
  field: string
}

const KIND = /^[a-z][a-z0-9]{0,11}$/
const PART = /^[A-Za-z0-9._~-]{1,40}$/

/** Whether `kind` can start a key: a lower case word of 12 characters at most, with no colon. */
export const isKindName = (kind: unknown): kind is string => typeof kind === 'string' && KIND.test(kind)

/** The parts of a key, or null when it is not `<kind>:<id>[:<id>]:<field>` of 64 characters at most. */
export function parseKey(key: string): ParsedKey | null {
  if (typeof key !== 'string' || key.length > KEY_MAX) return null
  const parts = key.split(':')
  if (parts.length < 3 || parts.length > 4) return null
  const kind = parts[0]!
  if (!KIND.test(kind)) return null
  for (let i = 1; i < parts.length; i++) if (!PART.test(parts[i]!)) return null
  return { kind, ids: parts.slice(1, -1), field: parts[parts.length - 1]! }
}

/** An own: key is the player's own number: never fogged. */
export function isExactKey(key: string): boolean {
  return typeof key === 'string' && key.startsWith('own:')
}

const BUSINESS = ['Business'] as const
const INVESTING = ['Investing'] as const
const STAGE = ['Acting', 'Modeling'] as const
const NONE: readonly string[] = []

function row(unit: Unit | null, sd0: number, drift: number, talents: readonly string[], byOpts?: true): Rule {
  return Object.freeze({ unit, sd0, drift, talents: Object.freeze([...talents]), ...(byOpts ? { byOpts } : {}) })
}

/**
 * The rule table, by `kind.field` or `kind.*`.
 *
 * Markets, rivals, candidates, odds, forecasts and hint values read with the Business talent; securities, funds and valuations
 * with Investing; casting and peers with Acting or Modeling. `eco` and `pol` list no talent (only Main Character sharpens them),
 * and ppl, war, story and show are reserved for R4 to R9 with their numbers already set.
 */
export const RULES: Readonly<Record<string, Rule>> = Object.freeze({
  'mkt.size': row('money', 0.25, 0.06, BUSINESS),
  'mkt.share': row('pct', 0.25, 0.15, BUSINESS),
  'mkt.*': row('count', 0.25, 0.08, BUSINESS),
  'riv.quality': row('score', 0.3, 0.1, BUSINESS),
  'riv.tech': row('score', 0.3, 0.1, BUSINESS),
  'riv.line': row('score', 0.3, 0.1, BUSINESS),
  'riv.cash': row('money', 0.6, 0.35, BUSINESS),
  'riv.*': row('money', 0.3, 0.15, BUSINESS),
  'cmp.score': row('score', 0.2, 0.1, BUSINESS),
  'cmp.*': row('money', 0.25, 0.1, BUSINESS),
  'scn.*': row('delta', 0.3, 0.15, BUSINESS),
  'hint.*': row(null, 0.2, 0, NONE, true),
  'cand.skill': row('score', 0.18, 0, BUSINESS),
  'odds.*': row('odds', 0.2, 0.05, BUSINESS),
  'ev.*': row('money', 0.3, 0, BUSINESS),
  'sec.*': row('pct', 0.25, 0.2, INVESTING),
  'fund.*': row('pct', 0.25, 0.2, INVESTING),
  'val.*': row('money', 0.3, 0.15, INVESTING),
  'cast.*': row('score', 0.25, 0.15, STAGE),
  'peer.*': row('score', 0.25, 0.15, STAGE),
  'eco.*': row('pct', 0.05, 0.02, NONE),
  'pol.*': row('score', 0.25, 0.25, NONE),
  'ppl.*': row('score', 0.45, 0.2, NONE),
  'war.*': row('score', 0.3, 0.25, NONE),
  'story.*': row('score', 0.3, 0.25, NONE),
  'show.*': row('score', 0.3, 0.25, NONE),
})

/** The row for a key (`kind.field`, else `kind.*`), or null: not a key, an own: key, or a kind with no row. */
export function ruleOf(key: string): Rule | null {
  const p = parseKey(key)
  if (!p || isExactKey(key)) return null
  return RULES[`${p.kind}.${p.field}`] ?? RULES[`${p.kind}.*`] ?? null
}
