// The modal controller (G.12). openModal puts one dialog on a stack: it makes the rest of the page inert, takes
// focus, traps Tab, and on close gives focus back. It talks to the page through ModalEnv, so the logic is tested
// against plain objects; domModalEnv is the real one and useModal is the React hook that wires it up.
//
// Dialogs stack (a popup over a sheet). The page behind is made inert once however many dialogs ask for it: a
// reference count per element, so closing the top dialog keeps what the lower one still needs inert, and only the
// last one to close releases it. Only the top dialog handles keys and pulls focus back.
import { useEffect, useRef, useState, type RefObject } from 'react'
import { isolationTargets, isTabbable, restoreTarget, TABBABLE_SELECTOR, trapFocus, type TreeAccess } from './focus'

/** Everything openModal needs from the page. E is an element; it must be an object, since counts are kept in a WeakMap. */
export interface ModalEnv<E> {
  readonly root: E
  readonly tree: TreeAccess<E>
  active(): E | null
  /** True for the element itself too, like Node.contains. */
  contains(outer: E, inner: E): boolean
  tabbables(container: E): readonly E[]
  focus(e: E): void
  setInert(e: E, on: boolean): void
  /** Connected, not disabled, not inert, not <body>: something focus can land on. */
  usable(e: E): boolean
  isBody(e: E): boolean
  /** The [data-focus-home] element: where focus goes when the opener and every other dialog are gone. */
  home(): E | null
}

export interface ModalHandle {
  handleKey(e: { key: string; shiftKey: boolean; preventDefault(): void }): void
  /** Focus the container when focus was lost (activeElement is body or detached) and this is the topmost modal. */
  refocus(): void
  close(): void
}

interface Layer {
  readonly container: unknown
}

const stack: Layer[] = []
const inertCounts = new WeakMap<object, number>()

/** True while any dialog is open. Keyboard shortcuts stay quiet then. */
export function isModalOpen(): boolean {
  return stack.length > 0
}

/**
 * Open a dialog on `container`. `opener` is the element that had focus before it opened (null if none); it gets focus
 * back on close when it can take it.
 */
export function openModal<E>(env: ModalEnv<E>, container: E, opener: E | null): ModalHandle {
  const layer: Layer = { container }
  stack.push(layer)
  let closed = false

  const targets = isolationTargets(container, env.root, env.tree)
  for (const t of targets) {
    const key = t as unknown as object
    const n = inertCounts.get(key) ?? 0
    inertCounts.set(key, n + 1)
    if (n === 0) env.setInert(t, true)
  }

  const inContainer = (e: E | null): boolean => e !== null && (e === container || env.contains(container, e))
  const onTop = (): boolean => stack[stack.length - 1] === layer

  // A child with autoFocus has already taken focus by now; leave it where it is.
  if (!inContainer(env.active())) env.focus(container)

  return {
    handleKey(e) {
      if (closed || !onTop()) return
      const tabbables = env.tabbables(container)
      const current = env.active()
      const move = trapFocus(
        tabbables.map((el) => ({ active: el === current })),
        e,
      )
      if (move.kind === 'focus') {
        e.preventDefault()
        env.focus(tabbables[move.index] as E)
      } else if (move.kind === 'container') {
        e.preventDefault()
        env.focus(container)
      }
    },

    refocus() {
      if (closed || !onTop()) return
      const a = env.active()
      if (a === null || env.isBody(a) || !inContainer(a)) env.focus(container)
    },

    close() {
      if (closed) return
      closed = true
      const at = stack.indexOf(layer)
      if (at !== -1) stack.splice(at, 1)

      // Decide before anything moves: restore only when focus is in this dialog or on the body (the dialog's own
      // element was removed). Focus that already went to another dialog is not ours to take back.
      const a = env.active()
      const restore = a === null || env.isBody(a) || inContainer(a)

      // Lift inert first: an inert element cannot take focus, and the opener is usually behind it.
      for (const t of targets) {
        const key = t as unknown as object
        const n = (inertCounts.get(key) ?? 1) - 1
        if (n > 0) {
          inertCounts.set(key, n)
        } else {
          inertCounts.delete(key)
          env.setInert(t, false)
        }
      }

      if (!restore) return
      const next = stack[stack.length - 1]
      const target = restoreTarget<E>([opener, next ? (next.container as E) : null, env.home()], (e) => env.usable(e))
      if (target !== null) env.focus(target)
    },
  }
}

const NON_VISUAL = new Set(['SCRIPT', 'STYLE', 'LINK', 'TEMPLATE'])

/** The real page. Null without a document (a server render, a node test). */
export function domModalEnv(): ModalEnv<HTMLElement> | null {
  if (typeof document === 'undefined') return null
  return {
    root: document.getElementById('root') ?? document.body,
    tree: {
      parentOf: (el) => el.parentElement,
      childrenOf: (el) => Array.from(el.children) as HTMLElement[],
      exempt: (el) => el.hasAttribute('data-modal-exempt') || NON_VISUAL.has(el.tagName),
    },
    active: () => document.activeElement as HTMLElement | null,
    contains: (outer, inner) => outer.contains(inner),
    tabbables: (container) =>
      Array.from(container.querySelectorAll<HTMLElement>(TABBABLE_SELECTOR)).filter((el) =>
        isTabbable({
          tag: el.tagName.toLowerCase(),
          disabled: el.matches(':disabled'),
          tabIndex: el.getAttribute('tabindex') === null ? null : el.tabIndex,
          hidden: !!el.hidden || el.getClientRects().length === 0,
          inert: el.closest('[inert]') !== null,
          type: el.tagName === 'INPUT' ? (el as HTMLInputElement).type : undefined,
          hasHref: el.hasAttribute('href'),
          editable: el.isContentEditable,
        }),
      ),
    focus: (el) => el.focus(),
    setInert: (el, on) => {
      if (on) el.setAttribute('inert', '')
      else el.removeAttribute('inert')
    },
    usable: (el) => el.isConnected && !el.matches(':disabled') && el.closest('[inert]') === null && el !== document.body,
    isBody: (el) => el === document.body,
    home: () => document.querySelector<HTMLElement>('[data-focus-home]'),
  }
}

/**
 * Make the element behind `ref` a modal for as long as the component is mounted. The opener is read during the first
 * render, because React autoFocus moves focus at commit, before any effect runs. Nothing runs on the server.
 */
export function useModal(ref: RefObject<HTMLElement | null>): void {
  const [opener] = useState<Element | null>(() => (typeof document === 'undefined' ? null : document.activeElement))
  const handleRef = useRef<ModalHandle | null>(null)

  useEffect(() => {
    const env = domModalEnv()
    const container = ref.current
    if (!env || !container) return undefined
    const handle = openModal(env, container, opener as HTMLElement | null)
    handleRef.current = handle
    const onKey = (e: KeyboardEvent): void => handle.handleKey(e)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      handleRef.current = null
      handle.close()
    }
    // Once, on mount: the opener and the ref never change for the life of the dialog.
  }, [])

  // A level change in a menu removes the row that had focus; take it back after every render.
  useEffect(() => {
    handleRef.current?.refocus()
  })
}
