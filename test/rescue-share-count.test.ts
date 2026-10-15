// The Share Count row under Capital & Ownership prints what one share is worth. A company worth
// about a dollar split into billions of shares used to print '$1.3e-10 each'.
import { describe, expect, it } from 'vitest'
import '../src/game/business'
import { businessAssetView } from '../src/game/business'
import { MAX_SHARES } from '../src/game/business/share-structure'
import type { GameState, MenuAction } from '../src/game/types'
import { findNode, founder, privateCompany } from './own-listing-kit'

function shareRow(g: GameState, assetId: string): MenuAction {
  const view = businessAssetView(g, g.assets.find((x) => x.id === assetId)!)
  const row = findNode(g, view, `rescue.${assetId}.shares`)
  if (!row || row.type !== 'action') throw new Error('no Share Count row')
  return row
}

function textOf(g: GameState, row: MenuAction): string {
  return typeof row.subtitle === 'function' ? row.subtitle(g) : (row.subtitle ?? '')
}

function previewOf(g: GameState, row: MenuAction, n: number): string {
  const preview = row.input?.kind === 'slider' ? row.input.preview : undefined
  if (!preview) throw new Error('no preview')
  return preview(g, n) ?? ''
}

describe('the Share Count row', () => {
  it('writes a tiny share price out in fixed digits, never in scientific notation', () => {
    const g = founder()
    const { a, b } = privateCompany(g)
    b.valuation = 1
    b.shareCount = MAX_SHARES
    const row = shareRow(g, a.id)
    const sub = textOf(g, row)
    expect(sub).toContain('10 billion shares')
    expect(sub).not.toMatch(/\d[eE][-+]?\d/)
    expect(sub).toContain('<$0.000001 each today')
    const preview = previewOf(g, row, MAX_SHARES)
    expect(preview).not.toMatch(/\d[eE][-+]?\d/)
    expect(preview).toContain('10 billion shares at <$0.000001 each')
  })

  it('writes the small prices a split can make in fixed digits too', () => {
    const g = founder()
    const { a, b } = privateCompany(g)
    b.valuation = 1_000
    b.shareCount = 2_000_000_000
    const row = shareRow(g, a.id)
    // $1,000 over two billion shares is $0.0000005: still under a millionth.
    expect(textOf(g, row)).toContain('<$0.000001 each')
    expect(previewOf(g, row, 500_000_000)).toContain('500 million shares at about $0.0000020 each')
    expect(previewOf(g, row, 1_000_000)).toContain('1 million shares at about $0.0010 each')
    expect(previewOf(g, row, 20_000)).toContain('20,000 shares at about $0.050 each')
    for (const n of [1_000, 1_000_000, 123_456_789, MAX_SHARES]) expect(previewOf(g, row, n)).not.toMatch(/\d[eE][-+]?\d/)
  })

  it('still shows ordinary prices as before', () => {
    const g = founder()
    const { a, b } = privateCompany(g)
    b.valuation = 50_000_000
    b.shareCount = 10_000_000
    const row = shareRow(g, a.id)
    expect(textOf(g, row)).toBe('10 million shares · about $5.00 each today')
    expect(previewOf(g, row, 100_000)).toContain('100,000 shares at about $500 each')
    expect(previewOf(g, row, 25_000_000)).toContain('25 million shares at about $2.00 each')
  })
})
