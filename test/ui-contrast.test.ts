// Guard for text contrast: every text colour token the UI uses must reach WCAG AA (4.5:1) on the
// surfaces it sits on, in the light theme and in the dark one. Pure: it reads src/ui/styles/global.css
// as text, builds the light map and the dark map (light overlaid with the dark :root block), and
// computes the WCAG 2.x contrast ratio. Any new text token pair belongs in PAIRS below. The parser and
// the ratio live in test/contrast-kit.ts so other contrast tests (the chart tokens) can reuse them.
// R1-A7 adds the header text pairs and the focus ring pairs.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { contrastRatio, readThemeTokens } from './contrast-kit'

const CSS = readFileSync(new URL('../src/ui/styles/global.css', import.meta.url), 'utf8')

const { light: LIGHT, dark: DARK } = readThemeTokens(CSS)
const THEMES: [string, Record<string, string>][] = [
  ['light', LIGHT],
  ['dark', DARK],
]

/** Text token, then the surface tokens it must read on. */
const SURFACES = ['bg', 'card', 'card-2', 'chip-bg', 'page-bg']
const PAIRS: [string, string[]][] = [
  ['text', SURFACES],
  ['muted', SURFACES],
  ['tone-good', ['bg', 'card', 'card-2', 'chip-bg']],
  ['tone-bad', ['bg', 'card', 'card-2', 'chip-bg']],
  ['tone-event', ['bg', 'card', 'card-2', 'chip-bg']],
  ['age-heading', ['bg', 'card', 'card-2', 'chip-bg']],
  ['hint-text', ['hint-bg']],
]

/** Every text colour drawn on the header gradient (.hdr, .sheet-header, .al-topbar), and the two gradient ends it sits on. */
const HEADER_TEXT = ['header-text', 'header-soft', 'header-money', 'header-money-neg']
const HEADER_ENDS = ['header-from', 'header-to']

/** The header pairs of one theme map that miss 4.5:1, as readable strings. Empty means the header is readable. */
function headerFailures(map: Record<string, string>): string[] {
  const out: string[] = []
  for (const fg of HEADER_TEXT) {
    for (const bg of HEADER_ENDS) {
      if (!map[fg] || !map[bg]) {
        out.push(`--${fg} on --${bg}: a token is missing`)
        continue
      }
      const ratio = contrastRatio(map[fg], map[bg])
      if (ratio < 4.5) out.push(`--${fg} on --${bg}: ${ratio.toFixed(2)}`)
    }
  }
  return out
}

describe('contrastRatio', () => {
  it('black on white is 21 and a colour on itself is 1', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBe(21)
    expect(contrastRatio('#ffffff', '#000000')).toBe(21)
    expect(contrastRatio('#6a7486', '#6a7486')).toBe(1)
  })

  it('matches the measured ratio of the old muted token on the page background', () => {
    expect(contrastRatio('#6a7486', '#eef2f7')).toBeCloseTo(4.19, 2)
  })
})

describe('readThemeTokens', () => {
  const SAMPLE = `
:root { --a: #111111; --b: #222222; color-scheme: light; }
.thing { --not-a-token: #333333; }
@media (prefers-color-scheme: dark) {
  :root { --b: #eeeeee; --c: #cccccc; color-scheme: dark; }
}
`

  it('reads the light block, and the dark map is the light block overlaid with the dark one', () => {
    const { light, dark } = readThemeTokens(SAMPLE)
    expect(light).toEqual({ a: '#111111', b: '#222222' })
    expect(dark).toEqual({ a: '#111111', b: '#eeeeee', c: '#cccccc' })
  })

  it('throws when a block is missing, so a renamed block cannot pass in silence', () => {
    expect(() => readThemeTokens('.x { color: red; }')).toThrow(/light :root/)
    expect(() => readThemeTokens(':root { --a: #111111; }')).toThrow(/dark :root/)
  })
})

describe('text colours reach 4.5:1 on their surfaces', () => {
  for (const [theme, map] of THEMES) {
    for (const [fg, surfaces] of PAIRS) {
      for (const bg of surfaces) {
        it(`${theme}: --${fg} on --${bg}`, () => {
          expect(map[fg], `--${fg} is missing`).toBeDefined()
          expect(map[bg], `--${bg} is missing`).toBeDefined()
          expect(contrastRatio(map[fg], map[bg])).toBeGreaterThanOrEqual(4.5)
        })
      }
    }
  }

  it('the dark theme overrides the tokens it needs to, and the light map has them all', () => {
    for (const [fg, surfaces] of PAIRS) {
      for (const name of [fg, ...surfaces]) expect(LIGHT[name], `--${name}`).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })
})

describe('header text reaches 4.5:1 on both ends of the gradient', () => {
  for (const [theme, map] of THEMES) {
    for (const fg of HEADER_TEXT) {
      for (const bg of HEADER_ENDS) {
        it(`${theme}: --${fg} on --${bg}`, () => {
          expect(map[fg], `--${fg} is missing`).toMatch(/^#[0-9a-f]{6}$/i)
          expect(map[bg], `--${bg} is missing`).toMatch(/^#[0-9a-f]{6}$/i)
          expect(contrastRatio(map[fg], map[bg])).toBeGreaterThanOrEqual(4.5)
        })
      }
    }

    it(`${theme}: no header pair misses`, () => {
      expect(headerFailures(map)).toEqual([])
    })
  }

  it('pins the measured ratios of the header tokens (white on the start and the end)', () => {
    expect(contrastRatio(LIGHT['header-text'], LIGHT['header-from'])).toBeCloseTo(6.02, 2)
    expect(contrastRatio(LIGHT['header-text'], LIGHT['header-to'])).toBeCloseTo(7.94, 2)
    expect(contrastRatio(DARK['header-text'], DARK['header-from'])).toBeCloseTo(6.09, 2)
    expect(contrastRatio(DARK['header-text'], DARK['header-to'])).toBeCloseTo(8.64, 2)
  })

  it('the check bites: the old gradient start fails it', () => {
    const old = readThemeTokens(`
:root { --header-from: #2a86f0; --header-to: #1d6fd8; --header-text: #ffffff; --header-soft: #e6effc;
  --header-money: #b9ffcf; --header-money-neg: #ffe1de; }
@media (prefers-color-scheme: dark) { :root { --header-from: #1f5fbf; } }
`)
    expect(contrastRatio('#ffffff', '#2a86f0')).toBeLessThan(4.5)
    const missed = headerFailures(old.light)
    expect(missed.length).toBeGreaterThan(0)
    expect(missed.some((m) => m.startsWith('--header-text on --header-from'))).toBe(true)
    // The same colours with a token left out are reported too, not skipped.
    expect(headerFailures({ 'header-from': '#1a60c1', 'header-to': '#154f9e' })).toContain('--header-soft on --header-from: a token is missing')
  })
})

describe('the focus ring reaches 3:1 on every surface it can sit on', () => {
  for (const [theme, map] of THEMES) {
    for (const bg of SURFACES) {
      it(`${theme}: --focus-ring on --${bg}`, () => {
        expect(map['focus-ring'], '--focus-ring is missing').toMatch(/^#[0-9a-f]{6}$/i)
        expect(map[bg], `--${bg} is missing`).toBeDefined()
        expect(contrastRatio(map['focus-ring'], map[bg])).toBeGreaterThanOrEqual(3)
      })
    }
  }

  it('pins the measured ratio on the card, light and dark', () => {
    expect(contrastRatio(LIGHT['focus-ring'], LIGHT['card'])).toBeCloseTo(7.12, 2)
    expect(contrastRatio(DARK['focus-ring'], DARK['card'])).toBeCloseTo(8.79, 2)
  })
})
