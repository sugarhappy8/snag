// ci: fast
// R4-E5 (D.3): scripts/codemod-addrel.mjs, the script that gave every relationship call a game argument. Every open branch re-runs it
// after R4-E5 merges, so what it does and what it refuses to do are pinned here: where it finds `g`, that a second run changes nothing,
// that it never touches a call that is already new, and that the tree it made has nothing left for it to do.
import { describe, expect, it } from 'vitest'
import { rewrite, run } from '../scripts/codemod-addrel.mjs'
import { ROOT } from './scan-kit'

const FILE = 'src/game/fake.ts'
const go = (code: string, path = FILE): ReturnType<typeof rewrite> => rewrite(path, code)

describe('codemod-addrel: where it finds the game', () => {
  it('uses the parameter typed GameState, whatever it is called', () => {
    expect(go('export function f(n: GameState, p: Person) {\n  addRelationship(p, 3)\n}\n').text).toBe('export function f(n: GameState, p: Person) {\n  addRelationship(n, p, 3)\n}\n')
    expect(go('const f = (state: Readonly<GameState>, p: Person): void => addRelationship(p, d)\n').text).toContain('addRelationship(state, p, d)')
  })

  it('walks out of a callback to the function that has the game', () => {
    const code = 'function f(g: GameState) {\n  g.people.forEach((p) => { if (p.alive) addRelationship(p, -2) })\n  for (const q of xs) bumpRelationship(q, 1)\n}\n'
    const out = go(code).text
    expect(out).toContain('addRelationship(g, p, -2)')
    expect(out).toContain('bumpRelationship(g, q, 1)')
  })

  it('takes an untyped `g` of a callback whose type comes from its context', () => {
    const code = 'defineScript({ run: (g, answer) => { addRelationship(partner, 5) } })\n'
    expect(go(code).text).toContain('addRelationship(g, partner, 5)')
    expect(go('const f = g => addRelationship(p, 1)\n').text).toContain('addRelationship(g, p, 1)')
  })

  it('takes a `g` the closer callback re-declares without a type (it is the live game under the same name)', () => {
    const code = 'function lend(g: GameState, p: Person) {\n  return act({ run: (g, q, input) => { addRelationship(q, 1) } })\n}\n'
    expect(go(code).text).toContain('addRelationship(g, q, 1)')
  })

  it('takes a `const g` or a destructured `g` of an enclosing block', () => {
    expect(go("it('x', () => {\n  const g = makeTestGame()\n  addRelationship(p, 1)\n})\n", 'test/x.test.ts').text).toContain('addRelationship(g, p, 1)')
    expect(go('function h(c: Ctx) {\n  const { g } = c\n  addRelationship(p, 1)\n}\n').text).toContain('addRelationship(g, p, 1)')
  })

  it('is not fooled by a call followed by a colon (a ternary) or by a block', () => {
    const code = 'function f(g: GameState) {\n  const p = xs.length ? pick(g, xs) : undefined\n  if (p) {\n    addRelationship(p, 1)\n  }\n}\n'
    expect(go(code).text).toContain('addRelationship(g, p, 1)')
  })
})

describe('codemod-addrel: what it leaves alone', () => {
  it('a call that already has its game argument, and the four-argument bumpRelationship', () => {
    const code = 'function f(g: GameState) {\n  addRelationship(g, p, 3)\n  addRelationship(g, p, 3, "decay")\n  bumpRelationship(g, p, 1, 4)\n}\n'
    const r = go(code)
    expect(r.changed).toBe(false)
    expect(r.text).toBe(code)
    expect(r.sites.map((s) => s.action)).toEqual(['keep', 'keep', 'keep'])
  })

  it('a definition, an import, a method of something else, a string, a template and a comment', () => {
    const code = [
      "import { addRelationship, bumpRelationship } from './core'",
      'export function addRelationship(p: Person, delta: number): void {}',
      'function bumpRelationship(p: Person, delta: number) {}',
      'function f(g: GameState) {',
      '  other.addRelationship(p, 1)',
      '  const s = "addRelationship(p, 1)" + `bumpRelationship(p, 1)`',
      '  // addRelationship(p, 1)',
      '}',
      '',
    ].join('\n')
    const r = go(code)
    expect(r.changed).toBe(false)
    expect(r.sites).toEqual([])
  })

  it('is idempotent: the rewritten text rewrites to itself', () => {
    const once = go('function f(g: GameState) {\n  addRelationship(p, 3)\n  addRelationship(\n    q,\n    4,\n  )\n}\n')
    expect(once.changed).toBe(true)
    const twice = go(once.text)
    expect(twice.changed).toBe(false)
    expect(twice.text).toBe(once.text)
  })

  it('changes only the inserted text: every other character of the file stays', () => {
    const code = 'function f(g: GameState) {\n  addRelationship(p, a(b, c), /* why */)\n}\n'
    const out = go(code).text
    expect(out.replace('g, ', '')).toBe(code)
  })
})

describe('codemod-addrel: what it lists for a person to place', () => {
  const reasons = (code: string): (string | undefined)[] => go(code).sites.filter((s) => s.action === 'unplaced').map((s) => s.reason)

  it('a helper with no game and a call outside any function', () => {
    expect(reasons('function warm(p: Person) {\n  addRelationship(p, 1)\n}\n')).toEqual(['no game in scope'])
    expect(reasons('addRelationship(p, 1)\n')).toEqual(['outside any function'])
  })

  it('leaves a spread argument alone: its arity is for tsc to check', () => {
    const r = go('function f(g: GameState) {\n  addRelationship(...args)\n}\n')
    expect(r.changed).toBe(false)
    expect(r.sites.map((s) => s.action)).toEqual(['keep'])
  })

  it('a rest parameter or a tuple is not a game; a closer parameter with another type hides it', () => {
    expect(reasons('const f = (...a: [g: GameState, p: Person]) => addRelationship(a[1], 2)\n')).toEqual(['no game in scope'])
    expect(reasons('function f(g: GameState) {\n  xs.map((g: Group) => addRelationship(p, 1))\n}\n')).toEqual(['g is shadowed by a closer parameter'])
  })

  it('writes nothing at a site it cannot place, and still writes the others', () => {
    const r = go('function a(p: Person) {\n  addRelationship(p, 1)\n}\nfunction b(g: GameState) {\n  addRelationship(p, 2)\n}\n')
    expect(r.text).toContain('addRelationship(p, 1)')
    expect(r.text).toContain('addRelationship(g, p, 2)')
  })
})

describe('codemod-addrel: the tree it made', () => {
  it('has no call of the old shape left in src/ or test/, and nothing it cannot place', () => {
    const { sites } = run(ROOT)
    expect(sites.length).toBeGreaterThan(380)
    expect(sites.filter((s) => s.action !== 'keep').map((s) => `${s.file}:${s.line} ${s.action} ${s.reason ?? ''}`)).toEqual([])
  })
})
