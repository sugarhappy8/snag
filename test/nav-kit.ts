// R1-N1: the menu-tree test kit of the Navigation track. Pure helpers, no vitest import, shared by the nav tests.
//
//   - four canned states (kid, adult, ceo, elder), deterministic, with an empty popup queue;
//   - a walker that lists the menu tree the way the UI shows it (visible nodes only, locked groups listed but not
//     entered, callback errors caught by the menuModel wrappers and reported through console.error);
//   - canonical paths, in which the `hub.` groups (cockpit tiles, R1-N8) are invisible, so a cockpit and the flat list
//     it replaces give the same action sequence;
//   - the lint (groups over 12 rows without a heading, groups with one row) that test/nav-tree.test.ts ratchets.
//
// A walk costs seconds on the CEO state (about 12,000 nodes), so every test that walks or indexes a canned state
// uses walkTreeCached / actionSequenceCached: a file then walks a state once per option set.
import { MORTGAGE_PLANS, buyHouse, houseListings } from '../src/game/assets'
import { becomeCeo } from '../src/game/business/career'
import { evolve, recordYear, simulateYear, valuationOf } from '../src/game/business/economy'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { bizOf, type BizState } from '../src/game/business/state'
import { applyPlan, autoPlan } from '../src/game/business/yearly'
import { hireForJob } from '../src/game/careers'
import { getJobDef } from '../src/game/data/jobs'
import { contractCondition } from '../src/game/health'
import { createNewLife } from '../src/game/life'
import { activitiesMenu, assetsMenu, occupationMenu } from '../src/game/menus'
import { createPerson } from '../src/game/people'
import { personActions, relationshipGroups } from '../src/game/relationships'
import type { GameState, InterviewJob, MenuAction, MenuGroup, MenuNode, Person } from '../src/game/types'
import { getCountry } from '../src/game/world'
import { groupChildren, nodeDisabled, nodeVisible } from '../src/ui/components/menuModel'
import { deepFreeze } from './fuzz-kit'

export type NavTab = 'occupation' | 'assets' | 'relationships' | 'activities'
export type NavStateName = 'kid' | 'adult' | 'ceo' | 'elder'

/** The tabs in the order the bottom bar shows them, and so the order of a walk. */
const TABS: readonly NavTab[] = ['occupation', 'assets', 'relationships', 'activities']

/**
 * Roots whose long list is sectioned at render time (R1-N2 regroups Activities in MenuSheet), so the lint does not
 * ask for headings in the data. R1-N2 imports this constant.
 */
export const SECTIONED_ROOTS: readonly string[] = ['activities']

// ---------------------------------------------------------------------------
// Canned states

const SEEDS: Record<NavStateName, number> = { kid: 4101, adult: 4102, ceo: 4103, elder: 4104 }

/** The adult extras: a full-time job, one house, two friends and a partner. */
function addAdultExtras(g: GameState): void {
  const def = getJobDef('accountant')
  const rung = def?.ladder[1]
  if (!def || !rung) throw new Error('nav-kit: the accountant job is missing from the jobs data')
  const job: InterviewJob = { defId: def.id, title: rung.title, company: 'Apex Holdings', salary: rung.salary, category: 'fulltime' }
  hireForJob(g, job)
  const cheapest = houseListings(g, 'residential')[0]
  if (!cheapest) throw new Error('nav-kit: no house listing')
  const plan = MORTGAGE_PLANS.find((p) => p.id === 'm20_30') ?? null
  if (!buyHouse(g, cheapest, null) && !buyHouse(g, cheapest, plan)) throw new Error('nav-kit: could not buy the canned house')
  const age = g.character.age
  createPerson(g, { relation: 'friend', age: age - 1 })
  createPerson(g, { relation: 'friend', age: age + 1 })
  createPerson(g, { relation: 'partner', age: age - 2 })
  g.queue = []
}

/** Found a company, take the chair and play two years of it (the pattern of test/company-dashboard.test.ts). */
function addCompany(g: GameState, name: string, industry: BizState['industry']): void {
  const country = g.character.countryId
  const b0 = newBiz(g, industry, country, getCountry(country).cities[0], { cash: 400_000 })
  const a = createBusinessAsset(g, name, b0, 100_000)
  g.assets.push(a)
  becomeCeo(g, a, b0)
  const b = bizOf(g, a)
  applyPlan(b, autoPlan(g, b, 1))
  for (let y = 0; y < 2; y++) {
    const r = simulateYear(g, b, g.year, b.ownerSalary)
    evolve(g, b, r.stmt, g.year)
    recordYear(b, r.stmt)
    b.valuation = valuationOf(b)
    g.year += 1
    applyPlan(b, autoPlan(g, b, r.stmt.cycle))
  }
  g.queue = []
}

/** Build a canned state from scratch, no memo (navState caches this). */
export function buildNavState(name: NavStateName): GameState {
  const seed = SEEDS[name]
  let g: GameState
  switch (name) {
    case 'kid': {
      g = createNewLife({ seed, year: 2020, countryId: 'us' })
      g.year = 2029
      g.character.age = 9
      break
    }
    case 'adult': {
      g = createNewLife({ seed, year: 2026 - 35, countryId: 'us' })
      g.year = 2026
      const c = g.character
      c.age = 35
      c.money = 250_000
      addAdultExtras(g)
      break
    }
    case 'ceo': {
      g = createNewLife({ seed, year: 2022 - 41, countryId: 'us' })
      g.year = 2022
      const c = g.character
      c.age = 41
      c.money = 250_000
      c.talent = null
      c.talents = ['Business']
      c.licenses = ['driver']
      addAdultExtras(g)
      c.money = 3_000_000
      addCompany(g, 'Harbor Grill', 'restaurant')
      addCompany(g, 'Pixel Forge', 'gameStudio')
      // Four simulated years passed: 2022 to 2026.
      c.age = 45
      break
    }
    case 'elder': {
      g = createNewLife({ seed, year: 2026 - 78, countryId: 'us' })
      g.year = 2026
      const c = g.character
      c.age = 78
      c.retired = true
      c.pension = 24000
      contractCondition(g, 'Diabetes', { severity: 60, diagnosed: true, quiet: true })
      break
    }
  }
  g.queue = []
  return g
}

const built = new Map<NavStateName, GameState>()

/** A canned state, built once per name per test file; every call returns a fresh structuredClone. */
export function navState(name: NavStateName): GameState {
  let base = built.get(name)
  if (!base) {
    base = buildNavState(name)
    built.set(name, base)
  }
  return structuredClone(base)
}

/** A canned state, cloned and deep-frozen like the committed state of the store: a write throws. */
export function frozen(name: NavStateName): GameState {
  return deepFreeze(navState(name))
}

// ---------------------------------------------------------------------------
// The walker

export interface WalkOpts {
  /** Deepest list a node may sit in; a group in a list at this depth is listed, not entered. Default 8. */
  maxDepth?: number
  /** Most action and menu nodes a walk records, in all tabs together. Default 30000. */
  maxNodes?: number
  /** Replace the root of a tab (the other tabs keep their real root). */
  roots?: Partial<Record<NavTab, MenuGroup>>
}

export interface Walked {
  tab: NavTab
  /** Ids from the root's children down to this node, `hub.` groups included. */
  ids: string[]
  type: 'action' | 'menu'
  node: MenuAction | MenuGroup
  /** Visible action and menu nodes in the list this node sits in (itself included). */
  rows: number
}

export interface Lint {
  /** Normalised ids of groups with more than 12 visible rows and no heading. */
  tooLong: string[]
  /** Normalised ids of groups with exactly one visible row. */
  single: string[]
}

const TOO_MANY_ROWS = 12

const lintOfWalk = new WeakMap<Walked[], Lint>()

function isHub(id: string): boolean {
  return id.startsWith('hub.')
}

function personGroup(p: Person): MenuGroup {
  return {
    type: 'menu',
    id: `person.${p.id}`,
    label: `${p.firstName} ${p.lastName}`.trim(),
    emoji: '\u{1F464}',
    children: (g) => personActions(g, p),
  }
}

/**
 * The Relationships tab is a custom sheet, not a MenuGroup, so the walk builds a root from the same two functions
 * the sheet uses: one group `person.<id>` per person, under a heading per relationship group. R1-N3 replaces it
 * with peopleMenu.
 */
function relationshipsRoot(): MenuGroup {
  return {
    type: 'menu',
    id: 'relationships',
    label: 'Relationships',
    emoji: '\u{2764}\u{FE0F}',
    children: (g) => {
      const out: MenuNode[] = []
      for (const grp of relationshipGroups(g)) {
        out.push({ type: 'heading', id: `rel.${grp.title}`, label: grp.title })
        for (const p of grp.people) out.push(personGroup(p))
      }
      return out
    },
  }
}

/**
 * Walk the four tabs in DFS pre-order. Only visible action and menu nodes are listed (headings and info rows are
 * not). A locked group is listed but not entered. Callbacks go through the menuModel wrappers, so a throwing
 * visible() or children() is caught and reported through console.error, as in the UI, and the walk goes on.
 * Depth counts the lists a node is in; a group whose id starts with `hub.` adds none.
 */
export function walkTree(g: GameState, opts: WalkOpts = {}): Walked[] {
  const maxDepth = opts.maxDepth ?? 8
  const maxNodes = opts.maxNodes ?? 30000
  const roots: Record<NavTab, MenuGroup> = { occupation: occupationMenu, assets: assetsMenu, relationships: relationshipsRoot(), activities: activitiesMenu, ...opts.roots }
  const out: Walked[] = []
  const lint = { tooLong: new Set<string>(), single: new Set<string>() }

  const list = (tab: NavTab, group: MenuGroup, ids: string[], depth: number): void => {
    const kids: unknown = groupChildren(group, g)
    if (!Array.isArray(kids)) {
      console.error(`[nav-kit] children(${group.id}) did not return an array`)
      return
    }
    const visible = (kids as MenuNode[]).filter((n) => n && typeof n === 'object' && nodeVisible(n, g))
    const rows = visible.filter((n) => n.type === 'action' || n.type === 'menu').length
    if (rows > TOO_MANY_ROWS && !visible.some((n) => n.type === 'heading') && !SECTIONED_ROOTS.includes(group.id)) lint.tooLong.add(normId(group.id))
    if (rows === 1) lint.single.add(normId(group.id))
    for (const n of visible) {
      if (n.type !== 'action' && n.type !== 'menu') continue
      if (out.length >= maxNodes) return
      const path = [...ids, n.id]
      out.push({ tab, ids: path, type: n.type, node: n, rows })
      if (n.type === 'menu' && !nodeDisabled(n, g)) {
        const next = isHub(n.id) ? depth : depth + 1
        if (next <= maxDepth) list(tab, n, path, next)
      }
    }
  }

  for (const tab of TABS) list(tab, roots[tab], [], 1)
  lintOfWalk.set(out, { tooLong: [...lint.tooLong].sort(), single: [...lint.single].sort() })
  return out
}

/** The lint found while `walked` was walked (it must come from walkTree or walkTreeCached). */
export function lintOf(walked: Walked[]): Lint {
  const found = lintOfWalk.get(walked)
  if (!found) throw new Error('nav-kit: lintOf needs the array walkTree returned')
  return found
}

/** Group ids that are too long or single-row in `g`'s tree, normalised, sorted, unique. */
export function lintViolations(g: GameState, opts?: WalkOpts): Lint {
  return lintOf(walkTree(g, opts))
}

const walkCache = new Map<string, Walked[]>()
const sequenceCache = new Map<string, string[]>()

function cacheKey(name: NavStateName, opts: Omit<WalkOpts, 'roots'>): string {
  return `${name}|${opts.maxDepth ?? ''}|${opts.maxNodes ?? ''}`
}

/** walkTree of the frozen canned state `name`, memoised per (name, options) inside one test file. Never mutate the result. */
export function walkTreeCached(name: NavStateName, opts: Omit<WalkOpts, 'roots'> = {}): Walked[] {
  const key = cacheKey(name, opts)
  let hit = walkCache.get(key)
  if (!hit) {
    hit = walkTree(frozen(name), opts)
    walkCache.set(key, hit)
  }
  return hit
}

export function actionSequenceCached(name: NavStateName, opts: Omit<WalkOpts, 'roots'> = {}): string[] {
  const key = cacheKey(name, opts)
  let hit = sequenceCache.get(key)
  if (!hit) {
    hit = sequenceOf(walkTreeCached(name, opts))
    sequenceCache.set(key, hit)
  }
  return hit
}

/** `${tab}/${ids.join('/')}` with every `hub.` segment removed. */
export function canonical(w: Walked): string {
  return [w.tab, ...w.ids.filter((id) => !isHub(id))].join('/')
}

function sequenceOf(walked: Walked[]): string[] {
  return walked.filter((w) => w.type === 'action').map(canonical)
}

/** Canonical paths of the actions in DFS order. */
export function actionSequence(g: GameState, opts?: WalkOpts): string[] {
  return sequenceOf(walkTree(g, opts))
}

/** Every run of digits becomes '#', so `biz.plan.a12` and `biz.plan.a7` are one id. */
export function normId(id: string): string {
  return id.replace(/\d+/g, '#')
}
