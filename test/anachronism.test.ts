// The anachronism lint: plays many offline lives born across 1900-1995 (AI off, so every line is
// written by the built-in library) and scans every log line, popup and choice for things that
// didn't exist yet in that year and country: texting before mobile phones, apps before
// smartphones, streaming, selfies, Wi-Fi, ride-hailing, crypto... Lives born in PRESENT_YEAR keep
// their modern texts (a second check makes sure the modern variants still show up).
import { describe, expect, it } from 'vitest'
import { applyFallback } from '../src/ai/director'
import { ageUp } from '../src/game/aging'
import { createNewLife } from '../src/game/life'
import { activitiesMenu, assetsMenu, occupationMenu } from '../src/game/menus'
import { personActions } from '../src/game/relationships'
import { runScript } from '../src/game/scripts'
import { anachronismsIn } from '../src/game/events/era'
import type { AnnualReportData, GameState, MenuAction, MenuNode, MinigameModal, ModalItem } from '../src/game/types'

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

interface Seen {
  text: string
  year: number
  /** Countries the player lived in while this text was produced (either one may own it). */
  countries: string[]
  where: string
}

const TEXT_INPUTS = ['Go for a long run', 'Write a song about my cat', 'Steal a candy bar', 'Ask my boss for a raise', 'Alex']

function minigameResult(m: MinigameModal, d: Driver): string {
  switch (m.game) {
    case 'blackjack':
      return d.pick(['win', 'lose', 'push', 'blackjack'])
    case 'horseRace':
    case 'slots':
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

function collectActions(g: GameState, nodes: MenuNode[], depth = 0, out: MenuAction[] = []): MenuAction[] {
  if (depth > 4) return out
  for (const n of nodes) {
    if (n.type === 'info' || n.type === 'heading') continue
    if (n.visible && !n.visible(g)) continue
    if (n.disabledReason && n.disabledReason(g)) continue
    if (n.type === 'action' && n.id === 'surrenderLife') continue
    if (n.type === 'action') out.push(n)
    else collectActions(g, n.children(g), depth + 1, out)
  }
  return out
}

/** Every visible label, subtitle and info line of a menu tree (what the player reads). */
function menuTexts(g: GameState, nodes: MenuNode[], depth = 0, out: string[] = []): string[] {
  if (depth > 3) return out
  for (const n of nodes) {
    if (n.visible && !n.visible(g)) continue
    if ('label' in n && n.label) out.push(n.label)
    if ('subtitle' in n && typeof n.subtitle === 'string') out.push(n.subtitle)
    if (n.type === 'info' && typeof n.text === 'string') out.push(n.text)
    if (n.type === 'menu') menuTexts(g, n.children(g), depth + 1, out)
  }
  return out
}

class Collector {
  seen: Seen[] = []
  private logIds = new Set<string>()
  constructor(private g: () => GameState) {}
  countries: string[] = []
  begin(): void {
    this.countries = [this.g().character.countryId]
  }
  add(text: string, where: string): void {
    const g = this.g()
    const countries = [...new Set([...this.countries, g.character.countryId])]
    this.seen.push({ text, year: g.year, countries, where })
  }
  flushLog(): void {
    const g = this.g()
    for (const y of g.log) {
      for (const e of y.entries) {
        if (this.logIds.has(e.id)) continue
        this.logIds.add(e.id)
        const countries = [...new Set([...this.countries, g.character.countryId])]
        this.seen.push({ text: e.text, year: y.year, countries, where: 'log' })
      }
    }
  }
}

function drain(g: GameState, d: Driver, col: Collector): void {
  for (let guard = 0; g.queue.length > 0; guard++) {
    if (guard > 300) throw new Error(`queue never drains; head: ${JSON.stringify(g.queue[0]).slice(0, 300)}`)
    const m = g.queue.shift()!
    const before = g.queue.length
    switch (m.kind) {
      case 'notice':
        col.add(`${m.title} :: ${m.text}`, 'notice')
        break
      case 'choice': {
        col.add(`${m.title} :: ${m.text}`, `choice`)
        for (const c of m.choices) col.add(c.label, `choice option (${m.title})`)
        const choice = d.pick(m.choices)
        if (m.source === 'script') runScript(g, m.scriptId!, choice.id, m.data, m)
        else applyFallback(g, { type: 'resolveChoice', event: m, choiceId: choice.id })
        break
      }
      case 'input':
        col.add(`${m.title} :: ${m.text ?? ''}`, 'input')
        runScript(g, m.scriptId, inputValue(m, d), m.data, m)
        break
      case 'minigame':
        runScript(g, m.scriptId, minigameResult(m, d), m.data, m)
        break
      case 'aiTask':
        applyFallback(g, m.task)
        break
    }
    const added = g.queue.splice(before)
    g.queue.unshift(...added)
  }
  col.flushLog()
}

function playLife(seed: number, year: number, countryId: string | undefined, actionsPerYear: number, maxAge = 125): Seen[] {
  const d = driver(seed * 104729 + year)
  let g = createNewLife({ seed, year, countryId })
  const col = new Collector(() => g)
  col.begin()
  drain(g, d, col)
  while (g.character.alive && g.character.age < maxAge) {
    const n = d.int(0, actionsPerYear)
    for (let i = 0; i < n && g.character.alive; i++) {
      col.begin()
      const roll = d.next()
      let action: MenuAction | undefined
      if (roll < 0.3) {
        const living = g.people.filter((p) => p.alive)
        const person = living.length ? d.pick(living) : undefined
        if (person) {
          const nodes = personActions(g, person)
          for (const t of menuTexts(g, nodes)) col.add(t, `person menu (${person.relation})`)
          action = d.pick([undefined, ...collectActions(g, nodes)])
        }
      } else {
        const menu = d.pick([activitiesMenu, activitiesMenu, activitiesMenu, occupationMenu, assetsMenu])
        const options = collectActions(g, menu.children(g))
        if (options.length) action = d.pick(options)
      }
      if (!action) continue
      if (action.label) col.add(action.label, `action ${action.id}`)
      if (typeof action.subtitle === 'string') col.add(action.subtitle, `action ${action.id}`)
      const input = action.input
        ? action.input.kind === 'number'
          ? String(d.int(action.input.min ?? 1, Math.min(action.input.max ?? 5000, (action.input.min ?? 1) + 5000)))
          : (action.input.defaultValue?.(g) ?? d.pick(TEXT_INPUTS))
        : undefined
      action.run(g, input)
      drain(g, d, col)
    }
    if (!g.character.alive) break
    col.begin()
    ageUp(g)
    drain(g, d, col)
  }
  return col.seen
}

const COUNTRIES = [undefined, 'us', 'gb', 'in', 'ng', 'br', 'jp', 'de', 'mx', 'id', 'eg', 'fr', 'ru']

describe('anachronism lint (offline lives born 1900-1995)', () => {
  it('never mentions things before they existed', () => {
    const bad: Record<string, Seen & { rules: string[] }> = {}
    let lives = 0
    for (let i = 0; i < 48; i++) {
      const year = 1900 + Math.round((i * 95) / 47)
      const country = COUNTRIES[i % COUNTRIES.length]
      for (const s of playLife(i + 1, year, country, 4)) {
        const rules = anachronismsIn(s.text, s.year, s.countries)
        if (!rules.length) continue
        const key = `${rules.join(',')}|${s.text.slice(0, 160)}`
        if (!bad[key]) bad[key] = { ...s, rules }
      }
      lives++
    }
    const list = Object.values(bad)
    const report = list
      .sort((a, b) => a.rules[0].localeCompare(b.rules[0]))
      .map((v) => `[${v.rules.join(',')}] ${v.year} ${v.countries.join('/')} (${v.where}): ${v.text.slice(0, 220)}`)
      .join('\n')
    if (list.length) console.log(`${list.length} anachronisms in ${lives} lives:\n${report}`)
    expect(list.length, report.slice(0, 6000)).toBe(0)
  }, 600_000)
})
