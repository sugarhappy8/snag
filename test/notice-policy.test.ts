// R1-T5 (G.11 step 2, D.11 criterion 8): the never-route policy. A notice may wait in the inbox only when it is minor
// AND nothing about it needs the player right now: no support line, no bad tone, no health or legal word, no large
// figure. Everything the policy decides is pure, so these tests walk a table (test/notice-table.ts, shared with the
// store and the acceptance sweep) and freeze the inputs to prove nothing is written.
import { describe, expect, it } from 'vitest'
import { formatMoney } from '../src/game/core'
import { HEALTH_RE, LARGE_FIGURE, LEGAL_RE, largestFigure, neverRoute, routesToInbox } from '../src/game/notice-policy'
import type { ChoiceModal, InputModal, MinigameModal, AiTaskModal, NoticeModal } from '../src/game/types'
import { deepFreeze } from './fuzz-kit'
import { NEVER_ROUTE_TABLE, noticeOfRow } from './notice-table'

/** The words of the health rule, each in a form the rule must catch (a prefix rule gets one or two forms). */
const HEALTH_WORDS = [
  'health', 'sick', 'sickness', 'ill', 'illness', 'disease', 'diagnosed', 'diagnosis', 'hospital', 'surgery', 'surgeon',
  'doctor', 'nurse', 'injured', 'injury', 'injuries', 'wounded', 'wound', 'cancer', 'infection', 'infected', 'flu', 'fever',
  'virus', 'symptom', 'symptoms', 'pregnant', 'pregnancy', 'miscarriage', 'overdose', 'rehab', 'addict', 'addicted',
  'addiction', 'therapy', 'therapist', 'depressed', 'depression', 'anxiety', 'panic', 'medic', 'medical', 'medication',
  'medicine', 'pill', 'pills', 'pain', 'hurt', 'accident', 'ambulance', 'emergency', 'died', 'dies', 'death', 'dead',
  'dying', 'funeral',
  // Plurals and other endings of the same words, and the obvious words the first list missed.
  'doctors', 'hospitals', 'hospitalized', 'hospitalised', 'hospitalization', 'nurses', 'surgeries', 'surgeons', 'cancers',
  'deaths', 'deathbed', 'accidents', 'killed', 'kills', 'killing', 'killer', 'kill', 'die', 'diseases', 'diseased', 'illnesses',
  'infections', 'viruses', 'fevers', 'overdosed', 'overdoses', 'overdosing', 'stroke', 'strokes', 'heart', 'hearts', 'suicide',
  'suicidal', 'seizure', 'seizures', 'coma', 'bleeding', 'bleeds', 'bled', 'fatal', 'fatally', 'deadly', 'lethal', 'tumor', 'tumors',
  'tumour', 'chemo', 'chemotherapy', 'hospice', 'funerals', 'harm', 'harmed', 'harms', 'harming', 'painful', 'pains',
  'hurting', 'hurts', 'ambulances', 'emergencies', 'pregnancies', 'addicts', 'addicted', 'depressed', 'medicines',
]

/** The same for the legal rule. */
const LEGAL_WORDS = [
  'arrest', 'arrested', 'arrests', 'police', 'cop', 'cops', 'court', 'judge', 'jury', 'lawsuit', 'sue', 'sued', 'suing',
  'trial', 'convict', 'convicted', 'conviction', 'prison', 'jail', 'sentence', 'sentenced', 'warrant', 'lawyer', 'attorney',
  'legal', 'illegal', 'crime', 'criminal', 'investigate', 'investigated', 'investigation', 'fine', 'fined', 'fines',
  'penalty', 'probation', 'parole', 'bail', 'audit', 'audited', 'fraud', 'charged', 'indicted', 'indictment', 'subpoena',
  'deport', 'deported', 'deportation', 'immigration',
  // Plurals and other endings, and the obvious words the first list missed.
  'lawsuits', 'lawyers', 'judges', 'judged', 'judgement', 'trials', 'crimes', 'attorneys', 'courts', 'courtroom',
  'jailed', 'jailing', 'prisoner', 'prisoners', 'prisons', 'sentences', 'sentencing', 'penalties', 'warrants', 'criminals',
  'convicts', 'frauds', 'fraudulent', 'murder', 'murdered', 'murders', 'murderer', 'assault', 'assaulted', 'assaults',
  'theft', 'thefts', 'thief', 'thieves', 'robbed', 'robbery', 'robber', 'robbers', 'robbing', 'burglar', 'burglary',
  'burglars', 'stole', 'stolen', 'steal', 'steals', 'stealing', 'evict', 'evicted', 'eviction', 'evictions', 'evicting',
  'bankrupt', 'bankruptcy', 'bankruptcies', 'foreclosed', 'foreclosure', 'repossessed', 'repossession', 'policeman',
  'policemen', 'policewoman', 'policewomen', 'verdict', 'juror', 'jurors', 'judgment',
]

describe('largestFigure', () => {
  it.each([
    ['', 0],
    ['no digits at all', 0],
    ['5 minutes', 5],
    ['12 players', 12],
    ['7 kids', 7],
    ['2,500', 2500],
    ['$1,200.50', 1200.5],
    ['1.5M', 1_500_000],
    ['$1.2M', 1_200_000],
    ['a 12k car', 12_000],
    ['250 thousand', 250_000],
    ['3 billion and 2 million', 3_000_000_000],
    ['$4 T', 4_000_000_000_000],
    ['Rp 800,000', 800_000],
    ['in 2026, 3 people', 2026],
    ['1 million', 1_000_000],
    ['a 3 trillion deal', 3e12],
  ] as [string, number][])('%j is %d', (text, expected) => {
    expect(largestFigure(text)).toBe(expected)
  })

  // formatMoney spells these out from a quadrillion up (core.ts BIG_UNITS), so the policy has to read them.
  it.each([
    ['2 quadrillion', 2e15],
    ['3 quintillion', 3e18],
    ['4 sextillion', 4e21],
    ['5 septillion', 5e24],
    ['61 octillion pengő', 6.1e28],
    ['7 nonillion', 7e30],
    ['1.5 Quadrillion', 1.5e15],
    ['$2.5 QUINTILLION', 2.5e18],
  ] as [string, number][])('%j is about %d', (text, expected) => {
    // Multiplying by 1e24 and the like is not exact, so the check is on the ratio.
    expect(largestFigure(text) / expected).toBeCloseTo(1, 9)
  })

  it('reads an unlisted number word that ends in illion as a large figure', () => {
    for (const text of ['It was 5 zillion', 'About 2 decillion pengő', 'a 9 bazillion fine']) {
      expect(largestFigure(text), text).toBeGreaterThanOrEqual(LARGE_FIGURE)
    }
  })

  it('does not take an ordinary word after a number for a unit', () => {
    for (const text of ['5 minutes', '12 players', '7 kids', '3 missions', '2 stallions', '4 Tuesdays', '8 big ones', '6 Bs and 2 Ms apart']) {
      expect(largestFigure(text), text).toBeLessThan(LARGE_FIGURE)
    }
  })

  it('reads every amount the game itself writes, however large (formatMoney)', () => {
    for (const n of [1e12, 9.9e14, 1e15, 3.3e16, 1e18, 4e19, 1e21, 8e22, 1e24, 6.1e27, 1e30, 5e31, 1e33, 7e40, 1e60]) {
      const text = formatMoney(n)
      expect(largestFigure(text), `${n} is written ${text}`).toBeGreaterThanOrEqual(LARGE_FIGURE)
      expect(neverRoute({ title: 'A windfall', text: `You earned ${text}.` }), text).toBe('money')
    }
  })

  it('takes the biggest number in the text', () => {
    expect(largestFigure('9 then 12,500 then 40')).toBe(12_500)
  })

  it('never returns NaN or Infinity, even for a very long number', () => {
    const huge = largestFigure('9'.repeat(400))
    expect(Number.isFinite(huge)).toBe(true)
    expect(huge).toBeGreaterThanOrEqual(LARGE_FIGURE)
  })
})

describe('neverRoute and routesToInbox over the shared table', () => {
  it('has at least 30 rows, every block reason and passing rows', () => {
    expect(NEVER_ROUTE_TABLE.length).toBeGreaterThanOrEqual(30)
    const blocks = new Set(NEVER_ROUTE_TABLE.map((r) => r.block))
    for (const b of ['support', 'tone', 'health', 'legal', 'money', null]) expect(blocks.has(b as never), String(b)).toBe(true)
    expect(new Set(NEVER_ROUTE_TABLE.map((r) => r.name)).size).toBe(NEVER_ROUTE_TABLE.length)
  })

  it.each(NEVER_ROUTE_TABLE.map((r) => [r.name, r] as const))('%s: neverRoute says the table reason', (_name, row) => {
    expect(neverRoute(noticeOfRow(row, 'x'))).toBe(row.block)
  })

  it.each(NEVER_ROUTE_TABLE.map((r) => [r.name, r] as const))('%s: a minor one routes only when nothing blocks it', (_name, row) => {
    const minor = noticeOfRow(row, 'm1', 'minor')
    expect(routesToInbox(minor, true)).toBe(row.block === null)
  })

  it.each(NEVER_ROUTE_TABLE.map((r) => [r.name, r] as const))('%s: without the minor weight it never routes', (_name, row) => {
    expect(routesToInbox(noticeOfRow(row, 'o1'), true)).toBe(false)
  })

  it.each(NEVER_ROUTE_TABLE.map((r) => [r.name, r] as const))('%s: with Quiet Mode off nothing routes', (_name, row) => {
    expect(routesToInbox(noticeOfRow(row, 'q1', 'minor'), false)).toBe(false)
  })

  it('the first reason wins in the order support, tone, health, legal, money', () => {
    const all = { title: 'A doctor and a court', text: 'Fined $250,000.', tone: 'bad' as const, support: true }
    expect(neverRoute(all)).toBe('support')
    expect(neverRoute({ ...all, support: false })).toBe('tone')
    expect(neverRoute({ ...all, support: false, tone: 'neutral' })).toBe('health')
    expect(neverRoute({ title: 'A court', text: 'Fined $250,000.', tone: 'neutral' })).toBe('legal')
    expect(neverRoute({ title: 'Lucky', text: 'Won $250,000.', tone: 'good' })).toBe('money')
    expect(neverRoute({ title: 'Lucky', text: 'Won $250.', tone: 'good' })).toBeNull()
  })

  it('treats the large-figure line as 10,000 display units', () => {
    expect(LARGE_FIGURE).toBe(10_000)
    expect(neverRoute({ title: 'A', text: 'It cost 9,999.' })).toBeNull()
    expect(neverRoute({ title: 'A', text: 'It cost 10,000.' })).toBe('money')
    expect(neverRoute({ title: 'A', text: 'It cost 10K.' })).toBe('money')
    expect(neverRoute({ title: 'A', text: 'It cost 9.9K.' })).toBeNull()
  })
})

describe('the health and legal word rules', () => {
  it.each(HEALTH_WORDS)('health word %s keeps a notice a popup', (word) => {
    expect(HEALTH_RE.test(`Something about ${word} came up.`), word).toBe(true)
    expect(neverRoute({ title: 'News', text: `Something about ${word} came up.` }), word).toBe('health')
  })

  it.each(LEGAL_WORDS)('legal word %s keeps a notice a popup', (word) => {
    expect(LEGAL_RE.test(`Something about ${word} came up.`), word).toBe(true)
    expect(neverRoute({ title: 'News', text: `Something about ${word} came up.` }), word).toBe('legal')
  })

  it('is case-insensitive and whole-word', () => {
    expect(neverRoute({ title: 'HOSPITAL', text: 'Visiting hours.' })).toBe('health')
    expect(neverRoute({ title: 'News', text: 'You will still learn a skill and pay the bill.' })).toBeNull()
    expect(neverRoute({ title: 'News', text: 'You could confine the cope and refine the copy.' })).toBeNull()
  })

  it('keeps stateless regexes: repeated tests give the same answer', () => {
    expect(HEALTH_RE.global).toBe(false)
    expect(LEGAL_RE.global).toBe(false)
    for (let i = 0; i < 4; i++) expect(HEALTH_RE.test('the doctor')).toBe(true)
    for (let i = 0; i < 4; i++) expect(LEGAL_RE.test('the police')).toBe(true)
  })
})

describe('routesToInbox for other popup kinds', () => {
  const choice: ChoiceModal = {
    kind: 'choice', id: 'c1', title: 'A letter', text: 'Open it?', choices: [{ id: 'a', label: 'Open' }], source: 'script', scriptId: 's',
  }
  const input: InputModal = { kind: 'input', id: 'i1', title: 'A letter', text: 'How much?', input: 'number', scriptId: 's' }
  const game: MinigameModal = { kind: 'minigame', id: 'g1', title: 'A letter', game: 'slots', scriptId: 's', data: null }
  const task: AiTaskModal = { kind: 'aiTask', id: 't1', task: { type: 'yearEvents' } }

  it.each([
    ['choice', choice],
    ['input', input],
    ['minigame', game],
    ['aiTask', task],
  ] as const)('never routes a %s, not even one that carries a minor weight', (_kind, modal) => {
    expect(routesToInbox(modal, true)).toBe(false)
    expect(routesToInbox({ ...modal, weight: 'minor' } as never, true)).toBe(false)
  })

  it('ignores a weight that is not exactly minor', () => {
    const n: NoticeModal = { kind: 'notice', id: 'n', title: 'A letter', text: 'From a friend.', weight: 'major' as never }
    expect(routesToInbox(n, true)).toBe(false)
  })
})

describe('purity', () => {
  it('survives deepFreeze: nothing here writes', () => {
    const n = deepFreeze<NoticeModal>({ kind: 'notice', id: 'n1', title: 'A raise', text: 'You got $1,200.', tone: 'good', weight: 'minor' })
    expect(routesToInbox(n, true)).toBe(true)
    expect(neverRoute(n)).toBeNull()
    expect(largestFigure(n.text)).toBe(1200)
    const table = deepFreeze(NEVER_ROUTE_TABLE.map((r) => noticeOfRow(r, 'f', 'minor')))
    for (const m of table) expect(() => routesToInbox(m, true)).not.toThrow()
  })
})
