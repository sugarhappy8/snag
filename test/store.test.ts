// The store's modal queue: built-in tasks (the 'aiTask' modal kind) resolve offline, instantly and
// exactly once the moment they reach the head of the queue, with no spinner or busy state; a
// broken handler never leaves a popup that can't be closed; old saves with a queued task, a
// narration request or narrator lines load and play on; old AI settings are wiped at startup.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GameState, ModalItem, NoticeModal } from '../src/game/types'

// Minimal in-memory localStorage, installed before the store loads its settings. It starts with
// settings saved by a version that still had an AI narrator (API key, provider, model...).
const storage = vi.hoisted(() => {
  const data = new Map<string, string>()
  data.set(
    'anotherlife.settings.v1',
    JSON.stringify({
      aiLevel: 'balanced',
      provider: 'anthropic',
      setupDone: true,
      baseUrl: 'https://api.example.test/v1',
      apiKey: 'sk-secret-key',
      model: 'some-model',
      providerConfigs: { openai: { baseUrl: 'https://api.example.test/v1', apiKey: 'sk-other-secret', model: '' } },
      temperature: 0.7,
      showAiBadges: true,
      money: 'usd',
      prices: 'today',
      sandboxTimeMachine: true,
    }),
  )
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

// The real offline resolver, wrapped so tests can count calls or make it fail once.
const offline = vi.hoisted(() => ({ resolve: vi.fn() }))
vi.mock('../src/game/offline', async (orig) => {
  const real = await orig<typeof import('../src/game/offline')>()
  offline.resolve.mockImplementation(real.resolveTask)
  return { ...real, applyFallback: offline.resolve, resolveTask: offline.resolve }
})

const settingsAtStartup = storage.get('anotherlife.settings.v1')
const store = await import('../src/ui/store')
const settingsAfterStartup = storage.get('anotherlife.settings.v1')
const real = await vi.importActual<typeof import('../src/game/offline')>('../src/game/offline')
const { defineScript } = await import('../src/game/scripts')
const { saveGame, loadGame, snapshotWritesSettled } = await import('../src/game/save')

function game(): GameState {
  return store.getApp().game as GameState
}

function setQueue(items: ModalItem[]): void {
  store.act((g) => {
    g.queue = items
  })
}

function tasksLeft(): ModalItem[] {
  return game().queue.filter((m) => m.kind === 'aiTask')
}

const job = { defId: 'cashier', title: 'Cashier', company: 'Corner Mart', salary: 24_000, category: 'fulltime' as const }

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  offline.resolve.mockReset()
  offline.resolve.mockImplementation(real.resolveTask)
  store.startNewLife({ seed: 3, year: 2026 })
  store.act((g) => {
    g.queue = []
    g.character.age = 25
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('startup', () => {
  it('keeps unsaved progress in memory, warns, and retries without replaying actions', async () => {
    await snapshotWritesSettled()
    const before = game().character.money
    const write = vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError') })
    store.act(g => { g.character.money += 12345 })
    expect(store.getApp().saveError).toBe(true)
    expect(game().character.money).toBe(before + 12345)
    expect(loadGame()!.character.money).toBe(before)
    store.resumeSavedGame()
    expect(game().character.money).toBe(before + 12345)
    store.retrySave()
    expect(store.getApp().saveError).toBe(true)
    write.mockRestore()
    store.retrySave()
    expect(store.getApp().saveError).toBe(false)
    expect(loadGame()!.character.money).toBe(before + 12345)
  })

  it('deletes the stored API keys and AI provider settings, keeping the rest', () => {
    expect(settingsAtStartup).toContain('sk-secret-key')
    expect(settingsAfterStartup).toBeDefined()
    expect(settingsAfterStartup).not.toMatch(/sk-|apiKey|provider|baseUrl|model|aiLevel|setupDone|temperature|showAiBadges/)
    expect(JSON.parse(settingsAfterStartup!)).toEqual({ money: 'usd', prices: 'today', sandboxTimeMachine: true })
    expect(store.getApp().settings).toEqual({ money: 'usd', prices: 'today', sandboxTimeMachine: true })
  })

  it('never stores anything but the known settings', () => {
    store.updateSettings({ money: 'local', apiKey: 'sk-sneaky' } as never)
    expect(store.getApp().settings).toEqual({ money: 'local', prices: 'today', sandboxTimeMachine: true })
    expect(storage.get('anotherlife.settings.v1')).not.toContain('sk-sneaky')
    store.updateSettings({ money: 'usd' })
  })

  it('starts on the main menu: there is no setup screen', () => {
    expect(['home', 'newLife', 'game', 'settings', 'ribbons', 'graveyard']).toContain(store.getApp().screen)
    store.goTo('home')
    expect(store.getApp().screen).toBe('home')
  })
})

describe('built-in tasks', () => {
  it('resolve the moment they reach the head of the queue, with no busy state', () => {
    setQueue([{ kind: 'aiTask', id: 'task1', task: { type: 'yearEvents' } }])
    expect(offline.resolve).toHaveBeenCalledTimes(1)
    expect(tasksLeft()).toEqual([])
    expect('ai' in store.getApp()).toBe(false)
    // Whatever the year brought is ordinary popups and log lines.
    for (const m of game().queue) expect(['notice', 'choice', 'input', 'minigame']).toContain(m.kind)
  })

  it('resolve exactly once however often the queue is processed (StrictMode effects)', () => {
    setQueue([{ kind: 'aiTask', id: 'task1', task: { type: 'interview', job } }])
    for (let i = 0; i < 5; i++) store.processQueue()
    expect(offline.resolve).toHaveBeenCalledTimes(1)
    const popups = game().queue.filter((m) => m.kind === 'choice' && m.title === 'Job Interview')
    expect(popups).toHaveLength(1)
  })

  it('wait behind a popup and resolve as soon as it is answered, keeping the order', () => {
    setQueue([
      { kind: 'notice', id: 'n1', title: 'First', text: 'Read me first.' },
      { kind: 'aiTask', id: 'task1', task: { type: 'interview', job } },
      { kind: 'notice', id: 'n2', title: 'Last', text: 'Read me last.' },
    ])
    expect(offline.resolve).not.toHaveBeenCalled()
    expect(game().queue.map((m) => m.id)).toEqual(['n1', 'task1', 'n2'])
    store.dismissNotice('n1')
    expect(offline.resolve).toHaveBeenCalledTimes(1)
    const kinds = game().queue.map((m) => (m.kind === 'notice' ? m.title : m.kind === 'choice' ? m.title : m.kind))
    expect(kinds).toEqual(['Job Interview', 'Last'])
  })

  it('resolve a run of tasks in one go, each producing its own popups in order', () => {
    setQueue([
      { kind: 'aiTask', id: 't1', task: { type: 'customAction', text: 'go to the gym' } },
      { kind: 'aiTask', id: 't2', task: { type: 'interview', job } },
    ])
    expect(offline.resolve).toHaveBeenCalledTimes(1)
    expect(game().queue[0].kind).toBe('notice')
    store.dismissNotice(game().queue[0].id)
    expect(offline.resolve).toHaveBeenCalledTimes(2)
    expect(tasksLeft()).toEqual([])
    expect(game().queue.some((m) => m.kind === 'choice' && m.title === 'Job Interview')).toBe(true)
  })

  it('drop a task whose resolver throws instead of leaving the queue stuck', () => {
    offline.resolve.mockImplementationOnce(() => {
      throw new Error('broken resolver')
    })
    setQueue([
      { kind: 'aiTask', id: 'task1', task: { type: 'yearEvents' } },
      { kind: 'notice', id: 'n1', title: 'Still here', text: 'Next popup.' },
    ])
    expect(game().queue.map((m) => m.id)).toEqual(['n1'])
  })

  it('give the dead an obituary and nothing else', () => {
    store.act((g) => {
      g.character.alive = false
      g.character.causeOfDeath = 'Old Age'
      g.queue = [
        { kind: 'aiTask', id: 't1', task: { type: 'yearEvents' } },
        { kind: 'aiTask', id: 't2', task: { type: 'obituary' } },
      ]
    })
    expect(game().queue).toEqual([])
    expect(game().obituary).toMatch(/Test|\w+/)
    expect(game().obituary!.length).toBeGreaterThan(20)
  })
})

describe('event choices', () => {
  it('an event the old AI narrator wrote (no script) gets the generic offline outcome at once', () => {
    setQueue([
      {
        kind: 'choice',
        id: 'legacy',
        title: 'Stray Dog',
        text: 'A stray dog follows you home. What will you do?',
        choices: [
          { id: 'a', label: 'Adopt it' },
          { id: 'b', label: 'Shoo it away' },
        ],
        source: 'ai',
      },
    ])
    store.chooseOption('legacy', 'a')
    expect(tasksLeft()).toEqual([])
    expect(offline.resolve).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: 'resolveChoice', choiceId: 'a' }))
    expect(game().queue.some((m) => m.kind === 'notice')).toBe(true)
    expect(game().queue.some((m) => m.id === 'legacy')).toBe(false)
  })

  it('closes a script popup whose handler throws', () => {
    defineScript('test.store.boom', () => {
      throw new Error('boom')
    })
    setQueue([{ kind: 'choice', id: 'c1', title: 'Boom', text: '?', choices: [{ id: 'a', label: 'A' }], source: 'script', scriptId: 'test.store.boom' }])
    store.chooseOption('c1', 'a')
    expect(game().queue).toHaveLength(0)
  })
})

describe('old saves', () => {
  it('load with a queued task, a narration request and narrator lines, and play on', () => {
    const g = structuredClone(game())
    const legacyNotice = { kind: 'notice', id: 'old-notice', title: 'Spend Time', text: 'You went bowling with your mother.', ai: { when: 'balanced', facts: 'went bowling' } }
    g.queue = [legacyNotice as unknown as NoticeModal, { kind: 'aiTask', id: 'old-task', task: { type: 'yearEvents' } }]
    g.log[g.log.length - 1].entries.push({ id: 'old-line', text: 'I found a shiny rock.', tone: 'ai' as never })
    g.flags.aiRecentEvents = ['Stray Dog']
    g.flags.obituarySource = 'ai'
    saveGame(g)

    expect(store.resumeSavedGame()).toBe(true)
    const loaded = game()
    // The narration request is gone; the notice itself is shown as written.
    expect(loaded.queue[0]).toEqual({ kind: 'notice', id: 'old-notice', title: 'Spend Time', text: 'You went bowling with your mother.' })
    // The narrator's line reads like any other.
    const line = loaded.log.flatMap((y) => y.entries).find((e) => e.id === 'old-line')
    expect(line?.tone).toBe('neutral')
    expect(loaded.flags.aiRecentEvents).toBeUndefined()
    expect(loaded.flags.obituarySource).toBeUndefined()
    // The task waits behind the notice, then resolves offline.
    expect(loaded.queue[1]).toMatchObject({ kind: 'aiTask', id: 'old-task' })
    store.dismissNotice('old-notice')
    expect(tasksLeft()).toEqual([])
    expect(offline.resolve).toHaveBeenCalledTimes(1)
  })

  it('a damaged queue entry at the head never blocks the life', () => {
    const g = structuredClone(game())
    g.queue = [null, { kind: 'chat', id: 'x' }, { kind: 'aiTask', id: 'old-task', task: { type: 'interview', job } }] as unknown as ModalItem[]
    saveGame(g)
    expect(store.resumeSavedGame()).toBe(true)
    expect(tasksLeft()).toEqual([])
    const interview = game().queue.find((m) => m.kind === 'choice' && m.title === 'Job Interview')
    expect(interview).toBeDefined()
    store.chooseOption(interview!.id, (interview as { choices: { id: string }[] }).choices[0].id)
    while (game().queue.length) {
      const head = game().queue[0]
      if (head.kind === 'choice') store.chooseOption(head.id, head.choices[0].id)
      else store.dismissNotice(head.id)
    }
    const age = game().character.age
    store.ageUpAction()
    expect(game().character.age).toBe(age + 1)
  })

  it('resolve a task left at the head of the queue as soon as they load', () => {
    const g = structuredClone(game())
    g.queue = [{ kind: 'aiTask', id: 'old-task', task: { type: 'interview', job } }]
    saveGame(g)
    expect(store.resumeSavedGame()).toBe(true)
    expect(tasksLeft()).toEqual([])
    expect(game().queue.some((m) => m.kind === 'choice' && m.title === 'Job Interview')).toBe(true)
  })
})
