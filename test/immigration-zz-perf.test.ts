import { it } from 'vitest'
import { createNewLife } from '../src/game/life'
import { ageUp } from '../src/game/aging'
import { yearlyImmigration } from '../src/game/immigration'
import { emigrateMenu } from '../src/game/activities/emigrate'
it('perf', () => {
  const g = createNewLife({ seed: 5, countryId: 'de' })
  for (let i = 0; i < 25; i++) { ageUp(g); g.queue = [] }
  let t = performance.now()
  for (let i = 0; i < 1000; i++) yearlyImmigration(g)
  console.log('yearlyImmigration x1000 ms', performance.now() - t, 'people', g.people.length)
  t = performance.now()
  for (let i = 0; i < 5; i++) emigrateMenu.children(structuredClone(g))
  console.log('emigrate children x5 ms', performance.now() - t)
})
