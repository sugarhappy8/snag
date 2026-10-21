// DIAG ONLY (claude/r2-diag): writes what the 12 parity lives compute in this environment to test-results/diag (or DIAG_OUT), so two
// environments can be compared call by call: the environment, a hash of every Math function over a fixed grid, and per life
// the first years' economy and assets, the digest rows, every Math call and every localeCompare call with its result.
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { cpus } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { describe, it } from 'vitest'
import { PARITY_LIVES, traceLife } from './r2-parity-kit'

const OUT = process.env.DIAG_OUT ?? join(process.cwd(), 'test-results', 'diag')
const YEARS = Number(process.env.DIAG_YEARS ?? '2')
const ONLY = (process.env.DIAG_LIVES ?? '').split(',').filter(Boolean)
const FNS = ['pow', 'exp', 'log', 'log10', 'log2', 'log1p', 'expm1', 'sin', 'cos', 'tan', 'atan', 'atan2', 'tanh', 'sinh', 'cosh', 'cbrt', 'hypot', 'asinh', 'acosh', 'atanh'] as const
type MathFn = (...a: number[]) => number
const M = Math as unknown as Record<string, MathFn>

function mathProbe(): string[] {
  const buf = new Float64Array(1)
  const u = new BigUint64Array(buf.buffer)
  let s = 12345
  const rnd = (): number => {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0
    return s / 4294967296
  }
  const xs: number[] = []
  for (let i = 0; i < 100000; i++) xs.push((rnd() - 0.3) * 40, rnd() * 3, Math.exp((rnd() - 0.5) * 30))
  const fns: Record<string, (x: number) => number> = {
    exp: Math.exp, log: (x) => Math.log(Math.abs(x) + 1e-9), log10: (x) => Math.log10(Math.abs(x) + 1e-9), log2: (x) => Math.log2(Math.abs(x) + 1e-9),
    log1p: (x) => Math.log1p(Math.abs(x)), expm1: (x) => Math.expm1(x / 10), sin: Math.sin, cos: Math.cos, tan: Math.tan, atan: Math.atan, tanh: Math.tanh,
    sinh: (x) => Math.sinh(x / 4), cosh: (x) => Math.cosh(x / 4), cbrt: Math.cbrt, asinh: Math.asinh, sqrt: (x) => Math.sqrt(Math.abs(x)),
    'pow(x,0.5)': (x) => Math.pow(Math.abs(x), 0.5), 'pow(x,1.5)': (x) => Math.pow(Math.abs(x), 1.5), 'pow(x,0.35)': (x) => Math.pow(Math.abs(x), 0.35), 'pow(x,2)': (x) => Math.pow(x, 2),
    'pow(x,-0.7)': (x) => Math.pow(Math.abs(x) + 0.01, -0.7), 'pow(1.05,x)': (x) => Math.pow(1.05, x), 'pow(x,x/7)': (x) => Math.pow(Math.abs(x) + 0.01, x / 7),
    'x**1.3': (x) => Math.abs(x) ** 1.3, 'x**0.8': (x) => Math.abs(x) ** 0.8,
  }
  const lines: string[] = []
  for (const [name, f] of Object.entries(fns)) {
    const h = createHash('md5')
    for (const x of xs) {
      buf[0] = f(x)
      h.update(String(u[0]))
    }
    lines.push(name.padEnd(14) + h.digest('hex').slice(0, 12))
  }
  return lines
}

describe('diag ci', () => {
  it('environment and math probe', () => {
    mkdirSync(OUT, { recursive: true })
    const env = [
      process.version,
      JSON.stringify(process.versions),
      process.platform + ' ' + process.arch,
      cpus()[0]?.model ?? '?',
      `LANG=${process.env.LANG} LC_ALL=${process.env.LC_ALL} TZ=${process.env.TZ}`,
      'collator ' + Intl.Collator().resolvedOptions().locale,
      'tz ' + Intl.DateTimeFormat().resolvedOptions().timeZone,
    ]
    writeFileSync(join(OUT, 'env.txt'), env.join('\n') + '\n')
    writeFileSync(join(OUT, 'mathprobe.txt'), mathProbe().join('\n') + '\n')
  })

  for (const life of PARITY_LIVES) {
    if (ONLY.length && !ONLY.includes(life.id)) continue
    it(
      life.id,
      () => {
        mkdirSync(join(OUT, 'lives'), { recursive: true })
        const seen = new Map<string, number>()
        const lc = new Map<string, number>()
        const buf = new Float64Array(1)
        const bits = new BigUint64Array(buf.buffer)
        const orig = new Map<string, MathFn>()
        for (const f of FNS) {
          const fn = M[f]
          orig.set(f, fn)
          M[f] = function (...a: number[]): number {
            const r = fn.apply(Math, a)
            const key = f + ':' + a.join(',')
            if (!seen.has(key)) seen.set(key, r)
            return r
          }
        }
        const origLC = String.prototype.localeCompare
        String.prototype.localeCompare = function (this: string, that: string, ...rest: unknown[]): number {
          const r = (origLC as (...a: unknown[]) => number).call(this, that, ...rest)
          const key = JSON.stringify([String(this), that])
          if (!lc.has(key)) lc.set(key, r)
          return r
        } as typeof String.prototype.localeCompare
        const snaps: Record<string, unknown>[] = []
        let rows: string[][] = []
        try {
          rows = traceLife({ ...life, years: Math.min(life.years ?? 25, YEARS), untilAge: YEARS } as typeof life, (g, y) => {
            if (y <= YEARS) snaps.push({ year: g.year, economy: JSON.parse(JSON.stringify(g.flags.worldEconomy ?? null)), assets: JSON.parse(JSON.stringify(g.assets)), rng: g.rng })
          }).years
        } finally {
          for (const f of FNS) M[f] = orig.get(f) as MathFn
          String.prototype.localeCompare = origLC
        }
        writeFileSync(join(OUT, 'lives', life.id + '.json.gz'), gzipSync(JSON.stringify({ rows, snaps })))
        const lines: string[] = []
        for (const [k, r] of seen) {
          buf[0] = r
          lines.push(k + '=' + bits[0].toString(16))
        }
        lines.sort()
        writeFileSync(join(OUT, 'lives', life.id + '.math.gz'), gzipSync(lines.join('\n') + '\n'))
        const lcl = [...lc].map(([k, r]) => k + '=' + r).sort()
        writeFileSync(join(OUT, 'lives', life.id + '.lc.gz'), gzipSync(lcl.join('\n') + '\n'))
      },
      300000,
    )
  }
})
