// Places (G.9): where a menu row lives, as plain data and as a short string. A place is a tab, the ids of the groups
// below the tab's root, and (when the place is an action) the action's id. Pins, recents and inbox links store this form,
// never a node, so a place that has gone stale is found out when it is resolved against the latest state.
//
// No React and no runtime import from the palette zone: IndexEntry comes in with `import type` only, which keeps this file
// free to load from the main bundle (a11y's test/lazy-zones.test.ts guards the zone).
import { personGroupId } from '../../game/hubs/people'
import type { IndexEntry } from './searchIndex'

export type SearchTab = 'occupation' | 'assets' | 'relationships' | 'activities'

/** `path`: the group ids after the tab (on Relationships the first is `person.<id>`). `id`: the action id when the place is an action. */
export interface PlaceRef {
  tab: SearchTab
  path: string[]
  id?: string
}

const TABS: readonly SearchTab[] = ['occupation', 'assets', 'relationships', 'activities']

/** Most group ids in a place, and the longest id. The pins and recents store (R1-N5) holds places to the same bounds. */
const MAX_PATH = 12
const MAX_SEGMENT = 80
/** A key longer than this cannot hold 12 segments and an id of 80 characters each, however they are escaped (9 characters at most per character), so it is refused unread. */
const MAX_KEY = 10_000

function isTab(s: string): s is SearchTab {
  return (TABS as readonly string[]).includes(s)
}

/** encodeURIComponent throws on a lone surrogate; a place read back from storage may hold one. */
function encode(s: string): string {
  try {
    return encodeURIComponent(s)
  } catch {
    return encodeURIComponent(s.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '�'))
  }
}

/** `activities/computer/ventures`, or `activities/computer#ventureId` for an action. Every segment is escaped, so `/` and `#` in an id are safe. */
export function placeKey(p: PlaceRef): string {
  const head = [p.tab, ...p.path.map(encode)].join('/')
  return p.id === undefined ? head : `${head}#${encode(p.id)}`
}

function decode(raw: string): string | null {
  if (raw === '') return null
  try {
    const s = decodeURIComponent(raw)
    return s !== '' && s.length <= MAX_SEGMENT ? s : null
  } catch {
    return null
  }
}

/** The reverse of placeKey. Garbage, an unknown tab, an empty or over-long segment, or more than 12 path segments gives null. */
export function parsePlaceKey(s: string): PlaceRef | null {
  if (typeof s !== 'string' || s === '' || s.length > MAX_KEY) return null
  const hash = s.indexOf('#')
  const head = hash < 0 ? s : s.slice(0, hash)
  const parts = head.split('/')
  const tab = parts[0]
  if (!isTab(tab) || parts.length - 1 > MAX_PATH) return null
  const path: string[] = []
  for (const raw of parts.slice(1)) {
    const seg = decode(raw)
    if (seg === null) return null
    path.push(seg)
  }
  if (hash < 0) return { tab, path }
  const rawId = s.slice(hash + 1)
  if (rawId.includes('#') || rawId.includes('/')) return null
  const id = decode(rawId)
  return id === null ? null : { tab, path, id }
}

export function samePlace(a: PlaceRef, b: PlaceRef): boolean {
  return a.tab === b.tab && a.id === b.id && a.path.length === b.path.length && a.path.every((seg, i) => seg === b.path[i])
}

/** The place of an index entry: a group is its own path, an action is its parent's path plus its id. */
export function placeOfEntry(e: IndexEntry): PlaceRef {
  return e.type === 'action' ? { tab: e.tab, path: e.idPath.slice(0, -1), id: e.id } : { tab: e.tab, path: [...e.idPath] }
}

/**
 * The place of a remembered spot (a ReturnPoint without its scrolls). On Relationships the spot keeps the person apart
 * (`personId`, then the path inside the sheet); a place keeps the person as the first segment, `person.<id>`.
 */
export function recentFromSpot(tab: SearchTab, spot: { path: string[]; personId?: string }): PlaceRef {
  const path = (Array.isArray(spot.path) ? spot.path : []).filter((id): id is string => typeof id === 'string' && id !== '')
  if (tab === 'relationships' && typeof spot.personId === 'string' && spot.personId !== '') {
    const person = personGroupId(spot.personId)
    if (path[0] !== person) path.unshift(person)
  }
  return { tab, path: path.slice(0, MAX_PATH) }
}
