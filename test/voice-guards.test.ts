// ci: fast
// Hard guards for the voice work, over the real src/ (not a fixture): rules that are absolute, so they are
// test failures instead of warnings in the CI report. The report itself (scripts/voice-report.mjs, its
// metric definitions and their tests) is in voice-report.test.ts.
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

interface ReportJson {
  meta: { repo: string }
  metrics: { key: string; value: number }[]
}

/** The report's metric values for the real src/: no --root, so it measures the repository the script is in, from wherever it is run. */
function metricValues(): Record<string, number> {
  const run = spawnSync(process.execPath, [join(ROOT, 'scripts', 'voice-report.mjs'), '--json'], {
    cwd: tmpdir(),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  expect(run.stderr).toBe('')
  expect(run.status).toBe(0)
  const doc = JSON.parse(run.stdout) as ReportJson
  expect(resolve(doc.meta.repo)).toBe(resolve(ROOT))
  return Object.fromEntries(doc.metrics.map((m) => [m.key, m.value]))
}

describe('voice guards', () => {
  it('em-dashes in strings stay at 24 or fewer', () => {
    // 24 is the count the v2.4.0 audit found. The voice guide bans new ones, so it can only go down.
    expect(metricValues().emDash).toBeLessThanOrEqual(24)
  }, 60_000)
})
