// Types for scripts/codemod-pickline.mjs, so that test/r2-codemod.test.ts and test/r2-pickline-ratchet.test.ts can import it:
// tsc checks test/ and cannot import an untyped .mjs (precedent: scripts/voice/lexer.d.mts).

/** One site that must stay `pick`: an identity string or a pool the parity test found in state. */
export interface SkipEntry {
  /** Repo-relative, posix: 'src/game/love.ts'. */
  file: string
  /** 's' + 8 hex digits for an inline pool (the id the dry run prints), or 'const:NAME' for a module-level array. */
  site: string
  /** Why it stays: at least 6 characters, no U+2014 or U+2013 (the ratchet test checks). */
  reason: string
}
export interface SkipList {
  v: 1
  skip: SkipEntry[]
}
export interface CodemodOptions {
  skip?: SkipList
  /** The module that exports pickLine and pickSite, repo-relative without extension. Default 'src/game/text/pick'. */
  textModule?: string
}
/**
 * Why a `pick(g, ...)` call stays. 'local-pick' also covers a file that declares pickLine or pickSite itself (the new import
 * would clash with it).
 */
export type KeepReason = 'single-word' | 'not-strings' | 'argument' | 'extra-args' | 'identity' | 'decision' | 'skip-list' | 'local-pick' | 'no-rng-import'
export interface CodemodSite {
  file: string
  /** 1-based, of the `pick` token. */
  line: number
  col: number
  action: 'line' | 'site' | 'keep'
  reason?: KeepReason
  /** Inline array literal or a module-level const array. Absent when the second argument is neither. */
  pool?: 'inline' | 'const'
  /** The number written as the third argument of pickSite (an action 'site'). */
  key?: number
  /** The name the result is assigned to, when the call is the right-hand side of an assignment, a declaration or a property. */
  receiver?: string
  /** 's' + 8 hex digits (inline) or 'const:NAME'. The identifier a skip entry names. Empty when the second argument is not a pool. */
  id: string
}
export interface RewriteResult {
  text: string
  sites: CodemodSite[]
  changed: boolean
}
/** Pure: the rewritten text and one entry per `pick(IDENT, ...)` call. */
export function rewrite(path: string, source: string, opts?: CodemodOptions): RewriteResult

export interface HelperSite {
  file: string
  line: number
  callee: 'eraPick' | 'v'
  receiver?: string
  pool: 'inline-static' | 'inline-hole' | 'const' | 'other'
}
/**
 * Pure. The sites of the two shared helpers, which are routed wholesale (R2-A3) and so need a human read: calls of `eraPick` or `v`
 * imported from a specifier ending in `/era` or `/helpers` (a file that declares its own `v` has none), with a bare identifier as
 * the first argument and an array literal or an identifier as the second.
 */
export function helperSites(path: string, source: string): HelperSite[]

/** 8 lowercase hex digits: fnv1a(path + U+001F + raw). */
export function siteId(path: string, raw: string): string
/** parseInt(siteId(path, raw), 16). */
export function siteKey(path: string, raw: string): number
/** './x' or '../x', posix, no extension: the import specifier from the file `fromFile` to the module `toModule` (both repo-relative). */
export function relativeImport(fromFile: string, toModule: string): string
/** The names that mean "what this thing is called": a pool assigned to one of them is an identity, not prose, and stays `pick`. */
export const IDENTITY_RECEIVERS: readonly string[]

/**
 * Skip entries that match no live site. `sites` is the union over every file the codemod looked at; an entry is live when a site
 * of the same file and id was kept for the reason 'skip-list'.
 */
export function staleSkips(skip: SkipList, sites: readonly CodemodSite[]): SkipEntry[]

/**
 * The command line. `argv` is what follows the script name; the summary goes to `out` (to `err` with --apply, so `out` is only the
 * changed paths). Returns the exit code: 0 ok, 2 bad usage.
 */
export function run(argv: readonly string[], io?: { out?: { write(text: string): unknown }; err?: { write(text: string): unknown } }): number
