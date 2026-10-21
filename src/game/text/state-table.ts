// State lines table (R2-P8, E.T3 b): one row per yearly status line that should not repeat. Data only: this file imports
// nothing, so any module may read it without joining an import cycle. The engine is text/state.ts (stateLine); the rules each
// row must obey are linted by test/text-lines.test.ts (3 to 6 variants, log voice, a total band, a short valid key).
// A new yearly status line from now on is a row here and one stateLine call, never a hand-written "once in five years" gate.

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

/** The rows. Starts empty: R2-P9 adds the first ones. The literal keys make StateKey a union, so a typo is a compile error. */
export const STATE_TABLE = {} as const satisfies Record<string, StateSpec>

export type StateKey = keyof typeof STATE_TABLE
