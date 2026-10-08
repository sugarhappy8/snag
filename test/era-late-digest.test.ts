// The late-era year digest (history/digest-late.ts): one culture line for every year from 1980 to
// PRESENT_YEAR, written so it reads right in every country (no technology a poor country did not
// have yet), with real brands and titles but never a real person's name.
import { describe, expect, it } from 'vitest'
import { anachronismsIn } from '../src/game/events/era'
import { cultureOf, digestLine } from '../src/game/history/digest'
import { CULTURE_LATE } from '../src/game/history/digest-late'
import { PRESENT_YEAR } from '../src/game/history/timeline'
import { COUNTRIES } from '../src/game/world'

describe('late-era culture lines', () => {
  it('has a substantial line for every year from 1980 to PRESENT_YEAR and nothing outside', () => {
    for (let y = 1980; y <= PRESENT_YEAR; y++) {
      const line = CULTURE_LATE[y]
      expect(line, `year ${y}`).toBeTruthy()
      expect(line.length, `year ${y} too short`).toBeGreaterThan(120)
      expect(line.length, `year ${y} too long`).toBeLessThan(420)
      expect(cultureOf(y)).toBe(line)
      expect(digestLine(y)).toContain(line)
    }
    for (const key of Object.keys(CULTURE_LATE)) expect(Number(key)).toBeGreaterThanOrEqual(1980)
    expect(Math.max(...Object.keys(CULTURE_LATE).map(Number))).toBe(PRESENT_YEAR)
  })

  it('never names a technology before it reached any country in the world', () => {
    const bad: Record<string, string[]> = {}
    for (let y = 1980; y <= PRESENT_YEAR; y++) {
      for (const c of COUNTRIES) {
        for (const rule of anachronismsIn(CULTURE_LATE[y], y, [c.id])) (bad[`${y} ${rule}`] ??= []).push(c.id)
      }
    }
    expect(Object.entries(bad).map(([k, v]) => `${k}: ${v.slice(0, 6).join(',')}${v.length > 6 ? ` (+${v.length - 6})` : ''}`)).toEqual([])
  })

  it('has no unfilled tokens, doubled spaces or stray markup', () => {
    for (const [y, line] of Object.entries(CULTURE_LATE)) {
      expect(line, y).not.toMatch(/\{|\}|@\w|\s{2,}|undefined|NaN/)
      expect(line.endsWith('.'), y).toBe(true)
    }
  })
})
