// The invariants of the world (R2-L15): one pure function, worldProblems, that names every way the saved world can be wrong. The fuzz
// harness runs it after every step (test/fuzz-kit.ts checkInvariants); a probe or a scenario test can run it on any state.
//
//   - the books: every problem of the ledger (kernel/ledger.ts checkLedger), each line starting "ledger: "
//   - the root: a v1 plain object, `y` a year
//   - the three indexes (people, firms, homes) and the holdings table, read RAW, as they are stored. A reader that normalizes would
//     merge a duplicate row and drop a bad one before this function could see it, and the point is to see it. Each: a v1 shard, a
//     list of valid rows, one row for an id, at most the shard's cap of rows; the holdings: valid rows, one for each owner and asset,
//     at most 1,200, every asset summing to 1 within 1e-6
//   - the frontier (R3): a v1 shard of known fields whose rows, markets, lead and public research are inside their caps (world/frontier.ts)
//   - the Met shard (R4), read RAW: keys that are sids, fields in range, counts under the caps, keys ascending, a living Person whose
//     strict sid has a record, and no sid on a child, stepchild or grandchild (world/met.ts metProblems)
//   - the edge map (R4), read RAW: edge keys and secret keys in ascending order, every field in range, lists inside their caps, memories of
//     known kinds, a valid feud and debt, the caps in all, and for a person who is not a pet whose edge points at the player an affection
//     `f` equal to Person.relationship (world/edges.ts edgeProblems)
//   - the social stamp (R4), read RAW: { v: 1, on: 1, y, fy } with an optional `ay` and at most 3 mentor pairs (world/social.ts socialProblems)
//   - the people of the game: unique ids, at most one living spouse
//   - the index against the live records, only when the index was just built (see `live`): a row stamped with this year names a
//     record that exists, no more fresh rows than the index may hold, every held asset is in the firms or the homes index
//
// `live` defaults to "the world was stamped this year" (readWorld(g).y === g.year), which is right after syncWorld. The index is
// rebuilt once a year and an action later in the same year can change a record under it (a house sold), so a caller that keeps
// acting after a sync passes { live: false } and gets the structural checks only; one that has just synced and wants the full
// check whatever the stamp says passes { live: true }.
//
// Pure: it reads, it never writes, it works on a frozen state. No luck, no clock. A problem is one line, "<shard>: <what>".
import { ledgerProblems } from '../kernel/ledger'
import type { GameState } from '../types'
import { HOLDING_ROWS_CAP, LOD_CAPS } from './caps'
import { edgeProblems } from './edges'
import { firmRef } from './firms'
import { frontierProblems } from './frontier'
import { OUTSIDE } from './holdings'
import { homeRef } from './homes'
import { metProblems } from './met'
import { npcFirmId, personRef, playerRef } from './people'
import { isPlain, OVER_MAX, refOfKind, SEEN_MAX, SEEN_MIN } from './rows'
import { socialProblems } from './social'
import { readWorld } from './state'

export interface WorldCheckOptions {
  /** Compare the index with the live records: true to force, false to skip, absent for "only when the world was stamped this year". */
  live?: boolean
}

/** What a holdings table may be off from 1 by, per asset. */
const WHOLE = 1e-6
/** Entries of a hostile list this check looks at, so a huge one costs a bounded amount. */
const SCAN_MAX = 5_000

type Row = Record<string, unknown>

interface Index {
  /** The rows that passed the shape checks. */
  rows: Row[]
  /** Whether the shard was a v1 shard with a list of rows at all. */
  ok: boolean
}

const isYear = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x) && x >= SEEN_MIN && x <= SEEN_MAX
/** A figure for a message: at most 6 places, no trailing zeros. */
const fig = (x: number): string => String(Number(x.toFixed(6)))

/** The shape of one index shard (people, firms or homes), as stored. Pushes what is wrong and returns the rows that are sound. */
function indexShard(name: string, raw: unknown, cap: number, rowOk: (r: Row) => boolean, out: string[]): Index {
  if (raw === undefined) return { rows: [], ok: false }
  if (!isPlain(raw) || raw.v !== 1 || !Array.isArray(raw.rows)) {
    out.push(`${name}: not a v1 shard with a rows list`)
    return { rows: [], ok: false }
  }
  const list = raw.rows as unknown[]
  if (list.length > cap) out.push(`${name}: ${list.length} rows, more than the ${cap} allowed`)
  const over = raw.over
  if (typeof over !== 'number' || !Number.isInteger(over) || over < 0 || over > OVER_MAX) out.push(`${name}: over ${String(over)} is not a count`)
  const rows: Row[] = []
  const seen = new Set<string>()
  for (let i = 0; i < list.length && i < SCAN_MAX; i++) {
    const r = list[i]
    if (!isPlain(r) || !rowOk(r) || !isYear(r.seen)) {
      out.push(`${name}: bad row ${i}`)
      continue
    }
    const id = r.id as string
    if (seen.has(id)) out.push(`${name}: duplicate row ${id}`)
    seen.add(id)
    rows.push(r)
  }
  return { rows, ok: true }
}

/** The holdings table as stored: the rows that are sound, and the problems of the table. */
function holdingsShard(raw: unknown, out: string[]): { rows: [string, string, number][]; ok: boolean } {
  if (raw === undefined) return { rows: [], ok: false }
  if (!isPlain(raw) || raw.v !== 1 || !Array.isArray(raw.rows)) {
    out.push('holdings: not a v1 shard with a rows list')
    return { rows: [], ok: false }
  }
  if (raw.y !== 0 && !isYear(raw.y)) out.push(`holdings: y ${String(raw.y)} is not a year`)
  const list = raw.rows as unknown[]
  if (list.length > HOLDING_ROWS_CAP) out.push(`holdings: ${list.length} rows, more than the ${HOLDING_ROWS_CAP} allowed`)
  const rows: [string, string, number][] = []
  const pairs = new Set<string>()
  const totals = new Map<string, number>()
  for (let i = 0; i < list.length && i < SCAN_MAX; i++) {
    const r = list[i]
    const ok =
      Array.isArray(r) &&
      r.length === 3 &&
      (r[0] === OUTSIDE || refOfKind(r[0], 'person') !== null) &&
      (refOfKind(r[1], 'firm') !== null || refOfKind(r[1], 'home') !== null) &&
      typeof r[2] === 'number' &&
      Number.isFinite(r[2]) &&
      r[2] > 0 &&
      r[2] <= 1
    if (!ok) {
      out.push(`holdings: bad row ${i}`)
      continue
    }
    const row = r as [string, string, number]
    const pair = `${row[1]} ${row[0]}`
    if (pairs.has(pair)) out.push(`holdings: duplicate row ${row[0]} in ${row[1]}`)
    pairs.add(pair)
    rows.push(row)
    totals.set(row[1], (totals.get(row[1]) ?? 0) + row[2])
  }
  for (const [asset, total] of [...totals].sort((a, b) => (a[0] < b[0] ? -1 : 1))) if (Math.abs(total - 1) > WHOLE + 1e-9) out.push(`holdings: ${asset} sums to ${fig(total)}, not 1`)
  return { rows, ok: true }
}

/** Every problem of the world of this game, one line each, or none. Pure. */
export function worldProblems(g: GameState, opts?: WorldCheckOptions): string[] {
  const out: string[] = []
  for (const p of ledgerProblems(g)) out.push(`ledger: ${p}`)

  const rawWorld: unknown = g.world
  if (rawWorld !== undefined && (!isPlain(rawWorld) || rawWorld.v !== 1)) out.push('world: not a v1 world root')
  const world = readWorld(g)
  if (world.y !== undefined && !isYear(world.y)) out.push(`world: y ${String(world.y)} is not a year`)

  // The people of the game.
  const ids = new Set<string>()
  for (const p of g.people) {
    if (ids.has(p.id)) out.push(`people: duplicate person id ${p.id}`)
    ids.add(p.id)
  }
  const spouses = g.people.filter((p) => p.relation === 'spouse' && p.alive).length
  if (spouses > 1) out.push(`people: ${spouses} living spouses`)

  // The shards, as stored.
  const people = indexShard('people', world.people, LOD_CAPS.people, (r) => refOfKind(r.id, 'person') !== null, out)
  const firms = indexShard('firms', world.firms, LOD_CAPS.firms, (r) => refOfKind(r.id, 'firm') !== null && refOfKind(r.owner, 'person') !== null && (r.form === 'biz' || r.form === 'npc'), out)
  const homes = indexShard('homes', world.homes, LOD_CAPS.homes, (r) => refOfKind(r.id, 'home') !== null && refOfKind(r.owner, 'person') !== null, out)
  const held = holdingsShard(world.holdings, out)
  for (const p of frontierProblems(world.frontier)) out.push(`frontier: ${p}`)
  for (const p of metProblems(world.met, g.people)) out.push(`met: ${p}`)
  for (const p of edgeProblems(world.edges, g.people, playerRef(g))) out.push(`edges: ${p}`)
  for (const p of socialProblems(world.social)) out.push(`social: ${p}`)

  // The index against the records, when it was just built.
  const live = opts?.live ?? world.y === g.year
  if (!live) return out
  if (people.ok) {
    const here = new Set<string>(g.people.filter((p) => p.relation !== 'pet').map((p) => personRef(p)))
    const fresh = people.rows.filter((r) => r.seen === g.year)
    if (fresh.length > LOD_CAPS.intimate) out.push(`people: ${fresh.length} rows seen this year, more than the ${LOD_CAPS.intimate} indexed`)
    for (const r of fresh) if (!here.has(String(r.id))) out.push(`people: ${String(r.id)} was seen this year but there is no such person`)
  }
  if (firms.ok) {
    const biz = new Set<string>(g.assets.filter((a) => a.kind === 'business').map((a) => firmRef(a.id)))
    const npc = new Set<string>(g.people.flatMap((p) => { const key = npcFirmId(p); return key === null ? [] : [firmRef(key)] }))
    const fresh = firms.rows.filter((r) => r.seen === g.year)
    if (fresh.length > LOD_CAPS.fullFirms) out.push(`firms: ${fresh.length} rows seen this year, more than the ${LOD_CAPS.fullFirms} indexed`)
    for (const r of fresh) if (!(r.form === 'biz' ? biz : npc).has(String(r.id))) out.push(`firms: ${String(r.id)} was seen this year but there is no such company`)
  }
  if (homes.ok) {
    const houses = new Set<string>(g.assets.filter((a) => a.kind === 'house').map((a) => homeRef(a.id)))
    const fresh = homes.rows.filter((r) => r.seen === g.year)
    if (fresh.length > LOD_CAPS.homes) out.push(`homes: ${fresh.length} rows seen this year, more than the ${LOD_CAPS.homes} indexed`)
    for (const r of fresh) if (!houses.has(String(r.id))) out.push(`homes: ${String(r.id)} was seen this year but there is no such home`)
  }
  if (held.ok) {
    const firmIds = new Set<unknown>(firms.rows.map((r) => r.id))
    const homeIds = new Set<unknown>(homes.rows.map((r) => r.id))
    for (const asset of new Set(held.rows.map((r) => r[1]))) {
      if (asset.startsWith('firm:') ? !firmIds.has(asset) : !homeIds.has(asset)) out.push(`holdings: ${asset} is held but is not in the ${asset.startsWith('firm:') ? 'firms' : 'homes'} index`)
    }
  }
  return out
}
