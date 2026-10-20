// Text kit pool registry (R1-T1, E.T1). A leaf: it imports nothing.
// A named pool gets a stable key for the text memory, so the same lines keep their history across edits
// of the surrounding code. Nothing in the game calls defineLines yet (the codemod is E.T3, in R2).

const POOLS = new Map<string, readonly string[]>()
const IDS = new WeakMap<readonly string[], string>()

/** Registers a named pool and returns a frozen copy of the lines. Registering an id twice replaces it (HMR safe). */
export function defineLines<const T extends readonly string[]>(id: string, lines: T): T {
  const frozen = Object.freeze([...lines]) as unknown as T
  const old = POOLS.get(id)
  if (old) IDS.delete(old)
  POOLS.set(id, frozen)
  IDS.set(frozen, id)
  return frozen
}

/** The id a frozen array was registered under, or undefined. */
export function linesId(lines: readonly string[]): string | undefined {
  return IDS.get(lines)
}

/** Every registered pool, by id. */
export function registeredLines(): ReadonlyMap<string, readonly string[]> {
  return POOLS
}
