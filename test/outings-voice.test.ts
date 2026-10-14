// Team outings (business/flavor.ts OUTINGS) in the house voice: the bad nights mostly state the
// damage, few end on a punchline fragment, no two end on the same word, and no line breaks a rule.
import { describe, expect, it } from 'vitest'
import { OUTINGS } from '../src/game/business/flavor'
import { isPunchlineFragment, unitFlags } from '../scripts/voice/rules.mjs'

const outings = Object.entries(OUTINGS)
const lines = outings.flatMap(([id, o]) => [{ where: `${id}.good`, text: o.good }, { where: `${id}.bad`, text: o.bad }])

/** The last word, without closing punctuation, in lower case. */
function lastWord(text: string): string {
  const words = text.trim().replace(/[.!?"')\]’”]+$/, '').split(/\s+/)
  return words[words.length - 1].toLowerCase()
}

describe('business outings', () => {
  it('at most a third of the bad lines end in a punchline fragment', () => {
    expect(outings.length).toBeGreaterThanOrEqual(30)
    const punch = outings.filter(([, o]) => isPunchlineFragment(o.bad)).map(([id, o]) => `${id}: ${o.bad}`)
    expect(punch.length, punch.join('\n')).toBeLessThanOrEqual(Math.floor(outings.length / 3))
  })

  it('no two bad lines end in the same word', () => {
    const first = new Map<string, string>()
    const clashes: string[] = []
    for (const [id, o] of outings) {
      const word = lastWord(o.bad)
      const earlier = first.get(word)
      if (earlier) clashes.push(`${earlier} and ${id} both end in "${word}"`)
      else first.set(word, id)
    }
    expect(clashes).toEqual([])
  })

  it('no outing line breaks the voice rules', () => {
    const rules = ['punchline', 'stock', 'no-contraction', 'colon-join', 'over-cap']
    const broken = lines.map((l) => ({ ...l, flags: unitFlags(l.text, 'outcome').filter((f) => rules.includes(f)) })).filter((l) => l.flags.length)
    expect(broken.map((l) => `${l.where} [${l.flags.join(', ')}]: ${l.text}`)).toEqual([])
  })

  it('no outing line opens on Nobody or Everyone, lists three things or ends on a feeling', () => {
    const rules = ['nobody', 'everyone', 'list-of-three', 'feeling-end', 'tell', 'em-dash', 'chatbot', 'disclaimer']
    const broken = lines.map((l) => ({ ...l, flags: unitFlags(l.text, 'outcome').filter((f) => rules.includes(f)) })).filter((l) => l.flags.length)
    expect(broken.map((l) => `${l.where} [${l.flags.join(', ')}]: ${l.text}`)).toEqual([])
  })
})
