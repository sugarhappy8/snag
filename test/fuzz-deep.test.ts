// Deep engine fuzzer (test/fuzz-kit.ts). Opt-in, so CI time doesn't grow:
//
//   FUZZ=1 npx vitest run test/fuzz-deep.test.ts
//   FUZZ=1 FUZZ_SEEDS=40 FUZZ_START=1 FUZZ_YEARS=160 npx vitest run test/fuzz-deep.test.ts
//   FUZZ=1 FUZZ_INDUSTRIES=all FUZZ_YEARS=30 npx vitest run test/fuzz-deep.test.ts   (business mode)
//   FUZZ=1 FUZZ_POLITICS=1 FUZZ_SEEDS=24 FUZZ_YEARS=20 npx vitest run test/fuzz-deep.test.ts   (politics mode)
//
// For long runs use the node script instead (scripts/fuzz-engine.ts): it prints each failure as it
// happens, can play every seed in its own process (--fork) and run several ranges in parallel.
import { describe, expect, it } from 'vitest'
import { ALL_INDUSTRIES, DEFAULT_OPTIONS, FailureLog, formatFailures, fuzzBusiness, fuzzLife, fuzzPolitics, type LifeStats } from './fuzz-kit'

const env = process.env
const enabled = env.FUZZ === '1'
const start = Number(env.FUZZ_START ?? 1)
const years = Number(env.FUZZ_YEARS ?? DEFAULT_OPTIONS.maxYears)
const industries = env.FUZZ_INDUSTRIES ? (env.FUZZ_INDUSTRIES === 'all' ? [...ALL_INDUSTRIES] : env.FUZZ_INDUSTRIES.split(',')) : null
const politics = env.FUZZ_POLITICS === '1'
const seeds = industries ? industries.length : Number(env.FUZZ_SEEDS ?? 7)

describe.skipIf(!enabled)('deep engine fuzz', () => {
  it(
    `plays ${industries ? `${seeds} industries` : `seeds ${start}..${start + seeds - 1}`} without a failure`,
    async () => {
      const log = new FailureLog()
      for (let k = 0; k < seeds; k++) {
        const seed = start + k
        const s: LifeStats = industries ? await fuzzBusiness(industries[k], seed, log, years) : politics ? await fuzzPolitics(seed, log, years) : await fuzzLife(seed, log, { ...DEFAULT_OPTIONS, maxYears: years })
        console.log(`${industries ? `${industries[k]} ` : ''}seed ${seed}: ${s.years} years, ${s.generations} gen, ${s.actions} actions, ${s.swept} swept, industries [${s.industries.join(',')}], ${(s.ms / 1000).toFixed(1)}s`)
      }
      if (log.size) console.log(formatFailures(log))
      // 'note-' kinds are for a human to review (e.g. a big windfall), not failures.
      const failures = log.list().filter((x) => !x.first.kind.startsWith('note-'))
      expect(failures.map((x) => `[${x.first.kind}] seed ${x.first.seed}: ${x.first.message.slice(0, 200)}`)).toEqual([])
    },
    24 * 3600_000,
  )
})
