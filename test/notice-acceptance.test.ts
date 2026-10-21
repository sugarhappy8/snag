// R1-T10 (G.11, D.11 criteria 4 and 8 for the notices track): the acceptance sweep for the two flags, noticeDigest and
// quietInbox. It restates the release gate in one file, so the lead can flip both defaults on the strength of it:
//   (a) a hostile inbox, text memory and queued weight or link survive a save round trip and stay inside their caps;
//   (b) the digest merge never writes g.queue;
//   (c) the never-route table: bad-tone, health, legal and large-money notices stay popups, in the pure policy and
//       through the real store;
//   (d) Quiet Mode toggles through the real store;
//   (e) the v4.0.2 fixture loads with an empty inbox and an empty text memory;
//   (f) a seeded life played headless never routes (routing is store-only) and its text memory holds only the flavor ring.
// Every case runs inside withFlags with both flags on, so it passes now, while the defaults are still dark, and after
// the release commit. Nothing here flips a flag or edits src/game/flags.ts.
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetFlags, withFlags } from '../src/game/flags'
import {
  INBOX_LINK_MAX,
  INBOX_MAX,
  INBOX_TEXT_MAX,
  inboxUnread,
  pushInbox,
  readInbox,
  routeMinorNotices,
  type InboxItem,
  type InboxState,
} from '../src/game/inbox'
import { createNewLife } from '../src/game/life'
import { neverRoute, routesToInbox } from '../src/game/notice-policy'
import { nextRandom } from '../src/game/rng'
import { migrateSave, SAVE_SCHEMA } from '../src/game/save-schema'
import { TEXT_MEM_LIMITS, familyStats, pickLine, readTextMem, type TextMem } from '../src/game/text'
import type { ChoiceModal, GameState, InputModal, Json, MinigameModal, ModalItem, NoticeModal } from '../src/game/types'
import { DIGEST_MAX, DIGEST_MIN, digestRows, digestTone, headNoticeRun, mergeable, planHead } from '../src/ui/components/noticeModel'
import { deepFreeze } from './fuzz-kit'
import { NEVER_ROUTE_TABLE, noticeOfRow } from './notice-table'
import { playLife } from './play-kit'

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
const { ModalHost } = await import('../src/ui/components/ModalHost')
const { InboxSheet } = await import('../src/ui/components/InboxSheet')
const { NoticeSettingsSection, quietPatch } = await import('../src/ui/components/NoticeSettings')
const { SETTINGS_KEY, quietModeOn } = await import('../src/settings')

const ON = { noticeDigest: true, quietInbox: true } as const

afterEach(() => {
  resetFlags()
  store.updateSettings({ quietMode: true })
})

/** A case that runs with both flags on. */
function sweep(name: string, fn: () => void): void {
  it(name, () => withFlags(ON, fn))
}

// ---------------------------------------------------------------------------------------------------------------
// Helpers

const LINK_RE = /^[a-z]+(?:\/[A-Za-z0-9._:-]{1,40}){0,6}$/
/** The caps the plan promises (R1-T1 and R1-T5), written out here so that raising one in the source fails this file. */
const CAPS = { pools: 300, families: 120, rings: 4, ring: 64, ringKey: 80, famYears: 12, poolRecord: 48, familyRecord: 83 } as const
const INBOX_CAPS = { rows: 60, text: 160, link: 80 } as const
/** The most JSON nodes the roadmap budgets for the text memory (about 690 worst case) and for the inbox (about 425). */
const TEXT_MEM_NODES = 700
const INBOX_NODES = 450
const COUNT_MAX = 1e9

/** Every value in a JSON tree, containers and leaves alike. */
function nodes(v: unknown): number {
  if (v === null || typeof v !== 'object') return 1
  let n = 1
  for (const x of Object.values(v)) n += nodes(x)
  return n
}

function asJson(v: unknown): Json {
  return v as Json
}

function N(id: string, extra: Partial<NoticeModal> = {}): NoticeModal {
  return { kind: 'notice', id, title: `Title ${id}`, text: `Text of ${id}.`, ...extra }
}

function minor(id: string, extra: Partial<NoticeModal> = {}): NoticeModal {
  return N(id, { tone: 'good', weight: 'minor', ...extra })
}

function C(id: string, extra: Record<string, unknown> = {}): ChoiceModal {
  return {
    kind: 'choice',
    id,
    title: `Pick ${id}`,
    text: 'Which one?',
    choices: [
      { id: 'a', label: 'First' },
      { id: 'b', label: 'Second' },
    ],
    source: 'script',
    scriptId: 'none',
    ...extra,
  } as ChoiceModal
}

function ids(items: readonly { id: string }[]): string[] {
  return items.map((m) => m.id)
}

/** Why an inbox state is not inside its caps; empty when it is. */
function inboxProblems(s: InboxState): string[] {
  const out: string[] = []
  if (s.v !== 1) out.push('version')
  if (s.items.length > INBOX_CAPS.rows) out.push(`${s.items.length} rows`)
  const seen = new Set<string>()
  for (const row of s.items) {
    if (typeof row.id !== 'string' || row.id.length < 1 || row.id.length > 24) out.push(`id ${String(row.id)}`)
    if (seen.has(row.id)) out.push(`duplicate ${row.id}`)
    seen.add(row.id)
    if (!Number.isInteger(row.y) || row.y < 1000 || row.y > 100000) out.push(`year ${row.y}`)
    if (!Number.isInteger(row.a) || row.a < 0 || row.a > 10000) out.push(`age ${row.a}`)
    if (typeof row.t !== 'string' || row.t.length < 1 || row.t.length > INBOX_CAPS.text) out.push(`text of ${row.id}`)
    if (row.k !== undefined && row.k !== 'good' && row.k !== 'neutral' && row.k !== 'event') out.push(`kind ${String(row.k)}`)
    if (row.l !== undefined && (typeof row.l !== 'string' || row.l.length > INBOX_CAPS.link || !LINK_RE.test(row.l))) out.push(`link ${String(row.l)}`)
  }
  if (!Number.isInteger(s.total) || s.total < s.items.length || s.total > COUNT_MAX) out.push(`total ${s.total}`)
  if (!Number.isInteger(s.seen) || s.seen < 0 || s.seen > s.total) out.push(`seen ${s.seen}`)
  return out
}

/** Why a text memory is not inside its caps; empty when it is. */
function textMemProblems(mem: TextMem): string[] {
  const out: string[] = []
  if (mem.v !== 1) out.push('version')
  for (const name of ['p', 'f', 'r'] as const) if (Object.getPrototypeOf(mem[name]) !== Object.prototype) out.push(`${name} prototype`)
  if (Object.keys(mem.p).length > CAPS.pools) out.push(`${Object.keys(mem.p).length} pools`)
  if (Object.keys(mem.f).length > CAPS.families) out.push(`${Object.keys(mem.f).length} families`)
  if (Object.keys(mem.r).length > CAPS.rings) out.push(`${Object.keys(mem.r).length} rings`)
  for (const [k, v] of Object.entries(mem.p)) if (typeof v !== 'string' || v.length > CAPS.poolRecord) out.push(`pool ${k}`)
  for (const [k, v] of Object.entries(mem.f)) if (typeof v !== 'string' || v.length > CAPS.familyRecord) out.push(`family ${k}`)
  for (const [k, ring] of Object.entries(mem.r)) {
    if (!Array.isArray(ring) || ring.length > CAPS.ring) out.push(`ring ${k} has ${Array.isArray(ring) ? ring.length : 'no'} keys`)
    else for (const key of ring) if (typeof key !== 'string' || key.length > CAPS.ringKey) out.push(`ring ${k} key`)
  }
  if (nodes(mem) > TEXT_MEM_NODES) out.push(`${nodes(mem)} nodes`)
  return out
}

/** The game as the player's browser would load it: through JSON and the save migration. */
function loaded(g: GameState): GameState {
  const result = migrateSave(JSON.parse(JSON.stringify(g)))
  if (result.kind !== 'ready') throw new Error(`expected a ready save, got ${JSON.stringify(result).slice(0, 200)}`)
  return result.game
}

function lifeWith(set: (g: GameState) => void): GameState {
  const g = createNewLife({ seed: 11, year: 2026 })
  set(g)
  return g
}

// ---------------------------------------------------------------------------------------------------------------
// (a) Hostile saves

const LONG = 'x'.repeat(10_000)

/** 500 rows of damage: every field wrong in some way, a few good rows in between. */
function junkRows(): unknown[] {
  return Array.from({ length: 500 }, (_, i) => {
    switch (i % 12) {
      case 0:
        return { id: `r${i}`, y: 2026, a: 30, t: `Fine ${i}`, k: 'good' }
      case 1:
        return { id: i, y: 2026, a: 30, t: 'numeric id' }
      case 2:
        return { id: `r${i}`, y: 1e300, a: 30, t: 'huge year' }
      case 3:
        return { id: `r${i}`, y: 2026, a: Number.NaN, t: 'NaN age' }
      case 4:
        return { id: `r${i}`, y: 2026, a: 30, t: LONG }
      case 5:
        return { id: `r${i}`, y: 2026, a: 30, t: 'script link', l: 'javascript:alert(1)' }
      case 6:
        return { id: `r${i}`, y: 2026, a: 30, t: 'long link', l: `assets/${'a'.repeat(200)}` }
      case 7:
        return { id: `r${i}`, y: 2026, a: 30, t: 'bad kind', k: 'bad' }
      case 8:
        return { id: 'dup', y: 2026, a: 30, t: 'same id again' }
      case 9:
        return i % 2 ? 'a string' : null
      case 10:
        return [1, 2, 3]
      default:
        return { id: 'x'.repeat(100), y: 2026, a: 30, t: 'long id', l: 'assets/home/mortgage' }
    }
  })
}

/** 500 rows of junk, a few with markup in the text, and counts that are not counts. */
const BIG_INBOX = {
  v: 1,
  total: 1e300,
  seen: -4,
  items: [
    ...junkRows(),
    { id: 'markup1', y: 2026, a: 30, t: '<script>alert(1)</script> news' },
    { id: 'markup2', y: 2026, a: 30, t: '<img src=x onerror=alert(1)> news', l: 'assets/home' },
  ],
}

const HOSTILE_INBOX: [string, unknown][] = [
  ['a string', 'junk'],
  ['a number', 7],
  ['null', null],
  ['an array', [1, 2, 3]],
  ['items that is not a list', { v: 1, total: 3, seen: 0, items: 'nope' }],
  ['500 rows of junk and absurd counts', BIG_INBOX],
  ['counts as the wrong types', { v: 1, total: 'many', seen: {}, items: BIG_INBOX.items.slice(0, 3) }],
  ['seen above total', { v: 1, total: 5, seen: 99, items: [] }],
]

const BIG_MEM = {
  v: 1,
  p: Object.fromEntries(Array.from({ length: 5000 }, (_, i) => [`p${i}`, 'b5.2'])),
  f: Object.fromEntries(Array.from({ length: 1000 }, (_, i) => [`f${i}`, '2030,2031'])),
  r: Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`ring${i}`, Array.from({ length: 300 }, (_, j) => (j % 2 ? `key${j}` : `${'k'.repeat(120)}${j}`))])),
}

/** Own keys named like prototype members, the way JSON.parse makes them. */
const PROTO_MEM = JSON.parse(
  '{"v":1,"p":{"__proto__":"b1","constructor":"b3.1","toString":"w1,2","ok":"b3.1"},"f":{"__proto__":"2030","constructor":"2031"},"r":{"__proto__":["x"],"flavor":["a","b"]}}',
)

const HOSTILE_MEM: [string, unknown][] = [
  ['a string', 'junk'],
  ['a number', 7],
  ['an array', []],
  ['the wrong version', { v: 2, p: { a: 'b1' }, f: {}, r: {} }],
  ['the wrong containers', { v: 1, p: 'x', f: [], r: 5 }],
  ['5,000 pools, 1,000 families and 30 rings of 300 keys', BIG_MEM],
  [
    'records in the wrong format',
    {
      v: 1,
      p: { a: 'w1,2,3,4,5,6,7,8,9,10', b: 'bx', c: 'b99999', d: 'w99999999', e: {}, f: ['b1'], good: 'b3.1', '1bad': 'b1' },
      f: { a: '2031,2030', b: 5, good: '2030,2031' },
      r: { flavor: [1, 'a', null, 'b'], '9bad': ['x'], deep: [['x']] },
    },
  ],
  ['prototype keys', PROTO_MEM],
]

/** Notices as a damaged or hostile save might queue them. The first group is weight and link; the last has a big figure. */
function hostileQueue(): ModalItem[] {
  const base = (id: string): NoticeModal => N(id)
  const rows: Record<string, unknown>[] = [
    { ...base('q1'), weight: 'major' },
    { ...base('q2'), weight: 5 },
    { ...base('q3'), weight: 'minor', link: 5 },
    { ...base('q4'), weight: 'minor', link: 'assets/home/mortgage' },
    { ...base('q5'), weight: 'minor', link: `assets/${'a'.repeat(200)}` },
    { ...base('q6'), weight: 'minor', link: 'javascript:alert(1)' },
    { ...base('q7'), weight: ['minor'], link: { x: 1 } },
    { ...base('q8'), weight: 'minor', link: 'Assets/Home' },
    { ...base('q9'), weight: 'minor', title: 'Windfall', text: 'You won $250,000 in the lottery.' },
  ]
  return rows as unknown as ModalItem[]
}

describe('(a) the caps', () => {
  sweep('are the ones the plan budgets', () => {
    expect({ rows: INBOX_MAX, text: INBOX_TEXT_MAX, link: INBOX_LINK_MAX }).toEqual(INBOX_CAPS)
    expect(TEXT_MEM_LIMITS.pools).toBe(CAPS.pools)
    expect(TEXT_MEM_LIMITS.families).toBe(CAPS.families)
    expect(TEXT_MEM_LIMITS.rings).toBe(CAPS.rings)
    expect(TEXT_MEM_LIMITS.ring).toBe(CAPS.ring)
    expect(TEXT_MEM_LIMITS.ringKey).toBe(CAPS.ringKey)
    expect(TEXT_MEM_LIMITS.famYears).toBe(CAPS.famYears)
  })
})

describe('(a) a hostile inbox', () => {
  for (const [name, raw] of HOSTILE_INBOX) {
    sweep(`${name}: survives a save round trip and every reader and writer stays inside the caps`, () => {
      const g = loaded(lifeWith((x) => (x.flags.inbox = asJson(raw))))
      const before = JSON.stringify(g.flags)

      const state = readInbox(g)
      expect(inboxProblems(state)).toEqual([])
      const unread = inboxUnread(g)
      expect(Number.isInteger(unread)).toBe(true)
      expect(unread).toBeGreaterThanOrEqual(0)
      expect(unread).toBeLessThanOrEqual(state.items.length)
      // The readers never write.
      expect(JSON.stringify(g.flags)).toBe(before)

      const row: InboxItem = { id: 'accept-1', y: g.year, a: g.character.age, t: 'A fine new row', k: 'good' }
      pushInbox(g, [row])
      const raw2 = g.flags.inbox as unknown as InboxState
      expect(inboxProblems(raw2)).toEqual([])
      expect(raw2.items.at(-1)).toEqual(row)
      expect(raw2.items.length).toBeLessThanOrEqual(INBOX_CAPS.rows)
      expect(nodes(raw2)).toBeLessThanOrEqual(INBOX_NODES)
      // Pushing the same id again changes nothing.
      const once = JSON.stringify(g.flags.inbox)
      pushInbox(g, [row])
      expect(JSON.stringify(g.flags.inbox)).toBe(once)
    })
  }

  sweep('stays valid and bounded after 70 more rows, and the count keeps counting', () => {
    const g = loaded(lifeWith((x) => (x.flags.inbox = asJson({ v: 1, total: 1e9 - 10, seen: 0, items: BIG_INBOX.items }))))
    pushInbox(g, Array.from({ length: 70 }, (_, i) => ({ id: `n${i}`, y: g.year, a: g.character.age, t: `Row ${i}` })))
    const state = readInbox(g)
    expect(inboxProblems(state)).toEqual([])
    expect(state.items).toHaveLength(INBOX_CAPS.rows)
    expect(state.items.at(-1)?.id).toBe('n69')
    expect(state.total).toBe(COUNT_MAX)
    expect(nodes(g.flags.inbox)).toBeLessThanOrEqual(INBOX_NODES)
  })
})

describe('(a) a hostile text memory', () => {
  for (const [name, raw] of HOSTILE_MEM) {
    sweep(`${name}: survives a save round trip, reads inside the caps and pickLine repairs it with one draw`, () => {
      const g = loaded(lifeWith((x) => (x.flags.textMem = asJson(raw))))
      const before = JSON.stringify(g.flags)

      expect(textMemProblems(readTextMem(g))).toEqual([])
      const stats = familyStats(g, 'accept.bag')
      expect(stats.count10).toBeGreaterThanOrEqual(0)
      expect(stats.count10).toBeLessThanOrEqual(CAPS.famYears)
      // The readers never write, and a polluted prototype key never reaches Object.prototype.
      expect(JSON.stringify(g.flags)).toBe(before)
      expect(({} as Record<string, unknown>).polluted).toBeUndefined()

      const bag = ['one', 'two', 'three', 'four']
      const rng = g.rng
      expect(bag).toContain(pickLine(g, bag, 'accept.bag'))
      expect(g.rng).toBe(nextRandom(rng)[1])
      const wide = Array.from({ length: 20 }, (_, i) => `line ${i}`)
      expect(wide).toContain(pickLine(g, wide))
      // Hostile family names fall back to the pool's own key.
      expect(bag).toContain(pickLine(g, bag, '__proto__'))
      expect(bag).toContain(pickLine(g, bag, 'x'.repeat(500)))

      const mem = g.flags.textMem as unknown as TextMem
      expect(textMemProblems(mem)).toEqual([])
      expect(Object.hasOwn(mem.p, 'accept.bag')).toBe(true)
    })
  }

  sweep('400 families and pools never grow it past its caps', () => {
    const g = loaded(lifeWith((x) => (x.flags.textMem = asJson(BIG_MEM))))
    for (let i = 0; i < 400; i++) pickLine(g, ['a', 'b', 'c'], `fam${i}`)
    const mem = g.flags.textMem as unknown as TextMem
    expect(textMemProblems(mem)).toEqual([])
    expect(Object.keys(mem.p)).toHaveLength(CAPS.pools)
    expect(Object.keys(mem.f)).toHaveLength(CAPS.families)
  })
})

describe('(a) a hostile queue weight and link', () => {
  sweep('the migration keeps only a minor weight and a short string link', () => {
    const g = loaded(lifeWith((x) => (x.queue = hostileQueue())))
    expect(ids(g.queue)).toEqual(['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9'])
    for (const m of g.queue) {
      if (m.kind !== 'notice') continue
      expect(m.weight === undefined || m.weight === 'minor').toBe(true)
      expect(m.link === undefined || (typeof m.link === 'string' && m.link.length <= INBOX_CAPS.link)).toBe(true)
    }
    const byId = (id: string) => g.queue.find((m) => m.id === id) as NoticeModal
    expect(byId('q1').weight).toBeUndefined()
    expect(byId('q2').weight).toBeUndefined()
    expect(byId('q3').weight).toBe('minor')
    expect(byId('q3').link).toBeUndefined()
    expect(byId('q4').link).toBe('assets/home/mortgage')
    expect(byId('q5').link).toBeUndefined()
    expect(byId('q7').weight).toBeUndefined()
    expect(byId('q7').link).toBeUndefined()
  })

  sweep('routing what is left writes only valid links, and the big figure stays a popup', () => {
    const g = loaded(lifeWith((x) => (x.queue = hostileQueue())))
    expect(routeMinorNotices(g)).toBe(5)
    const state = readInbox(g)
    expect(inboxProblems(state)).toEqual([])
    expect(ids(state.items)).toEqual(['q3', 'q4', 'q5', 'q6', 'q8'])
    expect(state.items.find((r) => r.id === 'q4')?.l).toBe('assets/home/mortgage')
    expect(state.items.find((r) => r.id === 'q6')?.l).toBeUndefined()
    expect(state.items.find((r) => r.id === 'q8')?.l).toBeUndefined()
    expect(ids(g.queue)).toEqual(['q1', 'q2', 'q7', 'q9'])
    // A second pass has nothing left to move.
    expect(routeMinorNotices(g)).toBe(0)
  })

  sweep('a weight on a choice, an input, a minigame or a task never routes', () => {
    const hostile: ModalItem[] = [
      C('c1', { weight: 'minor' }),
      { kind: 'input', id: 'i1', title: 'Name it', text: 'Pick a name.', input: 'text', scriptId: 'none', weight: 'minor' } as unknown as InputModal,
      { kind: 'minigame', id: 'm1', title: 'Play', game: 'slots', scriptId: 'none', data: {}, weight: 'minor' } as unknown as MinigameModal,
      { kind: 'aiTask', id: 't1', task: { type: 'yearEvents' }, weight: 'minor' } as unknown as ModalItem,
    ]
    for (const m of hostile) expect(routesToInbox(m, true)).toBe(false)
    const g = lifeWith((x) => (x.queue = hostile))
    expect(routeMinorNotices(g)).toBe(0)
    expect(ids(g.queue)).toEqual(['c1', 'i1', 'm1', 't1'])
  })
})

describe('(a) everything hostile at once', () => {
  sweep('loads, reads, picks, pushes and loads again without growing', () => {
    const g = loaded(
      lifeWith((x) => {
        x.flags.inbox = asJson(BIG_INBOX)
        x.flags.textMem = asJson(BIG_MEM)
        x.queue = hostileQueue()
      }),
    )
    expect(inboxProblems(readInbox(g))).toEqual([])
    expect(textMemProblems(readTextMem(g))).toEqual([])
    expect(inboxUnread(g)).toBeLessThanOrEqual(INBOX_CAPS.rows)
    expect(['a', 'b', 'c']).toContain(pickLine(g, ['a', 'b', 'c'], 'accept.all'))
    routeMinorNotices(g)
    pushInbox(g, [{ id: 'accept-2', y: g.year, a: g.character.age, t: 'Last row' }])

    const again = loaded(g)
    expect(inboxProblems(readInbox(again))).toEqual([])
    expect(textMemProblems(readTextMem(again))).toEqual([])
    expect(JSON.stringify(again.flags.inbox)).toBe(JSON.stringify(g.flags.inbox))
    expect(JSON.stringify(again.flags.textMem)).toBe(JSON.stringify(g.flags.textMem))
    expect(nodes(again.flags.inbox) + nodes(again.flags.textMem)).toBeLessThanOrEqual(INBOX_NODES + TEXT_MEM_NODES)
  })

  sweep('every reader and builder is pure: a frozen hostile game does not throw', () => {
    const g = deepFreeze(
      loaded(
        lifeWith((x) => {
          x.flags.inbox = asJson(BIG_INBOX)
          x.flags.textMem = asJson(PROTO_MEM)
          x.queue = hostileQueue()
        }),
      ),
    )
    expect(() => {
      readInbox(g)
      inboxUnread(g)
      readTextMem(g)
      familyStats(g, 'accept.bag')
      for (const m of g.queue) if (m.kind === 'notice') neverRoute(m)
      for (const m of g.queue) routesToInbox(m, true)
      const plan = planHead(g.queue, true)
      if (plan.kind === 'digest') digestRows(plan.items)
      headNoticeRun(g.queue)
    }).not.toThrow()
  })
})

describe('(a) hostile data on screen', () => {
  sweep('the inbox sheet draws a hostile inbox as bounded plain text', () => {
    store.updateSettings({ quietMode: true })
    store.startNewLife({ seed: 3, year: 2026 })
    store.act((g) => {
      g.flags.inbox = asJson(BIG_INBOX)
    })
    const html = renderToStaticMarkup(createElement(InboxSheet, { onClose: () => undefined, onOpenLink: () => undefined }))
    const rows = html.match(/class="inbox-row/g) ?? []
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.length).toBeLessThanOrEqual(INBOX_CAPS.rows)
    expect(html).not.toContain('<script')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('javascript:')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt; news')
  })

  sweep('the digest card draws hostile titles as text', () => {
    store.updateSettings({ quietMode: true })
    store.startNewLife({ seed: 3, year: 2026 })
    store.act((g) => {
      g.queue = [N('a', { title: '<img src=x onerror=alert(1)>', text: '<script>alert(2)</script>' }), N('b', { title: 'Beta' })]
    })
    const html = renderToStaticMarkup(createElement(ModalHost))
    expect(html).toContain('2 updates')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<script')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })
})

// ---------------------------------------------------------------------------------------------------------------
// (b) The digest leaves g.queue unchanged

describe('(b) the digest merge', () => {
  sweep('over a real played life, every plan is read only and its items are the queue items themselves', () => {
    const { years } = playLife({ seed: 5, birthYear: 2000, untilAge: 25 })
    const queue = deepFreeze(years.flatMap((y) => y.popups.map((p) => p.item)))
    expect(queue.length).toBeGreaterThan(40)
    const before = JSON.stringify(queue)
    let digests = 0
    for (let i = 0; i < queue.length; i++) {
      const rest = queue.slice(i)
      const plan = planHead(rest, true)
      if (plan.kind === 'digest') {
        digests++
        expect(plan.items.length).toBeGreaterThanOrEqual(DIGEST_MIN)
        expect(plan.items.length).toBeLessThanOrEqual(DIGEST_MAX)
        plan.items.forEach((m, k) => {
          expect(m).toBe(rest[k])
          expect(mergeable(m)).toBe(true)
        })
        expect(digestRows(plan.items)).toHaveLength(plan.items.length)
        digestTone(plan.items)
      } else if (plan.kind === 'single') {
        expect(plan.modal).toBe(rest[0])
      }
      // The flag off draws today's card, whatever the queue.
      expect(planHead(rest, false).kind).toBe('single')
    }
    expect(digests).toBeGreaterThan(0)
    expect(JSON.stringify(queue)).toBe(before)
  })

  sweep('a task head or an empty queue draws nothing, and a choice is never inside a card', () => {
    const t: ModalItem = { kind: 'aiTask', id: 't', task: { type: 'yearEvents' } }
    expect(planHead([], true).kind).toBe('none')
    expect(planHead([t, N('a'), N('b')], true).kind).toBe('none')
    const plan = planHead([N('a'), N('b'), C('x'), N('c'), N('d')], true)
    expect(plan.kind === 'digest' ? ids(plan.items) : []).toEqual(['a', 'b'])
    expect(planHead([C('x'), N('a'), N('b')], true).kind).toBe('single')
  })

  sweep('rendering ModalHost with a digest does not write the queue, and the OK path removes only that run', () => {
    store.updateSettings({ quietMode: true })
    store.startNewLife({ seed: 3, year: 2026 })
    store.act((g) => {
      g.queue = [N('a', { title: 'Alpha' }), N('b', { title: 'Beta' }), N('c', { title: 'Gamma' }), C('x')]
    })
    const g = store.getApp().game as GameState
    const queue = g.queue
    const before = JSON.stringify(queue)
    deepFreeze(queue)
    const html = renderToStaticMarkup(createElement(ModalHost))
    expect(html).toContain('3 updates')
    expect(html).toContain('Alpha')
    expect(html).toContain('Gamma')
    expect(html).not.toContain('Pick x')
    expect(store.getApp().game).toBe(g)
    expect(g.queue).toBe(queue)
    expect(JSON.stringify(g.queue)).toBe(before)

    store.dismissNotices(['a', 'b', 'c', 'x', 'unknown'])
    expect(ids((store.getApp().game as GameState).queue)).toEqual(['x'])
  })

  sweep('with Quiet Mode on, routine news goes to the inbox first and the card holds only the rest', () => {
    store.updateSettings({ quietMode: true })
    store.startNewLife({ seed: 3, year: 2026 })
    store.act((g) => {
      g.queue = [minor('m1', { title: 'Mailbox' }), N('p1', { title: 'Alpha' }), N('p2', { title: 'Beta' }), minor('m2', { title: 'Garage' })]
    })
    const g = store.getApp().game as GameState
    expect(ids(g.queue)).toEqual(['p1', 'p2'])
    expect(ids(readInbox(g).items)).toEqual(['m1', 'm2'])
    const html = renderToStaticMarkup(createElement(ModalHost))
    expect(html).toContain('2 updates')
    expect(html).toContain('Alpha')
    expect(html).not.toContain('Mailbox')
    expect(html).not.toContain('Garage')
  })
})

// ---------------------------------------------------------------------------------------------------------------
// (c) The never-route table

describe('(c) the never-route table', () => {
  sweep('has the rows the roadmap asks for', () => {
    expect(NEVER_ROUTE_TABLE.length).toBeGreaterThanOrEqual(30)
    const blocks = new Set(NEVER_ROUTE_TABLE.map((r) => r.block))
    for (const b of ['support', 'tone', 'health', 'legal', 'money', null]) expect(blocks.has(b as never)).toBe(true)
  })

  sweep('neverRoute and routesToInbox agree with every row', () => {
    for (const row of NEVER_ROUTE_TABLE) {
      const asMinor = noticeOfRow(row, 'row', 'minor')
      const plain = noticeOfRow(row, 'row')
      expect(neverRoute(asMinor), row.name).toBe(row.block)
      expect(routesToInbox(asMinor, true), `${row.name} as a minor notice`).toBe(row.block === null)
      expect(routesToInbox(asMinor, false), `${row.name} with Quiet Mode off`).toBe(false)
      expect(routesToInbox(plain, true), `${row.name} without the weight`).toBe(false)
    }
  })

  sweep('through the real store, every blocked row stays a popup and every passing row goes to the inbox', () => {
    store.updateSettings({ quietMode: true })
    store.startNewLife({ seed: 3, year: 2026 })
    const rows = NEVER_ROUTE_TABLE.map((row, i) => noticeOfRow(row, `row${i}`, 'minor'))
    store.act((g) => {
      g.queue = rows
    })
    const g = store.getApp().game as GameState
    const stay = NEVER_ROUTE_TABLE.flatMap((row, i) => (row.block === null ? [] : [`row${i}`]))
    const go = NEVER_ROUTE_TABLE.flatMap((row, i) => (row.block === null ? [`row${i}`] : []))
    expect(ids(g.queue)).toEqual(stay)
    expect(ids(readInbox(g).items)).toEqual(go)
    // A bad notice, a support line and a health, legal or money one are still in the queue, in their order.
    expect(stay.length).toBeGreaterThanOrEqual(30)
  })

  sweep('the digest does not route either: a blocked row is drawn on a card, in the queue', () => {
    store.updateSettings({ quietMode: false })
    store.startNewLife({ seed: 3, year: 2026 })
    const bad = NEVER_ROUTE_TABLE.find((r) => r.block === 'tone')!
    const health = NEVER_ROUTE_TABLE.find((r) => r.block === 'health')!
    store.act((g) => {
      g.queue = [noticeOfRow(bad, 'b1', 'minor'), noticeOfRow(health, 'h1', 'minor')]
    })
    const g = store.getApp().game as GameState
    expect(ids(g.queue)).toEqual(['b1', 'h1'])
    const plan = planHead(g.queue, true)
    expect(plan.kind === 'digest' ? digestTone(plan.items) : null).toBe('bad')
    expect(readInbox(g).items).toEqual([])
  })
})

// ---------------------------------------------------------------------------------------------------------------
// (d) Quiet Mode toggles through the real store

describe('(d) Quiet Mode', () => {
  sweep('routes while it is on, stops when it is off and routes again when it is turned back on', () => {
    store.updateSettings({ quietMode: true })
    store.startNewLife({ seed: 3, year: 2026 })
    store.act((g) => {
      g.queue = [minor('m1')]
    })
    const game = (): GameState => store.getApp().game as GameState
    expect(game().queue).toEqual([])
    expect(inboxUnread(game())).toBe(1)

    store.updateSettings({ quietMode: false })
    expect(quietModeOn(store.getApp().settings)).toBe(false)
    store.act((g) => {
      g.queue = [minor('m2')]
    })
    expect(ids(game().queue)).toEqual(['m2'])
    expect(readInbox(game()).total).toBe(1)

    // Turning it on does not move anything by itself; the next pass of the queue does.
    store.updateSettings({ quietMode: true })
    expect(quietModeOn(store.getApp().settings)).toBe(true)
    store.processQueue()
    expect(game().queue).toEqual([])
    expect(ids(readInbox(game()).items)).toEqual(['m1', 'm2'])
    expect(readInbox(game()).total).toBe(2)
    expect(inboxUnread(game())).toBe(2)
  })

  sweep('persists the switch, and the Settings section shows it only while quietInbox is on', () => {
    store.updateSettings(quietPatch(false))
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}').quietMode).toBe(false)
    const off = renderToStaticMarkup(createElement(NoticeSettingsSection))
    expect(off).toContain('role="switch"')
    expect(off).toContain('aria-checked="false"')
    store.updateSettings(quietPatch(true))
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}').quietMode).toBe(true)
    expect(renderToStaticMarkup(createElement(NoticeSettingsSection))).toContain('aria-checked="true"')
    withFlags({ quietInbox: false }, () => expect(renderToStaticMarkup(createElement(NoticeSettingsSection))).toBe(''))
  })

  sweep('with quietInbox off the setting does nothing', () => {
    store.updateSettings({ quietMode: true })
    store.startNewLife({ seed: 3, year: 2026 })
    withFlags({ quietInbox: false }, () => {
      store.act((g) => {
        g.queue = [minor('m1')]
      })
    })
    const g = store.getApp().game as GameState
    expect(ids(g.queue)).toEqual(['m1'])
    expect(g.flags.inbox).toBeUndefined()
  })

  sweep('reading the inbox marks it seen, clearing it empties it and keeps the total', () => {
    store.updateSettings({ quietMode: true })
    store.startNewLife({ seed: 3, year: 2026 })
    store.act((g) => {
      g.queue = [minor('m1'), minor('m2'), minor('m3')]
    })
    const game = (): GameState => store.getApp().game as GameState
    expect(inboxUnread(game())).toBe(3)
    store.markInboxSeen()
    expect(inboxUnread(game())).toBe(0)
    expect(readInbox(game()).items).toHaveLength(3)
    store.clearInbox()
    const state = readInbox(game())
    expect(state.items).toEqual([])
    expect(state.total).toBe(3)
    expect(inboxUnread(game())).toBe(0)
  })
})

// ---------------------------------------------------------------------------------------------------------------
// (e) The v4.0.2 fixture

describe('(e) the v4.0.2 fixture', () => {
  const fixture = JSON.parse(gunzipSync(readFileSync('test/fixtures/save-v1.json.gz')).toString()) as Record<string, unknown>

  sweep('loads, and its inbox and text memory are empty', () => {
    expect(fixture).not.toHaveProperty('schemaVersion')
    const result = migrateSave(structuredClone(fixture))
    expect(result.kind).toBe('ready')
    if (result.kind !== 'ready') return
    const g = result.game
    expect(result.from).toBe(1)
    expect(g.schemaVersion).toBe(SAVE_SCHEMA)
    expect(SAVE_SCHEMA).toBe(2)
    expect(g.flags.inbox).toBeUndefined()
    expect(g.flags.textMem).toBeUndefined()
    expect(readInbox(g)).toEqual({ v: 1, total: 0, seen: 0, items: [] })
    expect(inboxUnread(g)).toBe(0)
    expect(readTextMem(g)).toEqual({ v: 1, p: {}, f: {}, r: {} })
    for (const m of g.queue) if (m.kind === 'notice') expect(m.weight).toBeUndefined()
  })

  sweep('routing, the digest and the readers do nothing to it', () => {
    const result = migrateSave(structuredClone(fixture))
    if (result.kind !== 'ready') throw new Error('the fixture did not load')
    const g = result.game
    const before = JSON.stringify(g)
    expect(routeMinorNotices(g)).toBe(0)
    expect(() => planHead(g.queue, true)).not.toThrow()
    expect(JSON.stringify(g)).toBe(before)
  })
})

// ---------------------------------------------------------------------------------------------------------------
// (f) A life played headless

describe('(f) a seeded 25-year life through ageUp', () => {
  const SEED = 21
  const BIRTH = 2000

  sweep('never routes: no inbox, no quietMode change, and the text memory holds only the flavor ring', () => {
    store.updateSettings({ quietMode: true })
    const { g, years } = playLife({ seed: SEED, birthYear: BIRTH, untilAge: 25 })
    expect(g.character.age).toBe(25)
    expect(g.queue).toEqual([])
    // Routing is store-only: nothing was written to the inbox, and the settings were not touched.
    expect(g.flags.inbox).toBeUndefined()
    expect(Object.hasOwn(g.flags, 'inbox')).toBe(false)
    expect(readInbox(g).items).toEqual([])
    expect(inboxUnread(g)).toBe(0)
    expect(JSON.stringify(g)).not.toContain('quietMode')
    expect(quietModeOn(store.getApp().settings)).toBe(true)
    // Minor notices reached the player as popups, as they always did.
    const popups = years.flatMap((y) => y.popups)
    expect(popups.some((p) => p.kind === 'notice' && p.weight === 'minor')).toBe(true)
    // The text memory is the flavor ring and nothing else.
    const mem = g.flags.textMem as unknown as TextMem
    expect(mem).toBeDefined()
    expect(textMemProblems(mem)).toEqual([])
    expect(mem.p).toEqual({})
    expect(mem.f).toEqual({})
    expect(Object.keys(mem.r)).toEqual(['flavor'])
    expect(mem.r.flavor.length).toBeGreaterThan(0)
    expect(JSON.stringify(g.flags)).not.toContain('flavorRecent')
  })

  sweep('is the same life with both flags on and with both off', () => {
    const on = playLife({ seed: SEED, birthYear: BIRTH, untilAge: 25 })
    const off = withFlags({ noticeDigest: false, quietInbox: false }, () => playLife({ seed: SEED, birthYear: BIRTH, untilAge: 25 }))
    expect(JSON.stringify(on.g)).toBe(JSON.stringify(off.g))
    expect(JSON.stringify(on.years)).toBe(JSON.stringify(off.years))
  })
})
