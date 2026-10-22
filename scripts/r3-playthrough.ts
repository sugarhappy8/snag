// R3 exit gate: a three-life playthrough through the real store flow, read the way a player reads it.
//
// It plays three seeded lives with the calls the app makes. A menu row is found by its label in the real menu tree and run through
// store.runMenuAction, after the slider caption and the confirm text are read as MenuList reads them. Every popup is answered with
// store.chooseOption, submitInput, finishMinigame and dismissNotice (a run of plain notices with dismissNotices, as the digest card does),
// and every year is store.ageUpAction with Quiet Mode on and FLAGS.yearCard on, so ageUp and closeYear run in one act() and the year ends
// with its card. The information mode is Realistic, the default a player gets.
//
//   life 1  founds a company and runs product research to a launch, reading the odds line with its reasons
//   life 2  hires staff through the fogged hiring screen and uses Look closer (an analyst for the valuation, the background check)
//   life 3  reads a fogged market screen (rivals, what-ifs, antitrust) and buys intel from two sources
//
// Every life is played from birth to 30 through the same flow (its years are counted, not told), given savings at 30 (as
// test/probe-life.ts does), and then plays its part. What comes out is a transcript with a summary at the top, three saves for the
// screenshots (the research odds with reasons, a fogged market screen, the year card) and the page that says how to open each in the dev
// server. The pattern is scripts/r1-screenshot-state.ts (a real life played by the real engine, written as the save the store writes) and
// test/play-kit.ts (the popup answers).
//
// It runs under vitest (test/r3-playthrough.test.ts, only with R3_PLAY=1, so CI never plays it) and as an esbuild bundle:
//
//   node r3-playthrough.mjs --out <dir> [--life 1|2|3 --seed <n>]
//
// This is not a test of the game: it asserts nothing about what the lives do, it reads them. The seeds are found, not pinned: a life that
// does not reach what its part needs (a launched product line, two hires, a market screen) is dropped for the next seed.
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { ageUp } from '../src/game/aging'
import { marketViewOf } from '../src/game/business/competition'
import { knownMarket, rivalDetailKeys } from '../src/game/business/market-fog'
import { rdProjects, rdQuote } from '../src/game/business/rd'
import { candKey } from '../src/game/business/staff-fog'
import { readBiz, type BizState } from '../src/game/business/state'
import { valKey } from '../src/game/business/valuation-fog'
import { addMoney, bindMoneyContext, formatMoney, shortMoney } from '../src/game/core'
import { FATIGUE_KNEE, ambitionReveal, fatigueOf, readYou, revealPolicyOf } from '../src/game/effort'
import { FLAGS, resetFlags, setFlags } from '../src/game/flags'
import { readYearBook } from '../src/game/hubs/year-book'
import { readInbox } from '../src/game/inbox'
import { infoMode, know, readKnow, setInfoOverride, withInfoMode } from '../src/game/knowledge/contract'
import { ruleOf } from '../src/game/knowledge/keys'
import { kindOfKey } from '../src/game/knowledge/kinds'
import { activitiesMenu, assetsMenu, occupationMenu } from '../src/game/menus'
import { applyFallback } from '../src/game/offline'
import { cloneForAct } from '../src/game/save-clone'
import { migrateSave } from '../src/game/save-schema'
import type { AnnualReportData, Asset, ChoiceModal, GameState, InputModal, MenuAction, MenuGroup, MenuNode, MinigameModal, ModalItem, NoticeModal } from '../src/game/types'
import { confirmText, nodeConf, nodeDisabled, nodeHint, nodeSubtitle, nodeVisible, sliderPreview } from '../src/ui/components/menuModel'
import { digestRows, planHead } from '../src/ui/components/noticeModel'
import { GROUP_LABEL, cardOfModal, cleanCard, inlineCard, type CardView } from '../src/ui/components/yearCardModel'

type Store = typeof import('../src/ui/store')

/** The key the save lives under in localStorage and in IndexedDB (src/game/save-backends.ts SAVE_KEY; never renamed). */
export const SAVE_KEY = 'anotherlife.save.v1'

/** The first seed each life looks at; the search goes up from there until a life reaches its part (found, not pinned). */
const SEED_FROM = [11, 41, 71] as const
const SEED_TRIES = 12
const BIRTH_YEAR = 1996
const COUNTRY = 'us'
const GROWN_AT = 30
const SAVINGS = 5_000_000

// ---------------------------------------------------------------------------------------------------------------------------------
// The machine: a storage shim for node, and the words of the transcript

/** The store reads and writes localStorage the way a browser does. Node has none, so a Map stands in (what test/store.test.ts does). */
export function installStorageShim(): void {
  try {
    if (typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function') return
  } catch {
    // a localStorage that throws on access is replaced as well
  }
  const data = new Map<string, string>()
  const ls = {
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() {
      return data.size
    },
  }
  Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true, writable: true })
}

/** The choices a sensible player prefers when a popup is not the part being played (as test/market-kit.ts drain does). */
const PREFER = ['decline', 'settle', 'innovate', 'match', 'pounce', 'outspend', 'cover', 'loan', 'investor', 'closed', 'steady', 'sign', 'pay', 'savings', 'no', 'humble', 'apologize', 'promote', 'market', 'ignore']

const oneLine = (s: string): string => s.replace(/\s+/g, ' ').trim()
const clip = (s: string, n: number): string => (s.length <= n ? s : `${s.slice(0, n - 3).trimEnd()}...`)

/** The three dots of the confidence chip as a player reads them, with the year when the reading is old. */
export function chipText(conf: 0 | 1 | 2 | 3, asOf: number | null = null): string {
  const dots = [1, 2, 3].map((i) => (conf >= i ? '●' : '○')).join('')
  return `[${dots}${asOf === null ? '' : ` as of ${asOf}`}]`
}

function percentile(xs: readonly number[], p: number): number {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))]!
}

const mean = (xs: readonly number[]): number => (xs.length === 0 ? 0 : xs.reduce((s, x) => s + x, 0) / xs.length)

function spread(xs: readonly number[]): string {
  return xs.length === 0 ? 'none' : `median ${percentile(xs, 0.5)}, p90 ${percentile(xs, 0.9)}, most ${Math.max(...xs)}`
}

/** A number the way its unit is read: money as a short amount, a percent or a chance as a percent, a score as a whole number. */
function showValue(unit: string | undefined, v: number): string {
  switch (unit) {
    case 'money':
      return shortMoney(v)
    case 'delta':
      return `${v < 0 ? '-' : '+'}${shortMoney(Math.abs(v))}`
    case 'pct':
    case 'odds':
      return `${(v * 100).toFixed(v < 0.1 ? 2 : 0)}%`
    default:
      return String(Math.round(v))
  }
}

/** Money amounts in a line: "-$11K to +$221K" gives [-11000, 221000]. */
function moneyIn(text: string): number[] {
  const out: number[] = []
  for (const m of text.matchAll(/([+-]?)\$([\d,.]+)([KMB]?)/g)) {
    const mult = m[3] === 'K' ? 1e3 : m[3] === 'M' ? 1e6 : m[3] === 'B' ? 1e9 : 1
    out.push((m[1] === '-' ? -1 : 1) * Number(m[2]!.replace(/,/g, '')) * mult)
  }
  return out
}

// ---------------------------------------------------------------------------------------------------------------------------------
// What the run measures

export interface YearStat {
  life: number
  age: number
  year: number
  /** Screens waiting for the player right after the birthday, the card included (a run of plain notices is one screen, as the digest card draws it). */
  arrived: number
  /** Of those, the ones that ask for an answer (a choice, an input, a minigame). */
  asks: number
  /** Every screen of the year once answered: the arrivals and what the answers brought (an outcome is a reply, not an arrival). */
  screens: number
  /** What the old flow would have queued at this birthday: ageUp alone, the year events resolved, no Quiet Mode, no close. */
  before: number
  /** Notices Quiet Mode sent to the inbox this year instead of making a popup. */
  inbox: number
  /** The year card: its lines (headline, stories, money, people, news), its folded groups and the lines in them. Null when the year had none. */
  card: { lines: number; groups: number; folded: number; popup: boolean; head: string; cut: number } | null
  grownUp: boolean
}

export interface BandStat {
  life: number
  what: string
  key: string
  lo: number
  hi: number
  truth: number
  conf: number
  unit: string
  when: 'passive' | 'bought'
  inside: boolean
}

export interface LifeNotes {
  no: number
  title: string
  seed: number
  years: YearStat[]
  bands: BandStat[]
  /** The odds captions a player read (Realistic), with the age. */
  odds: { age: number; text: string }[]
  /** Facts the summary quotes: whether a project flopped, how many were hired, what a screen showed. */
  facts: Record<string, number | string | boolean>
}

export interface ShotRecord {
  name: 'research' | 'market' | 'card' | 'card-popup'
  file: string
  json: string
  title: string
  life: number
  age: number
  year: number
  /** What is on the screen once it is open. */
  sees: string[]
  /** Menu row labels to tap from the game screen, tab first; empty when the screen is the game screen itself. */
  taps: string[][]
  score: number
}

export interface Summary {
  lines: string[]
  bands: BandStat[]
  years: YearStat[]
}

export interface PlaythroughResult {
  markdown: string
  shots: ShotRecord[]
  lives: LifeNotes[]
  summary: Summary
}

// ---------------------------------------------------------------------------------------------------------------------------------
// The document

class Doc {
  readonly lines: string[] = []
  h3(t: string): void {
    this.blank()
    this.lines.push(`### ${t}`, '')
  }
  p(t: string): void {
    this.blank()
    this.lines.push(t, '')
  }
  bullet(t: string, depth = 0): void {
    this.lines.push(`${'  '.repeat(depth)}- ${t}`)
  }
  /** A block of text indented as a quote, so a popup reads as one thing. */
  quote(title: string, body: string[]): void {
    this.blank()
    this.lines.push(`> **${title}**`)
    for (const b of body) this.lines.push(`> ${b}`)
    this.lines.push('')
  }
  table(head: readonly string[], rows: readonly (readonly string[])[]): void {
    this.blank()
    this.lines.push(`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`)
    for (const r of rows) this.lines.push(`| ${r.map((c) => c.replace(/\|/g, '/')).join(' | ')} |`)
    this.lines.push('')
  }
  blank(): void {
    if (this.lines.length > 0 && this.lines[this.lines.length - 1] !== '') this.lines.push('')
  }
  toString(): string {
    return `${this.lines.join('\n')}\n`
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------
// The run: one store, one life at a time

type Answer = string | ((m: ChoiceModal | InputModal | MinigameModal) => string)

interface Run {
  store: Store
  doc: Doc
  notes: LifeNotes
  lifeNo: number
  /** Answers for the popups of a part, by script id (a choice id, an input value or a minigame result); else the default policy. */
  answers: Map<string, Answer>
  /** The screens of this stretch of play (reset at every birthday). */
  screens: { kind: string; title: string; asked: boolean; text: string }[]
  /** While true the popups are answered and counted but not told: the years of growing up are a table, not a story. */
  quiet: boolean
  /** The best year card of each kind seen in this life, as a save. */
  best: { popup: ShotRecord | null; inline: ShotRecord | null }
  /** The shots of the part itself. */
  shots: ShotRecord[]
}

const game = (r: Run): GameState => {
  const g = r.store.getApp().game
  if (!g) throw new Error('r3-playthrough: no life in the store')
  return g
}

/** A life that cannot be used for its part (it died, went to prison, could not do what the part needs); the caller tries the next seed. */
export class LifeDropped extends Error {}

/** The text a menu row shows: label, subtitle, hint and the reason it is greyed out, with its chip. */
function rowText(g: GameState, n: MenuNode): string {
  if (n.type === 'heading') return `-- ${n.label} --`
  if (n.type === 'info') {
    const text = typeof n.text === 'string' ? n.text : n.text(g)
    const c = nodeConf(n, g)
    return `${text}${c ? ` ${chipText(c.conf, c.asOf)}` : ''}`
  }
  const sub = nodeSubtitle(n, g)
  const hint = nodeHint(n, g)
  const why = nodeDisabled(n, g)
  const c = nodeConf(n, g)
  return [`${n.label}${c ? ` ${chipText(c.conf, c.asOf)}` : ''}`, sub, hint ? `hint: ${hint}` : null, why ? `greyed out: ${why}` : null].filter((x): x is string => x !== null).join(' | ')
}

const visible = (g: GameState, nodes: readonly MenuNode[]): MenuNode[] => nodes.filter((n) => nodeVisible(n, g))

/** Every visible row below some nodes, opened to `depth` (a screen read to the end, as a player scrolls it). */
function flat(g: GameState, nodes: readonly MenuNode[], depth: number): { node: MenuNode; depth: number }[] {
  const out: { node: MenuNode; depth: number }[] = []
  const walk = (list: readonly MenuNode[], d: number): void => {
    for (const n of visible(g, list)) {
      out.push({ node: n, depth: d })
      if (n.type === 'menu' && d < depth) walk(n.children(g), d + 1)
    }
  }
  walk(nodes, 0)
  return out
}

type Tab = 'Assets' | 'Activities' | 'Occupation'
const ROOTS: Record<Tab, MenuGroup> = { Assets: assetsMenu, Activities: activitiesMenu, Occupation: occupationMenu }

export interface Tap {
  /** The labels tapped, tab first: what shots.md lists. */
  path: string[]
  node: MenuNode | null
  /** The rows of the screen the last tap opened (a group); [] for an action. */
  rows: MenuNode[]
  /** The reason a row was greyed out (the toast the player would see), or null. */
  toast: string | null
  /** The slider caption read before the run, for an action with a slider. */
  caption: string | null
  confirm: string | null
  ran: boolean
}

/**
 * Tap rows by label from a tab of the bottom bar, the way MenuList does: a group opens, a greyed row gives its reason as a toast and
 * does nothing, an action with a slider shows its caption at `value` and then runs with it, and a confirm text is read before the run.
 * A label that is not on the screen throws and names what is: a script that taps a row the player cannot see is wrong.
 */
function tap(r: Run, tab: Tab, labels: readonly string[], opts: { value?: string; run?: boolean } = {}): Tap {
  const result: Tap = { path: [tab, ...labels], node: null, rows: [], toast: null, caption: null, confirm: null, ran: false }
  let nodes: MenuNode[] = ROOTS[tab].children(game(r))
  for (let i = 0; i < labels.length; i++) {
    const g = game(r)
    const label = labels[i]!
    const shown = visible(g, nodes)
    const node = shown.find((n): n is MenuAction | MenuGroup => (n.type === 'menu' || n.type === 'action') && n.label === label)
    if (!node) {
      const have = shown.filter((n): n is MenuAction | MenuGroup => n.type === 'menu' || n.type === 'action').map((n) => n.label)
      throw new Error(`r3-playthrough: no row "${label}" under ${result.path.slice(0, i + 1).join(' > ')}; the rows are: ${have.join(', ')}`)
    }
    result.node = node
    const why = nodeDisabled(node, g)
    if (why) {
      result.toast = why
      return result
    }
    if (node.type === 'menu') {
      nodes = node.children(g)
      if (i === labels.length - 1) result.rows = visible(g, nodes)
      continue
    }
    if (i !== labels.length - 1) throw new Error(`r3-playthrough: "${label}" is an action, not a menu, in ${result.path.join(' > ')}`)
    if (node.input?.kind === 'slider' && opts.value !== undefined) result.caption = sliderPreview(node.input, g, Number(opts.value))
    result.confirm = confirmText(node, g)
    if (opts.run !== false) {
      r.store.runMenuAction(node, opts.value)
      result.ran = true
    }
  }
  return result
}

function writeTap(r: Run, t: Tap): void {
  r.doc.bullet(`Tap: ${t.path.join(' > ')}${t.ran ? '' : ' (read only)'}`)
  if (t.toast) r.doc.bullet(`greyed out, the player sees: ${t.toast}`, 1)
  if (t.caption) r.doc.bullet(`slider caption: ${t.caption}`, 1)
  if (t.confirm) r.doc.bullet(`confirm: ${t.confirm}`, 1)
}

/** Tap a row and, when it ran, answer what it queued. */
function act(r: Run, tab: Tab, labels: readonly string[], opts: { value?: string } = {}): Tap {
  const t = tap(r, tab, labels, opts)
  writeTap(r, t)
  if (t.ran) answerAll(r)
  return t
}

/** Open a screen and write its rows (to `depth`) into the transcript, with their chips. */
function read(r: Run, tab: Tab, labels: readonly string[], opts: { depth?: number; skip?: (n: MenuNode) => boolean; max?: number } = {}): Tap {
  const t = tap(r, tab, labels, { run: false })
  writeTap(r, t)
  const g = game(r)
  const max = opts.max ?? 40
  const rows = flat(g, t.rows, opts.depth ?? 0).filter((x) => !(opts.skip?.(x.node) ?? false))
  for (const { node, depth } of rows.slice(0, max)) r.doc.bullet(rowText(g, node), depth + 1)
  if (rows.length > max) r.doc.bullet(`... and ${rows.length - max} more rows`, 1)
  return t
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Popups: what the player sees, and the answer

function defaultAnswer(m: ChoiceModal | InputModal | MinigameModal): string {
  if (m.kind === 'choice') {
    const pick = m.choices.find((c) => PREFER.includes(c.id)) ?? m.choices[m.choices.length - 1]
    return pick!.id
  }
  if (m.kind === 'input') return m.defaultValue || String(m.min ?? 1)
  if (m.game === 'annualReport') {
    const d = m.data as unknown as AnnualReportData
    return JSON.stringify({ price: d.suggestedPrice, production: Math.min(d.maxProduction, Math.round(d.expectedDemand * 1.05)) })
  }
  return m.game === 'blackjack' ? 'push' : m.game === 'burglary' ? JSON.stringify({ loot: 0, caught: false }) : m.game === 'prisonEscape' ? 'caught' : m.game === 'pickpocket' ? 'fail' : 'skip'
}

const toneMark = (m: NoticeModal): string => (m.tone === 'good' ? ' (good news)' : m.tone === 'bad' ? ' (bad news)' : '')

function seen(r: Run, kind: string, title: string, lines: string[], asked: boolean): void {
  r.screens.push({ kind, title, asked, text: lines.join(' ') })
  if (!r.quiet) r.doc.quote(`${kind}: ${title}`, lines)
}

/** The card as the popup draws it: the stories, the money line, the people, the news, and the groups with their counts. */
function cardLines(c: CardView, withHead = true): string[] {
  const out = [...(withHead ? [`Headline: ${c.head}`] : []), `Age ${c.age}, ${c.year}`, ...c.stories.map((s) => `* ${s}`)]
  if (c.money) out.push(`$ ${c.money}`)
  for (const p of c.people) out.push(`@ ${p}`)
  if (c.world) out.push(`~ ${c.world}`)
  for (const gp of c.groups) out.push(`+ ${GROUP_LABEL[gp.k]} (${gp.n})${gp.lines.length ? `: ${gp.lines.map((l) => clip(l, 70)).join(' / ')}` : ''}`)
  return out
}

/** How good a card is for a screenshot: more lines, more groups, more folded lines, and a headline that is not cut off. */
const cardScore = (c: CardView): number => c.lineCount * 10 + c.groups.length * 3 + c.groups.reduce((s, x) => s + Math.min(x.n, 6), 0) - (c.head.endsWith('...') ? 25 : 0)

function keepCard(r: Run, kind: 'popup' | 'inline', view: CardView): void {
  const score = cardScore(view)
  const held = r.best[kind]
  if (held && held.score >= score) return
  const g = game(r)
  r.best[kind] = {
    name: kind === 'popup' ? 'card-popup' : 'card',
    file: kind === 'popup' ? 'shot-card-popup.json' : 'shot-card.json',
    json: JSON.stringify(g),
    title: kind === 'popup' ? 'The year card as a popup' : 'The year card on the Life tab',
    life: r.lifeNo,
    age: g.character.age,
    year: g.year,
    sees: kind === 'popup' ? [`The year card is the popup on top of the game screen. The groups under it (${view.groups.map((x) => GROUP_LABEL[x.k]).join(', ')}) open on a tap and show how many lines each folded.`, ...cardLines(view)] : ['The game screen with the card drawn above the life log (a card is a popup only for the first ten years of a life). The groups open on a tap.', ...cardLines(view)],
    taps: [],
    score,
  }
}

/**
 * Answer the whole queue the way the player does, one screen at a time, and write each screen into the transcript. A screen is what
 * ModalHost draws (planHead): the year card alone, a run of plain notices as one digest card, otherwise the head popup. The answer goes
 * through the store, so every handler, every follow-up and every save is the real one.
 */
function answerAll(r: Run): void {
  const { store } = r
  for (let guard = 0; ; guard++) {
    const g = game(r)
    if (g.queue.length === 0) return
    if (guard > 400) throw new Error(`r3-playthrough: the queue never drains; head: ${JSON.stringify(g.queue[0]).slice(0, 300)}`)
    const head = g.queue[0]!
    if (head.kind === 'aiTask') {
      store.processQueue()
      if (game(r).queue[0]?.id === head.id) throw new Error('r3-playthrough: a built-in task is stuck at the head of the queue')
      continue
    }
    const plan = planHead(g.queue, FLAGS.noticeDigest)
    if (plan.kind === 'yearCard') {
      const view = cardOfModal(plan.modal)!
      keepCard(r, 'popup', view)
      seen(r, 'Year card (popup)', view.head, cardLines(view, false), false)
      store.dismissNotice(plan.modal.id)
      continue
    }
    if (plan.kind === 'digest') {
      const rows = digestRows(plan.items)
      seen(r, 'Digest card', `${plan.items.length} updates`, rows.map((x) => `${x.title}${x.toneLabel ? ` (${x.toneLabel.toLowerCase()})` : ''}: ${clip(oneLine(x.text), 230)}`), false)
      store.dismissNotices(plan.items.map((x) => x.id))
      continue
    }
    const m = head
    if (m.kind === 'notice') {
      seen(r, 'Notice', m.title, [`${clip(oneLine(m.text), 460)}${toneMark(m)}`], false)
      store.dismissNotice(m.id)
    } else if (m.kind === 'choice') {
      const given = r.answers.get(m.scriptId ?? '')
      const id = typeof given === 'function' ? given(m) : given ?? defaultAnswer(m)
      const picked = m.choices.find((c) => c.id === id) ?? m.choices[m.choices.length - 1]!
      seen(r, 'Choice', m.title, [clip(oneLine(m.text), 520), ...m.choices.map((c) => `${c.id === picked.id ? '[x]' : '[ ]'} ${c.label}${c.hint ? ` (hint: ${clip(oneLine(c.hint), 100)})` : ''}`)], true)
      store.chooseOption(m.id, picked.id)
    } else if (m.kind === 'input') {
      const given = r.answers.get(m.scriptId)
      const value = typeof given === 'function' ? given(m) : given ?? defaultAnswer(m)
      seen(r, 'Input', m.title, [clip(oneLine(m.text), 360), `answer: ${value}${m.min !== undefined ? ` (the slider runs from ${m.min} to ${m.max})` : ''}`], true)
      store.submitInput(m.id, value)
    } else if (m.kind === 'minigame') {
      const given = r.answers.get(m.scriptId)
      const value = typeof given === 'function' ? given(m) : given ?? defaultAnswer(m)
      seen(r, 'Minigame', m.title, [`${m.game}: answer ${clip(value, 160)}`], true)
      store.finishMinigame(m.id, value)
    }
  }
}

/** The screens a queue holds when nothing is answered, and how many of them ask for an answer. A run of plain notices is one screen. */
function countScreens(queue: readonly ModalItem[]): { screens: number; asks: number } {
  const items = queue.filter((m) => m.kind !== 'aiTask')
  let screens = 0
  let asks = 0
  for (let i = 0; i < items.length; ) {
    const plan = planHead(items.slice(i), FLAGS.noticeDigest)
    screens++
    const m = items[i]!
    if (m.kind === 'choice' || m.kind === 'input' || m.kind === 'minigame') asks++
    i += plan.kind === 'digest' ? plan.items.length : 1
  }
  return { screens, asks }
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Years

/** What the old flow would have queued at this birthday: ageUp on a copy, the year events resolved, nothing answered. */
function oldFlowCount(r: Run): number {
  const g = game(r)
  const copy = cloneForAct(g)
  try {
    bindMoneyContext(copy)
    ageUp(copy)
    // A built-in task is resolved where it stands, as the store does when it reaches the head: what it queues takes its place.
    for (let i = 0; i < 20; i++) {
      const at = copy.queue.findIndex((m) => m.kind === 'aiTask')
      if (at < 0) break
      const [task] = copy.queue.splice(at, 1) as [Extract<ModalItem, { kind: 'aiTask' }>]
      const rest = copy.queue.length
      applyFallback(copy, task.task)
      copy.queue.splice(at, 0, ...copy.queue.splice(rest))
    }
    return countScreens(copy.queue).screens
  } finally {
    bindMoneyContext(g)
  }
}

/** One birthday through the store with the year card on, then every popup answered. Writes the year's block and returns its numbers. */
function ageOneYear(r: Run): YearStat {
  const before = oldFlowCount(r)
  const inbox0 = readInbox(game(r)).total
  r.screens = []
  r.store.ageUpAction()
  const g1 = game(r)
  const arrival = countScreens(g1.queue)
  if (!r.quiet) r.doc.h3(`Age ${g1.character.age}, ${g1.year}`)
  answerAll(r)
  const g2 = game(r)
  // The card the Life tab draws (a card is a popup for the first ten years of a life only), else the one the year book holds.
  const inline = inlineCard(g2.flags.yearBook, g2.year)
  const kept = readYearBook(g2).cards.find((c) => c.year === g2.year)
  const view = inline ?? (kept ? cleanCard(kept) : null)
  const card: YearStat['card'] = view ? { lines: view.lineCount, groups: view.groups.length, folded: view.groups.reduce((s, x) => s + x.n, 0), popup: inline === null, head: view.head, cut: [view.head, ...view.stories, ...view.people].filter((l) => l.endsWith('...')).length } : null
  if (inline && !r.quiet) {
    keepCard(r, 'inline', inline)
    r.doc.quote('Year card (drawn on the Life tab)', cardLines(inline))
  }
  const stat: YearStat = {
    life: r.lifeNo,
    age: g2.character.age,
    year: g2.year,
    arrived: arrival.screens,
    asks: arrival.asks,
    screens: r.screens.length,
    before,
    inbox: Math.max(0, readInbox(g2).total - inbox0),
    card,
    grownUp: g2.character.age > GROWN_AT,
  }
  r.notes.years.push(stat)
  if (!r.quiet) {
    r.doc.bullet(`screens: ${stat.arrived} arrived (${stat.asks} asked for an answer), ${stat.screens} in all with the replies; the old flow would have queued ${stat.before}; ${stat.inbox} notices went to the inbox`)
    r.doc.bullet(card ? `year card: ${card.lines} lines, ${card.groups} folded groups holding ${card.folded} lines, ${card.popup ? 'a popup' : 'drawn on the Life tab'}` : 'year card: none this year')
    r.doc.blank()
  }
  return stat
}

export interface LifeOptions {
  seed: number
  birthYear: number
  countryId: string
}

/**
 * A new life in the store, played from birth to `untilAge` with every popup answered by the default policy, in the store flow with the
 * year card on. The years are counted (popups, card lines) and not told: they go in the table of the life. No talent is picked at birth,
 * so nothing sharpens a reading but what the life earns.
 */
function growUp(r: Run, o: LifeOptions, untilAge: number): void {
  r.store.startNewLife({ seed: o.seed, year: o.birthYear, countryId: o.countryId, talents: [] })
  r.quiet = true
  r.screens = []
  answerAll(r)
  while (game(r).character.alive && game(r).character.age < untilAge) {
    ageOneYear(r)
    if (game(r).character.prison) throw new LifeDropped(`in prison at ${game(r).character.age}`)
  }
  r.quiet = false
  if (!game(r).character.alive) throw new LifeDropped(`died at ${game(r).character.age}`)
  const g = game(r)
  const grown = r.notes.years.filter((y) => y.age <= untilAge)
  r.doc.h3(`Growing up: ages 1 to ${g.character.age} (played through the same flow, counted and not told)`)
  r.doc.p(`${g.character.firstName} ${g.character.lastName} was born in ${o.birthYear} in ${g.character.city} and is ${g.character.age} in ${g.year}. Screens arriving at a birthday: ${spread(grown.map((y) => y.arrived))}; the old flow would have queued ${spread(grown.map((y) => y.before))}.`)
  r.doc.table(
    ['age', 'arrived', 'asked', 'old flow', 'inbox', 'year card'],
    grown.filter((y) => y.age % 3 === 0 || y.age === untilAge).map((y) => [String(y.age), String(y.arrived), String(y.asks), String(y.before), String(y.inbox), y.card ? `${y.card.lines} lines${y.card.popup ? ', a popup' : ', on the Life tab'}` : '-']),
  )
}

/**
 * The life's savings at 30: the life played so far has little and a founder has more, so a relative's gift of `dollars` arrives, booked
 * through the ledger like any other dollar (a direct write to the cash would leave the books $5M short, and the year card's cash line
 * reads the books).
 */
function grantSavings(r: Run, dollars: number): void {
  r.store.act((g) => {
    addMoney(g, dollars, 'gift')
    if (!g.character.licenses.includes('driver')) g.character.licenses = [...g.character.licenses, 'driver']
  })
  r.doc.p(`At ${GROWN_AT} a relative's gift of ${formatMoney(dollars)} arrives, booked through the ledger as a gift (a stand-in for the years of saving a founder has; test/probe-life.ts writes the cash instead).`)
}

/** The company as the committed game holds it now: an Asset kept from before is a copy that the store has since replaced. */
const live = (r: Run, a: Asset): Asset => game(r).assets.find((x) => x.id === a.id) ?? a
const bizNow = (r: Run, a: Asset): BizState => readBiz(game(r), live(r, a))

const companyNamed = (r: Run, name: string): Asset => {
  const a = game(r).assets.find((x) => x.kind === 'business' && x.name === name)
  if (!a) throw new LifeDropped(`no company called ${name}`)
  return a
}

/**
 * Found a company the way a player does: Assets > Businesses > Start a Business > the trade's row, then the popups of the flow (name,
 * city, starting capital, number of shares, how to pay). `capitalTimes` is a multiple of the least capital the slider allows, so the
 * company opens with working cash to fund research and hires from.
 */
function found(r: Run, industryLabel: string, name: string, capitalTimes: number): Asset {
  r.doc.h3(`Age ${game(r).character.age}, ${game(r).year}: founding ${name}`)
  r.answers.set('business.found.name', () => name)
  r.answers.set('business.found.city', () => 'city0')
  r.answers.set('business.found.capital', (m) => String(Math.round(((m as InputModal).min ?? 0) * capitalTimes)))
  r.answers.set('business.found.funding', () => 'savings')
  r.answers.set('business.found.runner', () => 'me')
  const t = act(r, 'Assets', ['Businesses', 'Start a Business', industryLabel])
  r.answers.clear()
  if (t.toast) throw new LifeDropped(`cannot found ${industryLabel}: ${t.toast}`)
  return companyNamed(r, name)
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Estimates against the truth

/**
 * Read the hidden numbers behind some keys the way `know` gives them to the player (the band, the chip) and set each against the truth the
 * key's owner reads. Writes a table into the transcript and keeps the numbers.
 */
function readBands(r: Run, keys: readonly string[], when: 'passive' | 'bought', heading: string): BandStat[] {
  const g = game(r)
  const out: BandStat[] = []
  const rows: string[][] = []
  for (const key of keys) {
    const kind = kindOfKey(key)
    const truth = kind?.truth(g, key) ?? null
    if (!kind || truth === null) continue
    const est = know(g, key, truth)
    if (est.exact) continue
    const unit = ruleOf(key)?.unit ?? undefined
    const inside = est.lo <= truth && truth <= est.hi
    const stat: BandStat = { life: r.lifeNo, what: kind.label(g, key), key, lo: est.lo, hi: est.hi, truth, conf: est.conf, unit: unit ?? 'score', when, inside }
    out.push(stat)
    rows.push([stat.what, est.words, `${showValue(unit, est.lo)} to ${showValue(unit, est.hi)}`, chipText(est.conf, est.asOf ?? null), showValue(unit, truth), inside ? 'yes' : 'NO'])
  }
  r.notes.bands.push(...out)
  if (rows.length > 0) {
    r.doc.bullet(`${heading}: estimates against the truth (the player never sees the truth column)`)
    r.doc.table(['number', 'the screen says', 'the 80% band', 'chip', 'truth', 'inside'], rows)
  }
  return out
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Life 1: research

/** The product ideas of the Products screen, in the order the screen shows them. */
function ideaRows(r: Run, a: Asset): MenuAction[] {
  const t = tap(r, 'Assets', ['Businesses', a.name, 'Run', 'Products'], { run: false })
  return t.rows.filter((n): n is MenuAction => n.type === 'action' && n.id.startsWith('biz.launch.'))
}

const oddsPart = (caption: string): string => /Odds[^·]*/.exec(caption)?.[0].trim() ?? caption

/**
 * Read one idea's odds line at several budgets, as the slider shows it, and write what the player reads next to what Exact mode would say
 * and the terms behind it (which the player may and may not read). Returns the number of terms behind the line at the last budget.
 */
function readResearch(r: Run, a: Asset, idea: string, multiples: readonly number[]): number {
  const g = game(r)
  const row = ideaRows(r, a).find((n) => n.label === idea)
  if (!row || row.input?.kind !== 'slider') throw new LifeDropped(`no research slider for ${idea}`)
  const input = row.input
  const normal = Number(input.defaultValue?.(g) ?? input.min ?? 0)
  const policy = revealPolicyOf(g)
  let terms = 0
  r.doc.bullet(`Tap: Assets > Businesses > ${a.name} > Run > Products > ${idea}  (opens the budget slider, from ${formatMoney(input.min ?? 0)} to ${formatMoney(input.max ?? 0)}; read here, not run)`)
  for (const m of multiples) {
    const value = Math.round(Math.min(input.max ?? normal * m, Math.max(input.min ?? 0, normal * m)))
    const real = sliderPreview(input, g, value) ?? ''
    const exact = withInfoMode('exact', () => sliderPreview(input, g, value) ?? '')
    const why = rdQuote(g, bizNow(r, a), idea, value).why.filter((x) => Math.round(x.pts) !== 0)
    terms = why.length
    r.doc.bullet(`${m} x the normal budget (${formatMoney(value)}): ${real}`, 1)
    r.doc.bullet(`what Exact mode would say, not what the player sees: ${exact}`, 2)
    r.doc.bullet(`the terms: ${why.length === 0 ? 'none moved the odds' : why.map((x) => `${x.label} ${x.pts >= 0 ? '+' : ''}${Math.round(x.pts)}${policy.knows(x.key) ? '' : ' (hidden from the player)'}`).join(', ')}`, 2)
    if (m === 2) r.notes.odds.push({ age: g.character.age, text: oddsPart(real) })
  }
  return terms
}

function life1(r: Run, seed: number): void {
  r.notes.title = 'Life 1: a founder runs product research to a launch'
  growUp(r, { seed, birthYear: BIRTH_YEAR, countryId: COUNTRY }, GROWN_AT)
  grantSavings(r, SAVINGS)
  const a = found(r, 'Café', 'Maple Café', 3)
  let launched = 0
  let flops = 0
  let started = 0
  let idea = ''
  let bestRich = -1
  for (let i = 0; i < 9 && launched === 0; i++) {
    const g = game(r)
    if (rdProjects(bizNow(r, a)).length === 0) {
      r.doc.h3(`Age ${g.character.age}, ${g.year}: choosing a research project`)
      const rows = ideaRows(r, a)
      if (idea === '' || !rows.some((x) => x.label === idea)) idea = rows[0]?.label ?? ''
      if (idea === '') throw new LifeDropped('no product idea on the drawing board')
      const rich = readResearch(r, a, idea, started === 0 ? [0.5, 1, 2, 4] : [1, 2, 4]) + (flops > 0 ? 3 : 0)
      const row = ideaRows(r, a).find((n) => n.label === idea)!
      const normal = Number(row.input!.defaultValue?.(g))
      if (rich >= bestRich) {
        bestRich = rich
        const shown = sliderPreview(row.input!, g, Math.round(normal * 2)) ?? ''
        r.shots = r.shots.filter((s) => s.name !== 'research')
        r.shots.push({
          name: 'research',
          file: 'shot-research.json',
          json: JSON.stringify(g),
          title: 'The research odds with their reasons',
          life: r.lifeNo,
          age: g.character.age,
          year: g.year,
          sees: [
            `The budget slider "R&D budget for ${idea}" opens with a caption under it. Drag it to 2 x the normal budget (about ${formatMoney(Math.round(normal * 2))}) and it reads:`,
            shown,
            flops > 0 ? 'A project in this family flopped before, so the line carries the know-how that flop banked.' : 'No project has flopped yet, so the terms are the funding and the team.',
          ],
          taps: [['Assets', 'Businesses', a.name, 'Run', 'Products', idea]],
          score: rich,
        })
      }
      // The first try at the normal budget, then double: the player has learned the field.
      r.screens = []
      const start = act(r, 'Assets', ['Businesses', a.name, 'Run', 'Products', idea], { value: String(Math.round(normal * (started === 0 ? 1 : 2))) })
      started++
      // What the player is told once the money is spent: the notice, and the row of the project on the Products screen.
      const underway = r.screens.find((x) => x.title === 'R&D Underway')
      const underwayPct = underway ? /about (\d+)% odds/.exec(underway.text)?.[0] : undefined
      const dev = tap(r, 'Assets', ['Businesses', a.name, 'Run', 'Products'], { run: false }).rows.find((n) => n.id.startsWith('biz.dev.'))
      const devText = dev && dev.type === 'info' ? (typeof dev.text === 'string' ? dev.text : dev.text(game(r))) : ''
      r.doc.bullet(`the Products screen now lists the project: ${devText || '(no row)'}`)
      if (underwayPct && r.notes.facts.underwayPercent === undefined) {
        r.notes.facts.underwayPercent = underwayPct
        r.notes.facts.underwayCaption = oddsPart(start.caption ?? '')
        r.notes.facts.devRowPercent = /(\d+)% odds/.exec(devText)?.[0] ?? ''
      }
    }
    const before = { products: new Set(bizNow(r, a).products.map((p) => p.name)), dev: rdProjects(bizNow(r, a)).map((p) => p.name) }
    ageOneYear(r)
    const after = bizNow(r, a)
    const won = after.products.filter((p) => !before.products.has(p.name)).map((p) => p.name)
    const gone = before.dev.filter((n) => !rdProjects(after).some((p) => p.name === n))
    launched += won.length
    flops += gone.filter((n) => !won.includes(n)).length
    if (gone.length > 0) {
      r.doc.bullet(`research result: ${won.length > 0 ? `${won.join(', ')} launched` : `${gone.join(', ')} flopped`} (${launched} launched, ${flops} flopped so far)`)
      const results = r.screens.find((x) => /R&D Results/.test(x.title))
      if (results && won.length === 0 && r.notes.facts.flopText === undefined) r.notes.facts.flopText = clip(results.text.replace(/^\S+\s/, ''), 230)
      if (results && won.length > 0 && r.notes.facts.launchText === undefined) r.notes.facts.launchText = clip(results.text.replace(/^\S+\s/, ''), 230)
    }
  }
  r.notes.facts.launched = launched
  r.notes.facts.flops = flops
  if (launched === 0) throw new LifeDropped('no product launched in nine years')

  // After a launch: the line on sale, then the pace a player picks from 18 (Life Priorities), and what it does to the same odds line.
  const g0 = game(r)
  r.doc.h3(`Age ${g0.character.age}, ${g0.year}: after the launch`)
  read(r, 'Assets', ['Businesses', a.name, 'Run', 'Products'], { skip: (n) => n.id.startsWith('biz.heavy') || n.type === 'heading' })
  const amb = ambitionReveal(g0)
  r.doc.bullet(`Profile ambition: ${amb.shown ? `${amb.word} (the number ${amb.value} is not shown in Realistic)` : 'not shown before 18'}; posture ${readYou(g0).posture}; fatigue ${Math.round(fatigueOf(g0))}`)
  act(r, 'Activities', ['Life Priorities', 'Push hard'])
  for (let i = 0; i < 2; i++) ageOneYear(r)
  const g1 = game(r)
  r.doc.h3(`Age ${g1.character.age}, ${g1.year}: two years of pushing hard`)
  r.doc.bullet(`pace in force ${readYou(g1).effective}; fatigue ${Math.round(fatigueOf(g1))}; burnouts ${readYou(g1).burnouts}`)
  // The other research screen: Heavy R&D, which needs more cash than a cafe holds, so the owner puts some in first.
  r.doc.h3(`Age ${g1.character.age}, ${g1.year}: Heavy R&D, the other research screen`)
  act(r, 'Assets', ['Businesses', a.name, 'Money', 'Invest My Own Money'], { value: '1000000' })
  const products = ['Businesses', a.name, 'Run', 'Products']
  const heavy = tap(r, 'Assets', products, { run: false }).rows.find((n): n is MenuAction => n.type === 'action' && n.id.startsWith('biz.heavy.'))
  if (heavy) {
    const row = nodeSubtitle(heavy, game(r)) ?? ''
    const asks = tap(r, 'Assets', [...products, heavy.label], { run: false })
    r.doc.bullet(`the row: ${heavy.label} | ${row}`)
    r.doc.bullet(`tapped, it asks: ${asks.confirm ?? asks.toast ?? '(nothing)'}`)
    r.notes.facts.heavyRow = row
    r.notes.facts.heavyConfirm = asks.confirm ?? ''
  }
  const next = ideaRows(r, a).find((x) => x.label !== idea) ?? ideaRows(r, a)[0]
  r.doc.h3('The same odds line after the pushed years')
  if (next) {
    readResearch(r, a, next.label, [1, 2])
    r.notes.facts.pushCaption = r.notes.odds.at(-1)?.text ?? ''
    r.notes.facts.pushFatigue = Math.round(fatigueOf(game(r)))
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Life 2: hiring and Look closer

/** The skill range a shortlist label shows: "Mason Nelson · about 35 to 85 · $68,116" gives [35, 85] and the ask. */
function labelRange(label: string): { lo: number; hi: number; ask: number } | null {
  const m = /about (\d+)(?: to (\d+))?.*\$([\d,]+)/.exec(label)
  if (!m) return null
  return { lo: Number(m[1]), hi: Number(m[2] ?? m[1]), ask: Number(m[3]!.replace(/,/g, '')) }
}

interface Candidate {
  i: number
  name: string
  lo: number
  hi: number
  ask: number
  truth: number
  trait: string
}

/** The candidates of a shortlist popup, read from what the popup prints (the true skill sits in its data, which the player never sees). */
function shortlistOf(m: ChoiceModal): Candidate[] {
  const data = m.data as unknown as { candidates?: { firstName: string; lastName: string; skill: number }[] }
  const out: Candidate[] = []
  for (const [i, c] of (data.candidates ?? []).entries()) {
    const rng = labelRange(m.choices.find((x) => x.id === `c${i}`)?.label ?? '')
    if (!rng) continue
    const line = m.text.split('\n').find((l) => l.includes(`${c.firstName} ${c.lastName}`)) ?? ''
    out.push({ i, name: `${c.firstName} ${c.lastName}`, ...rng, truth: c.skill, trait: /trait ([^.]+)\./.exec(line)?.[1] ?? '' })
  }
  return out
}

/** Answer an interview: optionally ask for the background check first, then hire the candidate whose printed range reads best. */
function hirePolicy(r: Run, check: boolean): Answer {
  return (m) => {
    const choice = m as ChoiceModal
    const list = shortlistOf(choice)
    const data = choice.data as unknown as { vet?: number; ck?: string }
    const vet = data.vet === 1
    const rows: string[][] = []
    for (const c of list) {
      const key = candKey(String(data.ck ?? ''), c.i)
      const est = know(game(r), key, c.truth)
      const inside = c.lo <= c.truth && c.truth <= c.hi
      r.notes.bands.push({ life: r.lifeNo, what: `${c.name}'s skill`, key, lo: c.lo, hi: c.hi, truth: c.truth, conf: est.conf, unit: 'score', when: vet ? 'bought' : 'passive', inside })
      rows.push([c.name, `about ${c.lo} to ${c.hi}`, chipText(est.conf), c.trait || 'not clear yet', String(c.truth), inside ? 'yes' : 'NO'])
    }
    if (!vet && list.length >= 2 && list.every((c) => c.lo === list[0]!.lo && c.hi === list[0]!.hi)) r.notes.facts.sameRanges = Number(r.notes.facts.sameRanges ?? 0) + 1
    r.doc.bullet(`the shortlist ${vet ? 'after the background check' : 'as the interview leaves it'}: the printed range against the true skill (the player never sees the last columns)`)
    r.doc.table(['candidate', 'skill reads', 'chip', 'trait', 'truth', 'inside'], rows)
    if (check && !vet && choice.choices.some((c) => c.id === 'vet')) return 'vet'
    const best = [...list].sort((a, b) => (b.lo + b.hi) / 2 - (a.lo + a.hi) / 2 || a.ask - b.ask)[0]
    if (best) {
      const line = `${best.name} (read about ${best.lo} to ${best.hi}${vet ? ' after the check' : ''}, true skill ${best.truth})`
      r.notes.facts.hireLines = [r.notes.facts.hireLines, line].filter((x) => typeof x === 'string' && x !== '').join('; ')
    }
    return best ? `c${best.i}` : 'none'
  }
}

function life2(r: Run, seed: number): void {
  r.notes.title = 'Life 2: a founder hires through the fogged screen and uses Look closer'
  growUp(r, { seed, birthYear: BIRTH_YEAR, countryId: COUNTRY }, GROWN_AT)
  grantSavings(r, SAVINGS)
  const a = found(r, 'Restaurant', 'Harbor Grill', 2)
  ageOneYear(r)
  const here = ['Businesses', a.name]

  r.doc.h3(`Age ${game(r).character.age}, ${game(r).year}: the company card, before and after Look closer`)
  read(r, 'Assets', here, { skip: (n) => n.type === 'menu' && !n.id.startsWith('look.') })
  const key = valKey(a.id)
  readBands(r, [key], 'passive', 'the valuation on the card')
  const exit = tap(r, 'Assets', here, { run: false }).rows.find((n) => n.id.startsWith('hub.biz.exit.'))
  if (exit && exit.type === 'menu') {
    const sub = nodeSubtitle(exit, game(r)) ?? ''
    r.doc.bullet(`the Exit tile on the same screen says: ${exit.label} | ${sub}`)
    // The engine's amounts are constant dollars; a screen prints them in the prices of the year, so the truth is compared as printed.
    const truth = kindOfKey(key)?.truth(game(r), key) ?? null
    const printed = moneyIn(sub)[0]
    const asPrinted = truth === null ? undefined : moneyIn(shortMoney(truth))[0]
    r.notes.facts.exitShowsTruth = printed !== undefined && asPrinted !== undefined && Math.abs(printed - asPrinted) <= 0.02 * asPrinted
  }
  read(r, 'Assets', [...here, 'Look closer'])
  act(r, 'Assets', [...here, 'Look closer', 'An analyst'])
  read(r, 'Assets', here, { skip: (n) => n.type === 'menu' })
  readBands(r, [key], 'bought', 'the valuation after the analyst')
  const again = tap(r, 'Assets', [...here, 'Look closer', 'An analyst'], { run: false })
  r.doc.bullet(`a second analyst the same year: ${again.toast ?? 'allowed'}`)

  // Hire 1: take the interview as it is. Hire 2: pay for the background check first.
  const hireRoot = [...here, 'Run', 'Employees', 'Hire Key Staff']
  const open = (): string[] => tap(r, 'Assets', hireRoot, { run: false }).rows.filter((n): n is MenuAction => n.type === 'action' && !nodeDisabled(n, game(r))).map((n) => n.label)
  const roles = open()
  if (roles.length < 2) throw new LifeDropped('fewer than two roles are open to hire')
  r.doc.h3(`Age ${game(r).character.age}, ${game(r).year}: a hire from the interview alone`)
  read(r, 'Assets', hireRoot)
  r.answers.set('business.hire', hirePolicy(r, false))
  act(r, 'Assets', [...hireRoot, roles[0]!])
  r.answers.clear()
  ageOneYear(r)
  const second = open().find((x) => x !== roles[0])
  if (!second) throw new LifeDropped('no second role open')
  r.doc.h3(`Age ${game(r).character.age}, ${game(r).year}: a hire after the background check`)
  r.answers.set('business.hire', hirePolicy(r, true))
  act(r, 'Assets', [...hireRoot, second])
  r.answers.clear()
  read(r, 'Assets', [...here, 'Run', 'Employees'], { skip: (n) => n.id.startsWith('biz.hire') })
  const staff = bizNow(r, a).staff.length
  r.notes.facts.hired = staff
  if (staff < 2) throw new LifeDropped(`${staff} hired, two wanted`)
  ageOneYear(r)
  r.doc.h3('The Intelligence Briefing after the purchases')
  read(r, 'Assets', ['Intelligence Briefing'])
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Life 3: a fogged market and intel

function life3(r: Run, seed: number): void {
  r.notes.title = 'Life 3: a founder reads a fogged market and buys intel'
  growUp(r, { seed, birthYear: BIRTH_YEAR, countryId: COUNTRY }, GROWN_AT)
  grantSavings(r, SAVINGS)
  const a = found(r, 'Fashion Brand', 'Harbor Fashion', 2)
  ageOneYear(r)
  ageOneYear(r)
  const here = ['Businesses', a.name]
  const market = [...here, 'Run', 'Market & Competition']

  r.doc.h3(`Age ${game(r).character.age}, ${game(r).year}: the market screens`)
  read(r, 'Assets', market, { max: 30 })
  r.doc.p("Market Overview is the player's own industry, so it keeps its numbers (the owner's rule). What follows is what is fogged.")
  read(r, 'Assets', [...market, 'Market Overview'])
  const list = read(r, 'Assets', [...market, 'Rival Profiles'], { max: 14 })
  const first = list.rows.find((n): n is MenuGroup => n.type === 'menu' && n.id.startsWith('biz.mkt.rival.'))
  if (!first) throw new LifeDropped('no rival to read')
  const rivalId = first.id.split('.').slice(4).join('.')
  const b0 = bizNow(r, a)
  const view = marketViewOf(game(r), b0).rivals.find((x) => x.id === rivalId)
  if (!view) throw new LifeDropped('the rival is not in the market view')
  const keys = rivalDetailKeys(game(r), b0, view)
  r.doc.h3(`${first.label}: the profile the player reads`)
  const profile = [...market, 'Rival Profiles', first.label]
  read(r, 'Assets', profile, { skip: (n) => n.type === 'menu' && n.id.startsWith('look.') })
  readBands(r, keys, 'passive', `${first.label}'s numbers`)
  // The screenshot of the fog: this screen, before anything is bought.
  const g = game(r)
  r.shots.push({
    name: 'market',
    file: 'shot-market.json',
    json: JSON.stringify(g),
    title: 'A fogged market screen',
    life: r.lifeNo,
    age: g.character.age,
    year: g.year,
    sees: [
      `${first.label}'s profile: "Strengths (estimated)" with a range of stars and a chip, "Sells:" with a range for each product line, and a Look closer group at the bottom with the price of each source and how far it sharpens.`,
      'The second path is What-If Scenarios: ranges of profit with chips, and a Look closer group under them.',
    ],
    taps: [
      ['Assets', ...profile],
      ['Assets', ...market, 'What-If Scenarios'],
    ],
    score: 1,
  })

  r.doc.h3('What-If Scenarios: ranges of profit, and what Exact mode would print')
  const sc = tap(r, 'Assets', [...market, 'What-If Scenarios'], { run: false })
  writeTap(r, sc)
  const g2 = game(r)
  // The Exact-mode text is read inside the override: a row builds its words when it is asked for them.
  const exactText = withInfoMode('exact', () => {
    const out = new Map<string, string>()
    for (const n of tap(r, 'Assets', [...market, 'What-If Scenarios'], { run: false }).rows) if (n.type === 'info') out.set(n.id, typeof n.text === 'string' ? n.text : n.text(g2))
    return out
  })
  let inside = 0
  let comparable = 0
  for (const n of sc.rows.filter((x) => x.type === 'info')) {
    const text = rowText(g2, n)
    const truthText = exactText.get(n.id) ?? ''
    r.doc.bullet(text, 1)
    r.doc.bullet(`Exact mode: ${truthText}`, 2)
    const range = moneyIn(text.replace(/costs.*$/, ''))
    const point = moneyIn(truthText.replace(/costs.*$/, ''))
    if (range.length >= 2 && point.length >= 1 && /profit/.test(text)) {
      comparable++
      if (Math.min(range[0]!, range[1]!) - 1 <= point[0]! && point[0]! <= Math.max(range[0]!, range[1]!) + 1) inside++
    }
  }
  r.notes.facts.whatIfRows = comparable
  r.notes.facts.whatIfInside = inside
  r.doc.bullet(`${inside} of ${comparable} profit ranges hold the Exact-mode figure`)

  r.doc.h3('Look closer: what each source costs, and the one that is illegal')
  const look = [...profile, 'Look closer']
  const offers = read(r, 'Assets', look)
  const illegal = offers.rows.find((n): n is MenuAction => n.type === 'action' && n.id.endsWith('.informant'))
  if (illegal) {
    const t = tap(r, 'Assets', [...look, illegal.label], { run: false })
    r.doc.bullet(`tapping "${illegal.label}" first asks: ${t.confirm ?? '(it asks nothing)'}`)
    r.notes.facts.illegalAsks = t.confirm !== null
  }
  act(r, 'Assets', [...look, 'A market report'])
  r.doc.h3(`${first.label} again, after a market report`)
  read(r, 'Assets', profile, { skip: (n) => n.type === 'menu' })
  readBands(r, keys, 'bought', `${first.label}'s numbers after the report`)
  const twice = tap(r, 'Assets', [...look, 'A market report'], { run: false })
  r.doc.bullet(`the same report again this year: ${twice.toast ?? 'allowed'}`)
  act(r, 'Assets', [...look, 'An analyst'])
  r.doc.h3(`${first.label} again, after an analyst as well (two independent readings merged)`)
  read(r, 'Assets', profile, { skip: (n) => n.type === 'menu' })
  readBands(r, keys, 'bought', `${first.label}'s numbers after the report and the analyst`)

  r.doc.h3('Other industries: is there a market screen to read?')
  const b1 = bizNow(r, a)
  const others = ['restaurant', 'semiconductor', 'software'].filter((x) => x !== b1.industry)
  r.doc.bullet(`knownMarket for another industry (the rule that would fog it): ${others.map((x) => `${x} ${knownMarket(game(r), b1, COUNTRY, x) ? 'known' : 'fogged'}`).join(', ')}`)
  r.doc.bullet('Read from the code (business/market-menu.ts): every market screen of a company asks `unknownMarket` for the company\'s own industry, so Regions & Countries, Market Overview and the leaderboards print numbers, and no screen asks for the market of a trade the player has no company in.')
  r.notes.facts.otherIndustryScreen = false

  ageOneYear(r)
  ageOneYear(r)
  r.doc.h3(`Age ${game(r).character.age}, ${game(r).year}: the same profile two years after the purchase`)
  read(r, 'Assets', profile, { skip: (n) => n.type === 'menu' })
  readBands(r, keys, 'bought', `${first.label}'s numbers two years on`)
  r.doc.bullet(`the research record holds ${Object.keys(readKnow(game(r))?.k ?? {}).length} readings`)
  r.doc.h3('The Intelligence Briefing')
  read(r, 'Assets', ['Intelligence Briefing'])
}

// ---------------------------------------------------------------------------------------------------------------------------------
// The playthrough

interface Part {
  no: number
  title: string
  play: (r: Run, seed: number) => void
  /** How well a played life did its part, for choosing among seeds; at or above `enough` the search stops. */
  score: (r: Run) => number
  enough: number
}

const PARTS: readonly Part[] = [
  { no: 1, title: 'research', play: life1, score: (r) => (Number(r.notes.facts.flops ?? 0) > 0 ? 10 : 0) + Number(r.notes.facts.launched ?? 0), enough: 11 },
  { no: 2, title: 'hiring', play: life2, score: (r) => Number(r.notes.facts.hired ?? 0), enough: 2 },
  { no: 3, title: 'market', play: life3, score: (r) => r.notes.bands.filter((x) => x.when === 'bought').length, enough: 1 },
]

function newRun(store: Store, no: number, seed: number): Run {
  return { store, doc: new Doc(), notes: { no, title: '', seed, years: [], bands: [], odds: [], facts: {} }, lifeNo: no, answers: new Map(), screens: [], quiet: false, best: { popup: null, inline: null }, shots: [] }
}

/** Play one part on the first seed from `from` that reaches it, and keep the best life if none does within the tries. */
function playPart(store: Store, part: Part, from: number): { run: Run; skipped: string[] } {
  const skipped: string[] = []
  let best: { run: Run; score: number } | null = null
  for (let seed = from; seed < from + SEED_TRIES; seed++) {
    const r = newRun(store, part.no, seed)
    try {
      part.play(r, seed)
    } catch (err) {
      if (err instanceof LifeDropped) {
        skipped.push(`seed ${seed}: ${err.message}`)
        continue
      }
      throw err
    }
    const score = part.score(r)
    if (best === null || score > best.score) best = { run: r, score }
    if (score >= part.enough) break
  }
  if (best === null) throw new Error(`r3-playthrough: no life reached its part (${part.title}) in ${SEED_TRIES} seeds from ${from}: ${skipped.join('; ')}`)
  return { run: best.run, skipped }
}

export interface PlaythroughOptions {
  /** The first seed each of the three lives looks at. */
  from?: readonly [number, number, number]
}

/**
 * One part on one seed, played to its end or to the first thing that stops it, with the transcript so far. For looking at a life that
 * the search dropped: `LifeDropped` and every other error come back as `error`, not thrown.
 */
export async function playSingle(no: 1 | 2 | 3, seed: number): Promise<{ markdown: string; notes: LifeNotes; error: string | null }> {
  installStorageShim()
  const modeBefore = infoMode()
  const store = await import('../src/ui/store')
  setInfoOverride(null)
  setFlags({ yearCard: true })
  const r = newRun(store, no, seed)
  let error: string | null = null
  try {
    store.updateSettings({ quietMode: true })
    PARTS[no - 1]!.play(r, seed)
  } catch (err) {
    error = err instanceof Error ? `${err.constructor.name}: ${err.message}\n${err.stack ?? ''}` : String(err)
  } finally {
    resetFlags()
    setInfoOverride(modeBefore === 'exact' ? 'exact' : null)
  }
  return { markdown: r.doc.toString(), notes: r.notes, error }
}

export async function runPlaythrough(opts: PlaythroughOptions = {}): Promise<PlaythroughResult> {
  installStorageShim()
  const modeBefore = infoMode()
  const store = await import('../src/ui/store')
  // Realistic is what a player gets: the test override is lifted for the whole run, so the store's own setting (absent: Realistic) rules.
  setInfoOverride(null)
  setFlags({ yearCard: true })
  try {
    store.updateSettings({ quietMode: true })
    const from = opts.from ?? SEED_FROM
    const played: { run: Run; skipped: string[] }[] = []
    for (const part of PARTS) played.push(playPart(store, part, from[part.no - 1]!))
    return assemble(played)
  } finally {
    resetFlags()
    setInfoOverride(modeBefore === 'exact' ? 'exact' : null)
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------
// The summary

/** Read the estimates, the cards and the popups of the three lives into the lines that open the transcript. */
function summarize(runs: readonly Run[]): Summary {
  const years = runs.flatMap((r) => r.notes.years)
  const grown = years.filter((y) => !y.grownUp && y.age >= 18)
  const founder = years.filter((y) => y.grownUp)
  const cards = years.map((y) => y.card).filter((c): c is NonNullable<YearStat['card']> => c !== null)
  const popupCards = cards.filter((c) => c.popup)
  const inlineCards = cards.filter((c) => !c.popup)
  const bands = runs.flatMap((r) => r.notes.bands)
  const passive = bands.filter((b) => b.when === 'passive')
  const bought = bands.filter((b) => b.when === 'bought')
  const share = (xs: readonly BandStat[]): string => (xs.length === 0 ? 'none read' : `${xs.filter((x) => x.inside).length} of ${xs.length} inside (${Math.round((100 * xs.filter((x) => x.inside).length) / xs.length)}%)`)
  const width = (b: BandStat): number => (b.unit === 'score' ? b.hi - b.lo : b.hi / Math.max(1e-9, b.lo))
  const scores = bands.filter((b) => b.unit === 'score')
  const scoresPassive = scores.filter((b) => b.when === 'passive')
  const money = bands.filter((b) => b.unit === 'money' || b.unit === 'delta')
  const hired = bands.filter((b) => b.key.startsWith('cand:'))
  const wide = scoresPassive.filter((b) => b.hi - b.lo >= 40).sort((a, b) => b.hi - b.lo - (a.hi - a.lo))
  const [l1, l2, l3] = runs.map((r) => r.notes)
  const f1 = l1?.facts ?? {}
  const f2 = l2?.facts ?? {}
  const f3 = l3?.facts ?? {}
  const odds = l1?.odds ?? []
  const withKnow = odds.find((o) => /know-how/.test(o.text))
  const lines: string[] = []

  lines.push('### The three lives', '')
  lines.push(`- **Life 1 (seed ${l1?.seed}).** A café founder. ${f1.launched ?? 0} product line launched after ${f1.flops ?? 0} flop${f1.flops === 1 ? '' : 's'}; then two years of pushing hard (fatigue ${f1.pushFatigue ?? 0}).`)
  lines.push(`- **Life 2 (seed ${l2?.seed}).** A restaurant founder. Bought an analyst's read of the valuation; hired ${f2.hired ?? 0} key people: ${f2.hireLines ?? 'none'}.`)
  lines.push(`- **Life 3 (seed ${l3?.seed}).** A fashion brand founder. Read a rival's profile, the what-ifs and the antitrust row, then bought a market report and an analyst for one rival's numbers and read them again two years on.`, '')

  lines.push('### What a player sees', '')
  lines.push(`- **Research.** The slider caption says the odds in a word and lists the terms that moved them, in points: "${odds[0]?.text ?? 'Odds ...'}" at twice the normal budget on the first try${withKnow ? `, and "${withKnow.text}" once a flop has taught the field` : ''}. At the normal budget with nothing else going on the line is only the word. A flop's notice says what failed and what it taught ("${f1.flopText ?? 'no flop in this life'}")${f1.pushCaption ? `. Two years of "Push hard" (fatigue ${f1.pushFatigue ?? 0}) left the line at the same budget at "${f1.pushCaption}": the pace shows no term until fatigue passes ${FATIGUE_KNEE}` : ''}.`)
  lines.push(`- **Hiring.** The interview prints a skill range per candidate ("about 35 to 85") and "trait not clear yet", with a footer in words for how sure the reads are. The background check costs a small share of the role's pay, names each trait and narrows every range: median width ${Math.round(percentile(hired.filter((b) => b.when === 'passive').map(width), 0.5))} points before and ${Math.round(percentile(hired.filter((b) => b.when === 'bought').map(width), 0.5))} after. A hire's true skill then shows on the Employees screen.`)
  lines.push(`- **Market.** The player's own industry keeps its numbers (overview, leaderboard, regions). What is fogged is a rival's strengths (a range of stars with a chip), its product lines (a range of 0 to 100 each), the what-if profits (a range with a chip) and the antitrust chance (a word). Each fogged screen ends with a Look closer group: the sources, their prices and how far each sharpens. A purchase is kept in the Intelligence Briefing and ages (the same profile two years on was back to a wide range, with the year of the reading on its chip).`)
  lines.push(`- **The year.** Quiet Mode and the year card replace the pile of popups: a few screens arrive and the card closes the year. The card is a popup for the first ten years of a life (${popupCards.length} cards here) and is drawn on the Life tab after that (${inlineCards.length} cards, every founder year), so a grown life never sees it as a popup.`, '')

  lines.push('### Numbers', '')
  lines.push(`- **Popups a year, ordinary years (ages 18 to ${GROWN_AT}, ${grown.length} years in the 3 lives):** screens arriving ${spread(grown.map((y) => y.arrived))}; the old flow would have queued ${spread(grown.map((y) => y.before))}; asked for an answer ${spread(grown.map((y) => y.asks))}.`)
  lines.push(`- **Popups a year, founder years (ages ${GROWN_AT + 1} on, ${founder.length} years):** screens arriving ${spread(founder.map((y) => y.arrived))}; the old flow ${spread(founder.map((y) => y.before))}; asked ${spread(founder.map((y) => y.asks))}; every screen once the replies to the answers are counted ${spread(founder.map((y) => y.screens))}; ${mean(founder.map((y) => y.inbox)).toFixed(1)} notices a year went to the inbox.`)
  lines.push(`- **The year card:** ${cards.length} cards in ${years.length} years. Lines (headline, stories, money, people, news) ${spread(cards.map((c) => c.lines))} against a limit of 8; folded groups ${spread(cards.map((c) => c.groups))}, holding ${spread(cards.map((c) => c.folded))} lines. Founder years alone: lines ${spread(founder.map((y) => y.card?.lines ?? 0))}, folded ${spread(founder.map((y) => y.card?.folded ?? 0))}.`)
  lines.push(`- **Estimates against the truth.** ${bands.length} bands read. Before any purchase: ${share(passive)}. After a purchase from a source: ${share(bought)}. The design says 80%.`)
  lines.push(`  - Score bands (skills, ratings; ${scores.length} read): median width ${Math.round(percentile(scoresPassive.map(width), 0.5))} points of 100 before a purchase and ${Math.round(percentile(scores.filter((b) => b.when === 'bought').map(width), 0.5))} after one.`)
  lines.push(`  - Money bands (${money.length} read, the company valuation): median ratio of the top to the bottom ${percentile(money.map(width), 0.5).toFixed(1)}.`)
  lines.push(`  - What-if profit ranges holding the Exact-mode figure: ${f3.whatIfInside ?? 0} of ${f3.whatIfRows ?? 0}.`, '')

  lines.push('### Anything confusing', '')
  const confusing: string[] = []
  if (typeof f1.underwayPercent === 'string') confusing.push(`**The next popup undoes the word.** The slider said "${f1.underwayCaption ?? 'Odds likely'}"; the notice that follows the tap says "${f1.underwayPercent} it works", and the Products screen lists the project as "${f1.devRowPercent ?? ''}". The player is told the exact odds one tap after the fog hid them.`)
  if (typeof f1.heavyRow === 'string' && /\d+% odds/.test(f1.heavyRow)) {
    const doubled = typeof f1.heavyConfirm === 'string' && /\d+% odds/.test(f1.heavyConfirm) && /Odds [a-z ]+/.test(f1.heavyConfirm)
    confusing.push(`**Heavy R&D prints the odds the slider hides.** Its rows read "${f1.heavyRow}" in Realistic mode${doubled ? `, and the confirm says both "${/about \d+% odds/.exec(String(f1.heavyConfirm))?.[0] ?? ''}" and "${/Odds [a-z ]+/.exec(String(f1.heavyConfirm))?.[0] ?? ''}" in one breath` : ''}.`)
  }
  const cut = cards.filter((c) => c.cut > 0)
  if (cut.length > 0) {
    const example = founder.find((y) => y.card?.head.endsWith('...'))?.card?.head
    confusing.push(`**Card lines cut in the middle of a sentence.** ${cut.length} of the ${cards.length} cards have a headline or a story line cut at 90 characters${example ? ` (a founder's headline: "${example}")` : ''}; a headline is the title of a notice and its text run together.`)
  }
  if (wide.length > 0) confusing.push(`**A "fair estimate" that spans ${Math.round(percentile(wide.map((b) => b.hi - b.lo), 0.5))} points.** ${wide.length} of the ${scoresPassive.length} passive score bands were 40 points or more wide (${wide.slice(0, 3).map((b) => `${b.what}: ${Math.round(b.lo)} to ${Math.round(b.hi)}`).join('; ')}), under the words "a fair estimate" and one filled dot. The range is honest and carries almost nothing.`)
  if (Number(f2.sameRanges ?? 0) > 0) confusing.push(`**Candidates who read the same.** ${f2.sameRanges} interview${Number(f2.sameRanges) === 1 ? '' : 's'} printed an identical range for every candidate, so the player cannot tell them apart without paying for the check.`)
  if (f2.exitShowsTruth === true) confusing.push('**The company card contradicts itself.** It prints the valuation as a range while the Exit tile on the same screen prints the exact worth ("Worth $911K" under "value $1M to $2.1M"). docs/FOG.md lists the Exit tile as left for later; on the screen it undoes the fog a row above it.')
  confusing.push("**No market screen of another industry exists.** `knownMarket` would fog the demand and shares of a trade the player has no company in, but every screen asks it for the company's own industry, so that fog never shows in play. Life 3 read the fog that does exist: rivals, what-ifs, antitrust.")
  if (!odds.some((o) => /unknown factors/.test(o.text)) && !/unknown factors/.test(String(f1.pushCaption ?? ''))) confusing.push('**"Unknown factors" never appeared.** A hidden term (a hard field, a rival, public research) needs frontier research; the products of a cafe never meet one, so that wording was not read in these lives.')
  for (const c of confusing) lines.push(`- ${c}`)
  lines.push('')
  return { lines, bands, years }
}

function assemble(played: readonly { run: Run; skipped: string[] }[]): PlaythroughResult {
  const runs = played.map((p) => p.run)
  const summary = summarize(runs)
  const doc = new Doc()
  doc.lines.push('# R3 playthrough: three lives through the store flow', '')
  doc.p('Realistic mode, Quiet Mode on, FLAGS.yearCard on. Every tap is a menu row found by its label; every popup is answered through the store. Lines that say "not what the player sees" or show a truth column print the real number so a reader can check the estimate.')
  doc.lines.push('## Summary', '', ...summary.lines)
  for (const { run, skipped } of played) {
    doc.lines.push('', `## ${run.notes.title} (seed ${run.notes.seed})`, '')
    if (skipped.length > 0) doc.p(`Seeds tried before this one: ${skipped.join('; ')}.`)
    doc.lines.push(...run.doc.lines)
  }
  // The shots: the part's own, and the best cards of any life.
  const shots: ShotRecord[] = runs.flatMap((r) => r.shots)
  const bestOf = (kind: 'popup' | 'inline'): ShotRecord | null => runs.map((r) => r.best[kind]).filter((x): x is ShotRecord => x !== null).sort((a, b) => b.score - a.score)[0] ?? null
  for (const s of [bestOf('inline'), bestOf('popup')]) if (s) shots.push(s)
  return { markdown: doc.toString(), shots, lives: runs.map((r) => r.notes), summary }
}

// ---------------------------------------------------------------------------------------------------------------------------------
// shots.md: how to open each save in the dev server

/** The console snippet that makes the page load a save the way the app does. Exported so the test can run its logic against the real save code. */
export function loadSnippet(file: string): string {
  return [
    '(async () => {',
    `  const text = await (await fetch('/${file}', { cache: 'no-store' })).text()`,
    '  const state = JSON.parse(text)',
    "  const { migrateSave } = await import('/src/game/save-schema.ts')",
    "  if (migrateSave(JSON.parse(text)).kind !== 'ready') throw new Error('the app would not load this save')",
    "  const { saveGame, flushSave } = await import('/src/game/save.ts')",
    "  const { activeBackendName } = await import('/src/game/save-store.ts')",
    "  if (!saveGame(state)) throw new Error('saveGame refused the state')",
    "  if (!(await flushSave())) throw new Error('the save did not reach storage')",
    "  if (activeBackendName() === 'idb') {",
    '    // A copy left in the legacy localStorage slot would win the next boot: the browser is marked as keeping its life in IndexedDB.',
    "    const { localSaveBackend } = await import('/src/game/save-backends.ts')",
    '    const legacy = localSaveBackend()',
    '    legacy.remove()',
    '    legacy.chunks?.remove(legacy.chunks.ids())',
    '  }',
    '  location.reload()',
    '})()',
  ].join('\n')
}

export function shotsMarkdown(outDir: string, shots: readonly ShotRecord[]): string {
  const doc = new Doc()
  doc.lines.push('# Screenshot states for R3', '')
  doc.p('Three saves (and a fourth, the same year card as a popup) made by the real engine and played through the store flow by scripts/r3-playthrough.ts. Each is the whole GameState the store writes, so it opens like any save.')
  doc.lines.push('## Set up once', '')
  doc.p('1. Start the dev server and open it with the year card on: `http://localhost:5173/?flags=yearCard`. The flag is off by default in this build and only matters for the +Age button (the saves already hold their card); the other flags keep their defaults. Quiet Mode is on by default. Settings > Information must read Realistic (the default), or the fog is not drawn.')
  doc.p('2. Put the saves where the dev server can serve them. Vite serves `public/` at the root of the site, so copy them there (and remove them afterwards):')
  doc.lines.push('```sh', ...shots.map((s) => `cp ${join(outDir, s.file)} <the checkout the dev server runs in>/public/`), '```', '')
  doc.p('3. Paste the snippet of a shot into the DevTools console of that page. It loads the save the way the app does (see "What the snippet does" below) and reloads. **It replaces the life saved in that browser profile**, so use a profile whose life you do not mind losing.')
  doc.p('4. On the Home screen tap **Continue Life**. The queue of each state is empty, so the game screen opens with no popup waiting.')
  for (const s of shots) {
    doc.lines.push(`## ${s.title}`, '')
    doc.bullet(`save: ${join(outDir, s.file)} (life ${s.life}, age ${s.age}, ${s.year}, ${Math.round(s.json.length / 1024)} KB), served as /${s.file}`)
    doc.blank()
    doc.p('Load it (paste into the console):')
    doc.lines.push('```js', loadSnippet(s.file), '```', '')
    if (s.name === 'card-popup') doc.p('**Taps:** none before the shot. Continue Life opens the game screen with the card on top of it as a popup (the one popup waiting); take the shot before tapping OK.')
    else if (s.taps.length === 0) doc.p('**Taps:** none. After Continue Life the game screen is the screen.')
    else {
      doc.p('**Taps:** the bottom bar tab first, then the row labels in order, each tapped once (a row that is a menu opens; the last row is the screen). Each line is one way in:')
      for (const t of s.taps) doc.bullet(t.join(' > '))
      doc.blank()
    }
    doc.p('**On the screen:**')
    for (const line of s.sees) doc.bullet(line)
    doc.blank()
  }
  doc.lines.push('## What the snippet does, against the save code', '')
  doc.bullet('`saveGame(state)` (src/game/save.ts) is the call the store makes after every action: it encodes a head and chunks and hands them to the active backend (src/game/save-store.ts `saveRecord`). The module is the one the page already loaded (the same URL), so the backend is the one the boot chose.')
  doc.bullet('With IndexedDB (FLAGS.idbSaves, the default) the write is queued: `flushSave()` resolves when it is in the database and false when it failed. With localStorage it is written at once and `flushSave()` resolves at once.')
  doc.bullet("The next boot (src/game/save-hydrate.ts) reads the database and the legacy localStorage slot. A browser that has kept a life in IndexedDB is marked, and then a legacy record that is not the same game as the database's wins as \"the newer one\". So with IndexedDB active the snippet clears the legacy slot and its chunks after the flush, which is what `removeLegacyIf` does for a duplicate.")
  doc.bullet('`migrateSave` is the check `loadGame` runs; the snippet refuses a state the app would not load.')
  doc.bullet('Continue Life runs `resumeSavedGame` (src/ui/store.ts): `loadGame()` reads the save back, then `resumeTimeline` and `processQueue`. Nothing is waiting in these states, so no popup opens.')
  return doc.toString()
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Output, and the command

export function writeOutputs(outDir: string, res: PlaythroughResult): string[] {
  mkdirSync(outDir, { recursive: true })
  const files: string[] = []
  const put = (name: string, text: string): void => {
    const path = join(outDir, name)
    writeFileSync(path, text)
    files.push(path)
  }
  put('r3-playthrough.md', res.markdown)
  for (const s of res.shots) put(s.file, s.json)
  put('shots.md', shotsMarkdown(outDir, res.shots))
  return files
}

/** True when a save the script made is one the app would load (the check the snippet repeats in the page). */
export function loadable(json: string): boolean {
  return migrateSave(JSON.parse(json)).kind === 'ready'
}

/**
 * The command: play the three lives and write the transcript, the saves and shots.md into --out. With --life 1|2|3 and --seed N it plays
 * that one part on that one seed instead and writes life-<n>-seed-<s>.md, whatever stopped it named at the end: for looking at a life
 * the search dropped.
 */
export async function runCli(argv: string[]): Promise<void> {
  const { values } = parseArgs({ args: argv, options: { out: { type: 'string' }, life: { type: 'string' }, seed: { type: 'string' } }, allowPositionals: false, strict: true })
  if (values.out === undefined) throw new Error('--out <dir> is required')
  if (values.life !== undefined || values.seed !== undefined) {
    const no = Number(values.life)
    const seed = Number(values.seed)
    if (!(no === 1 || no === 2 || no === 3) || !Number.isInteger(seed) || seed < 0) throw new Error('--life 1|2|3 and --seed <whole number> go together')
    const one = await playSingle(no, seed)
    mkdirSync(values.out, { recursive: true })
    const path = join(values.out, `life-${no}-seed-${seed}.md`)
    writeFileSync(path, `${one.markdown}${one.error === null ? '' : `\nStopped: ${one.error}\n`}`)
    console.log(path)
    return
  }
  const res = await runPlaythrough()
  for (const file of writeOutputs(values.out, res)) console.log(file)
}

/** True when this file is the program node was started with, as the bundle is (and never under the test). */
function isMain(): boolean {
  try {
    return process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}

if (isMain()) {
  runCli(process.argv.slice(2)).catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err))
    process.exitCode = 1
  })
}
