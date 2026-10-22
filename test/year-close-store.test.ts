// R3-Q4 (E.D2 b): the year close in the real store. With FLAGS.yearCard and Quiet Mode both on, ageUpAction runs ageUp and closeYear in one act(): the
// year events are chosen, the small notices fold, and the queue ends with the year card. With either off the year is played the old way.
// A close that fails must never cost the player the year: the year is played the old way instead. Headless ageUp is not touched.
// The real store is used with a localStorage shim, the way test/quiet-routing.test.ts does.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyFallback } from '../src/game/offline'
import { resetFlags, setFlags } from '../src/game/flags'
import { readYearBook } from '../src/game/hubs/year-book'
import type { ChoiceModal, GameState, ModalItem, NoticeModal } from '../src/game/types'
import { findSeed } from './seed-kit'

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

// The real close, wrapped so a test can make it fail once, and the real yearly loop, wrapped for the same reason.
const wrapped = vi.hoisted(() => ({ closeYear: vi.fn(), ageUp: vi.fn() }))
vi.mock('../src/game/hubs/year-close', async (orig) => {
  const real = await orig<typeof import('../src/game/hubs/year-close')>()
  wrapped.closeYear.mockImplementation(real.closeYear)
  return { ...real, closeYear: wrapped.closeYear }
})
vi.mock('../src/game/aging', async (orig) => {
  const real = await orig<typeof import('../src/game/aging')>()
  wrapped.ageUp.mockImplementation(real.ageUp)
  return { ...real, ageUp: wrapped.ageUp }
})

const store = await import('../src/ui/store')
const { ageUp } = await vi.importActual<typeof import('../src/game/aging')>('../src/game/aging')
const { closeYear: realClose } = await vi.importActual<typeof import('../src/game/hubs/year-close')>('../src/game/hubs/year-close')

function game(): GameState {
  return store.getApp().game as GameState
}

function setQueue(items: ModalItem[]): void {
  store.act((g) => {
    g.queue = items
  })
}

/** A new life at 25 with an empty queue, in the store. */
function freshLife(seed = 3): void {
  store.startNewLife({ seed, year: 2026 })
  store.act((g) => {
    g.queue = []
    g.character.age = 25
  })
}

const cardOf = (g: GameState): NoticeModal | undefined => g.queue.find((m): m is NoticeModal => m.kind === 'notice' && m.digest !== undefined)
const lastIsCard = (g: GameState): boolean => {
  const m = g.queue[g.queue.length - 1]
  return !!m && m.kind === 'notice' && m.digest !== undefined
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  wrapped.closeYear.mockReset()
  wrapped.closeYear.mockImplementation(realClose)
  wrapped.ageUp.mockReset()
  wrapped.ageUp.mockImplementation(ageUp)
  store.updateSettings({ quietMode: true })
  setFlags({ quietInbox: true })
  freshLife()
})

afterEach(() => {
  resetFlags()
  store.updateSettings({ quietMode: true })
  vi.restoreAllMocks()
})

describe('ageUpAction with the flag off', () => {
  it('plays the year the old way: no close, no card, no year book', () => {
    store.ageUpAction()
    expect(game().character.age).toBe(26)
    expect(wrapped.closeYear).not.toHaveBeenCalled()
    expect(cardOf(game())).toBeUndefined()
    expect('yearBook' in game().flags).toBe(false)
  })

  it.each([
    ['the flag off', false, true],
    ['Quiet Mode off', true, false],
  ])('equals plain ageUp followed by the store resolving the task at the head: %s', (_label, flag, quiet) => {
    setFlags({ yearCard: flag, quietInbox: false })
    store.updateSettings({ quietMode: quiet })
    const base = structuredClone(game())
    const headless = structuredClone(base)
    ageUp(headless)
    // What processQueue does with a task at the head: resolve it, and its popups take its place.
    while (headless.queue[0]?.kind === 'aiTask') {
      const task = headless.queue.shift() as Extract<ModalItem, { kind: 'aiTask' }>
      const rest = headless.queue.length
      applyFallback(headless, task.task)
      headless.queue.unshift(...headless.queue.splice(rest))
    }
    store.ageUpAction()
    expect(wrapped.closeYear).not.toHaveBeenCalled()
    expect(JSON.stringify(game().queue)).toBe(JSON.stringify(headless.queue))
    expect(game().rng).toBe(headless.rng)
    expect(JSON.stringify(game().log)).toBe(JSON.stringify(headless.log))
    expect(JSON.stringify(game().character)).toBe(JSON.stringify(headless.character))
  })
})

describe('ageUpAction with the flag on', () => {
  beforeEach(() => {
    setFlags({ quietInbox: true, yearCard: true })
  })

  it('closes the year once: the queue ends with the card, and the year book has the year', () => {
    store.ageUpAction()
    const g = game()
    expect(g.character.age).toBe(26)
    expect(wrapped.closeYear).toHaveBeenCalledTimes(1)
    expect(lastIsCard(g)).toBe(true)
    expect(g.queue.some((m) => m.kind === 'aiTask' && m.task.type === 'yearEvents')).toBe(false)
    expect(readYearBook(g)).toMatchObject({ last: g.year, shown: 1 })
    expect(cardOf(g)!.digest!.year).toBe(g.year)
  })

  it('dismissNotice on the card clears it, and the next year closes again', () => {
    store.ageUpAction()
    const card = cardOf(game())!
    store.dismissNotice(card.id)
    expect(cardOf(game())).toBeUndefined()
    // Answer whatever else is waiting, then age again.
    setQueue([])
    store.ageUpAction()
    expect(wrapped.closeYear).toHaveBeenCalledTimes(2)
    expect(readYearBook(game()).shown).toBe(2)
    expect(cardOf(game())!.id).not.toBe(card.id)
  })

  it('is saved with the life: the card is in the saved queue and the book in the saved flags', async () => {
    store.ageUpAction()
    const { loadGame } = await import('../src/game/save')
    const saved = loadGame() as GameState
    expect(saved.queue[saved.queue.length - 1]).toMatchObject({ kind: 'notice', digest: { year: game().year } })
    expect(readYearBook(saved).last).toBe(game().year)
  })

  it('does not close when Quiet Mode is off', () => {
    store.updateSettings({ quietMode: false })
    store.ageUpAction()
    expect(wrapped.closeYear).not.toHaveBeenCalled()
    expect(cardOf(game())).toBeUndefined()
    expect('yearBook' in game().flags).toBe(false)
  })

  it('does not age a dead character, or one with popups waiting', () => {
    setQueue([{ kind: 'notice', id: 'n1', title: 'Wait', text: 'Answer me first.' }])
    store.ageUpAction()
    expect(game().character.age).toBe(25)
    expect(wrapped.closeYear).not.toHaveBeenCalled()
  })

  it('a close that throws leaves a playable year: the year is played the old way, and the error is logged', () => {
    wrapped.closeYear.mockImplementationOnce(() => {
      throw new Error('broken close')
    })
    expect(() => store.ageUpAction()).not.toThrow()
    const g = game()
    expect(g.character.age).toBe(26)
    expect(cardOf(g)).toBeUndefined()
    expect('yearBook' in g.flags).toBe(false)
    expect(console.error).toHaveBeenCalledWith('Closing the year failed:', expect.objectContaining({ message: 'broken close' }))
    expect(g.queue.some((m) => m.kind === 'notice' && m.title === 'Something Went Wrong')).toBe(false)
    // The next year closes as usual.
    setQueue([])
    store.ageUpAction()
    expect(game().character.age).toBe(27)
    expect(lastIsCard(game())).toBe(true)
  })

  it('a yearly hook that throws still keeps the last good year and says so (the catch path is the old one)', () => {
    wrapped.ageUp.mockImplementationOnce((g: GameState) => {
      g.character.age += 1
      throw new Error('broken yearly hook')
    })
    store.ageUpAction()
    expect(game().character.age).toBe(25)
    expect(console.error).toHaveBeenCalledWith('Ageing up failed:', expect.objectContaining({ message: 'broken yearly hook' }))
    expect(game().queue[0]).toMatchObject({ kind: 'notice', title: 'Something Went Wrong' })
    expect(wrapped.closeYear).not.toHaveBeenCalled()
  })
})

describe('the year event is the one the old order picks', () => {
  it('when the hook popups change nothing, the close picks the event the old order would have picked', () => {
    // A year whose hooks queue only notices: answering them changes no state, so the order of "answer, then resolve the task" and
    // "resolve the task, then answer" starts the year-events draw from the same state.
    const seed = findSeed(
      (s) => {
        freshLife(s)
        const probe = structuredClone(game())
        ageUp(probe)
        if (!probe.queue.every((m) => m.kind === 'notice' || m.kind === 'aiTask')) return false
        const task = probe.queue.find((m) => m.kind === 'aiTask')
        if (!task || task.kind !== 'aiTask') return false
        // The year must have an event to pick, or the comparison below proves nothing.
        probe.queue = []
        applyFallback(probe, task.task)
        return probe.queue.some((m) => m.kind === 'choice')
      },
      { label: 'a year with notices, the task and an event' },
    )
    freshLife(seed)
    const base = structuredClone(game())

    // The old order, headless: the notices answered (removed), then the task resolved.
    const old = structuredClone(base)
    ageUp(old)
    const task = old.queue.find((m) => m.kind === 'aiTask')!
    old.queue = []
    applyFallback(old, (task as Extract<ModalItem, { kind: 'aiTask' }>).task)

    setFlags({ quietInbox: true, yearCard: true })
    store.ageUpAction()
    const events = (g: GameState): unknown[] =>
      g.queue
        .filter((m): m is ChoiceModal => m.kind === 'choice' && m.s === 'events')
        .map((m) => ({ title: m.title, scriptId: m.scriptId, data: m.data, choices: m.choices.map((c) => c.id) }))
    const eventsOld = old.queue.filter((m): m is ChoiceModal => m.kind === 'choice').map((m) => ({ title: m.title, scriptId: m.scriptId, data: m.data, choices: m.choices.map((c) => c.id) }))
    expect(eventsOld.length).toBeGreaterThan(0)
    expect(events(game())).toEqual(eventsOld)
    expect(game().rng).toBe(old.rng)
  })
})
