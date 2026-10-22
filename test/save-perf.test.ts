// R2-S12 (K.5 and A.K9): what a year and a load cost, on the real engine. The save work has to leave the yearly step where it was
// (the roadmap: a light life's age-up at most 160 ms on a desktop, 250 ms on a mid-range phone) and add little to it.
//
//   - a light life's age-up: at most 160 ms. Hard.
//   - a year the way the store plays it (a draft of the committed state, the age-up, the save's encode): at most 200 ms
//   - the mobile line is printed, not asserted: the median times 250/160, the ratio of the two targets, with the sentence "mobile
//     target 250 ms". The lead's decision 21 accepts this until a real device run exists.
//   - economyFocus on the heavy life (R2-S10 runs it once a year): at most 15 ms
//   - loading the heavy v4.1.1 fixture (decode, migrate, isLoadableGame): at most 400 ms
//
// Every budget is written for the dev desktop and multiplied by machineFactor() (test/perf-kit.ts: a fixed loop's time here over its
// time there, never below 1), so a slow runner is not held to a desktop's number. A time is the median of 12 runs after warm-up.
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { beforeAll, describe, expect, it } from 'vitest'
import { ageUp } from '../src/game/aging'
import { businessAssets } from '../src/game/business/state'
import { economyFocus } from '../src/game/economy/focus'
import { cloneForAct } from '../src/game/save-clone'
import { encodeSave } from '../src/game/save-codec'
import { isLoadableGame, migrateSave } from '../src/game/save-schema'
import type { GameState } from '../src/game/types'
import { calibrationMs, machineFactor, REFERENCE_MS } from './perf-kit'
import { probeLife } from './probe-life'
import { findSeed } from './seed-kit'

/** The desktop budgets, in milliseconds. */
const AGE_UP_BUDGET_MS = 160
const YEAR_WITH_SAVE_BUDGET_MS = 200
const FOCUS_BUDGET_MS = 15
const LOAD_BUDGET_MS = 400
/** The mobile target over the desktop one: 250 ms against 160 ms. */
const MOBILE_RATIO = 250 / AGE_UP_BUDGET_MS

const WARM_UP_YEARS = 3
const TIMED_YEARS = 12

const median = (xs: readonly number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!

function time<T>(fn: () => T): { ms: number; value: T } {
  const t0 = performance.now()
  const value = fn()
  return { ms: performance.now() - t0, value }
}

/** One year the way the store plays it: the popups cleared, the founder kept alive (a measurement aid, as in probeLife). */
function prepare(g: GameState): void {
  g.queue = []
  g.character.stats.health = 100
  g.character.conditions = []
}

let light: GameState
let heavy: GameState

beforeAll(() => {
  // A light life: no company, age 40 (ten years from the adult start), with enough years left to time two runs of years.
  let found: GameState | undefined
  findSeed(
    (seed) => {
      const g = probeLife({ seed, birthYear: 1950, businesses: 0, years: 10, keepAlive: true })
      if (!g.character.alive) return false
      found = g
      return true
    },
    { label: 'a 1950 founder with no company, alive at 40' },
  )
  light = found!
  // The heavy life of the budget test: twelve companies, fifty years.
  findSeed(
    (seed) => {
      const g = probeLife({ seed, birthYear: 1950, businesses: 12, years: 50, keepAlive: true })
      if (!g.character.alive) return false
      found = g
      return true
    },
    { label: 'a 1950 founder with twelve companies, alive at 80' },
  )
  heavy = found!
}, 900_000)

function report(name: string, times: readonly number[], budget: number): string {
  const f = machineFactor()
  return `${name}: median ${median(times).toFixed(2)} ms (max ${Math.max(...times).toFixed(2)}), budget ${(budget * f).toFixed(1)} ms = ${budget} ms x factor ${f.toFixed(2)} (calibration ${calibrationMs().toFixed(2)} ms against ${REFERENCE_MS} ms)`
}

describe('a year of a light life', () => {
  it('is a founder of 40 with no company', () => {
    expect(light.character.age).toBe(40)
    expect(businessAssets(light)).toHaveLength(0)
  })

  it('takes at most 160 ms to age up (times the machine factor), and the mobile line is printed', () => {
    const g = light
    for (let i = 0; i < WARM_UP_YEARS; i++) {
      prepare(g)
      ageUp(g)
    }
    const times: number[] = []
    for (let i = 0; i < TIMED_YEARS; i++) {
      prepare(g)
      times.push(time(() => ageUp(g)).ms)
    }
    const m = median(times)
    console.log(report('light life ageUp', times, AGE_UP_BUDGET_MS))
    console.log(`mobile line: ${(m * MOBILE_RATIO).toFixed(1)} ms (the median ${m.toFixed(1)} ms times ${MOBILE_RATIO.toFixed(2)}), mobile target 250 ms`)
    expect(m).toBeLessThanOrEqual(AGE_UP_BUDGET_MS * machineFactor())
  }, 120_000)

  it('takes at most 200 ms (times the machine factor) for the clone, the age-up and the encode of the save', () => {
    let committed = light
    const year = (): number => {
      prepare(committed)
      const t = time(() => {
        const draft = cloneForAct(committed)
        ageUp(draft)
        encodeSave(draft)
        return draft
      })
      committed = t.value
      return t.ms
    }
    for (let i = 0; i < WARM_UP_YEARS; i++) year()
    const times: number[] = []
    for (let i = 0; i < TIMED_YEARS; i++) times.push(year())
    console.log(report('light life clone + ageUp + encode', times, YEAR_WITH_SAVE_BUDGET_MS))
    expect(committed.character.alive).toBe(true)
    expect(median(times)).toBeLessThanOrEqual(YEAR_WITH_SAVE_BUDGET_MS * machineFactor())
  }, 120_000)
})

describe('what the save work adds', () => {
  it('economyFocus takes at most 15 ms (times the machine factor) on the heavy life', () => {
    for (let i = 0; i < WARM_UP_YEARS; i++) economyFocus(heavy)
    const times: number[] = []
    for (let i = 0; i < TIMED_YEARS; i++) times.push(time(() => economyFocus(heavy)).ms)
    console.log(report('economyFocus on the heavy life', times, FOCUS_BUDGET_MS))
    expect(economyFocus(heavy).size).toBeGreaterThan(0)
    expect(median(times)).toBeLessThanOrEqual(FOCUS_BUDGET_MS * machineFactor())
  })

  it('loads the heavy v4.1.1 fixture (decode, migrate, isLoadableGame) in at most 400 ms (times the machine factor)', () => {
    const bytes = readFileSync('test/fixtures/save-v4.1.1-heavy.json.gz')
    const load = (): GameState => {
      const raw: unknown = JSON.parse(gunzipSync(bytes).toString())
      const m = migrateSave(raw)
      if (m.kind !== 'ready') throw new Error(`the fixture did not migrate: ${m.kind}`)
      if (!isLoadableGame(m.game)) throw new Error('the migrated fixture is not loadable')
      return m.game
    }
    for (let i = 0; i < WARM_UP_YEARS; i++) load()
    const times: number[] = []
    for (let i = 0; i < TIMED_YEARS; i++) times.push(time(load).ms)
    console.log(report('loading the heavy v4.1.1 fixture', times, LOAD_BUDGET_MS))
    expect(median(times)).toBeLessThanOrEqual(LOAD_BUDGET_MS * machineFactor())
  }, 120_000)
})
