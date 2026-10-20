// Types for scripts/voice/rules.mjs, so that the tests (and nothing else in the game) can import it.

/** Phrases banned anywhere in new text (the A3 chatbot phrasings and the eulogy stock). Case-sensitive. Three entries end in a space. */
export const BANNED_ANYWHERE: readonly string[]
/** The A2 stock words: banned as a one-word verdict or tail, not as ordinary words. */
export const STOCK_VERDICTS: readonly string[]
/** Words that tend to arrive with a replacement: warned about, not refused. */
export const TELLS: readonly string[]
/** The words a line must not end on. */
export const FEELING_WORDS: readonly string[]

export type LimitedRole = 'log' | 'scene' | 'outcome' | 'tooltip' | 'digest' | 'headline' | 'deck'
/** Hard caps in characters of static text (a hole counts 0). The roles title, label and text have no fixed number. */
export const LIMITS: Readonly<Record<LimitedRole, number>>
/** Where rewrites aim, lower than the caps. */
export const AIMS: Readonly<Record<LimitedRole, number>>

export type Flag =
  | 'over-cap'
  | 'over-aim'
  | 'long'
  | 'no-contraction'
  | 'colon-join'
  | 'punchline'
  | 'qualifier'
  | 'nobody'
  | 'everyone'
  | 'disclaimer'
  | 'chatbot'
  | 'stock'
  | 'tell'
  | 'list-of-three'
  | 'feeling-end'
  | 'em-dash'
/** Every flag unitFlags can raise, in the order it reports them. */
export const FLAG_NAMES: readonly Flag[]

/** The first words of a fragment punchline that make it the ". Especially/Including/Twice... X." shape. */
export const QUALIFIER_LEADS: readonly string[]
/** The contraction-free negatives counted by the report. */
export const NEG_PHRASES: readonly string[]
/** The disclaimer words counted by the report. */
export const DISCLAIMER_WORDS: readonly string[]

/** Curly quotes straightened and no-break spaces made plain: the text the patterns run on. */
export function norm(text: string): string
/** Splits a leading era gate such as `@1998,own:mobilePhone ` (the tag and the white space after it) off a text; tag is '' when there is none. */
export function gateOf(text: string): { tag: string; rest: string }
/** Static characters: everything except the holes, `${...}` and `{{0}}`, which count 0. A gate counts, so split it off first. */
export function staticLength(text: string): number

/** How many contraction-free negatives (did not, cannot, ...). */
export function countNegatives(text: string): number
export function hasUncontractedNegative(text: string): boolean
/** How many mid-sentence colon joins. Expects text without its era gate. */
export function countColonJoins(text: string): number
export function hasColonJoin(text: string): boolean
/** The first word of the fragment punchline that closes the text ("Mostly" for "It works. Mostly."), or null. */
export function fragmentLead(text: string): string | null
export function isPunchlineFragment(text: string): boolean
export function countNobody(text: string): number
export function countEveryone(text: string): number
export function countDisclaimers(text: string): number
/** Does the text open with a chatbot phrasing (A3)? Expects text without its era gate. */
export function startsWithChatbotPhrase(text: string): boolean
/** How many em-dashes (U+2014). */
export function countEmDashes(text: string): number
export function hasTell(text: string): boolean
export function hasListOfThree(text: string): boolean
export function endsWithFeeling(text: string): boolean
export function isStockVerdict(text: string): boolean

/** Which rules a text breaks, as flag names in FLAG_NAMES order. A leading era gate is split off first. */
export function unitFlags(text: string, role: string): string[]
