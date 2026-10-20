// R1-C3: stripR1, the helper behind the lead's "R1 changes no simulation output" probe (R1-P9 compares the R1 head with the
// R0 head through it). Not a test file; vitest only runs *.test.ts.
//
// R1 adds optional keys to a saved life and keeps more company history. stripR1 takes a saved-state JSON and returns a copy
// without any of it, so what is left must equal what v4.0.3 would have saved for the same run:
//   - the 14 book keys (BOOK_KEYS) of a company's year rows, and company history cut back to its last 10 rows
//   - `top` on a market's history rows (the eight-rival list)
//   - `spark` on a graveyard entry (the ones kept in flags.bumpedGraves)
//   - flags.lifeSeries and flags.inbox
//   - `chart` in the data of a queued annualReport
//   - `weight` and `link` on a queued notice
//   - flags.flavorRecent is rebuilt from flags.textMem.r.flavor, and that ring leaves textMem (R1-T2 moved it); any other
//     key left in textMem is a real difference and stays
//
// Each rule is by shape, not by key name alone: this game has other keys called `top`, `spark` and `history`
// (ai-bench-market.ts keeps a `top`), and stripping those from the R1 side only would show a difference that is not one.
// The input is never written to.
import { BOOK_KEYS } from '../src/game/business/state'

const SIM_ROWS = 10
const YEAR_ROW_KEYS = ['year', 'revenue', 'profit', 'tax', 'units', 'price', 'staff', 'valuation', 'outlets'] as const
const MARKET_ROW_KEYS = ['year', 'share', 'rank', 'size'] as const

type Obj = Record<string, unknown>

function isObj(v: unknown): v is Obj {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

function hasNumbers(o: Obj, keys: readonly string[]): boolean {
  return keys.every((k) => typeof o[k] === 'number')
}

/** A company's `history`: a non-empty list whose every item is a YearRecord (all nine old numbers present). */
function isCompanyHistory(key: string, v: unknown): v is Obj[] {
  return key === 'history' && Array.isArray(v) && v.length > 0 && v.every((r) => isObj(r) && hasNumbers(r, YEAR_ROW_KEYS))
}

/** A market's `history`: a non-empty list whose every item has a year, share, rank and size and no company-row fields. */
function isMarketHistory(key: string, v: unknown): v is Obj[] {
  return key === 'history' && Array.isArray(v) && v.length > 0 && v.every((r) => isObj(r) && hasNumbers(r, MARKET_ROW_KEYS) && !('revenue' in r))
}

function isGraveyardEntry(o: Obj): boolean {
  return typeof o.lifeId === 'string' && typeof o.causeOfDeath === 'string'
}

function isNoticeModal(o: Obj): boolean {
  return o.kind === 'notice' && typeof o.id === 'string'
}

function isAnnualReportModal(o: Obj): boolean {
  return o.kind === 'minigame' && o.game === 'annualReport' && isObj(o.data)
}

function stripFlags(flags: Obj): void {
  delete flags.lifeSeries
  delete flags.inbox
  const mem = flags.textMem
  if (isObj(mem) && isObj(mem.r) && Array.isArray(mem.r.flavor) && mem.r.flavor.every((x) => typeof x === 'string')) {
    flags.flavorRecent = mem.r.flavor
    delete mem.r.flavor
    if (Object.keys(mem.r).length === 0) delete mem.r
    if (Object.keys(mem).length === 0) delete flags.textMem
  }
}

function walk(v: unknown, key: string): unknown {
  if (Array.isArray(v)) {
    let items: unknown[] = v
    if (isCompanyHistory(key, v)) {
      items = v.slice(-SIM_ROWS).map((r) => {
        const row = { ...r }
        for (const k of BOOK_KEYS) delete row[k]
        return row
      })
    } else if (isMarketHistory(key, v)) {
      items = v.map((r) => {
        const row = { ...r }
        delete row.top
        return row
      })
    }
    return items.map((x) => walk(x, ''))
  }
  if (!isObj(v)) return v
  const out: Obj = {}
  for (const [k, x] of Object.entries(v)) out[k] = walk(x, k)
  if (isGraveyardEntry(out)) delete out.spark
  if (isNoticeModal(out)) {
    delete out.weight
    delete out.link
  }
  if (isAnnualReportModal(out)) delete (out.data as Obj).chart
  return out
}

/** A copy of a saved-state JSON with every R1 addition taken away (see the top of this file). */
export function stripR1(json: unknown): unknown {
  const out = walk(json, '')
  if (isObj(out) && isObj(out.flags)) stripFlags(out.flags)
  return out
}
