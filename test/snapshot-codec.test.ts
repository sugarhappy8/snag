import { afterEach, describe, expect, it, vi } from 'vitest'
import { decodeSnapshotRecord, encodeSnapshotRecord, packSnapshotBytes, unpackSnapshotBytes } from '../src/game/snapshot-codec'

afterEach(() => vi.unstubAllGlobals())

describe('lossless versioned snapshot transport', () => {
  it('round-trips all byte values and every residual-bit boundary using only safe BMP characters', () => {
    for (const length of [...Array.from({ length: 64 }, (_, i) => i), 256, 16_385, 100_001]) {
      for (const fill of [0, 255, -1]) {
        const bytes = Uint8Array.from({ length }, (_, i) => fill < 0 ? i % 256 : fill)
        const packed = packSnapshotBytes(bytes), payload = packed.slice(packed.indexOf(':', 4) + 1)
        expect(payload.length).toBe(Math.ceil(length * 8 / 15))
        expect([...payload].every(c => c.charCodeAt(0) >= 0x100 && c.charCodeAt(0) <= 0x80ff)).toBe(true)
        expect(unpackSnapshotBytes(packed)).toEqual(bytes)
      }
    }
  })

  it('restores Unicode, combining characters, escaped surrogate boundaries and exact JSON key ordering', async () => {
    const json = JSON.stringify({ ko: '한국 원 ₩', ja: '漫画 日本円 ¥', ar: 'الإمارات د.إ', emoji: '👨‍👩‍👧‍👦',
      text: ('e\u0301\u2028\u2029\ud800\udfff\n\t世代 '.repeat(2_000)), nested: { z: 1, a: 2 } })
    const encoded = await encodeSnapshotRecord(json, 1000)
    expect(encoded.startsWith('gz2:')).toBe(true)
    expect(encoded.length).toBeLessThan(json.length / 2)
    expect(await decodeSnapshotRecord(encoded)).toBe(json)
  })

  it('reads original plain JSON and gz1 base64 snapshots without rewriting them', async () => {
    const json = JSON.stringify({ lastYear: 2030, names: ['김', '寿', 'Saeed'], history: 'long history '.repeat(1000) })
    const bytes = new Uint8Array(await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer())
    const legacy = `gz1:${btoa(String.fromCharCode(...bytes))}`
    expect(await decodeSnapshotRecord(json)).toBe(json)
    expect(await decodeSnapshotRecord(legacy)).toBe(json)
    expect((await encodeSnapshotRecord(json, 1000)).length).toBeLessThan(legacy.length * .5)
  })

  it('falls back to plain records when native compression is unavailable or fails', async () => {
    const json = JSON.stringify({ text: 'unchanged '.repeat(1000) })
    vi.stubGlobal('CompressionStream', undefined)
    expect(await encodeSnapshotRecord(json, 1000)).toBe(json)
    vi.stubGlobal('CompressionStream', class { constructor() { throw new Error('Unavailable') } })
    expect(await encodeSnapshotRecord(json, 1000)).toBe(json)
    expect(await encodeSnapshotRecord('{}', 1000)).toBe('{}')
  })

  it('rejects malformed dimensions, unsafe code units, truncation, extra payload and nonzero padding', () => {
    const valid = packSnapshotBytes(Uint8Array.from([1])), payloadAt = valid.indexOf(':', 4) + 1
    for (const invalid of ['gz3:1:Ā', 'gz2:1', 'gz2:-1:Ā', 'gz2:NaN:Ā', 'gz2:01:Ā', 'gz2:zzzzzz:Ā',
      'gz2:0:Ā', 'gz2:1:', 'gz2:1:A', 'gz2:1:\ud800', 'gz2:1:\u8100', `${valid}Ā`, valid.slice(0, -1),
      valid.slice(0, payloadAt) + String.fromCharCode(valid.charCodeAt(payloadAt) + 1)]) {
      expect(() => unpackSnapshotBytes(invalid), JSON.stringify(invalid)).toThrow()
    }
  })

  it('rejects corrupt gzip and oversized decoded snapshots instead of loading a partial state', async () => {
    await expect(decodeSnapshotRecord(packSnapshotBytes(Uint8Array.from([0])))).rejects.toThrow()
    const invalidUtf8 = new Uint8Array(await new Response(new Blob([Uint8Array.from([0xc0, 0xaf])]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer())
    await expect(decodeSnapshotRecord(packSnapshotBytes(invalidUtf8))).rejects.toThrow()
    const bomb = await encodeSnapshotRecord('x'.repeat(20_000_001), 1000)
    expect(bomb.startsWith('gz2:')).toBe(true)
    await expect(decodeSnapshotRecord(bomb)).rejects.toThrow(/safe size/)
  })
})
