// Types for scripts/r1-screenshots.mjs, so that test/r1-screenshot-state.test.ts can import it (tsc checks test/ and cannot
// import an untyped .mjs).

export class UsageError extends Error {}

export interface ScreenshotOptions {
  /** The folder that holds node_modules/playwright (or playwright-core), or the package folder itself. */
  playwright: string
  /** A Chromium binary: --chromium, else the PW_CHROMIUM environment variable, else null (Playwright's own). */
  chromium: string | null
  url: string
  serve: boolean
  out: string
  seed: number
  years: number
  companies: number
  width: number
  height: number
  narrow: number
}

export const DEFAULTS: Readonly<Omit<ScreenshotOptions, 'playwright' | 'chromium' | 'serve'>>
export const USAGE: string

/** The options with the defaults filled in; a UsageError for anything it cannot use. `env` is where PW_CHROMIUM is read. */
export function parseOptions(argv: readonly string[], env?: Record<string, string | undefined>): ScreenshotOptions

/** Where to scroll a panel to see all of it: the top first, the bottom last, at most `cap` positions (6 by default). [0] when it fits. */
export function scrollPositions(scrollHeight: number, clientHeight: number, cap?: number): number[]

/** r1-<scheme>[-narrow]-<tab>.png; a step after the first adds -2, -3 and so on. */
export function shotName(scheme: string, tab: string, step?: number, narrow?: boolean): string

export interface PlaywrightLike {
  chromium: { launch(options?: { executablePath?: string }): Promise<unknown> }
}
/** Playwright from a folder (its node_modules, or the package itself). */
export function loadPlaywright(dir: string): PlaywrightLike

/** The save the screenshots start from, made by the real engine: the JSON text saveGame would store, and the life's id. */
export function buildSave(o: { seed: number; years: number; companies: number }): Promise<{ json: string; lifeId: string }>
