// R1-A7 (G.12): the shared CSS token reader and WCAG contrast helper. test/ui-contrast.test.ts (text and header pairs) and
// test/chart-contrast.test.ts (chart tokens) both import it; reuse it, do not fork it. Pure: it only reads the CSS text it
// is given. The parser and the ratio are the ones R0-11 wrote inside ui-contrast.test.ts, moved here unchanged.

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

/**
 * The two theme maps of a stylesheet. `light` is the first top-level `:root` block. `dark` is the whole dark map, not
 * only the overrides: the light block overlaid with the `:root` block inside `@media (prefers-color-scheme: dark)`,
 * which is how the browser resolves it (there is no [data-theme] switch in this repo). Throws when either block is missing.
 */
export function readThemeTokens(css: string): { light: Record<string, string>; dark: Record<string, string> } {
  const light = lightTokens(css)
  return { light, dark: { ...light, ...darkOverrides(css) } }
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
export function contrastRatio(fg: string, bg: string): number {
  const la = luminance(fg)
  const lb = luminance(bg)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}
