// ci: fast
// R4-E4 (X2, X30): the scripted lives, recorded on the unmodified tree with the social parity kit (test/social-parity-kit.ts).
// The area oracles (relationships, love, wealth, will, nepo, heirs) pin one system at a time. A life is where they meet: a year of
// aging runs the relationship drift, the partner's moods, the family business, the wealth asks, the will's feuds and the quiet
// close, in the order the modules say, on the dice the earlier years left. If R4's shim, its Edge mirror or the social flag moves
// one point or one draw anywhere, a life shows it a few years later in a place nobody was looking. Three lives:
//
//   cradle    a child born in 1990 and played to 25: school friends and rivals, the parents who age, the siblings.
//   firm      a founder of 45 with a restaurant chain, a husband or wife and three kids who grow into the business; the player's
//             death would hand the company to a child.
//   dynasty   a widowed grandparent of 76 with children, grandchildren, a will that cut a child out and eight million; the
//             player dies in the course of it, the eldest living child takes over (continueAsChild) and the life goes on.
//
// play-kit.ts answers popups and never opens a menu (the notice probe wants that), so each year here is: age up, record the popups
// the year queued (their kinds and script ids, no text), answer them, run the year's scripted menu actions (hug, spend time,
// conversation, compliment, and now and then a squabble or an insult) on the people the plan names, answer what those queued,
// and record the year again. A row holds every person's relationship, g.rng, g.nextId, the player's cash (the kit's columns) and
// the year's actions. An action that is not there or not open is recorded as such (`:0`), so a path a change closes is a moved row.
// The fast tier plays 25 years of each (about 7 s); SOCIAL_DEEP=1 plays 60 years and compares against test/fixtures/
// social-parity-lives-deep.json (the nightly sets it).
import { describe, expect, it } from 'vitest'
import { ageUp } from '../src/game/aging'
import { hireRelative, promote, setPay, designateSuccessor, fire } from '../src/game/business/nepo-actions'
import { readJob } from '../src/game/business/nepo-job'
import { employeesOf, hireBlock } from '../src/game/business/nepo-state'
import { bizOf, findBusiness } from '../src/game/business/state'
import { changeWill, removeHeir } from '../src/game/events/will-act'
import { updateWl } from '../src/game/events/will-core'
import { continueAsChild, createNewLife } from '../src/game/life'
// Script handlers register as an import side effect: a life played here must load the menus, as play-kit.ts does.
import '../src/game/menus'
import { createPerson } from '../src/game/people'
import { personActions } from '../src/game/relationships'
import type { GameState, MenuAction, Person } from '../src/game/types'
import { drain, kid, world } from './nepo-kit'
import { GAME_SLOT, expectRows, isRecording, oracle, recordRows, snapshot, type ParityRow, type Tuple } from './social-parity-kit'

const FAST = oracle('lives')
const DEEP = oracle('lives-deep')

/**
 * [seed, year]: the dice and the year the life starts (the birth year of the cradle, the calendar year of the others). Searched once
 * at record time, constant after (X30). The cradle is seed 17 of 1 to 24: it lives to 60 (the deep plan needs a long life) with eight
 * people around at the end and 359 scripted actions that ran. The firm is the first of 144, 133, 101, 73, 150, 160, 170 and 180 that
 * hires all three children and runs the hire, the promotion, the heir and the raise (170). The dynasty is a life whose player dies in
 * the first third and whose heir plays on (21).
 */
const CRADLE: Tuple = [17, 1990]
const FIRM: Tuple = [170, 2026]
const DYNASTY: Tuple = [21, 2026]

function track(g: GameState): GameState {
  ;(globalThis as Record<string, unknown>)[GAME_SLOT] = g
  return g
}

// ---------------------------------------------------------------------------------------------------------------------
// The year

interface Life {
  name: string
  g: GameState
  rows: ParityRow[]
  /** Years played so far. */
  i: number
  /** Which popup answer comes next: the answers rotate, so a life makes a mix of choices without a dice of its own. */
  turn: number
  /** Runs after the popups, before the actions: the life's own business (hiring, promoting, a will). */
  business?(life: Life): string[]
  /** The company of the firm (its asset id), when there is one. */
  firm?: string
}

const answers = (life: Life) => (m: { choices: { id: string }[] }): string => m.choices[life.turn++ % m.choices.length]!.id

/** A menu action by id when it is there and open. */
function tryAct(g: GameState, p: Person, id: string): boolean {
  const a = personActions(g, p).find((x): x is MenuAction => x.type === 'action' && x.id === id)
  if (a === undefined || (a.visible !== undefined && !a.visible(g)) || a.disabledReason?.(g)) return false
  a.run(g)
  return true
}

const NICE = ['hug', 'spendTime', 'conversation', 'compliment'] as const
const SPAT = ['squabble', 'argue', 'insult'] as const

/** The relatives the plan talks to, in the order of g.people. */
const KIN = ['parent', 'stepparent', 'grandparent', 'sibling', 'halfSibling', 'child', 'stepchild', 'grandchild', 'spouse', 'partner', 'fiance', 'friend', 'bestFriend', 'pet'] as const

/** The year's family time: up to three people, each with a rotation of the nice actions, and a spat every fourth year. */
function family(life: Life): string[] {
  const { g, i } = life
  const acts: string[] = []
  if (!g.character.alive || g.character.age < 3) return acts
  const near = g.people.filter((p) => p.alive && (KIN as readonly string[]).includes(p.relation) && p.age >= 2)
  const picks = [0, 1, 2].map((k) => near[(i * 2 + k * 3) % Math.max(1, near.length)]).filter((p): p is Person => p !== undefined)
  const seen = new Set<string>()
  picks.forEach((p, k) => {
    if (seen.has(p.id)) return
    seen.add(p.id)
    const ids = p.relation === 'pet' ? ['play'] : [NICE[(i + k) % NICE.length]!, NICE[(i + k + 1) % NICE.length]!, i % 4 === 3 ? SPAT[(Math.floor(i / 4) + k) % SPAT.length]! : 'hug']
    for (const id of ids) acts.push(`${id}:${p.relation}:${p.id}:${tryAct(g, p, id) ? 1 : 0}`)
  })
  return acts
}

/** Hand the life to a living child when the player has died. Returns false when nobody can carry on. */
function succeed(life: Life): boolean {
  const heirs = life.g.people.filter((p) => p.alive && (p.relation === 'child' || p.relation === 'stepchild')).sort((x, y) => y.age - x.age || x.id.localeCompare(y.id))
  const heir = heirs[0]
  if (heir === undefined) return false
  const next = continueAsChild(life.g, heir.id)
  if (next === life.g) return false
  life.g = track(next)
  return true
}

/** One year: age up, record the popups, answer them, the business, the family time, answer what that queued, record. False when the life is over. */
function year(life: Life): boolean {
  if (!life.g.character.alive && !succeed(life)) return false
  const g = life.g
  ageUp(g)
  const c = g.character
  life.rows.push(snapshot(`${life.name}|${String(life.i).padStart(2, '0')}|up`, g, () => ({ age: c.age, year: g.year, alive: c.alive, gen: g.generation })))
  drain(g, answers(life))
  const acts = c.alive ? [...(life.business?.(life) ?? []), ...family(life)] : []
  drain(g, answers(life))
  life.rows.push(snapshot(`${life.name}|${String(life.i).padStart(2, '0')}|acts`, g, () => ({ acts, people: g.people.length, alive: g.people.filter((p) => p.alive).length, gen: g.generation })))
  life.i += 1
  return true
}

function playYears(life: Life, years: number): ParityRow[] {
  for (let k = 0; k < years; k++) if (!year(life)) break
  return life.rows
}

// ---------------------------------------------------------------------------------------------------------------------
// The lives

function cradle(years: number): ParityRow[] {
  const [seed, birth] = CRADLE
  const g = track(createNewLife({ seed, year: birth, countryId: 'us' }))
  return playYears({ name: 'cradle', g, rows: [], i: 0, turn: 0 }, years)
}

function firm(years: number): ParityRow[] {
  const [seed] = FIRM
  const w = world(seed, { age: 45 })
  const { g, a } = w
  track(g)
  kid(g, 16, { smarts: 70, traits: ['ambitious', 'serious'] })
  kid(g, 12, { smarts: 50, traits: ['funny', 'kind'] })
  kid(g, 8, { smarts: 35, traits: ['lazy', 'calm'], entitlement: 40 })
  kid(g, 43, { smarts: 62, traits: ['kind', 'loyal'], relation: 'spouse', gender: 'female' })
  const life: Life = {
    name: 'firm',
    g,
    rows: [],
    i: 0,
    turn: 0,
    firm: a.id,
    business(l) {
      const acts: string[] = []
      const asset = findBusiness(l.g, l.firm)
      if (!asset) return acts
      const b = bizOf(l.g, asset)
      // Every adult child gets a job at the bottom the year they can have one; every sixth year the best is promoted, the tenth names an heir,
      // the fourteenth a raise, the eighteenth lets the weakest go.
      for (const p of l.g.people) {
        if (p.alive && p.relation === 'child' && p.age >= 18 && !readJob(p) && hireBlock(l.g, b, p) === null) acts.push(`hire:${p.id}:${hireRelative(l.g, asset, b, p, { rank: 1 }, { quiet: true }).ok ? 1 : 0}`)
      }
      const staff = employeesOf(l.g, asset.id)
      const best = [...staff].sort((x, y) => y.job.skill - x.job.skill || x.p.id.localeCompare(y.p.id))[0]
      const worst = [...staff].sort((x, y) => x.job.perf - y.job.perf || x.p.id.localeCompare(y.p.id))[0]
      if (best && l.i % 6 === 5) acts.push(`promote:${best.p.id}:${promote(l.g, asset, b, best.p).ok ? 1 : 0}`)
      if (best && l.i === 9) acts.push(`heir:${best.p.id}:${designateSuccessor(l.g, asset, b, best.p).ok ? 1 : 0}`)
      if (best && l.i === 13) acts.push(`raise:${best.p.id}:${setPay(l.g, asset, b, best.p, 1.4).ok ? 1 : 0}`)
      if (worst && staff.length > 1 && l.i === 17) acts.push(`fire:${worst.p.id}:${fire(l.g, asset, b, worst.p).ok ? 1 : 0}`)
      return acts
    },
  }
  return playYears(life, years)
}

function dynasty(years: number): ParityRow[] {
  const [seed] = DYNASTY
  const g = createNewLife({ seed, year: 1950, countryId: 'us' })
  g.queue = []
  g.year = 2026
  const c = g.character
  c.age = 76
  c.money = 8_000_000
  g.people = []
  const mk = (relation: Person['relation'], age: number, over: Partial<Parameters<typeof createPerson>[1]> = {}): Person =>
    createPerson(g, { relation, age, lastName: c.lastName, countryId: 'us', money: 20_000, ...over })
  const spouse = mk('spouse', 74, { relationship: 80, traits: ['calm', 'loyal'], livesWithPlayer: true })
  const eldest = mk('child', 51, { relationship: 75, traits: ['kind', 'calm'], otherParentId: spouse.id })
  const middle = mk('child', 48, { relationship: 62, traits: ['hot-headed', 'jealous'], otherParentId: spouse.id })
  const youngest = mk('child', 44, { relationship: 55, traits: ['funny', 'outgoing'], otherParentId: spouse.id })
  mk('grandchild', 22, { relationship: 70, data: { parentId: eldest.id } })
  mk('grandchild', 17, { relationship: 66, data: { parentId: eldest.id } })
  mk('grandchild', 12, { relationship: 74, data: { parentId: middle.id } })
  mk('grandchild', 6, { relationship: 80, data: { parentId: youngest.id } })
  mk('sibling', 72, { relationship: 58 })
  mk('friend', 77, { relationship: 85 })
  mk('pet', 7, { species: 'Dog', firstName: 'Rex', relationship: 90 })
  track(g)
  // The will leaves the middle child out; she knows, and she is angry.
  changeWill(g, (gg, w) => removeHeir(gg, w, middle))
  g.queue = []
  updateWl(g, middle, (w) => {
    w.known = true
    w.how = 'leak'
    w.told = 'out'
    w.anger = 60
  })
  g.yearActions = {}
  return playYears({ name: 'dynasty', g, rows: [], i: 0, turn: 0 }, years)
}

const LIVES = { cradle, firm, dynasty } as const

function playAll(years: number): ParityRow[] {
  return [...cradle(years), ...firm(years), ...dynasty(years)]
}

// ---------------------------------------------------------------------------------------------------------------------

let fast: ParityRow[] | null = null
const fastOnce = (): ParityRow[] => (fast ??= playAll(25))

describe('the scripted lives', () => {
  it('the rows are the recorded ones: 3 lives of 25 years', { timeout: 120_000 }, () => {
    const rows = fastOnce()
    if (isRecording(FAST.area)) recordRows(FAST, rows)
    else expectRows(FAST, rows)
  })

  it('plays the same rows twice', { timeout: 120_000 }, () => {
    expect(JSON.stringify(playAll(25))).toBe(JSON.stringify(fastOnce()))
  })

  it('plays whole lives, and the actions it scripts happen', () => {
    const rows = fastOnce()
    for (const name of Object.keys(LIVES)) {
      const mine = rows.filter((r) => r.label.startsWith(`${name}|`))
      expect(mine.filter((r) => r.label.endsWith('|up')).length, `${name} must play its years`).toBeGreaterThanOrEqual(name === 'cradle' ? 24 : 20)
      const ran = mine.flatMap((r) => ((r.x?.acts as string[] | undefined) ?? []).filter((a) => a.endsWith(':1')))
      expect(ran.length, `${name}: the scripted actions must run (a closed path must fail loudly)`).toBeGreaterThanOrEqual(30)
    }
    // The dynasty: the player dies and a child carries on.
    const gens = rows.filter((r) => r.label.startsWith('dynasty|') && r.label.endsWith('|acts')).map((r) => r.x?.gen as number)
    expect(Math.max(...gens)).toBeGreaterThanOrEqual(2)
    // The firm: a child is hired and the company runs through the years.
    expect(rows.some((r) => r.label.startsWith('firm|') && ((r.x?.acts as string[] | undefined) ?? []).some((a) => a.startsWith('hire:') && a.endsWith(':1')))).toBe(true)
  })
})

describe.skipIf(process.env.SOCIAL_DEEP !== '1')('the scripted lives, the deep plan (SOCIAL_DEEP=1): 3 lives of 60 years', () => {
  it('the rows are the recorded ones', { timeout: 540_000 }, () => {
    const rows = playAll(60)
    if (isRecording(DEEP.area)) recordRows(DEEP, rows)
    else expectRows(DEEP, rows)
  })
})
