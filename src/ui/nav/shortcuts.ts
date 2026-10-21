// Keyboard shortcuts of the game screen (G.9, R1-N7): Ctrl or Cmd+K and "/" open the palette, 1 to 4 open the four tabs of the
// bottom bar and A ages you up. shortcutFor is a pure function of one key event and a small context, so the rules are a table in
// a test. routeKey adds what only the page knows at the moment of the key (the focused element and whether any dialog is open),
// and useGlobalShortcuts is the window listener around it.
//
// Modifiers: Ctrl, Cmd and Alt always mean "not ours" (Ctrl+1 and Ctrl+A belong to the browser and the page), except for the
// palette's own Ctrl or Cmd+K. Shift is not a modifier for "/" and the digits, because a German keyboard types "/" with Shift and
// a French one types the digits with it; it is for "A", which only ages you from the plain key (or Caps Lock), and for K, so
// Ctrl+Shift+K stays the browser's console.
//
// Only types and the dialog stack come in from other modules, and the bottom bar is imported as a type, so the bar can read
// TAB_KEYS from here without the two files importing each other at run time.
import { useEffect, useRef } from 'react'
import { isModalOpen } from '../a11y/modal'
import type { BottomTab } from '../components/BottomBar'

export type ShortcutAction = { type: 'palette' } | { type: 'tab'; tab: BottomTab } | { type: 'age' }

/** The fields of a KeyboardEvent the rules read. */
export interface ShortcutEvent {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
  repeat: boolean
}

/** What the screen knows: a key can mean something only when nothing else is asking for the keyboard. */
export interface ShortcutContext {
  /** A field that takes text has focus. */
  typing: boolean
  /** A popup is waiting in the queue. */
  queueBusy: boolean
  /** The character is dead. */
  dead: boolean
  /** A sheet, the Time Machine or any dialog is open. */
  sheetOpen: boolean
  paletteOpen: boolean
  /** A popup, or any dialog, owns the digits and Enter. */
  popupOpen: boolean
}

/** The digit that opens each tab, in the order of the bottom bar. The bar prints these as its hints; shortcutFor reads them back. */
export const TAB_KEYS: Readonly<Record<BottomTab, string>> = { occupation: '1', assets: '2', relationships: '3', activities: '4' }

const TAB_OF_KEY = new Map<string, BottomTab>((Object.keys(TAB_KEYS) as BottomTab[]).map((tab) => [TAB_KEYS[tab], tab]))

/** A context in which no key does anything. GameScreen passes it while FLAGS.navPalette is off, so nothing is listened for. */
export const SHORTCUTS_OFF: ShortcutContext = Object.freeze({
  typing: true,
  queueBusy: true,
  dead: true,
  sheetOpen: true,
  paletteOpen: true,
  popupOpen: true,
})

/** The action a key press means in this context, or null to leave the key alone. */
export function shortcutFor(ev: ShortcutEvent, ctx: ShortcutContext): ShortcutAction | null {
  // A held key repeats; a key with no text (browser autofill sends such events) is nothing.
  if (typeof ev.key !== 'string' || ev.repeat) return null
  const key = ev.key
  const stopped = ctx.queueBusy || ctx.dead || ctx.popupOpen

  if ((ev.ctrlKey || ev.metaKey) && !ev.altKey && !ev.shiftKey && (key === 'k' || key === 'K')) {
    return stopped ? null : { type: 'palette' }
  }
  if (ev.ctrlKey || ev.metaKey || ev.altKey) return null

  if (key === '/') return ctx.typing || stopped ? null : { type: 'palette' }

  const tab = TAB_OF_KEY.get(key)
  if (tab !== undefined) return ctx.typing || stopped || ctx.paletteOpen ? null : { type: 'tab', tab }

  if ((key === 'a' || key === 'A') && !ev.shiftKey) {
    return ctx.typing || stopped || ctx.sheetOpen || ctx.paletteOpen ? null : { type: 'age' }
  }
  return null
}

/** True for a field that takes text: an input, a text area, a select or anything editable. Duck-typed, so a test can pass a plain object. */
export function isTypingTarget(el: unknown): boolean {
  if (el === null || typeof el !== 'object') return false
  const { tagName, isContentEditable } = el as { tagName?: unknown; isContentEditable?: unknown }
  return tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT' || isContentEditable === true
}

/** What only the page knows at the moment of a key. */
export interface PageNow {
  active: unknown
  modalOpen: boolean
}

export function pageNow(): PageNow {
  return { active: typeof document === 'undefined' ? null : document.activeElement, modalOpen: isModalOpen() }
}

/**
 * One key press: the context from the last render, plus the focused element and the dialog stack as they are now (a dialog can
 * open or close without the screen drawing again). A key that is a shortcut is kept from the browser and handed on. Returns
 * whether it was one.
 */
export function routeKey(
  ev: ShortcutEvent & { preventDefault(): void },
  ctx: ShortcutContext,
  handle: (action: ShortcutAction) => void,
  page: PageNow = pageNow(),
): boolean {
  const now: ShortcutContext = {
    ...ctx,
    typing: ctx.typing || isTypingTarget(page.active),
    sheetOpen: ctx.sheetOpen || page.modalOpen,
    popupOpen: ctx.popupOpen || page.modalOpen,
  }
  const action = shortcutFor(ev, now)
  if (action === null) return false
  ev.preventDefault()
  handle(action)
  return true
}

/** Listen for the shortcuts on the window for as long as the component is mounted. Calls preventDefault on a key it handles. */
export function useGlobalShortcuts(ctx: ShortcutContext, handle: (action: ShortcutAction) => void): void {
  const ctxRef = useRef(ctx)
  const handleRef = useRef(handle)
  // The listener is added once and reads the latest render through these.
  useEffect(() => {
    ctxRef.current = ctx
    handleRef.current = handle
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      routeKey(e, ctxRef.current, (action) => handleRef.current(action))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
