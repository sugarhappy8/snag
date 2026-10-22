// R2-S8 (K.5 h): the per-tap cost. A tap is cloneForAct (src/game/save-clone.ts) of the committed state, the action, then a save, which
// is encodeSave (src/game/save-codec.ts) of the draft. The acceptance of D.11 and the roadmap: clone plus stringify of the core at
// most 8 ms on the dev desktop. The world economy and the finished years of the life log are shared between drafts and their text is
// cached by identity, so neither costs anything after the first tap; what a tap pays for is the core.
//
// The budget is written for the desktop and multiplied by machineFactor() (test/perf-kit.ts), the ratio of a fixed loop's time here
// to its time on the desktop that set the number, never below 1. The mobile target (the "year step at most 400 ms on a 2022
// mid-range Android" rule, and the 250 ms light-life target) is checked as desktop milliseconds times that printed ratio, until a
// device run exists (the lead's decision 21).
import { beforeAll, describe, expect, it } from 'vitest'
import { addMoney } from '../src/game/core'
import { encodeSave, type EncodedSave } from '../src/game/save-codec'
import { cloneForAct } from '../src/game/save-clone'
import type { GameState } from '../src/game/types'
import { calibrationMs, machineFactor, REFERENCE_MS } from './perf-kit'
import { probeLife } from './probe-life'

// A fixed life as a constant, not a `seed: <digits>` pin (test/seed-pins.test.ts).
const HEAVY_LIFE_SEED = 7
/** The desktop budget for one tap's clone plus encode of the core, in milliseconds (D.11). */
const TAP_BUDGET_MS = 8
/** Taps run before the timed ones (the caches of the codec and the JIT are warm after them) and taps timed. */
const WARM_ROUNDS = 5
const TIMED_ROUNDS = 30
/** The head of a save, in characters (D.11: the core at most 400 KB). */
const HEAD_BUDGET_CHARS = 400_000

const median = (xs: readonly number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!

/** A tap as the store makes it: a draft of the committed state, one small change, then the save's encode. */
function tap(committed: GameState, change: (draft: GameState) => void = (draft) => void (draft.character.money += 1)): { draft: GameState; ms: number; encoded: EncodedSave } {
  const t0 = performance.now()
  const draft = cloneForAct(committed)
  change(draft)
  const encoded = encodeSave(draft)
  return { draft, ms: performance.now() - t0, encoded }
}

/** A tap that books a dollar through the ledger, as every earn, spend and pay does: the ledger's own cost (its check, the booking, the shard in the core) is in the figure. */
const booking = (draft: GameState): void => void addMoney(draft, 1, 'wage')

let heavy: GameState

beforeAll(() => {
  // Age 70 with six companies, a decade-by-decade life log and a world economy: the heavy end of a real life.
  heavy = probeLife({ seed: HEAVY_LIFE_SEED, birthYear: 1950, businesses: 6, years: 40, keepAlive: true })
}, 900_000)

describe('the heavy probe life', () => {
  it('is old, busy and has what act() shares', () => {
    expect(heavy.character.age).toBeGreaterThanOrEqual(60)
    expect(heavy.assets.length).toBeGreaterThanOrEqual(6)
    expect(heavy.log.length).toBeGreaterThan(30)
    expect(heavy.flags.worldEconomy).toBeDefined()
  })

  it('costs at most 8 ms (times the machine factor) for the clone, a booking through the ledger and the encode of the core, after the caches are warm', () => {
    let committed = heavy
    for (let i = 0; i < WARM_ROUNDS; i++) committed = tap(committed, booking).draft
    const times: number[] = []
    for (let i = 0; i < TIMED_ROUNDS; i++) {
      const t = tap(committed, booking)
      times.push(t.ms)
      committed = t.draft
    }
    const m = median(times)
    // The old cost, for the record: a structured clone of the whole state and a stringify of all of it.
    const old: number[] = []
    for (let i = 0; i < 10; i++) {
      const t0 = performance.now()
      const copy = structuredClone(heavy)
      JSON.stringify(copy)
      old.push(performance.now() - t0)
    }
    const factor = machineFactor()
    const budget = TAP_BUDGET_MS * factor
    console.log(
      `per-tap clone+booking+encode: median ${m.toFixed(2)} ms (max ${Math.max(...times).toFixed(2)}), budget ${budget.toFixed(2)} ms = ${TAP_BUDGET_MS} ms x factor ${factor.toFixed(2)} ` +
        `(calibration ${calibrationMs().toFixed(2)} ms against ${REFERENCE_MS} ms); the old structuredClone+stringify of the whole state: median ${median(old).toFixed(2)} ms`,
    )
    expect(m).toBeLessThanOrEqual(budget)
  }, 120_000)

  it('has a head of at most 400,000 characters: the core is what a tap pays for, and the roots are chunks', () => {
    const e = encodeSave(heavy)
    expect(e.head.length).toBeLessThanOrEqual(HEAD_BUDGET_CHARS)
    expect(e.stats.coreChars).toBe(e.head.length)
    // The economy and the finished years left the head.
    expect(Object.keys(e.manifest)).toContain('world')
    expect(Object.keys(e.manifest).some((n) => n.startsWith('log.'))).toBe(true)
  })

  it('stringifies no shared slice on the second tap, and writes no chunk the first tap did not', () => {
    const first = tap(heavy)
    const second = tap(first.draft)
    expect(second.encoded.stats.stringified).toBe(0)
    expect(second.encoded.manifest).toEqual(first.encoded.manifest)
    expect([...second.encoded.chunks.keys()]).toEqual([...first.encoded.chunks.keys()])
    // A third tap on the second draft: the identity of every root survives the whole chain.
    const third = tap(second.draft)
    expect(third.encoded.stats.stringified).toBe(0)
    expect(third.draft.flags.worldEconomy).toBe(heavy.flags.worldEconomy)
  })

  it('makes a draft whose save is the state with the one change, byte for byte', () => {
    const t = tap(heavy)
    const expected = structuredClone(heavy)
    expected.character.money += 1
    expect(JSON.stringify(t.draft)).toBe(JSON.stringify(expected))
  })
})
