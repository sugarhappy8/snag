// R4-E8 (X22, X27, X28): the memory writers. Twenty-four of the 40 memory kinds are made by the game from now on, one `remember` line at
// each of the sites below (the events of money, the will, love, the family business and the rumor), and every line is a no-op on a life
// that is not stamped (X6). SITES is the list the plan asks for: the site, the kind, the weight and the side it writes, in this order.
//
//   by 'ego' is the second end of the edge doing it (the player, on every `person > player` edge), 'them' the first end.
//   took_my_side is the one site on an edge between two people: the angry one remembers who took their side, so the edge is
//   angry > relative and the relative (the second end) is 'ego'. Written on relative > player it would read as goodwill toward the player.
//
// For every site the file proves: on a stamped game the kind is on the edge once, with the listed weight, side and year; on a game that is
// not stamped nothing is written and the game is the stamped game to the last field, apart from the world (the dice, the ids, the money, the
// queue and the log are the same, so the parity files stay as they are); and a second memory of the kind in the same year is refused and
// moves nothing. The sites that wait on a die find a seed by search (findSeed), never by a pinned number.
import { describe, expect, it } from 'vitest'
import { demote, fire, hireRelative, promote } from '../src/game/business/nepo-actions'
import { readJob } from '../src/game/business/nepo-job'
import { familyYear } from '../src/game/business/nepo-year'
import { entitlement, readTies, recordAsk, updateTies, wealthTier } from '../src/game/events/wealth-core'
import { yearlyWealth } from '../src/game/events/wealth'
import { askDef } from '../src/game/events/wealth-catalog'
import { setAllowance } from '../src/game/events/wealth-kids'
import { ASK_SCRIPT, presentAsk } from '../src/game/events/wealth-resolve'
import { addHeir, changeWill, estrange, learn, reconcile, removeHeir } from '../src/game/events/will-act'
import { yearlyWillFeuds } from '../src/game/events/will-feud'
import { willPersonNodes } from '../src/game/events/will-amends'
import { S_TELL, queueTells } from '../src/game/events/will-scenes'
import { angerOnLearning, readWl, updateWl, type Learn } from '../src/game/events/will-core'
import type { EntityRef } from '../src/game/kernel/ids'
import { personEntity } from '../src/game/kernel/person-ref'
import { breakUp, divorce, hookUpWith, partnerProposes, proposeTo } from '../src/game/love'
import { createPerson } from '../src/game/people'
import { personActions } from '../src/game/relationships'
import { runScript } from '../src/game/scripts'
import type { ChoiceModal, GameState, MenuAction, MenuNode, Person } from '../src/game/types'
import { MEMORY_KINDS, type Memory, type MemoryKind } from '../src/game/world/edge-memory'
import { stepEdges } from '../src/game/world/edge-step'
import { remember } from '../src/game/world/edge-write'
import { edgesOf, memoriesOf, readEdge } from '../src/game/world/edges'
import { playerRef } from '../src/game/world/people'
import { socialOn, stampSocial } from '../src/game/world/social'
import { makeTestGame } from './helpers'
import { drain, kid as nepoKid, world as nepoWorld } from './nepo-kit'
import { findSeed } from './seed-kit'
import { socialGame } from './social-kit'

// ---------------------------------------------------------------------------------------------------------------------
// The scenes

/** What a site did: the game, the person who remembers, the other end of the edge when it is not the player, and whether the branch ran. */
interface Played {
  g: GameState
  p: Person
  /** The second end of the edge, when it is not the player. */
  to?: EntityRef
  /** True when the branch under test ran (a site that waits on a die is searched until it does). */
  ok: boolean
  /** The year the memory was made, when it is not the year the scene ends in. */
  year?: number
  /** A number the weight depends on (the anger, the share, a job flag). */
  n?: number
}

interface Site {
  site: string
  kind: MemoryKind
  w: number | ((r: Played) => number)
  by: 'ego' | 'them'
  /** True when the site waits on a die: a seed is searched where `ok` holds on the game that is not stamped. */
  dice?: boolean
  play: (stamped: boolean, seed: number) => Played
}

const mk = (stamped: boolean, seed: number, character: Parameters<typeof makeTestGame>[1] = {}): GameState => (stamped ? socialGame(seed, character) : makeTestGame(seed, character))

// the money sites -------------------------------------------------------------------------------------------------------

const RICH = { age: 45, money: 20_000_000, countryId: 'us', residence: { status: 'renting', rent: 0 } } as const

function rich(stamped: boolean, seed: number, over: Parameters<typeof makeTestGame>[1] = {}): GameState {
  const g = mk(stamped, seed, { ...RICH, ...over })
  g.year = 2026
  g.log = [{ age: g.character.age, year: g.year, entries: [] }]
  return g
}

const aKid = (g: GameState, age = 17, over: Partial<Parameters<typeof createPerson>[1]> = {}): Person =>
  createPerson(g, { relation: 'child', age, relationship: 70, lastName: g.character.lastName, livesWithPlayer: age < 18, ...over })

/** Puts the ask to the player and answers it. A loan is only offered for some asks (a grown child's rent), the others take a gift or a no. */
function answerAsk(g: GameState, p: Person, choice: string, ask = 'kid.car'): void {
  const a = askDef(ask)!.build(g, wealthTier(g), p)!
  presentAsk(g, a)
  const m = g.queue.pop() as ChoiceModal
  runScript(g, ASK_SCRIPT, choice, m.data, m)
}

/** One wealth year: everyone a year older, the hook run. */
function wealthYear(g: GameState): void {
  g.year += 1
  g.character.age += 1
  for (const p of g.people) if (p.alive) p.age += 1
  g.yearActions = {}
  yearlyWealth(g)
}

// the will sites --------------------------------------------------------------------------------------------------------

/** A rich 62-year-old with a spouse and three grown children who know them well (the family of test/will-feud.test.ts). */
function fam(stamped: boolean, seed: number): { g: GameState; spouse: Person; a: Person; b: Person; c: Person } {
  const g = mk(stamped, seed, { age: 62, money: 5_000_000, countryId: 'us', residence: { status: 'renting', rent: 0 } })
  g.year = 2026
  g.log = [{ age: g.character.age, year: g.year, entries: [] }]
  const one = (relation: Person['relation'], age: number, relationship: number, traits: string[]): Person => {
    const p = createPerson(g, { relation, age, relationship, traits, money: 30_000, countryId: 'us' })
    p.yearsKnown = Math.min(age, 30)
    return p
  }
  return { g, spouse: one('spouse', 60, 80, ['calm', 'loyal']), a: one('child', 34, 75, ['kind', 'calm']), b: one('child', 31, 70, ['hot-headed', 'jealous']), c: one('child', 28, 60, ['funny', 'outgoing']) }
}

/** Writes the child out of the will and lets them know how angry they are (the helper of test/will-feud.test.ts). */
function setKnown(g: GameState, p: Person, anger: number): void {
  changeWill(g, (gg, w) => removeHeir(gg, w, p))
  g.queue = []
  updateWl(g, p, (w) => {
    w.known = true
    w.how = 'leak'
    w.knownY = g.year
    w.told = 'out'
    w.anger = anger
  })
}

const action = (nodes: MenuNode[], id: string): MenuAction => {
  const a = nodes.find((n): n is MenuAction => n.type === 'action' && n.id === id)
  if (!a) throw new Error(`no action ${id}`)
  return a
}

function cutAndLearn(stamped: boolean, seed: number, who: 'a' | 'b' | 'c', how: Learn): Played {
  const f = fam(stamped, seed)
  const p = f[who]
  changeWill(f.g, (gg, w) => removeHeir(gg, w, p))
  f.g.queue = []
  const n = angerOnLearning(f.g, p, how)
  learn(f.g, p, how)
  return { g: f.g, p, ok: true, n }
}

const cutWeight = (r: Played): number => ((r.n ?? 0) >= 55 ? 3 : (r.n ?? 0) >= 30 ? 2 : 1)

function restoreAt(stamped: boolean, seed: number, share: number): Played {
  const { g, b } = fam(stamped, seed)
  setKnown(g, b, 70)
  changeWill(g, (gg, w) => addHeir(gg, w, b, share))
  g.queue = []
  return { g, p: b, ok: readWl(g, b).cut === false, n: share }
}

function tellAs(stamped: boolean, seed: number, choice: 'kind' | 'blunt'): Played {
  const { g, b } = fam(stamped, seed)
  const report = changeWill(g, (gg, w) => removeHeir(gg, w, b))
  queueTells(g, report)
  const i = g.queue.findIndex((m) => m.kind === 'choice' && m.scriptId === S_TELL)
  if (i < 0) return { g, p: b, ok: false }
  const m = g.queue.splice(i, 1)[0] as ChoiceModal
  runScript(g, S_TELL, choice, m.data, m)
  g.queue = []
  return { g, p: b, ok: true }
}

function sidesTaken(stamped: boolean, seed: number): Played {
  const f = fam(stamped, seed)
  createPerson(f.g, { relation: 'grandchild', age: 9, relationship: 70, data: { parentId: f.b.id } })
  f.b.traits = ['hot-headed']
  setKnown(f.g, f.b, 70)
  changeWill(f.g, (gg, w) => addHeir(gg, w, f.spouse, 100))
  f.g.queue = []
  setKnown(f.g, f.spouse, 70)
  for (let y = 0; y < 6; y++) {
    const seen = f.g.log.flatMap((l) => l.entries).length
    f.g.character.age += 1
    f.g.year += 1
    f.g.yearActions = {}
    for (const p of f.g.people) if (p.alive) p.age += 1
    yearlyWillFeuds(f.g)
    f.g.queue = []
    if (f.g.log.flatMap((l) => l.entries).slice(seen).some((e) => /side about my will/.test(e.text))) {
      const other = edgesOf(f.g, personEntity(f.b)).find(([key, e]) => key.startsWith(`${personEntity(f.b)}>`) && memoriesOf(e).some((m) => m.kind === 'took_my_side'))
      return { g: f.g, p: f.b, to: other === undefined ? undefined : (other[0].slice(personEntity(f.b).length + 1) as EntityRef), ok: true, year: f.g.year }
    }
  }
  return { g: f.g, p: f.b, ok: false }
}

// love ------------------------------------------------------------------------------------------------------------------

function partnerGame(stamped: boolean, seed: number, relation: Person['relation'], relationship: number): { g: GameState; p: Person } {
  const g = mk(stamped, seed, { age: 30, money: 200_000, countryId: 'us' })
  g.year = 2026
  g.log = [{ age: 30, year: g.year, entries: [] }]
  const p = createPerson(g, { relation, age: 29, relationship, traits: ['kind', 'calm'], money: 1_000, countryId: 'us' })
  if (relation === 'partner') p.data.datingSince = 26
  return { g, p }
}

function answerQueue(g: GameState, id: string, choice: string): void {
  const i = g.queue.findIndex((m) => m.kind === 'choice' && m.scriptId === id)
  if (i < 0) throw new Error(`no pending ${id}`)
  const m = g.queue.splice(i, 1)[0] as ChoiceModal
  runScript(g, id, choice, m.data, m)
}

// the family business ---------------------------------------------------------------------------------------------------

function hired(stamped: boolean, seed: number, age: number, rank: number, relation: 'child' | 'sibling' = 'child') {
  const w = nepoWorld(seed)
  if (stamped) stampSocial(w.g)
  const p = nepoKid(w.g, age, { relation })
  const r = hireRelative(w.g, w.a, w.b, p, { rank }, { quiet: true })
  return { ...w, p, hired: r.ok }
}

// ---------------------------------------------------------------------------------------------------------------------
// The list

const SITES: readonly Site[] = [
  // events/wealth-resolve.ts
  { site: 'wealth-resolve lend', kind: 'loan_given', w: 2, by: 'ego', play: (s, seed) => { const g = rich(s, seed); const p = aKid(g, 30); answerAsk(g, p, 'lend', 'kid.rent'); return { g, p, ok: readTies(g, p).owes > 0 } } },
  { site: 'wealth-resolve refuse (no)', kind: 'gift_refused', w: 1, by: 'ego', play: (s, seed) => { const g = rich(s, seed); const p = aKid(g); answerAsk(g, p, 'no'); return { g, p, ok: true } } },
  { site: 'wealth-resolve refuse (boundary)', kind: 'gift_refused', w: 2, by: 'ego', play: (s, seed) => { const g = rich(s, seed); const p = aKid(g); answerAsk(g, p, 'bound'); return { g, p, ok: true } } },
  { site: 'wealth-resolve refuse (boundary)', kind: 'asked_too_often', w: 2, by: 'them', play: (s, seed) => { const g = rich(s, seed); const p = aKid(g); answerAsk(g, p, 'bound'); return { g, p, ok: true } } },
  {
    site: 'wealth-resolve refuse (the third ask in four years)',
    kind: 'asked_too_often',
    w: 2,
    by: 'them',
    play: (s, seed) => {
      const g = rich(s, seed)
      const p = aKid(g)
      recordAsk(g, p, 'a car', 'no', 10)
      recordAsk(g, p, 'a phone', 'no', 10)
      answerAsk(g, p, 'no')
      return { g, p, ok: true }
    },
  },
  // events/wealth.ts
  {
    site: 'wealth payAllowances (missed)',
    kind: 'allowance_cut',
    w: 1,
    by: 'ego',
    play: (s, seed) => {
      const g = rich(s, seed, { money: 100 })
      const p = aKid(g, 10)
      setAllowance(g, p, 500)
      g.queue = []
      wealthYear(g)
      g.queue = []
      return { g, p, ok: readTies(g, p).missed === 1 }
    },
  },
  {
    site: 'wealth collectLoans (paid back)',
    kind: 'loan_repaid',
    w: (r) => ((r.n ?? 1) > 0 ? 1 : 2),
    by: 'them',
    dice: true,
    play: (s, seed) => {
      const g = rich(s, seed, { money: 10_000_000 })
      const p = aKid(g, 30, { traits: ['honest', 'loyal'], money: 1_000_000 })
      updateTies(g, p, (t) => {
        t.owes = 20_000
        t.owesSince = g.year
      })
      g.queue = []
      wealthYear(g)
      g.queue = []
      return { g, p, ok: readTies(g, p).owes < 20_000, n: readTies(g, p).owes }
    },
  },
  {
    site: 'wealth collectLoans (avoiding you)',
    kind: 'loan_unpaid',
    w: 1,
    by: 'them',
    dice: true,
    play: (s, seed) => {
      const g = rich(s, seed, { money: 10_000_000 })
      const p = aKid(g, 30, { money: 0 })
      updateTies(g, p, (t) => {
        t.owes = 20_000
        t.owesSince = g.year
      })
      g.queue = []
      wealthYear(g)
      g.queue = []
      return { g, p, ok: readTies(g, p).marks.avoid === g.year }
    },
  },
  // events/will-act.ts
  { site: 'will-act learn (kind)', kind: 'cut_from_will', w: cutWeight, by: 'ego', play: (s, seed) => cutAndLearn(s, seed, 'b', 'kind') },
  { site: 'will-act learn (dinner)', kind: 'cut_from_will', w: cutWeight, by: 'ego', play: (s, seed) => cutAndLearn(s, seed, 'b', 'dinner') },
  { site: 'will-act learn (letter, a kind child)', kind: 'cut_from_will', w: cutWeight, by: 'ego', play: (s, seed) => cutAndLearn(s, seed, 'a', 'letter') },
  { site: 'will-act estrange', kind: 'estranged', w: 3, by: 'them', play: (s, seed) => { const { g, b } = fam(s, seed); estrange(g, b); return { g, p: b, ok: true } } },
  { site: 'will-act reconcile', kind: 'reconciled', w: 2, by: 'ego', play: (s, seed) => { const { g, b } = fam(s, seed); estrange(g, b); g.year += 1; reconcile(g, b); return { g, p: b, ok: true } } },
  { site: 'will-act restore (a full share)', kind: 'restored_to_will', w: 2, by: 'ego', play: (s, seed) => restoreAt(s, seed, 100) },
  { site: 'will-act restore (half a share)', kind: 'restored_to_will', w: 1, by: 'ego', play: (s, seed) => restoreAt(s, seed, 50) },
  // events/will-scenes.ts and will-amends.ts
  { site: 'will-scenes S_TELL (kind)', kind: 'told_gently', w: 2, by: 'ego', play: (s, seed) => tellAs(s, seed, 'kind') },
  { site: 'will-scenes S_TELL (blunt)', kind: 'told_bluntly', w: 2, by: 'ego', play: (s, seed) => tellAs(s, seed, 'blunt') },
  {
    site: 'will-amends explainReasons',
    kind: 'told_gently',
    w: 2,
    by: 'ego',
    play: (s, seed) => {
      const { g, b } = fam(s, seed)
      setKnown(g, b, 40)
      action(willPersonNodes(g, b), 'will.explain').run(g, undefined)
      return { g, p: b, ok: readWl(g, b).explained === 'kind' }
    },
  },
  {
    site: 'will-amends heartToHeart (it got through)',
    kind: 'olive_branch',
    w: 2,
    by: 'ego',
    dice: true,
    play: (s, seed) => {
      const { g, b } = fam(s, seed)
      setKnown(g, b, 40)
      const before = readWl(g, b).anger
      action(willPersonNodes(g, b), 'will.peace').run(g, undefined)
      return { g, p: b, ok: readWl(g, b).anger < before }
    },
  },
  // events/will-feud.ts
  { site: 'will-feud takeSides', kind: 'took_my_side', w: 1, by: 'ego', dice: true, play: sidesTaken },
  // love.ts
  { site: 'love hookUpWith (found out)', kind: 'betrayal', w: 3, by: 'ego', dice: true, play: (s, seed) => {
    const { g, p } = partnerGame(s, seed, 'partner', 80)
    const friend = createPerson(g, { relation: 'friend', age: 29, relationship: 60 })
    hookUpWith(g, friend)
    g.queue = []
    return { g, p, ok: p.relationship < 60 }
  } },
  { site: 'love breakUp (the player ends it)', kind: 'broke_up', w: 2, by: 'ego', play: (s, seed) => { const { g, p } = partnerGame(s, seed, 'partner', 60); breakUp(g, p, 'player'); g.queue = []; return { g, p, ok: p.relation === 'ex' } } },
  { site: 'love breakUp (they end it)', kind: 'broke_up', w: 2, by: 'them', play: (s, seed) => { const { g, p } = partnerGame(s, seed, 'partner', 60); breakUp(g, p, 'them'); g.queue = []; return { g, p, ok: p.relation === 'ex' } } },
  { site: 'love breakUp (an engagement)', kind: 'broke_up', w: 3, by: 'ego', play: (s, seed) => { const { g, p } = partnerGame(s, seed, 'fiance', 70); breakUp(g, p, 'player'); g.queue = []; return { g, p, ok: p.relation === 'ex' } } },
  { site: 'love divorce (the player files)', kind: 'divorced', w: 3, by: 'ego', play: (s, seed) => { const { g, p } = partnerGame(s, seed, 'spouse', 50); divorce(g, p, 'player'); g.queue = []; return { g, p, ok: p.relation === 'exSpouse' } } },
  { site: 'love divorce (they file)', kind: 'divorced', w: 3, by: 'them', play: (s, seed) => { const { g, p } = partnerGame(s, seed, 'spouse', 50); divorce(g, p, 'them'); g.queue = []; return { g, p, ok: p.relation === 'exSpouse' } } },
  { site: 'love.propose.ring (yes)', kind: 'proposed_yes', w: 2, by: 'ego', dice: true, play: (s, seed) => {
    const { g, p } = partnerGame(s, seed, 'partner', 90)
    proposeTo(g, p)
    answerQueue(g, 'love.propose.ring', 'none')
    g.queue = []
    return { g, p, ok: p.relation === 'fiance' }
  } },
  { site: 'love.propose.ring (no)', kind: 'proposed_no', w: 1, by: 'ego', dice: true, play: (s, seed) => {
    const { g, p } = partnerGame(s, seed, 'partner', 40)
    proposeTo(g, p)
    answerQueue(g, 'love.propose.ring', 'none')
    g.queue = []
    return { g, p, ok: p.relation === 'partner' }
  } },
  { site: 'love.proposed (yes)', kind: 'proposed_yes', w: 2, by: 'them', play: (s, seed) => { const { g, p } = partnerGame(s, seed, 'partner', 80); partnerProposes(g, p); answerQueue(g, 'love.proposed', 'yes'); g.queue = []; return { g, p, ok: p.relation === 'fiance' } } },
  { site: 'love.proposed (no)', kind: 'proposed_no', w: 2, by: 'them', play: (s, seed) => { const { g, p } = partnerGame(s, seed, 'partner', 80); partnerProposes(g, p); answerQueue(g, 'love.proposed', 'no'); g.queue = []; return { g, p, ok: p.relation === 'partner' } } },
  // business/nepo-actions.ts and nepo-year.ts
  { site: 'nepo hireRelative', kind: 'hired_me', w: (r) => r.n ?? 2, by: 'ego', play: (s, seed) => { const h = hired(s, seed, 30, 1); return { g: h.g, p: h.p, ok: h.hired, n: readJob(h.p)?.part === true ? 1 : 2 } } },
  { site: 'nepo hireRelative (a summer job)', kind: 'hired_me', w: 1, by: 'ego', play: (s, seed) => { const h = hired(s, seed, 16, 0); return { g: h.g, p: h.p, ok: h.hired && readJob(h.p)?.part === true } } },
  { site: 'nepo promote', kind: 'promoted_me', w: 2, by: 'ego', play: (s, seed) => { const h = hired(s, seed, 30, 1); return { g: h.g, p: h.p, ok: h.hired && promote(h.g, h.a, h.b, h.p).ok } } },
  { site: 'nepo demote', kind: 'demoted_me', w: 2, by: 'ego', play: (s, seed) => { const h = hired(s, seed, 30, 2); return { g: h.g, p: h.p, ok: h.hired && demote(h.g, h.a, h.b, h.p).ok && entitlement(h.p) < 60 } } },
  { site: 'nepo fire (a child)', kind: 'fired_me', w: 3, by: 'ego', play: (s, seed) => { const h = hired(s, seed, 30, 1); return { g: h.g, p: h.p, ok: h.hired && fire(h.g, h.a, h.b, h.p).ok } } },
  { site: 'nepo fire (a sibling)', kind: 'fired_me', w: 2, by: 'ego', play: (s, seed) => { const h = hired(s, seed, 40, 1, 'sibling'); return { g: h.g, p: h.p, ok: h.hired && fire(h.g, h.a, h.b, h.p).ok } } },
  // relationships.ts
  {
    site: 'relationships rumor',
    kind: 'gossiped_about_me',
    w: 2,
    by: 'ego',
    play: (s, seed) => {
      const g = mk(s, seed, { age: 30, money: 50_000, countryId: 'us' })
      g.year = 2026
      const p = createPerson(g, { relation: 'friend', age: 30, relationship: 60, traits: ['kind', 'calm'], money: 1_000, countryId: 'us' })
      action(personActions(g, p), 'rumor').run(g, undefined)
      g.queue = []
      return { g, p, ok: p.relationship < 60 }
    },
  },
]

// ---------------------------------------------------------------------------------------------------------------------
// Reading what a site wrote

const memoriesAt = (r: Played): readonly Memory[] => {
  const e = readEdge(r.g, personEntity(r.p), r.to ?? playerRef(r.g))
  return e === null ? [] : memoriesOf(e)
}

/** The game without its world: the part of the state a memory must not touch. */
const withoutWorld = (g: GameState): string => JSON.stringify({ ...g, world: undefined })

const seedFor = (s: Site): number => (s.dice ? findSeed((n) => s.play(false, n).ok, { label: `${s.site} ${s.kind}`, tries: 400 }) : 7)
const expectedW = (s: Site, r: Played): number => (typeof s.w === 'function' ? s.w(r) : s.w)

describe('the sites', () => {
  it('lists each kind it writes once per site and no kind the plan does not name', () => {
    const named = new Set(SITES.map((s) => s.kind))
    expect([...named].sort()).toEqual(
      [
        'loan_given', 'gift_refused', 'asked_too_often', 'allowance_cut', 'loan_repaid', 'loan_unpaid', 'cut_from_will', 'estranged', 'reconciled',
        'restored_to_will', 'told_gently', 'told_bluntly', 'olive_branch', 'took_my_side', 'betrayal', 'broke_up', 'divorced', 'proposed_yes',
        'proposed_no', 'hired_me', 'promoted_me', 'demoted_me', 'fired_me', 'gossiped_about_me',
      ].sort(),
    )
    for (const k of named) expect(MEMORY_KINDS).toContain(k)
    expect(new Set(SITES.map((s) => `${s.site}|${s.kind}`)).size).toBe(SITES.length)
  })

  for (const s of SITES) {
    describe(`${s.site}: ${s.kind}`, () => {
      it('on a stamped life, writes the kind once, with its weight and side, in the year it happened', () => {
        const seed = seedFor(s)
        const r = s.play(true, seed)
        expect(r.ok, 'the branch ran').toBe(true)
        const got = memoriesAt(r).filter((m) => m.kind === s.kind)
        expect(got).toEqual([{ kind: s.kind, year: r.year ?? r.g.year, w: expectedW(s, r), by: s.by }])
      })

      it('on a life that is not stamped, writes nothing and leaves the game as the stamped game has it, apart from the world', () => {
        const seed = seedFor(s)
        const plain = s.play(false, seed)
        const stamped = s.play(true, seed)
        expect(socialOn(plain.g)).toBe(false)
        expect((plain.g.world as { edges?: unknown } | undefined)?.edges).toBeUndefined()
        expect(plain.g.world === undefined || !('social' in plain.g.world)).toBe(true)
        expect(memoriesAt(plain)).toEqual([])
        expect(withoutWorld(plain.g)).toBe(withoutWorld(stamped.g))
      })
    })
  }

  it('refuses a second memory of the same kind in the same year for every kind a site writes, and moves nothing', () => {
    const g = socialGame(3)
    const p = createPerson(g, { relation: 'child', age: 30, relationship: 60 })
    for (const kind of new Set(SITES.map((s) => s.kind))) {
      expect(remember(g, p, kind, { w: 2, by: 'ego' }), kind).toBe(true)
      const before = JSON.stringify(g.world)
      expect(remember(g, p, kind, { w: 3, by: 'them' }), `${kind} again`).toBe(false)
      expect(JSON.stringify(g.world), `${kind} moved something`).toBe(before)
    }
  })
})

describe('what the yearly step does to them', () => {
  it('lets the pinned kinds the sites write keep their weight for 40 years and fades the others away', () => {
    const { g, a, b } = fam(true, 7)
    estrange(g, b)
    reconcile(g, b)
    changeWill(g, (gg, w) => removeHeir(gg, w, a))
    g.queue = []
    learn(g, a, 'blunt')
    remember(g, a, 'told_bluntly', { w: 3, by: 'ego' })
    const start = (p: Person): readonly Memory[] => memoriesAt({ g, p, ok: true })
    const cut = start(a).find((m) => m.kind === 'cut_from_will')!
    expect(start(b).map((m) => [m.kind, m.w]).sort()).toEqual([['estranged', 3], ['reconciled', 2]])
    for (let y = 0; y < 40; y++) {
      g.year += 1
      stepEdges(g)
    }
    expect(start(b).map((m) => [m.kind, m.w])).toEqual([['estranged', 3]])
    expect(start(a).map((m) => [m.kind, m.w])).toEqual([['cut_from_will', cut.w]])
  })
})

describe('the weight of a cut', () => {
  it('follows the anger the person learns it with: 3 from 55, 2 from 30 and 1 under that', () => {
    const seen = new Set<number>()
    for (const who of ['a', 'b', 'c'] as const) {
      for (const how of ['kind', 'letter', 'blunt', 'dinner', 'leak'] as const) {
        const r = cutAndLearn(true, 7, who, how)
        const w = memoriesAt(r).find((m) => m.kind === 'cut_from_will')!.w
        expect(w, `${who} ${how} at ${r.n}`).toBe(cutWeight(r))
        seen.add(w)
      }
    }
    expect([...seen].sort()).toEqual([1, 2, 3])
  })
})

describe('the family business after a year', () => {
  it('a relative who was passed over remembers it (the sibling drama of the yearly step)', () => {
    const play = (stamped: boolean, seed: number): Played => {
      const w = nepoWorld(seed)
      if (stamped) stampSocial(w.g)
      const boss = nepoKid(w.g, 34, { relation: 'child' })
      const left = nepoKid(w.g, 30, { relation: 'child', relationship: 70 })
      hireRelative(w.g, w.a, w.b, boss, { rank: 3 }, { quiet: true })
      const start = w.g.year
      for (let y = 0; y < 40; y++) {
        w.g.year += 1
        w.g.yearActions = {}
        familyYear(w.g)
        drain(w.g)
        if (w.g.log.flatMap((l) => l.entries).some((e) => /it is not fair that/.test(e.text))) return { g: w.g, p: left, ok: true, year: w.g.year }
      }
      void start
      return { g: w.g, p: left, ok: false }
    }
    const seed = findSeed((n) => play(false, n).ok, { label: 'passed over', tries: 30 })
    const r = play(true, seed)
    expect(r.ok).toBe(true)
    const got = memoriesAt(r).filter((m) => m.kind === 'passed_over')
    expect(got.length).toBeGreaterThanOrEqual(1)
    expect(got.every((m) => m.w === 2 && m.by === 'ego')).toBe(true)
    expect(got.map((m) => m.year)).toContain(r.year)
    expect(withoutWorld(play(false, seed).g)).toBe(withoutWorld(r.g))
  })
})
