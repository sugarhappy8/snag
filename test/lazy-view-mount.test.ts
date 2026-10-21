// R1-A8: what a lazy view does when it mounts. renderToStaticMarkup never runs effects and this suite has no DOM, so
// this file swaps useEffect for a recorder, renders, and runs the recorded effects by hand. Only useEffect is replaced;
// the store subscription and everything else in lazyView is the real thing.
import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const effects = vi.hoisted(() => [] as Array<() => void | (() => void)>)

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    useEffect: (effect: () => void | (() => void)) => {
      effects.push(effect)
    },
  }
})

import { lazyView, resetLazyViewsForTests } from '../src/ui/lazy/lazyView'

interface DummyProps {
  label: string
}
const Dummy: ComponentType<DummyProps> = (props) => createElement('b', { className: 'dummy' }, props.label)
const ok = () => Promise.resolve({ default: Dummy })

beforeEach(() => {
  effects.length = 0
  resetLazyViewsForTests()
})

/** Render the view once, then run the effects that render asked for, as a mount would. */
function mount(view: ReturnType<typeof lazyView<DummyProps>>): void {
  effects.length = 0
  renderToStaticMarkup(createElement(view, { label: 'x' }))
  expect(effects.length).toBeGreaterThan(0)
  for (const effect of [...effects]) effect()
}

describe('a lazy view on mount', () => {
  it('starts the load of a view nobody has asked for yet', async () => {
    const load = vi.fn(ok)
    const View = lazyView<DummyProps>('Dummy', load)
    mount(View)
    expect(load).toHaveBeenCalledTimes(1)
    expect(await View.preload()).toBe(true)
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('does not load again when the view is ready', async () => {
    const load = vi.fn(ok)
    const View = lazyView<DummyProps>('Dummy', load)
    await View.preload()
    mount(View)
    mount(View)
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('shares a load that is already running', async () => {
    const load = vi.fn(ok)
    const View = lazyView<DummyProps>('Dummy', load)
    const first = View.preload()
    mount(View)
    expect(await first).toBe(true)
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('leaves a failed load to the player: no silent retry, so the message never flashes and goes', async () => {
    const load = vi.fn(() => Promise.reject(new Error('stale chunk')) as Promise<{ default: ComponentType<DummyProps> }>)
    const View = lazyView<DummyProps>('Dummy', load)
    await expect(View.preload()).resolves.toBe(false)
    mount(View)
    mount(View)
    expect(load).toHaveBeenCalledTimes(1)
    expect(View.isReady()).toBe(false)
    // Try again is still there, and it does retry.
    expect(renderToStaticMarkup(createElement(View, { label: 'x' }))).toContain('Try again')
  })
})
