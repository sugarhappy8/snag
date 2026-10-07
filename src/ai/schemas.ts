// JSON Schemas for each AI task (sent as response_format json_schema) and the runtime
// validators that turn whatever the model produced into clean, typed data.
//
// Schemas are deliberately flat and simple: small local models (and llama.cpp grammars)
// struggle with anyOf / nullable / deep nesting, so every field is required and "no
// change" is expressed with neutral values (0, "", "none"). Validators are forgiving:
// they accept common aliases, coerce "+10" or "-$1,500" to numbers and fill defaults,
// and only throw SchemaError when the essential text is missing.
import type { ConditionKind, Gender, NewPersonRelation } from '../game/types'

export type JsonSchema = { [key: string]: unknown }

export class SchemaError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SchemaError'
  }
}

// ---------------------------------------------------------------------------
// Schemas

const STR = { type: 'string' }
const INT = { type: 'integer' }

function object(properties: Record<string, unknown>): JsonSchema {
  return { type: 'object', properties, required: Object.keys(properties), additionalProperties: false }
}

export const NEW_PERSON_RELATIONS = ['none', 'friend', 'enemy', 'partner', 'lover', 'pet', 'coworker', 'classmate'] as const
export const CONDITION_KINDS = ['none', 'disease', 'injury', 'addiction', 'mental'] as const

export const effectsSchema: JsonSchema = object({
  happiness: INT,
  health: INT,
  smarts: INT,
  looks: INT,
  karma: INT,
  fame: INT,
  money: { type: 'number' },
  relationships: { type: 'array', maxItems: 4, items: object({ name: STR, delta: INT }) },
  newPerson: object({
    relation: { type: 'string', enum: [...NEW_PERSON_RELATIONS] },
    name: STR,
    gender: { type: 'string', enum: ['male', 'female', 'any'] },
    age: INT,
    species: STR,
  }),
  condition: object({ name: STR, kind: { type: 'string', enum: [...CONDITION_KINDS] }, severity: INT }),
  arrest: object({ crime: STR, severity: INT }),
  death: STR,
  memory: STR,
})

const choiceSchema = object({ label: STR, emoji: STR })

export const eventSchema: JsonSchema = object({
  title: STR,
  emoji: STR,
  text: STR,
  person: STR,
  choices: { type: 'array', minItems: 2, maxItems: 4, items: choiceSchema },
})

const logArray = { type: 'array', maxItems: 3, items: STR }

export const SCHEMAS = {
  /** Flavor lines plus one interactive event. */
  yearEvents: object({ log: logArray, event: eventSchema }),
  /** Flavor lines only (the engine decided there is no event this year). */
  yearLog: object({ log: logArray }),
  outcome: object({ title: STR, emoji: STR, text: STR, log: STR, effects: effectsSchema }),
  customAction: object({ possible: { type: 'boolean' }, title: STR, emoji: STR, text: STR, log: STR, effects: effectsSchema }),
  interview: object({
    question: STR,
    answers: { type: 'array', minItems: 3, maxItems: 4, items: object({ label: STR, score: INT }) },
  }),
  /** CV screening for a job: interview or not, and why. */
  screen: object({ invite: { type: 'boolean' }, reason: STR }),
  /** CV screening for a university / graduate school, plus the admissions interview question. */
  screenAdmission: object({
    invite: { type: 'boolean' },
    reason: STR,
    question: STR,
    answers: { type: 'array', maxItems: 4, items: object({ label: STR, score: INT }) },
  }),
  obituary: object({ text: STR }),
  narrate: object({ text: STR }),
  chat: object({ reply: STR, relationshipDelta: INT, mood: STR }),
} satisfies Record<string, JsonSchema>

export type SchemaName = keyof typeof SCHEMAS

// ---------------------------------------------------------------------------
// Validated shapes

export interface AiChoiceDraft {
  label: string
  emoji: string
}

export interface AiEventDraft {
  title: string
  emoji: string
  text: string
  /** Name of an existing person involved ('' if none). */
  person: string
  choices: AiChoiceDraft[]
}

export interface AiYearEvents {
  log: string[]
  event: AiEventDraft | null
}

export interface AiNewPerson {
  relation: NewPersonRelation
  name: string
  gender?: Gender
  age?: number
  species?: string
}

export interface AiEffects {
  happiness: number
  health: number
  smarts: number
  looks: number
  karma: number
  fame: number
  money: number
  /** By name; the director maps names to person ids and drops unknown ones. */
  relationships: { name: string; delta: number }[]
  newPerson: AiNewPerson | null
  condition: { name: string; kind: ConditionKind; severity: number } | null
  arrest: { crime: string; severity: number } | null
  /** Cause of death, '' when nobody dies. */
  death: string
  memory: string
}

export interface AiOutcome {
  title: string
  emoji: string
  text: string
  log: string
  effects: AiEffects
}

export interface AiCustomAction extends AiOutcome {
  possible: boolean
}

export interface AiInterview {
  question: string
  answers: { label: string; score: number }[]
}

export interface AiScreening {
  invite: boolean
  /** One short sentence for the applicant ('' if the model gave none). */
  reason: string
  /** Admissions interview question (schools, when invited and usable). */
  question?: AiInterview
}

export interface AiText {
  text: string
}

export interface AiChat {
  reply: string
  relationshipDelta: number
  mood: string
}

export const NEUTRAL_EFFECTS: AiEffects = {
  happiness: 0,
  health: 0,
  smarts: 0,
  looks: 0,
  karma: 0,
  fame: 0,
  money: 0,
  relationships: [],
  newPerson: null,
  condition: null,
  arrest: null,
  death: '',
  memory: '',
}

// ---------------------------------------------------------------------------
// Coercion helpers

type Obj = Record<string, unknown>

export function isObj(v: unknown): v is Obj {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

function requireObj(v: unknown, what: string): Obj {
  if (!isObj(v)) throw new SchemaError(`${what} must be a JSON object`)
  return v
}

/** First defined field among aliases. */
function field(o: Obj, ...names: string[]): unknown {
  for (const n of names) {
    if (o[n] !== undefined && o[n] !== null) return o[n]
  }
  return undefined
}

/** Replace names of the original game/company with neutral wording. */
export function scrubBrands(text: string): string {
  return text
    .replace(/bit\s?life/gi, 'AnotherLife')
    .replace(/candywriter/gi, 'the developers')
    .replace(/bitizenship/gi, 'membership')
    .replace(/bitizens?/gi, 'citizen')
    .replace(/god\s?mode/gi, 'Fate Mode')
}

/** Trim to at most `max` characters, cutting at a word boundary. */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const space = cut.lastIndexOf(' ')
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:-]+$/, '')}…`
}

/** Clean a free-text field: strings (or numbers) only, whitespace collapsed, brand-scrubbed. */
export function str(v: unknown, max = 400): string {
  let s = typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : ''
  s = s.replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
  // Unwrap text the model quoted twice: "\"You found a dog.\""
  if (s.length >= 2 && /^["“'].*["”']$/s.test(s) && !/["“”]/.test(s.slice(1, -1))) s = s.slice(1, -1).trim()
  return truncate(scrubBrands(s), max)
}

/** Integer from a number or numeric text ("+10", "-$1,500", "5%"), clamped. */
export function int(v: unknown, lo: number, hi: number, def = 0): number {
  return Math.round(numeric(v, lo, hi, def))
}

/** Display money can be fractional in old years or very large during hyperinflation. */
function numeric(v: unknown, lo: number, hi: number, def = 0): number {
  let n: number | undefined
  if (typeof v === 'number' && Number.isFinite(v)) n = v
  else if (typeof v === 'string') {
    const m = /([-+−]?)\s*[^\d\s+−-]{0,4}\s*(\d[\d,]*(?:\.\d+)?(?:[eE][+-]?\d+)?)\s*([kKmMbB](?=\s|$))?/.exec(v)
    if (m) {
      n = Number(m[2].replace(/,/g, ''))
      if (m[3]) n *= m[3].toLowerCase() === 'k' ? 1_000 : m[3].toLowerCase() === 'm' ? 1_000_000 : 1_000_000_000
      if (m[1] === '-' || m[1] === '−') n = -n
    }
  }
  if (n === undefined || !Number.isFinite(n)) return def
  return Math.max(lo, Math.min(hi, n))
}

function bool(v: unknown, def: boolean): boolean {
  if (typeof v === 'boolean') return v
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase()
    if (['true', 'yes', 'y', '1'].includes(s)) return true
    if (['false', 'no', 'n', '0'].includes(s)) return false
  }
  if (typeof v === 'number') return v !== 0
  return def
}

function list(v: unknown): unknown[] {
  if (Array.isArray(v)) return v
  if (v === undefined || v === null || v === '') return []
  return [v]
}

const EMOJI_RE = /\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier})*|[\u{1F1E6}-\u{1F1FF}]{2}/u

/** The first emoji in the text, or ''. */
export function firstEmoji(v: unknown): string {
  if (typeof v !== 'string') return ''
  const m = EMOJI_RE.exec(v)
  return m ? m[0] : ''
}

const NONE_WORDS = new Set(['', 'none', 'no', 'null', 'n/a', 'na', 'nothing', 'false', 'nobody', 'no one', '-'])

function own<T>(map: Record<string, T>, key: string): T | undefined {
  return Object.hasOwn(map, key) ? map[key] : undefined
}

function isNone(s: string): boolean {
  return NONE_WORDS.has(s.trim().toLowerCase())
}

/** "No one died", "not arrested", "None (survived)": small models' ways of saying "nothing happened". */
const NEGATIVE_RE = /^\s*(?:no|none|nobody|nothing|not|never|n\/a)\b|\b(?:survived?|survives|alive|unharmed|didn'?t die|did not die|doesn'?t die|does not die|no death|not (?:dead|arrested|charged|injured|sick|applicable))\b/i

function isNegative(s: string): boolean {
  return isNone(s) || NEGATIVE_RE.test(s)
}

/** A first-person life-log line: one line, no bullets / "Age 5:" prefixes, ends with punctuation. */
export function logLine(v: unknown, max = 140): string {
  let s = str(v, max * 2).split('\n')[0]
  s = s.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').replace(/^age\s*\d+\s*[:-]\s*/i, '').trim()
  s = s.replace(/^["“](.*)["”]$/, '$1').trim()
  if (!s || isNone(s)) return ''
  s = s[0].toUpperCase() + s.slice(1)
  if (!/[.!?…)"”]$/.test(s)) s += '.'
  return truncate(s, max)
}

/** A short title: no trailing punctuation, title-ish length. */
function title(v: unknown, max = 40): string {
  return str(v, max).replace(/^["“]|["”]$/g, '').replace(/[.:]+$/, '').trim()
}

/** Choice / answer label without "A)" / "1." prefixes. */
function label(v: unknown, max: number): string {
  return str(v, max)
    .replace(/^\s*(?:[a-dA-D]|\d)[.):]\s+/, '')
    .replace(/^["“](.*)["”]$/, '$1')
    .trim()
}

// ---------------------------------------------------------------------------
// Validators

function eventDraft(v: unknown): AiEventDraft {
  const o = requireObj(v, '"event"')
  const text = str(field(o, 'text', 'description', 'body', 'message', 'situation'), 420)
  if (text.length < 10) throw new SchemaError('"event.text" must describe the situation in 1-3 sentences')
  const seen = new Set<string>()
  const choices: AiChoiceDraft[] = []
  for (const raw of list(field(o, 'choices', 'options', 'answers'))) {
    const c = isObj(raw) ? raw : { label: raw }
    const lbl = label(field(c, 'label', 'text', 'option', 'choice', 'title'), 48)
    const key = lbl.toLowerCase()
    if (!lbl || seen.has(key)) continue
    seen.add(key)
    choices.push({ label: lbl, emoji: firstEmoji(c.emoji) })
    if (choices.length === 4) break
  }
  if (choices.length < 2) throw new SchemaError('"event.choices" needs 2-4 different options, each with a short "label"')
  const t = title(field(o, 'title', 'name', 'headline'))
  return {
    title: t || truncate(text.split(/[.!?]/)[0], 28),
    emoji: firstEmoji(o.emoji) || firstEmoji(t) || firstEmoji(text),
    text,
    person: str(field(o, 'person', 'who', 'character'), 60).replace(/^none$/i, ''),
    choices,
  }
}

export function validateYearEvents(v: unknown, wantEvent: boolean): AiYearEvents {
  const o = requireObj(v, 'The reply')
  const log = list(field(o, 'log', 'logs', 'lines', 'journal', 'entries'))
    .map((x) => logLine(isObj(x) ? field(x, 'text', 'line', 'log') : x))
    .filter((x) => x.length > 0)
    .slice(0, 3)
  if (!wantEvent) return { log, event: null }
  const ev = field(o, 'event', 'popup', 'scenario')
  if (!isObj(ev)) throw new SchemaError('"event" must be an object with "title", "emoji", "text", "person" and 2-4 "choices"')
  return { log, event: eventDraft(ev) }
}

const RELATION_ALIASES: Record<string, NewPersonRelation> = {
  friend: 'friend',
  bestfriend: 'friend',
  acquaintance: 'friend',
  neighbor: 'friend',
  enemy: 'enemy',
  rival: 'enemy',
  nemesis: 'enemy',
  bully: 'enemy',
  partner: 'partner',
  girlfriend: 'partner',
  boyfriend: 'partner',
  date: 'partner',
  lover: 'lover',
  fling: 'lover',
  pet: 'pet',
  dog: 'pet',
  cat: 'pet',
  coworker: 'coworker',
  colleague: 'coworker',
  classmate: 'classmate',
  student: 'classmate',
}

const KIND_ALIASES: Record<string, ConditionKind> = {
  disease: 'disease',
  illness: 'disease',
  sickness: 'disease',
  infection: 'disease',
  virus: 'disease',
  injury: 'injury',
  wound: 'injury',
  addiction: 'addiction',
  mental: 'mental',
  'mental illness': 'mental',
  std: 'std',
}

function newPerson(v: unknown): AiNewPerson | null {
  if (!isObj(v)) return null
  const rel = str(field(v, 'relation', 'type', 'role'), 30).toLowerCase().replace(/[\s_-]/g, '')
  const relation = own(RELATION_ALIASES, rel)
  if (!relation) return null
  const g = str(v.gender, 10).toLowerCase()
  const gender: Gender | undefined = g === 'male' || g === 'm' ? 'male' : g === 'female' || g === 'f' ? 'female' : undefined
  const age = int(v.age, 0, 110, -1)
  const species = str(v.species, 20)
  return {
    relation,
    name: str(field(v, 'name', 'firstName'), 40).replace(/[^\p{L}\p{M}' .-]/gu, '').trim(),
    gender,
    age: age > 0 || (relation === 'pet' && age === 0) ? age : undefined,
    species: relation === 'pet' ? (species && !isNone(species) ? species[0].toUpperCase() + species.slice(1) : rel === 'cat' ? 'Cat' : 'Dog') : undefined,
  }
}

/** Effects never make a reply invalid: anything unusable becomes "no change". */
export function validateEffects(v: unknown): AiEffects {
  if (!isObj(v)) return { ...NEUTRAL_EFFECTS, relationships: [] }
  const relationships: AiEffects['relationships'] = []
  for (const r of list(v.relationships)) {
    if (!isObj(r)) continue
    const name = str(field(r, 'name', 'person', 'who'), 60)
    const delta = int(field(r, 'delta', 'change', 'amount', 'value'), -40, 40)
    if (!name || isNone(name) || delta === 0) continue
    relationships.push({ name, delta })
    if (relationships.length === 4) break
  }

  let condition: AiEffects['condition'] = null
  if (isObj(v.condition)) {
    const name = str(v.condition.name, 40)
    const kind = own(KIND_ALIASES, str(v.condition.kind, 20).toLowerCase())
    if (name && !isNegative(name) && kind) condition = { name: name[0].toUpperCase() + name.slice(1), kind, severity: int(v.condition.severity, 1, 100, 25) }
  }

  let arrest: AiEffects['arrest'] = null
  const a = v.arrest
  const crime = isObj(a) ? str(field(a, 'crime', 'charge', 'reason'), 40) : typeof a === 'string' ? str(a, 40) : a === true ? 'Disorderly Conduct' : ''
  if (crime && !isNegative(crime)) arrest = { crime: crime[0].toUpperCase() + crime.slice(1), severity: isObj(a) ? int(a.severity, 1, 5, 2) : 2 }

  const d = v.death
  let death = typeof d === 'string' ? str(d, 40).replace(/[.!]+$/, '') : d === true ? 'Misadventure' : ''
  if (isNegative(death)) death = ''

  const memory = str(v.memory, 120)
  return {
    happiness: int(v.happiness, -40, 40),
    health: int(v.health, -40, 40),
    smarts: int(v.smarts, -15, 15),
    looks: int(v.looks, -20, 20),
    karma: int(v.karma, -25, 25),
    fame: int(v.fame, -15, 15),
    money: numeric(v.money, -1e40, 1e40),
    relationships,
    newPerson: newPerson(v.newPerson ?? v.new_person),
    condition,
    arrest,
    death,
    memory: isNone(memory) ? '' : memory,
  }
}

function outcomeFields(o: Obj): AiOutcome {
  const text = str(field(o, 'text', 'outcome', 'result', 'message', 'description'), 520)
  if (text.length < 5) throw new SchemaError('"text" must describe what happened in 1-3 sentences')
  const t = title(field(o, 'title', 'headline'))
  return {
    title: t,
    emoji: firstEmoji(o.emoji) || firstEmoji(t),
    text,
    log: logLine(field(o, 'log', 'journal', 'logLine')),
    effects: validateEffects(o.effects ?? o),
  }
}

export function validateOutcome(v: unknown): AiOutcome {
  return outcomeFields(requireObj(v, 'The reply'))
}

export function validateCustomAction(v: unknown): AiCustomAction {
  const o = requireObj(v, 'The reply')
  const possible = bool(field(o, 'possible', 'allowed', 'feasible', 'success'), true)
  const out = outcomeFields(o)
  return { possible, ...out, effects: possible ? out.effects : { ...NEUTRAL_EFFECTS, relationships: [] } }
}

export function validateInterview(v: unknown): AiInterview {
  const o = requireObj(v, 'The reply')
  const question = str(field(o, 'question', 'text', 'prompt'), 260)
  if (question.length < 8) throw new SchemaError('"question" must be the interviewer\'s question')
  const seen = new Set<string>()
  const answers: AiInterview['answers'] = []
  for (const raw of list(field(o, 'answers', 'options', 'choices'))) {
    const a = isObj(raw) ? raw : { label: raw }
    const lbl = label(field(a, 'label', 'text', 'answer'), 110)
    if (!lbl || seen.has(lbl.toLowerCase())) continue
    seen.add(lbl.toLowerCase())
    answers.push({ label: lbl, score: int(field(a, 'score', 'points', 'rating'), 0, 100, 50) })
    if (answers.length === 4) break
  }
  if (answers.length < 3) throw new SchemaError('"answers" needs 3-4 different answers, each with "label" and "score" 0-100')
  const scores = answers.map((a) => a.score)
  if (Math.max(...scores) - Math.min(...scores) < 10) {
    throw new SchemaError('answer scores must differ: one great answer (75-95), one terrible (0-25), the rest in between')
  }
  return { question, answers }
}

const INVITE_WORDS = /^(yes|true|invite|invited|interview|shortlist|accept|accepted|advance)/
const DECLINE_WORDS = /^(no|false|reject|rejected|decline|declined|pass)/

/** A CV screening decision. Only "invite" is essential; a bad question is simply dropped. */
export function validateScreening(v: unknown): AiScreening {
  const o = requireObj(v, 'The reply')
  const raw = field(o, 'invite', 'interview', 'invited', 'decision', 'shortlist')
  let invite: boolean
  if (typeof raw === 'string') {
    const t = raw.trim().toLowerCase()
    if (INVITE_WORDS.test(t)) invite = true
    else if (DECLINE_WORDS.test(t)) invite = false
    else throw new SchemaError('"invite" must be true or false')
  } else if (typeof raw === 'boolean' || typeof raw === 'number') {
    invite = bool(raw, false)
  } else {
    throw new SchemaError('"invite" must be true or false')
  }
  const reason = str(field(o, 'reason', 'why', 'note', 'message', 'text'), 220)
  let question: AiInterview | undefined
  if (invite && field(o, 'question') !== undefined) {
    try {
      question = validateInterview(o)
    } catch {
      question = undefined
    }
  }
  return question ? { invite, reason, question } : { invite, reason }
}

function textOnly(v: unknown, min: number, max: number, what: string): AiText {
  const o = requireObj(v, 'The reply')
  const text = str(field(o, 'text', 'obituary', 'rewrite', 'message', 'content'), max)
  if (text.length < min) throw new SchemaError(`"text" must contain the ${what}`)
  return { text }
}

export function validateObituary(v: unknown): AiText {
  return textOnly(v, 20, 900, 'obituary')
}

export function validateNarration(v: unknown): AiText {
  return textOnly(v, 5, 600, 'rewritten popup text')
}

export function validateChat(v: unknown): AiChat {
  const o = requireObj(v, 'The reply')
  const reply = str(field(o, 'reply', 'text', 'message', 'response'), 480)
  if (!reply) throw new SchemaError('"reply" must contain what they say back')
  return {
    reply,
    relationshipDelta: int(field(o, 'relationshipDelta', 'relationship_delta', 'delta'), -5, 5),
    mood: str(o.mood, 20).toLowerCase(),
  }
}
