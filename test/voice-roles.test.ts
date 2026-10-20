// The voice roles headline and deck (E.T7): two new length roles for the Paper (R5), added to the rule tables
// ahead of the classifier. The caps and aims are pinned here, with the boundary of each, so that a later edit
// to the tables has to change a test on purpose. The five older roles are checked to be exactly as they were.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { AIMS, LIMITS, unitFlags } from '../scripts/voice/rules.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

/** A text of exactly `n` static characters that trips no rule except (maybe) the length ones. */
const ofLength = (n: number): string => 'a'.repeat(n)

const has = (text: string, role: string, flag: string): boolean => (unitFlags(text, role) as string[]).includes(flag)

describe('voice roles headline and deck', () => {
  it('LIMITS and AIMS hold the seven roles, the old five exactly as they were', () => {
    expect(LIMITS).toEqual({ log: 90, scene: 140, outcome: 120, tooltip: 120, digest: 110, headline: 70, deck: 110 })
    expect(AIMS).toEqual({ log: 60, scene: 110, outcome: 100, tooltip: 100, digest: 100, headline: 55, deck: 90 })
  })

  it('both tables stay frozen', () => {
    expect(Object.isFrozen(LIMITS)).toBe(true)
    expect(Object.isFrozen(AIMS)).toBe(true)
  })

  it('a headline is over-aim above 55 characters and over-cap above 70', () => {
    expect(has(ofLength(55), 'headline', 'over-aim')).toBe(false)
    expect(has(ofLength(56), 'headline', 'over-aim')).toBe(true)
    expect(has(ofLength(70), 'headline', 'over-cap')).toBe(false)
    expect(has(ofLength(71), 'headline', 'over-cap')).toBe(true)
  })

  it('a deck is over-aim above 90 characters and over-cap above 110', () => {
    expect(has(ofLength(90), 'deck', 'over-aim')).toBe(false)
    expect(has(ofLength(91), 'deck', 'over-aim')).toBe(true)
    expect(has(ofLength(110), 'deck', 'over-cap')).toBe(false)
    expect(has(ofLength(111), 'deck', 'over-cap')).toBe(true)
  })

  it('holes count zero and an era gate is split off before a headline is measured', () => {
    expect(has('${...}' + ofLength(70), 'headline', 'over-cap')).toBe(false)
    expect(has('@1998 ' + ofLength(70), 'headline', 'over-cap')).toBe(false)
    expect(has('@1998 ' + ofLength(71), 'headline', 'over-cap')).toBe(true)
  })

  it('the five older roles keep their boundaries', () => {
    const old: Record<string, [number, number]> = {
      log: [90, 60],
      scene: [140, 110],
      outcome: [120, 100],
      tooltip: [120, 100],
      digest: [110, 100],
    }
    for (const [role, [cap, aim]] of Object.entries(old)) {
      expect(has(ofLength(cap), role, 'over-cap'), `${role} at its cap`).toBe(false)
      expect(has(ofLength(cap + 1), role, 'over-cap'), `${role} past its cap`).toBe(true)
      expect(has(ofLength(aim), role, 'over-aim'), `${role} at its aim`).toBe(false)
      expect(has(ofLength(aim + 1), role, 'over-aim'), `${role} past its aim`).toBe(true)
    }
  })

  it('a role without a number still has no length cap', () => {
    for (const role of ['title', 'label', 'text']) {
      expect(has(ofLength(170), role, 'over-cap'), role).toBe(false)
      expect(has(ofLength(170), role, 'over-aim'), role).toBe(false)
    }
  })

  it('rules.d.mts declares the two roles in LimitedRole', () => {
    const dts = readFileSync(join(ROOT, 'scripts', 'voice', 'rules.d.mts'), 'utf8')
    expect(dts).toContain("'headline' | 'deck'")
    expect(dts).toMatch(/export type LimitedRole = [^\n]*'digest' \| 'headline' \| 'deck'/)
  })

  it('docs/VOICE.md lists both roles in the Lengths table with their numbers', () => {
    const guide = readFileSync(join(ROOT, 'docs', 'VOICE.md'), 'utf8')
    expect(guide).toContain("| Headline (a news story's first line) | 70 | 55 |")
    expect(guide).toContain('| Deck (the line under a headline) | 110 | 90 |')
  })
})
