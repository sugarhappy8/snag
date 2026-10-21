// ci: fast
// R2-P2 (K.7b b, c): the golden digests, in the fast tier. Three seeded lives are played by 20 to 32 years and digested at
// checkpoints (test/golden-run.ts, the PR plan); every digest is compared with the committed file
// test/fixtures/golden-digests.json, one case per slice so the output names the slice that moved. A move is not a flake: a
// draw moved, was added or was removed, and the way to accept it on purpose is
//     node scripts/golden.mjs update --reason "why"
// under Node 22 (the version CI runs), never by editing the file by hand. docs/CI.md has the rule.
//
// The deep plan (12 more lives, to age 90 and to 60 years of business) runs here only with GOLDEN_DEEP=1: the nightly job
// sets it, and a pull request checks the PR plan only.
import { describe, expect, it } from 'vitest'
import { checkReason } from './golden-cli'
import { SLICES, type SliceName } from './golden-kit'
import { GOLDEN_PLANS, compareGolden, life, playGolden, readGolden, runPlan, samePlan, type GoldenFile, type LifeDigests, type Moved, type PlanName } from './golden-run'

const TIMEOUT = 120_000
const UPDATE = 'node scripts/golden.mjs update --reason "<why>"'
const NODE = Number(process.versions.node.split('.')[0])

const golden = ((): GoldenFile => {
  const f = readGolden()
  if (!f) throw new Error(`test/fixtures/golden-digests.json is missing: make it under Node 22 with node scripts/golden.mjs update --plan all --reason "<why>"`)
  return f
})()

// A plan is played once for every case that needs it.
const played = new Map<PlanName, Record<string, LifeDigests>>()
function playedPlan(name: PlanName): Record<string, LifeDigests> {
  let p = played.get(name)
  if (!p) {
    p = runPlan(name)
    played.set(name, p)
  }
  return p
}

/** The text a moved slice fails with: where it first moved, both digests, the Node majors and what to do about it. */
function failure(plan: PlanName, slice: SliceName, moved: readonly Moved[]): string {
  const first = moved[0]
  const lives = new Set(moved.map((m) => m.life))
  return [
    `golden digest of slice "${slice}" moved in ${lives.size} life(s) of the ${plan} plan.`,
    `First: ${first.life} at ${first.at === 'end' ? 'the end' : `year ${first.at}`}: golden ${first.golden}, now ${first.now}.`,
    `The file was recorded under Node ${golden.node}; this run is Node ${NODE}${golden.node === NODE ? '' : ' (a different major can move a digest on its own)'}.`,
    `If the move is intended: ${UPDATE} (docs/CI.md, Golden digests).`,
  ].join('\n')
}

function sliceCases(plan: PlanName): void {
  it.each(SLICES)(
    `slice %s matches the golden file for every life and checkpoint (${plan} plan)`,
    (slice) => {
      const moved = compareGolden(golden.digests[plan] ?? {}, playedPlan(plan)).filter((m) => m.slice === slice)
      if (moved.length > 0) throw new Error(failure(plan, slice, moved))
    },
    TIMEOUT,
  )
}

describe('golden digests, the PR plan', () => {
  it('the file records the same plan as GOLDEN_PLANS', () => {
    for (const name of ['pr', 'deep'] as const) {
      if (!samePlan(golden.plans[name], GOLDEN_PLANS[name])) {
        throw new Error(`the plan changed: run node scripts/golden.mjs update --reason "<why>" (the ${name} plan differs from the file in its lives or checkpoints)`)
      }
    }
  })

  sliceCases('pr')

  it('the history is a written list: non-empty, every reason acceptable, only real slices, at most 40', () => {
    expect(golden.history.length).toBeGreaterThan(0)
    expect(golden.history.length).toBeLessThanOrEqual(40)
    for (const h of golden.history) {
      expect(checkReason(h.reason), h.reason).toBeNull()
      for (const s of h.moved) expect(SLICES, `${h.at}: ${s}`).toContain(s)
      expect(['pr', 'deep', 'all']).toContain(h.plan)
    }
  })

  it('records a digest for every checkpoint of every life of the plan, and an end', () => {
    for (const name of ['pr', 'deep'] as const) {
      for (const l of GOLDEN_PLANS[name].lives) {
        const rows = golden.digests[name][l.id]
        expect(rows, `${name}/${l.id}`).toBeDefined()
        expect(Object.keys(rows)).toContain('end')
        for (const at of Object.keys(rows)) {
          if (at === 'end') continue
          expect(GOLDEN_PLANS[name].checkpoints, `${name}/${l.id} at ${at}`).toContain(Number(at))
        }
        for (const d of Object.values(rows)) for (const s of SLICES) expect(d[s]).toMatch(/^[0-9a-f]{16}$/)
      }
    }
  })
})

describe('the harness', () => {
  // Fixed specs, a few years each: the helper takes the seed as an argument, so no seed literal is pinned here.
  const TINY = life('tiny', 'birth', 1, 1990, 3)
  const OTHER = life('other', 'birth', 2, 1975, 4)

  it('playGolden has a key for each checkpoint reached and an end, none for a year not played; the hook sees 0 to 3 in order', () => {
    const seen: number[] = []
    const digests = playGolden(TINY, [1, 2, 3, 9], (_g, years) => seen.push(years))
    expect(Object.keys(digests).sort()).toEqual(['1', '2', '3', 'end'])
    expect(seen).toEqual([0, 1, 2, 3])
  })

  it('the hook runs after the digests of that year are taken, so a perturbation shows up one checkpoint later', () => {
    const calm = playGolden(TINY, [1, 2, 3])
    const poked = playGolden(TINY, [1, 2, 3], (g, years) => {
      if (years === 1) g.character.money += 1
    })
    expect(poked['1']).toEqual(calm['1'])
    expect(poked['2'].character).not.toBe(calm['2'].character)
  })

  it('the same life played twice in one process gives the same digests', () => {
    expect(playGolden(TINY, [1, 2, 3])).toEqual(playGolden(TINY, [1, 2, 3]))
  })

  it('a life played after another gives the digests it gives alone (no state outside g)', () => {
    const alone = playGolden(TINY, [1, 2, 3])
    playGolden(OTHER, [1, 2, 3, 4])
    expect(playGolden(TINY, [1, 2, 3])).toEqual(alone)
  })

  it('founder lives play too, and their hook starts at 0 before the first year', () => {
    const seen: number[] = []
    const digests = playGolden(life('founder-tiny', 'founder', 3, 1975, 2, { businesses: 1 }), [1, 2], (_g, years) => seen.push(years))
    expect(Object.keys(digests).sort()).toEqual(['1', '2', 'end'])
    expect(seen).toEqual([0, 1, 2])
  })
})

describe.skipIf(process.env.GOLDEN_DEEP !== '1')('golden digests, the deep plan (GOLDEN_DEEP=1)', () => {
  sliceCases('deep')
})
