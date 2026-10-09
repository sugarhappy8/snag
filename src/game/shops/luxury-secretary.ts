// Personal Staff › Secretary Desk: all generated wealth requests are screened here. Review
// policies never spend automatically; an approval opens the original request choices.
import { notice, scriptChoice } from '../core'
import { declineSecretaryAsk, presentAskDirect, readAsk } from '../events/wealth-resolve'
import { money } from '../events/wealth-core'
import { defineScript } from '../scripts'
import type { GameState, Json, MenuAction, MenuGroup, MenuNode } from '../types'
import {
  markSecretaryRequest,
  pendingSecretaryRequests,
  recentSecretaryRequests,
  secretaryEmployed,
  secretaryPerson,
  secretaryPolicy,
  setSecretaryPolicy,
  type SecretaryCategory,
} from './luxury-secretary-state'

const LABELS: Record<SecretaryCategory, string> = {
  kids: 'Children & Grandchildren',
  family: 'Family & Partners',
  friends: 'Friends',
  other: 'Outside Requests',
}

function object(value: Json | undefined): Record<string, Json> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null
}

function liveSecretary(g: GameState): boolean {
  return g.character.alive && !g.character.prison && secretaryEmployed(g)
}

const POLICY = defineScript('luxury.secretary.policy', (g, choice, data) => {
  if (!liveSecretary(g)) return
  const raw = object(data)
  const category = raw?.category
  if ((category !== 'kids' && category !== 'family' && category !== 'friends' && category !== 'other') || (choice !== 'review' && choice !== 'decline')) return
  setSecretaryPolicy(g, category, choice)
  notice(g, 'Secretary Policy', choice === 'review'
    ? `${LABELS[category]} requests will wait in your inbox for a decision. Your secretary will never spend your money automatically.`
    : `${LABELS[category]} requests will be declined and recorded by your secretary. You can change this at any time.`, { emoji: '🗂️' })
})

function policyAction(category: SecretaryCategory): MenuAction {
  return {
    type: 'action',
    id: `lux-secretary-policy-${category}`,
    label: LABELS[category],
    emoji: category === 'kids' ? '🧒' : category === 'family' ? '👪' : category === 'friends' ? '🤝' : '📨',
    subtitle: (g) => secretaryPolicy(g, category) === 'review' ? 'Hold for my approval' : 'Politely decline automatically',
    disabledReason: (g) => liveSecretary(g) ? null : 'Hire a personal secretary to screen requests.',
    run: (g) => {
      if (!liveSecretary(g)) return
      scriptChoice(g, POLICY, `${LABELS[category]} Policy`, 'Choose how your secretary handles these requests. Review never means automatic payment: you still choose whether to give, lend, negotiate or refuse.', [
        { id: 'review', label: 'Hold for my approval', emoji: '📥' },
        { id: 'decline', label: 'Politely decline', emoji: '🚫' },
      ], { emoji: '🗂️', data: { category } })
    },
  }
}

function pendingNode(id: string): MenuGroup {
  return {
    type: 'menu',
    id: `lux-secretary-request-${id}`,
    label: 'Screened Request',
    emoji: '📨',
    subtitle: (g) => {
      const item = pendingSecretaryRequests(g).find((candidate) => candidate.id === id)
      if (!item) return 'Already handled'
      const person = secretaryPerson(g, item)
      return `${person?.firstName ?? 'Outside request'} · ${money(item.amount)} · ${item.what}`
    },
    children: (g): MenuNode[] => {
      const item = pendingSecretaryRequests(g).find((candidate) => candidate.id === id)
      if (!item) return [{ type: 'info', id: `lux-secretary-gone-${id}`, text: 'This request has already been handled.' }]
      const ask = readAsk(item.ask)
      if (!ask) return [{ type: 'info', id: `lux-secretary-invalid-${id}`, text: 'The original request could not be read and will not be paid.' }]
      return [{
        type: 'action', id: `lux-secretary-review-${id}`, label: 'Review & Decide', emoji: '👀',
        subtitle: 'Open the original choices; payment still needs your approval',
        disabledReason: (x) => liveSecretary(x) ? null : 'Your secretary is no longer available.',
        run: (x) => {
          if (!liveSecretary(x)) return
          const current = pendingSecretaryRequests(x).find((candidate) => candidate.id === id)
          const currentAsk = current ? readAsk(current.ask) : null
          if (!current || !currentAsk) return
          markSecretaryRequest(x, id, 'reviewed')
          presentAskDirect(x, currentAsk)
        },
      }, {
        type: 'action', id: `lux-secretary-decline-${id}`, label: 'Decline Without a Meeting', emoji: '🚫',
        subtitle: 'Your secretary sends the refusal; the asker may still take it personally',
        disabledReason: (x) => liveSecretary(x) ? null : 'Your secretary is no longer available.',
        run: (x) => {
          if (!liveSecretary(x)) return
          const current = pendingSecretaryRequests(x).find((candidate) => candidate.id === id)
          const currentAsk = current ? readAsk(current.ask) : null
          if (!current || !currentAsk) return
          declineSecretaryAsk(x, currentAsk)
          markSecretaryRequest(x, id, 'declined')
          notice(x, 'Request Declined', `Your secretary declined the request for ${current.what}. No money left your account.`, { emoji: '🚫' })
        },
      }]
    },
  }
}

export const secretaryDeskMenu: MenuGroup = {
  type: 'menu',
  id: 'luxurySecretary',
  label: 'Secretary Desk',
  emoji: '🗂️',
  subtitle: (g) => {
    const pending = pendingSecretaryRequests(g).length
    return pending ? `${pending} request${pending === 1 ? '' : 's'} awaiting approval` : 'Money-request policies and approval inbox'
  },
  visible: secretaryEmployed,
  disabledReason: (g) => liveSecretary(g) ? null : 'Your secretary is unavailable.',
  header: (g) => {
    const pending = pendingSecretaryRequests(g).length
    return `Your secretary screens money requests from children, family, friends and outsiders. ${pending ? `${pending} await${pending === 1 ? 's' : ''} your decision.` : 'The inbox is clear.'} Review policies never authorize spending: only you can approve a payment.`
  },
  children: (g): MenuNode[] => {
    const pending = pendingSecretaryRequests(g)
    const recent = recentSecretaryRequests(g).filter((item) => item.status !== 'pending').slice(0, 5)
    const nodes: MenuNode[] = [
      { type: 'heading', id: 'lux-secretary-policy-heading', label: 'Screening Policies' },
      policyAction('kids'), policyAction('family'), policyAction('friends'), policyAction('other'),
      { type: 'heading', id: 'lux-secretary-inbox-heading', label: 'Approval Inbox' },
    ]
    if (pending.length) nodes.push(...pending.map((item) => pendingNode(item.id)))
    else nodes.push({ type: 'info', id: 'lux-secretary-empty', text: 'No money requests are waiting for you.' })
    if (recent.length) {
      nodes.push({ type: 'heading', id: 'lux-secretary-recent-heading', label: 'Recently Screened' })
      for (const item of recent) nodes.push({
        type: 'info', id: `lux-secretary-recent-${item.id}`, emoji: item.status === 'declined' ? '🚫' : '✅',
        text: `${item.title}: ${item.what} (${money(item.amount)}) — ${item.status === 'declined' ? 'declined' : 'sent to you for a decision'}.`,
      })
    }
    return nodes
  },
}
