// State lines table (R2-P8, E.T3 b): one row per yearly status line that should not repeat. Data only: this file imports
// nothing but the band leaf, so any module may read it without joining an import cycle. The engine is text/state.ts (stateLine); the rules each
// row must obey are linted by test/text-lines.test.ts (3 to 6 variants, log voice, a total band, a short valid key).
// A new yearly status line from now on is a row here and one stateLine call, never a hand-written "once in five years" gate.
// The one import is ./band (bandBy and logBand, which import nothing), because the rows' own thresholds need them.
import { bandBy, logBand } from './band'

export interface StateSpec {
  /** Three to six lines; {name} slots are filled by stateLine. Plain narrator, log cap 90 static characters. */
  readonly variants: readonly string[]
  /** The threshold bucket of a value, a whole number 0..99. A change of bucket is a change of state. */
  readonly band: (value: number) => number
  /** Years of silence after which an unchanged state speaks again. Default 5; 0 means never. */
  readonly every?: number
  /** Fewest years between two lines when the bucket changed. Default 2. */
  readonly gap?: number
}

/**
 * The rows. R2-P9 put the nine yearly status lines of the 13-life repeat probe's worklist here: each is a row and one stateLine
 * call at its site. The literal keys make StateKey a union, so a typo is a compile error. {slot}s are filled by the caller.
 * Variants are plain narrator, at most 90 static characters (test/text-lines.test.ts lints every row).
 */
export const STATE_TABLE = {
  // "Around me": the caller fires on a crossing of its own (growth below -2%, credit below 0.72, supply above 12%), so the
  // band is constant and the row's whole job is to stop the same crossing speaking again within 5 years. {cause} is the
  // economy's first stated cause (economy/index.ts). Five variants each, not three: a rough decade can cross the same line
  // four times, and the probe still counts a fourth line that reuses the first one's words as a repeat.
  'around.growth': {
    variants: [
      'Money got tight around me. {cause}',
      'Times got harder in my town. {cause}',
      'The squeeze reached my whole street. {cause}',
      'Work got scarce where I live. {cause}',
      'Belts got tighter all over town. {cause}',
    ],
    band: () => 0,
  },
  'around.credit': {
    variants: [
      'Banks stopped lending around me. {cause}',
      'Credit dried up where I live. {cause}',
      'Borrowing got hard for the people I knew. {cause}',
      'Loans got hard to find in my town. {cause}',
      'The banks near me shut their wallets. {cause}',
    ],
    band: () => 0,
  },
  'around.supply': {
    variants: [
      'Shortages hit the shops around me. {cause}',
      'Prices jumped on everything I buy. {cause}',
      'Stores near me ran short of goods. {cause}',
      'Empty shelves showed up around town. {cause}',
      "The shops near me couldn't keep things in stock. {cause}",
    ],
    band: () => 0,
  },
  // Index days for someone with nothing in the market (investments.ts yearlyInvestments). The value is the size of the move
  // (a fraction), {index} the index's name and {move} the news's wording of the move.
  'index.crash': {
    variants: [
      'The {index} crashed {move} this year. Good thing I had nothing in it.',
      'The {index} fell {move}. I was glad to be out of it.',
      'The {index} dropped {move}, and I had nothing to lose.',
    ],
    band: bandBy(0.2, 0.35),
  },
  'index.boom': {
    variants: [
      'The {index} boomed {move} this year. I wish I had invested.',
      'The {index} jumped {move}, and I watched it from the sidelines.',
      'The {index} gained {move} without me.',
    ],
    band: bandBy(0.2, 0.35),
  },
  // What a star's endorsement deals paid in the year (special/sports-core.ts yearlySponsors).
  'endorse.income': {
    variants: ['I earned {money} from endorsements this year.', 'The brands paid me {money} this year.', 'Endorsements brought in {money}.'],
    band: logBand(1.5),
  },
  // What the player paid in allowances in the year (events/wealth.ts payAllowances): one person, or several.
  'allowance.one': {
    variants: ['I paid {money} in allowance this year.', 'My allowance cost me {money} this year.', 'I handed out {money} in allowance.'],
    band: logBand(1.25),
  },
  'allowance.many': {
    variants: [
      'I paid {money} in allowances and support to {count} people this year.',
      'I supported {count} people with {money} this year.',
      '{count} people leaned on me for {money} this year.',
    ],
    band: logBand(1.25),
  },
  // A part payment of a loan (events/wealth.ts collectLoans), one record per person (the call passes the person's id), the
  // value what is still owed: it speaks each time the debt halves. {who} opens a sentence, {whom} sits inside one.
  'loan.back': {
    variants: [
      '{who} paid back {money} of what {he} owes me ({left} to go).',
      '{who} sent {money} toward the loan. {left} to go.',
      'I got {money} back from {whom}. {left} still owed.',
    ],
    band: logBand(2),
  },
} as const satisfies Record<string, StateSpec>

export type StateKey = keyof typeof STATE_TABLE
