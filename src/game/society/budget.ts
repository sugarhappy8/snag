// The family-act budget (R4-E9, X40, X41, C13): one counter for the choices the family puts to a stamped life. Before R4 a rich life
// could be asked 3 (wealth) + 1 (the luxury choice) + 2 (nepo) + 1 (the will) = 7 family choices in a year, each source counting for
// itself. On a life the social stamp marks they now share three a year, in `g.yearActions['fam.act']`, which aging.ts resets with the
// other year actions (and the hand-over in life.ts with the new life's).
//
//   useFamilyAct(g, source)   spends one of the year's 3 for a choice that is about to be queued; false when none is left, and then
//                             the caller drops the choice (it is not deferred: the year close keeps these scripts and counts them
//                             first, `DEFERRABLE_SCRIPTS` has no kin id). True, and nothing written, on a life that is not stamped
//                             (every v5.2.0 save and every heir of one keeps today's 3 + 1 + 2 + 1).
//   familyRoom(g, source)     how many more choices this source may queue now; Infinity on a life that is not stamped. Pure. It is
//                             for the sources that must look before they spend (wealth's budget, the nepo popups), which cannot let
//                             a local cap go before the shared one has said yes.
//   familyLive(g)             pure: does the family have a stake that needs a slot of its own (see below)
//
// The unit is a choice. A notice is not counted (notices keep the year close's own budget), so the nepo outcome notice spends no slot.
// The old per-source caps stay inside the 3 as min(old, room).
//
// The reserve. When familyLive(g) one of the 3 is held back from the two sources that run before `nepo` in the money phase, `wealth`
// (money 70) and `use` (the luxury choice, money 80): between them they may spend at most 3 - reserve, counted in
// `g.yearActions['fam.early']`. So `nepo` (90), `will` (100) and `social` (the close) can still take the third. Without that rule
// `use` would take it first and the reserve would protect nothing. A life with nothing live has no reserve and the wealth popups it
// always had. The reserve is read at the time of each early spend, never saved.
//
// familyLive is true when any of these holds:
//   - someone is cut out of the will: a living person whose `data.wl` record, the ego's, says `cut` (edge-legacy.ts legacyWl), or a
//     living person whose edge to the player carries a `cut_from_will` memory that no later `restored_to_will` has answered
//   - a feud or a debt is open on an edge: liveFeuds(g) > 0 or openDebts(g) > 0 (world/edges.ts, both counted once per map)
//   - a family firm has employed relatives: a living person whose raw job key `data.nepo` is a plain object with a non-empty text
//     `assetId` (the raw test of readJob, business/nepo-job.ts; copied, not imported) names a firm that the firms index lists and
//     the player holds a share of in the holdings table
// It reads the world (edges, edge-legacy, holdings, firms), `core` and the kernel and nothing from events/ or business/; X26 lets the
// society domain reach `life` and no other domain. Pure under deepFreeze, no draw, and total on a hostile world (each reader is).
//
// Layer 3 (a new domain, society). Callers reach it through society/contract.ts.
import { yearActionsUsed } from '../core'
import { personEntity } from '../kernel/person-ref'
import type { GameState, Person } from '../types'
import { legacyWl } from '../world/edge-legacy'
import { parseMemory } from '../world/edge-memory'
import { edgesOf, liveFeuds, openDebts } from '../world/edges'
import { firmRef, readFirms } from '../world/firms'
import { readHoldings } from '../world/holdings'
import { playerRef } from '../world/people'
import { socialOn } from '../world/social'

/** The choices a stamped life may be put to in a year. */
export const FAMILY_ACTS = 3

/** Who spends: the money phase's wealth asks (70), the luxury family choice (80), nepo (90), the will (100) and the close's social acts. */
export type FamilySource = 'wealth' | 'nepo' | 'will' | 'use' | 'social'

/** `g.yearActions` keys: the year's spend and the part of it the two early sources took. */
export const ACT_KEY = 'fam.act'
export const EARLY_KEY = 'fam.early'

/** The sources that run before `nepo`: the reserve binds them together. */
const EARLY: ReadonlySet<string> = new Set(['wealth', 'use'])

/** The memory kinds that put a person out of the will, and the one that takes them back (world/edge-memory.ts). */
const CUT = 'cut_from_will'
const RESTORED = 'restored_to_will'

// ---------------------------------------------------------------------------------------------------------------------------------
// familyLive
// ---------------------------------------------------------------------------------------------------------------------------------

/** The firm a person's raw job names, or null: `data.nepo` a plain object with a non-empty text `assetId` (the raw test of readJob). Never throws. */
function jobAsset(p: Pick<Person, 'data'>): string | null {
  try {
    const raw: unknown = p.data?.nepo
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null
    const id = (raw as { assetId?: unknown }).assetId
    return typeof id === 'string' && id !== '' ? id : null
  } catch {
    return null
  }
}

/** Is a living person cut out by the ego's will record? */
function cutByRecord(g: GameState): boolean {
  const ego = g.character.id
  for (const p of g.people) if (p.alive && p.relation !== 'pet' && legacyWl(p, ego).cut) return true
  return false
}

/** Is a living person's edge to the player marked cut out, with no restoring memory of the same year or later? */
function cutByMemory(g: GameState): boolean {
  const me = playerRef(g)
  const suffix = `>${me}`
  const alive = new Set<string>()
  for (const p of g.people) if (p.alive && p.relation !== 'pet') alive.add(personEntity(p))
  for (const [key, e] of edgesOf(g, me)) {
    if (e.m === undefined || !key.endsWith(suffix) || !alive.has(key.slice(0, key.length - suffix.length))) continue
    let cut = 0
    let restored = 0
    for (const text of e.m) {
      // cheap first: only the two kinds are parsed
      if (!text.startsWith(CUT) && !text.startsWith(RESTORED)) continue
      const m = parseMemory(text)
      if (m === null) continue
      if (m.kind === CUT) cut = Math.max(cut, m.year)
      else if (m.kind === RESTORED) restored = Math.max(restored, m.year)
    }
    if (cut > 0 && restored < cut) return true
  }
  return false
}

/** Does a firm that the player holds a share of employ a living relative? Reads the firms index, the holdings table and the raw job keys. */
function familyFirm(g: GameState): boolean {
  const jobs = new Set<string>()
  for (const p of g.people) {
    if (!p.alive || p.relation === 'pet') continue
    const id = jobAsset(p)
    if (id !== null) jobs.add(firmRef(id))
  }
  if (jobs.size === 0) return false
  const listed = new Set<string>()
  for (const row of readFirms(g).rows) listed.add(row.id)
  const me = playerRef(g)
  for (const [owner, asset, share] of readHoldings(g).rows) if (owner === me && share > 0 && listed.has(asset) && jobs.has(asset)) return true
  return false
}

/**
 * Does the family have a stake that needs a slot of its own: someone cut out of the will, an open feud or debt, or a family firm with
 * employed relatives. Pure and total. It does not look at the stamp (the callers do): a game that is not stamped has no edges, but its
 * will records and jobs read all the same.
 */
export function familyLive(g: GameState): boolean {
  return liveFeuds(g) > 0 || openDebts(g) > 0 || cutByRecord(g) || familyFirm(g) || cutByMemory(g)
}

// ---------------------------------------------------------------------------------------------------------------------------------
// The counter
// ---------------------------------------------------------------------------------------------------------------------------------

/**
 * How many more choices `source` may queue this year: 3 minus what the year spent, and for the two early sources also 3 minus the
 * reserve minus what the two spent between them. 0 or more. Infinity on a life that is not stamped, where no shared budget applies.
 * Pure: it reads `g.yearActions` and the world, and writes nothing.
 */
export function familyRoom(g: GameState, source: FamilySource): number {
  if (!socialOn(g)) return Number.POSITIVE_INFINITY
  const left = FAMILY_ACTS - yearActionsUsed(g, ACT_KEY)
  if (!EARLY.has(source)) return Math.max(0, left)
  const early = FAMILY_ACTS - (familyLive(g) ? 1 : 0) - yearActionsUsed(g, EARLY_KEY)
  return Math.max(0, Math.min(left, early))
}

/**
 * Spends one of the year's 3 family choices for `source`, or says there is none (false: drop the choice, do not queue it). On a life
 * that is not stamped it is true and writes nothing. Call it only where a choice is about to be queued, once for each choice.
 */
export function useFamilyAct(g: GameState, source: FamilySource): boolean {
  if (!socialOn(g)) return true
  if (familyRoom(g, source) < 1) return false
  g.yearActions[ACT_KEY] = yearActionsUsed(g, ACT_KEY) + 1
  if (EARLY.has(source)) g.yearActions[EARLY_KEY] = yearActionsUsed(g, EARLY_KEY) + 1
  return true
}
