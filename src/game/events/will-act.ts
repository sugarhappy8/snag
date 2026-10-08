// Changing the will and what it sets off: who is written out, who is put back, who finds out
// (and how), and the break in contact when a child cuts the player off. These are the state-changing
// primitives; the popups are in will-scenes.ts and the yearly feud is in will-feud.ts.
//
// Rules the rest of the family system relies on:
//   - A person is "cut" only when a deliberate change removes someone who was in line (the snapshot
//     in WillState.snap is what the last check saw), or when another module (wealth-kids
//     cutFromWill) rewrites the will under the player.
//   - Nothing here pays or takes money; gifts and settlements are in will-amends.ts / will-scenes.ts.
//   - Putting someone back earns a bounded, shrinking amount of trust (never more than the cut
//     cost), so toggling the will can't farm relationship points.
import { addRelationship, clamp, log, pronouns } from '../core'
import { notePerson } from '../people'
import { chance } from '../rng'
import type { GameState, Person } from '../types'
import { landline } from './era'
import { isAbroad, updateTies } from './wealth-core'
import {
  angerAfterShare,
  angerLabel,
  angerOnLearning,
  canBeNamed,
  expectation,
  inLineIds,
  isDiscreet,
  isGossip,
  pruneWill,
  readWill,
  readWl,
  updateWl,
  writeWill,
  yourWho,
  myWho,
  cap,
  type Learn,
  type WillState,
} from './will-core'

// ---------------------------------------------------------------------------
// Snapshots: who was in line the last time anyone looked

/** Record who is in line now if nobody has yet (old saves, the first change). Never reacts. */
export function ensureSnap(g: GameState): void {
  const w = readWill(g)
  if (w.snap !== null) return
  pruneWill(g)
  const w2 = readWill(g)
  w2.snap = inLineIds(g)
  writeWill(g, w2)
}

/** Compare the will with the last snapshot and move the snapshot on. */
function syncSnapshot(g: GameState): { cut: Person[]; added: Person[] } {
  const w = readWill(g)
  const now = inLineIds(g)
  if (w.snap === null) {
    w.snap = now
    writeWill(g, w)
    return { cut: [], added: [] }
  }
  const prev = new Set(w.snap)
  const nowSet = new Set(now)
  const cut = g.people.filter((p) => prev.has(p.id) && !nowSet.has(p.id) && canBeNamed(p))
  const added = g.people.filter((p) => !prev.has(p.id) && nowSet.has(p.id))
  w.snap = now
  writeWill(g, w)
  return { cut, added }
}

function signature(g: GameState): string {
  const w = readWill(g)
  return JSON.stringify([g.character.willBeneficiaries, w.shares, w.charity])
}

// ---------------------------------------------------------------------------
// Words

function nm(p: Person): string {
  return p.firstName
}

/** How the person reacts at a given anger level, as a clause ("was visibly upset"). */
export function reactionClause(p: Person, anger: number): string {
  const x = pronouns(p.gender)
  if (anger < 12) return 'shrugged it off'
  if (anger < 25) return 'was a little hurt and said very little'
  if (anger < 40) return 'was hurt and went quiet for a long time'
  if (anger < 55) return `was visibly upset and asked what ${x.he} did to deserve it`
  if (anger < 70) return 'was angry and called you heartless'
  return `was furious and said things neither of you will forget`
}

function contactWord(g: GameState): string {
  return landline(g) ? 'calls' : 'letters'
}

// ---------------------------------------------------------------------------
// How they find out

/** The chance a change in the will reaches a relative the moment it is made, when the player doesn't decide it. */
export function immediateOdds(g: GameState, p: Person): number {
  if (isAbroad(g, p)) return 0.06
  if (p.livesWithPlayer || p.relation === 'spouse') return 0.5
  return 0.15 + (p.relationship >= 60 ? 0.1 : 0) + (isGossip(p) ? 0.1 : 0) - (isDiscreet(p) ? 0.05 : 0)
}

/**
 * Someone finds out they are out of the will. Fixes their anger from how it reached them, dents the
 * relationship, and returns a line for the log / popup. `by` is the relative who told them.
 */
export function learn(g: GameState, p: Person, how: Learn, by?: Person): string {
  const a = angerOnLearning(g, p, how)
  const before = readWl(g, p)
  const dent = Math.min(25, Math.round(a / 7) + 3 * before.restores)
  updateWl(g, p, (w) => {
    w.known = true
    w.how = how
    w.knownY = g.year
    if (w.cut) w.told = 'out'
    if (how === 'kind') w.explained = 'kind'
    if (how === 'blunt') w.explained = 'blunt'
    w.anger = Math.max(w.anger, a)
  })
  if (dent > 0) addRelationship(p, -dent)
  notePerson(p, 'Found out they were cut out of the player’s will.')
  const react = reactionClause(p, a)
  const who = nm(p)
  switch (how) {
    case 'kind':
      return `You sat ${yourWho(p)} down and explained. ${who} ${react}.`
    case 'blunt':
      return `You told ${yourWho(p)} straight. ${who} ${react}.`
    case 'now':
      return `${who} saw the paperwork on your desk and read all of it. ${who} ${react}.`
    case 'leak':
      return `${who} heard about the will from your lawyer's chatty clerk and ${react}.`
    case 'relative':
      return `${by ? by.firstName : 'A relative'} let it slip to ${who} that ${pronouns(p.gender).he} was out of your will. ${who} ${react}.`
    case 'dinner':
      return `The will came up over dinner and ${who} went very quiet, then ${react}.`
    case 'reading':
      return `${who} learned the terms at the reading of the will and ${react}.`
    case 'letter':
      return `${who} opened your letter and ${react}.`
    default:
      return `${who} found out within the hour and ${react}.`
  }
}

/** A person learns they were added to the will: a little goodwill, once in a while, never farmable. Returns a line or null. */
function learnAdded(g: GameState, p: Person): string | null {
  const w = readWl(g, p)
  const fresh = w.adds === 0 || g.year - w.addY >= 5
  updateWl(g, p, (x) => {
    x.known = true
    x.told = 'in'
    x.adds += 1
    x.addY = g.year
  })
  if (fresh) addRelationship(p, 3)
  notePerson(p, 'Was named in the player’s will.')
  return fresh ? `${yourWho(p)} found out ${pronouns(p.gender).he}'s in your will. ${nm(p)} was touched.` : null
}

// ---------------------------------------------------------------------------
// Cuts and restorations

/** Record that someone was written out. Returns whether to ask the player how to tell them, and any line. */
function registerCut(g: GameState, p: Person, external: boolean): { tell: boolean; line: string | null } {
  if (p.data.disowned === true) return { tell: false, line: null }
  updateWl(g, p, (w) => {
    if (w.restores > w.flips) w.flips += 1
    w.cut = true
    w.cutY = g.year
    w.was = true
    w.known = false
    w.cold = false
    w.explained = ''
    w.stage = Math.min(w.stage, w.estr ? 4 : 0)
  })
  if (p.age < 13) return { tell: false, line: null }
  if (external) return { tell: false, line: learn(g, p, 'external') }
  if (expectation(g, p) >= 30) return { tell: true, line: null }
  if (chance(g, immediateOdds(g, p))) return { tell: false, line: learn(g, p, 'now') }
  return { tell: false, line: null }
}

/** Put a person back in the will: their anger shrinks with the share they get, and trust returns by a bounded, shrinking amount. */
function restore(g: GameState, p: Person): string | null {
  const w = readWl(g, p)
  const ws = readWill(g)
  const pct = clamp(ws.shares[p.id] ?? 100, 10, 100)
  // Trust returns by less than the cut cost: at most 7 points, half as many each time, and none from someone who never minded.
  const gainBase = 7 * Math.pow(0.5, w.restores) * clamp(w.anger / 60, 0, 1) * (pct / 100)
  const gain = w.known ? Math.round(gainBase) : 0
  updateWl(g, p, (x) => {
    x.cut = false
    x.restores += 1
    x.restoreY = g.year
    if (x.known) {
      x.anger = angerAfterShare(x.anger, pct)
      x.hard = Math.max(0, x.hard - (pct >= 100 ? 2 : 1))
      x.told = 'in'
      if (pct >= 100) x.cold = false
    }
  })
  if (gain > 0) addRelationship(p, gain)
  if (!w.known) return null
  notePerson(p, 'Was put back in the player’s will.')
  const left = readWl(g, p).anger
  return `${nm(p)} learned ${pronouns(p.gender).he}'s back in your will. ${left >= 35 ? `${pronouns(p.gender).He} is still ${angerLabel(left).toLowerCase()}, but it helps.` : `${pronouns(p.gender).He} is ${angerLabel(left).toLowerCase()} now.`}`
}

export interface ChangeReport {
  cut: Person[]
  restored: Person[]
  added: Person[]
  /** People to ask how to break the news to (see queueTells in will-scenes.ts). */
  tell: Person[]
  lines: string[]
}

function emptyReport(): ChangeReport {
  return { cut: [], restored: [], added: [], tell: [], lines: [] }
}

/** Let the family react to however the will differs from the last check. */
export function afterWillChange(g: GameState, external = false): ChangeReport {
  const { cut, added } = syncSnapshot(g)
  const report = emptyReport()
  for (const p of cut) {
    if (!p.alive) continue
    const r = registerCut(g, p, external)
    report.cut.push(p)
    if (r.tell) report.tell.push(p)
    if (r.line) report.lines.push(r.line)
  }
  for (const p of added) {
    if (!p.alive) continue
    const w = readWl(g, p)
    if (w.cut) {
      report.restored.push(p)
      const line = restore(g, p)
      if (line) report.lines.push(line)
    } else if (p.age >= 13) {
      report.added.push(p)
      if (chance(g, immediateOdds(g, p))) {
        const line = learnAdded(g, p)
        if (line) report.lines.push(line)
      }
    }
  }
  return report
}

/**
 * Change the will. `mutate` edits the beneficiaries (g.character.willBeneficiaries) and/or the
 * shares; this records what changed and lets the family react. The caller shows its notice first and
 * then queueTells(g, report) so the "how do you tell them" popups come after it.
 */
export function changeWill(g: GameState, mutate: (g: GameState, w: WillState) => void): ChangeReport {
  ensureSnap(g)
  pruneWill(g)
  const sig = signature(g)
  const w = readWill(g)
  mutate(g, w)
  writeWill(g, w)
  pruneWill(g)
  if (signature(g) === sig) return emptyReport()
  const w2 = readWill(g)
  w2.written = true
  w2.changed = g.year
  w2.changes += 1
  writeWill(g, w2)
  return afterWillChange(g)
}

// ---------------------------------------------------------------------------
// Editing helpers (call inside changeWill's mutate)

/** Name a person in the will at a share (percent of an equal share). An empty will starts from the people who inherit by default. */
export function addHeir(g: GameState, w: WillState, p: Person, pct = 100): void {
  if (g.character.willBeneficiaries.length === 0) {
    g.character.willBeneficiaries = g.people.filter((x) => x.alive && (x.relation === 'child' || x.relation === 'stepchild')).map((x) => x.id)
  }
  if (!g.character.willBeneficiaries.includes(p.id)) g.character.willBeneficiaries = [...g.character.willBeneficiaries, p.id]
  w.shares[p.id] = clamp(Math.round(pct), 10, 100)
}

/** Take a person out of the will (an empty result means "divide evenly among the children"). */
export function removeHeir(g: GameState, w: WillState, p: Person): void {
  if (g.character.willBeneficiaries.length === 0) {
    g.character.willBeneficiaries = g.people.filter((x) => x.alive && (x.relation === 'child' || x.relation === 'stepchild')).map((x) => x.id)
  }
  g.character.willBeneficiaries = g.character.willBeneficiaries.filter((id) => id !== p.id)
  delete w.shares[p.id]
}

// ---------------------------------------------------------------------------
// Estrangement

/** A child (or sibling, or parent) cuts contact: no visits, no help, no allowance, no access to the grandchildren. */
export function estrange(g: GameState, p: Person): string {
  const x = pronouns(p.gender)
  updateWl(g, p, (w) => {
    w.estr = true
    w.estrY = g.year
    w.stage = 4
    w.cold = true
  })
  p.livesWithPlayer = false
  p.relationship = Math.min(p.relationship, 12)
  updateTies(g, p, (t) => {
    t.allowance = 0
    t.bound = Math.max(t.bound, g.year + 8)
  })
  // The keys come back: nothing of yours stays in their hands.
  for (const a of g.assets) {
    const fam = a.details.fam
    if (Array.isArray(fam) && fam.includes(p.id)) a.details.fam = fam.filter((id) => id !== p.id)
  }
  // Their children go with them.
  for (const gc of g.people) {
    if (!gc.alive || gc.relation !== 'grandchild') continue
    if (gc.data.parentId !== p.id && gc.data.childOf !== p.id && gc.otherParentId !== p.id) continue
    gc.livesWithPlayer = false
    gc.relationship = Math.max(0, gc.relationship - 15)
  }
  notePerson(p, 'Cut off contact with the player over the will.')
  log(g, `${cap(myWho(p))} cut off all contact with me.`, 'bad')
  return `${p.firstName} has stopped answering your ${contactWord(g)}, and ${x.he} isn't coming to visit. ${p.firstName} says ${x.he} needs space, and it doesn't sound temporary. The grandchildren won't be at your door either.`
}

/** Contact resumes after an olive branch or a heart-to-heart. */
export function reconcile(g: GameState, p: Person): void {
  updateWl(g, p, (w) => {
    w.estr = false
    w.stage = 1
    w.cold = false
    w.anger = Math.min(w.anger, 18)
    w.hard = 0
  })
  p.relationship = Math.max(p.relationship, 35)
  updateTies(g, p, (t) => {
    t.bound = Math.min(t.bound, g.year)
  })
  notePerson(p, 'Started talking to the player again after the will.')
  log(g, `${cap(myWho(p))} and I started talking again.`, 'good')
}
