// Roving tabindex helpers (G.12). A list of rows is one Tab stop: the row that holds tabindex 0 is
// the "stop", the arrows move focus inside the list, and Tab leaves it. Pure, so the key table and
// the stop rule are tested without a DOM; the rows apply the result (see MenuRow in MenuList.tsx).

/** How far PageDown and PageUp move. */
export const ROVING_PAGE = 8

/**
 * Index to focus after `key`, or null when the key is not a roving key or there are no stops.
 * ArrowDown and ArrowUp wrap; Home and End jump; PageDown and PageUp move ROVING_PAGE and stop at
 * the ends. An `index` outside the list (-1, or a row that went away) counts as nothing focused:
 * the downward keys land on the first stop and the upward keys on the last.
 */
export function rovingMove(count: number, index: number, key: string): number | null {
  if (!Number.isInteger(count) || count < 1) return null
  const last = count - 1
  const from = Number.isInteger(index) && index >= 0 && index <= last ? index : null
  switch (key) {
    case 'ArrowDown':
      return from === null ? 0 : from === last ? 0 : from + 1
    case 'ArrowUp':
      return from === null ? last : from === 0 ? last : from - 1
    case 'Home':
      return 0
    case 'End':
      return last
    case 'PageDown':
      return from === null ? 0 : Math.min(last, from + ROVING_PAGE)
    case 'PageUp':
      return from === null ? last : Math.max(0, from - ROVING_PAGE)
    default:
      return null
  }
}

/** The id that holds tabindex 0: `activeId` when it is among `ids`, else the first; null for no ids. */
export function rovingStop(ids: readonly string[], activeId: string | null): string | null {
  if (ids.length === 0) return null
  if (activeId !== null && ids.includes(activeId)) return activeId
  return ids[0] ?? null
}
