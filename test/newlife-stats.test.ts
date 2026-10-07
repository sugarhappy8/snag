// Pre-birth stats: createNewLife honors (and clamps) chosen stats without changing anything
// else the seed rolls, and the New Life screen's "Customize stats" section works.
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { createNewLife } from '../src/game/life'

const mock = vi.hoisted(() => ({
  state: { screen: 'newLife', previousScreen: 'home', game: null as unknown, settings: {} },
}))

vi.mock('../src/ui/store', () => ({
  useApp: (sel: (s: typeof mock.state) => unknown) => sel(mock.state),
  getApp: () => mock.state,
  goTo: () => {},
  startNewLife: () => {},
  hasSavedGame: () => false,
}))

const { NewLifeScreen, StatCustomizer, RANDOM_PICKS, clampPick, pickFromTap, rollStatPicks, startSubtitle, statsOption, statsSummary, stepPick } = await import(
  '../src/ui/screens/NewLifeScreen'
)

const render = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el)

describe('createNewLife stats option', () => {
  it('uses the chosen stats', () => {
    const g = createNewLife({ seed: 42, year: 2026, stats: { happiness: 12, health: 99, smarts: 100, looks: 0 } })
    expect(g.character.stats).toEqual({ happiness: 12, health: 99, smarts: 100, looks: 0 })
  })

  it('clamps to 0-100 and rounds', () => {
    const g = createNewLife({ seed: 42, year: 2026, stats: { happiness: 55.6, health: 101, smarts: 250, looks: -20 } })
    expect(g.character.stats).toEqual({ happiness: 56, health: 100, smarts: 100, looks: 0 })
  })

  it('leaves unset stats random and rolls the exact same life otherwise', () => {
    const plain = createNewLife({ seed: 1234, year: 2026 })
    const custom = createNewLife({ seed: 1234, year: 2026, stats: { looks: 100 } })
    expect(custom.character.stats.looks).toBe(100)
    expect(custom.character.stats.happiness).toBe(plain.character.stats.happiness)
    expect(custom.character.stats.health).toBe(plain.character.stats.health)
    expect(custom.character.stats.smarts).toBe(plain.character.stats.smarts)
    // Same family, name, country, log and destiny: only the chosen stat differs.
    expect(custom.people).toEqual(plain.people)
    expect(custom.log).toEqual(plain.log)
    expect(custom.flags).toEqual(plain.flags)
    expect(custom.rng).toBe(plain.rng)
    expect({ ...custom.character, stats: null }).toEqual({ ...plain.character, stats: null })
  })

  it('ignores junk values (old or hand-edited options)', () => {
    const plain = createNewLife({ seed: 77, year: 2026 })
    const junk = createNewLife({
      seed: 77,
      year: 2026,
      stats: { happiness: Number.NaN, health: Infinity, smarts: '90' as unknown as number, looks: undefined },
    })
    expect(junk.character.stats).toEqual(plain.character.stats)
    expect(createNewLife({ seed: 77, year: 2026, stats: {} }).character.stats).toEqual(plain.character.stats)
  })

  it('keeps everything in range for random lives', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const s = createNewLife({ seed, year: 2026 }).character.stats
      for (const v of Object.values(s)) {
        expect(Number.isInteger(v)).toBe(true)
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(100)
      }
    }
  })

  it('survives a JSON round trip (plain-JSON state)', () => {
    const g = createNewLife({ seed: 5, year: 2026, stats: { smarts: 88 } })
    expect(JSON.parse(JSON.stringify(g)).character.stats.smarts).toBe(88)
  })
})

describe('customize stats helpers', () => {
  it('only passes the stats the player chose', () => {
    expect(statsOption(RANDOM_PICKS)).toBeUndefined()
    expect(statsOption({ ...RANDOM_PICKS, smarts: 90 })).toEqual({ smarts: 90 })
    expect(statsOption({ happiness: 0, health: 100, smarts: 50.4, looks: 140 })).toEqual({ happiness: 0, health: 100, smarts: 50, looks: 100 })
  })

  it('summarizes the choice for the collapsed header and the start button', () => {
    expect(statsSummary(RANDOM_PICKS)).toBe('All random')
    expect(statsSummary({ ...RANDOM_PICKS, looks: 10, health: 20 })).toBe('2 of 4 set')
    expect(statsSummary({ happiness: 1, health: 2, smarts: 3, looks: 4 })).toBe('All 4 set')
    expect(startSubtitle(RANDOM_PICKS)).toContain('up to fate')
    expect(startSubtitle({ ...RANDOM_PICKS, looks: 10 })).toContain('fate rolls the rest')
    expect(startSubtitle({ happiness: 1, health: 2, smarts: 3, looks: 4 })).toContain('Stats locked in')
  })

  it('steps from Random at 50 and stays within 0-100', () => {
    expect(stepPick(null, 1)).toBe(51)
    expect(stepPick(null, -1)).toBe(49)
    expect(stepPick(100, 1)).toBe(100)
    expect(stepPick(0, -1)).toBe(0)
    expect(stepPick(72, -1)).toBe(71)
    expect(clampPick(Number.NaN)).toBe(50)
    expect(clampPick(-3)).toBe(0)
  })

  it('a tap on a slider still on Random picks the tapped spot (the parked handle sends no change event)', () => {
    expect(pickFromTap(null, '50')).toBe(50)
    expect(pickFromTap(null, 73)).toBe(73)
    expect(pickFromTap(null, 'junk')).toBe(50)
    expect(pickFromTap(null, 140)).toBe(100)
    // Already set: a tap never overrides what the drag/keyboard chose.
    expect(pickFromTap(12, '50')).toBe(12)
    expect(pickFromTap(0, '50')).toBe(0)
  })

  it('Randomize rolls concrete values across the whole range', () => {
    expect(rollStatPicks(() => 0)).toEqual({ happiness: 0, health: 0, smarts: 0, looks: 0 })
    expect(rollStatPicks(() => 0.9999999)).toEqual({ happiness: 100, health: 100, smarts: 100, looks: 100 })
    const picks = rollStatPicks()
    for (const v of Object.values(picks)) {
      expect(v).not.toBeNull()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(100)
    }
  })
})

describe('New Life screen', () => {
  it('has a collapsed "Customize stats" section next to the existing pickers', () => {
    const html = render(createElement(NewLifeScreen))
    expect(html).toContain('Random Life')
    expect(html).toContain('Custom Life')
    expect(html).toContain('First name')
    expect(html).toContain('Country')
    expect(html).toContain('Customize stats')
    expect(html).toContain('All random')
    expect(html).toMatch(/aria-expanded="false"/)
    // Only the "Born in" slider; the stat sliders stay hidden while the section is collapsed.
    const ranges = html.match(/<input[^>]*type="range"[^>]*>/g) ?? []
    expect(ranges).toHaveLength(1)
    expect(ranges[0]).toContain('Birth year slider')
    expect(html).toContain('Looks, smarts and family are up to fate')
  })

  it('expanded: a slider and steppers per stat, a clear Random state, Randomize and All random', () => {
    const html = render(createElement(StatCustomizer, { picks: { ...RANDOM_PICKS, happiness: 80 }, onChange: () => {}, open: true, onToggle: () => {} }))
    expect(html).toMatch(/aria-expanded="true"/)
    expect((html.match(/type="range"/g) ?? []).length).toBe(4)
    for (const label of ['Happiness', 'Health', 'Smarts', 'Looks']) {
      expect(html).toContain(`aria-label="Lower ${label}"`)
      expect(html).toContain(`aria-label="Raise ${label}"`)
    }
    expect((html.match(/🎲 Random<\/output>/g) ?? []).length).toBe(3)
    expect((html.match(/aria-valuetext="Random"/g) ?? []).length).toBe(3)
    expect(html).toContain('aria-valuetext="80"')
    expect(html).toContain('Make Happiness random again')
    expect(html).toContain('Randomize')
    expect(html).toContain('All random')
    expect(html).toContain('1 of 4 set')
    // Every control is a plain button so nothing submits the form by accident.
    expect(html).not.toMatch(/<button(?![^>]*type="button")/)
  })

  it('the Random Life / Start Life small print wraps instead of being cut off at 360px', () => {
    const css = readFileSync(new URL('../src/ui/styles/screens.css', import.meta.url), 'utf8')
    expect(css).toMatch(/\.new-life \.al-bigbtn-sub \{[^}]*white-space: normal/)
  })

  it('"All random" is disabled until something is set', () => {
    const html = render(createElement(StatCustomizer, { picks: RANDOM_PICKS, onChange: () => {}, open: true, onToggle: () => {} }))
    expect(html).toMatch(/<button type="button" class="al-btn small ghost" disabled="">↺ All random<\/button>/)
  })
})
