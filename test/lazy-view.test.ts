// R1-A8: the lazyView kit. A lazy view caches its loaded module and renders it synchronously once it is loaded, so a
// test awaits View.preload() and then renders the real thing with renderToStaticMarkup (React.lazy would only ever
// show the Suspense fallback there). The phase table is pure; the views are driven with loaders the test controls.
import { Children, createElement, isValidElement, memo, type ComponentType, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  LazyFailure,
  lazyStep,
  lazyView,
  prefetchLazyViews,
  resetLazyViewsForTests,
  type LazyEvent,
  type LazyPhase,
  type LazyView,
} from '../src/ui/lazy/lazyView'

interface DummyProps {
  label: string
}

/** A component that echoes the names of the props it was given, so a test sees that `fallback` is not passed down. */
const Dummy: ComponentType<DummyProps> = (props) =>
  createElement('b', { className: 'dummy' }, `${props.label}|${Object.keys(props).join(',')}`)

const ok = () => Promise.resolve({ default: Dummy })

beforeEach(() => {
  resetLazyViewsForTests()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  resetLazyViewsForTests()
})

/** Wait one macrotask: every already-resolved promise in a load chain settles first. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

function html(view: LazyView<DummyProps>, fallback?: ReactNode): string {
  return renderToStaticMarkup(createElement(view, { label: 'x', fallback }))
}

/** Calls a function component inside a render of another one, so its hooks work, and returns the element it produced. */
function output(view: LazyView<DummyProps>): ReactNode {
  let seen: ReactNode = null
  const Probe = () => {
    seen = view({ label: 'x' })
    return null
  }
  renderToStaticMarkup(createElement(Probe))
  return seen
}

/** The first element of `type` anywhere in a rendered tree. */
function findByType(node: ReactNode, type: unknown): ReactElement<Record<string, unknown>> | null {
  if (!isValidElement(node)) return null
  if (node.type === type) return node as ReactElement<Record<string, unknown>>
  const children = (node.props as { children?: ReactNode }).children
  for (const child of Children.toArray(children)) {
    const found = findByType(child, type)
    if (found) return found
  }
  return null
}

/** The visible text with the entities of an apostrophe turned back, for readable assertions. */
function text(markup: string): string {
  return markup.replace(/&#x27;/g, "'")
}

describe('lazyStep', () => {
  const idle: LazyPhase = { kind: 'idle' }
  // A retry carries the failures so far through loading, so the next failure can count on from them.
  const loading = (attempts?: number): LazyPhase => (attempts === undefined ? { kind: 'loading' } : { kind: 'loading', attempts })
  const ready: LazyPhase = { kind: 'ready' }
  const failed = (attempts: number): LazyPhase => ({ kind: 'failed', attempts })
  const start: LazyEvent = { kind: 'start' }
  const loaded: LazyEvent = { kind: 'loaded' }
  const error: LazyEvent = { kind: 'error' }
  const retry: LazyEvent = { kind: 'retry' }

  it('follows the phase table', () => {
    expect(lazyStep(idle, start)).toEqual(loading())
    expect(lazyStep(loading(), loaded)).toEqual(ready)
    expect(lazyStep(loading(), error)).toEqual(failed(1))
    expect(lazyStep(failed(1), retry)).toEqual(loading(1))
    expect(lazyStep(loading(1), error)).toEqual(failed(2))
    expect(lazyStep(loading(1), loaded)).toEqual(ready)
    expect(lazyStep(failed(1), start)).toEqual(failed(1))
  })

  it('counts every failed attempt, across retries', () => {
    let phase: LazyPhase = idle
    for (const [event, attempts] of [[start, 1], [retry, 2], [retry, 3]] as const) {
      phase = lazyStep(phase, event)
      expect(phase.kind).toBe('loading')
      phase = lazyStep(phase, error)
      expect(phase).toEqual(failed(attempts))
    }
  })

  it('ignores events that do not apply, and ready absorbs everything', () => {
    expect(lazyStep(idle, loaded)).toEqual(idle)
    expect(lazyStep(idle, error)).toEqual(idle)
    expect(lazyStep(idle, retry)).toEqual(idle)
    expect(lazyStep(loading(), start)).toEqual(loading())
    expect(lazyStep(loading(1), retry)).toEqual(loading(1))
    expect(lazyStep(failed(2), loaded)).toEqual(failed(2))
    for (const event of [start, loaded, error, retry]) expect(lazyStep(ready, event)).toEqual(ready)
  })

  it('does not change the phase it was given', () => {
    const phase: LazyPhase = Object.freeze({ kind: 'failed', attempts: 1 })
    expect(lazyStep(phase, retry)).toEqual({ kind: 'loading', attempts: 1 })
    expect(phase).toEqual({ kind: 'failed', attempts: 1 })
  })
})

describe('lazyView before the module is loaded', () => {
  it('renders the fallback and none of the real content', () => {
    const View = lazyView<DummyProps>('Dummy', ok)
    const markup = html(View, createElement('p', null, 'text rows'))
    expect(markup).toContain('text rows')
    expect(markup).not.toContain('dummy')
    expect(markup).not.toContain('lazy-box')
    expect(View.isReady()).toBe(false)
  })

  it('renders a busy box when there is no fallback', () => {
    const View = lazyView<DummyProps>('Dummy', ok)
    const markup = html(View)
    expect(markup).toContain('lazy-box')
    expect(markup).toContain('aria-busy="true"')
    expect(markup).not.toContain('dummy')
  })

  it('does not start the load by being rendered on the server', () => {
    const load = vi.fn(ok)
    const View = lazyView<DummyProps>('Dummy', load)
    html(View)
    expect(load).not.toHaveBeenCalled()
  })

  it('has a display name that carries the view name', () => {
    expect(lazyView<DummyProps>('Palette', ok).displayName).toContain('Palette')
  })
})

describe('lazyView after preload', () => {
  it('renders the real component, with every prop but fallback', async () => {
    const View = lazyView<DummyProps>('Dummy', ok)
    expect(await View.preload()).toBe(true)
    expect(View.isReady()).toBe(true)
    const markup = html(View, createElement('p', null, 'text rows'))
    expect(markup).toContain('class="dummy"')
    expect(markup).toContain('x|label')
    expect(markup).not.toContain('fallback')
    expect(markup).not.toContain('text rows')
    expect(markup).not.toContain('lazy-box')
  })

  it('loads the module once, however many times preload is called', async () => {
    const load = vi.fn(ok)
    const View = lazyView<DummyProps>('Dummy', load)
    const results = await Promise.all([View.preload(), View.preload(), View.preload()])
    expect(results).toEqual([true, true, true])
    expect(await View.preload()).toBe(true)
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('keeps one cache per view', async () => {
    const a = lazyView<DummyProps>('A', ok)
    const b = lazyView<DummyProps>('B', ok)
    await a.preload()
    expect(a.isReady()).toBe(true)
    expect(b.isReady()).toBe(false)
  })

  it('accepts a memo or forwardRef component as the default export', async () => {
    const View = lazyView<DummyProps>('Memo', () => Promise.resolve({ default: memo(Dummy) }))
    expect(await View.preload()).toBe(true)
    expect(html(View)).toContain('class="dummy"')
  })
})

describe('lazyView when the load fails', () => {
  it('resolves false, never rejects, and shows the fallback with a way to retry', async () => {
    const View = lazyView<DummyProps>('Dummy', () => Promise.reject(new Error('Failed to fetch dynamically imported module')))
    await expect(View.preload()).resolves.toBe(false)
    expect(View.isReady()).toBe(false)
    const markup = text(html(View, createElement('p', null, 'text rows')))
    expect(markup).toContain('text rows')
    expect(markup).toContain("This view didn't load.")
    expect(markup).toContain('Try again')
    expect(markup).not.toContain('Reload')
    expect(markup).not.toContain('dummy')
  })

  it('treats a loader that throws, and a module with no component, as a failed load', async () => {
    const throws = lazyView<DummyProps>('Throws', () => {
      throw new Error('sync')
    })
    await expect(throws.preload()).resolves.toBe(false)
    const empty = lazyView<DummyProps>('Empty', () => Promise.resolve({} as { default: ComponentType<DummyProps> }))
    await expect(empty.preload()).resolves.toBe(false)
    expect(empty.isReady()).toBe(false)
  })

  it('shows Reload from the second failure on, and a later preload that works clears the failure', async () => {
    const load = vi
      .fn<() => Promise<{ default: ComponentType<DummyProps> }>>()
      .mockRejectedValueOnce(new Error('stale chunk'))
      .mockRejectedValueOnce(new Error('stale chunk'))
      .mockImplementation(ok)
    const View = lazyView<DummyProps>('Dummy', load)

    expect(await View.preload()).toBe(false)
    expect(html(View)).toContain('Try again')

    expect(await View.preload()).toBe(false)
    const second = html(View)
    expect(second).toContain('Reload')
    expect(second).not.toContain('Try again')

    expect(await View.preload()).toBe(true)
    expect(View.isReady()).toBe(true)
    const done = text(html(View))
    expect(done).toContain('class="dummy"')
    expect(done).not.toContain("This view didn't load.")
    expect(load).toHaveBeenCalledTimes(3)
  })

  it('shares one load between callers while a retry is in flight', async () => {
    let calls = 0
    const View = lazyView<DummyProps>('Dummy', () => (++calls === 1 ? Promise.reject(new Error('x')) : ok()))
    await View.preload()
    const both = await Promise.all([View.preload(), View.preload()])
    expect(both).toEqual([true, true])
    expect(calls).toBe(2)
  })

  it('shows only the failure message, with no busy box, when there is no fallback', async () => {
    const View = lazyView<DummyProps>('Dummy', () => Promise.reject(new Error('x')))
    await View.preload()
    const markup = html(View)
    expect(markup).toContain('Try again')
    expect(markup).not.toContain('aria-busy')
  })

  it('wires the buttons: Try again preloads once more, Reload flushes the save and reloads the page', async () => {
    const load = vi
      .fn<() => Promise<{ default: ComponentType<DummyProps> }>>()
      .mockRejectedValueOnce(new Error('x'))
      .mockRejectedValueOnce(new Error('x'))
      .mockImplementation(ok)
    const View = lazyView<DummyProps>('Dummy', load)
    await View.preload()

    const first = findByType(output(View), LazyFailure)
    expect(first?.props.attempts).toBe(1)
    ;(first?.props.onRetry as () => void)()
    await settle()
    expect(load).toHaveBeenCalledTimes(2)

    const second = findByType(output(View), LazyFailure)
    expect(second?.props.attempts).toBe(2)
    const reload = vi.fn()
    vi.stubGlobal('location', { reload })
    ;(second?.props.onReload as () => void)()
    expect(reload).not.toHaveBeenCalled()
    await settle()
    expect(reload).toHaveBeenCalledTimes(1)
    expect(load).toHaveBeenCalledTimes(2)
  })
})

describe('LazyFailure', () => {
  const noop = () => undefined

  it('offers Try again on the first failure', () => {
    const markup = text(renderToStaticMarkup(createElement(LazyFailure, { attempts: 1, onRetry: noop, onReload: noop })))
    expect(markup).toContain("This view didn't load.")
    expect(markup).toContain('Try again')
    expect(markup).not.toContain('Reload')
  })

  it('offers Reload from the second failure on', () => {
    for (const attempts of [2, 3, 9]) {
      const markup = renderToStaticMarkup(createElement(LazyFailure, { attempts, onRetry: noop, onReload: noop }))
      expect(markup).toContain('Reload')
      expect(markup).not.toContain('Try again')
    }
  })

  it('announces itself and uses the button class of the rest of the UI', () => {
    const markup = renderToStaticMarkup(createElement(LazyFailure, { attempts: 1, onRetry: noop, onReload: noop }))
    expect(markup).toContain('class="lazy-failure"')
    expect(markup).toContain('role="alert"')
    expect(markup).toContain('class="btn"')
  })

  it('calls the handler that goes with the button', () => {
    const onRetry = vi.fn()
    const onReload = vi.fn()
    const press = (attempts: number) => {
      const el = LazyFailure({ attempts, onRetry, onReload })
      const button = findByType(el, 'button')
      ;(button?.props.onClick as () => void)()
    }
    press(1)
    expect([onRetry.mock.calls.length, onReload.mock.calls.length]).toEqual([1, 0])
    press(2)
    expect([onRetry.mock.calls.length, onReload.mock.calls.length]).toEqual([1, 1])
  })
})

describe('prefetchLazyViews', () => {
  /** An idle callback that runs at once, as a browser with nothing else to do would. */
  const idleNow = () =>
    vi.fn((cb: (deadline: { didTimeout: boolean; timeRemaining: () => number }) => void, _options?: { timeout: number }) => {
      cb({ didTimeout: false, timeRemaining: () => 50 })
      return 1
    })

  function loaders() {
    const order: string[] = []
    const make = (name: string) =>
      vi.fn(() => {
        order.push(name)
        return Promise.resolve({ default: Dummy })
      })
    return { order, a: make('a'), b: make('b'), c: make('c') }
  }

  it('loads nothing on Save-Data, or on a 2g connection', async () => {
    for (const connection of [{ saveData: true }, { effectiveType: 'slow-2g' }, { effectiveType: '2g' }, { saveData: true, effectiveType: '4g' }]) {
      resetLazyViewsForTests()
      const idle = idleNow()
      vi.stubGlobal('navigator', { connection })
      vi.stubGlobal('requestIdleCallback', idle)
      const { order, a, b } = loaders()
      lazyView<DummyProps>('A', a)
      lazyView<DummyProps>('B', b)
      prefetchLazyViews()
      await settle()
      expect(order).toEqual([])
      expect(idle).not.toHaveBeenCalled()
    }
  })

  it('loads every registered view once, in order, on a good connection', async () => {
    const idle = idleNow()
    vi.stubGlobal('navigator', { connection: { effectiveType: '4g' } })
    vi.stubGlobal('requestIdleCallback', idle)
    const { order, a, b, c } = loaders()
    const A = lazyView<DummyProps>('A', a)
    lazyView<DummyProps>('B', b)
    lazyView<DummyProps>('C', c)
    prefetchLazyViews()
    await settle()
    expect(order).toEqual(['a', 'b', 'c'])
    expect(idle).toHaveBeenCalledTimes(1)
    expect(idle.mock.calls[0]?.[1]).toEqual({ timeout: 2000 })
    expect(A.isReady()).toBe(true)

    prefetchLazyViews()
    await settle()
    expect(order).toEqual(['a', 'b', 'c'])
  })

  it('loads one view at a time', async () => {
    vi.stubGlobal('navigator', { connection: { effectiveType: '4g' } })
    vi.stubGlobal('requestIdleCallback', idleNow())
    const order: string[] = []
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    lazyView<DummyProps>('A', () => {
      order.push('a')
      return gate.then(() => ({ default: Dummy }))
    })
    lazyView<DummyProps>('B', () => {
      order.push('b')
      return Promise.resolve({ default: Dummy })
    })
    prefetchLazyViews()
    await settle()
    expect(order).toEqual(['a'])
    release()
    await settle()
    expect(order).toEqual(['a', 'b'])
  })

  it('goes on with the next view when one fails', async () => {
    vi.stubGlobal('navigator', {})
    vi.stubGlobal('requestIdleCallback', idleNow())
    const { order, b } = loaders()
    lazyView<DummyProps>('A', () => {
      order.push('a')
      return Promise.reject(new Error('offline'))
    })
    const B = lazyView<DummyProps>('B', b)
    prefetchLazyViews()
    await settle()
    expect(order).toEqual(['a', 'b'])
    expect(B.isReady()).toBe(true)
  })

  it('waits 2,000 ms on a browser without requestIdleCallback', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('navigator', { connection: { effectiveType: '3g' } })
    vi.stubGlobal('requestIdleCallback', undefined)
    const { order, a } = loaders()
    lazyView<DummyProps>('A', a)
    prefetchLazyViews()
    await vi.advanceTimersByTimeAsync(1999)
    expect(order).toEqual([])
    await vi.advanceTimersByTimeAsync(1)
    expect(order).toEqual(['a'])
  })

  it('loads on a browser that reports no connection at all', async () => {
    vi.stubGlobal('navigator', undefined)
    vi.stubGlobal('requestIdleCallback', idleNow())
    const { order, a } = loaders()
    lazyView<DummyProps>('A', a)
    prefetchLazyViews()
    await settle()
    expect(order).toEqual(['a'])
  })
})

describe('resetLazyViewsForTests', () => {
  it('forgets the cached module and the registered views', async () => {
    const load = vi.fn(ok)
    const View = lazyView<DummyProps>('Dummy', load)
    await View.preload()
    expect(View.isReady()).toBe(true)
    resetLazyViewsForTests()
    expect(View.isReady()).toBe(false)
    expect(html(View)).toContain('lazy-box')

    vi.stubGlobal('navigator', {})
    vi.stubGlobal('requestIdleCallback', (cb: () => void) => {
      cb()
      return 1
    })
    prefetchLazyViews()
    await settle()
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('drops the result of a load that was still running', async () => {
    let finish: (m: { default: ComponentType<DummyProps> }) => void = () => undefined
    const View = lazyView<DummyProps>('Dummy', () => new Promise<{ default: ComponentType<DummyProps> }>((resolve) => (finish = resolve)))
    const pending = View.preload()
    resetLazyViewsForTests()
    finish({ default: Dummy })
    await pending
    expect(View.isReady()).toBe(false)
  })
})
