// The wealth half of the cockpits (G.5): one card for each company the player owns, for the Assets tab. A card is a small,
// finite summary of a company's books: who it is, how it is doing, its sales of the last years, what it earned last year
// and how long its cash lasts. Pure, like every hub: no draw, no write to the game, and no foresight (only settled years
// and the live books). The numbers are the ones the company screen prints; a company whose books are damaged gets 0 or
// null in the damaged place and still gets its card.
//
// A hub must not import menus.ts, manage.ts, business.ts, career.ts or assets.ts (import cycles). The card only asks the
// dashboard for the health read and the runway, which the company screen asks for too.
import { companyHealth, runway, type HealthId } from '../business/dashboard'
import { industryDef } from '../business/industries'
import { businessAssets, readBiz } from '../business/state'
import { fit } from '../charts/money'
import type { Asset, GameState } from '../types'

export interface CompanyCard {
  assetId: string
  name: string
  emoji: string
  industry: string
  health: { id: HealthId; label: string; emoji: string }
  /** The last up to 10 years of revenue, oldest first. A year with no usable number is a gap (null). */
  sales: (number | null)[]
  salesNow: number | null
  net: number | null
  valuation: number
  cash: number
  /** Years the cash lasts at last year's loss. Null when the company is not losing money. */
  runwayYears: number | null
  /** The path under the Assets tab that opens the company. */
  open: string[]
}

/** Cards a cockpit shows. */
export const MAX_CARDS = 12
/** Companies looked at in one pass, so a save with a very long list costs a bounded read. */
const SCAN = 60
const SALES_POINTS = 10
const NAME_MAX = 40
const FALLBACK_HEALTH: CompanyCard['health'] = { id: 'steady', label: 'Steady', emoji: '\u{1F44D}' }
const FALLBACK_EMOJI = '\u{1F3E2}'

/** `v` when it is a finite number, else null. */
export function finiteOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/** Text for a card or a tile: a string, with no control character, in one line and cut short, or `fallback`. */
export function plainText(v: unknown, fallback: string, max: number = NAME_MAX): string {
  const raw = typeof v === 'string' ? v : ''
  const clean = raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
  return clean === '' ? fallback : fit(clean, max)
}

function cardOf(g: GameState, a: Asset): CompanyCard {
  const b = readBiz(g, a)
  const def = industryDef(b.industry)
  let health = FALLBACK_HEALTH
  try {
    const read = companyHealth(g, a, b)
    health = { id: read.id, label: read.label, emoji: read.emoji }
  } catch (err) {
    console.error(`[hubs] companyHealth(${a.id}) failed:`, err)
  }
  let runwayYears: number | null = null
  try {
    const years = finiteOrNull(runway(g, a, b))
    runwayYears = years === null ? null : Math.max(0, years)
  } catch (err) {
    console.error(`[hubs] runway(${a.id}) failed:`, err)
  }
  // The id is a key into the Assets list: it is never cut or cleaned.
  const id = typeof a.id === 'string' ? a.id : ''
  return {
    assetId: id,
    name: plainText(a.name, 'Your company'),
    emoji: typeof a.emoji === 'string' && a.emoji !== '' ? a.emoji : def.emoji || FALLBACK_EMOJI,
    industry: plainText(def.label, 'Company'),
    health,
    sales: b.history.slice(-SALES_POINTS).map((h) => finiteOrNull(h.revenue)),
    salesNow: b.last ? finiteOrNull(b.last.revenue) : null,
    net: b.last ? finiteOrNull(b.last.net) : null,
    valuation: finiteOrNull(b.valuation) ?? 0,
    cash: finiteOrNull(b.cash) ?? 0,
    runwayYears,
    open: [`asset-${id}`],
  }
}

// One answer for each committed state and cap (a new commit is a new object), so a sheet that renders again after a tap
// does not read every company again. The arrays are shared: callers must not change them.
const memo = new WeakMap<GameState, Map<number, CompanyCard[]>>()

/**
 * The cards of the player's companies, richest first, at most `max` (default 12; a cap that is not a number is the
 * default). Memoised per state object.
 */
export function companyCards(g: GameState, max: number = MAX_CARDS): CompanyCard[] {
  const cap = Number.isFinite(max) ? Math.max(0, Math.min(SCAN, Math.floor(max))) : MAX_CARDS
  let byCap = memo.get(g)
  if (!byCap) {
    byCap = new Map()
    memo.set(g, byCap)
  }
  const hit = byCap.get(cap)
  if (hit) return hit
  const cards: CompanyCard[] = []
  for (const a of businessAssets(g).slice(0, SCAN)) {
    try {
      cards.push(cardOf(g, a))
    } catch (err) {
      console.error(`[hubs] companyCards(${a.id}) failed:`, err)
    }
  }
  // Array.prototype.sort is stable, so companies of the same worth keep the order of the Assets list.
  const out = cards.sort((p, q) => q.valuation - p.valuation).slice(0, cap)
  byCap.set(cap, out)
  return out
}
