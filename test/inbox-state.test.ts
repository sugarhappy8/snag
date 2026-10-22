// R1-T5 (G.11 step 2): the inbox state (g.flags.inbox) and the plumbing that feeds it. Everything that reads is pure and
// repairs what it reads; everything that writes sanitizes first, so a hostile saved inbox is repaired the first time it
// is written. The queue helper moves routable notices without a draw from the generator or a new id.
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { notice } from '../src/game/core'
import {
  INBOX_LINK_MAX,
  INBOX_MAX,
  INBOX_TEXT_MAX,
  clipInboxText,
  emptyInbox,
  inboxItemOf,
  inboxUnread,
  markSeen,
  pushInbox,
  readInbox,
  routeMinorNotices,
  type InboxItem,
} from '../src/game/inbox'
import { MINOR_NOTICE_TITLES, noticeWeightFor } from '../src/game/notice-weights'
import { SAVE_SCHEMA, migrateSave } from '../src/game/save-schema'
import type { ChoiceModal, GameState, InputModal, ModalItem, NoticeModal } from '../src/game/types'
import { deepFreeze } from './fuzz-kit'
import { makeTestGame } from './helpers'

const fixture = JSON.parse(gunzipSync(readFileSync('test/fixtures/save-v1.json.gz')).toString()) as Record<string, unknown>

const LINK_RE = /^[a-z]+(?:\/[A-Za-z0-9._:-]{1,40}){0,6}$/

function item(n: number, extra: Partial<InboxItem> = {}): InboxItem {
  return { id: `i${n}`, y: 2026, a: 30, t: `Item ${n}: something small happened.`, ...extra }
}

function items(count: number, from = 1): InboxItem[] {
  return Array.from({ length: count }, (_, i) => item(from + i))
}

function minor(id: string, extra: Partial<NoticeModal> = {}): NoticeModal {
  return { kind: 'notice', id, title: `Minor ${id}`, text: `Text of ${id}.`, weight: 'minor', ...extra }
}

function choice(id: string, extra: Record<string, unknown> = {}): ChoiceModal {
  return { kind: 'choice', id, title: 'Pick', text: 'Which?', choices: [{ id: 'a', label: 'A' }], source: 'script', scriptId: 's', ...extra } as ChoiceModal
}

function game(): GameState {
  return makeTestGame(7, { age: 30 })
}

/** Count every value in a JSON tree the way the save budget does: each object, array and leaf is a node. */
function nodes(v: unknown): number {
  if (v === null || typeof v !== 'object') return 1
  return 1 + Object.values(v as object).reduce((n: number, x) => n + nodes(x), 0)
}

/** Everything readInbox promises about its result, as a list of problems (empty when it is valid). */
function problems(s: unknown): string[] {
  const bad: string[] = []
  const r = s as { v?: unknown; total?: unknown; seen?: unknown; items?: unknown }
  if (r.v !== 1) bad.push('v')
  const isInt = (x: unknown, lo: number, hi: number) => typeof x === 'number' && Number.isInteger(x) && x >= lo && x <= hi
  if (!isInt(r.total, 0, 1e9)) bad.push('total')
  if (!isInt(r.seen, 0, 1e9)) bad.push('seen')
  if (!Array.isArray(r.items)) return [...bad, 'items']
  if (r.items.length > INBOX_MAX) bad.push('too many items')
  if (typeof r.total === 'number' && typeof r.seen === 'number' && r.seen > r.total) bad.push('seen > total')
  if (typeof r.total === 'number' && r.total < r.items.length) bad.push('total < items')
  const ids = new Set<string>()
  for (const raw of r.items as Record<string, unknown>[]) {
    if (typeof raw.id !== 'string' || raw.id.length < 1 || raw.id.length > 24) bad.push('id')
    else if (ids.has(raw.id)) bad.push('duplicate id')
    else ids.add(raw.id)
    if (!isInt(raw.y, 1000, 100000)) bad.push('y')
    if (!isInt(raw.a, 0, 10000)) bad.push('a')
    if (typeof raw.t !== 'string' || raw.t.length > INBOX_TEXT_MAX || raw.t !== raw.t.trim() || raw.t === '') bad.push('t')
    if ('k' in raw && !['good', 'neutral', 'event'].includes(raw.k as string)) bad.push('k')
    if ('l' in raw && (typeof raw.l !== 'string' || raw.l.length > INBOX_LINK_MAX || !LINK_RE.test(raw.l))) bad.push('l')
  }
  return bad
}

describe('constants', () => {
  it('holds the agreed caps', () => {
    expect(INBOX_MAX).toBe(60)
    expect(INBOX_TEXT_MAX).toBe(160)
    expect(INBOX_LINK_MAX).toBe(80)
  })
})

describe('readInbox and inboxUnread', () => {
  it('reads an empty inbox from a game that never had one, and writes nothing', () => {
    const g = game()
    expect(readInbox(g)).toEqual({ v: 1, total: 0, seen: 0, items: [] })
    expect(inboxUnread(g)).toBe(0)
    expect('inbox' in g.flags).toBe(false)
  })

  it('counts no unread for a missing game', () => {
    expect(inboxUnread(null)).toBe(0)
    expect(inboxUnread(undefined)).toBe(0)
  })

  it('round trips through JSON', () => {
    const g = game()
    pushInbox(g, [item(1, { k: 'good', l: 'assets/home/mortgage' }), item(2, { k: 'event' }), item(3)])
    const back = JSON.parse(JSON.stringify(g.flags)) as GameState['flags']
    const again = { ...g, flags: back } as GameState
    expect(readInbox(again)).toEqual(readInbox(g))
    expect(readInbox(g).items.map((i) => i.id)).toEqual(['i1', 'i2', 'i3'])
    expect(readInbox(g).items[0]).toEqual(item(1, { k: 'good', l: 'assets/home/mortgage' }))
    expect(inboxUnread(g)).toBe(3)
  })

  it('returns a copy: changing the result does not touch the game', () => {
    const g = game()
    pushInbox(g, items(2))
    const read = readInbox(g)
    read.items.pop()
    read.items[0]!.t = 'changed'
    read.total = 99
    expect(readInbox(g).items).toHaveLength(2)
    expect(readInbox(g).items[0]!.t).toBe(item(1).t)
    expect(readInbox(g).total).toBe(2)
  })

  it('survives deepFreeze: the readers do not write', () => {
    const g = game()
    pushInbox(g, items(3))
    g.flags.inbox = { v: 1, total: 'x', seen: 9e99, items: [{ id: 5 }, { id: 'ok', y: 2000, a: 3, t: ' hi ' }] }
    deepFreeze(g)
    expect(() => readInbox(g)).not.toThrow()
    expect(() => inboxUnread(g)).not.toThrow()
    expect(() => inboxItemOf(g, minor('n1'))).not.toThrow()
    expect(() => clipInboxText('T', 'x')).not.toThrow()
    expect(readInbox(g).items.map((i) => i.t)).toEqual(['hi'])
  })
})

describe('pushInbox', () => {
  it('caps at 60, keeps the newest, and total keeps counting', () => {
    const g = game()
    pushInbox(g, items(40, 1))
    pushInbox(g, items(35, 41))
    const s = readInbox(g)
    expect(s.items).toHaveLength(INBOX_MAX)
    expect(s.items[0]!.id).toBe('i16')
    expect(s.items.at(-1)!.id).toBe('i75')
    expect(s.total).toBe(75)
    expect(s.seen).toBe(0)
    expect(inboxUnread(g)).toBe(INBOX_MAX)
    expect(problems(g.flags.inbox)).toEqual([])
  })

  it('caps a single batch bigger than the cap too', () => {
    const g = game()
    pushInbox(g, items(100))
    const s = readInbox(g)
    expect(s.items.map((i) => i.id)).toEqual(items(100).slice(-60).map((i) => i.id))
    expect(s.total).toBe(100)
  })

  it('dedupes by id, in the batch and against what is there, and counts only what it added', () => {
    const g = game()
    pushInbox(g, [item(1), item(2), item(1)])
    expect(readInbox(g).total).toBe(2)
    pushInbox(g, [item(2), item(3)])
    const s = readInbox(g)
    expect(s.items.map((i) => i.id)).toEqual(['i1', 'i2', 'i3'])
    expect(s.total).toBe(3)
  })

  it('does nothing and writes nothing for an empty batch', () => {
    const g = game()
    pushInbox(g, [])
    expect('inbox' in g.flags).toBe(false)
  })

  it('drops an item that is not valid', () => {
    const g = game()
    const bad = [
      { ...item(1), id: '' },
      { ...item(2), id: 'x'.repeat(25) },
      { ...item(3), y: 999 },
      { ...item(4), y: 100001 },
      { ...item(5), a: -1 },
      { ...item(6), a: 10.5 },
      { ...item(7), t: '   ' },
      item(8),
    ]
    pushInbox(g, bad)
    expect(readInbox(g).items.map((i) => i.id)).toEqual(['i8'])
    expect(readInbox(g).total).toBe(1)
  })

  it('clips a long text, drops a bad kind and a bad link, and keeps a good one', () => {
    const g = game()
    pushInbox(g, [
      item(1, { t: 'x'.repeat(500) }),
      item(2, { k: 'bad' as never }),
      item(3, { l: 'javascript:alert(1)' }),
      item(4, { l: `assets/${'a'.repeat(200)}` }),
      item(5, { l: 'assets/home/mortgage' }),
    ])
    const [a, b, c, d, e] = readInbox(g).items
    expect(a!.t).toHaveLength(INBOX_TEXT_MAX)
    expect('k' in b!).toBe(false)
    expect('l' in c!).toBe(false)
    expect('l' in d!).toBe(false)
    expect(e!.l).toBe('assets/home/mortgage')
  })

  it('the stored inbox has at most 450 JSON nodes when full', () => {
    const g = game()
    const full = Array.from({ length: 80 }, (_, i) =>
      item(i + 1, { id: `${'n'.repeat(21)}${String(i).padStart(3, '0')}`, t: 'y'.repeat(INBOX_TEXT_MAX), k: 'event', l: `assets/${'b'.repeat(40)}/${'c'.repeat(30)}` }),
    )
    pushInbox(g, full)
    expect(readInbox(g).items).toHaveLength(INBOX_MAX)
    expect(readInbox(g).items.every((i) => i.l !== undefined && i.k === 'event')).toBe(true)
    expect(nodes(g.flags.inbox)).toBeLessThanOrEqual(450)
  })
})

describe('markSeen, emptyInbox and inboxUnread', () => {
  it('markSeen clears the unread count and keeps the rows', () => {
    const g = game()
    pushInbox(g, items(5))
    expect(inboxUnread(g)).toBe(5)
    markSeen(g)
    expect(inboxUnread(g)).toBe(0)
    expect(readInbox(g).items).toHaveLength(5)
    expect(readInbox(g).seen).toBe(5)
    pushInbox(g, items(2, 6))
    expect(inboxUnread(g)).toBe(2)
  })

  it('emptyInbox removes the rows, counts them as seen and keeps the total', () => {
    const g = game()
    pushInbox(g, items(5))
    pushInbox(g, items(2, 6))
    emptyInbox(g)
    const s = readInbox(g)
    expect(s.items).toEqual([])
    expect(s.total).toBe(7)
    expect(s.seen).toBe(7)
    expect(inboxUnread(g)).toBe(0)
    pushInbox(g, items(1, 8))
    expect(inboxUnread(g)).toBe(1)
  })

  it('unread is never more than the rows that are left', () => {
    const g = game()
    pushInbox(g, items(100))
    markSeen(g)
    pushInbox(g, items(70, 101))
    expect(readInbox(g).total).toBe(170)
    expect(inboxUnread(g)).toBe(INBOX_MAX)
  })

  it('neither one creates the key on a game that never had an inbox', () => {
    const g = game()
    markSeen(g)
    emptyInbox(g)
    expect('inbox' in g.flags).toBe(false)
  })
})

describe('a hostile saved inbox', () => {
  const many = Array.from({ length: 500 }, (_, i) => ({ id: `h${i}`, y: 2000 + (i % 50), a: i % 90, t: `Row ${i}` }))
  const hostile: [string, unknown][] = [
    ['a string', 'inbox'],
    ['an array', [1, 2, 3]],
    ['a number', 7],
    ['null', null],
    ['true', true],
    ['an empty object', {}],
    ['wrong field types', { v: 'x', total: 'a', seen: [], items: 'nope' }],
    ['500 rows', { v: 1, total: 500, seen: 0, items: many }],
    ['500 rows and a tiny total', { v: 1, total: 2, seen: 700, items: many }],
    ['NaN and Infinity', { v: 1, total: NaN, seen: Infinity, items: [{ id: 'a', y: NaN, a: 1, t: 'x' }, { id: 'b', y: 2000, a: Infinity, t: 'x' }] }],
    ['1e300', { v: 1, total: 1e300, seen: 1e300, items: [{ id: 'a', y: 1e300, a: 1e300, t: 'x' }, { id: 'b', y: 2000, a: 5, t: 'fine' }] }],
    ['a negative count', { v: 1, total: -5, seen: -9, items: [{ id: 'a', y: 2000, a: 5, t: 'fine' }] }],
    ['rows that are not objects', { v: 1, total: 3, seen: 0, items: [1, 'a', null, [], true, { id: 'ok', y: 2000, a: 5, t: 'fine' }] }],
    ['wrong types in a row', { v: 1, total: 1, seen: 0, items: [{ id: 5, y: '2000', a: '5', t: 7 }, { id: 'ok', y: 2000, a: 5, t: 'fine', k: 3, l: 5 }] }],
    ['bad links', { v: 1, total: 3, seen: 0, items: [
      { id: 'a', y: 2000, a: 5, t: 'one', l: 'javascript:alert(1)' },
      { id: 'b', y: 2000, a: 5, t: 'two', l: `assets/${'z'.repeat(200)}` },
      { id: 'c', y: 2000, a: 5, t: 'three', l: 'assets/home' },
    ] }],
    ['duplicate ids', { v: 1, total: 3, seen: 0, items: [{ id: 'd', y: 2000, a: 5, t: 'one' }, { id: 'd', y: 2001, a: 6, t: 'two' }, { id: 'e', y: 2000, a: 5, t: 'three' }] }],
    ['a long text', { v: 1, total: 1, seen: 0, items: [{ id: 'a', y: 2000, a: 5, t: 'w'.repeat(5000) }] }],
  ]

  it.each(hostile)('readInbox gives a bounded valid inbox for %s', (_name, value) => {
    const g = game()
    g.flags.inbox = value as never
    const before = JSON.stringify(g.flags.inbox)
    let read: ReturnType<typeof readInbox> | undefined
    expect(() => {
      read = readInbox(g)
    }).not.toThrow()
    expect(problems(read)).toEqual([])
    expect(JSON.stringify(g.flags.inbox)).toBe(before)
    expect(inboxUnread(g)).toBeLessThanOrEqual(INBOX_MAX)
    expect(inboxUnread(g)).toBeGreaterThanOrEqual(0)
  })

  it.each(hostile)('pushInbox repairs %s the first time it writes', (_name, value) => {
    const g = game()
    g.flags.inbox = value as never
    pushInbox(g, [item(901)])
    expect(problems(g.flags.inbox)).toEqual([])
    expect(readInbox(g).items.at(-1)!.id).toBe('i901')
    expect(nodes(g.flags.inbox)).toBeLessThanOrEqual(450)
  })

  it('keeps the good rows of a damaged inbox and drops the rest', () => {
    const g = game()
    g.flags.inbox = hostile.find(([n]) => n === 'wrong types in a row')![1] as never
    expect(readInbox(g).items.map((i) => i.id)).toEqual(['ok'])
    expect('k' in readInbox(g).items[0]!).toBe(false)
    expect('l' in readInbox(g).items[0]!).toBe(false)
  })

  it('markSeen and emptyInbox repair too', () => {
    const g = game()
    g.flags.inbox = { v: 1, total: 'a', seen: 'b', items: [{ id: 'ok', y: 2000, a: 5, t: 'fine' }, 7] } as never
    markSeen(g)
    expect(problems(g.flags.inbox)).toEqual([])
    expect(inboxUnread(g)).toBe(0)
    g.flags.inbox = many as never
    emptyInbox(g)
    expect(problems(g.flags.inbox)).toEqual([])
    expect(readInbox(g).items).toEqual([])
  })
})

describe('clipInboxText', () => {
  it('joins the title and the text with a colon and a space', () => {
    expect(clipInboxText('A raise', 'You got $1,200.')).toBe('A raise: You got $1,200.')
  })

  it('collapses white space', () => {
    expect(clipInboxText('A\n raise', ' You\tgot   a\n\nraise. ')).toBe('A raise: You got a raise.')
  })

  it('leaves a text of exactly 160 characters alone', () => {
    const text = 'z'.repeat(160 - 3)
    const out = clipInboxText('T', text)
    expect(out).toHaveLength(160)
    expect(out).toBe(`T: ${text}`)
  })

  it('cuts a longer text at a word and adds three dots, within 160', () => {
    const words = Array.from({ length: 20 }, () => 'abcdefghi').join(' ')
    const out = clipInboxText('T', words)
    expect(out.length).toBeLessThanOrEqual(INBOX_TEXT_MAX)
    expect(out.endsWith('...')).toBe(true)
    const head = out.slice(0, -3)
    expect(head).toBe(`T: ${Array.from({ length: 15 }, () => 'abcdefghi').join(' ')}`)
    expect(head.endsWith(' ')).toBe(false)
  })

  it('cuts one very long word hard at 157 characters', () => {
    const out = clipInboxText('T', 'q'.repeat(400))
    expect(out).toHaveLength(INBOX_TEXT_MAX)
    expect(out.endsWith('...')).toBe(true)
    expect(out.startsWith('T: qqq')).toBe(true)
  })

  it('never exceeds 160 whatever the lengths', () => {
    for (const n of [150, 157, 158, 159, 160, 161, 162, 200, 1000]) {
      const out = clipInboxText('Title', 'word '.repeat(n))
      expect(out.length, String(n)).toBeLessThanOrEqual(INBOX_TEXT_MAX)
    }
  })

  // A lone half of an emoji renders as a replacement character, so a cut must never split a pair.
  const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/

  it('never leaves half an emoji when the hard cut lands inside a pair', () => {
    // 'Title: ' is 7 characters, so 149 more put the first emoji's high half at index 156, the last one before the cut at 157.
    const out = clipInboxText('Title', `${'a'.repeat(149)}\u{1F604}\u{1F604}${'b'.repeat(50)}`)
    expect(out).not.toMatch(LONE_SURROGATE)
    expect(out.endsWith('...')).toBe(true)
    expect(out.length).toBeLessThanOrEqual(INBOX_TEXT_MAX)
    expect(out.startsWith(`Title: ${'a'.repeat(149)}`)).toBe(true)
  })

  it('keeps a whole emoji when the hard cut falls just after it', () => {
    const out = clipInboxText('Title', `${'a'.repeat(148)}\u{1F604}${'b'.repeat(50)}`)
    expect(out).not.toMatch(LONE_SURROGATE)
    expect(out).toContain('\u{1F604}')
    expect(out.length).toBeLessThanOrEqual(INBOX_TEXT_MAX)
  })

  it('has no lone half in any cut of a long run of emoji', () => {
    for (let pad = 0; pad < 6; pad++) {
      const out = clipInboxText('T', `${'x'.repeat(140 + pad)}${'\u{1F604}'.repeat(40)}`)
      expect(out, String(pad)).not.toMatch(LONE_SURROGATE)
      expect(out.length, String(pad)).toBeLessThanOrEqual(INBOX_TEXT_MAX)
    }
  })

  it('a row made from the clipped text passes the writer unchanged', () => {
    const g = makeTestGame(1)
    const t = clipInboxText('Title', `${'a'.repeat(149)}\u{1F604}\u{1F604}${'b'.repeat(50)}`)
    pushInbox(g, [{ id: 'e1', y: 2026, a: 30, t }])
    expect(readInbox(g).items.map((r) => r.t)).toEqual([t])
  })
})

describe('inboxItemOf', () => {
  it('builds the row from the game and the notice', () => {
    const g = game()
    const row = inboxItemOf(g, minor('n9', { tone: 'good', link: 'assets/home/mortgage' }))
    expect(row).toEqual({ id: 'n9', y: g.year, a: 30, t: 'Minor n9: Text of n9.', k: 'good', l: 'assets/home/mortgage' })
  })

  it('maps the tone to the kind: good, event, otherwise neutral', () => {
    const g = game()
    expect(inboxItemOf(g, minor('a', { tone: 'good' })).k).toBe('good')
    expect(inboxItemOf(g, minor('b', { tone: 'event' })).k).toBe('event')
    expect(inboxItemOf(g, minor('c', { tone: 'neutral' })).k).toBe('neutral')
    expect(inboxItemOf(g, minor('d')).k).toBe('neutral')
  })

  it('leaves out a link that is not valid', () => {
    const g = game()
    for (const link of ['javascript:alert(1)', `assets/${'x'.repeat(100)}`, 'Assets/Home', 'assets//home', '', 'assets/home/' + 'a/'.repeat(7)]) {
      expect('l' in inboxItemOf(g, minor('n', { link })), link).toBe(false)
    }
    expect('l' in inboxItemOf(g, minor('n'))).toBe(false)
    expect(inboxItemOf(g, minor('n', { link: 'assets' })).l).toBe('assets')
  })

  it('does not change the game', () => {
    const g = game()
    const before = JSON.stringify(g)
    inboxItemOf(g, minor('n'))
    expect(JSON.stringify(g)).toBe(before)
  })
})

describe('routeMinorNotices', () => {
  it('moves only the routable notices, keeps the order of the rest, and returns the count', () => {
    const g = game()
    const plain: NoticeModal = { kind: 'notice', id: 'plain', title: 'Plain', text: 'No weight.' }
    const bad = minor('bad', { tone: 'bad' })
    const sick = minor('sick', { title: 'Sick day', text: 'You stayed in.' })
    const big = minor('big', { text: 'You won $250,000.' })
    const input: InputModal = { kind: 'input', id: 'in', title: 'Name', text: 'Name it.', input: 'text', scriptId: 's' }
    const queue: ModalItem[] = [minor('a', { tone: 'good', link: 'assets/home' }), choice('c1'), plain, bad, minor('b'), sick, input, big, minor('c', { tone: 'event' })]
    g.queue = queue
    expect(routeMinorNotices(g)).toBe(3)
    expect(g.queue.map((m) => m.id)).toEqual(['c1', 'plain', 'bad', 'sick', 'in', 'big'])
    const s = readInbox(g)
    expect(s.items.map((i) => i.id)).toEqual(['a', 'b', 'c'])
    expect(s.items.map((i) => i.k)).toEqual(['good', 'neutral', 'event'])
    expect(s.items[0]!.l).toBe('assets/home')
    expect(s.items[0]!.t).toBe('Minor a: Text of a.')
    expect(s.total).toBe(3)
    expect(inboxUnread(g)).toBe(3)
  })

  it('keeps the queue array itself', () => {
    const g = game()
    const q = (g.queue = [minor('a'), choice('c1'), minor('b')])
    routeMinorNotices(g)
    expect(g.queue).toBe(q)
    expect(q.map((m) => m.id)).toEqual(['c1'])
  })

  it('is idempotent', () => {
    const g = game()
    g.queue = [minor('a'), choice('c1'), minor('b')]
    expect(routeMinorNotices(g)).toBe(2)
    const once = JSON.stringify(g)
    expect(routeMinorNotices(g)).toBe(0)
    expect(JSON.stringify(g)).toBe(once)
  })

  it('never touches a choice, even one that carries a minor weight', () => {
    const g = game()
    g.queue = [choice('c1', { weight: 'minor' }), choice('c2')]
    const before = JSON.stringify(g.queue)
    expect(routeMinorNotices(g)).toBe(0)
    expect(JSON.stringify(g.queue)).toBe(before)
    expect('inbox' in g.flags).toBe(false)
  })

  it('writes nothing when the queue is empty or holds nothing routable', () => {
    const g = game()
    expect(routeMinorNotices(g)).toBe(0)
    g.queue = [{ kind: 'notice', id: 'p', title: 'Plain', text: 'Nothing.' }]
    expect(routeMinorNotices(g)).toBe(0)
    expect('inbox' in g.flags).toBe(false)
  })

  it('uses the modal id and calls neither uid nor the generator', () => {
    const g = game()
    g.queue = [minor('keep-this-id'), minor('b')]
    const rng = g.rng
    const nextId = g.nextId
    routeMinorNotices(g)
    expect(g.rng).toBe(rng)
    expect(g.nextId).toBe(nextId)
    expect(readInbox(g).items.map((i) => i.id)).toEqual(['keep-this-id', 'b'])
  })

  it('adds to what is already in the inbox and does not repeat a row that is there', () => {
    const g = game()
    pushInbox(g, [item(1), { ...item(2), id: 'dup' }])
    g.queue = [minor('dup'), minor('new')]
    expect(routeMinorNotices(g)).toBe(2)
    expect(g.queue).toEqual([])
    expect(readInbox(g).items.map((i) => i.id)).toEqual(['i1', 'dup', 'new'])
    expect(readInbox(g).total).toBe(3)
  })
})

describe('the notice weight in core.ts', () => {
  it('queues both fields when asked', () => {
    const g = game()
    notice(g, 'T', 'x', { weight: 'minor', link: 'assets/home' })
    expect(g.queue[0]).toMatchObject({ kind: 'notice', title: 'T', text: 'x', weight: 'minor', link: 'assets/home' })
  })

  it('queues the exact object as before when no option is given', () => {
    const g = game()
    notice(g, 'T', 'x')
    notice(g, 'T2', 'y', { emoji: '📬', tone: 'good' })
    expect(Object.keys(g.queue[0]!).sort()).toEqual(['emoji', 'id', 'kind', 'text', 'title', 'tone'])
    expect(Object.keys(g.queue[1]!).sort()).toEqual(['emoji', 'id', 'kind', 'text', 'title', 'tone'])
    expect(JSON.stringify(g.queue)).not.toMatch(/weight|link/)
  })

  it('does not draw from the generator or change the ids it hands out', () => {
    const a = game()
    const b = game()
    notice(a, 'T', 'x')
    notice(b, 'T', 'x', { weight: 'minor' })
    expect(a.rng).toBe(b.rng)
    expect(a.nextId).toBe(b.nextId)
    expect(a.queue[0]!.id).toBe(b.queue[0]!.id)
  })

  it('noticeWeightFor follows the title table and defaults to nothing', () => {
    for (const title of MINOR_NOTICE_TITLES) expect(noticeWeightFor(title), title).toBe('minor')
    expect(noticeWeightFor('A title nobody has ever used')).toBeUndefined()
    expect(noticeWeightFor('')).toBeUndefined()
  })

  it('a title in the table gets the minor weight without an option', () => {
    const table = MINOR_NOTICE_TITLES as Set<string>
    const title = 'A title only this test uses'
    table.add(title)
    try {
      const g = game()
      notice(g, title, 'x')
      notice(g, 'Another title', 'y')
      expect(g.queue[0]).toMatchObject({ weight: 'minor' })
      expect('weight' in g.queue[1]!).toBe(false)
    } finally {
      table.delete(title)
    }
    expect(MINOR_NOTICE_TITLES.has(title)).toBe(false)
  })
})

describe('migrateSave repairs the new notice fields', () => {
  it('drops a weight that is not minor and a link that is not a short string', () => {
    const save = structuredClone(fixture) as Record<string, unknown>
    save.queue = [
      { kind: 'notice', id: 'a', title: 'A', text: 'a', weight: 'major', link: 5 },
      { kind: 'notice', id: 'b', title: 'B', text: 'b', weight: 'minor', link: 'assets/home' },
      { kind: 'notice', id: 'c', title: 'C', text: 'c', weight: 7, link: `assets/${'x'.repeat(100)}` },
      { kind: 'notice', id: 'd', title: 'D', text: 'd' },
    ]
    const result = migrateSave(JSON.parse(JSON.stringify(save)))
    if (result.kind !== 'ready') throw new Error(`expected ready, got ${result.kind}`)
    const [a, b, c, d] = result.game.queue as NoticeModal[]
    expect('weight' in a!).toBe(false)
    expect('link' in a!).toBe(false)
    expect(b).toMatchObject({ weight: 'minor', link: 'assets/home' })
    expect('weight' in c!).toBe(false)
    expect('link' in c!).toBe(false)
    expect(Object.keys(d!).sort()).toEqual(['id', 'kind', 'text', 'title'])
    const again = migrateSave(JSON.parse(JSON.stringify(result.game)))
    if (again.kind !== 'ready') throw new Error('expected ready twice')
    expect(JSON.stringify(again.game.queue)).toBe(JSON.stringify(result.game.queue))
  })

  it('still loads the v4.0.2 fixture at schema 3', () => {
    expect(SAVE_SCHEMA).toBe(3)
    const result = migrateSave(structuredClone(fixture))
    expect(result.kind).toBe('ready')
    if (result.kind === 'ready') expect(result.game.schemaVersion).toBe(3)
  })

  it('a loaded save with a damaged inbox is repaired the first time it is written', () => {
    const save = structuredClone(fixture) as Record<string, unknown>
    ;(save.flags as Record<string, unknown>).inbox = { v: 1, total: 'x', seen: 1e300, items: [{ id: 5 }, 'junk'] }
    const result = migrateSave(JSON.parse(JSON.stringify(save)))
    if (result.kind !== 'ready') throw new Error(`expected ready, got ${result.kind}`)
    expect(readInbox(result.game)).toEqual({ v: 1, total: 0, seen: 0, items: [] })
    pushInbox(result.game, [item(1)])
    expect(problems(result.game.flags.inbox)).toEqual([])
  })
})

describe('the new modules', () => {
  const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
  const FILES = ['src/game/inbox.ts', 'src/game/notice-policy.ts', 'src/game/notice-weights.ts', 'src/ui/components/NoticeSettings.tsx']

  it('are leaves: the game modules import only types and each other', () => {
    const imports = (src: string) => src.split('\n').filter((l) => /^import\b/.test(l))
    expect(imports(read('src/game/notice-weights.ts'))).toEqual([])
    for (const line of imports(read('src/game/notice-policy.ts'))) expect(line, line).toMatch(/^import type /)
    for (const line of imports(read('src/game/inbox.ts'))) expect(line, line).toMatch(/^import type |from '\.\/notice-policy'/)
  })

  it('carry no en dash or em dash, and none of them books money or draws from the generator', () => {
    for (const f of [...FILES, 'src/settings.ts', 'test/notice-table.ts', 'test/notice-policy.test.ts', 'test/inbox-state.test.ts', 'test/quiet-settings.test.ts']) {
      expect(read(f), f).not.toMatch(/[\u2013\u2014]/)
    }
    for (const f of FILES) expect(read(f), f).not.toMatch(/earnIncome\(|spend\(|addMoney\(|\.cash \+=|\.money \+=|\brand\(|\buid\(|\.rng\b/)
  })
})
