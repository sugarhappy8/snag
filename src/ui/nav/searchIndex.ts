// The search index (G.9): a breadth-first walk of the four menu roots into plain data. An entry holds a row's id path, its
// label, keywords and breadcrumbs as normalised text, and where it sits; never a closure. A tap re-resolves the live node
// from the latest state with createResolver, and a row that has gone is found out then, not trusted from here.
//
// Pure and bounded. It reads only what a list needs to show a row (children, visible, disabledReason, keywords, the type and
// the text of the label). It never reads a hint, a subtitle, a header or a confirm text (a hint can run the optimiser), never
// looks inside an input (only whether the row has one), never runs a row, and never draws. The walk can be sliced into
// small steps (startIndexJob, stepIndexJob, finishIndex) so a phone is never blocked, and buildIndex runs it to the end.
//
// Part of the palette zone (test/lazy-zones.test.ts): only the palette and its gate import this file at run time.
import { keywordsOf } from '../../game/hubs/keywords'
import { peopleMenu } from '../../game/hubs/people'
import { activitiesMenu, assetsMenu, occupationMenu } from '../../game/menus'
import type { GameState, MenuAction, MenuGroup, MenuNode } from '../../game/types'
import { groupChildren, nodeDisabled, nodeVisible } from '../components/menuModel'
import type { SearchTab } from './place'
import { normalize } from './searchRank'

export type EntityKind = 'person' | 'company' | 'stock' | 'asset'

/** Something with a name that rows hang off: a person, a company, a stock offer, an owned thing. */
export interface EntityRef {
  kind: EntityKind
  id: string
  name: string
}

export interface IndexEntry {
  /** Unique in an index (the dedupe key). */
  key: string
  tab: SearchTab
  /** Ids from the root's children down to this row, itself last. The tab is not in it. */
  idPath: string[]
  type: 'action' | 'menu'
  id: string
  label: string
  emoji: string
  /** Labels from the root down to the row's parent (the root's label first). On an entity's rows the entity's name is among them. */
  crumbs: string[]
  /** Normalised text to match: the label (plus the entity's name on its rows), the row's keywords, the crumbs. */
  labelN: string
  kwN: string
  crumbN: string
  /** How many lists deep the row sits: idPath.length. */
  depth: number
  entity?: EntityRef
  /** Why the row is locked (disabledReason), or null. Advisory: the palette checks again live. */
  locked: string | null
  /** The row asks for a value before it runs. */
  input: boolean
}

export interface SearchIndex {
  /** indexKey of the state it was built from. */
  key: string
  entries: IndexEntry[]
  /** The walk ran to the end (or to a cap). False for a job read before it was done. */
  complete: boolean
  /** A cap cut something out: entries, nodes, depth, children per group or per entity. */
  truncated: boolean
  /** Nodes looked at. */
  nodes: number
  /** Lists that failed to build and nodes that were not usable, skipped. */
  failures: number
}

export type IndexRoots = Record<SearchTab, MenuGroup>

export const INDEX_LIMITS = { entries: 6000, nodes: 20000, depth: 7, perGroup: 120, perEntity: 40 } as const

const TABS: readonly SearchTab[] = ['occupation', 'assets', 'relationships', 'activities']

/** The four roots as the bottom bar shows them. Relationships is a custom sheet, so its root is the people adapter. */
export function defaultRoots(): IndexRoots {
  return { occupation: occupationMenu, assets: assetsMenu, relationships: peopleMenu, activities: activitiesMenu }
}

// ---------------------------------------------------------------------------
// The cache key

/**
 * What the menus depend on, in a string. The roadmap's key is (life, year, age, assets, job, office); the office lives in
 * job.data.office, and Activities swaps to another list in prison and changes with people, retirement and death, so those
 * join it. The money bucket (a power of two, signed) catches the rows that open and close with the bank balance.
 */
export function indexKey(g: GameState): string {
  const c = g.character
  const job = c.job
  const office = job && job.data && typeof job.data.office === 'string' ? job.data.office : ''
  const money = Number.isFinite(c.money) ? c.money : 0
  const bucket = Math.sign(money) * Math.floor(Math.log2(Math.abs(money) + 1))
  return [g.lifeId, g.year, c.age, g.assets.length, g.people.length, job?.defId, job?.level, office, c.prison ? 'p' : '', c.retired ? 'r' : '', c.alive ? '' : 'x', bucket].join('|')
}

// ---------------------------------------------------------------------------
// Entities

interface EntityRule {
  prefix: string
  /** `rest`: the id after the prefix. Null when the row is not what the prefix says. */
  read: (g: GameState, rest: string, name: string) => EntityRef | null
}

/** First match wins. */
const ENTITY_RULES: readonly EntityRule[] = [
  { prefix: 'person.', read: (_g, rest, name) => (rest === '' ? null : { kind: 'person', id: rest, name }) },
  { prefix: 'biz.company.', read: (_g, rest, name) => (rest === '' ? null : { kind: 'company', id: rest, name }) },
  {
    // The owned-asset row. A company shows here too, and is the same entity as its biz.company row.
    prefix: 'asset-',
    read: (g, rest, name) => {
      const owned = g.assets.find((a) => String(a.id) === rest)
      return owned ? { kind: owned.kind === 'business' ? 'company' : 'asset', id: owned.id, name } : null
    },
  },
  { prefix: 'inv-offer-', read: (_g, rest, name) => (rest === '' ? null : { kind: 'stock', id: rest, name }) },
]

/** The entity a group row stands for, from its id; null for anything else (an action, a heading, a plain group). */
export function entityOf(g: GameState, node: MenuNode): EntityRef | null {
  if (!node || node.type !== 'menu' || typeof node.id !== 'string') return null
  const name = typeof node.label === 'string' ? node.label : ''
  for (const rule of ENTITY_RULES) {
    if (node.id.startsWith(rule.prefix)) return rule.read(g, node.id.slice(rule.prefix.length), name)
  }
  return null
}

// ---------------------------------------------------------------------------
// The walk

interface Frame {
  tab: SearchTab
  node: MenuGroup
  idPath: string[]
  crumbs: string[]
  crumbN: string
  entity: EntityRef | null
}

/** A walk in progress. Opaque: only the functions below read it. */
export interface IndexJob {
  readonly done: boolean
}

class Job implements IndexJob {
  readonly queue: Frame[] = []
  head = 0
  readonly entries: IndexEntry[] = []
  readonly seen = new Set<string>()
  nodes = 0
  failures = 0
  truncated = false
  /** A cap ended the walk early. */
  stopped = false

  constructor(
    readonly g: GameState,
    readonly key: string,
  ) {}

  get done(): boolean {
    return this.stopped || this.head >= this.queue.length
  }
}

function asJob(job: IndexJob): Job {
  if (!(job instanceof Job)) throw new Error('searchIndex: not an index job')
  return job
}

function textOf(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

/** The stand-in list menuModel.groupChildren returns when a group's children() threw. */
function isBuildFailure(kids: readonly unknown[], group: MenuGroup): boolean {
  const only = kids[0] as { type?: unknown; id?: unknown } | undefined
  return kids.length === 1 && !!only && only.type === 'info' && only.id === `${group.id}.error`
}

function makeEntry(job: Job, frame: Frame, node: MenuAction | MenuGroup, own: EntityRef | null, key: string, label: string): IndexEntry {
  const entity = own ?? frame.entity
  const idPath = [...frame.idPath, node.id]
  const entry: IndexEntry = {
    key,
    tab: frame.tab,
    idPath,
    type: node.type,
    id: node.id,
    label,
    emoji: textOf(node.emoji),
    crumbs: [...frame.crumbs],
    labelN: normalize(entity && !own ? `${label} ${entity.name}` : label),
    kwN: normalize(keywordsOf(node).join(' ')),
    crumbN: frame.crumbN,
    depth: idPath.length,
    locked: nodeDisabled(node, job.g),
    input: node.type === 'action' && Boolean(node.input),
  }
  if (entity) entry.entity = entity
  return entry
}

/** One group's list: an entry for each usable row, a frame for each group worth entering. */
function runFrame(job: Job, frame: Frame): void {
  const g = job.g
  if (job.entries.length >= INDEX_LIMITS.entries || job.nodes >= INDEX_LIMITS.nodes) {
    job.truncated = true
    job.stopped = true
    return
  }
  const kids: unknown = groupChildren(frame.node, g)
  if (!Array.isArray(kids) || isBuildFailure(kids, frame.node)) {
    job.failures++
    return
  }
  const room = frame.entity ? Math.min(INDEX_LIMITS.perEntity, INDEX_LIMITS.perGroup) : INDEX_LIMITS.perGroup
  let rows = 0
  for (const raw of kids as unknown[]) {
    if (job.entries.length >= INDEX_LIMITS.entries || job.nodes >= INDEX_LIMITS.nodes) {
      job.truncated = true
      job.stopped = true
      return
    }
    job.nodes++
    const node = raw as MenuNode
    if (!node || typeof node !== 'object' || typeof node.id !== 'string') {
      job.failures++
      continue
    }
    if (node.type === 'heading' || node.type === 'info') continue
    if (node.type !== 'action' && node.type !== 'menu') {
      job.failures++
      continue
    }
    if (!nodeVisible(node, g)) continue
    const own = entityOf(g, node)
    const entity = own ?? frame.entity
    // A row with no text is still findable, by its id.
    const label = textOf(node.label).trim() === '' ? node.id : node.label
    const key = entity ? `${entity.kind}:${entity.id}:${own ? 'root' : `${node.type}:${node.id}`}` : `${node.type}:${node.id}:${label}`
    if (job.seen.has(key)) continue
    if (rows >= room) {
      job.truncated = true
      break
    }
    rows++
    job.seen.add(key)
    const entry = makeEntry(job, frame, node, own, key, label)
    job.entries.push(entry)
    if (node.type !== 'menu' || entry.locked !== null) continue
    if (entry.depth >= INDEX_LIMITS.depth) {
      job.truncated = true
      continue
    }
    const crumbs = [...frame.crumbs, label]
    job.queue.push({ tab: frame.tab, node, idPath: entry.idPath, crumbs, crumbN: normalize(crumbs.join(' ')), entity })
  }
}

/** Begin a walk of the four roots (the real ones unless `roots` says otherwise). Nothing is read until the first step. */
export function startIndexJob(g: GameState, roots: IndexRoots = defaultRoots()): IndexJob {
  const job = new Job(g, indexKey(g))
  for (const tab of TABS) {
    const node = roots[tab]
    if (!node || typeof node !== 'object') {
      job.failures++
      continue
    }
    const crumbs = [textOf(node.label)]
    job.queue.push({ tab, node, idPath: [], crumbs, crumbN: normalize(crumbs.join(' ')), entity: null })
  }
  return job
}

function clock(): number {
  return performance.now()
}

/**
 * Walk groups until `budgetMs` has passed (by `now`, `performance.now` unless a test gives one) and always at least one, so
 * a budget of 0 still finishes, one group per call. True when the walk is over.
 */
export function stepIndexJob(job: IndexJob, budgetMs: number, now: () => number = clock): boolean {
  const j = asJob(job)
  const start = now()
  do {
    if (j.done) break
    runFrame(j, j.queue[j.head++])
  } while (!j.done && now() - start < budgetMs)
  return j.done
}

/** The index so far. `complete` is false when the job is not done. */
export function finishIndex(job: IndexJob): SearchIndex {
  const j = asJob(job)
  return { key: j.key, entries: j.entries.slice(), complete: j.done, truncated: j.truncated, nodes: j.nodes, failures: j.failures }
}

/** The whole walk in one go. */
export function buildIndex(g: GameState, roots: IndexRoots = defaultRoots()): SearchIndex {
  const job = startIndexJob(g, roots)
  stepIndexJob(job, Number.POSITIVE_INFINITY)
  return finishIndex(job)
}

// ---------------------------------------------------------------------------
// Resolving an entry against the latest state

/**
 * The live node an entry stands for, or null when it has gone: a group on the way vanished, hid or is locked, or the row
 * itself vanished or hid. A locked row is returned (the caller shows the reason). One resolver keeps each group's list for
 * its whole life, so a hundred entries in one group build that group once; make a new one for a new state.
 */
export function createResolver(g: GameState, roots: IndexRoots = defaultRoots()): (e: IndexEntry) => MenuAction | MenuGroup | null {
  const lists = new Map<string, MenuNode[]>()
  const listOf = (tab: SearchTab, prefix: readonly string[], group: MenuGroup): MenuNode[] => {
    const memo = `${tab}\u001f${prefix.join('\u001f')}`
    let list = lists.get(memo)
    if (!list) {
      const got: unknown = groupChildren(group, g)
      list = Array.isArray(got) ? (got as MenuNode[]) : []
      lists.set(memo, list)
    }
    return list
  }
  return (e) => {
    const root = roots[e.tab]
    if (!root || !Array.isArray(e.idPath) || e.idPath.length === 0) return null
    let group: MenuGroup = root
    for (let i = 0; i < e.idPath.length; i++) {
      const id = e.idPath[i]
      const last = i === e.idPath.length - 1
      const kids = listOf(e.tab, e.idPath.slice(0, i), group)
      const next = kids.find((n) => !!n && n.id === id && n.type === (last ? e.type : 'menu') && nodeVisible(n, g))
      if (!next || (next.type !== 'action' && next.type !== 'menu')) return null
      if (last) return next
      if (next.type !== 'menu' || nodeDisabled(next, g)) return null
      group = next
    }
    return null
  }
}

// ---------------------------------------------------------------------------
// The cache (module level, UI only: never in GameState)

let cache: SearchIndex | null = null

/** The stored index, only when it was built for a state with the same key as `g`. */
export function cachedIndex(g: GameState): SearchIndex | null {
  return cache && cache.key === indexKey(g) ? cache : null
}

export function storeIndex(i: SearchIndex): void {
  cache = i
}

export function clearIndexCache(): void {
  cache = null
}
