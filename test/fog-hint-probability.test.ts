// R3 fix (fog): a purple hint is a gut, so a chance in it is a fallible reading, not the odds the game rolls. The lens used to fog only the
// figures that follow "about", "roughly", "around" or "~", so every hint that wrote a bare probability ("12% chance of an offer", "40% to
// fund", "💥 12% · 🌟 7%") printed the true roll odds in Realistic. The lens now also reads a percent that names a chance in words
// ("chance", "to fund", "to win", "they say yes", "delivery trouble", "of getting ..."), and a site whose words cannot say it (an emoji
// list, "62% odds") writes `hintPct` / `hintLead`, which print today's text in Exact and "about N%" in Realistic.
//
// The scan reads every `talentHint(` call in src, finds each percent figure in it, and fails when the lens would leave that figure exact
// in Realistic and the figure is not one of the few that are not a chance (named below, each with its reason).
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { hintLead, hintPct, lensHint } from '../src/game/fog/hint/contract'
import type { GameState } from '../src/game/types'
import { fogGame, inFog, unitAt } from './knowledge-kit'

const BIZ = { talents: ['Business'] } as const
const biz = (i: number): GameState => fogGame(i, BIZ)

/** Texts of the shapes the sites write, each with the percent that is a chance. */
const CHANCES: readonly (readonly [text: string, figure: string])[] = [
  ['12% chance of an offer', '12%'],
  ['35% chance of an idea', '35%'],
  ['50% chance of first prize', '50%'],
  ['40% chance to win', '40%'],
  ['Keeping quiet: 15% chance of a scandal', '15%'],
  ['60% to fund · 20% delivery trouble · 30% margin', '60%'],
  ['60% to fund · 20% delivery trouble · 30% margin', '20%'],
  ["Ann's odds of making it work: about 45% (and 20% of getting some money back)", '20%'],
  ['They say yes: 70% they say yes.', '70%'],
]

describe('the lens reads a percent that names a chance', () => {
  it('Exact mode leaves every one of them as it was', () => {
    const g = biz(1)
    for (const [text] of CHANCES) expect(lensHint(g, 'Inventor', text), text).toBe(text)
  })

  it('Realistic moves the chance, to the nearest 5, and leaves the figures that are not chances', () => {
    inFog(() => {
      for (const [text, figure] of CHANCES) {
        const seen = new Set<string>()
        let kept = 0
        for (let i = 0; i < 40; i++) {
          const out = lensHint(biz(i), 'Inventor', text)
          if (out.includes(figure)) kept++
          seen.add(out)
          expect(out.replace(/\d+(?:\.\d+)?%/g, '#'), text).toBe(text.replace(/\d+(?:\.\d+)?%/g, '#'))
        }
        // a reading can land on the truth (to the nearest 5), but not in most lives, and it differs from life to life
        expect(kept, `${text}: ${figure} is read, not kept`).toBeLessThan(30)
        expect(seen.size, `${text} reads the same in every life`).toBeGreaterThan(2)
      }
      // a margin is a fixed term of the deal, not a chance
      for (let i = 0; i < 40; i++) expect(lensHint(biz(i), 'Inventor', '60% to fund · 20% delivery trouble · 30% margin')).toContain('30% margin')
    })
  })

  it('leaves a limit, a rate and a share alone, as before', () => {
    const LIMITS = ['keeping 100% pays off big', 'once your skill reaches 40%', 'the lab is worth 15% of the market', 'swings ±15%', 'savings 4.2%, loans 7%', '(62% odds, quality 4)', 'Odds 62%: team +9']
    inFog(() => {
      for (let i = 0; i < 40; i++) for (const s of LIMITS) expect(lensHint(biz(i), 'Business', s), s).toBe(s)
    })
  })

  it('is honest: the shown chance holds the true one in the 80% band the hint numbers use, 10,000 lives', () => {
    inFog(() => {
      let hit = 0
      const N = 10_000
      for (let i = 0; i < N; i++) {
        // a chance of 30% to 90%: the rounding to 5 points is under 8% of it
        const truth = Math.round((0.3 + 0.6 * unitAt('prob', i)) * 100) / 100
        const out = lensHint(biz(i), 'Inventor', `${Math.round(truth * 100)}% chance to win`)
        const shown = Number(/(\d+(?:\.\d+)?)%/.exec(out)![1]) / 100
        // the Business talent reads a hint at sd .18 of the figure (.3 x .6): the band is 1.298 sd, plus the rounding of the shown figure
        if (Math.abs(Math.log(shown / truth)) <= 1.298 * 0.18 + 0.083) hit++
      }
      expect(hit / N).toBeGreaterThan(0.78)
      expect(hit / N).toBeLessThan(0.95)
    })
  })

  it('is stable: the same text in the same year reads the same, another life reads another', () => {
    inFog(() => {
      const t = '40% chance to win'
      expect(lensHint(biz(3), 'Inventor', t)).toBe(lensHint(biz(3), 'Inventor', t))
      expect(new Set(Array.from({ length: 30 }, (_, i) => lensHint(biz(i), 'Inventor', t))).size).toBeGreaterThan(1)
    })
  })

  it('reads a chance once, even when a lead word and its words both mark it', () => {
    inFog(() => {
      const outs = Array.from({ length: 40 }, (_, i) => lensHint(biz(i), 'Inventor', 'about 40% chance to win'))
      for (const out of outs) expect(out).toMatch(/^about \d+% chance to win$/)
      expect(new Set(outs).size).toBeGreaterThan(2)
    })
  })
})

describe('hintPct and hintLead', () => {
  it('print today\'s text in Exact and "about" in Realistic, which the lens then reads once', () => {
    expect(hintLead()).toBe('')
    expect(hintPct(0.123)).toBe('12%')
    expect(hintPct(-1)).toBe('0%')
    inFog(() => {
      expect(hintLead()).toBe('about ')
      expect(hintPct(0.123)).toBe('about 12%')
      const g = biz(7)
      const out = lensHint(g, 'Inventor', `\u{1F4A5} ${hintPct(0.12)} · \u{1F31F} ${hintPct(0.07)}`)
      expect(out).toMatch(/^\u{1F4A5} about \d+% · \u{1F31F} about \d+%$/u)
    })
  })
})

// ---------------------------------------------------------------------------------------------------------------------------------
// The scan: every talentHint call in src

const ROOT = fileURLToPath(new URL('..', import.meta.url))

function walk(dir: string, out: string[]): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}

/** The text of the arguments of a call that starts at `from` (just after "talentHint("), cut at the matching ")". String and template aware. */
function callArgs(s: string, from: number): string {
  let depth = 1
  let j = from
  let q: string | null = null
  while (j < s.length && depth > 0) {
    const c = s[j]!
    if (q) {
      if (c === '\\') {
        j += 2
        continue
      }
      if (q === '`' && c === '$' && s[j + 1] === '{') {
        let d = 1
        j += 2
        while (j < s.length && d > 0) {
          if (s[j] === '{') d++
          else if (s[j] === '}') d--
          j++
        }
        continue
      }
      if (c === q) q = null
    } else if (c === '"' || c === "'" || c === '`') q = c
    else if (c === '(') depth++
    else if (c === ')') depth--
    j++
  }
  return s.slice(from, j - 1)
}

interface Site {
  file: string
  line: number
  /** The percent figure's context: some text before it and some after. */
  before: string
  after: string
  /** The call text with the figure as 37% and every other interpolation as "x". */
  sample: string
  led: boolean
}

const LED = /(?:about|roughly|around)\s+$|~\s?$/i

/** Every percent figure written inside a talentHint call. */
function sites(): Site[] {
  const out: Site[] = []
  for (const path of walk(join(ROOT, 'src'), [])) {
    const s = readFileSync(path, 'utf8')
    for (const m of s.matchAll(/talentHint\(/g)) {
      const call = callArgs(s, m.index! + m[0].length)
      const line = s.slice(0, m.index).split('\n').length
      // split the call into literal pieces and ${} interpolations
      const parts: { lit: string; ip: boolean }[] = []
      let i = 0
      let lit = ''
      while (i < call.length) {
        if (call[i] === '$' && call[i + 1] === '{') {
          let d = 1
          let j = i + 2
          while (j < call.length && d > 0) {
            if (call[j] === '{') d++
            else if (call[j] === '}') d--
            j++
          }
          if (lit) parts.push({ lit, ip: false })
          lit = ''
          parts.push({ lit: call.slice(i, j), ip: true })
          i = j
          continue
        }
        lit += call[i]
        i++
      }
      if (lit) parts.push({ lit, ip: false })
      // a figure: an interpolation that is a percent (it calls a pct helper, or the next literal starts with "%"), or "N%" in a literal;
      // hintLead() writes the lead word and hintPct() the lead word and the figure, which is what they print in Realistic
      const flat = parts.map((p, k) => {
        if (!p.ip) return { ...p, fig: false, text: p.lit, led: false }
        const next = parts[k + 1]
        // a sign written before a figure (`${change >= 0 ? '+' : ''}`)
        if (/'\+'\s*:\s*''/.test(p.lit)) return { ...p, fig: false, text: '+', led: false }
        if (/hintLead\(/.test(p.lit)) return { ...p, fig: false, text: 'about ', led: false }
        if (/hintPct\(/.test(p.lit)) return { ...p, fig: true, text: 'about 37%', led: true }
        const pctCall = /\b\w*[Pp]ct\w*\(/.test(p.lit)
        const fig = pctCall || (next !== undefined && !next.ip && next.lit.startsWith('%'))
        return { ...p, fig, text: fig ? '37%' : 'x', led: false }
      })
      // the literal "%" that closes an interpolated figure belongs to the figure
      flat.forEach((p, k) => {
        const prev = flat[k - 1]
        if (!p.ip && prev !== undefined && prev.ip && prev.fig && p.text.startsWith('%') && !/[Pp]ct\w*\(/.test(prev.lit)) flat[k] = { ...p, text: p.text.slice(1), lit: p.lit.slice(1) }
      })
      const sofar = (k: number): string => flat.slice(0, k).map((p) => p.text).join('')
      flat.forEach((p, k) => {
        if (p.ip && p.fig) {
          const before = sofar(k)
          const after = flat.slice(k + 1).map((q) => q.text).join('')
          const fig = p.led ? 'about 37%' : '37%'
          out.push({ file: relative(ROOT, path), line, before, after, sample: `${before.slice(-60)}${fig}${after.slice(0, 60)}`, led: p.led || LED.test(before) })
        } else if (!p.ip) {
          for (const lm of p.lit.matchAll(/(?<![\d.])(\d+(?:\.\d+)?)%/g)) {
            const before = sofar(k) + p.lit.slice(0, lm.index)
            const after = p.lit.slice(lm.index! + lm[0].length) + flat.slice(k + 1).map((q) => q.text).join('')
            out.push({ file: relative(ROOT, path), line, before, after, sample: `${before.slice(-60)}37%${after.slice(0, 60)}`, led: LED.test(before) })
          }
        }
      })
    }
  }
  return out
}

/**
 * The percent figures of hints that are not a chance, so the lens leaves them exact on purpose. Keyed by file and the words around the
 * figure; each says why. An entry that no longer matches a figure fails the test, so the list cannot go stale.
 */
const NOT_A_CHANCE: readonly { file: string; has: string; why: string }[] = [
  { file: 'src/game/business/founding.ts', has: 'keeping #', why: 'a stake: the share of the company the founder keeps, a limit written in the rules' },
  { file: 'src/game/activities/creative.ts', has: 'skill reaches #', why: 'a skill limit the editors ask for, not a chance' },
  { file: 'src/game/business/competition-menu.ts', has: 'you turned away #', why: 'a fact of last year in the player\'s own books (customers turned away)' },
  { file: 'src/game/business/bank-menu.ts', has: 'Best pair this year', why: 'the posted savings and loan rates of the banks, published rates' },
  { file: 'src/game/business/fund-menu.ts', has: 'swings ±#', why: 'the swing of a strategy, a spread stated next to the expected return that the lens already reads (about ...)' },
  { file: 'src/game/business/fund-events.ts', has: 'swings ±#', why: 'the same swing, in the fund event' },
  { file: 'src/game/shops/luxury-brands-assets.ts', has: 'typically moves #', why: 'the outlook band of a piece (a typical move and its range, read whole), not a chance' },
  { file: 'src/game/shops/luxury-brands-assets.ts', has: '(range #', why: 'the low end of the same outlook band' },
  { file: 'src/game/shops/luxury-brands-assets.ts', has: ' to #', why: 'the high end of the same outlook band' },
  { file: 'src/game/workshop/launch.ts', has: '# margin', why: 'the margin a crowdfunding tier leaves, a fixed term of the tier (the chance to fund and the delivery trouble beside it are read)' },
]

describe('every percent in a talentHint call is read by the lens or is not a chance', () => {
  const all = sites()

  it('finds the sites it is meant to scan', () => {
    expect(all.length).toBeGreaterThan(20)
    expect(all.some((s) => s.file.endsWith('workshop/events.ts') && /chance to win/.test(s.after))).toBe(true)
    expect(all.some((s) => s.file.endsWith('workshop/build.ts'))).toBe(true)
  })

  it('no probability is left exact in Realistic', () => {
    const allowed = (s: Site): boolean => NOT_A_CHANCE.some((a) => s.file === a.file && (s.before.slice(-80) + '#' + s.after.slice(0, 40)).includes(a.has))
    const left: string[] = []
    inFog(() => {
      for (const s of all) {
        if (allowed(s)) continue
        let moved = false
        for (let i = 0; i < 40 && !moved; i++) if (lensHint(biz(i), 'Inventor', s.sample) !== s.sample) moved = true
        if (!moved) left.push(`${s.file}:${s.line}: ${s.sample}`)
      }
    })
    expect(left, 'a percent in a hint the lens leaves exact in Realistic').toEqual([])
  })

  it('the list of figures that are not a chance has no stale entry', () => {
    for (const a of NOT_A_CHANCE) {
      const hit = all.some((s) => s.file === a.file && (s.before.slice(-80) + '#' + s.after.slice(0, 40)).includes(a.has))
      expect(hit, `${a.file} "${a.has}" (${a.why}) is no longer a percent in a hint`).toBe(true)
    }
  })
})
