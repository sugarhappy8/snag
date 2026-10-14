// Do Anything and legal phrasings (insider-fairness ruling R7). A player who types "sue the regulator" or
// "fight the seizure in court" gets a pointer to Activities, Lawsuit: no random outcome, no brawl, no steal.
// The pointer is a hint like the other menu hints in custom.ts, so it changes no money, stat or relationship.
import { describe, expect, it } from 'vitest'
import { BANNED_ANYWHERE, unitFlags } from '../scripts/voice/rules.mjs'
import { currentLogYear } from '../src/game/core'
import { lawsuitMenu } from '../src/game/activities/lawsuit'
import { CUSTOM_RULE_IDS, customRuleFor, resolveCustomAction } from '../src/game/events/custom'
import { createPerson } from '../src/game/people'
import type { GameState, NoticeModal } from '../src/game/types'
import { makeTestGame } from './helpers'

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

/** A player with room in every stat, a friend and a parent, so that any change shows. */
function person(seed: number, age: number, prison: boolean): GameState {
  const g = makeTestGame(seed, { age, money: 5_000, stats: { happiness: 50, health: 50, smarts: 50, looks: 50 } })
  createPerson(g, { relation: 'friend', age: Math.max(4, age), relationship: 60 })
  createPerson(g, { relation: 'parent', age: age + 28, relationship: 60 })
  if (prison) {
    g.character.prison = { name: 'Blackrock Penitentiary', security: 'medium', crime: 'Burglary', sentenceYears: 8, yearsServed: 1, respect: 40, appealed: false, escapeAttempts: 0 }
    g.character.residence = { status: 'prison', description: 'Blackrock Penitentiary' }
  }
  return g
}

const adult = (seed: number) => person(seed, 30, false)
const teen = (seed: number, age = 15) => person(seed, age, false)
const prisoner = (seed: number) => person(seed, 30, true)

function notices(g: GameState): NoticeModal[] {
  return g.queue.filter((m): m is NoticeModal => m.kind === 'notice')
}

function lastLog(g: GameState): string | undefined {
  return currentLogYear(g).entries.at(-1)?.text
}

/** Everything the pointer must leave alone: stats, cash, record, relationships, counters other than the action count. */
function snapshot(g: GameState): string {
  const c = g.character
  const { customActions: _ignored, ...counters } = g.counters
  return JSON.stringify({
    stats: c.stats,
    hidden: c.hidden,
    money: c.money,
    record: c.criminalRecord,
    wanted: c.wantedLevel,
    prison: c.prison,
    conditions: c.conditions,
    rels: g.people.map((p) => [p.id, p.relation, p.relationship]),
    assets: g.assets.length,
    counters,
  })
}

/** The one popup a legal phrasing may leave in the queue. */
function theNotice(g: GameState, text: string): NoticeModal {
  expect(g.queue, text).toHaveLength(1)
  const [m] = g.queue
  expect(m.kind, text).toBe('notice')
  return m as NoticeModal
}

/** Text that is plainly about suing or taking a fight to court. */
const LEGAL = [
  // The nine from the player's report and its follow-ups.
  'sue the government',
  'sue the FCA to get my money back',
  'sue the regulator for wrongful seizure',
  'file a lawsuit against the police',
  'I want to sue',
  'take the regulator to court',
  'fight the seizure in court',
  'argue my case in court',
  'hire a lawyer to get my money back',
  // Other ways to say it.
  'Sue the government',
  'SUE THE BANK',
  'sue.',
  'I want to sue my landlord',
  'suing the hospital',
  'I am going to sue my old boss',
  'sued',
  'file a complaint against the bank',
  'file a formal complaint with the regulator',
  'file a case against my neighbor',
  'file a claim for the damage',
  'start a class action',
  'take legal action against the company',
  'I want to go to small claims court',
  'litigate the seizure',
  'start litigation against the regulator',
  'drag the bank to court',
  'take my landlord to court over the deposit',
  'take the regulator to the court',
  'fight it in the courts',
  'talk to my lawyer',
  'defend myself in court',
  'go to court',
  'I am going to court tomorrow',
  'hire an attorney',
  'get a good lawyer',
  'call my lawyer',
  'lawyer up',
  'see a lawyer about the seizure',
  'fight the charges',
  'fight the seizure',
  'fight my conviction',
  // A crime word is the thing being sued over, not what the player wants to do.
  'sue the thief who stole my car',
  'take the thief to court for stealing my car',
  'sue the bank that robbed me',
  'sue him for assault',
  'sue the gym that kicked me out',
  'hit them with a lawsuit',
  'slap a lawsuit on my boss',
  'attack the company with a lawsuit',
]

/** A crime or a fight next to a legal word: the crime or the fight wins. */
const CRIME_WINS: [text: string, rule: string][] = [
  ["steal a lawyer's wallet", 'steal'],
  ['punch the lawyer', 'fight'],
  ['rob the court', 'steal'],
  ['kill the judge', 'murder'],
  ['break out of court', 'escape'],
  ['I want to kill myself in court', 'selfHarm'],
  ['punch the judge in court', 'fight'],
  ['steal the evidence in court', 'steal'],
  ['rob the lawyer in court', 'steal'],
  ['sue him and rob him', 'steal'],
  ['go to court and punch the lawyer', 'fight'],
  ['slap the lawyer', 'fight'],
  ['I want to murder my lawyer', 'murder'],
  ['escape from the courthouse', 'escape'],
  ['kill myself after the lawsuit', 'selfHarm'],
  ['rob the lawyer to pay for a lawsuit', 'steal'],
  ['steal the lawsuit files', 'steal'],
  ['rob and sue', 'steal'],
  ['cheat in court', 'cheat'],
  ['forge a document for court', 'cheat'],
]

/** Ordinary actions from the existing Do Anything tests: none is a legal phrasing. */
const ORDINARY = [
  'bake a chocolate cake',
  'sing karaoke',
  'go dancing',
  'paint a landscape',
  'eat a whole pizza',
  'play video games',
  'get a haircut',
  'go for a run',
  'learn French',
  'I want to be a rock star and sing',
  'juggle flaming torches on a unicycle',
  'Build a treehouse',
  'I want to climb a tree',
  'dig a hole in my yard',
  'I want to be a superhero',
  'start a business',
  'fix the fence',
  'visit the zoo',
  'bury treasure in the backyard',
  'ride a horse',
]

/** Words that look like a legal one. */
const LOOKALIKES = [
  'pursue my dreams',
  'issue a statement',
  'rescue a cat',
  'clean the tissue box',
  'play tennis on the court',
  'play basketball in court',
  'go to the tennis court',
  'eat at the food court',
  'meet friends in the food court',
  'court a girl',
  'I want to court Linda',
  'I am going to court her tonight',
  'become a lawyer',
  'study law',
  'marry a lawyer',
  'date a lawyer',
  'work as a lawyer',
  'file my nails',
  'file my taxes',
  'file the papers in the cabinet',
  'walk through the courtyard',
  'judge a baking contest',
  'steal a kiss',
  'sleep in',
  'sweep the court',
  'watch a courtroom drama',
  'hang out with Sue',
  'play in the court',
  'go to the court',
  'hang out in the court',
  'court the queen',
]

describe('the legal rule', () => {
  it('sits right after selfHarm, murder and escape, before every other rule', () => {
    expect(CUSTOM_RULE_IDS.slice(0, 4)).toEqual(['selfHarm', 'murder', 'escape', 'legal'])
    expect(CUSTOM_RULE_IDS.filter((id) => id === 'legal')).toHaveLength(1)
    for (const id of ['steal', 'fight', 'insult', 'cheat', 'quit', 'raise', 'workHard', 'family', 'propose']) {
      expect(CUSTOM_RULE_IDS.indexOf('legal'), id).toBeLessThan(CUSTOM_RULE_IDS.indexOf(id))
    }
  })

  it('answers every legal phrasing with the pointer, on every seed, and changes nothing', () => {
    for (const text of LEGAL) {
      for (const seed of SEEDS) {
        const g = adult(seed)
        expect(customRuleFor(g, text), text).toBe('legal')
        const before = snapshot(g)
        resolveCustomAction(g, text)
        const n = theNotice(g, text)
        expect(n.title, text).toBe('Lawsuit')
        expect(n.text, text).toContain('Activities')
        expect(n.text, text).toContain('Lawsuit')
        expect(n.tone, text).toBe('neutral')
        expect(n.support, text).toBeUndefined()
        expect(snapshot(g), text).toBe(before)
        expect(g.character.criminalRecord, text).toHaveLength(0)
        expect(lastLog(g), text).toBe('I looked into legal action.')
      }
    }
  })

  it('points at the menu that exists, with the label it has', () => {
    expect(lawsuitMenu.label).toBe('Lawsuit')
    const g = adult(1)
    expect(lawsuitMenu.disabledReason?.(g)).toBeNull()
    resolveCustomAction(g, 'sue the government')
    const n = theNotice(g, 'sue')
    expect(n.text).toMatch(/Activities menu, under Lawsuit/)
  })

  it('keeps a crime or a fight next to a legal word on its own rule', () => {
    for (const [text, rule] of CRIME_WINS) {
      for (const seed of SEEDS) {
        const g = adult(seed)
        expect(customRuleFor(g, text), text).toBe(rule)
        resolveCustomAction(g, text)
        expect(notices(g).some((n) => n.title === 'Lawsuit'), text).toBe(false)
      }
    }
  })

  it('still runs the crime itself, and still shows the support popup', () => {
    let seed = 0
    const stole = adult(++seed)
    resolveCustomAction(stole, "steal a lawyer's wallet")
    expect(stole.counters.crimes).toBe(1)
    const robbed = adult(++seed)
    resolveCustomAction(robbed, 'rob the court')
    expect(robbed.counters.crimes).toBe(1)
    const punched = adult(++seed)
    resolveCustomAction(punched, 'punch the lawyer')
    expect(punched.counters.fights).toBe(1)
    const killed = adult(++seed)
    resolveCustomAction(killed, 'kill the judge')
    expect(theNotice(killed, 'kill the judge').emoji).toBe('🍳')
    const fled = adult(++seed)
    resolveCustomAction(fled, 'break out of court')
    expect(theNotice(fled, 'break out of court').title).toBe('Escape artist')
    const low = adult(++seed)
    resolveCustomAction(low, 'I want to kill myself in court')
    const [n] = notices(low)
    expect(n.support).toBe(true)
    expect(n.title).toBe('You talked to someone')
    // The same text from a cell.
    const cell = prisoner(++seed)
    resolveCustomAction(cell, 'I want to kill myself in court')
    expect(notices(cell)[0].support).toBe(true)
  })

  it('never starts a fight, an arrest or a theft from a legal phrasing', () => {
    // fight is 8% of the time an arrest at 16+; run many seeds so that a leak would show.
    const phrases = ['fight the seizure in court', 'argue my case in court', 'fight the charges', 'hit them with a lawsuit', 'slap a lawsuit on my boss', 'sue the thief who stole my car']
    for (const text of phrases) {
      for (let seed = 1; seed <= 150; seed++) {
        const g = adult(seed)
        resolveCustomAction(g, text)
        expect(g.counters.fights ?? 0, text).toBe(0)
        expect(g.counters.insults ?? 0, text).toBe(0)
        expect(g.counters.crimes ?? 0, text).toBe(0)
        expect(g.character.criminalRecord, text).toHaveLength(0)
        expect(g.character.wantedLevel, text).toBe(0)
        expect(g.queue.every((m) => m.kind === 'notice'), text).toBe(true)
      }
    }
  })

  it('does not mistake the name Sue for the verb', () => {
    const g = adult(3)
    createPerson(g, { relation: 'friend', age: 30, firstName: 'Sue', relationship: 60 })
    for (const text of ['call Sue', 'visit my friend Sue', 'hang out with Sue', 'Take Sue out for lunch', "Sue's birthday party", 'Sue and I go bowling']) {
      expect(customRuleFor(g, text), text).not.toBe('legal')
    }
    expect(customRuleFor(g, 'call Sue')).toBe('family')
    // As a verb, in any case and any place in the sentence.
    for (const text of ['Sue the government', 'sue Sue', 'I want to sue', 'time to SUE', 'Sue my landlord']) {
      expect(customRuleFor(g, text), text).toBe('legal')
    }
  })

  it('leaves ordinary actions and look-alike words to the rules they had', () => {
    for (const text of [...ORDINARY, ...LOOKALIKES]) {
      for (const seed of [1, 2, 3]) {
        const g = adult(seed)
        expect(customRuleFor(g, text), text).not.toBe('legal')
      }
    }
    // The ones with another rule keep exactly that rule.
    const g = adult(1)
    expect(customRuleFor(g, 'steal a kiss')).toBe('date')
    expect(customRuleFor(g, 'marry a lawyer')).toBe('propose')
    expect(customRuleFor(g, 'date a lawyer')).toBe('date')
    expect(customRuleFor(g, 'play basketball in court')).not.toBe('legal')
    expect(customRuleFor(g, 'bake a chocolate cake')).toBe('cook')
  })
})

describe('the legal rule for a child, a teen and a prisoner', () => {
  it('tells a player under 18 that suing starts at 18, using the Lawsuit gate wording', () => {
    for (const age of [3, 5, 9, 12, 15, 17]) {
      for (const text of ['sue the school', 'take the regulator to court', 'file a lawsuit against the police', 'hire a lawyer to get my money back']) {
        for (const seed of SEEDS) {
          const g = teen(seed, age)
          expect(customRuleFor(g, text), text).toBe('legal')
          const gate = lawsuitMenu.disabledReason?.(g)
          expect(gate, `age ${age}`).toBe('You must be at least 18 to sue someone.')
          const before = snapshot(g)
          resolveCustomAction(g, text)
          const n = theNotice(g, text)
          expect(n.title, text).toBe('Too young')
          expect(n.text, text).toBe(`You're only ${age}. ${gate}`)
          // No pointer to a menu that is closed to them.
          expect(n.text, text).not.toMatch(/Activities|Lawsuit/)
          expect(snapshot(g), text).toBe(before)
          expect(lastLog(g), text).toBeUndefined()
        }
      }
    }
  })

  it('answers an adult at exactly 18 with the pointer', () => {
    const g = teen(4, 18)
    expect(lawsuitMenu.disabledReason?.(g)).toBeNull()
    resolveCustomAction(g, 'sue the school')
    expect(theNotice(g, 'sue').title).toBe('Lawsuit')
    const young = teen(4, 17)
    resolveCustomAction(young, 'sue the school')
    expect(theNotice(young, 'sue').title).toBe('Too young')
  })

  it('leaves a baby to the baby answer, as before', () => {
    const g = teen(2, 2)
    resolveCustomAction(g, 'sue the government')
    const n = theNotice(g, 'sue')
    expect(n.title).not.toBe('Lawsuit')
    expect(n.title).not.toBe('Too young')
    expect(n.text).not.toMatch(/Activities|Lawsuit/)
  })

  it('tells a prisoner the menu is closed while locked up', () => {
    for (const text of LEGAL.slice(0, 12)) {
      for (const seed of SEEDS) {
        const g = prisoner(seed)
        expect(lawsuitMenu.disabledReason?.(g), 'the gate really is closed in prison').toBeTruthy()
        expect(customRuleFor(g, text), text).toBe('legal')
        const before = snapshot(g)
        resolveCustomAction(g, text)
        const n = theNotice(g, text)
        expect(n.title, text).toBe('Locked up')
        expect(n.text, text).toContain('prison')
        expect(n.text, text).toContain('Lawsuit')
        expect(n.text, text).toContain('closed')
        // The prison block that stops other rules never took this one: no "stared at the wall".
        expect(n.text, text).not.toMatch(/stared at the wall|keep dreaming/)
        expect(snapshot(g), text).toBe(before)
        expect(g.character.prison, text).not.toBeNull()
        expect(lastLog(g), text).toBe('I thought about legal action in prison.')
      }
    }
  })

  it('a minor in prison gets the age answer, since age is what stops them even after release', () => {
    const g = person(5, 15, true)
    resolveCustomAction(g, 'sue the government')
    const n = theNotice(g, 'sue')
    expect(n.title).toBe('Too young')
    expect(n.text).toBe("You're only 15. You must be at least 18 to sue someone.")
  })

  it('violence and escape from a cell keep their own rules', () => {
    for (const [text, rule] of CRIME_WINS) {
      const g = prisoner(2)
      const id = customRuleFor(g, text)
      expect(id, text).toBe(rule)
    }
  })
})

describe('the legal answers in the house voice', () => {
  const variants = (): { label: string; title: string; text: string; log: string | undefined }[] => {
    const out: { label: string; title: string; text: string; log: string | undefined }[] = []
    const cases: [string, GameState][] = [
      ['adult', adult(1)],
      ['prison', prisoner(1)],
      ['age 3', teen(1, 3)],
      ['age 9', teen(1, 9)],
      ['age 17', teen(1, 17)],
    ]
    for (const [label, g] of cases) {
      resolveCustomAction(g, 'sue the regulator for wrongful seizure')
      const n = theNotice(g, label)
      out.push({ label, title: n.title, text: n.text, log: lastLog(g) })
    }
    return out
  }

  it('has no em-dash, banned phrase, disclaimer or over-long line in any variant', () => {
    const all = variants()
    // These are the legal answers, not the fallback: a text that is only a fallback would pass the checks below.
    expect(all.map((v) => v.title)).toEqual(['Lawsuit', 'Locked up', 'Too young', 'Too young', 'Too young'])
    for (const v of all) {
      for (const [role, text] of [['title', v.title], ['outcome', v.text], ...(v.log ? [['log', v.log]] : [])] as [string, string][]) {
        expect(text, v.label).not.toMatch(/\u2014|\u2013/)
        for (const phrase of BANNED_ANYWHERE) expect(text, `${v.label}: ${phrase}`).not.toContain(phrase)
        expect(unitFlags(text, role), `${v.label} ${role}: ${text}`).toEqual([])
      }
    }
  })

  it('gives every variant a title and a text of at most 100 characters', () => {
    for (const v of variants()) {
      expect(v.title.length, v.label).toBeGreaterThan(0)
      expect(v.text.length, v.label).toBeGreaterThan(20)
      expect(v.text.length, v.label).toBeLessThanOrEqual(100)
    }
  })
})
