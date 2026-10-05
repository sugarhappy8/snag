// Applying a GameEffects bundle (from AI outcomes or scripted events) with sane limits,
// so a local model can never hand out a billion dollars or 500 health.
import { addHidden, addMoney, addRelationship, addStat, attractedTo, clamp, currentPartner, getPerson, log, netWorth, remember } from './core'
import { arrestPlayer } from './crime'
import { killCharacter } from './death'
import { createPerson } from './people'
import { randInt, uid } from './rng'
import type { GameEffects, GameState, HiddenKey, StatKey } from './types'

const STAT_LIMITS: Record<StatKey, number> = { happiness: 40, health: 40, smarts: 15, looks: 20 }
const HIDDEN_LIMITS: Partial<Record<HiddenKey, number>> = { karma: 25, fame: 15, notoriety: 20, craziness: 15 }

/** Largest single money gain/loss an effect may cause, given the player's wealth. */
export function moneyLimits(g: GameState): { maxGain: number; maxLoss: number } {
  const worth = Math.max(0, netWorth(g))
  const cash = Math.max(0, g.character.money)
  return {
    maxGain: Math.round(Math.min(250_000, Math.max(2_000, worth * 0.25))),
    maxLoss: Math.round(Math.max(Math.min(cash, 500), cash * 0.5)),
  }
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

/**
 * Apply effects to the game. Returns short human-readable change labels
 * (e.g. ["+10 Happiness", "-$500"]) for display under an outcome.
 */
export function applyEffects(g: GameState, eff: GameEffects): string[] {
  const c = g.character
  const changes: string[] = []
  if (!c.alive) return changes

  for (const key of ['happiness', 'health', 'smarts', 'looks'] as StatKey[]) {
    const d = num(eff[key])
    if (d === undefined || d === 0) continue
    const lim = STAT_LIMITS[key]
    const delta = Math.round(clamp(d, -lim, lim))
    addStat(g, key, delta)
    changes.push(`${delta > 0 ? '+' : ''}${delta} ${key[0].toUpperCase()}${key.slice(1)}`)
  }
  for (const key of ['karma', 'fame', 'notoriety', 'craziness'] as HiddenKey[]) {
    const d = num(eff[key as keyof GameEffects])
    if (d === undefined || d === 0) continue
    const lim = HIDDEN_LIMITS[key] ?? 10
    addHidden(g, key, Math.round(clamp(d, -lim, lim)))
    if (key === 'fame') changes.push(d > 0 ? 'Fame up' : 'Fame down')
  }

  const money = num(eff.money)
  if (money !== undefined && money !== 0) {
    const { maxGain, maxLoss } = moneyLimits(g)
    const delta = Math.round(clamp(money, -maxLoss, maxGain))
    if (delta !== 0) {
      addMoney(g, delta)
      changes.push(`${delta > 0 ? '+' : '-'}$${Math.abs(delta).toLocaleString('en-US')}`)
    }
  }

  for (const r of eff.relationships ?? []) {
    const p = getPerson(g, r.personId)
    const d = num(r.delta)
    if (!p || !p.alive || d === undefined) continue
    addRelationship(p, clamp(d, -40, 40))
  }

  if (eff.newPerson) {
    const np = eff.newPerson
    let relation = np.relation
    const age = Math.max(0, Math.round(num(np.age) ?? c.age + randInt(g, -3, 3)))
    const romantic = relation === 'partner' || relation === 'lover'
    if (romantic) {
      const gender = np.gender ?? (c.gender === 'male' ? 'female' : 'male')
      const ok = c.age >= 14 && age >= 14 && Math.abs(age - c.age) <= 25 && attractedTo(c, gender)
      if (!ok || (relation === 'partner' && currentPartner(g))) relation = ok ? 'lover' : 'friend'
      if (relation === 'lover' && c.age < 18) relation = 'friend'
    }
    if (relation === 'pet') {
      createPerson(g, { relation: 'pet', age: Math.min(age, 10), firstName: np.firstName, species: np.species ?? 'Dog', gender: np.gender, relationship: 70, livesWithPlayer: true })
    } else {
      const p = createPerson(g, { relation, age, firstName: np.firstName, lastName: np.lastName, gender: np.gender, relationship: relation === 'enemy' ? 10 : 60 })
      if (np.trait) p.traits = [np.trait, ...p.traits].slice(0, 3)
      changes.push(`New ${relation === 'partner' ? 'partner' : relation}: ${p.firstName}`)
    }
  }

  if (eff.condition && eff.condition.name) {
    const existing = c.conditions.find((x) => x.name.toLowerCase() === eff.condition!.name.toLowerCase())
    if (!existing) {
      const severity = Math.round(clamp(num(eff.condition.severity) ?? 20, 1, 100))
      c.conditions.push({
        id: uid(g, 'c'),
        name: eff.condition.name,
        kind: eff.condition.kind,
        severity,
        yearsHad: 0,
        curable: eff.condition.kind !== 'disease' || severity < 60,
        diagnosed: eff.condition.kind === 'injury',
        age: c.age,
      })
      changes.push(eff.condition.name)
    }
  }

  if (eff.log) log(g, eff.log, 'ai')
  if (eff.memory) remember(g, eff.memory)

  if (eff.arrest && eff.arrest.crime) {
    arrestPlayer(g, eff.arrest.crime, Math.round(clamp(num(eff.arrest.severity) ?? 2, 1, 5)))
  }

  if (eff.death) {
    // Only a fatal outcome if it would plausibly kill this character.
    addStat(g, 'health', -60)
    if (c.stats.health <= 0) killCharacter(g, eff.death)
    else changes.push('Nearly died')
  }
  return changes
}
