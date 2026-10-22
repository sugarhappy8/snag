// An ordinal in words (R3-Q13): "fourth" up to the twentieth, then "21st". The text kit compares lines with every run of digits
// folded to '#', so "my 7th pro season" and "my 9th pro season" read as one line; a word keeps two seasons, two school years or two
// anything of one life from being the same line. A leaf: it imports nothing.
const WORDS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth', 'sixteenth', 'seventeenth', 'eighteenth', 'nineteenth', 'twentieth'] as const

/** The ordinal of a whole number from 1: a word up to 20, digits with their suffix after that (21st, 112th). Anything else gives "the same". */
export function ordinalWord(n: number): string {
  if (!Number.isInteger(n) || n < 1) return 'the same'
  if (n <= WORDS.length) return WORDS[n - 1]
  const v = n % 100
  const suffix = v >= 11 && v <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')
  return `${n}${suffix}`
}
