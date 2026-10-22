// R3-Q2 (E.D1 b): the counting probe behind NOTICE_WEIGHTS. It plays 24 ordinary lives, 6 rich lives and 4 founder lives to
// age 85, counts every notice by exact title, and writes each title it saw to test/fixtures/notice-titles.json with its count,
// the tone and the first text, how many were bad-tone, how many the never-route policy blocks, and where the first one came
// from. A notice that arrived by itself (a yearly hook made it: `passive`) is counted apart from one the player asked for (the
// outcome of a choice, an input or a minigame they answered). The year close folds only the first kind, but both kinds put a
// weight on the log line they leave (res() in events/helpers.ts), and a life has far fewer passive titles (about 35) than the
// 120 the table needs, so the table is picked from the two together. The R1 probe (test/notice-probe.test.ts) keeps only the
// top 60 passive titles of 13 lives; this one keeps enough to say how much of a year the table covers. Opt-in (a few
// minutes), so CI time doesn't grow:
//
//   NOTICE_TITLES=1 /Users/saeed/projects/anotherlife/wt/bin/vt22 test/notice-title-probe.test.ts
//
// The seeds are found, not pinned (test/seed-kit.ts) and written into the fixture, so the table test needs no life. The
// weights themselves are chosen by hand from this file (test/notice-weight-table.test.ts holds the rubric and the checks).
// A sample has its dashes turned to hyphens, because the house voice allows none and a fixture is no place to add them.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { neverRoute, type RouteBlock } from '../src/game/notice-policy'
import { createNewLife } from '../src/game/life'
import type { NoticeModal, Tone } from '../src/game/types'
import { playLife } from './play-kit'
import { probeLife } from './probe-life'
import { findSeeds } from './seed-kit'

/** One title of the fixture. */
export type TitleRow = {
  title: string
  /** Notices with this title over all the lives: `passive` plus `outcome`. */
  count: number
  /** How many arrived by themselves. */
  passive: number
  /** How many were the outcome of a choice, an input or a minigame the player answered. */
  outcome: number
  /** The tone of the first one; missing when it had none. */
  tone?: Tone
  /** The text of the first one, cut to SAMPLE_MAX characters. */
  sample: string
  /** Set when the first one carried the support line. */
  support?: true
  /** neverRoute() of the first one, on its whole text: why it must stay a popup, or null. */
  never: RouteBlock | null
  /** How many of the notices with this title had the bad tone. */
  bad: number
  /** How many of them neverRoute blocks. */
  blocked: number
  /** The source (`s`, the yearly hook) of the first one; missing when it had none. */
  s?: string
}

export type TitleFile = {
  v: 1
  seeds: { ordinary: number[]; rich: number[]; founder: number[] }
  untilAge: number
  /** Every notice counted, including the ones whose title is not in `rows`. */
  notices: number
  /** How many of them arrived by themselves. */
  passiveNotices: number
  /** How many different titles there were. */
  titles: number
  /** The most frequent titles first (ties by title), at most MAX_ROWS. */
  rows: TitleRow[]
}

const FIXTURE = join(__dirname, 'fixtures', 'notice-titles.json')
const BIRTH_YEARS = [1925, 1950, 1975, 1990, 2010, 2026]
const UNTIL_AGE = 85
const SAMPLE_MAX = 240
const MAX_ROWS = 500

interface Seen {
  title: string
  /** True when the notice arrived by itself. */
  passive: boolean
  text: string
  tone?: Tone
  support?: boolean
  s?: string
}

/** A text with its em and en dashes turned to hyphens. */
function plain(text: string): string {
  return text.replace(/[\u2013\u2014]/g, '-')
}

function tally(seen: readonly Seen[]): TitleRow[] {
  const rows = new Map<string, TitleRow>()
  for (const n of seen) {
    const blocked = neverRoute({ title: n.title, text: n.text, tone: n.tone, support: n.support }) !== null
    const row = rows.get(n.title)
    if (row) {
      row.count++
      if (n.passive) row.passive++
      else row.outcome++
      if (n.tone === 'bad') row.bad++
      if (blocked) row.blocked++
      continue
    }
    rows.set(n.title, {
      title: n.title,
      count: 1,
      passive: n.passive ? 1 : 0,
      outcome: n.passive ? 0 : 1,
      ...(n.tone ? { tone: n.tone } : {}),
      sample: plain(n.text).slice(0, SAMPLE_MAX),
      ...(n.support ? { support: true as const } : {}),
      never: neverRoute({ title: n.title, text: n.text, tone: n.tone, support: n.support }),
      bad: n.tone === 'bad' ? 1 : 0,
      blocked: blocked ? 1 : 0,
      ...(n.s ? { s: n.s } : {}),
    })
  }
  return [...rows.values()].sort((a, b) => b.count - a.count || (a.title < b.title ? -1 : a.title > b.title ? 1 : 0))
}

describe.skipIf(process.env.NOTICE_TITLES !== '1')('notice title probe', () => {
  it(
    'counts the notices, passive and outcome, of 34 lives and writes test/fixtures/notice-titles.json',
    () => {
      // Lives born in different countries, so one country's schools and holidays do not own the top of the list.
      const countries = new Set<string>()
      const ordinary = findSeeds(
        (s) => {
          const country = createNewLife({ seed: s, year: 1990 }).character.countryId
          if (countries.has(country)) return false
          countries.add(country)
          return true
        },
        24,
        { from: 501, tries: 400, label: 'notice titles: ordinary lives in 24 countries' },
      )
      const rich = findSeeds((s) => createNewLife({ seed: s, year: 1990 }).character.alive, 6, { from: 701, tries: 20, label: 'notice titles: rich lives' })
      // A founder who can open four companies in the country they were born in.
      const founder = findSeeds(
        (s) => {
          try {
            probeLife({ seed: s, birthYear: 1990, businesses: 4, years: 0 })
            return true
          } catch {
            return false
          }
        },
        4,
        { from: 801, tries: 100, label: 'notice titles: founders of four companies' },
      )

      const seen: Seen[] = []
      const takePlayed = (seed: number, i: number, isRich: boolean): void => {
        const { years } = playLife({ seed, birthYear: BIRTH_YEARS[i % BIRTH_YEARS.length]!, untilAge: UNTIL_AGE, rich: isRich })
        for (const y of years) {
          for (const p of y.popups) {
            if (p.kind !== 'notice') continue
            const m = p.item as NoticeModal
            seen.push({ title: p.title, passive: p.passive, text: p.text, tone: p.tone, support: p.support, s: m.s })
          }
        }
      }
      ordinary.forEach((seed, i) => takePlayed(seed, i, false))
      rich.forEach((seed, i) => takePlayed(seed, i, true))
      // probeLife never answers a popup, so every notice in its queue after a year arrived by itself.
      founder.forEach((seed) => {
        probeLife({
          seed,
          birthYear: 1990,
          businesses: 4,
          years: UNTIL_AGE - 30,
          keepAlive: true,
          onYear: (g, yearsPlayed) => {
            if (yearsPlayed === 0) return
            for (const m of g.queue) {
              if (m.kind !== 'notice') continue
              seen.push({ title: m.title, passive: true, text: m.text, tone: m.tone, support: m.support, s: m.s })
            }
          },
        })
      })

      const all = tally(seen)
      const file: TitleFile = {
        v: 1,
        seeds: { ordinary, rich, founder },
        untilAge: UNTIL_AGE,
        notices: seen.length,
        passiveNotices: seen.filter((n) => n.passive).length,
        titles: all.length,
        rows: all.slice(0, MAX_ROWS),
      }
      writeFileSync(FIXTURE, `${JSON.stringify(file, null, 2)}\n`)
      console.log(`notices ${seen.length} (${file.passiveNotices} passive) in ${all.length} titles`)
      expect(file.rows.length).toBeGreaterThan(0)
    },
    1_500_000,
  )
})
