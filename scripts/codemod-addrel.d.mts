// Types for scripts/codemod-addrel.mjs, so that test/codemod-addrel.test.ts can import it: tsc checks test/ and cannot import an
// untyped .mjs (precedent: scripts/codemod-pickline.d.mts).

/** One call of addRelationship or bumpRelationship the codemod looked at. */
export interface AddrelSite {
  /** Repo-relative, posix: 'src/game/love.ts'. */
  file: string
  /** 1-based, of the callee token. */
  line: number
  col: number
  callee: string
  /** rewrite: the game argument was inserted. keep: the call already has it. unplaced: a human places it (see `reason`). */
  action: 'rewrite' | 'keep' | 'unplaced'
  /** The name inserted, for a rewrite. */
  g?: string
  reason?: string
}

/** Pure. The rewritten text of one file and the sites in it; the text is the input when nothing changed. */
export function rewrite(path: string, source: string): { text: string; changed: boolean; sites: AddrelSite[] }

/** Runs over `src` and `test` of `root`. With `apply` it writes the changed files and lists their paths. */
export function run(root: string, opts?: { apply?: boolean; only?: string }): { sites: AddrelSite[]; written: string[] }
