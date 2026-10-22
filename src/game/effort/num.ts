// Small total helpers for the effort files (R3). A reader of a save or a builder of a task gets values nobody checked: these cut
// them to a number in range without ever throwing and without touching the prototype. Nothing here draws, books or reads the game.

/** A plain object or an object with no prototype: not null, not an array. */
export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Whether `o` has `key` as an own property (never the prototype's). */
export function hasOwn(o: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(o, key)
}

/** `x` cut to `lo..hi`; anything that is not a finite number becomes `fallback` (the low end when it is left out). */
export function clampNum(x: unknown, lo: number, hi: number, fallback: number = lo): number {
  if (typeof x !== 'number' || !Number.isFinite(x)) return fallback
  return x < lo ? lo : x > hi ? hi : x
}

/** Two decimal places, the precision the know-how maps are stored at. */
export function round2(x: number): number {
  return Math.round(x * 100) / 100
}
