// Pure helpers for evaluating menu nodes safely (no React, no store), shared by the menu
// UI and unit-tested on their own. A bug in one feature menu must not take the UI down,
// so every callback is wrapped.
import type { GameState, MenuAction, MenuGroup, MenuInfo, MenuNode } from '../../game/types'

export function report(where: string, err: unknown): void {
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

export function infoText(node: MenuInfo, g: GameState): string {
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

export function confirmText(action: MenuAction, g: GameState): string | null {
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

/** Long-form text inputs (e.g. "Do Anything") get a multi-line field. */
export function isMultiline(action: MenuAction): boolean {
  const input = action.input
  if (!input || input.kind !== 'text') return false
  return action.id === 'doAnything' || (input.placeholder?.length ?? 0) > 36 || input.label.length > 40
}
