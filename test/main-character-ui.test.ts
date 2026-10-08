// Main Character Syndrome in the UI: the New Life picker shows it clearly (and that it takes one of
// the three slots), the profile names it instead of fifteen chips, and a started life keeps it.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { masterFirstTime } from '../src/game/mastery'
import type { GameState } from '../src/game/types'
import { makeTestGame } from './helpers'

const offline = vi.hoisted(() => {
  const resolve = vi.fn()
  return { applyFallback: resolve, resolveTask: resolve, MAX_CUSTOM_ACTIONS_PER_YEAR: 5, CUSTOM_ACTION_KEY: 'doAnything' }
})
vi.mock('../src/game/offline', () => offline)

const store = await import('../src/ui/store')
const { MAIN_CHARACTER, MAX_START_TALENTS, SPECIAL_TALENTS } = await import('../src/game/talents')
const { TalentPicker, customLifeOptions, talentCount, talentSummary, toggleTalentPick } = await import('../src/ui/screens/NewLifeScreen')
const { ProfileSheet, talentRows } = await import('../src/ui/components/ProfileSheet')
const { liveAgainOptions } = await import('../src/ui/screens/DeathScreen')

const render = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el)
const def = SPECIAL_TALENTS.find((t) => t.id === MAIN_CHARACTER)!

beforeEach(() => store.updateSettings({ money: 'usd', prices: 'today' }))

describe('New Life: the picker', () => {
  it('lists it as one more card with its emoji, label, one-line perk and a badge for the slot it takes', () => {
    const html = render(createElement(TalentPicker, { picks: [], onChange: () => {}, open: true, onToggle: () => {} }))
    expect((html.match(/class="nl-talent[ "]/g) ?? []).length).toBe(SPECIAL_TALENTS.length)
    expect(html).toContain('<span class="nl-talent-label">Main Character Syndrome</span>')
    expect(html).toContain(def.emoji)
    expect(html).toContain('You have every talent, and anything you do once, you master.')
    expect(html).toContain(`Counts as 1 of your ${MAX_START_TALENTS} talent slots`)
    expect(html).toMatch(/nl-talent is-main/)
    // Only that card carries the badge.
    expect((html.match(/nl-talent-badge/g) ?? []).length).toBe(1)
  })

  it('picked, it counts as one of three, and says so; other picks are marked as redundant', () => {
    const one = render(createElement(TalentPicker, { picks: [MAIN_CHARACTER], onChange: () => {}, open: true, onToggle: () => {} }))
    expect(one).toContain('1/3 picked')
    expect(one).toContain('aria-pressed="true"')
    expect(one).not.toContain('already gives you every talent')
    const two = render(createElement(TalentPicker, { picks: [MAIN_CHARACTER, 'Business'], onChange: () => {}, open: true, onToggle: () => {} }))
    expect(two).toContain('2/3 picked')
    expect(two).toContain('already gives you every talent')
    const full = render(createElement(TalentPicker, { picks: [MAIN_CHARACTER, 'Business', 'Music'], onChange: () => {}, open: true, onToggle: () => {} }))
    expect(full).toContain('3/3 picked')
    expect((full.match(/aria-disabled="true"/g) ?? []).length).toBe(SPECIAL_TALENTS.length - 3)
    expect(toggleTalentPick(['Business', 'Music', 'Art'], MAIN_CHARACTER)).toEqual(['Business', 'Music', 'Art'])
    expect(toggleTalentPick(['Business', 'Music'], MAIN_CHARACTER)).toEqual(['Business', 'Music', MAIN_CHARACTER])
    expect(toggleTalentPick([MAIN_CHARACTER], MAIN_CHARACTER)).toEqual([])
    expect(talentCount([MAIN_CHARACTER])).toBe('1/3 picked')
    expect(talentSummary([MAIN_CHARACTER])).toBe(`${def.emoji} 1/3`)
  })

  it('passes it on to createNewLife like any other pick', () => {
    const form = { firstName: 'Ada', lastName: 'Byte', gender: 'female' as const, countryId: 'jp', city: '', sexuality: '' as const, picks: { happiness: null, health: null, smarts: null, looks: null } as never, year: 2026 }
    const opts = customLifeOptions({ ...form, talents: [MAIN_CHARACTER] })
    expect(opts.talents).toEqual([MAIN_CHARACTER])
    store.startNewLife({ ...opts, seed: 11 })
    const g = store.getApp().game as GameState
    expect(g.character.talents).toEqual([MAIN_CHARACTER])
  })
})

describe('Profile and Live again', () => {
  beforeEach(() => store.startNewLife({ seed: 3, year: 2026 }))

  it('shows Main Character Syndrome instead of fifteen chips, with the perk and how many things were mastered', () => {
    const g = makeTestGame(1, { age: 20, talents: [MAIN_CHARACTER], talent: 'Music' })
    const rows = talentRows(g)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ id: MAIN_CHARACTER, label: 'Main Character Syndrome', origin: 'Picked before birth' })
    expect(rows[0].detail).toBeUndefined()
    masterFirstTime(g, 'instrument.Guitar', 'instrument', 'guitar')
    masterFirstTime(g, 'craft.art', 'creative', 'art')
    expect(talentRows(g)[0].detail).toBe('Mastered on the first try so far: 2')
    store.act((draft) => Object.assign(draft, structuredClone(g)))
    const html = render(createElement(ProfileSheet, { onClose: () => {} }))
    expect(html).toContain('Special talents')
    expect(html).toContain('<strong>Main Character Syndrome</strong>')
    expect(html).toContain(def.perk)
    expect(html).toContain('Mastered on the first try so far: 2')
    expect((html.match(/<li>/g) ?? []).length).toBeGreaterThanOrEqual(1)
    for (const other of SPECIAL_TALENTS.filter((t) => t.id !== MAIN_CHARACTER)) expect(html).not.toContain(`<strong>${other.label}</strong>`)
  })

  it('Live again keeps the talent, as a pick', () => {
    const g = makeTestGame(4, { age: 61, talents: [MAIN_CHARACTER, 'Business'], alive: false })
    expect(liveAgainOptions(g, 2031).talents).toEqual([MAIN_CHARACTER, 'Business'])
  })
})
