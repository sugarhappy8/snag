// ci: fast
// R4-U4 (People UI and fog track, H.7): the person profile on screen. PersonDetails draws today's sheet in Exact and with the flag off, and
// in Realistic with `peopleProfile` on it hands a living person who is not a pet to PersonProfileLazy: a chunk of its own (src/ui/people/lazy.tsx,
// X48) that draws the rows of personFacts as FactRows. Moves nothing in Exact.
//
//   cold        before the chunk is loaded the sheet is the hero alone (avatar, name, relation, age): never the legacy bars, which print the
//               true stats in Realistic. The lazy view starts idle only once per file (the registry is emptied by the first reset), so these
//               cases come first and nothing before them loads the chunk.
//   today       Exact (flag on or off), the flag off in Realistic, a pet and the dead equal the rows of test/fixtures/people-ui-exact.json
//   profile     the chunk loaded: one bar (your own feeling), a chip per estimate, a state word per unknown row, `Private` for a stranger, and
//               none of the true numbers (sentinel stats that no range can print), pure on a frozen game, bounded for a hostile record
//   FactRow     one row in each state, the chip only on an estimate, a text that is escaped, a bar that is a finite number
//   css         the new selectors, rows that do not reuse the bar grid, no interactive rule under 44px, no long dash in what U4 wrote
//
// The suite runs in Exact (test/setup-exact.ts). A Realistic case goes through inFog; the flag is always named with withFlags.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { personAvatar, shortMoney } from '../src/game/core'
import { withFlags } from '../src/game/flags'
import { personFacts, type FactRow as FactData, type PersonFacts } from '../src/game/hubs/people-facts'
import type { GameState, Person } from '../src/game/types'
import { FactRow } from '../src/ui/components/FactRow'
import { PersonHero } from '../src/ui/components/PersonHero'
import { PersonProfile } from '../src/ui/components/PersonProfile'
import { PersonDetails, personName, personSubtitle } from '../src/ui/components/PersonSheet'
import { prefetchLazyViews, resetLazyViewsForTests } from '../src/ui/lazy/lazyView'
import { PersonProfileLazy } from '../src/ui/people/lazy'
import { deepFreeze, inFog } from './knowledge-kit'
import { FIXTURE_FILE, KIT_KEYS, LEVELS, LIVING_KEYS, buildGroup, buildKit, diffRows, groupOf, type Kit, type KitKey, type Recorded, type Row } from './people-ui-kit'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const TIMEOUT = 120_000
const ON = { peopleProfile: true } as const
const OFF = { peopleProfile: false } as const
/** Realistic with the flag on: the only state in which the profile exists. */
const profile = <T>(fn: () => T): T => withFlags(ON, () => inFog(fn))
const LONG_DASH = new RegExp(`[${String.fromCharCode(0x2014, 0x2013)}]`)

function recordedDetails(): Row[] {
  if (!existsSync(join(ROOT, FIXTURE_FILE))) expect.fail(`${FIXTURE_FILE} is missing`)
  const f = JSON.parse(readFileSync(join(ROOT, FIXTURE_FILE), 'utf8')) as Recorded
  return f.rows.filter(([k]) => groupOf(k) === 'details')
}

const personIn = (g: GameState, id: string): Person => {
  const p = g.people.find((x) => x.id === id)
  if (!p) throw new Error(`no person ${id}`)
  return p
}
const personOf = (kit: Kit, key: KitKey, g: GameState = kit.g): Person => personIn(g, kit.ids[key])
const html = (g: GameState, p: Person): string => renderToStaticMarkup(createElement(PersonDetails, { g, person: p }))

/** The words of a rendered tree: tags dropped, the entities React writes turned back, white space collapsed. */
function plain(markup: string): string {
  return markup
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}
const count = (markup: string, needle: RegExp): number => (markup.match(needle) ?? []).length

// ---------------------------------------------------------------------------------------------------------------------
// Sentinels: true values that no estimate can print. Every bound of a range or "about N" is a multiple of 5, so a number that is not
// one can only reach the page if the truth does. The age (45), the years (10) and your feeling (90) are multiples of 5 on purpose.

const SENTINEL_STATS = { happiness: 61, health: 77, smarts: 87, looks: 93 }
const SENTINEL_DATA: Record<string, number> = {
  generosity: 41, religiousness: 43, kindness: 47, professionalism: 49, strictness: 51, popularity: 53, craziness: 57, willpower: 59,
  petulance: 63, diligence: 67, loyalty: 69, obedience: 71, entitlement: 73, respect: 79, toughness: 81,
}
const SENTINEL_MONEY = 123_457
const SENTINELS = [...Object.values(SENTINEL_STATS), ...Object.values(SENTINEL_DATA)]

/** The kit's friend at feeling 90 with the sentinel stats, money and data stats. */
function sentinelCase(over: Partial<Person> = {}): { g: GameState; p: Person } {
  const kit = buildKit(90)
  const g = structuredClone(kit.g)
  const p = personOf(kit, 'friend', g)
  p.stats = { ...p.stats, ...SENTINEL_STATS }
  p.money = SENTINEL_MONEY
  p.age = 45
  p.yearsKnown = 10
  p.data = { ...p.data, ...SENTINEL_DATA }
  Object.assign(p, over)
  return { g, p }
}

function leaksATrueNumber(markup: string): string[] {
  const words = plain(markup)
  const out = SENTINELS.filter((n) => new RegExp(`(^|[^0-9])${n}([^0-9]|$)`).test(words)).map(String)
  if (new RegExp(`${SENTINEL_MONEY}|123,457|123\\.4|${shortMoney(SENTINEL_MONEY).replace(/[$.]/g, '\\$&')}`).test(words)) out.push('the purse')
  return out
}

// ---------------------------------------------------------------------------------------------------------------------

describe('cold: before the chunk is loaded', () => {
  // The gate registers its view when it is imported, so prefetchLazyViews() (App.tsx, once at startup) fetches the chunk while the browser is
  // idle. The first reset then forgets it (the reset empties the registry, so a second one could not): the cases below need it cold, and
  // everything after them awaits preload() first.
  it('is registered with the idle prefetch, and the first reset makes it cold again', { timeout: 30_000 }, async () => {
    expect(PersonProfileLazy.isReady()).toBe(false)
    expect(PersonProfileLazy.displayName).toBe('Lazy(person-profile)')
    vi.stubGlobal('requestIdleCallback', (run: () => void) => {
      run()
      return 0
    })
    try {
      prefetchLazyViews()
      await vi.waitFor(() => expect(PersonProfileLazy.isReady()).toBe(true), { timeout: 25_000, interval: 25 })
    } finally {
      vi.unstubAllGlobals()
    }
    resetLazyViewsForTests()
    expect(PersonProfileLazy.isReady()).toBe(false)
  })

  it('shows the hero alone for every living person at each level: avatar, name, relation, age, and nothing else', () => {
    for (const level of LEVELS) {
      const kit = buildKit(level)
      for (const key of LIVING_KEYS) {
        const p = personOf(kit, key)
        const markup = profile(() => html(kit.g, p))
        expect(markup, key).toContain('class="person-hero"')
        expect(plain(markup), `${key} at ${level}`).toBe(`${personAvatar(p)} ${personName(p)} ${personSubtitle(p)}`)
        expect(markup, key).not.toMatch(/statbar|person-bars|fact-row|kv-row|conf-chip|Cash on hand|person-chips|aria-busy/)
        expect(PersonProfileLazy.isReady()).toBe(false)
      }
    }
  })

  it('prints no true number: the legacy bars would, in Realistic', () => {
    const { g, p } = sentinelCase()
    const legacy = inFog(() => html(g, p))
    expect(leaksATrueNumber(legacy).length, 'the legacy sheet leaks, so this check can fail').toBeGreaterThan(10)
    const cold = profile(() => html(g, p))
    expect(leaksATrueNumber(cold)).toEqual([])
    expect(cold).not.toContain('Smarts')
  })
})

describe('today: Exact, the flag off, a pet and the dead print the sheet of v5.2.0', () => {
  const recorded = recordedDetails()

  it('Exact with the flag on, and the flag off in Exact, equal the recorded rows', { timeout: TIMEOUT }, () => {
    expect(recorded).toHaveLength(14 * 3)
    for (const flags of [ON, OFF]) {
      const moved = diffRows(recorded, withFlags(flags, () => buildGroup('details')))
      expect(moved, `Exact, peopleProfile ${String(flags.peopleProfile)}\n${moved.slice(0, 4).join('\n')}`).toEqual([])
    }
  })

  it('the flag off in Realistic equals the recorded rows (R3 did not fog the sheet)', { timeout: TIMEOUT }, () => {
    const moved = diffRows(recorded, withFlags(OFF, () => inFog(() => buildGroup('details'))))
    expect(moved, moved.slice(0, 4).join('\n')).toEqual([])
  })

  it('Cash on hand is still there in Exact', () => {
    expect(recorded.find(([k]) => k === 'details/parent/50')![1]).toContain('Cash on hand')
    const kit = buildKit(50)
    expect(withFlags(ON, () => html(kit.g, personOf(kit, 'parent')))).toContain('Cash on hand')
  })
})

describe('the profile: Realistic, the flag on, the chunk loaded', () => {
  beforeAll(async () => {
    expect(await PersonProfileLazy.preload()).toBe(true)
  })

  it('a pet and the dead keep the legacy sheet, at every level', { timeout: TIMEOUT }, () => {
    const recorded = recordedDetails().filter(([k]) => /^details\/(pet|deadParent)\//.test(k))
    expect(recorded).toHaveLength(6)
    const now = profile(() => buildGroup('details')).filter(([k]) => /^details\/(pet|deadParent)\//.test(k))
    expect(diffRows(recorded, now)).toEqual([])
  })

  it('draws the rows of personFacts for the twelve living people at each level: one bar, a chip per estimate, a state word per unknown', () => {
    for (const level of LEVELS) {
      const kit = buildKit(level)
      for (const key of LIVING_KEYS) {
        const p = personOf(kit, key)
        const facts = profile(() => personFacts(kit.g, p))
        expect(facts, key).not.toBeNull()
        const markup = profile(() => html(kit.g, p))
        const words = plain(markup)
        const where = `${key} at ${level}`

        let at = -1
        for (const row of facts!.rows) {
          if (/^(traits|notes)\.\d+$/.test(row.id)) {
            expect(words, `${where}: ${row.id}`).toContain(row.text)
            continue
          }
          const i = words.indexOf(row.label, at + 1)
          expect(i, `${where}: ${row.id} in order`).toBeGreaterThan(at)
          expect(words.slice(i), `${where}: ${row.id} text`).toContain(row.text)
          at = i
        }
        // Your own feeling is the one bar; every estimate has its chip; every unknown row says so in a word.
        expect(count(markup, /class="statbar"/g), where).toBe(1)
        expect(count(markup, /class="statbar-label"/g), where).toBe(1)
        expect(/class="statbar-label">(?:<span class="statbar-emoji">[^<]*<\/span>)?([^<]*)</.exec(markup)?.[1], where).toBe('Relationship')
        expect(count(markup, /class="conf-chip"/g), where).toBe(facts!.rows.filter((r) => r.state === 'estimate').length)
        expect(count(markup, /class="fact-state"/g), where).toBe(facts!.unknown)
        expect(markup, where).not.toMatch(/kv-row|statbar-small/)
        // The revealed trait words are the pills of the hero.
        const pills = facts!.rows.filter((r) => /^traits\.\d+$/.test(r.id)).map((r) => r.text)
        expect(count(markup, /class="pill"/g), where).toBe(pills.length)
        for (const word of pills) expect(markup, where).toContain(`<span class="pill">${word}</span>`)
      }
    }
  })

  it('prints none of the true numbers, however many stats the person has', () => {
    const { g, p } = sentinelCase()
    const markup = profile(() => html(g, p))
    expect(markup).toContain('fact-row')
    expect(leaksATrueNumber(markup)).toEqual([])
    // Cash is an estimate for a friend at feeling 90, and it is words.
    expect(markup).toContain('Cash on hand')
    expect(markup).not.toMatch(/statbar-small|statbar-value">(41|43|47|49|51|53|57|59|61|63|67|69|71|73|77|79|81|87|93)%/)
  })

  it('says Private for a stranger and shows the traits as unknown', () => {
    const kit = buildKit(20)
    const g = structuredClone(kit.g)
    const p = personOf(kit, 'dataStats', g)
    p.yearsKnown = 0
    p.relationship = 30
    p.livesWithPlayer = false
    const markup = profile(() => html(g, p))
    expect(plain(markup)).toContain('Cash on hand')
    expect(plain(markup)).toContain('Private.')
    expect(plain(markup)).toContain('Not clear yet.')
    expect(count(markup, /class="fact-state"/g)).toBeGreaterThanOrEqual(3)
    expect(markup).not.toContain('class="pill"')
    expect(markup).not.toMatch(/\$\d/)
    const g2 = structuredClone(kit.g)
    const close = personOf(kit, 'dataStats', g2)
    close.relationship = 90
    expect(plain(profile(() => html(g2, close)))).not.toContain('Private.')
  })

  it('is pure: the same markup twice on a frozen game, and no draw of g.rng', () => {
    for (const key of ['parent', 'dataStats', 'npcLife', 'child'] as const) {
      const kit = buildKit(50)
      const rng = kit.g.rng
      const frozen = deepFreeze(structuredClone(kit.g))
      const p = personOf(kit, key, frozen)
      const a = profile(() => html(frozen, p))
      const b = profile(() => html(frozen, p))
      expect(a, key).toBe(b)
      expect(a.length, key).toBeGreaterThan(400)
      profile(() => html(kit.g, personOf(kit, key)))
      expect(kit.g.rng, key).toBe(rng)
    }
  })

  it('opens no dialog: it is the body of the sheet that is already open', () => {
    const kit = buildKit(50)
    const markup = profile(() => html(kit.g, personOf(kit, 'spouse')))
    expect(markup).not.toMatch(/role="dialog"|aria-modal|<dialog|sheet-backdrop|popup-backdrop|<button|tabindex|autofocus/i)
  })

  it('a person the builder refuses (Exact, a pet, the dead) gets the hero alone from PersonProfile, never a stat', () => {
    const kit = buildKit(50)
    const draw = (key: KitKey, wrap: <T>(fn: () => T) => T): string => wrap(() => renderToStaticMarkup(createElement(PersonProfile, { g: kit.g, person: personOf(kit, key) })))
    const exact = <T,>(fn: () => T): T => withFlags(ON, fn)
    for (const [key, wrap] of [['parent', exact], ['pet', profile], ['deadParent', profile]] as const) {
      const p = personOf(kit, key)
      expect(plain(draw(key, wrap)), key).toBe(`${personAvatar(p)} ${personName(p)} ${personSubtitle(p)}`)
    }
  })

  it('the hero is one component: PersonHero draws the same markup whoever calls it', () => {
    const kit = buildKit(50)
    const p = personOf(kit, 'friend')
    const alone = renderToStaticMarkup(createElement(PersonHero, { person: p }))
    expect(profile(() => html(kit.g, p)).startsWith(alone.slice(0, alone.lastIndexOf('</div>')))).toBe(true)
    expect(renderToStaticMarkup(createElement(PersonHero, { person: p }, createElement('i', null, 'x')))).toBe(alone.replace(/<\/div>$/, '<i>x</i></div>'))
  })

  it('hostile people print within the caps: no NaN, undefined, object or dash, and a bounded page', () => {
    const kit = buildKit(90)
    const make = (patch: (p: Person) => void): string => {
      const g = structuredClone(kit.g)
      const p = personOf(kit, 'dataStats', g)
      patch(p)
      return profile(() => html(g, p))
    }
    const em = String.fromCharCode(0x2014)
    const cases: Record<string, (p: Person) => void> = {
      nanStats: (p) => { p.stats = { happiness: NaN, health: Infinity, smarts: -Infinity, looks: NaN } },
      money: (p) => { p.money = NaN },
      bigData: (p) => { p.data = { ...p.data, kindness: 1e9, loyalty: -5, respect: NaN, metAt: 42 } },
      noData: (p) => { (p as { data?: unknown }).data = undefined },
      traitsNotAnArray: (p) => { (p as { traits: unknown }).traits = 'kind' },
      manyTraits: (p) => { p.traits = Array.from({ length: 500 }, (_, i) => `trait ${em} ${i} ${'x'.repeat(200)}`) },
      manyNotes: (p) => { p.notes = Array.from({ length: 500 }, (_, i) => `note ${em} ${i} ${'y'.repeat(2000)}`) },
      longName: (p) => { p.firstName = 'Q'.repeat(300) },
    }
    for (const [name, patch] of Object.entries(cases)) {
      const markup = make(patch)
      expect(markup, name).not.toMatch(/\bNaN\b|\bundefined\b|\[object |Infinity/)
      expect(LONG_DASH.test(plain(markup)), `${name}: a long dash`).toBe(false)
      expect(count(markup, /class="fact-row/g), name).toBeLessThanOrEqual(40)
      expect(markup.length, name).toBeLessThan(40_000)
    }
    // 100x: five hundred notes and traits draw the same page as six notes and two words.
    expect(count(make(cases.manyNotes!), /class="person-notes"|<li>/g)).toBeLessThanOrEqual(7)
    expect(count(make(cases.manyTraits!), /class="pill"/g)).toBeLessThanOrEqual(2)
  })

  it('a stranger, a friend and a spouse draw different pages: the layout follows the facts', () => {
    const kit = buildKit(50)
    const pages = (['friend', 'spouse', 'child'] as const).map((k) => profile(() => html(kit.g, personOf(kit, k))))
    expect(new Set(pages).size).toBe(3)
    expect(plain(pages[1]!)).toContain('Lives with you')
    expect(plain(pages[1]!)).toContain('Expecting')
    expect(plain(pages[2]!)).toContain('Mother')
  })
})

describe('FactRow', () => {
  const row = (over: Partial<FactData> = {}): FactData => ({ id: 'facts.smarts', label: 'Smarts', emoji: '🧠', text: '30 to 90', state: 'estimate', conf: 1, ...over })
  const draw = (r: FactData): string => renderToStaticMarkup(createElement(FactRow, { row: r }))

  it('draws the label, the text and, for an estimate, the confidence chip with its words for a screen reader', () => {
    const markup = draw(row())
    expect(plain(markup)).toContain('Smarts')
    expect(plain(markup)).toContain('30 to 90')
    expect(count(markup, /class="conf-chip"/g)).toBe(1)
    expect(markup).toContain('aria-label="Confidence: a fair estimate"')
    expect(markup).not.toContain('fact-state')
    expect(draw(row({ conf: 0 }))).toContain('a rough guess')
    expect(draw(row({ conf: 2, asOf: 2023 }))).toContain('as of 2023')
  })

  it('a known row has no chip and no state word', () => {
    const markup = draw(row({ id: 'facts.occupation', label: 'Occupation', emoji: '💼', text: 'Nurse', state: 'known', conf: undefined }))
    expect(plain(markup)).toContain('Occupation')
    expect(plain(markup)).toContain('Nurse')
    expect(markup).not.toMatch(/conf-chip|fact-state/)
  })

  it('an unknown row says so in a word, with its reason on the second line, and never by colour alone', () => {
    const markup = draw(row({ state: 'unknown', text: 'Private.', how: "You aren't close enough to know.", conf: undefined }))
    expect(count(markup, /class="fact-state"/g)).toBe(1)
    expect(plain(markup)).toContain('Unknown')
    expect(plain(markup)).toContain('Private.')
    expect(markup).toContain('class="fact-how"')
    expect(plain(markup)).toContain("You aren't close enough to know.")
    expect(markup).not.toContain('conf-chip')
  })

  it('the Relationship row is the one bar, with its second line', () => {
    const markup = draw({ id: 'facts.relationship', label: 'Relationship', emoji: '❤️', text: '64%', state: 'known', bar: 64, how: 'Your own feeling about them.' })
    expect(count(markup, /class="statbar"/g)).toBe(1)
    expect(markup).toContain('width:64%')
    expect(plain(markup)).toContain('Relationship')
    expect(plain(markup)).toContain('Your own feeling about them.')
  })

  it('is total: a chip that is not 0 to 3, a bar that is not a number and a text with markup draw safely', () => {
    expect(draw(row({ conf: 9 as unknown as 1 }))).not.toContain('conf-chip')
    expect(draw(row({ conf: undefined }))).not.toContain('conf-chip')
    expect(draw(row({ asOf: 12.5 }))).not.toContain('as of')
    const bad = draw({ id: 'facts.relationship', label: 'Relationship', emoji: '❤️', text: '<b>x</b>', state: 'known', bar: NaN })
    expect(bad).not.toMatch(/NaN|statbar/)
    expect(bad).toContain('&lt;b&gt;x&lt;/b&gt;')
    expect(bad).not.toContain('<b>')
    const infinite = draw({ id: 'facts.relationship', label: 'Relationship', emoji: '❤️', text: '1%', state: 'known', bar: Infinity })
    expect(infinite).not.toMatch(/Infinity|statbar/)
  })

  it('draws a PersonFacts row list without keys clashing: the ids are unique for a person with every section', () => {
    const { g, p } = sentinelCase()
    const facts: PersonFacts = profile(() => personFacts(g, p))!
    expect(new Set(facts.rows.map((r) => r.id)).size).toBe(facts.rows.length)
  })
})

describe('the gate and the stylesheet', () => {
  const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8')
  const CSS = read('src/ui/styles/global.css')

  /** The rules (selector list and body) of the profile block: from its banner to the next banner, comments dropped. */
  function profileBlock(css: string): { selectors: string; body: string }[] {
    const start = css.indexOf('/* The person profile (R4-U4)')
    if (start === -1) return []
    const end = css.indexOf('\n/* ---', start)
    const text = css.slice(start, end === -1 ? undefined : end).replace(/\/\*[\s\S]*?\*\//g, '')
    return [...text.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => ({ selectors: m[1]!.trim().replace(/\s+/g, ' '), body: m[2]! }))
  }

  /** The interactive rules of a block that give a height or min-height under 44px. */
  function smallTargets(rules: { selectors: string; body: string }[]): string[] {
    const interactive = /(^|[\s,>+~])(button|a|input|select|summary|textarea)\b|\[role=|\[tabindex|:focus|\.btn\b|\.sheet-nav\b/
    return rules
      .filter((r) => interactive.test(r.selectors))
      .filter((r) => [...r.body.matchAll(/(?:^|[;\s])(?:min-)?(?:height|width)\s*:\s*(\d+(?:\.\d+)?)px/g)].some((m) => Number(m[1]) < 44))
      .map((r) => r.selectors)
  }

  it('has the new selectors, in a block of its own after the bar grid and before the popups banner', () => {
    const rules = profileBlock(CSS)
    const selectors = rules.map((r) => r.selectors)
    for (const s of ['.person-facts', '.fact-row', '.fact-text', '.fact-how']) expect(selectors, s).toContain(s)
    expect(CSS.indexOf('/* The person profile (R4-U4)')).toBeGreaterThan(CSS.lastIndexOf('.person-bars > .statbar:not(.statbar-small) .statbar-value'))
    expect(CSS.indexOf('/* The person profile (R4-U4)')).toBeLessThan(CSS.indexOf('/* Popups (ModalHost + dialogs)'))
    expect(count(CSS, /(^|\n)\.person-facts\s*\{/g)).toBe(1)
  })

  it('keeps two-line rows off the bar grid: its auto value column squeezes the track on "outstanding" at 360px', () => {
    const rules = profileBlock(CSS)
    for (const r of rules) {
      expect(r.body, r.selectors).not.toMatch(/grid-template-columns\s*:[^;]*(fit-content|auto)/)
    }
    const row = rules.find((r) => r.selectors === '.fact-row')!
    expect(row.body).toMatch(/flex-direction\s*:\s*column/)
    const text = rules.find((r) => r.selectors === '.fact-text')!
    expect(text.body).toMatch(/overflow-wrap\s*:\s*anywhere/)
  })

  it('has no rule under 44px for an interactive element (a fact row is not interactive), and the check can fail', () => {
    expect(smallTargets(profileBlock(CSS))).toEqual([])
    expect(profileBlock(CSS).length).toBeGreaterThanOrEqual(4)
    const synthetic = ['/* The person profile (R4-U4) */', '.fact-row button { min-height: 30px; }', '.fact-row { min-height: 20px; }'].join('\n')
    expect(smallTargets(profileBlock(synthetic))).toEqual(['.fact-row button'])
  })

  it('the gate is made with lazyView and names its props with import type', () => {
    const gate = read('src/ui/people/lazy.tsx')
    expect(gate).toMatch(/lazyView<?[^(]*\(\s*'person-profile'/)
    expect(gate).toMatch(/import\('\.\.\/components\/PersonProfile'\)/)
    expect(gate).toMatch(/import type \{ PersonProfileProps \} from '\.\.\/components\/PersonProfile'/)
    expect(gate).not.toMatch(/^import (?!type)[^\n]*components\/(PersonProfile|FactRow)/m)
  })

  it('PersonProfile is the only importer of the builder and of FactRow', () => {
    const importers = (needle: string): string[] =>
      ['src/ui/components/PersonSheet.tsx', 'src/ui/components/PersonHero.tsx', 'src/ui/components/PersonProfile.tsx', 'src/ui/components/FactRow.tsx', 'src/ui/people/lazy.tsx']
        .filter((f) => new RegExp(`^import (?!type)[^\\n]*${needle}`, 'm').test(read(f)))
    expect(importers('hubs/people-facts')).toEqual(['src/ui/components/PersonProfile.tsx'])
    expect(importers("'./FactRow'")).toEqual(['src/ui/components/PersonProfile.tsx'])
  })

  it('the chunk stays a leaf: PersonProfile and FactRow never import PersonSheet, which would pull the screens into a shared chunk (about 5.5 KB of gzip in the build)', () => {
    for (const rel of ['src/ui/components/PersonProfile.tsx', 'src/ui/components/FactRow.tsx', 'src/ui/components/PersonHero.tsx']) {
      expect(read(rel), rel).not.toMatch(/from '\.\/PersonSheet'|from '\.\.\/people\/lazy'|from '\.\.\/store'|game\/relationships/)
    }
    expect(read('src/ui/components/PersonProfile.tsx')).toMatch(/from '\.\/PersonHero'/)
    // PersonSheet keeps the names every screen imports from it.
    expect(read('src/ui/components/PersonSheet.tsx')).toMatch(/export \{ personName, personSubtitle \}/)
  })

  it('what U4 wrote holds no long dash', () => {
    for (const rel of ['src/ui/components/FactRow.tsx', 'src/ui/components/PersonHero.tsx', 'src/ui/components/PersonProfile.tsx', 'src/ui/people/lazy.tsx', 'src/ui/components/PersonSheet.tsx', 'test/person-facts-ui.test.ts']) {
      expect(LONG_DASH.test(read(rel)), rel).toBe(false)
    }
    expect(LONG_DASH.test(profileBlock(CSS).map((r) => r.selectors + r.body).join('\n'))).toBe(false)
    expect(KIT_KEYS).toHaveLength(14)
  })
})
