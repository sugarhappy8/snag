// Entity ids (R2, design 13.2): one scheme for everything the world keeps an account or a row for.
//
// An EntityRef is "<kind>:<key>": person:p42, firm:a7, gov:us, pool:hh:us, home:a3. The kind is a short lower case word, the key
// is what the entity is called inside its kind (a key may hold colons, as pool:hh:us does). Nothing else is a ref, so a saved
// string that fails parseRef is dropped, never trusted.
//
// This is a kernel leaf (L0): it imports nothing.

/** "<kind>:<key>". The type only says the shape; isRef and parseRef say whether a string really is one. */
export type EntityRef = `${string}:${string}`

/** 2 to 16 characters: a lower case letter, then lower case letters and digits. */
const KIND = /^[a-z][a-z0-9]{1,15}$/
/** One or more segments of letters, digits, dot, underscore and dash, joined by single colons. */
const KEY = /^[A-Za-z0-9._-]+(?::[A-Za-z0-9._-]+)*$/
/** The longest key a ref carries. */
const KEY_MAX = 52

function validKey(key: string): boolean {
  return key.length <= KEY_MAX && KEY.test(key)
}

/**
 * A ref from a kind and a key. For code that knows what it is building, never for saved data: it throws a RangeError on a bad
 * kind, an empty key, a key with a character outside the set, a key of 53 characters or more, or a number that is not a safe integer.
 */
export function ref(kind: string, key: string | number): EntityRef {
  if (typeof kind !== 'string' || !KIND.test(kind)) throw new RangeError('ref: bad kind')
  if (typeof key === 'number' && !Number.isSafeInteger(key)) throw new RangeError('ref: bad key')
  const k = String(key)
  if (!validKey(k)) throw new RangeError('ref: bad key')
  return `${kind}:${k}`
}

/** Splits at the first colon. Null for anything that is not a ref (a number, 'abroad', a kind of one letter, an empty key). */
export function parseRef(r: unknown): { kind: string; key: string } | null {
  if (typeof r !== 'string' || r.length > 16 + 1 + KEY_MAX) return null
  const at = r.indexOf(':')
  if (at < 0) return null
  const kind = r.slice(0, at)
  const key = r.slice(at + 1)
  return KIND.test(kind) && validKey(key) ? { kind, key } : null
}

export function isRef(x: unknown): x is EntityRef {
  return parseRef(x) !== null
}
