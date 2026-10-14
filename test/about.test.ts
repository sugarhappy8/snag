// Settings, About: the one place the game says that it is made up (docs/VOICE.md rule 9). Game text
// carries no disclaimers. The README's note about fictional names is separate and stays as it is.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../src/settings'

const mock = vi.hoisted(() => ({
  state: {
    screen: 'settings',
    previousScreen: 'home',
    game: null as unknown,
    settings: {} as Record<string, unknown>,
  },
}))

vi.mock('../src/ui/store', () => ({
  useApp: (sel: (s: typeof mock.state) => unknown) => sel(mock.state),
  goBack: () => undefined,
  hasSavedGame: () => false,
  abandonLife: () => undefined,
  updateSettings: () => undefined,
}))

const { SettingsScreen } = await import('../src/ui/screens/SettingsScreen')

/** The disclaimer, word for word. */
const ABOUT = "Everything here is made up. People, companies and events are fictional, and the money and crime systems are simulations. Outcomes aren't guaranteed."

describe('Settings, About', () => {
  it('Settings shows an About section with the one disclaimer', () => {
    mock.state.settings = { ...DEFAULT_SETTINGS }
    const html = renderToStaticMarkup(createElement(SettingsScreen))
    // Its own card, like the other sections.
    expect(html).toContain('<section class="al-card set-section"><h2>About</h2>')
    // The text once, word for word (React escapes the apostrophe).
    const text = ABOUT.replace("'", '&#x27;')
    expect(text).toContain('aren&#x27;t guaranteed')
    expect(html.split(text).length - 1).toBe(1)
    // After the Time Machine and before the danger zone.
    const about = html.indexOf('<h2>About</h2>')
    expect(html.indexOf('Time Machine')).toBeLessThan(about)
    expect(about).toBeLessThan(html.indexOf(text))
    expect(html.indexOf(text)).toBeLessThan(html.indexOf('Danger Zone'))
  })
})
