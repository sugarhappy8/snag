// R1 review (notices): the digest card must open with its title and first rows in view. A digest of 5 to 8 rows is
// taller than a phone popup, and React's autoFocus calls focus() without preventScroll, so the card used to open
// scrolled down to its OK button and a player could dismiss rows they never saw. The OK button is now focused through a
// ref with preventScroll. There is no DOM in these tests: DigestCard is called as a function with useEffect stubbed,
// and the element tree it returns is walked for the button.
import { isValidElement, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { NoticeModal } from '../src/game/types'

// Minimal in-memory localStorage, installed before the store loads its settings (the way notice-digest.test.ts does).
vi.hoisted(() => {
  const data = new Map<string, string>()
  const ls = {
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() {
      return data.size
    },
  }
  Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true, writable: true })
})

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return { ...actual, useEffect: () => undefined }
})

const { DigestCard, focusWithoutScroll } = await import('../src/ui/components/ModalHost')

function N(id: string): NoticeModal {
  return { kind: 'notice', id, title: `Title ${id}`, text: `Text of ${id}.` }
}

type Props = Record<string, unknown>

/** Every element in a tree of React elements whose type is the given tag. */
function findAll(node: ReactNode, tag: string, out: Props[] = []): Props[] {
  if (Array.isArray(node)) {
    for (const child of node) findAll(child as ReactNode, tag, out)
  } else if (isValidElement(node)) {
    const props = node.props as Props
    if (node.type === tag) out.push(props)
    findAll(props.children as ReactNode, tag, out)
  }
  return out
}

describe('focusWithoutScroll', () => {
  it('focuses with preventScroll, so a tall card stays at its top', () => {
    const calls: unknown[][] = []
    focusWithoutScroll({ focus: (...args: unknown[]) => void calls.push(args) } as unknown as HTMLElement)
    expect(calls).toEqual([[{ preventScroll: true }]])
  })

  it('does nothing when the button is removed (a ref callback gets null)', () => {
    expect(() => focusWithoutScroll(null)).not.toThrow()
  })
})

describe('the digest OK button', () => {
  const card = (): ReactNode => DigestCard({ items: [N('a'), N('b'), N('c')] })

  it('is focused through focusWithoutScroll and not through autoFocus', () => {
    const buttons = findAll(card(), 'button')
    expect(buttons).toHaveLength(1)
    expect(buttons[0].ref).toBe(focusWithoutScroll)
    expect(buttons[0]).not.toHaveProperty('autoFocus')
    expect(buttons[0].children).toBe('OK')
  })

  it('uses one stable ref function, so a re-render does not pull focus back to OK', () => {
    const first = findAll(card(), 'button')[0].ref
    const second = findAll(card(), 'button')[0].ref
    expect(second).toBe(first)
  })
})
