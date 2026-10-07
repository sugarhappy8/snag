// The home computer: once you own a computer (a laptop or gaming PC from the Electronics Store,
// or one your parents buy you), Activities › Computer opens at-home ways to learn and earn,
// even before 18: learn to code, build a SaaS, freelance (computer/dev.ts), and the riskier side,
// crypto pump-and-dumps, options trading and online scams (computer/money.ts).
import { devNodes, noComputerNodes, yearlyDev } from './computer/dev'
import { moneyNodes, yearlyMoney } from './computer/money'
import { codingSkill } from './computer/skills'
import type { Asset, GameState, MenuGroup } from './types'

const COMPUTER_NAME = /\b(laptop|gaming pc|computer|desktop|pc|macbook|workstation|chromebook)\b/i

/** Assets that count as a computer (the Electronics Store's Laptop and Gaming PC, and similar). */
export function isComputer(a: Asset): boolean {
  return (a.kind === 'other' || a.kind === 'collectible') && COMPUTER_NAME.test(a.name) && a.condition > 0
}

export function computerAsset(g: GameState): Asset | undefined {
  return g.assets.find(isComputer)
}

export function ownsComputer(g: GameState): boolean {
  return !!computerAsset(g)
}

/**
 * Parents (or a court) can take the computer away: g.flags.computerLockedUntil = the age it comes
 * back. Returns a reason while it's locked, else null.
 */
export function computerLocked(g: GameState): string | null {
  const until = g.flags.computerLockedUntil
  if (typeof until !== 'number' || g.character.age >= until) return null
  const who = typeof g.flags.computerLockedBy === 'string' ? g.flags.computerLockedBy : 'Your parents'
  return `${who} took your computer away until you're ${until}.`
}

/** True when the player has a computer they can actually use right now. */
export function canUseComputer(g: GameState): boolean {
  return ownsComputer(g) && !computerLocked(g)
}

/** Activities › Computer. */
export const computerMenu: MenuGroup = {
  type: 'menu',
  id: 'computer',
  label: 'Computer',
  emoji: '\u{1F4BB}',
  subtitle: (g) => {
    const a = computerAsset(g)
    if (!a) return 'Get a laptop or gaming PC to unlock'
    if (computerLocked(g)) return 'Confiscated'
    const skill = codingSkill(g)
    return `${a.name}${skill > 0 ? ` · coding ${skill}/100` : ''}`
  },
  visible: (g) => g.character.alive && g.character.age >= 8 && !g.character.prison,

  header: (g) => {
    const a = computerAsset(g)
    return a ? `${a.emoji} Your ${a.name.toLowerCase()} hums to life. What will you do?` : ''
  },
  children: (g) => {
    const locked = computerLocked(g)
    if (locked && ownsComputer(g)) return [{ type: 'info', id: 'computer.locked', emoji: '\u{1F512}', text: locked }]
    if (!ownsComputer(g)) {
      return [
        { type: 'info', id: 'computer.none', emoji: '\u{1F50C}', text: "You don't have a computer. Buy a laptop or gaming PC at the Electronics Store (Activities › Shopping)." },
        ...noComputerNodes(g),
      ]
    }
    return [...devNodes(g), ...moneyNodes(g)]
  },
}

/** Yearly hook (aging.ts, after shops, before finance). */
export function yearlyComputer(g: GameState): void {
  yearlyDev(g)
  if (!g.character.alive) return
  yearlyMoney(g)
}

