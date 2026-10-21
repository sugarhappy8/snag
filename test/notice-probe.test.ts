// R1-T7 (G.11 step 2): the counting probe behind MINOR_NOTICE_TITLES. It plays 13 seeded lives to 85 (test/play-kit.ts),
// counts the notices that arrived by themselves ("passive") by exact title, counts the ones that were the outcome of
// a choice, an input or a minigame the player answered separately, and writes the top of both lists to
// test/fixtures/notice-probe.json. Opt-in (about a minute and a half), so CI time doesn't grow:
//
//   NOTICE_PROBE=1 NODE_OPTIONS=--max-old-space-size=2048 npx vitest run --maxWorkers=1 test/notice-probe.test.ts
//
// The fixture's `chosen` list is picked by hand from `passive` (the rule is in the plan, R1-T7 step 3) and is kept
// when the probe runs again. test/notice-weights.test.ts checks the table in src/game/notice-weights.ts against it.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { neverRoute, type RouteBlock } from '../src/game/notice-policy'
import type { Tone } from '../src/game/types'
import { playLife, type PlayedPopup } from './play-kit'

export type ProbeRow = {
  title: string
  count: number
  /** The tone of the first notice with this title; missing when it had none. */
  tone?: Tone
  /** The text of that first notice. */
  sample: string
  /** Set when that notice carried the support line. */
  support?: true
  /** neverRoute() of the sample: why it must stay a popup, or null. */
  never: RouteBlock | null
}

export type ProbeFile = {
  v: 1
  lives: number
  seeds: number[]
  untilAge: number
  passive: ProbeRow[]
  outcome: ProbeRow[]
  chosen: string[]
}

const FIXTURE = join(__dirname, 'fixtures', 'notice-probe.json')
const SEEDS = Array.from({ length: 13 }, (_, i) => 101 + i)
const BIRTH_YEARS = [1925, 1950, 1975, 1990, 2010, 2026]
const UNTIL_AGE = 85
const TOP_PASSIVE = 60
const TOP_OUTCOME = 30

/** Count notices by exact title, most frequent first (ties by title, so the file is stable). */
function tally(popups: readonly PlayedPopup[]): ProbeRow[] {
  const rows = new Map<string, ProbeRow>()
  for (const p of popups) {
    const seen = rows.get(p.title)
    if (seen) {
      seen.count++
      continue
    }
    const sample = { title: p.title, text: p.text, tone: p.tone, support: p.support }
    rows.set(p.title, {
      title: p.title,
      count: 1,
      ...(p.tone ? { tone: p.tone } : {}),
      sample: p.text,
      ...(p.support ? { support: true as const } : {}),
      never: neverRoute(sample),
    })
  }
  return [...rows.values()].sort((a, b) => b.count - a.count || (a.title < b.title ? -1 : a.title > b.title ? 1 : 0))
}

describe.skipIf(process.env.NOTICE_PROBE !== '1')('notice probe', () => {
  it(
    'counts the notices of 13 lives and writes test/fixtures/notice-probe.json',
    () => {
      const passive: PlayedPopup[] = []
      const outcome: PlayedPopup[] = []
      SEEDS.forEach((seed, i) => {
        const { years } = playLife({ seed, birthYear: BIRTH_YEARS[i % BIRTH_YEARS.length], untilAge: UNTIL_AGE })
        for (const y of years) {
          for (const p of y.popups) {
            if (p.kind !== 'notice') continue
            ;(p.passive ? passive : outcome).push(p)
          }
        }
      })
      let chosen: string[] = []
      if (existsSync(FIXTURE)) {
        const old = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Partial<ProbeFile>
        if (Array.isArray(old.chosen)) chosen = old.chosen.filter((t): t is string => typeof t === 'string')
      }
      const file: ProbeFile = {
        v: 1,
        lives: SEEDS.length,
        seeds: SEEDS,
        untilAge: UNTIL_AGE,
        passive: tally(passive).slice(0, TOP_PASSIVE),
        outcome: tally(outcome).slice(0, TOP_OUTCOME),
        chosen,
      }
      writeFileSync(FIXTURE, `${JSON.stringify(file, null, 2)}\n`)
      console.log(`passive notices ${passive.length} in ${tally(passive).length} titles; outcome notices ${outcome.length}`)
      expect(file.passive.length).toBeGreaterThan(0)
    },
    300_000,
  )
})
