// Owner-scoped, plain-JSON author state. Reading a menu never creates or edits a
// profile; actions and yearly hooks explicitly acquire/persist mutable state.
import type { GameState, Json } from '../types'
import { ownerKey, peek, prof } from './common'
import {
  isChapterFocus, isAuthorFormat, isAuthorGenre, isReleasePace, isStoryPromise,
  type AuthorFormat, type AuthorGenre, type ChapterFocus, type ReleasePace, type StoryPromise,
} from './author-data'

export { AUTHOR_JOB } from './author-data'

export type AuthorStage = 'draft' | 'ready' | 'serial' | 'published' | 'ended'

export interface AuthorWork {
  id: string
  title: string
  format: AuthorFormat
  genre: AuthorGenre
  promise: StoryPromise
  stage: AuthorStage
  /** Country where this work began; ongoing work can travel with its creator. */
  countryId: string
  started: number
  released: number
  progress: number
  quality: number
  chapters: number
  readers: number
  /** Reader trust, 0-100. Cliffhanger debt is tracked independently in hooks. */
  trust: number
  hooks: number
  arcs: number
  volumes: number
  copies: number
  /** Book/volume copies expected next year. */
  tail: number
  gross: number
  earned: number
  /** Empty for self-publication. */
  publisher: string
  /** Author's royalty share of retail gross; recoup is denominated in author royalties. */
  share: number
  recoup: number
  spent: number
  focus: ChapterFocus
  pace: ReleasePace
  hiatus: boolean
  hiatuses: number
  lastYear: number
  adaptedUntil: number
  adaptationBase: number
  adaptationEarned: number
}

export interface AuthorProfile {
  v: number
  seq: number
  works: AuthorWork[]
  audience: number
  reputation: number
  burnout: number
  lastYear: number
  awards: string[]
}

// A safety bound for malformed/hand-edited saves, not a normal catalogue limit.
// Prefer active projects and revenue-bearing works if a corrupt save exceeds it.
const MAX_WORKS = 4096
const MAX_COUNT = 1_000_000_000_000
const MAX_MONEY = 1_000_000_000_000_000
const STAGES: AuthorStage[] = ['draft', 'ready', 'serial', 'published', 'ended']

function object(value: Json | undefined): Record<string, Json> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function number(value: Json | undefined, fallback = 0, maximum = MAX_COUNT, minimum = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback
}

function whole(value: Json | undefined, fallback = 0, maximum = MAX_COUNT, minimum = 0): number {
  return Math.round(number(value, fallback, maximum, minimum))
}

function text(value: Json | undefined, fallback = '', length = 80): string {
  return typeof value === 'string' ? value.trim().slice(0, length) : fallback
}

function year(value: Json | undefined, fallback = 0): number {
  return whole(value, fallback, 100_000, -10_000)
}

function readWork(value: Json, index: number): AuthorWork | null {
  const o = object(value)
  const title = text(o.title)
  if (!title) return null
  return {
    id: text(o.id, `aw${index + 1}`, 40),
    title,
    format: isAuthorFormat(o.format) ? o.format : 'novella',
    genre: isAuthorGenre(o.genre) ? o.genre : 'fantasy',
    promise: isStoryPromise(o.promise) ? o.promise : 'characters',
    stage: typeof o.stage === 'string' && STAGES.includes(o.stage as AuthorStage) ? o.stage as AuthorStage : 'draft',
    countryId: text(o.countryId, '', 16),
    started: year(o.started),
    released: year(o.released),
    progress: number(o.progress, 0, 100),
    quality: number(o.quality, 0, 100),
    chapters: whole(o.chapters),
    readers: whole(o.readers),
    trust: number(o.trust, 50, 100),
    hooks: whole(o.hooks, 0, 100),
    arcs: whole(o.arcs),
    volumes: whole(o.volumes),
    copies: whole(o.copies),
    tail: whole(o.tail),
    gross: number(o.gross, 0, MAX_MONEY),
    earned: number(o.earned, 0, MAX_MONEY),
    publisher: text(o.publisher),
    share: number(o.share, 1, 1),
    recoup: number(o.recoup, 0, MAX_MONEY),
    spent: number(o.spent, 0, MAX_MONEY),
    focus: isChapterFocus(o.focus) ? o.focus : 'characters',
    pace: isReleasePace(o.pace) ? o.pace : 'steady',
    hiatus: o.hiatus === true,
    hiatuses: whole(o.hiatuses),
    lastYear: year(o.lastYear, -1),
    adaptedUntil: year(o.adaptedUntil),
    adaptationBase: number(o.adaptationBase, 0, MAX_MONEY),
    adaptationEarned: number(o.adaptationEarned, 0, MAX_MONEY),
  }
}

/** Defensive copy of durable state. Accepts old or incomplete profiles. */
export function normalizeAuthor(raw: Json | undefined): AuthorProfile {
  const o = object(raw)
  let seq = whole(o.seq)
  const used = new Set<string>()
  let works = (Array.isArray(o.works) ? o.works : [])
    .map(readWork)
    .filter((work): work is AuthorWork => work !== null)
  // Reserve all existing numeric ids before repairing blanks or duplicates.
  for (const work of works) {
    const match = /^aw(\d+)$/.exec(work.id)
    if (match) seq = Math.max(seq, whole(Number(match[1])))
  }
  for (const work of works) {
    if (!work.id || used.has(work.id)) {
      do { seq += 1; work.id = `aw${seq}` } while (used.has(work.id))
    }
    used.add(work.id)
  }
  if (works.length > MAX_WORKS) {
    const priority = (work: AuthorWork): number =>
      ['draft', 'ready', 'serial'].includes(work.stage) ? 2 : work.tail > 0 || work.adaptationBase > 0 ? 1 : 0
    works = works.map((work, index) => ({ work, index }))
      .sort((a, b) => priority(b.work) - priority(a.work) || a.index - b.index)
      .slice(0, MAX_WORKS)
      .sort((a, b) => a.index - b.index)
      .map(({ work }) => work)
  }
  return {
    v: 1,
    seq,
    works,
    audience: whole(o.audience),
    reputation: number(o.reputation, 0, 100),
    burnout: number(o.burnout, 0, 100),
    lastYear: year(o.lastYear, -1),
    awards: (Array.isArray(o.awards) ? o.awards : [])
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .slice(-100)
      .map((value) => value.trim().slice(0, 160)),
  }
}

/** Pure normalized copy: does not create flags or advance randomness. */
export function authorView(g: GameState): AuthorProfile {
  return normalizeAuthor(peek<Json>(g, 'author') ?? undefined)
}

/** Acquire a normalized write-through profile, only from actions/yearly hooks. */
export function authorMut(g: GameState): AuthorProfile {
  const raw = prof<Record<string, Json>>(g, 'author', () => normalizeAuthor(undefined) as unknown as Record<string, Json>)
  Object.assign(raw, normalizeAuthor(raw as unknown as Json) as unknown as Record<string, Json>)
  return raw as unknown as AuthorProfile
}

/** Persist after a transition, preserving character ownership and save invariants. */
export function saveAuthor(g: GameState, profile: AuthorProfile): void {
  g.flags['special.author'] = { ...normalizeAuthor(profile as unknown as Json), owner: ownerKey(g) } as unknown as Json
}
