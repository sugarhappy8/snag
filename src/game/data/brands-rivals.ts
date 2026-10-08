// Real brands: rivals. The companies you compete with in each of the 33 industries, by era and by
// country (business/competition-roster.ts reads them). The rows live in business/market-data-*.ts
// in a compact format (see business/market-rows.ts); this file turns them into registry brands.
// Owned by the market screen; see data/brands.ts for the rules every brand must follow.
import { FOOD_ROWS } from '../business/market-data-food'
import { HEAVY_ROWS } from '../business/market-data-heavy'
import { RETAIL_ROWS } from '../business/market-data-retail'
import { rowsToBrands } from '../business/market-rows'
import { SERVICES_ROWS } from '../business/market-data-services'
import { TECH_ROWS } from '../business/market-data-tech'
import type { Brand } from './brands'

export const RIVAL_BRANDS: Brand[] = rowsToBrands([...TECH_ROWS, ...HEAVY_ROWS, ...FOOD_ROWS, ...RETAIL_ROWS, ...SERVICES_ROWS])
