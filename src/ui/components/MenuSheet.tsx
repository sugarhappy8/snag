// Generic renderer for a MenuGroup tree (Occupation / Assets / Activities): a bottom sheet
// with a back-arrow navigation stack. Rows re-render from the latest game state after
// every action.
import type { MenuGroup } from '../../game/types'
import { useApp } from '../store'
import { groupChildren, groupHeader, MenuRows, nodeDisabled, resolveTrail, useMenuNav, useMenuRunner, useSheetEscape } from './MenuList'
import { Sheet } from './Sheet'

export interface MenuSheetProps {
  root: MenuGroup
  onClose: () => void
}

export function MenuSheet({ root, onClose }: MenuSheetProps) {
  const g = useApp((s) => s.game)
  const rootReason = g ? nodeDisabled(root, g) : null
  const rootNodes = g && !rootReason ? groupChildren(root, g) : []
  const nav = useMenuNav((path) => (g ? resolveTrail(g, rootNodes, path) : []))
  const runner = useMenuRunner({ onOpenGroup: nav.push, onClose })
  useSheetEscape(nav.anchorRef, () => (nav.trail.length > 0 ? nav.pop() : onClose()))

  if (!g) return null

  const current = nav.trail.length > 0 ? nav.trail[nav.trail.length - 1] : root
  const nodes = nav.trail.length > 0 ? groupChildren(current, g) : rootNodes
  const header = groupHeader(current, g)

  return (
    <>
      <Sheet
        title={current.label}
        emoji={current.emoji}
        onClose={onClose}
        onBack={nav.trail.length > 0 ? nav.pop : undefined}
      >
        <div ref={nav.anchorRef}>
          {header ? <div className="menu-header">{header}</div> : null}
          {rootReason ? (
            <div className="menu-empty">
              <div style={{ fontSize: 40, marginBottom: 8 }}>{root.emoji}</div>
              {rootReason}
            </div>
          ) : (
            <MenuRows nodes={nodes} g={g} onTap={runner.tap} />
          )}
        </div>
      </Sheet>
      {runner.overlay}
    </>
  )
}
