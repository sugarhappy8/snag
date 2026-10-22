// R3-H2 (H.1): the shapes of the estimate core. Types only.

/**
 * What a hidden number is measured in, which decides the scale its noise lives on.
 *   money, count, pct   log scale: the sd is relative (.25 is about a quarter either way); the value must be above 0. pct is a
 *                       fraction of 1 (0.12 is 12%), like every share and rate in the engine.
 *   score               0 to 100, additive: the sd is in hundredths of the range (.18 is 18 points); clipped to 0..100.
 *   odds                0 to 1, additive: the sd is in hundredths of the range (.20 is 20 points of chance); clipped to 0..1.
 *   delta               a signed money amount, additive: the sd is relative to `opts.scale` (the company's revenue, or |truth|).
 */
export type Unit = 'money' | 'count' | 'pct' | 'score' | 'odds' | 'delta'

/** A word ladder: [upper bound (exclusive), word], in rising order. The first entry above the value wins; the last word catches the rest. */
export type Ladder = readonly (readonly [cut: number, word: string])[]

/** What a menu shows for one hidden number. Built by estimate.ts; never stored whole (a StoredRow is). */
export interface Estimate {
  key: string
  /** The reading: what the player believes. In Exact mode (or an own: key) it is the truth. */
  mid: number
  /** lo..hi is the 80% band, in the unit of the truth. */
  lo: number
  hi: number
  /** The relative sd the band was built from, after decay, the floor and talent. 0 when exact. */
  sd: number
  /** sd <= .06 is 3, <= .15 is 2, <= .30 is 1, else 0. */
  conf: 0 | 1 | 2 | 3
  /** The year and source of the reading: 'passive', a purchased source, or 'exact'. */
  y: number
  src: string
  /** Exact mode, or an own: key, or a truth that cannot be fogged: the caller keeps its old text. */
  exact: boolean
  /** Set only when the reading is 2 or more years old (the chip prints "as of 2023"). */
  asOf?: number
  /** What a menu prints: '$4.2M', 'about $4M', '$3M to $5M', 'in the millions', 'likely'. */
  words: string
}

export interface EstimateOpts {
  /** Overrides the unit of the rule row. Required for a `hint:` key, whose row has no unit of its own. */
  unit?: Unit
  /** Exposure, 0 to 1: the player's own presence. The passive sd is multiplied by (1 - .4 exp). */
  exp?: number
  /** What to print when the sd is above .30 (and, for odds, above .15). Default: a ladder for the unit. */
  ladder?: Ladder
  /** The size a `delta` is measured against (normally the company's revenue). Default: |truth|. */
  scale?: number
  /** The talent that sharpens a `hint:` key (those rows list none of their own). Ignored by every other kind. */
  talent?: string
}

/**
 * One reading kept from before: the record's row once parsed (R3-H3 writes it). `mid` is in the unit of the truth; `sd` is
 * relative, as in Estimate.sd (for a delta, relative to the scale of the call that reads it). `src` may name several sources
 * ('press+report') when more than one was merged in year `y`.
 */
export interface StoredRow {
  mid: number
  sd: number
  y: number
  src: string
}

/** One row of the rule table (keys.ts). */
export interface Rule {
  /** null: the caller says (a `hint:` key). */
  unit: Unit | null
  /** The passive relative sd. */
  sd0: number
  /** The yearly drift of the truth: a stored row's sd grows as sqrt(sd^2 + drift^2 years). */
  drift: number
  /** Talents that sharpen this kind (passive sd x .6, a source's sd x .8). Main Character sharpens every kind. */
  talents: readonly string[]
  /** The talent comes from the caller (opts.talent), not the row. */
  byOpts?: true
}
