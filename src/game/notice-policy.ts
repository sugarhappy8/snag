// The never-route policy (R1-T5, G.11 step 2, D18): which notices must stay a popup even when Quiet Mode is on.
// A notice may wait in the inbox only when it carries the minor weight AND nothing about it needs the player right
// now: no support line, no bad tone, no health or legal word, no large figure. The weight is the opt-in; this is the
// safety net behind it, so it is deliberately conservative: when in doubt, the notice stays a popup.
//
// Pure, and a leaf: it imports only types, so any module may use it without joining an import cycle.
import type { ModalItem, NoticeModal } from './types'

/** A figure of this many display units or more (after a K, M, B or T suffix) keeps a notice a popup. */
export const LARGE_FIGURE = 10_000

/** Why a notice stays a popup. */
export type RouteBlock = 'support' | 'tone' | 'health' | 'legal' | 'money'

/** A case-insensitive whole-word matcher for a space-separated list; a trailing * lets the word take any ending. */
function wholeWords(list: string): RegExp {
  const parts = list.split(' ').map((w) => (w.endsWith('*') ? `${w.slice(0, -1)}\\w*` : w))
  return new RegExp(`\\b(?:${parts.join('|')})\\b`, 'i')
}

// The lists name the stems of the words, since a notice says "doctors" and "hospitalized" as often as "doctor" and
// "hospital". A star lets a word take any ending; a word with no star is that word only, where a star would pull in
// an everyday word that has nothing to do with it (pain and paint, dead and deadline, court and courtesy, warrant and
// warranty, harm and harmony, accident and accidentally, legal and legally).
export const HEALTH_RE: RegExp = wholeWords(
  'health sick* ill illness* disease* diagnos* hospital* hospice surgery surgeries surgeon* doctor* nurse* injur* wound* ' +
    'cancer* infection* infected flu fever* virus* symptom* pregnan* miscarriage overdos* rehab addict* therap* depress* ' +
    'anxiety panic medic* pill* pain pains painful hurt* accident accidents ambulance* emergenc* die died dies dead deadly ' +
    'dying death* fatal* lethal funeral* kill* stroke strokes heart hearts suicid* seizure* coma bleed* bled tumor* tumour* ' +
    'chemo* harm harms harmed harming',
)

export const LEGAL_RE: RegExp = wholeWords(
  'arrest* police policeman policemen policewoman policewomen cop cops court courts courtroom judg* jury juror* verdict ' +
    'lawsuit* sue sued suing trial* convict* prison* jail* sentenc* warrant warrants lawyer* attorney* legal illegal crime ' +
    'crimes crimin* investigat* fine fined fines penalt* probation parole bail audit* fraud* charged indict* subpoena deport* ' +
    'immigration murder* assault* theft* thie* robbed robbery robber* robbing burglar* burglary steal steals stealing stole ' +
    'stolen evict* bankrupt* foreclos* repossess*',
)

const NUMBER_WORDS =
  'thousand|million|billion|trillion|quadrillion|quintillion|sextillion|septillion|octillion|nonillion'

// A number, then optionally a unit: K, M, B or T, or a number word. formatMoney spells the number words out from a
// quadrillion up, so the list runs to nonillion; any other word ending in illion after a number is read as larger still.
const FIGURE_RE = new RegExp(`(\\d[\\d,]*(?:\\.\\d+)?)(?:\\s?(K|M|B|T|${NUMBER_WORDS}|[a-z]*illion)\\b)?`, 'gi')

const SCALE: Readonly<Record<string, number>> = {
  k: 1e3,
  thousand: 1e3,
  m: 1e6,
  million: 1e6,
  b: 1e9,
  billion: 1e9,
  t: 1e12,
  trillion: 1e12,
  quadrillion: 1e15,
  quintillion: 1e18,
  sextillion: 1e21,
  septillion: 1e24,
  octillion: 1e27,
  nonillion: 1e30,
}

/** An unlisted number word ending in illion (decillion, zillion): past every word the game writes. */
const BEYOND = 1e33

/** The biggest number in a text in display units ("$1.2M" is 1,200,000, "12,500" is 12500); 0 when there is none. */
export function largestFigure(text: string): number {
  let best = 0
  for (const m of String(text).matchAll(FIGURE_RE)) {
    let n = Number.parseFloat((m[1] ?? '').replace(/,/g, ''))
    const scale = m[2] === undefined ? undefined : (SCALE[m[2].toLowerCase()] ?? BEYOND)
    if (scale !== undefined) n = Math.round(n * scale)
    if (!Number.isFinite(n)) n = Number.MAX_SAFE_INTEGER
    if (n > best) best = n
  }
  return best
}

/** Why a notice must stay a popup, or null. First match wins in the order support, tone, health, legal, money. */
export function neverRoute(m: Pick<NoticeModal, 'title' | 'text' | 'tone' | 'support'>): RouteBlock | null {
  if (m.support === true) return 'support'
  if (m.tone === 'bad') return 'tone'
  const words = `${m.title} ${m.text}`
  if (HEALTH_RE.test(words)) return 'health'
  if (LEGAL_RE.test(words)) return 'legal'
  if (largestFigure(words) >= LARGE_FIGURE) return 'money'
  return null
}

/**
 * True only for a notice with weight 'minor' that neverRoute lets through, while Quiet Mode is on. Choices, inputs,
 * minigames and tasks are never routed: they need an answer.
 */
export function routesToInbox(m: ModalItem, quiet: boolean): boolean {
  return quiet && m.kind === 'notice' && m.weight === 'minor' && neverRoute(m) === null
}
