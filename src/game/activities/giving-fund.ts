// A restricted giving account administered by the existing charitable sector, not a
// tax shelter or player-owned asset. Only stewardship crosses generations.
import { addHidden, count, formatMoney, log, notice } from '../core'
import { recordEconomicActivity } from '../economy'
import { gate, payForAction } from './common'
import type { GameState, Json, MenuGroup, MenuNode } from '../types'

export interface GivingFund { v: 1; name: string; founder: string; country: string; balance: number; contributed: number; granted: number; administration: number; annual: number; yearsLeft: number; cause: 'education' | 'health'; lastYear: number; history: string[] }
const n = (x: unknown, d = 0, max = 1e12, min = 0) => typeof x === 'number' && Number.isFinite(x) ? Math.max(min, Math.min(max, x)) : d
export function givingFund(g: GameState): GivingFund | null {
  const raw = g.flags.givingFund
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.v !== 1 || typeof raw.name !== 'string' || typeof raw.country !== 'string') return null
  return { v: 1, name: raw.name.slice(0, 80), founder: typeof raw.founder === 'string' ? raw.founder.slice(0, 100) : '', country: raw.country, balance: n(raw.balance), contributed: n(raw.contributed), granted: n(raw.granted), administration: n(raw.administration), annual: n(raw.annual), yearsLeft: Math.floor(n(raw.yearsLeft, 0, 3)), cause: raw.cause === 'health' ? 'health' : 'education', lastYear: n(raw.lastYear, -1, 100000, -1), history: Array.isArray(raw.history) ? raw.history.filter((s): s is string => typeof s === 'string').slice(-16) : [] }
}
const save = (g: GameState, f: GivingFund) => { g.flags.givingFund = f as unknown as Json }
export function establishGivingFund(g: GameState, amount: number): boolean {
  if (gate(g, { minAge: 18 }) || givingFund(g) || !Number.isFinite(amount) || amount < 10000 || amount > 1e12 || !payForAction(g, amount + 500)) return false
  const f: GivingFund = { v: 1, name: `${g.character.lastName} Family Giving Fund`, founder: `${g.character.firstName} ${g.character.lastName}`, country: g.character.countryId, balance: amount, contributed: amount, granted: 0, administration: 500, annual: 0, yearsLeft: 0, cause: 'education', lastYear: g.year, history: [`${g.year}: founded by ${g.character.firstName} ${g.character.lastName}`] }
  save(g, f); count(g, 'donated'); count(g, 'moneyDonated', amount)
  notice(g, 'Family Giving Fund', `${formatMoney(amount)} is irrevocably committed to charity, plus ${formatMoney(500)} setup. It is no longer personal wealth and earns no guaranteed investment return. Annual administration costs 1% of remaining funds, minimum ${formatMoney(100)} while funds remain. Heirs inherit stewardship, not this money.`, { emoji: '🌱' }); return true
}
export function contributeGivingFund(g: GameState, amount: number): boolean {
  const f = givingFund(g)
  if (!f || gate(g, { minAge: 18 }) || !Number.isFinite(amount) || amount <= 0 || amount > 1e12 - f.balance || !payForAction(g, amount)) return false
  f.balance += amount; f.contributed += amount; save(g, f); count(g, 'donated'); count(g, 'moneyDonated', amount)
  notice(g, 'Restricted Contribution', `${formatMoney(amount)} added. The gift cannot be withdrawn or used to pay family expenses.`, { emoji: '🌱' }); return true
}
export function commitGivingProgram(g: GameState, cause: GivingFund['cause'], annual: number): boolean {
  const f = givingFund(g)
  if (!f || gate(g, { minAge: 18 }) || !['education', 'health'].includes(cause) || f.yearsLeft > 0 || !Number.isFinite(annual) || annual < 1000 || annual * 3 > f.balance * .9) return false
  f.cause = cause; f.annual = Math.round(annual); f.yearsLeft = 3; save(g, f)
  notice(g, 'Three-Year Grant Commitment', `${formatMoney(f.annual)} a year pledged to local ${cause === 'education' ? 'school resources and access' : 'community healthcare'}. Grants and administration come only from the restricted balance. Existing commitments continue under your heirs; no tax exemption is granted.`, { emoji: '📜' }); return true
}
export function yearlyGivingFund(g: GameState): void {
  const f = givingFund(g)
  if (!g.character.alive || !f || f.lastYear >= g.year || f.balance <= 0) return
  f.lastYear = g.year
  const admin = Math.min(f.balance, Math.max(100, Math.round(f.balance * .01)))
  f.balance -= admin; f.administration += admin
  if (f.yearsLeft && f.balance >= f.annual) {
    f.balance -= f.annual; f.granted += f.annual; f.yearsLeft--
    recordEconomicActivity(g, `giving:${f.founder}:${g.year}`, f.country, f.cause === 'education' ? 'education' : 'clinic', { investment: f.annual })
    f.history = [...f.history, `${g.year}: ${formatMoney(f.annual)} delivered for ${f.cause}; ${f.yearsLeft} committed year(s) remain`].slice(-16)
    addHidden(g, 'karma', 1)
    if (!f.yearsLeft) log(g, `${f.name} completed its three-year ${f.cause} program.`, 'good')
  } else if (f.yearsLeft) { f.history = [...f.history, `${g.year}: grant paused for lack of restricted funds`].slice(-16) }
  save(g, f)
}
export const givingFundMenu: MenuGroup = {
  type: 'menu', id: 'giving.fund', label: 'Family Giving Fund', emoji: '🌱', disabledReason: g => gate(g, { minAge: 18 }),
  children: g => {
    const f = givingFund(g)
    if (!f) return [
      { type: 'info', id: 'giving.explain', text: 'Commit money permanently to an administered charitable fund. Three-year education or health programs continue across generations. This is not a trust, private bank account or tax exemption; setup and annual administration consume real money.' },
      { type: 'action', id: 'giving.start', label: 'Establish a Giving Fund', emoji: '🌱', subtitle: `Minimum ${formatMoney(10000)}, plus ${formatMoney(500)} setup`, input: { kind: 'slider', money: true, label: 'Irrevocable initial contribution', min: 10000, max: Math.max(10000, Math.min(1e12, g.character.money - 500)), defaultValue: () => '10000' }, confirm: () => 'These funds leave your personal estate permanently. Heirs can direct charitable programs but cannot withdraw the balance.', run: (gg, value) => { establishGivingFund(gg, Number(value)) } },
    ]
    const nodes: MenuNode[] = [{ type: 'info', id: 'giving.statement', text: `${f.name} · Founded by ${f.founder}\nRestricted balance ${formatMoney(f.balance)} · Contributions ${formatMoney(f.contributed)}\nDelivered grants ${formatMoney(f.granted)} · Administration ${formatMoney(f.administration)}\n${f.yearsLeft ? `${f.cause}: ${formatMoney(f.annual)}/year; ${f.yearsLeft} committed years left.` : 'No active grant commitment.'}` },
      { type: 'action', id: 'giving.contribute', label: 'Add Restricted Funds', emoji: '💝', input: { kind: 'slider', label: 'Irrevocable contribution', money: true, min: 1, max: Math.max(1, g.character.money), defaultValue: () => '1000' }, run: (gg, value) => { contributeGivingFund(gg, Number(value)) } },
    ]
    for (const cause of ['education', 'health'] as const) nodes.push({ type: 'action', id: `giving.program.${cause}`, label: `Commit to ${cause === 'education' ? 'Education' : 'Community Health'}`, emoji: cause === 'education' ? '🎓' : '🏥', disabledReason: () => f.yearsLeft ? 'Complete the existing commitment first.' : f.balance < 3334 ? 'Fund three years plus an administration reserve first.' : null, input: { kind: 'slider', label: 'Grant per year for three years', money: true, min: 1000, max: Math.max(1000, Math.floor(f.balance * .3)), defaultValue: () => '1000' }, run: (gg, value) => { commitGivingProgram(gg, cause, Number(value)) } })
    nodes.push(...f.history.map((text, i) => ({ type: 'info' as const, id: `giving.history.${i}`, text })))
    return nodes
  },
}
