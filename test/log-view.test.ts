// R3-Q7 (E.D3 b): the collapsed life log. A year's lines of weight 2 or more stay visible (at most 8); lines of weight 0
// and 1, and the overflow, fold into one closed row per category with a count. logModel.ts is pure (no React, no store,
// nothing written) and reads `s` and `w` as the UI reads every save, as unknown. A year with 5 lines or fewer, or with
// no weight on any line (an old save), is drawn exactly as before. LifeLog's YearList is hook-free, so the markup is
// checked with renderToStaticMarkup and no DOM, the way test/lifelog-years.test.ts does.
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { unitFlags } from '../scripts/voice/rules.mjs'
import type { LogYear } from '../src/game/types'
import { YearList, yearKey } from '../src/ui/components/LifeLog'
import { GROUP_LABEL, GROUP_ORDER } from '../src/ui/components/yearCardModel'
import {
  GROUP_OF_SOURCE,
  LOG_PLAIN,
  LOG_VISIBLE,
  groupOf,
  lineWeight,
  viewYearLog,
} from '../src/ui/components/logModel'
import { deepFreeze } from './fuzz-kit'

const src = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)

interface Line {
  id: string
  text: string
  tone: string
  s?: string
  w?: number
}

function line(id: string, s: string | undefined, w: number | undefined, tone = 'neutral'): Line {
  const e: Line = { id, text: `Line ${id}`, tone }
  if (s !== undefined) e.s = s
  if (w !== undefined) e.w = w
  return e
}

/**
 * A tycoon's year as the log holds it: 13 lines, 3 of weight 3, 6 of weight 2 and 4 of weight 1, from the hooks that
 * write them (the source is the hook name).
 */
function tycoonYear(): Line[] {
  return [
    line('a01', 'business', 2, 'good'), //  Your studio shipped its game.
    line('a02', 'wealth', 1), //             Dividends came in.
    line('a03', 'workshop', 1), //           The lab filed a patent.
    line('a04', 'health', 3, 'bad'), //      A diagnosis.
    line('a05', 'investments', 2), //        Stocks moved.
    line('a06', 'shops', 1), //              The shop turned a small profit.
    line('a07', 'business', 3, 'good'), //   A company went public.
    line('a08', 'relationships', 2), //      A friend called.
    line('a09', 'development', 1), //        Rent was paid.
    line('a10', 'events', 2, 'event'), //    A pitch went well.
    line('a11', 'nepo', 3), //               Your father retired.
    line('a12', 'crime', 2, 'bad'), //       A tip came your way.
    line('a13', 'finance', 2), //            The bank raised your limit.
  ]
}

const ids = (list: readonly { id: string }[]): string[] => list.map((e) => e.id)

describe('LOG_VISIBLE and LOG_PLAIN', () => {
  it('a year shows at most 8 lines, and a year of 5 or fewer is never folded', () => {
    expect(LOG_VISIBLE).toBe(8)
    expect(LOG_PLAIN).toBe(5)
  })
})

describe('lineWeight', () => {
  it('is w when w is 0, 1, 2 or 3, and 2 for everything else', () => {
    for (const w of [0, 1, 2, 3]) expect(lineWeight({ w })).toBe(w)
    expect(lineWeight({})).toBe(2)
    expect(lineWeight({ s: 'health' })).toBe(2)
    for (const junk of [-1, 4, 1.5, Number.NaN, Infinity, '2', null, true, {}, []]) {
      expect(lineWeight({ w: junk as unknown as number }), String(junk)).toBe(2)
    }
  })
})

describe('the source groups', () => {
  // The shape contract with the game side (hubs/year-plan.ts, R3-Q3); R3-Q13 compares the two copies.
  const TABLE: Record<string, string[]> = {
    people: ['household', 'relationships', 'sharedProjects', 'background', 'royalty', 'royalCareers', 'familyUse', 'nepo', 'willFeuds'],
    body: ['health'],
    work: ['education', 'professions', 'career', 'special', 'advisors', 'effort.you'],
    companies: ['workshop', 'corruption', 'business', 'techWaves', 'hedge'],
    money: ['development', 'investments', 'shops', 'computer', 'finance', 'wealth', 'assets', 'knowledge.core'],
    law: ['immigration', 'crime', 'underworld', 'nation'],
    world: ['history', 'digest', 'world', 'world.frontier'],
    life: ['events', 'milestones', 'givingFund'],
  }

  it('maps every source of the plan to its group', () => {
    for (const [group, sources] of Object.entries(TABLE)) {
      for (const s of sources) expect(groupOf(s), s).toBe(group)
    }
    const mapped = Object.keys(GROUP_OF_SOURCE).sort()
    expect(mapped).toEqual(Object.values(TABLE).flat().sort())
  })

  it('maps all 36 yearly aging hooks of the game, and no hook falls into a group by accident', () => {
    const hooks = [...src('src/game/modules/yearly-aging.ts').matchAll(/^ {2}hook\('([A-Za-z]+)'/gm)].map((m) => m[1]!)
    expect(hooks).toHaveLength(36)
    for (const h of hooks) expect(Object.keys(GROUP_OF_SOURCE), h).toContain(h)
  })

  it('puts a missing, unknown or hostile source in Everyday', () => {
    for (const s of [undefined, null, '', 'nothing', 'Health', 7, {}, [], 'constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      expect(groupOf(s), String(s)).toBe('life')
    }
  })

  it('uses the groups of the year card, in its order and with its labels', () => {
    expect(GROUP_ORDER).toEqual(['people', 'body', 'work', 'companies', 'money', 'law', 'world', 'life'])
    expect(Object.values(GROUP_OF_SOURCE).every((g) => (GROUP_ORDER as readonly string[]).includes(g))).toBe(true)
    expect(GROUP_LABEL.companies).toBe('Your companies')
  })
})

describe('viewYearLog on a tycoon year', () => {
  const entries = tycoonYear()
  const view = viewYearLog(entries)

  it('shows 8 of the 13 lines and folds 5', () => {
    expect(entries).toHaveLength(13)
    expect(view.shown).toHaveLength(8)
    expect(view.collapsed.reduce((n, c) => n + c.n, 0)).toBe(5)
  })

  it('keeps all three weight 3 lines and the lines of weight 2 before any weight 1 line', () => {
    const shown = new Set(ids(view.shown))
    for (const id of ['a04', 'a07', 'a11']) expect(shown.has(id), id).toBe(true)
    // 3 at weight 3 and 6 at weight 2 make 9: one weight 2 line is the overflow, and the 4 routine lines fold.
    expect(view.shown.filter((e) => e.w === 2)).toHaveLength(5)
    expect(view.shown.every((e) => (e.w ?? 2) >= 2)).toBe(true)
  })

  it('folds the oldest of the equal lines first, so the newest stays in view', () => {
    expect(ids(view.collapsed.flatMap((c) => c.lines))).toContain('a01')
    expect(ids(view.shown)).toContain('a13')
  })

  it('keeps the log order inside the lines shown', () => {
    expect(ids(view.shown)).toEqual(ids(entries).filter((id) => ids(view.shown).includes(id)))
  })

  it('counts the folds per category, in the order of the year card, with its labels', () => {
    // a01 (the overflow of the weight 2 lines) and a03 are company lines; a02, a06 and a09 are money lines
    expect(view.collapsed.map((c) => [c.k, c.label, c.n])).toEqual([
      ['companies', 'Your companies', 2],
      ['money', 'Money', 3],
    ])
    for (const c of view.collapsed) expect(c.n).toBe(c.lines.length)
  })

  it('loses nothing and repeats nothing: shown plus folded is the input', () => {
    const all = [...ids(view.shown), ...view.collapsed.flatMap((c) => ids(c.lines))].sort()
    expect(all).toEqual(ids(entries).sort())
  })

  it('keeps the log order inside each folded category', () => {
    for (const c of view.collapsed) {
      const order = ids(c.lines)
      expect(order).toEqual(ids(entries).filter((id) => order.includes(id)))
    }
  })
})

describe('viewYearLog rules', () => {
  it('folds the lowest weights first when more than 8 lines have weight 2 or more', () => {
    const entries = [
      ...Array.from({ length: 10 }, (_, i) => line(`n${i}`, 'events', 2)),
      line('big1', 'health', 3),
      line('big2', 'crime', 3),
    ]
    const v = viewYearLog(entries)
    expect(v.shown).toHaveLength(8)
    expect(ids(v.shown)).toContain('big1')
    expect(ids(v.shown)).toContain('big2')
    expect(v.shown.filter((e) => e.w === 2)).toHaveLength(6)
    // the four overflow lines are the oldest of the weight 2 lines
    expect(ids(v.collapsed.flatMap((c) => c.lines))).toEqual(['n0', 'n1', 'n2', 'n3'])
  })

  it('when more than 8 lines have weight 3, 8 stay and the rest fold, newest kept', () => {
    const entries = Array.from({ length: 10 }, (_, i) => line(`m${i}`, 'health', 3))
    const v = viewYearLog(entries)
    expect(ids(v.shown)).toEqual(ids(entries).slice(2))
    expect(ids(v.collapsed[0]!.lines)).toEqual(['m0', 'm1'])
  })

  it('folds every line of weight 0 or 1 even when the year is short, once it has more than 5 lines', () => {
    const entries = [
      line('p1', 'events', 2),
      line('p2', 'wealth', 1),
      line('p3', 'history', 0),
      line('p4', 'events', 2),
      line('p5', 'events', 2),
      line('p6', 'wealth', 1),
    ]
    const v = viewYearLog(entries)
    expect(ids(v.shown)).toEqual(['p1', 'p4', 'p5'])
    expect(v.collapsed.map((c) => [c.k, c.n])).toEqual([
      ['money', 2],
      ['world', 1],
    ])
  })

  it('draws a year of 5 lines or fewer as it is, whatever the weights', () => {
    const entries = [line('q1', 'wealth', 0), line('q2', 'wealth', 1), line('q3', 'history', 0), line('q4', 'events', 3), line('q5', 'crime', 1)]
    expect(entries).toHaveLength(LOG_PLAIN)
    const v = viewYearLog(entries)
    expect(ids(v.shown)).toEqual(ids(entries))
    expect(v.collapsed).toEqual([])
  })

  it('draws a year with no weight on any line as it is, however long (old saves)', () => {
    const old = Array.from({ length: 20 }, (_, i) => line(`o${i}`, i % 2 === 0 ? 'wealth' : undefined, undefined))
    const v = viewYearLog(old)
    expect(ids(v.shown)).toEqual(ids(old))
    expect(v.collapsed).toEqual([])
    const noSource = Array.from({ length: 12 }, (_, i) => line(`z${i}`, undefined, undefined))
    expect(viewYearLog(noSource).collapsed).toEqual([])
  })

  it('treats a line with no weight as 2 once any line has one', () => {
    const entries = [
      line('r1', undefined, undefined),
      line('r2', 'wealth', 1),
      line('r3', undefined, undefined),
      line('r4', 'history', 0),
      line('r5', 'events', undefined),
      line('r6', 'wealth', 1),
    ]
    const v = viewYearLog(entries)
    expect(ids(v.shown)).toEqual(['r1', 'r3', 'r5'])
  })

  it('puts a line with no source, or an unknown one, in Everyday', () => {
    const entries = [
      line('s1', undefined, 1),
      line('s2', 'mystery', 1),
      line('s3', 'wealth', 2),
      line('s4', 'wealth', 2),
      line('s5', 'wealth', 2),
      line('s6', 'wealth', 2),
    ]
    const v = viewYearLog(entries)
    expect(v.collapsed.map((c) => [c.k, c.label, c.n])).toEqual([['life', 'Everyday', 2]])
  })

  it('takes the number of lines to show as a second argument', () => {
    const entries = tycoonYear()
    expect(viewYearLog(entries, 4).shown).toHaveLength(4)
    expect(viewYearLog(entries, 12).shown).toHaveLength(9)
    expect(viewYearLog(entries, 0).shown).toHaveLength(0)
    expect(viewYearLog(entries, -3).shown).toHaveLength(0)
    expect(viewYearLog(entries, Number.NaN).shown).toHaveLength(LOG_VISIBLE)
    expect(viewYearLog(entries, 2.9).shown).toHaveLength(2)
  })

  it('reads hostile fields without throwing and without trusting them', () => {
    const hostile = [
      { id: 'h1', text: 'x', tone: 'neutral', s: 7, w: '3' },
      { id: 'h2', text: 'x', tone: 'neutral', s: { a: 1 }, w: Number.NaN },
      { id: 'h3', text: 'x', tone: 'neutral', s: 'constructor', w: 1 },
      { id: 'h4', text: 'x', tone: 'neutral', s: '__proto__', w: 0 },
      { id: 'h5', text: 'x', tone: 'neutral', w: 99 },
      { id: 'h6', text: 'x', tone: 'neutral', s: 'health', w: 3 },
    ] as unknown as Line[]
    const v = viewYearLog(hostile)
    expect(ids(v.shown)).toEqual(['h1', 'h2', 'h5', 'h6'])
    expect(v.collapsed.map((c) => [c.k, c.n])).toEqual([['life', 2]])
  })

  it('is a pure read: a frozen input, and the same answer twice', () => {
    const entries = deepFreeze(tycoonYear())
    const a = viewYearLog(entries)
    const b = viewYearLog(entries)
    expect(b).toEqual(a)
    expect(a.shown.every((e) => entries.includes(e))).toBe(true)
  })
})

describe('viewYearLog on random years', () => {
  // A tiny seeded generator of its own: this file draws no game random numbers.
  let state = 20260901
  const next = (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 2 ** 32
  }
  const SOURCES = [undefined, 'health', 'business', 'wealth', 'events', 'history', 'crime', 'relationships', 'unknown']

  it('holds for 200 years: at most 8 shown, nothing lost, the lowest weights fold first', () => {
    for (let t = 0; t < 200; t++) {
      const n = Math.floor(next() * 30)
      const weighted = next() < 0.85
      const entries = Array.from({ length: n }, (_, i) =>
        line(`k${t}-${i}`, SOURCES[Math.floor(next() * SOURCES.length)], weighted && next() < 0.9 ? Math.floor(next() * 4) : undefined),
      )
      const v = viewYearLog(deepFreeze(entries.map((e) => ({ ...e }))))
      const folded = v.collapsed.flatMap((c) => c.lines)
      const label = `year ${t} (${n} lines)`
      expect([...ids(v.shown), ...ids(folded)].sort(), label).toEqual(ids(entries).sort())
      const active = n > LOG_PLAIN && entries.some((e) => e.w !== undefined)
      if (!active) {
        expect(ids(v.shown), label).toEqual(ids(entries))
        expect(v.collapsed, label).toEqual([])
        continue
      }
      const order = (e: { id: string }): number => ids(entries).indexOf(e.id)
      expect(v.shown.length, label).toBeLessThanOrEqual(LOG_VISIBLE)
      // every routine line folds, and the room it leaves is filled by the best of the rest
      for (const s of v.shown) expect(lineWeight(s), label).toBeGreaterThanOrEqual(2)
      expect(v.shown.length, label).toBe(Math.min(LOG_VISIBLE, entries.filter((e) => lineWeight(e) >= 2).length))
      // a notable line folds only for lines of a higher weight, or for newer lines of its own weight
      for (const f of folded.filter((e) => lineWeight(e) >= 2)) {
        for (const s of v.shown) {
          expect(lineWeight(s) > lineWeight(f) || (lineWeight(s) === lineWeight(f) && order(s) > order(f)), label).toBe(true)
        }
      }
      const groups = v.collapsed.map((c) => GROUP_ORDER.indexOf(c.k))
      expect(groups, label).toEqual([...groups].sort((x, y) => x - y))
      expect(new Set(groups).size, label).toBe(groups.length)
    }
  })
})

// ---- the markup ----

function logOf(entries: Line[], age = 40): LogYear[] {
  return [{ age, year: 2000 + age, entries: entries as unknown as LogYear['entries'] }]
}

function render(log: readonly LogYear[], expanded: ReadonlySet<string> = new Set(), seen?: number): string {
  const total = log.reduce((n, y) => n + y.entries.length, 0)
  return renderToStaticMarkup(createElement(YearList, { log, expanded, onToggle: () => undefined, seen: seen ?? total }))
}

const count = (html: string, needle: string): number => html.split(needle).length - 1
const ENTRY = /<p class="lifelog-entry /g
const entryCount = (html: string): number => (html.match(ENTRY) ?? []).length

describe('YearList with a tycoon year', () => {
  const html = render(logOf(tycoonYear()))
  const beforeFolds = html.slice(0, html.indexOf('<details'))

  it('draws 8 lines, then one closed row per category', () => {
    expect(entryCount(beforeFolds)).toBe(8)
    expect(entryCount(html)).toBe(13)
    expect(count(html, '<details')).toBe(2)
    expect(count(html, '</details>')).toBe(2)
    expect(html).not.toMatch(/<details[^>]* open/)
  })

  it('names each row with its category and its count, as text in the summary', () => {
    const rows = [...html.matchAll(/<summary[^>]*>(.*?)<\/summary>/g)].map((m) => m[1]!)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toContain('Your companies')
    expect(rows[0]).toContain('2 lines')
    expect(rows[1]).toContain('Money')
    expect(rows[1]).toContain('3 lines')
    for (const r of rows) expect(r.replace(/<[^>]*>/g, '')).toMatch(/\d+ lines?$/)
  })

  it('uses native details and summary, which the keyboard opens with no script, and hides no summary from it', () => {
    expect(count(html, '<summary')).toBe(2)
    expect(html).not.toMatch(/<summary[^>]*(tabindex|aria-hidden|role=)/)
    expect(html).not.toContain('aria-controls')
  })

  it('draws the folded lines inside their category, with their tone', () => {
    const folded = html.slice(html.indexOf('<details'))
    expect(folded).toContain('Line a01')
    expect(folded).toContain('Line a03')
    expect(entryCount(folded)).toBe(5)
    expect(folded).toMatch(/<p class="lifelog-entry lifelog-folded tone-good">Line a01<\/p>/)
  })

  it('draws the lines shown in the log order, before the rows', () => {
    const shown = [...beforeFolds.matchAll(/<p class="lifelog-entry [^"]*">Line (a\d+)<\/p>/g)].map((m) => m[1])
    expect(shown).toEqual(ids(viewYearLog(tycoonYear()).shown))
  })

})

describe('YearList and the years that are drawn as before', () => {
  /** What the list drew before the fold: one paragraph per line. */
  function legacy(entries: Line[]): string {
    return entries.map((e) => `<p class="lifelog-entry tone-${e.tone}">${e.text}</p>`).join('')
  }
  const body = (html: string): string => html.slice(html.indexOf('</h3>') + '</h3>'.length, html.indexOf('</section>'))

  it('a year of 13 lines with no weight (an old save) draws every line, no row', () => {
    const old = Array.from({ length: 13 }, (_, i) => line(`old${i}`, undefined, undefined, i % 3 === 0 ? 'good' : 'neutral'))
    const html = render(logOf(old))
    expect(body(html)).toBe(legacy(old))
    expect(html).not.toContain('<details')
  })

  it('a year with sources but no weights draws every line as before', () => {
    const noW = tycoonYear().map((e) => line(e.id, e.s, undefined, e.tone))
    const html = render(logOf(noW))
    expect(body(html)).toBe(legacy(noW))
  })

  it('a year of 5 lines or fewer draws every line as before, weights or not', () => {
    const few = [line('f1', 'wealth', 0), line('f2', 'history', 1), line('f3', 'events', 3), line('f4', 'wealth', 0), line('f5', 'crime', 1)]
    const html = render(logOf(few))
    expect(body(html)).toBe(legacy(few))
  })

  it('a year with more than 5 lines and nothing to fold draws every line as before', () => {
    const six = Array.from({ length: 6 }, (_, i) => line(`g${i}`, 'events', 2))
    expect(body(render(logOf(six)))).toBe(legacy(six))
  })

  it('an older year that is folded draws no lines, and its row still says how many lines it has', () => {
    const log: LogYear[] = [
      ...logOf(tycoonYear(), 20),
      ...logOf([line('x1', 'events', 2)], 21),
      ...logOf([line('x2', 'events', 2)], 22),
      ...logOf([line('x3', 'events', 2)], 23),
    ]
    const html = render(log)
    expect(html).toContain('13 lines')
    expect(html).not.toContain('<details')
    expect(entryCount(html)).toBe(3)
  })

  it('an older year the player opened gets the same view', () => {
    const log: LogYear[] = [
      ...logOf(tycoonYear(), 20),
      ...logOf([line('x1', 'events', 2)], 21),
      ...logOf([line('x2', 'events', 2)], 22),
      ...logOf([line('x3', 'events', 2)], 23),
    ]
    const html = render(log, new Set([yearKey(log[0]!)]))
    expect(count(html, '<details')).toBe(2)
    expect(entryCount(html)).toBe(13 + 3)
  })
})

describe('YearList and the lines that just arrived', () => {
  it('animates a new line that is shown, and not one that is folded', () => {
    const entries = tycoonYear()
    // the last two lines are new: a12 (weight 2) is shown, a13 is shown too (the newest of the equal lines stays)
    const html = render(logOf(entries), new Set(), 11)
    expect(count(html, 'is-new')).toBe(2)
    expect(html).toMatch(/<p class="lifelog-entry tone-bad is-new">Line a12<\/p>/)
    // a fresh line that folds (a routine one) draws no animation
    const folded = [...entries.slice(0, 12), line('a14', 'wealth', 1)]
    const html2 = render(logOf(folded), new Set(), 13 - 1)
    expect(html2).toContain('Line a14')
    expect(count(html2, 'is-new')).toBe(0)
  })

  it('counts a new line by its place in the whole log, so a fold before it does not move the animation', () => {
    const entries = tycoonYear()
    const html = render(logOf(entries), new Set(), 12)
    const fresh = [...html.matchAll(/<p class="lifelog-entry [^"]*is-new">([^<]*)<\/p>/g)].map((m) => m[1])
    expect(fresh).toEqual(['Line a13'])
  })
})

describe('YearList and hostile text in a folded line', () => {
  it('escapes it, whole', () => {
    const long = 'b'.repeat(3000)
    const entries = tycoonYear()
    entries[2] = { ...entries[2]!, text: `<script>alert(1)</script>${long}` }
    const html = render(logOf(entries))
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).toContain(long)
  })

  it('a junk tone on a folded line is a plain line', () => {
    const entries = tycoonYear()
    entries[2] = { ...entries[2]!, tone: 'ai' }
    expect(render(logOf(entries))).toContain('<p class="lifelog-entry lifelog-folded tone-neutral">Line a03</p>')
  })
})

describe('the words on the rows', () => {
  it('pass the voice rules for a label and carry no dash', () => {
    for (const k of GROUP_ORDER) {
      for (const n of [1, 2, 9, 40]) {
        const t = `${GROUP_LABEL[k]} ${n} ${n === 1 ? 'line' : 'lines'}`
        expect(unitFlags(t, 'tooltip'), t).toEqual([])
        expect(t).not.toMatch(DASH)
      }
    }
  })

  it('say 1 line for one', () => {
    const entries = [
      line('w1', 'health', 1),
      line('w2', 'events', 2),
      line('w3', 'events', 2),
      line('w4', 'events', 2),
      line('w5', 'events', 2),
      line('w6', 'events', 2),
    ]
    const html = render(logOf(entries))
    expect(html).toMatch(/<summary[^>]*><span class="lifelog-fold-label">Health<\/span> <span class="lifelog-fold-count">1 line<\/span><\/summary>/)
  })
})

describe('the stylesheet and the files', () => {
  const css = src('src/ui/styles/notices.css')

  function block(selector: string): string {
    const at = css.indexOf(`${selector} {`)
    expect(at, selector).toBeGreaterThan(-1)
    return css.slice(at, css.indexOf('}', at))
  }

  it('has a row at least as tall as a touch target, and a folded line set apart by a hairline', () => {
    expect(block('.lifelog-fold > summary')).toMatch(/min-height:\s*var\(--target\)/)
    expect(block('.lifelog-entry.lifelog-folded')).toMatch(/border-left:\s*3px solid var\(--hairline\)/)
  })

  it('the rows use tokens only, so they follow light and dark mode', () => {
    const start = css.indexOf('/* Life log groups')
    expect(start).toBeGreaterThan(-1)
    const end = css.indexOf('/* Inbox sheet')
    const rules = css.slice(start, end > start ? end : undefined)
    expect(rules).toContain('.lifelog-fold')
    expect(rules).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(rules).not.toMatch(/\b(?:rgb|rgba|hsl|hsla)\(/)
  })

  it('logModel.ts is a leaf of the ui lane: it reads the year card model and nothing of the game', () => {
    const text = src('src/ui/components/logModel.ts')
    const imports = [...text.matchAll(/from '([^']+)'/g)].map((m) => m[1])
    expect(imports).toEqual(['./yearCardModel'])
  })

  it('the model, the list, the stylesheet and this test carry no en or em dash', () => {
    for (const path of ['src/ui/components/logModel.ts', 'src/ui/components/LifeLog.tsx', 'src/ui/styles/notices.css', 'test/log-view.test.ts']) {
      expect(src(path), path).not.toMatch(DASH)
    }
  })
})
