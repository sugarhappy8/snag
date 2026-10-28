// The module life.estates (R4-L5, D.5 d, X2, X36, X38, X42, C14): a relative who dies on a stamped life leaves their cash to the family the
// game models, through the ledger, once. The legacy death (relationships.ts handleDeath) turns the NPC's investments, housing and firm
// into cash and passes the player's share; what stays on the record was, until now, stranded for ever. This step settles it, in the aging
// seam, life phase, order 55: after relationships (40), where the death happens, and after sharedProjects (50), so the estate is settled in
// the year of the death; before givingFund (60). 45 stays free and the society phase stays empty (test/kernel-aging.test.ts).
//
//   settleKinEstates(g)   for each dead Person that is not a pet, an ex or a disowned relative (whose cash legacy leaves, relationships.ts)
//                         and has no `estateY`, with cash of at least half the last yearly NpcLife.income (and a dollar) or a holding in the
//                         holdings table (a stake the family reads): the heirs are the living Persons the kin links name (kinHeirIds) and the
//                         living relatives that are Met records only (kinPending), made Persons by materializePerson as 'friend' with
//                         `data.kin` (the word kinLabel gives, none for a friend's kin), at most 7 for a death, 12 a year and 30 kin Persons
//                         alive; a relative the caps leave out is not an heir. The cash is split in whole dollars, the remainder to the first
//                         heir (the Persons that existed before the Persons made now), each part by moveCash under `inheritance` with the
//                         token `estate:<id>:<year>:<heir>`. With no heir the rest goes to the pool under `estate`. `estateY` is stamped and
//                         the fact life.estate is said (Life's 8 a year, the counter shared with the kin step). Below the threshold the record
//                         keeps its dust, as it always has.
//   estatesModule         the ModuleDef: id life.estates, one yearly entry (aging, life, 55), the fact life.estate, group people (X42).
//
// The stake needs no move here. business/dynasty-ownership.ts settleLateFamilyOwners asks familyStakeHeirs for the heirs of a late
// co-owner; for a sibling, a child or a grandchild with a family of their own it used to answer "nobody is modeled" and the stake left the
// family records. It now answers kinHeirIds, the Person ids this step has just made, so the stake lands on the spouse and the kids.
//
// Idempotent: by `estateY` (a dead Person is settled once, in the year it is first seen with the means), and the token of each part is
// booked once a year. Nothing here runs on a life the social stamp does not mark (X6): an unstamped life, every v5.2.0 save and every
// heir of one is left exactly as it is. No g.rng, no stream, no uid: the Persons are made draw-free by the bridge (g.nextId moves by one a
// Person) and the fact and the ledger rows are plain. A kin Person has a life (X38): yearlyNpcLife gives it a full NpcLife, a wage from
// pool:employers and a marriage roll every year. That is deliberate, bounded by the 30 and by the npc-wage ceiling, and docs/KIN.md says so.
//
// This file is layer 4 (assembly), like the rest of modules/; the ModuleDef declares layer 3, the layer of the code it runs.
import { moveCash, personCash } from '../cash'
import { wholePurse } from '../events/purses'
import { emit } from '../kernel/bus'
import { LEDGER_CAPS } from '../kernel/ledger'
import { personEntity, personKey } from '../kernel/person-ref'
import type { ModuleDef } from '../kernel/registry'
import { materializePerson } from '../materialize'
import { npcLife } from '../npc-state'
import type { GameState, Person } from '../types'
import { MET_CAPS } from '../world/caps'
import { readHoldings } from '../world/holdings'
import { KIN_CAPS, kinHeirIds, kinLabel, kinPending, kinView } from '../world/kin'
import { parseSid } from '../world/sid'
import { socialOn } from '../world/social'

/** Facts a year across Life (the counter is shared with the kin step), the Persons this step makes in a year, and its two counters. */
const FACTS_PER_YEAR = 8
const MADE_PER_YEAR = 12
const FACTS_KEY = 'life.facts'
const MADE_KEY = 'kin.persons'
/** The relationship a relative who inherits starts at (a friend of the family; the hand-over blends it later). */
const START_RELATIONSHIP = 40
/** The severity of the fact life.estate (a family matter: more than a baby, less than a death). */
const SEVERITY = 30
/** Relations whose cash legacy leaves with them: an ex passes quietly (relationships.ts handleDeath), and a pet has no estate. */
const NO_ESTATE: ReadonlySet<string> = new Set(['pet', 'ex', 'exSpouse'])
/** The most people the step reads, as the Met scan does. A function, because a module-level const must not read an import. */
const peopleScan = (): number => MET_CAPS.scan

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)

/** A year counter of the state: the number in `g.yearActions[key]`, 0 for anything else. */
function used(g: GameState, key: string): number {
  const bag: unknown = g.yearActions
  if (!isObject(bag)) return 0
  const v = bag[key]
  return isNum(v) ? v : 0
}

/** Whether a Person is a kin Person: alive with a sid of the kin kind (a relative made from a record; a nepo coworker with data.kin is not). */
function isKinPerson(p: Person): boolean {
  return p.alive === true && parseSid(personKey(p))?.kind === 'kin'
}

/** Whether the holdings table names this Person as an owner of a company or a home: the stake the family reads when a co-owner dies. */
function holdsStake(g: GameState, p: Person): boolean {
  const me = personEntity(p)
  if (me === 'pool:other') return false
  const rows: unknown = readHoldings(g).rows
  if (!Array.isArray(rows)) return false
  const n = Math.min(rows.length, peopleScan())
  for (let i = 0; i < n; i++) {
    const row: unknown = rows[i]
    if (Array.isArray(row) && row[0] === me) return true
  }
  return false
}

/** What the step knows while it runs: the kin Persons alive (counted once, lazily) and the Persons made this year. */
interface Count {
  alive: number | null
  made: number
}

/** The living kin Persons of the state, counted on the first need, then kept up to date as the step makes more. */
function aliveKin(g: GameState, count: Count): number {
  if (count.alive !== null) return count.alive
  let n = 0
  const list = g.people
  const scan = Math.min(list.length, peopleScan())
  for (let i = 0; i < scan; i++) {
    const p = list[i]
    if (isObject(p) && isKinPerson(p as unknown as Person)) n++
  }
  count.alive = n
  return n
}

/**
 * The heirs of a dead Person: the living Persons the kin links name, then the living relatives that are only records, each made a Person
 * as a friend with `data.kin`, in view order (the spouse, then the kids by birth), while the caps allow: 7 for a death, 12 a year and 30 kin
 * Persons alive. A relative the caps leave out is not an heir. Returns the Persons in order, the first of them the one who gets the remainder.
 */
function heirsOf(g: GameState, dead: Person, count: Count): Person[] {
  const byId = new Map<string, Person>()
  for (const id of kinHeirIds(g, dead)) {
    const p = g.people.find((x) => x.id === id)
    if (p !== undefined) byId.set(id, p)
  }
  const heirs = [...byId.values()]
  const pending = kinPending(g, dead)
  if (pending.length === 0) return heirs
  const members = new Map(kinView(g, dead).map((m) => [m.key, m]))
  const room = (): boolean => heirs.length < KIN_CAPS.heirs && count.made < MADE_PER_YEAR && aliveKin(g, count) < KIN_CAPS.persons
  for (const key of pending) {
    if (!room()) break
    const m = members.get(key)
    if (m === undefined) continue
    const label = kinLabel(m.role, m.gender, dead)
    const q = materializePerson(g, key, {
      relation: 'friend',
      age: g.year - m.born,
      relationship: START_RELATIONSHIP,
      ...(label === '' ? {} : { data: { kin: label } }),
    })
    if (q === null) continue
    heirs.push(q)
    count.made += 1
    count.alive = aliveKin(g, count) + 1
  }
  return heirs
}

/** Says the fact life.estate, at most 8 a year across Life. The count rises only for a fact the bus took. */
function say(g: GameState, dead: Person, first: Person | undefined, moved: number): void {
  const raw = used(g, FACTS_KEY)
  if (raw >= FACTS_PER_YEAR) return
  try {
    const fact = { k: 'life.estate', y: g.year, c: personEntity(dead), ...(first === undefined ? {} : { a: personKey(first) }), v: moved, s: SEVERITY }
    if (emit(g, fact)) g.yearActions[FACTS_KEY] = raw + 1
  } catch {
    // A fact is news and never the step's result: a handler that fails leaves the estate as it was settled.
  }
}

/**
 * Splits the cash of the dead record in whole dollars among the heirs, the remainder to the first, each part one booking under
 * `inheritance` with its own token. Returns what moved. The sum is cut to the booking cap of the ledger, so an absurd record never
 * moves a dollar the books would refuse; what is over the cap stays on the record.
 */
function payHeirs(g: GameState, dead: Person, heirs: readonly Person[]): number {
  const total = Math.min(Math.round(dead.money), LEDGER_CAPS.maxBooking)
  const part = Math.floor(total / heirs.length)
  const rest = total - part * heirs.length
  let moved = 0
  heirs.forEach((heir, i) => {
    moved += moveCash(g, wholePurse(dead), wholePurse(heir), part + (i === 0 ? rest : 0), 'inheritance', `estate:${dead.id}:${g.year}:${heir.id}`)
  })
  return moved
}

/** Settles one dead Person: the heirs, the stamp, the cash, the fact. Does nothing for a Person that does not qualify. */
function settleOne(g: GameState, dead: Person, count: Count): void {
  const bag = dead.data
  if (isNum(bag.estateY)) return
  if (NO_ESTATE.has(dead.relation) || bag.disowned === true) return
  const cash = isNum(dead.money) ? dead.money : 0
  const income = npcLife(dead)?.income ?? 0
  const rich = Math.round(cash) >= 1 && cash >= 0.5 * income
  const stake = holdsStake(g, dead)
  if (!rich && !stake) return

  const heirs = heirsOf(g, dead, count)
  bag.estateY = g.year
  let moved = 0
  if (rich) {
    if (heirs.length > 0) moved = payHeirs(g, dead, heirs)
    else {
      const take = Math.min(dead.money, LEDGER_CAPS.maxBooking)
      moved = -personCash(g, dead, -take, 'estate', 0)
    }
  }
  if (moved > 0 || heirs.length > 0) say(g, dead, heirs[0], moved)
}

/**
 * The yearly step (the module life.estates). For each dead Person without an `estateY`, in the order of g.people: see the header. Idempotent
 * by `estateY`; a no-op for a life the social stamp does not mark. A Person that cannot be read is skipped, never an error.
 */
export function settleKinEstates(g: GameState): void {
  if (!socialOn(g)) return
  if (!Number.isInteger(g.year) || !Array.isArray(g.people)) return
  if (!isObject(g.yearActions)) return
  const count: Count = { alive: null, made: used(g, MADE_KEY) }
  const start = count.made
  const list = g.people.slice(0, peopleScan())
  for (const p of list) {
    if (!isObject(p) || !isObject(p.data) || p.alive !== false) continue
    try {
      settleOne(g, p as unknown as Person, count)
    } catch {
      // One record that cannot be settled leaves the others alone; it has no estateY, so a later year may try again.
    }
  }
  if (count.made > start) g.yearActions[MADE_KEY] = count.made
}

export const estatesModule: ModuleDef = {
  id: 'life.estates',
  layer: 3,
  facts: ['life.estate'],
  yearly: [{ seam: 'aging', phase: 'life', order: 55, run: settleKinEstates }],
}
