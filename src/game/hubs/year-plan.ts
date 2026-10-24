// The pure year planner (R3, E.D2 a). From a queue of popups and the year's log it decides what stays a popup, what folds into the
// year card, what merges, and what the card says. The store's year close (R3-Q4, hubs/year-close.ts) calls it once at the end of a
// year and does the writing; this file only reads. It draws no number, writes nothing to `g`, and reads nothing dated after g.year.
//
// What is "in play": a notice that carries a source (`s`, set by aging, see core.ts withLogSource) and no support line. Everything
// else in the queue (the player's own popups, choices, inputs, minigames, tasks, a year card) is untouched, and the close keeps its
// place.
//
// Three lists come out of planNotices, so the close can use whichever it needs:
//   keep    the ids of the in-play notices that stay popups;
//   fold    one Story for each folded notice, in queue order (so the close can drop them from the queue);
//   merged  the same stories after equal (source, title) pairs were joined into one, in the order of the first part. This is what the
//           card shows and what the log lines (foldLogEntries) are made from. Pass it to buildCard as `folded`.
// kept + folded + untouched is the whole queue, with no id in two of them. The kept notices become Stories with storyOf, for buildCard.
//
// A choice is not planned here (the close budgets choices before it plans notices). A notice that comes right before a choice with
// the same source is the context for that choice and is kept, so the close should plan the queue as it stands after it moved any
// deferred choice out: a notice before a choice that is no longer there is a plain notice again.
//
// Layer L4. No module-level const reads an import: the tables below are literals, and every function reads its imports when it runs.
import { LOG_AMOUNT_MAX, shortMoney, validLogAmount, validLogSource, validLogWeight } from '../core'
import { cultureOf } from '../history/digest'
import { acctBalance, playerAcct } from '../kernel/ledger'
import { readLifeSeries } from '../life-series'
import { largestFigure, neverRoute } from '../notice-policy'
import { noticeWeightOf } from '../notice-weights'
import type { GameState, LogEntry, LogWeight, ModalItem, NoticeModal, Tone, YearCard, YearGroup } from '../types'

/** The numbers of the year close. choices, pending, pendingYears and popupYears belong to R3-Q4; the rest are read here. */
export const YEAR_LIMITS = Object.freeze({
  /** Unrequested choices a year (R3-Q4). */
  choices: 3,
  /** Notices kept as popups when nothing is life-changing. */
  notices: 3,
  /** The most the room grows to as weight 3 notices pile up. Weight 3 itself is never folded, so it can pass this. */
  noticesMax: 5,
  /** Lines on a card: head, stories, money, people and news together. */
  lines: 8,
  /** Characters in the head, the money line and the news line. */
  head: 90,
  /** Characters in a story, a person line and a folded story's title or text. */
  story: 90,
  stories: 3,
  people: 3,
  /** Characters in a line of a collapsed group. */
  group: 90,
  groupLines: 6,
  /** Deferred asks kept, and how many years one waits (R3-Q4). */
  pending: 6,
  pendingYears: 2,
  /** Years of a life the card is a popup before it is drawn inline (R3-Q4). */
  popupYears: 10,
} as const)

/** The display order of the groups of a card. */
export const YEAR_GROUP_ORDER: readonly YearGroup[] = Object.freeze<YearGroup[]>(['people', 'body', 'work', 'companies', 'money', 'law', 'world', 'life'])

/**
 * The group of each source: the 36 yearly hooks of modules/yearly-aging.ts by name, the year events task (`events`), and the module
 * sources of this release (a module's entry id is its module id). A source not listed is everyday (groupOf). The UI keeps a copy of
 * this table in components/logModel.ts, and R3-Q13 checks that the two agree.
 */
export const GROUP_OF_SOURCE: Readonly<Record<string, YearGroup>> = Object.freeze<Record<string, YearGroup>>({
  // people
  household: 'people',
  relationships: 'people',
  sharedProjects: 'people',
  background: 'people',
  royalty: 'people',
  royalCareers: 'people',
  familyUse: 'people',
  nepo: 'people',
  willFeuds: 'people',
  // body
  health: 'body',
  // work
  education: 'work',
  professions: 'work',
  career: 'work',
  special: 'work',
  advisors: 'work',
  'effort.you': 'work',
  // your companies
  workshop: 'companies',
  corruption: 'companies',
  business: 'companies',
  techWaves: 'companies',
  hedge: 'companies',
  // money
  development: 'money',
  investments: 'money',
  shops: 'money',
  computer: 'money',
  finance: 'money',
  wealth: 'money',
  assets: 'money',
  'knowledge.core': 'money',
  // law and order
  immigration: 'law',
  crime: 'law',
  underworld: 'law',
  nation: 'law',
  // the world
  history: 'world',
  digest: 'world',
  world: 'world',
  'world.frontier': 'world',
  // everyday
  events: 'life',
  milestones: 'life',
  givingFund: 'life',
})

/** The group of a source; anything unknown, missing or inherited from the object prototype is everyday. */
export function groupOf(s: string | undefined): YearGroup {
  return typeof s === 'string' && Object.hasOwn(GROUP_OF_SOURCE, s) ? GROUP_OF_SOURCE[s]! : 'life'
}

// ---------------------------------------------------------------------------
// Text

/** A text without a trailing high surrogate: a cut between the two halves of an emoji would leave one alone. */
function dropHalfPair(t: string): string {
  const last = t.charCodeAt(t.length - 1)
  return last >= 0xd800 && last <= 0xdbff ? t.slice(0, -1) : t
}

/**
 * White space collapsed and the text cut to `max` characters by the rule of the inbox (inbox.ts clipInboxText): over the limit it is
 * cut at the last space that leaves room for three dots (at a hard cut when that space is in the first half) and ends with '...'.
 */
export function clipText(raw: string, max: number): string {
  const s = raw.replace(/\s+/g, ' ').trim()
  if (s.length <= max) return s
  const room = max - 3
  const space = s.lastIndexOf(' ', room)
  const cut = space >= room / 2 ? s.slice(0, space) : dropHalfPair(s.slice(0, room))
  return `${cut.trimEnd()}...`
}

function textOf(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

const norm = (t: string): string => t.replace(/\s+/g, ' ').trim().toLowerCase()

// ---------------------------------------------------------------------------
// Weight and stories

/**
 * How much a notice matters to the year: the weight it carries (`w`), else its title's row in the weight table, else 1 for the
 * routine news of the R1 inbox (`weight: 'minor'`), else 2. A notice the never-route policy blocks (bad tone, a health or legal
 * word, a large figure) is never under 2, so what hurts or costs a lot is never log-only trivia.
 */
export function noticeWeight(m: NoticeModal): LogWeight {
  const own = validLogWeight(m.w) ? m.w : undefined
  const base: LogWeight = own ?? noticeWeightOf(textOf(m.title)) ?? (m.weight === 'minor' ? 1 : 2)
  return base < 2 && neverRoute(m) !== null ? 2 : base
}

/** One story of the year: a notice told as a line. `a` is the money it is about (its own amount, else the largest figure of its text). */
export interface Story {
  id: string
  /** The source; '' for a notice that has none (only an in-play notice is planned, so it has one). */
  s: string
  group: YearGroup
  w: LogWeight
  a: number
  title: string
  text: string
  tone: Tone
  /** How many notices a merged story stands for (planNotices merged); absent for a story of one notice. */
  parts?: number
}

/** A notice in play: made by a yearly hook, no support line, not a year card. */
function inPlay(m: ModalItem): m is NoticeModal {
  return m.kind === 'notice' && m.support !== true && m.digest === undefined && validLogSource(m.s)
}

function toneOf(t: unknown): Tone {
  return t === 'good' || t === 'bad' || t === 'event' ? t : 'neutral'
}

/** The story of a notice. Pure; the title and the text are cut to YEAR_LIMITS.story with the inbox rule. */
export function storyOf(m: NoticeModal): Story {
  const title = textOf(m.title)
  const text = textOf(m.text)
  return {
    id: m.id,
    s: typeof m.s === 'string' ? m.s : '',
    group: groupOf(m.s),
    w: noticeWeight(m),
    a: validLogAmount(m.a) ? m.a : Math.min(largestFigure(`${title} ${text}`), LOG_AMOUNT_MAX),
    title: clipText(title, YEAR_LIMITS.story),
    text: clipText(text, YEAR_LIMITS.story),
    tone: toneOf(m.tone),
  }
}

/** A story as one line of at most YEAR_LIMITS.story characters: "title: text", or the title alone when the text is empty. */
export function storyLine(st: Story): string {
  return clipText(st.text ? `${st.title}: ${st.text}` : st.title, YEAR_LIMITS.story)
}

/** A text as one plain run: no pictograph (an emoji marks a line of a list, not a headline), white space collapsed. */
function plainRun(text: string): string {
  return text.replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]+/gu, ' ').replace(/\s+/g, ' ').trim()
}

/** A title as a plain label: no exclamation mark at the end of a word (the voice has no exclamation-mark labels). */
function plainLabel(title: string): string {
  return plainRun(title.replace(/!+(?=[\s,.]|$)/g, ''))
}

/** The text of a story without its own "2027: " in front when 2027 is the year of the card, which the card says under its headline. */
function withoutYear(text: string, year: number): string {
  return text.replace(new RegExp(`^${year}\\s*:\\s*`), '')
}

/**
 * The headline of a card, the one place it is composed: one plain line of at most YEAR_LIMITS.head characters. It is the story
 * itself. The title of the popup that carried it is not part of it ("Milestones!: ..." read as a label), neither is a year in
 * front of the text that is the year of the card, and neither is an emoji. A story with no text says its title, without an
 * exclamation mark. A merged story (planNotices merged) has no popup title: its title is the story ("Kindness, 3 times"), and its
 * total follows as a second sentence. `year` is the year of the card (g.year).
 */
export function headlineOf(st: Story, year: number): string {
  const label = plainLabel(st.title)
  if (st.parts !== undefined && st.parts > 1) return clipText(st.text ? `${label}. ${plainRun(st.text)}.` : label, YEAR_LIMITS.head)
  const body = withoutYear(plainRun(st.text), year).trim()
  return clipText(body !== '' ? body : label, YEAR_LIMITS.head)
}

// ---------------------------------------------------------------------------
// Merging

type Template = (n: number, total: number | undefined) => string

/** ", $4.2M in all", or nothing when no amount is known or it adds up to zero. */
const inAll = (total: number | undefined): string => (total === undefined || total === 0 ? '' : `, ${shortMoney(Math.abs(total))} in all`)

const TEMPLATES: Record<string, Template> = {
  'Emergency Loan': (n, total) => `${n} companies took emergency loans${total === undefined || total === 0 ? '' : ` worth ${shortMoney(Math.abs(total))}`}`,
  'New Investor': (n, total) => `${n} companies took new investors${inAll(total)}`,
  'Ready for Wall Street?': (n) => `${n} companies are big enough to list`,
  'No Longer Yours': (n) => `${n} companies are no longer yours`,
  'CEO Poached': (n) => `Rivals poached the CEOs of ${n} companies`,
  'Rogue CEO Caught': (n) => `${n} CEOs were caught wasting company money`,
}

/**
 * The nicer line for the notices of one source that came more than once, by title: `n` is how many, `total` the sum of their amounts
 * when every one has an amount. At most 6 titles, all company results; any other title reads "{title}, {n} times".
 */
export const MERGE_TEMPLATES: Readonly<Record<string, Template>> = Object.freeze(TEMPLATES)

function clampAmount(n: number): number {
  return Math.max(-LOG_AMOUNT_MAX, Math.min(LOG_AMOUNT_MAX, n))
}

function joinStories(parts: readonly Story[], explicit: ReadonlyMap<string, number>): Story {
  const first = parts[0]!
  const n = parts.length
  const total = parts.every((p) => explicit.has(p.id)) ? parts.reduce((t, p) => t + explicit.get(p.id)!, 0) : undefined
  const template = Object.hasOwn(MERGE_TEMPLATES, first.title) ? MERGE_TEMPLATES[first.title] : undefined
  const title = clipText(template ? template(n, total) : `${first.title}, ${n} times`, YEAR_LIMITS.story)
  const text = template || total === undefined || total === 0 ? '' : clipText(`${shortMoney(total)} in all`, YEAR_LIMITS.story)
  return {
    id: first.id,
    s: first.s,
    group: first.group,
    w: Math.max(...parts.map((p) => p.w)) as LogWeight,
    a: clampAmount(total ?? parts.reduce((t, p) => t + Math.abs(p.a), 0)),
    title,
    text,
    tone: parts.some((p) => p.tone === 'bad') ? 'bad' : first.tone,
    parts: n,
  }
}

/** Stories with the same source and title joined into one, in the order of the first of each. */
function mergeFolded(folded: readonly Story[], explicit: ReadonlyMap<string, number>): Story[] {
  const order: string[] = []
  const byKey = new Map<string, Story[]>()
  for (const st of folded) {
    const key = `${st.s}\u0000${st.title}`
    const list = byKey.get(key)
    if (list) list.push(st)
    else {
      byKey.set(key, [st])
      order.push(key)
    }
  }
  return order.map((key) => {
    const parts = byKey.get(key)!
    return parts.length === 1 ? { ...parts[0]! } : joinStories(parts, explicit)
  })
}

// ---------------------------------------------------------------------------
// The plan

/**
 * What stays a popup, what folds, what merges (see the header). Weight 3 is always kept, and so is a notice right before a choice of
 * its own source. The rest of the room, up to YEAR_LIMITS.notices (it grows with the count of weight 3, to noticesMax), goes to the
 * best notices of weight 2 or more by weight, then by the money they are about, then by queue order. Weight 0 and 1 are never kept.
 * `_g` is not read: the plan depends on the queue alone.
 */
export function planNotices(_g: GameState, queue: readonly ModalItem[]): { keep: Set<string>; fold: Story[]; merged: Story[] } {
  const L = YEAR_LIMITS
  const play: { m: NoticeModal; story: Story; must: boolean; pos: number }[] = []
  const explicit = new Map<string, number>()
  queue.forEach((m, i) => {
    if (!inPlay(m)) return
    const next = queue[i + 1]
    const story = storyOf(m)
    if (validLogAmount(m.a)) explicit.set(m.id, m.a)
    const context = next !== undefined && next.kind === 'choice' && next.s === m.s
    play.push({ m, story, must: story.w === 3 || context, pos: play.length })
  })
  const life = play.filter((p) => p.story.w === 3).length
  const room = Math.max(0, Math.min(L.noticesMax, Math.max(L.notices, life)) - play.filter((p) => p.must).length)
  const rank = (a: (typeof play)[number], b: (typeof play)[number]): number =>
    b.story.w - a.story.w || Math.abs(b.story.a) - Math.abs(a.story.a) || a.pos - b.pos
  const filled = new Set(play.filter((p) => !p.must && p.story.w >= 2).sort(rank).slice(0, room))
  const keep = new Set<string>()
  const fold: Story[] = []
  for (const p of play) {
    if (p.must || filled.has(p)) keep.add(p.m.id)
    else fold.push(p.story)
  }
  return { keep, fold, merged: mergeFolded(fold, explicit) }
}

// ---------------------------------------------------------------------------
// The money line

/** What the year did to the player's money. cash is the ledger; netWorth and income come from the life series. */
export interface YearMoney {
  cash: number
  netWorth: number
  delta: number
  income: number
  /** What inflation took from the cash held this year, when it was worth a line (finance.ts sayInflationLoss); absent otherwise. */
  inflation?: number
}

/**
 * Cash from the books (the player's account), net worth and income from the newest row of the life series that is not dated after
 * g.year, and the change in net worth against the row before it (0 when there is none). null when the series has no such row.
 */
export function moneyFacts(g: GameState): YearMoney | null {
  const rows = readLifeSeries(g).filter((r) => r[1] <= g.year)
  const last = rows[rows.length - 1]
  if (!last) return null
  const before = rows[rows.length - 2]
  const inflation = inflationOf(g)
  return { cash: acctBalance(g, playerAcct(g)), netWorth: last[2], delta: before ? last[2] - before[2] : 0, income: last[5], ...(inflation === undefined ? {} : { inflation }) }
}

/** This year's inflation loss from the flag finance.ts keeps ([year, amount]); undefined for another year, a bad value or no loss. */
function inflationOf(g: GameState): number | undefined {
  const raw = g.flags.inflationLoss
  if (!Array.isArray(raw) || raw.length !== 2) return undefined
  const [year, amount] = raw
  return year === g.year && typeof amount === 'number' && Number.isFinite(amount) && amount > 0 ? amount : undefined
}

/** The log aim in characters (scripts/voice/rules.mjs AIMS.log): the line drops what it can to stay under it. */
const MONEY_AIM = 60

/**
 * "Net worth $X (up $Y). Income $Z. Cash $C." in at most 90 characters. A huge figure (a spelled-out quintillion) drops the income,
 * then the move, then both, so the line fits; the net worth and the cash always stay. With the year's inflation loss it ends
 * "Inflation took $L." and may run to the 90, since it carries one more fact; the loss is kept ahead of the income and the move, and
 * a line the loss cannot fit in is the line it would have been without it.
 */
export function moneyLine(f: YearMoney): string {
  const move = f.delta > 0 ? ` (up ${shortMoney(f.delta)})` : f.delta < 0 ? ` (down ${shortMoney(-f.delta)})` : ''
  const worth = (m: string): string => `Net worth ${shortMoney(f.netWorth)}${m}.`
  const income = ` Income ${shortMoney(f.income)}.`
  const cash = ` Cash ${shortMoney(f.cash)}.`
  if (typeof f.inflation === 'number' && Number.isFinite(f.inflation) && f.inflation > 0) {
    const lost = ` Inflation took ${shortMoney(f.inflation)}.`
    const told = [worth(move) + income + cash + lost, worth(move) + cash + lost, worth('') + income + cash + lost, worth('') + cash + lost].find((t) => t.length <= YEAR_LIMITS.head)
    if (told !== undefined) return told
  }
  const tries = [worth(move) + income + cash, worth(move) + cash, worth('') + income + cash, worth('') + cash]
  return tries.find((t) => t.length <= MONEY_AIM) ?? tries.find((t) => t.length <= YEAR_LIMITS.head) ?? clipText(tries[3]!, YEAR_LIMITS.head)
}

// ---------------------------------------------------------------------------
// The card

/** The newest log lines a card reads: a year's log is a few dozen lines, so this only bounds a damaged one. */
const SCAN_MAX = 400

const lineWeight = (e: LogEntry): LogWeight => (validLogWeight(e.w) ? e.w : 2)
const lineAmount = (e: LogEntry): number => (validLogAmount(e.a) ? Math.abs(e.a) : 0)

/** The background lines of a year never headline it: the news and the culture line (the card has places of their own for them). */
const BACKGROUND = new Set(['history', 'digest'])

/** A line a fold made (foldLogEntries): a copy of a story, so the card counts the story and not the copy. */
const isFoldLine = (e: LogEntry): boolean => typeof e.id === 'string' && e.id.startsWith('fold-')

/** The best line to headline a year with when no popup tells a story: the highest weight above 0, then the money, then the earliest. */
function topLine(entries: readonly LogEntry[]): LogEntry | undefined {
  let best: LogEntry | undefined
  for (const e of entries) {
    if (!textOf(e.text).trim() || e.w === 0 || isFoldLine(e) || (e.s !== undefined && BACKGROUND.has(e.s))) continue
    if (best === undefined || lineWeight(e) > lineWeight(best) || (lineWeight(e) === lineWeight(best) && lineAmount(e) > lineAmount(best))) best = e
  }
  return best
}

/** A line of news without its leading emoji and spaces. */
function stripLead(text: string): string {
  return text.replace(/^[\p{Extended_Pictographic}\u{FE0F}\u{200D}\s]+/u, '')
}

/**
 * The year in one card. `kept` are the stories of the notices that stay popups (storyOf), `folded` the merged stories of the ones
 * that fold (planNotices(...).merged), `log` this year's lines. The head is the top story by weight and then by the money it is
 * about, told by headlineOf (the story itself, with no popup title and no year in front); with no story, the top log line by weight;
 * with none, the culture line of the year; with none, a plain line. `stories` are
 * the next 3, `money` the ledger line (left out when the life series has no row), `people` up to 3 more stories of the people group,
 * `world` the news line of the year. Head, stories, money, people and world are at most YEAR_LIMITS.lines lines together (people go
 * first, then stories). Everything else, every story and log line that is left, is counted in its group, in display order, with
 * its best 6 lines. Pure; every string is within its cap.
 */
export function buildCard(g: GameState, kept: readonly Story[], folded: readonly Story[], log: readonly LogEntry[]): YearCard {
  const L = YEAR_LIMITS
  const entries = log.length > SCAN_MAX ? log.slice(-SCAN_MAX) : log
  const ranked = [...kept, ...folded]
    .map((st, pos) => ({ st, pos }))
    .sort((a, b) => b.st.w - a.st.w || Math.abs(b.st.a) - Math.abs(a.st.a) || a.pos - b.pos)
    .map((x) => x.st)
  const taken = new Set<number>()

  let head = ''
  let headEntry: LogEntry | undefined
  if (ranked.length > 0) {
    head = headlineOf(ranked[0]!, g.year)
    taken.add(0)
  } else {
    headEntry = topLine(entries)
    if (headEntry) head = clipText(textOf(headEntry.text), L.head)
  }
  if (!head) {
    const culture = clipText(cultureOf(g.year), L.head)
    head = culture || `Age ${g.character.age}. A quiet year.`
  }

  const stories: number[] = []
  for (let i = 0; i < ranked.length && stories.length < L.stories; i++) {
    if (taken.has(i)) continue
    taken.add(i)
    stories.push(i)
  }
  const people: number[] = []
  for (let i = 0; i < ranked.length && people.length < L.people; i++) {
    if (taken.has(i) || ranked[i]!.group !== 'people') continue
    taken.add(i)
    people.push(i)
  }

  const facts = moneyFacts(g)
  const money = facts ? moneyLine(facts) : ''
  const news = entries.find((e) => e.s === 'history' && e.w === 0 && stripLead(textOf(e.text)) !== '')
  const world = news ? clipText(stripLead(textOf(news.text)), L.head) : ''

  // The lines that are not negotiable are the head, the money and the news. People are trimmed first, then the stories.
  const fixed = 1 + (money ? 1 : 0) + (world ? 1 : 0)
  while (fixed + stories.length + people.length > L.lines && people.length > 0) taken.delete(people.pop()!)
  while (fixed + stories.length + people.length > L.lines && stories.length > 0) taken.delete(stories.pop()!)

  // Everything left is counted by group: the stories not shown, then the log lines that are not a copy of a story or the head or the news.
  const items: { k: YearGroup; w: number; mag: number; line: string; pos: number }[] = []
  ranked.forEach((st, i) => {
    if (!taken.has(i)) items.push({ k: st.group, w: st.w, mag: Math.abs(st.a), line: storyLine(st), pos: items.length })
  })
  const told = new Set<string>()
  for (const st of ranked) for (const t of [storyLine(st), st.text, headlineOf(st, g.year)]) if (t) told.add(norm(clipText(t, L.group)))
  for (const e of entries) {
    if (e === headEntry || e === news || isFoldLine(e)) continue
    const line = clipText(textOf(e.text), L.group)
    if (!line || told.has(norm(line))) continue
    items.push({ k: groupOf(e.s), w: lineWeight(e), mag: lineAmount(e), line, pos: items.length })
  }
  items.sort((a, b) => b.w - a.w || b.mag - a.mag || a.pos - b.pos)
  const buckets = new Map<YearGroup, { n: number; lines: string[] }>()
  for (const it of items) {
    const b = buckets.get(it.k) ?? { n: 0, lines: [] }
    b.n++
    if (b.lines.length < L.groupLines) b.lines.push(it.line)
    buckets.set(it.k, b)
  }
  const groups = YEAR_GROUP_ORDER.filter((k) => buckets.has(k)).map((k) => ({ k, n: buckets.get(k)!.n, lines: buckets.get(k)!.lines }))

  return {
    v: 1,
    year: g.year,
    age: g.character.age,
    head,
    stories: stories.map((i) => storyLine(ranked[i]!)),
    ...(money ? { money } : {}),
    ...(people.length > 0 ? { people: people.map((i) => storyLine(ranked[i]!)) } : {}),
    ...(world ? { world } : {}),
    groups,
  }
}

/**
 * The log lines a year's folds leave behind, for the close to append: one for each merged story whose source has no line in this
 * year's log, and none for a story whose source already does (that line is the record). The id is `fold-<generation>-<year>-<id of
 * the story>`, so a second call adds nothing; the text is the story as one line of at most 90 characters; the tone, the weight and the
 * source are the story's. Pure: it returns the lines and writes none.
 */
export function foldLogEntries(g: GameState, merged: readonly Story[], log: readonly LogEntry[]): LogEntry[] {
  const have = new Set<string>()
  const sources = new Set<string>()
  for (const e of log) {
    if (typeof e.id === 'string') have.add(e.id)
    if (typeof e.s === 'string') sources.add(e.s)
  }
  const out: LogEntry[] = []
  for (const st of merged) {
    const id = `fold-${g.generation}-${g.year}-${st.id}`
    if (have.has(id) || sources.has(st.s)) continue
    out.push({ id, text: clipText(storyLine(st), 90), tone: st.tone, ...(validLogSource(st.s) ? { s: st.s } : {}), w: st.w })
  }
  return out
}
