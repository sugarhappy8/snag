// The cursor of a chart: which point the reader is looking at. The reducer is pure and holds all the rules (arrow keys,
// Home, End, PageUp, PageDown, Escape); useScrub is a thin hook over it that also reads the pointer. No cursor means the
// readout shows the last point, so a chart always says something before anyone touches it.
import { useRef, useState, type FocusEventHandler, type KeyboardEventHandler, type PointerEventHandler } from 'react'
import { indexAt } from './geometry'

/** `index` is null while nobody has moved the cursor. */
export interface ScrubState {
  index: number | null
}

const PAGE = 5

function clampIndex(i: number, n: number): number {
  return Math.max(0, Math.min(n - 1, i))
}

/**
 * The state after a key. ArrowRight and ArrowDown move +1, ArrowLeft and ArrowUp -1, Home goes to the first point, End
 * to the last, PageDown +5, PageUp -5, Escape clears the cursor. A null index starts from the last point. The result is
 * clamped to 0..n-1. Any other key returns the same state object. With no points the cursor is cleared.
 */
export function scrubReducer(state: ScrubState, key: string, n: number): ScrubState {
  if (!(n >= 1)) return { index: null }
  const count = Math.floor(n)
  const cur = state.index === null || !Number.isFinite(state.index) ? count - 1 : clampIndex(Math.round(state.index), count)
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
      return { index: clampIndex(cur + 1, count) }
    case 'ArrowLeft':
    case 'ArrowUp':
      return { index: clampIndex(cur - 1, count) }
    case 'Home':
      return { index: 0 }
    case 'End':
      return { index: count - 1 }
    case 'PageDown':
      return { index: clampIndex(cur + PAGE, count) }
    case 'PageUp':
      return { index: clampIndex(cur - PAGE, count) }
    case 'Escape':
      return { index: null }
    default:
      return state
  }
}

/** The point the readout is about: the cursor, or the last point when there is none; -1 when there are no points. */
export function scrubIndex(state: ScrubState, n: number): number {
  if (!(n >= 1)) return -1
  const count = Math.floor(n)
  if (state.index === null || !Number.isFinite(state.index)) return count - 1
  return clampIndex(Math.round(state.index), count)
}

export interface ScrubApi {
  /** The effective index, as scrubIndex. */
  index: number
  /** The reader has moved the cursor. */
  active: boolean
  handlers: {
    tabIndex: 0
    onKeyDown: KeyboardEventHandler
    onPointerDown: PointerEventHandler
    onPointerMove: PointerEventHandler
    onPointerLeave: PointerEventHandler
    onBlur: FocusEventHandler
  }
}

const KEYS = new Set(['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End', 'PageDown', 'PageUp', 'Escape'])

/**
 * Scrub a chart of n points. `inset` is the left and right margin inside the element where no point sits, in pixels, so
 * a plot with axes maps the pointer onto the points it draws. `onMove` hears every change of the cursor, null when it is
 * cleared.
 *
 * Keys are handled when no modifier is held. Escape is left alone until there is a cursor to clear, so a dialog around
 * the chart still closes on the first press. A cursor the pointer placed goes when the pointer leaves or focus moves
 * away; a cursor the keyboard placed stays. A touch pointer leaves the moment the finger lifts, so for touch only the
 * blur clears it.
 */
export function useScrub(n: number, opts?: { onMove?: (index: number | null) => void; inset?: [number, number] }): ScrubApi {
  const [state, setState] = useState<ScrubState>({ index: null })
  // The handlers read the ref, not the state of the render they were made in, so two events before a re-render still chain.
  const live = useRef<ScrubState>(state)
  const by = useRef<'pointer' | 'key' | null>(null)
  const onMove = opts?.onMove
  const insetLeft = opts?.inset?.[0] ?? 0
  const insetRight = opts?.inset?.[1] ?? 0

  function put(next: ScrubState, source: 'pointer' | 'key'): void {
    const changed = next.index !== live.current.index
    live.current = next
    by.current = next.index === null ? null : source
    setState(next)
    if (changed) onMove?.(next.index)
  }

  function clearByPointer(): void {
    if (by.current !== 'pointer') return
    live.current = { index: null }
    by.current = null
    setState({ index: null })
    onMove?.(null)
  }

  const onKeyDown: KeyboardEventHandler = (e) => {
    if (!KEYS.has(e.key) || e.altKey || e.ctrlKey || e.metaKey) return
    if (e.key === 'Escape' && live.current.index === null) return
    e.preventDefault()
    put(scrubReducer(live.current, e.key, n), 'key')
  }

  const fromPointer: PointerEventHandler = (e) => {
    const box = e.currentTarget.getBoundingClientRect()
    const i = indexAt(e.clientX, box.left + insetLeft, box.width - insetLeft - insetRight, n)
    if (i < 0 || (i === live.current.index && by.current === 'pointer')) return
    put({ index: i }, 'pointer')
  }

  const onPointerLeave: PointerEventHandler = (e) => {
    if (e.pointerType === 'touch') return
    clearByPointer()
  }

  const onBlur: FocusEventHandler = () => clearByPointer()

  return {
    index: scrubIndex(state, n),
    active: state.index !== null && n >= 1,
    handlers: { tabIndex: 0, onKeyDown, onPointerDown: fromPointer, onPointerMove: fromPointer, onPointerLeave, onBlur },
  }
}
