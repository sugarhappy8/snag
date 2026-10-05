// Small helpers shared by the business modules (numbers, JSON, text).
import { formatMoney, shortMoney } from '../core'
import type { Json } from '../types'

export function num(v: Json | undefined, def = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : def
}

export function str(v: Json | undefined, def = ''): string {
  return typeof v === 'string' ? v : def
}

export function rec(v: Json | undefined): Record<string, Json> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : null
}

/** Clamp to [lo, hi]; NaN becomes lo. */
export function clampN(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo
  return Math.max(lo, Math.min(hi, n))
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Finite, rounded dollars (never NaN). */
export function dollars(n: number): number {
  return Number.isFinite(n) ? Math.round(n) : 0
}

/** Money for unit prices: $3.50 for small amounts, $1,200 for big ones. */
export function unitMoney(n: number): string {
  if (!Number.isFinite(n)) return '$0'
  if (Math.abs(n) < 100) return `${n < 0 ? '-' : ''}$${Math.abs(n).toFixed(2)}`
  return formatMoney(n)
}

/** $1.2M / $45K / $812: compact but exact enough for reports. */
export function money(n: number): string {
  return Math.abs(n) >= 100_000 ? shortMoney(n) : formatMoney(n)
}

export function pct(n: number, digits = 0): string {
  return `${(n * 100).toFixed(digits)}%`
}

/** 1,234 / 12.3K / 4.5M for unit counts. */
export function units(n: number): string {
  const a = Math.abs(Math.round(n))
  if (a >= 1e9) return `${(a / 1e9).toFixed(1)}B`
  if (a >= 1e6) return `${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`
  if (a >= 1e4) return `${(a / 1e3).toFixed(a >= 1e5 ? 0 : 1)}K`
  return a.toLocaleString('en-US')
}

export function stars(n: number): string {
  const k = Math.max(1, Math.min(5, Math.round(n)))
  return '\u{2B50}'.repeat(k)
}

export function plural(n: number, word: string, many = `${word}s`): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? word : many}`
}

export function toJson<T>(x: T): Json {
  return JSON.parse(JSON.stringify(x)) as Json
}

/** Typed view of a JSON object (mutations write through). */
export function asType<T>(v: Json | Record<string, Json>): T {
  return v as unknown as T
}

export function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Strip a typed name down to something safe and short. */
export function cleanName(s: string | undefined, fallback: string, max = 36): string {
  const t = (s ?? '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max)
  return t || fallback
}
