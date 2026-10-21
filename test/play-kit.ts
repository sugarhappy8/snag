// Plays one seeded life through the real yearly loop and records every popup the player would have seen, so a test can
// count them (the notice probe, R1-T7) or replay them (the acceptance sweep, R1-T9). Each year is ageUp followed by a
// drain of the modal queue the way the store answers it: notices are just read, choices and inputs go to their script
// (or the offline fallback), minigames get a fixed result. The answers come from a small driver of their own, so they
// never depend on engine rolls. The same seed and options always give the same life.
//
// A popup the player asked for (the outcome of a choice, an input or a minigame they just answered) is marked
// `passive: false`. Everything else arrived by itself, which is what Quiet Mode could soften.
//
// No vitest imports here: the same helper runs under vitest and as a bundled node script, like test/fuzz-kit.ts and
// test/probe-life.ts.
import { ageUp } from '../src/game/aging'
import { createNewLife } from '../src/game/life'
// Script handlers register as an import side effect. test/simulate.test.ts loads menus, so a life played here must too,
// or drain() could meet a script that no module on the aging path registered.
import '../src/game/menus'
import type { RouteBlock } from '../src/game/notice-policy'
import { applyFallback } from '../src/game/offline'
import { hasScript, runScript } from '../src/game/scripts'
import type { AnnualReportData, GameState, MinigameModal, ModalItem, Tone } from '../src/game/types'

export interface PlayOptions {
  seed: number
  /** Calendar year of birth (createNewLife's `year`). */
  birthYear: number
  /** Stop once the character is this old (default 90). A life that ends sooner stops sooner. */
  untilAge?: number
  /** A measurement aid: money is set to 60,000,000 the year the character first reaches 25 (default false). */
  rich?: boolean
}

export interface PlayedPopup {
  kind: 'notice' | 'choice' | 'input' | 'minigame'
  title: string
  /** The body text; empty for a minigame, which has none. */
  text: string
  tone?: Tone
  weight?: 'minor'
  support?: boolean
  /** false for a popup created while answering a choice, an input or a minigame (an outcome the player asked for). */
  passive: boolean
  /** structuredClone of the modal as it was queued. */
  item: ModalItem
}

/** One title in the counting probe's fixture (test/fixtures/notice-probe.json). Kept here, with the helper that feeds it,
 *  so a test can type-import it without loading the opt-in probe file. */
export type ProbeRow = {
  title: string
  count: number
  /** The tone of the first notice with this title; missing when it had none. */
  tone?: Tone
  /** The text of that first notice. */
  sample: string
  /** Set when that notice carried the support line. */
  support?: true
  /** neverRoute() of the sample: why it must stay a popup, or null. */
  never: RouteBlock | null
}

export type ProbeFile = {
  v: 1
  lives: number
  seeds: number[]
  untilAge: number
  passive: ProbeRow[]
  outcome: ProbeRow[]
  chosen: string[]
}

export interface PlayedYear {
  age: number
  year: number
  popups: PlayedPopup[]
  /** The life log lines written during this year. */
  lines: { text: string; tone: Tone }[]
}

/** Tiny driver RNG, separate from the game's so the driver doesn't depend on engine rolls. */
function driver(seed: number) {
  let s = seed >>> 0 || 1
  const next = () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return (s >>> 0) / 4294967296
  }
  return {
    next,
    int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: <T,>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)],
  }
}
type Driver = ReturnType<typeof driver>

const TEXT_INPUTS = ['Go for a long run', 'Write a song about my cat', 'Steal a candy bar', 'Ask my boss for a raise', 'Alex']

const RICH_MONEY = 60_000_000

function minigameResult(m: MinigameModal, d: Driver): string {
  switch (m.game) {
    case 'blackjack':
      return d.pick(['win', 'lose', 'push', 'blackjack'])
    case 'horseRace':
    case 'slots':
    case 'nationReport':
      return 'done'
    case 'burglary':
      return JSON.stringify({ loot: d.int(0, 5000), caught: d.next() < 0.3 })
    case 'prisonEscape':
      return d.pick(['escaped', 'caught'])
    case 'pickpocket':
      return d.pick(['success', 'fail'])
    case 'annualReport': {
      if (d.next() < 0.2) return 'skip'
      const r = m.data as unknown as AnnualReportData
      return JSON.stringify({ price: d.int(r.minPrice, r.maxPrice), production: d.int(0, r.maxProduction) })
    }
  }
}

function inputValue(m: Extract<ModalItem, { kind: 'input' }>, d: Driver): string {
  if (m.input === 'number') {
    const lo = m.min ?? 1
    const hi = Math.min(m.max ?? lo + 1000, lo + 100000)
    return String(d.int(lo, Math.max(lo, hi)))
  }
  return m.defaultValue || d.pick(TEXT_INPUTS)
}

function played(m: Exclude<ModalItem, { kind: 'aiTask' }>, passive: boolean): PlayedPopup {
  const notice = m.kind === 'notice' ? m : null
  return {
    kind: m.kind,
    title: m.title,
    text: m.kind === 'minigame' ? '' : m.text,
    ...(notice?.tone ? { tone: notice.tone } : {}),
    ...(notice?.weight ? { weight: notice.weight } : {}),
    ...(notice?.support ? { support: true } : {}),
    passive,
    item: structuredClone(m),
  }
}

/**
 * Resolve the whole modal queue the way the store does (follow-ups jump to the front), recording each popup that
 * reaches the player. A popup that appears while a choice, input or minigame is being answered is an outcome. A
 * built-in task is never shown, and what its resolution queues counts as passive.
 */
function drain(g: GameState, d: Driver, out: PlayedPopup[]): void {
  const outcomes = new Set<string>()
  for (let guard = 0; g.queue.length > 0; guard++) {
    if (guard > 300) throw new Error(`queue never drains; head: ${JSON.stringify(g.queue[0]).slice(0, 300)}`)
    const m = g.queue.shift()!
    const before = g.queue.length
    const waiting = new Set(g.queue.map((q) => q.id))
    let answered = false
    switch (m.kind) {
      case 'notice':
        out.push(played(m, !outcomes.has(m.id)))
        break
      case 'choice': {
        out.push(played(m, !outcomes.has(m.id)))
        if (m.choices.length === 0) throw new Error(`choice "${m.title}" has no options`)
        const choice = d.pick(m.choices)
        answered = true
        if (m.source === 'script') {
          if (!hasScript(m.scriptId!)) throw new Error(`missing script handler "${m.scriptId}" for choice "${m.title}"`)
          runScript(g, m.scriptId!, choice.id, m.data, m)
        } else applyFallback(g, { type: 'resolveChoice', event: m, choiceId: choice.id })
        break
      }
      case 'input':
        out.push(played(m, !outcomes.has(m.id)))
        if (!hasScript(m.scriptId)) throw new Error(`missing script handler "${m.scriptId}" for input "${m.title}"`)
        answered = true
        runScript(g, m.scriptId, inputValue(m, d), m.data, m)
        break
      case 'minigame':
        out.push(played(m, !outcomes.has(m.id)))
        if (!hasScript(m.scriptId)) throw new Error(`missing script handler "${m.scriptId}" for minigame "${m.title}"`)
        answered = true
        runScript(g, m.scriptId, minigameResult(m, d), m.data, m)
        break
      case 'aiTask':
        applyFallback(g, m.task)
        break
    }
    const added = g.queue.splice(before)
    g.queue.unshift(...added)
    if (answered) for (const q of g.queue) if (!waiting.has(q.id)) outcomes.add(q.id)
  }
}

/** The log lines of the character's current age. */
function yearLines(g: GameState): PlayedYear['lines'] {
  const last = g.log[g.log.length - 1]
  if (!last || last.age !== g.character.age) return []
  return last.entries.map((e) => ({ text: e.text, tone: e.tone }))
}

/** Play from birth until the character dies or reaches `untilAge`, answering every popup. */
export function playLife(opts: PlayOptions): { g: GameState; years: PlayedYear[] } {
  const untilAge = opts.untilAge ?? 90
  const d = driver(opts.seed * 7919)
  const g = createNewLife({ seed: opts.seed, year: opts.birthYear })
  const years: PlayedYear[] = []
  let rich = false
  const play = (): void => {
    const popups: PlayedPopup[] = []
    drain(g, d, popups)
    years.push({ age: g.character.age, year: g.year, popups, lines: yearLines(g) })
  }
  play()
  while (g.character.alive && g.character.age < untilAge) {
    ageUp(g)
    if (opts.rich && !rich && g.character.age >= 25) {
      rich = true
      g.character.money = RICH_MONEY
    }
    play()
  }
  return { g, years }
}
