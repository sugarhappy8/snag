// events/flavor.ts on the shared text memory (R1-T2, E.T1 part 2). The 60-key window of recent lines moves from
// g.flags.flavorRecent into the ring g.flags.textMem.r.flavor. Nothing about the life log may change: the golden below
// was recorded from the file as it stood before the move, and it holds g.rng after every year, so one stray draw or one
// different exclusion shows up as a changed hash.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { addFlavorLines } from '../src/game/events/flavor'
import { createNewLife } from '../src/game/life'
import { fnv1a } from '../src/game/text/hash'
import type { GameState } from '../src/game/types'

type GoldenCase = { seed: number; birth: number; steps: string[] }
type Golden = { v: 1; cases: GoldenCase[] }

const CASES = [
  { seed: 11, birth: 1925 },
  { seed: 12, birth: 1960 },
  { seed: 13, birth: 1990 },
  { seed: 14, birth: 2012 },
] as const
const FIXTURE = fileURLToPath(new URL('./fixtures/flavor-golden.json', import.meta.url))

function allLines(g: GameState): string[] {
  return g.log.flatMap((y) => y.entries.map((e) => e.text))
}

/** One hash per year of age 1 to 85: g.rng after the call, then the lines the call added. */
function record(seed: number, birth: number): string[] {
  const g = createNewLife({ seed, year: birth })
  g.queue = []
  const steps: string[] = []
  for (let age = 1; age <= 85; age++) {
    g.character.age = age
    g.year = birth + age
    const before = allLines(g).length
    addFlavorLines(g)
    const added = allLines(g).slice(before)
    steps.push(fnv1a(`${g.rng}|${added.join('\n')}`).toString(16).padStart(8, '0'))
  }
  return steps
}

describe('flavor golden (draw sequence and output unchanged)', () => {
  it('matches test/fixtures/flavor-golden.json for four lives of 85 years', () => {
    const fresh: Golden = { v: 1, cases: CASES.map((c) => ({ seed: c.seed, birth: c.birth, steps: record(c.seed, c.birth) })) }
    // FLAVOR_GOLDEN=1 rewrites the fixture. Only ever run it on a flavor.ts that is known to be right.
    if (process.env.FLAVOR_GOLDEN) writeFileSync(FIXTURE, JSON.stringify(fresh, null, 1) + '\n')
    const golden = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Golden
    expect(golden.v).toBe(1)
    expect(golden.cases.map((c) => [c.seed, c.birth])).toEqual(CASES.map((c) => [c.seed, c.birth]))
    for (const c of golden.cases) expect(c.steps).toHaveLength(85)
    for (let i = 0; i < CASES.length; i++) expect(fresh.cases[i].steps, `seed ${CASES[i].seed}`).toEqual(golden.cases[i].steps)
  })
})
