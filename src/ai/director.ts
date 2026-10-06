// The AI "director": turns AI tasks from the modal queue into calls to the player's chosen
// AI provider (a local server such as LM Studio/Ollama, or a cloud API such as Claude/OpenAI —
// see providers.ts) and returns mutators that apply the results to a fresh draft of the game state.
//
// The GameState passed to runAiTask / narrateNotice / chatReply is the store's current
// snapshot and is never mutated here. Randomness the engine needs while planning (e.g.
// "does this year get an event?") is peeked with nextRandom() and consumed again in the
// mutator, so lives stay reproducible from their seed.
//
// AI output is never trusted: names are mapped to existing people (unknown ones are
// dropped), effects go through applyEffects (which caps every swing), age-inappropriate
// consequences are filtered out, and unusable replies fall back to the offline library.
import { applyScreening, fallbackInterviewQuestion, presentInterview } from '../game/careers'
import { count, formatMoney, fullName, getPerson, log, moneyContextOf, moneyFromInput, notice, showMoneyIn, useYearAction, yearActionsUsed } from '../game/core'
import { offlineScreen } from '../game/cv'
import { applyEffects } from '../game/effects'
import { fallbackChoiceOutcome, fallbackCustomAction, fallbackObituary, foreignToLocale, queueFallbackYearEvents } from '../game/events'
import { nextRandom, pick, rand, shuffle, uid } from '../game/rng'
import type { AiTask, ChoiceModal, ChoiceOption, GameEffects, GameState, NoticeModal, Person, RelationKind, Tone } from '../game/types'
import { aiConfigProblem, type Settings } from '../settings'
import { anthropicModel, normalizeAnthropicBaseUrl } from './anthropic'
import { chatJson, listModels, resetAiSession } from './client'
import { AiFormatError } from './errors'
import { findLoadedModel, normalizeBaseUrl, rememberModel } from './openai-compat'
import { pickModel, providerFor, sameModel } from './providers'
import {
  EVENT_MEMORY_FLAG,
  EVENT_MEMORY_MAX,
  EVENT_THEMES,
  chatSystemPrompt,
  chatUserPrompt,
  customActionPrompt,
  eventMemory,
  interviewPrompt,
  localizeTheme,
  narratePrompt,
  narratorSystem,
  obituaryPrompt,
  resolveChoicePrompt,
  screenApplicationPrompt,
  situationalThemes,
  stageOf,
  yearEventsPrompt,
  type EventMemo,
} from './prompts'
import {
  SCHEMAS,
  SchemaError,
  validateChat,
  validateCustomAction,
  validateInterview,
  validateNarration,
  validateObituary,
  validateOutcome,
  validateScreening,
  validateYearEvents,
  type AiCustomAction,
  type AiEffects,
  type AiOutcome,
  type AiYearEvents,
} from './schemas'

export interface ChatTurn {
  from: 'player' | 'npc'
  text: string
}

export interface ChatResult {
  reply: string
  relationshipDelta: number
  mood: string
}

export type Mutator = (draft: GameState) => void

/** How many "Do Anything" actions a character can take per year. */
export const MAX_CUSTOM_ACTIONS_PER_YEAR = 5
const CUSTOM_ACTION_KEY = 'doAnything'
const CHOICE_IDS = ['a', 'b', 'c', 'd']

// ---------------------------------------------------------------------------
// Engine-side planning (pure: peeks the RNG without advancing it)

function peekRolls(g: GameState, n: number): number[] {
  const out: number[] = []
  let state = g.rng
  for (let i = 0; i < n; i++) {
    const [value, next] = nextRandom(state)
    out.push(value)
    state = next
  }
  return out
}

function consumeRolls(draft: GameState, n: number): void {
  for (let i = 0; i < n; i++) rand(draft)
}

export interface YearPlan {
  /** Ask the model for an interactive event this year. */
  wantEvent: boolean
  /** Theme suggestion for variety, in local words ("studying for the gaokao"). */
  theme: string
  /** The theme as listed in EVENT_THEMES (remembered so it doesn't come back for a few years). */
  themeKey: string
  /** How many flavor lines to ask for, as prompt text ("1-2"). */
  logLines: string
  /** RNG draws to consume when applying. */
  rolls: number
}

/** Years before an AI event theme can be suggested again. */
const THEME_COOLDOWN = 4

/**
 * Decide (deterministically from the seed) whether this year gets an AI event:
 * none in the birth year, ~30% for ages 1-2, ~70% from age 3, 60% in prison, and fewer
 * when other popups are still waiting in the queue. The theme skips the ones used in the
 * last few years and is filled with the player's local words.
 */
export function planYear(g: GameState): YearPlan {
  const [r1, r2, r3] = peekRolls(g, 3)
  const c = g.character
  let p = c.age === 0 ? 0 : c.age <= 2 ? 0.3 : 0.7
  if (c.prison) p = 0.6
  const waiting = g.queue.filter((m) => m.kind === 'choice' || m.kind === 'input' || m.kind === 'minigame').length
  if (waiting >= 2) p = 0
  else if (waiting === 1) p *= 0.5
  const stage = stageOf(g)
  const situational = situationalThemes(g)
  const pool = [...EVENT_THEMES[stage], ...situational, ...situational]
  const used = new Set(eventMemory(g).filter((m) => m.source === 'ai' && m.age <= c.age && c.age - m.age < THEME_COOLDOWN).map((m) => m.kind))
  let index = Math.min(pool.length - 1, Math.floor(r2 * pool.length))
  for (let i = 0; i < pool.length && used.has(pool[index]); i++) index = (index + 1) % pool.length
  const themeKey = pool[index]
  const logLines = c.age === 0 ? '0-1' : c.age <= 2 ? '1' : r3 < 0.5 ? '1-2' : '2-3'
  return { wantEvent: c.alive && r1 < p, theme: localizeTheme(themeKey, c.countryId, r3), themeKey, logLines, rolls: 3 }
}

// ---------------------------------------------------------------------------
// People references

const RELATION_WORDS: Record<string, { rel: RelationKind[]; gender?: 'male' | 'female' }> = {
  mom: { rel: ['parent', 'stepparent'], gender: 'female' },
  mum: { rel: ['parent', 'stepparent'], gender: 'female' },
  mommy: { rel: ['parent', 'stepparent'], gender: 'female' },
  mama: { rel: ['parent', 'stepparent'], gender: 'female' },
  mother: { rel: ['parent', 'stepparent'], gender: 'female' },
  stepmom: { rel: ['stepparent'], gender: 'female' },
  stepmother: { rel: ['stepparent'], gender: 'female' },
  dad: { rel: ['parent', 'stepparent'], gender: 'male' },
  daddy: { rel: ['parent', 'stepparent'], gender: 'male' },
  papa: { rel: ['parent', 'stepparent'], gender: 'male' },
  father: { rel: ['parent', 'stepparent'], gender: 'male' },
  stepdad: { rel: ['stepparent'], gender: 'male' },
  stepfather: { rel: ['stepparent'], gender: 'male' },
  parent: { rel: ['parent'] },
  brother: { rel: ['sibling', 'halfSibling', 'stepsibling'], gender: 'male' },
  sister: { rel: ['sibling', 'halfSibling', 'stepsibling'], gender: 'female' },
  sibling: { rel: ['sibling', 'halfSibling', 'stepsibling'] },
  son: { rel: ['child', 'stepchild'], gender: 'male' },
  daughter: { rel: ['child', 'stepchild'], gender: 'female' },
  kid: { rel: ['child', 'stepchild'] },
  child: { rel: ['child', 'stepchild'] },
  grandma: { rel: ['grandparent'], gender: 'female' },
  grandmother: { rel: ['grandparent'], gender: 'female' },
  granny: { rel: ['grandparent'], gender: 'female' },
  grandpa: { rel: ['grandparent'], gender: 'male' },
  grandfather: { rel: ['grandparent'], gender: 'male' },
  grandson: { rel: ['grandchild'], gender: 'male' },
  granddaughter: { rel: ['grandchild'], gender: 'female' },
  wife: { rel: ['spouse'], gender: 'female' },
  husband: { rel: ['spouse'], gender: 'male' },
  spouse: { rel: ['spouse'] },
  girlfriend: { rel: ['partner'], gender: 'female' },
  boyfriend: { rel: ['partner'], gender: 'male' },
  partner: { rel: ['partner', 'spouse', 'fiance'] },
  fiance: { rel: ['fiance'] },
  fiancee: { rel: ['fiance'] },
  'best friend': { rel: ['bestFriend'] },
  bestie: { rel: ['bestFriend'] },
  boss: { rel: ['boss'] },
  teacher: { rel: ['teacher'] },
  cellmate: { rel: ['cellmate'] },
  lover: { rel: ['lover'] },
  ex: { rel: ['ex', 'exSpouse'] },
  enemy: { rel: ['enemy'] },
}

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/['’]s\b/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\b(my|the|your|our|a|an|dear|old)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function rank(p: Person): number {
  return (p.alive ? 1000 : 0) + (p.livesWithPlayer ? 100 : 0) + p.relationship
}

/**
 * Find the person the model meant: full name, first name, "Mom", "my sister", "the dog".
 * Never returns the player. Prefers living people.
 */
export function resolvePerson(g: GameState, name: string | undefined): Person | undefined {
  const raw = (name ?? '').trim()
  if (!raw) return undefined
  const norm = normalizeName(raw)
  if (!norm) return undefined
  const c = g.character
  if (norm === normalizeName(fullName(c)) || norm === normalizeName(c.firstName)) return undefined
  const people = [...g.people].sort((a, b) => rank(b) - rank(a))
  const byFull = people.find((p) => normalizeName(fullName(p)) === norm)
  if (byFull) return byFull
  const byFirst = people.find((p) => normalizeName(p.firstName) === norm)
  if (byFirst) return byFirst
  // "Susan Miller" when we only know "Susan", or "Grandma Rose": match a first name as a word.
  const words = new Set(norm.split(' '))
  const byWord = people.find((p) => p.firstName.length > 1 && words.has(normalizeName(p.firstName)))
  if (byWord) return byWord
  for (const [word, spec] of Object.entries(RELATION_WORDS)) {
    if (norm !== word && !norm.split(' ').includes(word) && !(word.includes(' ') && norm.includes(word))) continue
    const hit = people.find((p) => spec.rel.includes(p.relation) && (!spec.gender || p.gender === spec.gender))
    if (hit) return hit
  }
  const pet = people.find((p) => p.relation === 'pet' && p.species && words.has(p.species.toLowerCase()))
  return pet
}

// ---------------------------------------------------------------------------
// Effects: AI vocabulary → engine GameEffects (with age & situation sanity checks)

function clampN(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

function splitName(name: string): { firstName?: string; lastName?: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return {}
  const cap = (s: string) => s[0].toUpperCase() + s.slice(1)
  return { firstName: cap(parts[0]), lastName: parts.length > 1 ? cap(parts.slice(1).join(' ')) : undefined }
}

/** An amount the AI gave in the money it was shown (this life's currency and year) in internal dollars. */
export function aiMoneyToDollars(g: GameState, amount: number): number {
  if (!Number.isFinite(amount) || amount === 0) return 0
  return moneyFromInput(amount, moneyContextOf(g))
}

/**
 * Convert validated AI effects into engine effects for the current draft. The log line is kept
 * unless it repeats (or nearly repeats) a line from this year or the `lookbackYears` before it;
 * the memory unless it repeats one already remembered.
 */
export function toGameEffects(g: GameState, e: AiEffects, logLine = '', lookbackYears = 0): GameEffects {
  const c = g.character
  const age = c.age
  const out: GameEffects = {}
  if (e.happiness) out.happiness = e.happiness
  if (e.health) out.health = e.health
  if (e.smarts) out.smarts = e.smarts
  if (e.looks) out.looks = e.looks
  if (e.karma) out.karma = e.karma
  if (e.fame) out.fame = e.fame
  if (e.money) {
    // The AI sees money in the player's display currency (yen, 1980 dollars...) and answers in
    // it: back to internal dollars before any limit, so ¥50,000 never pays out $50,000.
    const dollars = aiMoneyToDollars(g, e.money)
    const limit = age < 6 ? 25 : age < 13 ? 400 : age < 18 ? 5_000 : Infinity
    const m = Math.round(clampN(dollars, -limit, limit))
    if (m) out.money = m
  }

  const rel = new Map<string, number>()
  for (const r of e.relationships) {
    const p = resolvePerson(g, r.name)
    if (!p || !p.alive) continue
    rel.set(p.id, clampN((rel.get(p.id) ?? 0) + r.delta, -40, 40))
  }
  if (rel.size) out.relationships = [...rel].map(([personId, delta]) => ({ personId, delta }))

  const np = e.newPerson
  if (np && !(c.prison && np.relation === 'pet')) {
    let relation = np.relation
    if ((relation === 'coworker' && !c.job) || (relation === 'classmate' && !c.education.current) || c.prison) {
      relation = relation === 'enemy' ? 'enemy' : relation === 'partner' || relation === 'lover' ? relation : 'friend'
    }
    const romantic = relation === 'partner' || relation === 'lover'
    let npAge = np.age
    if (romantic) {
      if (age < 13) relation = 'friend'
      else if (age < 18) npAge = clampN(npAge ?? age, Math.max(13, age - 2), age + 2)
      else npAge = Math.max(18, npAge ?? age)
    }
    if (relation !== 'pet' && age < 18 && npAge !== undefined && npAge >= 18 && (relation === 'friend' || relation === 'classmate')) {
      npAge = clampN(npAge, Math.max(0, age - 3), age + 3)
    }
    const { firstName, lastName } = splitName(np.name)
    const duplicate = firstName && g.people.some((p) => p.alive && p.firstName.toLowerCase() === firstName.toLowerCase())
    if (!duplicate && age >= 2) {
      out.newPerson = {
        relation,
        ...(firstName ? { firstName } : {}),
        ...(lastName && relation !== 'pet' ? { lastName } : {}),
        ...(np.gender ? { gender: np.gender } : {}),
        ...(npAge !== undefined ? { age: relation === 'pet' ? clampN(npAge, 0, 15) : npAge } : {}),
        ...(relation === 'pet' ? { species: np.species ?? 'Dog' } : {}),
      }
    }
  }

  const cond = e.condition
  if (cond && !(cond.kind === 'addiction' && age < 12) && !(cond.kind === 'std' && age < 18)) {
    out.condition = { name: cond.name, kind: cond.kind, severity: clampN(cond.severity, 1, 60) }
  }

  if (e.arrest) {
    if (age >= 11 && !c.prison) out.arrest = { crime: e.arrest.crime, severity: clampN(e.arrest.severity, 1, 5) }
    else out.karma = (out.karma ?? 0) - 3
  }
  if (e.death && age >= 6) out.death = e.death
  if (e.memory && !isRepeatMemory(g, e.memory)) out.memory = e.memory
  if (logLine && !isRepeatLine(g, logLine, lookbackYears)) out.log = logLine
  return out
}

// ---------------------------------------------------------------------------
// Repeats: small models love to reuse a line from the recent log ("I attacked my brother
// Hendra." two years running). Lines are compared by meaning, not spelling: names and
// relation words map to the person they mean, numbers and filler words drop out, words are
// stemmed and violent/thieving/mean verbs fold into one action each.

/** Letters and digits only, lowercased: two log lines with the same key read as a repeat. */
export function lineKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

const STOPWORDS = new Set(
  (
    'i me my mine myself we us our you your he him his she her they them their it its ' +
    'a an the this that these those some any one ' +
    'and or but so then than too also again once more still even just really very finally almost ' +
    'to of in on at for with from by about into onto over under up down out off around after before during while ' +
    'was were is are be been being am had has have having do did does done got get gets getting went go goes gone ' +
    'not no never ever all every each another other own same anymore ' +
    'today year years time times day days week weeks month months'
  ).split(' '),
)

/** Strong things you do *to* someone: the same one against the same person reads as a repeat. */
const ACTION_WORDS: Record<string, string> = {
  attack: 'attack', assault: 'attack', punch: 'attack', slap: 'attack', kick: 'attack', fight: 'attack', fought: 'attack',
  fistfight: 'attack', brawl: 'attack', rumbl: 'attack', tackl: 'attack', smack: 'attack', strangl: 'attack', headbut: 'attack',
  scuffl: 'attack', shov: 'attack',
  steal: 'steal', stol: 'steal', stolen: 'steal', shoplift: 'steal', rob: 'steal', pickpocket: 'steal',
  insult: 'insult', ridicul: 'insult', belittl: 'insult', humiliat: 'insult',
  prank: 'prank',
  argu: 'argue', argument: 'argue', quarrel: 'argue', bicker: 'argue', squabbl: 'argue', yel: 'argue',
}
/** Actions that, done to the same person again, read as a repeat (arguments happen; they fold into 'argue' for the word overlap only). */
const STRONG_ACTIONS = new Set(['attack', 'steal', 'insult', 'prank'])

function stem(word: string): string {
  let w = word
  if (w.length > 5 && w.endsWith('ing')) w = w.slice(0, -3)
  else if (w.length > 4 && (w.endsWith('ied') || w.endsWith('ies'))) w = `${w.slice(0, -3)}y`
  else if (w.length > 4 && w.endsWith('ed')) w = w.slice(0, -2)
  else if (w.length > 4 && /(?:ss|sh|ch|x|z)es$/.test(w)) w = w.slice(0, -2)
  else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1)
  if (w.length > 3 && w.endsWith('e')) w = w.slice(0, -1)
  if (w.length > 3 && /([^aeiou])\1$/.test(w)) w = w.slice(0, -1)
  return w
}

/** Names and relation words → a token for the person they mean. */
interface PersonIndex {
  names: Map<string, string>
  relations: Map<string, string>
  ignore: Set<string>
}

const GENERIC_RELATION_WORDS = new Set(['kid', 'child', 'parent', 'partner', 'ex', 'enemy', 'lover'])

function personIndex(g: GameState): PersonIndex {
  const names = new Map<string, string>()
  const clash = new Set<string>()
  const ignore = new Set<string>()
  for (const p of g.people) {
    const first = normalizeName(p.firstName)
    if (!first || first.includes(' ')) continue
    if (names.has(first) && names.get(first) !== `p:${p.id}`) clash.add(first)
    names.set(first, `p:${p.id}`)
    if (p.lastName) ignore.add(normalizeName(p.lastName))
  }
  for (const n of clash) names.set(n, `n:${n}`)
  ignore.add(normalizeName(g.character.firstName))
  ignore.add(normalizeName(g.character.lastName))
  for (const n of names.keys()) ignore.delete(n)
  const relations = new Map<string, string>()
  for (const [word, spec] of Object.entries(RELATION_WORDS)) {
    if (word.includes(' ') || GENERIC_RELATION_WORDS.has(word)) continue
    const hits = g.people.filter((p) => p.alive && spec.rel.includes(p.relation) && (!spec.gender || p.gender === spec.gender))
    relations.set(word, hits.length === 1 ? `p:${hits[0].id}` : `r:${spec.rel[0]}${spec.gender ? `:${spec.gender}` : ''}`)
  }
  return { names, relations, ignore }
}

export interface LineSignature {
  key: string
  tokens: Set<string>
}

/** The meaning of a log line as a set of tokens (see the section comment). */
export function lineSignature(text: string, idx: PersonIndex | GameState): LineSignature {
  const index = 'names' in idx ? idx : personIndex(idx)
  const key = lineKey(text)
  const words = normalizeName(
    text
      .replace(/\bbeat (?:up|the \w+ out of)\b/gi, 'attack')
      .replace(/\b(?:fist|food|pillow|snowball|water balloon)\s+fight\b/gi, (m) => (/^fist/i.test(m) ? 'attack' : m.replace(/\s+fight$/i, ' play')))
      .replace(/['’]s\b/g, '')
      .replace(/(\p{L})['’](\p{L})/gu, '$1$2'),
  )
    .replace(/-/g, ' ')
    .split(' ')
    .filter(Boolean)
  const tokens = new Set<string>()
  for (let i = 0; i < words.length; i++) {
    const w = words[i]
    if (index.names.has(w)) {
      tokens.add(index.names.get(w)!)
      continue
    }
    const rel = index.relations.get(w) ?? index.relations.get(w.replace(/s$/, ''))
    if (rel) {
      // "my brother Hendra": the name already says who.
      if (!index.names.has(words[i + 1] ?? '')) tokens.add(rel)
      continue
    }
    if (STOPWORDS.has(w) || index.ignore.has(w) || /^\d/.test(w) || w.length < 2) continue
    const st = stem(w)
    tokens.add(ACTION_WORDS[w] ?? ACTION_WORDS[st] ?? st)
  }
  return { key, tokens }
}

function isPersonToken(t: string): boolean {
  return t.startsWith('p:') || t.startsWith('r:') || t.startsWith('n:')
}

/**
 * Do two lines say the same thing? Same text; or most of the same meaningful words (Jaccard
 * ≥ 0.7); or (with `actionRule`) the same strong action against the same person.
 */
export function sameMoment(a: LineSignature, b: LineSignature, actionRule = true): boolean {
  if (a.key && a.key === b.key) return true
  let shared = 0
  for (const t of a.tokens) if (b.tokens.has(t)) shared++
  const union = a.tokens.size + b.tokens.size - shared
  if (union > 0 && shared / union >= 0.7) return true
  if (!actionRule) return false
  for (const act of STRONG_ACTIONS) {
    if (!a.tokens.has(act) || !b.tokens.has(act)) continue
    for (const t of a.tokens) if (isPersonToken(t) && b.tokens.has(t)) return true
  }
  return false
}

/** True when two life-log lines say the same thing for this game's cast. */
export function similarLines(g: GameState, a: string, b: string): boolean {
  const idx = personIndex(g)
  return sameMoment(lineSignature(a, idx), lineSignature(b, idx))
}

/** Years of life-log the narrator's flavor lines are checked against. */
export const REPEAT_WINDOW_YEARS = 10

function stripAge(memory: string): string {
  return memory.replace(/^age\s*\d+\s*:\s*/i, '')
}

/** Signatures of the log lines of this year and the `years` before it (plus memories when asked). */
function recentSignatures(g: GameState, years: number, idx: PersonIndex, withMemories = false): LineSignature[] {
  const out: LineSignature[] = []
  const age = g.character.age
  for (let i = g.log.length - 1; i >= 0; i--) {
    const year = g.log[i]
    if (year.age > age) continue
    if (year.age < age - years) break
    for (const e of year.entries) out.push(lineSignature(e.text, idx))
  }
  if (withMemories) for (const m of g.character.memories.slice(-20)) out.push(lineSignature(stripAge(m), idx))
  return out
}

/** Exact keys of every line ever logged in this life (cheap whole-life check). */
function lifetimeKeys(g: GameState): Set<string> {
  const keys = new Set<string>()
  for (const year of g.log) for (const e of year.entries) keys.add(lineKey(e.text))
  return keys
}

/**
 * Does an outcome's log line repeat the log? It nearly repeats a line from this year, or is
 * word for word a line from the `years` before it. (Outcomes come from the player's choices,
 * so doing the same thing again in a later year is news, not a repeat.)
 */
export function isRepeatLine(g: GameState, text: string, years = 0): boolean {
  const idx = personIndex(g)
  const sig = lineSignature(text, idx)
  const age = g.character.age
  for (let i = g.log.length - 1; i >= 0; i--) {
    const year = g.log[i]
    if (year.age > age) continue
    if (year.age < age - years) break
    for (const e of year.entries) {
      if (year.age === age ? sameMoment(sig, lineSignature(e.text, idx), false) : lineKey(e.text) === sig.key) return true
    }
  }
  return false
}

/** Does this memory repeat one the character already has? */
export function isRepeatMemory(g: GameState, text: string): boolean {
  const idx = personIndex(g)
  const sig = lineSignature(stripAge(text), idx)
  return g.character.memories.some((m) => sameMoment(sig, lineSignature(stripAge(m), idx)))
}

/**
 * Flavor lines are small moments that happen *to* or around the character. Anything that
 * changes their life (hurting someone, a crime, quitting, a breakup, a purchase, moving,
 * a new job/partner/pet) only comes from the player's choices, so such lines are dropped.
 */
const BIG_ACTION_RE = new RegExp(
  [
    String.raw`\bI\s+(?:\w+\s+)?(?:attacked|assaulted|punched|slapped|kicked (?:my|him|her|them)|stabbed|strangled|beat up|mugged|robbed|burgled|shoplifted|stole(?! the show)|vandali[sz]ed|murdered|killed (?:my|him|her|a man|a woman|someone)|set fire)`,
    String.raw`\bI\s+(?:\w+\s+)?(?:quit (?:my|the|school|college|university|work)|dropped out|broke up with|dumped (?:my (?:boyfriend|girlfriend|partner|husband|wife)|him|her)|divorced|proposed to|eloped|married|cheated on|started dating|asked \w+ out|moved (?:out|away|abroad|in with|into (?:a|an|my|our) (?:new )?(?:house|home|apartment|flat|place))|emigrated|ran away from home)`,
    String.raw`\bI\s+(?:\w+\s+)?(?:bought|purchased|adopted|leased)\s+(?:a |an |my |our )?(?:(?:new|first|own|brand-new|used|second-hand|dream|little|tiny|fancy)\s+)*(?:house|home|car|apartment|flat|condo|mansion|villa|boat|yacht|motorcycle|scooter|business|company|shop|restaurant|land|farm|puppy|kitten|dog|cat|pet|baby|child|kid|parrot|rabbit|hamster|horse)\b(?!\s+(?:toy|food|bed|treat|collar|leash|tree|costume|sweater|calendar|mug))`,
    String.raw`\bI\s+(?:\w+\s+)?(?:got|was|became) (?:married|engaged|divorced|arrested|expelled|suspended|hired|promoted|pregnant|someone pregnant|fired(?! up))`,
    String.raw`\bI\s+(?:\w+\s+)?(?:got|started|landed|found) (?:a |my )?(?:new |first |part-time |summer )?job\b`,
    String.raw`\bI\s+(?:\w+\s+)?(?:had|welcomed) (?:a|my first|another) (?:baby|child|son|daughter)\b`,
    String.raw`\b(?:I|we)\b[^.!?]*\b(?:got|get) (?:into|in) (?:a |another |huge |big )?(?:fist ?)?fight\b`,
  ].join('|'),
  'i',
)
/** "I moved to Bandung." (a capitalized place: case matters, so it's separate). */
const MOVED_TO_PLACE_RE = /\bI\s+(?:\w+\s+)?moved to (?:[A-Z]|a new (?:city|town|country|house|home|apartment))/

/** True for a flavor line that claims a big, player-only action or a change of the game's state. */
export function claimsBigAction(line: string): boolean {
  return BIG_ACTION_RE.test(line) || MOVED_TO_PLACE_RE.test(line)
}

function toneOf(e: GameEffects): Tone {
  if (e.death || e.arrest || e.condition) return 'bad'
  const score = (e.happiness ?? 0) + (e.health ?? 0) + (e.smarts ?? 0) + (e.looks ?? 0) + Math.sign(e.money ?? 0) * 5
  return score > 2 ? 'good' : score < -2 ? 'bad' : 'neutral'
}

interface OutcomeContext {
  title: string
  emoji?: string
  /** How many past years the outcome's log line must not repeat (this year is always checked). */
  lookbackYears?: number
}

/**
 * Show the outcome popup, then apply its effects. The popup is queued first so it shows
 * before anything the effects trigger (a trial, a hospital visit, the death screen); the
 * short change summary is appended to it afterwards.
 */
function applyOutcome(draft: GameState, o: AiOutcome, ctx: OutcomeContext): void {
  if (!draft.character.alive) return
  const eff = toGameEffects(draft, o.effects, o.log, ctx.lookbackYears ?? 0)
  const before = draft.queue.length
  notice(draft, o.title || ctx.title, o.text, { emoji: o.emoji || ctx.emoji || '✨', tone: toneOf(eff) })
  const popup = draft.queue[before]
  const changes = applyEffects(draft, eff)
  if (changes.length && popup && popup.kind === 'notice') popup.text = `${o.text}\n\n${changes.join(' · ')}`
}

// ---------------------------------------------------------------------------
// Year events

/** Remember an event shown this year (both the legacy title list and g.flags.eventMemory). */
function rememberEvent(draft: GameState, memo: EventMemo): void {
  const prev = Array.isArray(draft.flags.aiRecentEvents) ? draft.flags.aiRecentEvents.filter((x): x is string => typeof x === 'string') : []
  draft.flags.aiRecentEvents = [...prev, memo.title].slice(-12)
  const kept = eventMemory(draft).filter((m) => m.age <= draft.character.age)
  draft.flags[EVENT_MEMORY_FLAG] = [...kept, memo].slice(-EVENT_MEMORY_MAX).map((m) => ({ ...m }))
}

/** Years an event title can't come back, and the same kind of event about the same person. */
const EVENT_REPEAT_YEARS = 6
const PERSON_REPEAT_YEARS = 5

/**
 * Would this AI event repeat a recent one? Same (or nearly the same) title within six years,
 * or the same person within five years for the same theme or a title about the same thing.
 */
export function isRepeatEvent(g: GameState, title: string, person: Person | undefined, themeKey: string): boolean {
  const age = g.character.age
  const idx = personIndex(g)
  const sig = lineSignature(title, idx)
  const memo = eventMemory(g).filter((m) => m.age <= age && age - m.age < EVENT_REPEAT_YEARS)
  for (const m of memo) {
    const other = lineSignature(m.title, idx)
    if (sameMoment(sig, other)) return true
    if (!person || m.personId !== person.id || age - m.age >= PERSON_REPEAT_YEARS) continue
    if (m.source === 'ai' && m.kind === themeKey) return true
    for (const t of sig.tokens) if (!isPersonToken(t) && other.tokens.has(t)) return true
  }
  if (!Array.isArray(g.flags[EVENT_MEMORY_FLAG])) {
    // Old saves only kept titles: check the last few.
    const titles = Array.isArray(g.flags.aiRecentEvents) ? g.flags.aiRecentEvents.filter((x): x is string => typeof x === 'string').slice(-3) : []
    if (titles.some((t) => sameMoment(sig, lineSignature(t, idx)))) return true
  }
  return false
}

const STAGE_EMOJI: Record<string, string> = {
  baby: '\u{1F37C}',
  toddler: '\u{1F9F8}',
  child: '\u{1F392}',
  teen: '\u{1F3A7}',
  adult: '\u{1F4BC}',
  elder: '\u{1FA91}',
  prison: '\u{1F512}',
}

function applyYearEvents(draft: GameState, plan: YearPlan, result: AiYearEvents): void {
  consumeRolls(draft, plan.rolls)
  if (!draft.character.alive) return
  // Small models often repeat themselves (or copy the recent log): skip lines that say the
  // same thing as anything logged in the last ten years, or exactly repeat any line of this
  // life, lines where the character does something big the player never chose, and American
  // scenes outside the US.
  const idx = personIndex(draft)
  const seen = recentSignatures(draft, REPEAT_WINDOW_YEARS, idx, true)
  const lifetime = lifetimeKeys(draft)
  let logged = 0
  for (const line of result.log) {
    const sig = lineSignature(line, idx)
    if (!sig.key || lifetime.has(sig.key) || claimsBigAction(line) || foreignToLocale(draft, line) || seen.some((s) => sameMoment(sig, s))) continue
    seen.push(sig)
    log(draft, line, 'ai')
    count(draft, 'aiEvents')
    logged++
  }
  const ev = result.event
  // Events happen with living people only (the model sometimes brings back the dead).
  const found = ev ? resolvePerson(draft, ev.person) : undefined
  const person = found?.alive ? found : undefined
  const foreign = ev ? foreignToLocale(draft, [ev.title, ev.text, ...ev.choices.map((ch) => ch.label)].join(' \n ')) : false
  if (!ev || foreign || isRepeatEvent(draft, ev.title, person, plan.themeKey)) {
    // A rerun of a recent event (or prom night in a country without one): show one from the
    // offline library instead. Nothing new at all (every line was a repeat): the offline
    // library writes the year.
    if (ev) queueFallbackYearEvents(draft, logged ? { flavor: false, event: 'always' } : { event: 'always' })
    else if (!logged && result.log.length) queueFallbackYearEvents(draft)
    return
  }
  const choices: ChoiceOption[] = ev.choices.slice(0, 4).map((ch, i) => ({ id: CHOICE_IDS[i], label: ch.label, ...(ch.emoji ? { emoji: ch.emoji } : {}) }))
  const stage = stageOf(draft)
  const modal: ChoiceModal = {
    kind: 'choice',
    id: uid(draft, 'm'),
    title: ev.title,
    emoji: ev.emoji || STAGE_EMOJI[stage] || '✨',
    text: ev.text,
    choices,
    source: 'ai',
    data: { age: draft.character.age, stage, theme: plan.theme, person: person ? fullName(person) : '' },
    ...(person ? { personId: person.id } : {}),
  }
  draft.queue.push(modal)
  count(draft, 'aiEvents')
  rememberEvent(draft, { title: ev.title, age: draft.character.age, personId: person?.id ?? '', person: person?.firstName ?? '', kind: plan.themeKey, source: 'ai', gen: draft.generation })
}

async function runYearEvents(g: GameState, settings: Settings, signal: AbortSignal): Promise<Mutator> {
  const plan = planYear(g)
  const result = await chatJson(
    settings,
    {
      system: narratorSystem(settings),
      messages: [{ role: 'user', content: yearEventsPrompt(g, plan) }],
      schemaName: plan.wantEvent ? 'year_events' : 'year_log',
      schema: plan.wantEvent ? SCHEMAS.yearEvents : SCHEMAS.yearLog,
      validate: (v) => validateYearEvents(v, plan.wantEvent),
    },
    signal,
  )
  if (result.log.length === 0 && !result.event) {
    return (draft) => {
      consumeRolls(draft, plan.rolls)
      queueFallbackYearEvents(draft)
    }
  }
  return (draft) => applyYearEvents(draft, plan, result)
}

// ---------------------------------------------------------------------------
// Choices, custom actions, interviews, obituaries

async function runResolveChoice(g: GameState, task: Extract<AiTask, { type: 'resolveChoice' }>, settings: Settings, signal: AbortSignal): Promise<Mutator> {
  const choice = task.event.choices.find((c) => c.id === task.choiceId)
  if (!choice) return (draft) => applyFallback(draft, task)
  const outcome = await chatJson(
    settings,
    {
      system: narratorSystem(settings),
      messages: [{ role: 'user', content: resolveChoicePrompt(g, task.event, choice.label) }],
      schemaName: 'choice_outcome',
      schema: SCHEMAS.outcome,
      validate: validateOutcome,
    },
    signal,
  )
  return (draft) => applyOutcome(draft, outcome, { title: task.event.title, emoji: task.event.emoji, lookbackYears: 2 })
}

const TOO_TIRED = [
  "You've done enough wild things for one year. Age up and try again.",
  "You're running on fumes. Whatever it is, it'll have to wait until next year.",
  'Your body files a formal complaint. No more spontaneous adventures this year.',
  "Even you need a break. You've hit your limit of bold moves for the year.",
]

function tooTired(draft: GameState): void {
  notice(draft, 'Exhausted', pick(draft, TOO_TIRED), { emoji: '\u{1F634}' })
}

function applyCustomAction(draft: GameState, r: AiCustomAction): void {
  const c = draft.character
  if (!c.alive) return
  if (!useYearAction(draft, CUSTOM_ACTION_KEY, MAX_CUSTOM_ACTIONS_PER_YEAR)) {
    tooTired(draft)
    return
  }
  if (!r.possible) {
    notice(draft, r.title || 'Not Happening', r.text, { emoji: r.emoji || '\u{1F6AB}', tone: 'neutral' })
    return
  }
  const cost = -aiMoneyToDollars(draft, r.effects.money)
  const cash = Math.max(0, c.money)
  if (cost > 50 && cost > cash) {
    const price = formatMoney(cost)
    const have = formatMoney(cash)
    const lines = [
      `You can't afford that. It would cost about ${price}, and you only have ${have}.`,
      `Your bank account laughed at you. That would cost around ${price}; you have ${have}.`,
      `Dream big, spend small: that runs about ${price} and you're sitting on ${have}.`,
    ]
    notice(draft, "Can't Afford It", pick(draft, lines), { emoji: '\u{1F4B8}', tone: 'bad' })
    return
  }
  count(draft, 'customActions')
  applyOutcome(draft, r, { title: 'Do Anything', emoji: '✨' })
}

async function runCustomAction(g: GameState, text: string, settings: Settings, signal: AbortSignal): Promise<Mutator> {
  const action = text.trim().slice(0, 300)
  if (!g.character.alive || !action) return () => {}
  if (yearActionsUsed(g, CUSTOM_ACTION_KEY) >= MAX_CUSTOM_ACTIONS_PER_YEAR) return tooTired
  const result = await chatJson(
    settings,
    {
      system: narratorSystem(settings),
      messages: [{ role: 'user', content: customActionPrompt(g, action) }],
      schemaName: 'custom_action',
      schema: SCHEMAS.customAction,
      validate: validateCustomAction,
    },
    signal,
  )
  return (draft) => applyCustomAction(draft, result)
}

async function runInterview(g: GameState, task: Extract<AiTask, { type: 'interview' }>, settings: Settings, signal: AbortSignal): Promise<Mutator> {
  const q = await chatJson(
    settings,
    {
      system: narratorSystem(settings),
      messages: [{ role: 'user', content: interviewPrompt(g, task.job) }],
      schemaName: 'interview',
      schema: SCHEMAS.interview,
      validate: validateInterview,
    },
    signal,
  )
  return (draft) => {
    if (!draft.character.alive) return
    presentInterview(draft, task.job, { question: q.question, answers: shuffle(draft, q.answers) })
  }
}

async function runScreening(g: GameState, task: Extract<AiTask, { type: 'screenApplication' }>, settings: Settings, signal: AbortSignal): Promise<Mutator> {
  const app = task.app
  const school = app.kind !== 'job'
  const r = await chatJson(
    settings,
    {
      system: narratorSystem(settings),
      messages: [{ role: 'user', content: screenApplicationPrompt(g, app) }],
      schemaName: school ? 'screen_admission' : 'screen_application',
      schema: school ? SCHEMAS.screenAdmission : SCHEMAS.screen,
      validate: validateScreening,
    },
    signal,
  )
  return (draft) => {
    if (!draft.character.alive) return
    const question = r.question ? { question: r.question.question, answers: shuffle(draft, r.question.answers) } : undefined
    applyScreening(draft, app, { invite: r.invite, reason: r.reason, ...(question ? { question } : {}) })
  }
}

async function runObituary(g: GameState, settings: Settings, signal: AbortSignal): Promise<Mutator> {
  const r = await chatJson(
    settings,
    {
      system: narratorSystem(settings),
      messages: [{ role: 'user', content: obituaryPrompt(g) }],
      schemaName: 'obituary',
      schema: SCHEMAS.obituary,
      validate: validateObituary,
    },
    signal,
  )
  return (draft) => {
    draft.obituary = r.text
    draft.flags.obituarySource = 'ai'
  }
}

/**
 * Run an AI task against the active AI provider. Resolves to a mutator for a fresh draft of the
 * state. Unusable model output resolves to the offline fallback; connection/server
 * errors and aborts reject (the store then applies the fallback itself).
 */
export async function runAiTask(g: GameState, task: AiTask, settings: Settings, signal: AbortSignal): Promise<Mutator> {
  if (!g.character.alive && task.type !== 'obituary') return () => {}
  try {
    switch (task.type) {
      case 'yearEvents':
        return await runYearEvents(g, settings, signal)
      case 'resolveChoice':
        return await runResolveChoice(g, task, settings, signal)
      case 'customAction':
        return await runCustomAction(g, task.text, settings, signal)
      case 'interview':
        return await runInterview(g, task, settings, signal)
      case 'screenApplication':
        return await runScreening(g, task, settings, signal)
      case 'obituary':
        return await runObituary(g, settings, signal)
    }
  } catch (err) {
    if (err instanceof AiFormatError) return (draft) => applyFallback(draft, task)
    throw err
  }
  return (draft) => applyFallback(draft, task)
}

/** Offline version of every task (built-in event library, scripted interviews). Mutates g. */
export function applyFallback(g: GameState, task: AiTask): void {
  switch (task.type) {
    case 'yearEvents':
      if (g.character.alive) queueFallbackYearEvents(g)
      return
    case 'resolveChoice':
      if (g.character.alive) fallbackChoiceOutcome(g, task.event, task.choiceId)
      return
    case 'customAction':
      if (!g.character.alive) return
      if (!useYearAction(g, CUSTOM_ACTION_KEY, MAX_CUSTOM_ACTIONS_PER_YEAR)) {
        tooTired(g)
        return
      }
      fallbackCustomAction(g, task.text)
      return
    case 'interview':
      if (g.character.alive) presentInterview(g, task.job, fallbackInterviewQuestion(g, task.job))
      return
    case 'screenApplication':
      if (g.character.alive) applyScreening(g, task.app, offlineScreen(g, task.app))
      return
    case 'obituary':
      g.obituary = fallbackObituary(g)
      g.flags.obituarySource = 'fallback'
      return
  }
}

// ---------------------------------------------------------------------------
// Narration of scripted popups

const MONEY_RE = /-?\$\s?\d[\d,]*(?:\.\d+)?(?:\s?[KMB]\b)?/g

/** Amounts of money as written for this life ('$1,200', '¥3.5M', '1,200 kr'). */
export function moneyPattern(g: GameState): RegExp {
  const m = showMoneyIn(1, moneyContextOf(g))
  if (m.symbol === '$' && !m.suffix) return MONEY_RE
  const sym = escapeRe(m.symbol)
  const num = '\\d[\\d,]*(?:\\.\\d+)?(?:\\s?(?:K|M|B|T|Qa|Qi)\\b)?'
  return m.suffix ? new RegExp(`-?${num}\\s?${sym}`, 'g') : new RegExp(`-?${sym}\\s?${num}`, 'g')
}

function digitsOf(s: string): string {
  return s.replace(/[^\d.KMBTQai-]/g, '')
}

/** Throw SchemaError if a rewrite dropped an amount of money or the person's name. */
function checkFacts(text: string, n: NoticeModal, person: Person | undefined, re: RegExp = MONEY_RE): void {
  const facts = n.ai?.facts || n.text
  const have = new Set((text.match(re) ?? []).map(digitsOf))
  for (const amount of facts.match(re) ?? []) {
    if (!have.has(digitsOf(amount))) throw new SchemaError(`keep the exact amount ${amount.trim()}`)
  }
  if (person && (facts.includes(person.firstName) || n.text.includes(person.firstName)) && !text.includes(person.firstName)) {
    throw new SchemaError(`mention ${person.firstName} by name`)
  }
  if (/[{}]|"text"\s*:/.test(text)) throw new SchemaError('"text" must be plain prose')
}

/**
 * Rewrite a notice's text in the narrator's voice, keeping its facts. Returns the
 * original text when the model's rewrite is unusable.
 */
export async function narrateNotice(g: GameState, n: NoticeModal, settings: Settings, signal: AbortSignal): Promise<string> {
  const person = getPerson(g, n.ai?.personId)
  try {
    const r = await chatJson(
      settings,
      {
        system: narratorSystem(settings),
        messages: [{ role: 'user', content: narratePrompt(g, n, person) }],
        schemaName: 'narration',
        schema: SCHEMAS.narrate,
        validate: (v) => {
          const t = validateNarration(v)
          checkFacts(t.text, n, person, moneyPattern(g))
          return t
        },
      },
      signal,
    )
    return r.text
  } catch (err) {
    if (err instanceof AiFormatError) return n.text
    throw err
  }
}

// ---------------------------------------------------------------------------
// Conversations

const PET_FALLBACKS = ['*tilts head*', '*stares at you, then yawns*', '*sniffs your hand*', '*wanders off*']
const HUMAN_FALLBACKS = ['Hmm. Okay.', 'Sorry, what?', '*stares blankly*', "I don't know what to say to that."]

/**
 * The NPC replies in character. relationshipDelta (-5..+5) is how the player's message
 * landed; the caller applies it.
 */
export async function chatReply(
  g: GameState,
  personId: string,
  history: ChatTurn[],
  message: string,
  settings: Settings,
  signal: AbortSignal,
): Promise<ChatResult> {
  const p = getPerson(g, personId)
  if (!p) throw new Error("That person isn't part of your life anymore.")
  if (!p.alive) return { reply: `*${p.firstName} is no longer with us. Only silence answers.*`, relationshipDelta: 0, mood: 'gone' }
  const text = message.trim()
  if (!text) return { reply: p.relation === 'pet' ? '*waits patiently*' : '...?', relationshipDelta: 0, mood: 'confused' }
  try {
    const r = await chatJson(
      settings,
      {
        system: chatSystemPrompt(g, p, settings),
        messages: [{ role: 'user', content: chatUserPrompt(g, p, history, text) }],
        schemaName: 'chat_reply',
        schema: SCHEMAS.chat,
        validate: validateChat,
      },
      signal,
    )
    const prefix = new RegExp(`^\\s*(?:${escapeRe(p.firstName)}|${escapeRe(fullName(p))})\\s*:\\s*`, 'i')
    const reply = r.reply.replace(prefix, '').trim() || r.reply
    return { reply, relationshipDelta: Math.round(clampN(r.relationshipDelta, -5, 5)), mood: r.mood }
  } catch (err) {
    if (!(err instanceof AiFormatError)) throw err
    const pool = p.relation === 'pet' ? PET_FALLBACKS : HUMAN_FALLBACKS
    const idx = Math.floor(nextRandom(g.rng + history.length)[0] * pool.length)
    return { reply: pool[idx] ?? pool[0], relationshipDelta: 0, mood: 'confused' }
  }
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ---------------------------------------------------------------------------
// Connection test

function modelCount(n: number): string {
  return `${n} model${n === 1 ? '' : 's'}`
}

function listPreview(models: string[]): string {
  return `${models.slice(0, 6).join(', ')}${models.length > 6 ? '…' : ''}`
}

/** "Connected to …" wording: the generic entries read better as "your …". */
function connectedName(def: { id: string; name: string }): string {
  if (def.id === 'customLocal') return 'your local server'
  if (def.id === 'customCloud') return 'your API'
  return def.name
}

/**
 * Check the active provider: list its models, confirm the configured one exists (or pick one
 * automatically) and describe the result, e.g. "Connected to Groq · 14 models — using
 * llama-3.3-70b-versatile." Never throws: failures come back as { ok: false, message }.
 */
export async function testConnection(settings: Settings, signal?: AbortSignal): Promise<{ ok: boolean; message: string; models: string[] }> {
  resetAiSession()
  const def = providerFor(settings)
  const problem = aiConfigProblem(settings)
  if (problem) return { ok: false, message: problem, models: [] }
  const base = def.api === 'anthropic' ? normalizeAnthropicBaseUrl(settings.baseUrl) : normalizeBaseUrl(settings.baseUrl, def)
  try {
    const models = await listModels(settings, signal)
    if (models.length === 0) {
      const message =
        def.id === 'lmstudio'
          ? `LM Studio is running at ${base}, but no model is loaded. Load one in LM Studio (Developer tab or My Models).`
          : def.id === 'ollama'
            ? `Ollama is running at ${base}, but has no models yet — download one, e.g. \`ollama pull llama3.2\`.`
            : def.kind === 'local'
              ? `${def.name} is running at ${base}, but no model is loaded. Load one and test again.`
              : `Connected to ${connectedName(def)}, but it listed no chat models — type a model id in Settings.`
      return { ok: false, message, models }
    }
    const wanted = settings.model.trim()
    if (wanted && !models.some((m) => sameModel(m, wanted))) {
      return {
        ok: false,
        message: `Connected, but ${def.name} has no model called "${wanted}". Available: ${listPreview(models)}`,
        models,
      }
    }
    let using = wanted
    let note = ''
    if (!using && def.api === 'anthropic') using = anthropicModel(settings)
    if (!using && def.id === 'lmstudio') {
      let loaded: string | null = null
      try {
        loaded = await findLoadedModel(settings, signal)
      } catch (err) {
        if (signal?.aborted) throw err
      }
      using = loaded || ''
      if (loaded === '') note = ' (not loaded yet — LM Studio will load it on first use, which can take a moment)'
    }
    if (!using) {
      using = pickModel(def, models) || models[0]
      if (def.api === 'openai') rememberModel(settings, using)
    }
    return { ok: true, message: `Connected to ${connectedName(def)} · ${modelCount(models.length)} — using ${using}${note}.`, models }
  } catch (err) {
    if (signal?.aborted) return { ok: false, message: 'Connection test cancelled.', models: [] }
    return { ok: false, message: err instanceof Error ? err.message : String(err), models: [] }
  }
}
