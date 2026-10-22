// R3-H1 (H.3): the information mode. Realistic (the default) shows estimates, ranges and words until the player looks closer;
// Exact shows every number, as the game always did. It is a presentation switch and nothing else: the simulation never reads it
// (test/info-mode.test.ts scans aging, life, core, economy/, world/ and kernel/ for an import of this folder), so a setting can
// never change a replay.
//
// Three layers, strongest first:
//   override  tests only (setInfoOverride, withInfoMode). test/setup-exact.ts installs 'exact' through vite.config.ts setupFiles,
//             so every test file starts in Exact and a file that imports the store (which applies the player's setting) stays
//             Exact. Fog tests flip it for one call with withInfoMode.
//   setting   the player's choice from Settings (settings.ts applyInfoSettings -> setInfoMode).
//   default   'realistic'.
//
// This file imports nothing. The state sits on globalThis under a registered symbol, not in a module variable, so a test that
// calls vi.resetModules() and imports the module again still sees the same switch (and the Exact override of its setup file).
export type InfoMode = 'realistic' | 'exact'

interface ModeState {
  setting: InfoMode
  override: InfoMode | null
}

const SLOT = Symbol.for('anotherlife.infoMode')

const isMode = (v: unknown): v is InfoMode => v === 'realistic' || v === 'exact'

function state(): ModeState {
  const home = globalThis as unknown as Record<symbol, unknown>
  const s = home[SLOT] as Partial<ModeState> | null | undefined
  if (s && typeof s === 'object' && isMode(s.setting) && (s.override === null || isMode(s.override))) return s as ModeState
  // Missing or damaged: start over rather than trust it.
  const fresh: ModeState = { setting: 'realistic', override: null }
  home[SLOT] = fresh
  return fresh
}

/** The mode in force: the test override, else the player's setting, else 'realistic'. */
export function infoMode(): InfoMode {
  const s = state()
  return s.override ?? s.setting
}

export function isExact(): boolean {
  return infoMode() === 'exact'
}

/** The player's setting (Settings -> Information). Anything but 'exact' means Realistic. The override still beats it. */
export function setInfoMode(m: InfoMode): void {
  state().setting = m === 'exact' ? 'exact' : 'realistic'
}

/** Tests only: beats the setting until cleared with null. Anything that is not a mode clears it. */
export function setInfoOverride(m: InfoMode | null): void {
  state().override = isMode(m) ? m : null
}

/**
 * Run `fn` with the override set to `m`, then put the earlier override back, even when `fn` throws. Calls nest. For a plain
 * (synchronous) `fn`: the mode is restored the moment `fn` returns, so an async function sees it only up to its first await.
 */
export function withInfoMode<T>(m: InfoMode, fn: () => T): T {
  const s = state()
  const before = s.override
  s.override = m
  try {
    return fn()
  } finally {
    // `state()` again: the shared state may have been replaced while fn ran.
    state().override = before
  }
}
