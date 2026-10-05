// The store's modal queue and AI task runner: Skip always finishes, and a broken handler
// or AI result never leaves a popup that can't be closed.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GameState, ModalItem } from '../src/game/types'

const director = vi.hoisted(() => ({
  runAiTask: vi.fn(),
  applyFallback: vi.fn(),
  narrateNotice: vi.fn(),
  testConnection: vi.fn(),
}))
vi.mock('../src/ai/director', () => director)

const store = await import('../src/ui/store')
const { defineScript } = await import('../src/game/scripts')
const { notice } = await import('../src/game/core')

function game(): GameState {
  return store.getApp().game as GameState
}

function setQueue(items: ModalItem[]): void {
  store.act((g) => {
    g.queue = items
  })
}

const yearTask: ModalItem = { kind: 'aiTask', id: 'task1', task: { type: 'yearEvents' } }

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  director.runAiTask.mockReset()
  director.applyFallback.mockReset()
  director.narrateNotice.mockReset()
  store.updateSettings({ aiLevel: 'off' })
  store.startNewLife({ seed: 3, year: 2026 })
  setQueue([])
  store.updateSettings({ aiLevel: 'balanced' })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('AI task queue', () => {
  it('Skip finishes with the fallback even if the request never settles', () => {
    director.runAiTask.mockReturnValue(new Promise(() => {}))
    director.applyFallback.mockImplementation((g: GameState) => notice(g, 'Offline', 'Fallback story.'))
    setQueue([yearTask])
    expect(store.getApp().ai?.modalId).toBe('task1')
    store.skipAi()
    expect(store.getApp().ai).toBeNull()
    expect(game().queue.map((m) => m.kind === 'notice' && m.title)).toEqual(['Offline'])
  })

  it('falls back when applying the AI result throws', async () => {
    director.runAiTask.mockResolvedValue(() => {
      throw new Error('bad AI result')
    })
    director.applyFallback.mockImplementation((g: GameState) => notice(g, 'Offline', 'Fallback story.'))
    setQueue([yearTask])
    await vi.waitFor(() => expect(store.getApp().ai).toBeNull())
    expect(game().queue.map((m) => m.kind === 'notice' && m.title)).toEqual(['Offline'])
  })

  it('drops the task when the fallback throws too (AI off)', () => {
    store.updateSettings({ aiLevel: 'off' })
    director.applyFallback.mockImplementation(() => {
      throw new Error('broken fallback')
    })
    setQueue([yearTask])
    expect(game().queue).toHaveLength(0)
  })
})

describe('popups', () => {
  it('closes a script popup whose handler throws', () => {
    defineScript('test.store.boom', () => {
      throw new Error('boom')
    })
    setQueue([{ kind: 'choice', id: 'c1', title: 'Boom', text: '?', choices: [{ id: 'a', label: 'A' }], source: 'script', scriptId: 'test.store.boom' }])
    store.chooseOption('c1', 'a')
    expect(game().queue).toHaveLength(0)
  })
})

describe('AI setup', () => {
  it('"Play without AI" turns narration off, finishes setup and goes home', () => {
    store.updateSettings({ setupDone: false })
    store.goTo('aiSetup')
    store.finishAiSetup(null)
    const app = store.getApp()
    expect(app.settings.aiLevel).toBe('off')
    expect(app.settings.setupDone).toBe(true)
    expect(app.screen).toBe('home')
  })

  it('saves the chosen provider, turns narration on and checks the connection', async () => {
    store.updateSettings({ setupDone: false, aiLevel: 'off', provider: 'lmstudio', baseUrl: 'http://localhost:1234/v1', apiKey: '', model: '' })
    director.testConnection.mockResolvedValue({ ok: true, message: 'Connected to OpenAI · 1 model — using gpt-test.', models: ['gpt-test'] })
    store.finishAiSetup({ provider: 'openai', baseUrl: 'http://localhost:1299/v1', apiKey: 'sk-test', model: '' })
    const app = store.getApp()
    expect(app.settings).toMatchObject({ provider: 'openai', baseUrl: 'http://localhost:1299/v1', apiKey: 'sk-test', aiLevel: 'balanced', setupDone: true })
    // The previous provider's connection is remembered for switching back.
    expect(app.settings.providerConfigs.lmstudio).toEqual({ baseUrl: 'http://localhost:1234/v1', apiKey: '', model: '' })
    expect(app.screen).toBe(store.hasSavedGame() ? 'home' : 'newLife')
    await vi.waitFor(() => expect(store.getApp().aiStatus).toBe('online'))
    expect(director.testConnection).toHaveBeenCalledWith(expect.objectContaining({ provider: 'openai', apiKey: 'sk-test' }), expect.anything())
    expect(store.getApp().aiMessage).toContain('OpenAI')
  })

  it('a later run returns to where it was opened from', () => {
    store.updateSettings({ setupDone: true, aiLevel: 'off' })
    store.goTo('settings')
    store.goTo('aiSetup')
    expect(store.getApp().setupReturn).toBe('settings')
    store.closeAiSetup()
    expect(store.getApp().screen).toBe('settings')
    store.goTo('aiSetup')
    store.finishAiSetup(null)
    expect(store.getApp().screen).toBe('settings')
    // Settings still goes back to the game afterwards.
    store.goBack()
    expect(store.getApp().screen).toBe('game')
  })

  it('names the active provider while checking', () => {
    director.testConnection.mockReturnValue(new Promise(() => {}))
    store.saveAiConnection({ provider: 'groq', baseUrl: 'https://api.groq.com/openai/v1', apiKey: 'gsk', model: '' }, { aiLevel: 'balanced' })
    void store.checkAi()
    expect(store.getApp().aiMessage).toBe('Connecting to Groq…')
    expect(store.getApp().settings.provider).toBe('groq')
  })
})
