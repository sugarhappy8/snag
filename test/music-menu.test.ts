// Music 2.0, Task 8: the report card, Label & Contract, Charts & Finances and the master buy-back. Every row
// reads the record through `view`, `standingOf`, `activeField`, `formatMix` and `tourModel`, so a double render
// on a frozen state writes nothing and draws no g.rng. The buy-back charges exactly the price the row prints and
// turns a ledger row into an inheritable master, and its sale value stays under that price.
import { afterEach, describe, expect, it } from 'vitest'
import { economyOf } from '../src/game/economy/model'
import { continueAsChild } from '../src/game/life'
import { createPerson } from '../src/game/people'
import { hasTalent } from '../src/game/talents'
import { hire, money, ownerKey, compact } from '../src/game/special/common'
import { activeField, standingOf } from '../src/game/special/kit/rivals'
import { appointmentId } from '../src/game/special/kit/state'
import { careerCtx, setCareerAudit, type AuditEvent } from '../src/game/special/kit/year'
import { musicJobNodes } from '../src/game/special/music'
import { attentionOf } from '../src/game/special/music-label'
import { genreAt, formatMix, MUSIC_SPEC, nextNet, stepCatalogue, waterfall } from '../src/game/special/music-market'
import { musicProfile, type Release } from '../src/game/special/music-job'
import { buybackAction, buybackListed, buybackTerms, chartsMenu, labelMenu, musicNodes, musicStanding } from '../src/game/special/music-menu'
import { adoptMaster, musicMaster, sellMusicMaster, yearlyMusicRights } from '../src/game/special/music-rights'
import { adoptMusic, musicScore, musicStore, type LabelDeal, type LedgerRow } from '../src/game/special/music-state'
import type { GameState, Job, Json, MenuAction, MenuGroup, MenuNode } from '../src/game/types'
import { assertMenuPure, careerRoots, checkLedger, finiteJson, voiceProblems } from './career-kit'
import { deepFreeze } from './fuzz-kit'
import { makeTestGame } from './helpers'

afterEach(() => setCareerAudit(null))

// Built from code points, so the literals never appear in this file (the repo bans both dashes).
const EN_DASH = String.fromCharCode(0x2013)
const EM_DASH = String.fromCharCode(0x2014)

const SOLO = { mode: 'solo', instrument: 'Guitar', genre: 'Pop', label: null, contractYears: 0, advancePerYear: 0, popularity: 60, bandName: null, bandmates: [], members: 1, recordedAge: -1, lastRelease: -1 }

/** The state without the queue, the log, the id counter and the engine's record of resolved modals: what a refusal must leave alone. */
const snap = (g: GameState): string => JSON.stringify({ ...g, queue: [], log: [], nextId: 0, flags: Object.fromEntries(Object.entries(g.flags).filter(([k]) => k !== 'core.resolvedScriptModals')) })

function release(title: string, age: number, quality: number): Release {
  return { title, type: 'Studio Album', genre: 'Pop', subgenre: 'Dance', age, sold: 100_000, earned: 20_000, cert: null, quality, royalty: 0 }
}

/**
 * A ledger row as the catalogue would have left it: it settled last year, so `lastLabel` is the label's real take
 * of that statement (kept plus recouped), priced by the same waterfall the sim pays with.
 */
function ledgerRow(g: GameState, o: Partial<LedgerRow> & { id: string }): LedgerRow {
  const row: LedgerRow = { title: 'Old Hit', type: 'studio', year: 1993, fmt: 'cd', units0: 100_000, k: 0.4, pay: 1, quality: 70, peak: 0, dealId: 'd1', label: 'Echo Chamber Records', rate: 0.16, members: 1, samples: 'original', gross: 0, paid: 0, lastLabel: 0, lastYear: g.year - 1, adopted: false, legacy: false, ...o }
  const units = Math.round(row.units0 * row.k ** Math.max(0, row.lastYear - row.year))
  const w = waterfall(row, units, formatMix('us', row.lastYear), null)
  if (!o.gross) row.gross = w.gross
  if (!o.paid) row.paid = w.paid
  if (o.lastLabel === undefined) row.lastLabel = w.kept + w.recoup
  return row
}

function dealOn(job: Job, o: Partial<LabelDeal> = {}): LabelDeal {
  return { id: 'd1', appt: appointmentId(job), labelId: 'echo-chamber-records', label: 'Echo Chamber Records', tier: 1, since: 1994, term: 3, years: 2, royalty: 0.16, advance: 90_000, perYear: 30_000, unrecouped: 30_000, trust: 60, legacy: false, renewals: 0, ...o }
}

/**
 * A 1995 life with a signed deal (Echo Chamber Records, 2 of 3 years left, 30,000 unrecouped), a legacy discography of
 * three releases, a tour row and an award line, and seven ledger rows: two listed for a buy-back (r1, r2), one too new
 * (r3, 'Old Hit' charted #3), one already adopted (r4), one legacy (r5), one dead under 50 units (r6) and a second
 * listed row (r7) with a peak.
 */
function richLife(seed = 1): GameState {
  const g = makeTestGame(seed, { age: 30 })
  g.year = 1995
  g.character.money = 500_000
  g.character.hidden.fame = 40
  g.flags.instruments = { Guitar: 60 }
  const { job } = hire(g, { defId: 'musician', title: 'Solo Artist', company: 'Echo Chamber Records', salary: 30_000, data: { ...SOLO, label: 'Echo Chamber Records', contractYears: 2, advancePerYear: 0, recordedAge: 29, lastRelease: 29 } as Record<string, Json> })
  const p = musicProfile(g)
  p.discography.push(release('Night Bus', 27, 55), release('Paper Hearts', 28, 62), release('Old Hit', 29, 70))
  p.awards.push('Golden Record Award for Album of the Year, "Paper Hearts" (age 28)')
  const s = musicStore.mut(g)
  adoptMusic(g, s)
  s.deal = dealOn(job)
  s.ledger = [
    ledgerRow(g, { id: 'r1', title: 'Night Bus', year: 1992, peak: 7 }),
    ledgerRow(g, { id: 'r2', title: 'Paper Hearts', year: 1993, peak: 12, units0: 80_000 }),
    ledgerRow(g, { id: 'r3', title: 'Old Hit', year: 1994, peak: 3 }),
    ledgerRow(g, { id: 'r4', title: 'Gold Echoes', year: 1992, adopted: true }),
    ledgerRow(g, { id: 'r5', title: 'Early Demo', year: 1991, legacy: true, rate: 0.6, dealId: 'legacy' }),
    ledgerRow(g, { id: 'r6', title: 'Lost Tape', year: 1990, units0: 400 }),
    ledgerRow(g, { id: 'r7', title: 'Side B', year: 1992, peak: 0, k: 0.5, units0: 60_000, dealId: '', label: '', rate: 0.21 }),
  ]
  s.tours = [{ year: 1993, tier: 'club', shows: 24, gate: 120_000, costs: 90_000, net: 30_000 }]
  s.awards = ['"Paper Hearts" won the Golden Record Award for Album of the Year at age 28.']
  s.standing = musicScore(g, s)
  return g
}

/** A legacy labelled solo: Garage Door Records, three years, $10,000 a year, and no sim record. */
function legacyLife(): GameState {
  const g = makeTestGame(3, { age: 25 })
  g.flags.instruments = { Guitar: 55 }
  g.character.money = 100_000
  hire(g, { defId: 'musician', title: 'Solo Artist', company: 'Garage Door Records', salary: 10_000, data: { ...SOLO, label: 'Garage Door Records', contractYears: 3, advancePerYear: 10_000, popularity: 30 } as Record<string, Json> })
  return g
}

function band(): GameState {
  const g = makeTestGame(4, { age: 25 })
  g.year = 1995
  g.flags.instruments = { Guitar: 55 }
  hire(g, { defId: 'musician', title: 'Guitarist', company: 'The Neon Wolves', salary: 0, data: { ...SOLO, mode: 'band', bandName: 'The Neon Wolves', members: 3, popularity: 40 } as Record<string, Json> })
  adoptMusic(g, musicStore.mut(g))
  return g
}

/** A hand-written legacy job with no profile and no record at all. */
function bare(): GameState {
  const g = makeTestGame(5, { age: 25 })
  hire(g, { defId: 'musician', title: 'Solo Artist', company: 'Independent', salary: 0, data: { ...SOLO } as Record<string, Json> })
  return g
}

function junk(): GameState {
  const g = richLife(6)
  const wide = 'x'.repeat(10_000)
  g.flags['special.music'] = { discography: 'bad', awards: 5, burnedLabels: {}, tours: Number.NaN, stageName: wide }
  g.flags['special.music.sim'] = {
    v: 1,
    owner: ownerKey(g),
    deal: { id: wide, label: wide, tier: 99, years: 'x', royalty: Number.NaN, perYear: 1e300 },
    ledger: Array.from({ length: 500 }, (_, i) => ({ id: `j${i}`, title: wide, year: Number.NaN, units0: 1e300, k: 'x', peak: -4 })),
    history: [1, {}, { label: wide }],
    tours: 5,
    mods: [{ kind: 'x' }],
    policy: 'bad',
    awards: [1, 2, wide],
    rows: 'bad',
    memory: [{ id: 3 }],
  } as unknown as Json
  return g
}

// ---------------------------------------------------------------------------
// Reading the menus

function find(nodes: MenuNode[], id: string): MenuNode | undefined {
  for (const n of nodes) if (n.id === id) return n
  return undefined
}

const action = (nodes: MenuNode[], id: string): MenuAction => {
  const n = find(nodes, id)
  expect(n?.type).toBe('action')
  return n as MenuAction
}

const infoText = (g: GameState, n: MenuNode): string => (n.type === 'info' ? (typeof n.text === 'function' ? n.text(g) : n.text) : '')
const subtitleOf = (g: GameState, n: MenuNode): string => (n.type === 'action' || n.type === 'menu' ? (typeof n.subtitle === 'function' ? n.subtitle(g) : (n.subtitle ?? '')) : '')
const infos = (g: GameState, nodes: MenuNode[]): string[] => nodes.filter((n) => n.type === 'info').map((n) => infoText(g, n))
const listedRows = (g: GameState): LedgerRow[] => musicStore.view(g).ledger.filter((r) => buybackListed(g, r))
const labelNodes = (g: GameState): MenuNode[] => labelMenu().children(g)
const chartNodes = (g: GameState): MenuNode[] => chartsMenu().children(g)

interface Seen {
  infos: string[]
  subtitles: string[]
  hints: string[]
  labels: string[]
  headings: string[]
}

/** Every string a player can read from the nodes, down the open groups. */
function readAll(g: GameState, nodes: MenuNode[], depth = 0, out: Seen = { infos: [], subtitles: [], hints: [], labels: [], headings: [] }): Seen {
  for (const n of nodes) {
    if (n.type === 'heading') {
      out.headings.push(n.label)
      continue
    }
    if (n.type === 'info') {
      out.infos.push(infoText(g, n))
      continue
    }
    out.labels.push(n.label)
    const sub = subtitleOf(g, n)
    if (sub) out.subtitles.push(sub)
    const hint = n.hint?.(g)
    if (hint) out.hints.push(hint)
    if (n.type === 'action') n.confirm?.(g)
    else if (depth < 4) readAll(g, n.children(g), depth + 1, out)
  }
  return out
}

describe('the music menus', () => {
  it('renders every music menu twice on a frozen state with no write and no rng [RF4]', () => {
    const lives: [string, GameState][] = [['rich', richLife()], ['legacy labelled', legacyLife()], ['band', band()], ['no record', bare()], ['junk', junk()]]
    for (const [name, g] of lives) {
      expect(() => assertMenuPure(g, careerRoots('music')), name).not.toThrow()
      expect(() => assertMenuPure(g, musicNodes), name).not.toThrow()
      // the junk life holds NaN on purpose (it is the input); the others must stay clean
      if (name !== 'junk') expect(finiteJson(g), name).toEqual([])
    }
    // the same on a state frozen by hand, reading the new rows directly
    const frozen = deepFreeze(structuredClone(richLife()))
    const json = JSON.stringify(frozen)
    const rng = frozen.rng
    const seen = readAll(frozen, musicNodes(frozen))
    expect(seen.infos.length).toBeGreaterThan(10)
    expect(JSON.stringify(frozen)).toBe(json)
    expect(frozen.rng).toBe(rng)
  })

  it('wires the new rows into the job menu right after the status row', () => {
    const g = richLife()
    const ids = musicJobNodes(g).map((n) => n.id)
    const at = ids.indexOf('music.status')
    expect(at).toBeGreaterThanOrEqual(0)
    expect(ids.slice(at + 1, at + 5)).toEqual(['music.standing', 'music.label', 'music.charts', 'music.plan'])
    expect(ids).toContain('music.tour')
    expect(ids).toContain('music.discography')
    expect(musicStanding.id).toBe('music.standing')
    expect(musicNodes(g).map((n) => n.id)).toEqual(['music.standing', 'music.label', 'music.charts', 'music.plan'])
    // no musician job, no rows
    const free = makeTestGame(8, { age: 30 })
    expect(musicJobNodes(free)).toEqual([])
  })

  it('shows the label menu from view: years left, royalty, advance paid, unrecouped, trust, attention, past deals and the legacy line while grandfathered', () => {
    const g = richLife()
    const s = musicStore.view(g)
    const deal = s.deal!
    const menu = labelMenu()
    expect(menu.id).toBe('music.label')
    expect(menu.label).toBe('Label & Contract')
    expect(subtitleOf(g, menu)).toBe('Echo Chamber Records, 2 years left')
    const nodes = menu.children(g)
    expect(infos(g, nodes).slice(0, 7)).toEqual([
      'Echo Chamber Records, 2 years left.',
      'Royalty 16% of net.',
      `Advance paid ${money(30_000)} of ${money(90_000)}.`,
      `Unrecouped ${money(30_000)}.`,
      'Label trust 60 of 100.',
      `Label attention ${attentionOf(g, s, deal).toFixed(2)}.`,
      'Masters stay with the label.',
    ])
    // past deals, from the history
    const live = musicStore.mut(g)
    live.history = [{ label: 'Garage Door Records', from: 1988, to: 1991, ended: 'expired', forgiven: 12_000 }]
    expect(infos(g, labelNodes(g))).toContain('Garage Door Records, 1988 to 1991, expired.')

    // a one year term reads as one year
    live.deal!.years = 1
    expect(subtitleOf(g, menu)).toBe('Echo Chamber Records, 1 year left')
    expect(infos(g, labelNodes(g))[0]).toBe('Echo Chamber Records, 1 year left.')

    // a grandfathered life: no royalty, advance or unrecouped line, the legacy line instead
    const old = legacyLife()
    const lines = infos(old, labelNodes(old))
    expect(lines[0]).toBe('Garage Door Records, 3 years left.')
    expect(lines).toContain(`Legacy terms hold until the term ends. You keep the old salary and ${money(1)} a copy.`)
    expect(lines.some((l) => l.startsWith('Royalty'))).toBe(false)
    expect(lines.some((l) => l.startsWith('Advance paid'))).toBe(false)
    expect(lines.some((l) => l.startsWith('Unrecouped'))).toBe(false)
    expect(lines).toContain('Label trust 55 of 100.')
    expect(JSON.stringify(old.flags)).not.toContain('music.sim') // reading it wrote nothing

    // no deal: the one line, and the group says so
    const free = band()
    expect(infos(free, labelNodes(free))).toEqual(['No label deal. Releases pay 21% of net.'])
    expect(subtitleOf(free, labelMenu())).toBe('No label deal')
    const none = bare()
    expect(infos(none, labelNodes(none))).toEqual(['No label deal. Releases pay 21% of net.'])
  })

  it('lists one buy-back row per release the label still holds and prices it from buybackTerms', () => {
    const g = richLife()
    const ids = labelNodes(g).filter((n) => n.id.startsWith('music.buyback.')).map((n) => n.id)
    // r1, r2 and r7 are two or more years old, not adopted, not legacy and still sell 50 units next year
    expect(ids.sort()).toEqual(['music.buyback.r1', 'music.buyback.r2', 'music.buyback.r7'])
    expect(listedRows(g).map((r) => r.id).sort()).toEqual(['r1', 'r2', 'r7'])
    const rows = Object.fromEntries(musicStore.view(g).ledger.map((r) => [r.id, r]))
    expect(buybackListed(g, rows.r3)).toBe(false) // a year old
    expect(buybackListed(g, rows.r4)).toBe(false) // already adopted
    expect(buybackListed(g, rows.r5)).toBe(false) // legacy
    expect(buybackListed(g, rows.r6)).toBe(false) // under 50 units next year
    expect(buybackListed(g, { ...rows.r1, year: g.year - 2 })).toBe(true)
    expect(buybackListed(g, { ...rows.r1, year: g.year - 1 })).toBe(false)
    for (const id of ['r1', 'r2', 'r7']) {
      const row = rows[id]
      const t = buybackTerms(g, row)
      const node = action(labelNodes(g), `music.buyback.${id}`)
      expect(node.label).toBe(`Buy Back "${row.title}"`)
      expect(subtitleOf(g, node)).toBe(`Price ${money(t.price)}, first payment about ${money(t.firstPayment)}`)
      expect(node.disabledReason?.(g)).toBeNull()
    }
    // the price, the audience and the first payment, from the same function
    const t = buybackTerms(g, rows.r1)
    expect(t.price).toBe(Math.max(2_000, rows.r1.lastLabel))
    expect(t.audience).toBe(Math.round(1.6 * nextNet(g, rows.r1)))
    const leisure = Math.min(1.5, Math.max(0.2, economyOf(g, 'us').sectors.leisure.demand))
    expect(t.firstPayment).toBe(Math.round(0.75 * 0.9 * t.audience * leisure))
    // a legacy life has no ledger and so no row
    const old = legacyLife()
    expect(labelNodes(old).some((n) => n.id.startsWith('music.buyback.'))).toBe(false)
  })

  it('prints the chart honestly: the rank for everyone, the act at that rank only with Music', () => {
    const g = richLife()
    const s = musicStore.view(g)
    const st = standingOf(g, MUSIC_SPEC, musicScore(g, s), s.memory)
    const field = activeField(g, MUSIC_SPEC, s.memory)
    const menu = chartsMenu()
    expect(menu.id).toBe('music.charts')
    expect(menu.label).toBe('Charts & Finances')
    const nodes = menu.children(g)
    const lines = infos(g, nodes)
    expect(lines).toContain(`You chart about #${st.rank} today.`)
    // the top ten, best first, genres through genreAt
    const top = lines.filter((l) => /^\d+\. /.test(l))
    expect(top).toHaveLength(10)
    top.forEach((l, i) => {
      const f = field[i]
      expect(l).toBe(`${i + 1}. ${f.rival.name}, ${genreAt(f.rival.edge, g.year)}, score ${f.score}`)
    })
    const scores = top.map((l) => Number(l.split('score ')[1]))
    expect([...scores].sort((a, b) => b - a)).toEqual(scores)
    // a player with no talent never sees the act at their rank
    expect(hasTalent(g, 'Music')).toBe(false)
    expect(lines.some((l) => l.startsWith('The act at'))).toBe(false)
    // a talent does, when the rank is within the 24 visible acts
    g.character.talent = 'Music'
    expect(hasTalent(g, 'Music')).toBe(true)
    const talent = infos(g, chartNodes(g))
    const act = field[st.rank - 1]
    if (act) expect(talent).toContain(`The act at #${st.rank} sits near ${act.score}.`)
    else expect(talent.some((l) => l.startsWith('The act at'))).toBe(false)
    // a top-of-the-chart act is always within the field: lift the score until the rank is 1
    const star = richLife()
    star.character.hidden.fame = 100
    const fs = musicStore.mut(star)
    fs.memory = []
    musicProfile(star).discography.push(release('Smash', 29, 100))
    star.character.talent = 'Music'
    const sst = standingOf(star, MUSIC_SPEC, musicScore(star, fs), fs.memory)
    if (sst.rank <= 24) expect(infos(star, chartNodes(star))).toContain(`The act at #${sst.rank} sits near ${activeField(star, MUSIC_SPEC, fs.memory)[sst.rank - 1].score}.`)
  })

  it('shows the last peak, the format mix, the last statement and the newest six releases', () => {
    const g = richLife()
    const s = musicStore.mut(g)
    s.rows = [{ y: 1994, income: 55_000, spent: 0, rank: 9, of: 38, standing: 60, note: '2 releases paid royalties.' }]
    const nodes = chartNodes(g)
    const lines = infos(g, nodes)
    // the newest row with a peak is Old Hit (#3)
    expect(lines).toContain('Your last peak: #3.')
    const mix = formatMix('us', 1995)
    const expected = (Object.entries(mix) as [string, number][])
      .filter(([, v]) => Math.round(v * 100) >= 1)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${Math.round(v * 100)}% ${{ shellac: 'shellac', vinyl: 'vinyl', tape: 'tape', cd: 'CD', download: 'download', stream: 'stream' }[k]}`)
    expect(lines).toContain(`Formats: ${expected.join(', ')}.`)
    expect(expected[0]).toMatch(/CD$/)
    expect(lines).toContain(`1994 Royalties ${money(55_000)}, spent ${money(0)}.`)
    expect(lines).toContain('Rank 9 of 38.')
    expect(lines).toContain('2 releases paid royalties.')
    const rows = lines.filter((l) => /^\d{4} "/.test(l))
    expect(rows).toHaveLength(6)
    const newest = s.ledger[s.ledger.length - 1]
    expect(rows[0]).toBe(`${newest.year} "${newest.title}": ${compact(newest.units0)} units, paid ${money(newest.paid)}, label share ${money(newest.lastLabel)}.`)
    // no peak and no statement yet
    const fresh = band()
    const bare2 = infos(fresh, chartNodes(fresh))
    expect(bare2).toContain('No chart entry yet.')
    expect(bare2).toContain('No statement yet.')
    // no chart at all before 1900
    const early = band()
    early.year = 1850
    expect(infos(early, chartNodes(early))).toContain('No chart exists yet.')
  })

  it('prices the buy-back from one function and charges exactly the price [RF5]', () => {
    const g = richLife()
    const row = musicStore.view(g).ledger.find((r) => r.id === 'r1')!
    const t = buybackTerms(g, row)
    const events: AuditEvent[] = []
    setCareerAudit((e) => events.push(e))
    const node = action(labelNodes(g), 'music.buyback.r1')
    const cash = g.character.money
    node.run(g)
    expect(cash - g.character.money).toBe(t.price)
    expect(events.filter((e) => e.t === 'pay')).toEqual([{ t: 'pay', career: 'music', label: 'Master buy-back', amount: t.price }])
    expect(events.filter((e) => e.t === 'earn')).toEqual([])
    expect(checkLedger(events, g)).toEqual([])
    setCareerAudit(null)
    // a released master the player owns, priced and sized by the terms
    const a = g.assets.find((x) => musicMaster(x))!
    expect(a).toBeTruthy()
    const m = musicMaster(a)!
    expect(a.name).toBe('Night Bus')
    expect(m.stage).toBe('released')
    expect(m.audience).toBe(t.audience)
    expect(m.quality).toBe(row.quality)
    expect(m.released).toBe(g.year)
    expect(m.lastYear).toBe(g.year)
    expect(m.author).toBe(g.character.id)
    expect(m.country).toBe(g.character.countryId)
    expect(m.licenseUntil).toBe(0)
    expect(a.purchasePrice).toBe(t.price)
    expect(m.spent).toBe(t.price)
    expect(a.value).toBe(Math.round(t.audience * 0.8))
    expect(a.kind).toBe('other')
    // the row stops paying through the ledger
    const live = musicStore.peek(g)!
    expect(live.ledger.find((r) => r.id === 'r1')!.adopted).toBe(true)
    expect(listedRows(g).map((r) => r.id)).not.toContain('r1')
    expect(find(labelNodes(g), 'music.buyback.r1')).toBeUndefined()
    // a replay of the same row changes nothing
    const before = snap(g)
    node.run(g)
    expect(snap(g)).toBe(before)
    expect(g.assets.filter((x) => musicMaster(x))).toHaveLength(1)
    // next year the ledger pays the others and never that row; the rights pay the master
    g.year += 1
    g.character.age += 1
    g.yearActions = {}
    const paidBefore = live.ledger.map((r) => r.paid)
    const c = careerCtx(g, 'music', musicStore.mut(g))
    const totals = stepCatalogue(c)
    const after = musicStore.peek(g)!.ledger
    expect(after.find((r) => r.id === 'r1')!.paid).toBe(paidBefore[0])
    expect(after.find((r) => r.id === 'r1')!.lastYear).toBe(1994)
    expect(after.find((r) => r.id === 'r2')!.paid).toBeGreaterThan(paidBefore[1])
    // r1 is the player's now, r4 is adopted, r5 is legacy and r6 is dead: r2, r3 and r7 pay
    expect(totals.rows).toBe(3)
  })

  it('pays an adopted master through yearlyMusicRights from the next year, near the first payment the row printed', () => {
    const g = richLife()
    const row = musicStore.view(g).ledger.find((r) => r.id === 'r1')!
    const t = buybackTerms(g, row)
    action(labelNodes(g), 'music.buyback.r1').run(g)
    const a = g.assets.find((x) => musicMaster(x))!
    // the year it is bought nothing is paid again
    const cash = g.character.money
    yearlyMusicRights(g)
    expect(g.character.money).toBe(cash)
    g.year += 1
    g.character.age += 1
    g.yearActions = {}
    const leisure = Math.min(1.5, Math.max(0.2, economyOf(g, 'us').sectors.leisure.demand))
    const before = g.character.money
    yearlyMusicRights(g)
    const got = g.character.money - before
    // units = audience x leisure x (0.6 to 1.2) at 75% of a copy, so the printed 0.9 sits in the middle of the range
    expect(got).toBeGreaterThanOrEqual(Math.floor(0.75 * 0.6 * t.audience * leisure) - 1)
    expect(got).toBeLessThanOrEqual(Math.ceil(0.75 * 1.2 * t.audience * leisure) + 1)
    expect(musicMaster(a)!.lastYear).toBe(g.year)
    // not twice in a year
    const once = g.character.money
    yearlyMusicRights(g)
    expect(g.character.money).toBe(once)
  })

  it('refuses a buy-back the player cannot pay for and changes nothing', () => {
    const g = richLife()
    const row = musicStore.view(g).ledger.find((r) => r.id === 'r1')!
    const t = buybackTerms(g, row)
    g.character.money = t.price - 1
    const node = action(labelNodes(g), 'music.buyback.r1')
    expect(node.disabledReason?.(g)).toBe(`You need ${money(t.price)} to buy it back.`)
    const before = snap(g)
    node.run(g)
    expect(snap(g)).toBe(before)
    expect(g.assets).toHaveLength(0)
    expect(musicStore.peek(g)!.ledger.find((r) => r.id === 'r1')!.adopted).toBe(false)
    // a row that is not listed, built by hand, is refused the same way
    const dead = buybackAction({ ...row, id: 'r6' })
    expect(dead.disabledReason?.(g)).toBe("The label won't sell that one.")
    const ghost = buybackAction({ ...row, id: 'nope' })
    expect(ghost.disabledReason?.(g)).toBe("That release isn't in your catalogue.")
    const before2 = snap(g)
    ghost.run(g)
    dead.run(g)
    expect(snap(g)).toBe(before2)
    // with exactly the price it goes through
    g.character.money = t.price
    node.run(g)
    expect(g.character.money).toBe(0)
    expect(g.assets).toHaveLength(1)
  })

  it('keeps sale value under the price, so a buy-back never flips', () => {
    for (const seed of [1, 2, 3]) {
      const g = richLife(seed)
      const rows = listedRows(g)
      expect(rows.length).toBeGreaterThan(0)
      for (const row of rows) {
        const t = buybackTerms(g, row)
        const c = structuredClone(g)
        const a = adoptMaster(c, { title: row.title, quality: row.quality, audience: t.audience }, t.price)
        const cash = c.character.money
        expect(sellMusicMaster(c, a.id)).toBe(true)
        expect(c.character.money - cash, `${row.id} sells for less than it costs`).toBeLessThan(t.price)
      }
    }
  })

  it('adoptMaster pays nothing and writes a released master with the price as its cost', () => {
    const g = richLife()
    const cash = g.character.money
    const next = g.nextId
    const a = adoptMaster(g, { title: 'A'.repeat(120), quality: 140, audience: 5e12 }, 9_000)
    expect(g.character.money).toBe(cash)
    expect(g.assets).toContain(a)
    expect(g.nextId).toBe(next + 1)
    const m = musicMaster(a)!
    expect(m).toMatchObject({ v: 1, stage: 'released', released: g.year, lastYear: g.year, spent: 9_000, distribution: 'domestic', receipts: 0, copies: 0, unrecouped: 0, advance: 0, marketing: 0 })
    expect(m.quality).toBe(100)
    expect(m.audience).toBeLessThanOrEqual(1e8)
    expect(a.name.length).toBeLessThanOrEqual(80)
    expect(a.purchasePrice).toBe(9_000)
    expect(a.value).toBe(Math.round(m.audience * 0.8))
    expect(a.condition).toBe(100)
    expect(finiteJson(g)).toEqual([])
  })

  it('lets an heir inherit the master and read an empty record [RF1]', () => {
    const g = richLife()
    action(labelNodes(g), 'music.buyback.r1').run(g)
    const mine = g.assets.find((x) => musicMaster(x))!
    const p = createPerson(g, { relation: 'child', age: 25, firstName: 'Heir', livesWithPlayer: true })
    p.relationship = 90
    g.character.willBeneficiaries = [p.id]
    g.character.alive = false
    const n = continueAsChild(g, p.id)
    expect(n).not.toBe(g)
    const asset = n.assets.find((x) => x.id === mine.id && musicMaster(x))
    expect(asset).toBeTruthy()
    // the label-held rows end with the life: the heir reads an empty record
    expect(musicStore.has(n)).toBe(false)
    expect(musicStore.peek(n)).toBeNull()
    // and collects the rights, once a year
    n.queue = []
    n.year += 1
    n.yearActions = {}
    const cash = n.character.money
    yearlyMusicRights(n)
    expect(n.character.money).toBeGreaterThan(cash)
    expect(musicStore.has(n)).toBe(false)
  })

  it('the discography lists sim awards and the chart peak', () => {
    const g = richLife()
    const menu = musicJobNodes(g).find((n) => n.id === 'music.discography') as MenuGroup
    const nodes = menu.children(g)
    const lines = infos(g, nodes)
    // Old Hit (age 29) is the 1994 row that charted #3; Night Bus (age 27) is the 1992 row at #7
    expect(lines.find((l) => l.includes('"Old Hit"'))).toContain(' · #3')
    expect(lines.find((l) => l.includes('"Night Bus"'))).toContain(' · #7')
    // Paper Hearts charted #12, the ledger keeps it and the line shows it
    expect(lines.find((l) => l.includes('"Paper Hearts"'))).toContain(' · #12')
    // a release with no ledger row shows no peak
    const p = musicProfile(g)
    p.discography.push(release('No Row', 20, 50))
    expect(infos(g, menu.children(g)).find((l) => l.includes('"No Row"'))).not.toContain('#')
    // the legacy award keeps its id; the sim awards follow with their own
    expect(find(nodes, 'music.a.0') && infoText(g, find(nodes, 'music.a.0')!)).toBe('Golden Record Award for Album of the Year, "Paper Hearts" (age 28)')
    expect(infoText(g, find(nodes, 'music.sa.0')!)).toBe('"Paper Hearts" won the Golden Record Award for Album of the Year at age 28.')
    const order = nodes.map((n) => n.id)
    expect(order.indexOf('music.a.0')).toBeLessThan(order.indexOf('music.sa.0'))
    // an old save with no record lists the legacy lines and no peak
    const old = legacyLife()
    musicProfile(old).discography.push(release('Demo', 24, 40))
    const oldMenu = musicJobNodes(old).find((n) => n.id === 'music.discography') as MenuGroup
    expect(infos(old, oldMenu.children(old)).find((l) => l.includes('"Demo"'))).not.toContain('#')
  })

  it('keeps every menu string in voice and under 90 characters', () => {
    for (const g of [richLife(), legacyLife(), band(), bare(), junk()]) {
      const seen = readAll(g, musicNodes(g))
      expect(seen.infos.length).toBeGreaterThan(0)
      for (const text of seen.infos) {
        expect(text.length, text).toBeLessThanOrEqual(90)
        expect(voiceProblems(text, 'outcome'), text).toEqual([])
      }
      for (const text of [...seen.subtitles, ...seen.hints]) {
        expect(text.length, text).toBeLessThanOrEqual(120)
        expect(voiceProblems(text, 'outcome'), text).toEqual([])
      }
      for (const text of [...seen.infos, ...seen.subtitles, ...seen.hints, ...seen.labels, ...seen.headings]) {
        expect(text, 'no hole in the text').not.toMatch(/\bNaN\b|\bundefined\b|\[object Object\]|-?Infinity/)
        expect(text).not.toContain(EN_DASH)
        expect(text).not.toContain(EM_DASH)
      }
    }
    // the talent hint of the plan row reaches the player in voice too
    const g = richLife()
    g.character.talent = 'Music'
    const seen = readAll(g, musicNodes(g))
    expect(seen.hints.length).toBeGreaterThan(0)
    for (const h of seen.hints) expect(voiceProblems(h, 'outcome'), h).toEqual([])
  })

  it('names only the formats of the era, in shares that sum to about 100', () => {
    const g = richLife()
    const line = infos(g, chartNodes(g)).find((l) => l.startsWith('Formats: '))!
    const shares = [...line.matchAll(/(\d+)% /g)].map((m) => Number(m[1]))
    expect(shares.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(96)
    expect(shares.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(104)
    expect(line).not.toMatch(/stream/) // 1995 has no streaming
    const modern = richLife()
    modern.year = 2026
    expect(infos(modern, chartNodes(modern)).find((l) => l.startsWith('Formats: '))).toMatch(/stream/)
  })
})
