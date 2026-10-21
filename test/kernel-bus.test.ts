// ci: fast
// R2-K2 (K.3 b): the bus. emit(g, fact) hands one fact to the handlers that registered for its kind, in the order the registry
// sorts them (the exact kind by module id, then the '*' handlers by module id), synchronously, and nothing else: it draws no
// random number, reads no clock and writes only what a handler writes.
//
// What this file pins: the delivery order and that registration order never changes it, that a handler's write is visible on the
// next line, that a fact a handler emits waits in a FIFO and is delivered after every handler of the current fact (and that a
// cascade is cut at 64 deliveries and at 64 waiting facts), what counts as dropped, that a throwing handler leaves the bus usable,
// that emit leaves the state and g.rng alone and fails on a frozen state exactly where a handler writes, the slice guard, and that
// no game code reads the counters or sets a guard.
//
// Each case builds its registrations after vi.resetModules and a dynamic import, so no registry leaks between cases. The one
// group that needs the epoch the test file was loaded in (withGuard's default bus) registers its own ids and says so.
import { describe, expect, it, vi } from 'vitest'
import { emit as emitHere, setBusGuard as setGuardHere } from '../src/game/kernel/bus'
import { registerModule as registerHere } from '../src/game/kernel/registry'
import type { BusGuard } from '../src/game/kernel/bus'
import type { Fact } from '../src/game/kernel/fact'
import type { HandlerEntry, ModuleDef } from '../src/game/kernel/registry'
import type { GameState } from '../src/game/types'
import { makeTestGame } from './helpers'
import { deepFreeze } from './fuzz-kit'
import { loadModules, ownSliceGuard, withGuard } from './kernel-kit'
import { isId, loadSources } from './scan-kit'

type Reg = typeof import('../src/game/kernel/registry')
type Bus = typeof import('../src/game/kernel/bus')

/** A registry and a bus nobody has registered into yet (one copy of each, sharing the registry). */
async function fresh(): Promise<{ reg: Reg; bus: Bus }> {
  vi.resetModules()
  const reg = await import('../src/game/kernel/registry')
  const bus = await import('../src/game/kernel/bus')
  return { reg, bus }
}

const fact = (k: string, y = 2026, rest: Partial<Fact> = {}): Fact => ({ k, y, ...rest })
const handler = (kind: string, run: (g: GameState, f: Fact) => void, slice = 'flags.textMem'): HandlerEntry => ({ kind, slice, run })
const mod = (id: string, rest: Partial<ModuleDef> = {}): ModuleDef => ({ id, layer: 3, ...rest })
/** A module that does nothing but declare the kinds a test may emit. */
const declares = (...kinds: string[]): ModuleDef => mod('facts.test', { facts: kinds })

/** The state of a short life: a real GameState, so the guard and the freeze see real keys. */
const life = (): GameState => makeTestGame(7)

describe('bus: delivery order', () => {
  /** b.x and a.x hear company.failed and a.all hears everything; registered in the order given by `order`. */
  async function trace(order: number[]): Promise<string[]> {
    const { reg, bus } = await fresh()
    const seen: string[] = []
    const defs = [
      declares('company.failed'),
      mod('b.x', { handles: [handler('company.failed', () => seen.push('b.x'))] }),
      mod('a.x', { handles: [handler('company.failed', () => seen.push('a.x'))] }),
      mod('a.all', { handles: [handler('*', (_g, f) => seen.push(`a.all:${f.k}`))] }),
    ]
    for (const i of order) reg.registerModule(defs[i]!)
    expect(bus.emit(life(), fact('company.failed'))).toBe(true)
    return seen
  }

  it('delivers the exact-kind handlers by module id, then the star handlers', async () => {
    expect(await trace([0, 1, 2, 3])).toEqual(['a.x', 'b.x', 'a.all:company.failed'])
  })

  it('gives the same trace whatever order the modules were registered in', async () => {
    const want = ['a.x', 'b.x', 'a.all:company.failed']
    expect(await trace([3, 2, 1, 0])).toEqual(want)
    expect(await trace([1, 3, 0, 2])).toEqual(want)
  })

  it('delivers a kind with no exact handler to the star handlers only', async () => {
    const { reg, bus } = await fresh()
    const seen: string[] = []
    reg.registerModule(declares('quiet.kind'))
    reg.registerModule(mod('all.one', { handles: [handler('*', (_g, f) => seen.push(f.k))] }))
    bus.emit(life(), fact('quiet.kind'))
    expect(seen).toEqual(['quiet.kind'])
  })

  it('hands every handler the normalized fact, one fresh frozen object, not the caller\'s', async () => {
    const { reg, bus } = await fresh()
    const got: Fact[] = []
    reg.registerModule(declares('company.failed'))
    reg.registerModule(mod('a.x', { handles: [handler('company.failed', (_g, f) => got.push(f))] }))
    reg.registerModule(mod('b.x', { handles: [handler('company.failed', (_g, f) => got.push(f))] }))
    const sent = { k: 'company.failed', y: 2026, c: '  company:7  ', v: 1.23456, s: 250, junk: true } as Fact
    bus.emit(life(), sent)
    expect(got).toHaveLength(2)
    expect(got[0]).toEqual({ k: 'company.failed', y: 2026, c: 'company:7', v: 1.235, s: 100 })
    expect(got[1]).toBe(got[0])
    expect(got[0]).not.toBe(sent)
    expect(sent.c).toBe('  company:7  ')
    expect(Object.isFrozen(got[0])).toBe(true)
  })

  it('stops a handler from changing the fact the next handler hears', async () => {
    const { reg, bus } = await fresh()
    reg.registerModule(declares('company.failed'))
    reg.registerModule(mod('a.x', { handles: [handler('company.failed', (_g, f) => void ((f as { v?: number }).v = 99))] }))
    expect(() => bus.emit(life(), fact('company.failed', 2026, { v: 1 }))).toThrow(TypeError)
  })
})

describe('bus: synchronous', () => {
  it('shows a handler write on the line after emit', async () => {
    const { reg, bus } = await fresh()
    reg.registerModule(declares('company.failed'))
    reg.registerModule(mod('a.x', { handles: [handler('company.failed', (g, f) => void (g.flags.textMem = { last: f.k }))] }))
    const g = life()
    expect(g.flags.textMem).toBeUndefined()
    bus.emit(g, fact('company.failed'))
    expect(g.flags.textMem).toEqual({ last: 'company.failed' })
  })

  it('returns true for a declared kind that nobody hears', async () => {
    const { reg, bus } = await fresh()
    reg.registerModule(declares('company.failed'))
    expect(bus.emit(life(), fact('company.failed'))).toBe(true)
    expect(bus.busStats()).toEqual({ emitted: 1, dropped: 0, delivered: 0, truncated: 0 })
  })
})

describe('bus: cascade', () => {
  it('delivers a fact a handler emits after every handler of the current fact, first in first out', async () => {
    const { reg, bus } = await fresh()
    const seen: string[] = []
    const g = life()
    const said: boolean[] = []
    reg.registerModule(declares('a.first', 'b.second', 'b.third'))
    reg.registerModule(
      mod('m.a', {
        handles: [
          handler('a.first', () => {
            seen.push('m.a:a.first')
            said.push(bus.emit(g, fact('b.second')))
          }),
        ],
      }),
    )
    reg.registerModule(mod('m.z', { handles: [handler('a.first', () => seen.push('m.z:a.first'))] }))
    reg.registerModule(
      mod('m.b', {
        handles: [
          handler('b.second', () => {
            seen.push('m.b:b.second')
            said.push(bus.emit(g, fact('b.third')))
          }),
        ],
      }),
    )
    reg.registerModule(mod('m.c', { handles: [handler('b.third', () => seen.push('m.c:b.third'))] }))
    reg.registerModule(mod('m.star', { handles: [handler('*', (_g, f) => seen.push(`m.star:${f.k}`))] }))
    expect(bus.emit(g, fact('a.first'))).toBe(true)
    expect(seen).toEqual([
      'm.a:a.first',
      'm.z:a.first',
      'm.star:a.first',
      'm.b:b.second',
      'm.star:b.second',
      'm.c:b.third',
      'm.star:b.third',
    ])
    expect(said).toEqual([true, true])
    expect(bus.busStats()).toEqual({ emitted: 3, dropped: 0, delivered: 7, truncated: 0 })
  })

  /** A handler that emits `loop.again` again until it has run `runs - 1` times; returns how often it ran. */
  async function loop(wanted: number): Promise<{ ran: number; stats: ReturnType<Bus['busStats']>; again: boolean }> {
    const { reg, bus } = await fresh()
    const g = life()
    let ran = 0
    reg.registerModule(declares('loop.again', 'other.kind'))
    reg.registerModule(
      mod('m.loop', {
        handles: [
          handler('loop.again', () => {
            ran++
            if (ran < wanted) bus.emit(g, fact('loop.again'))
          }),
        ],
      }),
    )
    const again = bus.emit(g, fact('loop.again'))
    // The bus is usable at once: nothing is left queued from the cut cascade.
    const seen: string[] = []
    reg.registerModule(mod('m.other', { handles: [handler('other.kind', () => seen.push('other'))] }))
    expect(bus.emit(g, fact('other.kind'))).toBe(true)
    expect(seen).toEqual(['other'])
    return { ran, stats: bus.busStats(), again }
  }

  it('stops a handler that re-emits itself at 64 deliveries, counts one truncation and returns normally', async () => {
    const r = await loop(1_000_000)
    expect(r.ran).toBe(64)
    expect(r.again).toBe(true)
    expect(r.stats.truncated).toBe(1)
    // 64 runs of the loop handler and the one run of the check afterwards; the first fact, 64 re-emits (the last one cut) and the check.
    expect(r.stats.delivered).toBe(64 + 1)
    expect(r.stats.emitted).toBe(1 + 64 + 1)
  })

  it('does not cut a cascade of exactly 64 deliveries', async () => {
    const r = await loop(64)
    expect(r.ran).toBe(64)
    expect(r.stats.truncated).toBe(0)
  })

  it('cuts a cascade that would need a 65th delivery', async () => {
    const r = await loop(65)
    expect(r.ran).toBe(64)
    expect(r.stats.truncated).toBe(1)
  })

  it('keeps at most 64 facts waiting: a handler that emits 100 at once loses the rest and says so', async () => {
    const { reg, bus } = await fresh()
    const g = life()
    const answers: boolean[] = []
    reg.registerModule(declares('burst.start', 'burst.one'))
    reg.registerModule(
      mod('m.burst', {
        handles: [
          handler('burst.start', () => {
            for (let i = 0; i < 100; i++) answers.push(bus.emit(g, fact('burst.one')))
          }),
        ],
      }),
    )
    expect(bus.emit(g, fact('burst.start'))).toBe(true)
    expect(answers.filter(Boolean)).toHaveLength(64)
    expect(answers.slice(0, 64).every(Boolean)).toBe(true)
    expect(answers.slice(64).some(Boolean)).toBe(false)
    expect(bus.busStats()).toEqual({ emitted: 1 + 64, dropped: 36, delivered: 1, truncated: 1 })
    // The next top-level emit starts from nothing.
    bus.resetBusStats()
    expect(bus.emit(g, fact('burst.one'))).toBe(true)
    expect(bus.busStats().truncated).toBe(0)
  })

  it('counts the deliveries of one top-level emit, not of all of them', async () => {
    const { reg, bus } = await fresh()
    let ran = 0
    reg.registerModule(declares('plain.fact'))
    reg.registerModule(mod('m.count', { handles: [handler('plain.fact', () => ran++)] }))
    const g = life()
    for (let i = 0; i < 200; i++) bus.emit(g, fact('plain.fact'))
    expect(ran).toBe(200)
    expect(bus.busStats()).toEqual({ emitted: 200, dropped: 0, delivered: 200, truncated: 0 })
  })
})

describe('bus: dropped facts', () => {
  it('drops an undeclared kind, a fractional year and a non-object, and counts each', async () => {
    const { reg, bus } = await fresh()
    reg.registerModule(declares('company.failed'))
    const g = life()
    expect(bus.emit(g, fact('nobody.declared'))).toBe(false)
    expect(bus.busStats()).toEqual({ emitted: 0, dropped: 1, delivered: 0, truncated: 0 })
    expect(bus.emit(g, fact('company.failed', 1.5))).toBe(false)
    expect(bus.emit(g, 'company.failed' as unknown as Fact)).toBe(false)
    expect(bus.emit(g, null as unknown as Fact)).toBe(false)
    expect(bus.emit(g, { k: 'Company.Failed', y: 2026 })).toBe(false)
    expect(bus.busStats()).toEqual({ emitted: 0, dropped: 5, delivered: 0, truncated: 0 })
    expect(bus.emit(g, fact('company.failed'))).toBe(true)
    expect(bus.busStats()).toEqual({ emitted: 1, dropped: 5, delivered: 0, truncated: 0 })
  })

  it('zeroes every counter on resetBusStats', async () => {
    const { reg, bus } = await fresh()
    reg.registerModule(declares('company.failed'))
    reg.registerModule(mod('a.x', { handles: [handler('company.failed', () => undefined)] }))
    bus.emit(life(), fact('company.failed'))
    bus.emit(life(), fact('nobody.declared'))
    expect(bus.busStats()).toEqual({ emitted: 1, dropped: 1, delivered: 1, truncated: 0 })
    bus.resetBusStats()
    expect(bus.busStats()).toEqual({ emitted: 0, dropped: 0, delivered: 0, truncated: 0 })
  })

  it('returns a copy of the counters, so a caller cannot change them', async () => {
    const { bus } = await fresh()
    const s = bus.busStats()
    s.emitted = 99
    expect(bus.busStats().emitted).toBe(0)
  })

  it('drops everything when no module is registered', async () => {
    const { bus } = await fresh()
    expect(bus.emit(life(), fact('company.failed'))).toBe(false)
    expect(bus.busStats().dropped).toBe(1)
  })
})

describe('bus: a handler that throws', () => {
  it('propagates the error and leaves the bus working for the next emit', async () => {
    const { reg, bus } = await fresh()
    const seen: string[] = []
    reg.registerModule(declares('company.failed', 'other.kind'))
    reg.registerModule(
      mod('a.boom', {
        handles: [
          handler('company.failed', () => {
            throw new Error('boom')
          }),
        ],
      }),
    )
    reg.registerModule(mod('b.after', { handles: [handler('company.failed', () => seen.push('b.after')), handler('other.kind', () => seen.push('other'))] }))
    const g = life()
    expect(() => bus.emit(g, fact('company.failed'))).toThrow('boom')
    expect(seen).toEqual([])
    expect(bus.emit(g, fact('other.kind'))).toBe(true)
    expect(seen).toEqual(['other'])
  })

  it('forgets the facts that were waiting when a handler threw', async () => {
    const { reg, bus } = await fresh()
    const seen: string[] = []
    const g = life()
    reg.registerModule(declares('a.first', 'b.second', 'c.third'))
    reg.registerModule(
      mod('m.a', {
        handles: [
          handler('a.first', () => {
            bus.emit(g, fact('b.second'))
            throw new Error('boom')
          }),
        ],
      }),
    )
    reg.registerModule(mod('m.b', { handles: [handler('b.second', () => seen.push('b.second')), handler('c.third', () => seen.push('c.third'))] }))
    expect(() => bus.emit(g, fact('a.first'))).toThrow('boom')
    bus.emit(g, fact('c.third'))
    expect(seen).toEqual(['c.third'])
  })
})

describe('bus: determinism and purity', () => {
  it('leaves g.rng and the rest of the state alone over 1,000 emits, and gives the same trace twice', async () => {
    const runs: string[][] = []
    for (let pass = 0; pass < 2; pass++) {
      const { reg, bus } = await fresh()
      const seen: string[] = []
      reg.registerModule(declares('company.failed', 'layoff.round'))
      reg.registerModule(mod('b.x', { handles: [handler('company.failed', (_g, f) => seen.push(`b:${f.y}`))] }))
      reg.registerModule(mod('a.x', { handles: [handler('company.failed', (_g, f) => seen.push(`a:${f.y}`))] }))
      reg.registerModule(mod('a.all', { handles: [handler('*', (_g, f) => seen.push(f.k))] }))
      const g = life()
      const before = JSON.stringify(g)
      const rng = g.rng
      for (let i = 0; i < 1000; i++) bus.emit(g, fact(i % 3 === 0 ? 'layoff.round' : 'company.failed', 1900 + (i % 120)))
      expect(g.rng).toBe(rng)
      expect(JSON.stringify(g)).toBe(before)
      expect(seen).toHaveLength(1000 + 666 * 2)
      runs.push(seen)
    }
    expect(runs[1]).toEqual(runs[0])
  })

  it('lets a handler that only reads run on a deep-frozen state', async () => {
    const { reg, bus } = await fresh()
    const seen: number[] = []
    reg.registerModule(declares('company.failed'))
    reg.registerModule(mod('a.x', { handles: [handler('company.failed', (g) => seen.push(g.character.stats.health))] }))
    const g = deepFreeze(life())
    expect(bus.emit(g, fact('company.failed'))).toBe(true)
    expect(seen).toEqual([90])
  })

  it('throws a TypeError where a handler writes a deep-frozen state, which is how a menu that emits fails the fuzz walk', async () => {
    const { reg, bus } = await fresh()
    reg.registerModule(declares('company.failed', 'other.kind'))
    reg.registerModule(
      mod('a.x', {
        handles: [
          handler('company.failed', (g) => {
            g.flags.textMem = {}
          }),
        ],
      }),
    )
    reg.registerModule(mod('b.x', { handles: [handler('other.kind', () => undefined)] }))
    const g = deepFreeze(life())
    expect(() => bus.emit(g, fact('company.failed'))).toThrow(TypeError)
    // The failed delivery did not wedge the bus.
    expect(bus.emit(g, fact('other.kind'))).toBe(true)
  })
})

describe('bus: the guard', () => {
  it('calls the guard before a handler and what it returns after it, with the module, the slice and the kind', async () => {
    const { reg, bus } = await fresh()
    const trace: string[] = []
    reg.registerModule(declares('company.failed'))
    reg.registerModule(mod('b.x', { handles: [handler('company.failed', () => trace.push('run b.x'), 'flags.bx')] }))
    reg.registerModule(mod('a.x', { handles: [handler('company.failed', () => trace.push('run a.x'), 'flags.ax')] }))
    reg.registerModule(mod('a.all', { handles: [handler('*', () => trace.push('run a.all'), 'flags.all')] }))
    const g = life()
    const guard: BusGuard = (info, state) => {
      expect(state).toBe(g)
      trace.push(`before ${info.moduleId} ${info.slice} ${info.kind}`)
      return () => trace.push(`after ${info.moduleId}`)
    }
    bus.setBusGuard(guard)
    bus.emit(g, fact('company.failed'))
    expect(trace).toEqual([
      'before a.x flags.ax company.failed',
      'run a.x',
      'after a.x',
      'before b.x flags.bx company.failed',
      'run b.x',
      'after b.x',
      'before a.all flags.all company.failed',
      'run a.all',
      'after a.all',
    ])
    trace.length = 0
    bus.setBusGuard(null)
    bus.emit(g, fact('company.failed'))
    expect(trace).toEqual(['run a.x', 'run b.x', 'run a.all'])
  })

  it('does not run the after-function of a handler that threw', async () => {
    const { reg, bus } = await fresh()
    const trace: string[] = []
    reg.registerModule(declares('company.failed'))
    reg.registerModule(
      mod('a.x', {
        handles: [
          handler('company.failed', () => {
            throw new Error('boom')
          }),
        ],
      }),
    )
    bus.setBusGuard(() => {
      trace.push('before')
      return () => trace.push('after')
    })
    expect(() => bus.emit(life(), fact('company.failed'))).toThrow('boom')
    expect(trace).toEqual(['before'])
  })

  it('passes a handler that writes only the slice it declares', async () => {
    const { reg, bus } = await fresh()
    reg.registerModule(declares('company.failed'))
    reg.registerModule(mod('a.good', { handles: [handler('company.failed', (g) => void (g.flags.textMem = { seen: 'yes' }), 'flags.textMem')] }))
    const g = life()
    bus.setBusGuard(ownSliceGuard())
    expect(bus.emit(g, fact('company.failed'))).toBe(true)
    expect(g.flags.textMem).toEqual({ seen: 'yes' })
  })

  it('throws, naming the module, the slice and the top-level key, when a handler also writes outside its slice', async () => {
    const { reg, bus } = await fresh()
    reg.registerModule(declares('company.failed'))
    reg.registerModule(
      mod('a.bad', {
        handles: [
          handler(
            'company.failed',
            (g) => {
              g.flags.textMem = { seen: 'yes' }
              g.character.money += 1
            },
            'flags.textMem',
          ),
        ],
      }),
    )
    bus.setBusGuard(ownSliceGuard())
    let message = ''
    try {
      bus.emit(life(), fact('company.failed'))
    } catch (e) {
      message = (e as Error).message
    }
    expect(message).toContain('a.bad')
    expect(message).toContain('flags.textMem')
    expect(message).toContain('character')
    expect(message).not.toContain('flags changed')
  })

  it('catches a handler that draws g.rng, adds a top-level key or removes one', async () => {
    const { reg, bus } = await fresh()
    reg.registerModule(declares('draw.it', 'add.it', 'drop.it'))
    reg.registerModule(mod('m.draw', { handles: [handler('draw.it', (g) => void (g.rng = (g.rng + 1) | 0))] }))
    reg.registerModule(mod('m.add', { handles: [handler('add.it', (g) => void ((g as unknown as Record<string, unknown>).extra = 1))] }))
    reg.registerModule(mod('m.drop', { handles: [handler('drop.it', (g) => void delete (g as unknown as Record<string, unknown>).obituary)] }))
    bus.setBusGuard(ownSliceGuard())
    expect(() => bus.emit(life(), fact('draw.it'))).toThrow(/m\.draw.*rng/)
    expect(() => bus.emit(life(), fact('add.it'))).toThrow(/m\.add.*extra/)
    expect(() => bus.emit(life(), fact('drop.it'))).toThrow(/m\.drop.*obituary/)
  })

  it('does not blame a handler for creating the parent of its own slice', async () => {
    const { reg, bus } = await fresh()
    reg.registerModule(declares('company.failed', 'other.kind'))
    const own = (g: GameState): void => {
      const w = ((g as unknown as { world?: Record<string, unknown> }).world ??= {})
      w.facts = [1, 2, 3]
    }
    reg.registerModule(mod('a.world', { handles: [handler('company.failed', own, 'world.facts')] }))
    reg.registerModule(
      mod('b.world', {
        handles: [
          handler(
            'other.kind',
            (g) => {
              const w = ((g as unknown as { world?: Record<string, unknown> }).world ??= {})
              w.ledger = {}
            },
            'world.facts',
          ),
        ],
      }),
    )
    bus.setBusGuard(ownSliceGuard())
    const g = life()
    expect(bus.emit(g, fact('company.failed'))).toBe(true)
    expect((g as unknown as { world: { facts: number[] } }).world.facts).toEqual([1, 2, 3])
    // A sibling of the slice is not the slice.
    expect(() => bus.emit(g, fact('other.kind'))).toThrow(/b\.world.*world/)
  })

  it('does not read a slice that is not there, and does not change the state it checks', async () => {
    const { reg, bus } = await fresh()
    reg.registerModule(declares('company.failed'))
    reg.registerModule(mod('a.x', { handles: [handler('company.failed', () => undefined, 'world.facts')] }))
    const g = deepFreeze(life())
    const before = JSON.stringify(g)
    bus.setBusGuard(ownSliceGuard())
    expect(bus.emit(g, fact('company.failed'))).toBe(true)
    expect(JSON.stringify(g)).toBe(before)
  })

  it('withGuard sets the guard for the call, takes it off after, and takes it off after a throw (the bus it is given)', async () => {
    const { reg, bus } = await fresh()
    reg.registerModule(declares('company.failed'))
    reg.registerModule(mod('a.bad', { handles: [handler('company.failed', (g) => void (g.character.money += 1), 'flags.textMem')] }))
    const g = life()
    expect(() => withGuard(() => bus.emit(g, fact('company.failed')), bus)).toThrow(/a\.bad.*character/)
    // The guard is off again: the same handler is no longer held to its slice.
    expect(bus.emit(g, fact('company.failed'))).toBe(true)
    expect(withGuard(() => 'value', bus)).toBe('value')
  })

  it('withGuard uses the bus of this file by default', () => {
    // This group registers into the registry this file was loaded with. The ids are its own.
    registerHere({ id: 'zz.guarded.facts', layer: 3, facts: ['zz.guarded'] })
    registerHere({
      id: 'zz.guarded.bad',
      layer: 3,
      handles: [{ kind: 'zz.guarded', slice: 'flags.textMem', run: (g) => void (g.character.money += 1) }],
    })
    const g = life()
    expect(() => withGuard(() => emitHere(g, fact('zz.guarded')))).toThrow(/zz\.guarded\.bad.*character/)
    // Back to no guard, so the same emit passes.
    expect(emitHere(g, fact('zz.guarded'))).toBe(true)
    setGuardHere(null)
  })
})

describe('kernel kit: loadModules', () => {
  it('imports src/game/modules once per registry and registers MODULES into that registry', async () => {
    vi.resetModules()
    const reg = await import('../src/game/kernel/registry')
    const first = await loadModules()
    const second = await loadModules()
    expect(second).toBe(first)
    expect(reg.moduleIds()).toEqual(first.MODULES.map((m) => m.id).sort())
    // A new registry epoch gets a new import (and so its own registrations).
    vi.resetModules()
    const reg2 = await import('../src/game/kernel/registry')
    const third = await loadModules()
    expect(third).not.toBe(first)
    expect(reg2.moduleIds()).toEqual(third.MODULES.map((m) => m.id).sort())
  })
})

describe('bus: what game code may touch', () => {
  it('has no reader of busStats and no setter of the guard outside the bus', () => {
    const readers: string[] = []
    for (const s of loadSources()) {
      if (s.path === 'src/game/kernel/bus.ts') continue
      const hit = s.toks.find((t) => isId(t, 'busStats') || isId(t, 'resetBusStats') || isId(t, 'setBusGuard'))
      if (hit) readers.push(`${s.path}: ${hit.v}`)
    }
    // busStats is for tests: a decision that reads it would make a play depend on how often a test emitted. A guard clones the
    // whole state on every delivery, so production never sets one.
    expect(readers).toEqual([])
  })
})
