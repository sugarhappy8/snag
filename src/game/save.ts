// localStorage persistence: the current life, the ribbon collection, the graveyard, and the
// Time Machine's start-of-year snapshots.
import { GAME_VERSION } from './core'
import { refreshRoyalCareers } from './npc-lives'
import { refreshFamilyTalents } from './talents'
import { decodeSnapshotRecord, encodeSnapshotRecord } from './snapshot-codec'
import { isStartOfYear, stopOf, TIME_MACHINE_STOPS, type TimeStop } from './timeMachine'
import { HIDDEN_KEYS, STAT_KEYS, type AncestorSummary, type GameState, type Json, type ModalItem } from './types'

const SAVE_KEY = 'anotherlife.save.v1'
const RIBBONS_KEY = 'anotherlife.ribbons.v1'
const GRAVEYARD_KEY = 'anotherlife.graveyard.v1'
/** Graves kept (the oldest are bulldozed first). */
const GRAVEYARD_MAX = 100
const MAX_JSON_NODES = 500_000
const MAX_JSON_DEPTH = 128
const MIN_GAME_YEAR = 1900
const MAX_GAME_YEAR = 100_000
const MAX_GAME_AGE = 10_000
const MAX_GENERATION = 1_000_000
const MAX_NEXT_ID = 1_000_000_000

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    // quota exceeded / storage disabled
    return false
  }
}

/**
 * Save the current life. Returns false only when the browser refused even after the Time
 * Machine gave back the room its snapshots were using: snapshots never cost you the game.
 */
export function saveGame(g: GameState): boolean {
  let json: string
  try {
    json = JSON.stringify(g)
  } catch {
    return false
  }
  for (;;) {
    try {
      localStorage.setItem(SAVE_KEY, json)
      return true
    } catch {
      if (!evictLocalSnapshot()) return false
    }
  }
}

export function loadGame(): GameState | null {
  const raw = read<unknown>(SAVE_KEY)
  if (!isGameShell(raw)) return null
  const g = migrateLegacyAi(raw as unknown as GameState)
  if (!isLoadableGame(g)) return null
  refreshRoyalCareers(g)
  refreshFamilyTalents(g)
  return g
}

/**
 * Saves from when the game had an AI narrator can hold a few things only the narrator used:
 * queued notices with an 'ai' rewrite request, life-log lines with the tone 'ai', and the
 * narrator's flags. Clean them up in place (idempotent; junk-tolerant). A queued 'aiTask' modal
 * stays: the store resolves it offline like any other task (offline.ts). A queue entry that isn't
 * a popup at all (a damaged save) is dropped: nothing could ever show or close it, and the life
 * would be stuck behind it.
 */
export function migrateLegacyAi(g: GameState): GameState {
  if (!Array.isArray(g.queue)) g.queue = []
  const modalIds = new Set<string>()
  g.queue = (g.queue as unknown[]).filter(isModal).filter((modal) => !modalIds.has(modal.id) && !!modalIds.add(modal.id))
  for (const modal of g.queue as unknown as Record<string, unknown>[]) {
    if ('ai' in modal) delete modal.ai
    if (modal.tone === 'ai') modal.tone = 'neutral'
  }
  if (Array.isArray(g.log)) {
    for (const year of g.log as unknown[]) {
      const entries = year && typeof year === 'object' ? (year as { entries?: unknown }).entries : undefined
      if (!Array.isArray(entries)) continue
      for (const e of entries) if (e && typeof e === 'object' && (e as { tone?: unknown }).tone === 'ai') (e as { tone: string }).tone = 'neutral'
    }
  }
  if (g.flags && typeof g.flags === 'object') {
    delete g.flags.aiRecentEvents
    delete g.flags.obituarySource
  }
  return g
}

const MODAL_KINDS: ReadonlySet<string> = new Set<ModalItem['kind']>(['notice', 'choice', 'input', 'minigame', 'aiTask'])
const MINIGAME_KINDS = new Set(['blackjack', 'horseRace', 'burglary', 'prisonEscape', 'slots', 'pickpocket', 'annualReport', 'nationReport'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isBoundedInteger(value: unknown, min: number, max: number): value is number {
  return Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max
}

function isGameYear(value: unknown): value is number {
  return isBoundedInteger(value, MIN_GAME_YEAR, MAX_GAME_YEAR)
}

function isGameAge(value: unknown): value is number {
  return isBoundedInteger(value, 0, MAX_GAME_AGE)
}

function isGeneration(value: unknown): value is number {
  return isBoundedInteger(value, 1, MAX_GENERATION)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function validChoice(value: unknown): boolean {
  return isRecord(value) && typeof value.id === 'string' && value.id.length > 0 && typeof value.label === 'string'
}

function validChoices(value: unknown): value is { id: string; label: string }[] {
  if (!Array.isArray(value) || value.length === 0 || !value.every(validChoice)) return false
  return new Set(value.map((choice) => choice.id)).size === value.length
}

function validInterviewJob(value: unknown): boolean {
  return isRecord(value)
    && typeof value.defId === 'string'
    && typeof value.title === 'string'
    && typeof value.company === 'string'
    && typeof value.category === 'string'
    && isFiniteNumber(value.salary)
}

function validTask(value: unknown): boolean {
  if (!isRecord(value) || typeof value.type !== 'string') return false
  switch (value.type) {
    case 'yearEvents':
    case 'obituary':
      return true
    case 'customAction':
      return typeof value.text === 'string'
    case 'interview':
      return validInterviewJob(value.job)
    case 'screenApplication':
      return isRecord(value.app) && typeof value.app.kind === 'string' && typeof value.app.org === 'string' && isFiniteNumber(value.app.fit) && isFiniteNumber(value.app.chance)
    case 'resolveChoice': {
      const event = value.event
      if (typeof value.choiceId !== 'string' || !isRecord(event) || event.kind !== 'choice' || !isModal(event)) return false
      const choiceEvent = event as Extract<ModalItem, { kind: 'choice' }>
      return choiceEvent.choices.some((choice) => choice.id === value.choiceId)
    }
    default:
      return false
  }
}

/** A queue entry the game can show or resolve, including every field its renderer needs. */
function isModal(m: unknown): m is ModalItem {
  if (!isRecord(m)) return false
  const { kind, id } = m
  if (typeof kind !== 'string' || !MODAL_KINDS.has(kind) || typeof id !== 'string' || !id) return false
  switch (kind) {
    case 'notice':
      return typeof m.title === 'string' && typeof m.text === 'string'
    case 'choice':
      return typeof m.title === 'string'
        && typeof m.text === 'string'
        && validChoices(m.choices)
        && (m.source === 'ai' || (m.source === 'script' && typeof m.scriptId === 'string' && m.scriptId.length > 0))
    case 'input':
      return typeof m.title === 'string'
        && typeof m.text === 'string'
        && (m.input === 'text' || m.input === 'number' || m.input === 'slider')
        && typeof m.scriptId === 'string'
        && m.scriptId.length > 0
        && (m.min === undefined || isFiniteNumber(m.min))
        && (m.max === undefined || isFiniteNumber(m.max))
        && (m.min === undefined || m.max === undefined || m.min <= m.max)
    case 'minigame':
      return typeof m.title === 'string' && typeof m.scriptId === 'string' && m.scriptId.length > 0 && typeof m.game === 'string' && MINIGAME_KINDS.has(m.game)
    case 'aiTask':
      return validTask(m.task)
    default:
      return false
  }
}

/** Reject values JSON can parse but the engine cannot safely calculate with (notably `1e400`). */
function finiteJsonTree(value: unknown): boolean {
  const stack: [unknown, number][] = [[value, 0]]
  let seen = 0
  while (stack.length) {
    if (++seen > MAX_JSON_NODES) return false
    const [item, depth] = stack.pop()!
    if (depth > MAX_JSON_DEPTH) return false
    if (typeof item === 'number') {
      if (!Number.isFinite(item)) return false
    } else if (item && typeof item === 'object') {
      const values = Array.isArray(item) ? item : Object.values(item as Record<string, unknown>)
      for (const child of values) stack.push([child, depth + 1])
    } else if (item !== null && typeof item !== 'string' && typeof item !== 'boolean') {
      return false
    }
  }
  return true
}

function validJob(value: unknown): boolean {
  return value === null || (validInterviewJob(value)
    && isRecord(value)
    && isFiniteNumber(value.level)
    && isFiniteNumber(value.performance)
    && isFiniteNumber(value.yearsInRole)
    && isFiniteNumber(value.yearsAtCompany)
    && isRecord(value.data))
}

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string'
}

function optionalNumber(value: unknown): boolean {
  return value === undefined || isFiniteNumber(value)
}

function optionalBoolean(value: unknown): boolean {
  return value === undefined || typeof value === 'boolean'
}

function validDegree(value: unknown): boolean {
  return isRecord(value)
    && typeof value.kind === 'string'
    && typeof value.name === 'string'
    && typeof value.school === 'string'
    && isFiniteNumber(value.age)
    && optionalString(value.major)
    && optionalBoolean(value.honors)
}

function validCareerRecord(value: unknown): boolean {
  return isRecord(value)
    && typeof value.title === 'string'
    && typeof value.company === 'string'
    && isFiniteNumber(value.startAge)
    && isFiniteNumber(value.endAge)
    && typeof value.reason === 'string'
    && isFiniteNumber(value.salary)
}

function validCondition(value: unknown): boolean {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.name === 'string'
    && typeof value.kind === 'string'
    && isFiniteNumber(value.severity)
    && isFiniteNumber(value.yearsHad)
    && typeof value.curable === 'boolean'
    && typeof value.diagnosed === 'boolean'
    && isFiniteNumber(value.age)
}

function validCrimeRecord(value: unknown): boolean {
  return isRecord(value)
    && typeof value.crime === 'string'
    && isFiniteNumber(value.age)
    && typeof value.caught === 'boolean'
    && typeof value.convicted === 'boolean'
    && optionalNumber(value.sentenceYears)
}

function validPrison(value: unknown): boolean {
  return value === null || (isRecord(value)
    && typeof value.name === 'string'
    && typeof value.security === 'string'
    && typeof value.crime === 'string'
    && isFiniteNumber(value.sentenceYears)
    && isFiniteNumber(value.yearsServed)
    && isFiniteNumber(value.respect)
    && typeof value.appealed === 'boolean'
    && isFiniteNumber(value.escapeAttempts)
    && optionalString(value.gang)
    && optionalBoolean(value.life)
    && optionalBoolean(value.deathRow))
}

function validLoan(value: unknown): boolean {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.kind === 'string'
    && typeof value.lender === 'string'
    && isFiniteNumber(value.balance)
    && isFiniteNumber(value.yearlyPayment)
    && isFiniteNumber(value.rate)
    && optionalNumber(value.yearsLeft)
    && optionalString(value.countryId)
    && validRateTerms(value)
}

function validRateTerms(value: Record<string, unknown>): boolean {
  return (value.rateType === undefined || value.rateType === 'fixed' || value.rateType === 'variable')
    && optionalNumber(value.rateMargin)
    && (value.rateType !== 'variable' || isFiniteNumber(value.rateMargin))
}

function validResidence(value: unknown): boolean {
  return isRecord(value)
    && typeof value.status === 'string'
    && optionalString(value.assetId)
    && optionalNumber(value.rent)
    && optionalString(value.description)
}

function validSocial(value: unknown): boolean {
  return value === null || (isRecord(value)
    && typeof value.platform === 'string'
    && typeof value.handle === 'string'
    && isFiniteNumber(value.followers)
    && typeof value.verified === 'boolean'
    && typeof value.monetized === 'boolean')
}

function validImmigration(value: unknown): boolean {
  return value === undefined || (isRecord(value)
    && typeof value.countryId === 'string'
    && typeof value.status === 'string'
    && isFiniteNumber(value.since)
    && optionalString(value.visa)
    && optionalNumber(value.expires))
}

function validCvEntry(value: unknown): boolean {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.kind === 'string'
    && typeof value.title === 'string'
    && typeof value.org === 'string'
    && isFiniteNumber(value.startAge)
    && optionalNumber(value.endAge)
    && typeof value.detail === 'string'
    && isFiniteNumber(value.strength)
    && typeof value.embellished === 'boolean'
    && (value.tags === undefined || isStringArray(value.tags))
    && optionalString(value.source)
}

function validMortgage(value: unknown): boolean {
  return value === undefined || (isRecord(value)
    && typeof value.lender === 'string'
    && isFiniteNumber(value.balance)
    && isFiniteNumber(value.yearlyPayment)
    && isFiniteNumber(value.yearsLeft)
    && isFiniteNumber(value.rate)
    && validRateTerms(value))
}

function validCharacter(value: unknown): boolean {
  if (!isRecord(value)) return false
  const strings = ['id', 'firstName', 'lastName', 'gender', 'sexuality', 'zodiac', 'countryId', 'city', 'birthCountryId']
  if (!strings.every((key) => typeof value[key] === 'string')) return false
  if (!isGameAge(value.age) || typeof value.alive !== 'boolean' || !optionalString(value.causeOfDeath) || !isFiniteNumber(value.money)) return false
  if (!isRecord(value.birthday) || !isFiniteNumber(value.birthday.month) || !isFiniteNumber(value.birthday.day)) return false
  if (!isRecord(value.avatar) || !isFiniteNumber(value.avatar.skinTone) || typeof value.avatar.hair !== 'string' || typeof value.avatar.eyes !== 'string') return false
  const stats = value.stats
  const hidden = value.hidden
  if (!isRecord(stats) || !STAT_KEYS.every((key) => isFiniteNumber(stats[key]))) return false
  if (!isRecord(hidden) || !HIDDEN_KEYS.every((key) => isFiniteNumber(hidden[key]))) return false
  if (!isRecord(value.education)
    || !Array.isArray(value.education.degrees)
    || !value.education.degrees.every(validDegree)
    || !isStringArray(value.education.completed)
    || !isStringArray(value.education.droppedOut)
    || !isFiniteNumber(value.education.expelled)) return false
  const enrollment = value.education.current
  if (enrollment !== null && (!isRecord(enrollment)
    || typeof enrollment.level !== 'string'
    || typeof enrollment.school !== 'string'
    || !isFiniteNumber(enrollment.year)
    || !isFiniteNumber(enrollment.totalYears)
    || !isFiniteNumber(enrollment.grades)
    || !isRecord(enrollment.data))) return false
  return validJob(value.job)
    && validJob(value.partTimeJob)
    && Array.isArray(value.careerHistory)
    && value.careerHistory.every(validCareerRecord)
    && typeof value.retired === 'boolean'
    && isFiniteNumber(value.pension)
    && Array.isArray(value.conditions)
    && value.conditions.every(validCondition)
    && isStringArray(value.licenses)
    && Array.isArray(value.criminalRecord)
    && value.criminalRecord.every(validCrimeRecord)
    && validPrison(value.prison)
    && isFiniteNumber(value.wantedLevel)
    && validResidence(value.residence)
    && Array.isArray(value.loans)
    && value.loans.every(validLoan)
    && validSocial(value.social)
    && (value.talent === null || typeof value.talent === 'string')
    && isStringArray(value.memories)
    && isStringArray(value.willBeneficiaries)
    && (value.religion === null || typeof value.religion === 'string')
    && (value.talents === undefined || isStringArray(value.talents))
    && (value.citizenships === undefined || isStringArray(value.citizenships))
    && validImmigration(value.immigration)
    && (value.cv === undefined || (Array.isArray(value.cv) && value.cv.every(validCvEntry)))
}

function validPerson(value: unknown): boolean {
  if (!isRecord(value)) return false
  const stats = value.stats
  return isRecord(stats)
    && typeof value.id === 'string'
    && typeof value.firstName === 'string'
    && typeof value.lastName === 'string'
    && typeof value.gender === 'string'
    && isFiniteNumber(value.age)
    && typeof value.alive === 'boolean'
    && optionalString(value.causeOfDeath)
    && typeof value.relation === 'string'
    && isFiniteNumber(value.relationship)
    && STAT_KEYS.every((key) => isFiniteNumber(stats[key]))
    && isFiniteNumber(value.money)
    && typeof value.occupation === 'string'
    && isStringArray(value.traits)
    && optionalString(value.species)
    && optionalString(value.breed)
    && optionalString(value.otherParentId)
    && optionalBoolean(value.biological)
    && optionalString(value.contextId)
    && optionalBoolean(value.pregnant)
    && isFiniteNumber(value.yearsKnown)
    && typeof value.livesWithPlayer === 'boolean'
    && isStringArray(value.notes)
    && isRecord(value.data)
}

function validAsset(value: unknown): boolean {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.kind === 'string'
    && typeof value.name === 'string'
    && typeof value.emoji === 'string'
    && isFiniteNumber(value.purchasePrice)
    && isFiniteNumber(value.value)
    && isFiniteNumber(value.condition)
    && isFiniteNumber(value.purchasedAge)
    && validMortgage(value.mortgage)
    && isFiniteNumber(value.upkeep)
    && isRecord(value.details)
    && optionalNumber(value.rentedOutFor)
}

function validAncestor(value: unknown): boolean {
  return isRecord(value)
    && optionalString(value.countryId)
    && isGeneration(value.generation)
    && typeof value.name === 'string'
    && typeof value.gender === 'string'
    && isGameYear(value.bornYear)
    && isGameYear(value.diedYear)
    && isGameAge(value.age)
    && typeof value.causeOfDeath === 'string'
    && isFiniteNumber(value.netWorth)
    && typeof value.occupation === 'string'
    && (value.ribbon === null || typeof value.ribbon === 'string')
}

function validLogYear(value: unknown): boolean {
  return isRecord(value)
    && isGameAge(value.age)
    && isGameYear(value.year)
    && Array.isArray(value.entries)
    && value.entries.every((entry) => isRecord(entry) && typeof entry.id === 'string' && typeof entry.text === 'string' && typeof entry.tone === 'string')
}

/** Cheap shell check before a damaged value is passed to the legacy queue migration. */
function isGameShell(value: unknown): value is Record<string, unknown> {
  return isRecord(value)
    && finiteJsonTree(value)
    && value.version === GAME_VERSION
    && isRecord(value.character)
    && Array.isArray(value.queue)
    && Array.isArray(value.log)
    && isRecord(value.flags)
}

/** Structural boundary for browser persistence. Invalid saves fail closed instead of crashing UI. */
function isLoadableGame(value: unknown): value is GameState {
  if (!isRecord(value) || !finiteJsonTree(value) || value.version !== GAME_VERSION || typeof value.lifeId !== 'string' || !value.lifeId) return false
  if (!isFiniteNumber(value.rng)
    || !isBoundedInteger(value.nextId, 0, MAX_NEXT_ID)
    || !isGameYear(value.year)
    || !isGeneration(value.generation)) return false
  if (!validCharacter(value.character)) return false
  if (!Array.isArray(value.people) || !value.people.every(validPerson)) return false
  if (!Array.isArray(value.assets) || !value.assets.every(validAsset)) return false
  if (!Array.isArray(value.log) || !value.log.every(validLogYear)) return false
  if (!Array.isArray(value.queue) || !value.queue.every(isModal)) return false
  if (!Array.isArray(value.ancestors) || !value.ancestors.every(validAncestor)) return false
  if (!isRecord(value.counters) || !Object.values(value.counters).every(isFiniteNumber)) return false
  if (!isRecord(value.yearActions) || !Object.values(value.yearActions).every(isFiniteNumber)) return false
  if (!isRecord(value.flags)) return false
  return (value.ribbon === null || typeof value.ribbon === 'string') && (value.obituary === null || typeof value.obituary === 'string')
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY)
  } catch {
    // ignore
  }
}

/** Ribbon id -> times earned. */
export function loadRibbons(): Record<string, number> {
  const raw = read<unknown>(RIBBONS_KEY)
  if (!isRecord(raw)) return {}
  const out: Record<string, number> = {}
  for (const [id, count] of Object.entries(raw)) {
    if (!id || id === '__proto__' || id === 'constructor' || id === 'prototype' || !isFiniteNumber(count) || count <= 0) continue
    out[id] = Math.floor(count)
  }
  return out
}

/** Count one more earning of a ribbon. False when the browser refused to store it. */
export function recordRibbon(id: string): boolean {
  const all = loadRibbons()
  all[id] = (all[id] ?? 0) + 1
  return write(RIBBONS_KEY, all)
}

/** Take back one earning of a ribbon (a death the Time Machine undid). */
export function unrecordRibbon(id: string): void {
  const all = loadRibbons()
  const n = all[id] ?? 0
  if (n <= 0) return
  if (n === 1) delete all[id]
  else all[id] = n - 1
  write(RIBBONS_KEY, all)
}

export interface GraveyardEntry extends AncestorSummary {
  lifeId: string
  obituary: string | null
}

export function loadGraveyard(): GraveyardEntry[] {
  const raw = read<unknown>(GRAVEYARD_KEY)
  if (!Array.isArray(raw)) return []
  const out: GraveyardEntry[] = []
  for (const entry of raw) {
    if (!isRecord(entry)) continue
    const valid = typeof entry.lifeId === 'string'
      && typeof entry.name === 'string'
      && typeof entry.gender === 'string'
      && isFiniteNumber(entry.generation)
      && isFiniteNumber(entry.bornYear)
      && isFiniteNumber(entry.diedYear)
      && isFiniteNumber(entry.age)
      && typeof entry.causeOfDeath === 'string'
      && isFiniteNumber(entry.netWorth)
      && typeof entry.occupation === 'string'
      && (entry.ribbon === undefined || entry.ribbon === null || typeof entry.ribbon === 'string')
      && (entry.obituary === undefined || entry.obituary === null || typeof entry.obituary === 'string')
      && (entry.countryId === undefined || typeof entry.countryId === 'string')
    if (!valid) continue
    out.push({ ...(entry as unknown as GraveyardEntry), ribbon: typeof entry.ribbon === 'string' ? entry.ribbon : null, obituary: typeof entry.obituary === 'string' ? entry.obituary : null })
    if (out.length >= GRAVEYARD_MAX) break
  }
  return out
}

/**
 * Bury a life (replacing an older grave of the same life). Returns the old graves that had to
 * make room, or null when the browser refused to store it.
 */
export function addToGraveyard(entry: GraveyardEntry): GraveyardEntry[] | null {
  const all = loadGraveyard().filter((e) => e.lifeId !== entry.lifeId)
  all.unshift(entry)
  return write(GRAVEYARD_KEY, all.slice(0, GRAVEYARD_MAX)) ? all.slice(GRAVEYARD_MAX) : null
}

export function removeFromGraveyard(lifeId: string): void {
  write(GRAVEYARD_KEY, loadGraveyard().filter((e) => e.lifeId !== lifeId))
}

/**
 * Record a finished life: its ribbon and its grave. Notes in g.flags exactly what was stored,
 * so the Time Machine can take precisely that back (unrecordDeath).
 */
export function recordDeath(g: GameState, entry: GraveyardEntry): void {
  g.flags.deathRecorded = true
  g.flags.recordedRibbon = g.ribbon && recordRibbon(g.ribbon) ? g.ribbon : null
  const bumped = addToGraveyard(entry)
  g.flags.recordedGrave = bumped !== null
  if (bumped && bumped.length > 0) g.flags.bumpedGraves = bumped as unknown as Json
}

/**
 * The death of `g` never happened (the Time Machine undid it): take back its grave (restoring
 * any old grave it pushed out) and the ribbon recorded for it.
 */
export function unrecordDeath(g: GameState): void {
  if (g.flags.deathRecorded !== true) return
  // Deaths recorded before these notes existed recorded both.
  const legacy = !('recordedGrave' in g.flags)
  if (legacy || g.flags.recordedGrave === true) {
    const all = loadGraveyard()
    const graves = all.filter((e) => e.lifeId !== g.lifeId)
    // Old graves this death pushed out come back, unless its grave is already gone (the
    // graveyard was cleared, or the grave bulldozed): then nothing should reappear. The ribbon
    // is taken back either way, so bulldozing your own grave can't keep it.
    const stillThere = graves.length < all.length
    const bumped = stillThere && Array.isArray(g.flags.bumpedGraves) ? (g.flags.bumpedGraves as unknown as GraveyardEntry[]) : []
    for (const old of bumped) if (old && typeof old.lifeId === 'string' && !graves.some((e) => e.lifeId === old.lifeId)) graves.push(old)
    if (graves.length !== all.length || bumped.length > 0) write(GRAVEYARD_KEY, graves.slice(0, GRAVEYARD_MAX))
  }
  const ribbon = legacy ? g.ribbon : g.flags.recordedRibbon
  if (typeof ribbon === 'string' && ribbon) unrecordRibbon(ribbon)
}

/** Forget every earned ribbon and past life (Settings → Danger zone). */
export function clearRibbonsAndGraveyard(): void {
  try {
    localStorage.removeItem(RIBBONS_KEY)
    localStorage.removeItem(GRAVEYARD_KEY)
  } catch {
    // storage disabled
  }
}

// ---------------------------------------------------------------------------
// Time Machine snapshots
//
// The life as it was at the start of each of its last TIME_MACHINE_STOPS years, kept apart
// from the main save so a slow or failed snapshot can never cost the player their game.
//
// - Payloads live in IndexedDB (plenty of room). Without it they fall back to localStorage
//   under LOCAL_SNAPSHOT_BUDGET characters, giving their room back whenever the main save
//   needs it, and failing that to memory (lost on reload).
// - They are compact: the life log is most of a late-game save (about 70% of the ~100-300 KB
//   of a 70-year life), so each year of it is stored once as a chunk shared by every snapshot
//   that contains it unchanged. Ten snapshots cost little more than one.
// - A small index in localStorage lists the snapshots (age, year, a summary, the chunks each
//   one uses), so menus can read it synchronously and it survives reloads.
// - Every storage operation runs one at a time on a promise chain; snapshotWritesSettled()
//   waits for it.

export type SnapshotBackendName = 'idb' | 'local' | 'memory'

/** Where snapshot payloads are kept: a tiny async key-value store. */
export interface SnapshotBackend {
  name: SnapshotBackendName
  get(keys: string[]): Promise<(string | null)[]>
  /** All or nothing: on failure nothing from this batch is left behind. */
  put(entries: [string, string][]): Promise<void>
  remove(keys: string[]): Promise<void>
  keys(): Promise<string[]>
  /** Characters in use (localStorage only, to stay inside its budget). */
  usage?(): number
}

const INDEX_KEY = 'anotherlife.timemachine.v1'
const LOCAL_PREFIX = 'anotherlife.tm.'
/** localStorage is ~5 MB per site: leave most of it to the main save, ribbons and graveyard. */
export const LOCAL_SNAPSHOT_BUDGET = 1_500_000
const IDB_NAME = 'anotherlife-timemachine'
const IDB_STORE = 'snapshots'

interface StoredStop extends TimeStop {
  /** Id of the snapshot's record (content hash: a write never overwrites a live snapshot). */
  rec: string
  /** Log chunk ids this snapshot uses, oldest year first. */
  chunks: string[]
}

interface TimeIndex {
  v: 1
  lifeId: string
  /** Backend holding the payloads (null until the first snapshot is written). */
  where: SnapshotBackendName | null
  /** Age whose start-of-year snapshot is still owed (see isStartOfYear). */
  pending: number | null
  /** Oldest first. */
  stops: StoredStop[]
}

const NO_STOPS: readonly TimeStop[] = Object.freeze([])

function emptyIndex(lifeId = ''): TimeIndex {
  return { v: 1, lifeId, where: null, pending: null, stops: [] }
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function readStop(v: unknown): StoredStop | null {
  if (!v || typeof v !== 'object') return null
  const s = v as Record<string, unknown>
  if (!isNum(s.age) || !isNum(s.year) || typeof s.rec !== 'string') return null
  if (!Array.isArray(s.chunks) || !s.chunks.every((c) => typeof c === 'string')) return null
  const stop: StoredStop = {
    age: s.age,
    year: s.year,
    money: isNum(s.money) ? s.money : 0,
    role: typeof s.role === 'string' ? s.role : '',
    rec: s.rec,
    chunks: s.chunks as string[],
  }
  if (typeof s.countryId === 'string' && s.countryId) stop.countryId = s.countryId
  if (isNum(s.nominalScale) && s.nominalScale > 0) stop.nominalScale = s.nominalScale
  if (isNum(s.usdNominalScale) && s.usdNominalScale > 0) stop.usdNominalScale = s.usdNominalScale
  return stop
}

function loadIndex(): TimeIndex {
  const raw = read<Record<string, unknown>>(INDEX_KEY)
  if (!raw || raw.v !== 1 || typeof raw.lifeId !== 'string') return emptyIndex()
  const where = raw.where === 'idb' || raw.where === 'local' ? raw.where : null
  const stops = where && Array.isArray(raw.stops) ? raw.stops.map(readStop).filter((s): s is StoredStop => s !== null) : []
  stops.sort((a, b) => a.age - b.age)
  // Memory snapshots died with the previous page.
  return { v: 1, lifeId: raw.lifeId, where, pending: isNum(raw.pending) ? raw.pending : null, stops }
}

let index: TimeIndex = loadIndex()
/** Bumped whenever the timeline changes under in-flight writes (new life, a jump, a reset). */
let epoch = 0
const listeners = new Set<() => void>()

function saveIndex(): void {
  write(INDEX_KEY, index)
}

function changed(next: Partial<TimeIndex>): void {
  index = { ...index, ...next }
  saveIndex()
  for (const l of listeners) l()
}

/** Snapshots of `lifeId` the Time Machine can use, oldest first (stable until they change). */
export function timeStops(lifeId: string): readonly TimeStop[] {
  return index.lifeId === lifeId && index.stops.length ? index.stops : NO_STOPS
}

/** Called whenever the list of snapshots changes. Returns an unsubscribe function. */
export function subscribeTimeStops(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// --- Backends ----------------------------------------------------------------------------

export function memorySnapshotBackend(): SnapshotBackend {
  const data = new Map<string, string>()
  return {
    name: 'memory',
    get: async (keys) => keys.map((k) => data.get(k) ?? null),
    put: async (entries) => {
      for (const [k, v] of entries) data.set(k, v)
    },
    remove: async (keys) => {
      for (const k of keys) data.delete(k)
    },
    keys: async () => [...data.keys()],
  }
}

function localKeys(): string[] {
  const out: string[] = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(LOCAL_PREFIX)) out.push(k.slice(LOCAL_PREFIX.length))
    }
  } catch {
    // storage disabled
  }
  return out
}

function localRemove(keys: string[]): void {
  for (const k of keys) {
    try {
      localStorage.removeItem(LOCAL_PREFIX + k)
    } catch {
      // ignore
    }
  }
}

export function localSnapshotBackend(): SnapshotBackend {
  return {
    name: 'local',
    get: async (keys) =>
      keys.map((k) => {
        try {
          return localStorage.getItem(LOCAL_PREFIX + k)
        } catch {
          return null
        }
      }),
    put: async (entries) => {
      const done: string[] = []
      try {
        for (const [k, v] of entries) {
          localStorage.setItem(LOCAL_PREFIX + k, v)
          done.push(k)
        }
      } catch (err) {
        localRemove(done)
        throw err
      }
    },
    remove: async (keys) => localRemove(keys),
    keys: async () => localKeys(),
    usage: () => {
      let n = 0
      try {
        for (const k of localKeys()) n += k.length + LOCAL_PREFIX.length + (localStorage.getItem(LOCAL_PREFIX + k)?.length ?? 0)
      } catch {
        // ignore
      }
      return n
    },
  }
}

function openIdb(): Promise<SnapshotBackend> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'))
      return
    }
    // Private modes and blocked storage can leave open() hanging: don't wait forever.
    const timer = setTimeout(() => reject(new Error('IndexedDB timed out')), 4000)
    let req: IDBOpenDBRequest
    try {
      req = indexedDB.open(IDB_NAME, 1)
    } catch (err) {
      clearTimeout(timer)
      reject(err)
      return
    }
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_STORE)) req.result.createObjectStore(IDB_STORE)
    }
    req.onerror = () => {
      clearTimeout(timer)
      reject(req.error)
    }
    req.onblocked = () => {
      clearTimeout(timer)
      reject(new Error('IndexedDB blocked'))
    }
    req.onsuccess = () => {
      clearTimeout(timer)
      const db = req.result
      const run = (mode: IDBTransactionMode, fn: (store: IDBObjectStore) => void): Promise<void> =>
        new Promise((done, fail) => {
          const tx = db.transaction(IDB_STORE, mode)
          tx.oncomplete = () => done()
          tx.onerror = () => fail(tx.error)
          tx.onabort = () => fail(tx.error ?? new Error('IndexedDB transaction aborted'))
          fn(tx.objectStore(IDB_STORE))
        })
      resolve({
        name: 'idb',
        get: async (keys) => {
          const out: (string | null)[] = keys.map(() => null)
          await run('readonly', (store) =>
            keys.forEach((k, i) => {
              const req = store.get(k)
              req.onsuccess = () => {
                out[i] = typeof req.result === 'string' ? req.result : null
              }
            }),
          )
          return out
        },
        put: (entries) => run('readwrite', (store) => entries.forEach(([k, v]) => store.put(v, k))),
        remove: (keys) => run('readwrite', (store) => keys.forEach((k) => store.delete(k))),
        keys: async () => {
          let out: string[] = []
          await run('readonly', (store) => {
            const req = store.getAllKeys()
            req.onsuccess = () => {
              out = req.result.map(String)
            }
          })
          return out
        },
      })
    }
  })
}

function localStorageWorks(): boolean {
  try {
    const k = `${LOCAL_PREFIX}probe`
    localStorage.setItem(k, '1')
    localStorage.removeItem(k)
    return true
  } catch {
    return false
  }
}

let backendOverride: SnapshotBackend | null = null
let backendPromise: Promise<SnapshotBackend> | null = null

function backend(): Promise<SnapshotBackend> {
  if (backendOverride) return Promise.resolve(backendOverride)
  backendPromise ??= openIdb().catch(() => (localStorageWorks() ? localSnapshotBackend() : memorySnapshotBackend()))
  return backendPromise
}

/**
 * Use `b` for snapshot payloads (tests, or a host with its own storage); null goes back to the
 * automatic choice. Snapshots kept by the previous backend are dropped at the next write.
 */
export function setSnapshotBackend(b: SnapshotBackend | null): void {
  backendOverride = b
  backendPromise = null
}

// --- The serial queue ----------------------------------------------------------------------

let chain: Promise<unknown> = Promise.resolve()

/**
 * A storage operation still running after this long is given up on, so storage that stops
 * answering (a stuck IndexedDB transaction) can't hold every later snapshot and jump forever.
 */
export const SNAPSHOT_OP_TIMEOUT_MS = 20_000

function limited<T>(p: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      // The stuck operation may still finish later: a write then gives up instead of listing a
      // year whose pieces were swept meanwhile.
      epoch++
      reject(new Error('Snapshot storage timed out'))
    }, SNAPSHOT_OP_TIMEOUT_MS)
    p.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}

function enqueue<T>(op: () => Promise<T>, fallback: T): Promise<T> {
  const run = chain.then(() => limited(op())).catch(() => fallback)
  chain = run
  return run
}

/** Resolves once every queued snapshot write, read and cleanup has finished. */
export function snapshotWritesSettled(): Promise<void> {
  return chain.then(
    () => undefined,
    () => undefined,
  )
}

// --- Packing -------------------------------------------------------------------------------

function recordKey(lifeId: string, rec: string): string {
  return `s|${lifeId}|${rec}`
}

function chunkKey(lifeId: string, id: string): string {
  return `l|${lifeId}|${id}`
}

/** Two independent 32-bit FNV-style hashes plus the length: plenty for a few hundred chunks. */
function hashText(s: string): string {
  let a = 0x811c9dc5
  let b = 0x01000193 ^ s.length
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    a = Math.imul(a ^ c, 16777619)
    b = Math.imul(b ^ c, 0x5bd1e995)
    b ^= b >>> 13
  }
  return `${(a >>> 0).toString(36)}${(b >>> 0).toString(36)}${s.length.toString(36)}`
}

interface Packed {
  lifeId: string
  age: number
  stop: TimeStop
  /** The state with its log replaced by chunk ids (same key order as the original). */
  record: string
  rec: string
  chunks: [string, string][]
}

function pack(g: GameState): Packed {
  const chunks: [string, string][] = []
  const ids: string[] = []
  for (const year of g.log) {
    const json = JSON.stringify(year)
    const id = `${year.age}.${hashText(json)}`
    ids.push(id)
    chunks.push([id, json])
  }
  // The next year's opening world is this year's closing world. Share those large
  // immutable frames across time stops just like log years, preserving exact JSON.
  const flags = { ...g.flags }, world = flags.worldEconomy
  if (isRecord(world) && (world.v === 1 || world.v === 2)) {
    const packed = { ...world }
    for (const key of ['countries', 'previous']) if (isRecord(packed[key])) {
      const json = JSON.stringify(packed[key]), id = `world.${hashText(json)}`
      chunks.push([id, json]); packed[key] = id
    }
    if (isRecord(packed.history)) {
      const frames = new Map<number, Record<string, unknown>>()
      for (const [country, points] of Object.entries(packed.history)) if (Array.isArray(points)) for (const point of points) if (isRecord(point) && isFiniteNumber(point.year)) {
        const frame = frames.get(point.year) ?? {}
        frame[country] = point; frames.set(point.year, frame)
      }
      const historyIds = [...frames].sort(([a], [b]) => a - b).map(([, frame]) => {
        const json = JSON.stringify(frame), id = `history.${hashText(json)}`
        chunks.push([id, json]); return id
      })
      packed.history = { snapshotYears: historyIds, countryOrder: Object.keys(packed.history) }
    }
    flags.worldEconomy = packed as typeof world
  }
  const record = JSON.stringify({ ...g, log: ids, flags })
  const rec = `${g.character.age}.${hashText(record)}`
  return { lifeId: g.lifeId, age: g.character.age, stop: stopOf(g), record, rec, chunks }
}

function referencedChunks(): Set<string> {
  const out = new Set<string>()
  for (const s of index.stops) for (const c of s.chunks) out.add(c)
  return out
}

/** Every storage key the index refers to. */
function liveKeys(): Set<string> {
  const keep = new Set<string>()
  for (const s of index.stops) {
    keep.add(recordKey(index.lifeId, s.rec))
    for (const c of s.chunks) keep.add(chunkKey(index.lifeId, c))
  }
  return keep
}

/** Make storage match the index: drop payloads and chunks nothing refers to (and other lives'). */
async function sweep(b: SnapshotBackend): Promise<void> {
  const keep = liveKeys()
  const drop = (await b.keys()).filter((k) => !keep.has(k))
  if (drop.length) await b.remove(drop)
}

/** Add (or replace) a stop, keeping the newest TIME_MACHINE_STOPS by age. */
function addStop(stop: StoredStop): void {
  const stops = index.stops.filter((s) => s.age !== stop.age)
  stops.push(stop)
  stops.sort((a, b) => a.age - b.age)
  changed({ stops: stops.slice(Math.max(0, stops.length - TIME_MACHINE_STOPS)) })
}

async function writeSnapshot(p: Packed, at: number): Promise<boolean> {
  // World frames are shared separately, so each remaining record is often only
  // 10–30 KB. Compress these too: ten small repeated family/asset records still
  // compete with the expanding world for the same fixed browser-storage budget.
  const encodedRecord = await encodeSnapshotRecord(p.record, 1000)
  const encodedChunks = await Promise.all(p.chunks.map(async ([id, json]) => [id, id.startsWith('world.') || id.startsWith('history.') ? await encodeSnapshotRecord(json, 1000) : json] as [string, string]))
  const b = await backend()
  const current = () => epoch === at && index.lifeId === p.lifeId
  if (!current()) return false
  if (index.where !== b.name) {
    // The old payloads (if any) are somewhere this page can't reach: start over here.
    if (index.where === 'local' && b.name !== 'local') localRemove(localKeys())
    changed({ where: b.name, stops: [] })
    await sweep(b)
  }
  for (;;) {
    if (!current()) return false
    const have = referencedChunks()
    const entries: [string, string][] = [[recordKey(p.lifeId, p.rec), encodedRecord]]
    for (const [id, json] of encodedChunks) {
      if (have.has(id)) continue
      have.add(id)
      entries.push([chunkKey(p.lifeId, id), json])
    }
    const size = entries.reduce((n, [k, v]) => n + k.length + v.length + LOCAL_PREFIX.length, 0)
    const fits = !b.usage || b.usage() + size <= LOCAL_SNAPSHOT_BUDGET
    if (fits) {
      try {
        await b.put(entries)
        break
      } catch {
        // Full: make room below and try again.
      }
    }
    // Make room by forgetting the oldest year (never the one being replaced).
    const oldest = index.stops.find((s) => s.age !== p.age)
    if (!oldest) return false
    changed({ stops: index.stops.filter((s) => s !== oldest) })
    await sweep(b)
  }
  if (!current()) {
    await sweep(b)
    return false
  }
  addStop({ ...p.stop, rec: p.rec, chunks: p.chunks.map(([id]) => id) })
  await sweep(b)
  return true
}

// --- The timeline --------------------------------------------------------------------------

/**
 * A new timeline: a new life, an heir, or "Live again". Forgets every snapshot of the previous
 * one; `pendingAge` is the age whose start-of-year snapshot to take once its popups are done.
 */
export function startTimeline(lifeId: string, pendingAge: number | null): void {
  epoch++
  index = { ...emptyIndex(lifeId), pending: pendingAge }
  saveIndex()
  for (const l of listeners) l()
  void enqueue(async () => sweep(await backend()), undefined)
}

/** A saved life was loaded: keep its snapshots, or start fresh if they belong to another life. */
export function resumeTimeline(lifeId: string): void {
  if (index.lifeId !== lifeId) startTimeline(lifeId, null)
}

/** Forget every snapshot (the life was abandoned). */
export function clearTimeline(): void {
  startTimeline('', null)
}

/** The next start-of-year snapshot is owed at `age` (the birthday is happening now). */
export function expectSnapshot(lifeId: string, age: number): void {
  if (index.lifeId !== lifeId) startTimeline(lifeId, age)
  else changed({ pending: age })
}

/**
 * Take the start-of-year snapshot if it is owed now (see isStartOfYear). Call after every
 * committed change; cheap when nothing is owed. Never throws: snapshots are best-effort.
 */
export function snapshotIfDue(g: GameState): Promise<boolean> {
  if (index.lifeId !== g.lifeId || index.pending === null) return Promise.resolve(false)
  if (!g.character.alive) {
    // Died before the year really started: nothing to keep.
    changed({ pending: null })
    return Promise.resolve(false)
  }
  if (!isStartOfYear(g, index.pending)) return Promise.resolve(false)
  changed({ pending: null })
  return takeSnapshot(g)
}

/** Snapshot `g` now (it must be the committed state of the current timeline). */
export function takeSnapshot(g: GameState): Promise<boolean> {
  if (index.lifeId !== g.lifeId) return Promise.resolve(false)
  let p: Packed
  try {
    p = pack(g)
  } catch {
    return Promise.resolve(false)
  }
  const at = epoch
  return enqueue(() => writeSnapshot(p, at), false)
}

/** The life exactly as it was at the start of age `age`, or null if it can't be loaded. */
export function loadSnapshot(lifeId: string, age: number): Promise<GameState | null> {
  return enqueue(async () => {
    const stop = index.lifeId === lifeId ? index.stops.find((s) => s.age === age) : undefined
    if (!stop) return null
    const b = await backend()
    if (index.where !== b.name) return null
    const [record] = await b.get([recordKey(lifeId, stop.rec)])
    if (!record) return null
    const g = JSON.parse(await decodeSnapshotRecord(record)) as GameState
    const ids: unknown = g.log
    if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string')) return null
    const parts = await b.get(ids.map((id: string) => chunkKey(lifeId, id)))
    if (parts.some((p) => p === null)) return null
    g.log = parts.map((p) => JSON.parse(p as string))
    const world = g.flags?.worldEconomy
    if (isRecord(world) && (world.v === 1 || world.v === 2)) {
      for (const key of ['countries', 'previous']) if (typeof world[key] === 'string' && world[key].startsWith('world.')) {
        const [frame] = await b.get([chunkKey(lifeId, world[key])])
        if (!frame) return null
        world[key] = JSON.parse(await decodeSnapshotRecord(frame))
      }
      const history = world.history
      if (isRecord(history) && Array.isArray(history.snapshotYears) && Array.isArray(history.countryOrder)) {
        if (!history.snapshotYears.every(id => typeof id === 'string' && id.startsWith('history.')) || !history.countryOrder.every(id => typeof id === 'string')) return null
        const records = await b.get(history.snapshotYears.map(id => chunkKey(lifeId, id as string)))
        const restored: Record<string, Json[]> = Object.fromEntries(history.countryOrder.map(id => [id, []]))
        for (const row of records) {
          if (!row) return null
          const frame = JSON.parse(await decodeSnapshotRecord(row)) as Record<string, Json>
          for (const country of history.countryOrder as string[]) if (frame[country] !== undefined) restored[country].push(frame[country])
        }
        world.history = restored
      }
    }
    if (!isGameShell(g)) return null
    const migrated = migrateLegacyAi(g)
    if (!isLoadableGame(migrated) || migrated.lifeId !== lifeId || migrated.character.age !== age || !migrated.character.alive) return null
    refreshRoyalCareers(migrated)
    refreshFamilyTalents(migrated)
    return migrated
  }, null)
}

/** After a jump to `age`: the years after it never happened. */
export function forgetFuture(lifeId: string, age: number): void {
  if (index.lifeId !== lifeId) return
  epoch++
  changed({ pending: null, stops: index.stops.filter((s) => s.age <= age) })
  void enqueue(async () => sweep(await backend()), undefined)
}

/** Drop one snapshot that turned out to be unreadable. */
export function forgetStop(lifeId: string, age: number): void {
  if (index.lifeId !== lifeId) return
  changed({ stops: index.stops.filter((s) => s.age !== age) })
  void enqueue(async () => sweep(await backend()), undefined)
}

/**
 * The main save didn't fit: give back the room of the oldest snapshot kept in localStorage (or
 * any leftovers). Synchronous, since saveGame retries right away. False when nothing was freed.
 */
function evictLocalSnapshot(): boolean {
  const stored = localKeys()
  if (stored.length === 0) return false
  const local = index.where === 'local'
  if (local && index.stops.length > 0) index = { ...index, stops: index.stops.slice(1) }
  const keep = local ? liveKeys() : new Set<string>()
  const drop = stored.filter((k) => !keep.has(k))
  if (drop.length === 0) return false
  // A snapshot being written here right now may have just lost its chunks: let it give up cleanly.
  if (local) epoch++
  localRemove(drop)
  saveIndex()
  for (const l of listeners) l()
  return true
}
