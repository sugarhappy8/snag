// "Needs you" (G.8): a short word or a count on a row that has something waiting, and the list of such rows at the top
// of a root menu. A badge is a pure read of the committed state, cheap enough to run for every row on every render:
// no menu is opened to find one, no dice, no write to the game. Nodes can carry their own `badge`; the registry lets a
// later release flag a row (by id, or by id prefix) without touching the menu that builds it.
//
// This module sits in the game layer, so it cannot use the menu helpers of the UI (they import it). The two checks it
// needs, "is the row shown" and "is it locked", are small copies of the ones in components/menuModel.ts.
import { companyHealth } from '../business/dashboard'
import { readBiz } from '../business/state'
import type { GameState, MenuAction, MenuGroup, MenuNode } from '../types'

export type BadgeFn = (g: GameState) => string | number | null
type PrefixBadgeFn = (g: GameState, rest: string) => string | number | null

/** Longest badge text, in characters. A longer word is cut. */
export const BADGE_MAX_CHARS = 12
/** A count above this reads "99+". */
const COUNT_CAP = 99
const DEFAULT_MAX_ROWS = 6

const byId = new Map<string, BadgeFn>()
const byPrefix = new Map<string, PrefixBadgeFn>()

/** Flag the row with this id. A second registration for the same id replaces the first. */
export function registerBadge(id: string, fn: BadgeFn): void {
  if (typeof id !== 'string' || id === '' || typeof fn !== 'function') return
  byId.set(id, fn)
}

/** Flag every row whose id starts with `prefix`; `rest` is the part of the id after it. The longest matching prefix wins. */
export function registerBadgePrefix(prefix: string, fn: PrefixBadgeFn): void {
  if (typeof prefix !== 'string' || prefix === '' || typeof fn !== 'function') return
  byPrefix.set(prefix, fn)
}

function rawBadge(node: { id: string; badge?: BadgeFn }, g: GameState): unknown {
  if (typeof node.badge === 'function') return node.badge(g)
  const exact = byId.get(node.id)
  if (exact) return exact(g)
  let bestPrefix = ''
  let best: PrefixBadgeFn | null = null
  for (const [prefix, fn] of byPrefix) {
    if (prefix.length > bestPrefix.length && node.id.startsWith(prefix)) {
      bestPrefix = prefix
      best = fn
    }
  }
  return best ? best(g, node.id.slice(bestPrefix.length)) : null
}

/** A number becomes its digits (99+ above 99; nothing for less than 1), a word is trimmed and cut; anything else is nothing. */
function clean(raw: unknown): string | null {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return null
    const n = Math.floor(raw)
    if (n < 1) return null
    return n > COUNT_CAP ? `${COUNT_CAP}+` : String(n)
  }
  if (typeof raw !== 'string') return null
  const text = raw.replace(/\s+/g, ' ').trim()
  if (!text) return null
  // Cut by code points, so an emoji is never split into a broken character.
  const points = Array.from(text)
  return points.length <= BADGE_MAX_CHARS ? text : points.slice(0, BADGE_MAX_CHARS).join('').trimEnd()
}

/** The badge to draw on a row, or null. The node's own `badge` wins, then the exact registration, then a prefix. A throw gives null. */
export function badgeText(node: { id: string; badge?: BadgeFn }, g: GameState): string | null {
  try {
    return clean(rawBadge(node, g))
  } catch (err) {
    console.error(`[menu] badge(${node.id}) failed:`, err)
    return null
  }
}

// ---------------------------------------------------------------------------
// The registered signals

/** A diagnosed condition at or above this severity counts as an illness. */
const SERIOUS = 40

registerBadge('doctor', (g) => {
  const list = g.character.conditions
  if (!Array.isArray(list)) return null
  let n = 0
  for (const c of list) if (c && c.diagnosed === true && c.severity >= SERIOUS) n += 1
  return n === 0 ? null : n === 1 ? 'Sick' : `${n} illnesses`
})

registerBadge('crime', (g) => (g.character.wantedLevel > 0 ? 'Wanted' : null))

registerBadge('occupation.jobs', (g) => {
  const c = g.character
  if (c.age < 18 || !c.alive || c.prison || c.job || c.partTimeJob || c.retired || c.education?.current) return null
  return 'No job'
})

// A list of companies costs one read each per committed state: the same state object keys the memo, and a new commit
// is a new object. The company row and the owned-asset row of one company share the entry.
const healthMemo = new WeakMap<GameState, Map<string, string | null>>()

function companyBadge(g: GameState, assetId: string): string | null {
  let seen = healthMemo.get(g)
  if (!seen) {
    seen = new Map()
    healthMemo.set(g, seen)
  }
  const hit = seen.get(assetId)
  if (hit !== undefined) return hit
  const asset = g.assets.find((a) => a.id === assetId)
  let out: string | null = null
  if (asset && asset.kind === 'business') {
    const id = companyHealth(g, asset, readBiz(g, asset)).id
    out = id === 'danger' ? 'In danger' : id === 'struggling' ? 'Struggling' : null
  }
  seen.set(assetId, out)
  return out
}

registerBadgePrefix('biz.company.', companyBadge)
registerBadgePrefix('asset-', companyBadge)

// ---------------------------------------------------------------------------
// The card

export interface NeedRow {
  node: MenuAction | MenuGroup
  badge: string
}

function shown(node: MenuNode, g: GameState): boolean {
  if (!node.visible) return true
  try {
    return node.visible(g)
  } catch (err) {
    console.error(`[menu] visible(${node.id}) failed:`, err)
    return false
  }
}

function locked(node: MenuAction | MenuGroup, g: GameState): boolean {
  if (!node.disabledReason) return false
  try {
    return !!node.disabledReason(g)
  } catch (err) {
    console.error(`[menu] disabledReason(${node.id}) failed:`, err)
    return false
  }
}

/** The rows of this list that have a badge, in list order: shown, not locked, at most `max` of them. */
export function needsYou(nodes: readonly MenuNode[], g: GameState, max: number = DEFAULT_MAX_ROWS): NeedRow[] {
  const cap = Number.isNaN(max) ? DEFAULT_MAX_ROWS : Math.max(0, Math.floor(max))
  const out: NeedRow[] = []
  for (const node of nodes) {
    if (out.length >= cap) break
    if (!node || (node.type !== 'action' && node.type !== 'menu')) continue
    const badge = badgeText(node, g)
    if (badge && shown(node, g) && !locked(node, g)) out.push({ node, badge })
  }
  return out
}
