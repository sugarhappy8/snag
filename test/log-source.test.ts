// R3-Q1 (E.D1): where a line or popup came from. A yearly hook runs under its name (aging.ts), and every log line, notice and choice it
// makes carries that name as `s`; the year events task writes under `events`; the world-news line is `history` with weight 0. A line or
// popup made outside a hook has no `s`, and a key that is not set is not written, so those are saved exactly as before.
import { describe, expect, it } from 'vitest'
import { ageUp } from '../src/game/aging'
import { currentLogSource, currentLogYear, log, notice, scriptChoice, sourceOf, validLogSource, withLogSource } from '../src/game/core'
import { logNews, newsLine } from '../src/game/history/events'
import { withYearly, yearlyEntries, type YearlyEntry } from '../src/game/kernel/registry'
import { createNewLife, yearlyMilestones } from '../src/game/life'
import { applyFallback } from '../src/game/offline'
import type { ChoiceModal, GameState, LogEntry, ModalItem, NoticeModal } from '../src/game/types'
import { findSeed } from './seed-kit'

/** A fresh life; any seed will do. */
function life(seed = findSeed(() => true, { label: 'any life' }), year = 2000): GameState {
  return createNewLife({ seed, year })
}

/** A yearly entry for withYearly with the id a module's entry carries (an entry without one is `override#<index>`, which is no source). */
function hook(id: string, run: (g: GameState) => void): YearlyEntry {
  return { id, seam: 'aging', phase: 'life', order: 10, run } as unknown as YearlyEntry
}

function lastYear(g: GameState): LogEntry[] {
  return currentLogYear(g).entries
}

function byText(g: GameState, text: string): LogEntry {
  const e = lastYear(g).find((x) => x.text === text)
  expect(e, `log line "${text}"`).toBeDefined()
  return e!
}

function modal(g: GameState, title: string): ModalItem {
  const m = g.queue.find((x) => (x as { title?: string }).title === title)
  expect(m, `popup "${title}"`).toBeDefined()
  return m!
}

describe('withLogSource', () => {
  it('sets the source for the call, restores it, and nests', () => {
    expect(currentLogSource()).toBeUndefined()
    const seen: (string | undefined)[] = []
    const out = withLogSource('outer', () => {
      seen.push(currentLogSource())
      withLogSource('inner.part', () => seen.push(currentLogSource()))
      seen.push(currentLogSource())
      return 42
    })
    expect(out).toBe(42)
    expect(seen).toEqual(['outer', 'inner.part', 'outer'])
    expect(currentLogSource()).toBeUndefined()
  })

  it('restores the source when the call throws', () => {
    expect(() =>
      withLogSource('outer', () => {
        withLogSource('inner', () => {
          throw new Error('boom')
        })
      }),
    ).toThrow('boom')
    expect(currentLogSource()).toBeUndefined()
  })

  it('treats a name that is not a source as no source for the call, never a bad one', () => {
    const names = ['', 'Health', 'has space', 'a-b', 'a_b', '1abc', 'a'.repeat(25), 'override#0']
    for (const name of names) {
      expect(validLogSource(name), name).toBe(false)
      withLogSource('outer', () => withLogSource(name, () => expect(currentLogSource(), name).toBeUndefined()))
    }
    for (const name of ['a', 'health', 'world.frontier', 'effort.you', 'knowledge.core', 'a'.repeat(24)]) {
      expect(validLogSource(name), name).toBe(true)
    }
    expect(validLogSource(5)).toBe(false)
    expect(validLogSource(null)).toBe(false)
  })

  it('stamps a line, a notice and a choice made inside it, and nothing made outside', () => {
    const g = life()
    withLogSource('probe', () => {
      log(g, 'Inside the hook.')
      notice(g, 'Inside popup', 'Text.')
      scriptChoice(g, 'probe.script', 'Inside choice', 'Pick one.', [{ id: 'a', label: 'A' }])
    })
    log(g, 'Outside the hook.')
    notice(g, 'Outside popup', 'Text.')
    scriptChoice(g, 'probe.script', 'Outside choice', 'Pick one.', [{ id: 'a', label: 'A' }])
    expect(byText(g, 'Inside the hook.').s).toBe('probe')
    expect((modal(g, 'Inside popup') as NoticeModal).s).toBe('probe')
    expect((modal(g, 'Inside choice') as ChoiceModal).s).toBe('probe')
    // A key that is not set is not written: the JSON of a line made by the player is what it always was.
    const outside = byText(g, 'Outside the hook.')
    expect('s' in outside).toBe(false)
    expect('a' in outside).toBe(false)
    expect('w' in outside).toBe(false)
    expect(JSON.stringify(outside)).toBe(JSON.stringify({ id: outside.id, text: 'Outside the hook.', tone: 'neutral' }))
    expect('s' in modal(g, 'Outside popup')).toBe(false)
    expect('s' in modal(g, 'Outside choice')).toBe(false)
  })
})

describe('sourceOf', () => {
  it('strips the yearly. of a hook and leaves a module id whole', () => {
    expect(sourceOf('yearly.health')).toBe('health')
    expect(sourceOf('yearly.sharedProjects')).toBe('sharedProjects')
    expect(sourceOf('world.frontier')).toBe('world.frontier')
    expect(sourceOf('effort.you')).toBe('effort.you')
    expect(sourceOf('knowledge.core')).toBe('knowledge.core')
  })

  it('gives every registered aging entry a valid source, each its own', () => {
    const entries = yearlyEntries('aging')
    expect(entries.filter((e) => e.id.startsWith('yearly.')).length).toBeGreaterThanOrEqual(36)
    const names = entries.map((e) => sourceOf(e.id))
    for (const name of names) expect(validLogSource(name), name).toBe(true)
    expect(new Set(names).size).toBe(names.length)
  })
})

describe('ageUp runs each hook under its name', () => {
  it('stamps the lines, notices and choices a hook makes, and a popup it pushes straight onto the queue', () => {
    const g = life()
    withYearly(
      'aging',
      [
        hook('yearly.probe', (gg) => {
          log(gg, 'A line from the hook.')
          notice(gg, 'A popup from the hook', 'Text.')
          scriptChoice(gg, 'probe.script', 'A choice from the hook', 'Pick one.', [{ id: 'a', label: 'A' }])
          // Old hooks (dividends, hedge funds, market events) push a notice without notice(); it gets the source too.
          gg.queue.push({ kind: 'notice', id: 'raw-1', title: 'Raw popup', text: 'Pushed straight onto the queue.' })
          // A popup that already names a source keeps it.
          gg.queue.push({ kind: 'notice', id: 'raw-2', title: 'Raw named', text: 'Names its own.', s: 'other' })
        }),
        hook('yearly.second', (gg) => log(gg, 'A line from the second hook.')),
      ],
      () => ageUp(g),
    )
    expect(byText(g, 'A line from the hook.').s).toBe('probe')
    expect(byText(g, 'A line from the second hook.').s).toBe('second')
    expect((modal(g, 'A popup from the hook') as NoticeModal).s).toBe('probe')
    expect((modal(g, 'A choice from the hook') as ChoiceModal).s).toBe('probe')
    expect((modal(g, 'Raw popup') as NoticeModal).s).toBe('probe')
    expect((modal(g, 'Raw named') as NoticeModal).s).toBe('other')
    // The year events task at the tail is a task, not a popup: it carries nothing.
    const task = g.queue[g.queue.length - 1]!
    expect(task.kind).toBe('aiTask')
    expect('s' in task).toBe(false)
    expect(currentLogSource()).toBeUndefined()
  })

  it('leaves no source behind when a hook throws', () => {
    const g = life()
    expect(() =>
      withYearly(
        'aging',
        [
          hook('yearly.boom', () => {
            throw new Error('hook failed')
          }),
        ],
        () => ageUp(g),
      ),
    ).toThrow('hook failed')
    expect(currentLogSource()).toBeUndefined()
    log(g, 'After the failure.')
    expect('s' in byText(g, 'After the failure.')).toBe(false)
  })

  it('gives an entry without a module id no source (override#0 is no source)', () => {
    const g = life()
    withYearly('aging', [{ seam: 'aging', phase: 'life', order: 10, run: (gg: GameState) => log(gg, 'From an anonymous entry.') }], () => ageUp(g))
    expect('s' in byText(g, 'From an anonymous entry.')).toBe(false)
  })

  it('stamps only valid sources over a few real years, and the news line is history with weight 0', () => {
    const g = life()
    for (let i = 0; i < 4; i++) {
      g.queue = []
      ageUp(g)
    }
    const known = new Set([...yearlyEntries('aging').map((e) => sourceOf(e.id)), 'events'])
    const entries = g.log.flatMap((y) => y.entries)
    expect(entries.length).toBeGreaterThan(4)
    for (const e of entries) if (e.s !== undefined) expect(known.has(e.s), `${e.s}: ${e.text}`).toBe(true)
    const news = entries.filter((e) => e.id.startsWith('news-'))
    expect(news.length).toBeGreaterThan(0)
    for (const e of news) {
      expect(e.s).toBe('history')
      expect(e.w).toBe(0)
    }
    // The lines hooks wrote are stamped: at least one from a hook other than history.
    expect(entries.some((e) => e.s !== undefined && e.s !== 'history')).toBe(true)
  })
})

describe('the year events task', () => {
  /** A life one year in, its queue empty, then the tail task resolved the way the store does. */
  function resolved(seed: number): { g: GameState; added: LogEntry[]; choice: ChoiceModal | undefined } {
    const g = life(seed)
    withYearly('aging', [], () => ageUp(g))
    g.queue = []
    const before = lastYear(g).length
    applyFallback(g, { type: 'yearEvents' })
    const added = lastYear(g).slice(before)
    const choice = g.queue.find((m): m is ChoiceModal => m.kind === 'choice')
    return { g, added, choice }
  }

  it('writes the flavor lines and queues the event choice under the source events', () => {
    const seed = findSeed((s) => {
      const r = resolved(s)
      return r.added.length > 0 && r.choice !== undefined
    }, { label: 'a year with flavor lines and an event choice' })
    const { added, choice } = resolved(seed)
    expect(added.length).toBeGreaterThan(0)
    for (const e of added) expect(e.s, e.text).toBe('events')
    expect(choice!.s).toBe('events')
    expect(currentLogSource()).toBeUndefined()
  })
})

describe('the world-news line and the quiet year', () => {
  const seed = findSeed((s) => newsLine(2000, life(s).character.countryId) !== '', { label: 'a country with a news line in 2000' })

  /** A life one year old whose only line so far is the news. */
  function newsOnly(): GameState {
    const g = life(seed)
    g.log = []
    g.character.age = 1
    logNews(g)
    return g
  }

  it('logNews writes the news line with source history and weight 0, once', () => {
    const g = newsOnly()
    logNews(g)
    const news = lastYear(g)
    expect(news).toHaveLength(1)
    expect(news[0]!.s).toBe('history')
    expect(news[0]!.w).toBe(0)
    expect(news[0]!.id).toBe(`news-${g.generation}-${g.year}`)
  })

  it('a year with only the news line still gets the age 1 toddler line, as before', () => {
    const g = newsOnly()
    yearlyMilestones(g)
    expect(lastYear(g)).toHaveLength(2)
  })

  it('a year with another line in it does not, as before (the digest line counts as something that happened)', () => {
    const g = newsOnly()
    log(g, '\u{1F4C5} 2001: A year like any other.')
    yearlyMilestones(g)
    expect(lastYear(g)).toHaveLength(2)
  })

  it('only the history news line is ambient: another line with weight 0 is not', () => {
    const g = newsOnly()
    log(g, 'Something small happened.', 'neutral', undefined, { w: 0 })
    yearlyMilestones(g)
    expect(lastYear(g)).toHaveLength(2)
  })
})
