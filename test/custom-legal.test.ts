// Do Anything and legal phrasings (insider-fairness ruling R7). A player who types "sue the regulator" or
// "fight the seizure in court" gets a pointer to Activities, Lawsuit: no random outcome, no brawl, no steal.
// The pointer is a hint like the other menu hints in custom.ts, so it changes no money, stat or relationship.
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { BANNED_ANYWHERE, unitFlags } from '../scripts/voice/rules.mjs'
import { currentLogYear, formatMoney, useYearAction } from '../src/game/core'
import { lawsuitMenu } from '../src/game/activities/lawsuit'
import { CUSTOM_RULE_IDS, customRuleFor, resolveCustomAction } from '../src/game/events/custom'
import { createPerson } from '../src/game/people'
import { prisonMenu } from '../src/game/prison'
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
        const rng = g.rng
        resolveCustomAction(g, text)
        // A pointer, not an outcome: no random number is drawn, so the rest of the life plays out the same.
        expect(g.rng, text).toBe(rng)
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
          const rng = g.rng
          resolveCustomAction(g, text)
          expect(g.rng, text).toBe(rng)
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
    // Hiring a lawyer from a cell is about the conviction: it points at Appeal (tested below), not at Lawsuit.
    for (const text of LEGAL.slice(0, 12).filter((t) => t !== 'hire a lawyer to get my money back')) {
      for (const seed of SEEDS) {
        const g = prisoner(seed)
        expect(lawsuitMenu.disabledReason?.(g), 'the gate really is closed in prison').toBeTruthy()
        expect(customRuleFor(g, text), text).toBe('legal')
        const before = snapshot(g)
        const rng = g.rng
        resolveCustomAction(g, text)
        expect(g.rng, text).toBe(rng)
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

/** In a cell, the conviction is what a lawyer is for: these point at the Appeal option, not at the closed Lawsuit menu. */
const APPEAL_TALK = [
  'fight my conviction',
  'appeal my conviction',
  'appeal the verdict',
  'appeal my sentence',
  'I want to appeal the conviction',
  'file an appeal',
  'appeal',
  'I want to appeal',
  "I'll appeal",
  'hire a lawyer',
  'get a good lawyer',
  'lawyer up',
  'hire a lawyer to get my money back',
  'fight the charges',
  'fight my sentence',
  // Launching, starting or making an appeal is about the case only with a court decision in the sentence.
  'launch an appeal against the verdict',
  'start an appeal against my conviction',
  'make an appeal against the sentence',
  'lodge an appeal',
  'win my appeal',
]

function appealGate(g: GameState): string | null {
  const menu = prisonMenu.children(g).find((n) => n.id === 'prison.appeal')
  if (!menu || menu.type !== 'menu') throw new Error('no Appeal menu')
  const top = menu.children(g).find((n) => n.id === 'prison.appeal.top')
  if (!top || top.type !== 'action') throw new Error('no appeal firm')
  return top.disabledReason?.(g) ?? null
}

describe('the legal rule in a cell: the conviction goes to Appeal', () => {
  it('points conviction, sentence, verdict and lawyer talk at the Appeal option, and changes nothing', () => {
    for (const text of APPEAL_TALK) {
      for (const seed of SEEDS) {
        const g = prisoner(seed)
        expect(appealGate(g), 'the appeal is open').toBeNull()
        expect(customRuleFor(g, text), text).toBe('legal')
        const before = snapshot(g)
        const rng = g.rng
        resolveCustomAction(g, text)
        expect(g.rng, text).toBe(rng)
        const n = theNotice(g, text)
        expect(n.title, text).toBe('Appeal')
        expect(n.text, text).toMatch(/Prison menu, under Appeal/)
        expect(n.text, text).not.toMatch(/Activities|Lawsuit/)
        expect(snapshot(g), text).toBe(before)
        expect(lastLog(g), text).toBe('I read up on appeals.')
      }
    }
  })

  it('says why when the appeal is used up, in the words of the Appeal option itself', () => {
    const used = prisoner(1)
    used.character.prison!.appealed = true
    const row = prisoner(2)
    row.character.prison!.deathRow = true
    row.character.prison!.life = true
    expect(useYearAction(row, 'prisonAppeal', 1)).toBe(true)
    for (const g of [used, row]) {
      const gate = appealGate(g)
      expect(gate).toBeTruthy()
      const before = snapshot(g)
      const rng = g.rng
      resolveCustomAction(g, 'appeal my conviction')
      expect(g.rng).toBe(rng)
      const n = theNotice(g, 'appeal')
      expect(n.title).toBe('Appeal')
      expect(n.text).toBe(gate)
      expect(snapshot(g)).toBe(before)
    }
    // Death row with this year's appeal still to file gets the pointer.
    const fresh = prisoner(3)
    fresh.character.prison!.deathRow = true
    fresh.character.prison!.life = true
    resolveCustomAction(fresh, 'appeal my conviction')
    expect(theNotice(fresh, 'appeal').text).toMatch(/Prison menu, under Appeal/)
  })

  it('a minor in juvenile detention can appeal too, so gets the pointer and not the age answer', () => {
    const g = person(6, 16, true)
    expect(appealGate(g)).toBeNull()
    resolveCustomAction(g, 'appeal my conviction')
    expect(theNotice(g, 'appeal').title).toBe('Appeal')
    // Suing is still an age matter.
    const s = person(6, 16, true)
    resolveCustomAction(s, 'sue the government')
    expect(theNotice(s, 'sue').title).toBe('Too young')
  })

  it('suing from a cell is still the closed Lawsuit menu, even with a lawyer in the sentence', () => {
    for (const text of ['sue the government', 'hire a lawyer to sue the prison', 'file a lawsuit against the guards', 'take the warden to court']) {
      const g = prisoner(4)
      resolveCustomAction(g, text)
      expect(theNotice(g, text).title, text).toBe('Locked up')
    }
  })

  it('outside prison the same words keep the Lawsuit pointer (or the age answer)', () => {
    for (const text of ['fight my conviction', 'appeal my conviction', 'appeal the verdict', 'hire a lawyer', 'file an appeal', 'launch an appeal against the verdict', 'lodge an appeal']) {
      const g = adult(5)
      resolveCustomAction(g, text)
      expect(theNotice(g, text).title, text).toBe('Lawsuit')
      const kid = teen(5, 15)
      resolveCustomAction(kid, text)
      expect(theNotice(kid, text).title, text).toBe('Too young')
    }
  })

  it('"appeal" that is not about a court is not legal', () => {
    const fundraisers = ['launch an appeal for the flood victims', 'start an appeal to save the library', 'make an appeal for donations', 'start an appeal for the hospital', 'make an appeal to the public']
    for (const text of ['appeal to voters', 'sex appeal', 'improve curb appeal', 'appeal to my boss for a raise', 'work on my appeal', ...fundraisers]) {
      expect(customRuleFor(adult(1), text), text).not.toBe('legal')
      expect(customRuleFor(prisoner(1), text), text).not.toBe('legal')
    }
  })

  it('a fundraising appeal keeps the rule it had before the legal rule existed', () => {
    // v2.6.0 (ef126cc), adult and prisoner alike.
    const OLD: [text: string, rule: string | undefined][] = [
      ['launch an appeal for the flood victims', undefined],
      ['start an appeal to save the library', 'study'],
      ['make an appeal for donations', undefined],
    ]
    for (const [text, rule] of OLD) {
      for (const g of [adult(1), prisoner(1)]) {
        expect(customRuleFor(g, text), text).toBe(rule)
        resolveCustomAction(g, text)
        expect(notices(g).some((n) => ['Lawsuit', 'Locked up', 'Appeal'].includes(n.title)), text).toBe(false)
      }
    }
  })
})

describe('in a cell, asking for the money back while the case holds some', () => {
  const HELD = 2_500_000
  const M = formatMoney(HELD)

  /** A prisoner whose current conviction (Burglary) holds money a won appeal would return. */
  function heldPrisoner(seed: number, refund: unknown = HELD, crime = 'Burglary'): GameState {
    const g = prisoner(seed)
    g.character.criminalRecord.push({ crime, age: 29, caught: true, convicted: true, sentenceYears: 8, refund: refund as number })
    return g
  }

  /** Suing phrasings about the money: they get the closed-Lawsuit answer, with what the appeal can do. */
  const SUE_FOR_IT = [
    'sue the FCA to get my money back',
    'sue the regulator to get back my money',
    'take the FCA to court to recover my money',
    'sue the regulator for wrongful seizure',
    'fight the seizure in court',
    'sue the FCA for a refund',
    'sue them for the money they took',
    'I want to sue the FCA to get my savings back',
    'file a complaint to get my cash back',
  ]
  /** Lawyer or conviction phrasings about the money: they get the Appeal pointer, with the amount. */
  const APPEAL_FOR_IT = ['hire a lawyer to get my money back', 'get a lawyer to recover my money', 'appeal my conviction to get my money back']

  function answer(g: GameState, text: string): { n: NoticeModal; log: string | undefined } {
    const before = snapshot(g)
    const rng = g.rng
    expect(customRuleFor(g, text), text).toBe('legal')
    resolveCustomAction(g, text)
    expect(g.rng, text).toBe(rng)
    expect(snapshot(g), text).toBe(before)
    return { n: theNotice(g, text), log: lastLog(g) }
  }

  it('says a won appeal returns the amount and where the Appeal option is', () => {
    for (const seed of [1, 2, 3]) {
      for (const text of SUE_FOR_IT) {
        const { n, log } = answer(heldPrisoner(seed), text)
        expect(n.title, text).toBe('Locked up')
        expect(n.text, text).toBe(`You can't sue from prison. Winning an appeal returns the ${M} taken in your case. (Prison menu, Appeal.)`)
        expect(log, text).toBe('I thought about legal action in prison.')
      }
      for (const text of APPEAL_FOR_IT) {
        const { n, log } = answer(heldPrisoner(seed), text)
        expect(n.title, text).toBe('Appeal')
        expect(n.text, text).toBe(`You read up on appeals. Winning an appeal returns the ${M} taken in your case. (Prison menu, Appeal.)`)
        expect(log, text).toBe('I read up on appeals.')
      }
    }
  })

  it('on death row, only going free returns it', () => {
    const row = heldPrisoner(4)
    row.character.prison!.deathRow = true
    row.character.prison!.life = true
    expect(answer(row, 'sue the FCA to get my money back').n.text).toBe(`You can't sue from prison. Going free on appeal returns the ${M} taken in your case. (Prison menu, Appeal.)`)
    const fresh = heldPrisoner(4)
    fresh.character.prison!.deathRow = true
    fresh.character.prison!.life = true
    expect(answer(fresh, 'hire a lawyer to get my money back').n.text).toBe(`You read up on appeals. Going free on appeal returns the ${M} taken in your case. (Prison menu, Appeal.)`)
    // This year's death row appeal is filed: the Appeal option's own reason, then the money.
    const filed = heldPrisoner(4)
    filed.character.prison!.deathRow = true
    filed.character.prison!.life = true
    expect(useYearAction(filed, 'prisonAppeal', 1)).toBe(true)
    const { n, log } = answer(filed, 'hire a lawyer to get my money back')
    expect(n.text).toBe(`You already filed a death row appeal this year. Going free on appeal returns the ${M} taken in your case.`)
    expect(log).toBe('I thought about another appeal.')
  })

  it('once the appeal is used, says the court keeps it and points nowhere', () => {
    const used = heldPrisoner(5)
    used.character.prison!.appealed = true
    const sued = answer(used, 'sue the FCA to get my money back').n
    expect(sued.title).toBe('Locked up')
    expect(sued.text).toBe(`You can't sue from prison. The court keeps the ${M} taken in your case.`)
    const asked = heldPrisoner(5)
    asked.character.prison!.appealed = true
    const { n, log } = answer(asked, 'hire a lawyer to get my money back')
    expect(n.text).toBe(`You already appealed this sentence. The courts are done listening. The court keeps the ${M} taken in your case.`)
    expect(log).toBe('I thought about another appeal.')
  })

  it('says nothing about money without money-back wording, without held money, or for another conviction', () => {
    const LOCKED = "You can't sue from prison. (Lawsuit, under Activities, is closed while you're locked up.)"
    const READ = 'You read up on appeals. (Appeals are filed from the Prison menu, under Appeal.)'
    // Held money, but the sentence is not about it.
    for (const text of ['sue the government', 'sue the prison for bad food', 'take the warden to court']) expect(answer(heldPrisoner(6), text).n.text, text).toBe(LOCKED)
    for (const text of ['hire a lawyer', 'appeal my conviction', 'fight the charges']) expect(answer(heldPrisoner(6), text).n.text, text).toBe(READ)
    // Money-back wording, but nothing (valid) is held on this sentence's conviction: none, a damaged amount, or
    // money held on an older conviction for another crime (a won appeal of this sentence would not return it).
    const nothingHeld: ((seed: number) => GameState)[] = [
      (s) => prisoner(s),
      (s) => heldPrisoner(s, 0),
      (s) => heldPrisoner(s, Number.NaN),
      (s) => heldPrisoner(s, -5),
      (s) => heldPrisoner(s, 'lots'),
      (s) => heldPrisoner(s, HELD, 'Fraud'),
    ]
    for (const make of nothingHeld) {
      expect(answer(make(6), 'sue the FCA to get my money back').n.text).toBe(LOCKED)
      expect(answer(make(6), 'hire a lawyer to get my money back').n.text).toBe(READ)
    }
    // Outside prison the Lawsuit pointer is unchanged, and a minor in a cell still gets the age rule for a suit.
    const free = adult(6)
    free.character.criminalRecord.push({ crime: 'Burglary', age: 29, caught: true, convicted: true, sentenceYears: 8, refund: HELD })
    expect(answer(free, 'sue the FCA to get my money back').n.title).toBe('Lawsuit')
    const kid = person(6, 16, true)
    kid.character.criminalRecord.push({ crime: 'Burglary', age: 15, caught: true, convicted: true, sentenceYears: 2, refund: HELD })
    expect(answer(kid, 'sue the FCA to get my money back').n.title).toBe('Too young')
  })

  it('every money answer is in the house voice and under the outcome cap', () => {
    const texts: string[] = []
    const open = heldPrisoner(7)
    texts.push(answer(open, 'sue the FCA to get my money back').n.text)
    texts.push(answer(heldPrisoner(7), 'hire a lawyer to get my money back').n.text)
    for (const set of [(g: GameState) => { g.character.prison!.appealed = true }, (g: GameState) => { g.character.prison!.deathRow = true; g.character.prison!.life = true }]) {
      for (const text of ['sue the FCA to get my money back', 'hire a lawyer to get my money back']) {
        const g = heldPrisoner(7)
        set(g)
        texts.push(answer(g, text).n.text)
      }
    }
    const filed = heldPrisoner(7)
    filed.character.prison!.deathRow = true
    filed.character.prison!.life = true
    useYearAction(filed, 'prisonAppeal', 1)
    texts.push(answer(filed, 'hire a lawyer to get my money back').n.text)
    expect(new Set(texts).size).toBe(texts.length)
    for (const text of texts) {
      expect(text).toContain(`the ${M} taken in your case`)
      expect(text).not.toMatch(/—|–/)
      for (const phrase of BANNED_ANYWHERE) expect(text, phrase).not.toContain(phrase)
      // The amount is a hole: what the voice rules measure is the text around it.
      const flags = unitFlags(text.replace(M, '${...}'), 'outcome')
      expect(flags.filter((f) => f !== 'over-aim'), text).toEqual([])
    }
  })
})

describe('compound sentences and a person called Sue keep their own rule', () => {
  /** The reviewer's list (old tree vs new tree, adult, seed 7): each went back to the rule it had before the legal rule. */
  const OWN_RULE: [text: string, rule: string | undefined][] = [
    ['hire a divorce lawyer', 'breakup'],
    ['get a divorce lawyer and divorce my wife', 'breakup'],
    ['see a lawyer about my divorce', 'breakup'],
    ['go to the courthouse and get married', 'propose'],
    ['get married in the courthouse', 'propose'],
    ['kiss sue', 'date'],
    ['date sue', 'date'],
    ['propose to sue', 'propose'],
    ['marry sue', 'propose'],
    ['hang out with sue', undefined],
    ['call sue', undefined],
    ['quit my job and sue my boss', 'quit'],
    ['go to court and gamble', 'gamble'],
    ['hire a lawyer and go to the casino', 'gamble'],
    ['smoke weed in court', 'drugs'],
    ['go to court high on cocaine', 'drugs'],
    ['go rob the bank and sue them', 'steal'],
    ['please rob the bank and sue them', 'steal'],
    ['sue them and get drunk', 'drink'],
    ['go to the courthouse for my wedding', undefined],
    // A divorce is a breakup, even when the sentence says "sue" (a spouse is in the game).
    ['sue my wife for divorce', 'breakup'],
    // A friend called Sue, typed in lowercase after "with", or after "and" at the end (the v2.6.0 rule each had).
    ['go to the movies with sue', 'screens'],
    ['go shopping with sue', 'shop'],
    ['go bowling with sue', undefined],
    ['have lunch with sue', undefined],
    ['go for a walk with sue', 'exercise'],
    ['have lunch with sue tomorrow', undefined],
    ['go shopping with sue tomorrow', 'shop'],
    ['go to the beach with sue and her dog', undefined],
    ['go bowling with tom and sue', undefined],
  ]

  /** Still suits: the other rule's word is only what the suit is about, or the verb is "Sue" written with a capital. */
  const STILL_LEGAL = [
    'please sue the FCA',
    'go sue them',
    'Please Sue the FCA',
    'Go Sue them',
    'I want to Sue the FCA',
    "I'll Sue them",
    'I will Sue the regulator',
    'sueing the fca',
    'I am sueing my landlord',
    'sue the casino',
    'sue the casino for my losses',
    'sue the wedding planner',
    'take the casino to court',
    'file a complaint against the casino',
    'sue my boss and quit',
    'sue the bar that served me drinks',
    'sue my ex after the divorce settlement',
    // "and sue" at the end is still the verb when a lawyer or a court is in the sentence.
    'hire a lawyer and sue',
    'take them to court and sue',
  ]

  it('leaves each compound or look-alike sentence to its own rule', () => {
    for (const [text, rule] of OWN_RULE) {
      const g = adult(7)
      createPerson(g, { relation: 'friend', age: 30, firstName: 'Sue', relationship: 60 })
      createPerson(g, { relation: 'spouse', age: 30, relationship: 60 })
      expect(customRuleFor(g, text), text).toBe(rule)
      resolveCustomAction(g, text)
      expect(notices(g).some((n) => n.title === 'Lawsuit'), text).toBe(false)
    }
  })

  it('keeps real suits on the legal rule', () => {
    for (const text of STILL_LEGAL) {
      for (const seed of [1, 7]) {
        const g = adult(seed)
        createPerson(g, { relation: 'friend', age: 30, firstName: 'Sue', relationship: 60 })
        expect(customRuleFor(g, text), text).toBe('legal')
      }
    }
  })

  it('reads a capital Sue after a person-verb as a name', () => {
    const g = adult(3)
    createPerson(g, { relation: 'friend', age: 30, firstName: 'Sue', relationship: 60 })
    for (const text of ['talk to Sue', 'I want to talk to Sue', 'propose to Sue', 'give it to Sue', 'go to Sue', 'Will Sue come over', 'I will call Sue']) {
      expect(customRuleFor(g, text), text).not.toBe('legal')
    }
  })
})

describe('the legal rule source', () => {
  it('has no string over the 180-character mark the voice report counts', () => {
    const tree = mkdtempSync(join(tmpdir(), 'custom-legal-'))
    try {
      const file = join('src', 'game', 'events', 'custom.ts')
      mkdirSync(join(tree, 'src', 'game', 'events'), { recursive: true })
      writeFileSync(join(tree, file), readFileSync(fileURLToPath(new URL('../src/game/events/custom.ts', import.meta.url)), 'utf8'))
      const run = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/voice-report.mjs', import.meta.url)), '--json', '--root', tree], { encoding: 'utf8' })
      expect(run.stderr).toBe('')
      const doc = JSON.parse(run.stdout) as { meta: { files: number; lexerErrors: number }; metrics: { key: string; value: number }[] }
      expect(doc.meta.files).toBe(1)
      expect(doc.meta.lexerErrors).toBe(0)
      expect(doc.metrics.find((m) => m.key === 'long')?.value).toBe(0)
    } finally {
      rmSync(tree, { recursive: true, force: true })
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
    // From a cell, about the conviction: the Appeal pointer, and the used-up appeal.
    const used = prisoner(1)
    used.character.prison!.appealed = true
    for (const [label, g] of [['appeal', prisoner(1)], ['appeal used', used]] as [string, GameState][]) {
      resolveCustomAction(g, 'appeal my conviction')
      const n = theNotice(g, label)
      out.push({ label, title: n.title, text: n.text, log: lastLog(g) })
    }
    return out
  }

  it('has no em-dash, banned phrase, disclaimer or over-long line in any variant', () => {
    const all = variants()
    // These are the legal answers, not the fallback: a text that is only a fallback would pass the checks below.
    expect(all.map((v) => v.title)).toEqual(['Lawsuit', 'Locked up', 'Too young', 'Too young', 'Too young', 'Appeal', 'Appeal'])
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
