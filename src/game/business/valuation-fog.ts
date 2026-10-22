// R3-G10 (H.8): what a private company is worth is an appraisal, not a posted price. In Realistic mode the screens that used to print
// "value $4.2M" for a company that is not listed read it through the estimate core (knowledge/contract.ts) and say it as a range with
// a confidence chip, and a Look closer group (an analyst's appraisal, an audit) sharpens it for a fee. A listed company's market cap
// is a quote and stays exact, a company with nothing to value has nothing to blur, and Exact mode is today's text, byte for byte.
//
//   valueRead(g, a, b)       { text, conf?, asOf? }: the amount a row prints and the confidence behind it
//   valueText(g, a, b, ...)  the same as a phrase with its label ('worth $3M to $6M', 'Valued at about $4.2M' in Exact)
//   valueChip(g, a, b)       the { conf, asOf } to spread on the row that says it ({} when exact)
//   stakeText(g, a, b, s)    what the owner's share of it is: the same band times the share, so the two never disagree
//   valueLook / valuesLook   the Look closer group for one company, or for the companies of one screen
//   valKey                   the key `val:<asset id>:value` (an id a key cannot carry is hashed)
//
// What stays exact on purpose: net worth and the asset rows (the player's own books, spec 6.2), the Annual Report and an offer to buy
// (a quote of the real valuation: selling, merging and every event still run on b.valuation). Nothing here is rolled or written: a
// reading is a hashed draw (knowledge/normal.ts), and a bought one is the record Knowledge keeps in flags.know.
//
// The kind `val` is registered below with the truth of every private company of the player, which is what makes buyIntel and Look closer
// work for these keys. The scope of a read is the company's country alone (Knowledge prices it: never the buyer's cash, and never the size
// of the company, so a hundred times the valuation pays the same fee).
import { hashKey } from '../kernel/streams'
import { know, lookCloser, registerKeyKind, wordsFor } from '../knowledge/contract'
import type { Asset, GameState, MenuGroup, MenuNode } from '../types'
import { isBusinessAsset, readBiz, stakeValue, type BizState } from './state'
import { money } from './util'

/** A piece of a menu row and the confidence behind it (both left out when the number is exact). */
export interface Fogged {
  text: string
  conf?: 0 | 1 | 2 | 3
  asOf?: number
}

/** The part of a key that is one id: what knowledge/keys.ts lets through. */
const KEY_ID = /^[A-Za-z0-9._~-]{1,40}$/

/** The key of one company's valuation. An id with a character a key cannot carry (or a long one) is hashed to a short word. */
export function valKey(assetId: string): string {
  const id = typeof assetId === 'string' && KEY_ID.test(assetId) ? assetId : (hashKey(String(assetId)) >>> 0).toString(36)
  return `val:${id}:value`
}

// ---------------------------------------------------------------------------------------------------------------------------------
// The kind: what a key reads

interface Private {
  a: Asset
  b: BizState
}

/** The private company a key names, or null: none of the player's, two that share the key, or a listed one (a quote is exact). */
function privateOf(g: GameState, key: string): Private | null {
  let hit: Asset | null = null
  for (const a of Array.isArray(g.assets) ? g.assets : []) {
    if (!isBusinessAsset(a) || valKey(a.id) !== key) continue
    if (hit) return null
    hit = a
  }
  if (!hit) return null
  const b = readBiz(g, hit)
  return b.public ? null : { a: hit, b }
}

registerKeyKind({
  kind: 'val',
  label: (g, key) => {
    const p = privateOf(g, key)
    return p ? `${p.a.name} valuation` : "A company's valuation"
  },
  truth: (g, key) => {
    const p = privateOf(g, key)
    return p && p.b.valuation > 0 ? p.b.valuation : null
  },
  scope: (g, key) => {
    const p = privateOf(g, key)
    // The country and nothing about the size: an audit of the player's own company is 8,000 x the wealth of its country at $4M and at $4T alike.
    // The 2% of a deal in Knowledge's diligence rule is the cost of looking at someone else's target; here the object is the player's own
    // asset, so its worth would make the fee a share of the buyer's wealth (the owner rule: intel never costs by wealth).
    return p ? { tier: 1, country: p.b.countryId } : { tier: 1 }
  },
})

// ---------------------------------------------------------------------------------------------------------------------------------
// What a screen prints

/** A company with a posted price or with nothing to value is read as it is. */
const plain = (b: BizState): boolean => b.public || !(b.valuation > 0)

/**
 * What a company is worth, as a row says it. A listed company, a company with nothing to value and Exact mode keep `money(b.valuation)`
 * and no confidence; a private company reads as a range, a rounded figure or a word, by how sharp the reading is.
 */
export function valueRead(g: GameState, a: Asset, b: BizState): Fogged {
  if (plain(b)) return { text: money(b.valuation) }
  const e = know(g, valKey(a.id), b.valuation)
  if (e.exact) return { text: money(b.valuation) }
  return { text: e.words, conf: e.conf, ...(e.asOf !== undefined ? { asOf: e.asOf } : {}) }
}

/** The confidence (and the year, once it is old) to put on the row that says valueRead: nothing when the number is exact. */
export function valueChip(g: GameState, a: Asset, b: BizState): Pick<Fogged, 'conf' | 'asOf'> {
  const r = valueRead(g, a, b)
  return r.conf === undefined ? {} : { conf: r.conf, ...(r.asOf !== undefined ? { asOf: r.asOf } : {}) }
}

/**
 * The valuation as a phrase: `${label} ${amount}`, or the amount alone. `about` is how the old text rounded an exact figure ('Valued at
 * about $4.2M'); a range says it is rough by itself, so the word goes only where the number is exact.
 */
export function valueText(g: GameState, a: Asset, b: BizState, label?: string, opts: { about?: boolean } = {}): string {
  const r = valueRead(g, a, b)
  const amount = r.conf === undefined && opts.about ? `about ${r.text}` : r.text
  return label ? `${label} ${amount}` : amount
}

/**
 * What the owner's part of the company is worth: `stake` (the true figure, stakeValue(b) unless a caller works it out another way)
 * as exact money, or the valuation's own band times stake over valuation. The band holds the true stake exactly when the valuation
 * band holds the true valuation, and the two lines on a screen are the same reading.
 */
export function stakeText(g: GameState, a: Asset, b: BizState, stake: number = stakeValue(b)): string {
  if (plain(b) || !(stake > 0)) return money(stake)
  const e = know(g, valKey(a.id), b.valuation)
  if (e.exact) return money(stake)
  const r = stake / b.valuation
  return wordsFor('money', { mid: e.mid * r, lo: e.lo * r, hi: e.hi * r, conf: e.conf })
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Look closer

/** Whether a company has a valuation worth looking closer at: private, and worth something. */
const readable = (b: BizState): boolean => !plain(b)

/** The Look closer group for one company's valuation (an analyst's appraisal, an audit), or null: Exact mode, a listed company or none worth reading. */
export function valueLook(g: GameState, a: Asset, b: BizState): MenuGroup | null {
  if (!readable(b)) return null
  return lookCloser(g, { id: `val.${a.id}`, keys: [valKey(a.id)] })
}

/** The Look closer group for the companies one screen lists, as nodes to spread at the end of its rows (none when there is nothing to read). */
export function valuesLook(g: GameState, id: string, list: readonly { a: Asset; b: BizState }[]): MenuNode[] {
  const keys = list.filter((x) => readable(x.b)).map((x) => valKey(x.a.id))
  const group = keys.length ? lookCloser(g, { id: `val.${id}`, keys }) : null
  return group ? [group] : []
}
