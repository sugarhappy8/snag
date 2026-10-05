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
