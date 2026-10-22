// R3 fix (outcomes): the outcome of a choice the player just answered, in the real store.
//
// The year close quiets what a year queues by itself, but the popup that tells how a choice turned out still came up after it, so the player
// saw about twice the popups the roadmap counts. The owner's rule is that weight 0 to 1 goes log-only; here it holds for the reply to an answer
// as well. With FLAGS.yearCard and Quiet Mode on, store.chooseOption puts a CALM outcome (weight 0 or 1 by the same weights the year close reads,
// never a bad-tone, health, legal or large-money one, never one that leads to another decision) in the life log instead of a popup. Headless
// ageUp and runScript never do, so every test that reads g.queue sees what it always saw (src/game/hubs/year-outcomes.ts has the rule).
// The real store is used with a localStorage shim, the way test/year-close-store.test.ts does.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetFlags, setFlags } from '../src/game/flags'
import { readInbox } from '../src/game/inbox'
import { calmOutcome, markAnswer, settleAnswer } from '../src/game/hubs/year-outcomes'
import type { ChoiceModal, GameState, LogEntry, ModalItem, NoticeModal } from '../src/game/types'
import { makeTestGame } from './helpers'

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
const { loadGame } = await import('../src/game/save')
const { defineScript, runScript } = await import('../src/game/scripts')
const { log, notice, scriptChoice } = await import('../src/game/core')

const game = (): GameState => store.getApp().game as GameState

function setQueue(items: ModalItem[]): void {
  store.act((g) => {
    g.queue = items
  })
}

/** The popups waiting, as "title" for a notice and "choice:title" for a choice. */
const queued = (): string[] => game().queue.map((m) => (m.kind === 'notice' ? m.title : m.kind === 'choice' ? `choice:${m.title}` : m.kind))

/** The lines of this year's log. */
function yearLines(g: GameState = game()): LogEntry[] {
  const tail = g.log[g.log.length - 1]
  return tail && tail.age === g.character.age ? tail.entries : []
}
const outLines = (g: GameState = game()): LogEntry[] => yearLines(g).filter((e) => e.id.startsWith('out-'))

// The scripts of a choice that leads to one outcome: each answers with the notices it is named for. A title with a row in NOTICE_WEIGHTS carries
// its weight (Kindness 1, Squabble 0, Diagnosis 3); a title with none is read as 2.
const CALM = defineScript('test.outcomes.calm', (g) => notice(g, 'Kindness', 'You held the door for a neighbor.', { tone: 'good' }))
const CALM_LINE = defineScript('test.outcomes.calm-line', (g) => {
  notice(g, 'Kindness', 'You held the door for a neighbor.', { tone: 'good' })
  log(g, 'I held the door for a neighbor.', 'good', undefined, { w: 1 })
})
const CALM_TWO = defineScript('test.outcomes.calm-two', (g) => {
  notice(g, 'Kindness', 'You shared your lunch.', { tone: 'good' })
  notice(g, 'Helpful', 'You carried a bag upstairs.', { tone: 'good' })
})
const CALM_MINOR = defineScript('test.outcomes.calm-minor', (g) => notice(g, 'Report Card', 'You kept your grades up.', { tone: 'good' }))
const BAD = defineScript('test.outcomes.bad', (g) => notice(g, 'Squabble', 'You and your sibling argued all afternoon.', { tone: 'bad' }))
const BAD_AND_CALM = defineScript('test.outcomes.bad-and-calm', (g) => {
  notice(g, 'Kindness', 'You shared your lunch.', { tone: 'good' })
  notice(g, 'Squabble', 'Then you argued about the bill.', { tone: 'bad' })
})
const PLAIN = defineScript('test.outcomes.plain', (g) => notice(g, 'An Odd Afternoon', 'Nothing came of it, but you remember it.', { tone: 'neutral' }))
const HEALTH = defineScript('test.outcomes.health', (g) => notice(g, 'Kindness', 'You drove a neighbor to the hospital.', { tone: 'good' }))
const LEGAL = defineScript('test.outcomes.legal', (g) => notice(g, 'Kindness', 'The police thanked you for your help.', { tone: 'good' }))
const MONEY = defineScript('test.outcomes.money', (g) => notice(g, 'Kindness', 'You gave $25,000 to a stranger.', { tone: 'good' }))
const MONEY_A = defineScript('test.outcomes.money-a', (g) => notice(g, 'Kindness', 'You paid a neighbor back.', { tone: 'good', a: 50_000 }))
const LIFE = defineScript('test.outcomes.life', (g) => notice(g, 'Diagnosis', 'The tests came back.', { tone: 'neutral' }))
const SUPPORT = defineScript('test.outcomes.support', (g) => notice(g, 'Kindness', 'You listened.', { tone: 'good', support: true }))
const LEADS_ON = defineScript('test.outcomes.leads-on', (g) => {
  notice(g, 'Kindness', 'You held the door for a neighbor.', { tone: 'good' })
  scriptChoice(g, 'test.outcomes.calm', 'Next', 'The neighbor asks something else.', [{ id: 'a', label: 'Sure' }])
})
const DIES = defineScript('test.outcomes.dies', (g) => {
  notice(g, 'Kindness', 'You held the door for a neighbor.', { tone: 'good' })
  g.character.alive = false
})

/** The life every case starts from: [seed, birth year]. A tuple, so the seed-pin ratchet has no `seed: <digits>` line to count. */
const START = [3, 2026] as const

function ask(scriptId: string, id = 'c1'): ChoiceModal {
  return {
    kind: 'choice',
    id,
    title: `Pick ${id}`,
    text: 'What do you do?',
    choices: [
      { id: 'a', label: 'First' },
      { id: 'b', label: 'Second' },
    ],
    source: 'script',
    scriptId,
  }
}

/** The player answers the choice `scriptId` runs. */
function answer(scriptId: string, id = 'c1'): void {
  setQueue([ask(scriptId, id)])
  store.chooseOption(id, 'a')
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  store.updateSettings({ quietMode: true })
  setFlags({ quietInbox: true, yearCard: true })
  store.startNewLife({ seed: START[0], year: START[1] })
  setQueue([])
})

afterEach(() => {
  resetFlags()
  store.updateSettings({ quietMode: true })
  vi.restoreAllMocks()
})

describe('a calm outcome of an answered choice goes to the life log', () => {
  it('is no popup: the queue is empty, and the log has one line with the title, the text, the tone and the weight', () => {
    answer(CALM)
    expect(game().queue).toEqual([])
    expect(outLines()).toHaveLength(1)
    const line = outLines()[0]!
    expect(line).toMatchObject({ text: 'Kindness: You held the door for a neighbor.', tone: 'good', w: 1 })
    // The player's own answer has no source, so the close never touches the line.
    expect(line.s).toBeUndefined()
  })

  it('a title with the minor weight goes to the log and not to the inbox', () => {
    answer(CALM_MINOR)
    expect(game().queue).toEqual([])
    expect(outLines()).toHaveLength(1)
    expect(outLines()[0]).toMatchObject({ text: 'Report Card: You kept your grades up.', w: 1 })
    expect(readInbox(game()).items).toEqual([])
  })

  it('adds no second line when the answer wrote its own: that line is the record', () => {
    const had = yearLines().length
    answer(CALM_LINE)
    expect(game().queue).toEqual([])
    expect(outLines()).toEqual([])
    expect(yearLines().slice(had).map((e) => e.text)).toEqual(['I held the door for a neighbor.'])
  })

  it('every calm outcome of one answer goes: two popups gone, two lines', () => {
    answer(CALM_TWO)
    expect(game().queue).toEqual([])
    expect(outLines().map((e) => e.text)).toEqual(['Kindness: You shared your lunch.', 'Helpful: You carried a bag upstairs.'])
  })

  it('makes no id of its own: the line takes the id of its notice, and the id counter is where the notice left it', () => {
    const before = structuredClone(game())
    answer(CALM)
    // The notice took one id (its own), the choice none: answering must not take another for the line.
    const noticeId = `m${before.nextId + 1}`
    expect(outLines()[0]!.id).toBe(`out-${game().generation}-${game().year}-${noticeId}`)
    expect(game().nextId).toBe(before.nextId + 1)
  })

  it('is saved with the life: the line is in the saved log and the queue is empty', () => {
    answer(CALM)
    const saved = loadGame() as GameState
    expect(saved.queue).toEqual([])
    expect(outLines(saved)).toHaveLength(1)
  })

  it('a sentence told within 10 years is not written twice: the first telling stands', () => {
    answer(CALM)
    answer(CALM, 'c2')
    expect(game().queue).toEqual([])
    expect(outLines()).toHaveLength(1)
  })

  it('touches only what the answer queued: a calm notice that was already waiting stays', () => {
    setQueue([{ kind: 'notice', id: 'w1', title: 'Kindness', text: 'Someone thanked you.', tone: 'good', w: 1 } as NoticeModal, ask(CALM)])
    store.chooseOption('c1', 'a')
    expect(queued()).toEqual(['Kindness'])
    expect(game().queue[0]!.id).toBe('w1')
    expect(outLines()).toHaveLength(1)
  })
})

describe('what an answer still shows as a popup', () => {
  it('a bad-tone outcome pops, even when its title is weight 0, and writes no line of its own', () => {
    answer(BAD)
    expect(queued()).toEqual(['Squabble'])
    expect(outLines()).toEqual([])
  })

  it('a calm outcome goes and a bad one beside it stays', () => {
    answer(BAD_AND_CALM)
    expect(queued()).toEqual(['Squabble'])
    expect(outLines().map((e) => e.text)).toEqual(['Kindness: You shared your lunch.'])
  })

  it.each([
    ['a title the weight table does not know (read as 2)', PLAIN, 'An Odd Afternoon'],
    ['a health word', HEALTH, 'Kindness'],
    ['a legal word', LEGAL, 'Kindness'],
    ['a large figure in the text', MONEY, 'Kindness'],
    ['a large amount the popup carries', MONEY_A, 'Kindness'],
    ['a life-changing title (weight 3)', LIFE, 'Diagnosis'],
    ['the support line', SUPPORT, 'Kindness'],
  ])('%s pops', (_what, script, title) => {
    answer(script)
    expect(queued()).toEqual([title])
    expect(outLines()).toEqual([])
  })

  it('an answer that leads to another choice keeps its notice, in front of that choice', () => {
    answer(LEADS_ON)
    expect(queued()).toEqual(['Kindness', 'choice:Next'])
    expect(outLines()).toEqual([])
  })

  it('a character who died in the answer keeps the popup', () => {
    answer(DIES)
    expect(queued()).toEqual(['Kindness'])
    expect(outLines()).toEqual([])
  })
})

describe('when it does nothing', () => {
  it('Quiet Mode off: the outcome is a popup, as it always was', () => {
    store.updateSettings({ quietMode: false })
    answer(CALM)
    expect(queued()).toEqual(['Kindness'])
    expect(outLines()).toEqual([])
  })

  it('the yearCard flag off: the outcome is a popup, as it always was', () => {
    setFlags({ yearCard: false })
    answer(CALM)
    expect(queued()).toEqual(['Kindness'])
    expect(outLines()).toEqual([])
  })

  it('headless runScript never does it: the same answer leaves the calm notice in g.queue and no line', () => {
    const g = structuredClone(game())
    runScript(g, CALM, 'a', undefined, ask(CALM))
    expect(g.queue.map((m) => (m.kind === 'notice' ? m.title : m.kind))).toEqual(['Kindness'])
    expect(outLines(g)).toEqual([])
  })

  it('a menu action is not an answered choice: its notices stay', () => {
    store.act((g) => notice(g, 'Kindness', 'You held the door for a neighbor.', { tone: 'good' }))
    expect(queued()).toEqual(['Kindness'])
    expect(outLines()).toEqual([])
  })
})

describe('the rule itself, without the store', () => {
  const N = (extra: Partial<NoticeModal>): NoticeModal => ({ kind: 'notice', id: 'n1', title: 'An Odd Afternoon', text: 'Nothing came of it.', ...extra })

  it.each<[string, Partial<NoticeModal>, boolean]>([
    ['its own weight 0', { w: 0 }, true],
    ['its own weight 1', { w: 1 }, true],
    ['its own weight 2', { w: 2 }, false],
    ['a title with a row at 1', { title: 'Kindness' }, true],
    ['a title with a row at 0', { title: 'Squabble' }, true],
    ['a title with a row at 2', { title: 'Promotion' }, false],
    ['a title with a row at 3', { title: 'Divorce' }, false],
    ['the minor weight and no row', { weight: 'minor' }, true],
    ['no weight and no row (read as 2)', {}, false],
    ['weight 0 and a bad tone', { w: 0, tone: 'bad' }, false],
    ['weight 1 and the support line', { w: 1, support: true }, false],
    ['weight 1 and a health word', { w: 1, text: 'You felt sick.' }, false],
    ['weight 1 and a legal word', { w: 1, text: 'A lawyer called.' }, false],
    ['weight 1 and $9,999 in the text', { w: 1, text: 'You found $9,999.' }, true],
    ['weight 1 and $10,000 in the text', { w: 1, text: 'You found $10,000.' }, false],
    ['weight 1 and an amount of 9,999', { w: 1, a: 9_999 }, true],
    ['weight 1 and an amount of 10,000', { w: 1, a: 10_000 }, false],
    ['weight 1 and a loss of 10,000', { w: 1, a: -10_000 }, false],
  ])('%s: calm is %s', (_what, extra, calm) => {
    expect(calmOutcome(N(extra))).toBe(calm)
  })

  it('a year card, a choice, an input and a task are never calm outcomes', () => {
    expect(calmOutcome(N({ w: 0, digest: { v: 1, year: 2026, age: 1, head: 'A year.', stories: [], groups: [] } }))).toBe(false)
    expect(calmOutcome(ask(CALM))).toBe(false)
    expect(calmOutcome({ kind: 'aiTask', id: 't1', task: { type: 'yearEvents' } })).toBe(false)
  })

  it('settleAnswer on a game with nothing new in the queue does nothing', () => {
    const g = makeTestGame()
    g.queue = [N({ w: 1 })]
    const mark = markAnswer(g)
    expect(settleAnswer(g, mark)).toBe(0)
    expect(g.queue).toHaveLength(1)
  })

  it('never throws: a damaged log leaves the queue as the answer made it and says so', () => {
    const g = makeTestGame()
    const mark = markAnswer(g)
    g.queue.push(N({ id: 'n2', w: 1 }))
    ;(g as unknown as { log: unknown }).log = null
    expect(() => settleAnswer(g, mark)).not.toThrow()
    expect(settleAnswer(g, mark)).toBe(0)
    expect(g.queue).toHaveLength(1)
    expect(console.error).toHaveBeenCalled()
  })

  it('the marks of two answers do not mix: only what an answer added goes', () => {
    const g = makeTestGame()
    g.queue = [N({ id: 'old', w: 1 })]
    const mark = markAnswer(g)
    g.queue.push(N({ id: 'new', w: 1, title: 'Kindness' }))
    expect(settleAnswer(g, mark)).toBe(1)
    expect(g.queue.map((m) => m.id)).toEqual(['old'])
    expect(g.log[g.log.length - 1]!.entries.map((e) => e.id)).toEqual([`out-${g.generation}-${g.year}-new`])
  })
})
