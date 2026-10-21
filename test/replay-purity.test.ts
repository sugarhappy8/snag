// R2-P3 (K.7b d, RF5): replay, reload and a Time Machine fork give the same life. Two lives of the PR plan are played to a point
// (birth-1950 for 12 years, founder-1975 for 8), and then five more years are played three ways from that one point:
//   replay   structuredClone(g), aged, against g aged
//   reload   JSON.parse(JSON.stringify(g)) through migrateSave, aged, against g aged (what a saved game suffers: an `undefined`
//            key, a NaN, a Map or a Date in the state is exactly what this finds)
//   fork     takeSnapshot(g), then loadSnapshot(lifeId, age) at the same age (so no outcomeTag re-roll), aged, against g aged
// After each of the five years the nine slice digests (test/golden-kit.ts) of both branches must be equal; a difference prints
// where it is (explainMove). The queue is emptied before every year, as test/probe-life.ts does, so no popup waits on an answer.
//
// If one of these finds a real purity bug, a fix of under 20 lines in the owner's file is made and said so in the commit; a larger
// one goes to the lead. The test is never weakened.
import { afterAll, describe, expect, it } from 'vitest'
import { ageUp } from '../src/game/aging'
import { currencyInflation } from '../src/game/data/currencies'
import { ECONOMY_VERSION, economyState, initialCountry, normalizeCountry, pointOf } from '../src/game/economy/model'
import { HISTORY_START, PRESENT_YEAR } from '../src/game/history/timeline'
import { COUNTRIES } from '../src/game/world'
import { loadSnapshot, memorySnapshotBackend, setSnapshotBackend, snapshotWritesSettled, startTimeline, takeSnapshot } from '../src/game/save'
import { migrateSave } from '../src/game/save-schema'
import type { GameState } from '../src/game/types'
import { installStorageShim } from './fuzz-kit'
import { SLICES, explainMove, movedSlices, sliceDigests, type SliceDigests } from './golden-kit'
import { GOLDEN_PLANS, type GoldenLife } from './golden-run'
import { playLife } from './play-kit'
import { makeTestGame } from './helpers'
import { probeLife } from './probe-life'

const TIMEOUT = 180_000
/** The years played after the cut, each way. */
const AHEAD = 5

/** The lives and how long they play before the cut. Copies of the plan's own specs, so no seed is written here. */
const CUTS: readonly { id: string; years: number }[] = [
  { id: 'birth-1950', years: 12 },
  { id: 'founder-1975', years: 8 },
]

function spec(id: string): GoldenLife {
  const l = GOLDEN_PLANS.pr.lives.find((x) => x.id === id)
  if (!l) throw new Error(`the pr plan has no life ${id}: this test names two of its lives`)
  return l
}

/** The life after `years` years, the way the golden plan plays it. */
function stateAfter(l: GoldenLife, years: number): GameState {
  return l.kind === 'birth'
    ? playLife({ seed: l.seed, birthYear: l.birthYear, untilAge: years, rich: l.rich ?? false }).g
    : probeLife({ seed: l.seed, birthYear: l.birthYear, businesses: l.businesses ?? 1, years, keepAlive: l.keepAlive ?? false })
}

/** One year after the cut: the digests and a copy of the state, so a difference can be explained after both branches have aged on. */
interface Year {
  digests: SliceDigests
  state: GameState
}

/** Ages `g` by AHEAD years (it is changed). The queue is emptied first, as probeLife does, so no popup waits on an answer. */
function ageAhead(g: GameState): Year[] {
  const out: Year[] = []
  for (let y = 0; y < AHEAD; y++) {
    g.queue = []
    ageUp(g)
    out.push({ digests: sliceDigests(g), state: structuredClone(g) })
  }
  return out
}

/** Throws, with the first move of every moved slice, when the branch is not the original in every one of the years. */
function sameLife(label: string, original: readonly Year[], branch: readonly Year[]): void {
  for (let t = 0; t < Math.max(original.length, branch.length); t++) {
    const a = original[t]
    const b = branch[t]
    if (!a || !b) throw new Error(`${label}: one branch has ${t} year(s) and the other more`)
    const moved = movedSlices(a.digests, b.digests)
    if (moved.length > 0) {
      const where = moved.map((s) => `  ${s}: ${explainMove(a.state, b.state, s)}`).join('\n')
      throw new Error(`${label}: year ${t + 1} after the cut differs in slice(s) ${moved.join(', ')}:\n${where}`)
    }
  }
  for (const y of original) for (const s of SLICES) expect(y.digests[s]).toMatch(/^[0-9a-f]{16}$/)
}

/** A cut life must be alive and have time to run, or the five years would test nothing. */
function alive(g: GameState, label: string): void {
  expect(g.character.alive, `${label}: the life died before the cut`).toBe(true)
}

describe('replay purity (RF5): the same five years, three ways', () => {
  for (const cut of CUTS) {
    const l = spec(cut.id)

    it(
      `${l.id}: a structuredClone aged beside the original gives the same ${AHEAD} years (replay)`,
      () => {
        const g = stateAfter(l, cut.years)
        alive(g, l.id)
        const copy = structuredClone(g)
        const original = ageAhead(g)
        expect(original).toHaveLength(AHEAD)
        sameLife(`${l.id} replay`, original, ageAhead(copy))
      },
      TIMEOUT,
    )

    it(
      `${l.id}: a JSON round trip through migrateSave gives the same ${AHEAD} years (reload)`,
      () => {
        const g = stateAfter(l, cut.years)
        alive(g, l.id)
        const json = JSON.stringify(g)
        const read = migrateSave(JSON.parse(json))
        if (read.kind !== 'ready') throw new Error(`${l.id}: the state does not load back (migrateSave says ${read.kind})`)
        const original = ageAhead(g)
        expect(original).toHaveLength(AHEAD)
        sameLife(`${l.id} reload`, original, ageAhead(read.game))
      },
      TIMEOUT,
    )

    it(
      `${l.id}: a Time Machine snapshot taken and loaded at the same age gives the same ${AHEAD} years (fork)`,
      async () => {
        installStorageShim()
        setSnapshotBackend(memorySnapshotBackend())
        const g = stateAfter(l, cut.years)
        alive(g, l.id)
        startTimeline(g.lifeId, null)
        expect(await takeSnapshot(g), `${l.id}: takeSnapshot refused the state`).toBe(true)
        await snapshotWritesSettled()
        const back = await loadSnapshot(g.lifeId, g.character.age)
        if (back === null) throw new Error(`${l.id}: the snapshot taken at age ${g.character.age} does not load`)
        const original = ageAhead(g)
        expect(original).toHaveLength(AHEAD)
        sameLife(`${l.id} fork`, original, ageAhead(back))
      },
      TIMEOUT,
    )
  }

  it('the comparison has teeth: one extra rng draw in the branch is seen in the first year and named', () => {
    const l = spec('birth-1950')
    const g = stateAfter(l, 4)
    const copy = structuredClone(g)
    copy.rng = (copy.rng + 1) | 0
    expect(() => sameLife('teeth', ageAhead(g), ageAhead(copy))).toThrow(/year 1 after the cut differs in slice\(s\) rng/)
  })

  afterAll(() => setSnapshotBackend(null))
})

// The first thing this test found: the live economy kept a hyperinflation year as the data gives it (Zimbabwe 2008 is 2.5e13), but
// the reader clamped inflation to 1e7, so a clone, a reload and a snapshot of the same state read a different history frame from
// it (the founder lives through 2008 and fails all three checks above). The reader's bound now covers every figure in the data.
describe('a hyperinflation year reads back unchanged (the reader clamps nothing the data holds)', () => {
  const years = (): [string, number][] => COUNTRIES.flatMap((c) => Array.from({ length: PRESENT_YEAR - HISTORY_START + 1 }, (_, i): [string, number] => [c.id, HISTORY_START + i])).filter(([c, y]) => currencyInflation(c, y) > 1e6)

  it('a country economy of every year with inflation above one million survives a JSON round trip', () => {
    const pairs = years()
    // Zimbabwe 2008, Hungary 1946, Serbia 1993 and 1994, Greece 1944 and China 1949 hold such a year today.
    expect(pairs.length).toBeGreaterThanOrEqual(6)
    for (const [c, y] of pairs) {
      const e = initialCountry(c, y)
      expect(normalizeCountry(JSON.parse(JSON.stringify(e)), c, y).inflation, `${c} ${y}`).toBe(e.inflation)
    }
  })

  it('a history frame of such a year survives the read of a state that has not been read before (a clone, a reload)', () => {
    const g = makeTestGame(1, { age: 30, money: 1 })
    g.year = 2013
    const frame = pointOf(initialCountry('zw', 2008))
    expect(frame.inflation).toBe(currencyInflation('zw', 2008))
    const raw = { v: ECONOMY_VERSION, year: 2013, countries: { zw: initialCountry('zw', 2013) }, previous: {}, history: { zw: [frame] } }
    g.flags.worldEconomy = JSON.parse(JSON.stringify(raw))
    expect(economyState(g)?.history.zw?.[0]?.inflation).toBe(frame.inflation)
  })
})
