// The Time Machine: start-of-year snapshots (taken, pruned, compact, surviving reloads and
// storage failures), exact travel, jump limits, undoing a death without a grave or ribbon,
// heirs starting a fresh timeline, and the UI that offers it.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GameState, ModalItem } from '../src/game/types'
import { makeTestGame } from './helpers'

// ---------------------------------------------------------------------------
// A localStorage with a quota, installed before the store and save modules load.

const storage = vi.hoisted(() => {
  const data = new Map<string, string>()
  const box = { quota: Infinity }
  const used = () => {
    let n = 0
    for (const [k, v] of data) n += k.length + v.length
    return n
  }
  const ls = {
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => {
      const s = String(v)
      const next = used() - (data.has(k) ? k.length + data.get(k)!.length : 0) + k.length + s.length
      if (next > box.quota) throw new Error('QuotaExceededError')
      data.set(k, s)
    },
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() {
      return data.size
    },
  }
  Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true, writable: true })
  return { data, box, used }
})

const store = await import('../src/ui/store')
const save = await import('../src/game/save')
const tm = await import('../src/game/timeMachine')
const core = await import('../src/game/core')
const { worldYear } = await import('../src/game/invest/engine')
const { killCharacter } = await import('../src/game/death')
const { createPerson } = await import('../src/game/people')
const { TimeMachineSheet, TimeMachineDeathButton, timeMachineRows, confirmTravelText, canOfferTimeMachine } = await import(
  '../src/ui/components/TimeMachine'
)
const { TimeMachineSettingsSection } = await import('../src/ui/components/TimeMachineSettings')
const { GameScreen } = await import('../src/ui/screens/GameScreen')
const { DeathScreen } = await import('../src/ui/screens/DeathScreen')

const TM_PREFIX = 'anotherlife.tm.'
const render = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el)

function game(): GameState {
  return store.getApp().game as GameState
}

function minigameResult(m: Extract<ModalItem, { kind: 'minigame' }>): string {
  switch (m.game) {
    case 'blackjack':
      return 'lose'
    case 'burglary':
      return JSON.stringify({ loot: 0, caught: false })
    case 'prisonEscape':
      return 'caught'
    case 'pickpocket':
      return 'fail'
    case 'annualReport':
      return 'skip'
    default:
      return 'done'
  }
}

/** Answer every popup through the store (AI is off), taking the last, usually safest, option. */
function drain(): void {
  for (let i = 0; i < 300; i++) {
    const m = game().queue[0]
    if (!m) return
    if (m.kind === 'notice') store.dismissNotice(m.id)
    else if (m.kind === 'choice') store.chooseOption(m.id, m.choices[m.choices.length - 1].id)
    else if (m.kind === 'input') store.submitInput(m.id, m.input === 'number' ? String(m.min ?? 1) : m.defaultValue || 'Alex')
    else if (m.kind === 'minigame') store.finishMinigame(m.id, minigameResult(m))
    else store.processQueue()
  }
  throw new Error('queue never drained')
}

async function settle(): Promise<void> {
  await save.snapshotWritesSettled()
  await save.snapshotWritesSettled()
}

/** Age up `years` times, answering popups; returns the state at the start of each new year. */
async function live(years: number): Promise<Map<number, string>> {
  const starts = new Map<number, string>()
  for (let i = 0; i < years; i++) {
    store.ageUpAction()
    drain()
    expect(game().character.alive, `died at ${game().character.age}: ${game().character.causeOfDeath}`).toBe(true)
    starts.set(game().character.age, JSON.stringify(game()))
    await settle()
  }
  return starts
}

function stopAges(): number[] {
  return store.getApp().timeStops.map((s) => s.age)
}

function tmChars(): number {
  let n = 0
  for (const [k, v] of storage.data) if (k.startsWith(TM_PREFIX)) n += k.length + v.length
  return n
}

/** Undo exactly what a jump adds on purpose, so the rest can be compared byte for byte. */
function withoutJumpMarks(arrived: GameState, snapshot: GameState): GameState {
  const g = structuredClone(arrived)
  delete g.flags.timeMachine
  if (snapshot.flags.timelineForks === undefined) delete g.flags.timelineForks
  else g.flags.timelineForks = snapshot.flags.timelineForks
  g.rng = snapshot.rng
  g.nextId -= 1
  g.log[g.log.length - 1].entries.pop()
  g.character.memories.pop()
  return g
}

beforeEach(async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  storage.box.quota = Infinity
  save.setSnapshotBackend(null)
  store.updateSettings({ aiLevel: 'off', setupDone: true, sandboxTimeMachine: false } as never)
  store.startNewLife({ seed: 41, year: 1980, countryId: 'us' })
  drain()
  await settle()
})

afterEach(async () => {
  await settle()
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------

describe('time machine rules (pure)', () => {
  it('counts jumps, labels stops and never goes forward', () => {
    const g = makeTestGame(1, { age: 40 })
    g.year = 2020
    expect(tm.jumpsUsed(g)).toBe(0)
    expect(tm.jumpsLeft(g, false)).toBe(tm.TIME_MACHINE_JUMPS)
    expect(tm.jumpsLeft(g, true)).toBe(Infinity)
    expect(tm.jumpsText(g, false)).toBe('3 of 3 jumps left this life')
    g.flags.timeMachine = { used: 3 }
    expect(tm.jumpsText(g, false)).toBe('No jumps left this life')
    expect(tm.jumpsText(g, true)).toMatch(/unlimited/)

    const stop = (age: number) => ({ age, year: 1980 + age, money: 100, role: 'Barista' })
    const stops = [stop(0), stop(34), stop(40), stop(41)]
    expect(tm.availableStops(g, stops).map((s) => s.age)).toEqual([40, 34, 0])
    expect(tm.stopLabel(g, stop(34))).toBe('Go back to age 34 (2014)')
    expect(tm.stopLabel(g, stop(40))).toBe('Restart age 40 (2020)')
    expect(tm.stopLabel(g, stop(0))).toMatch(/born \(1980\)/)
    expect(tm.travelBlock(g, stop(41), true)).toMatch(/backwards/)
    expect(tm.travelBlock(g, stop(34), false)).toMatch(/out of fuel/)
    expect(tm.travelBlock(g, stop(34), true)).toBe('')
    expect(tm.travelBlock(g, undefined, true)).toMatch(/faded/)
    // Another life's stop (different birth year) is never offered.
    expect(tm.availableStops(g, [{ age: 30, year: 1999, money: 0, role: '' }])).toEqual([])

    g.character.alive = false
    expect(tm.stopLabel(g, stop(40))).toBe('Go back to age 40 (2020)')
    expect(tm.sandboxTimeMachine({ sandboxTimeMachine: true })).toBe(true)
    expect(tm.sandboxTimeMachine({})).toBe(false)
    expect(tm.sandboxTimeMachine(null)).toBe(false)
  })

  it('arriving keeps the snapshot, adds the log line, counts the jump and stirs the dice', () => {
    const past = makeTestGame(5, { age: 30 })
    past.year = 2010
    past.log = [{ age: 30, year: 2010, entries: [{ id: 'l1', text: 'I turned 30.', tone: 'neutral' }] }]
    const now = makeTestGame(9, { age: 33 })
    now.year = 2013
    now.flags.timeMachine = { used: 1 }
    const pastJson = JSON.stringify(past)
    const arrived = tm.arriveInPast(now, past)
    expect(JSON.stringify(past)).toBe(pastJson)
    expect(arrived.flags.timeMachine).toEqual({ used: 2 })
    expect(arrived.rng).not.toBe(past.rng)
    expect(arrived.log.at(-1)?.entries.at(-1)?.text).toBe('⏳ I used the Time Machine and went back to 2010.')
    expect(arrived.character.memories.at(-1)).toMatch(/time machine/)
    expect(JSON.stringify(withoutJumpMarks(arrived, past))).toBe(pastJson)
    // Deterministic: the same trip lands on the same dice.
    expect(tm.arriveInPast(now, past).rng).toBe(arrived.rng)
  })
})

describe('snapshots', () => {
  it('keeps the start of each year, pruned to the last ten, and compact', async () => {
    expect(stopAges()).toEqual([0])
    const starts = await live(24)
    const ages = stopAges()
    expect(ages).toHaveLength(tm.TIME_MACHINE_STOPS)
    expect(ages).toEqual(Array.from({ length: 10 }, (_, i) => game().character.age - 9 + i))
    // Each snapshot is the life exactly as that year started.
    for (const age of [ages[0], ages[5], ages[9]]) {
      const snap = await save.loadSnapshot(game().lifeId, age)
      expect(JSON.stringify(snap)).toBe(starts.get(age))
    }
    expect(await save.loadSnapshot(game().lifeId, ages[0] - 1)).toBeNull()
    // Log years are shared between snapshots: far smaller than ten full copies.
    const naive = ages.reduce((n, a) => n + (starts.get(a)?.length ?? 0), 0)
    expect(tmChars()).toBeLessThan(naive * 0.6)
    // Nothing is left behind for pruned years.
    const records = [...storage.data.keys()].filter((k) => k.startsWith(`${TM_PREFIX}s|`))
    expect(records).toHaveLength(tm.TIME_MACHINE_STOPS)
    // A snapshot is the codec's head plus chunks (R2-S9): the world economy is one `world.<sum>` chunk, and the world changes every
    // year, so each snapshot has one of its own. (v4.1.1 stored frames, and last year's closing world was next year's `previous`,
    // which made it TIME_MACHINE_STOPS + 1 frames; `previous` is no longer shared, and R2-S10 prunes it.)
    const worldFrames = [...storage.data.keys()].filter(k => k.startsWith(TM_PREFIX) && k.includes('world.'))
    expect(worldFrames).toHaveLength(tm.TIME_MACHINE_STOPS)
    if (typeof CompressionStream !== 'undefined') expect(records.every(key => storage.data.get(key)?.startsWith('gz2:'))).toBe(true)
    // The index lists the summary the sheet shows.
    expect(store.getApp().timeStops.at(-1)).toMatchObject({ age: game().character.age, year: game().year })
  }, 60_000)

  it('survive a reload', async () => {
    const starts = await live(4)
    const lifeId = game().lifeId
    const want = stopAges()
    vi.resetModules()
    const fresh = await import('../src/game/save')
    expect(fresh.timeStops(lifeId).map((s) => s.age)).toEqual(want)
    const snap = await fresh.loadSnapshot(lifeId, 3)
    expect(JSON.stringify(snap)).toBe(starts.get(3))
  }, 30_000)

  it('a failing snapshot store never breaks saving the game', async () => {
    const failing: import('../src/game/save').SnapshotBackend = {
      name: 'memory',
      get: async (keys) => keys.map(() => null),
      put: async () => {
        throw new Error('disk on fire')
      },
      remove: async () => {
        throw new Error('disk on fire')
      },
      keys: async () => [],
    }
    save.setSnapshotBackend(failing)
    await live(3)
    expect(game().character.age).toBe(3)
    expect(save.loadGame()?.character.age).toBe(3)
    expect(store.getApp().timeStops).toHaveLength(0)
    // And travelling with nothing loadable explains itself instead of crashing.
    expect(await store.travelBack(2)).toBe(false)
    expect(store.getApp().timeTravel.error).toMatch(/faded/)
  }, 30_000)

  it('the main save gets the room back when localStorage is full', async () => {
    await live(6)
    expect(stopAges().length).toBeGreaterThan(3)
    const before = stopAges().length
    storage.box.quota = storage.used() + 200
    const g = structuredClone(game())
    g.flags.padding = 'x'.repeat(4000)
    expect(save.saveGame(g)).toBe(true)
    expect(save.loadGame()?.flags.padding).toHaveLength(4000)
    expect(save.timeStops(g.lifeId).length).toBeLessThan(before)
    // The snapshots that are left still load.
    const left = save.timeStops(g.lifeId)
    expect(left.length).toBeGreaterThan(0)
    expect(await save.loadSnapshot(g.lifeId, left[0].age)).not.toBeNull()
  }, 30_000)

  it('snapshots stay inside their localStorage budget', async () => {
    const huge = 'y'.repeat(Math.ceil(save.LOCAL_SNAPSHOT_BUDGET / 3))
    store.act((g) => {
      g.flags.memoir = huge
    })
    await live(5)
    expect(tmChars()).toBeLessThanOrEqual(save.LOCAL_SNAPSHOT_BUDGET)
    expect(stopAges().length).toBeGreaterThan(0)
    // Repeated text compresses well; bounded storage no longer implies evicting
    // these stops. The independent quota-failure test still exercises eviction.
    expect(stopAges().length).toBeLessThanOrEqual(tm.TIME_MACHINE_STOPS)
    const last = stopAges().at(-1)!
    expect((await save.loadSnapshot(game().lifeId, last))?.flags.memoir).toBe(huge)
  }, 30_000)
})

describe('travelling', () => {
  it('restores the start of that year exactly, drops the future and clears the return chip', async () => {
    const starts = await live(8)
    const snapshot = JSON.parse(starts.get(4)!) as GameState
    store.setReturnPoint({ sheet: 'activities', path: ['mindBody'], scrolls: [0, 0] })
    expect(await store.travelBack(4)).toBe(true)
    const g = game()
    expect(g.character.age).toBe(4)
    expect(g.year).toBe(1984)
    expect(JSON.stringify(withoutJumpMarks(g, snapshot))).toBe(starts.get(4))
    expect(g.log.at(-1)?.entries.at(-1)?.text).toBe('⏳ I used the Time Machine and went back to 1984.')
    expect(tm.jumpsUsed(g)).toBe(1)
    expect(store.getApp().returnPoint).toBeNull()
    expect(store.getApp().timeTravel.arrived).toMatchObject({ year: 1984, age: 4 })
    await settle()
    // The abandoned future is gone; the year you came back to stays.
    expect(stopAges()).toEqual([0, 1, 2, 3, 4])
    // The jump is saved, and the life carries on (with fresh snapshots).
    expect(save.loadGame()?.flags.timeMachine).toEqual({ used: 1 })
    await live(2)
    expect(stopAges()).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(tm.jumpsUsed(game())).toBe(1)
  }, 30_000)

  it('is limited to three jumps a life, unless sandbox mode is on', async () => {
    await live(6)
    for (let i = 0; i < tm.TIME_MACHINE_JUMPS; i++) {
      expect(await store.travelBack(game().character.age - 1)).toBe(true)
      await live(1)
    }
    expect(tm.jumpsUsed(game())).toBe(3)
    expect(await store.travelBack(game().character.age - 1)).toBe(false)
    expect(store.getApp().timeTravel.error).toMatch(/out of fuel/)
    store.clearTimeTravelError()
    expect(store.getApp().timeTravel.error).toBe('')

    store.updateSettings({ sandboxTimeMachine: true } as never)
    expect(await store.travelBack(game().character.age - 1)).toBe(true)
    expect(tm.jumpsUsed(game())).toBe(4)
  }, 30_000)

  it('undoes a death without leaving a grave or a ribbon', async () => {
    await live(20)
    const lifeId = game().lifeId
    const ribbonsBefore = save.loadRibbons()
    store.act((g) => killCharacter(g, 'Falling Piano'))
    drain()
    const dead = game()
    expect(dead.character.alive).toBe(false)
    expect(dead.flags.deathRecorded).toBe(true)
    expect(save.loadGraveyard().some((e) => e.lifeId === lifeId)).toBe(true)
    // Dying mid-year: the start of that year is still on offer.
    expect(tm.availableStops(dead, store.getApp().timeStops)[0].age).toBe(dead.character.age)
    const deathHtml = render(createElement(DeathScreen))
    expect(deathHtml).toContain('Use the Time Machine')
    // "Live again" keeps the birth year (a 1980 life is lived again from 1980, not from today).
    expect(deathHtml).toContain('Born 1980, same name')

    expect(await store.travelBack(15)).toBe(true)
    const g = game()
    expect(g.character.alive).toBe(true)
    expect(g.character.age).toBe(15)
    expect(g.flags.deathRecorded).toBeUndefined()
    expect(save.loadGraveyard().some((e) => e.lifeId === lifeId)).toBe(false)
    expect(save.loadRibbons()).toEqual(ribbonsBefore)
    expect(store.getApp().screen).toBe('game')
    expect(g.character.memories.at(-1)).toMatch(/Died in 2000/)
  }, 60_000)

  it('a full graveyard gets back the grave this death pushed out', async () => {
    await live(3)
    const graves = Array.from({ length: 100 }, (_, i) => ({
      lifeId: `old-${i}`,
      name: `Old Timer ${i}`,
      gender: 'female' as const,
      generation: 1,
      bornYear: 1900,
      diedYear: 1980,
      age: 80,
      causeOfDeath: 'Old Age',
      netWorth: i,
      occupation: 'Retired',
      ribbon: null,
      obituary: null,
    }))
    localStorage.setItem('anotherlife.graveyard.v1', JSON.stringify(graves))
    store.act((g) => killCharacter(g, 'Rogue Shopping Cart'))
    drain()
    expect(save.loadGraveyard()).toHaveLength(100)
    expect(save.loadGraveyard()[0].lifeId).toBe(game().lifeId)
    expect(await store.travelBack(2)).toBe(true)
    expect(save.loadGraveyard()).toEqual(graves)
  })

  it('a graveyard cleared after the death stays cleared when the death is undone', async () => {
    await live(3)
    const graves = Array.from({ length: 100 }, (_, i) => ({
      lifeId: `old-${i}`,
      name: `Old Timer ${i}`,
      gender: 'male' as const,
      generation: 1,
      bornYear: 1900,
      diedYear: 1980,
      age: 80,
      causeOfDeath: 'Old Age',
      netWorth: i,
      occupation: 'Retired',
      ribbon: null,
      obituary: null,
    }))
    localStorage.setItem('anotherlife.graveyard.v1', JSON.stringify(graves))
    store.act((g) => killCharacter(g, 'Rogue Shopping Cart'))
    drain()
    expect(game().flags.bumpedGraves).toBeTruthy()
    save.clearRibbonsAndGraveyard()
    expect(await store.travelBack(2)).toBe(true)
    expect(save.loadGraveyard()).toEqual([])
    expect(save.loadRibbons()).toEqual({})
  })

  it('continuing as an heir starts a fresh timeline', async () => {
    await live(25)
    const parentId = game().lifeId
    store.act((g) => {
      g.flags.timelineForks = [{ year: g.year - 2, salt: 'abc123' }]
      createPerson(g, { relation: 'child', age: 3, lastName: g.character.lastName, relationship: 80 })
      killCharacter(g, 'Old Age')
    })
    drain()
    const heir = game().people.find((p) => p.relation === 'child' && p.alive)!
    store.continueAs(heir.id)
    drain()
    await settle()
    const g = game()
    expect(g.lifeId).not.toBe(parentId)
    expect(stopAges()).toEqual([g.character.age])
    expect(g.flags.timelineForks).toEqual([{ year: g.year - 2, salt: 'abc123' }])
    expect(save.timeStops(parentId)).toHaveLength(0)
    expect([...storage.data.keys()].some((k) => k.startsWith(TM_PREFIX) && k.includes(parentId + '|'))).toBe(false)
    expect(tm.jumpsUsed(g)).toBe(0)
  }, 60_000)

  it('a new life forgets the old one; abandoning forgets everything', async () => {
    await live(3)
    store.startNewLife({ seed: 77, year: 1990 })
    drain()
    await settle()
    expect(stopAges()).toEqual([0])
    store.abandonLife()
    await settle()
    expect(store.getApp().timeStops).toHaveLength(0)
    expect(tmChars()).toBe(0)
  })
})

describe('time machine UI', () => {
  it('the game screen shows the ⏳ button once a past year exists', async () => {
    expect(canOfferTimeMachine(game(), store.getApp().timeStops)).toBe(false)
    expect(render(createElement(GameScreen))).not.toContain('tm-fab')
    await live(2)
    const html = render(createElement(GameScreen))
    expect(html).toContain('tm-fab')
    expect(html).toContain('aria-label="Time Machine: 3 of 3 jumps left this life"')
    expect(html).toContain('return-dock has-tm')
  })

  it('the sheet lists the years with what you were doing, and explains an empty tank', async () => {
    await live(3)
    const g = game()
    const rows = timeMachineRows(g, store.getApp().timeStops, false)
    expect(rows.map((r) => r.label)).toEqual([
      'Restart age 3 (1983)',
      'Go back to age 2 (1982)',
      'Go back to age 1 (1981)',
      'Go back to the day you were born (1980)',
    ])
    expect(rows[1].sub).toMatch(/\$[\d,]+ in the bank/)
    expect(confirmTravelText(g, rows[1].stop, false)).toMatch(/age 2 in 1982.*2 jumps left/)
    expect(confirmTravelText(g, rows[1].stop, true)).toMatch(/free/)

    let html = render(createElement(TimeMachineSheet, { g, onClose: () => {} }))
    expect(html).toContain('Time Machine')
    expect(html).toContain('Go back to age 2 (1982)')
    expect(html).toContain('3 of 3 jumps left this life')

    const empty = structuredClone(g)
    empty.flags.timeMachine = { used: 3 }
    html = render(createElement(TimeMachineSheet, { g: empty, onClose: () => {} }))
    expect(html).toContain('out of fuel')
    expect(html).toContain('Sandbox: unlimited Time Machine')
    expect(html).toContain('is-disabled')
    expect(render(createElement(TimeMachineDeathButton, { g: empty, onOpen: () => {} }))).toContain('Out of jumps this life')
    expect(render(createElement(TimeMachineDeathButton, { g, onOpen: () => {} }))).toContain('3 jumps left · back as far as 1980')

    const settingsHtml = render(createElement(TimeMachineSettingsSection))
    expect(settingsHtml).toContain('Sandbox: unlimited Time Machine')
    expect(settingsHtml).toContain('aria-checked="false"')
  })
})

describe('review fixes', () => {
  it('a jump forks the seeded future: later years roll new dice, the years already lived keep theirs', () => {
    const base = 'life-1980-x'
    const past = makeTestGame(5, { age: 30 })
    past.year = 2010
    const now = makeTestGame(9, { age: 33 })
    now.year = 2013
    // A life that never jumped keeps every seed (old saves and present-day lives are unchanged).
    expect(tm.timelineForks(now)).toEqual([])
    expect(tm.timelineTag(now, 2014)).toBe('')
    expect(tm.timelineFamily(now, base)).toBe(base)
    expect(tm.familyAt(base, 2014)).toBe(base)

    const a = tm.arriveInPast(now, past)
    const [f1] = tm.timelineForks(a)
    expect(f1.year).toBe(2010)
    expect(JSON.parse(JSON.stringify(a.flags.timelineForks))).toEqual(a.flags.timelineForks)
    // The year you arrive in was already lived (its prices are on screen); the next ones weren't.
    expect(tm.timelineTag(a, 2010)).toBe('')
    expect(tm.timelineTag(a, 2011)).toBe(`~${f1.salt}`)
    const fam = tm.timelineFamily(a, base)
    expect(tm.familyAt(fam)).toBe(base)
    expect(tm.familyAt(fam, 2010)).toBe(base)
    expect(tm.familyAt(fam, 2011)).toBe(`${base}~${f1.salt}`)
    // With the market engine, in the procedural years after PRESENT_YEAR (real history is the
    // same in every timeline): the year you land in is unchanged, the ones after it are new.
    const future = makeTestGame(3, { age: 20 })
    future.flags.timelineForks = [{ year: 2040, salt: 'k3' }]
    const futFam = tm.timelineFamily(future, base)
    expect(worldYear(tm.familyAt(futFam, 2040), 2040)).toEqual(worldYear(base, 2040))
    const z = (f: string) => [2041, 2042, 2043].map((y) => worldYear(tm.familyAt(f, y), y).z)
    expect(z(futFam)).not.toEqual(z(base))

    // Live on in that timeline to 2016 and jump back to 2012: 2011 stays as it was lived.
    const later = structuredClone(a)
    later.year = 2016
    later.character.age = 36
    const snap2012 = structuredClone(a)
    snap2012.year = 2012
    snap2012.character.age = 32
    const b = tm.arriveInPast(later, snap2012)
    const forks = tm.timelineForks(b)
    expect(forks.map((f) => f.year)).toEqual([2010, 2012])
    expect(forks[1].salt).not.toBe(f1.salt)
    expect(tm.timelineTag(b, 2011)).toBe(`~${f1.salt}`)
    expect(tm.timelineTag(b, 2013)).toBe(`~${forks[1].salt}`)
    expect(tm.familyAt(tm.timelineFamily(b, base), 2011)).toBe(`${base}~${f1.salt}`)
    // Going back before both forgets the forks after it.
    const snap2008 = structuredClone(past)
    snap2008.year = 2008
    snap2008.character.age = 28
    expect(tm.timelineForks(tm.arriveInPast(b, snap2008)).map((f) => f.year)).toEqual([2008])
    // Junk in the flag is ignored rather than trusted.
    const junk = structuredClone(now)
    junk.flags.timelineForks = [{ year: 'x', salt: 1 }, null, { year: 2001, salt: 'a,b' }] as never
    expect(tm.timelineForks(junk)).toEqual([])
  })

  it('the store records the fork when you travel', async () => {
    await live(5)
    expect(await store.travelBack(2)).toBe(true)
    const forks = tm.timelineForks(game())
    expect(forks).toHaveLength(1)
    expect(forks[0].year).toBe(1982)
    expect(save.loadGame()?.flags.timelineForks).toEqual(game().flags.timelineForks)
  }, 30_000)

  it("each year in the list shows its balance in that year's money and country", async () => {
    store.startNewLife({ seed: 41, year: 1980, countryId: 'jp' })
    drain()
    store.act((g) => {
      g.character.money = 1_000_000
    })
    await settle()
    await live(12)
    const g = game()
    const before = core.currentMoneyContext()
    const row = timeMachineRows(g, store.getApp().timeStops, false).at(-1)!
    expect(row.stop.year).toBe(1983)
    expect(row.stop.countryId).toBe('jp')
    const then = core.showMoneyIn(row.stop.money, { countryId: 'jp', year: 1983 })
    const today = core.showMoney(row.stop.money)
    expect(then.symbol).toBe('¥')
    // 1983 yen bought more than 1992 yen: the list must not show the old balance at today's prices.
    expect(Math.abs(then.amount - today.amount) / today.amount).toBeGreaterThan(0.01)
    expect(row.sub).toContain(`¥${Math.round(then.amount).toLocaleString('en-US')} in the bank`)
    // Formatting a past year leaves the life on screen bound.
    expect(core.currentMoneyContext()).toEqual(before)
  }, 60_000)

  it("can't travel with a popup on screen; a newborn stop reads naturally", () => {
    const g = makeTestGame(1, { age: 3 })
    g.year = 1983
    const stop = { age: 0, year: 1980, money: 0, role: 'Infant' }
    expect(tm.travelBlock(g, stop, false)).toBe('')
    expect(confirmTravelText(g, stop, false)).toMatch(/^You'll be a newborn again in 1980\. The last 3 years never happened/)
    const one = { age: 2, year: 1982, money: 0, role: 'Toddler' }
    expect(confirmTravelText(g, one, false)).toMatch(/The last year never happened/)
    g.queue.push({ kind: 'notice', id: 'n1', title: 'Hi', text: 'Hello' } as ModalItem)
    expect(tm.travelBlock(g, stop, false)).toMatch(/on screen/)
  })
})

describe('adversarial review fixes', () => {
  it('storage that stops answering never leaves the Time Machine spinning, and snapshots recover', async () => {
    await live(3)
    // A stuck IndexedDB transaction: reads never come back.
    const stuck: import('../src/game/save').SnapshotBackend = {
      name: 'local',
      get: () => new Promise(() => {}),
      put: async () => {},
      remove: async () => {},
      keys: async () => [],
    }
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      save.setSnapshotBackend(stuck)
      const trip = store.travelBack(1)
      expect(store.getApp().timeTravel.busy).toBe(true)
      await vi.advanceTimersByTimeAsync(store.TRAVEL_TIMEOUT_MS + 10)
      expect(await trip).toBe(false)
      expect(store.getApp().timeTravel).toMatchObject({ busy: false })
      expect(store.getApp().timeTravel.error).toMatch(/stalled on the way to 1981/)
      // A slow year isn't a missing one: it stays on offer, and nothing about the life changed.
      expect(stopAges()).toContain(1)
      expect(game().character.age).toBe(3)
      // The stuck operation is given up on, so the queue behind it moves again.
      await vi.advanceTimersByTimeAsync(save.SNAPSHOT_OP_TIMEOUT_MS)
    } finally {
      vi.useRealTimers()
      save.setSnapshotBackend(null)
    }
    await settle()
    store.clearTimeTravelError()
    expect(await store.travelBack(1)).toBe(true)
    expect(game().character.age).toBe(1)
    await live(1)
    expect(stopAges()).toEqual([0, 1, 2])
  }, 30_000)

  it("a jump that can't be saved is called off and leaves the grave and ribbon alone", async () => {
    await live(4)
    const lifeId = game().lifeId
    store.act((g) => killCharacter(g, 'Falling Piano'))
    drain()
    const dead = game()
    expect(dead.flags.deathRecorded).toBe(true)
    const ribbons = save.loadRibbons()
    const graves = save.loadGraveyard()
    expect(graves.some((e) => e.lifeId === lifeId)).toBe(true)
    // The browser refuses the main save (even after the Time Machine gives back its room).
    const setItem = localStorage.setItem.bind(localStorage)
    const refuse = vi.spyOn(localStorage, 'setItem').mockImplementation((k: string, v: string) => {
      if (k === 'anotherlife.save.v1') throw new Error('QuotaExceededError')
      setItem(k, v)
    })
    try {
      expect(await store.travelBack(2)).toBe(false)
    } finally {
      refuse.mockRestore()
    }
    expect(store.getApp().timeTravel.error).toMatch(/couldn't save your trip to 1982/)
    // Still dead, in memory and on disk, with the death still on record: a reload can't bring
    // back a dead life whose grave and ribbon were already taken back.
    expect(game()).toBe(dead)
    expect(save.loadGame()?.character.alive).toBe(false)
    expect(save.loadRibbons()).toEqual(ribbons)
    expect(save.loadGraveyard()).toEqual(graves)
  }, 30_000)

  it('bulldozing your own grave before jumping still takes the ribbon back', async () => {
    await live(3)
    const lifeId = game().lifeId
    const before = save.loadRibbons()
    store.act((g) => killCharacter(g, 'Falling Piano'))
    drain()
    const ribbon = game().ribbon
    expect(ribbon).toBeTruthy()
    expect(save.loadRibbons()[ribbon!]).toBe((before[ribbon!] ?? 0) + 1)
    save.removeFromGraveyard(lifeId)
    expect(await store.travelBack(2)).toBe(true)
    expect(save.loadRibbons()).toEqual(before)
    expect(save.loadGraveyard().some((e) => e.lifeId === lifeId)).toBe(false)
  }, 30_000)

  it('outcomeTag re-rolls the year you land in for results only settled when it ends', () => {
    const g = makeTestGame(2, { age: 40 })
    g.year = 2020
    // Never jumped: nothing changes (old saves and present-day lives keep their seeds).
    expect(tm.outcomeTag(g, 2019)).toBe('')
    expect(tm.outcomeTag(g, 2020)).toBe('')
    g.flags.timelineForks = [
      { year: 2010, salt: 'a1' },
      { year: 2012, salt: 'b2' },
    ]
    // Fiscal 2009 was booked at the 2010 birthday, before the first jump's snapshot: kept.
    expect(tm.outcomeTag(g, 2009)).toBe('')
    // 2010 was never booked in the first timeline before the jump: new dice from the first fork.
    expect(tm.outcomeTag(g, 2010)).toBe('~a1')
    // 2011 was booked (at the 2012 birthday) in the first fork's timeline, then the second jump.
    expect(tm.outcomeTag(g, 2011)).toBe('~a1')
    expect(tm.outcomeTag(g, 2012)).toBe('~b2')
    expect(tm.outcomeTag(g, 2030)).toBe('~b2')
    // Prices keep the year you land in (they're on screen the moment it starts).
    expect(tm.timelineTag(g, 2012)).toBe('~a1')
    expect(tm.outcomeTag(g, Number.NaN)).toBe('')
  })
})
