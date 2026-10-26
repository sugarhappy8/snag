// ci: fast
// R4-U1 (People UI and fog track): the Exact oracle. test/fixtures/people-ui-exact.json holds what the person sheet, the action rows
// of a person, the hired-staff sheets and shortlists, the CEO shortlists, rows, notice and letter, the conglomerate rows, and the
// People cockpit, badges and Needs You rows say in Exact mode, recorded on the unmodified v5.2.0 code under Node 22. The tasks that
// follow (R4-U2 to R4-U11) put a profile, ranges and tiles behind the `peopleProfile` flag and Realistic mode, and every one of them
// keeps these rows: Exact is today. A flag-off Realistic life prints the same text for the screens that R3 did not fog.
//
// This file proves the kit itself (fourteen people made without a draw, rows that build twice the same, a comparison that notices a
// one-character change), the recorder's guard, the file, and then that today's code equals the file, group by group.
//
// Recording is for this task only, and for the lead if an intended move is agreed (a row in moved-tests.md first):
//
//   RECORD_PEOPLE_UI=1 RECORD_REASON="<why>" /Users/saeed/projects/anotherlife/wt/bin/vt22 test/people-ui-golden.test.ts
//
// Without the variable nothing is written, and a missing file is a failure that names this command. Never record to make a task pass.
// U8 wraps the cockpit, badge and Needs You rows in withFlags({ peopleProfile: false }, ...) because the tiles and badges do not read the
// mode: that is a wrapper and not a re-record, and it keeps these rows byte for byte.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { checkReason } from './golden-cli'
import {
  FIXTURE_FILE,
  KIT_KEYS,
  LEVELS,
  LIVING_KEYS,
  RECORD_COMMAND,
  ROW_GROUPS,
  buildGroup,
  buildKit,
  diffRows,
  groupOf,
  linesOf,
  plain,
  recordPeopleUi,
  recordRefusal,
  serialize,
  type Recorded,
  type Row,
  type RowGroup,
} from './people-ui-kit'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const TIMEOUT = 120_000
const RECORD = process.env.RECORD_PEOPLE_UI === '1'
const LONG_DASH = new RegExp(`[${String.fromCharCode(0x2014, 0x2013)}]`)

function readFixture(): Recorded {
  if (!existsSync(join(ROOT, FIXTURE_FILE))) expect.fail(`${FIXTURE_FILE} is missing: ${RECORD_COMMAND}`)
  return JSON.parse(readFileSync(join(ROOT, FIXTURE_FILE), 'utf8')) as Recorded
}

const memo = new Map<RowGroup, Row[]>()
/** What the kit builds today for a group, once for this file. Building it already builds every row twice and compares. */
function today(group: RowGroup): Row[] {
  let rows = memo.get(group)
  if (!rows) {
    rows = buildGroup(group)
    memo.set(group, rows)
  }
  return rows
}

describe('the fourteen people', () => {
  it('are made without one draw of g.rng, with the ids p1 to p14, at each level', () => {
    for (const level of LEVELS) {
      const { g } = buildKit(level)
      expect(g.rng).toBe(7)
      expect(g.people).toHaveLength(14)
      expect(g.people.map((p) => p.id)).toEqual(Array.from({ length: 14 }, (_, i) => `p${i + 1}`))
      expect(new Set(g.people.map((p) => p.relationship))).toEqual(new Set([level]))
    }
  })

  it('cover the relations the sheet and the actions branch on, a pet, the dead, an NPC life with Main Character and data stats', () => {
    const { g, ids } = buildKit(50)
    const of = (k: (typeof KIT_KEYS)[number]) => g.people.find((p) => p.id === ids[k])!
    expect(KIT_KEYS.map((k) => of(k).relation)).toEqual(['parent', 'sibling', 'child', 'spouse', 'partner', 'friend', 'coworker', 'boss', 'ex', 'enemy', 'pet', 'parent', 'sibling', 'bestFriend'])
    expect(of('pet').relation).toBe('pet')
    expect(of('deadParent').alive).toBe(false)
    expect(of('deadParent').causeOfDeath).toBe('Heart Attack')
    expect(of('npcLife').data.life).toMatchObject({ v: 1, skill: 71.6, ambition: 83.2 })
    expect(of('npcLife').data.talents).toEqual(['MainCharacter'])
    expect(Object.keys(of('dataStats').data).filter((k) => typeof of('dataStats').data[k] === 'number')).toHaveLength(15)
    expect(of('child').otherParentId).toBe(ids.spouse)
    expect(of('spouse').pregnant).toBe(true)
    expect(LIVING_KEYS).toHaveLength(12)
    expect(g.people.filter((p) => p.alive && p.relation !== 'pet')).toHaveLength(12)
  })
})

describe('the rows', () => {
  it('a one-character change to a label turns the comparison red, and so do a missing row and a new one', () => {
    const rows: Row[] = [
      ['actions/friend/50', 'action befriend: Befriend | greyed: Not now\naction spendTime: Spend Time'],
      ['details/friend/50', '<div class="person-name">Theo Walsh</div>'],
    ]
    expect(diffRows(rows, rows)).toEqual([])
    const label: Row[] = [[rows[0][0], rows[0][1].replace('Spend Time', 'Spend Tine')], rows[1]]
    const moved = diffRows(rows, label)
    expect(moved).toHaveLength(1)
    expect(moved[0]).toContain('actions/friend/50')
    expect(moved[0]).toContain('Spend Tim')
    expect(diffRows(rows, rows.slice(1))).toEqual(['actions/friend/50: missing now'])
    expect(diffRows(rows.slice(1), rows)).toHaveLength(1)
    expect(diffRows(rows.slice(1), rows)[0]).toContain('new, not in the file')
  })

  it('plain writes an em dash and an en dash as a hyphen and leaves everything else alone', () => {
    const em = String.fromCharCode(0x2014)
    const en = String.fromCharCode(0x2013)
    expect(plain(`Life & Career ${em} Doctor ${en} 3`)).toBe('Life & Career - Doctor - 3')
    expect(plain('A - b · c − d')).toBe('A - b · c − d')
  })

  it('linesOf lists a group open to three levels, one line a row, with what a player reads', () => {
    const { g, ids } = buildKit(50)
    const lines = linesOf(g, [
      {
        type: 'menu',
        id: 'm',
        label: 'Menu',
        emoji: 'x',
        subtitle: 'sub',
        disabledReason: () => 'locked',
        header: () => 'Top\nline',
        children: () => [
          { type: 'info', id: 'i', text: () => 'Info text' },
          { type: 'action', id: 'a', label: 'Do', emoji: 'x', run: () => undefined, visible: () => false },
        ],
      },
    ])
    expect(lines).toEqual(['menu m: Menu | sub | greyed: locked', '  header: Top / line', '  info i: Info text', '  action a: Do [hidden]'])
    expect(ids.parent).toBe('p1')
  })
})

describe('the recorder', () => {
  const ok = { RECORD_PEOPLE_UI: '1', RECORD_REASON: 'first oracle of the person sheet, the staff and the CEO rows at v5.2.0' }

  it('refuses without RECORD_PEOPLE_UI=1, and says what to run', () => {
    expect(recordRefusal({}, 22, checkReason)).toContain('RECORD_PEOPLE_UI=1')
    expect(recordRefusal({ ...ok, RECORD_PEOPLE_UI: '0' }, 22, checkReason)).toContain('RECORD_PEOPLE_UI=1')
  })

  it('refuses a missing reason, a stock reason, and a reason with a long dash (checkReason of the golden CLI)', () => {
    expect(recordRefusal({ RECORD_PEOPLE_UI: '1' }, 22, checkReason)).toContain('RECORD_REASON')
    expect(recordRefusal({ ...ok, RECORD_REASON: 'rebaseline' }, 22, checkReason)).toContain('RECORD_REASON')
    expect(recordRefusal({ ...ok, RECORD_REASON: `the rows moved ${String.fromCharCode(0x2014)} on purpose here` }, 22, checkReason)).toContain('long dash')
  })

  it('refuses any Node but 22, and accepts Node 22 with a reason', () => {
    expect(recordRefusal(ok, 24, checkReason)).toContain('Node 22')
    expect(recordRefusal(ok, 20, checkReason)).toContain('Node 22')
    expect(recordRefusal(ok, 22, checkReason)).toBeNull()
  })

  it('writes nothing without the variable', () => {
    expect(() => recordPeopleUi(checkReason, {})).toThrow(/RECORD_PEOPLE_UI=1/)
  })

  it('writes the file with a header line and one row a line', () => {
    const text = serialize({ v: 1, node: 'v22.0.0', head: 'abc1234', reason: 'a reason of four words', rows: [['a/1', 'one\ntwo'], ['b/2', 'three']] })
    expect(text).toBe('{\n"v": 1,\n"node": "v22.0.0",\n"head": "abc1234",\n"reason": "a reason of four words",\n"rows": [\n["a/1","one\\ntwo"],\n["b/2","three"]\n]\n}\n')
    expect(JSON.parse(text).rows).toEqual([['a/1', 'one\ntwo'], ['b/2', 'three']])
  })

  it.runIf(RECORD)('records the oracle on this code', { timeout: 600_000 }, () => {
    recordPeopleUi(checkReason)
    expect(existsSync(join(ROOT, FIXTURE_FILE))).toBe(true)
  })
})

describe('the oracle file', () => {
  it('exists, and a missing file names the command that records it', () => {
    readFixture()
  })

  it('names the Node, the commit and the reason it was recorded with, and holds unique rows', () => {
    const f = readFixture()
    expect(f.v).toBe(1)
    expect(f.node).toMatch(/^v22\.\d+\.\d+$/)
    expect(f.head).toMatch(/^[0-9a-f]{7,40}$|^working tree$/)
    expect(checkReason(f.reason)).toBeNull()
    expect(new Set(f.rows.map((r) => r[0])).size).toBe(f.rows.length)
    for (const [k, text] of f.rows) {
      expect(typeof text, k).toBe('string')
      expect(() => groupOf(k), k).not.toThrow()
    }
  })

  it('holds no em dash or en dash, no NaN and no undefined, and no row is empty', () => {
    const f = readFixture()
    const raw = readFileSync(join(ROOT, FIXTURE_FILE), 'utf8')
    expect(LONG_DASH.test(raw)).toBe(false)
    for (const [k, text] of f.rows) {
      expect(text.length, k).toBeGreaterThan(0)
      expect(text, k).not.toMatch(/\bNaN\b|\bundefined\b|\[object |Infinity/)
    }
  })

  it('holds the rows the plan names: 14 people at 3 levels twice, 6 staff, 3 shortlists, the CEO popups, 5 letters, 4 cockpit states', () => {
    const keys = readFixture().rows.map((r) => r[0])
    const count = (prefix: string) => keys.filter((k) => k.startsWith(prefix)).length
    expect(count('details/')).toBe(14 * 3)
    expect(count('actions/')).toBe(14 * 3)
    expect(count('staff/rest/ks')).toBe(8)
    expect(count('staff/fund/ks')).toBe(4)
    expect(keys.filter((k) => /^staff\/(rest|fund)\/list$/.test(k))).toHaveLength(2)
    expect(count('hire/')).toBe(3 * 3 + 2)
    expect(count('ceo/letter/')).toBe(5)
    expect(keys).toContain('ceo/group')
    for (const kind of ['cockpit', 'badge', 'needs']) expect(count(`${kind}/`)).toBe(4)
    for (const id of ['rest', 'rest-talent', 'fund']) for (const part of ['standard', 'executive', 'hired', 'replace']) expect(keys).toContain(`ceo/${id}/${part}`)
  })

  it('has no true stat of a person next to a word that hides it: the sheets print what they printed (spot checks)', () => {
    const rows = new Map(readFixture().rows)
    expect(rows.get('details/parent/50')).toContain('Cash on hand')
    expect(rows.get('details/friend/20')).toContain('Private')
    expect(rows.get('actions/npcLife/50')).toContain('professional skill 72/100')
    expect(rows.get('actions/child/50')).toContain('Entitlement 62%')
    expect(rows.get('actions/parent/90')).toContain('(42/100)')
    expect(rows.get('staff/rest/ks3/subtitle')).toContain('skill 88')
    expect(rows.get('staff/rest/ks3/header')).toContain('Skill 88/100')
    expect(rows.get('ceo/rest/standard')).toContain('/100')
    expect(rows.get('ceo/letter/92')).toBe('Skill 92/100, elite.')
  })
})

describe('today\'s code against the file', () => {
  it.each(ROW_GROUPS)('%s: every row is the recorded one', { timeout: TIMEOUT }, (group) => {
    const recorded = readFixture().rows.filter(([k]) => groupOf(k) === group)
    expect(recorded.length, `${group} rows in the file`).toBeGreaterThan(0)
    const moved = diffRows(recorded, today(group))
    expect(moved, `${moved.length} difference${moved.length === 1 ? '' : 's'} in ${recorded.length} ${group} rows (Exact is today)\n${moved.slice(0, 6).join('\n')}`).toEqual([])
  })

  it('the whole file is covered by the groups, in the order the file keeps', () => {
    const keys = readFixture().rows.map((r) => r[0])
    const built = ROW_GROUPS.flatMap((g) => today(g).map((r) => r[0]))
    expect(keys).toEqual(built)
  })
})
