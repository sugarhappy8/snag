// Text kit hashing (R1-T1, E.T1). A leaf: it imports nothing.
// These helpers pick presentation text from a hash of the life, the year and a key. They never draw from
// g.rng and never read game state, so writing a line cannot move a seeded life.

/** 32-bit FNV-1a of the UTF-16 code units of the text, unsigned. */
export function fnv1a(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** The murmur3 finalizer: spreads the bits of a 32-bit hash so close inputs land far apart. Unsigned. */
export function mix32(h: number): number {
  h >>>= 0
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return h >>> 0
}

/** A stable number in [0, 1) for this life, year and key. Draws nothing, reads no state. */
export function hunit(lifeId: string, year: number, key: string): number {
  return mix32(fnv1a(lifeId + '|' + year + '|' + key)) / 2 ** 32
}

/** Presentation text pick: a hash like the CEO coda (business/career.ts), never g.rng. Throws on an empty list, like pick(). */
export function hpick<T>(lifeId: string, year: number, key: string, lines: readonly T[]): T {
  if (lines.length === 0) throw new Error('hpick() from empty list')
  return lines[Math.floor(hunit(lifeId, year, key) * lines.length)]
}

const POOL_HASHES = new WeakMap<readonly string[], string>()

/** 'p' + 8 hex digits of a hash over the lines (count and text). Cached per array, so a pool array must not change after its first use. */
export function poolHash(lines: readonly string[]): string {
  const known = POOL_HASHES.get(lines)
  if (known !== undefined) return known
  const hash = 'p' + mix32(fnv1a(lines.length + '\u001f' + lines.join('\u001f'))).toString(16).padStart(8, '0')
  POOL_HASHES.set(lines, hash)
  return hash
}
