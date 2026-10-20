// Starts the heaviest test files first. With no vitest cache (always true in CI), vitest runs files in discovery order,
// so the 494-second simulate test would start near the end of a shard and set its wall time. The weights come from
// scripts/test-timings.json, the same file the shard planner balances with. Named in vite.config.ts.
import { join, relative } from 'node:path'
import { BaseSequencer, type TestSpecification } from 'vitest/node'
import { readTimings, weightOf, type Timings } from '../scripts/ci-shard.mjs'

export default class TimingsSequencer extends BaseSequencer {
  /** Weight descending, then path. */
  override async sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    const root = this.ctx.config.root
    // The order is only an optimisation: a missing or broken timings file must not stop the tests from running
    // (the checks job fails on it through `ci-shard.mjs --verify`).
    let timings: Timings
    try {
      timings = readTimings(join(root, 'scripts', 'test-timings.json'))
    } catch {
      timings = { v: 1, source: 'none', files: {}, split: [] }
    }
    const key = (spec: TestSpecification) => relative(root, spec.moduleId).split('\\').join('/')
    return [...files].sort((a, b) => {
      const ka = key(a)
      const kb = key(b)
      return weightOf(timings, kb) - weightOf(timings, ka) || (ka < kb ? -1 : ka > kb ? 1 : 0)
    })
  }
}
