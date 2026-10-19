// Actor 2.0 events: eleven yearly crises the kit offers (35% of active years, one at a time), the scandal,
// range and press levers, and the press retainer. Each crisis option has one `odds()` for the roll and the
// hint, or none when the outcome is fixed. Effects go through the kit's `Effects`; what an `Effects` cannot
// carry (fee modifiers, typecast, loyalty, projects, karma) rides in `Branch.then`, which moves no money and
// draws no g.rng.
//
// Reputation is not an `Effects` field, so a branch that moves it also carries its worth to star power in
// `standing` (0.25 x the change): the hint can then weigh it, and the next close rewrites standing from the
// real star power anyway. A scandal is worth a little peace of mind (`happiness`). Fee modifiers are not
// weighed by the hint: they live in `cool` (value = the last year they apply) and `feeMult` reads them.
//
// This file imports nothing from actor.ts or actor-pipeline.ts (actor.ts imports the sim, which imports this).
import { seeded, type SRng } from '../assets'
import { addHidden, getPerson, removePerson, useYearAction, yearActionsUsed } from '../core'
import { nameFitsYear } from '../history/events-people'
import { techOdds } from '../history/timeline'
import { institutionStrength } from '../nation/data'
import { policyOf } from '../nation/state'
import { outcomeTag } from '../timeMachine'
import type { GameState, Json } from '../types'
import { namePoolOf } from '../world'
import { TYPE_IDS, type TypeId } from './actor-data'
import { actorStore, adoptLegacy, type ActorState, type Proj, type Rep } from './actor-state'
import { industryOf, rankOf, scaleOf, soundShiftYear } from './actor-world'
import { actingSkill, addFame, blocked, clamp100, dropList, fameOf, money, setFlagSkill } from './common'
import { defineCrises, type Branch, type CrisisDef, type CrisisSet } from './kit/crisis'
import { familySeed } from './kit/rivals'
import { cap, txt } from './kit/state'
import { careerLog, careerSay, type CareerCtx } from './kit/year'

// ---------------------------------------------------------------------------
// Small pure helpers

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))
const fin = (n: unknown, d = 0): number => (typeof n === 'number' && Number.isFinite(n) ? n : d)
const str = (v: unknown, max: number): string => (typeof v === 'string' ? txt(v, max) : '')
const round4 = (n: number): number => Math.round(n * 10_000) / 10_000

/** What a reputation change is worth to star power (0.25 x): the standing a branch carries so the hint can weigh it. */
const repWorth = (d: number): number => Math.round(0.25 * d) || 0
/** What a scandal costs in peace of mind: a sixth of the points it adds. */
const moodWorth = (d: number): number => Math.round(-d / 6) || 0

const FILM = '\u{1F3AC}'
const TV = '\u{1F4FA}'
const PRESS = '\u{1F4E2}'

/** 'p12' to 12: projects are taken in the order they were made. */
const seqOf = (id: string): number => Number(/(\d+)$/.exec(id)?.[1] ?? 0)
const byId = (a: Proj, b: Proj): number => seqOf(a.id) - seqOf(b.id) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/** A project in production: shooting now, or wrapped and waiting for its release. */
const inFlight = (s: ActorState): Proj[] => s.pipeline.filter((p) => p.stage === 'shoot' || p.stage === 'post').sort(byId)
/** A film that has wrapped and waits in post (no extra's bit part). */
const filmInPost = (s: ActorState): Proj | undefined => s.pipeline.filter((p) => p.kind === 'film' && p.stage === 'post' && p.role !== 'Extra').sort(byId)[0]
const projectOf = (s: ActorState, id: string): Proj | undefined => (id ? s.pipeline.find((p) => p.id === id) : undefined)
const typeOf = (v: unknown): TypeId => (typeof v === 'string' && (TYPE_IDS as readonly string[]).includes(v) ? (v as TypeId) : 'drama')

/** The previous report's net (income less outlay): what "last year's net" means for a price. */
function lastNet(s: ActorState): number {
  const row = s.rows[s.rows.length - 1]
  return row ? Math.max(0, row.income - row.spent) : 0
}

/** `share` of last year's net, at least `floor` x the industry scale. */
const priceOf = (g: GameState, s: ActorState, share: number, floor: number): number => Math.round(Math.max(floor * scaleOf(g), share * lastNet(s)))

const bumpRep = (s: ActorState, d: number): void => {
  s.rep = clamp100(s.rep + d)
}
const bumpScandal = (s: ActorState, d: number): void => {
  s.scandal = clamp100(s.scandal + d)
}
/** A fee modifier or marker: `cool[key]` is the last year it applies (a count for franchise.<type>). */
const hold = (s: ActorState, key: string, last: number): void => {
  s.cool[key] = clamp(Math.round(last), 0, 9999)
}
const bumpBuzz = (s: ActorState, d: number): void => {
  for (const p of s.pipeline) p.buzz = clamp(Math.round(p.buzz + d), 0, 100)
}
/** Quality is fixed at the wrap, so a film in post takes a hit in quality and a shoot in progress in the work put in. */
function hitQuality(p: Proj, d: number): void {
  if (p.stage === 'post') p.quality = clamp(Math.round(p.quality + d), 0, 100)
  else p.developed = clamp(Math.round(p.developed + d), 0, 100)
}
function removeCostars(g: GameState, p: Proj): void {
  if (p.costars.length > 0) g.people = g.people.filter((x) => !(p.costars.includes(x.id) && x.relation === 'coworker'))
  p.costars = []
}
/** Agent and manager loyalty, each moved by `d`. */
function loyalty(s: ActorState, d: number): void {
  for (const r of [s.team.agent, s.team.manager]) if (r) r.loyalty = clamp(Math.round(r.loyalty + d), 0, 100)
}
/** The rep's Person leaves your contacts, unless you've grown close (60 or better): then they stay a friend. */
function letGo(g: GameState, r: Rep): void {
  const p = getPerson(g, r.personId)
  if (!p || !p.alive) return
  if (Number.isFinite(p.relationship) && p.relationship >= 60) p.relation = 'friend'
  else removePerson(g, p.id)
}

type NoData = Record<string, never>
type Def<D extends Record<string, Json> = Record<string, Json>> = CrisisDef<ActorState, D>
type Out = Branch<ActorState>

// ---------------------------------------------------------------------------
// Censorship

/**
 * How likely the censors are to act: (100 - institutional strength) / 200 + media control x 0.3, plus 0.15
 * under an authoritarian regime. Reads the nation's state and writes nothing; no regime is ever named.
 */
export function censorRisk(g: GameState): number {
  const country = g.character.countryId
  const inst = policyOf(g, country).institutions
  const risk = (100 - institutionStrength(country, g.year)) / 200 + fin(inst.mediaControl) * 0.3 + (inst.regime === 'authoritarian' ? 0.15 : 0)
  return clamp(risk, 0, 1)
}

// ---------------------------------------------------------------------------
// The eleven defs

const STRIKE_YEARS: readonly number[] = [1960, 1980, 2007, 2023]
const NEW_KINDS = ['tv', 'streaming'] as const
type NewKind = (typeof NEW_KINDS)[number]

/** The new medium whose first three years (10% of homes or more, but not three years ago) these are, and not yet answered. */
function newKind(g: GameState, s: ActorState): NewKind | null {
  for (const k of NEW_KINDS) {
    if (fin(s.cool[`tech.${k}`]) > 0) continue
    if (techOdds(g, k, g.year) >= 0.1 && techOdds(g, k, g.year - 3) < 0.1) return k
  }
  return null
}

const redScare: Def<NoData> = {
  id: 'redScare',
  title: 'The Committee',
  emoji: '\u{1F3DB}\u{FE0F}',
  cool: 6,
  weight: (g, s) => (industryOf(g) === 'hollywood' && g.year >= 1947 && g.year <= 1957 && s.credits.length > 0 ? 3 : 0),
  make: () => ({}),
  scene: () => 'A government committee wants the names of colleagues with the wrong politics. Your lawyer waits outside. What will you do?',
  options: (() => {
    const refused = (text: string): Out => ({
      text: () => text,
      fx: { standing: repWorth(5) },
      then: (s, g) => {
        bumpRep(s, 5)
        addHidden(g, 'karma', 8)
        hold(s, 'fee.down', g.year + 2)
        delete s.cool['fee.up']
      },
    })
    return {
      safe: { label: 'Refuse to answer', emoji: '\u{1F6AB}', good: () => refused('You gave no names. Offers pay 30% less for three years.') },
      bold: {
        label: 'Stall the committee',
        emoji: '\u{23F3}',
        odds: (_g, s) => 0.35 + s.rep / 200,
        good: () => ({ text: () => 'Your lawyer stalled until the hearing moved on. Nothing came of it.', fx: {} }),
        bad: () => refused('The stalling ran out and you refused to answer. Offers pay 30% less for three years.'),
      },
      cash: {
        label: 'Name names',
        emoji: '\u{1F4DD}',
        good: () => ({
          text: () => 'You gave the committee names. Offers pay 10% more for three years.',
          fx: { standing: repWorth(-15) },
          then: (s, g) => {
            bumpRep(s, -15)
            addHidden(g, 'karma', -10)
            hold(s, 'fee.up', g.year + 2)
            delete s.cool['fee.down']
          },
        }),
      },
    }
  })(),
}

const soundShift: Def<NoData> = {
  id: 'soundShift',
  title: 'Talking Pictures',
  emoji: '\u{1F399}\u{FE0F}',
  cool: 100, // once in a life: the cool-down outlasts any career
  weight: (g) => (soundShiftYear(industryOf(g), g.year) ? 4 : 0),
  make: () => ({}),
  scene: () => 'Sound has come to the screen. Studios are testing every voice and dropping silent stars. What will you do?',
  options: (() => {
    const lessons = (g: GameState): number => Math.round(3_000 * scaleOf(g))
    const learn = (_s: ActorState, g: GameState): void => setFlagSkill(g, 'acting', actingSkill(g) + 6)
    return {
      safe: {
        label: 'Wait it out',
        emoji: '\u{23F3}',
        good: () => ({ text: () => 'You waited. Offers pay 25% less until 1932.', fx: {}, then: (s) => hold(s, 'fee.wait', 1931) }),
      },
      bold: {
        label: 'Take voice lessons',
        emoji: '\u{1F5E3}\u{FE0F}',
        odds: (g) => 0.5 + actingSkill(g) / 200,
        good: (g) => ({ text: (r) => `The lessons worked. You paid ${money(r.paid)} and leads still call.`, fx: { money: -lessons(g) }, then: learn }),
        bad: (g) => ({
          text: (r) => `The lessons cost ${money(r.paid)} and your voice still didn't carry. Offers pay 25% less until 1932.`,
          fx: { money: -lessons(g) },
          then: (s, gg) => {
            learn(s, gg)
            hold(s, 'fee.wait', 1931)
          },
        }),
      },
      cash: {
        label: 'Return to the stage',
        emoji: '\u{1F3AD}',
        good: () => ({
          text: () => 'You went back to the stage. Your shoots slipped a year and no auditions came.',
          fx: { standing: repWorth(3) },
          then: (s, g) => {
            for (const p of s.pipeline) p.lastYear = Math.max(p.lastYear, g.year + 1)
            s.layLow = Math.max(s.layLow, g.year)
            bumpRep(s, 3)
          },
        }),
      },
    }
  })(),
}

type RivalData = { rid: string; rname: string }

const guildStrike: Def<RivalData> = {
  id: 'guildStrike',
  title: 'The Strike',
  emoji: '\u{270A}',
  cool: 3,
  weight: (g, s) => (industryOf(g) === 'hollywood' && STRIKE_YEARS.includes(g.year) && inFlight(s).length > 0 ? 3 : 0),
  make: (g, s) => {
    const top = rankOf(g, s).top[0]
    return { rid: top?.id ?? '', rname: top?.name ?? '' }
  },
  scene: () => 'The guild has called a strike and a picket line stands at the studio gate. Production is halting. What will you do?',
  options: {
    safe: {
      label: 'Wait it out',
      emoji: '\u{23F3}',
      good: () => ({
        text: () => 'You sat it out. Production slipped a year and your shoots went with it.',
        fx: {},
        then: (s, g) => {
          for (const p of inFlight(s)) p.lastYear = Math.max(p.lastYear, g.year + 1)
        },
      }),
    },
    bold: {
      label: 'Join the picket',
      emoji: '\u{1FAA7}',
      good: () => ({
        text: () => 'You joined the picket. Your fee is cut in half this year.',
        fx: { standing: repWorth(6) },
        then: (s) => {
          for (const p of s.pipeline) if (p.stage === 'shoot') p.terms.fee = Math.round(p.terms.fee * 0.5)
          bumpRep(s, 6)
          loyalty(s, 2)
        },
      }),
    },
    cash: {
      label: 'Cross the line',
      emoji: '\u{1F4B0}',
      good: (_g, _s, d) => {
        const id = str(d.rid, 40)
        const name = str(d.rname, 40)
        return {
          text: () => `You crossed the line and kept your fee. ${name || 'Colleagues'} won't forget it.`,
          fx: { standing: repWorth(-12), ...(id ? { grudge: { id, name: name || 'A rival', by: 10 } } : {}) },
          then: (s) => bumpRep(s, -12),
        }
      },
    },
  },
}

type KindData = { kind: string }

const techShift: Def<KindData> = {
  id: 'techShift',
  title: 'A New Screen',
  emoji: '\u{1F4FA}',
  cool: 1,
  weight: (g, s) => (newKind(g, s) ? 3 : 0),
  make: (g, s) => ({ kind: newKind(g, s) ?? 'tv' }),
  scene: (_g, _s, d) =>
    d.kind === 'streaming'
      ? 'Streaming services are casting their own shows. Film purists call it a fad. What will you do?'
      : 'Television is reaching living rooms and studios are casting for it. Film purists call it a fad. What will you do?',
  options: {
    safe: {
      label: 'Stay with film',
      emoji: FILM,
      good: (_g, _s, d) => ({
        text: () => 'You stayed with film. Studios pay film fees 10% more for three years.',
        fx: {},
        then: (s, g) => {
          hold(s, 'fee.film', g.year + 2)
          hold(s, `tech.${d.kind === 'streaming' ? 'streaming' : 'tv'}`, g.year)
        },
      }),
    },
    bold: {
      label: 'Take the new work',
      emoji: TV,
      good: (_g, _s, d) => ({
        text: () => 'You took the new work. Buzz is up on your projects and film circles cooled.',
        fx: { fame: 1, standing: repWorth(-3) },
        then: (s, g) => {
          bumpBuzz(s, 5)
          bumpRep(s, -3)
          hold(s, `tech.${d.kind === 'streaming' ? 'streaming' : 'tv'}`, g.year)
        },
      }),
    },
  },
}

const scandalLeak: Def<NoData> = {
  id: 'scandalLeak',
  title: 'The Story',
  emoji: '\u{1F5DE}\u{FE0F}',
  cool: 3,
  weight: (g) => (fameOf(g) >= 25 ? 2 : 0),
  make: () => ({}),
  scene: () => 'A paper is about to print a story about your private life. The editor wants your answer today. What will you do?',
  options: (() => {
    /** The scandal a branch adds, plus 3 notoriety whichever way it goes. */
    const leak = (d: number): ((s: ActorState, g: GameState) => void) => (s, g) => {
      bumpScandal(s, d)
      addHidden(g, 'notoriety', 3)
    }
    return {
      safe: {
        label: 'Apologize at once',
        emoji: '\u{1F64F}',
        good: () => ({ text: () => 'You apologized before it ran. The story still ran, but softer.', fx: { fame: -1, happiness: moodWorth(15) }, then: leak(15) }),
      },
      bold: {
        label: 'Deny everything',
        emoji: '\u{1F645}',
        odds: (_g, s) => 0.35 + s.rep / 200 + fin(s.team.press?.quality) / 200,
        good: () => ({ text: () => 'The denial held. The story faded fast.', fx: { happiness: moodWorth(5) }, then: leak(5) }),
        bad: () => ({ text: () => 'The denial fell apart. The story ran big and stuck to you.', fx: { happiness: moodWorth(40) }, then: leak(40) }),
      },
      cash: {
        label: 'Sue the paper',
        emoji: '\u{2696}\u{FE0F}',
        odds: () => 0.45,
        good: (g, s) => ({ text: (r) => `The paper backed down. The suit cost ${money(r.paid)}.`, fx: { money: -priceOf(g, s, 0.05, 0) }, then: leak(0) }),
        bad: (g, s) => ({
          text: (r) => `You lost the suit and paid ${money(r.paid)}. The story grew.`,
          fx: { money: -priceOf(g, s, 0.05, 0), happiness: moodWorth(30) },
          then: leak(30),
        }),
      },
    }
  })(),
}

const AGENCIES = ['Crestline Talent', 'Ironbridge Agency', 'Silver Oak Partners', 'Northgate Talent', 'Lumen Management', 'Ashford Artists']
type PoachData = { role: string; rival: string; name: string }

/** The rep a rival agency is calling this year: the agent first, then the manager; one who is staying (loyalty 40 or more). */
function poachRole(g: GameState, s: ActorState): 'agent' | 'manager' | null {
  for (const role of ['agent', 'manager'] as const) {
    const r = s.team[role]
    if (r && r.loyalty >= 40 && s.cool[`poach.${role}`] === g.year) return role
  }
  return null
}

/** A replacement's name, from the family seed and never g.rng; not the name of the rep they replace. */
function replacementName(g: GameState, r: SRng, avoid: string): string {
  const pool = namePoolOf(g.character.countryId)
  let name = ''
  for (let i = 0; i < 8; i++) {
    const female = r.chance(0.5)
    const age = r.int(32, 58)
    const names = (female ? pool.female : pool.male).filter((n) => typeof n === 'string' && n.length > 0)
    const fits = names.filter((n) => nameFitsYear(n, g.year - age))
    const from = fits.length > 0 ? fits : names
    const first = from.length > 0 ? r.pick(from) : 'Alex'
    const last = pool.last.length > 0 ? r.pick(pool.last) : 'Smith'
    name = txt(`${first} ${last}`, 40)
    if (name !== avoid) break
  }
  return name || 'Alex Smith'
}

const roleOf = (v: unknown): 'agent' | 'manager' => (v === 'manager' ? 'manager' : 'agent')

const poach: Def<PoachData> = {
  id: 'poach',
  title: 'A Rival Agency',
  emoji: '\u{1F574}\u{FE0F}',
  cool: 3,
  weight: (g, s) => (poachRole(g, s) ? 4 : 0),
  make: (g, s, r) => {
    const role = poachRole(g, s) ?? 'agent'
    return { role, rival: r.pick(AGENCIES), name: replacementName(g, r, s.team[role]?.name ?? '') }
  },
  scene: (_g, s, d) => {
    const role = roleOf(d.role)
    return `Your ${role}, ${s.team[role]?.name ?? 'someone'}, has an offer from ${str(d.rival, 60)}. They want you to come along. What will you do?`
  },
  options: {
    safe: {
      label: 'Follow them',
      emoji: '\u{1F6B6}',
      good: (_g, s, d) => {
        const role = roleOf(d.role)
        const rival = str(d.rival, 60)
        return {
          text: () => `You followed ${s.team[role]?.name ?? 'them'} to ${rival}. Their cut rose two points.`,
          fx: {},
          then: (st) => {
            const r = st.team[role]
            if (!r) return
            r.cut = Math.min(0.2, round4(r.cut + 0.02))
            r.loyalty = 50
            r.firm = rival || r.firm
          },
        }
      },
    },
    bold: {
      label: 'Stay with the firm',
      emoji: '\u{1F3E2}',
      good: (_g, s, d) => {
        const role = roleOf(d.role)
        const name = str(d.name, 40) || 'A new rep'
        return {
          text: () => `You stayed. ${name} took over from ${s.team[role]?.name ?? 'your rep'}, and ranks lower.`,
          fx: {},
          then: (st, g) => {
            const old = st.team[role]
            if (!old) return
            letGo(g, old)
            // a record with no Person: createPerson draws g.rng, which a branch may not
            st.team[role] = { personId: '', name, firm: old.firm, quality: clamp(old.quality - 15, 20, 95), cut: old.cut, loyalty: 55, since: g.year }
            dropList(g, 'actor.roles')
          },
        }
      },
    },
  },
}

type ProjectData = { id: string; title: string; fee: number }
type FranchiseData = ProjectData & { type: string }

const franchise: Def<FranchiseData> = {
  id: 'franchise',
  title: 'Three Pictures',
  emoji: '\u{1F4BC}',
  cool: 5,
  weight: (_g, s) => (franchiseFilm(s) ? 2 : 0),
  make: (_g, s) => {
    const p = franchiseFilm(s)
    return { id: p?.id ?? '', title: p?.title ?? '', fee: p?.terms.fee ?? 0, type: p?.type ?? 'drama' }
  },
  scene: (_g, _s, d) => `The studio loved "${str(d.title, 48)}" and wants three more pictures. Your agent says decide now. What will you do?`,
  options: (() => {
    /** The deal itself: three pictures of this type at +50%, and the type sticks. */
    const signed = (s: ActorState, d: FranchiseData): void => {
      const type = typeOf(d.type)
      s.cool[`franchise.${type}`] = 3
      s.type[type] = clamp(s.type[type] + 25, 0, 100)
    }
    return {
      safe: {
        label: 'Sign the deal',
        emoji: '\u{270D}\u{FE0F}',
        good: (_g, _s, d) => ({ text: () => 'You signed for three pictures. Fees run 50% higher, and the type sticks to you.', fx: { fame: 2 }, then: (s) => signed(s, d) }),
      },
      bold: {
        label: 'Ask for points',
        emoji: '\u{1F4C8}',
        odds: (_g, s) => 0.4 + fin(s.team.agent?.quality) / 250,
        good: (_g, _s, d) => ({
          text: () => 'You asked for 5% of the back-end and got it. Fees run 50% higher for three pictures.',
          fx: { fame: 2 },
          then: (s) => {
            signed(s, d)
            const p = projectOf(s, str(d.id, 24))
            if (p) p.terms.points = Math.min(0.12, Math.max(p.terms.points, 0.05))
          },
        }),
        // asking can sour the room: without a cost the ask would always beat signing
        bad: (_g, _s, d) => ({
          text: () => 'The studio bristled at the ask. You signed as offered and lost some goodwill.',
          fx: { fame: 2, standing: repWorth(-3) },
          then: (s) => {
            signed(s, d)
            bumpRep(s, -3)
          },
        }),
      },
      cash: {
        label: 'Decline the deal',
        emoji: '\u{1F645}',
        good: (_g, _s, d) => ({
          text: () => 'You turned it down. Producers noticed you can say no.',
          fx: { standing: repWorth(2) },
          then: (s) => {
            const type = typeOf(d.type)
            bumpRep(s, 2)
            s.type[type] = clamp(s.type[type] - 5, 0, 100)
          },
        }),
      },
    }
  })(),
}

/** The lead film a franchise would follow: a star of 40 or more with a lead film in flight and no deal already running. */
function franchiseFilm(s: ActorState): Proj | undefined {
  if (s.standing < 40) return undefined
  const p = inFlight(s).find((x) => x.kind === 'film' && x.role === 'Lead')
  return p && fin(s.cool[`franchise.${p.type}`]) <= 0 ? p : undefined
}

const shelved: Def<ProjectData> = {
  id: 'shelved',
  title: 'Shelved',
  emoji: '\u{1F5C4}\u{FE0F}',
  cool: 4,
  weight: (_g, s) => (filmInPost(s) ? 1.5 : 0),
  make: (_g, s) => {
    const p = filmInPost(s)
    return { id: p?.id ?? '', title: p?.title ?? '', fee: p?.terms.fee ?? 0 }
  },
  scene: (_g, _s, d) => `The studio is thinking of shelving "${str(d.title, 48)}". The call comes this week. What will you do?`,
  options: {
    safe: {
      label: 'Accept the decision',
      emoji: '\u{1F937}',
      good: (_g, _s, d) => ({
        text: () => `The studio shelved "${str(d.title, 48)}". It never opened, but your fee was paid.`,
        fx: { standing: repWorth(-3), happiness: -4 },
        then: (s, g) => {
          const p = projectOf(s, str(d.id, 24))
          if (!p) return
          bumpRep(s, -3)
          removeCostars(g, p)
          s.pipeline = s.pipeline.filter((x) => x.id !== p.id)
          s.credits = cap(
            [
              ...s.credits,
              {
                id: `c-${p.id}`,
                title: p.title,
                kind: 'film',
                role: p.role,
                genre: p.genre,
                type: p.type,
                industry: p.industry,
                studio: p.studio,
                year: g.year,
                age: g.character.age,
                pay: p.terms.fee,
                quality: 0,
                popularity: 0,
                gross: 0,
                backend: 0,
                seasons: 1,
                verdict: 'unreleased',
                residual: 0,
                trust: false,
              },
            ],
            64,
          )
        },
      }),
    },
    bold: {
      label: 'Lobby the studio',
      emoji: '\u{1F4DE}',
      odds: () => 0.5,
      good: (_g, _s, d) => ({ text: (r) => `You lobbied for ${money(r.paid)} and the date held.`, fx: { money: -Math.round(0.03 * fin(d.fee)) } }),
      bad: (_g, _s, d) => ({
        text: (r) => `You lobbied for ${money(r.paid)}, but "${str(d.title, 48)}" slipped a year.`,
        fx: { money: -Math.round(0.03 * fin(d.fee)) },
        then: (s, g) => {
          const p = projectOf(s, str(d.id, 24))
          if (p) p.lastYear = Math.max(p.lastYear, g.year + 1)
        },
      }),
    },
  },
}

const censor: Def<ProjectData> = {
  id: 'censor',
  title: 'The Censors',
  emoji: '\u{1F6D1}',
  cool: 4,
  weight: (g, s) => (censorRisk(g) > 0.25 && filmInPost(s) ? 1.5 : 0),
  make: (_g, s) => {
    const p = filmInPost(s)
    return { id: p?.id ?? '', title: p?.title ?? '', fee: p?.terms.fee ?? 0 }
  },
  scene: (_g, _s, d) => `Censors have flagged "${str(d.title, 48)}" and a ban looms at home. The studio wants your call. What will you do?`,
  options: {
    safe: {
      label: 'Re-edit the film',
      emoji: '\u{2702}\u{FE0F}',
      good: (_g, _s, d) => ({
        text: () => 'You cut the scenes they flagged. The film opens, a little worse for it.',
        fx: {},
        then: (s) => {
          const p = projectOf(s, str(d.id, 24))
          if (p) p.quality = clamp(p.quality - 8, 0, 100)
        },
      }),
    },
    bold: {
      label: 'Fight the ban',
      emoji: '\u{1F94A}',
      odds: (g) => 0.3 + institutionStrength(g.character.countryId, g.year) / 200,
      good: (_g, _s, d) => ({ text: (r) => `You paid ${money(r.paid)} to fight the ban and won. The film opens as shot.`, fx: { money: -Math.round(0.04 * fin(d.fee)) } }),
      bad: (_g, _s, d) => ({
        text: (r) => `You paid ${money(r.paid)} and lost. The ban held at home and the release shrank.`,
        fx: { money: -Math.round(0.04 * fin(d.fee)) },
        then: (s) => {
          const p = projectOf(s, str(d.id, 24))
          if (!p) return
          p.buzz = clamp(p.buzz - 50, 0, 100)
          p.terms.points = round4(p.terms.points * 0.4)
        },
      }),
    },
    cash: {
      label: 'Release it abroad',
      emoji: '\u{2708}\u{FE0F}',
      good: (_g, _s, d) => ({
        text: () => 'The film opens abroad only. Buzz and back-end shrank.',
        fx: { standing: repWorth(2) },
        then: (s) => {
          bumpRep(s, 2)
          const p = projectOf(s, str(d.id, 24))
          if (!p) return
          p.buzz = clamp(p.buzz - 25, 0, 100)
          p.terms.points = round4(p.terms.points * 0.6)
        },
      }),
    },
  },
}

type InjuryData = { id: string; title: string; fee: number; hurt: number }

const injury: Def<InjuryData> = {
  id: 'injury',
  title: 'The Stunt',
  emoji: '\u{1F915}',
  cool: 4,
  weight: (_g, s) => (stuntFilm(s) ? 1 : 0),
  make: (_g, s, r) => {
    const p = stuntFilm(s)
    return { id: p?.id ?? '', title: p?.title ?? '', fee: p?.terms.fee ?? 0, hurt: r.int(10, 25) }
  },
  scene: (_g, _s, d) => `A stunt on "${str(d.title, 48)}" is dangerous. The director asks if you'll do it yourself. What will you do?`,
  options: {
    safe: {
      label: 'Use a double',
      emoji: '\u{1F9CD}',
      good: (_g, _s, d) => ({
        text: (r) => `A double took the fall for ${money(r.paid)}. The shot lost a little punch.`,
        fx: { money: -Math.round(0.01 * fin(d.fee)) },
        then: (s) => {
          const p = projectOf(s, str(d.id, 24))
          if (p) hitQuality(p, -3)
        },
      }),
    },
    bold: {
      label: 'Do it yourself',
      emoji: '\u{1F9D7}',
      odds: (g) => 0.4 + fin(g.character.hidden.athleticism) / 250,
      good: (_g, _s, d) => ({
        text: () => 'You did the stunt yourself and nailed it. The crew cheered and buzz spread.',
        fx: { happiness: 4 },
        then: (s) => {
          const p = projectOf(s, str(d.id, 24))
          if (p) p.buzz = clamp(p.buzz + 8, 0, 100)
        },
      }),
      bad: (_g, _s, d) => ({
        text: () => 'You got hurt on the stunt. The film lost some polish too.',
        fx: { health: -clamp(Math.round(fin(d.hurt, 10)), 10, 25) },
        then: (s) => {
          const p = projectOf(s, str(d.id, 24))
          if (p) hitQuality(p, -5)
        },
      }),
    },
  },
}

/** An action or genre project in production, where a stunt can go wrong. */
function stuntFilm(s: ActorState): Proj | undefined {
  return inFlight(s).find((p) => p.type === 'action' || p.type === 'genre')
}

/** The rival you are feuding with: a grudge of 30 or a second loss, the angriest first, then the most losses. */
function feudRow(s: ActorState): { id: string; name: string } | null {
  const rows = s.memory.filter((m) => m.grudge >= 30 || m.lost >= 2).sort((a, b) => b.grudge - a.grudge || b.lost - a.lost || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return rows[0] ? { id: rows[0].id, name: rows[0].name } : null
}

const rivalFeud: Def<RivalData> = {
  id: 'rivalFeud',
  title: 'The Feud',
  emoji: '\u{1F4A2}',
  cool: 5,
  weight: (_g, s) => (feudRow(s) ? 2 : 0),
  make: (_g, s) => {
    const row = feudRow(s)
    return { rid: row?.id ?? '', rname: row?.name ?? '' }
  },
  scene: (_g, _s, d) => `${str(d.rname, 40) || 'A rival'} keeps landing your parts and the trade papers noticed. Reporters want a word. What will you do?`,
  options: (() => {
    const who = (d: RivalData): { id: string; name: string } => ({ id: str(d.rid, 40), name: str(d.rname, 40) || 'A rival' })
    const grudge = (d: RivalData, by: number) => {
      const w = who(d)
      return w.id ? { grudge: { id: w.id, name: w.name, by } } : {}
    }
    return {
      safe: {
        label: 'Ignore the rivalry',
        emoji: '\u{1F910}',
        good: (_g, _s, d) => ({ text: () => `You ignored ${who(d).name}. The rivalry cooled a little.`, fx: grudge(d, -5) }),
      },
      bold: {
        label: 'Trade barbs',
        emoji: '\u{1F5E3}\u{FE0F}',
        good: (_g, _s, d) => ({
          text: () => `You traded barbs with ${who(d).name}. Buzz rose, and so did the grudge.`,
          fx: grudge(d, 20),
          then: (s, g) => {
            bumpBuzz(s, 6)
            addHidden(g, 'notoriety', 2)
          },
        }),
      },
      cash: {
        label: 'Offer a joint project',
        emoji: '\u{1F91D}',
        odds: (_g, s) => 0.5 + s.rep / 300,
        good: (_g, _s, d) => ({ text: () => `${who(d).name} agreed to a joint project. The feud eased.`, fx: grudge(d, -25), then: (s) => bumpBuzz(s, 5) }),
        bad: (_g, _s, d) => ({ text: () => `${who(d).name} turned you down. The grudge grew.`, fx: grudge(d, 5) }),
      },
    }
  })(),
}

/** Every def, in the order the plan lists them. Each is one script, `career.actor.<id>`. */
export const ACTOR_DEFS: readonly CrisisDef<ActorState, any>[] = [redScare, soundShift, guildStrike, techShift, scandalLeak, poach, franchise, shelved, censor, injury, rivalFeud]

export const actorCrises: CrisisSet<ActorState> = defineCrises({ career: 'actor', store: actorStore, talent: 'Acting', defs: ACTOR_DEFS })

// ---------------------------------------------------------------------------
// Levers: scandal, range and press
//
// The once-a-year limits live in these functions (not in a gatedAction `once`), so a menu row and a direct
// call agree. Every price is paid with `c.pay` after the gates pass, and a refusal changes nothing.

const KEY_APOLOGIZE = 'actor.apologize'
const KEY_PR = 'actor.crisisPr'
const KEY_LAY_LOW = 'actor.layLow'
const KEY_RANGE = 'actor.range'

const refuse = (c: CareerCtx<ActorState>, title: string, text: string, emoji = FILM): void => void careerSay(c, title, text, emoji)

/** An outlay: c.pay, and the totals keep what you spent. False when short (nothing moves). */
function outlay(c: CareerCtx<ActorState>, label: string, amount: number): boolean {
  const n = Math.round(fin(amount))
  if (n < 1) return true
  if (!c.pay(label, n)) return false
  c.s.totals.spent = Math.min(1e13, c.s.totals.spent + n)
  return true
}

/** Free, once a year, needs a scandal: scandal -25, fame -1. */
export function apologize(c: CareerCtx<ActorState>): void {
  const { g, s } = c
  const why = blocked(g)
  if (why) return refuse(c, 'Apologize', why)
  if (s.scandal <= 0) return refuse(c, 'Apologize', "There's nothing to apologize for.")
  if (!useYearAction(g, KEY_APOLOGIZE, 1)) return refuse(c, 'Apologize', "You've already apologized this year.")
  s.scandal = clamp100(s.scandal - 25)
  addFame(g, -1)
  careerLog(c, 'I apologized in public.')
  careerSay(c, 'Apologize', 'You apologized in public. The story lost some heat.', '\u{1F64F}', 'good')
}

/** 10% of last year's net (at least 1,000 x scale), once a year: scandal -40, notoriety -3. */
export function crisisPr(c: CareerCtx<ActorState>): void {
  const { g, s } = c
  const why = blocked(g)
  if (why) return refuse(c, 'Crisis PR', why, PRESS)
  if (s.scandal <= 0) return refuse(c, 'Crisis PR', 'There is no scandal to repair.', PRESS)
  if (yearActionsUsed(g, KEY_PR) >= 1) return refuse(c, 'Crisis PR', 'The crisis team already worked on this one.', PRESS)
  if (!outlay(c, 'Crisis PR', priceOf(g, s, 0.1, 1_000))) return refuse(c, 'Crisis PR', "You can't afford a crisis team right now.", PRESS)
  useYearAction(g, KEY_PR, 1)
  s.scandal = clamp100(s.scandal - 40)
  addHidden(g, 'notoriety', -3)
  careerLog(c, 'I hired a crisis team to clean up my image.')
  careerSay(c, 'Crisis PR', 'The crisis team buried the story. Your name is clean again.', PRESS, 'good')
}

/** Once a year, needs a scandal: no auditions this year, scandal -30. */
export function layLow(c: CareerCtx<ActorState>): void {
  const { g, s } = c
  const why = blocked(g)
  if (why) return refuse(c, 'Lie Low', why)
  if (s.scandal <= 0) return refuse(c, 'Lie Low', 'You have nothing to hide from.')
  if (yearActionsUsed(g, KEY_LAY_LOW) >= 1 || (s.layLow > 0 && s.layLow >= g.year)) return refuse(c, 'Lie Low', "You're already laying low this year.")
  useYearAction(g, KEY_LAY_LOW, 1)
  s.layLow = Math.max(s.layLow, g.year)
  s.scandal = clamp100(s.scandal - 30)
  careerLog(c, 'I kept out of sight for a while.')
  careerSay(c, 'Lie Low', 'You kept out of sight. There will be no auditions this year, and the story is fading.', '\u{1F576}\u{FE0F}', 'good')
}

/** Manager only, a type you are typecast in, 8% of last year's net (at least 1,500 x scale), once a year: that type -15. */
export function rangeWork(c: CareerCtx<ActorState>, type: TypeId): void {
  const { g, s } = c
  const why = blocked(g, 16)
  if (why) return refuse(c, 'Range Work', why)
  if (!s.team.manager) return refuse(c, 'Range Work', 'Range work needs a manager to set it up.')
  if (!(TYPE_IDS as readonly string[]).includes(type) || s.type[type] <= 0) return refuse(c, 'Range Work', "You aren't typecast in that type.")
  if (yearActionsUsed(g, KEY_RANGE) >= 1) return refuse(c, 'Range Work', "You've already worked on your range this year.")
  if (!outlay(c, 'Range work', priceOf(g, s, 0.08, 1_500))) return refuse(c, 'Range Work', "You can't afford the coaching right now.")
  adoptLegacy(g, s)
  useYearAction(g, KEY_RANGE, 1)
  s.type[type] = clamp(s.type[type] - 15, 0, 100)
  careerLog(c, 'I took work against my type.')
  careerSay(c, 'Range Work', `Your manager booked work against type. The ${type} label is peeling off.`, FILM, 'good')
}

const PRESS_FIRMS = ['Ink & Co', 'Bright Lights PR', 'Kestrel Public Relations', 'Harbor Street Media', 'Larkspur Communications']

/** What the press agent costs a year: max(1,000 x scale, 5% of last year's net). */
const retainerOf = (g: GameState, s: ActorState): number => priceOf(g, s, 0.05, 1_000)

/** Hires a press agent (quality 30 to 90, the same each year for one family) and pays the first year up front. */
export function hirePress(c: CareerCtx<ActorState>): void {
  const { g, s } = c
  const why = blocked(g, 16)
  if (why) return refuse(c, 'Press Agent', why, PRESS)
  if (s.team.press) return refuse(c, 'Press Agent', 'You already have a press agent.', PRESS)
  if (!outlay(c, 'Press retainer', retainerOf(g, s))) return refuse(c, 'Press Agent', "You can't afford the retainer right now.", PRESS)
  adoptLegacy(g, s)
  const r = seeded(`${familySeed(g)}|press|actor|${g.year}${outcomeTag(g, g.year)}`)
  s.team.press = { firm: r.pick(PRESS_FIRMS), quality: r.int(30, 90), since: g.year }
  careerLog(c, `I hired ${s.team.press.firm} as my press agent.`, 'good')
  careerSay(c, 'Press Agent', `${s.team.press.firm} will handle your press. They bill a retainer every year.`, PRESS, 'good')
}

/** Lets the press agent go. Nothing is owed. */
export function firePress(c: CareerCtx<ActorState>): void {
  const { s } = c
  const press = s.team.press
  if (!press) return refuse(c, 'Press Agent', "You don't have a press agent.", PRESS)
  s.team.press = null
  careerLog(c, `I let ${press.firm} go.`)
  careerSay(c, 'Press Agent', `You let ${press.firm} go. They sent no bill.`, PRESS)
}

/** True when the project goes out in this tick's wrap: a shoot that isn't a studio film, or a film already in post. */
function releasesNow(p: Proj, year: number): boolean {
  if (p.lastYear >= year || p.role === 'Extra') return false
  if (p.stage === 'post') return true
  if (p.stage !== 'shoot' && p.stage !== 'offer') return false
  return !(p.kind === 'film' && (p.budget === 'studio' || p.budget === 'blockbuster'))
}

/**
 * The yearly retainer and the press agent's work. A press agent hired this year was paid at hire; later years
 * are billed here, and one you can't pay leaves with no debt. Each release this tick gets buzz of quality / 10
 * (at most 9, and a project releases once). The sim runs this before the wrap.
 */
export function stepPress(c: CareerCtx<ActorState>): void {
  const { g, s } = c
  const press = s.team.press
  if (!press) return
  if (press.since < g.year && !outlay(c, 'Press retainer', retainerOf(g, s))) {
    s.team.press = null
    careerLog(c, `${press.firm} left when I fell behind on the retainer.`, 'bad')
    careerSay(c, 'Press Agent', `${press.firm} left. You couldn't cover the retainer.`, PRESS, 'bad')
    return
  }
  const buzz = Math.round(press.quality / 10)
  for (const p of s.pipeline) if (releasesNow(p, g.year)) p.buzz = clamp(p.buzz + buzz, 0, 100)
}
