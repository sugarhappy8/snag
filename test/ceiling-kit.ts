// R2-P4 (K.7b f, F.1 Ceilings): the probe rows behind test/ceiling-probe.test.ts. test/ceiling-list.json names every growth term
// that has a real-world cap; this file has one row for each, which feeds the term inputs a hundred times what a life reaches (a
// country's wealth, a book's readers, a podcast's audience, a year far in the future) and reports the worst value it saw against the
// limit the cap sentence promises. The rows call the game's exported functions only, so another track moving a module's insides
// does not touch them.
//
// A row's `run(scale)` returns the tightest case it found, the one with the highest value over limit; `value` must be at most
// `limit`. `at` says which case that was ("ng in 1950"), so a failure points at the input and not only at the term.
//
// To cover a new cap: add the entry to test/ceiling-list.json and a row here in the same commit.
import { typicalIncome, US_TYPICAL_INCOME } from '../src/game/events/wealth-core'
import { realWealthFactor } from '../src/game/history/events-people'
import { authorAdaptationOffer } from '../src/game/special/author-career'
import { normalizeAuthor } from '../src/game/special/author-state'
import { ownerKey } from '../src/game/special/common'
import { yearlyFame } from '../src/game/special/fame'
import { gamersIn, nextTail, publisherCopiesCap, titleCopiesCap } from '../src/game/special/gamedev-core'
import type { ScopeId } from '../src/game/special/gamedev-data'
import { payScale } from '../src/game/special/pay-scale'
import { dealCeiling } from '../src/game/special/sports-core'
import type { GameState } from '../src/game/types'
import { COUNTRIES } from '../src/game/world'
import { makeTestGame } from './helpers'

export interface CeilingProbe {
  /** An id of test/ceiling-list.json, or 'extra.<name>' for a probe the list does not name. */
  id: string
  /** The sentence the cap protects. */
  cap: string
  /** Inputs scaled by `scale`; `value` must be at most `limit`. `at` names the case that came closest. */
  run: (scale: number) => { value: number; limit: number; at?: string }
  /** A reason, when no function-level probe is possible. At most MAX_EXEMPT rows may have one. */
  exempt?: string
}

/** The scales a pull request runs, and the nightly (CEILING_PROBE=deep). */
export const SCALES: { light: readonly number[]; deep: readonly number[] } = { light: [1, 100], deep: [1, 10, 100, 1000] }

/** How many rows may be exempt. A ratchet: a fourth needs the lead. */
export const MAX_EXEMPT = 3

export const isExempt = (p: CeilingProbe): boolean => p.exempt !== undefined

// ---------------------------------------------------------------------------------------------- the harness

/** One message for each scale where the row's value is not at most its limit, or where it threw. Empty when the row holds. */
export function probeFailures(p: CeilingProbe, scales: readonly number[]): string[] {
  const out: string[] = []
  for (const scale of scales) {
    try {
      const r = p.run(scale)
      if (!(r.value <= r.limit)) {
        out.push(`${p.id} at ${scale}x: the value ${String(r.value)} is not at most the limit ${String(r.limit)}${r.at ? ` (${r.at})` : ''}. The cap: ${p.cap}`)
      }
    } catch (e) {
      out.push(`${p.id} at ${scale}x: the probe threw: ${e instanceof Error ? e.message : String(e)}. The cap: ${p.cap}`)
    }
  }
  return out
}

/** What is wrong with the set of rows against the ids of test/ceiling-list.json, one message each. Empty when it is sound. */
export function guardProblems(probes: readonly CeilingProbe[], listIds: readonly string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const p of probes) {
    if (seen.has(p.id)) out.push(`${p.id}: the row appears twice`)
    seen.add(p.id)
    if (!listIds.includes(p.id) && !p.id.startsWith('extra.')) out.push(`${p.id}: not in test/ceiling-list.json (a probe of your own takes an id that starts with extra.)`)
    if (p.cap.trim().length === 0) out.push(`${p.id}: the cap sentence is empty`)
    if (isExempt(p)) {
      const why = (p.exempt ?? '').trim()
      if (why.length < 20 || why.split(/\s+/).length < 4) out.push(`${p.id}: exempt without a reason (write a sentence of at least four words)`)
    }
  }
  for (const id of listIds) if (!seen.has(id)) out.push(`${id}: test/ceiling-list.json has it and CEILING_PROBES has no row for it (write one, or exempt it with a reason)`)
  const exempt = probes.filter(isExempt).length
  if (exempt > MAX_EXEMPT) out.push(`${exempt} rows are exempt, more than the ${MAX_EXEMPT} the ratchet allows: ask the lead`)
  return out
}

/** Keeps the case with the highest value over limit; a NaN value counts as the worst there is. */
function tightest(): { add: (value: number, limit: number, at: string) => void; result: () => { value: number; limit: number; at: string } } {
  let best = { value: 0, limit: 1, at: 'no case' }
  let bestRatio = -Infinity
  return {
    add(value, limit, at) {
      const ratio = Number.isNaN(value) ? Infinity : value / limit
      if (ratio > bestRatio) {
        bestRatio = ratio
        best = { value, limit, at }
      }
    },
    result: () => best,
  }
}

/** Runs `fn` with every country's wealth multiplied by `scale`, and puts each one back, even when `fn` throws. */
export function withWealth<T>(scale: number, fn: () => T): T {
  const saved = COUNTRIES.map((c) => c.wealth)
  try {
    for (const c of COUNTRIES) c.wealth *= scale
    return fn()
  } finally {
    COUNTRIES.forEach((c, i) => {
      c.wealth = saved[i]
    })
  }
}

// ---------------------------------------------------------------------------------------------- the rows

const ERAS = [1900, 1950, 2000, 2026, 2100] as const
/** Every year of the span the studio and Olympic rows read, and the one `scale` times today (far past any life). */
const yearsAt = (from: number, to: number, scale: number): number[] => [...Array.from({ length: to - from + 1 }, (_, i) => from + i), 2026 * scale]

/** A life of 30 in a country and year, with nothing else in it. Only its country and year are read. */
function lifeIn(countryId: string, year: number): GameState {
  const g = makeTestGame(1, { age: 30, countryId, birthCountryId: countryId, money: 0 })
  g.year = year
  return g
}

function adaptationRow(id: string, cap: string, pick: 'fee' | 'annual'): CeilingProbe {
  const multiple = pick === 'fee' ? 150 : 15
  return {
    id,
    cap,
    run: (scale) =>
      withWealth(scale, () => {
        const t = tightest()
        for (const [countryId, year] of [['us', 2026], ['mc', 2026], ['us', 1930], ['ng', 2026]] as const) {
          const g = lifeIn(countryId, year)
          const readers = 5_000_000 * scale
          const work = normalizeAuthor({
            works: [{ title: 'Probe', format: 'novel', genre: 'mystery', promise: 'mystery', stage: 'published', countryId, started: year - 2, released: year - 1, quality: 95, copies: readers, readers, adaptedUntil: 0 }],
          }).works[0]
          const offer = authorAdaptationOffer(g, work)
          t.add(offer[pick], multiple * typicalIncome(g, work.countryId), `${countryId} in ${year}`)
        }
        return t.result()
      }),
  }
}

/** A saved fame profile in a life of fame 100, one year of fame upkeep, and what the profile holds after it. */
function fameYear(profile: Record<string, unknown>): { podcast: { listeners: number } | null; books: { earned: number; royalty: number }[] } {
  const g = makeTestGame(1, { age: 30, money: 0 })
  g.character.hidden.fame = 100
  g.flags['special.fame'] = { owner: ownerKey(g), books: [], podcast: null, merchLines: 0, commercials: 0, ...profile } as never
  yearlyFame(g)
  return g.flags['special.fame'] as never
}

const TAIL_SCOPES: readonly ScopeId[] = ['jam', 'small', 'indie', 'aa', 'aaa']

export const CEILING_PROBES: readonly CeilingProbe[] = [
  {
    id: 'pay-scale',
    cap: 'pay follows the era and country typical income, and the country wealth stops at 1.6 (R0-12)',
    run: (scale) =>
      withWealth(scale, () => {
        const t = tightest()
        const g = lifeIn('us', 2026)
        for (const c of COUNTRIES) {
          for (const year of ERAS) {
            g.character.countryId = c.id
            g.year = year
            t.add(payScale(g), 1.6, `payScale in ${c.id} in ${year}`)
            t.add(typicalIncome(g, c.id, year), US_TYPICAL_INCOME * 1.6, `typicalIncome in ${c.id} in ${year}`)
          }
        }
        return t.result()
      }),
  },
  {
    id: 'endorsement-deal',
    cap: "an endorsement pays at most 40 times the typical income, scaled by the brand's fame (R0-7)",
    run: (scale) =>
      withWealth(scale, () => {
        const t = tightest()
        const g = lifeIn('us', 2026)
        for (const c of COUNTRIES) {
          for (const year of ERAS) {
            g.character.countryId = c.id
            g.year = year
            const deal = dealCeiling(g, { fame: 10 })
            t.add(deal / typicalIncome(g), 400, `deal over typical income in ${c.id} in ${year}`)
            t.add(deal, 400 * US_TYPICAL_INCOME * 1.6, `deal in ${c.id} in ${year}`)
          }
        }
        return t.result()
      }),
  },
  {
    id: 'olympic-bonus',
    cap: 'a medal bonus follows the real wealth of the year and the country (R0-7)',
    run: (scale) => {
      const t = tightest()
      for (const year of yearsAt(1800, 3000, scale)) t.add(realWealthFactor(year), 1, `year ${year}`)
      return t.result()
    },
  },
  {
    id: 'studio-title-copies',
    cap: "one title sells to at most 8 percent of the era's gamers (v4.0.1)",
    run: (scale) => {
      const t = tightest()
      for (const year of yearsAt(1900, 3000, scale)) t.add(titleCopiesCap(year) / gamersIn(year), 0.0801, `year ${year}`)
      return t.result()
    },
  },
  {
    id: 'studio-publisher-copies',
    cap: "one owner's studios sell to at most 10 percent of the era's gamers a year (v4.0.1)",
    run: (scale) => {
      const t = tightest()
      for (const year of yearsAt(1900, 3000, scale)) t.add(publisherCopiesCap(year) / gamersIn(year), 0.1001, `year ${year}`)
      return t.result()
    },
  },
  {
    id: 'studio-tail',
    // The quarter a hit may rise in a year (TAIL_SWING) is a constant of the yearly loop in gamestudio.ts; the life-level probe of
    // the nightly (R2-P5) covers it. This row holds the share of buyers who return, which is clamped at 0.6.
    cap: "a hit's next-year sales rise at most a quarter (v4.0.1 trillion fix)",
    run: (scale) => {
      const t = tightest()
      const copies = 1_000_000 * scale
      for (const scope of TAIL_SCOPES) {
        for (let players = 0; players <= 100; players += 5) t.add(nextTail(copies, players, scope), 0.6 * copies, `${scope} at ${players} players`)
      }
      return t.result()
    },
  },
  adaptationRow('adaptation-fee', 'an adaptation fee stops at 150 times the typical income (R0-8)', 'fee'),
  adaptationRow('adaptation-royalty', 'adaptation royalties stop at 15 times the typical income a year (R0-8)', 'annual'),
  {
    id: 'podcast-audience',
    cap: '30,000,000 listeners (R0-14)',
    run: (scale) => {
      const after = fameYear({ podcast: { name: 'Probe', listeners: 30_000_000 * scale, episodes: 10, startedAge: 20 } })
      return { value: after.podcast?.listeners ?? 0, limit: 30_000_000, at: 'one year of upkeep' }
    },
  },
  {
    id: 'fame-ledger',
    cap: '1e12 on every fame ledger value, so no income term compounds past it',
    run: (scale) => {
      const after = fameYear({ books: [{ title: 'Probe', age: 30, verdict: 'a bestseller', earned: 1e12 * scale, royalty: 1e12 * scale }] })
      const t = tightest()
      after.books.forEach((b, i) => {
        t.add(b.earned, 1e12, `book ${i} earned`)
        t.add(b.royalty, 1e12, `book ${i} royalty`)
      })
      return t.result()
    },
  },
]
