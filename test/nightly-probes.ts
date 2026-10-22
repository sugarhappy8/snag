// R2-P5 (K.7b f): the two life probes of the nightly deep tier, as functions that return a metrics file. The balance probe plays
// the 200 seeded lives of the roadmap (birth lives and founders) and samples net worth and the time a year takes; the ceiling probe
// plays founders with a hundred times the money and reports how far their net worth climbs. scripts/nightly-probes.ts bundles
// this file (esbuild, like scripts/fuzz-engine.ts), and the nightly workflow runs one shard of each per job; scripts/nightly.mjs
// merges the files and diffs them against the previous night.
//
// The lives are fixed by their seed, so a replay gives the same metrics; only the milliseconds depend on the machine, which is why
// the clock can be injected. A probe never changes a life: it reads it in onYear.
//
// No vitest imports here: the same module runs under vitest and as a bundled node script.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { lifeSpecs } from '../scripts/r1-parity-lib.mjs'
import { netWorth } from '../src/game/core'
import type { GameState } from '../src/game/types'
import { metricsFile, type MetricsFile } from './nightly-metrics'
import { playLife } from './play-kit'
import { probeLife, type ProbeOptions } from './probe-life'

/** The ages a birth life's net worth is sampled at. */
const AGES = [25, 40, 60, 80] as const

const isWhole = (x: number): boolean => Number.isInteger(x) && x >= 1

function whole(name: string, x: number): void {
  if (!isWhole(x)) throw new Error(`${name} must be a whole number of at least 1, got ${String(x)}`)
}

/** The net worth of `g`, or an error naming the life: a NaN here is a bug the nightly must report, not a number to average. */
function worth(g: GameState, label: string): number {
  const x = netWorth(g)
  if (!Number.isFinite(x)) throw new Error(`${label}: net worth is ${String(x)} at age ${g.character.age}`)
  return x
}

/**
 * probeLife with the number of companies it was asked for, or as many as the founder can open: in some years fewer industries are
 * open than a life asks for, and probeLife throws before it plays anything (so onYear has not been called). The years are never
 * cut, only the companies.
 */
function founder(base: Omit<ProbeOptions, 'businesses'>, wanted: number): GameState {
  let businesses = wanted
  for (;;) {
    try {
      return probeLife({ ...base, businesses })
    } catch (e) {
      const open = /only (\d+) of \d+ industries are open/.exec(e instanceof Error ? e.message : '')
      const n = open ? Number(open[1]) : 0
      if (n < 1 || n >= businesses) throw e
      businesses = n
    }
  }
}

export interface BalanceOptions {
  /** The first seed of this shard's run: the lives are lifeSpecs seeds start .. start + count - 1. */
  start: number
  count: number
  /** Years a founder lives from 30 on (default 40, the roadmap's). */
  years?: number
  /** The age a birth life is played to (default 80). */
  untilAge?: number
  /** Milliseconds, read once at the start of each life and once after every year (default performance.now). A test injects its own. */
  clock?: () => number
}

/**
 * Lives start .. start + count - 1 of lifeSpecs: odd seeds are birth lives (playLife to age 80, popups answered by the kit's own
 * driver, so wealth events and choices are exercised), even seeds founders with 1 to 3 companies (probeLife for 40 years).
 * Samples, one per life unless said: balance.birth.age25|40|60|80 (net worth at that age, when the life got there),
 * balance.birth.final, balance.founder.final, balance.founder.peak, balance.<kind>.msYear (every year's milliseconds, a year
 * including the popups answered) and balance.<kind>.msYearMax (the slowest year of each life). Sums: balance.lives.sum and
 * balance.alive80.sum (birth lives alive at 80).
 */
export function balanceProbe(opts: BalanceOptions): MetricsFile {
  whole('balance probe start', opts.start)
  whole('balance probe count', opts.count)
  const years = opts.years ?? 40
  const untilAge = opts.untilAge ?? 80
  whole('balance probe years', years)
  whole('balance probe untilAge', untilAge)
  const clock = opts.clock ?? ((): number => performance.now())
  const samples: Record<string, number[]> = {}
  const add = (name: string, x: number): void => {
    ;(samples[name] ??= []).push(x)
  }
  for (const name of [...AGES.map((a) => `balance.birth.age${a}`), 'balance.birth.final', 'balance.founder.final', 'balance.founder.peak']) samples[name] = []
  for (const kind of ['birth', 'founder']) for (const name of ['msYear', 'msYearMax']) samples[`balance.${kind}.${name}`] = []
  let alive80 = 0

  for (const spec of lifeSpecs(opts.start + opts.count - 1, years).slice(opts.start - 1)) {
    const label = `balance probe seed ${spec.seed}`
    let mark = 0
    let slowest = 0
    let peak = -Infinity
    const sampled = new Set<number>()
    // The clock is read once per call: at year 0 it starts the timer, afterwards each call is the time since the one before.
    const tick = (yearsPlayed: number): void => {
      const now = clock()
      if (yearsPlayed > 0) {
        // To the microsecond: the clock's own noise below that is not a measurement.
        const ms = Math.round((now - mark) * 1000) / 1000
        add(`balance.${spec.kind}.msYear`, ms)
        slowest = Math.max(slowest, ms)
      }
      mark = now
    }
    let g: GameState
    if (spec.kind === 'birth') {
      g = playLife({
        seed: spec.seed,
        birthYear: spec.birthYear,
        untilAge,
        onYear: (state, yearsPlayed) => {
          tick(yearsPlayed)
          const age = state.character.age
          if ((AGES as readonly number[]).includes(age) && !sampled.has(age)) {
            sampled.add(age)
            add(`balance.birth.age${age}`, worth(state, label))
          }
        },
      }).g
      add('balance.birth.final', worth(g, label))
      if (g.character.alive && g.character.age >= 80) alive80++
    } else {
      g = founder(
        {
          seed: spec.seed,
          birthYear: spec.birthYear,
          years,
          onYear: (state, yearsPlayed) => {
            tick(yearsPlayed)
            peak = Math.max(peak, worth(state, label))
          },
        },
        spec.businesses,
      )
      add('balance.founder.final', worth(g, label))
      add('balance.founder.peak', Math.max(peak, worth(g, label)))
    }
    add(`balance.${spec.kind}.msYearMax`, slowest)
  }
  return metricsFile('balance', { 'balance.lives.sum': opts.count, 'balance.alive80.sum': alive80 }, samples)
}

export interface CeilingOptions {
  start: number
  count: number
  /** Years each founder lives from 30 on. */
  years: number
  /** Times the founder's money and each company's cash (probeLife's scale). */
  scale: number
}

/**
 * Founders with 3 to 12 companies (life `seed` has 3 + (seed - 1) % 10, fewer when the year does not have that many industries
 * open), health held up so none dies early, the money and every company's cash multiplied by `scale`. Samples, one per life:
 * ceiling.life.maxNetWorth (the highest net worth the life reached) and ceiling.life.growth (that over the net worth it started
 * with). Sum: ceiling.lives.sum. A real-world cap holds when the maximum stays far below what a hundred times the inputs would
 * make of an uncapped term: the rules of scripts/nightly-lib.mjs hold it to 1e12 and a growth of 40.
 */
export function ceilingProbe(opts: CeilingOptions): MetricsFile {
  whole('ceiling probe start', opts.start)
  whole('ceiling probe count', opts.count)
  whole('ceiling probe years', opts.years)
  if (!Number.isFinite(opts.scale) || opts.scale <= 0) throw new Error(`ceiling probe scale must be a finite number above zero, got ${String(opts.scale)}`)
  const samples: Record<string, number[]> = { 'ceiling.life.maxNetWorth': [], 'ceiling.life.growth': [] }
  for (const spec of lifeSpecs(opts.start + opts.count - 1, opts.years).slice(opts.start - 1)) {
    const label = `ceiling probe seed ${spec.seed}`
    let first = NaN
    let max = -Infinity
    founder(
      {
        seed: spec.seed,
        birthYear: spec.birthYear,
        years: opts.years,
        keepAlive: true,
        scale: opts.scale,
        onYear: (state, yearsPlayed) => {
          const x = worth(state, label)
          if (yearsPlayed === 0) first = x
          max = Math.max(max, x)
        },
      },
      3 + ((spec.seed - 1) % 10),
    )
    if (!(first > 0)) throw new Error(`${label}: the net worth it starts with is ${String(first)}, so no growth can be measured`)
    samples['ceiling.life.maxNetWorth'].push(max)
    samples['ceiling.life.growth'].push(max / first)
  }
  return metricsFile('ceiling', { 'ceiling.lives.sum': opts.count }, samples)
}

// ---------------------------------------------------------------------------------------------- the command line

const USAGE = `usage:
  nightly-probes balance --start N --count N [--years N] [--until-age N] --out FILE
  nightly-probes ceiling --start N --count N --years N --scale N --out FILE`

class Usage extends Error {}

/** `--name value` pairs; a name outside `names` or a missing value is a usage error. */
function flags(argv: readonly string[], names: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (let k = 0; k < argv.length; k += 2) {
    const word = argv[k]
    if (!word.startsWith('--') || !names.includes(word.slice(2))) throw new Usage(`unknown option ${word}`)
    if (argv[k + 1] === undefined) throw new Usage(`${word} needs a value`)
    if (word.slice(2) in out) throw new Usage(`${word} was given twice`)
    out[word.slice(2)] = argv[k + 1]
  }
  return out
}

function count(f: Record<string, string>, name: string, fallback?: number): number {
  const text = f[name]
  if (text === undefined) {
    if (fallback === undefined) throw new Usage(`--${name} is required`)
    return fallback
  }
  if (!/^\d+$/.test(text) || Number(text) < 1) throw new Usage(`--${name} must be a whole number of at least 1, got "${text}"`)
  return Number(text)
}

/**
 * `balance ...` or `ceiling ...`: runs one shard's probe and writes its metrics file to --out. The shard number in the file is
 * NIGHTLY_SHARD (or 0), as writeMetrics does. Returns the exit code: 0, or 2 for bad usage; a probe that throws is the caller's 1.
 */
export function probeCli(argv: readonly string[], err: (line: string) => void = (line) => process.stderr.write(`${line}\n`)): number {
  try {
    const [command, ...rest] = argv
    let file: MetricsFile
    let out: string
    if (command === 'balance') {
      const f = flags(rest, ['start', 'count', 'years', 'until-age', 'out'])
      out = f.out ?? ''
      if (!out) throw new Usage('--out is required')
      file = balanceProbe({ start: count(f, 'start'), count: count(f, 'count'), years: count(f, 'years', 40), untilAge: count(f, 'until-age', 80) })
    } else if (command === 'ceiling') {
      const f = flags(rest, ['start', 'count', 'years', 'scale', 'out'])
      out = f.out ?? ''
      if (!out) throw new Usage('--out is required')
      const scale = Number(f.scale)
      if (f.scale === undefined || f.scale === '' || !Number.isFinite(scale) || scale <= 0) throw new Usage(`--scale must be a number above zero, got "${f.scale ?? ''}"`)
      file = ceilingProbe({ start: count(f, 'start'), count: count(f, 'count'), years: count(f, 'years'), scale })
    } else {
      throw new Usage(command === undefined ? 'no command' : `unknown command "${command}"`)
    }
    mkdirSync(dirname(out), { recursive: true })
    writeFileSync(out, `${JSON.stringify(file)}\n`)
    return 0
  } catch (e) {
    if (!(e instanceof Usage)) throw e
    err(`nightly-probes: ${e.message}\n${USAGE}`)
    return 2
  }
}
