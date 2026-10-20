// The notice digest (R1-T4, G.11 step 1): which part of the modal queue shares one card. Pure: no React, no store,
// and nothing here writes the queue. A leaf module (type imports only), so it can never join an import cycle.
import type { ModalItem, NoticeModal, Tone } from '../../game/types'

/** The fewest notices that make a digest. One notice keeps today's card. */
export const DIGEST_MIN = 2
/** The most rows on one card. A longer run is shown eight at a time. */
export const DIGEST_MAX = 8

/** The row emoji of a notice with none of its own. Kept here so ModalHost's NoticeCard stays as it is. */
const TONE_EMOJI: Partial<Record<Tone, string>> = {
  good: '😄',
  bad: '😟',
  event: '📣',
}

/**
 * A notice that may share a card: kind 'notice' without `support` (the self-harm help line always gets its own
 * card). A plain boolean on purpose: a type predicate would narrow a support notice to a non-notice.
 */
export function mergeable(m: ModalItem): boolean {
  return m.kind === 'notice' && !m.support
}

/**
 * The maximal leading run of mergeable notices, at most DIGEST_MAX; [] when fewer than DIGEST_MIN or when `enabled`
 * is false. The run stops at the first item that is not mergeable, so a choice, input, minigame or task is never
 * inside a card and never moves. Never touches the queue.
 */
export function headNoticeRun(queue: readonly ModalItem[], enabled = true): NoticeModal[] {
  if (!enabled) return []
  const run: NoticeModal[] = []
  for (const m of queue) {
    if (m.kind !== 'notice' || !mergeable(m) || run.length >= DIGEST_MAX) break
    run.push(m)
  }
  return run.length >= DIGEST_MIN ? run : []
}

/** 'bad' if any item is bad; 'good' if every item is good; otherwise undefined. */
export function digestTone(items: readonly NoticeModal[]): Tone | undefined {
  if (items.some((m) => m.tone === 'bad')) return 'bad'
  if (items.length > 0 && items.every((m) => m.tone === 'good')) return 'good'
  return undefined
}

export function digestTitle(n: number): string {
  return `${n} updates`
}

export interface DigestRow {
  id: string
  emoji: string
  title: string
  text: string
  tone: Tone
}

/** One row per notice, in queue order, with the text in full. */
export function digestRows(items: readonly NoticeModal[]): DigestRow[] {
  return items.map((m) => ({
    id: m.id,
    emoji: m.emoji ?? (m.tone ? TONE_EMOJI[m.tone] : undefined) ?? '',
    title: m.title,
    text: m.text,
    tone: m.tone ?? 'neutral',
  }))
}

export type HeadPlan = { kind: 'digest'; items: NoticeModal[] } | { kind: 'single'; modal: ModalItem } | { kind: 'none' }

/** What ModalHost draws for this queue: a digest, the head modal as today, or nothing (empty queue or an 'aiTask' head). */
export function planHead(queue: readonly ModalItem[], digestOn: boolean): HeadPlan {
  const head = queue[0]
  if (!head || head.kind === 'aiTask') return { kind: 'none' }
  const items = headNoticeRun(queue, digestOn)
  if (items.length > 0) return { kind: 'digest', items }
  return { kind: 'single', modal: head }
}
