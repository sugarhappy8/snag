// R1-C1: the Charts track's shared test helpers (test/charts-kit.ts) do what the later tasks rely on. Small and quick.
import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { findBusiness } from '../src/game/business/state'
import { yearlyBusinessImpl } from '../src/game/business/yearly'
import { INDUSTRY_IDS } from '../src/game/data/markets'
import { countSvgNodes, deepFreeze, jsonNodes, ownerGame, renderHtml, statementSamples } from './charts-kit'

describe('jsonNodes', () => {
  it('counts the root and every array, object and primitive under it', () => {
    expect(jsonNodes(1)).toBe(1)
    expect(jsonNodes(null)).toBe(1)
    expect(jsonNodes([])).toBe(1)
    expect(jsonNodes({})).toBe(1)
    // root, the array, 1, 2, 'x', null
    expect(jsonNodes({ a: [1, 2], b: 'x', c: null })).toBe(6)
    // root, 24 values
    expect(jsonNodes(Array.from({ length: 24 }, () => 0))).toBe(25)
  })
})

describe('countSvgNodes and renderHtml', () => {
  it('counts only drawing elements inside an svg', () => {
    const html = '<svg viewBox="0 0 1 1"><g><rect/><text>a</text><linearGradient/><textPath/></g><path d="M0 0"/></svg><rect/><svg><use/><tspan/></svg>'
    expect(countSvgNodes(html)).toBe(6)
    expect(countSvgNodes('<div><rect/></div>')).toBe(0)
    expect(countSvgNodes('')).toBe(0)
  })

  it('renders an element to static markup', () => {
    expect(renderHtml(createElement('p', null, 'hi'))).toBe('<p>hi</p>')
    const svg = renderHtml(createElement('svg', null, createElement('rect'), createElement('circle'), createElement('circle')))
    expect(countSvgNodes(svg)).toBe(3)
  })
})

describe('deepFreeze', () => {
  it('is the fuzz kit freeze, re-exported', () => {
    const v = deepFreeze({ a: { b: [1, { c: 2 }] } })
    expect(Object.isFrozen(v.a.b[1])).toBe(true)
  })
})

describe('statementSamples', () => {
  it('gives one statement for each of the 56 industries, for each seed: 168 for three', () => {
    expect(INDUSTRY_IDS.length).toBe(56)
    const samples = statementSamples([1, 2, 3])
    expect(samples.length).toBe(168)
    expect(new Set(samples.map((x) => `${x.seed}:${x.industry}`)).size).toBe(168)
    for (const x of samples) {
      expect(findBusiness(x.g, x.a.id), x.industry).toBe(x.a)
      expect(x.b.ceo, x.industry).toBe('manager')
      expect(x.s.year, x.industry).toBe(x.g.year - 1)
      expect(x.s, x.industry).not.toBe(x.b.last)
      expect(x.s, x.industry).toEqual(x.b.last)
    }
  })

  it('leaves room for a second consecutive statement without changing the first', () => {
    const samples = statementSamples([1])
    const g = samples[0]!.g
    const firsts = samples.map((x) => JSON.stringify(x.s))
    g.queue = []
    g.year += 1
    yearlyBusinessImpl(g)
    samples.forEach((x, i) => {
      expect(x.b.last?.year, x.industry).toBe(x.s.year + 1)
      expect(JSON.stringify(x.s), x.industry).toBe(firsts[i])
    })
  })
})

describe('ownerGame', () => {
  it('is a live owner-CEO with six years of books and the Annual Report waiting', () => {
    const { g, a, b, others } = ownerGame()
    expect(g.character.alive).toBe(true)
    expect(findBusiness(g, a.id)).toBe(a)
    expect(b.ceo).toBe('owner')
    expect(b.history.length).toBe(6)
    expect(others).toEqual([])
    const report = g.queue.find((m) => m.kind === 'minigame' && m.game === 'annualReport')
    expect(report).toBeDefined()
    expect(jsonNodes(g)).toBeLessThan(500_000)
  })

  it('takes the industry, the years and the number of companies', () => {
    const { g, b, others } = ownerGame({ seed: 3, industry: 'bakery', years: 3, companies: 3 })
    expect(b.industry).toBe('bakery')
    expect(b.history.length).toBe(3)
    expect(others.length).toBe(2)
    for (const o of others) expect(findBusiness(g, o.id)).toBe(o)
    expect(new Set([b.industry, ...others.map((o) => (o.details as { industry: string }).industry)]).size).toBe(3)
  })
})
