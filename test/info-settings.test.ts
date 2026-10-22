// R3-H1 (H.3): the Information setting. Realistic (estimates, ranges and words until the player looks closer) is the default and
// is stored as no key at all; Exact (every number, as before) is stored as `info: 'exact'`. Settings is pinned by nine toEqual
// checks on its exact keys (test/store.test.ts, test/offline.test.ts), so `info` must be optional and absent by default.
// The real store is used with a localStorage shim, the way test/quiet-settings.test.ts does.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { unitFlags } from '../scripts/voice/rules.mjs'
import { withFlags } from '../src/game/flags'
import { infoMode, setInfoMode, setInfoOverride } from '../src/game/knowledge/mode'
import { DEFAULT_SETTINGS, SETTINGS_KEY, applyInfoSettings, infoSettingOf, loadSettings, normalizeSettings } from '../src/settings'

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
const { InfoSettingsSection, infoPatch } = await import('../src/ui/components/InfoSettings')
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

/** The radios of some markup: label and aria-checked, in order. */
function radiosOf(html: string): { label: string; checked: string | null }[] {
  const out: { label: string; checked: string | null }[] = []
  for (const m of html.matchAll(/<button\b([^>]*)>([^<]*)<\/button>/g)) {
    if (!/role="radio"/.test(m[1]!)) continue
    out.push({ label: m[2]!, checked: /aria-checked="(true|false)"/.exec(m[1]!)?.[1] ?? null })
  }
  return out
}

// Put the mode switch back the way the file found it (Exact, from setup-exact.ts), whatever a case did.
const SLOT = Symbol.for('anotherlife.infoMode')
const home = globalThis as unknown as Record<symbol, unknown>
let found: unknown
beforeEach(() => {
  infoMode() // make sure the shared state exists
  found = { ...(home[SLOT] as object) }
})
afterEach(() => {
  store.updateSettings({ info: undefined })
  storage.clear()
  home[SLOT] = found
})

describe('normalizeSettings and the info key', () => {
  it.each([[{}], [null], [{ info: 'realistic' }], [undefined], [[]], ['junk']])(
    '%j gives the defaults, with no info key at all',
    (raw) => {
      const s = normalizeSettings(raw)
      expect(s).toEqual(DEFAULT_SETTINGS)
      expect('info' in s).toBe(false)
    },
  )

  it('the default settings have no info key (the nine pinned checks stay as they are)', () => {
    expect(Object.keys(DEFAULT_SETTINGS).sort()).toEqual(['money', 'prices', 'quietMode', 'sandboxTimeMachine'])
  })

  it("keeps an info of exactly 'exact'", () => {
    expect(normalizeSettings({ info: 'exact' })).toEqual({ ...DEFAULT_SETTINGS, info: 'exact' })
  })

  it.each([['Exact'], ['EXACT'], [' exact'], ['exact '], [true], [1], [null], [{}], [[]], ['no'], ['']])(
    'info %j is junk and is dropped',
    (junk) => {
      const s = normalizeSettings({ info: junk, money: 'usd' })
      expect('info' in s).toBe(false)
      expect(s.money).toBe('usd')
    },
  )

  it('leaves the other settings alone', () => {
    expect(
      normalizeSettings({ money: 'usd', prices: 'today', sandboxTimeMachine: true, quietMode: false, info: 'exact' }),
    ).toEqual({ money: 'usd', prices: 'today', sandboxTimeMachine: true, quietMode: false, info: 'exact' })
  })
})

describe('infoSettingOf and applyInfoSettings', () => {
  it('no info is Realistic, exact is Exact, anything else is Realistic', () => {
    expect(infoSettingOf({})).toBe('realistic')
    expect(infoSettingOf({ info: undefined })).toBe('realistic')
    expect(infoSettingOf({ info: 'exact' })).toBe('exact')
    expect(infoSettingOf({ info: 'nope' as never })).toBe('realistic')
  })

  it('applyInfoSettings sets the player setting (the suite override still wins)', () => {
    applyInfoSettings({ info: 'exact' })
    expect(infoMode()).toBe('exact')
    applyInfoSettings({})
    expect(infoMode()).toBe('exact') // the override is on
    setInfoOverride(null)
    expect(infoMode()).toBe('realistic')
    applyInfoSettings({ info: 'exact' })
    expect(infoMode()).toBe('exact')
    applyInfoSettings({})
    expect(infoMode()).toBe('realistic')
  })
})

describe('loadSettings and saveSettings apply the mode', () => {
  it('a stored exact leaves infoMode at exact once the override is cleared', () => {
    storage.set(SETTINGS_KEY, JSON.stringify({ ...DEFAULT_SETTINGS, info: 'exact' }))
    setInfoOverride(null)
    setInfoMode('realistic')
    const s = loadSettings()
    expect(s.info).toBe('exact')
    expect(infoMode()).toBe('exact')
  })

  it('nothing stored, or a stored realistic, is Realistic once the override is cleared', () => {
    setInfoMode('exact')
    setInfoOverride(null)
    loadSettings()
    expect(infoMode()).toBe('realistic')
    storage.set(SETTINGS_KEY, JSON.stringify({ ...DEFAULT_SETTINGS, info: 'realistic' }))
    setInfoMode('exact')
    const s = loadSettings()
    expect('info' in s).toBe(false)
    expect(infoMode()).toBe('realistic')
    // and the stray 'realistic' is cleaned out of the stored copy, like any unknown value
    expect(JSON.parse(storage.get(SETTINGS_KEY)!).info).toBeUndefined()
  })

  it('a test file that imports the store is still Exact: the override beats what the store applied', () => {
    expect(store.getApp().settings.info).toBeUndefined()
    expect(infoMode()).toBe('exact')
    setInfoOverride(null)
    expect(infoMode()).toBe('realistic') // the store applied the (default) setting
  })

  it('updateSettings stores exact, removes the key for Realistic and follows the setting', () => {
    setInfoOverride(null)
    store.updateSettings(infoPatch('exact'))
    expect(store.getApp().settings.info).toBe('exact')
    expect(JSON.parse(storage.get(SETTINGS_KEY)!).info).toBe('exact')
    expect(infoMode()).toBe('exact')
    store.updateSettings(infoPatch('realistic'))
    expect('info' in store.getApp().settings).toBe(false)
    expect('info' in JSON.parse(storage.get(SETTINGS_KEY)!)).toBe(false)
    expect(infoMode()).toBe('realistic')
  })
})

describe('the Information card', () => {
  const card = () => renderToStaticMarkup(createElement(InfoSettingsSection))

  it('infoPatch is the patch for each radio', () => {
    expect(infoPatch('exact')).toEqual({ info: 'exact' })
    expect(infoPatch('realistic')).toEqual({ info: undefined })
    expect('info' in infoPatch('realistic')).toBe(true) // an explicit undefined, so the spread clears the key
  })

  it('has the heading and two radios, Realistic checked by default', () => {
    const html = card()
    expect(textOf(html)).toContain('Information')
    expect(html).toContain('class="al-card set-section"')
    expect(html).toContain('role="radiogroup"')
    expect(radiosOf(html)).toEqual([
      { label: 'Realistic', checked: 'true' },
      { label: 'Exact', checked: 'false' },
    ])
  })

  it('the radios follow the setting', () => {
    store.updateSettings(infoPatch('exact'))
    expect(radiosOf(card())).toEqual([
      { label: 'Realistic', checked: 'false' },
      { label: 'Exact', checked: 'true' },
    ])
    store.updateSettings(infoPatch('realistic'))
    expect(radiosOf(card())).toEqual([
      { label: 'Realistic', checked: 'true' },
      { label: 'Exact', checked: 'false' },
    ])
  })

  it('has the agreed copy, passes the voice rules and holds no dash character', () => {
    const text = textOf(card())
    const help = 'Realistic: estimates, ranges and words until you look closer. Exact: every number, as before.'
    expect(text).toContain(help)
    for (const line of [help, 'Realistic', 'Exact', 'Information']) {
      const flags = unitFlags(line, 'tooltip').filter((f) => ['em-dash', 'chatbot', 'no-contraction'].includes(f))
      expect(flags, line).toEqual([])
      expect(line.length).toBeLessThanOrEqual(120)
    }
    expect(text).not.toMatch(/[\u2013\u2014]/)
    expect(text).not.toMatch(/\bAI\b|API key|narrat|provider|LM Studio|temperature|Advanced/i)
  })
})

describe('the Settings screen', () => {
  it('shows Information after Money and before Notices, Time Machine, About and the danger zone', () => {
    const html = withFlags({ quietInbox: true }, () => renderToStaticMarkup(createElement(SettingsScreen)))
    const money = html.indexOf('Money')
    const info = html.indexOf('Information')
    const notices = html.indexOf('Notices')
    const timeMachine = html.indexOf('Time Machine')
    const about = html.indexOf('<h2>About</h2>')
    const danger = html.indexOf('Danger Zone')
    expect(money).toBeGreaterThanOrEqual(0)
    expect(money).toBeLessThan(info)
    expect(info).toBeLessThan(notices)
    expect(notices).toBeLessThan(timeMachine)
    expect(timeMachine).toBeLessThan(about)
    expect(about).toBeLessThan(danger)
  })

  it('shows Information whether or not the Notices card is there', () => {
    const html = withFlags({ quietInbox: false }, () => renderToStaticMarkup(createElement(SettingsScreen)))
    expect(html).toContain('Information')
    expect(html).not.toContain('Quiet Mode')
    expect(html.indexOf('Information')).toBeLessThan(html.indexOf('Time Machine'))
  })
})
