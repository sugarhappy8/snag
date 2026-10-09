// Owner-scoped state for the personal secretary's money-request inbox. This module is
// deliberately independent of wealth-resolve so yearly requests can depend on it without a
// menu/import cycle.
import type { GameState, Json, Person, RelationKind } from '../types'

export type SecretaryCategory = 'kids' | 'family' | 'friends' | 'other'
export type SecretaryPolicy = 'review' | 'decline'
export type SecretaryStatus = 'pending' | 'declined' | 'reviewed'

export interface SecretaryInboxItem {
  id: string
  year: number
  category: SecretaryCategory
  pid?: string
  title: string
  what: string
  amount: number
  ask: Json
  status: SecretaryStatus
}

export interface SecretaryState {
  v: 1
  owner: string
  seq: number
  policies: Record<SecretaryCategory, SecretaryPolicy>
  inbox: SecretaryInboxItem[]
}

const KEY = 'luxury.secretary'
const STAFF_KEY = 'luxury.staff'
const CATEGORIES: SecretaryCategory[] = ['kids', 'family', 'friends', 'other']
const FAMILY: RelationKind[] = [
  'parent', 'stepparent', 'sibling', 'halfSibling', 'stepsibling', 'grandparent',
  'spouse', 'partner', 'fiance',
]

function object(value: Json | undefined): Record<string, Json> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null
}

function finite(value: Json | undefined, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function text(value: Json | undefined, fallback = '', max = 160): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : fallback
}

function owner(g: GameState): string {
  return g.character.id
}

function blank(g: GameState): SecretaryState {
  return {
    v: 1,
    owner: owner(g),
    seq: 0,
    policies: { kids: 'review', family: 'review', friends: 'review', other: 'review' },
    inbox: [],
  }
}

function status(value: Json | undefined): SecretaryStatus {
  return value === 'declined' || value === 'reviewed' ? value : 'pending'
}

function category(value: Json | undefined): SecretaryCategory {
  return typeof value === 'string' && CATEGORIES.includes(value as SecretaryCategory) ? value as SecretaryCategory : 'other'
}

/** Pure, defensive view. Old-owner and malformed state is ignored. */
export function secretaryState(g: GameState): SecretaryState {
  const raw = object(g.flags[KEY])
  if (!raw || raw.owner !== owner(g)) return blank(g)
  const policyRaw = object(raw.policies)
  const policies = blank(g).policies
  for (const key of CATEGORIES) policies[key] = policyRaw?.[key] === 'decline' ? 'decline' : 'review'
  const inbox: SecretaryInboxItem[] = []
  if (Array.isArray(raw.inbox)) {
    for (const value of raw.inbox.slice(-100)) {
      const item = object(value)
      if (!item) continue
      const id = text(item.id, '', 48)
      const title = text(item.title, '', 100)
      const what = text(item.what, '', 160)
      const ask = item.ask
      if (!id || !title || !what || !ask || typeof ask !== 'object' || Array.isArray(ask)) continue
      const pid = text(item.pid, '', 48)
      inbox.push({
        id,
        year: Math.round(finite(item.year)),
        category: category(item.category),
        ...(pid ? { pid } : {}),
        title,
        what,
        amount: Math.max(0, Math.round(finite(item.amount))),
        ask: JSON.parse(JSON.stringify(ask)) as Json,
        status: status(item.status),
      })
    }
  }
  const seq = Math.max(Math.round(finite(raw.seq)), ...inbox.map((item) => Number(/^sr(\d+)$/.exec(item.id)?.[1] ?? 0)))
  return { v: 1, owner: owner(g), seq: Math.max(0, seq), policies, inbox }
}

function save(g: GameState, state: SecretaryState): void {
  g.flags[KEY] = JSON.parse(JSON.stringify({ ...state, v: 1, owner: owner(g), inbox: state.inbox.slice(-100) })) as Json
}

/** Existing saves keep their staff. New roles are simply absent until hired. */
export function secretaryEmployed(g: GameState): boolean {
  const staff = object(g.flags[STAFF_KEY])
  return !!object(staff?.secretary)
}

export function secretaryCategoryFor(g: GameState, pid?: string): SecretaryCategory {
  if (!pid) return 'other'
  const person = g.people.find((candidate) => candidate.id === pid)
  if (!person) return 'other'
  if (person.relation === 'child' || person.relation === 'stepchild' || person.relation === 'grandchild') return 'kids'
  if (person.relation === 'friend' || person.relation === 'bestFriend') return 'friends'
  return FAMILY.includes(person.relation) ? 'family' : 'other'
}

export function secretaryPolicy(g: GameState, key: SecretaryCategory): SecretaryPolicy {
  return secretaryState(g).policies[key]
}

export function setSecretaryPolicy(g: GameState, key: SecretaryCategory, policy: SecretaryPolicy): void {
  if (!CATEGORIES.includes(key) || (policy !== 'review' && policy !== 'decline')) return
  const state = secretaryState(g)
  state.policies[key] = policy
  save(g, state)
}

/** Store one screened request and return the policy in force for it. */
export function queueSecretaryRequest(
  g: GameState,
  request: { pid?: string; title: string; what: string; amount: number; ask: Json },
): { id: string; policy: SecretaryPolicy } | null {
  if (!secretaryEmployed(g)) return null
  const state = secretaryState(g)
  state.seq += 1
  const id = `sr${state.seq}`
  const key = secretaryCategoryFor(g, request.pid)
  const policy = state.policies[key]
  state.inbox.push({
    id,
    year: g.year,
    category: key,
    ...(request.pid ? { pid: request.pid } : {}),
    title: request.title.trim().slice(0, 100) || 'Money Request',
    what: request.what.trim().slice(0, 160) || 'money',
    amount: Math.max(0, Math.round(request.amount)),
    ask: JSON.parse(JSON.stringify(request.ask)) as Json,
    status: policy === 'decline' ? 'declined' : 'pending',
  })
  save(g, state)
  return { id, policy }
}

export function markSecretaryRequest(g: GameState, id: string, next: SecretaryStatus): void {
  const state = secretaryState(g)
  const item = state.inbox.find((candidate) => candidate.id === id)
  if (!item || (next !== 'pending' && next !== 'declined' && next !== 'reviewed')) return
  item.status = next
  save(g, state)
}

export function pendingSecretaryRequests(g: GameState): SecretaryInboxItem[] {
  return secretaryState(g).inbox.filter((item) => item.status === 'pending').map((item) => ({ ...item, ask: JSON.parse(JSON.stringify(item.ask)) as Json }))
}

export function recentSecretaryRequests(g: GameState): SecretaryInboxItem[] {
  return secretaryState(g).inbox.slice(-12).reverse().map((item) => ({ ...item, ask: JSON.parse(JSON.stringify(item.ask)) as Json }))
}

export function secretaryPerson(g: GameState, item: SecretaryInboxItem): Person | undefined {
  return item.pid ? g.people.find((person) => person.id === item.pid) : undefined
}
