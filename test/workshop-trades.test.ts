// Which trades can make which Workshop inventions (CATEGORIES[*].industries), and which field an
// old company's products fall under when an old save is migrated (migrate.fieldFor). Every
// deep-tech trade has to fit somewhere: a fusion or neurotech company that can make nothing
// would show an empty "Make it in my company" list.
import { describe, expect, it } from 'vitest'
import { DEEP_TECH_IDS, INDUSTRY_IDS } from '../src/game/data/markets'
import { CATEGORIES, type Category } from '../src/game/workshop/catalog'
import { fieldFor } from '../src/game/workshop/migrate'
import { companyFits } from '../src/game/workshop/notebook'

const CATS = Object.keys(CATEGORIES) as Category[]
const categoriesOf = (id: string) => CATS.filter((c) => companyFits(id, c))

describe('workshop: trades and inventions', () => {
  it('lets every deep-tech trade make something', () => {
    for (const id of DEEP_TECH_IDS) expect(categoriesOf(id), id).not.toEqual([])
  })

  it('puts the four newer trades in the categories they belong to', () => {
    expect(categoriesOf('fusion')).toEqual(['energy'])
    expect(categoriesOf('carbonCapture')).toEqual(['energy'])
    expect(categoriesOf('neurotech')).toEqual(['health'])
    expect(categoriesOf('drones')).toEqual(['gadget', 'transport'])
  })

  it('leaves exactly the trades that never made inventions without a category', () => {
    const none = INDUSTRY_IDS.filter((id) => categoriesOf(id).length === 0)
    expect(none.sort()).toEqual(['bank', 'casino', 'hotel', 'investmentFirm', 'nightclub', 'onlineBank', 'realEstate', 'stripClub'])
  })

  it('files an old company of each deep-tech trade under the field its category implies', () => {
    expect(fieldFor('fusion', undefined)).toBe('energy')
    expect(fieldFor('carbonCapture', undefined)).toBe('energy')
    expect(fieldFor('neurotech', undefined)).toBe('health')
    expect(fieldFor('drones', undefined)).toBe('transport')
    // The older deep-tech trades keep the field they had.
    const was: Record<string, string> = { semiconductor: 'computing', aiLab: 'computing', robotics: 'computing', biotech: 'health', spaceTech: 'transport', electricVehicles: 'transport', quantum: 'computing', cybersecurity: 'computing' }
    for (const [id, field] of Object.entries(was)) expect(fieldFor(id, undefined), id).toBe(field)
    // A product's own field still wins.
    expect(fieldFor('fusion', 'food')).toBe('food')
  })
})
