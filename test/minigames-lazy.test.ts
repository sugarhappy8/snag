// ci: fast
// INT-fog-mig: the six table and street games, and since the v5.1.0 release commit the Nation Report, load on demand
// (src/ui/minigames/lazy.tsx). The R3 merge put the initial bundle
// 11,252 bytes over the budget (scripts/bundle-budget.mjs, +60,000 gzip bytes over v5.0.0), and the budget's own remedy is a lazy
// gate. This test holds the gate: the lazy games are out of the static closure of src/main.tsx (the Annual Report stays in
// it), MINIGAMES maps them to lazy views, a view that has not loaded shows the busy box, and once it has loaded it
// draws exactly what the game component draws on its own.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MinigameKind, MinigameModal } from '../src/game/types'
import { Blackjack } from '../src/ui/minigames/Blackjack'
import { Burglary } from '../src/ui/minigames/Burglary'
import { HorseRace } from '../src/ui/minigames/HorseRace'
import { NationReport } from '../src/ui/minigames/NationReport'
import { Pickpocket } from '../src/ui/minigames/Pickpocket'
import { PrisonEscape } from '../src/ui/minigames/PrisonEscape'
import { Slots } from '../src/ui/minigames/Slots'
import type { MinigameProps } from '../src/ui/minigames/types'
import { MINIGAMES } from '../src/ui/minigames'
import { resetLazyViewsForTests, type LazyView } from '../src/ui/lazy/lazyView'
import { closure, dynamicImports, resolve, staticImports } from './lazy-kit'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const at = (path: string): string => join(ROOT, path)

/** The games that load on demand (the six table and street games and, since the v5.1.0 release commit, the Nation Report), with the component each one is. */
const LAZY_GAMES = [
  { kind: 'blackjack', file: 'src/ui/minigames/Blackjack.tsx', real: Blackjack },
  { kind: 'horseRace', file: 'src/ui/minigames/HorseRace.tsx', real: HorseRace },
  { kind: 'slots', file: 'src/ui/minigames/Slots.tsx', real: Slots },
  { kind: 'burglary', file: 'src/ui/minigames/Burglary.tsx', real: Burglary },
  { kind: 'prisonEscape', file: 'src/ui/minigames/PrisonEscape.tsx', real: PrisonEscape },
  { kind: 'pickpocket', file: 'src/ui/minigames/Pickpocket.tsx', real: Pickpocket },
  { kind: 'nationReport', file: 'src/ui/minigames/NationReport.tsx', real: NationReport },
] as const

const propsFor = (game: MinigameKind): MinigameProps => ({
  modal: { kind: 'minigame', id: `m-${game}`, game, title: game, scriptId: 'test', data: {} } satisfies MinigameModal,
  onDone: () => undefined,
})

describe('the table and street games and the Nation Report load on demand', () => {
  it('none of them is in the static closure of src/main.tsx, and the Annual Report is', () => {
    const reached = closure(at('src/main.tsx'))
    for (const g of LAZY_GAMES) expect(reached.has(at(g.file)), `${g.file} is reached statically`).toBe(false)
    expect(reached.has(at('src/ui/minigames/AnnualReport.tsx'))).toBe(true)
    // The registry file itself is in the entry, and so is the gate.
    expect(reached.has(at('src/ui/minigames/index.ts'))).toBe(true)
    expect(reached.has(at('src/ui/minigames/lazy.tsx'))).toBe(true)
  })

  it('the gate imports each game dynamically and imports no game statically', () => {
    const gate = at('src/ui/minigames/lazy.tsx')
    const dynamic = dynamicImports(gate).sort()
    expect(dynamic).toEqual(LAZY_GAMES.map((g) => g.file.replace('src/ui/minigames', '.').replace('.tsx', '')).sort())
    const statics = staticImports(gate).map((spec) => resolve(gate, spec))
    for (const g of LAZY_GAMES) expect(statics).not.toContain(at(g.file))
    // Only the registry reaches the gate; nothing else in src/ui names a game file.
    const index = readFileSync(at('src/ui/minigames/index.ts'), 'utf8')
    for (const g of LAZY_GAMES) expect(index).not.toContain(`./${g.file.split('/').pop()?.replace('.tsx', '')}'`)
  })

  it('MINIGAMES maps the lazy kinds to lazy views and keeps the Annual Report as a component', () => {
    for (const g of LAZY_GAMES) {
      const entry = MINIGAMES[g.kind] as unknown as LazyView<MinigameProps>
      expect(entry.displayName, g.kind).toMatch(/^Lazy\(/)
      expect(typeof entry.preload, g.kind).toBe('function')
    }
    for (const kind of ['annualReport'] as const) {
      expect((MINIGAMES[kind] as { displayName?: string }).displayName ?? '').not.toMatch(/^Lazy\(/)
    }
  })
})

describe('a game that has not loaded and one that has', () => {
  beforeEach(() => {
    // Slots and Blackjack deal from Math.random: one fixed value makes two renders of the same game comparable.
    vi.spyOn(Math, 'random').mockReturnValue(0.37)
    resetLazyViewsForTests()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows the busy box until the chunk is in, never the game', async () => {
    // resetLazyViewsForTests forgets every view's loaded module, so the views are idle again.
    for (const g of LAZY_GAMES) {
      const html = renderToStaticMarkup(createElement(MINIGAMES[g.kind], propsFor(g.kind)))
      expect(html, g.kind).toContain('lazy-box')
      expect(html, g.kind).toContain('aria-busy="true"')
    }
  })

  it('draws exactly what the game component draws on its own once loaded', async () => {
    for (const g of LAZY_GAMES) {
      const view = MINIGAMES[g.kind] as unknown as LazyView<MinigameProps>
      expect(await view.preload(), `${g.kind} loaded`).toBe(true)
      expect(view.isReady()).toBe(true)
      const lazy = renderToStaticMarkup(createElement(MINIGAMES[g.kind], propsFor(g.kind)))
      const real = renderToStaticMarkup(createElement(g.real, propsFor(g.kind)))
      expect(lazy, g.kind).not.toContain('lazy-box')
      expect(lazy, g.kind).toBe(real)
    }
  })
})
