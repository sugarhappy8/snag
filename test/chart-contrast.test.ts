// R1-C7 (D.11.3): the chart colour tokens. Every mark colour (six series colours, good, bad) reaches 3:1 on every
// surface a chart sits on, in the light theme and in the dark one. Pure: it reads src/ui/styles/global.css as text,
// through the shared reader and ratio of test/contrast-kit.ts (R1-A7), which this file reuses and does not fork.
// The text pairs of the rest of the UI are test/ui-contrast.test.ts.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { contrastRatio, readThemeTokens } from './contrast-kit'

const CSS = readFileSync(new URL('../src/ui/styles/global.css', import.meta.url), 'utf8')
const { light: LIGHT, dark: DARK } = readThemeTokens(CSS)
const THEMES: [string, Record<string, string>][] = [
  ['light', LIGHT],
  ['dark', DARK],
]

const SERIES = ['chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5', 'chart-6']
const MARKS = [...SERIES, 'chart-good', 'chart-bad']
const SURFACES = ['card', 'bg', 'card-2']

/** The ratios the plan measured, on --card then --bg (charts.md, R1-C7 tokens table). */
const MEASURED: Record<string, { light: [number, number]; dark: [number, number] }> = {
  'chart-1': { light: [5.19, 4.61], dark: [7.17, 8.08] },
  'chart-2': { light: [5.03, 4.48], dark: [6.65, 7.49] },
  'chart-3': { light: [5.34, 4.75], dark: [7.69, 8.66] },
  'chart-4': { light: [5.45, 4.84], dark: [7.66, 8.63] },
  'chart-5': { light: [5.07, 4.51], dark: [8.6, 9.69] },
  'chart-6': { light: [7.01, 6.24], dark: [8.05, 9.06] },
  'chart-good': { light: [5.7, 5.07], dark: [8.8, 9.92] },
  'chart-bad': { light: [5.48, 4.87], dark: [6.65, 7.49] },
}

describe('chart tokens', () => {
  it('declares every mark token in both themes as a #rrggbb colour', () => {
    for (const [theme, map] of THEMES) {
      for (const t of MARKS) expect(map[t], `--${t} (${theme})`).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('has a dark value of its own for every mark (the light value is not reused)', () => {
    for (const t of MARKS) expect(DARK[t]!.toLowerCase(), `--${t}`).not.toBe(LIGHT[t]!.toLowerCase())
  })

  it('reaches 3:1 on --card, --bg and --card-2, in both themes', () => {
    const misses: string[] = []
    for (const [theme, map] of THEMES) {
      for (const t of MARKS) {
        for (const s of SURFACES) {
          const ratio = contrastRatio(map[t]!, map[s]!)
          if (ratio < 3) misses.push(`${theme}: --${t} on --${s} is ${ratio.toFixed(2)}`)
        }
      }
    }
    expect(misses).toEqual([])
  })

  it('matches the ratios the plan measured (so a token cannot drift unseen)', () => {
    for (const [theme, map] of THEMES) {
      for (const t of MARKS) {
        const [onCard, onBg] = MEASURED[t]![theme as 'light' | 'dark']
        expect(contrastRatio(map[t]!, map.card!), `--${t} on --card (${theme})`).toBeCloseTo(onCard, 1)
        expect(contrastRatio(map[t]!, map.bg!), `--${t} on --bg (${theme})`).toBeCloseTo(onBg, 1)
      }
    }
  })

  it('keeps the six series colours apart in each theme', () => {
    for (const [theme, map] of THEMES) {
      const seen = new Set(SERIES.map((t) => map[t]!.toLowerCase()))
      expect(seen.size, theme).toBe(SERIES.length)
    }
  })

  it('gives dark mode its own good and bad colours: the --action-* fills stay below 3:1 there', () => {
    expect(DARK['chart-good']!.toLowerCase()).not.toBe(DARK['action-green']!.toLowerCase())
    expect(DARK['chart-bad']!.toLowerCase()).not.toBe(DARK['action-red']!.toLowerCase())
    // The reason, measured: the old pair would have failed.
    expect(contrastRatio(DARK['action-green']!, DARK.card!)).toBeLessThan(3)
    expect(contrastRatio(DARK['action-red']!, DARK.card!)).toBeLessThan(3)
  })

  it('reads as text too: good and bad deltas reach 4.5:1 on --card and --card-2', () => {
    const misses: string[] = []
    for (const [theme, map] of THEMES) {
      for (const t of ['chart-good', 'chart-bad']) {
        for (const s of ['card', 'card-2']) {
          const ratio = contrastRatio(map[t]!, map[s]!)
          if (ratio < 4.5) misses.push(`${theme}: --${t} on --${s} is ${ratio.toFixed(2)}`)
        }
      }
    }
    expect(misses).toEqual([])
  })

  it('draws the grid with the border token, which is not a mark', () => {
    expect(LIGHT['chart-grid']).toBe('var(--border)')
    expect(DARK['chart-grid']).toBe('var(--border)')
  })
})
