// R1-T8 (G.11, D.7 third bullet): the life log keeps the last 3 years open and folds older years to one row each, so a
// long life draws about 15 entries instead of about 450. yearViews and collapsedSummary are pure; YearList is the
// hook-free list the LifeLog component renders, so the markup is checked with renderToStaticMarkup and no DOM.
import { readFileSync } from 'node:fs'
import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import {
  ageHeading,
  collapsedSummary,
  LifeLog,
  OPEN_YEARS,
  toneClass,
  YearList,
  yearKey,
  yearViews,
} from '../src/ui/components/LifeLog'
import type { LogYear, Tone } from '../src/game/types'

function makeLog(years: number, lines: number): LogYear[] {
  return Array.from({ length: years }, (_, i) => ({
    age: i,
    year: 1990 + i,
    entries: Array.from({ length: lines }, (_, j) => ({ id: `e${i}-${j}`, text: `Line ${j} of year ${i}`, tone: 'neutral' as Tone })),
  }))
}

function totalLines(log: readonly LogYear[]): number {
  return log.reduce((n, y) => n + y.entries.length, 0)
}

/** Freezes a value all the way down, so a builder that writes to its input throws. */
function freeze<T>(v: T): T {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v)
    for (const x of Object.values(v as object)) freeze(x)
  }
  return v
}

function render(log: readonly LogYear[], expanded: ReadonlySet<string> = new Set(), seen = totalLines(log)): string {
  return renderToStaticMarkup(createElement(YearList, { log, expanded, onToggle: () => undefined, seen }))
}

function count(markup: string, pattern: RegExp): number {
  return (markup.match(pattern) ?? []).length
}

const ENTRY = /class="lifelog-entry /g
const TOGGLE = /<button[^>]*class="lifelog-toggle"[^>]*>/g
const COLLAPSED_TOGGLE = /<button[^>]*class="lifelog-toggle"[^>]*aria-expanded="false"[^>]*>/g

describe('yearViews', () => {
  it('opens min(length, 3) years for 0, 1, 3, 4 and 90 years', () => {
    for (const n of [0, 1, 3, 4, 90]) {
      const views = yearViews(makeLog(n, 2), new Set())
      expect(views, `${n} years`).toHaveLength(n)
      expect(views.filter((v) => v.open), `${n} years`).toHaveLength(Math.min(n, 3))
      expect(views.filter((v) => v.collapsible), `${n} years`).toHaveLength(Math.max(0, n - 3))
    }
  })

  it('opens the newest three, not collapsible, and collapses the rest', () => {
    const log = makeLog(6, 1)
    const views = yearViews(log, new Set())
    expect(views.map((v) => v.open)).toEqual([false, false, false, true, true, true])
    expect(views.map((v) => v.collapsible)).toEqual([true, true, true, false, false, false])
    expect(views.map((v) => v.key)).toEqual(log.map(yearKey))
    views.forEach((v, i) => expect(v.year).toBe(log[i]))
  })

  it('opens an older year whose key is expanded, and keeps it collapsible', () => {
    const log = makeLog(6, 1)
    const views = yearViews(log, new Set([yearKey(log[1]!)]))
    expect(views[1]).toMatchObject({ open: true, collapsible: true })
    expect(views[0]).toMatchObject({ open: false, collapsible: true })
    expect(views[2]).toMatchObject({ open: false, collapsible: true })
  })

  it('never lets an expanded key close one of the newest three, and ignores keys that are not in the log', () => {
    const log = makeLog(5, 1)
    const views = yearViews(log, new Set(['nope', yearKey(log[4]!)]))
    expect(views.slice(2).every((v) => v.open && !v.collapsible)).toBe(true)
    expect(views.slice(0, 2).every((v) => !v.open && v.collapsible)).toBe(true)
  })

  it('takes the number of open years as a third argument', () => {
    const views = yearViews(makeLog(6, 1), new Set(), 1)
    expect(views.filter((v) => v.open)).toHaveLength(1)
    expect(views[5]?.open).toBe(true)
    expect(yearViews(makeLog(2, 1), new Set(), 5).every((v) => v.open && !v.collapsible)).toBe(true)
  })

  it('is a pure read: a frozen log and a set that stays the same size', () => {
    const log = freeze(makeLog(8, 3))
    const expanded = new Set([yearKey(log[0]!)])
    expect(() => yearViews(log, expanded)).not.toThrow()
    expect([...expanded]).toEqual([yearKey(log[0]!)])
  })

  it('keys a year by age and calendar year, the key the list used before', () => {
    expect(yearKey({ age: 12, year: 2031, entries: [] })).toBe('12-2031')
  })
})

describe('collapsedSummary', () => {
  it('says No lines, 1 line, or n lines', () => {
    const entry = { id: 'a', text: 'x', tone: 'neutral' as Tone }
    expect(collapsedSummary({ age: 3, year: 2000, entries: [] })).toBe('No lines')
    expect(collapsedSummary({ age: 3, year: 2000, entries: [entry] })).toBe('1 line')
    expect(collapsedSummary({ age: 3, year: 2000, entries: [entry, entry] })).toBe('2 lines')
    expect(collapsedSummary(makeLog(1, 5)[0]!)).toBe('5 lines')
  })
})

describe('YearList markup', () => {
  const log = makeLog(90, 5)

  it('draws 15 entries and 87 folded rows for 90 years of 5 lines, under 700 tags', () => {
    const markup = render(log)
    expect(count(markup, ENTRY)).toBe(15)
    expect(count(markup, TOGGLE)).toBe(87)
    expect(count(markup, COLLAPSED_TOGGLE)).toBe(87)
    expect(count(markup, /<[a-zA-Z]/g)).toBeLessThan(700)
    expect(count(markup, /<section /g)).toBe(90)
  })

  it('shows the age, the calendar year and the line count on every folded row', () => {
    const markup = render(log)
    const rows = [...markup.matchAll(/<button[^>]*class="lifelog-toggle"[^>]*>(.*?)<\/button>/g)].map((m) => m[1]!)
    expect(rows).toHaveLength(87)
    rows.forEach((row, i) => {
      expect(row, `row ${i}`).toContain(ageHeading(i))
      expect(row, `row ${i}`).toContain(String(1990 + i))
      expect(row, `row ${i}`).toContain('5 lines')
      expect(row, `row ${i}`).toContain('+')
    })
  })

  it('draws a folded year as a labelled section with a heading button, and nothing else', () => {
    const markup = render(makeLog(5, 2))
    const first = markup.slice(0, markup.indexOf('</section>') + '</section>'.length)
    expect(first).toMatch(/^<section class="lifelog-year is-collapsed" aria-label="Age: 0 years">/)
    expect(first).toContain('<h3 class="lifelog-age"><button type="button" class="lifelog-toggle" aria-expanded="false">')
    expect(first).toContain('<span class="lifelog-calyear">1990</span>')
    expect(first).not.toContain('lifelog-entry')
    expect(first).not.toContain('aria-controls')
    expect(markup).not.toContain('aria-controls')
  })

  it('draws the last three years as they were: a plain heading with the age and the calendar year, no button', () => {
    const markup = render(makeLog(5, 2))
    const open = markup.slice(markup.indexOf('<section class="lifelog-year" aria-label="Age: 2 years">'))
    expect(open).toContain('<h3 class="lifelog-age"><span>Age: 2 years</span><span class="lifelog-calyear">1992</span></h3>')
    expect(count(open, /<button/g)).toBe(0)
    expect(count(open, ENTRY)).toBe(6)
    expect(count(open, /is-collapsed/g)).toBe(0)
  })

  it('shows the entries of an older year that is expanded, with the same button open and a minus', () => {
    const markup = render(log, new Set([yearKey(log[10]!)]))
    expect(count(markup, ENTRY)).toBe(20)
    expect(count(markup, TOGGLE)).toBe(87)
    expect(count(markup, COLLAPSED_TOGGLE)).toBe(86)
    expect(count(markup, /aria-expanded="true"/g)).toBe(1)
    for (let j = 0; j < 5; j++) expect(markup).toContain(`Line ${j} of year 10<`)
    const open = markup.slice(markup.indexOf('aria-expanded="true"') - 80)
    expect(open.slice(0, open.indexOf('</button>'))).toMatch(/<span class="lifelog-glyph" aria-hidden="true">-<\/span>$/)
    expect(markup).not.toContain('Line 0 of year 11<')
  })

  it('writes the folded plus as a glyph that screen readers skip', () => {
    expect(render(makeLog(4, 1))).toContain('<span class="lifelog-glyph" aria-hidden="true">+</span>')
  })

  it('draws No lines and 1 line for thin years', () => {
    const thin: LogYear[] = [
      { age: 0, year: 2000, entries: [] },
      { age: 1, year: 2001, entries: [{ id: 'a', text: 'First word.', tone: 'good' }] },
      ...makeLog(3, 1).map((y, i) => ({ ...y, age: i + 2, year: 2002 + i })),
    ]
    const markup = render(thin)
    expect(markup).toContain('No lines')
    expect(markup).toContain('>1 line<')
    expect(markup).not.toContain('0 lines')
  })

  it('draws nothing for an empty log', () => {
    expect(render([])).toBe('')
  })

  it('counts new lines over every year, the folded ones too, so the fresh animation lands on the right lines', () => {
    const markup = render(log, new Set(), totalLines(log) - 2)
    expect(count(markup, /is-new/g)).toBe(2)
    const fresh = [...markup.matchAll(/<p class="lifelog-entry [^"]*is-new">([^<]*)<\/p>/g)].map((m) => m[1])
    expect(fresh).toEqual(['Line 3 of year 89', 'Line 4 of year 89'])
    expect(count(render(log, new Set(), totalLines(log)), /is-new/g)).toBe(0)
    expect(count(render(log, new Set(), 0), /is-new/g)).toBe(15)
  })
})

describe('hostile text', () => {
  it('escapes markup and renders a 5,000 character line whole, in an open year and in an expanded one', () => {
    const long = 'a'.repeat(5000)
    const hostile: LogYear[] = makeLog(5, 1)
    hostile[0]!.entries.push({ id: 'h0', text: '<b>x</b>', tone: 'event' })
    hostile[4]!.entries.push({ id: 'h4', text: `<script>alert(1)</script>${long}`, tone: 'bad' })
    const markup = render(hostile, new Set([yearKey(hostile[0]!)]))
    expect(markup).toContain('&lt;b&gt;x&lt;/b&gt;')
    expect(markup).not.toContain('<b>')
    expect(markup).not.toContain('<script>')
    expect(markup).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(markup).toContain(long)
  })

  it('draws a junk tone as a plain line', () => {
    const junk = makeLog(4, 1)
    ;(junk[3]!.entries[0] as { tone: unknown }).tone = 'ai'
    expect(render(junk)).toContain('class="lifelog-entry tone-neutral"')
  })
})

describe('the parts that did not change', () => {
  it('ageHeading and toneClass behave as before', () => {
    expect(ageHeading(1)).toBe('Age: 1 year')
    expect(ageHeading(0)).toBe('Age: 0 years')
    expect(ageHeading(42)).toBe('Age: 42 years')
    for (const t of ['good', 'bad', 'neutral', 'event']) expect(toneClass(t)).toBe(`tone-${t}`)
    for (const junk of ['ai', '', 'GOOD', 7, null, undefined, {}]) expect(toneClass(junk)).toBe('tone-neutral')
  })

  it('the LifeLog component keeps its log region and its empty message, and folds a long log', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const long = renderToStaticMarkup(createElement(LifeLog, { log: makeLog(90, 5) }))
      expect(long).toContain('role="log"')
      expect(long).toContain('aria-live="polite"')
      expect(long).toContain('aria-label="Life story"')
      expect(count(long, ENTRY)).toBe(15)
      expect(renderToStaticMarkup(createElement(LifeLog, { log: [], reserveBottom: true }))).toContain(
        'class="lifelog has-chip"',
      )
      expect(renderToStaticMarkup(createElement(LifeLog, { log: [] }))).toContain(
        'class="lifelog-empty">Your story hasn&#x27;t started yet.</div>',
      )
      expect(error).not.toHaveBeenCalled()
    } finally {
      error.mockRestore()
    }
  })
})

/** A React element with its children and props walked, to find one inside a component that is not rendered. */
function findElement(node: ReactNode, match: (e: ReactElement<Record<string, unknown>>) => boolean): ReactElement<Record<string, unknown>> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findElement(child, match)
      if (hit) return hit
    }
    return null
  }
  if (!isValidElement(node)) return null
  const el = node as ReactElement<Record<string, unknown>>
  if (match(el)) return el
  return findElement(el.props['children'] as ReactNode, match)
}

describe('the folded year as a memo component', () => {
  type MemoLike = { type: (props: Record<string, unknown>) => ReactElement<Record<string, unknown>>; compare: (a: Record<string, unknown>, b: Record<string, unknown>) => boolean }

  function blocks(log: readonly LogYear[], expanded: ReadonlySet<string>, onToggle: (key: string) => void): ReactElement<Record<string, unknown>>[] {
    const list = YearList({ log, expanded, onToggle, seen: totalLines(log) })
    return (list.props as { children: ReactElement<Record<string, unknown>>[] }).children
  }

  it('a toggle re-renders: the memo comparator sees a change in open', () => {
    const log = makeLog(5, 2)
    const onToggle = vi.fn()
    const [first] = blocks(log, new Set(), onToggle)
    const memo = first!.type as unknown as MemoLike
    expect(typeof memo.compare).toBe('function')
    expect(memo.compare(first!.props, { ...first!.props })).toBe(true)
    expect(memo.compare(first!.props, { ...first!.props, open: true })).toBe(false)
  })

  it('the heading button of a folded year calls onToggle with the year key', () => {
    const log = makeLog(5, 2)
    const onToggle = vi.fn()
    const [first, , , , last] = blocks(log, new Set(), onToggle)
    const memo = first!.type as unknown as MemoLike
    const section = memo.type(first!.props)
    const button = findElement(section, (e) => e.type === 'button')
    expect(button).not.toBeNull()
    expect(button!.props['type']).toBe('button')
    expect(button!.props['aria-expanded']).toBe(false)
    ;(button!.props['onClick'] as () => void)()
    expect(onToggle).toHaveBeenCalledWith('0-1990')
    const open = (last!.type as unknown as MemoLike).type(last!.props)
    expect(findElement(open, (e) => e.type === 'button')).toBeNull()
  })
})

describe('constants and styles', () => {
  const css = readFileSync(new URL('../src/ui/styles/notices.css', import.meta.url), 'utf8')

  function block(selector: string): string {
    const at = css.indexOf(`${selector} {`)
    expect(at, selector).toBeGreaterThan(-1)
    return css.slice(at, css.indexOf('}', at))
  }

  it('OPEN_YEARS is 3', () => {
    expect(OPEN_YEARS).toBe(3)
  })

  it('the stylesheet has the toggle, 44px tall and full width', () => {
    expect(css).toContain('.lifelog-toggle')
    expect(block('.lifelog-toggle')).toMatch(/min-height:\s*44px/)
    expect(block('.lifelog-toggle')).toMatch(/width:\s*100%/)
  })

  it('the life log rules use tokens only, so they follow light and dark mode', () => {
    const start = css.indexOf('/* Life log fold')
    expect(start).toBeGreaterThan(-1)
    const end = css.indexOf('/* Inbox sheet')
    const rules = css.slice(start, end > start ? end : undefined)
    expect(rules).toContain('.lifelog-toggle')
    expect(rules).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(rules).not.toMatch(/\b(?:rgb|rgba|hsl|hsla)\(/)
  })

  it('the component and the stylesheet carry no en or em dash', () => {
    for (const path of ['src/ui/components/LifeLog.tsx', 'src/ui/styles/notices.css', 'test/lifelog-years.test.ts']) {
      expect(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), path).not.toMatch(/[\u2013\u2014]/)
    }
  })
})
