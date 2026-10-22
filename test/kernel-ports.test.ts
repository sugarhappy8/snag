// ci: fast
// R2-K1 (K.2a, the contract half of rule c): ports. A port is a function that starts out running its fallback and is bound once
// by the module that owns the feature. A module below it calls the port instead of importing the owner, which is what lets the
// import cuts of R2-K5 and R2-K6 break a cycle. Until the owner is imported the port runs the fallback, so a missing provider
// reads as "the feature is absent" and never crashes a year step. portStatus() is what test/hub-entry.test.ts reads to prove
// that every port is bound after a real entry.
//
// Each case takes a fresh copy of the module (vi.resetModules, then a dynamic import), so no port leaks between cases.
import { describe, expect, it, vi } from 'vitest'

type Ports = typeof import('../src/game/kernel/ports')

async function fresh(): Promise<Ports> {
  vi.resetModules()
  return import('../src/game/kernel/ports')
}

describe('ports', () => {
  it('runs the fallback while nothing is bound', async () => {
    const { definePort } = await fresh()
    const add = definePort('math.add', (a: number, b: number) => a + b)
    expect(add(2, 3)).toBe(5)
    expect(add.bound).toBe(false)
    expect(add.portName).toBe('math.add')
  })

  it('runs the bound function after use, with the same arguments and result', async () => {
    const { definePort } = await fresh()
    const calls: number[][] = []
    const scale = definePort('math.scale', (x: number, k: number) => x * k)
    scale.use((x, k) => {
      calls.push([x, k])
      return x * k * 10
    })
    expect(scale(2, 3)).toBe(60)
    expect(calls).toEqual([[2, 3]])
    expect(scale.bound).toBe(true)
  })

  it('takes the same function twice and refuses a different one', async () => {
    const { definePort } = await fresh()
    const port = definePort('feature.run', (): string => 'fallback')
    const impl = (): string => 'impl'
    port.use(impl)
    port.use(impl)
    expect(port()).toBe('impl')
    expect(() => port.use((): string => 'other')).toThrow('port feature.run is already bound')
    expect(port()).toBe('impl')
  })

  it('refuses something that is not a function, and leaves the port unbound', async () => {
    const { definePort } = await fresh()
    const port = definePort('feature.run', (): number => 1)
    expect(() => port.use(5 as unknown as () => number)).toThrow(/function/)
    expect(port.bound).toBe(false)
    expect(port()).toBe(1)
  })

  it('lists the ports sorted by name with their bound state', async () => {
    const { definePort, portStatus } = await fresh()
    expect(portStatus()).toEqual([])
    const b = definePort('b.second', () => 0)
    definePort('a.first', () => 0)
    definePort('b.alpha', () => 0)
    expect(portStatus()).toEqual([
      { name: 'a.first', bound: false },
      { name: 'b.alpha', bound: false },
      { name: 'b.second', bound: false },
    ])
    b.use(() => 1)
    expect(portStatus().map((p) => p.bound)).toEqual([false, false, true])
  })

  it('does not hand out a status that changes behind the caller', async () => {
    const { definePort, portStatus } = await fresh()
    const p = definePort('x.y', () => 0)
    const before = portStatus()
    p.use(() => 1)
    expect(before).toEqual([{ name: 'x.y', bound: false }])
    expect(portStatus()).toEqual([{ name: 'x.y', bound: true }])
  })

  it('throws on a second definePort with the same name, and on a bad name', async () => {
    const { definePort, portStatus } = await fresh()
    definePort('same.name', () => 0)
    expect(() => definePort('same.name', () => 1)).toThrow(/already defined/)
    for (const name of ['', 'A', '1a', 'a b', 'a..b', 'a.', '.a', 'a-b']) expect(() => definePort(name, () => 0), JSON.stringify(name)).toThrow(/bad name/)
    expect(portStatus()).toEqual([{ name: 'same.name', bound: false }])
  })

  it('accepts a dotted camel case name', async () => {
    const { definePort } = await fresh()
    expect(definePort('business.revalueCompany', () => 0).portName).toBe('business.revalueCompany')
  })

  it('has nothing bound in a fresh import, so a port is bound by importing its owner and nothing else', async () => {
    const first = await fresh()
    first.definePort('x.y', () => 0).use(() => 1)
    expect(first.portStatus()).toEqual([{ name: 'x.y', bound: true }])
    const second = await fresh()
    expect(second.portStatus()).toEqual([])
  })

  it('keeps `this` out of it: a port called as a method of another object still runs the fallback or the binding', async () => {
    const { definePort } = await fresh()
    const port = definePort('x.y', (n: number) => n + 1)
    const holder = { port }
    expect(holder.port(1)).toBe(2)
    port.use((n) => n + 100)
    expect(holder.port(1)).toBe(101)
  })

  it('passes a thrown error from the bound function through', async () => {
    const { definePort } = await fresh()
    const port = definePort('x.y', () => 0)
    port.use(() => {
      throw new Error('boom')
    })
    expect(() => port()).toThrow('boom')
  })
})
