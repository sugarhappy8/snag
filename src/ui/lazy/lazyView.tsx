// R1-A8 (G.14): views that load on demand. A lazy view is a component whose module is fetched with a dynamic import()
// the first time it is needed, so the chart kit and the search palette stay out of the first download. It is not
// React.lazy: renderToStaticMarkup cannot wait for a lazy component, so a test of any consumer would only ever see
// the Suspense fallback. lazyView keeps the loaded module in a cache and renders it synchronously once it is there;
// a test awaits View.preload() and then renders the real thing.
//
// A view renders its `fallback` (the plain text rows it replaces) while loading, so the screen is never empty. If the
// load fails, which is what a long-open tab gets after a deploy (the old hashed file is gone and the server answers
// with index.html), the fallback stays and LazyFailure sits under it: the game degrades to its text rows and the
// player can try again, then reload. Nothing here reloads on its own, and nothing retries behind the player's back:
// a view that mounts after a failure shows the message at once instead of flashing it and taking it away. While a
// retry runs, the message stays (busy), so a focused Try again button is not removed from under the player.
// An explicit `fallback={null}` is for a decorative view in a row or a tile: nothing while loading and nothing after a
// failure, instead of a busy box, an alert and a button in every row.
//
// Every view is registered, so prefetchLazyViews() can fetch them all while the browser is idle. Where a view's file
// may be imported from is the job of test/lazy-zones.test.ts.
import { createElement, Fragment, useEffect, useSyncExternalStore, type Attributes, type ComponentType, type ReactElement, type ReactNode } from 'react'
import { flushSave } from '../../game/save-store'

/** Where one view's load stands. `attempts` on loading is the failures so far, carried through a retry. */
export type LazyPhase =
  | { kind: 'idle' }
  | { kind: 'loading'; attempts?: number }
  | { kind: 'ready' }
  | { kind: 'failed'; attempts: number }

export type LazyEvent = { kind: 'start' } | { kind: 'loaded' } | { kind: 'error' } | { kind: 'retry' }

/** The phase table: idle starts, loading ends ready or failed, failed retries, ready stays ready. */
export function lazyStep(phase: LazyPhase, event: LazyEvent): LazyPhase {
  switch (phase.kind) {
    case 'idle':
      return event.kind === 'start' ? { kind: 'loading' } : phase
    case 'loading':
      if (event.kind === 'loaded') return { kind: 'ready' }
      if (event.kind === 'error') return { kind: 'failed', attempts: (phase.attempts ?? 0) + 1 }
      return phase
    case 'failed':
      return event.kind === 'retry' ? { kind: 'loading', attempts: phase.attempts } : phase
    case 'ready':
      return phase
  }
}

export interface LazyOwnProps {
  /**
   * Shown while loading and after a failed load: the old text rows. Left out, a busy box shows while loading. Pass
   * null for a decorative view (a sparkline in a row): it then renders nothing at all until it is loaded.
   */
  fallback?: ReactNode
}

export interface LazyView<P extends object> {
  (props: P & LazyOwnProps): ReactElement | null
  /** Starts the load once; resolves true when the module is ready, false when it failed. Never rejects. */
  preload(): Promise<boolean>
  isReady(): boolean
  readonly displayName: string
}

export interface LazyFailureProps {
  attempts: number
  onRetry(): void
  onReload(): void
  /** A retry is running: say so, and keep the button (focus stays on it) but make it do nothing until it ends. */
  busy?: boolean
}

/** What a failed load shows under the fallback: Try again the first time, Reload from the second failure on. */
export function LazyFailure({ attempts, onRetry, onReload, busy = false }: LazyFailureProps): ReactElement {
  return (
    <div className="lazy-failure" role="alert">
      <p>{busy ? 'Trying again.' : "This view didn't load."}</p>
      {attempts < 2 ? (
        <button type="button" className="btn" aria-disabled={busy || undefined} onClick={busy ? undefined : onRetry}>
          Try again
        </button>
      ) : (
        <button type="button" className="btn" onClick={onReload}>
          Reload
        </button>
      )}
    </div>
  )
}

/** How many loads have failed so far, counting through a retry that is running; 0 for a first load. */
function failuresOf(phase: LazyPhase): number {
  if (phase.kind === 'failed') return phase.attempts
  if (phase.kind === 'loading') return phase.attempts ?? 0
  return 0
}

/** The save is written on every commit; the flush makes sure it has landed before the page goes. */
function reloadAfterSave(): void {
  const reload = () => location.reload()
  void flushSave().then(reload, reload)
}

interface Snapshot<P> {
  phase: LazyPhase
  Loaded: ComponentType<P> | null
}

interface Registered {
  preload(): Promise<boolean>
  forget(): void
}

const registry: Registered[] = []
/** Bumped by resetLazyViewsForTests so a prefetch that is still waiting for the browser stops. */
let generation = 0

export function lazyView<P extends object>(
  name: string,
  load: () => Promise<{ default: ComponentType<P> }>,
): LazyView<P> {
  const listeners = new Set<() => void>()
  let snap: Snapshot<P> = { phase: { kind: 'idle' }, Loaded: null }
  let running: Promise<boolean> | null = null

  const notify = (): void => {
    for (const listener of [...listeners]) listener()
  }
  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }
  const getSnapshot = (): Snapshot<P> => snap

  const preload = (): Promise<boolean> => {
    if (snap.phase.kind === 'ready') return Promise.resolve(true)
    if (running) return running
    const started: Snapshot<P> = {
      phase: lazyStep(snap.phase, { kind: snap.phase.kind === 'failed' ? 'retry' : 'start' }),
      Loaded: null,
    }
    const settle = (Loaded: ComponentType<P> | null): boolean => {
      if (snap !== started) return false // forgotten while loading (tests only)
      running = null
      snap = { phase: lazyStep(started.phase, { kind: Loaded ? 'loaded' : 'error' }), Loaded }
      notify()
      return Loaded !== null
    }
    snap = started
    running = new Promise<{ default: ComponentType<P> }>((resolve) => resolve(load())).then(
      (mod) => {
        const component: unknown = mod?.default
        const usable = typeof component === 'function' || (typeof component === 'object' && component !== null)
        return settle(usable ? (component as ComponentType<P>) : null)
      },
      () => settle(null),
    )
    notify()
    return running
  }

  const View = (props: P & LazyOwnProps): ReactElement | null => {
    const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
    useEffect(() => {
      // Only a view nobody has asked for yet starts a load. After a failure the player decides (Try again, Reload).
      if (snap.phase.kind === 'idle') void preload()
    }, [])
    const { fallback, ...rest } = props
    if (current.Loaded) return createElement(current.Loaded, rest as unknown as Attributes & P)
    if (fallback === null) return null
    const failures = failuresOf(current.phase)
    const shown = fallback === undefined && failures === 0 ? <div className="lazy-box" aria-busy="true" /> : fallback
    return (
      <Fragment>
        {shown}
        {failures > 0 && (
          <LazyFailure
            attempts={failures}
            busy={current.phase.kind === 'loading'}
            onRetry={() => void preload()}
            onReload={reloadAfterSave}
          />
        )}
      </Fragment>
    )
  }

  registry.push({
    preload,
    forget() {
      running = null
      snap = { phase: { kind: 'idle' }, Loaded: null }
      notify()
    },
  })
  return Object.assign(View, { preload, isReady: () => snap.phase.kind === 'ready', displayName: `Lazy(${name})` })
}

/** True on Save-Data and on a 2g connection, where a background download is not welcome. */
function constrained(): boolean {
  if (typeof navigator === 'undefined') return false
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection
  return connection?.saveData === true || connection?.effectiveType === 'slow-2g' || connection?.effectiveType === '2g'
}

/** Load every registered view when the browser is idle; skipped on Save-Data or a 2g connection. */
export function prefetchLazyViews(): void {
  if (constrained()) return
  const run = generation
  const start = (): void => {
    void (async () => {
      for (const view of [...registry]) {
        if (run !== generation) return
        await view.preload()
      }
    })()
  }
  if (typeof requestIdleCallback === 'function') requestIdleCallback(start, { timeout: 2000 })
  else setTimeout(start, 2000)
}

/** Tests only: forget every registered view and cached module. */
export function resetLazyViewsForTests(): void {
  generation++
  for (const view of registry) view.forget()
  registry.length = 0
}
