// Shared plumbing of the Market & Competition screen: the hint cache (menus re-render often and the
// what-ifs run the planner; nothing here is ever stored in state), the live-asset lookup, the
// Business talent gate and the action builder every move on the screen uses. Pure: building a menu
// never touches the game state or its dice.
import { isExact, lookCloser } from '../knowledge/contract'
import { hasTalent } from '../talents'
import type { Asset, GameState, MenuAction, MenuNode } from '../types'
import { manageBlock } from './gate'
import { bizOf, findBusiness, readBiz, type BizState } from './state'
import { priceCapOf } from './util'

const cache = new Map<string, unknown>()

/** Compute `make` once per (life, company state, year, Business talent) and keep it for the next render. */
export function cached<T>(g: GameState, a: Asset, what: string, make: () => T): T {
  const key = `${what}|${g.lifeId}|${a.id}|${g.year}|${g.character.stats.smarts}|${hasTalent(g, 'Business') ? 1 : 0}|${priceCapOf(g, a.id) ?? '-'}|${JSON.stringify(a.details)}`
  if (cache.has(key)) return cache.get(key) as T
  const v = make()
  cache.set(key, v)
  if (cache.size > 96) {
    const first = cache.keys().next().value
    if (first !== undefined) cache.delete(first)
  }
  return v
}

/** The company as it is now (a menu built earlier may hold a stale asset). */
export function live(g: GameState, a: Asset): Asset {
  return findBusiness(g, a.id) ?? a
}

/** Purple Business-talent hints show for a talented player on a company they can manage. */
export function hinting(g: GameState, a: Asset): boolean {
  return hasTalent(g, 'Business') && !manageBlock(g, a)
}

/** Companies with a price to cut (game studios sell games at launch prices instead). */
export function priced(b: BizState): boolean {
  return b.industry !== 'gameStudio' && b.price > 0
}

export interface ActOpts {
  subtitle?: (g: GameState) => string
  hint?: (g: GameState) => string | null
  disabled?: (g: GameState, b: BizState) => string | null
  confirm?: (g: GameState) => string | null
  visible?: (g: GameState) => boolean
  run: (g: GameState, a: Asset, b: BizState) => void
}

/** A market action: greyed out when the company can't be managed, and always re-reads the live company. */
export function mAct(a: Asset, key: string, label: string, emoji: string, opts: ActOpts): MenuAction {
  return {
    type: 'action',
    id: `biz.mkt.${key}.${a.id}`,
    label,
    emoji,
    ...(opts.subtitle ? { subtitle: opts.subtitle } : {}),
    ...(opts.hint ? { hint: opts.hint } : {}),
    ...(opts.visible ? { visible: opts.visible } : {}),
    disabledReason: (g) => {
      const block = manageBlock(g, a)
      if (block) return block
      return opts.disabled ? opts.disabled(g, readBiz(g, a)) : null
    },
    confirm: opts.confirm,
    run: (g) => {
      const cur = findBusiness(g, a.id)
      if (!cur || manageBlock(g, cur)) return
      const b = bizOf(g, cur)
      if (opts.disabled?.(g, b)) return
      opts.run(g, cur, b)
    },
  }
}

/**
 * The "Look closer" row a screen of fogged numbers ends with (R3-G3): one group of sources the player can pay to sharpen `keys`,
 * or nothing. Nothing in Exact mode (every number is shown as it is), for no keys, for keys no owner can read, and when every
 * source is blocked; Knowledge's lookCloser decides all of that. `id` names the screen; the group's own id adds the company, so one
 * company's screens never clash with another's (`look.biz.mkt.look.<id>.<asset>`). Pure: building it prices the offers and writes nothing.
 */
export function lookFor(g: GameState, a: Asset, id: string, keys: readonly string[]): MenuNode[] {
  if (isExact() || keys.length === 0) return []
  const row = lookCloser(g, { id: `biz.mkt.look.${id}.${a.id}`, keys })
  return row ? [row] : []
}
