// Career test kit: text, ledger, JSON and odds checks shared by the kit unit tests, and the playthrough
// loop (`playCareer`) that plays a seeded career through the real yearly loop with a fixed strategy. No
// vitest import (like fuzz-kit and politics-kit): a check returns its problems, or throws, and the test
// decides what to do with them.
import { ageUp } from '../src/game/aging'
import { bindMoneyContext, netWorth } from '../src/game/core'
import { typicalIncome } from '../src/game/events/wealth-core'
import { createNewLife } from '../src/game/life'
import { applyFallback } from '../src/game/offline'
import { loadGame, saveGame } from '../src/game/save'
import { hasScript, runScript } from '../src/game/scripts'
import { yearlySpecial } from '../src/game/special'
import { actorCareerMenu, actorJobNodes } from '../src/game/special/actor'
import { astronautCareerMenu, astronautJobNodes } from '../src/game/special/astronaut'
import { actorStore, adoptLegacy } from '../src/game/special/actor-state'
import { hire } from '../src/game/special/common'
import { optionOdds, rollOption, type CrisisDef, type Stance } from '../src/game/special/kit/crisis'
import { int, readRows, rec, type CareerBase } from '../src/game/special/kit/state'
import { setCareerAudit, type AuditEvent } from '../src/game/special/kit/year'
import type { ChoiceModal, GameState, MenuAction, MenuNode, ModalItem } from '../src/game/types'
import { BANNED_ANYWHERE, LIMITS, staticLength, unitFlags } from '../scripts/voice/rules.mjs'
import { makeTestGame } from './helpers'
import { deepFreeze, diffSummary, FailureLog, installStorageShim, probeActions, renderAll } from './fuzz-kit'

/** Text that must never reach the player: a stringified hole. */
export const BAD_TEXT = /\bNaN\b|\bundefined\b|\[object Object\]|-?Infinity|\d[eE]\+\d{2}/

const STANCES: readonly Stance[] = ['safe', 'bold', 'cash']

/** Plain JSON only, every number finite. Returns the first few offending paths (a local copy of fuzz-kit's scan). */
export function finiteJson(g: GameState): string[] {
  const bad: string[] = []
  const seen = new Set<object>()
  const walk = (v: unknown, path: string, depth: number): void => {
    if (bad.length >= 8) return
    if (depth > 120) {
      bad.push(`${path}: nesting deeper than 120`)
      return
    }
    switch (typeof v) {
      case 'number':
        if (!Number.isFinite(v)) bad.push(`${path} = ${v}`)
        return
      case 'string':
      case 'boolean':
      case 'undefined':
        return
      case 'object': {
        if (v === null) return
        if (seen.has(v)) {
          bad.push(`${path}: shared or cyclic reference`)
          return
        }
        seen.add(v)
        if (Array.isArray(v)) {
          v.forEach((x, i) => {
            if (x === undefined) bad.push(`${path}[${i}] = undefined in an array`)
            else walk(x, `${path}[${i}]`, depth + 1)
          })
        } else {
          const proto = Object.getPrototypeOf(v)
          if (proto === Object.prototype || proto === null) for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`, depth + 1)
          else bad.push(`${path}: not plain JSON (${proto?.constructor?.name})`)
        }
        seen.delete(v)
        return
      }
      default:
        bad.push(`${path}: ${typeof v}`)
    }
  }
  walk(g, 'g', 0)
  return bad
}

const VOICE_FLAGS = new Set(['em-dash', 'chatbot', 'stock', 'no-contraction', 'nobody', 'everyone', 'disclaimer'])

/** The voice rules that apply to kit text: the caps with 30 characters of slack for names and money, plus the word lists. */
export function voiceProblems(text: string, role: 'log' | 'outcome' | 'scene' | 'title'): string[] {
  const out = unitFlags(text, role).filter((f) => VOICE_FLAGS.has(f))
  if (role !== 'title' && staticLength(text) > LIMITS[role] + 30) out.push('over-cap')
  for (const phrase of BANNED_ANYWHERE) if (text.includes(phrase)) out.push(`banned: ${phrase.trim()}`)
  return out
}

const REFERENCE = makeTestGame(1)

/**
 * Every `books` event must balance: |cash moved - booked| <= 1 + 0.5 x moves. An empty label or a non-finite
 * amount on a money event is a failure. A single earn over 400 x typicalIncome prints a `note-` line to
 * review, which a caller reports and does not fail on. `g` only sets the country and year of that yardstick.
 */
export function checkLedger(events: readonly AuditEvent[], g: GameState = REFERENCE): string[] {
  const out: string[] = []
  const windfall = 400 * typicalIncome(g)
  for (const e of events) {
    if (e.t === 'books') {
      const ok = Number.isFinite(e.delta) && Number.isFinite(e.booked) && Number.isFinite(e.moves)
      if (!ok || Math.abs(e.delta - e.booked) > 1 + 0.5 * e.moves) out.push(`books ${e.career}/${e.where}: cash moved ${e.delta}, booked ${e.booked} over ${e.moves} moves`)
    } else if (e.t === 'earn' || e.t === 'pay') {
      if (!e.label.trim()) out.push(`${e.t} ${e.career}: empty label`)
      if (!Number.isFinite(e.amount)) out.push(`${e.t} ${e.career}/${e.label}: amount ${e.amount}`)
      else if (e.t === 'earn' && e.amount > windfall) out.push(`note-windfall ${e.career}/${e.label}: ${e.amount}`)
    }
  }
  return out
}

/**
 * Rolls every rolled stance of a crisis def n times on clones of the state, one seed each, and throws when
 * the share of good outcomes is not within 0.045 of the odds() the hint prints. Fixed options are skipped.
 */
export function assertHonestOdds(def: CrisisDef<any, any>, mk: () => { g: GameState; s: CareerBase; d: unknown }, n = 1500): void {
  for (const stance of STANCES) {
    const opt = def.options[stance]
    if (!opt) continue
    const base = mk()
    const p = optionOdds(base.g, base.s, base.d, opt)
    if (p === null) continue
    let good = 0
    for (let seed = 1; seed <= n; seed++) {
      const c = structuredClone({ g: base.g, s: base.s })
      c.g.rng = seed
      if (rollOption(c.g, c.s, base.d, opt).good) good++
    }
    const rate = good / n
    if (!(Math.abs(rate - p) < 0.045)) throw new Error(`${def.id}/${stance}: the hint says ${p}, the roll gave ${rate} over ${n} seeds`)
  }
}

// ---------------------------------------------------------------------------
// Playthrough kit (second half): a seeded career played through the real yearly loop

export type CareerId = 'actor' | 'astronaut' | 'model'
/** steady takes the safe stance, greedy the cash stance, reckless the bold stance, idle takes no menu action. */
export type CareerStrategy = 'steady' | 'greedy' | 'reckless' | 'idle'

export interface CareerSetup {
  /** The job's defId: the career is active while the character holds it. */
  defId: string
  /** The store key, `<id>.sim`: the record is the flag `special.<stateKey>`. */
  stateKey: string
  hire: (g: GameState) => void
  /** The career's menu roots: the standing menu and the gated actions. */
  roots: (g: GameState) => MenuNode[]
  /** Which actions each acting strategy runs, matched on the action id. */
  prefer: Record<'steady' | 'greedy' | 'reckless', RegExp>
}

/** One entry per career, added by its task. */
export const CAREER_SETUPS: Partial<Record<CareerId, CareerSetup>> = {
  actor: {
    defId: 'actor',
    stateKey: 'actor.sim',
    // between roles with the sim in charge: the legacy hook never settles this life
    hire: (g) => {
      hire(g, { defId: 'actor', title: 'Actor', company: 'Silverline Studios', salary: 0, data: { project: null } })
      adoptLegacy(g, actorStore.mut(g))
    },
    roots: (g) => [actorCareerMenu, ...actorJobNodes(g)],
    prefer: { steady: /^actor\.(audition|practice)$/, greedy: /^actor\.(audition|practice)$/, reckless: /^actor\.(audition|stunt|practice)$/ },
  },
  // The Academy is the way in. Once an astronaut job is held the sim's world ticks every year (funding, mood and safety
  // follow the calendar), so a year of no input changes the record: the idle check needs a sim that is quiet then. A
  // strong cadet drills, graduates through the selection board and takes the first offer; the run ends at the hire.
  // The Flight Board and the yearly sim are played by test/astronaut-flight.test.ts.
  astronaut: {
    defId: 'astronaut.cadet',
    stateKey: 'astronaut.sim',
    hire: (g) => {
      g.character.stats.smarts = 95
      g.character.stats.health = 90
      g.character.hidden.athleticism = 80
      hire(g, { defId: 'astronaut.cadet', title: 'Space Academy Cadet', company: 'Orion Space Academy', salary: 14_000, performance: 80, data: { training: 80, yearsLeft: 2 } })
    },
    roots: (g) => [astronautCareerMenu, ...astronautJobNodes(g)],
    prefer: { steady: /^astro\.drill\./, greedy: /^astro\.drill\./, reckless: /^astro\.drill\./ },
  },
}

export interface CareerStats {
  careerId: CareerId
  strategy: CareerStrategy
  seed: number
  country: string
  year0: number
  /** Years completed: the run stops early when the job is gone or the character dies. */
  years: number
  actions: number
  /** Every popup the drain answered, of any kind. */
  popups: number
  crises: number
  /** Kit ledger only (c.earn / c.pay in real runs): legacy pay bypasses it. */
  income: number
  spent: number
  standingEnd: number
  peak: number
  rankEnd: number
  worthDelta: number
  ended: 'active' | 'retired' | 'fired' | 'dead' | 'prison'
  /** How many times each check ran; what failed is in `text`. */
  checks: { purity: number; ledger: number; saves: number; voice: number }
  /** Every problem found, one line each; a `note-` line is for a human to review. Empty means clean. */
  text: string[]
}

const msg = (err: unknown): string => (err instanceof Error ? err.message : String(err)).slice(0, 240)

function setupOf(id: CareerId): CareerSetup {
  const setup = CAREER_SETUPS[id]
  if (!setup) throw new Error(`No career setup registered for ${id}`)
  return setup
}

/** Age 24, 200,000 in cash, no prison, an empty queue, hired into the career. A year of 1995 by default. */
export function newCareerGame(id: CareerId, seed: number, country = 'us', year = 1995): GameState {
  const setup = setupOf(id)
  const g = createNewLife({ countryId: country, year: year - 24, seed })
  g.character.age = 24
  g.year = year
  g.log.push({ age: 24, year, entries: [] })
  g.character.money = 200_000
  g.character.prison = null
  g.queue = []
  bindMoneyContext(g)
  try {
    setup.hire(g)
  } finally {
    bindMoneyContext(null)
  }
  return g
}

/** One year step through the special hook only: year + 1, age + 1, yearActions cleared, then `hook`. */
export function nextYear(g: GameState, hook: (g: GameState) => void = yearlySpecial): void {
  g.year += 1
  g.character.age += 1
  g.yearActions = {}
  hook(g)
}

export function careerRoots(id: CareerId): (g: GameState) => MenuNode[] {
  return (g) => setupOf(id).roots(g)
}

/** The visible, enabled actions of the menu nodes, nested groups opened down to `depth`. */
export function collectActions(g: GameState, nodes: MenuNode[], depth = 4): MenuAction[] {
  const out: MenuAction[] = []
  const walk = (list: MenuNode[], d: number): void => {
    for (const n of list) {
      if (n.type === 'heading' || n.type === 'info') continue
      if (n.visible && !n.visible(g)) continue
      if (n.disabledReason?.(g)) continue
      if (n.type === 'action') out.push(n)
      else if (d < depth) walk(n.children(g), d + 1)
    }
  }
  walk(nodes, 1)
  return out
}

/** safe, cash or bold by strategy; the first option when the stance is absent (or for idle). */
export function pickStance(strategy: CareerStrategy, m: ChoiceModal): string {
  const want = strategy === 'steady' ? 'safe' : strategy === 'greedy' ? 'cash' : strategy === 'reckless' ? 'bold' : null
  return (m.choices.find((c) => c.id === want) ?? m.choices[0])?.id ?? ''
}

const MINIGAME_RESULT: Partial<Record<string, string>> = { blackjack: 'lose', pickpocket: 'cancel', prisonEscape: 'quit', annualReport: 'skip', burglary: JSON.stringify({ loot: 0, caught: false, rooms: [] }) }

/**
 * Resolves the whole queue the way the store does (follow-ups jump to the front): `career.*` choices
 * take the strategy's stance, any other choice the first option, minigames a neutral result. Bad text
 * and a career script that moves cash outside the ledger go to `sink`. `audit` is the events the caller
 * collects through setCareerAudit. Returns how many popups it resolved.
 */
export function drainCareer(g: GameState, strategy: CareerStrategy, sink: string[], audit: AuditEvent[]): number {
  let resolved = 0
  const bad = (where: string, text: string | undefined): void => {
    if (text && BAD_TEXT.test(text)) sink.push(`text ${where}: ${text.slice(0, 120)}`)
  }
  const resolve = (m: ModalItem): void => {
    switch (m.kind) {
      case 'notice':
        bad('notice title', m.title)
        bad(`notice "${m.title}"`, m.text)
        return
      case 'choice': {
        bad(`choice "${m.title}"`, m.text)
        for (const c of m.choices) {
          bad(`option ${m.scriptId}`, c.label)
          bad(`hint ${m.scriptId}`, c.hint)
        }
        if (m.choices.length === 0) {
          sink.push(`choice "${m.title}" has no options`)
          return
        }
        const isCareer = typeof m.scriptId === 'string' && m.scriptId.startsWith('career.')
        const choice = isCareer ? pickStance(strategy, m) : m.choices[0].id
        if (m.source !== 'script') {
          applyFallback(g, { type: 'resolveChoice', event: m, choiceId: choice })
          return
        }
        if (!m.scriptId || !hasScript(m.scriptId)) {
          sink.push(`missing script handler ${m.scriptId}`)
          return
        }
        const cash = g.character.money
        const mark = audit.length
        runScript(g, m.scriptId, choice, m.data, m)
        if (isCareer) {
          let booked = 0
          let moves = 0
          for (const e of audit.slice(mark)) {
            if (e.t === 'earn') booked += e.amount
            else if (e.t === 'pay') booked -= e.amount
            else continue
            moves++
          }
          const delta = g.character.money - cash
          if (!(Math.abs(delta - booked) <= 1 + 0.5 * moves)) sink.push(`ledger ${m.scriptId}: cash moved ${delta}, booked ${booked} over ${moves} moves`)
        }
        return
      }
      case 'input':
        bad(`input "${m.title}"`, m.text)
        if (!hasScript(m.scriptId)) sink.push(`missing script handler ${m.scriptId}`)
        else runScript(g, m.scriptId, m.defaultValue ?? String(m.min ?? 0), m.data, m)
        return
      case 'minigame':
        if (!hasScript(m.scriptId)) sink.push(`missing script handler ${m.scriptId}`)
        else runScript(g, m.scriptId, MINIGAME_RESULT[m.game] ?? 'done', m.data, m)
        return
      case 'aiTask':
        applyFallback(g, m.task)
        return
    }
  }
  for (let guard = 0; g.queue.length > 0; guard++) {
    if (guard > 400) {
      sink.push(`the queue never drains; head: ${JSON.stringify(g.queue[0]).slice(0, 160)}`)
      g.queue = []
      break
    }
    const m = g.queue.shift()!
    const before = g.queue.length
    resolved++
    try {
      resolve(m)
    } catch (err) {
      sink.push(`popup ${'scriptId' in m ? m.scriptId : m.kind} threw: ${msg(err)}`)
    }
    const added = g.queue.splice(before)
    g.queue.unshift(...added)
  }
  return resolved
}

/** Save then load: null when the loaded life is JSON-identical, else what differs. */
export function roundTrip(g: GameState): string | null {
  installStorageShim()
  try {
    if (!saveGame(g)) return 'saveGame returned false'
    const back = loadGame()
    if (!back) return 'a fresh save does not load'
    const a = JSON.stringify(g)
    const b = JSON.stringify(back)
    return a === b ? null : `a reloaded save differs: ${diffSummary(a, b)}`
  } catch (err) {
    return `save round trip threw: ${msg(err)}`
  }
}

/** Evaluates every field of the nodes the way the UI does, down the open groups. */
function touch(g: GameState, nodes: MenuNode[], depth: number): void {
  for (const n of nodes) {
    if (n.type === 'heading') {
      n.visible?.(g)
      continue
    }
    if (n.type === 'info') {
      if (n.visible && !n.visible(g)) continue
      if (typeof n.text === 'function') n.text(g)
      continue
    }
    if (n.visible && !n.visible(g)) continue
    if (typeof n.subtitle === 'function') n.subtitle(g)
    n.hint?.(g)
    const off = n.disabledReason?.(g)
    if (n.type === 'action') {
      if (n.confirm && !off) n.confirm(g)
      n.input?.defaultValue?.(g)
      if (n.input?.preview && Number.isFinite(n.input.min)) n.input.preview(g, n.input.min as number)
    } else if (!off && depth < 6) {
      n.header?.(g)
      touch(g, n.children(g), depth + 1)
    }
  }
}

/**
 * Menu purity: renders the roots twice on a deep-frozen clone. A render that writes (a `mut`, a g.rng
 * draw) throws at the offending line; JSON and rng must be unchanged after. Throws on a failure.
 */
export function assertMenuPure(g: GameState, roots: (g: GameState) => MenuNode[]): void {
  const copy = deepFreeze(structuredClone(g))
  const json = JSON.stringify(copy)
  bindMoneyContext(copy)
  try {
    for (let pass = 0; pass < 2; pass++) touch(copy, roots(copy), 1)
  } finally {
    bindMoneyContext(null)
  }
  if (JSON.stringify(copy) !== json || JSON.stringify(copy) !== JSON.stringify(g) || copy.rng !== g.rng) throw new Error('rendering the menus changed the state or the rng')
}

/** The value the UI would hand an action's input: its default, else the lowest bound, else a name. */
function inputFor(g: GameState, a: MenuAction): string | undefined {
  const input = a.input
  if (!input) return undefined
  const def = input.defaultValue?.(g)
  if (input.kind === 'text') return def || 'Alex'
  if (def !== undefined && Number.isFinite(Number(def))) return def
  return String(Math.round(Number.isFinite(input.min) ? (input.min as number) : 0))
}

function endedOf(g: GameState, defId: string): CareerStats['ended'] {
  if (!g.character.alive) return 'dead'
  if (g.character.prison) return 'prison'
  if (g.character.job?.defId === defId) return 'active'
  const last = g.character.careerHistory[g.character.careerHistory.length - 1]
  return last && (last.reason === 'fired' || last.reason === 'laid off') ? 'fired' : 'retired'
}

/** Runs `fn` with the audit sink swapped, then puts the caller's sink back. */
function withAudit<T>(sink: ((e: AuditEvent) => void) | null, back: (e: AuditEvent) => void, fn: () => T): T {
  setCareerAudit(sink)
  try {
    return fn()
  } finally {
    setCareerAudit(back)
  }
}

/**
 * Plays one career for `years` years through the real yearly loop. Each year: a purity render of the whole
 * game on a frozen state; up to 4 actions the strategy prefers, each run on a clone first (its `books`
 * events must balance), then for real, with the career menus re-rendered on a frozen clone after each;
 * a probe of the career menus every third year; `ageUp` on a clone and the popups drained by stance;
 * then the ledger, the JSON, the voice of the kit's text, and a save round trip every `saveEvery` years.
 * Stops early when the job is gone or the character dies. Never throws on a game bug: it is in `text`.
 */
export function playCareer(id: CareerId, strategy: CareerStrategy, years: number, seed: number, country = 'us', year = 1995, opts: { saveEvery?: number; voice?: boolean } = {}): CareerStats {
  installStorageShim()
  const setup = setupOf(id)
  const saveEvery = opts.saveEvery ?? 5
  const voice = opts.voice !== false
  const text: string[] = []
  const audit: AuditEvent[] = []
  const checks = { purity: 0, ledger: 0, saves: 0, voice: 0 }
  const tally = { actions: 0, popups: 0, crises: 0, income: 0, spent: 0 }
  const log = new FailureLog()
  const flush = (where: string): void => {
    for (const { first, count } of log.list()) text.push(`${where} ${first.kind}: ${first.message.slice(0, 200)}${count > 1 ? ` (x${count})` : ''}`)
    log.bySig.clear()
  }
  const record = (e: AuditEvent): void => void audit.push(e)
  let g = newCareerGame(id, seed, country, year)
  const worth0 = netWorth(g)
  let played = 0
  setCareerAudit(record)
  try {
    for (let i = 0; i < years && g.character.alive; i++) {
      bindMoneyContext(g)
      const mark = audit.length

      // Purity: every menu of the game, rendered on a frozen state.
      try {
        renderAll(g, log, 7)
        checks.purity++
      } catch (err) {
        text.push(`purity render threw: ${msg(err)}`)
      }
      flush('purity')
      bindMoneyContext(g)

      // Actions: the strategy's preferred rows, each tried on a clone first.
      if (strategy !== 'idle') {
        const tried = new Set<string>()
        for (let n = 0; n < 4; n++) {
          let next: MenuAction | undefined
          try {
            next = collectActions(g, setup.roots(g)).find((a) => setup.prefer[strategy].test(a.id) && !tried.has(a.id))
          } catch (err) {
            text.push(`menu threw: ${msg(err)}`)
          }
          if (!next) break
          tried.add(next.id)
          const input = inputFor(g, next)
          const dry = structuredClone(g)
          const events: AuditEvent[] = []
          try {
            withAudit((e) => events.push(e), record, () => next!.run(dry, input))
          } catch (err) {
            text.push(`action ${next.id} threw: ${msg(err)}`)
            continue
          }
          for (const line of checkLedger(events, dry)) text.push(`${next.id}: ${line}`)
          checks.ledger++
          try {
            next.run(g, input)
          } catch (err) {
            text.push(`action ${next.id} threw on the live game: ${msg(err)}`)
            break
          }
          tally.actions++
          tally.popups += drainCareer(g, strategy, text, audit)
          try {
            assertMenuPure(g, setup.roots)
          } catch (err) {
            text.push(`purity after ${next.id}: ${msg(err)}`)
          }
          bindMoneyContext(g)
        }
      }

      // A probe of the career menus every third year, on frozen clones (its events stay out of the tally).
      if ((i + 1) % 3 === 0) {
        try {
          withAudit(null, record, () => probeActions(g, log, seed * 31 + i, { roots: setup.roots, depth: 1, max: 12 }))
        } catch (err) {
          text.push(`probe threw: ${msg(err)}`)
        }
        flush('probe')
        bindMoneyContext(g)
      }

      // The year turns: ageUp on a clone, the popups answered by stance.
      const after = structuredClone(g)
      try {
        ageUp(after)
        tally.popups += drainCareer(after, strategy, text, audit)
      } catch (err) {
        text.push(`ageUp threw: ${msg(err)}`)
        break
      }
      g = after
      played++
      bindMoneyContext(g)

      // The checks on what the year produced.
      const events = audit.slice(mark)
      for (const line of checkLedger(events, g)) text.push(line)
      checks.ledger++
      for (const line of finiteJson(g)) text.push(`json ${line}`)
      if (voice) {
        for (const e of events) {
          if (e.t !== 'text') continue
          const problems = voiceProblems(e.text, e.role)
          if (problems.length > 0) text.push(`voice ${e.career}/${e.role}: ${problems.join(', ')}: ${e.text.slice(0, 90)}`)
        }
        checks.voice++
      }
      for (const e of events) {
        if (e.t === 'earn') tally.income += e.amount
        else if (e.t === 'pay') tally.spent += e.amount
        else if (e.t === 'crisis') tally.crises++
      }
      if (saveEvery > 0 && played % saveEvery === 0) {
        const problem = roundTrip(g)
        checks.saves++
        if (problem) text.push(`save: ${problem}`)
      }
      if (g.character.job?.defId !== setup.defId) break // fired, retired or moved on: the run ends here
    }
  } finally {
    setCareerAudit(null)
    bindMoneyContext(null)
  }
  const raw = rec(g.flags[`special.${setup.stateKey}`])
  const rows = readRows(raw.rows)
  return {
    careerId: id,
    strategy,
    seed,
    country,
    year0: year,
    years: played,
    ...tally,
    standingEnd: int(raw.standing, 0, 0, 100),
    peak: int(raw.peak, 0, 0, 100),
    rankEnd: rows[rows.length - 1]?.rank ?? 0,
    worthDelta: netWorth(g) - worth0,
    ended: endedOf(g, setup.defId),
    checks,
    text,
  }
}

/** One line per career and strategy: how the runs went, for a human reading the CI log. */
export function summarizeCareers(rows: CareerStats[]): string {
  const keys = [...new Set(rows.map((r) => `${r.careerId}/${r.strategy}`))]
  return keys
    .map((key) => {
      const r = rows.filter((x) => `${x.careerId}/${x.strategy}` === key)
      const avg = (f: (x: CareerStats) => number): number => r.reduce((t, x) => t + f(x), 0) / r.length
      const ended = Object.entries(r.reduce<Record<string, number>>((m, x) => ({ ...m, [x.ended]: (m[x.ended] ?? 0) + 1 }), {}))
        .map(([k, n]) => `${k} ${n}`)
        .join(', ')
      const perYear = avg((x) => x.income / Math.max(1, x.years))
      return `${key}: n=${r.length} years=${avg((x) => x.years).toFixed(1)} income/yr=${Math.round(perYear)} spent/yr=${Math.round(avg((x) => x.spent / Math.max(1, x.years)))} standing=${avg((x) => x.standingEnd).toFixed(0)} peak=${avg((x) => x.peak).toFixed(0)} rank=${avg((x) => x.rankEnd).toFixed(1)} popups=${avg((x) => x.popups).toFixed(1)} crises=${avg((x) => x.crises).toFixed(1)} worth=${Math.round(avg((x) => x.worthDelta))} [${ended}]`
    })
    .join('\n')
}

/** Throws, naming the seeds and the first problems, when any run has a text line. Callers drop `note-` lines first. */
export function assertCareersClean(rows: CareerStats[]): void {
  const dirty = rows.filter((r) => r.text.length > 0)
  if (dirty.length === 0) return
  throw new Error(dirty.map((r) => `${r.careerId}/${r.strategy} seed ${r.seed} (${r.country} ${r.year0}), ${r.text.length} problems: ${r.text.slice(0, 6).join(' | ')}`).join('\n'))
}
