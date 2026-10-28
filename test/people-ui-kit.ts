// R4-U1 (People UI and fog track): the Exact oracle kit. "Exact is today" is only provable if what the player reads in Exact mode is
// written down before any screen changes. This kit builds that text on the unmodified v5.2.0 code: fourteen people and what the
// person sheet and its action rows say about them at three relationship levels, six hired key staff and the shortlist popups,
// the CEO shortlists, rows, notice and letter, the conglomerate rows, and the People cockpit, badges and Needs You rows.
// test/fixtures/people-ui-exact.json holds the rows (RECORD_PEOPLE_UI=1, under Node 22, with a reason);
// test/people-ui-golden.test.ts compares today's code with it. Every later task of the track proves its Exact output (and its
// flag-off Realistic output where it has one) equal to these rows. It is never re-recorded to make a task pass.
//
//   buildRows()         every row, in file order: [key, text]; each is built twice and the two must agree
//   buildGroup(group)   the rows of one of ROW_GROUPS (details, actions, staff, hire, ceo, cockpit); a later task builds a group inside
//                       its own wrapper (withFlags, inFog) and compares it with the file through diffRows
//   diffRows(a, b)      what differs between two row lists, as short lines (the first of each kind)
//   recordPeopleUi(f)   the recorder: refuses without RECORD_PEOPLE_UI=1, a reason that checkReason accepts and Node 22
//
// Which rows read the mode. At v5.2.0 the details, actions, staff and cockpit groups print the same text in Realistic as in Exact (R3
// fogged neither the person sheet nor the staff sheet), so a flag-off Realistic life must equal the file there. The hire group is the
// R3 shortlist (ranges, a check choice) and differs in Realistic; the ceo group differs there only in the Business talent's hints.
//
// How the states are built. Every game is makeTestGame plus createPerson with every field given, so a person is created without a
// single draw, and no state depends on createNewLife: a later change to the birth family (the stamped lives of E16) cannot move a row.
// The shortlist popups do draw (names, skills, pay), so g.rng is set to a constant right before each one opens; nothing else draws.
// A menu or view is built twice on one deep-frozen copy (a write or a g.rng draw throws, and the two texts must be equal); a flow that
// writes (a popup opening, a hire) runs twice on fresh copies of the state and the two results must be equal.
//
// Text. A U+2014 or U+2013 is stored as a hyphen (plain below): npc-lives.ts prints three of them today and R4-U5 turns them into
// hyphens in both modes, so the oracle must not tell the two apart, and no file of this task holds the characters.
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { businessAssetView } from '../src/game/business'
import { smartManagerTurn } from '../src/game/business/board-ceo'
import { boardOf } from '../src/game/business/board-state'
import { askingSalary, becomeCeo, installManager, stepDown } from '../src/game/business/career'
import { formGroup } from '../src/game/business/conglomerate-actions'
import { groupView } from '../src/game/business/conglomerate-menu'
import { groupsOf, liveGroup, saveGroup } from '../src/game/business/conglomerate-state'
import { bestPlan } from '../src/game/business/economy'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { industryDef } from '../src/game/business/industries'
import { infoRows } from '../src/game/business/manage'
import { staffMenu } from '../src/game/business/staff'
import { candidateLabel, candidateLine, candidateRead, hireFooter } from '../src/game/business/staff-fog'
import { bizOf, readBiz, type KeyStaff } from '../src/game/business/state'
import type { Industry } from '../src/game/data/markets'
import { cockpitOf, type CockpitModel } from '../src/game/hubs/cockpit'
import { needsYou } from '../src/game/hubs/needs'
import { peopleMenu, personGroup } from '../src/game/hubs/people'
import { createPerson, type PersonOptions } from '../src/game/people'
import { personActions } from '../src/game/relationships'
import { runScript } from '../src/game/scripts'
import type { Asset, ChoiceModal, GameState, MenuAction, MenuGroup, MenuNode, ModalItem, Person } from '../src/game/types'
import { groupChildren, groupHeader, nodeDisabled, nodeSubtitle, nodeVisible } from '../src/ui/components/menuModel'
import { PersonDetails } from '../src/ui/components/PersonSheet'
import { makeTestGame } from './helpers'
import { deepFreeze } from './knowledge-kit'
import { allNodes } from './market-kit'

// ---------------------------------------------------------------------------------------------------------------------
// The file and the recorder

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
export const FIXTURE_FILE = 'test/fixtures/people-ui-exact.json'
export const RECORD_COMMAND = 'RECORD_PEOPLE_UI=1 RECORD_REASON="<why>" /Users/saeed/projects/anotherlife/wt/bin/vt22 test/people-ui-golden.test.ts'

/** One recorded fact: where it came from, and the text a player (or a test) reads. */
export type Row = readonly [key: string, text: string]

const LONG_DASHES = new RegExp(`[${String.fromCharCode(0x2014, 0x2013)}]`, 'g')

/** The text with every em dash and en dash written as a hyphen. */
export function plain(text: string): string {
  return text.replace(LONG_DASHES, '-')
}

/** The relationship levels each person is read at: drifting, middling, close. */
export const LEVELS = [20, 50, 90] as const

// ---------------------------------------------------------------------------------------------------------------------
// Purity: build twice

/** `fn` run twice on one deep-frozen copy of `g`: a write throws, and the two answers must be the same text. */
function pure(label: string, g: GameState, fn: (frozen: GameState) => string): string {
  const frozen = deepFreeze(structuredClone(g))
  const a = plain(fn(frozen))
  const b = plain(fn(frozen))
  if (a !== b) throw new Error(`${label}: built twice on a frozen copy it gave two different texts`)
  return a
}

/** `fn` run on two fresh copies of `g` (it may write: a popup opens, a hire is made); the two answers must be the same text. */
function fresh(label: string, g: GameState, fn: (copy: GameState) => string): string {
  const a = plain(fn(structuredClone(g)))
  const b = plain(fn(structuredClone(g)))
  if (a !== b) throw new Error(`${label}: run twice on fresh copies it gave two different texts`)
  return a
}

// ---------------------------------------------------------------------------------------------------------------------
// The fourteen people

export const KIT_KEYS = ['parent', 'sibling', 'child', 'spouse', 'partner', 'friend', 'coworker', 'boss', 'ex', 'enemy', 'pet', 'deadParent', 'npcLife', 'dataStats'] as const
export type KitKey = (typeof KIT_KEYS)[number]

/** Persons that are alive and not pets: the twelve whose badge and Needs You row the cockpit reads. */
export const LIVING_KEYS: readonly KitKey[] = KIT_KEYS.filter((k) => k !== 'pet' && k !== 'deadParent')

const stat = (happiness: number, health: number, smarts: number, looks: number) => ({ happiness, health, smarts, looks })

/** The fifteen extra stats the sheet draws as bars (PersonSheet.tsx DATA_STATS), all given. */
const DATA_STATS = { generosity: 64, religiousness: 12, kindness: 80, professionalism: 55, strictness: 20, popularity: 71, craziness: 33, willpower: 47, petulance: 28, diligence: 69, loyalty: 90, obedience: 41, entitlement: 15, respect: 76, toughness: 38 }

interface Spec {
  key: KitKey
  opts: Omit<PersonOptions, 'relationship'>
  /** Fields createPerson does not take. */
  after?: (p: Person) => void
}

/** What a person is: every field createPerson reads is given, so creating one draws nothing. The spouse comes before the child it parents. */
const SPECS: readonly Spec[] = [
  { key: 'parent', opts: { relation: 'parent', age: 62, gender: 'female', firstName: 'Anna', lastName: 'Reed', occupation: 'Nurse', money: 85_000, traits: ['kind', 'proud'], stats: stat(71, 64, 58, 66) }, after: (p) => { p.yearsKnown = 40 } },
  { key: 'sibling', opts: { relation: 'sibling', age: 38, gender: 'male', firstName: 'Marcus', lastName: 'Reed', occupation: 'Plumber', money: 31_000, traits: ['funny', 'lazy'], stats: stat(55, 80, 49, 61) }, after: (p) => { p.yearsKnown = 38 } },
  { key: 'spouse', opts: { relation: 'spouse', age: 39, gender: 'female', firstName: 'Maya', lastName: 'Chen', occupation: 'Architect', money: 120_000, traits: ['ambitious', 'loyal'], stats: stat(82, 91, 88, 77), livesWithPlayer: true, data: { marriedAge: 31 } }, after: (p) => { p.yearsKnown = 9; p.pregnant = true } },
  { key: 'child', opts: { relation: 'child', age: 12, gender: 'female', firstName: 'Lily', lastName: 'Player', occupation: 'Student', money: 40, traits: ['curious', 'shy'], stats: stat(90, 95, 72, 80), livesWithPlayer: true, biological: true, data: { entitlement: 62 } }, after: (p) => { p.yearsKnown = 12 } },
  { key: 'partner', opts: { relation: 'partner', age: 34, gender: 'male', firstName: 'Jordan', lastName: 'Pike', occupation: 'Chef', money: 22_000, traits: ['romantic', 'jealous'], stats: stat(68, 86, 63, 84), data: { datingSince: 38 } }, after: (p) => { p.yearsKnown = 2 } },
  { key: 'friend', opts: { relation: 'friend', age: 41, gender: 'male', firstName: 'Theo', lastName: 'Walsh', occupation: 'Teacher', money: 18_500, traits: ['funny', 'loyal'], stats: stat(60, 70, 67, 52), data: { metAt: 'college' } }, after: (p) => { p.yearsKnown = 15 } },
  { key: 'coworker', opts: { relation: 'coworker', age: 45, gender: 'female', firstName: 'Priya', lastName: 'Nair', occupation: 'Accountant', money: 54_000, traits: ['ambitious', 'proud'], stats: stat(58, 66, 74, 59) }, after: (p) => { p.yearsKnown = 3 } },
  { key: 'boss', opts: { relation: 'boss', age: 52, gender: 'male', firstName: 'Gordon', lastName: 'Hale', occupation: 'Manager', money: 140_000, traits: ['strict', 'ambitious'], stats: stat(49, 58, 69, 45) }, after: (p) => { p.yearsKnown = 3 } },
  { key: 'ex', opts: { relation: 'ex', age: 38, gender: 'female', firstName: 'Elena', lastName: 'Voss', occupation: 'Lawyer', money: 96_000, traits: ['proud', 'jealous'], stats: stat(44, 73, 85, 90) }, after: (p) => { p.yearsKnown = 6 } },
  { key: 'enemy', opts: { relation: 'enemy', age: 44, gender: 'male', firstName: 'Victor', lastName: 'Crane', occupation: 'Salesperson', money: 12_000, traits: ['hot-headed', 'greedy'], stats: stat(35, 55, 40, 38) }, after: (p) => { p.yearsKnown = 5 } },
  { key: 'pet', opts: { relation: 'pet', age: 4, gender: 'male', firstName: 'Biscuit', lastName: '', occupation: 'Pet', money: 0, traits: ['loyal'], stats: stat(88, 76, 40, 70), species: 'Dog', breed: 'Beagle', livesWithPlayer: true }, after: (p) => { p.yearsKnown = 4; p.data.craziness = 35 } },
  { key: 'deadParent', opts: { relation: 'parent', age: 71, gender: 'male', firstName: 'Walter', lastName: 'Reed', occupation: 'Retired', money: 0, traits: ['stern', 'honest'], stats: stat(0, 0, 60, 50), data: { diedAge: 33 } }, after: (p) => { p.alive = false; p.causeOfDeath = 'Heart Attack'; p.yearsKnown = 33 } },
  {
    key: 'npcLife',
    opts: {
      relation: 'sibling',
      age: 33,
      gender: 'female',
      firstName: 'Nina',
      lastName: 'Reed',
      occupation: 'Engineer',
      money: 64_000,
      traits: ['ambitious', 'curious'],
      stats: stat(66, 84, 92, 73),
      data: {
        talents: ['MainCharacter'],
        life: { v: 1, lastYear: 2025, country: 'us', field: 'Engineering', education: 2, study: 0, skill: 71.6, experience: 9, income: 98_000, debt: 20_000, investments: 45_000, housing: 240_000, ambition: 83.2, employer: 'Apex Labs', history: ['2023: promoted to lead'], achievements: ['BSc in Engineering'], housingQuality: 60, city: 'Chicago' },
      },
    },
    after: (p) => { p.yearsKnown = 33 },
  },
  { key: 'dataStats', opts: { relation: 'bestFriend', age: 36, gender: 'female', firstName: 'Zoe', lastName: 'Park', occupation: 'Designer', money: 47_000, traits: ['funny', 'kind'], stats: stat(75, 78, 81, 88), data: { ...DATA_STATS, metAt: 'a concert' } }, after: (p) => { p.yearsKnown = 11 } },
]

export interface Kit {
  g: GameState
  /** Person id by kit key. */
  ids: Record<KitKey, string>
}

/** The adult everything is read as: forty, with money, and no family but the fourteen below. */
export function adultGame(): GameState {
  const g = makeTestGame(7, { age: 40, money: 250_000 })
  g.character.talents = []
  return g
}

/** The fourteen people at one relationship level. Creating them draws nothing (every field is given), and the ids are p1 to p14 in SPECS order. */
export function buildKit(level: number, into: GameState = adultGame()): Kit {
  const g = into
  const rng = g.rng
  const ids = {} as Record<KitKey, string>
  for (const s of SPECS) {
    const p = createPerson(g, { ...s.opts, relationship: level, ...(s.key === 'child' ? { otherParentId: ids.spouse } : {}) })
    s.after?.(p)
    ids[s.key] = p.id
  }
  if (g.rng !== rng) throw new Error('people-ui-kit: creating the fourteen people drew from g.rng')
  return { g, ids }
}

const personOf = (k: Kit, key: KitKey, g: GameState = k.g): Person => {
  const p = g.people.find((x) => x.id === k.ids[key])
  if (!p) throw new Error(`people-ui-kit: no ${key}`)
  return p
}

/** Mark the player's feelings about their will: the person is estranged (cut contact over the will). */
export function estrange(g: GameState, p: Person): void {
  p.data.wl = { by: g.character.id, cut: true, cutY: 2021, known: true, how: 'external', knownY: 2022, anger: 70, estr: true, estrY: 2023 }
}

/** The person has been angry about the will since they found out, and is not estranged. */
export function angryAboutWill(g: GameState, p: Person): void {
  p.data.wl = { by: g.character.id, cut: true, cutY: 2024, known: true, how: 'external', knownY: 2025, anger: 42 }
}

/** The player lent them money. */
export function lend(g: GameState, p: Person, amount: number): void {
  p.data.w = { by: g.character.id, owes: amount, owesSince: 2023, given: amount, yes: 1, no: 0, asked: 2023, bound: 0, marks: {}, car: null, history: [{ y: 2023, what: 'a loan', ans: 'lend', amt: amount }] }
}

// ---------------------------------------------------------------------------------------------------------------------
// Group 1: the person sheet and its action rows

/** `renderToStaticMarkup` of PersonDetails for the fourteen at each level. */
function detailRows(): Row[] {
  const rows: Row[] = []
  for (const level of LEVELS) {
    const kit = buildKit(level)
    for (const key of KIT_KEYS) {
      rows.push([`details/${key}/${level}`, pure(`details/${key}/${level}`, kit.g, (g) => renderToStaticMarkup(createElement(PersonDetails, { g, person: personOf(kit, key, g) })))])
    }
  }
  return rows
}

const NODE_CAP = 160
const DEPTH_CAP = 3

/** One node as a line: its type, id and the text a player reads (label, subtitle, why it is greyed out, an info row's text). */
function lineOf(g: GameState, n: MenuNode): string {
  const hidden = nodeVisible(n, g) ? '' : ' [hidden]'
  if (n.type === 'heading') return `heading ${n.id}: ${n.label}${hidden}`
  if (n.type === 'info') return `info ${n.id}: ${typeof n.text === 'function' ? n.text(g) : n.text}${hidden}`
  const sub = nodeSubtitle(n, g)
  const why = nodeDisabled(n, g)
  return `${n.type} ${n.id}: ${n.label}${sub ? ` | ${sub}` : ''}${why ? ` | greyed: ${why}` : ''}${hidden}`
}

/** Every row of a list, groups opened to three levels deep, one line a row, children indented. */
export function linesOf(g: GameState, nodes: readonly MenuNode[], depth = 0, budget = { left: NODE_CAP }): string[] {
  const out: string[] = []
  for (const n of nodes) {
    if (budget.left <= 0) {
      out.push(`${'  '.repeat(depth)}... more rows`)
      break
    }
    budget.left -= 1
    out.push(`${'  '.repeat(depth)}${lineOf(g, n)}`)
    if (n.type === 'menu' && depth < DEPTH_CAP) {
      const head = groupHeader(n, g)
      if (head) out.push(`${'  '.repeat(depth + 1)}header: ${head.replace(/\n/g, ' / ')}`)
      out.push(...linesOf(g, groupChildren(n, g), depth + 1, budget))
    }
  }
  return out
}

/** The id, label, text, subtitle and greyed-out reason of every personActions row of the fourteen at each level. */
function actionRows(): Row[] {
  const rows: Row[] = []
  for (const level of LEVELS) {
    const kit = buildKit(level)
    if (level === 90) angryAboutWill(kit.g, personOf(kit, 'parent'))
    if (level === 50) lend(kit.g, personOf(kit, 'sibling'), 12_000)
    if (level === 20) estrange(kit.g, personOf(kit, 'child'))
    for (const key of KIT_KEYS) {
      rows.push([`actions/${key}/${level}`, pure(`actions/${key}/${level}`, kit.g, (g) => linesOf(g, personActions(g, personOf(kit, key, g))).join('\n'))])
    }
  }
  return rows
}

// ---------------------------------------------------------------------------------------------------------------------
// Companies

/** A company the player runs: a six-site business with 5 million in its till, and the Business talent when asked for. */
export function companyGame(industry: Industry, opts: { talent?: boolean } = {}): { g: GameState; a: Asset } {
  const g = makeTestGame(5, { age: 40, money: 5_000_000 })
  g.character.talents = opts.talent ? ['Business'] : []
  const b0 = newBiz(g, industry, 'us', 'Chicago', { cash: 5_000_000, quality: 70, brand: 40, founded: 2020, outlets: [{ countryId: 'us', city: 'Chicago', count: 6, opened: 2020 }] })
  const a = createBusinessAsset(g, 'Kit Co', b0, 100_000)
  g.assets.push(a)
  becomeCeo(g, a, b0)
  g.queue = []
  return { g, a }
}

/** g.rng before every popup that draws: the same shortlist whatever else the state did before. */
const SHORTLIST_RNG = 424_242
const MANAGER_RNG = 777
const LETTER_RNG = 31_337

const FOCUS_ROLE = (industry: Industry, focus: KeyStaff['focus']): string => {
  const role = industryDef(industry).roles.find((r) => r.focus === focus)
  if (!role) throw new Error(`people-ui-kit: ${industry} has no ${focus} role`)
  return role.title
}

export interface StaffSpec {
  co: 'rest' | 'fund'
  n: number
  first: string
  last: string
  gender: KeyStaff['gender']
  age: number
  focus: KeyStaff['focus']
  trait: string
  skill: number
  years: number
  morale: number
  salary: number
}

/** Six hired key staff: all four focuses, six traits, and the years 0, 1 and 5 twice each. */
const STAFF: readonly StaffSpec[] = [
  { co: 'rest', n: 1, first: 'Rosa', last: 'Diaz', gender: 'female', age: 44, focus: 'ops', trait: 'workaholic', skill: 72, years: 0, morale: 70, salary: 70_000 },
  { co: 'rest', n: 2, first: 'Ben', last: 'Okafor', gender: 'male', age: 36, focus: 'sales', trait: 'charmer', skill: 55, years: 1, morale: 64, salary: 52_000 },
  { co: 'rest', n: 3, first: 'Lucia', last: 'Marino', gender: 'female', age: 51, focus: 'quality', trait: 'steady', skill: 88, years: 5, morale: 81, salary: 66_000 },
  { co: 'rest', n: 4, first: 'Hal', last: 'Brandt', gender: 'male', age: 58, focus: 'finance', trait: 'lazy', skill: 31, years: 1, morale: 45, salary: 40_000 },
  { co: 'fund', n: 5, first: 'Imani', last: 'Cole', gender: 'female', age: 47, focus: 'finance', trait: 'visionary', skill: 91, years: 5, morale: 77, salary: 210_000 },
  { co: 'fund', n: 6, first: 'Sven', last: 'Lund', gender: 'male', age: 29, focus: 'sales', trait: 'shady', skill: 47, years: 0, morale: 58, salary: 95_000 },
]

const INDUSTRY = { rest: 'restaurant', fund: 'investmentFirm' } as const satisfies Record<StaffSpec['co'], Industry>

/** The two companies with their leadership teams in place (3 and 2 seats of 5). */
export function staffedCompany(co: StaffSpec['co']): { g: GameState; a: Asset } {
  const { g, a } = companyGame(INDUSTRY[co])
  const b = bizOf(g, a)
  for (const s of STAFF.filter((x) => x.co === co)) {
    b.staff.push({ id: `ks${s.n}`, firstName: s.first, lastName: s.last, gender: s.gender, age: s.age, role: FOCUS_ROLE(INDUSTRY[co], s.focus), focus: s.focus, skill: s.skill, salary: s.salary, trait: s.trait, morale: s.morale, years: s.years })
  }
  return { g, a }
}

const textOf = (g: GameState, n: MenuNode): string => (n.type === 'info' ? (typeof n.text === 'function' ? n.text(g) : n.text) : n.type === 'heading' ? n.label : '')
const subtitleOf = (g: GameState, n: MenuAction | MenuGroup): string => nodeSubtitle(n, g) ?? ''

// ---------------------------------------------------------------------------------------------------------------------
// Group 2: hired key staff

/** staffGroup subtitle and header for the six staff (the subtitle is read as a string or as a function of the state), and the Employees list. */
function staffRows(): Row[] {
  const rows: Row[] = []
  for (const co of ['rest', 'fund'] as const) {
    const { g, a } = staffedCompany(co)
    const members = (gg: GameState): MenuGroup[] => staffMenu(a).children(gg).filter((n): n is MenuGroup => n.type === 'menu' && n.id.startsWith('biz.staffMember.'))
    const menu = staffMenu(a)
    rows.push([`staff/${co}/list`, pure(`staff/${co}/list`, g, (gg) => `${subtitleOf(gg, menu)}\n${menu.header?.(gg) ?? ''}`)])
    for (const s of STAFF.filter((x) => x.co === co)) {
      const find = (gg: GameState): MenuGroup => {
        const m = members(gg).find((x) => x.id.endsWith(`.ks${s.n}`))
        if (!m) throw new Error(`people-ui-kit: no staff group for ks${s.n}`)
        return m
      }
      rows.push([`staff/${co}/ks${s.n}/subtitle`, pure(`staff/${co}/ks${s.n}/subtitle`, g, (gg) => `${find(gg).label} | ${typeof find(gg).subtitle === 'function' ? (find(gg).subtitle as (x: GameState) => string)(gg) : (find(gg).subtitle ?? '')}`)])
      rows.push([`staff/${co}/ks${s.n}/header`, pure(`staff/${co}/ks${s.n}/header`, g, (gg) => find(gg).header?.(gg) ?? '')])
    }
  }
  return rows
}

// ---------------------------------------------------------------------------------------------------------------------
// Group 3: the staff shortlist popup

const isHire = (m: ModalItem): m is ChoiceModal => m.kind === 'choice' && m.source === 'script' && m.scriptId === 'business.hire'
const isManager = (m: ModalItem): m is ChoiceModal => m.kind === 'choice' && m.source === 'script' && m.scriptId === 'business.manager'

/** A popup as text: its title, emoji, words, every choice (id, label, emoji, hint) and the data it carries. */
export function popupText(m: ChoiceModal): string {
  const choices = m.choices.map((c) => `  ${c.id}: ${c.label} ${c.emoji ?? ''}${c.hint ? ` | hint: ${c.hint}` : ''}`)
  return [`${m.title} ${m.emoji ?? ''}`, m.text, ...choices, `data: ${JSON.stringify(m.data ?? null)}`].join('\n')
}

/** Every notice in the queue, as title and text. */
const noticesOf = (g: GameState): string => g.queue.map((m) => (m.kind === 'notice' ? `${m.title}: ${m.text}` : `(${m.kind})`)).join('\n')

const asset = (g: GameState) => {
  const a = g.assets[0]
  if (!a) throw new Error('people-ui-kit: no company')
  return a
}

function interview(g: GameState, role: string): ChoiceModal {
  const a = asset(g)
  const row = allNodes(g, businessAssetView(g, a)).find((n): n is MenuAction => n.type === 'action' && n.id === `biz.hire.${a.id}.${role}`)
  if (!row) throw new Error(`people-ui-kit: no interview row for ${role}`)
  g.rng = SHORTLIST_RNG
  row.run(g)
  const m = g.queue.filter(isHire).at(-1)
  if (!m) throw new Error(`people-ui-kit: the ${role} interview opened no shortlist`)
  return m
}

/** The popup the interview opens, what it cost, the hire of its first candidate with the notice and the new sheet, and the check Exact refuses. */
function hireRows(): Row[] {
  const rows: Row[] = []
  const cases: { id: string; industry: Industry; talent: boolean; focus: KeyStaff['focus'] }[] = [
    { id: 'rest', industry: 'restaurant', talent: false, focus: 'quality' },
    { id: 'rest-talent', industry: 'restaurant', talent: true, focus: 'ops' },
    { id: 'fund', industry: 'investmentFirm', talent: false, focus: 'finance' },
  ]
  for (const c of cases) {
    const { g, a } = companyGame(c.industry, { talent: c.talent })
    const role = FOCUS_ROLE(c.industry, c.focus)
    const cash0 = bizOf(g, a).cash
    rows.push([`hire/${c.id}/popup`, fresh(`hire/${c.id}/popup`, g, (gg) => {
      const m = interview(gg, role)
      return `${popupText(m)}\ncash spent: ${cash0 - bizOf(gg, asset(gg)).cash}\nqueue: ${gg.queue.length}`
    })])
    rows.push([`hire/${c.id}/hired`, fresh(`hire/${c.id}/hired`, g, (gg) => {
      const m = interview(gg, role)
      gg.queue = []
      runScript(gg, 'business.hire', 'c0', m.data, m)
      const b = readBiz(gg, asset(gg))
      const s = b.staff.at(-1)
      return `${noticesOf(gg)}\nstaff: ${s ? JSON.stringify(s) : 'none'}`
    })])
    rows.push([`hire/${c.id}/check`, fresh(`hire/${c.id}/check`, g, (gg) => {
      const m = interview(gg, role)
      gg.queue = []
      const before = JSON.stringify({ cash: bizOf(gg, asset(gg)).cash, staff: bizOf(gg, asset(gg)).staff, know: gg.flags.know ?? null })
      runScript(gg, 'business.hire', 'vet', m.data, m)
      const after = JSON.stringify({ cash: bizOf(gg, asset(gg)).cash, staff: bizOf(gg, asset(gg)).staff, know: gg.flags.know ?? null })
      return `offers a check: ${m.choices.some((x) => x.id === 'vet')}\nafter choosing one anyway: queue ${gg.queue.length}, books unchanged ${before === after}`
    })])
  }
  // The pure text builders, with and without a paid background check (Exact prints one text for both).
  const { g } = companyGame('restaurant')
  const cand = { firstName: 'Dana', lastName: 'Lee', age: 34, skill: 73, trait: 'steady' }
  for (const vet of [0, 1] as const) {
    rows.push([`hire/text/check${vet}`, pure(`hire/text/check${vet}`, g, (gg) => {
      const read = candidateRead(gg, 'abc12', 0, cand, vet)
      return [candidateLine(cand, read, '$60K'), candidateLabel(cand, read, '$60K'), JSON.stringify(hireFooter([read], vet, 1_800)), JSON.stringify(hireFooter([read], vet, null))].join('\n')
    })])
  }
  return rows
}

// ---------------------------------------------------------------------------------------------------------------------
// Group 4: CEOs and managers

function openManagerPick(g: GameState, key: 'stepDown' | 'replaceManager'): ChoiceModal {
  const a = asset(g)
  const row = allNodes(g, businessAssetView(g, a)).find((n): n is MenuAction => n.type === 'action' && n.id === `biz.${key}.${a.id}`)
  if (!row) throw new Error(`people-ui-kit: no ${key} row`)
  g.queue = []
  g.rng = MANAGER_RNG
  row.run(g)
  const m = g.queue.filter(isManager).at(-1)
  if (!m) throw new Error(`people-ui-kit: ${key} opened no shortlist`)
  return m
}

/** Answer a manager popup with a choice and give back the popup that follows (or null). */
function answer(g: GameState, m: ChoiceModal, choice: string): ChoiceModal | null {
  g.queue = []
  runScript(g, 'business.manager', choice, m.data, m)
  return g.queue.filter(isManager).at(-1) ?? null
}

/** The CEO rows of a company that has a hired CEO: the replace row, the Company Details line, the group rows if any. */
function ceoLines(g: GameState): string {
  const a = asset(g)
  const rows = allNodes(g, businessAssetView(g, a))
  const replace = rows.find((n): n is MenuAction => n.type === 'action' && n.id === `biz.replaceManager.${a.id}`)
  const details = infoRows(g, a).filter((n) => /^(CEO|Run by)/.test(textOf(g, n)))
  return [replace ? `replace: ${replace.label} | ${subtitleOf(g, replace)}` : 'replace: none', ...details.map((n) => `details: ${textOf(g, n)}`)].join('\n')
}

function managerRows(): Row[] {
  const rows: Row[] = []
  const cases: { id: string; industry: Industry; talent: boolean }[] = [
    { id: 'rest', industry: 'restaurant', talent: false },
    { id: 'rest-talent', industry: 'restaurant', talent: true },
    { id: 'fund', industry: 'investmentFirm', talent: false },
  ]
  for (const c of cases) {
    const { g } = companyGame(c.industry, { talent: c.talent })
    rows.push([`ceo/${c.id}/standard`, fresh(`ceo/${c.id}/standard`, g, (gg) => popupText(openManagerPick(gg, 'stepDown')))])
    rows.push([`ceo/${c.id}/executive`, fresh(`ceo/${c.id}/executive`, g, (gg) => {
      const next = answer(gg, openManagerPick(gg, 'stepDown'), 'exec')
      return next ? popupText(next) : 'no popup'
    })])
    rows.push([`ceo/${c.id}/hired`, fresh(`ceo/${c.id}/hired`, g, (gg) => {
      const m = openManagerPick(gg, 'stepDown')
      gg.queue = []
      runScript(gg, 'business.manager', 'm0', m.data, m)
      return `${noticesOf(gg)}\n${ceoLines(gg)}`
    })])
    rows.push([`ceo/${c.id}/replace`, fresh(`ceo/${c.id}/replace`, g, (gg) => {
      const first = openManagerPick(gg, 'stepDown')
      gg.queue = []
      runScript(gg, 'business.manager', 'm0', first.data, first)
      return popupText(openManagerPick(gg, 'replaceManager'))
    })])
  }
  // A star from an executive search is hired (the star emoji is in its choice, the notice names the skill).
  const { g } = companyGame('restaurant')
  rows.push([`ceo/rest/star`, fresh(`ceo/rest/star`, g, (gg) => {
    const exec = answer(gg, openManagerPick(gg, 'stepDown'), 'exec')
    if (!exec) throw new Error('people-ui-kit: no executive search')
    const star = exec.choices.find((x) => x.emoji === '\u{2B50}')
    gg.queue = []
    runScript(gg, 'business.manager', star ? star.id : 'm0', exec.data, exec)
    return `star choice: ${star ? star.label : 'none'}\n${noticesOf(gg)}\n${ceoLines(gg)}`
  })])
  return rows
}

/** The first line of the yearly CEO letter for a hired CEO of each skill (competent, elite, world-class, and a perfect 100). */
function letterRows(): Row[] {
  const rows: Row[] = []
  for (const skill of [80, 88, 92, 96, 100]) {
    const { g, a } = companyGame('restaurant')
    const b = bizOf(g, a)
    const plan = bestPlan(g, b)
    b.price = plan.price
    b.production = plan.production
    stepDown(g, a, b, { firstName: 'Pat', lastName: 'Lee', gender: 'female', skill, salary: askingSalary(b, skill), since: g.year, style: 'steady', integrity: 100 })
    g.queue = []
    rows.push([`ceo/letter/${skill}`, fresh(`ceo/letter/${skill}`, g, (gg) => {
      gg.rng = LETTER_RNG
      smartManagerTurn(gg, asset(gg), bizOf(gg, asset(gg)))
      const memo = boardOf(bizOf(gg, asset(gg))).memo
      return memo[0] ?? 'no letter'
    })])
  }
  return rows
}

/** The group CEO rows of a conglomerate with a hired group CEO. */
function groupRows(): Row[] {
  const g = makeTestGame(123, { age: 45, money: 1e9 })
  g.character.talents = []
  for (const [i, industry] of (['solar', 'logistics'] as const).entries()) {
    const b = newBiz(g, industry, 'us', 'Chicago', { cash: 200e6, founded: g.year - 5, valuation: 220e6 })
    installManager(g, b, { firstName: 'Ana', lastName: 'Div', gender: 'female', skill: 70 + i, salary: 200_000, since: g.year - 5, style: 'steady', integrity: 90 })
    g.assets.push(createBusinessAsset(g, `Division ${i}`, b, 1e6))
  }
  if (!formGroup(g, g.assets.map((x) => x.id), 'Atlas')) throw new Error('people-ui-kit: the group did not form')
  const id = groupsOf(g)[0].core.id
  const grp = liveGroup(g, id)
  if (!grp) throw new Error('people-ui-kit: no group')
  grp.core.ceo = 'manager'
  grp.core.manager = { firstName: 'Dana', lastName: 'Okoye', gender: 'female', skill: 82, salary: 250_000, since: g.year - 2, style: 'visionary', integrity: 90 }
  saveGroup(g, grp)
  g.queue = []
  const pick = (gg: GameState): MenuNode[] => allNodes(gg, groupView(gg, id)).filter((n) => n.id === `biz.group.i.${id}.5` || n.id === `biz.group.ceo.${id}`)
  return [['ceo/group', pure('ceo/group', g, (gg) => pick(gg).map((n) => (n.type === 'info' ? `info: ${textOf(gg, n)}` : n.type === 'menu' || n.type === 'action' ? `${n.type}: ${n.label} | ${subtitleOf(gg, n)}` : '')).join('\n'))]]
}

// ---------------------------------------------------------------------------------------------------------------------
// Group 5: the People cockpit, the badges and Needs You

const cockpitText = (m: CockpitModel): string => JSON.stringify(m)

interface Scene {
  id: string
  game: () => GameState
}

/** Four states of the Relationships tab: nobody, a household, the fourteen drifting (one cut off, one in debt) and the fourteen close. */
const SCENES: readonly Scene[] = [
  { id: 'alone', game: adultGame },
  {
    id: 'household',
    game: () => {
      const kit = buildKit(90)
      kit.g.people = kit.g.people.filter((p) => ['spouse', 'child', 'pet'].includes(KIT_KEYS.find((k) => kit.ids[k] === p.id) ?? ''))
      return kit.g
    },
  },
  {
    id: 'drifting',
    game: () => {
      const kit = buildKit(20)
      estrange(kit.g, personOf(kit, 'child'))
      lend(kit.g, personOf(kit, 'sibling'), 12_000)
      angryAboutWill(kit.g, personOf(kit, 'parent'))
      return kit.g
    },
  },
  { id: 'close', game: () => buildKit(90).g },
]

/** cockpitOf('relationships'), personGroup(p).badge for the living, and needsYou(peopleMenu.children(g), g) for four states. */
function cockpitRows(): Row[] {
  const rows: Row[] = []
  for (const s of SCENES) {
    const g = s.game()
    rows.push([`cockpit/${s.id}`, pure(`cockpit/${s.id}`, g, (gg) => cockpitText(cockpitOf('relationships', gg)))])
    rows.push([`badge/${s.id}`, pure(`badge/${s.id}`, g, (gg) => gg.people.filter((p) => p.alive && p.relation !== 'pet').map((p) => `${p.firstName}: ${personGroup(p).badge?.(gg) ?? 'none'}`).join('\n') || 'nobody')])
    rows.push([`needs/${s.id}`, pure(`needs/${s.id}`, g, (gg) => needsYou(peopleMenu.children(gg), gg).map((r) => `${r.node.id} | ${r.node.label} | ${r.badge}`).join('\n') || 'none')])
  }
  return rows
}

// ---------------------------------------------------------------------------------------------------------------------
// All of it

export const ROW_GROUPS = ['details', 'actions', 'staff', 'hire', 'ceo', 'cockpit'] as const
export type RowGroup = (typeof ROW_GROUPS)[number]

const BUILDERS: Record<RowGroup, () => Row[]> = {
  details: detailRows,
  actions: actionRows,
  staff: staffRows,
  hire: hireRows,
  ceo: () => [...managerRows(), ...letterRows(), ...groupRows()],
  cockpit: cockpitRows,
}

/** The rows of one group, built now. */
export function buildGroup(group: RowGroup): Row[] {
  return BUILDERS[group]()
}

/** Every row, in file order. */
export function buildRows(): Row[] {
  return ROW_GROUPS.flatMap((g) => buildGroup(g))
}

/** The group a row key belongs to: the part before the first slash, with `badge` and `needs` read with `cockpit` and `hire`, `staff` and `ceo` as they are. */
export function groupOf(key: string): RowGroup {
  const head = key.split('/')[0]
  if (head === 'badge' || head === 'needs') return 'cockpit'
  if ((ROW_GROUPS as readonly string[]).includes(head)) return head as RowGroup
  throw new Error(`people-ui-kit: a row key with no group: ${key}`)
}

// ---------------------------------------------------------------------------------------------------------------------
// Comparing

const clip = (s: string, n = 140): string => (s.length <= n ? s : `${s.slice(0, n)}...`)

/** The first character at which two texts differ, with a few characters around it. */
function firstDifference(a: string, b: string): string {
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  return `at ${i}: recorded "${a.slice(Math.max(0, i - 20), i + 40)}" now "${b.slice(Math.max(0, i - 20), i + 40)}"`
}

/** What differs between the recorded rows and today's: a row missing, a row new, a row whose text moved (where it first differs). */
export function diffRows(recorded: readonly Row[], now: readonly Row[]): string[] {
  const was = new Map(recorded)
  const is = new Map(now)
  const out: string[] = []
  for (const [k] of recorded) if (!is.has(k)) out.push(`${k}: missing now`)
  for (const [k, text] of now) {
    if (!was.has(k)) out.push(`${k}: new, not in the file (${clip(text, 60)})`)
    else if (was.get(k) !== text) out.push(`${k}: ${firstDifference(was.get(k) as string, text)}`)
  }
  return out
}

// ---------------------------------------------------------------------------------------------------------------------
// The file

export interface Recorded {
  v: 1
  node: string
  head: string
  reason: string
  rows: Row[]
}

/** The file's text: a header line and one row a line, so a diff reads row by row. */
export function serialize(f: Recorded): string {
  const head = `{\n"v": ${f.v},\n"node": ${JSON.stringify(f.node)},\n"head": ${JSON.stringify(f.head)},\n"reason": ${JSON.stringify(f.reason)},\n"rows": [\n`
  return `${head}${f.rows.map((r) => JSON.stringify(r)).join(',\n')}\n]\n}\n`
}

/** Null when the recorder may run: the variable is set, the reason will do, and this is Node 22 (the CI version). Else why not. */
export function recordRefusal(env: Readonly<Record<string, string | undefined>>, nodeMajor: number, checkReason: (reason: string | undefined) => string | null): string | null {
  if (env.RECORD_PEOPLE_UI !== '1') return `the oracle is written only when asked: ${RECORD_COMMAND}`
  const why = checkReason(env.RECORD_REASON)
  if (why) return `RECORD_REASON: ${why}`
  if (nodeMajor !== 22) return `record under Node 22, the version CI runs (this is Node ${nodeMajor}): use /Users/saeed/projects/anotherlife/wt/bin/vt22`
  return null
}

/** The head the rows were recorded on, a short hash (or 'working tree' outside git). */
function shortHead(): string {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || 'working tree'
  } catch {
    return 'working tree'
  }
}

/** The recorder. Throws the refusal, else builds the rows, writes the file and names the Node and the head it ran on. */
export function recordPeopleUi(checkReason: (reason: string | undefined) => string | null, env: Readonly<Record<string, string | undefined>> = process.env): void {
  const major = Number(process.versions.node.split('.')[0])
  const refusal = recordRefusal(env, major, checkReason)
  if (refusal) throw new Error(refusal)
  const rows = buildRows()
  writeFileSync(join(ROOT, FIXTURE_FILE), serialize({ v: 1, node: process.version, head: shortHead(), reason: (env.RECORD_REASON as string).trim(), rows }))
}
