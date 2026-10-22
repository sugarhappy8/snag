// R2-L5 (A.K1 d): the kit of the conservation probe. One function plays a life of up to 100 years with heirs through the fuzzer
// (test/fuzz-kit.ts, which runs the ledger's own check after every step and measures the player's cash against the books at every
// year end), and one pure function judges the rows. The fast tier (test/ledger-conservation-fast.test.ts) judges synthetic rows and
// three real lives; the sliced tier (test/ledger-conservation.test.ts) plays all 40, a slice per CI shard.
//
// What a real life must show: no fuzz failure (a break of the books is one: "ledger: ..."), a bounded number of bookings a year (a
// cost proxy), no yearly mint over its cap and the lending mint at most a quarter of its cap, and no `heal` (a repair of a broken
// identity). Over the whole set: 40 lives, most of them a full century, enough bookings and enough different reasons that the
// probe really exercised the books (FLOORS), a lending mint and an inflation burn somewhere. Drift is reported and not asserted: it is how
// a surviving raw writer is found, and it falls as the migration batches land (R2-L18 asserts it in strict mode).
//
// No vitest import, so a script can use it too. The seeds are a list, not `seed: N` pins (test/seed-pins.test.ts).
import { MINTS } from '../src/game/kernel/reasons'
import { DEFAULT_OPTIONS, FailureLog, fuzzLife, type FuzzOptions, type LedgerStats } from './fuzz-kit'

/** 101 to 140: the forty lives of the probe. */
export const LEDGER_SEEDS: readonly number[] = Array.from({ length: 40 }, (_, i) => 101 + i)
/** Simulated years of one life with its heirs (the fuzzer's maxYears counts every generation together). */
export const PROBE_YEARS = 100
/** Random actions per year, at most. The one knob the lead may lower when a CI shard runs long: lower it before the lives or the years. */
export const PROBE_ACTIONS = 2
/** Generations after the first. */
export const PROBE_HEIRS = 2
/** A life may book this many times a year, at most: about 4 ms of ledger time, the proxy for "the ledger does not slow the year step". */
export const BOOKINGS_PER_YEAR = 3_000

export interface LedgerLifeRow {
  seed: number
  years: number
  generations: number
  ms: number
  /** The fuzz failures of the life that are not 'note-' findings, one line each. */
  failures: string[]
  ledger: LedgerStats
}

function emptyStats(): LedgerStats {
  return { sum: 0, mint: {}, burn: {}, accounts: 0, flowRows: 0, bookings: 0, maxYearMint: {}, reasons: [], drift: 0, firstDrift: null }
}

/** One life of the probe. `over` replaces any fuzz option (the fast tier plays one action a year). */
export async function runLedgerLife(seed: number, over: Partial<FuzzOptions> = {}): Promise<LedgerLifeRow> {
  const log = new FailureLog()
  const stats = await fuzzLife(seed, log, {
    ...DEFAULT_OPTIONS,
    actionsPerYear: PROBE_ACTIONS,
    walkEvery: 100_000,
    maxYears: PROBE_YEARS,
    saveEvery: 25,
    heirs: PROBE_HEIRS,
    sweepEvery: 0,
    sweepMax: 0,
    timeMachine: false,
    ...over,
  })
  const failures = log
    .list()
    .filter((f) => !f.first.kind.startsWith('note-'))
    .map((f) => `[${f.first.kind}] ${f.first.message.slice(0, 240)}`)
  return { seed, years: stats.years, generations: stats.generations, ms: stats.ms, failures, ledger: stats.ledger ?? emptyStats() }
}

/**
 * What a merged set of 40 lives must show, so that the probe is known to have exercised the books: the plan's targets, 40,000
 * bookings and 20 different reasons. The migrated engine (R2 head, the four sliced runs of the fix pass) measured 53,456 bookings
 * (474 to 2,835 a life), 54 reasons (20 to 44 a life), 39 of 40 lives of 90 years or more, no drift and no heal, so the floors
 * sit at three quarters of the bookings and under half of the reasons: a probe whose migrated sites stopped booking falls under
 * them. (Before the migration batches the 40 lives measured 13,885 bookings and 6 reasons, and the floors were 6,000 and 4.) The
 * lives are seeded, so the totals move only when the engine does; if a change moves them for a reason, re-measure and say why here.
 */
export const FLOORS = { lives: LEDGER_SEEDS.length, whole: 34, wholeYears: 90, bookings: 40_000, reasons: 20 } as const
const LENDING_SHARE = 4

/** The problems of a set of rows, or none. Pure. `merged` adds the checks that need the whole set of 40. */
export function judge(rows: readonly LedgerLifeRow[], opts: { merged?: boolean } = {}): string[] {
  const out: string[] = []
  for (const r of rows) {
    const tag = `seed ${r.seed}`
    for (const f of r.failures) out.push(`${tag}: ${f}`)
    const years = Math.max(1, r.years)
    if (r.ledger.bookings > BOOKINGS_PER_YEAR * years) {
      out.push(`${tag}: ${r.ledger.bookings} bookings in ${r.years} years, more than ${BOOKINGS_PER_YEAR} a year`)
    }
    for (const [name, made] of Object.entries(r.ledger.maxYearMint)) {
      if (name === 'heal') continue // reported below, as a repair
      if (!Object.hasOwn(MINTS, name)) {
        out.push(`${tag}: a mint named ${name}, which is not a declared mint`)
        continue
      }
      const cap = MINTS[name as keyof typeof MINTS].cap
      if (made > cap) out.push(`${tag}: ${name} minted ${made} in a year, over its cap of ${cap}`)
      else if (name === 'lending' && made > cap / LENDING_SHARE) out.push(`${tag}: lending minted ${made} in a year, over a quarter of its cap of ${cap}`)
    }
    const healed = (r.ledger.mint.heal ?? 0) + (r.ledger.burn.heal ?? 0)
    if (healed !== 0) out.push(`${tag}: the books had to be healed (heal ${healed}), so something broke the identity`)
  }
  if (!opts.merged) return out
  if (rows.length !== FLOORS.lives) out.push(`${rows.length} lives, not ${FLOORS.lives}`)
  const whole = rows.filter((r) => r.years >= FLOORS.wholeYears).length
  if (whole < FLOORS.whole) out.push(`only ${whole} of ${rows.length} lives played ${FLOORS.wholeYears} years, ${FLOORS.whole} are needed`)
  const bookings = rows.reduce((n, r) => n + r.ledger.bookings, 0)
  if (bookings < FLOORS.bookings) out.push(`${bookings} bookings in all, ${FLOORS.bookings} are needed for the probe to mean anything`)
  const reasons = new Set(rows.flatMap((r) => r.ledger.reasons))
  if (reasons.size < FLOORS.reasons) out.push(`only ${reasons.size} different reasons booked, ${FLOORS.reasons} are needed`)
  if (!rows.some((r) => (r.ledger.mint.lending ?? 0) > 0)) out.push('no life minted lending: the lending mint was never exercised')
  if (!rows.some((r) => (r.ledger.burn.inflation ?? 0) > 0)) out.push('no life burned inflation: the erosion of cash was never exercised')
  return out
}

const num = (n: number): string => n.toLocaleString('en-US')

/** One line on the drift of the player's cash (unbooked change), for the log of a run. Reported, never asserted. Pure. */
export function driftReport(rows: readonly LedgerLifeRow[]): string {
  const total = rows.reduce((n, r) => n + r.ledger.drift, 0)
  if (total === 0) return 'ledger drift: no drift, every change of the player\'s cash was booked'
  const worst = rows.reduce((a, b) => (b.ledger.drift > a.ledger.drift ? b : a))
  const first = worst.ledger.firstDrift
  const lives = rows.filter((r) => r.ledger.drift > 0).length
  const where = first ? `, first in ${first.year} at age ${first.age} (${num(first.delta)})` : ''
  return `ledger drift: ${num(total)} in all over ${lives} of ${rows.length} lives; the largest is ${num(worst.ledger.drift)}, seed ${worst.seed}${where}`
}
