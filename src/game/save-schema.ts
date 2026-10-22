// The shape of a saved game: its schema version, the chain that brings an older save up to date
// (migrateSave) and the structural checks that keep a damaged one out of the game. No storage
// here, so the main save and the Time Machine's snapshots can both load through it.
import { GAME_VERSION, SAVE_SCHEMA, validLogAmount, validLogSource, validLogWeight } from './core'
import { INBOX_LINK_MAX } from './inbox'
import { cleanVersions, migrateSlices } from './kernel/slices'
import './save-slices'
import { HIDDEN_KEYS, STAT_KEYS, type GameState, type ModalItem } from './types'

export { SAVE_SCHEMA }

/** The oldest schema the chain can still bring up to date; anything older is 'tooOld'. */
export const MIN_SCHEMA = 1

/**
 * What a stored value turned out to be. `ready` is a playable game and the schema it was saved at.
 * `newer` and `tooOld` name that schema and leave the value untouched, so it can be kept as it is.
 * `invalid` is everything else that can't be played.
 */
export type MigrationResult =
  | { kind: 'ready'; game: GameState; from: number }
  | { kind: 'newer' | 'tooOld'; version: number }
  | { kind: 'invalid' }

type MigrationStep = (g: GameState) => GameState

/**
 * The migration chain: STEPS[v] brings a game saved at schema v up to v + 1, in place. A step is
 * idempotent and only ever sees a value that passed isGameShell. Changing the shape of the saved
 * state takes a new step here, a bump of SAVE_SCHEMA and a fixture of the old shape.
 */
const STEPS: Readonly<Record<number, MigrationStep>> = {
  1: (g) => {
    const migrated = migrateLegacyAi(g)
    migrated.schemaVersion = 2
    return migrated
  },
  // Schema 3 is versioned slices and chunks. A v2 record is plain JSON in the shape v4.1.1 wrote, which is version 1 of every
  // slice; no slice has a migrate yet, so this moves nothing today. A later release that bumps a slice adds its migrate and
  // this step carries a v2 record through it.
  2: (g) => {
    migrateSlices(g as unknown as Record<string, unknown>, null, 1)
    g.schemaVersion = 3
    return g
  },
}

/**
 * Bring a stored value up to the current schema, in place. A save with no `schemaVersion` predates
 * the field and counts as schema 1. A newer or too-old save is reported untouched, whatever its
 * shape; anything else that can't be played is `invalid`, and junk of every kind is never a throw.
 * `opts.minSchema` replaces MIN_SCHEMA (tests use it to exercise the floor). `opts.versions` is the
 * `sv` map of a schema 3 head (the version each slice was written at; the codec reads it, R2-S4): a
 * slice below its current version is brought up by its own `migrate`. A schema 2 record has no such
 * map, so it is migrated from version 1 by STEPS[2] and `versions` is not read for it.
 */
export function migrateSave(raw: unknown, opts?: { minSchema?: number; versions?: unknown }): MigrationResult {
  if (!isRecord(raw)) return { kind: 'invalid' }
  const version = raw.schemaVersion === undefined ? 1 : raw.schemaVersion
  if (!isBoundedInteger(version, 1, Number.MAX_SAFE_INTEGER)) return { kind: 'invalid' }
  if (version > SAVE_SCHEMA) return { kind: 'newer', version }
  if (version < (opts?.minSchema ?? MIN_SCHEMA)) return { kind: 'tooOld', version }
  if (!isGameShell(raw)) return { kind: 'invalid' }
  let game = raw as unknown as GameState
  for (let v = version; v < SAVE_SCHEMA; v++) game = STEPS[v](game)
  // A schema 3 record names the slice versions it was written at; one that names none is current in every slice.
  if (version >= 3) migrateSlices(game as unknown as Record<string, unknown>, cleanVersions(opts?.versions), 'current')
  // Every load drops popups nothing could show or close, not only an upgrade: a damaged queue
  // would otherwise lock the life or fail the check below, whatever schema the save is at.
  game = migrateLegacyAi(game)
  if (!isLoadableGame(game)) return { kind: 'invalid' }
  return { kind: 'ready', game, from: version }
}

const MAX_JSON_NODES = 500_000
const MAX_JSON_DEPTH = 128
const MIN_GAME_YEAR = 1900
const MAX_GAME_YEAR = 100_000
const MAX_GAME_AGE = 10_000
const MAX_GENERATION = 1_000_000
const MAX_NEXT_ID = 1_000_000_000

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
    // The notice weight and link (Quiet Mode, R1-T5) are optional: only 'minor' and a short string are meaningful.
    if ('weight' in modal && modal.weight !== 'minor') delete modal.weight
    if ('link' in modal && (typeof modal.link !== 'string' || modal.link.length > INBOX_LINK_MAX)) delete modal.link
    repairSourceFields(modal)
    // A year card (R3, E.D2) is a plain object; the UI cleans every field of it. Anything else is not a card.
    if ('digest' in modal && !isRecord(modal.digest)) delete modal.digest
  }
  if (Array.isArray(g.log)) {
    for (const year of g.log as unknown[]) {
      const entries = year && typeof year === 'object' ? (year as { entries?: unknown }).entries : undefined
      if (!Array.isArray(entries)) continue
      for (const e of entries) {
        if (!e || typeof e !== 'object') continue
        if ((e as { tone?: unknown }).tone === 'ai') (e as { tone: string }).tone = 'neutral'
        repairSourceFields(e as Record<string, unknown>)
      }
    }
  }
  if (g.flags && typeof g.flags === 'object') {
    delete g.flags.aiRecentEvents
    delete g.flags.obituarySource
  }
  // The same pass is the one in-place clean-up every load goes through (the main save and the Time Machine).
  return repairCrimeRecords(g)
}

/**
 * The source, amount and weight of a log line or popup (R3, E.D1) are optional. A value that is not what the game writes is dropped,
 * so a damaged one never reaches the year close: `s` a name of 1 to 24 characters, `a` a whole number within 1e15, `w` 0 to 3.
 * In place, idempotent; a field that is absent or good is left exactly as it is.
 */
function repairSourceFields(item: Record<string, unknown>): void {
  if ('s' in item && !validLogSource(item.s)) delete item.s
  if ('a' in item && !validLogAmount(item.a)) delete item.a
  if ('w' in item && !validLogWeight(item.w)) delete item.w
}

/**
 * A conviction on the criminal record may carry `refund`: money an investigation took before the trial,
 * kept for an appeal. It stays when it is a finite number >= 0 and is dropped otherwise, so a damaged
 * value never costs the player the save. In place, idempotent, junk-tolerant; an old record without it is
 * left exactly as it is.
 */
export function repairCrimeRecords(g: GameState): GameState {
  const records: unknown = isRecord(g.character) ? (g.character as { criminalRecord?: unknown }).criminalRecord : undefined
  if (!Array.isArray(records)) return g
  for (const r of records) {
    if (!isRecord(r) || !('refund' in r)) continue
    if (!isFiniteNumber(r.refund) || r.refund < 0) delete r.refund
  }
  return g
}

const MODAL_KINDS: ReadonlySet<string> = new Set<ModalItem['kind']>(['notice', 'choice', 'input', 'minigame', 'aiTask'])
const MINIGAME_KINDS = new Set(['blackjack', 'horseRace', 'burglary', 'prisonEscape', 'slots', 'pickpocket', 'annualReport', 'nationReport'])

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function isFiniteNumber(value: unknown): value is number {
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
    && (value.refund === undefined || (isFiniteNumber(value.refund) && value.refund >= 0))
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
export function isGameShell(value: unknown): value is Record<string, unknown> {
  return isRecord(value)
    && finiteJsonTree(value)
    && value.version === GAME_VERSION
    && isRecord(value.character)
    && Array.isArray(value.queue)
    && Array.isArray(value.log)
    && isRecord(value.flags)
}

/** Structural boundary for browser persistence. Invalid saves fail closed instead of crashing UI. */
export function isLoadableGame(value: unknown): value is GameState {
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
