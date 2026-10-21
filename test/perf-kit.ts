// R2-S8 (K.5 h): a machine factor for timing tests. A budget written in milliseconds is a budget for one machine; a CI runner is
// slower than the desktop the number was set on, so a test multiplies its budget by machineFactor(), the time a fixed loop takes
// here over the time it took on the desktop that set REFERENCE_MS. A faster machine is not held to less: the factor never goes
// below 1. The save-size, per-tap and light-life probes (R2-S8, R2-S11, R2-S12) use it, so their budgets read the same everywhere.
//
// No vitest import: this file may also run in a script, like test/play-kit.ts.

/** Steps of the calibration loop. Fixed: the reference below is the time of exactly this many. */
const STEPS = 2_000_000
/** How long STEPS integer steps took on the dev desktop (Apple silicon, Node 22), in milliseconds: the best of 25 runs. */
export const REFERENCE_MS = 9.4
/** Runs of the loop; the fastest is kept, because a slow run is the machine being busy, not the machine being slow. */
const RUNS = 7

/** One pass of the loop. A dependent chain of integer steps, so it measures the core's speed and not memory. */
function loop(): number {
  let x = 1
  for (let i = 0; i < STEPS; i++) x = (Math.imul(x, 1664525) + 1013904223 + i) | 0
  return x
}

let cached: number | undefined
/** What the last loop returned. Kept in a variable that outlives the call, so the loop cannot be dropped as dead code. */
let lastSink = 0

/** The milliseconds the calibration loop takes here (the fastest of a few runs), measured once per process. */
export function calibrationMs(): number {
  if (cached !== undefined) return cached
  let best = Number.POSITIVE_INFINITY
  for (let r = 0; r < RUNS; r++) {
    const t0 = performance.now()
    lastSink ^= loop()
    best = Math.min(best, performance.now() - t0)
  }
  cached = best
  return cached
}

/** calibrationMs() over REFERENCE_MS, clamped to at least 1: multiply a desktop budget by it to get this machine's budget. */
export function machineFactor(): number {
  return Math.max(1, calibrationMs() / REFERENCE_MS)
}
