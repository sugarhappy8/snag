// R1-T9 (E.T2): the text harness's metrics, tested on small hand-built traces. No life is played here, so the file runs
// in about a second. test/text-kit.test.ts plays the four real lives and records the baseline these functions measure.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { planHead } from '../src/ui/components/noticeModel'
import type { ModalItem, NoticeModal, Tone } from '../src/game/types'
import type { PlayedPopup, PlayedYear } from './play-kit'
import {
  DESIGN_THRESHOLDS,
  countCards,
  mergeMetrics,
  normalize,
  textMetrics,
  type LifeTrace,
  type TextMetrics,
} from './text-metrics'

// ---- builders ----------------------------------------------------------------------------------------------------

let nextId = 0
function id(): string {
  return `m${++nextId}`
}

function notice(title = 'News', extra: Partial<NoticeModal> = {}): NoticeModal {
  return { kind: 'notice', id: id(), title, text: 'Something happened.', ...extra }
}
/** A routine notice Quiet Mode may send to the inbox. */
function minor(title = 'Routine', extra: Partial<NoticeModal> = {}): NoticeModal {
  return notice(title, { weight: 'minor', tone: 'good', ...extra })
}
function choice(title = 'Pick one'): ModalItem {
  return { kind: 'choice', id: id(), title, text: 'What will you do?', choices: [{ id: 'a', label: 'Go' }], source: 'script', scriptId: 'x' }
}
function input(title = 'Name it'): ModalItem {
  return { kind: 'input', id: id(), title, text: 'Name it.', input: 'text', scriptId: 'x' }
}
function minigame(title = 'Cards'): ModalItem {
  return { kind: 'minigame', id: id(), title, game: 'slots', scriptId: 'x', data: {} }
}

function popup(m: Exclude<ModalItem, { kind: 'aiTask' }>): PlayedPopup {
  return {
    kind: m.kind,
    title: m.title,
    text: m.kind === 'minigame' ? '' : m.text,
    passive: true,
    item: m,
  }
}

function year(y: number, lines: readonly string[] = [], popups: readonly ModalItem[] = []): PlayedYear {
  return {
    age: y - 2000,
    year: y,
    popups: popups.filter((m): m is Exclude<ModalItem, { kind: 'aiTask' }> => m.kind !== 'aiTask').map(popup),
    lines: lines.map((text) => ({ text, tone: 'neutral' as Tone })),
  }
}

function trace(years: PlayedYear[], rich = false): LifeTrace {
  return { seed: 1, birthYear: 2000, rich, years }
}

/** One log line per year, from 2000 on, so a line's year gap is easy to read off. */
function linesAt(spec: ReadonlyArray<readonly [number, string]>): LifeTrace {
  return trace(spec.map(([y, text]) => year(y, [text])))
}

function deepFreeze<T>(v: T): T {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v)
    for (const x of Object.values(v as object)) deepFreeze(x)
  }
  return v
}

const BLANK: TextMetrics = textMetrics(trace([]))

function metricsLike(over: Partial<TextMetrics>): TextMetrics {
  return { ...BLANK, ...over }
}

// ---- normalize ---------------------------------------------------------------------------------------------------

describe('normalize', () => {
  it('lower-cases, collapses white space and trims', () => {
    expect(normalize('  Hello   WORLD \n')).toBe('hello world')
    expect(normalize('A\tB\n\nC')).toBe('a b c')
    expect(normalize('')).toBe('')
    expect(normalize('   ')).toBe('')
  })

  it('turns every run of digits into one #', () => {
    expect(normalize('You turned 25')).toBe('you turned #')
    expect(normalize('From 1999 to 2004')).toBe('from # to #')
    expect(normalize('Room 101b')).toBe('room #b')
    // A separator splits two runs, so a thousands comma or a decimal point leaves its shape behind.
    expect(normalize('Paid 1,200')).toBe('paid #,#')
    expect(normalize('Rate 3.5')).toBe('rate #.#')
  })

  it('removes money symbols and keeps the figure', () => {
    expect(normalize('Paid $5')).toBe('paid #')
    expect(normalize('Paid € 5')).toBe('paid #')
    expect(normalize('A £40 fine')).toBe('a # fine')
    expect(normalize('¥500 and ₦20 and ₹7')).toBe('# and # and #')
    expect(normalize('Cost: $1.2M')).toBe('cost: #.#m')
  })

  it('makes lines that differ only in numbers, case or spacing equal', () => {
    expect(normalize('I turned 7.')).toBe(normalize('I  TURNED 12.'))
    expect(normalize('You earned $800.')).toBe(normalize('You earned $950.'))
    expect(normalize('I turned 7.')).not.toBe(normalize('I turned seven.'))
  })

  it('is idempotent', () => {
    for (const s of ['Paid $1,200 in 1999', '  A   b 3 ', 'Already #', '']) {
      expect(normalize(normalize(s))).toBe(normalize(s))
    }
  })
})

// ---- the log metrics ---------------------------------------------------------------------------------------------

describe('textMetrics: log lines', () => {
  it('an empty life measures zero everywhere and has no gap', () => {
    const m = textMetrics(trace([]))
    expect(m.lines).toBe(0)
    expect(m.repeatedShare).toBe(0)
    expect(m.sameWithin10).toBe(0)
    expect(m.over3).toEqual({ distinct: 0, max: 0 })
    expect(m.popupFamilies).toEqual({ families: 0, maxPerLife: 0, over6: 0, minGapYears: null })
    expect(m.openerShare).toBe(0)
    const zero = { mean: 0, p50: 0, p90: 0, max: 0 }
    expect(m.popupsPerYear).toEqual(zero)
    expect(m.cardsPerYear).toEqual({ raw: zero, digest: zero, quiet: zero })
  })

  it('counts every log line of every year', () => {
    const m = textMetrics(trace([year(2000, ['One.', 'Two.']), year(2001), year(2002, ['Three.'])]))
    expect(m.lines).toBe(3)
  })

  it('a line repeated 3 times among 5 makes 2 repeats: the share is 0.4, and 2 repeats sit within 10 years', () => {
    const m = textMetrics(linesAt([[2000, 'Went fishing.'], [2001, 'Went fishing.'], [2002, 'Went fishing.'], [2003, 'Got a cat.'], [2004, 'Lost a tooth.']]))
    expect(m.lines).toBe(5)
    expect(m.repeatedShare).toBeCloseTo(0.4, 12)
    expect(m.sameWithin10).toBe(2)
  })

  it('a first sighting is not a repeat, and unique lines give a share of 0', () => {
    const m = textMetrics(linesAt([[2000, 'A.'], [2001, 'B.'], [2002, 'C.']]))
    expect(m.repeatedShare).toBe(0)
    expect(m.sameWithin10).toBe(0)
    expect(m.over3).toEqual({ distinct: 0, max: 1 })
  })

  it('compares lines after normalizing, so a changed number is still a repeat', () => {
    const m = textMetrics(linesAt([[2000, 'I turned 7.'], [2005, 'I turned 12.'], [2006, 'I TURNED 13.']]))
    expect(m.repeatedShare).toBeCloseTo(2 / 3, 12)
    expect(m.sameWithin10).toBe(2)
  })

  it('two sightings of a line in one calendar year are a repeat 0 years apart', () => {
    const m = textMetrics(trace([year(2000, ['Same.', 'Same.'])]))
    expect(m.repeatedShare).toBe(0.5)
    expect(m.sameWithin10).toBe(1)
  })

  it('a repeat 11 years apart is a repeat but not a sameWithin10; 10 years apart is', () => {
    const far = textMetrics(linesAt([[2000, 'Went fishing.'], [2011, 'Went fishing.']]))
    expect(far.repeatedShare).toBe(0.5)
    expect(far.sameWithin10).toBe(0)
    const edge = textMetrics(linesAt([[2000, 'Went fishing.'], [2010, 'Went fishing.']]))
    expect(edge.sameWithin10).toBe(1)
  })

  it('sameWithin10 compares each sighting with the one before it, not with the first', () => {
    // 2000 and 2011 are 11 apart (no), 2011 and 2012 are 1 apart (yes). Against the first, 2012 would be 12 apart.
    const m = textMetrics(linesAt([[2000, 'Went fishing.'], [2011, 'Went fishing.'], [2012, 'Went fishing.']]))
    expect(m.sameWithin10).toBe(1)
    // 2000, 2009, 2018: each step is 9, so both count although the last is 18 from the first.
    const steps = textMetrics(linesAt([[2000, 'Went fishing.'], [2009, 'Went fishing.'], [2018, 'Went fishing.']]))
    expect(steps.sameWithin10).toBe(2)
  })

  it('over3 counts the distinct lines seen more than 3 times, and max is the highest count of any line', () => {
    const spec: Array<[number, string]> = []
    let y = 2000
    for (const [line, n] of [['Five.', 5], ['Four.', 4], ['Three.', 3], ['Once.', 1]] as const) {
      for (let i = 0; i < n; i++) spec.push([y++, line])
    }
    const m = textMetrics(linesAt(spec))
    expect(m.over3).toEqual({ distinct: 2, max: 5 })
    const calm = textMetrics(linesAt([[2000, 'Three.'], [2001, 'Three.'], [2002, 'Three.']]))
    expect(calm.over3).toEqual({ distinct: 0, max: 3 })
  })

  it('openerShare is the share of lines whose first three words appear in another line', () => {
    const m = textMetrics(
      trace([
        year(2000, ['I went to the shop.', 'I went to town.', 'I went to the bank.']),
        year(2001, ['A cat moved in.', 'Money was tight that year.']),
      ]),
    )
    expect(m.lines).toBe(5)
    expect(m.openerShare).toBeCloseTo(3 / 5, 12)
  })

  it('openers are compared after normalizing, and a short line has the opener it has', () => {
    const m = textMetrics(trace([year(2000, ['In 1999 I left home.', 'In 2004 I left school.', 'Moved out.', 'Moved out.', 'Alone.'])]))
    // 'in # i' twice, 'moved out.' twice, 'alone.' once.
    expect(m.openerShare).toBeCloseTo(4 / 5, 12)
  })

  it('openerShare is 0 when every opener is different', () => {
    const m = textMetrics(trace([year(2000, ['Alpha beta gamma one.', 'Delta beta gamma two.', 'Alpha gamma beta three.'])]))
    expect(m.openerShare).toBe(0)
  })

  it('the metrics do not depend on the seed, the birth year or the rich flag', () => {
    const years = [year(2000, ['A.', 'A.'], [notice('N'), notice('N')])]
    const plain = textMetrics({ seed: 1, birthYear: 1950, rich: false, years })
    const other = textMetrics({ seed: 99, birthYear: 2010, rich: true, years })
    expect(other).toEqual(plain)
  })
})

// ---- the popup metrics -------------------------------------------------------------------------------------------

describe('textMetrics: popups', () => {
  it('a family with 7 popups and a gap of 2 years', () => {
    const years: PlayedYear[] = []
    // Birthday popups in 2000, 2002, 2004 ... 2012: seven of them, 2 years apart. A one-off sits beside them.
    for (let i = 0; i < 7; i++) years.push(year(2000 + i * 2, [], [notice('Birthday')]))
    years.push(year(2013, [], [choice('Lottery')]))
    const m = textMetrics(trace(years))
    expect(m.popupFamilies).toEqual({ families: 2, maxPerLife: 7, over6: 1, minGapYears: 2 })
  })

  it('a family of exactly 6 is not above 6', () => {
    const years = Array.from({ length: 6 }, (_, i) => year(2000 + i * 5, [], [notice('Checkup')]))
    expect(textMetrics(trace(years)).popupFamilies).toEqual({ families: 1, maxPerLife: 6, over6: 0, minGapYears: 5 })
  })

  it('families come from the normalized title and pool every kind of popup', () => {
    const m = textMetrics(
      trace([
        year(2000, [], [notice('Birthday 5')]),
        year(2003, [], [choice('BIRTHDAY 6')]),
        year(2004, [], [input('Birthday 7'), minigame('Cards')]),
      ]),
    )
    expect(m.popupFamilies).toEqual({ families: 2, maxPerLife: 3, over6: 0, minGapYears: 1 })
  })

  it('the shortest gap is taken over all the families, and two of one family in one year are 0 apart', () => {
    const m = textMetrics(
      trace([
        year(2000, [], [notice('Slow'), notice('Fast')]),
        year(2010, [], [notice('Slow')]),
        year(2011, [], [notice('Fast'), notice('Fast')]),
      ]),
    )
    // Slow: 2000, 2010 (10). Fast: 2000, 2011, 2011 (11 and 0).
    expect(m.popupFamilies.minGapYears).toBe(0)
    expect(m.popupFamilies.maxPerLife).toBe(3)
  })

  it('minGapYears is null when no family repeats', () => {
    const m = textMetrics(trace([year(2000, [], [notice('A')]), year(2001, [], [notice('B')]), year(2002, [], [choice('C')])]))
    expect(m.popupFamilies).toEqual({ families: 3, maxPerLife: 1, over6: 0, minGapYears: null })
  })

  it('popupsPerYear is nearest-rank: mean, p50, p90 and max of the per-year counts', () => {
    // Ten years with 1 to 10 popups. p50 is the 5th value, p90 the 9th.
    const years = Array.from({ length: 10 }, (_, i) => year(2000 + i, [], Array.from({ length: i + 1 }, () => notice('N'))))
    const m = textMetrics(trace(years))
    expect(m.popupsPerYear).toEqual({ mean: 5.5, p50: 5, p90: 9, max: 10 })
  })

  it('nearest-rank on other lengths: sorted first, rank is ceil(p * n / 100)', () => {
    const counts = (xs: number[]) => textMetrics(trace(xs.map((n, i) => year(2000 + i, [], Array.from({ length: n }, () => notice('N')))))).popupsPerYear
    expect(counts([4])).toEqual({ mean: 4, p50: 4, p90: 4, max: 4 })
    // [1,3,5] sorted: ceil(1.5) = 2nd = 3 and ceil(2.7) = 3rd = 5.
    expect(counts([5, 1, 3])).toEqual({ mean: 3, p50: 3, p90: 5, max: 5 })
    // [1,2,3,4]: ceil(2) = 2nd = 2 and ceil(3.6) = 4th = 4.
    expect(counts([1, 2, 3, 4])).toEqual({ mean: 2.5, p50: 2, p90: 4, max: 4 })
    // Twenty years of 0 and one of 9: ceil(0.9 * 21) = 19th value, still 0, and the max shows the spike.
    expect(counts([...Array.from({ length: 20 }, () => 0), 9])).toMatchObject({ p50: 0, p90: 0, max: 9 })
  })

  it('every kind of popup counts in popupsPerYear, and a year with none counts as 0', () => {
    const m = textMetrics(trace([year(2000, [], [notice(), choice(), input(), minigame()]), year(2001)]))
    // Counts [4, 0]: sorted [0, 4], so the 50th percentile is the first value.
    expect(m.popupsPerYear).toEqual({ mean: 2, p50: 0, p90: 4, max: 4 })
  })
})

describe('textMetrics: cards a year', () => {
  it('raw is one card per popup, digest merges notice runs, quiet also drops routine notices', () => {
    const m = textMetrics(
      trace([
        // [N,N,N,C,N]: raw 5, digest 3 (three notices share a card), quiet 3 (nothing here is routine).
        year(2000, [], [notice(), notice(), notice(), choice(), notice()]),
        // Four routine notices and a bad one: raw 5, digest 1, quiet 1 (only the bad one is left).
        year(2001, [], [minor(), minor(), minor(), minor(), notice('Trouble', { tone: 'bad' })]),
      ]),
    )
    expect(m.cardsPerYear.raw).toEqual({ mean: 5, p50: 5, p90: 5, max: 5 })
    expect(m.cardsPerYear.digest).toEqual({ mean: 2, p50: 1, p90: 3, max: 3 })
    expect(m.cardsPerYear.quiet).toEqual({ mean: 2, p50: 1, p90: 3, max: 3 })
  })

  it('quiet is never above digest, and digest is never above raw', () => {
    const years = [
      year(2000, [], [minor(), minor(), minor()]),
      year(2001, [], [notice(), choice(), minor(), notice()]),
      year(2002, [], Array.from({ length: 11 }, () => minor())),
      year(2003),
    ]
    const c = textMetrics(trace(years)).cardsPerYear
    expect(c.quiet.mean).toBeLessThanOrEqual(c.digest.mean)
    expect(c.digest.mean).toBeLessThan(c.raw.mean)
    expect(c.quiet.mean).toBeLessThan(c.digest.mean)
  })
})

// ---- countCards --------------------------------------------------------------------------------------------------

describe('countCards', () => {
  const RAW = { digest: false, quiet: false }
  const DIGEST = { digest: true, quiet: false }
  const QUIET = { digest: true, quiet: true }

  it('an empty year has no cards', () => {
    expect(countCards([], RAW)).toBe(0)
    expect(countCards([], QUIET)).toBe(0)
  })

  it('[N,N,N,C,N]: raw 5 and digest 3 (the three leading notices share one card)', () => {
    const shown = [notice(), notice(), notice(), choice(), notice()]
    expect(countCards(shown, RAW)).toBe(5)
    expect(countCards(shown, DIGEST)).toBe(3)
  })

  it('ten notices are 2 cards when merged (chunks of 8 and 2), 10 when not', () => {
    const shown = Array.from({ length: 10 }, () => notice())
    expect(countCards(shown, DIGEST)).toBe(2)
    expect(countCards(shown, RAW)).toBe(10)
  })

  it('a run is ceil(len / 8) cards', () => {
    const run = (n: number) => countCards(Array.from({ length: n }, () => notice()), DIGEST)
    expect([1, 2, 7, 8, 9, 16, 17, 24, 25].map(run)).toEqual([1, 1, 1, 1, 2, 2, 3, 3, 4])
  })

  it('a lone notice stays one card, and a choice, input or minigame is one card each and splits a run', () => {
    expect(countCards([notice()], DIGEST)).toBe(1)
    expect(countCards([choice(), input(), minigame()], DIGEST)).toBe(3)
    expect(countCards([notice(), notice(), input(), notice(), notice(), minigame(), notice()], DIGEST)).toBe(5)
  })

  it('a support notice never merges and a run ends at it', () => {
    const shown = [notice(), notice(), notice('Help', { support: true }), notice(), notice()]
    expect(countCards(shown, DIGEST)).toBe(3)
    expect(countCards(shown, RAW)).toBe(5)
  })

  it('a bad notice merges like any other and stays a card under quiet', () => {
    const shown = [notice('Trouble', { tone: 'bad' }), notice(), notice()]
    expect(countCards(shown, DIGEST)).toBe(1)
    expect(countCards([notice('Trouble', { tone: 'bad', weight: 'minor' })], QUIET)).toBe(1)
    expect(countCards([minor('Trouble', { tone: 'bad' }), minor()], QUIET)).toBe(1)
  })

  it('a minor good notice is routed away under quiet and counts nothing', () => {
    expect(countCards([minor()], DIGEST)).toBe(1)
    expect(countCards([minor()], QUIET)).toBe(0)
    expect(countCards([minor(), choice(), minor()], QUIET)).toBe(1)
    expect(countCards([minor(), notice(), minor(), notice()], QUIET)).toBe(1)
    // Quiet without the digest still drops them: raw cards minus the routed notices.
    expect(countCards([minor(), notice(), minor(), notice()], { digest: false, quiet: true })).toBe(2)
  })

  it('a routine notice the policy keeps (health word, big figure, no weight) stays a card under quiet', () => {
    expect(countCards([minor('Checkup', { text: 'The doctor says you are fine.' })], QUIET)).toBe(1)
    expect(countCards([minor('Windfall', { text: 'You got $250,000.' })], QUIET)).toBe(1)
    expect(countCards([notice('Report Card', { tone: 'good' })], QUIET)).toBe(1)
  })

  it('removing routed notices can shrink a run: nine routine notices are 2 cards merged, 0 under quiet', () => {
    const nine = Array.from({ length: 9 }, () => minor())
    expect(countCards(nine, DIGEST)).toBe(2)
    expect(countCards(nine, QUIET)).toBe(0)
    expect(countCards([...nine, notice(), notice()], QUIET)).toBe(1)
  })

  it('a built-in task is never drawn and never joins a run', () => {
    const task: ModalItem = { kind: 'aiTask', id: id(), task: { type: 'yearEvents' } }
    expect(countCards([task], RAW)).toBe(0)
    expect(countCards([notice(), task, notice()], DIGEST)).toBe(2)
  })

  it('agrees with ModalHost: walking the queue with planHead gives the same digest count', () => {
    const task: ModalItem = { kind: 'aiTask', id: id(), task: { type: 'yearEvents' } }
    const build = (spec: string): ModalItem[] =>
      [...spec].map((c) => {
        switch (c) {
          case 'N': return notice()
          case 'S': return notice('Help', { support: true })
          case 'C': return choice()
          case 'I': return input()
          case 'M': return minigame()
          default: return task
        }
      })
    const viaPlanHead = (items: ModalItem[]): number => {
      let queue = items
      let cards = 0
      while (queue.length > 0) {
        const plan = planHead(queue, true)
        if (plan.kind === 'digest') {
          cards++
          queue = queue.slice(plan.items.length)
        } else {
          if (plan.kind === 'single') cards++
          queue = queue.slice(1)
        }
      }
      return cards
    }
    for (const spec of ['N', 'NN', 'NNNCN', 'NNNNNNNNN', 'NNNNNNNNNNNNNNNNN', 'NSNN', 'CNNIMNNN', 'NNTNN', 'TNN', 'SS', 'NNNNNNNNNNNNNNNN']) {
      const items = build(spec)
      expect(countCards(items, DIGEST), spec).toBe(viaPlanHead(items))
    }
  })

  it('does not write to the list it is given', () => {
    const shown = deepFreeze([minor(), notice(), choice(), minor()])
    expect(() => countCards(shown, QUIET)).not.toThrow()
    expect(shown).toHaveLength(4)
  })
})

// ---- mergeMetrics ------------------------------------------------------------------------------------------------

describe('mergeMetrics', () => {
  const spread = (mean: number, p50: number, p90: number, max: number) => ({ mean, p50, p90, max })
  const a = metricsLike({
    lines: 100,
    repeatedShare: 0.1,
    sameWithin10: 2,
    over3: { distinct: 1, max: 4 },
    popupFamilies: { families: 10, maxPerLife: 7, over6: 1, minGapYears: 3 },
    openerShare: 0.2,
    popupsPerYear: spread(1, 1, 3, 5),
    cardsPerYear: { raw: spread(1, 1, 3, 5), digest: spread(0.8, 1, 2, 4), quiet: spread(0.6, 0, 2, 3) },
  })
  const b = metricsLike({
    lines: 300,
    repeatedShare: 0.3,
    sameWithin10: 5,
    over3: { distinct: 3, max: 6 },
    popupFamilies: { families: 14, maxPerLife: 5, over6: 0, minGapYears: 1 },
    openerShare: 0.4,
    popupsPerYear: spread(2, 2, 5, 9),
    cardsPerYear: { raw: spread(2, 2, 5, 9), digest: spread(1.2, 1, 3, 7), quiet: spread(1, 1, 3, 6) },
  })

  it('one life merges to itself', () => {
    expect(mergeMetrics([a])).toEqual(a)
  })

  it('shares and spreads are line-weighted means, and a max is the max of the maxes', () => {
    const m = mergeMetrics([a, b])
    expect(m.lines).toBe(400)
    expect(m.repeatedShare).toBeCloseTo(0.25, 12)
    expect(m.openerShare).toBeCloseTo(0.35, 12)
    expect(m.popupsPerYear.mean).toBeCloseTo(1.75, 12)
    expect(m.popupsPerYear.p50).toBeCloseTo(1.75, 12)
    expect(m.popupsPerYear.p90).toBeCloseTo(4.5, 12)
    expect(m.popupsPerYear.max).toBe(9)
    expect(m.cardsPerYear.raw.max).toBe(9)
    expect(m.cardsPerYear.digest.mean).toBeCloseTo(1.1, 12)
    expect(m.cardsPerYear.digest.max).toBe(7)
    expect(m.cardsPerYear.quiet.p90).toBeCloseTo(2.75, 12)
    expect(m.cardsPerYear.quiet.max).toBe(6)
    expect(m.over3.max).toBe(6)
    expect(m.popupFamilies.maxPerLife).toBe(7)
  })

  it('counts add up and the shortest gap is the smallest one', () => {
    const m = mergeMetrics([a, b])
    expect(m.sameWithin10).toBe(7)
    expect(m.over3.distinct).toBe(4)
    expect(m.popupFamilies.families).toBe(24)
    expect(m.popupFamilies.over6).toBe(1)
    expect(m.popupFamilies.minGapYears).toBe(1)
  })

  it('a null gap is skipped, and the merged gap is null only when every life has none', () => {
    const none = metricsLike({ lines: 10 })
    expect(mergeMetrics([none, a]).popupFamilies.minGapYears).toBe(3)
    expect(mergeMetrics([none, none]).popupFamilies.minGapYears).toBeNull()
  })

  it('merging in another order gives the same answer', () => {
    const x = mergeMetrics([a, b])
    const y = mergeMetrics([b, a])
    expect(JSON.stringify(y.popupFamilies)).toBe(JSON.stringify(x.popupFamilies))
    expect(y.repeatedShare).toBeCloseTo(x.repeatedShare, 12)
    expect(y.cardsPerYear.quiet.mean).toBeCloseTo(x.cardsPerYear.quiet.mean, 12)
  })

  it('lives with no lines weigh the same instead of dividing by zero', () => {
    const p = metricsLike({ lines: 0, repeatedShare: 0.2 })
    const q = metricsLike({ lines: 0, repeatedShare: 0.4 })
    const m = mergeMetrics([p, q])
    expect(m.lines).toBe(0)
    expect(m.repeatedShare).toBeCloseTo(0.3, 12)
    expect(Number.isFinite(m.repeatedShare)).toBe(true)
  })

  it('no lives merge to an empty measure', () => {
    expect(mergeMetrics([])).toEqual(BLANK)
  })

  it('does not write to its input', () => {
    const frozen = deepFreeze([structuredClone(a), structuredClone(b)])
    expect(() => mergeMetrics(frozen)).not.toThrow()
  })
})

// ---- purity ------------------------------------------------------------------------------------------------------

describe('purity', () => {
  it('textMetrics reads a deep-frozen trace without writing and gives the same answer twice', () => {
    const t = deepFreeze(
      trace([
        year(2000, ['A.', 'A.'], [notice('N'), minor(), choice()]),
        year(2001, ['A.'], [notice('N'), minor()]),
      ]),
    )
    const first = textMetrics(t)
    const second = textMetrics(t)
    expect(second).toEqual(first)
    expect(JSON.stringify(second)).toBe(JSON.stringify(first))
  })

  it('the result holds no reference into the trace', () => {
    const t = trace([year(2000, ['A.'], [notice('N')])])
    const m = textMetrics(t)
    expect(JSON.parse(JSON.stringify(m))).toEqual(m)
  })
})

// ---- thresholds and the recorded baseline ------------------------------------------------------------------------

describe('DESIGN_THRESHOLDS', () => {
  it('holds the numbers of design 9.2, and cannot be edited', () => {
    expect(DESIGN_THRESHOLDS).toEqual({
      repeatedShare: 0.05,
      repeatedShareRich: 0.08,
      sameWithin10: 0,
      over3Max: 3,
      popupFamilyMax: 6,
      popupFamilyMinGap: 4,
      openerShare: 0.12,
      openerShareRich: 0.2,
      popupsP90: 4,
    })
    expect(Object.isFrozen(DESIGN_THRESHOLDS)).toBe(true)
  })
})

describe('the recorded baseline', () => {
  type Baseline = { v: number; recordedAt: string; lives: TextMetrics[]; merged: TextMetrics }
  // Read inside each test, so a missing file fails these three tests and not the whole file.
  const load = (): Baseline => JSON.parse(readFileSync(join(__dirname, 'fixtures', 'text-baseline.json'), 'utf8')) as Baseline

  it('has the agreed shape: version, label, four lives and their merge', () => {
    const file = load()
    expect(file.v).toBe(1)
    expect(file.recordedAt).toBe('v4.1.0 candidate')
    expect(file.lives).toHaveLength(4)
    expect(Object.keys(file).sort()).toEqual(['lives', 'merged', 'recordedAt', 'v'])
  })

  it('every number in it is finite and every life has the metrics of this file', () => {
    const file = load()
    const keys = Object.keys(BLANK).sort()
    const walk = (v: unknown, path: string): void => {
      if (typeof v === 'number') expect(Number.isFinite(v), path).toBe(true)
      else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`)
    }
    for (const life of [...file.lives, file.merged]) {
      expect(Object.keys(life).sort()).toEqual(keys)
      walk(life, 'metrics')
      expect(life.lines).toBeGreaterThan(100)
    }
  })

  it('the merged row adds up the lives', () => {
    const file = load()
    expect(file.merged.lines).toBe(file.lives.reduce((n, l) => n + l.lines, 0))
    expect(file.merged.sameWithin10).toBe(file.lives.reduce((n, l) => n + l.sameWithin10, 0))
  })
})
