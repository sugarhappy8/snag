// Generic renderer for a MenuGroup tree (Occupation / Assets / Activities): a bottom sheet
// with a back-arrow navigation stack. Rows re-render from the latest game state after
// every action. It can reopen at a remembered spot ("Back to …" chip on the game screen).
import { FLAGS } from '../../game/flags'
import { needsYou } from '../../game/hubs/needs'
import type { MenuGroup } from '../../game/types'
import { Breadcrumbs, crumbsOf } from '../nav/Breadcrumbs'
import { NeedsYouCard } from '../nav/NeedsYouCard'
import { isPinned, PINS_FULL_TEXT, recordRecent, tabOf, togglePin, updatePrefs, usePrefs } from '../nav/prefs'
import { regroupForDisplay } from '../nav/sections'
import { useApp } from '../store'
import { groupChildren, groupHeader, MenuRows, nodeDisabled, resolveTrail, useMenuNav, useMenuRunner, useSheetEscape, type MenuSpot } from './MenuList'
import { Sheet } from './Sheet'

export interface MenuSheetProps {
  root: MenuGroup
  onClose: () => void
  /** Open at this spot (or the deepest part of it that still exists) instead of the root. */
  initial?: MenuSpot | null
  /** An action is about to close the sheet: where the player was. */
  onLeave?: (spot: MenuSpot) => void
}

export function MenuSheet({ root, onClose, initial, onLeave }: MenuSheetProps) {
  const g = useApp((s) => s.game)
  const rootReason = g ? nodeDisabled(root, g) : null
  const rootNodes = g && !rootReason ? groupChildren(root, g) : []
  const nav = useMenuNav((path) => (g ? resolveTrail(g, rootNodes, path) : []), initial)
  // Recents (G.9): a place worth coming back to is one the player acted in. Only the four tabs have places.
  const tab = tabOf(root.id)
  const runner = useMenuRunner({
    onOpenGroup: nav.push,
    onClose,
    onLeave: onLeave && (() => onLeave(nav.snapshot())),
    onRan: (a) => {
      if (g && tab) recordRecent(g.lifeId, { tab, path: nav.snapshot().path, id: a.id })
    },
  })
  useSheetEscape(nav.anchorRef, () => (nav.trail.length > 0 ? nav.pop() : onClose()))
  const prefs = usePrefs()

  if (!g) return null

  const current = nav.trail.length > 0 ? nav.trail[nav.trail.length - 1] : root
  const nodes = nav.trail.length > 0 ? groupChildren(current, g) : rootNodes
  const header = groupHeader(current, g)
  // Root level only (G.8): the "Needs you" card and the sectioned order. The data list stays the one that trails resolve against.
  const atRoot = FLAGS.navRegroup && nav.trail.length === 0 && !rootReason
  const shown = atRoot ? regroupForDisplay(root.id, nodes, g) : nodes
  const needs = atRoot ? needsYou(nodes, g) : []
  const crumbs = FLAGS.navRegroup && nav.trail.length > 0 ? crumbsOf(root.label, nav.trail) : null
  // The star pins the open group (G.9), so it only shows where there is a group to pin.
  const place = tab && crumbs ? { tab, path: nav.trail.map((t) => t.id) } : null
  const pin =
    FLAGS.navPalette && place
      ? {
          pinned: isPinned(prefs, g.lifeId, place),
          label: current.label,
          onToggle: () => {
            let full = false
            updatePrefs((p) => {
              const r = togglePin(p, g.lifeId, place)
              full = r.reason === 'full'
              return r.prefs
            })
            if (full) runner.toast(PINS_FULL_TEXT)
          },
        }
      : undefined

  return (
    <>
      <Sheet
        title={current.label}
        emoji={current.emoji}
        onClose={onClose}
        onBack={nav.trail.length > 0 ? nav.pop : undefined}
        subheader={crumbs ? <Breadcrumbs crumbs={crumbs} onGo={nav.popTo} pin={pin} /> : undefined}
      >
        <div ref={nav.anchorRef}>
          {header ? <div className="menu-header">{header}</div> : null}
          {rootReason ? (
            <div className="menu-empty">
              <div style={{ fontSize: 40, marginBottom: 8 }}>{root.emoji}</div>
              {rootReason}
            </div>
          ) : (
            <>
              <NeedsYouCard rows={needs} onTap={runner.tap} />
              <MenuRows nodes={shown} g={g} onTap={runner.tap} />
            </>
          )}
        </div>
      </Sheet>
      {runner.overlay}
    </>
  )
}
