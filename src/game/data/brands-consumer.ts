// Real brands: consumer. The things a person meets in daily life: restaurants and coffee shops,
// supermarkets and department stores, banks, card networks and insurers, phone carriers,
// airlines and hotels, streaming and social networks, delivery and ride-hailing apps, phones,
// computers, game consoles, appliances, cars, motorcycles, bikes and household names for
// endorsements. The data lives in brands-consumer-*.ts; this file merges it and drops any id
// another category file already registered (a luxury file may list Toyota too: the first wins).
// Owned by the everyday-life builder; see data/brands.ts for the rules.
import type { Brand } from './brands'
import { LUXURY_BRANDS } from './brands-luxury'
import { FOOD_PLACES } from './brands-consumer-food'
import { GOODS_BRANDS } from './brands-consumer-goods'
import { HOME_BRANDS } from './brands-consumer-home'
import { MONEY_BRANDS } from './brands-consumer-money'
import { RETAIL_BRANDS } from './brands-consumer-retail'
import { SERVICE_BRANDS } from './brands-consumer-services'

function merge(): Brand[] {
  const taken = new Set(LUXURY_BRANDS.map((b) => b.id))
  const out: Brand[] = []
  for (const b of [...FOOD_PLACES, ...MONEY_BRANDS, ...SERVICE_BRANDS, ...RETAIL_BRANDS, ...GOODS_BRANDS, ...HOME_BRANDS]) {
    if (taken.has(b.id)) continue
    taken.add(b.id)
    out.push(b)
  }
  return out
}

export const CONSUMER_BRANDS: Brand[] = merge()
