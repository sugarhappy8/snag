// The palette (G.9): one box that finds any row of the four menus, and the places worth a tap before anything is typed.
// Palette is the container (state, the index, the runner, the keys), PaletteViewMarkup is the markup, and makeController is
// what a tap on a row does. The panel is a ModalSurface (focus trap, focus back, the page behind inert); the backdrop
// carries `sheet-backdrop`, so the sheets underneath leave Escape to the palette.
//
// A row is never run from here as a stored closure: a tap looks the live node up again from the latest state (activate), and
// a row that has gone since the list was built is told so ("That's not there any more.") and the index is read again.
//
// Part of the palette zone (test/lazy-zones.test.ts): loaded through src/ui/nav/lazy.tsx, never imported statically.
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactElement, type RefObject } from 'react'
import { doAnythingAction } from '../../game/menus'
import type { GameState, MenuAction } from '../../game/types'
import { ModalSurface } from '../a11y/ModalSurface'
import { useMenuRunner, useSheetEscape, type MenuRunner } from '../components/MenuList'
import { setReturnPoint, useApp } from '../store'
import {
  GONE_TEXT,
  READING_TEXT,
  SUBMIT_QUERY_MAX,
  activate,
  doAnythingLabel,
  highlightOf,
  openPlace,
  paletteReduce,
  paletteRows,
  rowLabel,
  rowLock,
  rowPlace,
  type PaletteEvent,
  type PaletteRow,
  type PaletteState,
  type PaletteView,
} from './paletteModel'
import { placeOfEntry, recentFromSpot, type PlaceRef, type SearchTab } from './place'
import { isPinned, PINS_FULL_TEXT, recordRecent, togglePin, updatePrefs, usePrefs } from './prefs'
import { clearIndexCache, createResolver, type IndexRoots, type SearchIndex } from './searchIndex'
import { useSearchIndex } from './useSearchIndex'
import '../styles/nav.css'

export const STALE_TEXT = "That's not there any more."
export const EMPTY_TEXT = 'Type to search actions, people and companies.'
/** Shown under the list while a row can be pinned. Hidden where there is no keyboard (a touch screen). */
export const PIN_HINT = 'Alt or Option+P pins the highlighted row.'
/** The longest row name a pin toast repeats. */
const TOAST_LABEL_MAX = 60
const PLACEHOLDER = 'Search actions, people, companies'
const BREADCRUMB_SEP = ' › '

// ---------------------------------------------------------------------------
// Where a row lives, for the Back to chip and the recents

/** The sheet and list an action was run from: the tab, the person on Relationships, and the group ids inside the sheet. */
export interface Spot {
  tab: SearchTab
  personId?: string
  path: string[]
}

function spotOf(place: PlaceRef & { personId?: string }): Spot {
  const spot: Spot = { tab: place.tab, path: place.path }
  if (place.personId) spot.personId = place.personId
  return spot
}

/** The runner is about to close the palette after an action: remember the list it was run from as the Back to spot. */
export function leaveFrom(spot: Spot | null): void {
  if (!spot) return
  setReturnPoint({ sheet: spot.tab, personId: spot.personId, path: spot.path, scrolls: [...spot.path.map(() => 0), 0] })
}

/** An action is about to run: note the place as a recent, in the form the sheets write (a no-op unless the palette flag is on). */
export function ranFrom(lifeId: string, spot: Spot | null, action: MenuAction): void {
  if (!spot) return
  recordRecent(lifeId, { ...recentFromSpot(spot.tab, spot), id: action.id })
}

// ---------------------------------------------------------------------------
// Pins

export type PinOutcome = 'pinned' | 'unpinned' | 'full' | 'none'

/** Pin the place of a row, or unpin it. 'full' at 12 pins; 'none' for a row with no place or one that has gone. */
export function togglePinRow(row: PaletteRow, lifeId: string): PinOutcome {
  const ref = rowPlace(row)
  if (ref === null || rowLock(row) === GONE_TEXT) return 'none'
  const out = { value: 'none' as PinOutcome }
  updatePrefs((p) => {
    const was = isPinned(p, lifeId, ref)
    const r = togglePin(p, lifeId, ref)
    out.value = r.reason === 'full' ? 'full' : r.ok ? (was ? 'unpinned' : 'pinned') : 'none'
    return r.prefs
  })
  return out.value
}

// ---------------------------------------------------------------------------
// What a tap does

export interface ControllerDeps {
  g: GameState
  runner: Pick<MenuRunner, 'tap' | 'submit' | 'toast'>
  /** Set before an action runs; read by the runner's onRan and onLeave. */
  spot: { current: Spot | null }
  lifeId: string
  roots?: IndexRoots
  onClose: () => void
  onOpenPlace: (place: PlaceRef & { personId?: string }) => void
  /** A row had gone: read the menus again. */
  onStale: () => void
}

export interface Controller {
  pick(row: PaletteRow): void
  pin(row: PaletteRow): void
}

/**
 * A group or a place closes the palette and opens its sheet. An action goes through the runner (so a value to type, a
 * confirm step and the toasts work, and the palette stays up while a dialog is open). A locked row shows its reason. The
 * Do Anything row hands its text to the runner.
 */
export function makeController(d: ControllerDeps): Controller {
  return {
    pick(row) {
      if (row.kind === 'section') return
      const lock = rowLock(row)
      if (lock) {
        d.runner.toast(lock)
        return
      }
      const act = activate(row, d.g, createResolver(d.g, d.roots))
      switch (act.kind) {
        case 'stale':
          d.runner.toast(STALE_TEXT)
          clearIndexCache()
          d.onStale()
          return
        case 'open':
          d.onClose()
          d.onOpenPlace(act.place)
          return
        case 'run':
          if (row.kind === 'hit') d.spot.current = spotOf(openPlace(placeOfEntry(row.hit.entry)))
          d.runner.tap(act.node)
          return
        case 'doAnything':
          d.spot.current = { tab: 'activities', path: [] }
          d.runner.submit(doAnythingAction, act.query)
          return
      }
    },
    pin(row) {
      // The star is hidden from a screen reader, so the key says what it did.
      const outcome = togglePinRow(row, d.lifeId)
      const name = rowLabel(row).slice(0, TOAST_LABEL_MAX)
      if (outcome === 'full') d.runner.toast(PINS_FULL_TEXT)
      else if (outcome === 'pinned') d.runner.toast(`Pinned ${name}.`)
      else if (outcome === 'unpinned') d.runner.toast(`Unpinned ${name}.`)
    },
  }
}

// ---------------------------------------------------------------------------
// Markup

interface Parts {
  emoji: string
  label: string
  sub: string
  badge: string | null
  lock: string | null
  pinned: boolean
  /** Can be pinned: it has a place and has not gone. */
  pinnable: boolean
}

function partsOf(row: PaletteRow): Parts {
  const lock = rowLock(row)
  const pinnable = rowPlace(row) !== null && lock !== GONE_TEXT
  switch (row.kind) {
    case 'place':
      return { emoji: row.emoji, label: row.label, sub: row.crumbs.join(BREADCRUMB_SEP), badge: row.badge ?? null, lock, pinned: row.pinned === true, pinnable }
    case 'hit':
      return { emoji: row.hit.entry.emoji, label: row.hit.entry.label, sub: row.hit.entry.crumbs.join(BREADCRUMB_SEP), badge: null, lock, pinned: row.pinned, pinnable }
    case 'doAnything':
      return {
        emoji: doAnythingAction.emoji,
        label: doAnythingLabel(row.query),
        sub: typeof doAnythingAction.subtitle === 'string' ? doAnythingAction.subtitle : '',
        badge: null,
        lock,
        pinned: false,
        pinnable: false,
      }
    case 'section':
      return { emoji: '', label: row.label, sub: '', badge: null, lock: null, pinned: false, pinnable: false }
  }
}

export interface PaletteMarkupProps {
  view: PaletteView
  state: PaletteState
  ids: { list: string; option: (i: number) => string }
  onQuery: (v: string) => void
  /** `i` counts rows that can be activated, like `state.active`. */
  onPick: (i: number) => void
  onPin: (i: number) => void
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void
  /** A tap outside the panel. */
  onClose?: () => void
  /** Attached inside the panel, for the Escape handler of the sheets. */
  anchorRef?: RefObject<HTMLDivElement | null>
}

interface Group {
  heading: string | null
  rows: number[]
}

/** The rows in groups: each heading with the rows that follow it; rows before any heading (a query's hits) stand alone. */
function groupsOf(rows: readonly PaletteRow[]): Group[] {
  const out: Group[] = []
  let current: Group | null = null
  rows.forEach((row, i) => {
    if (row.kind === 'section') {
      current = { heading: row.label, rows: [] }
      out.push(current)
      return
    }
    if (current === null) {
      current = { heading: null, rows: [] }
      out.push(current)
    }
    current.rows.push(i)
  })
  return out
}

export function PaletteViewMarkup(p: PaletteMarkupProps): ReactElement {
  const { view, state, ids } = p
  const position = new Map<number, number>()
  view.selectable.forEach((rowIndex, at) => position.set(rowIndex, at))
  const count = view.selectable.length
  const active = count === 0 ? -1 : Math.min(Math.max(0, state.active), count - 1)
  const reading = view.status === READING_TEXT

  const option = (rowIndex: number): ReactElement => {
    const row = view.rows[rowIndex]!
    const at = position.get(rowIndex)!
    const parts = partsOf(row)
    const on = at === active
    const cls = ['palette-row', on ? 'is-active' : '', parts.lock ? 'is-locked' : ''].filter(Boolean).join(' ')
    return (
      <div className="palette-item" role="presentation" key={row.id}>
        <div role="option" id={ids.option(at)} aria-selected={on} aria-disabled={parts.lock ? true : undefined} className={cls} onClick={() => p.onPick(at)}>
          <span className="palette-emoji" aria-hidden="true">
            {parts.emoji}
          </span>
          <span className="palette-text">
            <span className="palette-label">{parts.label}</span>
            {parts.pinned ? <span className="sr-only"> (pinned)</span> : null}
            {parts.sub ? <span className="palette-sub">{parts.sub}</span> : null}
          </span>
          {parts.badge ? <span className="menu-row-badge">{parts.badge}</span> : null}
          {parts.lock ? (
            <span className="palette-lock">
              <span aria-hidden="true">{'\u{1F512}'}</span> {parts.lock}
            </span>
          ) : null}
        </div>
        {parts.pinnable ? (
          <button
            type="button"
            className="palette-pin"
            tabIndex={-1}
            aria-hidden="true"
            aria-pressed={parts.pinned}
            aria-label={`Pin ${parts.label}`}
            onClick={() => p.onPin(at)}
          >
            <span aria-hidden="true">{parts.pinned ? '★' : '☆'}</span>
          </button>
        ) : null}
      </div>
    )
  }

  return (
    <div className="sheet-backdrop palette-backdrop" onClick={p.onClose}>
      <ModalSurface role="dialog" label="Search" className="palette">
        <div className="palette-body" ref={p.anchorRef}>
          <div className="palette-head">
            <input
              className="palette-input"
              type="text"
              role="combobox"
              aria-label="Search actions, people and companies"
              aria-expanded="true"
              aria-controls={ids.list}
              aria-autocomplete="list"
              aria-activedescendant={active >= 0 ? ids.option(active) : undefined}
              aria-keyshortcuts="Alt+P"
              placeholder={PLACEHOLDER}
              value={state.query}
              maxLength={SUBMIT_QUERY_MAX}
              autoFocus
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
              onChange={(e) => p.onQuery(e.target.value)}
              onKeyDown={p.onKeyDown}
            />
          </div>
          <div className="sr-only" role="status" aria-live="polite">
            {view.note ? `${view.status} ${view.note}` : view.status}
          </div>
          {reading && view.rows.length > 0 ? (
            <p className="palette-note" aria-hidden="true">
              {READING_TEXT}
            </p>
          ) : null}
          <div className="palette-list" role="listbox" id={ids.list} aria-label="Results" onMouseDown={(e) => e.preventDefault()}>
            {groupsOf(view.rows).map((group, n) =>
              group.heading === null ? (
                group.rows.map(option)
              ) : (
                <div className="palette-group" role="group" aria-label={group.heading} key={`${n}:${group.heading}`}>
                  <div className="palette-heading" aria-hidden="true">
                    {group.heading}
                  </div>
                  {group.rows.map(option)}
                </div>
              ),
            )}
          </div>
          {view.rows.length === 0 ? <p className="palette-empty">{reading ? READING_TEXT : EMPTY_TEXT}</p> : null}
          {view.note ? (
            <p className="palette-note" aria-hidden="true">
              {view.note}
            </p>
          ) : null}
          {view.rows.some((r) => rowPlace(r) !== null && rowLock(r) !== GONE_TEXT) ? <p className="palette-hint">{PIN_HINT}</p> : null}
        </div>
      </ModalSurface>
    </div>
  )
}

// ---------------------------------------------------------------------------
// The container

export interface PaletteProps {
  g: GameState
  onClose: () => void
  /** Open the sheet of a place. The caller closes any sheet that is open and clears the Back to chip. */
  onOpenPlace: (place: PlaceRef & { personId?: string }) => void
  /** Test seam: use this index instead of reading the menus. */
  indexOverride?: SearchIndex | null
  /** Test seam: start with this text typed. */
  initialQuery?: string
}

/** The keys the list takes from the text field. Home and End stay with the caret, as in the combobox pattern for a field you type in. */
const KEYS = new Set(['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Enter', 'Escape'])

export function paletteEventOf(e: KeyboardEvent<HTMLInputElement>): PaletteEvent | null {
  if (e.nativeEvent.isComposing || e.ctrlKey || e.metaKey) return null
  // Option+P types a different letter on a Mac, so the key code decides.
  if (e.altKey) return e.key.toLowerCase() === 'p' || e.code === 'KeyP' ? { type: 'key', key: 'p', alt: true } : null
  return KEYS.has(e.key) ? { type: 'key', key: e.key } : null
}

export function Palette({ g, onClose, onOpenPlace, indexOverride, initialQuery }: PaletteProps): ReactElement {
  const returnPoint = useApp((s) => s.returnPoint)
  const prefs = usePrefs()
  const live = useSearchIndex(g, indexOverride === undefined)
  const index = indexOverride === undefined ? live.index : indexOverride
  const [state, setState] = useState<PaletteState>(() => ({ query: (initialQuery ?? '').slice(0, SUBMIT_QUERY_MAX), active: 0 }))
  const spot = useRef<Spot | null>(null)
  const anchorRef = useRef<HTMLDivElement | null>(null)
  const base = useId()
  const lifeId = g.lifeId

  const runner = useMenuRunner({
    onOpenGroup: () => {},
    onClose,
    onLeave: () => leaveFrom(spot.current),
    onRan: (action) => ranFrom(lifeId, spot.current, action),
  })
  useSheetEscape(anchorRef, onClose)

  const view = useMemo(() => paletteRows({ g, index, query: state.query, prefs, returnPoint }), [g, index, state.query, prefs, returnPoint])
  // Where the player put the highlight, else where the list says to start (Do Anything, when the best hit is a guess).
  const active = highlightOf(state, view)
  const rowAt = (at: number): PaletteRow | null => view.rows[view.selectable[at] ?? -1] ?? null
  const controller = makeController({ g, runner, spot, lifeId, onClose, onOpenPlace, onStale: live.refresh })
  const ids = { list: `${base}-list`, option: (i: number) => `${base}-opt-${i}` }

  // Keep the highlighted row on screen as the arrows move it.
  useEffect(() => {
    document.getElementById(`${base}-opt-${active}`)?.scrollIntoView?.({ block: 'nearest' })
  }, [base, active, view])

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    const ev = paletteEventOf(e)
    if (!ev) return
    e.preventDefault()
    const here: PaletteState = { query: state.query, active }
    const out = paletteReduce(here, view, ev)
    // Only a move changes the state; Enter and Alt+P act on the row that is highlighted now.
    if (out.state !== here) setState(out.state)
    const row = rowAt(out.state.active)
    if (out.effect === 'close') onClose()
    else if (out.effect === 'activate' && row) controller.pick(row)
    else if (out.effect === 'pin' && row) controller.pin(row)
  }

  return (
    <>
      <PaletteViewMarkup
        view={view}
        state={{ query: state.query, active }}
        ids={ids}
        onQuery={(value) => setState(paletteReduce(state, view, { type: 'query', value }).state)}
        onPick={(at) => {
          const row = rowAt(at)
          if (!row) return
          setState({ query: state.query, active: at, moved: true })
          controller.pick(row)
        }}
        onPin={(at) => {
          const row = rowAt(at)
          if (row) controller.pin(row)
        }}
        onKeyDown={onKeyDown}
        onClose={onClose}
        anchorRef={anchorRef}
      />
      {runner.overlay}
    </>
  )
}

export default Palette
