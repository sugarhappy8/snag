// Everything runs on the built-in offline systems: every queued task type resolves from a modal
// (offline.ts), old saves from the AI-narrator days load cleanly (save.ts), stored AI settings and
// API keys are dropped (settings.ts), and nothing under src talks to an AI or the network.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ageUp } from '../src/game/aging'
import { count, notice } from '../src/game/core'
import { createNewLife } from '../src/game/life'
import { doAnythingAction } from '../src/game/menus'
import { applyFallback, CUSTOM_ACTION_KEY, MAX_CUSTOM_ACTIONS_PER_YEAR, resolveTask } from '../src/game/offline'
import { migrateLegacyAi } from '../src/game/save'
import { runScript } from '../src/game/scripts'
import type { AiTask, ChoiceModal, GameState, ModalItem, NoticeModal, ScreeningApp } from '../src/game/types'
import { DEFAULT_SETTINGS, loadSettings, normalizeSettings, SETTINGS_KEY } from '../src/settings'
import { makeTestGame } from './helpers'

const ROOT = join(__dirname, '..')

/** Resolve the queue the way the store does: tasks offline, other popups with their first option. */
function drain(g: GameState, limit = 200): ModalItem[] {
  const seen: ModalItem[] = []
  for (let i = 0; i < limit && g.queue.length; i++) {
    const m = g.queue.shift()!
    seen.push(m)
    const before = g.queue.length
    if (m.kind === 'aiTask') applyFallback(g, m.task)
    else if (m.kind === 'choice' && m.source === 'script' && m.scriptId) runScript(g, m.scriptId, m.choices[0]?.id ?? 'ok', m.data, m)
    else if (m.kind === 'choice') applyFallback(g, { type: 'resolveChoice', event: m, choiceId: m.choices[0]?.id ?? 'ok' })
    else if (m.kind === 'input') runScript(g, m.scriptId, m.defaultValue || '1', m.data, m)
    else if (m.kind === 'minigame') runScript(g, m.scriptId, 'skip', m.data, m)
    g.queue.unshift(...g.queue.splice(before))
  }
  return seen
}

/** Put one task at the head of the queue and resolve just that modal, as the store does. */
function runTask(g: GameState, task: AiTask): ModalItem[] {
  g.queue.unshift({ kind: 'aiTask', id: `t-${task.type}`, task })
  const m = g.queue.shift()!
  if (m.kind !== 'aiTask') throw new Error('expected a task')
  applyFallback(g, m.task)
  return g.queue
}

const job = { defId: 'cashier', title: 'Cashier', company: 'Corner Mart', salary: 24_000, category: 'fulltime' as const }

describe('offline resolution of every queued task', () => {
  it('yearEvents: writes the year from the event library', () => {
    const g = createNewLife({ seed: 5, year: 2026, countryId: 'us' })
    drain(g)
    g.character.age = 9
    g.log.push({ age: 9, year: g.year + 9, entries: [] })
    runTask(g, { type: 'yearEvents' })
    const year = g.log[g.log.length - 1]
    const popups = g.queue.filter((m) => m.kind === 'choice')
    expect(year.entries.length + popups.length).toBeGreaterThan(0)
    for (const m of g.queue) expect(m.kind).not.toBe('aiTask')
  })

  it('resolveChoice: an event the old narrator wrote gets a generic outcome', () => {
    const g = makeTestGame(2, { age: 30 })
    const event: ChoiceModal = {
      kind: 'choice',
      id: 'legacy',
      title: 'Free Concert',
      text: 'A band is playing in the park. What will you do?',
      choices: [
        { id: 'a', label: 'Dance like nobody is watching' },
        { id: 'b', label: 'Walk away' },
      ],
      source: 'ai',
    }
    const queue = runTask(g, { type: 'resolveChoice', event, choiceId: 'a' })
    expect(queue.some((m) => m.kind === 'notice')).toBe(true)
    // A choice id the event doesn't have still resolves (the first option).
    const g2 = makeTestGame(2, { age: 30 })
    expect(runTask(g2, { type: 'resolveChoice', event, choiceId: 'zzz' }).some((m) => m.kind === 'notice')).toBe(true)
    // An empty event can't crash the queue.
    const g3 = makeTestGame(2, { age: 30 })
    expect(() => runTask(g3, { type: 'resolveChoice', event: { ...event, choices: [] }, choiceId: 'ok' })).not.toThrow()
  })

  it('customAction: "Do Anything" uses the keyword resolver, a few times a year', () => {
    const g = makeTestGame(4, { age: 25 })
    g.character.money = 5_000
    const queue = runTask(g, { type: 'customAction', text: 'go to the gym and lift weights' })
    const n = queue.find((m): m is NoticeModal => m.kind === 'notice')
    expect(n).toBeDefined()
    expect(n!.text.length).toBeGreaterThan(10)
    expect(g.counters.customActions).toBe(1)
    g.queue = []
    for (let i = 1; i < MAX_CUSTOM_ACTIONS_PER_YEAR; i++) runTask(g, { type: 'customAction', text: 'read a book' })
    g.queue = []
    runTask(g, { type: 'customAction', text: 'read a book' })
    expect(g.queue.map((m) => m.kind === 'notice' && m.title)).toEqual(['Exhausted'])
    expect(g.yearActions[CUSTOM_ACTION_KEY]).toBe(MAX_CUSTOM_ACTIONS_PER_YEAR)
    expect(Number.isFinite(g.character.money)).toBe(true)
  })

  it('interview: a scripted question with scored answers', () => {
    const g = makeTestGame(6, { age: 22 })
    const queue = runTask(g, { type: 'interview', job })
    const q = queue.find((m): m is ChoiceModal => m.kind === 'choice')
    expect(q?.title).toBe('Job Interview')
    expect(q!.choices.length).toBeGreaterThanOrEqual(2)
    expect(q!.text).toContain('Corner Mart')
  })

  it('screenApplication: the CV screener decides on an interview', () => {
    let invited = 0
    let rejected = 0
    for (let seed = 1; seed <= 12; seed++) {
      const g = makeTestGame(seed, { age: 23 })
      const app: ScreeningApp = { kind: 'job', job, org: job.company, fit: 50, chance: 0.5 }
      const queue = runTask(g, { type: 'screenApplication', app })
      if (queue.some((m) => m.kind === 'aiTask' && m.task.type === 'interview')) invited++
      else if (queue.some((m) => m.kind === 'notice')) rejected++
    }
    expect(invited).toBeGreaterThan(0)
    expect(invited + rejected).toBe(12)
  })

  it('obituary: written for the dead; nothing else happens after death', () => {
    const g = makeTestGame(8, { age: 81 })
    g.character.alive = false
    g.character.causeOfDeath = 'Old Age'
    for (const task of [
      { type: 'yearEvents' },
      { type: 'customAction', text: 'dance' },
      { type: 'interview', job },
      { type: 'screenApplication', app: { kind: 'job', job, org: 'X', fit: 50, chance: 0.5 } },
    ] as AiTask[]) {
      runTask(g, task)
      expect(g.queue, task.type).toEqual([])
    }
    runTask(g, { type: 'obituary' })
    expect(g.obituary).toMatch(/Test Player/)
    expect(g.queue).toEqual([])
  })

  it('Do Anything is greyed out once the year\'s actions are used up, instead of asking for one', () => {
    const g = makeTestGame(4, { age: 25 })
    const reason = doAnythingAction.disabledReason!
    expect(reason(g)).toBeNull()
    for (let i = 0; i < MAX_CUSTOM_ACTIONS_PER_YEAR - 1; i++) runTask(g, { type: 'customAction', text: 'read a book' })
    expect(reason(g)).toBeNull()
    runTask(g, { type: 'customAction', text: 'read a book' })
    expect(reason(g)).toMatch(/enough wild things/)
    // Pure: checking it changes nothing.
    const before = JSON.stringify(g)
    reason(g)
    expect(JSON.stringify(g)).toBe(before)
    // A new year brings them back.
    g.yearActions = {}
    expect(reason(g)).toBeNull()
    expect(reason(makeTestGame(4, { age: 3 }))).toMatch(/too young/)
  })

  it('an unknown task type from a future or broken save is a no-op', () => {
    const g = makeTestGame(1, { age: 30 })
    expect(() => runTask(g, { type: 'somethingNew' } as unknown as AiTask)).not.toThrow()
    expect(g.queue).toEqual([])
  })

  it('resolveTask is the same resolver', () => {
    expect(resolveTask).toBe(applyFallback)
  })

  it('a whole life plays to the end on the offline systems alone', () => {
    const g = createNewLife({ seed: 31, year: 2026, countryId: 'gb' })
    let tasks = 0
    for (let year = 0; year < 130 && g.character.alive; year++) {
      tasks += drain(g).filter((m) => m.kind === 'aiTask').length
      if (!g.character.alive) break
      // ageUp queues the yearEvents task (and the obituary on death).
      ageUp(g)
    }
    tasks += drain(g).filter((m) => m.kind === 'aiTask').length
    expect(tasks).toBeGreaterThan(10)
    expect(g.queue).toEqual([])
    if (!g.character.alive) expect(g.obituary && g.obituary.length).toBeGreaterThan(20)
  })
})

describe('old saves from the AI-narrator days', () => {
  function legacySave(): GameState {
    const g = makeTestGame(3, { age: 40 })
    notice(g, 'Spend Time', 'You went bowling with your mother.')
    ;(g.queue[0] as unknown as Record<string, unknown>).ai = { when: 'balanced', facts: 'went bowling', personId: 'p1' }
    g.queue.push({ kind: 'aiTask', id: 'old-task', task: { type: 'yearEvents' } })
    g.queue.push({ kind: 'notice', id: 'odd', title: 'Odd', text: 'x', tone: 'ai' as never })
    g.queue.push(null as never)
    g.log = [{ age: 40, year: g.year, entries: [{ id: 'l1', text: 'I found a shiny rock.', tone: 'ai' as never }, { id: 'l2', text: 'I won.', tone: 'good' }] }]
    g.flags.aiRecentEvents = ['Stray Dog']
    g.flags.obituarySource = 'ai'
    g.flags.eventMemory = [{ title: 'Stray Dog', age: 39, personId: '', person: '', kind: 'pets', source: 'ai', gen: 1 }]
    count(g, 'aiEvents')
    return g
  }

  it('drop narration requests and narrator flags, keep tasks and history', () => {
    const g = migrateLegacyAi(legacySave())
    expect('ai' in (g.queue[0] as object)).toBe(false)
    expect(g.queue[0]).toMatchObject({ kind: 'notice', title: 'Spend Time', text: 'You went bowling with your mother.' })
    expect(g.queue[1]).toMatchObject({ kind: 'aiTask', task: { type: 'yearEvents' } })
    expect((g.queue[2] as NoticeModal).tone).toBe('neutral')
    expect(g.log[0].entries.map((e) => e.tone)).toEqual(['neutral', 'good'])
    expect(g.flags.aiRecentEvents).toBeUndefined()
    expect(g.flags.obituarySource).toBeUndefined()
    // The event memory still keeps the narrator's events from repeating too soon.
    expect(g.flags.eventMemory).toHaveLength(1)
    expect(g.counters.aiEvents).toBe(1)
    // Idempotent and still plain JSON.
    const again = migrateLegacyAi(structuredClone(g))
    expect(again).toEqual(g)
    expect(JSON.parse(JSON.stringify(g))).toEqual(g)
  })

  it('tolerate junk', () => {
    const junk = { queue: 'nope', log: [null, { entries: 'x' }, { entries: [null, 5] }], flags: null } as unknown as GameState
    expect(() => migrateLegacyAi(junk)).not.toThrow()
    expect(junk.queue).toEqual([])
  })

  it('drop queue entries nothing could ever show or close (the life would be stuck behind them)', () => {
    const g = migrateLegacyAi(legacySave())
    expect(g.queue.map((m) => m.id)).toEqual([g.queue[0].id, 'old-task', 'odd'])
    const h = makeTestGame(3, { age: 40 })
    h.queue = [
      null,
      7,
      'notice',
      { kind: 'chat', id: 'c1', text: 'hi' },
      { kind: 'notice', title: 'No id', text: 'x' },
      { kind: 'aiTask', id: 't1', task: { type: 'yearEvents' } },
      { kind: 'notice', id: 'n1', title: 'Fine', text: 'x' },
    ] as unknown as ModalItem[]
    expect(migrateLegacyAi(h).queue.map((m) => m.id)).toEqual(['t1', 'n1'])
  })

  it('play on: the queued task resolves offline once the notice is read', () => {
    const g = migrateLegacyAi(legacySave())
    g.queue = g.queue.filter((m) => m && m.kind !== 'notice')
    const seen = drain(g)
    expect(seen.some((m) => m.kind === 'aiTask')).toBe(true)
    expect(g.queue).toEqual([])
  })
})

describe('settings', () => {
  const legacy = {
    aiLevel: 'full',
    provider: 'openai',
    setupDone: true,
    baseUrl: 'https://api.example.test/v1',
    apiKey: 'sk-secret',
    model: 'some-model',
    providerConfigs: { groq: { apiKey: 'gsk-secret' } },
    temperature: 0.7,
    maxTokens: 900,
    timeoutSec: 60,
    structuredOutput: false,
    disableThinking: true,
    contentRating: 'mature',
    showAiBadges: false,
    money: 'usd',
    prices: 'nominal',
    sandboxTimeMachine: false,
  }

  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage
  })

  function installStorage(initial: Record<string, string>): Map<string, string> {
    const data = new Map(Object.entries(initial))
    const ls = {
      getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
      setItem: (k: string, v: string) => void data.set(k, String(v)),
      removeItem: (k: string) => void data.delete(k),
    }
    Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true, writable: true })
    return data
  }

  it('normalize to the known fields only', () => {
    expect(normalizeSettings(legacy)).toEqual({ money: 'usd', prices: 'nominal', sandboxTimeMachine: false })
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(normalizeSettings('junk')).toEqual(DEFAULT_SETTINGS)
    expect(Object.keys(DEFAULT_SETTINGS).sort()).toEqual(['money', 'prices', 'sandboxTimeMachine'])
  })

  it('loading deletes stored API keys and provider settings', () => {
    const data = installStorage({ [SETTINGS_KEY]: JSON.stringify(legacy), other: 'kept' })
    const s = loadSettings()
    expect(s).toEqual({ money: 'usd', prices: 'nominal', sandboxTimeMachine: false })
    const stored = data.get(SETTINGS_KEY)!
    expect(stored).not.toMatch(/secret|apiKey|provider|baseUrl|model|aiLevel|setupDone/)
    expect(JSON.parse(stored)).toEqual(s)
    expect(data.get('other')).toBe('kept')
  })

  it('loading replaces unreadable settings and leaves clean ones untouched', () => {
    const broken = installStorage({ [SETTINGS_KEY]: '{"apiKey":"sk-secret", oops' })
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS)
    expect(broken.get(SETTINGS_KEY)).not.toContain('sk-secret')

    const clean = JSON.stringify({ money: 'local', prices: 'today', sandboxTimeMachine: true })
    const data = installStorage({ [SETTINGS_KEY]: clean })
    let writes = 0
    const ls = globalThis.localStorage as unknown as { setItem: (k: string, v: string) => void }
    const set = ls.setItem
    ls.setItem = (k, v) => {
      writes++
      set(k, v)
    }
    expect(loadSettings()).toEqual({ money: 'local', prices: 'today', sandboxTimeMachine: true })
    expect(writes).toBe(0)
    expect(data.get(SETTINGS_KEY)).toBe(clean)
  })

  it('a first visit stores nothing', () => {
    const data = installStorage({})
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS)
    expect(data.size).toBe(0)
  })
})

describe('no AI layer, no network', () => {
  function files(dir: string): string[] {
    const out: string[] = []
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) out.push(...files(p))
      else if (/\.(ts|tsx)$/.test(name)) out.push(p)
    }
    return out
  }
  const SRC = files(join(ROOT, 'src'))

  it('src/ai is gone and nothing under src imports from it', () => {
    expect(() => statSync(join(ROOT, 'src/ai'))).toThrow()
    expect(SRC.length).toBeGreaterThan(100)
    for (const f of SRC) {
      const text = readFileSync(f, 'utf8')
      expect(text, relative(ROOT, f)).not.toMatch(/from\s+['"][./]*(?:\.\.\/)*ai\/|import\(\s*['"][./]*(?:\.\.\/)*ai\//)
    }
  })

  it('nothing under src calls out (fetch, XHR, sockets, beacons) or ships an AI SDK', () => {
    for (const f of SRC) {
      const text = readFileSync(f, 'utf8')
      expect(text, relative(ROOT, f)).not.toMatch(/\bfetch\(|XMLHttpRequest|new WebSocket|EventSource|sendBeacon|@anthropic-ai\/|from\s+['"]openai|require\(\s*['"]openai|import\(\s*['"]openai/i)
    }
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
    expect(deps.filter((d) => /anthropic|openai|lmstudio|ollama/i.test(d))).toEqual([])
  })
})
