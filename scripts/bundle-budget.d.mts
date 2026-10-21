// Types for scripts/bundle-budget.mjs, so that test/bundle-budget.test.ts can import it under strict TypeScript (tsc
// checks test/ and cannot import an untyped .mjs). The CLI is documented at the top of the script.

/**
 * The paths in an index.html that the page loads before any dynamic import, in document order: scripts, stylesheets
 * and modulepreload links. Each is relative to dist, with no leading "./" or "/", no query and no hash, and listed once.
 * Remote URLs, inline scripts, comments and every other kind of link (icon, preload, prefetch, manifest) are left out.
 */
export function initialAssets(html: string): string[]

/**
 * `delta` is the initial size minus the baseline (negative when the bundle shrank), `limit` is allowGrowthBytes, and
 * `ok` is true when delta is at most limit. A delta that is not a number is never ok.
 */
export function checkBudget(i: { initialGzBytes: number; baselineGzBytes: number; allowGrowthBytes: number }): { ok: boolean; delta: number; limit: number }
