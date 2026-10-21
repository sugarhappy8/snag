// R1-A7 (G.12): touch targets, header text colours and the focus ring. Everything here reads the stylesheets and
// index.html as text, because there is no DOM in these tests. The contrast numbers themselves are proven in
// test/ui-contrast.test.ts; this file proves the rules use the tokens that are measured there.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { readThemeTokens } from './contrast-kit'

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8')
}

const GLOBAL = read('src/ui/styles/global.css')
const SCREENS = read('src/ui/styles/screens.css')
const HTML = read('index.html')
const { light: LIGHT, dark: DARK } = readThemeTokens(GLOBAL)

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** The body of the top-level rule `selector { ... }` (flush left, selector alone, so `.hdr-icon` never reads `.hdr-icon:hover`). */
function ruleBody(css: string, selector: string): string {
  const m = new RegExp(`(?:^|\\n)${escapeRe(selector)}\\s*\\{([^}]*)\\}`).exec(css)
  if (!m) throw new Error(`no top-level rule for ${selector}`)
  return m[1]
}

/** The value of one declaration in a rule body, or null when the rule does not set it. */
function decl(body: string, prop: string): string | null {
  const m = new RegExp(`(?:^|[;\\s])${escapeRe(prop)}\\s*:\\s*([^;]+);`).exec(body)
  return m ? m[1].trim() : null
}

describe('touch targets are 44px', () => {
  it('--target is 44px in the light block, and the dark block does not change it', () => {
    expect(LIGHT['target']).toBe('44px')
    expect(DARK['target']).toBe('44px')
  })

  it.each([
    ['.hdr-icon', GLOBAL],
    ['.sheet-nav', GLOBAL],
    ['.al-back', SCREENS],
  ])('%s is var(--target) wide and high', (selector, css) => {
    const body = ruleBody(css, selector)
    expect(decl(body, 'width')).toBe('var(--target)')
    expect(decl(body, 'height')).toBe('var(--target)')
  })

  it('the header row and the spacers that stand in for a button keep the same size', () => {
    expect(decl(ruleBody(GLOBAL, '.hdr-top'), 'min-height')).toBe('var(--target)')
    expect(decl(ruleBody(SCREENS, '.al-back-spacer'), 'width')).toBe('var(--target)')
    const spacer = ruleBody(GLOBAL, '.sheet-nav-spacer')
    expect(decl(spacer, 'width')).toBe('var(--target)')
    expect(decl(spacer, 'height')).toBe('var(--target)')
  })

  it('the header loses 6px of top padding, so the taller row grows it by 6px and not 12', () => {
    const padding = decl(ruleBody(GLOBAL, '.hdr'), 'padding')
    expect(padding).toBe('var(--safe-top) 12px 12px')
  })
})

describe('header text is a solid token, not a faded white', () => {
  it.each(['.hdr-brand-year', '.hdr-money-label', '.hdr-role'])('%s uses --header-soft and no opacity', (selector) => {
    const body = ruleBody(GLOBAL, selector)
    expect(decl(body, 'opacity')).toBeNull()
    expect(decl(body, 'color')).toBe('var(--header-soft)')
  })

  it('the money line uses the two money tokens', () => {
    expect(decl(ruleBody(GLOBAL, '.hdr-money-value'), 'color')).toBe('var(--header-money)')
    expect(decl(ruleBody(GLOBAL, '.hdr-money-value.is-negative'), 'color')).toBe('var(--header-money-neg)')
  })

  it('the tokens exist with the planned light values, and the dark block keeps the light soft and money colours', () => {
    expect(LIGHT['header-from']).toBe('#1a60c1')
    expect(LIGHT['header-to']).toBe('#154f9e')
    expect(LIGHT['header-soft']).toBe('#e6effc')
    expect(LIGHT['header-money']).toBe('#b9ffcf')
    expect(LIGHT['header-money-neg']).toBe('#ffe1de')
    expect(DARK['header-from']).toBe('#1f5fbf')
    expect(DARK['header-to']).toBe('#17489a')
    for (const name of ['header-soft', 'header-money', 'header-money-neg']) expect(DARK[name]).toBe(LIGHT[name])
  })

  it('the Annual Report top bar fallbacks match the light gradient', () => {
    const body = ruleBody(SCREENS, '.al-topbar')
    expect(decl(body, 'background')).toBe(
      `linear-gradient(180deg, var(--header-from, ${LIGHT['header-from']}), var(--header-to, ${LIGHT['header-to']}))`,
    )
  })
})

describe('the focus ring is a solid token', () => {
  it('the global :focus-visible rule uses --focus-ring and keeps its width and offset', () => {
    const body = ruleBody(GLOBAL, ':focus-visible')
    expect(decl(body, 'outline')).toBe('3px solid var(--focus-ring)')
    expect(decl(body, 'outline-offset')).toBe('2px')
    expect(body).not.toContain('color-mix')
  })

  it('the ring has a light and a dark value', () => {
    expect(LIGHT['focus-ring']).toBe('#1556ab')
    expect(DARK['focus-ring']).toBe('#8fc0ff')
  })

  it('inside the three gradient headers the ring is white', () => {
    const m = /(?:^|\n)\.hdr :focus-visible,\s*\.sheet-header :focus-visible,\s*\.al-topbar :focus-visible\s*\{([^}]*)\}/.exec(GLOBAL)
    expect(m, 'a rule for the header focus ring').not.toBeNull()
    expect(decl(m![1], 'outline-color')).toBe('#fff')
  })
})

describe('index.html theme-color', () => {
  const metas = [...HTML.matchAll(/<meta\b[^>]*name="theme-color"[^>]*>/g)].map((m) => m[0])
  const content = (tag: string): string | null => /content="([^"]*)"/.exec(tag)?.[1] ?? null

  it('has one plain meta and one for dark mode, and no others', () => {
    expect(metas).toHaveLength(2)
    const plain = metas.filter((t) => !/media=/.test(t))
    const dark = metas.filter((t) => /media="\(prefers-color-scheme: dark\)"/.test(t))
    expect(plain).toHaveLength(1)
    expect(dark).toHaveLength(1)
  })

  it('lists the dark one first: a browser takes the first tag whose media matches, and a tag with no media always does', () => {
    expect(metas.findIndex((t) => /media=/.test(t))).toBeLessThan(metas.findIndex((t) => !/media=/.test(t)))
  })

  it('the colours are the header gradient start of each theme', () => {
    const plain = metas.find((t) => !/media=/.test(t))!
    const dark = metas.find((t) => /media=/.test(t))!
    expect(content(plain)).toBe('#1a60c1')
    expect(content(dark)).toBe('#1f5fbf')
    expect(content(plain)).toBe(LIGHT['header-from'])
    expect(content(dark)).toBe(DARK['header-from'])
  })
})

describe('what this task wrote', () => {
  it('has no em-dash or en-dash', () => {
    const EM_DASH = String.fromCharCode(0x2014)
    const EN_DASH = String.fromCharCode(0x2013)
    for (const rel of ['src/ui/styles/global.css', 'src/ui/styles/screens.css', 'index.html', 'test/a11y-targets.test.ts', 'test/ui-contrast.test.ts', 'test/contrast-kit.ts']) {
      const text = read(rel)
      expect(text.includes(EM_DASH), `${rel} has an em-dash`).toBe(false)
      expect(text.includes(EN_DASH), `${rel} has an en-dash`).toBe(false)
    }
  })
})
