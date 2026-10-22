// App store: the current life, settings, and the modal-queue game loop.
//
// The game state is immutable from React's point of view: every change goes through
// act(), which clones the state, mutates the clone, saves it and notifies subscribers.
// Popups live in g.queue and are shown one at a time. A built-in task at the head of the queue
// (this year's events, an interview, application screening, "Do Anything", the obituary: the
// 'aiTask' modal kind) is never shown: processQueue() resolves it on the spot with the offline
// systems (game/offline.ts). Nothing here talks to a server.
//
// Time Machine: commit() snapshots the life at the start of every year (save.ts keeps the last
// few outside the main save) and travelBack() restores one (game/timeMachine.ts has the rules).
import { useSyncExternalStore } from 'react'
import { ageUp } from '../game/aging'
import { bindMoneyContext, moneyContextOf, netWorth, notice } from '../game/core'
import { FLAGS } from '../game/flags'
import { closeYear } from '../game/hubs/year-close'
import { emptyInbox, inboxUnread, markSeen, routeMinorNotices } from '../game/inbox'
import { continueAsChild, createNewLife, type NewLifeOptions } from '../game/life'
import { lifeSpark } from '../game/life-series'
import { routesToInbox } from '../game/notice-policy'
import { resolveTask } from '../game/offline'
import {
  clearSave,
  clearTimeline,
  expectSnapshot,
  flushSave,
  forgetFuture,
  forgetStop,
  getSaveStatus,
  loadGame,
  loadSnapshot,
  recordDeath,
  resumeTimeline,
  saveGame,
  snapshotIfDue,
  startTimeline,
  subscribeSaveStatus,
  subscribeTimeStops,
  timeStops,
  unrecordDeath,
} from '../game/save'
import { cloneForAct } from '../game/save-clone'
import { runScript } from '../game/scripts'
import { arriveInPast, sandboxTimeMachine, travelBlock, type TimeStop } from '../game/timeMachine'
import type { GameState, MenuAction, ModalItem } from '../game/types'
import { loadSettings, normalizeSettings, quietModeOn, saveSettings, type Settings } from '../settings'

export type Screen = 'home' | 'newLife' | 'game' | 'settings' | 'ribbons' | 'graveyard'

/** Sheets that can be reopened from the "Back to …" chip. */
export type ReturnSheet = 'occupation' | 'assets' | 'activities' | 'relationships'

/**
 * Where the player was inside a menu sheet when an action closed it, so the game screen can
 * offer "↩ Back to <menu>" once the popups are done. UI state only: never saved with the life.
 */
export interface ReturnPoint {
  sheet: ReturnSheet
  /** Relationships: the person whose sheet was open. */
  personId?: string
  /** Group ids from the sheet's root down to the menu that was showing. */
  path: string[]
  /** Scroll offset of every level, root first (the last one is the menu that was showing). */
  scrolls: number[]
  /** The life, age and year it was made in: aging up or another life makes it stale. */
  lifeId: string
  age: number
  year: number
}

/** The Time Machine's state for the UI. */
export interface TimeTravelState {
  /** A jump is loading its snapshot. */
  busy: boolean
  /** Why the last jump failed ('' when it didn't). */
  error: string
  /** The last jump (the game screen plays its arrival once per jump). */
  arrived: { id: number; year: number; age: number } | null
}

export interface AppState {
  screen: Screen
  /** Screen to return to from settings/ribbons/graveyard. */
  previousScreen: Screen
  game: GameState | null
  saveError: boolean
  settings: Settings
  /** The menu to go back to after an action closed a sheet (see ReturnPoint). */
  returnPoint: ReturnPoint | null
  /** Start-of-year snapshots of the current life the Time Machine can go back to, oldest first. */
  timeStops: readonly TimeStop[]
  timeTravel: TimeTravelState
}

const IDLE_TRAVEL: TimeTravelState = { busy: false, error: '', arrived: null }
const NO_STOPS: readonly TimeStop[] = []

let state: AppState = {
  screen: 'home',
  previousScreen: 'home',
  game: null,
  saveError: false,
  settings: loadSettings(),
  returnPoint: null,
  timeStops: NO_STOPS,
  timeTravel: IDLE_TRAVEL,
}

const listeners = new Set<() => void>()

function setState(patch: Partial<AppState>): void {
  state = { ...state, ...patch }
  for (const l of listeners) l()
}

export function getApp(): AppState {
  return state
}

// The snapshot list changes in the background (writes finish, old years are pruned).
subscribeTimeStops(() => {
  const stops = state.game ? timeStops(state.game.lifeId) : NO_STOPS
  if (stops !== state.timeStops) setState({ timeStops: stops })
})

// A save that is only queued (IndexedDB) can still fail later, and saveGame has already said true. The
// banner follows the save store's own word on whether the newest save is in storage.
subscribeSaveStatus(() => {
  const failed = getSaveStatus().persistFailed
  if (failed !== state.saveError) setState({ saveError: failed })
})

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

// ---------------------------------------------------------------------------
// "Back to where you were" (menu sheets)

/** Remember the menu an action was run from (stamped with the current life, age and year). */
export function setReturnPoint(spot: { sheet: ReturnSheet; personId?: string; path: string[]; scrolls: number[] }): void {
  const g = state.game
  if (!g) return
  const point: ReturnPoint = {
    sheet: spot.sheet,
    path: spot.path.filter((id) => typeof id === 'string' && id !== ''),
    scrolls: spot.scrolls.map((n) => (Number.isFinite(n) && n > 0 ? Math.round(n) : 0)),
    lifeId: g.lifeId,
    age: g.character.age,
    year: g.year,
  }
  if (spot.personId) point.personId = spot.personId
  setState({ returnPoint: point })
}

export function clearReturnPoint(): void {
  if (state.returnPoint) setState({ returnPoint: null })
}

/** Still the same life, alive, and no birthday since it was made. Pure. */
export function returnPointLive(point: ReturnPoint | null, g: GameState | null): point is ReturnPoint {
  if (!point || !g) return false
  return g.character.alive && g.lifeId === point.lifeId && g.character.age === point.age && g.year === point.year
}

/** Show the chip only once every popup that followed the action has been dealt with. Pure. */
export function returnChipVisible(point: ReturnPoint | null, g: GameState | null): point is ReturnPoint {
  return returnPointLive(point, g) && g !== null && g.queue.length === 0
}

export function updateSettings(patch: Partial<Settings>): void {
  // Only known fields are kept (normalizeSettings), so nothing stray is ever saved.
  const settings = normalizeSettings({ ...state.settings, ...patch })
  saveSettings(settings)
  setState({ settings })
}

// ---------------------------------------------------------------------------
// Lives

export function hasSavedGame(): boolean {
  return loadGame() !== null
}

export function resumeSavedGame(): boolean {
  if (state.saveError && state.game) {
    goTo('game')
    return true
  }
  const g = loadGame()
  if (!g) return false
  bindMoneyContext(g)
  resumeTimeline(g.lifeId)
  setState({ game: g, screen: 'game', previousScreen: 'game', timeStops: timeStops(g.lifeId), timeTravel: IDLE_TRAVEL })
  processQueue()
  return true
}

export function startNewLife(opts: NewLifeOptions = {}): void {
  const g = createNewLife(opts)
  // A new timeline: the previous life's snapshots go, this one's birth is the first stop.
  startTimeline(g.lifeId, g.character.age)
  commit(g)
  setState({ screen: 'game', previousScreen: 'game', returnPoint: null, timeTravel: IDLE_TRAVEL })
  processQueue()
}

export function continueAs(childId: string): void {
  const g = state.game
  if (!g) return
  const next = continueAsChild(g, childId)
  // The heir's life is a new timeline: the parent's snapshots can't be gone back to.
  if (next !== g) startTimeline(next.lifeId, next.character.age)
  commit(next)
  setState({ screen: 'game', previousScreen: 'game', returnPoint: null, timeTravel: IDLE_TRAVEL })
  processQueue()
}

export function abandonLife(): void {
  clearSave()
  clearTimeline()
  setState({ game: null, saveError: false, screen: 'home', previousScreen: 'home', returnPoint: null, timeStops: NO_STOPS, timeTravel: IDLE_TRAVEL })
}

// ---------------------------------------------------------------------------
// Time Machine

let travelSeq = 0

/**
 * How long a jump waits for its snapshot. Storage that stops answering must never leave the
 * Time Machine spinning forever (save.ts gives up on the stuck operation a little later).
 */
export const TRAVEL_TIMEOUT_MS = 15_000
const STALLED = 'stalled'

/**
 * Save the arrival of a Time Machine jump and wait until it is in storage. False when it is not.
 * With localStorage the write is done inside saveGame, so this is saveGame: a refused write is false
 * at once. With IndexedDB the write is only queued when saveGame answers, so it waits for the queue.
 */
export async function saveForTravel(g: GameState): Promise<boolean> {
  return saveGame(g) && (await flushSave())
}

/**
 * Go back to the start of age `age` of the current life: the snapshot is restored exactly
 * (plus a log line, the jump counted and fresh dice), the "Back to" chip is cleared, and a death that happened since is taken off the graveyard and ribbons.
 * Resolves true once you've arrived; false (with timeTravel.error set) when you can't go.
 */
export async function travelBack(age: number): Promise<boolean> {
  const g = state.game
  if (!g || state.timeTravel.busy) return false
  const unlimited = sandboxTimeMachine(state.settings)
  const stop = timeStops(g.lifeId).find((s) => s.age === age)
  const blocked = travelBlock(g, stop, unlimited)
  if (blocked || !stop) {
    setState({ timeTravel: { ...state.timeTravel, error: blocked } })
    return false
  }
  setState({ timeTravel: { ...state.timeTravel, busy: true, error: '' } })
  let snapshot: GameState | null | typeof STALLED = null
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    snapshot = await Promise.race([
      loadSnapshot(g.lifeId, age),
      new Promise<typeof STALLED>((resolve) => {
        timer = setTimeout(() => resolve(STALLED), TRAVEL_TIMEOUT_MS)
      }),
    ])
  } catch {
    snapshot = null
  } finally {
    clearTimeout(timer)
  }
  // The life may have moved on while the snapshot loaded: travel from where it is now.
  const now = state.game
  if (!now || now.lifeId !== g.lifeId) {
    setState({ timeTravel: { ...state.timeTravel, busy: false } })
    return false
  }
  if (snapshot === STALLED) {
    // Not missing, just slow: keep the year and let the player try again.
    setState({
      timeTravel: {
        ...state.timeTravel,
        busy: false,
        error: `The Time Machine stalled on the way to ${stop.year}: this browser's storage isn't answering. Try again in a moment.`,
      },
    })
    return false
  }
  if (!snapshot) {
    forgetStop(g.lifeId, age)
    setState({
      timeTravel: {
        ...state.timeTravel,
        busy: false,
        error: `The Time Machine couldn't find its way back to ${stop.year}: that year is missing from this browser's storage.`,
      },
    })
    return false
  }
  const stillBlocked = travelBlock(now, stop, unlimited)
  if (stillBlocked) {
    setState({ timeTravel: { ...state.timeTravel, busy: false, error: stillBlocked } })
    return false
  }
  const arrived = arriveInPast(now, snapshot)
  // Save the trip before anything else changes. If even that fails (storage full), the jump is
  // called off: otherwise a reload would bring back a dead life whose grave and ribbon were
  // already taken back, and a second jump would take another life's ribbon.
  if (!(await saveForTravel(arrived))) {
    setState({
      timeTravel: {
        ...state.timeTravel,
        busy: false,
        error: getSaveStatus().database
          ? `The Time Machine couldn't save your trip to ${stop.year}: this browser's database isn't answering. Reload and try again.`
          : `The Time Machine couldn't save your trip to ${stop.year}: this browser's storage is full. Free some space and try again.`,
      },
    })
    return false
  }
  // An asynchronous write takes a moment, and a tap in that gap must not be overwritten by commit(arrived).
  if (state.game !== now) {
    setState({
      timeTravel: {
        ...state.timeTravel,
        busy: false,
        error: 'The Time Machine trip was called off: the game moved on while it saved.',
      },
    })
    return false
  }
  // The death you're escaping never happened: take it back off the graveyard and ribbons.
  unrecordDeath(now)
  forgetFuture(now.lifeId, age)
  commit(arrived)
  setState({
    screen: 'game',
    previousScreen: 'game',
    returnPoint: null,
    timeTravel: { busy: false, error: '', arrived: { id: ++travelSeq, year: arrived.year, age: arrived.character.age } },
  })
  processQueue()
  return true
}

/** Forget the last Time Machine error (the sheet was closed). */
export function clearTimeTravelError(): void {
  if (state.timeTravel.error) setState({ timeTravel: { ...state.timeTravel, error: '' } })
}

// ---------------------------------------------------------------------------
// Mutations

function commit(g: GameState): void {
  // Money text is written in the currency and prices of the life on screen (core.ts display).
  bindMoneyContext(g)
  finalizeIfDead(g)
  const saved = saveGame(g)
  // The start of a year (its birthday popups done): keep it for the Time Machine. Best-effort
  // and asynchronous, after the save, so it can never cost the player their game.
  if (saved) void snapshotIfDue(g)
  // An earlier asynchronous failure keeps the banner up until a write succeeds: a retry still pending hasn't.
  setState({ game: g, saveError: !saved || getSaveStatus().persistFailed, timeStops: timeStops(g.lifeId) })
}

/** Retry the current in-memory life without replaying its last action. */
export function retrySave(): void {
  if (state.game) commit(state.game)
}

/**
 * Record the ribbon and graveyard entry once, after the obituary has been written. The Time
 * Machine can still undo the death afterwards (save.unrecordDeath takes both back).
 */
function finalizeIfDead(g: GameState): void {
  if (g.character.alive || g.flags.deathRecorded || g.queue.length > 0) return
  const c = g.character
  const deathMoney = moneyContextOf(g)
  const spark = lifeSpark(g)
  recordDeath(g, {
    lifeId: g.lifeId,
    generation: g.generation,
    name: `${c.firstName} ${c.lastName}`,
    gender: c.gender,
    bornYear: g.year - c.age,
    diedYear: g.year,
    age: c.age,
    causeOfDeath: c.causeOfDeath ?? 'Unknown',
    netWorth: netWorth(g),
    countryId: c.countryId,
    ...(deathMoney.nominalScale ? { nominalScale: deathMoney.nominalScale } : {}),
    ...(deathMoney.usdNominalScale ? { usdNominalScale: deathMoney.usdNominalScale } : {}),
    occupation: typeof g.flags.finalOccupation === 'string' ? g.flags.finalOccupation : 'Unknown',
    ribbon: g.ribbon,
    obituary: g.obituary,
    ...(spark.length >= 2 ? { spark } : {}),
  })
}

/**
 * Run a mutation against a fresh copy of the game state. The copy clones the core and shares the frozen `replace` roots (the world
 * economy, finished log years, world shards) with the committed state, so a tap costs the core and nothing for those: a write into
 * one throws. See save-clone.ts.
 */
export function act(mutator: (g: GameState) => void): void {
  const current = state.game
  if (!current) return
  const draft = cloneForAct(current)
  bindMoneyContext(draft)
  try {
    mutator(draft)
  } catch (err) {
    bindMoneyContext(current)
    throw err
  }
  commit(draft)
  processQueue()
}

type ModalHandler = (g: GameState, modal: ModalItem) => void

/**
 * Run something that may push modals while handling the modal `id`: the modal is
 * removed and anything the handler queues jumps to the front, so follow-ups appear
 * right away instead of after the rest of the queue.
 *
 * A handler that throws must never leave a popup that can't be closed: the state is
 * left untouched and `fallback` (if any) runs instead; if that fails too, the modal is
 * simply dropped.
 */
function handleModal(id: string, handler: ModalHandler, fallback?: ModalHandler): void {
  for (const h of fallback ? [handler, fallback] : [handler]) {
    try {
      act((g) => resolveModal(g, id, h))
      return
    } catch (err) {
      console.error(`Popup ${id} failed:`, err)
    }
  }
  act((g) => {
    g.queue = g.queue.filter((m) => m.id !== id)
  })
}

function resolveModal(g: GameState, id: string, handler: ModalHandler): void {
  const idx = g.queue.findIndex((m) => m.id === id)
  if (idx < 0) return
  const [modal] = g.queue.splice(idx, 1)
  const existing = new Set(g.queue.map((m) => m.id))
  handler(g, modal)
  // The handler may also rebuild the queue (e.g. dying drops pending choices), so find
  // the new items by id rather than by position.
  const added = g.queue.filter((m) => !existing.has(m.id))
  if (!added.length) return
  const rest = g.queue.filter((m) => existing.has(m.id))
  g.queue = [...rest.slice(0, idx), ...added, ...rest.slice(idx)]
}

export function ageUpAction(): void {
  const g = state.game
  if (!g || !g.character.alive || g.queue.length > 0) return
  // A new year: the menu you were in last year isn't "where you were" any more.
  clearReturnPoint()
  // The Time Machine keeps the new year as it starts (once its popups are done).
  expectSnapshot(g.lifeId, g.character.age + 1)
  // The year close (R3, E.D2) is the store flow only: headless ageUp never calls it.
  const close = FLAGS.yearCard && quietModeOn(state.settings)
  try {
    if (!(close && ageUpAndClose())) act(ageUp)
  } catch (err) {
    // A bug in a yearly hook must not trap the player on this birthday with a dead button. act()
    // never commits a draft that threw, so the last good year stays; the error is still logged
    // (tests and developers see it) and the player gets a popup instead of silence.
    console.error('Ageing up failed:', err)
    act((draft) => {
      notice(draft, 'Something Went Wrong', "This year couldn't be played out, so nothing changed and your life is saved as it was. Tap + Age to try again; doing something else first can help.", { emoji: '\u{26A0}\u{FE0F}', tone: 'bad' })
    })
  }
}

/**
 * ageUp and the year close in one act() (R3, E.D2). True when the year was committed. closeYear is built not to throw; if it does, the
 * draft is dropped (act never commits one that threw) and this returns false, so the caller plays the year the old way: a broken close
 * never costs the player the birthday. A failure of ageUp itself, or of anything after the mutator, is not caught here.
 */
function ageUpAndClose(): boolean {
  let closing = false
  try {
    act((g) => {
      ageUp(g)
      closing = true
      closeYear(g)
      closing = false
    })
    return true
  } catch (err) {
    if (!closing) throw err
    console.error('Closing the year failed:', err)
    return false
  }
}

export function runMenuAction(action: MenuAction, input?: string): void {
  act((g) => {
    // Re-check against the latest state: the menu may be stale (died, jailed, aged out).
    if (!g.character.alive || g.queue.length > 0) return
    if (action.visible && !action.visible(g)) return
    if (action.disabledReason?.(g)) return
    action.run(g, input)
  })
}

export function dismissNotice(id: string): void {
  handleModal(id, () => {})
}

/**
 * One OK for a run of notices (the digest card): removes the notices with these ids in one act(), so one clone and
 * one save for the whole card. Ids that are not notices in the queue are ignored, and a second call is a no-op.
 * A notice has no handler to run, so this does not go through handleModal.
 */
export function dismissNotices(ids: readonly string[]): void {
  const want = new Set(ids)
  const current = state.game
  if (!current || want.size === 0 || !current.queue.some((m) => m.kind === 'notice' && want.has(m.id))) return
  act((g) => {
    g.queue = g.queue.filter((m) => !(m.kind === 'notice' && want.has(m.id)))
  })
}

export function chooseOption(id: string, choiceId: string): void {
  const queued = state.game?.queue.find((modal) => modal.id === id)
  if (!queued || queued.kind !== 'choice' || !queued.choices.some((option) => option.id === choiceId)) return
  handleModal(id, (g, modal) => {
    if (modal.kind !== 'choice') return
    if (modal.source === 'script' && modal.scriptId) {
      runScript(g, modal.scriptId, choiceId, modal.data, modal)
    } else {
      // An event without a script (written by the old AI narrator, from an older save): the
      // generic offline outcome, right away.
      resolveTask(g, { type: 'resolveChoice', event: modal, choiceId })
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
// Built-in tasks

/** Tasks resolved in one go before handing back (a safety valve; the next call carries on). */
const MAX_TASKS_PER_PASS = 50

let resolving = false

/**
 * Quiet Mode (G.11 step 2): while FLAGS.quietInbox and the Quiet Mode setting are both on, move every notice that
 * routesToInbox allows from the queue to the inbox, in one act(). A notice has no dependency on the items before it,
 * so it routes from anywhere in the queue. The cheap read comes first, so a pass with nothing to route clones and
 * saves nothing. True when it moved any. This is the store flow only: headless ageUp and every g.queue reader never
 * see it. Which notices route is decided by routesToInbox and nothing else here.
 */
function routeQuietNotices(): boolean {
  if (!FLAGS.quietInbox || !quietModeOn(state.settings)) return false
  if (!state.game?.queue.some((m) => routesToInbox(m, true))) return false
  let moved = 0
  try {
    act((draft) => {
      moved = routeMinorNotices(draft)
    })
  } catch (err) {
    // Routing is a courtesy: a notice that can't move stays a popup the player can close.
    console.error('Routing notices to the inbox failed:', err)
    return false
  }
  return moved > 0
}

/**
 * Resolve the built-in tasks ('aiTask' modals) at the head of the queue, synchronously and
 * offline (game/offline.ts), so the player never sees them: the popups they produce take their
 * place. Safe to call any time, from anywhere, as often as you like (React StrictMode's double
 * effects included): each task is looked up by id in the latest state and removed in the same
 * commit that applies it, so it can't be resolved twice; a task that throws is dropped (the
 * modal can never get stuck); calls made while a pass is running are folded into it. With Quiet
 * Mode on, routine notices go to the inbox first (routeQuietNotices).
 */
export function processQueue(): void {
  if (resolving) return
  resolving = true
  try {
    for (let i = 0; i < MAX_TASKS_PER_PASS; i++) {
      if (routeQuietNotices()) continue
      const head = state.game?.queue[0]
      if (!head || head.kind !== 'aiTask') return
      const task = head.task
      handleModal(head.id, (draft) => resolveTask(draft, task))
    }
  } finally {
    resolving = false
  }
}

// ---------------------------------------------------------------------------
// Inbox

/** The player opened the inbox: count every row as seen. One act(), and only when something is unread. */
export function markInboxSeen(): void {
  if (inboxUnread(state.game) > 0) act(markSeen)
}

/** Remove every row from the inbox (the total stays, so the count of what ever arrived is kept). */
export function clearInbox(): void {
  act(emptyInbox)
}
