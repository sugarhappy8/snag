// R3-Q11 (E.D4): the 127 culture lines (80 early, 47 late) fit the year-digest cap of docs/VOICE.md (110
// characters), and the log line is the emoji, the year and the culture line, nothing else. The prices stay
// in the This Year menu, so a year still tells what things cost, just not in the log.
import { describe, expect, it } from 'vitest'
import { unitFlags } from '../scripts/voice/rules.mjs'
import { cultureOf, digestLine, pricesLine, pricesOf, thisYearNodes } from '../src/game/history/digest'
import { CULTURE_EARLY } from '../src/game/history/digest-early'
import { CULTURE_LATE } from '../src/game/history/digest-late'
import { PRESENT_YEAR } from '../src/game/history/timeline'
import { makeTestGame } from './helpers'

// Built from char codes, so that this file carries neither character itself.
const DASH = new RegExp(`[${String.fromCharCode(0x2013)}${String.fromCharCode(0x2014)}]`)

const ALL: [number, string][] = [...Object.entries(CULTURE_EARLY), ...Object.entries(CULTURE_LATE)].map(([y, line]) => [Number(y), line])

describe('the culture lines', () => {
  it('are 127: one for every year from 1900 to the present', () => {
    expect(Object.keys(CULTURE_EARLY)).toHaveLength(80)
    expect(Object.keys(CULTURE_LATE)).toHaveLength(47)
    expect(ALL.map(([y]) => y)).toEqual(Array.from({ length: PRESENT_YEAR - 1900 + 1 }, (_, i) => 1900 + i))
  })

  it('are at most 110 characters and at least 60, and end in a full stop', () => {
    const over = ALL.filter(([, line]) => line.length > 110).map(([y, line]) => `${y} (${line.length})`)
    expect(over).toEqual([])
    const short = ALL.filter(([, line]) => line.length < 60).map(([y, line]) => `${y} (${line.length})`)
    expect(short).toEqual([])
    const open = ALL.filter(([, line]) => !line.endsWith('.')).map(([y]) => y)
    expect(open).toEqual([])
  })

  it('pass the voice rules for a year digest: no over-cap, no dash, contractions, no stock openers', () => {
    const bad: string[] = []
    for (const [y, line] of ALL) {
      const flags = unitFlags(line, 'digest') as string[]
      for (const f of ['over-cap', 'no-contraction', 'em-dash', 'nobody', 'everyone', 'stock', 'chatbot']) if (flags.includes(f)) bad.push(`${y} ${f}`)
    }
    expect(bad).toEqual([])
  })

  it('hold no em-dash and no en-dash', () => {
    expect(ALL.filter(([, line]) => DASH.test(line)).map(([y]) => y)).toEqual([])
  })

  it('have no unfilled tokens, doubled spaces or stray markup, and each year has its own', () => {
    for (const [y, line] of ALL) expect(line, String(y)).not.toMatch(/\{|\}|@\w|\s{2,}|undefined|NaN|\s$|^\s/)
    expect(new Set(ALL.map(([, line]) => line)).size).toBe(ALL.length)
  })
})

describe('the log line of a year', () => {
  it('is the emoji, the year and the culture line, and nothing else', () => {
    for (const [y, line] of ALL) {
      expect(cultureOf(y)).toBe(line)
      expect(digestLine(y), String(y)).toBe(`\u{1F4C5} ${y}: ${line}`)
      expect(digestLine(y).length, String(y)).toBeLessThanOrEqual(2 + 1 + 4 + 2 + 110)
    }
  })

  it('carries no prices, which wait in the This Year menu', () => {
    for (const y of [1900, 1950, 1985, 2010, 2026]) {
      expect(digestLine(y), String(y)).not.toContain('$')
      expect(digestLine(y), String(y)).not.toMatch(/\bcosts?\b/)
    }
  })

  it('is empty for a year with no culture line', () => {
    expect(digestLine(1899)).toBe('')
    expect(digestLine(PRESENT_YEAR + 1)).toBe('')
  })

  it('leaves the prices to pricesLine and the This Year menu', () => {
    for (const y of [1900, 1950, 1985, 2010, 2026]) {
      expect(pricesLine(y).length, String(y)).toBeGreaterThan(20)
      const g = makeTestGame(2, { countryId: 'us' })
      g.year = y
      const nodes = thisYearNodes(g)
      expect(nodes.some((n) => n.id === 'year.culture')).toBe(true)
      expect(nodes.some((n) => n.type === 'heading' && n.id === 'year.pricesH')).toBe(true)
      for (const p of pricesOf(y)) expect(nodes.some((n) => n.id === `year.price.${p.id}`), `${y} ${p.id}`).toBe(true)
    }
  })
})
