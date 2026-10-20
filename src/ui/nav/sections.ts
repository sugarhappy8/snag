// Render-time regrouping of a long root list (G.8). The data order never changes (see game/hubs/sections.ts); this puts
// the same node objects in section order and adds headings, only inside MenuSheet. Pure: no state, no copies of nodes.
import { SECTION_LABEL, SECTION_MIN_ROWS, SECTION_ORDER, SECTIONED_ROOTS, sectionOf, type SectionId } from '../../game/hubs/sections'
import type { GameState, MenuNode } from '../../game/types'
import { nodeVisible } from '../components/menuModel'

const DO_ANYTHING = 'doAnything'
const SURRENDER = 'surrenderLife'

function isRow(node: MenuNode): boolean {
  return node.type === 'action' || node.type === 'menu'
}

/**
 * The list as MenuSheet shows it. Returns `nodes` itself (same array) when the root is not sectioned, the player is in
 * prison, or fewer than SECTION_MIN_ROWS rows are visible. Otherwise: leading info and heading nodes, Do Anything, then one heading and the
 * rows of each section that has a visible row (rows keep their data order), then a blank heading that starts a card of
 * its own and Surrender. A row that is not visible travels with its section and shows nothing. An info node stays right
 * after the row that came before it; a heading in the middle of the data is dropped, the section headings replace it.
 */
export function regroupForDisplay(rootId: string, nodes: MenuNode[], g: GameState): MenuNode[] {
  if (!SECTIONED_ROOTS.includes(rootId)) return nodes
  // The prison list is a different list (inmate actions, none of them in the table) and is long, so the row count alone
  // would not spare it: it is shown as it is.
  if (g.character.prison) return nodes
  const visibleRows = new Set<MenuNode>()
  for (const node of nodes) if (isRow(node) && nodeVisible(node, g)) visibleRows.add(node)
  if (visibleRows.size < SECTION_MIN_ROWS) return nodes

  const lead: MenuNode[] = []
  const first: MenuNode[] = []
  const last: MenuNode[] = []
  const buckets = new Map<SectionId, MenuNode[]>()
  // Where the next info node goes: with the leading nodes until the first row, then with the row before it.
  let sink = lead
  for (const node of nodes) {
    if (node.type === 'heading') {
      if (sink === lead) lead.push(node)
      continue
    }
    if (!isRow(node)) {
      sink.push(node)
      continue
    }
    if (node.id === DO_ANYTHING && first.length === 0) sink = first
    else if (node.id === SURRENDER && last.length === 0) sink = last
    else {
      const section = sectionOf(node)
      let bucket = buckets.get(section)
      if (!bucket) {
        bucket = []
        buckets.set(section, bucket)
      }
      sink = bucket
    }
    sink.push(node)
  }

  const out: MenuNode[] = [...lead, ...first]
  for (const section of SECTION_ORDER) {
    const bucket = buckets.get(section)
    if (!bucket) continue
    if (bucket.some((n) => visibleRows.has(n))) out.push({ type: 'heading', id: `${rootId}.h.${section}`, label: SECTION_LABEL[section] })
    out.push(...bucket)
  }
  if (last.length > 0) out.push({ type: 'heading', id: `${rootId}.h.last`, label: '' }, ...last)
  return out
}
