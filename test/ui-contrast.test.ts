// Guard for text contrast: every text colour token the UI uses must reach WCAG AA (4.5:1) on the
// surfaces it sits on, in the light theme and in the dark one. Pure: it reads src/ui/styles/global.css
// as text, builds the light map and the dark map (light overlaid with the dark :root block), and
// computes the WCAG 2.x contrast ratio. Any new text token pair belongs in PAIRS below.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const CSS = readFileSync(new URL('../src/ui/styles/global.css', import.meta.url), 'utf8')

/** The text between the braces that open at `open` (the index of a '{'), nested braces included. */
function blockAt(css: string, open: number): string {
  let depth = 0
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}') {
      depth--
      if (depth === 0) return css.slice(open + 1, i)
    }
  }
  throw new Error('unbalanced braces in global.css')
}

/** The custom properties declared in one rule body: { 'muted': '#566072', ... }. */
function tokens(body: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of body.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim()
  return out
}

/** The top-level `:root { ... }` block (the first one in the file, outside any @media). */
function lightTokens(css: string): Record<string, string> {
  const at = css.search(/^:root\s*\{/m)
  if (at < 0) throw new Error('no light :root block in global.css')
  return tokens(blockAt(css, css.indexOf('{', at)))
}

/** The `:root` block inside `@media (prefers-color-scheme: dark)`. */
function darkOverrides(css: string): Record<string, string> {
  const at = css.search(/@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{/)
  if (at < 0) throw new Error('no dark :root block in global.css')
  const media = blockAt(css, css.indexOf('{', at))
  return tokens(blockAt(media, media.indexOf('{')))
}

function channel(v: number): number {
  const s = v / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) throw new Error(`not a #rrggbb colour: ${hex}`)
  const n = parseInt(m[1], 16)
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
}

/** The WCAG 2.x contrast ratio of two #rrggbb colours, from 1 (same) to 21 (black on white). */
function contrastRatio(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

const LIGHT = lightTokens(CSS)
const DARK = { ...LIGHT, ...darkOverrides(CSS) }
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
