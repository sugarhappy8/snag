// R4-U10 (People UI and fog track, X45, X57): what a person remembers, as the first lines of "Shared history". A pure builder:
// `memoryLines(g, p, n)` returns up to n short sentences, and PersonProfile.tsx draws them above the notes. Nothing here is a screen, and
// nothing here draws a number or writes.
//
// The source is the edge `person > player` (world/edges.ts) and its memories (E6a), which E8 and the acts write: a loan lent, a betrayal,
// a promotion. A line is `${phrase} (${year})`, strongest weight first and then the newest, so the three that matter most are the three
// shown. A phrase is a fact label and not a pick: the same memory reads the same every time, so there is no pickLine and no repetition
// risk. A life that the social flag never stamped has no lines (X6): every v5.2.0 save and every unstamped life draws the card it drew.
//
// MEMORY_PHRASE is a FROZEN TABLE (cross-check section 3.3, X57). It holds two sentences for each of the 40 kinds of MEMORY_KINDS, one for
// each side of `by` on a memory: `ego` when the player did it ("You lent Ana money") and `them` when the person did ("Ana lent you money").
// The same fact has to read right from both ends. Each sentence has one {name} slot (the person's first name) and is at most 60 characters,
// so a line with the longest name (24 characters) and the longest year (100000) stays under the log cap of 90. The lead reads the values at
// the merge of the task; after R4 a changed value needs a RECORD_REASON, a row in moved-tests.md and the lead's OK, because it changes the
// words a player reads about a person. The type is Record<MemoryKind, ...>, so the build fails the day R6 appends a kind without a
// phrase, and so does test/people-memory.test.ts (by design, X45).
//
// Total: a person with no name, a hostile edge, a game with no world or no character, or an n that is not a number give lines within
// the caps or none, never a throw. Layer: hubs (L4). Only PersonProfile.tsx (R4-U4's lazy chunk) imports this file.
import { personEntity } from '../kernel/person-ref'
import { PEOPLE_CAPS } from '../people-fog'
import type { GameState, Person } from '../types'
import { EDGE_CAPS } from '../world/caps'
import type { Memory, MemoryKind } from '../world/edge-memory'
import { memoriesOf, readEdge } from '../world/edges'
import { playerRef } from '../world/people'
import { socialOn } from '../world/social'

/** The two sentences of one kind: `ego` when the player did it, `them` when the person did. Each holds one {name} slot. */
export interface MemoryPhrase {
  readonly ego: string
  readonly them: string
}

/*
 * The table, one row a kind in the order of MEMORY_KINDS: { ego, them }. Read each row from the side that did it, as `by` says on the
 * memory: `You lent Ana money` is `ego`, `Ana lent you money` is `them`. A kind keeps its meaning on both sides; the sentence only
 * swaps who acts. Past tense, contractions, no dash, nothing the voice guide bans.
 *
 * Money and favors:  lent, paid back, not paid back, forgave, gave, turned down, cut the allowance, bailed out, kept asking.
 * The will:          cut out of the will, put back, told gently or bluntly, an olive branch, a side taken, cut off, made up.
 * Love:              betrayed, a proposal with its answer, broke up, divorced.
 * Loyalty:           stood by, saved, covered for, kept or leaked a secret, gossiped, outed, reported.
 * Career:            hired, fired, promoted, demoted, passed over, poached, signed, referred, mentored, came out ahead.
 */
const ROWS: Record<MemoryKind, MemoryPhrase> = {
  loan_given: { ego: 'You lent {name} money', them: '{name} lent you money' },
  loan_repaid: { ego: 'You paid {name} back', them: '{name} paid you back' },
  loan_unpaid: { ego: "You didn't pay {name} back", them: "{name} didn't pay you back" },
  loan_forgiven: { ego: "You forgave {name}'s loan", them: '{name} forgave your loan' },
  gift_given: { ego: 'You gave {name} a gift', them: '{name} gave you a gift' },
  gift_refused: { ego: 'You turned down a request from {name}', them: '{name} turned down a request from you' },
  allowance_cut: { ego: "You cut {name}'s allowance", them: '{name} cut your allowance' },
  bailed_out: { ego: 'You bailed {name} out', them: '{name} bailed you out' },
  asked_too_often: { ego: 'You kept asking {name} for money', them: '{name} kept asking you for money' },
  cut_from_will: { ego: 'You cut {name} out of your will', them: '{name} cut you out of their will' },
  restored_to_will: { ego: 'You put {name} back in your will', them: '{name} put you back in their will' },
  told_gently: { ego: 'You broke the news to {name} gently', them: '{name} broke the news to you gently' },
  told_bluntly: { ego: 'You broke the news to {name} bluntly', them: '{name} broke the news to you bluntly' },
  olive_branch: { ego: 'You offered {name} an olive branch', them: '{name} offered you an olive branch' },
  took_my_side: { ego: "You took {name}'s side", them: '{name} took your side' },
  estranged: { ego: 'You cut off contact with {name}', them: '{name} cut off contact with you' },
  reconciled: { ego: 'You made up with {name}', them: '{name} made up with you' },
  betrayal: { ego: 'You betrayed {name}', them: '{name} betrayed you' },
  proposed_yes: { ego: 'You proposed and {name} said yes', them: '{name} proposed and you said yes' },
  proposed_no: { ego: 'You proposed and {name} said no', them: '{name} proposed and you said no' },
  broke_up: { ego: 'You broke up with {name}', them: '{name} broke up with you' },
  divorced: { ego: 'You divorced {name}', them: '{name} divorced you' },
  stood_by_me: { ego: 'You stood by {name}', them: '{name} stood by you' },
  saved_me: { ego: 'You saved {name}', them: '{name} saved you' },
  covered_for_me: { ego: 'You covered for {name}', them: '{name} covered for you' },
  kept_secret: { ego: "You kept {name}'s secret", them: '{name} kept your secret' },
  leaked_secret: { ego: "You leaked {name}'s secret", them: '{name} leaked your secret' },
  gossiped_about_me: { ego: 'You gossiped about {name}', them: '{name} gossiped about you' },
  outed_me: { ego: 'You outed {name}', them: '{name} outed you' },
  reported_me: { ego: 'You reported {name} to the authorities', them: '{name} reported you to the authorities' },
  hired_me: { ego: 'You hired {name}', them: '{name} hired you' },
  fired_me: { ego: 'You fired {name}', them: '{name} fired you' },
  promoted_me: { ego: 'You promoted {name}', them: '{name} promoted you' },
  demoted_me: { ego: 'You demoted {name}', them: '{name} demoted you' },
  passed_over: { ego: 'You passed {name} over for a promotion', them: '{name} passed you over for a promotion' },
  poached_me: { ego: 'You poached {name} from their job', them: '{name} poached you from your job' },
  signed_me: { ego: 'You signed {name} to a contract', them: '{name} signed you to a contract' },
  referred_me: { ego: 'You referred {name} for a job', them: '{name} referred you for a job' },
  mentored_me: { ego: 'You mentored {name}', them: '{name} mentored you' },
  beat_me: { ego: 'You came out ahead of {name}', them: '{name} came out ahead of you' },
}

function frozenTable(rows: Record<MemoryKind, MemoryPhrase>): Readonly<Record<MemoryKind, Readonly<MemoryPhrase>>> {
  for (const k of Object.keys(rows) as MemoryKind[]) Object.freeze(rows[k])
  return Object.freeze(rows)
}

/** The frozen phrase table: two sentences for each of the 40 kinds, with one {name} slot each (see the header for how to read it). */
export const MEMORY_PHRASE: Readonly<Record<MemoryKind, Readonly<MemoryPhrase>>> = frozenTable(ROWS)

/** A first name is cut to this many characters, so the longest line (a 60-character phrase, the longest year) stays under 90. */
const NAME_MAX = 24
/** Work on at most this many characters of a long name before it is cut. */
const SCAN_FACTOR = 4
/** Printed for a person whose record holds no name. */
const NO_NAME = 'this person'

const DASHES = new RegExp(`[${String.fromCharCode(0x2014, 0x2013)}]`, 'g')

/** The first name as text a line can print: long dashes as hyphens, control characters and white space as one space, cut to NAME_MAX (never in the middle of a surrogate pair). '' for anything that is not text. */
function firstNameOf(p: Person): string {
  const raw: unknown = p.firstName
  if (typeof raw !== 'string') return ''
  const text = raw.slice(0, NAME_MAX * SCAN_FACTOR).replace(DASHES, '-').replace(/\p{Cc}/gu, ' ').replace(/\s+/g, ' ').trim()
  if (text.length <= NAME_MAX) return text
  let cut = text.slice(0, NAME_MAX)
  const last = cut.charCodeAt(cut.length - 1)
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1)
  return cut.trimEnd()
}

/** A phrase with its slot filled and its first letter a capital (the name opens the sentence on the `them` side, and "this person" is no name). The name goes in as text: no `$` pattern of it is read. */
function sentence(template: string, name: string): string {
  const text = template.replace('{name}', () => name)
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** How many lines to give: a whole number from 0 to the memories an edge can hold; the profile's cap of 3 when `n` is not a finite number. */
function countOf(n: unknown): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return PEOPLE_CAPS.memories
  return Math.min(EDGE_CAPS.memPerEdge, Math.max(0, Math.floor(n)))
}

/** The strongest weight first, then the newest year, then the one written last (the list is oldest first, so a higher index is newer). */
function strongestFirst(memories: readonly Memory[]): Memory[] {
  return memories
    .map((m, i) => ({ m, i }))
    .sort((a, b) => b.m.w - a.m.w || b.m.year - a.m.year || b.i - a.i)
    .map((x) => x.m)
}

/**
 * What this person remembers of you, as up to `n` lines (the profile's 3 by default, at most 8): `${phrase} (${year})`, the strongest memory
 * first and then the newest. Empty unless the life is stamped by the social flag (X6), and for a person with no edge to you, no memory, or
 * no name in the world. Pure and total: no draw, no write, the same lines twice in a year.
 */
export function memoryLines(g: GameState, p: Person, n: number = PEOPLE_CAPS.memories): string[] {
  const count = countOf(n)
  if (count === 0) return []
  try {
    if (!socialOn(g)) return []
    const from = personEntity(p)
    if (from === 'pool:other') return []
    const edge = readEdge(g, from, playerRef(g))
    if (edge === null) return []
    const name = firstNameOf(p) || NO_NAME
    return strongestFirst(memoriesOf(edge))
      .slice(0, count)
      .map((m) => `${sentence(MEMORY_PHRASE[m.kind][m.by], name)} (${m.year})`)
  } catch {
    return []
  }
}
