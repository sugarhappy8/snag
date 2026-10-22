// Shared menu machinery: renders MenuNode lists as BitLife-style rows and runs actions
// (disabled reasons, input + confirm dialogs, stay-open vs close). Used by MenuSheet
// (Occupation / Assets / Activities) and PersonSheet (person interactions).
import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { formatPrice } from '../../game/core'
import type { GameState, MenuAction, MenuGroup, MenuNode } from '../../game/types'
import { rovingMove, rovingStop } from '../a11y/roving'
import { LazyChartView, LazySparkline } from '../charts/lazy'
import { getApp, runMenuAction } from '../store'
import { ConfChip } from './ConfChip'
import { ConfirmDialog, InputDialog, Toast } from './Dialogs'
import {
  confirmText,
  infoChart,
  infoText,
  isMultiline,
  nodeBadge,
  nodeConf,
  nodeDisabled,
  nodeHint,
  nodeSubtitle,
  nodeVisible,
  pathAfterOpen,
  pathAfterPopTo,
  pathAfterPush,
  report,
  sliderPreview,
} from './menuModel'
import { TalentHint } from './TalentHint'
import { HINT_EMOJI } from '../../game/talents'
import '../styles/nav.css'

export { groupChildren, groupHeader, nodeDisabled, nodeHint, nodeSubtitle, nodeVisible, resolveTrail } from './menuModel'

// ---------------------------------------------------------------------------
// Navigation stack (group ids) with scroll restoration.

export interface MenuNav {
  /** Groups currently opened, root first (re-resolved from the latest state). */
  trail: MenuGroup[]
  /** Open a group from the list currently shown. */
  push: (group: MenuGroup) => void
  /** Go back one level. */
  pop: () => void
  /** Go back to the list at level `n` (0 is the root list); an `n` that is not above the current list does nothing. */
  popTo: (n: number) => void
  /** Open a sheet's tree at this group path from anywhere (the ids are re-resolved against the latest state). */
  openPath: (ids: string[]) => void
  /** Attach to an element inside the scrolling sheet body (scroll restoration). */
  anchorRef: React.RefObject<HTMLDivElement | null>
  /** Where the player is right now: open group ids and every level's scroll offset. */
  snapshot: () => MenuSpot
}

/** A place inside a sheet's menu tree (see ReturnPoint in the store). */
export interface MenuSpot {
  /** Group ids, root first. */
  path: string[]
  /** Scroll offset of every level, root first; the last one is the menu that is showing. */
  scrolls: number[]
}

/**
 * Navigation stack for nested menus. `resolve` turns the stored id path into groups
 * using the latest state (see resolveTrail); groups that vanished, e.g. a job you just
 * quit, are dropped automatically. `initial` reopens a sheet where the player left it
 * (or at the deepest part of that path that still exists).
 */
export function useMenuNav(resolve: (path: string[]) => MenuGroup[], initial?: MenuSpot | null): MenuNav {
  const [path, setPath] = useState<string[]>(() => (initial ? [...initial.path] : []))
  const anchorRef = useRef<HTMLDivElement | null>(null)
  const scrolls = useRef<number[]>(initial ? initial.scrolls.slice(0, initial.path.length) : [])
  // Reopening: restore the scroll of whatever level we land on once it has rendered.
  const restore = useRef<number[] | null>(initial ? initial.scrolls : null)
  const pendingScroll = useRef<number | null>(null)
  const trail = resolve(path)
  const depth = trail.length

  const scroller = () => (anchorRef.current?.closest('.sheet-body') as HTMLElement | null) ?? null

  useEffect(() => {
    if (depth < path.length) setPath((p) => p.slice(0, depth))
  }, [depth, path.length])

  useEffect(() => {
    if (restore.current) {
      pendingScroll.current = restore.current[depth] ?? 0
      restore.current = null
    }
    const el = scroller()
    if (!el || pendingScroll.current === null) return
    el.scrollTop = pendingScroll.current
    pendingScroll.current = null
  }, [depth])

  return {
    trail,
    anchorRef,
    push: (group) => {
      scrolls.current[depth] = scroller()?.scrollTop ?? 0
      pendingScroll.current = 0
      setPath(pathAfterPush(path, depth, group.id))
    },
    pop: () => {
      if (depth === 0) return
      pendingScroll.current = scrolls.current[depth - 1] ?? 0
      setPath(path.slice(0, depth - 1))
    },
    popTo: (n) => {
      const next = pathAfterPopTo(path, depth, n)
      if (next === path) return
      pendingScroll.current = scrolls.current[n] ?? 0
      setPath(next)
    },
    openPath: (ids) => {
      scrolls.current[depth] = scroller()?.scrollTop ?? 0
      pendingScroll.current = 0
      setPath(pathAfterOpen(ids))
    },
    snapshot: () => ({
      path: trail.map((t) => t.id),
      scrolls: [...Array.from({ length: depth }, (_, i) => scrolls.current[i] ?? 0), scroller()?.scrollTop ?? 0],
    }),
  }
}

/**
 * Escape key for sheets: goes back (or closes) the topmost sheet only, and never while a
 * popup or dialog is on screen. `anchorRef` must point inside the sheet's body.
 */
export function useSheetEscape(anchorRef: React.RefObject<HTMLElement | null>, onEscape: () => void): void {
  const handler = useRef(onEscape)
  useEffect(() => {
    handler.current = onEscape
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      if (document.querySelector('.popup-backdrop')) return
      const mine = anchorRef.current?.closest('.sheet-backdrop')
      const all = document.querySelectorAll('.sheet-backdrop')
      if (!mine || all[all.length - 1] !== mine) return
      e.preventDefault()
      handler.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [anchorRef])
}

// ---------------------------------------------------------------------------
// Running actions

type Pending =
  | { stage: 'input'; action: MenuAction; defaultValue: string }
  | { stage: 'confirm'; action: MenuAction; input?: string; text: string }

export interface MenuRunnerOptions {
  onOpenGroup: (group: MenuGroup) => void
  /** Close the whole sheet (after an action without stayOpen). */
  onClose: () => void
  /** Called right before an action closes the sheet (remember where the player was). */
  onLeave?: () => void
  /** Called when an action is about to run, before onLeave and before the action, also for a stayOpen action. */
  onRan?: (action: MenuAction) => void
}

export interface MenuRunner {
  tap: (node: MenuAction | MenuGroup) => void
  /** Dialogs and toasts; render it next to the sheet. */
  overlay: ReactNode
  /** Show a short message (e.g. a locked feature). */
  toast: (message: string) => void
  /** Run an action whose input is already in hand (a search row): skips the input dialog, keeps the confirm step. */
  submit: (action: MenuAction, input: string) => void
}

export function useMenuRunner(opts: MenuRunnerOptions): MenuRunner {
  const [pending, setPending] = useState<Pending | null>(null)
  const [toast, setToastState] = useState<{ message: string; n: number } | null>(null)
  const toastCount = useRef(0)
  const setToast = (message: string | null) => {
    toastCount.current += 1
    setToastState(message ? { message, n: toastCount.current } : null)
  }
  const optsRef = useRef(opts)
  useEffect(() => {
    optsRef.current = opts
  })

  const execute = (action: MenuAction, input: string | undefined) => {
    setPending(null)
    const g = getApp().game
    if (!g || !g.character.alive) return
    try {
      optsRef.current.onRan?.(action)
    } catch (err) {
      report(`onRan(${action.id})`, err)
    }
    if (!action.stayOpen) {
      // Snapshot first: the action may change which menus exist.
      try {
        optsRef.current.onLeave?.()
      } catch (err) {
        report(`onLeave(${action.id})`, err)
      }
    }
    runMenuAction(action, input)
    if (!action.stayOpen) optsRef.current.onClose()
  }

  const afterInput = (action: MenuAction, input: string | undefined) => {
    const g = getApp().game
    if (!g) return
    const text = confirmText(action, g)
    if (text) setPending({ stage: 'confirm', action, input, text })
    else execute(action, input)
  }

  const tap = (node: MenuAction | MenuGroup) => {
    const g = getApp().game
    if (!g) return
    setToast(null)
    if (!g.character.alive) {
      setToast("You're dead. There's not much left to do.")
      return
    }
    // A popup is on screen (it covers the sheet); ignore stray taps.
    if (g.queue.length > 0) return
    const reason = nodeDisabled(node, g)
    if (reason) {
      setToast(reason)
      return
    }
    if (node.type === 'menu') {
      optsRef.current.onOpenGroup(node)
      return
    }
    if (node.input) {
      let defaultValue = ''
      try {
        defaultValue = node.input.defaultValue?.(g) ?? ''
      } catch (err) {
        report(`defaultValue(${node.id})`, err)
      }
      setPending({ stage: 'input', action: node, defaultValue })
      return
    }
    afterInput(node, undefined)
  }

  let dialog: ReactNode = null
  if (pending?.stage === 'input') {
    const { action } = pending
    const input = action.input!
    // The caption reads the committed state (never a draft) and must not change it.
    const preview = input.kind === 'slider' && typeof input.preview === 'function'
      ? (value: number) => {
          const g = getApp().game
          return g ? sliderPreview(input, g, value) : null
        }
      : undefined
    dialog = (
      <InputDialog
        key={`in-${action.id}`}
        title={action.label}
        emoji={action.emoji}
        label={input.label}
        kind={input.kind}
        placeholder={input.placeholder}
        defaultValue={pending.defaultValue}
        min={input.min}
        max={input.max}
        step={input.step}
        unit={input.unit}
        preview={preview}
        money={input.money === true && input.kind !== 'text'}
        roundDefault={input.roundDefault === true}
        multiline={isMultiline(action)}
        submitLabel={action.id === 'doAnything' ? 'Do it' : 'Done'}
        onCancel={() => setPending(null)}
        onSubmit={(value) => afterInput(action, value)}
      />
    )
  } else if (pending?.stage === 'confirm') {
    const { action, input, text } = pending
    dialog = (
      <ConfirmDialog
        key={`cf-${action.id}`}
        title={action.label}
        emoji={action.emoji}
        text={text}
        onCancel={() => setPending(null)}
        onConfirm={() => execute(action, input)}
      />
    )
  }

  return {
    tap,
    toast: setToast,
    submit: afterInput,
    overlay: (
      <>
        {dialog}
        {toast ? <Toast key={toast.n} message={toast.message} onDone={() => setToastState(null)} /> : null}
      </>
    ),
  }
}

// ---------------------------------------------------------------------------
// Rendering

export interface MenuRowsProps {
  nodes: MenuNode[]
  g: GameState
  onTap: (node: MenuAction | MenuGroup) => void
  /** Shown when nothing is visible. */
  emptyText?: string
}

type Section = { heading: string | null; key: string; rows: ReactNode[] }

/**
 * A list of rows grouped into cards, split by heading nodes. The action and group rows are one
 * Tab stop (roving tabindex): the arrows, Home, End and the page keys move focus between them.
 */
export function MenuRows({ nodes, g, onTap, emptyText = 'Nothing to do here right now.' }: MenuRowsProps) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const instance = useId()

  // First pass: what shows, under which React key. Duplicate ids would break React keys; keep the first.
  const shown: { key: string; node: MenuNode }[] = []
  const seen = new Set<string>()
  for (const node of nodes) {
    if (!nodeVisible(node, g)) continue
    const key = seen.has(node.id) ? `${node.id}#${seen.size}` : node.id
    seen.add(node.id)
    shown.push({ key, node })
  }
  // The keys of the tappable rows, in render order, decide which one holds tabindex 0.
  const stop = rovingStop(
    shown.filter((s) => s.node.type === 'action' || s.node.type === 'menu').map((s) => s.key),
    activeId,
  )

  // Second pass: the elements.
  const sections: Section[] = []
  let current: Section | null = null
  for (const { key, node } of shown) {
    if (node.type === 'heading') {
      current = { heading: node.label, key, rows: [] }
      sections.push(current)
      continue
    }
    if (!current) {
      current = { heading: null, key: '__top', rows: [] }
      sections.push(current)
    }
    if (node.type === 'info') {
      const text = infoText(node, g)
      const chart = infoChart(node, g)
      if (chart) {
        // The words are what shows while the chart chunk loads, on the server, and if the load fails.
        current.rows.push(
          <div className="menu-info menu-info-chart" key={key}>
            <LazyChartView spec={chart} fallback={text ? <span>{text}</span> : undefined} />
          </div>,
        )
        continue
      }
      if (!text) continue
      const sure = nodeConf(node, g)
      current.rows.push(
        <div className={node.emoji === HINT_EMOJI ? 'menu-info menu-info-hint' : 'menu-info'} key={key}>
          {node.emoji ? <span className="menu-info-emoji">{node.emoji}</span> : null}
          <span>{text}</span>
          {sure ? <ConfChip conf={sure.conf} asOf={sure.asOf} /> : null}
        </div>,
      )
      continue
    }
    current.rows.push(
      <MenuRow key={key} node={node} g={g} onTap={onTap} tabStop={key === stop} rovingGroup={instance} onRovingFocus={() => setActiveId(key)} />,
    )
  }

  const visible = sections.filter((s) => s.rows.length > 0)
  if (visible.length === 0) return <div className="menu-empty">{emptyText}</div>

  return (
    <>
      {visible.map((s) => (
        <section className="menu-section" key={s.key}>
          {s.heading ? <div className="menu-heading">{s.heading}</div> : null}
          <div className="menu-list">{s.rows}</div>
        </section>
      ))}
    </>
  )
}

/** Moves focus between the rows of one roving list; `group` is the `data-roving` value they share. */
function onRovingKeyDown(e: ReactKeyboardEvent<HTMLButtonElement>, group: string) {
  if (e.altKey || e.ctrlKey || e.metaKey) return
  const root = e.currentTarget.closest('.sheet-body') ?? document
  const stops = Array.from(root.querySelectorAll<HTMLElement>('[data-roving]')).filter((el) => el.getAttribute('data-roving') === group)
  const next = rovingMove(stops.length, stops.indexOf(e.currentTarget), e.key)
  if (next === null) return
  e.preventDefault()
  stops[next]?.focus()
}

/**
 * The trend a row draws at its end (MenuBase.spark): null for none, for fewer than two real points, and for a spark that
 * throws (reported, like a subtitle). The row is drawn either way.
 */
function nodeSpark(node: MenuAction | MenuGroup, g: GameState): (number | null)[] | null {
  if (typeof node.spark !== 'function') return null
  try {
    const values: unknown = node.spark(g)
    if (!Array.isArray(values)) return null
    let real = 0
    for (const v of values as unknown[]) if (typeof v === 'number' && Number.isFinite(v)) real++
    return real >= 2 ? (values as (number | null)[]) : null
  } catch (err) {
    report(`spark(${node.id})`, err)
    return null
  }
}

export function MenuRow({
  node,
  g,
  onTap,
  tabStop,
  rovingGroup,
  onRovingFocus,
}: {
  node: MenuAction | MenuGroup
  g: GameState
  onTap: (node: MenuAction | MenuGroup) => void
  /** Roving list only: this row holds tabindex 0. */
  tabStop?: boolean
  /** Set to make the row part of a roving list; rows with the same value share one Tab stop. */
  rovingGroup?: string
  /** Roving list only: the row took focus, so it becomes the stop. */
  onRovingFocus?: () => void
}) {
  const reason = nodeDisabled(node, g)
  const subtitle = nodeSubtitle(node, g)
  const hint = nodeHint(node, g)
  const badge = reason ? null : nodeBadge(node, g)
  const trend = nodeSpark(node, g)
  const sure = nodeConf(node, g)
  const cls = ['menu-row', reason ? 'is-disabled' : '', hint ? 'has-hint' : ''].filter(Boolean).join(' ')
  return (
    <button
      type="button"
      className={cls}
      onClick={() => onTap(node)}
      aria-disabled={reason ? true : undefined}
      title={reason ?? undefined}
      tabIndex={rovingGroup ? (tabStop ? 0 : -1) : undefined}
      data-roving={rovingGroup}
      onFocus={rovingGroup ? onRovingFocus : undefined}
      onKeyDown={rovingGroup ? (e) => onRovingKeyDown(e, rovingGroup) : undefined}
    >
      <span className="menu-row-icon" aria-hidden>
        {node.emoji}
      </span>
      <span className="menu-row-text">
        <span className="menu-row-label">{node.label}</span>
        {badge ? <span className="menu-row-badge">{badge}</span> : null}
        {subtitle ? <span className="menu-row-sub">{subtitle}</span> : null}
        {sure ? <ConfChip conf={sure.conf} asOf={sure.asOf} /> : null}
        {hint ? <TalentHint text={hint} className="menu-row-hint" /> : null}
      </span>
      <span className="menu-row-end" aria-hidden>
        {trend ? (
          // The box holds the place until the chunk is in. The sparkline has no fallback of its own, so a failed load leaves
          // the box empty instead of a retry button in every row (lazyView: a decorative view in a row passes null).
          <span className="menu-spark-ph" aria-hidden>
            <LazySparkline values={trend} tone="c6" label={`${node.label}, price over ten years`} fmt={formatPrice} fallback={null} />
          </span>
        ) : null}
        {reason ? <span className="menu-row-lock">🔒</span> : null}
        {node.type === 'menu' && !reason ? <span className="menu-row-chevron">›</span> : null}
      </span>
    </button>
  )
}
