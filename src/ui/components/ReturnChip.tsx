// "↩ Back to <menu>": after an action deep inside a sheet closes it (Activities › Computer ›
// Ventures › … › Ship Features), the game screen offers to reopen that sheet at the same
// menu once the popups are done. The spot lives in the store (UI state, never saved).
import { personAvatar } from '../../game/core'
import { activitiesMenu, assetsMenu, occupationMenu } from '../../game/menus'
import type { GameState, MenuGroup } from '../../game/types'
import type { ReturnPoint, ReturnSheet } from '../store'
import { groupChildren, nodeDisabled, returnTarget, type ReturnTarget } from './menuModel'
import { personName, safeActions } from './PersonSheet'

/** The bottom-bar menus the chip can reopen (Relationships has its own person sheets). */
export const MENU_SHEETS: Record<Exclude<ReturnSheet, 'relationships'>, MenuGroup> = {
  occupation: occupationMenu,
  assets: assetsMenu,
  activities: activitiesMenu,
}

export interface ResolvedReturn extends ReturnTarget {
  sheet: ReturnSheet
  /** Relationships: the person to reopen (only set while they're still in your life). */
  personId?: string
  /** Saved scroll offsets, root first (the menu that reopens restores its own). */
  scrolls: number[]
}

/**
 * Where the chip leads right now: the saved spot re-resolved against the latest state, or
 * its deepest part that still exists (a quit job, a sold venture, a person who left).
 */
export function resolveReturnPoint(g: GameState, point: ReturnPoint): ResolvedReturn {
  if (point.sheet === 'relationships') {
    const person = point.personId ? g.people.find((p) => p.id === point.personId) : undefined
    if (!person) {
      return { sheet: 'relationships', path: [], crumbs: ['Relationships'], label: 'Relationships', emoji: '❤️', exact: false, scrolls: [] }
    }
    const t = returnTarget(g, { label: personName(person), emoji: personAvatar(person), nodes: safeActions(g, person) }, point.path)
    return { ...t, crumbs: ['Relationships', ...t.crumbs], sheet: 'relationships', personId: person.id, scrolls: point.scrolls }
  }
  const root = MENU_SHEETS[point.sheet]
  const nodes = nodeDisabled(root, g) ? [] : groupChildren(root, g)
  const t = returnTarget(g, { label: root.label, emoji: root.emoji, nodes }, point.path)
  return { ...t, sheet: point.sheet, scrolls: point.scrolls }
}

/**
 * Opening a menu sheet yourself means you've moved on, so the chip goes. A peek at your own
 * profile or the inbox (no menu to leave from in either) keeps it: close the sheet and the chip is still there.
 */
export function openingClearsReturn(sheet: string): boolean {
  return sheet !== 'profile' && sheet !== 'inbox'
}

/** "Activities › Computer › Ventures › InvoiceSloth" (for screen readers and the tooltip). */
export function returnDescription(target: ResolvedReturn): string {
  return `Back to ${target.crumbs.join(' › ')}`
}

export interface ReturnChipProps {
  target: ResolvedReturn
  onReturn: () => void
  onDismiss: () => void
}

/** Floating pill above the bottom bar. Render it inside `.return-dock`. */
export function ReturnChip({ target, onReturn, onDismiss }: ReturnChipProps) {
  const description = returnDescription(target)
  return (
    <div className="return-chip" role="group" aria-label="Go back to where you were">
      <button type="button" className="return-chip-go" onClick={onReturn} aria-label={description} title={description}>
        <span className="return-chip-arrow" aria-hidden>
          ↩
        </span>
        <span className="return-chip-text">
          <span className="return-chip-prefix">Back to </span>
          <span className="return-chip-emoji" aria-hidden>
            {target.emoji}
          </span>
          <strong>{target.label}</strong>
        </span>
      </button>
      <button type="button" className="return-chip-x" onClick={onDismiss} aria-label="Dismiss" title="Dismiss">
        ✕
      </button>
    </div>
  )
}
