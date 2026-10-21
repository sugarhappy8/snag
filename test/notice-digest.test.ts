// R1-T4 (G.11 step 1): the notice digest card. A run of plain notices at the head of the queue is drawn as one
// card with one OK (ModalHost, behind FLAGS.noticeDigest). The model (noticeModel.ts) is pure; the card and the
// store's dismissNotices are tested with the real store, the way store.test.ts does, with a localStorage shim.
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { unitFlags } from '../scripts/voice/rules.mjs'
import { resetFlags, withFlags } from '../src/game/flags'
import type { ChoiceModal, GameState, ModalItem, NoticeModal, Tone } from '../src/game/types'
import {
  DIGEST_MAX,
  DIGEST_MIN,
  digestRows,
  digestTitle,
  digestTone,
  headNoticeRun,
  mergeable,
  planHead,
} from '../src/ui/components/noticeModel'
import { deepFreeze } from './fuzz-kit'

// Minimal in-memory localStorage, installed before the store loads its settings.
vi.hoisted(() => {
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
})

const store = await import('../src/ui/store')
const { DigestCard, ModalHost, NoticeCard } = await import('../src/ui/components/ModalHost')

function N(id: string, extra: Partial<NoticeModal> = {}): NoticeModal {
  return { kind: 'notice', id, title: `Title ${id}`, text: `Text of ${id}.`, ...extra }
}

function Nsupport(id: string): NoticeModal {
  return N(id, { support: true })
}

function C(id: string): ChoiceModal {
  return { kind: 'choice', id, title: `Pick ${id}`, text: 'Which one?', choices: [{ id: 'a', label: 'First' }, { id: 'b', label: 'Second' }], source: 'script', scriptId: 'none' }
}

function T(id: string): ModalItem {
  return { kind: 'aiTask', id, task: { type: 'yearEvents' } }
}

function ids(items: readonly { id: string }[]): string[] {
  return items.map((m) => m.id)
}

function game(): GameState {
  return store.getApp().game as GameState
}

function setQueue(items: ModalItem[]): void {
  store.act((g) => {
    g.queue = items
  })
}

function numbered(count: number): NoticeModal[] {
  return Array.from({ length: count }, (_, i) => N(`n${i + 1}`))
}

beforeEach(() => {
  store.startNewLife({ seed: 3, year: 2026 })
  setQueue([])
})

afterEach(() => {
  resetFlags()
})

describe('the run at the head of the queue', () => {
  it('constants are 2 and 8', () => {
    expect(DIGEST_MIN).toBe(2)
    expect(DIGEST_MAX).toBe(8)
  })

  it('mergeable is true for a plain notice only', () => {
    expect(mergeable(N('a'))).toBe(true)
    expect(mergeable(N('a', { tone: 'bad', weight: 'minor' }))).toBe(true)
    expect(mergeable(Nsupport('a'))).toBe(false)
    expect(mergeable(N('a', { support: false }))).toBe(true)
    expect(mergeable(C('c'))).toBe(false)
    expect(mergeable(T('t'))).toBe(false)
  })

  // [queue, run ids headNoticeRun gives, plan kind planHead gives with the flag on]
  const TABLE: [name: string, queue: ModalItem[], run: string[], kind: 'digest' | 'single' | 'none'][] = [
    ['empty', [], [], 'none'],
    ['one notice', [N('a')], [], 'single'],
    ['two notices', [N('a'), N('b')], ['a', 'b'], 'digest'],
    ['two notices then a choice', [N('a'), N('b'), C('c')], ['a', 'b'], 'digest'],
    ['a choice then two notices', [C('c'), N('a'), N('b')], [], 'single'],
    ['notice, choice, notice', [N('a'), C('c'), N('b')], [], 'single'],
    ['notice, task, notice', [N('a'), T('t'), N('b')], [], 'single'],
    ['support notice first', [Nsupport('s'), N('a'), N('b')], [], 'single'],
    ['support notice last', [N('a'), N('b'), Nsupport('s')], ['a', 'b'], 'digest'],
    ['support notice in the middle', [N('a'), Nsupport('s'), N('b')], [], 'single'],
    ['a task at the head', [T('t'), N('a'), N('b')], [], 'none'],
    ['only a choice', [C('c')], [], 'single'],
  ]
  for (const [name, queue, run, kind] of TABLE) {
    it(`${name}: run [${run.join(',')}], plan ${kind}`, () => {
      expect(ids(headNoticeRun(queue))).toEqual(run)
      const plan = planHead(queue, true)
      expect(plan.kind).toBe(kind)
      if (plan.kind === 'digest') expect(ids(plan.items)).toEqual(run)
      if (plan.kind === 'single') expect(plan.modal).toBe(queue[0])
    })
  }

  it('ten notices: the first 8, then the next call on the rest gives the last 2', () => {
    const queue = numbered(10)
    const first = headNoticeRun(queue)
    expect(ids(first)).toEqual(ids(queue.slice(0, 8)))
    const rest = queue.slice(first.length)
    expect(ids(headNoticeRun(rest))).toEqual(['n9', 'n10'])
    const plan = planHead(queue, true)
    expect(plan.kind === 'digest' ? plan.items.length : -1).toBe(8)
  })

  it('nine notices: a digest of 8, then the ninth is a single notice', () => {
    const queue = numbered(9)
    expect(headNoticeRun(queue)).toHaveLength(8)
    expect(planHead(queue.slice(8), true)).toEqual({ kind: 'single', modal: queue[8] })
  })

  it('the flag off: a run is a single notice, never a digest, and headNoticeRun is empty', () => {
    const queue = [N('a'), N('b'), N('c')]
    expect(headNoticeRun(queue, false)).toEqual([])
    expect(planHead(queue, false)).toEqual({ kind: 'single', modal: queue[0] })
    // An aiTask head and an empty queue are 'none' whatever the flag says.
    expect(planHead([T('t'), N('a')], false).kind).toBe('none')
    expect(planHead([], false).kind).toBe('none')
  })

  it('a choice, input or minigame head is never inside or ahead of a card', () => {
    const input: ModalItem = { kind: 'input', id: 'i', title: 'Name', text: 'Name it.', input: 'text', scriptId: 'none' }
    const mini: ModalItem = { kind: 'minigame', id: 'm', game: 'slots', title: 'Slots', scriptId: 'none', data: {} }
    for (const head of [C('c'), input, mini]) {
      const queue = [head, N('a'), N('b'), N('c')]
      expect(headNoticeRun(queue)).toEqual([])
      expect(planHead(queue, true)).toEqual({ kind: 'single', modal: head })
    }
  })
})

describe('the queue is never touched (D.11 criterion 8)', () => {
  it('planHead, headNoticeRun, digestRows and digestTone survive a deep freeze and change nothing', () => {
    const queue: ModalItem[] = [N('a', { tone: 'bad', emoji: '💥' }), N('b', { tone: 'good' }), N('c'), N('d', { tone: 'event' }), C('x'), T('t'), N('e')]
    const before = JSON.stringify(queue)
    deepFreeze(queue)
    expect(() => {
      const plan = planHead(queue, true)
      const run = headNoticeRun(queue)
      digestRows(run)
      digestTone(run)
      digestTitle(run.length)
      if (plan.kind === 'digest') digestRows(plan.items)
      planHead(queue.slice(4), true)
      planHead(queue.slice(5), false)
    }).not.toThrow()
    expect(JSON.stringify(queue)).toBe(before)
  })

  it('rendering ModalHost with a digest does not write the queue', () => {
    withFlags({ noticeDigest: true }, () => {
      setQueue([N('a'), N('b'), N('c'), C('x')])
      const queue = game().queue
      const before = JSON.stringify(queue)
      deepFreeze(queue)
      expect(() => renderToStaticMarkup(createElement(ModalHost))).not.toThrow()
      expect(JSON.stringify(game().queue)).toBe(before)
      expect(game().queue).toBe(queue)
    })
  })
})

describe('digestTone, digestTitle and digestRows', () => {
  const tones = (...list: (Tone | undefined)[]): NoticeModal[] => list.map((tone, i) => N(`t${i}`, tone ? { tone } : {}))

  it('digestTone: any bad is bad, all good is good, anything else is undefined', () => {
    expect(digestTone(tones('good', 'bad', 'good'))).toBe('bad')
    expect(digestTone(tones('neutral', 'bad'))).toBe('bad')
    expect(digestTone(tones('good', 'good'))).toBe('good')
    expect(digestTone(tones('good', 'neutral'))).toBeUndefined()
    expect(digestTone(tones('good', undefined))).toBeUndefined()
    expect(digestTone(tones('event', 'event'))).toBeUndefined()
    expect(digestTone(tones('event', 'good'))).toBeUndefined()
    expect(digestTone([])).toBeUndefined()
  })

  it('digestTitle is the count and "updates"', () => {
    expect(digestTitle(2)).toBe('2 updates')
    expect(digestTitle(8)).toBe('8 updates')
  })

  it('digestRows keeps the order, the full text, the emoji and the tone', () => {
    const rows = digestRows([
      N('a', { tone: 'good', title: 'A long title that is never cut', text: 'A long text. '.repeat(30).trim() }),
      N('b', { tone: 'bad' }),
      N('c', { tone: 'event' }),
      N('d', { tone: 'neutral' }),
      N('e'),
      N('f', { tone: 'bad', emoji: '🔥' }),
    ])
    expect(rows.map((r) => r.id)).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
    expect(rows.map((r) => r.emoji)).toEqual(['😄', '😟', '📣', '', '', '🔥'])
    expect(rows.map((r) => r.tone)).toEqual(['good', 'bad', 'event', 'neutral', 'neutral', 'bad'])
    expect(rows[0].title).toBe('A long title that is never cut')
    expect(rows[0].text).toBe('A long text. '.repeat(30).trim())
  })

  it('digestRows carries the tone in a glyph and in words, even for a notice with an emoji of its own', () => {
    const rows = digestRows([
      N('a', { tone: 'good' }),
      N('b', { tone: 'bad', emoji: '💸' }),
      N('c', { tone: 'good', emoji: '🎓' }),
      N('d', { tone: 'event', emoji: '🎉' }),
      N('e', { tone: 'neutral', emoji: '🎓' }),
      N('f', { emoji: '🎓' }),
      N('g', { tone: 'bad' }),
      N('h', { tone: 'good', emoji: '😄' }),
    ])
    // A glyph shows only when the row emoji is something else: with the tone emoji already in the slot it would repeat.
    expect(rows.map((r) => r.mark)).toEqual(['', '😟', '😄', '📣', '', '', '', ''])
    expect(rows.map((r) => r.toneLabel)).toEqual(['Good news', 'Bad news', 'Good news', 'Event', '', '', 'Bad news', 'Good news'])
    // A row never loses its own emoji to the mark.
    expect(rows.map((r) => r.emoji)).toEqual(['😄', '💸', '🎓', '🎉', '🎓', '🎓', '😟', '😄'])
  })

  it('the tone words pass the voice rules and have no dash', () => {
    for (const row of digestRows([N('a', { tone: 'good' }), N('b', { tone: 'bad' }), N('c', { tone: 'event' })])) {
      expect(unitFlags(row.toneLabel, 'tooltip'), row.toneLabel).toEqual([])
      expect(row.toneLabel).not.toMatch(/[\u2013\u2014]/)
    }
  })
})

describe('DigestCard', () => {
  const render = (items: readonly NoticeModal[]): string => renderToStaticMarkup(createElement(DigestCard, { items }))
  const count = (html: string, needle: string): number => html.split(needle).length - 1

  it('draws the rows in queue order under one title with exactly one OK', () => {
    const items = [N('a', { tone: 'good', title: 'First one' }), N('b', { title: 'Second one' }), N('c', { tone: 'event', title: 'Third one' })]
    const html = render(items)
    expect(html).toContain('<h2 class="popup-title">3 updates</h2>')
    expect(count(html, 'class="digest-list"')).toBe(1)
    expect(count(html, 'digest-item')).toBe(3)
    expect(html.indexOf('First one')).toBeLessThan(html.indexOf('Second one'))
    expect(html.indexOf('Second one')).toBeLessThan(html.indexOf('Third one'))
    expect(count(html, '>OK</button>')).toBe(1)
    expect(count(html, '<button')).toBe(1)
    expect(html).toContain('btn btn-primary btn-block')
    expect(html).toContain('class="digest-item tone-good"')
    expect(html).toContain('class="digest-item tone-neutral"')
    expect(html).toContain('class="digest-item tone-event"')
    expect(html).toContain('<strong class="digest-title">First one</strong>')
    expect(html).toContain('<span class="digest-text">Text of a.</span>')
    // The emoji is decoration (the tone is also in the row emoji, never colour alone).
    expect(html).toContain('<span class="digest-emoji" aria-hidden="true">😄</span>')
    expect(html).toContain('📣')
  })

  it('says the tone of a row in more than its border colour, whatever emoji the notice brings', () => {
    const html = render([
      N('a', { tone: 'bad', emoji: '💸', title: 'Debt Collectors' }),
      N('b', { tone: 'good', emoji: '👶', title: 'Baby Brother!' }),
      N('c', { emoji: '🎓', title: 'Graduation' }),
    ])
    const rowOf = (title: string): string => html.split('<li ').find((chunk) => chunk.includes(`>${title}<`)) ?? ''
    const bad = rowOf('Debt Collectors')
    expect(bad).toContain('<span class="sr-only">Bad news: </span>')
    expect(bad).toContain('<span class="digest-mark" aria-hidden="true">😟</span>')
    expect(bad).toContain('<span class="digest-emoji" aria-hidden="true">💸</span>')
    const good = rowOf('Baby Brother!')
    expect(good).toContain('<span class="sr-only">Good news: </span>')
    expect(good).toContain('<span class="digest-mark" aria-hidden="true">😄</span>')
    expect(good).toContain('<span class="digest-emoji" aria-hidden="true">👶</span>')
    // A neutral row has nothing to add.
    const plain = rowOf('Graduation')
    expect(plain).not.toContain('sr-only')
    expect(plain).not.toContain('digest-mark')
  })

  it('does not repeat the tone emoji when it is already the row emoji', () => {
    const html = render([N('a', { tone: 'bad', title: 'Rough day' }), N('b', { tone: 'good', title: 'Good day' })])
    expect(count(html, 'digest-mark')).toBe(0)
    expect(html).toContain('<span class="sr-only">Bad news: </span>')
    expect(html).toContain('<span class="sr-only">Good news: </span>')
  })

  it('tone-bad when any item is bad, tone-good when all are good, plain otherwise', () => {
    const bad = render([N('a', { tone: 'good' }), N('b', { tone: 'bad' })])
    expect(bad).toMatch(/class="popup [^"]*tone-bad/)
    expect(bad).toContain('😟')
    expect(bad).not.toMatch(/class="popup [^"]*tone-good/)

    const good = render([N('a', { tone: 'good' }), N('b', { tone: 'good' })])
    expect(good).toMatch(/class="popup [^"]*tone-good/)
    expect(good).toContain('📋')
    expect(good).not.toMatch(/class="popup [^"]*tone-bad/)

    const mixed = render([N('a', { tone: 'good' }), N('b')])
    expect(mixed).not.toMatch(/class="popup [^"]*tone-(good|bad)/)
    expect(mixed).toContain('📋')
    expect(mixed).not.toContain('😟')
  })

  it('escapes hostile text', () => {
    const html = render([N('a', { title: '<img src=x onerror=alert(1)>', text: '<script>alert(1)</script>' }), N('b')])
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<script')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })

  it('never shows the support line', () => {
    const html = render([N('a'), N('b')])
    expect(html).not.toContain('popup-support')
    expect(html).not.toContain('struggling')
  })

  it('8 rows render 8 digest-item rows', () => {
    const html = render(numbered(8))
    expect(count(html, '<li class="digest-item')).toBe(8)
    expect(html).toContain('8 updates')
  })

  it('is labelled as a dialog by its title', () => {
    expect(render(numbered(2))).toContain('aria-label="2 updates"')
  })
})

describe('ModalHost with the digest', () => {
  const host = (): string => renderToStaticMarkup(createElement(ModalHost))

  it('draws a digest for a run of notices when noticeDigest is on', () => {
    withFlags({ noticeDigest: true }, () => {
      setQueue([N('a', { title: 'Alpha' }), N('b', { title: 'Beta' }), N('c', { title: 'Gamma' })])
      const html = host()
      expect(html).toContain('3 updates')
      expect(html).toContain('Alpha')
      expect(html).toContain('Gamma')
    })
  })

  it('draws today\'s single notice card with the flag off, for the same queue', () => {
    // Pinned off, so the case means the same thing before and after the release commit flips the default.
    withFlags({ noticeDigest: false }, () => {
      setQueue([N('a', { title: 'Alpha' }), N('b', { title: 'Beta' })])
      const html = host()
      expect(html).not.toContain('digest-list')
      expect(html).toContain(renderToStaticMarkup(createElement(NoticeCard, { modal: N('a', { title: 'Alpha' }) })))
      expect(html).not.toContain('Beta')
    })
  })

  it('a lone notice, a choice head and an empty queue are drawn as today with the flag on', () => {
    withFlags({ noticeDigest: true }, () => {
      setQueue([N('a', { title: 'Alpha' })])
      expect(host()).not.toContain('digest-list')
      expect(host()).toContain('Alpha')

      setQueue([C('c'), N('a'), N('b')])
      const html = host()
      expect(html).not.toContain('digest-list')
      expect(html).toContain('Pick c')

      setQueue([])
      expect(host()).toBe('')
    })
  })

  it('a support notice keeps its own card with the help line', () => {
    withFlags({ noticeDigest: true }, () => {
      setQueue([Nsupport('s'), N('a'), N('b')])
      const html = host()
      expect(html).not.toContain('digest-list')
      expect(html).toContain('popup-support')
    })
  })
})

describe('dismissNotices', () => {
  it('removes the run in one act and leaves the choice', () => {
    const [n1, n2, n3] = [N('n1'), N('n2'), N('n3')]
    setQueue([n1, n2, n3, C('c')])
    const before = game()
    store.dismissNotices([n1, n2, n3].map((m) => m.id))
    const after = game()
    expect(ids(after.queue)).toEqual(['c'])
    expect(after).not.toBe(before)
  })

  it('ignores a choice id, an unknown id and an empty list', () => {
    setQueue([N('n1'), N('n2'), C('c')])
    const before = game()
    store.dismissNotices(['c'])
    expect(game()).toBe(before)
    store.dismissNotices(['nope'])
    expect(game()).toBe(before)
    store.dismissNotices([])
    expect(game()).toBe(before)
    expect(ids(game().queue)).toEqual(['n1', 'n2', 'c'])
    // A real id next to an unknown one and a choice id removes only the notice.
    store.dismissNotices(['n1', 'nope', 'c'])
    expect(ids(game().queue)).toEqual(['n2', 'c'])
  })

  it('a second call changes nothing and keeps the same state object', () => {
    setQueue([N('n1'), N('n2'), N('n3'), C('c')])
    store.dismissNotices(['n1', 'n2', 'n3'])
    const once = game()
    store.dismissNotices(['n1', 'n2', 'n3'])
    expect(game()).toBe(once)
    expect(ids(once.queue)).toEqual(['c'])
  })

  it('is one state change and one save for the whole card', () => {
    setQueue([N('n1'), N('n2'), N('n3'), N('n4'), C('c')])
    const writes = vi.spyOn(localStorage, 'setItem')
    store.act(() => {})
    const perAct = writes.mock.calls.length
    expect(perAct).toBeGreaterThan(0)
    writes.mockClear()
    store.dismissNotices(['n1', 'n2', 'n3', 'n4'])
    expect(writes.mock.calls.length).toBe(perAct)
    writes.mockRestore()
  })

  it('does not run a notice handler: it is not the same as dismissNotice', () => {
    setQueue([N('n1'), N('n2'), C('c')])
    store.dismissNotice('n1')
    expect(ids(game().queue)).toEqual(['n2', 'c'])
    store.dismissNotices(['n2'])
    expect(ids(game().queue)).toEqual(['c'])
  })
})

describe('voice and styles', () => {
  it('digestTitle(n) for 2 to 8 passes the tooltip rules with no flag and has no dash', () => {
    for (let n = DIGEST_MIN; n <= DIGEST_MAX; n++) {
      const text = digestTitle(n)
      expect(unitFlags(text, 'tooltip'), text).toEqual([])
      expect(text).not.toMatch(/[\u2013\u2014]/)
    }
  })

  it('notices.css has the digest rules, and the new files carry no en or em dash', () => {
    const css = readFileSync(new URL('../src/ui/styles/notices.css', import.meta.url), 'utf8')
    for (const rule of ['.digest-list', '.digest-item', '.digest-title', '.digest-text', '.digest-mark']) expect(css, rule).toContain(rule)
    for (const tone of ['good', 'bad', 'event']) expect(css, tone).toMatch(new RegExp(`\\.digest-item\\.tone-${tone}`))
    expect(css).not.toMatch(/[\u2013\u2014]/)
    const model = readFileSync(new URL('../src/ui/components/noticeModel.ts', import.meta.url), 'utf8')
    expect(model).not.toMatch(/[\u2013\u2014]/)
  })
})
