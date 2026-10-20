// Types for scripts/voice/lexer.mjs, so that test/scan-kit.ts (and the guards built on it) can import it: tsc checks
// test/ and cannot import an untyped .mjs. The token fields are described at the top of `lex` in lexer.mjs.

/** Token kinds (the `k` of a token). */
export const K_ID: number
export const K_NUM: number
export const K_PUNCT: number
export const K_STR: number
export const K_TMPL: number
export const K_REGEX: number
export const K_JSXTEXT: number

export interface LexToken {
  /** Kind: one of the K_ constants. */
  k: number
  /** Identifier or punctuation text, string value, number text, template text with `${...}` holes. */
  v: string
  /** Offset of the first character (a string or template: the opening quote). */
  p: number
  /** Offset just after the last character. */
  e: number
  /** A newline came before this token. */
  nl: boolean
  /** Depth of enclosing template `${ }` holes. */
  td: number
  /** Strings and templates: the text as written, between the delimiters. */
  raw?: string
  /** Templates: the cooked static parts. */
  parts?: string[]
  /** Templates: the number of `${}` holes. */
  nExpr?: number
  /** Strings: the quote character code. */
  q?: number
  /** Strings in JSX: the attribute name, or null. */
  attr?: string | null
}

/** Tokenise one TS or TSX source text. Template tokens come before the tokens of their holes, so the list is sorted by `p`. */
export function lex(src: string, tsx: boolean): { toks: LexToken[]; errors: string[] }
