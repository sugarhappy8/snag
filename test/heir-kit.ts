// R4-L11 (D.9 c, X15, X35, X39): the kit of the hand-over safety tests.
//
//   danglingIds(g)   every id a state holds that names nobody, one line each, sorted: a company's `Manager.personId`, a `FamilyJob.assetId`, a
//                    `familyShares` id, an `npcOwnerId`, a `spouseSid` and a `kidSids` entry. Empty when every one resolves.
//   scanIds(g)       the same scan with a count of the ids it looked at, by kind, so a scene can prove it holds the ids it is about
//   handOver(g, id)  the player dies of old age and the child `id` carries on: killCharacter and continueAsChild, with the queue emptied
//   playYears(g, n)  n years of ageUp, each with its popups answered (the first choice), calling `each` once for the state the hand-over left
//                    (year 0) and again after every year, so a test can check an invariant at every step
//
// What resolves (the words of the plan, D.9 c):
//   - a person id (a manager, a co-owner, an owner): a Person of `g.people`, alive or dead. A dead person still resolves: their stake is let
//     go by Life's yearly step, and until then the id names a real record. A family share may also be the will's charity, and a manager id
//     may name the player: an heir who ran the family firm as its CEO is still the id of its manager until the first year step hires one;
//   - an asset id (a family job): a business of `g.assets`, or a company an NPC holds (`Person.data.npcCompany`: the designated sibling's
//     firm is still a firm, so a relative who kept a job record there points at something, and the first family year closes the job, X35);
//   - a sid (a kin link): a Person with that key (`personKey`) or a Met record of it (a tombstone is nobody). An anchor that died ten years
//     ago or more is let go with its links (KIN_CAPS.deadYears), and a link it keeps is not looked at.
//
// Pure: it reads and returns lines, so a deep-frozen state is fine. No dice and no dollars. It crosses domains (business, kin, people), which
// is why it lives in the tests and no game file calls it.
import { ageUp } from '../src/game/aging'
import { allGroups } from '../src/game/business/conglomerate-state'
import { readJob } from '../src/game/business/nepo-job'
import { normalizeBiz, readBiz, type BizState } from '../src/game/business/state'
import { killCharacter } from '../src/game/death'
import { CHARITY } from '../src/game/events/will-core'
import { personKey } from '../src/game/kernel/person-ref'
import { continueAsChild } from '../src/game/life'
import type { GameState, Json, Person } from '../src/game/types'
import { KIN_CAPS } from '../src/game/world/kin'
import { metRecord } from '../src/game/world/met'
import { drain } from './nepo-kit'

export type IdKind = 'manager' | 'job' | 'familyShares' | 'npcOwnerId' | 'spouseSid' | 'kidSids'

export interface IdScan {
  /** How many ids of each kind the state holds (resolved or not). */
  held: Record<IdKind, number>
  /** The ids that name nobody, as 'where: id', sorted. */
  dangling: string[]
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** The company a Person holds as an NPC (its stored asset record), or null. A plain read of the JSON: no copy of the asset is made. */
function heldFirm(p: Person): { id: string; details: Record<string, Json> } | null {
  const raw: unknown = p.data?.npcCompany
  if (!isObj(raw) || typeof raw.id !== 'string' || !isObj(raw.details)) return null
  return { id: raw.id, details: raw.details as Record<string, Json> }
}

/** Every id the state holds that a reader would follow, and the ones that name nobody. */
export function scanIds(g: GameState): IdScan {
  const dangling: string[] = []
  const held: Record<IdKind, number> = { manager: 0, job: 0, familyShares: 0, npcOwnerId: 0, spouseSid: 0, kidSids: 0 }
  const people = new Set<string>()
  const keys = new Set<string>()
  for (const p of g.people) {
    people.add(p.id)
    keys.add(personKey(p))
  }
  const assets = new Set<string>(g.assets.map((a) => a.id))
  for (const p of g.people) {
    const firm = heldFirm(p)
    if (firm !== null) assets.add(firm.id)
  }

  const person = (kind: IdKind, where: string, id: unknown, alsoOk: readonly string[] = []): void => {
    if (typeof id !== 'string' || id === '') return
    held[kind] += 1
    if (!people.has(id) && !alsoOk.includes(id)) dangling.push(`${where}: ${id}`)
  }
  const holders = (where: string, list: readonly { id: string }[] | undefined): void => {
    for (const h of list ?? []) person('familyShares', `${where} familyShares`, h.id, [CHARITY])
  }
  const firm = (where: string, b: BizState): void => {
    person('manager', `${where} manager`, b.manager?.personId, [g.character.id])
    person('npcOwnerId', `${where} npcOwnerId`, b.npcOwnerId)
    holders(where, b.familyShares)
  }

  for (const a of g.assets) {
    if (a.kind !== 'business') continue
    firm(`asset ${a.id}`, readBiz(g, a))
  }
  for (const p of g.people) {
    const npc = heldFirm(p)
    if (npc !== null) firm(`held ${npc.id}`, normalizeBiz(npc.details, g.year))
  }
  for (const grp of allGroups(g)) {
    person('manager', `group ${grp.core.id} manager`, grp.core.manager?.personId, [g.character.id])
    holders(`group ${grp.core.id}`, grp.core.familyShares)
  }
  for (const p of g.people) {
    const bag: unknown = p.data
    if (!isObj(bag)) continue
    const job = readJob(p)
    if (job !== null) {
      held.job += 1
      if (!assets.has(job.assetId)) dangling.push(`job of ${p.id}: ${job.assetId}`)
    }
    const diedY = bag.diedYear
    if (!p.alive && typeof diedY === 'number' && g.year - diedY >= KIN_CAPS.deadYears) continue
    const sid = (kind: 'spouseSid' | 'kidSids', v: unknown): void => {
      if (typeof v !== 'string') return
      held[kind] += 1
      if (!keys.has(v) && metRecord(g, v) === null) dangling.push(`${kind} of ${p.id}: ${v}`)
    }
    sid('spouseSid', bag.spouseSid)
    if (Array.isArray(bag.kidSids)) for (const k of bag.kidSids) sid('kidSids', k)
  }
  return { held, dangling: dangling.sort() }
}

/** Every id a state holds that names nobody, as 'where: id', sorted. Empty when all of them resolve. */
export function danglingIds(g: GameState): string[] {
  return scanIds(g).dangling
}

/** The player dies and the child `heirId` carries on. */
export function handOver(g: GameState, heirId: string): GameState {
  killCharacter(g, 'Old Age')
  g.queue = []
  return continueAsChild(g, heirId)
}

/**
 * `years` years of ageUp, the popups answered with their first choice. `each(g, year)` runs once before the first year (year 0, the state
 * as the hand-over left it) and again after every year, so a test can check an invariant at each step.
 */
export function playYears(g: GameState, years: number, each?: (g: GameState, year: number) => void): void {
  each?.(g, 0)
  for (let year = 1; year <= years; year++) {
    ageUp(g)
    drain(g)
    each?.(g, year)
  }
}
