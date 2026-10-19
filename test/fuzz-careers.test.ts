// Opt-in career fuzzer: FUZZ=1 npx vitest run test/fuzz-careers.test.ts
//   FUZZ_SEEDS (default 30) seeded lives, FUZZ_YEARS (default 16) years each. A seed picks the career, the
//   place and the strategy. `note-` lines (a single windfall to review) print and do not fail.
import { afterAll, describe, it } from 'vitest'
import { assertCareersClean, CAREER_SETUPS, playCareer, summarizeCareers, type CareerId, type CareerStats, type CareerStrategy } from './career-kit'
import { POLITICS_PLACES } from './fuzz-kit'

const SEEDS = Math.max(1, Math.floor(Number(process.env.FUZZ_SEEDS)) || 30)
const YEARS = Math.max(1, Math.floor(Number(process.env.FUZZ_YEARS)) || 16)
const STRATEGIES: readonly CareerStrategy[] = ['steady', 'greedy', 'reckless', 'idle']

describe.skipIf(!process.env.FUZZ)('careers fuzz', () => {
  const rows: CareerStats[] = []
  afterAll(() => {
    if (rows.length > 0) console.log(`\n${summarizeCareers(rows)}`)
  })

  for (let seed = 1; seed <= SEEDS; seed++) {
    it(
      `seed ${seed}`,
      () => {
        const ids = Object.keys(CAREER_SETUPS) as CareerId[]
        if (ids.length === 0) return
        const id = ids[seed % ids.length]
        const [country, year] = POLITICS_PLACES[(seed + Math.floor(seed / ids.length)) % POLITICS_PLACES.length]
        const strategy = STRATEGIES[Math.floor(seed / 2) % STRATEGIES.length]
        const r = playCareer(id, strategy, YEARS, seed, country, year)
        rows.push(r)
        const notes = r.text.filter((t) => t.startsWith('note-'))
        if (notes.length > 0) console.log(`${id}/${strategy} seed ${seed} (${country} ${year}):\n  ${notes.join('\n  ')}`)
        assertCareersClean([{ ...r, text: r.text.filter((t) => !t.startsWith('note-')) }])
      },
      600_000,
    )
  }
})
