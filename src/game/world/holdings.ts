// The holdings table (R2-L15, design 13.2): who owns how much of each company and home the world indexes. One table, rows
// [owner, asset, share], sorted by asset then owner, and every asset sums to 1: the part nobody is named for belongs to OUTSIDE.
//
//   buildHoldings(g)       pure; the table as the records say it is right now
//   readHoldings(g)        pure; the table as last written (absent reads as { v: 1, y: 0, rows: [] })
//   syncHoldings(g)        the writer: idempotent, and it replaces the shard root only when the table changed
//   holdersOf / holdingsOf the stored table seen from the asset, or from the owner
//
// The table is built from the records as they are, read raw: the details of a company asset, the family shares written in them, the
// old NPC firm inside its owner and the player's stake in it (an investment asset). No normalizeBiz and no clone, and nothing is
// written into a record. It names only the companies and homes the firms and homes indexes name (the same ranking, world/firms and
// homes), so every asset that is held is in an index, and a tycoon with 30 companies holds 20 of them in this table.
//
// A person is named as the people index names them (personRef: data.sid when there is one). A holder whose id is no name at all
// cannot be a row, so its share goes to OUTSIDE with the rest. Shares are kept to 6 places, in whole millionths, so a sum is exact.
import { readFamilyShares } from '../business/family-share-state'
import { clampN, num, rec } from '../business/util'
import type { EntityRef } from '../kernel/ids'
import type { Asset, GameState, Json, Person } from '../types'
import { HOLDING_ROWS_CAP } from './caps'
import { rankFirms, type FirmPick } from './firms'
import { rankHomes } from './homes'
import { npcFirmId, personRef, playerRef } from './people'
import { commitShard, isPlain, refOfKind, SEEN_MAX, SEEN_MIN, sameJson } from './rows'
import { worldShard } from './state'
import type { HoldingRow, HoldingsShard } from './types'

/** The unnamed remainder of a company's equity: outside shareholders, the market, nobody in particular. */
export const OUTSIDE: EntityRef = 'pool:outside'

const EMPTY: Readonly<HoldingsShard> = Object.freeze({ v: 1, y: 0, rows: Object.freeze([]) as unknown as HoldingRow[] })

/** Whole millionths in 1. */
const UNITS = 1_000_000
/** Below this, what is left of a company is rounding, not an owner. */
const DUST = 1e-9
/** Rows a hostile table is read from: the world is bounded by its node cap, a reader by this. */
const SCAN_MAX = 5_000

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)
const byAssetThenOwner = (a: HoldingRow, b: HoldingRow): number => cmp(a[1], b[1]) || cmp(a[0], b[0])

/** A saved `y`: 0 (never built) or a year from 1900 to 100000, else 0. */
function yearOf(x: unknown): number {
  return typeof x === 'number' && Number.isInteger(x) && x >= SEEN_MIN && x <= SEEN_MAX ? x : 0
}

/** A row of a saved table: [owner, asset, share] with a person or OUTSIDE for owner, a firm or home for asset, a share in (0, 1] kept to 6 places. */
function holdingRow(x: unknown): HoldingRow | null {
  if (!Array.isArray(x) || x.length !== 3) return null
  const owner = x[0] === OUTSIDE ? OUTSIDE : refOfKind(x[0], 'person')
  const asset = refOfKind(x[1], 'firm') ?? refOfKind(x[1], 'home')
  const share = x[2]
  if (owner === null || asset === null || typeof share !== 'number' || !Number.isFinite(share) || share <= 0 || share > 1) return null
  const kept = Math.round(share * UNITS) / UNITS
  return kept > 0 ? [owner, asset, kept] : null
}

/**
 * Makes any value into a valid holdings table: { v: 1, y, rows } with rows that pass holdingRow, one row for each pair of owner and
 * asset (the first stays), sorted by asset then owner, and cut to HOLDING_ROWS_CAP by whole assets (the last by id go first). It does
 * not make an asset sum to 1: that is for the invariants to report. It never throws, and a valid input comes back as itself.
 */
export function normalizeHoldings(raw: unknown): HoldingsShard {
  try {
    const next: HoldingsShard = { v: 1, y: 0, rows: [] }
    if (isPlain(raw) && raw.v === 1) {
      next.y = yearOf(raw.y)
      const src = raw.rows
      if (Array.isArray(src)) {
        const seen = new Set<string>()
        const kept: HoldingRow[] = []
        for (let i = 0; i < src.length && i < SCAN_MAX; i++) {
          const row = holdingRow(src[i])
          if (row === null) continue
          const pair = `${row[1]} ${row[0]}`
          if (seen.has(pair)) continue
          seen.add(pair)
          kept.push(row)
        }
        kept.sort(byAssetThenOwner)
        next.rows = wholeAssets(kept, HOLDING_ROWS_CAP)
      }
    }
    return sameJson(raw, next) ? (raw as HoldingsShard) : next
  } catch {
    return { v: 1, y: 0, rows: [] }
  }
}

/** The first rows of a table sorted by asset, up to `cap`, never part of an asset: the first asset that does not fit ends the table. */
function wholeAssets(rows: HoldingRow[], cap: number): HoldingRow[] {
  if (rows.length <= cap) return rows
  let end = 0
  while (end < rows.length) {
    let next = end
    while (next < rows.length && rows[next]![1] === rows[end]![1]) next++
    if (next > cap) break
    end = next
  }
  return rows.slice(0, end)
}

/** The holdings table of this game as last written. Pure: an absent or garbage shard reads as empty. */
export function readHoldings(g: GameState): Readonly<HoldingsShard> {
  return worldShard<HoldingsShard>(g, 'holdings') ?? EMPTY
}

/** A share that is written in a record: a finite number from 0 up (more than 1 is 1), else the default (the owner holds it all). */
function shareOf(v: Json | undefined): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(v, 1) : 1
}

/** The names a person can hold under: by id, looked up in g.people so that a person with a data.sid is named by it. Null for no name. */
function holderRef(byId: ReadonlyMap<string, Person>, id: string): EntityRef | null {
  return refOfKind(personRef(byId.get(id) ?? { id, data: {} }), 'person')
}

/**
 * One asset's rows from the owners that are named: each share kept to whole millionths, and the part nobody is named for as OUTSIDE.
 * The shares always add up to exactly 1: a rounding left over goes to the largest holder, so no share is ever 0 or less.
 */
function assetRows(asset: EntityRef, named: ReadonlyMap<EntityRef, number>): HoldingRow[] {
  const units = new Map<EntityRef, number>()
  let have = 0
  let exact = 0
  for (const [owner, share] of [...named].sort((a, b) => cmp(a[0], b[0]))) {
    if (!(share > 0) || !Number.isFinite(share)) continue
    exact += share
    const u = Math.round(share * UNITS)
    if (u < 1) continue
    units.set(owner, (units.get(owner) ?? 0) + u)
    have += u
  }
  const rest = UNITS - have
  if (rest >= 1 && 1 - exact > DUST) units.set(OUTSIDE, rest)
  else if (rest !== 0) {
    // Rounding only: the largest holder (the first by owner on a tie) takes it. With no holder at all the whole asset is OUTSIDE.
    let big: EntityRef | null = null
    for (const [owner, u] of units) if (big === null || u > units.get(big)!) big = owner
    if (big === null) units.set(OUTSIDE, UNITS)
    else units.set(big, units.get(big)! + rest)
  }
  return [...units].map(([owner, u]): HoldingRow => [owner, asset, u / UNITS])
}

/** Who holds an old NPC firm: the sum of the player's stakes in it, by the id of the firm. */
function stakesIn(g: GameState): Map<string, number> {
  const parts = new Map<string, number[]>()
  for (const a of g.assets) {
    if (a.kind !== 'investment') continue
    const id: unknown = rec(a.details)?.npcCompanyId
    if (typeof id !== 'string') continue
    const list = parts.get(id) ?? []
    list.push(clampN(num(rec(a.details)?.share), 0, 1))
    parts.set(id, list)
  }
  const out = new Map<string, number>()
  // Added in a fixed order, so the sum does not depend on the order of g.assets.
  for (const [id, list] of parts) out.set(id, list.sort((x, y) => x - y).reduce((s, x) => s + x, 0))
  return out
}

function firmHolders(pick: FirmPick, me: EntityRef, byId: ReadonlyMap<string, Person>, stakes: ReadonlyMap<string, number>): Map<EntityRef, number> {
  const named = new Map<EntityRef, number>()
  const add = (owner: EntityRef, share: number): void => {
    if (share > 0) named.set(owner, (named.get(owner) ?? 0) + share)
  }
  if (pick.form === 'biz') {
    const d = rec((pick.asset as Asset).details)
    const share = shareOf(d?.share)
    add(me, share)
    for (const f of readFamilyShares(d?.familyShares, 1 - share)) {
      const owner = holderRef(byId, f.id)
      if (owner !== null) add(owner, f.share)
    }
  } else {
    const p = pick.person as Person
    const kept = shareOf(rec(rec(p.data.npcCompany)?.details)?.share)
    add(pick.owner, kept)
    const key = npcFirmId(p)
    // The player's stake cannot pass what the founder has not kept.
    add(me, Math.min(key === null ? 0 : (stakes.get(key) ?? 0), 1 - kept))
  }
  return named
}

/**
 * The holdings table as the records say it is right now. Pure; reads the assets and the old NPC firms raw. Only the companies and homes
 * the indexes name get rows; if the table would pass HOLDING_ROWS_CAP, whole assets are dropped from the lowest ranked end (the homes
 * go before the old NPC firms, those before the own companies, each by value). Sorted by asset, then owner.
 */
export function buildHoldings(g: GameState): HoldingRow[] {
  const me = refOfKind(playerRef(g), 'person')
  if (me === null) return []
  const byId = new Map(g.people.map((p) => [p.id, p] as const))
  const stakes = stakesIn(g)
  const groups: HoldingRow[][] = []
  for (const pick of rankFirms(g).chosen) groups.push(assetRows(pick.id, firmHolders(pick, me, byId, stakes)))
  for (const pick of rankHomes(g).chosen) groups.push(assetRows(pick.id, new Map([[me, 1]])))
  const rows: HoldingRow[] = []
  for (const group of groups) {
    if (rows.length + group.length > HOLDING_ROWS_CAP) break
    rows.push(...group)
  }
  return rows.sort(byAssetThenOwner)
}

/**
 * Brings the table up to date: rebuilt whole from the records, stamped with this year. A table that is the same as the stored one is
 * not written again; one that is empty, with none stored, is not written at all (an old save keeps reading as empty).
 */
export function syncHoldings(g: GameState): void {
  const next = normalizeHoldings({ v: 1, y: g.year, rows: buildHoldings(g) })
  commitShard(g, 'holdings', next, { v: 1, y: next.y, rows: [] })
}

/** Who holds this asset and how much, from the stored table. Pure. */
export function holdersOf(g: GameState, asset: EntityRef): { owner: EntityRef; share: number }[] {
  return readHoldings(g).rows.filter((r) => r[1] === asset).map((r) => ({ owner: r[0], share: r[2] }))
}

/** What this owner holds, from the stored table. Pure. */
export function holdingsOf(g: GameState, owner: EntityRef): { asset: EntityRef; share: number }[] {
  return readHoldings(g).rows.filter((r) => r[0] === owner).map((r) => ({ asset: r[1], share: r[2] }))
}
