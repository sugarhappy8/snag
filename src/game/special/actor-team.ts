// Actor 2.0 team: the agent and the manager. Each year three candidates are offered per role, built from
// the family seed (never g.rng) and cached for the year; a pitch needs pull, the cut is paid only inside
// payActor (hiring costs nothing), loyalty moves with how the last year went, and a rival agency can call.
// This file imports nothing from actor.ts or actor-pipeline.ts: actor.ts imports it for the menu rows.
import { seeded } from '../assets'
import { getPerson, removePerson, useYearAction, yearActionsUsed } from '../core'
import { nameFitsYear } from '../history/events-people'
import { createPerson } from '../people'
import { chance, randInt } from '../rng'
import { defineScript } from '../scripts'
import { outcomeTag } from '../timeMachine'
import type { ChoiceOption, GameState, Gender, MenuGroup, MenuNode } from '../types'
import { namePoolOf } from '../world'
import type { IndustryId } from './actor-data'
import { actorStore, adoptLegacy, type ActorState, type Rep } from './actor-state'
import { industryOf, rankOf, starPower } from './actor-world'
import { blocked, dropList, yearlyList } from './common'
import { honest } from './kit/crisis'
import { gatedAction } from './kit/menu'
import { familySeed } from './kit/rivals'
import { arr, flt, int, rec, txt } from './kit/state'
import { careerCtx, careerLog, careerSay, claimChoice, offerChoice, type CareerCtx } from './kit/year'

export type RepRole = 'agent' | 'manager'

/** The queued pitch choice: one of the three candidates, or never mind. */
export const REP_SCRIPT = 'career.actor.rep'

/** Searches a year per role: each time the candidates are put to you counts as one pitch. */
const SEARCHES = 2
const CANDIDATES = 3
const CUT_MAX = 0.3
const ROLES: readonly RepRole[] = ['agent', 'manager']

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))
const round2 = (n: number): number => Math.round(n * 100) / 100

interface Kind {
  title: string
  word: string
  a: string
  occupation: string
  emoji: string
  /** The cut range for a candidate, quality 25 to 90 spread across it. */
  cut: readonly [number, number]
  firms: readonly string[]
}

const KINDS: Record<RepRole, Kind> = {
  agent: {
    title: 'Talent Agent',
    word: 'agent',
    a: 'an agent',
    occupation: 'Talent Agent',
    emoji: '\u{1F574}\u{FE0F}',
    cut: [0.08, 0.14],
    firms: ['Starlight Talent', 'Apex Artists Agency', 'Bluebird Management', 'Velvet Rope Talent', 'Marquee Partners', 'Spotlight & Co.', 'Hollow Hill Agency'],
  },
  manager: {
    title: 'Talent Manager',
    word: 'manager',
    a: 'a manager',
    occupation: 'Talent Manager',
    emoji: '\u{1F4BC}',
    cut: [0.11, 0.17],
    firms: ['Northlight Management', 'Cedar Row Management', 'Harborline Partners', 'Fieldstone Management', 'Ember Gate Entertainment', 'Westmark Management'],
  },
}

const searchKey = (role: RepRole): string => `actor.search.${role}`
const listKey = (role: RepRole): string => `actor.rep.${role}`

// ---------------------------------------------------------------------------
// Pure rules

/** 0.6 star + 0.2 reputation + 3 x min(6, credits): what a rep weighs before taking you on. */
export function pull(g: GameState, s: ActorState): number {
  return 0.6 * starPower(g, s) + 0.2 * s.rep + 3 * Math.min(6, s.credits.length)
}

/** Pull plus the roll (0 to 30) must reach 0.8 x the rep's quality. */
export function canSign(g: GameState, s: ActorState, r: Rep, roll: number): boolean {
  return pull(g, s) + roll >= 0.8 * r.quality
}

/** The agent's and the manager's cuts together, never above 30%. */
export function cutOf(s: ActorState): number {
  const a = Number.isFinite(s.team.agent?.cut) ? (s.team.agent?.cut as number) : 0
  const m = Number.isFinite(s.team.manager?.cut) ? (s.team.manager?.cut as number) : 0
  return Math.min(CUT_MAX, Math.max(0, a + m))
}

/** How hard rival agencies are hunting this year: seeded 0 to 1 per industry and year, shared by heirs. */
export function agencyHeat(g: GameState, industry: IndustryId, year: number): number {
  const y = Number.isFinite(year) ? Math.floor(year) : g.year
  return seeded(`${familySeed(g)}|agencyHeat|actor|${industry}|${y}${outcomeTag(g, y)}`).next()
}

/** clamp(0.03 + max(0, q-55)/250 + max(0, 55-loyalty)/250 + 0.05 x heat, 0, 0.35): the yearly chance a rival agency calls. */
export function poachRisk(_s: ActorState, r: Rep, heat: number): number {
  const q = Number.isFinite(r.quality) ? r.quality : 50
  const loyalty = Number.isFinite(r.loyalty) ? r.loyalty : 55
  const h = Number.isFinite(heat) ? clamp(heat, 0, 1) : 0
  return clamp(0.03 + Math.max(0, q - 55) / 250 + Math.max(0, 55 - loyalty) / 250 + 0.05 * h, 0, 0.35)
}

// ---------------------------------------------------------------------------
// Candidates

/** A candidate is a Rep plus what the Person needs once signed. Stored in the year's list as plain JSON. */
interface Candidate extends Rep {
  first: string
  last: string
  gender: Gender
  age: number
}

/** Three candidates from the family seed, the role and the year; the A-list asks 2 more points of cut. */
function generate(g: GameState, role: RepRole, aList: boolean): Candidate[] {
  const kind = KINDS[role]
  const pool = namePoolOf(g.character.countryId)
  const out: Candidate[] = []
  const taken = new Set<string>()
  for (let i = 0; i < CANDIDATES; i++) {
    const r = seeded(`${familySeed(g)}|rep|${role}|${g.year}|${i}${outcomeTag(g, g.year)}`)
    const gender: Gender = r.chance(0.5) ? 'male' : 'female'
    const age = r.int(32, 58)
    const names = (gender === 'male' ? pool.male : pool.female).filter((n) => typeof n === 'string' && n.length > 0)
    const fits = names.filter((n) => nameFitsYear(n, g.year - age))
    const from = fits.length > 0 ? fits : names
    let first = from.length > 0 ? r.pick(from) : 'Alex'
    for (let t = 0; t < 8 && taken.has(first) && from.length > 1; t++) first = r.pick(from)
    taken.add(first)
    const last = pool.last.length > 0 ? r.pick(pool.last) : 'Smith'
    const quality = r.int(25, 90)
    const [lo, hi] = kind.cut
    const raw = lo + ((hi - lo - 0.01) * (quality - 25)) / 65 + 0.01 * r.next()
    out.push({
      personId: '',
      name: txt(`${first} ${last}`, 40),
      firm: r.pick(kind.firms),
      quality,
      cut: round2(raw + (aList ? 0.02 : 0)),
      loyalty: 55,
      since: g.year,
      first: txt(first, 24),
      last: txt(last, 24),
      gender,
      age,
    })
  }
  return out
}

/** The cached list read back through the same bounds a saved record gets: junk rows drop out. */
function readCandidates(v: unknown, g: GameState): Candidate[] {
  const out: Candidate[] = []
  for (const x of arr(v).slice(0, CANDIDATES)) {
    const r = rec(x)
    const first = txt(r.first, 24)
    const last = txt(r.last, 24)
    if (!first || !last) continue
    out.push({
      personId: '',
      name: txt(`${first} ${last}`, 40),
      firm: txt(r.firm, 60) || 'Independent',
      quality: int(r.quality, 50, 20, 95),
      cut: flt(r.cut, 0.1, 0.05, 0.2),
      loyalty: 55,
      since: int(r.since, g.year, 0, 9999),
      first,
      last,
      gender: r.gender === 'male' ? 'male' : 'female',
      age: int(r.age, 40, 18, 90),
    })
  }
  return out
}

/** This year's candidates for the role, cached by `yearlyList`. Writes the cache: actions and scripts only. */
function pool(g: GameState, role: RepRole): Candidate[] {
  const key = listKey(role)
  const make = (): Candidate[] => {
    const st = rankOf(g, actorStore.view(g))
    return generate(g, role, st.of > 1 && st.rank <= 3)
  }
  let list = readCandidates(yearlyList<unknown>(g, key, make), g)
  if (list.length === 0) {
    dropList(g, key) // a junk cache is replaced, not trusted
    list = readCandidates(yearlyList<unknown>(g, key, make), g)
  }
  return list
}

/** Three candidates, cached by `yearlyList` for the year. A pitch to one of them is `hireRep`. */
export function candidates(g: GameState, role: RepRole): Rep[] {
  return pool(g, role)
}

/**
 * The index of the best value among the reps you could sign: the highest quality - 120 x cut among those
 * with pull + 30 >= 0.8 x quality. -1 when none is within reach. Pure: it states quality and cut, never loyalty.
 */
export function bestRep(g: GameState, s: ActorState, list: readonly Rep[]): number {
  const reach = pull(g, s) + 30
  let best = -1
  let top = -Infinity
  list.forEach((r, i) => {
    if (reach < 0.8 * r.quality) return
    const value = r.quality - 120 * r.cut
    if (value > top) {
      top = value
      best = i
    }
  })
  return best
}

// ---------------------------------------------------------------------------
// Hiring and firing

const pct = (cut: number): number => Math.round(cut * 100)

/** The rep's Person leaves your contacts, unless you've grown close (60 or better): then they stay a friend. */
function letGo(g: GameState, r: Rep): void {
  const p = getPerson(g, r.personId)
  if (!p || !p.alive) return
  if (Number.isFinite(p.relationship) && p.relationship >= 60) p.relation = 'friend'
  else removePerson(g, p.id)
}

/**
 * Puts the pitch to the candidate at `index`. Takes the legacy record over, then rolls pull + 0 to 30 against
 * 0.8 x quality (one g.rng draw); a rep who signs becomes a Person (loyalty 55) and the audition listings are
 * rebuilt. Refuses, with nothing changed, for a minor, a filled slot or an index outside the list. No fee.
 */
export function hireRep(c: CareerCtx<ActorState>, role: RepRole, index: number): void {
  const { g, s } = c
  const kind = KINDS[role]
  const why = blocked(g, 16)
  if (why) return void careerSay(c, kind.title, why, kind.emoji)
  if (s.team[role]) return void careerSay(c, kind.title, `You already have ${kind.a}.`, kind.emoji)
  const cand = Number.isInteger(index) ? pool(g, role)[index] : undefined
  if (!cand) return void careerSay(c, kind.title, `No ${kind.word} is waiting to hear from you.`, kind.emoji)
  if (!canSign(g, s, cand, randInt(g, 0, 30))) {
    careerSay(c, kind.title, `${cand.name} passed. "Call me when you've done something."`, kind.emoji, 'bad')
    return
  }
  adoptLegacy(g, s)
  const person = createPerson(g, {
    relation: 'coworker',
    age: cand.age,
    gender: cand.gender,
    firstName: cand.first,
    lastName: cand.last,
    occupation: kind.occupation,
    relationship: 50,
    data: { firm: cand.firm, rep: role },
  })
  s.team[role] = { personId: person.id, name: cand.name, firm: cand.firm, quality: cand.quality, cut: cand.cut, loyalty: 55, since: g.year }
  dropList(g, 'actor.roles')
  careerLog(c, `I signed ${cand.name} as my ${kind.word}.`, 'good')
  careerSay(c, kind.title, `${cand.name} of ${cand.firm} agreed to represent you for ${pct(cand.cut)}% of your pay.`, kind.emoji, 'good')
}

/** Lets the rep go. Their Person is removed unless the relationship is 60 or better. */
export function fireRep(c: CareerCtx<ActorState>, role: RepRole): void {
  const { g, s } = c
  const kind = KINDS[role]
  const r = s.team[role]
  if (!r) return void careerSay(c, kind.title, `You don't have ${kind.a}.`, kind.emoji)
  adoptLegacy(g, s)
  letGo(g, r)
  s.team[role] = null
  dropList(g, 'actor.roles')
  careerLog(c, `I fired my ${kind.word}, ${r.name}.`)
  careerSay(c, kind.title, `You fired ${r.name}. They said you'd never work in this town again.`, '\u{1F525}')
}

/** One pitch: this year's three candidates, put to you as a choice. Counts a search only once it is queued. */
function openSearch(c: CareerCtx<ActorState>, role: RepRole): void {
  const { g, s } = c
  const kind = KINDS[role]
  const key = searchKey(role)
  const used = yearActionsUsed(g, key)
  if (used >= SEARCHES) return void careerSay(c, kind.title, `No ${kind.word}s are returning your calls this year.`, kind.emoji)
  const list = pool(g, role)
  const best = bestRep(g, s, list)
  const choices: ChoiceOption[] = list.map((r, i) => ({
    id: String(i),
    label: `Pitch ${r.first} (${r.quality}, ${pct(r.cut)}%)`,
    emoji: kind.emoji,
    ...(i === best ? honest(g, 'Acting', `Best value: quality ${r.quality} for a ${pct(r.cut)}% cut.`) : {}),
  }))
  choices.push({ id: 'cancel', label: 'Never mind', emoji: '\u{274C}' })
  const scene = `Three ${kind.word}s will take your call. Each shows quality and cut. What will you do?`
  if (!offerChoice(c, REP_SCRIPT, `${kind.title}s`, scene, choices, { role, n: used + 1 }, kind.emoji)) {
    careerSay(c, kind.title, 'You have decisions waiting. Answer them first.', kind.emoji)
    return
  }
  useYearAction(g, key, SEARCHES)
}

defineScript(REP_SCRIPT, (g, choice, data) => {
  if (!/^[0-2]$/.test(choice) || !actorStore.has(g)) return
  const d = rec(data)
  const role: RepRole | null = d.role === 'agent' || d.role === 'manager' ? d.role : null
  if (!role) return
  const s = actorStore.mut(g)
  if (!claimChoice(g, s, data, `rep.${role}.${g.year}.${int(d.n, 1, 1, 9)}`)) return
  hireRep(careerCtx(g, 'actor', s), role, Number(choice))
})

// ---------------------------------------------------------------------------
// The yearly step

/** The rep's slot is freed: the audition listings are rebuilt, and the Person (if they're still around) is let go. */
function depart(g: GameState, s: ActorState, role: RepRole): void {
  const r = s.team[role]
  if (r) letGo(g, r)
  s.team[role] = null
  dropList(g, 'actor.roles')
}

/**
 * Loyalty moves with how the last year went (+3 if you took home pay, +2 for a hit of 65 or more, -5 for a dry
 * year), quality drifts 2 toward your star power, a rep whose Person has died or is gone frees the slot, the
 * agent drops you at loyalty under 30 after two dry years, and each rep left gets one poach draw. A hit marks
 * `cool['poach.<role>']` for this year (the poach event reads it); below loyalty 40 they leave at once.
 */
export function stepTeam(c: CareerCtx<ActorState>): void {
  const { g, s } = c
  if (!s.team.agent && !s.team.manager) return
  const star = starPower(g, s)
  const heat = agencyHeat(g, industryOf(g), g.year)
  const last = s.rows.find((row) => row.y === g.year - 1)
  const paid = !!last && last.income > 0
  const hit = s.credits.some((x) => x.year === g.year - 1 && x.popularity >= 65)
  const dry = s.dry >= 1
  for (const role of ROLES) {
    const r = s.team[role]
    if (!r) continue
    const kind = KINDS[role]
    if (r.personId) {
      const p = getPerson(g, r.personId)
      if (!p || !p.alive) {
        s.team[role] = null
        dropList(g, 'actor.roles')
        careerLog(c, p ? `My ${kind.word} ${r.name} died.` : `My ${kind.word} ${r.name} left the business.`, 'bad')
        careerSay(c, kind.title, p ? `${r.name}, your ${kind.word}, died this year.` : `${r.name}, your ${kind.word}, left the business.`, kind.emoji, 'bad')
        continue
      }
    }
    r.loyalty = clamp(Math.round(r.loyalty + (paid ? 3 : 0) + (hit ? 2 : 0) - (dry ? 5 : 0)), 0, 100)
    r.quality = clamp(Math.round(r.quality + clamp(star - r.quality, -2, 2)), 20, 95)
    if (role === 'agent' && r.loyalty < 30 && s.dry >= 2) {
      g.flags['special.actor.dropped'] = true
      depart(g, s, role)
      careerLog(c, `My agent ${r.name} dropped me.`, 'bad')
      careerSay(c, kind.title, `${r.name} dropped you after ${s.dry} dry years.`, '\u{1F4C9}', 'bad')
      continue
    }
    if (chance(g, poachRisk(s, r, heat))) {
      s.cool[`poach.${role}`] = g.year
      if (r.loyalty < 40) {
        depart(g, s, role)
        careerLog(c, `My ${kind.word} ${r.name} left for a rival agency.`, 'bad')
        careerSay(c, kind.title, `${r.name} took an offer from a rival agency and left.`, kind.emoji, 'bad')
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Menus

const NONE = 'none'

function teamLine(s: ActorState): string {
  return `Agent: ${s.team.agent?.name ?? NONE}, manager: ${s.team.manager?.name ?? NONE}`
}

function repLine(r: Rep | null, kind: Kind): string {
  const label = kind.word.charAt(0).toUpperCase() + kind.word.slice(1)
  return r ? `${label}: ${r.name} of ${r.firm}. Quality ${r.quality}, cut ${pct(r.cut)}%.` : `No ${kind.word}.`
}

function hireRow(role: RepRole): MenuNode {
  const kind = KINDS[role]
  return {
    ...gatedAction<ActorState>({
      id: `actor.${role}.hire`,
      label: role === 'agent' ? 'Hire an Agent' : 'Hire a Manager',
      emoji: kind.emoji,
      career: 'actor',
      store: actorStore,
      subtitle: role === 'agent' ? 'Find a talent agent to land better roles' : 'Adds auditions and helps with contract talks',
      gate: (g, s) => {
        if (s.team[role]) return `You already have ${kind.a}.`
        const young = blocked(g, 16)
        if (young) return young
        return yearActionsUsed(g, searchKey(role)) >= SEARCHES ? `No ${kind.word}s are returning your calls this year.` : null
      },
      run: (c) => openSearch(c, role),
    }),
    visible: (g) => !actorStore.view(g).team[role],
  }
}

function fireRow(role: RepRole): MenuNode {
  const kind = KINDS[role]
  return {
    ...gatedAction<ActorState>({
      id: `actor.${role}.fire`,
      label: role === 'agent' ? 'Fire Your Agent' : 'Fire Your Manager',
      emoji: '\u{1F525}',
      career: 'actor',
      store: actorStore,
      subtitle: (g) => {
        const r = actorStore.view(g).team[role]
        return r ? `${r.name}, ${r.firm} (${pct(r.cut)}% cut)` : ''
      },
      gate: (_g, s) => (s.team[role] ? null : `You don't have ${kind.a}.`),
      confirm: () => `Fire your ${kind.word}?`,
      run: (c) => fireRep(c, role),
    }),
    visible: (g) => !!actorStore.view(g).team[role],
  }
}

let rows: MenuNode[] | null = null

/**
 * The team menu: who represents you (quality and cut, never loyalty) and the four rows, with the legacy ids
 * `actor.agent.hire` and `actor.agent.fire` kept. Built on first use, so no store is read at import.
 */
export function teamRows(_g: GameState): MenuNode[] {
  if (!rows) {
    const actions = [hireRow('agent'), fireRow('agent'), hireRow('manager'), fireRow('manager')]
    const team: MenuGroup = {
      type: 'menu',
      id: 'actor.team',
      label: 'Your Team',
      emoji: '\u{1F574}\u{FE0F}',
      subtitle: (g) => teamLine(actorStore.view(g)),
      header: () => 'An agent finds roles. A manager adds auditions and helps you push. Together they take up to 30%.',
      children: (g) => {
        const s = actorStore.view(g)
        const cut = cutOf(s)
        const out: MenuNode[] = [
          { type: 'info', id: 'actor.team.agent', emoji: KINDS.agent.emoji, text: repLine(s.team.agent, KINDS.agent) },
          { type: 'info', id: 'actor.team.manager', emoji: KINDS.manager.emoji, text: repLine(s.team.manager, KINDS.manager) },
        ]
        if (cut > 0) out.push({ type: 'info', id: 'actor.team.cut', text: `Together they take ${pct(cut)}% of every fee.` })
        return [...out, ...actions]
      },
    }
    rows = [team]
  }
  return rows
}
