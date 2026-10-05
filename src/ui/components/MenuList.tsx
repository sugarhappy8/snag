// Shared menu machinery: renders MenuNode lists as BitLife-style rows and runs actions
// (disabled reasons, input + confirm dialogs, stay-open vs close). Used by MenuSheet
// (Occupation / Assets / Activities) and PersonSheet (person interactions).
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { GameState, MenuAction, MenuGroup, MenuNode } from '../../game/types'
import { getApp, runMenuAction } from '../store'
import { ConfirmDialog, InputDialog, Toast } from './Dialogs'

// ---------------------------------------------------------------------------
// Safe accessors: a bug in one feature menu must not take the whole UI down.

function report(where: string, err: unknown): void {
  console.error(`[menu] ${where} failed:`, err)
}

export function nodeVisible(node: MenuNode, g: GameState): boolean {
  if (!node.visible) return true
  try {
    return node.visible(g)
  } catch (err) {
    report(`visible(${node.id})`, err)
    return false
  }
}

export function nodeDisabled(node: MenuAction | MenuGroup, g: GameState): string | null {
  if (!node.disabledReason) return null
  try {
    return node.disabledReason(g) || null
  } catch (err) {
    report(`disabledReason(${node.id})`, err)
    return null
  }
}

export function nodeSubtitle(node: MenuAction | MenuGroup, g: GameState): string | null {
  const s = node.subtitle
  if (!s) return null
  if (typeof s === 'string') return s
  try {
    return s(g) || null
  } catch (err) {
    report(`subtitle(${node.id})`, err)
    return null
  }
}

function infoText(node: Extract<MenuNode, { type: 'info' }>, g: GameState): string {
  if (typeof node.text === 'string') return node.text
  try {
    return node.text(g)
  } catch (err) {
    report(`info(${node.id})`, err)
    return ''
  }
}

export function groupChildren(group: MenuGroup, g: GameState): MenuNode[] {
  try {
    return group.children(g)
  } catch (err) {
    report(`children(${group.id})`, err)
    return [{ type: 'info', id: `${group.id}.error`, emoji: '⚠️', text: "This menu couldn't be loaded right now." }]
  }
}

export function groupHeader(group: MenuGroup, g: GameState): string | null {
  if (!group.header) return null
  try {
    return group.header(g) || null
  } catch (err) {
    report(`header(${group.id})`, err)
    return null
  }
}

function confirmText(action: MenuAction, g: GameState): string | null {
  if (!action.confirm) return null
  try {
    return action.confirm(g) || null
  } catch (err) {
    report(`confirm(${action.id})`, err)
    return null
  }
}

/**
 * Follow a path of group ids from the root list, re-resolving every level from the
 * latest state. Stops early when a group disappeared or became hidden/locked.
 */
export function resolveTrail(g: GameState, rootNodes: MenuNode[], path: string[]): MenuGroup[] {
  const trail: MenuGroup[] = []
  let nodes = rootNodes
  for (const id of path) {
    const next = nodes.find((n): n is MenuGroup => n.type === 'menu' && n.id === id && nodeVisible(n, g))
    if (!next || nodeDisabled(next, g)) break
    trail.push(next)
    nodes = groupChildren(next, g)
  }
  return trail
}

// ---------------------------------------------------------------------------
// Navigation stack (group ids) with scroll restoration.

export interface MenuNav {
  /** Groups currently opened, root first (re-resolved from the latest state). */
  trail: MenuGroup[]
  /** Open a group from the list currently shown. */
  push: (group: MenuGroup) => void
  /** Go back one level. */
  pop: () => void
  /** Attach to an element inside the scrolling sheet body (scroll restoration). */
  anchorRef: React.RefObject<HTMLDivElement | null>
}

/**
 * Navigation stack for nested menus. `resolve` turns the stored id path into groups
 * using the latest state (see resolveTrail); groups that vanished, e.g. a job you just
 * quit, are dropped automatically.
 */
export function useMenuNav(resolve: (path: string[]) => MenuGroup[]): MenuNav {
  const [path, setPath] = useState<string[]>([])
  const anchorRef = useRef<HTMLDivElement | null>(null)
  const scrolls = useRef<number[]>([])
  const pendingScroll = useRef<number | null>(null)
  const trail = resolve(path)
  const depth = trail.length

  const scroller = () => (anchorRef.current?.closest('.sheet-body') as HTMLElement | null) ?? null

  useEffect(() => {
    if (depth < path.length) setPath((p) => p.slice(0, depth))
  }, [depth, path.length])

  useEffect(() => {
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
      setPath([...path.slice(0, depth), group.id])
    },
    pop: () => {
      if (depth === 0) return
      pendingScroll.current = scrolls.current[depth - 1] ?? 0
      setPath(path.slice(0, depth - 1))
    },
  }
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
}

export interface MenuRunner {
  tap: (node: MenuAction | MenuGroup) => void
  /** Dialogs and toasts; render it next to the sheet. */
  overlay: ReactNode
  /** Show a short message (e.g. a locked feature). */
  toast: (message: string) => void
}

function isMultiline(action: MenuAction): boolean {
  const input = action.input
  if (!input || input.kind !== 'text') return false
  return action.id === 'doAnything' || (input.placeholder?.length ?? 0) > 36 || input.label.length > 40
}

export function useMenuRunner(opts: MenuRunnerOptions): MenuRunner {
  const [pending, setPending] = useState<Pending | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const optsRef = useRef(opts)
  useEffect(() => {
    optsRef.current = opts
  })

  const execute = (action: MenuAction, input: string | undefined) => {
    setPending(null)
    const g = getApp().game
    if (!g || !g.character.alive) return
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
    overlay: (
      <>
        {dialog}
        {toast ? <Toast key={toast} message={toast} onDone={() => setToast(null)} /> : null}
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

/** A list of rows grouped into cards, split by heading nodes. */
export function MenuRows({ nodes, g, onTap, emptyText = 'Nothing to do here right now.' }: MenuRowsProps) {
  const sections: Section[] = []
  let current: Section | null = null
  const seen = new Set<string>()

  for (const node of nodes) {
    if (!nodeVisible(node, g)) continue
    // Duplicate ids would break React keys; keep the first.
    const key = seen.has(node.id) ? `${node.id}#${seen.size}` : node.id
    seen.add(node.id)
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
      if (!text) continue
      current.rows.push(
        <div className="menu-info" key={key}>
          {node.emoji ? <span className="menu-info-emoji">{node.emoji}</span> : null}
          <span>{text}</span>
        </div>,
      )
      continue
    }
    current.rows.push(<MenuRow key={key} node={node} g={g} onTap={onTap} />)
  }

  const visible = sections.filter((s) => s.rows.length > 0)
  if (visible.length === 0) return <div className="menu-empty">{emptyText}</div>

  return (
    <>
      {visible.map((s) => (
        <section key={s.key}>
          {s.heading ? <div className="menu-heading">{s.heading}</div> : null}
          <div className="menu-list">{s.rows}</div>
        </section>
      ))}
    </>
  )
}

export function MenuRow({ node, g, onTap }: { node: MenuAction | MenuGroup; g: GameState; onTap: (node: MenuAction | MenuGroup) => void }) {
  const reason = nodeDisabled(node, g)
  const subtitle = nodeSubtitle(node, g)
  return (
    <button
      type="button"
      className={reason ? 'menu-row is-disabled' : 'menu-row'}
      onClick={() => onTap(node)}
      aria-disabled={reason ? true : undefined}
      title={reason ?? undefined}
    >
      <span className="menu-row-icon" aria-hidden>
        {node.emoji}
      </span>
      <span className="menu-row-text">
        <span className="menu-row-label">{node.label}</span>
        {subtitle ? <span className="menu-row-sub">{subtitle}</span> : null}
      </span>
      <span className="menu-row-end" aria-hidden>
        {reason ? <span className="menu-row-lock">🔒</span> : null}
        {node.type === 'menu' ? <span className="menu-row-chevron">›</span> : null}
      </span>
    </button>
  )
}
