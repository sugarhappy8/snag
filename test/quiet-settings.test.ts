// R1-T5 (G.11 step 2, D18): the Quiet Mode setting. It is on for everyone by default, it only does something while
// FLAGS.quietInbox is on (R1-T6 reads both), and the Settings section that holds the switch is hidden while the flag
// is off, so no dead switch ships. The real store is used with a localStorage shim, the way test/store.test.ts does.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { unitFlags } from '../scripts/voice/rules.mjs'
import { resetFlags, withFlags } from '../src/game/flags'
import { DEFAULT_SETTINGS, SETTINGS_KEY, normalizeSettings, quietModeOn } from '../src/settings'

// Minimal in-memory localStorage, installed before the store loads its settings.
const storage = vi.hoisted(() => {
  const data = new Map<string, string>()
  const ls = {
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() {
      return data.size
    },
  }
  Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true, writable: true })
  return data
})

const store = await import('../src/ui/store')
const { NoticeSettingsSection, quietPatch } = await import('../src/ui/components/NoticeSettings')
const { SettingsScreen } = await import('../src/ui/screens/SettingsScreen')

/** The visible text of some markup, tags dropped and the common entities decoded. */
function textOf(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

afterEach(() => {
  resetFlags()
  store.updateSettings({ quietMode: true })
})

describe('the quietMode setting', () => {
  it('is on by default and part of the default shape', () => {
    expect(DEFAULT_SETTINGS.quietMode).toBe(true)
    expect(normalizeSettings(null).quietMode).toBe(true)
    expect(normalizeSettings({}).quietMode).toBe(true)
  })

  it('keeps a saved false and a saved true', () => {
    expect(normalizeSettings({ quietMode: false }).quietMode).toBe(false)
    expect(normalizeSettings({ quietMode: true }).quietMode).toBe(true)
  })

  it.each([['no'], [0], [null], [undefined], [[]], [{}], ['false']])('%j counts as junk and gives the default (on)', (junk) => {
    expect(normalizeSettings({ quietMode: junk }).quietMode).toBe(true)
  })

  it.each([[null], ['junk'], [5], [[]], [undefined]])('a settings blob that is %j gives the defaults', (raw) => {
    expect(normalizeSettings(raw)).toEqual(DEFAULT_SETTINGS)
  })

  it('leaves the other settings alone', () => {
    expect(normalizeSettings({ money: 'usd', prices: 'today', sandboxTimeMachine: true, quietMode: false })).toEqual({
      money: 'usd',
      prices: 'today',
      sandboxTimeMachine: true,
      quietMode: false,
    })
  })

  it('quietModeOn is on unless the value is exactly false', () => {
    expect(quietModeOn(null)).toBe(true)
    expect(quietModeOn(undefined)).toBe(true)
    expect(quietModeOn({})).toBe(true)
    expect(quietModeOn({ quietMode: true })).toBe(true)
    expect(quietModeOn({ quietMode: false })).toBe(false)
    expect(quietModeOn({ quietMode: 'no' as never })).toBe(true)
  })

  it('quietPatch is the patch for the switch', () => {
    expect(quietPatch(false)).toEqual({ quietMode: false })
    expect(quietPatch(true)).toEqual({ quietMode: true })
  })

  it('updateSettings on the real store persists the choice under the settings key', () => {
    store.updateSettings({ quietMode: false })
    expect(store.getApp().settings.quietMode).toBe(false)
    expect(JSON.parse(storage.get(SETTINGS_KEY)!).quietMode).toBe(false)
    store.updateSettings(quietPatch(true))
    expect(store.getApp().settings.quietMode).toBe(true)
    expect(JSON.parse(storage.get(SETTINGS_KEY)!).quietMode).toBe(true)
  })
})

describe('the Notices section', () => {
  it('renders nothing while the quietInbox flag is off', () => {
    expect(renderToStaticMarkup(createElement(NoticeSettingsSection))).toBe('')
  })

  it('renders one switch, on, while the flag is on', () => {
    const html = withFlags({ quietInbox: true }, () => renderToStaticMarkup(createElement(NoticeSettingsSection)))
    expect(html.split('role="switch"').length - 1).toBe(1)
    expect(html).toContain('aria-checked="true"')
    expect(html).toContain('class="al-card set-section"')
  })

  it('shows the switch off after Quiet Mode is turned off', () => {
    store.updateSettings({ quietMode: false })
    const html = withFlags({ quietInbox: true }, () => renderToStaticMarkup(createElement(NoticeSettingsSection)))
    expect(html).toContain('aria-checked="false"')
    expect(html).not.toContain('aria-checked="true"')
  })

  it('has the agreed copy, and it passes the voice rules', () => {
    const html = withFlags({ quietInbox: true }, () => renderToStaticMarkup(createElement(NoticeSettingsSection)))
    const text = textOf(html)
    const heading = 'Notices'
    const help = 'Routine news waits in the inbox instead of popping up. Decisions, money, health and legal news always pop up.'
    const title = 'Quiet Mode'
    const switchHelp = 'On by default.'
    for (const line of [heading, help, title, switchHelp]) expect(text, line).toContain(line)
    for (const line of [help, title, switchHelp]) {
      const flags = unitFlags(line, 'tooltip').filter((f) => ['em-dash', 'chatbot', 'no-contraction'].includes(f))
      expect(flags, line).toEqual([])
      expect(line.length).toBeLessThanOrEqual(120)
    }
    expect(text).not.toMatch(/[\u2013\u2014]/)
    expect(text).not.toMatch(/\bAI\b|API key|narrat|provider|LM Studio|temperature|Advanced/i)
  })
})

describe('the Settings screen', () => {
  it('has no Notices section while the flag is off', () => {
    const html = renderToStaticMarkup(createElement(SettingsScreen))
    expect(html).not.toContain('Quiet Mode')
    expect(html).toContain('Time Machine')
  })

  it('puts Notices after Money and before Time Machine, About and the danger zone while the flag is on', () => {
    const html = withFlags({ quietInbox: true }, () => renderToStaticMarkup(createElement(SettingsScreen)))
    const money = html.indexOf('Money')
    const notices = html.indexOf('Notices')
    const timeMachine = html.indexOf('Time Machine')
    const about = html.indexOf('<h2>About</h2>')
    const danger = html.indexOf('Danger Zone')
    expect(money).toBeGreaterThanOrEqual(0)
    expect(money).toBeLessThan(notices)
    expect(notices).toBeLessThan(timeMachine)
    expect(timeMachine).toBeLessThan(about)
    expect(about).toBeLessThan(danger)
    expect(html).not.toMatch(/\bAI\b|API key|narrat|provider|LM Studio|temperature|Advanced/i)
  })
})
