// App store: the current life, settings, and the modal-queue game loop.
//
// The game state is immutable from React's point of view: every change goes through
// act(), which clones the state, mutates the clone, saves it and notifies subscribers.
// Popups live in g.queue and are shown one at a time. When the head of the queue is
// an AI task, processQueue() runs it against LM Studio (or the offline fallback).
import { useSyncExternalStore } from 'react'
import { applyFallback, narrateNotice, runAiTask, testConnection } from '../ai/director'
import { ageUp } from '../game/aging'
import { netWorth } from '../game/core'
import { continueAsChild, createNewLife, type NewLifeOptions } from '../game/life'
import { uid } from '../game/rng'
import { addToGraveyard, clearSave, loadGame, recordRibbon, saveGame } from '../game/save'
import { runScript } from '../game/scripts'
import type { GameState, MenuAction, ModalItem } from '../game/types'
import { loadSettings, saveSettings, type Settings } from '../settings'

export type Screen = 'home' | 'newLife' | 'game' | 'settings' | 'ribbons' | 'graveyard'

export interface AiActivity {
  /** Modal being worked on (aiTask, or a notice being rewritten). */
  modalId: string
  label: string
  startedAt: number
}

export interface AppState {
  screen: Screen
  /** Screen to return to from settings/ribbons/graveyard. */
  previousScreen: Screen
  game: GameState | null
  settings: Settings
  ai: AiActivity | null
  aiStatus: 'unknown' | 'checking' | 'online' | 'offline'
  aiMessage: string
}

let state: AppState = {
  screen: 'home',
  previousScreen: 'home',
  game: null,
  settings: loadSettings(),
  ai: null,
  aiStatus: 'unknown',
  aiMessage: '',
}

const listeners = new Set<() => void>()

function setState(patch: Partial<AppState>): void {
  state = { ...state, ...patch }
  for (const l of listeners) l()
}

export function getApp(): AppState {
  return state
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Subscribe to a slice of app state. Selectors must return stable references (no new objects). */
export function useApp<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state), () => selector(state))
}

// ---------------------------------------------------------------------------
// Navigation & settings

export function goTo(screen: Screen): void {
  const overlay = screen === 'settings' || screen === 'ribbons' || screen === 'graveyard'
  setState({ screen, previousScreen: overlay ? (isOverlay(state.screen) ? state.previousScreen : state.screen) : screen })
}

function isOverlay(s: Screen): boolean {
  return s === 'settings' || s === 'ribbons' || s === 'graveyard'
}

export function goBack(): void {
  setState({ screen: state.game && state.previousScreen === 'home' ? 'home' : state.previousScreen })
}

export function updateSettings(patch: Partial<Settings>): void {
  const settings = { ...state.settings, ...patch }
  saveSettings(settings)
  setState({ settings })
}

export async function checkAi(): Promise<void> {
  if (state.settings.aiLevel === 'off') {
    setState({ aiStatus: 'offline', aiMessage: 'AI is turned off in settings.' })
    return
  }
  setState({ aiStatus: 'checking', aiMessage: 'Connecting to LM Studio…' })
  try {
    const res = await testConnection(state.settings)
    setState({ aiStatus: res.ok ? 'online' : 'offline', aiMessage: res.message })
  } catch (err) {
    setState({ aiStatus: 'offline', aiMessage: errorMessage(err) })
  }
}

// ---------------------------------------------------------------------------
// Lives

export function hasSavedGame(): boolean {
  return loadGame() !== null
}

export function resumeSavedGame(): boolean {
  const g = loadGame()
  if (!g) return false
  setState({ game: g, screen: 'game', previousScreen: 'game' })
  processQueue()
  return true
}

export function startNewLife(opts: NewLifeOptions = {}): void {
  abortRunning()
  const g = createNewLife(opts)
  commit(g)
  setState({ screen: 'game', previousScreen: 'game' })
  processQueue()
}

export function continueAs(childId: string): void {
  const g = state.game
  if (!g) return
  abortRunning()
  commit(continueAsChild(g, childId))
  setState({ screen: 'game', previousScreen: 'game' })
  processQueue()
}

export function abandonLife(): void {
  abortRunning()
  clearSave()
  setState({ game: null, screen: 'home', previousScreen: 'home' })
}

// ---------------------------------------------------------------------------
// Mutations

function commit(g: GameState): void {
  finalizeIfDead(g)
  saveGame(g)
  setState({ game: g })
}

/** Record the ribbon and graveyard entry once, after the obituary has been written. */
function finalizeIfDead(g: GameState): void {
  if (g.character.alive || g.flags.deathRecorded || g.queue.length > 0) return
  g.flags.deathRecorded = true
  if (g.ribbon) recordRibbon(g.ribbon)
  const c = g.character
  addToGraveyard({
    lifeId: g.lifeId,
    generation: g.generation,
    name: `${c.firstName} ${c.lastName}`,
    gender: c.gender,
    bornYear: g.year - c.age,
    diedYear: g.year,
    age: c.age,
    causeOfDeath: c.causeOfDeath ?? 'Unknown',
    netWorth: netWorth(g),
    occupation: typeof g.flags.finalOccupation === 'string' ? g.flags.finalOccupation : 'Unknown',
    ribbon: g.ribbon,
    obituary: g.obituary,
  })
}

/** Run a mutation against a fresh copy of the game state. */
export function act(mutator: (g: GameState) => void): void {
  const current = state.game
  if (!current) return
  const draft = structuredClone(current)
  mutator(draft)
  commit(draft)
  processQueue()
}

/**
 * Run something that may push modals while handling the modal `id`: the modal is
 * removed and anything the handler queues jumps to the front, so follow-ups appear
 * right away instead of after the rest of the queue.
 */
function handleModal(id: string, handler: (g: GameState, modal: ModalItem) => void): void {
  act((g) => {
    const idx = g.queue.findIndex((m) => m.id === id)
    if (idx < 0) return
    const [modal] = g.queue.splice(idx, 1)
    const before = g.queue.length
    handler(g, modal)
    const added = g.queue.splice(before)
    g.queue.splice(idx, 0, ...added)
  })
}

export function ageUpAction(): void {
  const g = state.game
  if (!g || !g.character.alive || g.queue.length > 0) return
  act(ageUp)
}

export function runMenuAction(action: MenuAction, input?: string): void {
  act((g) => {
    const reason = action.disabledReason?.(g)
    if (reason) return
    action.run(g, input)
  })
}

export function dismissNotice(id: string): void {
  handleModal(id, () => {})
}

export function chooseOption(id: string, choiceId: string): void {
  handleModal(id, (g, modal) => {
    if (modal.kind !== 'choice') return
    if (modal.source === 'script' && modal.scriptId) {
      runScript(g, modal.scriptId, choiceId, modal.data, modal)
    } else {
      g.queue.push({ kind: 'aiTask', id: uid(g, 'm'), task: { type: 'resolveChoice', event: modal, choiceId } })
    }
  })
}

export function submitInput(id: string, value: string): void {
  handleModal(id, (g, modal) => {
    if (modal.kind === 'input') runScript(g, modal.scriptId, value, modal.data, modal)
  })
}

export function finishMinigame(id: string, result: string): void {
  handleModal(id, (g, modal) => {
    if (modal.kind === 'minigame') runScript(g, modal.scriptId, result, modal.data, modal)
  })
}

// ---------------------------------------------------------------------------
// AI processing

let running: { modalId: string; controller: AbortController } | null = null

function abortRunning(): void {
  running?.controller.abort()
  running = null
  if (state.ai) setState({ ai: null })
}

/** Skip the AI work in progress and use the offline fallback instead. */
export function skipAi(): void {
  running?.controller.abort()
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

const TASK_LABELS: Record<string, string> = {
  yearEvents: 'Living through the year…',
  resolveChoice: 'Seeing what happens…',
  customAction: 'Seeing what happens…',
  interview: 'Preparing your interview…',
  obituary: 'Writing your obituary…',
}

/** Start AI work for the head of the queue if needed. Safe to call any time. */
export function processQueue(): void {
  const g = state.game
  if (!g || running) return
  const head = g.queue[0]
  if (!head) return
  const settings = state.settings

  if (head.kind === 'aiTask') {
    if (settings.aiLevel === 'off') {
      handleModal(head.id, (draft) => applyFallback(draft, head.task))
      return
    }
    const controller = new AbortController()
    running = { modalId: head.id, controller }
    setState({ ai: { modalId: head.id, label: TASK_LABELS[head.task.type] ?? 'Thinking…', startedAt: Date.now() } })
    const timer = setTimeout(() => controller.abort(), settings.timeoutSec * 1000)
    runAiTask(g, head.task, settings, controller.signal)
      .then((apply) => {
        if (state.aiStatus !== 'online') setState({ aiStatus: 'online', aiMessage: 'Connected to LM Studio.' })
        finishAi(head.id, apply)
      })
      .catch((err) => {
        if (!controller.signal.aborted) setState({ aiStatus: 'offline', aiMessage: errorMessage(err) })
        finishAi(head.id, (draft) => applyFallback(draft, head.task))
      })
      .finally(() => clearTimeout(timer))
    return
  }

  if (head.kind === 'notice' && head.ai) {
    const wanted = settings.aiLevel === 'full' || (settings.aiLevel === 'balanced' && head.ai.when === 'balanced')
    if (!wanted) return
    const controller = new AbortController()
    running = { modalId: head.id, controller }
    setState({ ai: { modalId: head.id, label: 'Thinking…', startedAt: Date.now() } })
    const timer = setTimeout(() => controller.abort(), settings.timeoutSec * 1000)
    narrateNotice(g, head, settings, controller.signal)
      .then((text) => finishNarration(head.id, text))
      .catch((err) => {
        if (!controller.signal.aborted) setState({ aiStatus: 'offline', aiMessage: errorMessage(err) })
        finishNarration(head.id, null)
      })
      .finally(() => clearTimeout(timer))
  }
}

function finishAi(modalId: string, apply: (g: GameState) => void): void {
  if (running?.modalId !== modalId) return
  running = null
  setState({ ai: null })
  handleModal(modalId, (draft) => apply(draft))
}

function finishNarration(modalId: string, text: string | null): void {
  if (running?.modalId !== modalId) return
  running = null
  setState({ ai: null })
  act((g) => {
    const m = g.queue.find((x) => x.id === modalId)
    if (!m || m.kind !== 'notice') return
    if (text && text.trim()) m.text = text.trim()
    delete m.ai
  })
}
