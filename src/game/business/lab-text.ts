// R&D 3.0 copy (docs/VOICE.md): every string the lab shows is built here by a function, so one test can
// measure them all and money is formatted when the text is made, never when the module loads
// (test/currency-static.test.ts). Callers pass money already formatted with `money()`.

/** A line of copy: the pieces it needs (a name, a price, a count), already formatted, in order. */
export type Say = (...a: string[]) => string

/** Life-log lines (cap 90). */
export const LAB_LOG: Record<string, Say> = {
  grant: (name, amount) => `${name} received a ${amount} research grant.`,
  started: (name, program) => `${name} started ${program}.`,
  worked: (name, program) => `${name}'s ${program} worked.`,
  failed: (name, program) => `${name}'s ${program} didn't work.`,
}

/** Outcomes, notices and the one reason a row can't run (cap 120). */
export const LAB_SAY: Record<string, Say> = {
  // The owner's notice when a program starts: name, program, price, years ("2 years"), odds in percent.
  started: (name, program, price, years, odds) => `${name} is working on ${program}. It costs ${price} and has ${odds}% odds in about ${years}. If it fails, the money is gone.`,
  notEligible: () => 'Operations R&D is for product companies. This one runs its own kind of R&D.',
  pickProgram: () => 'Pick a program first.',
  unknownProgram: (name) => `${name} isn't an Operations R&D program.`,
  notReady: (program) => `The world isn't ready for ${program} yet.`,
  rungTooBig: (program) => `Low-tech trades can't use ${program}.`,
  // The track's noun ("unit cost", "output", "quality") and the program that holds it.
  trackBusy: (noun, program) => `A ${noun} program is already running (${program}).`,
  cooldown: (program, won, free) => `${program} worked in ${won}. It can run again in ${free}.`,
  drowning: () => 'Your R&D department is drowning in projects. Let some finish first.',
  cash: (program, need, short) => `${program} needs ${need} of company cash with the usual cushion kept back (${short} short).`,
}

/** Tooltips: the rows and subtitles of the Research & Operations screen (cap 120). */
export const LAB_TIP: Record<string, Say> = {
  group: () => 'Operations R&D and a research team',
  // "Low", "Mid" or "High", and the highest rung the tier is offered.
  tier: (kind, steps) => `${kind}-tech trade. Programs go up to step ${steps}.`,
  credit: (percent) => `R&D credit: ${percent}% of what R&D started this year cost.`,
  noCredit: () => 'No R&D credit here.',
  // Last year's lab ledger: an amount that is zero is passed as '' and left out; two items to a sentence at most.
  ledger: (credit, royalty, payroll) => {
    const items = [credit && `${credit} in credit and grants`, royalty && `${royalty} in royalties`, payroll && `${payroll} for the team`].filter(Boolean)
    const head = items.length === 3 ? items.slice(0, 1) : items
    const tail = items.length === 3 ? items.slice(1) : []
    return [head.length ? `Last year: ${head.join(' and ')}.` : '', tail.length ? `${tail.join(' and ')}.` : ''].filter(Boolean).join(' ')
  },
  none: () => 'No program is open this year yet.',
  running: (program, left, odds) => `${program}: ${left} left, ${odds}% odds`,
  // A program row's subtitle: price, years ("2 years"), odds in percent and what a win does (one of the three below).
  ops: (price, years, odds, effect) => `${price} · ${years} · ${odds}% odds · ${effect}`,
  cost: (percent) => `unit costs fall up to ${percent}%`,
  yield: (percent) => `output rises up to ${percent}%`,
  quality: (percent) => `demand rises up to ${percent}%`,
  // The confirm before a program starts: it repeats the price, the years and the odds.
  confirm: (program, price, years, odds) => `Start ${program}? It costs ${price} and has about ${odds}% odds in ${years}. If it fails, the money is gone.`,
}

/** Labels of the screen's group and headings, the tier names, and the nouns for what a track changes. */
export const LAB_LABEL = {
  group: 'Research & Operations',
  ops: 'Operations R&D',
  tier: { low: 'Low', mid: 'Mid', high: 'High' },
  track: { cost: 'unit cost', yield: 'output', quality: 'quality' },
} as const

/** The annual report's own lines for what the lab books. */
export const LAB_STATEMENT = { credit: 'R&D tax credit and grants', royalty: 'Patent licences', payroll: 'Research team' } as const
