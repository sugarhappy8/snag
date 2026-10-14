// Which exchange a company the player owns trades on, and its four-letter ticker. Pure: nothing
// here reads or moves g.rng, so menus and previews can call it as often as they like.
//
// This file imports only the engine, state.ts and types, because exit.ts and conglomerate-state.ts
// import it when they list a company. "Standalone" means the company has no `group`.
import { exchangeInfo, exchangesWithCode, reservedTickers, tickerFor, type ExInfo } from '../invest/engine'
import type { Asset, GameState } from '../types'
import { businessAssets, isTicker, readBiz, type BizState } from './state'

/**
 * The exchange a company listed under `code` trades on. A code repeats across countries (TSE is
 * Tokyo and Tehran), so the company's own countries are tried first, in order. Failing that, a
 * code only one exchange uses is that exchange (a division spun off a New York group). Otherwise
 * it is the first country's own exchange.
 */
export function listedExchange(countryIds: readonly string[], code: string): ExInfo {
  for (const c of countryIds) {
    const info = exchangeInfo(c)
    if (info.ex.code === code) return info
  }
  const same = exchangesWithCode(code)
  if (same.length === 1) return same[0]
  return exchangeInfo(countryIds[0] ?? 'us')
}

/** The exchange a standalone company trades on. */
export function companyExchange(b: Pick<BizState, 'countryId' | 'exchange'>): ExInfo {
  return listedExchange([b.countryId], b.exchange)
}

/** FNV-1a, 32 bits, unsigned. */
function hashOf(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** `n` written in base 26 as `len` capital letters, A = 0. */
function letters(n: number, len: number): string {
  let out = ''
  for (let i = 0; i < len; i++) {
    out = String.fromCharCode(65 + (n % 26)) + out
    n = Math.floor(n / 26)
  }
  return out
}

/**
 * A four-letter ticker for a company, never one in `taken`, the same for the same name and id.
 * The order: the name's own ticker, then the same three letters with another last letter, then
 * two letters, then any four, each walk starting where the id's hash puts it.
 */
export function ownTickerFor(name: string, id: string, taken: ReadonlySet<string>): string {
  const base = (tickerFor(typeof name === 'string' ? name : '', 4).replace(/[^A-Z]/g, '') + 'XXXX').slice(0, 4)
  if (!taken.has(base)) return base
  const h = hashOf(typeof id === 'string' ? id : '')
  for (let k = 0; k < 26; k++) {
    const t = base.slice(0, 3) + letters((h + k) % 26, 1)
    if (!taken.has(t)) return t
  }
  for (let k = 0; k < 676; k++) {
    const t = base.slice(0, 2) + letters((h + k) % 676, 2)
    if (!taken.has(t)) return t
  }
  const all = 26 ** 4
  for (let k = 0; k < all; k++) {
    const t = letters((h + k) % all, 4)
    if (!taken.has(t)) return t
  }
  return base
}

/** Asset ids in the order the companies were made: `biz9` before `biz10`. */
function byId(x: Asset, y: Asset): number {
  const mx = /^(.*?)(\d+)$/.exec(x.id), my = /^(.*?)(\d+)$/.exec(y.id)
  if (mx && my && mx[1] === my[1]) {
    const d = Number(mx[2]) - Number(my[2])
    if (d) return d
  }
  return x.id < y.id ? -1 : x.id > y.id ? 1 : 0
}

/**
 * The ticker of every public standalone company of the player's on `info`, by asset id. A valid
 * stored ticker is kept (the earlier company wins a repeat, and the later one counts as having
 * none). Each company without one gets a derived ticker, in id order, that is not a registry
 * ticker and not one already given out. Companies are read through readBiz, so a hostile stored
 * value is dropped.
 */
export function exchangeTickers(g: GameState, info: ExInfo): Map<string, string> {
  const mine: { a: Asset; v: BizState }[] = []
  for (const a of [...businessAssets(g)].sort(byId)) {
    // readBiz reads `public` as `=== true`; checking the raw field first skips normalizing a private company.
    if (a.details.public !== true) continue
    const v = readBiz(g, a)
    if (v.public && !v.group && companyExchange(v).key === info.key) mine.push({ a, v })
  }
  const out = new Map<string, string>()
  const used = new Set<string>()
  for (const { a, v } of mine) {
    if (isTicker(v.ticker) && !used.has(v.ticker)) {
      out.set(a.id, v.ticker)
      used.add(v.ticker)
    }
  }
  const reserved = reservedTickers(info)
  for (const { a } of mine) {
    if (out.has(a.id)) continue
    const taken = new Set<string>(reserved)
    for (const t of used) taken.add(t)
    const t = ownTickerFor(a.name, a.id, taken)
    out.set(a.id, t)
    used.add(t)
  }
  return out
}

/** The ticker a company shows: the stored one if it is valid, otherwise a derived one. */
export function tickerOf(g: GameState, a: Asset, b: BizState): string {
  const info = companyExchange(b)
  return exchangeTickers(g, info).get(a.id) ?? (isTicker(b.ticker) ? b.ticker : ownTickerFor(a.name, a.id, reservedTickers(info)))
}

/** A fresh ticker for a company that is being listed now: not a registry ticker, not another of yours on that exchange. */
export function newTicker(g: GameState, a: Asset, b: BizState): string {
  const info = companyExchange(b)
  const taken = new Set<string>(reservedTickers(info))
  for (const [id, t] of exchangeTickers(g, info)) if (id !== a.id) taken.add(t)
  return ownTickerFor(a.name, a.id, taken)
}
