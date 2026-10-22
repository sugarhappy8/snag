// Ports (R2, K.2a rule c): how one domain calls into another without importing it.
//
// An import that points the wrong way closes an import cycle. The cut is a port: the lower module defines it, next to the other
// ports of its domain, with a fallback that says what the world looks like when the feature is absent; the owner of the feature
// binds the real function once, when the owner is loaded; and every caller invokes the port. A caller never learns who owns it.
//
// Rules: a port binds once (the same function again is fine, a different one throws), an unbound port runs its fallback, and
// portStatus() lists every port with its state, which is what test/hub-entry.test.ts reads to prove that entering the game
// through a hub binds them all. This file imports nothing (L0).

/** A callable that runs the bound function, or the fallback until one is bound. */
export type Port<A extends unknown[], R> = ((...args: A) => R) & {
  /** Binds the implementation. Once: binding the same function again is fine, a different one throws. */
  use(fn: (...args: A) => R): void
  readonly portName: string
  readonly bound: boolean
}

const NAME = /^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9]+)*$/

/** Every port defined in this copy of the module, by name. A fresh import (a test with vi.resetModules) starts empty. */
const PORTS = new Map<string, { readonly bound: () => boolean }>()

/** Defines the port `name` (lower case first word, then dotted words) with the function to run while nothing is bound. A second definePort of one name throws. */
export function definePort<A extends unknown[], R>(name: string, fallback: (...args: A) => R): Port<A, R> {
  if (typeof name !== 'string' || !NAME.test(name)) throw new Error(`ports: bad name ${JSON.stringify(name)}`)
  if (PORTS.has(name)) throw new Error(`ports: ${name} is already defined`)
  let impl: ((...args: A) => R) | undefined
  const port = ((...args: A): R => (impl ?? fallback)(...args)) as Port<A, R>
  Object.defineProperties(port, {
    use: {
      value(fn: (...args: A) => R): void {
        if (typeof fn !== 'function') throw new TypeError(`port ${name} needs a function`)
        if (impl === undefined) impl = fn
        else if (impl !== fn) throw new Error(`port ${name} is already bound`)
      },
    },
    portName: { value: name },
    bound: { get: () => impl !== undefined },
  })
  PORTS.set(name, { bound: () => impl !== undefined })
  return port
}

/** Every port with whether it is bound, sorted by name. A new array each call. */
export function portStatus(): { name: string; bound: boolean }[] {
  return [...PORTS.keys()].sort().map((name) => ({ name, bound: PORTS.get(name)!.bound() }))
}
