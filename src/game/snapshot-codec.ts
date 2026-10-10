// Browser storage counts UTF-16 code units. Base64 spends eight characters on six
// compressed bytes; a safe non-surrogate BMP alphabet needs only about four.
// This transport changes neither the gzip payload nor the restored JSON bytes.
const MAX_SNAPSHOT_BYTES = 20_000_000
const PACK_BASE = 0x100
const PACK_MASK = 0x7fff

/** Versioned, lossless storage transport, with no controls or surrogate code units. */
export function packSnapshotBytes(bytes: Uint8Array): string {
  if (bytes.length > MAX_SNAPSHOT_BYTES) throw new Error('Snapshot exceeds safe size')
  const chunks: string[] = [], units: number[] = []
  let buffer = 0, bits = 0
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte; bits += 8
    if (bits >= 15) {
      bits -= 15
      units.push(PACK_BASE + ((buffer >>> bits) & PACK_MASK))
      buffer &= (1 << bits) - 1
      if (units.length >= 8192) { chunks.push(String.fromCharCode(...units)); units.length = 0 }
    }
  }
  if (bits) units.push(PACK_BASE + (buffer << (15 - bits)))
  if (units.length) chunks.push(String.fromCharCode(...units))
  return `gz2:${bytes.length.toString(36)}:${chunks.join('')}`
}

/** Validate dimensions and alphabet before allocating/decompressing imported data. */
export function unpackSnapshotBytes(value: string): Uint8Array<ArrayBuffer> {
  if (!value.startsWith('gz2:')) throw new Error('Invalid snapshot encoding')
  const delimiter = value.indexOf(':', 4), sizeText = value.slice(4, delimiter)
  if (delimiter < 0 || !/^[0-9a-z]{1,6}$/.test(sizeText)) throw new Error('Invalid snapshot length')
  const size = Number.parseInt(sizeText, 36)
  if (size > MAX_SNAPSHOT_BYTES || size.toString(36) !== sizeText) throw new Error('Snapshot exceeds safe size')
  if (value.length - delimiter - 1 !== Math.ceil(size * 8 / 15)) throw new Error('Truncated snapshot data')
  const bytes = new Uint8Array(size)
  let buffer = 0, bits = 0, offset = 0
  for (let i = delimiter + 1; i < value.length; i++) {
    const unit = value.charCodeAt(i) - PACK_BASE
    if (unit < 0 || unit > PACK_MASK) throw new Error('Invalid snapshot alphabet')
    buffer = (buffer << 15) | unit; bits += 15
    while (bits >= 8 && offset < size) {
      bits -= 8; bytes[offset++] = (buffer >>> bits) & 0xff
      buffer &= (1 << bits) - 1
    }
  }
  if (offset !== size || buffer !== 0) throw new Error('Invalid snapshot padding')
  return bytes
}

/** Native compression is optional; the current main save always stays plain JSON. */
export async function encodeSnapshotRecord(json: string, minimum = 100000): Promise<string> {
  if (json.length < minimum || typeof CompressionStream === 'undefined') return json
  try {
    const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))
    const bytes = new Uint8Array(await new Response(stream).arrayBuffer())
    const compressed = packSnapshotBytes(bytes)
    return compressed.length < json.length ? compressed : json
  } catch { return json }
}

/** Original uncompressed records and gz1/base64 records remain readable. */
export async function decodeSnapshotRecord(value: string): Promise<string> {
  if (!value.startsWith('gz1:') && !value.startsWith('gz2:')) return value
  if (value.startsWith('gz1:') && value.length > Math.ceil(MAX_SNAPSHOT_BYTES / 3) * 4 + 4) throw new Error('Snapshot exceeds safe size')
  const bytes = value.startsWith('gz2:') ? unpackSnapshotBytes(value)
    : Uint8Array.from(atob(value.slice(4)), c => c.charCodeAt(0))
  if (bytes.length > MAX_SNAPSHOT_BYTES) throw new Error('Snapshot exceeds safe size')
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true }), parts: string[] = []
  let size = 0
  try {
    for (;;) {
      const next = await reader.read()
      if (next.done) break
      size += next.value.length
      if (size > MAX_SNAPSHOT_BYTES) { await reader.cancel(); throw new Error('Snapshot exceeds safe size') }
      parts.push(decoder.decode(next.value, { stream: true }))
    }
    return parts.join('') + decoder.decode()
  } finally { reader.releaseLock() }
}
