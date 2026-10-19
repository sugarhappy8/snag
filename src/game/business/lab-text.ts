// R&D 3.0 copy (docs/VOICE.md): every string the lab shows is built here by a function, so one test can
// measure them all and money is formatted when the text is made, never when the module loads
// (test/currency-static.test.ts). Callers pass money already formatted with `money()`.

/** A line of copy: the pieces it needs (a name, a price, a count), already formatted, in order. */
export type Say = (...a: string[]) => string

/** Life-log lines (cap 90). */
export const LAB_LOG: Record<string, Say> = {
  grant: (name, amount) => `${name} received a ${amount} research grant.`,
}

/** Outcomes and notices (cap 120). Filled in by Operations R&D, patents and the team. */
export const LAB_SAY: Record<string, Say> = {}

/** Tooltips (cap 120). Filled in by Operations R&D, patents and the team. */
export const LAB_TIP: Record<string, Say> = {}

/** The annual report's own lines for what the lab books. */
export const LAB_STATEMENT = { credit: 'R&D tax credit and grants', royalty: 'Patent licences', payroll: 'Research team' } as const
