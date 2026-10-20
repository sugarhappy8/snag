// The pure half of the modal focus kit (G.12). A dialog traps Tab, keeps the page behind it from taking focus, and gives
// focus back when it closes. The decisions are here, over plain values, so they are tested without a DOM; modal.ts
// applies them to real elements.

/** One tabbable inside the dialog, as the trap sees it: only whether it holds focus right now. */
export interface TrapNode {
  readonly active: boolean
}

export interface TrapKey {
  readonly key: string
  readonly shiftKey: boolean
}

/**
 * What to do with a key press: leave it to the browser, focus the tabbable at `index`, or keep focus on the dialog
 * itself because it has nothing to tab to.
 */
export type TrapMove = { readonly kind: 'pass' } | { readonly kind: 'focus'; readonly index: number } | { readonly kind: 'container' }

/**
 * The Tab trap. Inside the list the browser moves focus by itself, so only the ends and "focus is not in the list"
 * need a decision. Tab on the last node wraps to the first and Shift+Tab on the first wraps to the last (a single
 * node does both). When no node holds focus (focus is on the dialog itself, or got out) Tab goes to the first node
 * and Shift+Tab to the last. With no nodes at all, focus stays on the dialog. Any other key passes.
 */
export function trapFocus(nodes: readonly TrapNode[], key: TrapKey): TrapMove {
  if (key.key !== 'Tab') return { kind: 'pass' }
  if (nodes.length === 0) return { kind: 'container' }
  const last = nodes.length - 1
  const at = nodes.findIndex((n) => n.active)
  if (at === -1) return { kind: 'focus', index: key.shiftKey ? last : 0 }
  if (!key.shiftKey && at === last) return { kind: 'focus', index: 0 }
  if (key.shiftKey && at === 0) return { kind: 'focus', index: last }
  return { kind: 'pass' }
}

/** Everything that may be tabbable. isTabbable does the rest, because a selector cannot see hidden or inert. */
export const TABBABLE_SELECTOR =
  'a[href], area[href], button, input, select, textarea, summary, [contenteditable=""], [contenteditable="true"], [tabindex]'

/** What isTabbable needs to know about an element; the DOM reads these in domModalEnv. */
export interface TabCandidate {
  /** Lower-case tag name. */
  readonly tag: string
  readonly disabled: boolean
  /** The tabindex attribute as a number, or null when the element has none. */
  readonly tabIndex: number | null
  readonly hidden: boolean
  /** Inside an element with the inert attribute. */
  readonly inert: boolean
  readonly type?: string
  readonly hasHref?: boolean
  readonly editable?: boolean
}

/**
 * Disabled, hidden and inert elements never take Tab, and neither does a negative tabindex. Buttons, selects,
 * textareas and summaries do without a tabindex; inputs do unless hidden; an anchor or area does with an href.
 * Editable elements do. Anything else (a div, an anchor with no href) is a tab stop only through a tabindex of 0 or
 * more.
 */
export function isTabbable(c: TabCandidate): boolean {
  if (c.disabled || c.hidden || c.inert) return false
  if (c.tabIndex !== null && c.tabIndex < 0) return false
  switch (c.tag) {
    case 'button':
    case 'select':
    case 'textarea':
    case 'summary':
      return true
    case 'input':
      return c.type !== 'hidden'
    case 'a':
    case 'area':
      if (c.hasHref === true) return true
      break
  }
  if (c.editable === true) return true
  return c.tabIndex !== null && c.tabIndex >= 0
}

/** How to walk a tree of elements, so the walk is tested over plain objects. */
export interface TreeAccess<N> {
  parentOf(n: N): N | null
  childrenOf(n: N): readonly N[]
  /** A live region or a non-visual element that must stay reachable while a dialog is open. */
  exempt(n: N): boolean
}

/**
 * The siblings of `dialog` and of each of its ancestors up to `root`, nearest first: everything on the page that
 * must go inert while the dialog is open. The root and the ancestors are never included, since the dialog lives in
 * them, and an exempt sibling is skipped. A dialog outside `root` isolates what it can: the walk ends where the
 * parents end.
 */
export function isolationTargets<N>(dialog: N, root: N, tree: TreeAccess<N>): N[] {
  const out: N[] = []
  const seen = new Set<N>()
  let cur = dialog
  while (cur !== root && !seen.has(cur)) {
    seen.add(cur)
    const parent = tree.parentOf(cur)
    if (parent === null) break
    for (const sibling of tree.childrenOf(parent)) {
      if (sibling !== cur && !tree.exempt(sibling)) out.push(sibling)
    }
    cur = parent
  }
  return out
}

/** The first candidate that `usable` accepts, else null. Null candidates are skipped, not tested. */
export function restoreTarget<E>(candidates: readonly (E | null)[], usable: (e: E) => boolean): E | null {
  for (const c of candidates) {
    if (c !== null && usable(c)) return c
  }
  return null
}
