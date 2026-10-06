// Special talents in the UI: the New Life "Special talents" picker (collapsed, multi-select up to
// three, Clear, picks passed to createNewLife), purple 🔮 hints under menu rows and popup choices,
// the Annual Report's "Business instinct" box, and the Profile's talents section.
import { readFileSync } from 'node:fs'
import { createElement, isValidElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChoiceModal, GameState, Json, MenuAction, MenuGroup, MinigameModal } from '../src/game/types'
import { makeTestGame } from './helpers'

const director = vi.hoisted(() => ({
  runAiTask: vi.fn(),
  applyFallback: vi.fn(),
  narrateNotice: vi.fn(),
  testConnection: vi.fn(),
  chatReply: vi.fn(),
}))
vi.mock('../src/ai/director', () => director)

const store = await import('../src/ui/store')
const { MAX_START_TALENTS, SPECIAL_TALENTS, HINT_EMOJI } = await import('../src/game/talents')
const { NewLifeScreen, TalentPicker, RANDOM_PICKS, customLifeOptions, startSubtitle, talentCount, talentSummary, talentsOption, toggleTalentPick } = await import(
  '../src/ui/screens/NewLifeScreen'
)
const { cleanHint, HINT_MAX, TalentHint } = await import('../src/ui/components/TalentHint')
const { nodeHint } = await import('../src/ui/components/menuModel')
const { MenuRows } = await import('../src/ui/components/MenuList')
const { ChoiceCard } = await import('../src/ui/components/ModalHost')
const { AnnualReport, readReportData, readTalentHint } = await import('../src/ui/minigames/AnnualReport')
const { ProfileSheet, talentRows } = await import('../src/ui/components/ProfileSheet')
const { liveAgainOptions } = await import('../src/ui/screens/DeathScreen')

const render = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el)

beforeEach(() => {
  // These tests read dollar amounts: show plain US dollars whatever life was bound last.
  store.updateSettings({ aiLevel: 'off', money: 'usd', prices: 'today' })
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------

describe('New Life: Special talents picker', () => {
  it('sits next to Customize stats, collapsed by default', () => {
    const html = render(createElement(NewLifeScreen))
    expect(html).toContain('Customize stats')
    expect(html).toContain('Special talents')
    expect(html).toContain('None picked')
    expect((html.match(/aria-expanded="false"/g) ?? []).length).toBe(2)
    expect(html).not.toContain('nl-talent-list')
    expect(html.indexOf('Customize stats')).toBeLessThan(html.indexOf('Special talents'))
  })

  it('open: every talent as a pressable card with its emoji, label and perk, plus a counter and Clear', () => {
    const html = render(createElement(TalentPicker, { picks: ['Business'], onChange: () => {}, open: true, onToggle: () => {} }))
    expect(html).toMatch(/aria-expanded="true"/)
    expect((html.match(/class="nl-talent[ "]/g) ?? []).length).toBe(SPECIAL_TALENTS.length)
    for (const t of SPECIAL_TALENTS) {
      expect(html).toContain(`<span class="nl-talent-label">${t.label}</span>`)
      expect(html).toContain(t.emoji)
    }
    expect((html.match(/aria-pressed="true"/g) ?? []).length).toBe(1)
    expect((html.match(/aria-pressed="false"/g) ?? []).length).toBe(SPECIAL_TALENTS.length - 1)
    expect(html).toContain('1/3 picked')
    expect(html).toMatch(/<button type="button" class="al-btn small ghost">✕ Clear<\/button>/)
    expect(html).not.toContain('aria-disabled')
    // Plain buttons only, so nothing submits the Custom Life form by accident.
    expect(html).not.toMatch(/<button(?![^>]*type="button")/)
  })

  it('at three picks the rest lock (still focusable) and the header shows the picks', () => {
    const picks = ['Business', 'Investing', 'Acting']
    const html = render(createElement(TalentPicker, { picks, onChange: () => {}, open: true, onToggle: () => {} }))
    expect(html).toContain('3/3 picked')
    expect(html).toContain('unpick one to swap')
    expect((html.match(/aria-pressed="true"/g) ?? []).length).toBe(3)
    expect((html.match(/aria-disabled="true"/g) ?? []).length).toBe(SPECIAL_TALENTS.length - 3)
    expect(html).not.toMatch(/class="nl-talent[^"]*"[^>]*disabled=""/)
    expect(html).toContain('💼📈🎭 3/3')
    const closed = render(createElement(TalentPicker, { picks: [], onChange: () => {}, open: true, onToggle: () => {} }))
    expect(closed).toMatch(/<button type="button" class="al-btn small ghost" disabled="">✕ Clear<\/button>/)
  })

  it('toggles picks, never more than three, ignoring junk', () => {
    expect(MAX_START_TALENTS).toBe(3)
    let picks = toggleTalentPick([], 'Business')
    expect(picks).toEqual(['Business'])
    picks = toggleTalentPick(picks, 'Acting')
    picks = toggleTalentPick(picks, 'Gaming')
    expect(picks).toEqual(['Business', 'Acting', 'Gaming'])
    expect(toggleTalentPick(picks, 'Music')).toEqual(picks)
    expect(toggleTalentPick(picks, 'Acting')).toEqual(['Business', 'Gaming'])
    expect(toggleTalentPick(picks, 'Wizardry')).toEqual(picks)
    expect(toggleTalentPick(['Music', 'Music', 'Nope'], 'Art')).toEqual(['Music', 'Art'])
    expect(talentCount(['Music'])).toBe('1/3 picked')
    expect(talentSummary([])).toBe('None picked')
    expect(talentSummary(['Gaming'])).toBe('🎮 1/3')
    expect(talentsOption([])).toBeUndefined()
    expect(talentsOption(['Gaming', 'Gaming'])).toEqual(['Gaming'])
  })

  it('Start Life small print mentions the picks', () => {
    expect(startSubtitle(RANDOM_PICKS)).toBe('Looks, smarts and family are up to fate')
    expect(startSubtitle(RANDOM_PICKS, 1)).toBe('Born with a special talent; fate rolls the rest')
    expect(startSubtitle({ ...RANDOM_PICKS, looks: 90 }, 3)).toBe('Born with 3 special talents and your stats; fate rolls the rest')
  })

  it('passes the picks to createNewLife; no picks means no talents', () => {
    const form = { firstName: 'Ada', lastName: 'Byte', gender: 'female' as const, countryId: 'jp', city: '', sexuality: '' as const, picks: RANDOM_PICKS, year: 2026 }
    const opts = customLifeOptions({ ...form, talents: ['Business', 'Investing'] })
    expect(opts).toMatchObject({ firstName: 'Ada', lastName: 'Byte', gender: 'female', countryId: 'jp', talents: ['Business', 'Investing'] })
    expect('talents' in customLifeOptions({ ...form, talents: [] })).toBe(false)
    expect(customLifeOptions({ ...form, talents: ['Music', 'Art', 'Acting', 'Gaming'] }).talents).toEqual(['Music', 'Art', 'Acting'])

    store.startNewLife({ ...opts, seed: 11 })
    const g = store.getApp().game as GameState
    expect(g.character.firstName).toBe('Ada')
    expect(g.character.talents).toEqual(['Business', 'Investing'])
  })
})

// ---------------------------------------------------------------------------

describe('purple hints', () => {
  it('cleanHint strips the 🔮, whitespace and junk, and caps the length', () => {
    expect(cleanHint(`${HINT_EMOJI} Raise prices a little.`)).toBe('Raise prices a little.')
    expect(cleanHint(`  ${HINT_EMOJI}${HINT_EMOJI}  Two   spaces \n here `)).toBe('Two spaces here')
    expect(cleanHint('')).toBe('')
    expect(cleanHint(HINT_EMOJI)).toBe('')
    expect(cleanHint(null)).toBe('')
    expect(cleanHint(42)).toBe('')
    const long = cleanHint('x'.repeat(500))
    expect(long.length).toBe(HINT_MAX)
    expect(long.endsWith('…')).toBe(true)
  })

  it('cleanHint never cuts an emoji in half when it shortens a long hint', () => {
    // 218 plain characters, then emoji: a cut by UTF-16 units would leave a lone surrogate.
    const long = cleanHint(`${'a'.repeat(218)}${'\u{1F4C8}'.repeat(10)}`)
    expect(long.endsWith('…')).toBe(true)
    expect(Array.from(long)).toHaveLength(HINT_MAX)
    expect(long).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/)
    // Short hints with emoji are left alone.
    expect(cleanHint(`${HINT_EMOJI} Up \u{1F4C8} next year`)).toBe('Up \u{1F4C8} next year')
  })

  it('TalentHint renders a 🔮 pill with screen-reader text, or nothing', () => {
    const html = render(createElement(TalentHint, { text: `${HINT_EMOJI} Buy the dip.`, className: 'x' }))
    expect(html).toContain('class="talent-hint x"')
    expect(html).toContain(`<span class="talent-hint-icon" aria-hidden="true">${HINT_EMOJI}</span>`)
    expect(html).toContain('Talent hint: </span>Buy the dip.')
    expect(render(createElement(TalentHint, { text: '' }))).toBe('')
    expect(render(createElement(TalentHint, { text: undefined }))).toBe('')
  })

  const row = (id: string, hint?: MenuAction['hint']): MenuAction => ({ type: 'action', id, label: `Row ${id}`, emoji: '🏭', subtitle: 'Sub', hint, run: () => {} })

  it('nodeHint evaluates MenuBase.hint safely', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const g = makeTestGame()
    expect(nodeHint(row('a', () => `${HINT_EMOJI} Hot industry.`), g)).toBe('Hot industry.')
    expect(nodeHint(row('b', () => null), g)).toBeNull()
    expect(nodeHint(row('c', () => ''), g)).toBeNull()
    expect(nodeHint(row('d'), g)).toBeNull()
    expect(nodeHint(row('e', () => 7 as unknown as string), g)).toBeNull()
    expect(
      nodeHint(
        row('f', () => {
          throw new Error('boom')
        }),
        g,
      ),
    ).toBeNull()
    expect(spy).toHaveBeenCalled()
    const group: MenuGroup = { type: 'menu', id: 'grp', label: 'G', emoji: '📁', children: () => [], hint: (s) => (s.character.age > 5 ? 'Grown-up hint' : null) }
    expect(nodeHint(group, g)).toBeNull()
    g.character.age = 30
    expect(nodeHint(group, g)).toBe('Grown-up hint')
  })

  it('menu rows show the hint under the subtitle, and a broken hint never takes the menu down', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const g = makeTestGame(1, { age: 30 })
    const nodes = [
      row('hinted', () => `${HINT_EMOJI} Semiconductors are about to boom.`),
      row('plain'),
      row('broken', () => {
        throw new Error('boom')
      }),
    ]
    const html = render(createElement(MenuRows, { nodes, g, onTap: () => {} }))
    expect((html.match(/class="menu-row has-hint"/g) ?? []).length).toBe(1)
    expect((html.match(/talent-hint menu-row-hint/g) ?? []).length).toBe(1)
    expect(html).toMatch(/<span class="menu-row-sub">Sub<\/span><span class="talent-hint menu-row-hint">.*Semiconductors are about to boom\./)
    expect(html).toContain('Row plain')
    expect(html).toContain('Row broken')
  })

  it('popup choices show their hint under the label, with a ring on the hinted choice', () => {
    const g = makeTestGame(1, { age: 30 })
    const modal: ChoiceModal = {
      kind: 'choice',
      id: 'c1',
      title: 'Supplier Crisis',
      text: 'Your chip supplier doubled prices overnight.',
      source: 'script',
      scriptId: 'x',
      choices: [
        { id: 'pay', label: 'Pay up', emoji: '💸' },
        { id: 'switch', label: 'Find a new supplier', emoji: '🔎', hint: `${HINT_EMOJI} This works out best.` },
        { id: 'blank', label: 'Wait it out', hint: '   ' },
      ],
    }
    const html = render(createElement(ChoiceCard, { modal, g }))
    expect((html.match(/popup-choice has-hint/g) ?? []).length).toBe(1)
    expect((html.match(/talent-hint popup-choice-hint/g) ?? []).length).toBe(1)
    expect(html).toMatch(/<span class="popup-choice-label">Find a new supplier<\/span><span class="talent-hint popup-choice-hint">/)
    expect(html).toContain('This works out best.')
    expect(html).toContain('<span class="popup-choice-label">Pay up</span>')
    expect(html).not.toMatch(/undefined|NaN/)
  })

  it('hint colors are tokens with light and dark values, and the pill uses them', () => {
    const css = readFileSync(new URL('../src/ui/styles/global.css', import.meta.url), 'utf8')
    expect((css.match(/--hint-text:/g) ?? []).length).toBe(2)
    expect((css.match(/--hint-bg:/g) ?? []).length).toBe(2)
    expect(css).toMatch(/\.talent-hint \{[^}]*color: var\(--hint-text\)/)
    expect(css).toMatch(/\.talent-hint \{[^}]*background: var\(--hint-bg\)/)
    expect(css).toMatch(/\.sr-only \{/)
  })
})

// ---------------------------------------------------------------------------

describe('Annual Report: Business instinct', () => {
  const SAMPLE = {
    assetId: 'b1',
    businessName: 'Wafer Wizards',
    emoji: '🔬',
    industryLabel: 'Semiconductors',
    location: 'Osaka, Japan',
    year: 2031,
    unitLabel: 'chips',
    unitCost: 12,
    price: 30,
    minPrice: 5,
    maxPrice: 120,
    suggestedPrice: 32,
    production: 10000,
    maxProduction: 40000,
    inventory: 0,
    expectedDemand: 12000,
    marketNote: 'Every gadget maker in Asia wants chips.',
    lines: [{ label: 'Net profit', value: '$12,000', tone: 'good' }],
    talentHint: { price: 36.5, production: 12500, text: `${HINT_EMOJI} Demand is about to outrun supply: price up, make more.` },
  }

  function modalOf(data: unknown): MinigameModal {
    return { kind: 'minigame', id: 'm1', game: 'annualReport', title: 'Annual Report', scriptId: 'business.report', data: data as Json }
  }

  function textOf(node: ReactNode): string {
    if (node === null || node === undefined || typeof node === 'boolean') return ''
    if (typeof node === 'string' || typeof node === 'number') return String(node)
    if (Array.isArray(node)) return node.map(textOf).join('')
    if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children)
    return ''
  }

  it('parses the hint, clamping the plan to the report ranges', () => {
    const r = readReportData(SAMPLE as unknown as Json)
    expect(r.talentHint).toEqual({ text: 'Demand is about to outrun supply: price up, make more.', plan: { price: 36.5, production: 12500 } })
    const ranges = { minPrice: 5, maxPrice: 120, maxProduction: 40000 }
    expect(readTalentHint({ text: 'x', price: 999, production: 1e9 }, ranges)?.plan).toEqual({ price: 120, production: 40000 })
    expect(readTalentHint({ text: 'x', price: 1.004, production: 2.6 }, ranges)?.plan).toEqual({ price: 5, production: 3 })
    expect(readTalentHint({ text: 'Keep the text', price: 'NaN', production: -4 }, ranges)).toEqual({ text: 'Keep the text', plan: null })
    expect(readTalentHint({ price: 10, production: 10 }, ranges)).toBeNull()
    expect(readTalentHint(undefined, ranges)).toBeNull()
    expect(readTalentHint('nonsense', ranges)).toBeNull()
    expect(readReportData({ ...SAMPLE, talentHint: undefined } as unknown as Json).talentHint).toBeNull()
  })

  it('shows a purple "Business instinct" box with the plan and a Use this plan button', () => {
    const html = render(createElement(AnnualReport, { modal: modalOf(SAMPLE), onDone: () => {} }))
    expect(html).toContain('class="ar-instinct"')
    expect(html).toContain('Business instinct')
    expect(html).toContain('Demand is about to outrun supply')
    expect(html).toContain('$36.50 each · make 12,500 chips')
    expect(html).toContain('aria-pressed="false"')
    expect(html).toContain('>Use this plan</button>')
    expect(html).not.toMatch(/NaN|undefined|Infinity/)
    // Box sits between the market note and the plan.
    expect(html.indexOf('Every gadget maker')).toBeLessThan(html.indexOf('Business instinct'))
    expect(html.indexOf('Business instinct')).toBeLessThan(html.indexOf('Plan for 2032'))
  })

  it('shows "Using this plan" when the sliders already match, and no box without the talent', () => {
    const same = render(createElement(AnnualReport, { modal: modalOf({ ...SAMPLE, talentHint: { ...SAMPLE.talentHint, price: 30, production: 10000 } }), onDone: () => {} }))
    expect(same).toContain('✓ Using this plan')
    expect(same).toContain('aria-pressed="true"')
    const none = render(createElement(AnnualReport, { modal: modalOf({ ...SAMPLE, talentHint: undefined }), onDone: () => {} }))
    expect(none).not.toContain('Business instinct')
    const textOnly = render(createElement(AnnualReport, { modal: modalOf({ ...SAMPLE, talentHint: { text: 'Trust your gut.', price: null, production: null } }), onDone: () => {} }))
    expect(textOnly).toContain('Trust your gut.')
    expect(textOnly).not.toContain('Use this plan')
  })

  it('the button hands the hinted plan to the controls', () => {
    const calls: string[] = []
    let tree: ReactNode = null
    function Probe() {
      tree = AnnualReport({ modal: modalOf(SAMPLE), onDone: (r: string) => void calls.push(r) })
      return tree
    }
    render(createElement(Probe))
    const find = (node: ReactNode): { props: { onUse?: (p: unknown) => void; hint?: unknown } } | null => {
      if (Array.isArray(node)) {
        for (const n of node) {
          const hit = find(n)
          if (hit) return hit
        }
        return null
      }
      if (!isValidElement(node)) return null
      const props = node.props as { onUse?: unknown; children?: ReactNode }
      if (typeof props.onUse === 'function') return node as unknown as { props: { onUse: (p: unknown) => void; hint: unknown } }
      return find(props.children)
    }
    const box = find(tree)
    expect(box).not.toBeNull()
    expect(box!.props.hint).toEqual({ text: 'Demand is about to outrun supply: price up, make more.', plan: { price: 36.5, production: 12500 } })
    expect(textOf(tree)).toContain('Approve plan')
  })
})

// ---------------------------------------------------------------------------

describe('Profile: Special talents', () => {
  beforeEach(() => store.startNewLife({ seed: 3, year: 2026 }))

  it('lists picked and discovered talents with emoji, origin and perk', () => {
    const g = makeTestGame(1, { age: 20, talents: ['Business', 'Gaming'], talent: 'Music' })
    expect(talentRows(g).map((t) => [t.emoji, t.label, t.origin])).toEqual([
      ['💼', 'Business', 'Picked before birth'],
      ['🎮', 'Gaming', 'Picked before birth'],
      ['🎵', 'Music', 'Discovered as a kid'],
    ])
    store.act((draft) => Object.assign(draft, structuredClone(g)))
    const html = render(createElement(ProfileSheet, { onClose: () => {} }))
    expect(html).toContain('Special talents')
    expect(html).toContain('<strong>Business</strong>')
    expect(html).toContain('Picked before birth')
    expect(html).toContain('Discovered as a kid')
    expect(html).toContain(SPECIAL_TALENTS.find((t) => t.id === 'Gaming')!.perk)
  })

  it('an heir’s talents run in the family; no section without talents', () => {
    const heir = makeTestGame(1, { age: 20, talents: ['Acting'] })
    heir.ancestors = [{ generation: 1, name: 'Old Mom', gender: 'female', bornYear: 1950, diedYear: 2020, age: 70, causeOfDeath: 'Old Age', netWorth: 0, occupation: 'Actor', ribbon: null }]
    expect(talentRows(heir)[0].origin).toBe('Runs in the family')
    const none = makeTestGame(1, { age: 20 })
    expect(talentRows(none)).toEqual([])
    store.act((draft) => Object.assign(draft, structuredClone(none)))
    expect(render(createElement(ProfileSheet, { onClose: () => {} }))).not.toContain('Special talents')
  })
})

// ---------------------------------------------------------------------------

describe('Death screen: Live again', () => {
  it('replays the same build: the talents this life started with come along', () => {
    const g = makeTestGame(4, { age: 61, talents: ['Business', 'Investing', 'Acting'], talent: 'Music', alive: false })
    const opts = liveAgainOptions(g, 2031)
    expect(opts.talents).toEqual(['Business', 'Investing', 'Acting'])
    expect(opts.firstName).toBe(g.character.firstName)
    expect(opts.year).toBe(2031)
    // The gift discovered as a kid is fate's, not a pick: it isn't carried over.
    expect(opts.talents).not.toContain('Music')
  })

  it('no picks, no talents option (and old saves without the field work)', () => {
    const g = makeTestGame(4, { age: 61, alive: false })
    delete g.character.talents
    expect('talents' in liveAgainOptions(g, 2031)).toBe(false)
    g.character.talents = ['Nonsense']
    expect('talents' in liveAgainOptions(g, 2031)).toBe(false)
  })
})
