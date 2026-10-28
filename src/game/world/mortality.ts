// The mortality table (R4-L2, D.5 a): the chance an NPC dies in a year, by age and health. It lived in relationships.ts (the yearly
// npcDeaths draws against it for every Person) and moved here unchanged, so that a relative who exists only as a record can be
// judged by the same table (world/life-path.ts ageTo) without the world layer importing a domain file. relationships.ts re-exports
// it, so the one use there and every old import keep working.
//
// Pure: no import, no state, no draw, no clock. Layer 2. Not a model of anyone's health; the median NPC lifespan lands around 79
// (p90 about 88), like the original's grandparents and parents.

/** Annual chance an NPC dies, by age and health. */
export function npcMortality(age: number, health: number): number {
  let base: number
  if (age < 1) base = 0.002
  else if (age < 18) base = 0.0006
  else if (age < 40) base = 0.0012
  else if (age < 50) base = 0.0025
  else if (age < 60) base = 0.006
  else if (age < 65) base = 0.012
  else if (age < 70) base = 0.02
  else if (age < 75) base = 0.032
  else if (age < 80) base = 0.05
  else if (age < 85) base = 0.085
  else if (age < 90) base = 0.14
  else if (age < 95) base = 0.24
  else if (age < 100) base = 0.36
  else base = 0.55
  // Median NPC lifespan lands around 79 (p90 ~88), like the original's grandparents and parents.
  const mult = health < 20 ? 2.5 : health < 40 ? 1.5 : health > 80 ? 0.7 : 1
  return Math.min(0.95, base * mult)
}
