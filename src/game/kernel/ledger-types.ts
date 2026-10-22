// The saved shape of the ledger (R2, design 4.2): types only, so any file may name it without importing the ledger itself.
//
// An account is a string (person:<id>, firm:<id>, bank:<id>, gov:<country>, pool:<name>, abroad); its balance is the net of every
// dollar that ever moved through it, in whole dollars, and may be negative. Every list is capped when it is read (kernel/ledger.ts).
// This file is part of the kernel (L0): it imports nothing.
export interface LedgerShard {
  v: 1
  /** The calendar year of the yearly counters below. */
  y: number
  /** Account -> net balance, whole dollars. A balance that returns to 0 is deleted. */
  a: Record<string, number>
  /** Cumulative mint by name. */
  m: Record<string, number>
  /** Cumulative burn by name. */
  b: Record<string, number>
  /** This year's mint by name (the yearly caps read it). */
  ym: Record<string, number>
  /** This year's burn by name. */
  yb: Record<string, number>
  /** "<year>:<country>:<reason>" -> [person, firm, bank, gov, pool, abroad, mint, burn]: the net each class gained (positive) or lost. */
  f: Record<string, number[]>
  /** Tokens booked this year (a ring), so a replayed year books nothing twice. */
  r: string[]
  /** Closes of past years, newest last: [year, sum, cumulative mint, cumulative burn]. */
  c: [number, number, number, number][]
  /** Log rows, newest last: [year, kind, name, amount]. */
  l: [number, string, string, number][]
  /** Bookings since the ledger began. */
  k: number
}
